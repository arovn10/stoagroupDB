/**
 * One-off script: list Asana project custom fields (GID, name, type) for env config.
 * Run from api/: npx ts-node --transpile-only scripts/list-asana-custom-fields.ts
 * Requires .env with ASANA_ACCESS_TOKEN (or ASANA_PAT) and optionally ASANA_PROJECT_GID.
 */
import dotenv from 'dotenv';
import path from 'path';

// Load api/.env then repo root .env (so token can live in either)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';
const DEFAULT_PROJECT_GID = '1207455912614114';

async function main() {
  const token = (process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT)?.replace(/['"]/g, '').trim();
  if (!token) {
    console.error('Missing ASANA_ACCESS_TOKEN or ASANA_PAT in .env');
    process.exit(1);
  }
  const projectGid = process.env.ASANA_PROJECT_GID?.replace(/['"]/g, '').trim() || DEFAULT_PROJECT_GID;

  const url = `${ASANA_API_BASE}/projects/${projectGid}/custom_field_settings?${new URLSearchParams({
    opt_fields: 'custom_field.gid,custom_field.name,custom_field.type,custom_field.enum_options',
    limit: '100',
  })}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.error('Asana API error:', res.status, await res.text());
    process.exit(1);
  }

  const json = (await res.json()) as { data?: Array<{ custom_field?: { gid: string; name: string; type: string; enum_options?: Array<{ gid: string; name: string }> } }> };
  const settings = json.data || [];

  const fields = settings
    .filter((s) => s.custom_field?.gid)
    .map((s) => ({
      name: s.custom_field!.name || '',
      gid: s.custom_field!.gid,
      type: s.custom_field!.type || 'text',
      enum_options: s.custom_field!.enum_options,
    }));

  console.log('Project GID:', projectGid);
  console.log('');
  console.log('Custom fields (use GID for ASANA_CUSTOM_FIELD_GID_* in .env):');
  console.log('─'.repeat(80));
  for (const f of fields) {
    console.log(`  ${f.name.padEnd(28)}  GID: ${f.gid.padEnd(20)}  type: ${f.type}`);
    if (f.enum_options?.length) {
      f.enum_options.slice(0, 5).forEach((o) => console.log(`    → ${o.name}: ${o.gid}`));
      if (f.enum_options.length > 5) console.log(`    → ... and ${f.enum_options.length - 5} more`);
    }
  }
  console.log('─'.repeat(80));
  console.log('');
  console.log('For Pre-Con Manager / Stage / Product Type, set in .env:');
  const precon = fields.find((f) => /pre-?con|manager|precon/i.test(f.name));
  const stage = fields.find((f) => /^stage$/i.test(f.name));
  const productType = fields.find((f) => /product\s*type/i.test(f.name));
  if (precon) console.log(`  ASANA_CUSTOM_FIELD_GID_PRECON_MANAGER=${precon.gid}  # ${precon.name}`);
  if (stage) console.log(`  ASANA_CUSTOM_FIELD_GID_STAGE=${stage.gid}  # ${stage.name}`);
  if (productType) console.log(`  ASANA_CUSTOM_FIELD_GID_PRODUCT_TYPE=${productType.gid}  # ${productType.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
