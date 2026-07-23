# meta-capi

Meta Conversions API integration for founderos.com. Reports conversions to Meta server-side so
attribution survives ad blockers and privacy settings. Two events, two **different** triggers:

- **Lead** - server-side. Fires when a qualifying inbound **Brand Strategy Call** is booked in
  **iClosed**; the iClosed webhook is processed by n8n (`WF1`), which POSTs to the `meta-capi-lead`
  edge function. No browser code.
- **CompleteRegistration** - browser. Fires on a successful `/workshop` registration via the Meta
  Pixel plus a CAPI call that shares one `event_id` (Meta dedupes the pair).

## Files
- `capi-complete-registration.js` - CompleteRegistration browser module.
- `meta-capi.md` - the full explanation (start here).
- `CLAUDE.md` - operator cheat-sheet.

Served via GitHub Pages at `matt-gray-founder-os.github.io/FounderOS/meta-capi/<file>.js`.
Server code lives in the `fos-control` repo and deploys to the Sales Supabase project.

**Status: LIVE.** See `meta-capi.md`.
