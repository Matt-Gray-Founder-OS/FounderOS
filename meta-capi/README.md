# meta-capi

Meta Conversions API integration for founderos.com. Fires server-side conversion
events (alongside the browser Pixel) so Meta still attributes conversions when the
Pixel is blocked by an ad blocker or privacy setting:

- **Lead** on `/apply` when an application scores qualified.
- **CompleteRegistration** on `/workshop` when the registration form succeeds.

Both share one `event_id` with the Pixel so Meta deduplicates.

## Files
- `capi-complete-registration.js` - CompleteRegistration browser module.
- `capi-lead.js` - Lead browser module.
- `meta-capi.md` - the full explanation (start here).
- `CLAUDE.md` - operator cheat-sheet.

Served via GitHub Pages at `matt-gray-founder-os.github.io/FounderOS/meta-capi/<file>.js`.
Server code lives in the `fos-control` repo and deploys to the Sales Supabase project.

**Status: LIVE.** See `meta-capi.md`.
