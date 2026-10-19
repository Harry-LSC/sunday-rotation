# Sunday Rotation API

Cloudflare Worker source for the Sunday Rotation listening club, separate from the GitHub Pages website at repository root.

- Worker name: `sunday-rotation-api`
- Binding: `DB` (D1 `sunday-rotation-db`)
- Config: `worker/wrangler.json`
- Entry point: `worker/src/index.js`
- Deploy command from repository root: `npx wrangler deploy --config worker/wrangler.json`

**Deployment warning:** The API is still a pilot. Do not invite public registrations until registration abuse protection, backup/recovery, and end-to-end authorization tests are complete. GitHub Pages hosting should remain independent.

The local browser journal currently used by the site is *not* yet migrated to D1. Connecting CI does not migrate any ratings.
