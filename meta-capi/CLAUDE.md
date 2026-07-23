# Meta CAPI (subproject)

Fires Meta Conversions API events for founderos.com conversions: **Lead** on
`/apply` (qualified application, score >= 11) and **CompleteRegistration** on
`/workshop` (registration). The browser Pixel and the server CAPI call share one
`event_id` so Meta deduplicates them into one conversion.

**Full explanation: [meta-capi.md](meta-capi.md)** - what it does, every file and
data location, exactly how it works, deploy/operate, and gotchas. Read that first.

## Files here (browser code, served via GitHub Pages)
- `capi-complete-registration.js` - CompleteRegistration module (`window.fireMetaCompleteRegistration`).
- `capi-lead.js` - Lead module (`window.fireMetaCAPILead`).
- Wiring: Lead in `../applicationFormControlNew.js`; CompleteRegistration in the `/workshop` Webflow footer.
- Server code + shared engine live in `fos-control` (`supabase/functions/meta-capi/`, `_shared/meta_capi.ts`), deployed to Sales.

## Fast facts
- Pixel `717725617464118`. Audit table `public.meta_capi_events` on Sales (`ldspjkntkuuqlwrdefzh`). Vault on FOS Control (`yhvssclmrddiowlccvjc`).
- Deploy server: `bash scripts/deploy-edge-function.sh meta-capi` from the fos-control root. Deploy browser JS: push to `main` (GitHub Pages, live immediately).
- `IS_TEST` flag in each module: true = Test Events, false = live. Flip only after a real submit + Events Manager verification.

## Gotchas (full list in meta-capi.md)
- One `event_id` per submit, shared by Pixel + CAPI, or Meta double-counts.
- The `/workshop` footer must be edited in the Webflow Designer, not via the API (it returns 406).
- The `meta_capi_events` audit row is the ground truth; live events lag ~20 min in Meta's Overview and never appear in Test Events.

## Current state
LIVE. For health, query `meta_capi_events` on Sales (see the health check in meta-capi.md).
