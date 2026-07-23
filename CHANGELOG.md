# CHANGELOG - FounderOS Website Scripts

## 2026-07-23 - Remove inert application/ARIA routing scripts (post-iClosed cleanup)

**WHAT:** Deleted 6 now-unreferenced browser scripts left over from before iClosed replaced the
application + booking flow: `applicationFormControlNew.js`, `application-routing-v2.js`,
`application-form-name-handler.js`, `meta-capi/capi-lead.js`, `application-routing-aria.js`,
`application-routing-9Jun2026.js`.

**WHY:** iClosed now serves application + booking on every page, so the native `#fos-application-main`
form and its routing/scoring/name-handler scripts, the browser Lead module (`capi-lead.js`, inert on
`/apply`), and the ARIA routing (nothing routes to ARIA anymore) are all inert leftovers. The Webflow
references were removed from the `/thank-you/*` template and `/apply` in the Designer; the live geo-IP
`redirectByCountryConfig` call was preserved. Verified: a crawl of all 342 live sitemap pages found 0
references to any of the 6 files.

**WATCH FOR:** The unpublished `apply-v2` page (dead ARIA experiment; 404, not served) still references
`applicationFormControlNew.js` + `application-routing-aria.js` in its Designer footer - dangling now, no
live impact. Clean that footer down to `redirectByCountryConfig` in the Designer, or delete the page;
Webflow's API refuses these custom-code writes (HTTP 406), so it is Designer-only. Also `meta-capi.md`
Section 5 still lists these now-deleted files and needs updating in the docs pass.

## 2026-07-23 - Remove dead backup/deprecated files

**WHAT:** Deleted 35 dead/stale tracked files: the `deprecated/` (19) and `backup codes/` (13)
directories, `userDetails-backup.js`, and two obsolete routing-simplification design docs
(`HANDOFF-routing-simplification.md`, `PROJECT_BRIEF_ROUTING_SIMPLIFICATION.md`).

**WHY:** `deprecated/` and `backup codes/` were already `.gitignore`d but still tracked (committed
before the ignore rule) and still deploying to Pages; the rest are superseded backups/old versions.
Verified before deleting: no kept repo file references any removed path, and a crawl of all 342 live
sitemap pages found 0 references to any `deprecated/` or `backup` path.

**WATCH FOR:** Only dead/backup code was removed here, all recoverable from git history. The live
`application-*` scripts are untouched: the `/thank-you/*` template still runs a live
`#fos-application-main` form via `applicationFormControlNew.js` + `application-routing-v2.js` +
`application-form-name-handler.js` plus a live `redirectByCountryConfig` geo-redirect. CLAUDE.md and
meta-capi doc-accuracy corrections are a separate pass, not done here.

## 2026-07-23 - Harden setupReCAPTCHAForm (idempotent binding) + dedupe /workshop footer

**WHAT:** `setupReCAPTCHAForm.js` now binds once per form: `attachHandler` returns early if
`form.dataset.fosRecaptchaBound === '1'`, otherwise it sets the flag before adding the submit
listener. Separately, the `/workshop` Webflow footer had two
`setupReCAPTCHAForm({ formSelector: '.workshop-form-hubspot' ... })` blocks (the original, plus
the CompleteRegistration `onSuccess` call added at CR go-live); collapsed to the single
`onSuccess` call and one `noscript` waitlist failsafe (done in Webflow Designer, published live).

**WHY:** The workshop registration form was initialized twice, attaching two submit listeners and
two MutationObservers. Both fired on `.w-form-done`; the first-registered (no-hook) one could win
the redirect race and navigate away before the `onSuccess` fire, making CompleteRegistration
fragile. The guard makes binding deterministic for every form site-wide; the footer edit removes
the real duplicate. First call wins, so the surviving `/workshop` call is the one carrying
`onSuccess`.

**WATCH FOR:** Guard is fail-open (still attaches if `dataset` is unavailable) and
behavior-preserving for single-call forms (they still bind exactly once). Ordering was
load-bearing: the footer dedup had to be published live BEFORE this guard shipped, or the guard
would keep the no-hook call and drop CR. Verified live: `/workshop` serves exactly one
`.workshop-form-hubspot` setup (with `onSuccess`); the page's other setup targets the unrelated
`.gfm-form` modal. Runtime-tested 3/3 (idempotency, happy path, `.w-form-fail` resubmit) with a
local node harness.

## 2026-07-23 - meta-capi docs: correct the Lead mechanism to reality (iClosed -> n8n)

**WHAT:** Rewrote the Lead half of `meta-capi/meta-capi.md` and `meta-capi/CLAUDE.md`.
The Lead event is NOT the old browser/Webflow-form path - it fires **server-side**
from an iClosed "Call booked" webhook via n8n `WF1 - iClosed -> Supabase (MVP)` ->
`meta-capi-lead`, gated on an inbound Brand Strategy Call with a qualifying annual
revenue band. `capi-lead.js` + the `/apply` Webflow application/routing stack are now
documented as dead leftovers. CompleteRegistration (/workshop, browser) is unchanged.
**WHY:** iClosed replaced the Webflow application funnel; the docs described a Lead
path that no longer runs. Now they match production. **WATCH FOR:** removing the dead
browser/routing scripts is the separate code-audit pass, not done here.

## 2026-07-23 - meta-capi docs consolidated into meta-capi.md

**WHAT:** New `meta-capi/meta-capi.md` end-to-end explainer (Lead + CompleteRegistration).
`meta-capi/CLAUDE.md` cut to a lean pointer; `README.md` corrected (was "scaffold, in
progress"); parent `CLAUDE.md` meta-capi row updated. Also corrected a stale deployment
comment in `capi-lead.js` (it read "central vault project"; the Lead function deploys to
Sales and reads vault from FOS Control, Pattern B). **WHY:** the old docs described a
Lead-only scaffold era that contradicted the shipped, live system (per the doc-drift audit).
**WATCH FOR:** meta-capi.md is the single source of truth; keep `CLAUDE.md` a pointer, not a
status log.

## 2026-07-23 - Meta CAPI CompleteRegistration on /workshop

**WHAT:** New `meta-capi/capi-complete-registration.js` client module
(`window.fireMetaCompleteRegistration`) fires a Meta `CompleteRegistration` event
- browser Pixel + server CAPI sharing one `event_id` for dedup - on a verified
successful /workshop registration. Added an optional `onSuccess(form)` callback
to the shared `setupReCAPTCHAForm.js` (fires at `.w-form-done`, before the
redirect); backward-compatible no-op for every existing caller (`.gfm-form`
etc.). Server endpoint + engine live in fos-control (deployed to Sales
`ldspjkntkuuqlwrdefzh`).

**WHY:** /workshop submissions sent nothing to Meta; this closes the attribution
gap for workshop registrations, mirroring the /apply Lead integration but adding
`_fbp`/`_fbc` match-quality signals.

**WATCH FOR:** Wire on /workshop with a call-time wrapper
(`onSuccess: function(f){ if (window.fireMetaCompleteRegistration) window.fireMetaCompleteRegistration(f); }`)
so script load order cannot strand the fire. `IS_TEST = true` routes to Events
Manager Test Events until go-live; flip to false only after a real submit + Test
Events verification. The client logs a non-2xx server response; the failure to
watch for is a silent no-op, so confirm a server-side audit row lands, not just
the Pixel event.

**Go-live 2026-07-23:** `IS_TEST` flipped to false after staging + Meta Test
Events verification (pixel 717725617464118, Pixel/CAPI dedup confirmed on the
shared event_id). Live ad attribution on for /workshop CompleteRegistration.

## 2026-04-24 - Supabase rate limiter added to n8n webhook endpoints

**WHAT:** Added rate limiting (15 req/min per IP, sliding window) to two n8n webhook endpoints:
- `newsletter-partial` (workflow DmxEYm1J98rrWD9E) - activated from inactive
- `partial-submission` (workflow WBReuZP0WKH7izvl) - already active

Architecture: each workflow now runs Webhook → Rate Limit Check (HTTP Request to Supabase RPC) → Gate & Restore (Code node) → existing processing chain.

Supabase migration on `yhvssclmrddiowlccvjc`:
- Table `public.rate_limits` (key TEXT PRIMARY KEY, request_times TIMESTAMPTZ[])
- Function `public.check_rate_limit(p_key, p_max=15, p_window_seconds=60)` RETURNS json - atomic UPSERT array-based sliding window, returns `{"allowed": bool}`
- RLS enabled on rate_limits table; EXECUTE granted to anon and service_role
- Rollback: DROP FUNCTION public.check_rate_limit(text,int,int); DROP TABLE public.rate_limits;

`spam-logger` and `partial-lead` have no n8n workflows (404 on POST) - no action needed.

**WHY:** Don flagged all four webhook endpoints as spammable. CORS only blocks browsers - curl/scripts bypass it. n8n Cloud has no built-in rate limiting on standard plan. `$getWorkflowStaticData` race condition was proven (20 concurrent requests, all 20 through). Supabase PostgreSQL UPSERT is atomic and eliminates the race condition.

**WATCH FOR:**
- `fetch` is NOT available in n8n Code nodes (executes in 6ms, no real HTTP call, silently passes through). Always use the HTTP Request node for outbound calls from n8n workflows.
- `$vars.SUPABASE_SERVICE_ROLE_KEY` is set in n8n Variables (Settings > Variables) - if it rotates, update it there.
- n8n IF node boolean equal condition routes backwards in typeVersion 2 - the `allowed === true` condition sends items to the false branch. Fixed by using a Code node for the gate check instead.
- Rate limits table grows bounded (array auto-trims to 60s window per IP). No cleanup job needed.
- Supabase downtime: try/catch in Gate & Restore passes through on error - forms never block due to infrastructure failure.
- The check uses `x-forwarded-for` header first, falls back to 'global'. Cloudflare always sets this header so per-IP limiting works correctly.

---

## 2026-04-24 - meta-capi integration shipped to branch (not merged)

**WHAT:** New subfolder `meta-capi/` with client module `capi-lead.js` that fires both a Meta Pixel `Lead` event AND a Supabase edge function call to Meta Conversions API when an application scores qualified (`application_route == "qualified"` per the hidden field set by `application-routing-v2.js`). 7-line wiring block added at the end of the submit handler in `applicationFormControlNew.js` to invoke `window.fireMetaCAPILead(form)` on qualified submit.

`IS_TEST = true` in `capi-lead.js` routes all events to Events Manager Test Events tab (test_event_code `TEST4208`, vaulted). Flip to `false` for go-live.

Edge function source lives in `fos-control/supabase/functions/meta-capi-lead/` and is deployed on central vault project `yhvssclmrddiowlccvjc`. Reads `meta_ads_token`, `founder_os_meta_pixel`, `meta_capi_test_event_code` from vault at request time. First end-to-end test 2026-04-24 10:15 UTC landed in Meta with HTTP 200 (trace AU5ERCPRuHbDKljaHw_ohcl).

**Dedup contract:** `capi-lead.js` generates ONE UUID per qualified submit, passes same UUID as `eventID` to `fbq('track', 'Lead', ...)` AND as `event_id` to the CAPI edge function. Meta dedupes within 48h.

**Not merged.** FounderOS main auto-deploys to GitHub Pages. Merge after Webflow `<script>` tag added to /apply and qualified submit verified in Events Manager Test Events.

**WHY:** Client-only Pixel loses 10-25% of Meta attribution to ad blockers and ITP. CAPI as server-to-server backup recovers it. Fires alongside the Pixel (not replacing it); event_id dedup keeps reporting clean.

**WATCH FOR:**
- `IS_TEST = true` in `meta-capi/capi-lead.js` line 11. Flipping to `false` routes events to live ad attribution. Always pair flip with a qualified submit + Test Events verification.
- `window.fireMetaCAPILead` is a soft dependency — the wiring in `applicationFormControlNew.js` uses `typeof ... === "function"` guard, so a missed script load is silent no-op, not crash. Verify the `<script src>` tag loads BEFORE any qualified submit happens.
- If the qualified threshold in `application-routing-v2.js` changes, this wiring still fires correctly — it reads `application_route` hidden field, not the score.
- Edge function endpoint is public but CORS-restricted to founderos.com + per-IP rate limited 5/5min. New Webflow preview domain requires updating `ALLOWED_ORIGINS` in the edge function and redeploying. See `meta-capi/CLAUDE.md` for the full watch-for list.
- Vault rotation is transparent: tokens are read per-request, no cache. `meta_ads_token` or `founder_os_meta_pixel` rotation requires no redeploy.

---

## 2026-04-16 - Project registered and dual-booking bug identified
**WHAT:** Jai Thomas (jai@cactuscontent.com.au) submitted one application form on /thank-you/workshop via organic IG traffic. The application-routing-ads.js scored him as direct_to_closer, redirecting to /book-now?route=closer_ads which loaded the Brand Strategy Call Calendly embed. He booked it at 05:29 UTC. Then the workshop registration flow also routed him to an Intro Call booking at 05:32 UTC. Two separate Calendly events, two DFY wow assets, two HubSpot meetings.
**WHY:** The ads routing script (application-routing-ads.js) runs on ALL pages that have the #fos-application-main form, including organic pages like /thank-you/workshop. There is no page-context check. A high-scoring organic lead gets the same closer routing as a paid ads lead. Organic workshop leads should route to setter (Intro Call), not closer (Brand Strategy Call).
**WATCH FOR:** Any organic lead that books a Brand Strategy Call directly. The Brand Strategy Call is meant for high-intent paid ads leads who score >= 19 with solo decision authority. Organic workshop leads should always route to Intro Call regardless of score.
