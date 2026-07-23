# Meta CAPI (subproject)

Fires Meta Conversions API events for founderos.com conversions, via two
**different** mechanisms:
- **Lead** - fires when an **inbound Brand Strategy Call** is booked in **iClosed**
  with a qualifying annual revenue band (>= $500k/yr). **Server-side:** iClosed
  webhook -> n8n `WF1 - iClosed -> Supabase (MVP)` -> `meta-capi-lead`. Not a
  browser event.
- **CompleteRegistration** - fires on a successful `/workshop` registration.
  **Browser:** Meta Pixel + CAPI sharing one `event_id`.

**Full explanation: [meta-capi.md](meta-capi.md)** - both mechanisms, every file
and data location, deploy/operate, and gotchas. Read that first.

## Files here
- `capi-complete-registration.js` - CompleteRegistration module (`window.fireMetaCompleteRegistration`), wired in the `/workshop` Webflow footer via `setupReCAPTCHAForm` onSuccess.
- Server code + engine live in `fos-control` (`supabase/functions/meta-capi/`, `meta-capi-lead/`, `_shared/meta_capi.ts`), deployed to Sales.

The old browser Lead module `capi-lead.js` and the pre-iClosed application/routing scripts were removed 2026-07-23 (iClosed replaced that funnel); Lead now fires only server-side from n8n.

## Fast facts
- Pixel `717725617464118`. Audit table `public.meta_capi_events` on Sales (`ldspjkntkuuqlwrdefzh`, `event_name` = Lead / CompleteRegistration). Vault on FOS Control (`yhvssclmrddiowlccvjc`).
- Lead qualification lives in n8n WF1's `CAPI Gate` node (annual revenue bands, inbound `brand-strategy-call` only). Snapshot: `fos-control/audits/wf1-*`.
- Deploy server: `bash scripts/deploy-edge-function.sh meta-capi` from the fos-control root. Deploy the CompleteRegistration browser JS: push to `main` (GitHub Pages).
- Test mode: CompleteRegistration via `IS_TEST` in `capi-complete-registration.js`; Lead via an iClosed `__test` webhook flag.

## Gotchas (full list in meta-capi.md)
- Lead is **server-side (iClosed/n8n)**; CompleteRegistration is **browser-side**. Do not assume they behave the same.
- CompleteRegistration: one `event_id` per submit, shared by Pixel + CAPI. Lead uses a deterministic `event_id` from n8n.
- The `/workshop` footer is edited in the Webflow Designer, not the API (returns 406).
- The `meta_capi_events` audit row is ground truth; live events lag ~20 min in Meta's Overview and never appear in Test Events.

## Current state
LIVE. For health, query `meta_capi_events` on Sales (see the health check in meta-capi.md).
