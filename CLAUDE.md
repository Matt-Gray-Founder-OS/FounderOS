# FounderOS Website Scripts

## Status: Active. JS files served via GitHub Pages to founderos.com Webflow site.
## Purpose: Application form routing, spam filtering, UTM tracking, phone validation, geo-based content, and analytics scripts for founderos.com (Webflow).
## GitHub: Matt-Gray-Founder-OS/FounderOS (public)
## Deploy: GitHub Pages. Scripts load at matt-gray-founder-os.github.io/FounderOS/{filename}.js. Changes to main auto-deploy.

## CRITICAL WARNING
This repo deploys to the LIVE Webflow site via GitHub Pages. Every push to main is immediately live on founderos.com. There is no staging. Test locally before pushing.

## Architecture
Webflow pages load these scripts via `<script src="https://matt-gray-founder-os.github.io/FounderOS/{file}.js">`. The scripts run client-side on the prospect's browser.

### Application Form Routing (the critical path) - updated Apr 21 2026
The application form appears on multiple Webflow pages (/apply, /thank-you/workshop, etc.) with id="fos-application-main". The new architecture uses a single routing script and a single inbound Calendly event:

1. **application-routing-v2.js** - Scores form answers, routes to /book-now?route=qualified or /fos-light-offer?dq=not_ready. Score-only routing, no UTM involvement. UTMs ride along as Calendly prefill params for attribution.
2. **applicationFormControlNew.js** - Multistep form logic, spam filtering, partial submission tracking
3. **application-routing-ads.js** - LEGACY, slated for deletion T+1 week post-cutover. Was the source of the Apr 16 dual-booking bug.

The /book-now page (Webflow) inline JS reads the route param and loads the single Brand Strategy Call Calendly embed (cxvc-8mr-npb) with UTM prefill. No more 4-route switching. No more Intro Call.

### Known Issue (Apr 16 2026 - HISTORICAL, fixed by routing-simplification branch)
Jai Thomas submitted one application form on /thank-you/workshop (organic IG traffic) but the old routing scored him as direct_to_closer, sending him to /book-now?route=closer_ads which showed the Brand Strategy Call. He booked it. Then the Intro Call also appeared (possibly from the workshop registration flow). Result: two Calendly bookings, two DFY assets, two meetings in HubSpot. Root cause: application-routing-ads.js ran on organic pages with no UTM awareness. Fixed by collapsing to single Brand Strategy Call event + score-only routing.

### Calendly Round Robins (verified Apr 21 2026)
All inbound bookings flow through Brand Strategy Call round robins. No Intro Call exists in the new architecture - one call type, scored qualified or disqualified. UTMs handle source attribution via HubSpot to Meta native integration.

| Source | Calendly URL | Event Type ID |
|--------|-------------|---------------|
| /apply (Webflow inbound) | calendly.com/d/cxvc-8mr-npb/brand-strategy-call | 1bbff147 |
| tools.founderos.com (PLG) | calendly.com/d/ct4n-hw4-d8m/brand-strategy-call | 61d20b25 |
| Alberto (DM agent) | calendly.com/d/ct4g-kpp-zx8/brand-strategy-call | d08b16d4 |
| ARIA (chat agent) | calendly.com/d/ct4f-4rm-hv9/brand-strategy-call | 274a141d |
| Outbound setters (cold call to book) | calendly.com/d/cxqn-5hd-8fz/brand-strategy-call | d95b3816 |

**DELETE post-cutover (no longer in architecture):**
- cw2s-j7z-zyk/intro-call (8c143efd)
- cvfx-kyh-8w6/intro-call-paid-media-ads (c4a71026)

### Suspected-stale files (pending Webflow stale-page audit)
- `applicationForm.js` (last touched 2025-05) - minified single-line, references `/intro-call`. No in-repo reference found. Likely dead. Confirm during Task #5 (Webflow stale-page audit) and move to `deprecated/` if no Webflow page loads it.
- `applicationFormNewSite.js` (last touched 2025-05) - minified single-line, references `/schedule/intro-call`. Same: likely dead, confirm and archive.
- `applicationFormControlAds.js` - matches old `-ads` script pattern. Verify load status during Task #5.
- `application-routing-backup.js` - explicitly named backup. Slated for delete T+1 week per Task #12.

### Subprojects
| Folder | Purpose |
|--------|---------|
| meta-capi/ | Meta Conversions API integration. Fires **Lead** (`/apply`, qualified application) and **CompleteRegistration** (`/workshop`, registration) server-side alongside the browser Pixel, deduped on a shared event_id. LIVE. Full docs: `meta-capi/meta-capi.md`. |

### Key Files
| File | Purpose |
|------|---------|
| application-routing-ads.js | Scores form, determines route (closer_ads/setter_ads/nurture), sets redirect URL |
| application-routing-v2.js | Alternate/newer routing logic |
| application-routing-aria.js | ARIA AI chat routing variant |
| applicationFormControlNew.js | Multistep form UI, spam filter, partial submissions to n8n |
| applicationFormControl.js | Older form control (may be deprecated) |
| applicationFormControlAds.js | Ads-specific form control |
| application-form-name-handler.js | Name field handling |
| webflow-form-spam-filter.js | Spam detection and blocking |
| utmScript.js | UTM parameter capture and persistence |
| phone-script-maxmind.js | Phone input with country detection via MaxMind |
| contentBasedOnLocation02192026.js | Geo-based content personalization |
| blockIP.js | IP blocking for known bad actors |
| fathom-code.js | Fathom analytics event tracking |
| gfm-global-newsite.js | Global site scripts |

## Rules
- NEVER push directly to main without testing. This is live on founderos.com.
- Matthew (Webflow developer) owns the Webflow page structure. Coordinate on changes.
- Nhery owns HubSpot form configuration and marketing ops.
- Don owns the routing logic and n8n pipeline integration.
- All form submissions go through HubSpot via hubspotonwebflow.com proxy.
- Partial submissions go to n8n via founderos.app.n8n.cloud/webhook/webhook/partial-submission.

## CLEANUP PLAN (Apr 16 2026) - Architecture Simplification

**SOP EVOLVED 2026-04-21.** Original plan collapsed 4 events to 2 (one Brand Strategy Call + one Intro Call). Final SOP is more aggressive: collapses inbound to 5 round robins (one per source: /apply, TOOLS, Alberto, ARIA, Outbound) with NO Intro Call at all - one call type. /apply specifically collapses to a single event (cxvc-8mr-npb). Read the canonical mapping in the "Calendly Round Robins" section above before acting on this plan. The Target Architecture below reflects /apply specifically and is correct for that scope; the ecosystem-wide picture is the 5-event SOP.

### The Problem
UTMs are being used to determine Calendly routing (which event type to show), creating 4 Calendly events for what is really 2 call types. This conflates attribution with routing, causes bugs (Jai Thomas dual-booking), and makes the system fragile.

### Target Architecture (updated Apr 21 2026)
1. **UTMs are attribution only.** Captured on first page load, persisted in cookie/sessionStorage/hidden fields, passed to Calendly as prefill params, flow to HubSpot via form + Calendly. Never used for routing decisions. HubSpot to Meta native integration handles ad attribution.
2. **Routing is score-based only.** Form answers determine: qualified (Brand Strategy Call) vs nurture (disqualified). Single call type. Zero UTM involvement.
3. **One inbound /apply Calendly round robin.** All qualified /apply leads book the same Brand Strategy Call event (cxvc-8mr-npb). No _ads variants, no Intro Call. UTMs ride along as Calendly prefill params for attribution.
4. **One routing script.** application-routing-v2.js does scoring + redirect to /book-now?route=qualified or /fos-light-offer?dq=not_ready. The /book-now page loads the single Calendly embed with UTM prefill.

### What Exists Today
- **Webflow site:** 673ff72afe499201ca5b3d58 (founderos.com)
- **Scripts:** All loaded via GitHub Pages from Matt-Gray-Founder-OS/FounderOS repo, NOT via Webflow API scripts
- **Key pages:** /apply (69c35608ec1b01f9a575d358), /book-now (69b105d69217198c95d219f7), /thank-you template (6805f839c69e0bf87f694138), /workshop (6892e1b379ed78b6df4d9104)
- **PLG tools (tools.founderos.com):** Vercel project, no routing logic, pure content pages. Not involved.
- **Webflow API access:** Can list pages, read/write scripts via API. Scripts tool available but pages currently use native embed blocks, not API-managed scripts.

### Calendly Events Disposition (updated Apr 21 2026)
| Slug | Event Type ID | Disposition | Notes |
|------|---------------|-------------|-------|
| cxvc-8mr-npb (brand-strategy-call) | 1bbff147 | KEEP - sole /apply event | Round robin Daniel/Robert/Matthew |
| ct4n-hw4-d8m (brand-strategy-call) | 61d20b25 | KEEP - tools.founderos.com PLG | Round robin Daniel/Robert |
| ct4g-kpp-zx8 (brand-strategy-call) | d08b16d4 | KEEP - Alberto DM agent | Round robin Daniel/Robert |
| ct4f-4rm-hv9 (brand-strategy-call) | 274a141d | KEEP - ARIA chat agent | Round robin Daniel/Robert |
| cxqn-5hd-8fz (brand-strategy-call) | d95b3816 | KEEP - outbound setters | Round robin Daniel/Robert |
| cw2s-j7z-zyk (intro-call) | 8c143efd | DELETE | No Intro Call in new architecture |
| cvfx-kyh-8w6 (intro-call-paid-media-ads) | c4a71026 | DELETE | No Intro Call in new architecture |

### Calendly Events in DFY Asset Pipeline (FRONT_END_EVENTS)
The DFY Asset Pipeline (n8n LeGGfFKaeGGOjB5Y) has a FRONT_END_EVENTS set with IDs for all 4 variants plus legacy events. After consolidation, update that set to only include the 5 surviving event type IDs (cxvc-8mr-npb, ct4n-hw4-d8m, ct4g-kpp-zx8, ct4f-4rm-hv9, cxqn-5hd-8fz).

### Files to Change
1. **application-routing-ads.js** - Rewrite: remove UTM-based routing, score only, 2 routes (closer/setter/nurture)
2. **application-routing-v2.js** - Delete (consolidated into ads.js)
3. **application-routing-backup.js** - Delete (consolidated)
4. **application-routing-aria.js** - Keep (ARIA routes to aria.founderos.com, separate path)
5. **/book-now inline JS (Webflow)** - Simplify: 2 routes instead of 4, always pass UTMs as Calendly prefill
6. **DFY Asset Pipeline** - Update FRONT_END_EVENTS set after Calendly consolidation

### Execution Order
1. Update application-routing-ads.js (score-only routing, UTM passthrough)
2. Update /book-now inline JS (2 routes, UTM prefill on both)
3. Test on staging pages first (/staging/apply-v3-2 exists)
4. Push to main (live)
5. Delete duplicate Calendly events after confirming no traffic
6. Update DFY Asset Pipeline FRONT_END_EVENTS
7. Delete deprecated routing scripts from repo

## Routing Audit Findings (Apr 16 2026) - READY TO FIX

### Root Cause Confirmed
`application-routing-ads.js` is loaded on /thank-you/workshop (organic page) via Webflow. It has zero page-context or UTM awareness. Any lead scoring >= 19 with solo decision authority gets `direct_to_closer` which maps to `/book-now?route=closer_ads` (Brand Strategy Call). This is wrong for organic leads.

### 4 Routing Scripts Audited
| Script | closer route | setter route | Status |
|--------|-------------|-------------|--------|
| application-routing-ads.js | closer_ads | setter_ads | LIVE on /thank-you/workshop + /apply |
| application-routing-v2.js | closer (organic) / closer_ads (meta) | setter / setter_ads | NOT LOADED - has UTM detection |
| application-routing-backup.js | closer | setter | Backup, not loaded |
| application-routing-aria.js | aria.founderos.com | aria.founderos.com | ARIA variant, not loaded |

### 5 Problems Found
1. **No page-context awareness** - ads routing script runs on organic pages identically
2. **application-routing-v2.js exists but is not used** - it has UTM source detection that would have prevented this bug (only applies _ads suffix for utm_source=meta)
3. **Design question: should organic leads EVER route to closer?** - Current logic sends score >= 19 + solo decision to Brand Strategy Call regardless of traffic source
4. **Both applicationFormControlNew.js AND application-routing-ads.js run on the same form** - ads routing wins because it intercepts the submit event via __dynamicRedirectUrl
5. **updateRouting() fires on page load** - sets redirect URL before user fills out form if cached values exist

### Fix Options (decide next session)
A. **Swap to application-routing-v2.js on all pages** - It already has UTM detection. Only Meta traffic gets _ads routes. Organic gets plain closer/setter. Minimal change.
B. **Add UTM check to application-routing-ads.js** - Patch the live script with the same UTM logic from v2. Slightly more risk (editing the live script).
C. **Never route organic to closer** - Force all non-Meta leads to setter regardless of score. Safest but may lose legitimate high-intent organic leads.
D. **Page-context routing** - Different script per page. /apply gets ads routing, /thank-you/* gets organic-only routing. Most correct but requires Webflow changes.

### Jai Thomas Evidence Chain
| Time (UTC) | Event | Source |
|------------|-------|--------|
| 05:29:09 | Brand Strategy Call booked on Calendly | No UTMs, no attribution, event type d95b3816. AT TIME OF INCIDENT: this slug (cxqn-5hd-8fz) was the inbound-organic closer route. POST 2026-04-21 SOP: same slug is now the outbound setters round robin. The booking itself is correctly recorded as a closer call against the architecture in place at the time. |
| 05:30:43 | Workshop registration form submitted | IG organic (utm_source=ig) |
| 05:32:24 | Application V2 form submitted from /thank-you/workshop#apply | Same IG session |
| 05:32:52 | Intro Call booked on Calendly | Full IG UTMs, event type c4a71026 (cvfx-kyh-8w6, intro-call-paid-media-ads, slated for deletion) |

The Brand Strategy booking has zero UTMs proving it was not a tracked form submission redirect. The 3-minute gap and name casing difference ("thomas" vs "Thomas") suggest Jai navigated to /book-now independently or via an untracked path, then returned and completed the normal form flow.

## Next
- HANDOFF TO MATTHEW: routing-simplification branch completion + go-live. Deadline 2026-04-21 09:00 ET.
- Full plan in HANDOFF-routing-simplification.md. All code changes require Don approval.
- After go-live: update DFY Asset Pipeline FRONT_END_EVENTS set (Don task)
- After go-live + 48h: delete _ads Calendly event variants (Don task)
- After go-live + 1 week: delete deprecated routing scripts from repo (Don task)
- Audit PLG tools routing in next session

## Session Notes (Apr 21 2026)
- Handoff plan written for Matthew Calabia (Webflow). Branch: routing-simplification, 8 commits ahead, 1 behind main (clean merge).
- Hard gates: no code changes without Don approval, 3 manual browser test cycles, Webflow stale page audit, merge only with approval.
- Key gap for Matthew to close: /book-now Webflow page inline JS must accept ?route=qualified and ?route=nurture instead of old 4-value params.
- Slack group DM sent to Don, Matt, Matthew, Nhery with full plan.

## Session Notes (Apr 20 2026)
- Code review of routing-simplification branch complete: 7 commits ahead, 1 behind main (clean merge)
- Key gap identified: /book-now Webflow page still expects old route params (closer/closer_ads/setter/setter_ads) but new routing sends ?route=qualified
- application-routing-ads.js (the live bug) is unchanged on this branch - only v2.js was rewritten. Webflow script reference must be swapped for the fix to take effect
- Session pivoted to Nick machine remediation (see journal entry)
