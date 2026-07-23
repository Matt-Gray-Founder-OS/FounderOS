/* ========================================
   Founder OS - Meta CAPI: CompleteRegistration
   Client companion for the /workshop registration form.
   Fires ONLY on a verified successful submission, via the setupReCAPTCHAForm
   onSuccess hook (i.e. after Webflow confirms the HubSpot submit succeeded).
   ======================================== */

(function () {

  // Test mode: while true, the server attaches test_event_code (from vault) and
  // events land in Events Manager -> Test Events, NOT live ad attribution.
  // Flip to false at go-live (see meta-capi/CLAUDE.md go-live steps). Pair any
  // flip with a real submit + Events Manager verification.
  var IS_TEST = true;

  // Generalized Meta CAPI endpoint on the Sales project (ldspjkntkuuqlwrdefzh).
  // Reads meta_ads_token + founder_os_meta_pixel from the FOS Control vault at
  // request time; no redeploy needed if Meta rotates them.
  var CAPI_ENDPOINT = "https://ldspjkntkuuqlwrdefzh.supabase.co/functions/v1/meta-capi";

  var EVENT_NAME = "CompleteRegistration";
  var CONTENT_NAME = "Founder OS Workshop Registration";

  // Per-form dedup - WeakSet keyed by form element. Prevents a double fire on
  // rapid re-submits. Resets on page navigation.
  var FIRED_FORMS = new WeakSet();

  function uuid4() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // RFC4122 v4 fallback for older browsers
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function readField(form, name) {
    var el = form.querySelector("[name=\"" + name + "\"], #" + name);
    return el && el.value ? String(el.value).trim() : "";
  }

  function readCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)")
    );
    return m ? decodeURIComponent(m[1]) : "";
  }

  // Meta browser id (_fbp) is set by the site-wide Pixel. Meta click id (_fbc)
  // exists on ad traffic; if the cookie is absent but the URL carries an
  // fbclid, derive fbc per Meta spec: fb.1.<ms>.<fbclid>. Both are sent
  // plaintext to improve match quality.
  function getFbc() {
    var fbc = readCookie("_fbc");
    if (fbc) return fbc;
    var m = window.location.search.match(/[?&]fbclid=([^&]+)/);
    if (m && m[1]) return "fb.1." + Date.now() + "." + decodeURIComponent(m[1]);
    return "";
  }

  function firePixel(eventId) {
    try {
      if (typeof window.fbq === "function") {
        window.fbq("track", EVENT_NAME, { content_name: CONTENT_NAME }, { eventID: eventId });
      }
    } catch (e) {
      if (window.console) console.warn("[FOS CAPI CR] fbq call failed:", e);
    }
  }

  function postCapi(eventId, form) {
    var payload = {
      event_name: EVENT_NAME,
      event_id: eventId,
      email: readField(form, "email"),
      phone: readField(form, "phone"),
      first_name: readField(form, "firstname"),
      last_name: readField(form, "lastname"),
      fbp: readCookie("_fbp"),
      fbc: getFbc(),
      event_source_url: window.location.origin + window.location.pathname,
      content_name: CONTENT_NAME,
      utm_source: readField(form, "utm_source"),
      utm_medium: readField(form, "utm_medium"),
      utm_campaign: readField(form, "utm_campaign"),
      utm_term: readField(form, "utm_term"),
      utm_content: readField(form, "utm_content"),
      is_test: IS_TEST
    };

    // fire-and-forget: keepalive=true lets the POST survive the redirect to
    // /thank-you/workshop that setupReCAPTCHAForm triggers right after success.
    // Surface failures - a resolved non-2xx (e.g. blank fields -> 400
    // no_identifier) is NOT a fetch rejection, so check response.ok explicitly.
    // Silent loss of a registration event is exactly what we must not do; the
    // durable signal is the server-side log + audit row, this is the client tell.
    try {
      fetch(CAPI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        mode: "cors"
      }).then(function (r) {
        if (!r.ok && window.console) {
          r.json().then(function (b) {
            console.warn("[FOS CAPI CR] server rejected CompleteRegistration:", r.status, (b && b.reason) || "");
          }).catch(function () {
            console.warn("[FOS CAPI CR] server rejected CompleteRegistration:", r.status);
          });
        }
      }).catch(function (e) {
        if (window.console) console.warn("[FOS CAPI CR] proxy post failed:", e);
      });
    } catch (e) {
      if (window.console) console.warn("[FOS CAPI CR] proxy fetch threw:", e);
    }
  }

  /**
   * Public API. Wire into setupReCAPTCHAForm's onSuccess on the /workshop form,
   * so it fires only after Webflow confirms a successful HubSpot submission.
   * Wire it call-time, not by bare reference, so script load order cannot
   * strand it:
   *   onSuccess: function (f) {
   *     if (window.fireMetaCompleteRegistration) window.fireMetaCompleteRegistration(f);
   *   }
   *
   * Generates a single event_id used by BOTH the client Pixel call (fbq with
   * eventID) and the server CAPI call, so Meta dedupes them. Idempotent per
   * form element.
   */
  window.fireMetaCompleteRegistration = function (form) {
    if (!form) return;
    if (FIRED_FORMS.has(form)) {
      if (window.console) console.warn("[FOS CAPI CR] duplicate fire suppressed");
      return;
    }
    FIRED_FORMS.add(form);
    var eventId = uuid4();
    firePixel(eventId);
    postCapi(eventId, form);
  };

})();
