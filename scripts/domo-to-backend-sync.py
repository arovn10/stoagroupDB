#!/usr/bin/env python3
"""
Sync leasing datasets from Domo to the stoagroupDB backend (POST /api/leasing/sync).

Use this to keep the backend database populated from Domo on a schedule (cron, Domo
Workflow, or manual run). The backend expects the same payload shape as the Leasing
Velocity app.

Two modes:
  1. Domo Data API: pull datasets by ID using DOMO_CLIENT_ID and DOMO_CLIENT_SECRET.
  2. Local JSON: read from local files (e.g. exports or Magic ETL outputs).

Environment (for Domo API mode):
  DOMO_CLIENT_ID       - Domo API client ID
  DOMO_CLIENT_SECRET   - Domo API client secret
  API_BASE_URL         - e.g. https://your-api.example.com (no trailing slash)

Optional (dataset IDs; must match your Domo instance):
  DOMO_DATASET_LEASING, DOMO_DATASET_MMR, DOMO_DATASET_TRADEOUT,
  DOMO_DATASET_PUD, DOMO_DATASET_UNITS, DOMO_DATASET_UNITMIX,
  DOMO_DATASET_PRICING, DOMO_DATASET_RECENTRENTS

Example (API mode):
  export DOMO_CLIENT_ID=... DOMO_CLIENT_SECRET=... API_BASE_URL=https://api.example.com
  python3 scripts/domo-to-backend-sync.py

Example (local JSON; keys = backend payload keys, values = paths):
  python3 scripts/domo-to-backend-sync.py --local leasing=./leasing.json portfolioUnitDetails=./pud.json
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Chunk size for large datasets to avoid 502/timeouts (~5 min request limit on many hosts).
# Each chunk is sent as a separate POST; first chunk TRUNCATE+insert, rest append.
CHUNK_ROWS = 5000

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(1)


def load_dotenv() -> None:
    """Load .env from repo root (parent of scripts/) or current working directory."""
    for base in (Path(__file__).resolve().parent.parent, Path.cwd()):
        env_file = base / ".env"
        if env_file.is_file():
            with open(env_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = value
            break

# Payload keys accepted by POST /api/leasing/sync (must match backend SYNC_MAP)
SYNC_KEYS = [
    "leasing",
    "MMRData",
    "unitbyunittradeout",
    "portfolioUnitDetails",
    "units",
    "unitmix",
    "pricing",
    "recentrents",
]

# Default env var names for Domo dataset IDs (optional; set only the ones you use)
DATASET_ID_ENV = {
    "leasing": "DOMO_DATASET_LEASING",
    "MMRData": "DOMO_DATASET_MMR",
    "unitbyunittradeout": "DOMO_DATASET_TRADEOUT",
    "portfolioUnitDetails": "DOMO_DATASET_PUD",
    "units": "DOMO_DATASET_UNITS",
    "unitmix": "DOMO_DATASET_UNITMIX",
    "pricing": "DOMO_DATASET_PRICING",
    "recentrents": "DOMO_DATASET_RECENTRENTS",
}


def get_domo_token(client_id: str, client_secret: str) -> str:
    """Exchange Domo client credentials for an access token."""
    r = requests.post(
        "https://api.domo.com/oauth/token",
        params={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def export_domo_dataset(dataset_id: str, token: str, include_header: bool = True) -> list[dict[str, Any]]:
    """
    Export a Domo dataset as JSON rows.
    Domo Data API returns CSV by default; we request JSON or parse CSV.
    """
    url = f"https://api.domo.com/v1/datasets/{dataset_id}/data"
    # Request CSV and parse (API often doesn't support JSON export directly)
    r = requests.get(
        url,
        params={"includeHeader": "true", "format": "csv"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=300,
    )
    r.raise_for_status()
    text = r.text
    if not text.strip():
        return []

    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def load_local_json(path: str) -> list[dict[str, Any]]:
    """Load a JSON file as a list of objects (or single object as one-row list)."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return [data]


def build_payload_from_domo(
    client_id: str,
    client_secret: str,
    dataset_ids: dict[str, str],
    skip_keys: set[str] | None = None,
) -> dict[str, list]:
    """Fetch each dataset from Domo and build the sync payload. skip_keys: do not fetch these (e.g. portfolioUnitDetails with --skip-pud)."""
    skip_keys = skip_keys or set()
    token = get_domo_token(client_id, client_secret)
    payload: dict[str, list] = {}
    for key, ds_id in dataset_ids.items():
        if not ds_id or key in skip_keys:
            if key in skip_keys and ds_id:
                print(f"  {key}: skipped (not fetching)", file=sys.stderr)
            continue
        try:
            rows = export_domo_dataset(ds_id, token)
            payload[key] = rows
            print(f"  {key}: {len(rows)} rows", file=sys.stderr)
        except Exception as e:
            print(f"  {key}: skip - {e}", file=sys.stderr)
    return payload


def build_payload_from_local(local_paths: dict[str, str]) -> dict[str, list]:
    """Load each key's data from a local JSON file."""
    payload: dict[str, list] = {}
    for key, path in local_paths.items():
        if key not in SYNC_KEYS:
            print(f"  unknown key '{key}', skipped", file=sys.stderr)
            continue
        try:
            rows = load_local_json(path)
            payload[key] = rows
            print(f"  {key}: {len(rows)} rows from {path}", file=sys.stderr)
        except Exception as e:
            print(f"  {key}: skip - {e}", file=sys.stderr)
    return payload


def _data_hash(rows: list) -> str:
    """Stable hash matching backend dataHash (length + first 50 rows) for sync log."""
    payload = json.dumps(len(rows)) + json.dumps([json.dumps(r) for r in rows[:50]])
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


def post_sync(base_url: str, payload: dict[str, list]) -> dict[str, Any]:
    """POST to backend /api/leasing/sync. Large datasets are sent in chunks to avoid 502/timeouts."""
    url = f"{base_url.rstrip('/')}/api/leasing/sync"
    all_synced = []
    all_skipped = []
    all_errors = []
    for i, (key, rows) in enumerate(payload.items()):
        if i > 0:
            time.sleep(2)
        total_rows = len(rows)
        if total_rows <= CHUNK_ROWS:
            # Single request (no chunk headers)
            body = {key: rows}
            payload_bytes = len(json.dumps(body))
            payload_mb = payload_bytes / (1024 * 1024)
            print(f"  POST {key}: {total_rows} rows, ~{payload_mb:.2f} MB ...", file=sys.stderr, flush=True)
            t0 = time.perf_counter()
            try:
                r = requests.post(url, json=body, headers={"Content-Type": "application/json"}, timeout=900)
                elapsed = time.perf_counter() - t0
                print(f"  -> {key}: {r.status_code} in {elapsed:.1f}s", file=sys.stderr, flush=True)
                _collect_response(r, key, all_synced, all_skipped, all_errors)
            except Exception as e:
                print(f"  -> {key}: ERROR after {time.perf_counter() - t0:.1f}s: {e}", file=sys.stderr, flush=True)
                all_errors.append({"dataset": key, "message": str(e)})
            continue
        # Chunked upload
        full_hash = _data_hash(rows)
        chunks = [rows[j : j + CHUNK_ROWS] for j in range(0, total_rows, CHUNK_ROWS)]
        num_chunks = len(chunks)
        print(f"  POST {key}: {total_rows} rows in {num_chunks} chunks (~{CHUNK_ROWS} rows each) ...", file=sys.stderr, flush=True)
        for c, chunk in enumerate(chunks):
            first = c == 0
            last = c == num_chunks - 1
            headers = {"Content-Type": "application/json"}
            headers["X-Leasing-Sync-First-Chunk"] = "true" if first else "false"
            headers["X-Leasing-Sync-Last-Chunk"] = "true" if last else "false"
            if last:
                headers["X-Leasing-Sync-Total-Rows"] = str(total_rows)
                headers["X-Leasing-Sync-Data-Hash"] = full_hash
            body = {key: chunk}
            payload_mb = len(json.dumps(body)) / (1024 * 1024)
            t0 = time.perf_counter()
            try:
                r = requests.post(url, json=body, headers=headers, timeout=900)
                elapsed = time.perf_counter() - t0
                print(f"  -> {key} chunk {c + 1}/{num_chunks}: {r.status_code} in {elapsed:.1f}s (~{payload_mb:.2f} MB)", file=sys.stderr, flush=True)
                _collect_response(r, key, all_synced, all_skipped, all_errors)
            except Exception as e:
                print(f"  -> {key} chunk {c + 1}/{num_chunks}: ERROR after {time.perf_counter() - t0:.1f}s: {e}", file=sys.stderr, flush=True)
                all_errors.append({"dataset": key, "message": str(e)})
                break
            if c < num_chunks - 1:
                time.sleep(1)
    return {
        "success": len(all_errors) == 0,
        "synced": all_synced,
        "skipped": all_skipped,
        "errors": all_errors if all_errors else None,
    }


def _collect_response(
    r: requests.Response,
    key: str,
    all_synced: list,
    all_skipped: list,
    all_errors: list,
) -> None:
    try:
        data = r.json()
    except ValueError:
        all_errors.append({"dataset": key, "message": f"Response not JSON (status {r.status_code}): {r.text[:200]}"})
        return
    all_synced.extend(data.get("synced", []))
    all_skipped.extend(data.get("skipped", []))
    if data.get("errors"):
        all_errors.extend(data.get("errors", []))


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="Sync Domo leasing datasets to stoagroupDB backend (POST /api/leasing/sync)."
    )
    parser.add_argument(
        "--local",
        metavar="KEY=PATH",
        nargs="*",
        help="Use local JSON files instead of Domo API; e.g. leasing=./leasing.json",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build payload and print summary; do not POST.",
    )
    parser.add_argument(
        "--skip-pud",
        action="store_true",
        help="Skip portfolioUnitDetails (224k+ rows). Use cron/sync-from-domo for full sync including PUD.",
    )
    parser.add_argument(
        "--only",
        metavar="KEY",
        help="Sync only this dataset (e.g. leasing, pricing, MMRData). Useful to test one dataset and see timing.",
    )
    args = parser.parse_args()

    base_url = os.environ.get("API_BASE_URL", "").strip()
    if not base_url and not args.dry_run:
        print("Set API_BASE_URL or use --dry-run", file=sys.stderr)
        return 1

    if args.local is not None and len(args.local) > 0:
        local_paths = {}
        for pair in args.local:
            if "=" not in pair:
                print(f"Invalid --local pair: {pair}", file=sys.stderr)
                return 1
            k, v = pair.split("=", 1)
            local_paths[k.strip()] = v.strip()
        payload = build_payload_from_local(local_paths)
    else:
        client_id = os.environ.get("DOMO_CLIENT_ID", "").strip()
        client_secret = os.environ.get("DOMO_CLIENT_SECRET", "").strip()
        if not client_id or not client_secret:
            print("Set DOMO_CLIENT_ID and DOMO_CLIENT_SECRET, or use --local KEY=PATH ...", file=sys.stderr)
            return 1
        dataset_ids = {
            key: os.environ.get(env_key, "").strip()
            for key, env_key in DATASET_ID_ENV.items()
        }
        if not any(dataset_ids.values()):
            print("Set at least one DOMO_DATASET_* env var; see script docstring.", file=sys.stderr)
            return 1
        skip_keys = {"portfolioUnitDetails"} if args.skip_pud else set()
        payload = build_payload_from_domo(client_id, client_secret, dataset_ids, skip_keys=skip_keys)
        if args.skip_pud and "portfolioUnitDetails" in payload:
            del payload["portfolioUnitDetails"]
            print("Skipping portfolioUnitDetails (--skip-pud).", file=sys.stderr)

    if not payload:
        print("No data to sync.", file=sys.stderr)
        return 1

    if getattr(args, "only", None):
        only_key = (args.only or "").strip()
        if only_key and only_key in payload:
            payload = {only_key: payload[only_key]}
            print(f"Only syncing: {only_key} ({len(payload[only_key])} rows)", file=sys.stderr)
        elif only_key:
            print(f"Unknown --only key: {only_key}. Available: {list(payload.keys())}", file=sys.stderr)
            return 1

    if args.dry_run:
        total = sum(len(v) for v in payload.values())
        print(json.dumps({"keys": list(payload.keys()), "total_rows": total}, indent=2))
        return 0

    result = post_sync(base_url, payload)
    print(json.dumps(result, indent=2))
    if result.get("errors"):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
