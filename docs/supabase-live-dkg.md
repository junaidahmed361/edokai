# Supabase live DKG sync for Edokai

Supabase project:

```text
https://supabase.com/dashboard/project/lfnpcgcxezyjcgnpcagq
https://lfnpcgcxezyjcgnpcagq.supabase.co
```

## Architecture

```text
Hermes manual/daily ingest loop
→ updates local knowledge/*.json
→ scripts/sync-dkg-supabase.mjs upserts row id='latest'
→ Netlify Edokai app reads public snapshot using anon key
→ Supabase Realtime pushes updates; app also polls every 60s as fallback
```

The frontend only needs the anon key. Hermes needs the service-role key because it writes the DKG snapshot.

## One-time Supabase setup

1. Open Supabase SQL Editor for project `lfnpcgcxezyjcgnpcagq`.
2. Run:

```sql
-- see supabase/edokai_dkg_snapshots.sql
```

That creates `public.edokai_dkg_snapshots` with:

- `id = 'latest'`
- `payload` containing `{ dkg, conceptWorldIndex, stats }`
- public read RLS policy
- Realtime publication

## Netlify environment variables

Set these in Netlify → Site configuration → Environment variables:

```text
VITE_SUPABASE_URL=https://lfnpcgcxezyjcgnpcagq.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon public key>
VITE_EDOKAI_DKG_TABLE=edokai_dkg_snapshots
VITE_EDOKAI_DKG_ROW_ID=latest
```

Then redeploy. The anon key is safe for browser use when RLS allows only public reads.

## Hermes/local write environment variables

Set these in `~/.hermes/.env` or your shell, never in the repo:

```text
EDOKAI_SUPABASE_URL=https://lfnpcgcxezyjcgnpcagq.supabase.co
EDOKAI_SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
EDOKAI_DKG_TABLE=edokai_dkg_snapshots
EDOKAI_DKG_ROW_ID=latest
EDOKAI_TELEGRAM_TARGET=telegram:7421808951
```

The service-role key must stay local/server-side only.

## Manual sync test

```bash
cd /Users/junaidahmed/Downloads/edokai
EDOKAI_SUPABASE_SERVICE_ROLE_KEY=... npm run dkg:sync
```

Expected output:

```json
{
  "ok": true,
  "table": "edokai_dkg_snapshots",
  "rowId": "latest",
  "source_count": 0,
  "node_count": 0,
  "edge_count": 0,
  "macro_world_count": 5,
  "synced_at": "..."
}
```

## Completion notifications

Manual `/edokai_ingest <URL>` now starts a background Hermes run that is instructed to:

1. update local DKG files;
2. run `npm run dkg:sync` if Supabase write credentials exist;
3. send a completion message back to Telegram target `EDOKAI_TELEGRAM_TARGET`.

Daily cron jobs should also end their prompt with the same sync + Telegram completion requirement.
