# Cursor + SQL Server (mssql) extension

## "command 'mssql.addObjectExplorer' not found"

This error often appears in **Cursor** even after installing/reinstalling the **SQL Server (mssql)** extension. The extension is built for VS Code; in Cursor it sometimes doesn’t register its commands correctly, so the Object Explorer can’t open.

### Fix: Disable the extension in this workspace

1. Open **Extensions** (`Cmd+Shift+X`).
2. Find **SQL Server (mssql)** (Microsoft).
3. Click the **gear** (or right‑click) → **Disable (Workspace)**.

The error should stop. You can re-enable it later if a Cursor/extension update fixes the issue.

### Running SQL without the extension

- **Azure Data Studio** or **SSMS** – connect to your SQL Server and run scripts (e.g. `schema/*.sql`).
- **Project scripts** – from repo root:
  - `cd api && npm run db:exec -- path/to/script.sql`
  - Or use `api/scripts/run-migration.ts` / `db-manipulate.ts` for migrations.

### If you want to keep the extension

Leave it **enabled** and ignore the popup, or try:

- Reload Window: `Cmd+Shift+P` → **Developer: Reload Window**.
- Use **Azure Data Studio** for Object Explorer and run SQL there; use Cursor only for code.
