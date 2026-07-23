# Meta CAPI - how founderos.com reports conversions to Meta

This is the full, plain-English explanation of the Meta Conversions API ("CAPI")
system: what it does, where every piece lives, and exactly how a form submission
on founderos.com turns into a conversion inside Meta (Facebook) Ads. If you read
one file to understand this system, read this one. `CLAUDE.md` in this folder is
the short operator cheat-sheet and points back here.

---

## 1. What it does, in one paragraph

When someone converts on founderos.com - submits a qualified application on
`/apply`, or registers for the workshop on `/workshop` - we tell Meta about it
**two ways at once**: the normal browser **Meta Pixel**, and a **server-to-server
call** (the Conversions API). The server call is the backup that still reports the
conversion even when an ad blocker or browser privacy setting stops the Pixel from
loading. Both messages carry the **same event ID**, so Meta counts the conversion
**once**, not twice. This is what lets Meta credit a conversion back to the ad
that drove it.

Nothing here changes what the visitor sees. It runs quietly in the background on
form success.

---

## 2. The two events we send

| Event we send to Meta | Fires when | Page | What decides it fires |
|---|---|---|---|
| **Lead** | an application scores "qualified" (score >= 11) | `/apply` | `application-routing-v2.js` sets a hidden `application_route` field to `qualified` |
| **CompleteRegistration** | the workshop registration form submits successfully | `/workshop` | `setupReCAPTCHAForm.js` sees Webflow's success state and calls its `onSuccess` hook |

Both events run on the **same shared server engine** and write to the **same audit
table**. CompleteRegistration is the newer one (shipped 2026-07-23). Lead is the
original; it still runs on its own older function and will be moved onto the
shared engine in a later phase.

---

## 3. The big picture (how one submission flows)

```
Visitor submits the form on founderos.com
        |
        v
Browser script (served from GitHub Pages):
  1. makes ONE random event ID
  2. fires the Meta Pixel          -> fbq('track', <Event>, {eventID: <id>})
  3. sends the same ID to server   -> fetch(<our endpoint>)
        |                                    |
   (browser -> Meta)                    (browser -> our server)
        v                                    v
   Meta Pixel                       Supabase edge function (Sales project):
                                      - hashes email/phone/name (SHA-256)
                                      - adds Meta cookies + IP + browser string
                                      - reads Meta token + Pixel ID from vault
                                      - POSTs the event to Meta's Conversions API
                                      - writes an audit row
        |                                    |
        +-----------------+------------------+
                          v
             Meta receives BOTH messages, sees the same
             event ID, and merges them into ONE conversion
             (deduplication, 48-hour window)
```

The key idea: **one event ID, sent two ways, deduplicated by Meta.**

---

## 4. Where every piece lives

The system spans **two git repos** and **two Supabase projects**. Here is all of it.

### 4a. Browser code - `FounderOS` repo, delivered by GitHub Pages

Every file below is served live at
`https://matt-gray-founder-os.github.io/FounderOS/<path>` and updates on every
push to `main` (GitHub Pages auto-publishes). There is no staging for these files.

| File | Role |
|---|---|
| `meta-capi/capi-complete-registration.js` | CompleteRegistration browser module. Defines `window.fireMetaCompleteRegistration(form)`: makes the event ID, fires the Pixel, sends the server call. |
| `meta-capi/capi-lead.js` | Lead browser module. Defines `window.fireMetaCAPILead(form)`. Same shape as above. |
| `setupReCAPTCHAForm.js` | Shared form-submit handler used by several forms. It runs reCAPTCHA, lets Webflow submit to HubSpot, and on the success state calls an optional `onSuccess(form)` callback - that callback is what fires CompleteRegistration. |

**How each event is wired to its form:**

- **Lead** is wired in `applicationFormControlNew.js` (repo). At the end of the
  submit handler it checks the hidden `application_route` field and, if it reads
  `qualified`, calls `window.fireMetaCAPILead(form)`.
- **CompleteRegistration** is wired in the **`/workshop` page's footer custom
  code inside Webflow** (NOT in this repo - see gotcha in section 10). That footer
  loads `capi-complete-registration.js` and passes an `onSuccess` callback to
  `setupReCAPTCHAForm`.

### 4b. Server code - `fos-control` repo, deployed to the Sales Supabase project

The server programs are Supabase "edge functions" (small programs that run in the
Supabase cloud, one per HTTP endpoint). Their source lives in `fos-control` but
they **deploy to the Sales project** (see Pattern B, section 5).

| File (under `fos-control/`) | Role |
|---|---|
| `supabase/functions/meta-capi/index.ts` | The generalized endpoint. Handles CompleteRegistration today; accepts `event_name` from an allowlist (`Lead`, `CompleteRegistration`). Lead will move here later. |
| `supabase/functions/meta-capi-lead/index.ts` | The original Lead-only endpoint. Still live and unchanged. |
| `supabase/functions/_shared/meta_capi.ts` | The shared engine: hashing, event assembly, the call to Meta, error classification, and the audit write. The `meta-capi` function uses this; `meta-capi-lead` still has its own inline copy until it migrates. |
| `supabase/functions/_shared/utils.ts` | Low-level helpers: `sha256` and `readVaultSecret`. |
| `scripts/deploy-edge-function.sh` | Deploys a function. Routes `meta-capi` and `meta-capi-lead` to the Sales project, and runs the vault-name safety check first. |
| `migrations/ldspjkntkuuqlwrdefzh/20260723_meta_capi_add_event_name.sql` | The DB change that added the `event_name` column. |

**Live endpoints (what the browser calls):**

- CompleteRegistration -> `https://ldspjkntkuuqlwrdefzh.supabase.co/functions/v1/meta-capi`
- Lead -> `https://ldspjkntkuuqlwrdefzh.supabase.co/functions/v1/meta-capi-lead`

### 4c. Data - two Supabase projects

**Audit table: `public.meta_capi_events` on the Sales project (`ldspjkntkuuqlwrdefzh`).**
One row per fire. This is the ground truth for "did it fire, and did Meta accept
it." Columns:

| Column | Meaning |
|---|---|
| `event_id` | the shared Pixel/CAPI ID for this fire |
| `event_name` | `Lead` or `CompleteRegistration` (added 2026-07-23; old rows default to `Lead`) |
| `is_test` | true = went to Test Events; false = live |
| `fb_response_status` | Meta's HTTP status (200 = accepted) |
| `fb_trace_id` | Meta's trace id for the fire |
| `error_reason` | null on success; the error text otherwise |
| `client_ip_hash` | the visitor's IP, hashed (never stored raw) |
| `user_agent`, `user_data_fields` | browser string; which match fields were sent |
| `application_score` | the Lead score (null for CompleteRegistration) |
| `created_at` | when the fire happened |

**Secrets: the vault on the FOS Control project (`yhvssclmrddiowlccvjc`).**

| Vault entry | What it is |
|---|---|
| `meta_ads_token` | the Meta access token the server authenticates with |
| `founder_os_meta_pixel` | the Pixel ID - `717725617464118`, the same pixel the browser uses |
| `meta_capi_test_event_code` | the code that routes test fires to Events Manager, Test Events |

---

## 5. Pattern B - why two projects

The function **runs on the Sales project** but **reads its secrets from the FOS
Control project's vault**. Concretely:

- It reads FOS Control's URL + service key from two environment variables set on
  the Sales project: `CONTEXT_SUPABASE_URL` and `CONTEXT_SUPABASE_SERVICE_KEY`.
  Those are used only to fetch the Meta token + Pixel ID from the vault.
- It writes audit rows to Sales using the two environment variables Supabase
  injects automatically: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

So: **code and audit live on Sales; secrets live on FOS Control.** This is called
"Pattern B" across the fleet. It is why the source file sits in `fos-control` but
the function does not run there. Do not assume a function's deploy target from
where its source file lives.

---

## 6. How it works, step by step (plain English)

1. The visitor completes the form and it submits successfully.
2. The browser module makes **one random event ID** (a UUID).
3. It **fires the Meta Pixel** with that event ID (this is the browser-side report).
4. It **sends the same event ID** plus the form fields (email, phone, first/last
   name), Meta's browser cookies (`_fbp`, and `_fbc` if the visitor arrived from an
   ad), and the page URL to our server endpoint. It uses `keepalive` so the request
   still completes even though the page immediately redirects.
5. The server **hashes** the personal fields with SHA-256. Meta only ever receives
   scrambled values, never a raw email or phone. It keeps the cookies, IP, and
   browser string **as-is** (Meta needs those unscrambled to match). It reads the
   Meta token + Pixel ID from the vault fresh on every request.
6. The server **POSTs the event to Meta's Conversions API** for pixel
   `717725617464118`.
7. The server **writes one audit row** (event name, whether Meta accepted it, any
   error) and returns. The audit write can never block or fail the fire.
8. Meta sees the browser Pixel event and the server event carrying the **same
   event ID** and **merges them into one conversion** (within a 48-hour window).

---

## 7. Match quality - what we actually send Meta

The more identifying signals Meta gets, the better it can match a conversion to a
real person and the ad that drove them.

- **Hashed (scrambled with SHA-256, normalized first):** email, phone, first
  name, last name.
- **Sent in the clear (Meta requires these raw to match):** the `_fbp` cookie,
  the `_fbc` cookie, the visitor's IP address, and the browser user-agent string.

Note: the CompleteRegistration path sends the `_fbp`/`_fbc` cookies for better
match quality. The older Lead path does not yet (it will when it moves onto the
shared engine).

---

## 8. Test mode vs live mode

Each browser module has an `IS_TEST` flag near the top.

- **`IS_TEST = true`:** the server attaches the `test_event_code` and events land
  in Events Manager, Test Events, not real attribution.
- **`IS_TEST = false`:** events are **live**.

**Going live with a new event (the safe sequence):**

1. Deploy everything with `IS_TEST = true`.
2. Submit a real form. Confirm a `meta_capi_events` row with `is_test = true` and
   `fb_response_status = 200`, and confirm the event in Events Manager, Test Events.
3. Flip `IS_TEST = false`, push (GitHub Pages serves it), and confirm a **live**
   audit row (`is_test = false`, status 200).

**Two things that look like failures but are not** (learned at go-live 2026-07-23):

- **Live events never appear in the Test Events tab.** That tab only shows events
  sent with a matching `test_event_code`. A live event has none, so it will not
  show there, only in Overview / Data Sources.
- **Meta's live Overview lags** (often ~20 minutes for server events). A live
  event fired a few minutes ago legitimately will not show yet. The
  `meta_capi_events` audit row (status 200) is the **instant** ground truth;
  Overview is the delayed view. A `200` from Meta proves it was *received*, which
  is not the same as being *visible* yet.

---

## 9. Deploying and operating

- **Deploy the server:** from the `fos-control` repo root, run
  `bash scripts/deploy-edge-function.sh meta-capi`. It routes to Sales
  automatically and runs the vault-name safety check first. Run it **from the repo
  root** (the Supabase CLI resolves the function source relative to the current
  directory). Never deploy edge functions via the MCP tool.
- **Deploy the browser scripts:** merge to `main` in the `FounderOS` repo; GitHub
  Pages publishes automatically. Every push to `main` is immediately live on
  founderos.com. There is no staging for these files.
- **Wire a Webflow page:** the `<script>` tag and the `onSuccess` callback go in
  the page's custom code **via the Webflow Designer** (the API refuses to write it,
  see gotcha in section 10).
- **Rotate the Meta token or Pixel ID:** update the vault entry. The function
  reads it fresh on every request, no redeploy needed.
- **Add an allowed domain (CORS):** edit `ALLOWED_ORIGINS` in the function source
  and redeploy.

### Health check (SQL against the Sales project)

```sql
-- last 20 fires
select event_name, is_test, fb_response_status, error_reason, created_at
from public.meta_capi_events
order by created_at desc
limit 20;

-- error rate by event
select event_name,
       count(*) filter (where error_reason is not null) as errors,
       count(*) as total,
       max(created_at) as last_fire
from public.meta_capi_events
group by event_name;
```

---

## 10. Gotchas and watch-fors (the ones we learned the hard way)

- **One event ID per submit.** The browser module makes ONE UUID and uses it for
  BOTH the Pixel and the server call. If that ever splits into two IDs, Meta stops
  deduplicating and double-counts. Keep the single-source discipline.
- **The Webflow write API cannot edit the `/workshop` footer.** It returns HTTP
  406 because that footer contains a `<meta http-equiv="refresh">` failsafe the
  API rejects. The script tag + `onSuccess` must be pasted in the **Webflow
  Designer**, not through the API or MCP.
- **Wire `onSuccess` call-time, not by reference:**
  `onSuccess: function (f) { if (window.fireMetaCompleteRegistration) window.fireMetaCompleteRegistration(f); }`.
  This way script load order can never strand the fire.
- **The audit row is the ground truth, not Meta's UI.** Status 200 + an audit row
  means Meta received it. Live events lag in Overview (~20 min) and never show in
  Test Events.
- **Test Events visibility depends on the code.** The Test Events tab only shows
  fires whose `test_event_code` matches the code shown at the top of that tab. To
  watch a fire land there, send that exact code.
- **Deploy from the `fos-control` repo root** (the CLI resolves source paths
  relative to the current directory).
- **No consent gate** (decision, 2026-07-23): fires are not gated on cookie
  consent, matching the existing Lead behavior.
- **The Meta token travels in the POST body, never the URL**, so it cannot leak
  into an error string or the audit table.

---

## 11. Quick reference

| Thing | Value |
|---|---|
| Meta Pixel (browser + CAPI, same pixel) | `717725617464118` |
| Sales Supabase project (functions + `meta_capi_events`) | `ldspjkntkuuqlwrdefzh` |
| FOS Control Supabase project (vault) | `yhvssclmrddiowlccvjc` |
| HubSpot portal (the forms) | `44306052` |
| CompleteRegistration endpoint | `.../functions/v1/meta-capi` |
| Lead endpoint | `.../functions/v1/meta-capi-lead` |
| Events Manager (Test Events) | `business.facebook.com/events_manager2/list/dataset/717725617464118/test_events` |
| Events Manager (Overview / live) | `business.facebook.com/events_manager2/list/dataset/717725617464118/overview` |

---

## 12. Related docs

- `meta-capi/CLAUDE.md` - the short operator cheat-sheet for this folder (points here).
- `FounderOS/CHANGELOG.md` - browser-side history + the go-live log.
- `fos-control/CHANGELOG.md` - server, deploy, and engine history.
- `application-routing-v2.js` (this repo) - the scoring script the Lead event hooks into.
