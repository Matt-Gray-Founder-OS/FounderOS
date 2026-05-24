# CHANGELOG - FounderOS Website Scripts

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
