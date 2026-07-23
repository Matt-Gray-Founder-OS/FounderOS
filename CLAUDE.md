# FounderOS Website Scripts

Client-side JS/CSS for the **founderos.com** Webflow marketing site. Webflow loads these files in
the prospect's browser via `<script src="https://matt-gray-founder-os.github.io/FounderOS/<file>">`,
placed in its site-wide and per-page custom code (the `<script>` tags live in Webflow, not this repo).

## CRITICAL: no staging
Every push to `main` auto-deploys to GitHub Pages and is immediately live on founderos.com
(`.github/workflows/jekyll-gh-pages.yml`). There is no staging environment. Branch, review the diff,
test locally, then merge. The Webflow custom code that references these files is edited in the Designer
(or via the Webflow MCP), separately from the code here - and Webflow's API rejects freeform
custom-code writes (HTTP 406), so those edits are Designer-only.

## Architecture
- **Webflow site id:** `673ff72afe499201ca5b3d58` (founderos.com / www.founderos.com).
- Site-wide scripts load on every page from Webflow's site head/footer custom code; page-specific
  scripts load from an individual page's footer.
- Forms post to HubSpot; partial submissions go to n8n. reCAPTCHA gating plus post-submit redirect and
  success hooks are centralized in `setupReCAPTCHAForm.js` (binds once per form, idempotent).

## Live site-wide scripts (verified in Webflow site custom code)
`setupReCAPTCHAForm.js`, `phone-script-maxmind.js`, `contentBasedOnLocation02192026.js` (geo content
plus `redirectByCountryConfig`), `utmScript.js`, `blockIP.js`, `webflow-form-spam-filter.js`,
`fathom-code.js`, `fos-custom.css`. Other repo scripts (the "get the framework" modal, newsletter,
user details, HubSpot event tracker) load on specific pages - check the Webflow page that loads a
script before assuming it is live.

## Applications + booking run through iClosed
`/apply`, the `/thank-you/*` pages, and all call booking run through the site-wide **iClosed** widget.
There are no Webflow native application forms on the site. On the `/thank-you/*` template, iClosed sits
next to one live script call - `redirectByCountryConfig({ hybrid:'/next-step', nonCurated:'/fos-light-offer' })`,
a geo-IP filter (from `contentBasedOnLocation02192026.js`) that routes low-revenue countries away so
they do not clog the booking system. Keep it.

The pre-iClosed browser application stack was **removed 2026-07-23**: `applicationFormControlNew.js`,
`application-routing-v2.js`, `application-form-name-handler.js`, `application-routing-aria.js`,
`application-routing-9Jun2026.js`, `meta-capi/capi-lead.js`, plus the `deprecated/` and `backup codes/`
directories. iClosed replaced that funnel; do not resurrect them from git history.

## Subproject: meta-capi/
Meta Conversions API. **Lead** fires server-side from an iClosed booking via n8n; **CompleteRegistration**
fires browser-side on `/workshop`. Full end-to-end docs: [meta-capi/meta-capi.md](meta-capi/meta-capi.md).
Server code and engine live in the `fos-control` repo, deployed to the Sales Supabase project.

## Ownership
- **Matthew** - Webflow page structure (coordinate on structural changes).
- **Nhery** - HubSpot form configuration and marketing ops.
- **Don** - routing logic, n8n pipeline, Meta CAPI.

## History
Prior architecture and phase history (the retired 4-route Calendly / Intro-Call funnel, the Apr 2026
routing-simplification project, the 2026-07-23 dead-code cleanup) live in `CHANGELOG.md`, not here.
Keep this file lean.
