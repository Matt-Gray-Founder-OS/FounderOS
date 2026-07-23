# Meta CAPI - how founderos.com reports conversions to Meta

This is the full, plain-English explanation of the Meta Conversions API ("CAPI")
system: what it does, where every piece lives, and exactly how a conversion on
founderos.com becomes a conversion inside Meta (Facebook) Ads. `CLAUDE.md` in
this folder is the short operator cheat-sheet and points back here.

**Read this first:** the two events fire through **completely different
triggers**. `CompleteRegistration` is browser-side (Meta Pixel + a client CAPI
call). `Lead` is **server-side** (an iClosed booking webhook processed by n8n).
They share the audit table, the vault, and the pixel, but nothing about how they
are triggered is the same. Do not assume the browser model applies to Lead.

---

## 1. What it does, in one paragraph

When someone converts on founderos.com - registers for the workshop on
`/workshop`, or books a qualified **Brand Strategy Call** (our application, taken
through **iClosed**) - we tell Meta so it can attribute the conversion to the ad
that drove it. That is two standard events: **CompleteRegistration** (workshop
registration) and **Lead** (qualified application). Both are delivered to Meta by
our server-side Conversions API and recorded in one audit table.

---

## 2. The two events, and how each is triggered

| Event | Fires when | Trigger mechanism (these differ completely) |
|---|---|---|
| **Lead** | someone books an **inbound Brand Strategy Call** in iClosed with a **qualifying annual revenue band** (>= $500k/yr) | **iClosed webhook -> n8n workflow `WF1 - iClosed -> Supabase (MVP)` -> POST to the `meta-capi-lead` edge function.** Server-side. No browser Pixel. |
| **CompleteRegistration** | the `/workshop` registration form submits successfully | **Browser:** `setupReCAPTCHAForm` onSuccess -> `capi-complete-registration.js` -> Meta Pixel + a CAPI `fetch` to the `meta-capi` edge function. Shared `event_id` deduplicates the two. |

---

## 3. Lead - the iClosed -> n8n path (server-side)

This is the live Lead mechanism. There is **no browser code** in this path.

```
Prospect books a Brand Strategy Call in iClosed (the /apply funnel)
        |
        v
iClosed sends a "Call booked" webhook
        |
        v
n8n: WF1 - iClosed -> Supabase (MVP)   (webhook: founderos.app.n8n.cloud/webhook/iclosed-supabase)
   Normalize -> logs to Supabase (iclosed_webhook_log / iclosed_events / iclosed_contacts)
             -> CAPI Gate  (qualify)
                  - inbound Brand Strategy Call only (event_type_slug === 'brand-strategy-call')
                  - annual revenue band must qualify (>= $500k/yr)
             -> Fire Meta CAPI  ->  POST .../functions/v1/meta-capi-lead
```

- **Trigger:** an iClosed webhook on `hookType = "Call booked"` (booking the Brand
  Strategy Call *is* the application). Received by n8n workflow **`WF1 - iClosed ->
  Supabase (MVP)`** (id `86wtSiJMImie7aJa`) at
  `founderos.app.n8n.cloud/webhook/iclosed-supabase`.
- **Qualification (`CAPI Gate` node):** a Lead fires only when BOTH hold:
  - The booking is an **inbound Brand Strategy Call** - `event_type_slug ===
    'brand-strategy-call'`. The **outbound** BSC variants
    (`brand-strategy-call-outbound`, `brand-strategy-outbound-initial`) are
    setter-sourced (not Meta-ad-driven) and are **excluded**, as are Check-In
    (`brand-strategist-check-in`) and Renewal (`renewal-diagnostic-call`) calls.
  - The annual-revenue answer is a **qualifying band**: `$500k to $1M`, `$1M to
    $3M`, `$3M to $10M`, `$10M to $30M`, `$30M+`. Below-threshold answers
    (`$250k to $500k`, `$100k to $250k`, `Under $100k`, `Not generating revenue
    yet`) skip. An unrecognized answer logs `CAPI_UNMAPPED_REVENUE` for review and
    does not fire.
- The revenue bands are the **byte-exact active options** of the iClosed CALL
  field "Which best describes your annual revenue?" (field id `165374`), verified
  against the iClosed API. iClosed's older monthly bands are archived at source
  and pruned from the gate.
- It builds a **deterministic `event_id`** (a hash of the iClosed call id) so a
  re-delivered webhook cannot double-count, and POSTs `{event_id, email, phone,
  first_name, last_name, fbp, utm_*, is_test}` to `meta-capi-lead`. `is_test` is
  driven by an iClosed `__test` flag.
- **Consequences of being server-side:** the `client_ip_address` /
  `client_user_agent` Meta receives are **n8n's**, not the applicant's; and there
  is **no browser Pixel Lead event**, so there is no Pixel/CAPI dedup pair for
  Lead (the server event stands alone).

The `CAPI Gate` logic is a Code node inside WF1 (n8n), not in this repo. A
snapshot of the deployed gate code + the full workflow is kept at
`fos-control/audits/wf1-*` for reference/rollback.

---

## 4. CompleteRegistration - the /workshop browser path

This one *is* the classic browser Pixel + CAPI model.

```
Visitor submits the /workshop form  ->  setupReCAPTCHAForm sees .w-form-done (success)
   -> onSuccess -> window.fireMetaCompleteRegistration(form)
        1. makes ONE random event_id
        2. fbq('track','CompleteRegistration', {...}, {eventID})   (browser Pixel)
        3. fetch .../functions/v1/meta-capi  with the SAME event_id (server CAPI)
   -> Meta dedupes the Pixel + CAPI by shared event_id (48h window)
```

Files: `meta-capi/capi-complete-registration.js` (defines
`window.fireMetaCompleteRegistration`), the `onSuccess` hook in
`setupReCAPTCHAForm.js`, and the `/workshop` Webflow footer wiring (pasted in the
Webflow Designer). Sends `_fbp`/`_fbc` cookies + hashed PII for match quality.

---

## 5. Dead / leftover code (do not be misled)

The `/apply` **Webflow application-form stack was replaced by iClosed.** These are
**dead leftovers** still sitting in the repo; their removal is the separate
code-audit pass:

- `meta-capi/capi-lead.js` - the browser Lead module (`window.fireMetaCAPILead`).
  Still loaded on `/apply` but **never called** (its only caller,
  `applicationFormControlNew.js`, is not loaded on the live page). The Lead fires
  from n8n now, not from here.
- `applicationFormControlNew.js`, `application-routing-v2.js`,
  `application-routing-9Jun2026.js`, `application-routing-aria.js` - the old
  Webflow application form + routing/scoring scripts. Not loaded on the live site.

---

## 6. Where everything lives

### 6a. Server (Conversions API) - `fos-control` repo, deployed to the Sales project

| File (under `fos-control/`) | Role |
|---|---|
| `supabase/functions/meta-capi/index.ts` | Generalized endpoint. Fires **CompleteRegistration** today; `event_name` allowlist. |
| `supabase/functions/meta-capi-lead/index.ts` | The **Lead** endpoint (what n8n calls). |
| `supabase/functions/_shared/meta_capi.ts` | Shared engine (hashing, Graph POST, audit) used by `meta-capi`. |
| `supabase/functions/_shared/utils.ts` | `sha256`, `readVaultSecret`. |
| `scripts/deploy-edge-function.sh` | Deploys `meta-capi` / `meta-capi-lead` to Sales; runs the vault-name gate. |
| `migrations/ldspjkntkuuqlwrdefzh/20260723_meta_capi_add_event_name.sql` | Added the `event_name` column. |

Endpoints: **Lead** -> `.../functions/v1/meta-capi-lead`; **CompleteRegistration**
-> `.../functions/v1/meta-capi`. Both on Sales (`ldspjkntkuuqlwrdefzh`).

### 6b. The Lead trigger - n8n (NOT in the repo)

- Workflow **`WF1 - iClosed -> Supabase (MVP)`** (id `86wtSiJMImie7aJa`) on
  `founderos.app.n8n.cloud`, webhook path `/webhook/iclosed-supabase`. The
  qualification lives in its `CAPI Gate` Code node. Snapshot: `fos-control/audits/wf1-*`.

### 6c. The CompleteRegistration trigger - `FounderOS` repo (browser, GitHub Pages)

- `meta-capi/capi-complete-registration.js`, the `onSuccess` hook in
  `setupReCAPTCHAForm.js`, and the `/workshop` Webflow footer. Served at
  `matt-gray-founder-os.github.io/FounderOS/meta-capi/<file>.js`.

### 6d. Data

- **Audit table `public.meta_capi_events`** on Sales (`ldspjkntkuuqlwrdefzh`): one
  row per fire. Columns include `event_id`, `event_name` (`Lead` /
  `CompleteRegistration`), `is_test`, `fb_response_status`, `fb_trace_id`,
  `error_reason`, `client_ip_hash`, `user_agent`, `user_data_fields`,
  `application_score`, `created_at`. Ground truth for "did it fire, did Meta
  accept it." A Lead row shows `user_agent = "n8n"`.
- **iClosed mirror tables** on Sales, also written by WF1:
  `iclosed_webhook_log` (raw log; `event_type = 'CAPI_UNMAPPED_REVENUE'` flags an
  inbound BSC whose revenue answer matched no band), `iclosed_events`,
  `iclosed_contacts`.
- **Vault** on FOS Control (`yhvssclmrddiowlccvjc`): `meta_ads_token`,
  `founder_os_meta_pixel` (`717725617464118`), `meta_capi_test_event_code`, and
  `iclosed_api_key` (Bearer; used to read iClosed event/question config, e.g.
  verifying the revenue bands).

---

## 7. Pattern B - why two Supabase projects

The edge functions **run on the Sales project** but **read their Meta secrets from
the FOS Control vault**: they get FOS Control's URL + key from
`CONTEXT_SUPABASE_URL` / `CONTEXT_SUPABASE_SERVICE_KEY` (set on Sales), and write
audit rows to Sales via the injected `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`. Code + audit on Sales; secrets from FOS Control. A
function's source living in `fos-control` does not mean it runs there.

---

## 8. Match quality (what each event sends Meta)

- Hashed SHA-256 (normalized): `em`, `ph`, `fn`, `ln`.
- Sent plaintext: `client_ip_address`, `client_user_agent`, and (browser only)
  `_fbp` / `_fbc`.
- **CompleteRegistration** (browser) sends `_fbp`/`_fbc` and the real visitor
  IP/UA - strong match quality.
- **Lead** (server-side via n8n) sends hashed em/ph/fn/ln, but the IP/UA are
  **n8n's server**, and there is no browser cookie (`fbp` is only present if
  iClosed passed it). Match quality is therefore email/phone/name-driven.

---

## 9. Test mode vs live

- **CompleteRegistration:** an `IS_TEST` flag at the top of
  `capi-complete-registration.js`. `true` routes to Events Manager Test Events;
  `false` is live. Flip only after a real submit verifies.
- **Lead:** driven by an iClosed `__test` flag on the webhook payload (WF1's
  `CAPI Gate` reads it). Real bookings are live; a `__test` webhook routes to Test
  Events.

Two things that look like failures but are not (learned at go-live): **live events
never appear in the Test Events tab** (that tab is test-code-only), and **Meta's
live Overview lags** (~20 min for server events). The `meta_capi_events` audit row
(status 200) is the instant ground truth; Overview is the delayed view.

---

## 10. Deploying / operating

- **Deploy the edge functions:** from the `fos-control` repo root,
  `bash scripts/deploy-edge-function.sh meta-capi` (or `meta-capi-lead`). Routes to
  Sales, runs the vault-name gate first. Never deploy edge functions via MCP.
- **Change the Lead qualification** (bands, event-type scope): edit WF1's
  `CAPI Gate` Code node in n8n (or via the n8n API; back up first, keep it active,
  verify with a `__test` webhook). The bands are byte-exact from the iClosed API;
  re-verify against iClosed if the form changes.
- **Deploy the CompleteRegistration browser script:** merge to `main` in
  `FounderOS` (GitHub Pages). The `/workshop` wiring is edited in the Webflow
  Designer (the API rejects that footer - see gotchas).
- **Rotate the Meta token / pixel:** update the vault entry; read fresh per request.

### Health check (SQL on Sales)

```sql
-- recent fires by event
select event_name, is_test, fb_response_status, error_reason, created_at
from public.meta_capi_events order by created_at desc limit 20;

-- inbound Brand Strategy Calls whose revenue answer matched no band (should be rare)
select raw->>'revenue' as revenue, count(*)
from public.iclosed_webhook_log
where event_type = 'CAPI_UNMAPPED_REVENUE'
group by 1 order by 2 desc;
```

---

## 11. Gotchas and watch-fors

- **Lead is server-side; CompleteRegistration is browser-side.** The single most
  common wrong assumption is that Lead behaves like the browser flow. It does not.
- **The Lead qualification lives in n8n, not the repo.** Byte-exact revenue bands
  (annual only; monthly archived at iClosed) and inbound-only
  (`event_type_slug === 'brand-strategy-call'`). Verify bands against the iClosed
  API if the form is edited.
- **`CAPI_UNMAPPED_REVENUE` is now a real signal:** with non-application call types
  excluded, an entry means an inbound BSC arrived with a revenue answer the gate
  did not recognize. Investigate (a band was reworded, or the answer was blank).
- **The `/workshop` footer must be edited in the Webflow Designer, not the API**
  (the write API returns 406 on the `<meta http-equiv="refresh">` failsafe).
- **CompleteRegistration: one `event_id` per submit**, shared by Pixel + CAPI, or
  Meta double-counts. (Lead uses a deterministic `event_id` from n8n instead.)
- **The audit row is ground truth, not Meta's UI.** Live events lag ~20 min in
  Overview and never show in Test Events.
- **Access token travels in the POST body, never the URL**, so it cannot leak into
  an error / the audit table.
- **No consent gate** (decision, 2026-07-23).

---

## 12. Quick reference

| Thing | Value |
|---|---|
| Meta Pixel | `717725617464118` |
| Sales project (functions + `meta_capi_events` + iClosed mirror) | `ldspjkntkuuqlwrdefzh` |
| FOS Control project (vault) | `yhvssclmrddiowlccvjc` |
| Lead endpoint | `.../functions/v1/meta-capi-lead` |
| CompleteRegistration endpoint | `.../functions/v1/meta-capi` |
| Lead trigger (n8n) | `WF1 - iClosed -> Supabase (MVP)` (`86wtSiJMImie7aJa`), webhook `/webhook/iclosed-supabase` |
| iClosed API | `https://public.api.iclosed.io/v1`, `Authorization: Bearer iclosed_<key>` (vault `iclosed_api_key`) |
| Events Manager (Test / live) | `business.facebook.com/events_manager2/list/dataset/717725617464118/test_events` (or `/overview`) |

---

## 13. Related docs

- `meta-capi/CLAUDE.md` - short operator cheat-sheet (points here).
- `FounderOS/CHANGELOG.md`, `fos-control/CHANGELOG.md` - history.
- `fos-control/audits/wf1-*` - snapshot of the deployed n8n CAPI Gate + workflow.
