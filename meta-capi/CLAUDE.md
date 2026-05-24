# Meta CAPI Integration (subproject of FounderOS)

## Status: LIVE. Merged to main 2026-04-24, edge function deployed, `capi-lead.js` served from GitHub Pages, `IS_TEST=false` (firing to Meta live reporting). Last remaining step: Webflow `<script>` tag added to /apply page (operator task — tag provided but not yet verified pasted).
## Purpose: Fire a Meta Conversions API `Lead` event from the Webflow front end when an application scores qualified (>= 11 per `application-routing-v2.js` QUALIFIED_THRESHOLD).
## Parent: Matt-Gray-Founder-OS/FounderOS (GitHub Pages, founderos.com).
## Deploy: Client-side JS loaded on /apply via `<script src="matt-gray-founder-os.github.io/FounderOS/meta-capi/{file}.js">`. Merge to main to deploy — repo auto-publishes to GitHub Pages on push.

## Integration point
`application-routing-v2.js` scores every application form submission. When `score >= QUALIFIED_THRESHOLD` (currently 11) the user redirects to `/book-now?route=qualified`. The CAPI module hooks into that same decision branch and fires a single `Lead` event to Meta Graph API with hashed user data + UTM context for ads attribution.

## Why CAPI at all
Client Meta Pixel events are blocked by ad blockers and ITP. CAPI is the server-to-server backup that lets Meta attribute the conversion to the ad campaign even when the pixel fires nothing. Even calling it from the front end, the request path is independent of pixel script loads — so an ad-blocker blocking `connect.facebook.net` does not block a `fetch("https://graph.facebook.com/...")` call.

## Dedup with Meta Pixel
Both the Pixel `fbq('track', 'Lead', ...)` and the CAPI call must emit the **same `event_id`** so Meta dedupes them on server side. Without this, a qualified lead who successfully fires BOTH gets double-counted.

## Architecture — Path A (proxy, shipped)

```
Webflow /apply  (matt-gray-founder-os.github.io/FounderOS/meta-capi/capi-lead.js)
  └── applicationFormControlNew.js submit handler
        └── if application_route == "qualified":
              └── window.fireMetaCAPILead(form)
                    ├── fbq("track", "Lead", {eventID: <uuid>})
                    └── fetch(<edge>/meta-capi-lead, {event_id: <same uuid>, email, ...})
                          └── Supabase edge function (yhvssclmrddiowlccvjc)
                                ├── reads meta_ads_token, founder_os_meta_pixel,
                                │   meta_capi_test_event_code from vault
                                ├── sha256 normalize + hash PII
                                └── POST graph.facebook.com/v21.0/{pixel}/events
```

## Files
- `capi-lead.js` — client module, exposes `window.fireMetaCAPILead(form)`. `IS_TEST = true` constant routes all fires to Events Manager Test Events tab until flipped.
- `../applicationFormControlNew.js` — one 7-line wiring block at end of submit handler reads `application_route` hidden field, invokes the fire function on qualified.
- Edge function source: `~/dev/fos-control/supabase/functions/meta-capi-lead/index.ts` (deployed on central vault project).

## Webflow embed (not done — next step)

Add a script tag to `/apply` page in Webflow:
```html
<script src="https://matt-gray-founder-os.github.io/FounderOS/meta-capi/capi-lead.js" defer></script>
```
`applicationFormControlNew.js` must load FIRST (already does — it is loaded on /apply today). `capi-lead.js` must define `window.fireMetaCAPILead` before the submit handler fires; the wiring is defensive (`typeof window.fireMetaCAPILead === "function"`) so a missed load is a silent no-op, not a crash.

## Go-live sequence
1. Merge this branch to main (GitHub Pages auto-deploys `capi-lead.js`).
2. Add the `<script>` tag to `/apply` in Webflow.
3. Submit a qualified application on /apply → verify event in Events Manager → Test Events for pixel 717725617464118.
4. Verify `meta_capi_events` audit row lands on central vault project.
5. Flip `IS_TEST = false` in `capi-lead.js`, commit to main, verify live event in Events Manager → Overview.

## Deferred to next session (non-blocking)

1. **Phone country-code preservation verification.** Current normalization `phone.replace(/\D+/g, "")` strips all non-digits including the leading `+`. Meta match quality is significantly lower for phone numbers without a country code. This is acceptable IF Webflow's `phone-script-maxmind.js` always prepends the country code digits BEFORE submit — that has not been verified. Action: open `/apply` in browser, fill the phone field, inspect the form element's `.value` on submit, confirm country code is in the string. If not, prepend based on MaxMind-detected country in the phone script.

2. **Distributed-IP abuse protection.** Current baseline is CORS allowlist + per-IP rate limit (5/5min, in-memory per Fluid Compute instance). A distributed attacker (many source IPs) bypasses both. Threat model: someone burns the pixel with fake Lead events, polluting Meta ad attribution. Small real risk at current application volumes. Mitigations if ever needed: HMAC-signed timestamp from client (requires a shared secret), Cloudflare Turnstile / hCaptcha token check, move rate limit to a Postgres-backed counter (persists across instances).

3. **Scheduled error-rate alert.** Nothing watches `meta_capi_events` for spikes in `error_reason IS NOT NULL`. Add `/schedule` trigger (hourly) that queries last-hour error count and posts to Slack / announcements if above a threshold. Pattern mirrors the fos-call-scoring `fathom_ingestion_audit` trigger.

4. **Test harness file.** Unit tests for the edge function do not exist. Precedent: `fos-control/supabase/functions/_shared/utils.ts` has tests in `vault_migration_test.ts`. Add `meta-capi-lead/index_test.ts` covering: UUID validation, CORS allowlist, rate limit math, SHA256 of sample email/phone, Meta-vs-network-vs-parse error classification. Run via `deno test` in the edge function deploy script's pre-deploy E2E slot.

## Watch-for
- `IS_TEST` is on `capi-lead.js` line 11. Flipping it is a one-char edit but has big consequences (pollutes live ad-attribution until flipped back). Always pair the flip with at least one qualified submit + Test Events verification.
- If Meta rotates `meta_ads_token` or `founder_os_meta_pixel`, the edge function picks up the new value on next call (vault is read per-request, no cache). No redeploy needed.
- If CORS origin list in edge function needs extension (new Webflow preview domain, staging URL), edit `ALLOWED_ORIGINS` in `supabase/functions/meta-capi-lead/index.ts` and redeploy via `scripts/deploy-edge-function.sh meta-capi-lead --project-ref yhvssclmrddiowlccvjc`.
- Rate limit is in-memory per Fluid Compute instance. 5 req / 5 min per IP. If we ever see legitimate applications getting rate limited (unlikely at current volume), raise `RATE_LIMIT_MAX` or switch to a table-backed counter.
- Dedup: the `event_id` UUID is generated client-side in `capi-lead.js` once per submit, passed to both `fbq` and the CAPI POST. If the Pixel or CAPI call is ever moved out of `fireMetaCAPILead` and generates its own UUID, Meta will double-count. Keep the single-source-of-UUID discipline.
- The Pixel `fbq` must already be loaded on the page for the `track Lead` call to succeed. If the Pixel ID changes in Webflow but vault pixel ID lags, server CAPI fires against the wrong pixel. Update both together.

## Related
- `application-routing-v2.js` (sibling) — the routing script we hook into
- `CHANGELOG.md` (parent repo root) — all changes logged there
- Top-level `CLAUDE.md` — founderos.com scripts overview
