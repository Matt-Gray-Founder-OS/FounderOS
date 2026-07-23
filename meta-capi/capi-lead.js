/* ========================================
   Founder OS — Meta CAPI Lead
   Client-side companion for application-routing-v2.js.
   Fires when score >= QUALIFIED_THRESHOLD.
   ======================================== */

(function () {

  // Flip to false when ready to send live. While true, every call includes
  // test_event_code (vaulted as meta_capi_test_event_code) and events land in
  // Events Manager → Test Events, not live ad attribution.
  var IS_TEST = false;

  // Supabase edge function endpoint. Deployed on the Sales project
  // (ldspjkntkuuqlwrdefzh); reads meta_ads_token + founder_os_meta_pixel
  // + meta_capi_test_event_code from the FOS Control vault
  // (yhvssclmrddiowlccvjc) at request time (Pattern B).
  var CAPI_ENDPOINT = "https://ldspjkntkuuqlwrdefzh.supabase.co/functions/v1/meta-capi-lead";

  // Per-form dedup — WeakSet keyed by form element. Prevents double-fire on
  // rapid double-click submits. Resets on page navigation.
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

  function firePixelLead(eventId) {
    try {
      if (typeof window.fbq === "function") {
        window.fbq("track", "Lead", { currency: "USD", value: 0 }, { eventID: eventId });
      }
    } catch (e) {
      // Pixel failure must not break CAPI path. Log, continue.
      if (window.console) console.warn("[FOS CAPI] fbq call failed:", e);
    }
  }

  function postCapi(eventId, form) {
    var payload = {
      event_id: eventId,
      email: readField(form, "email"),
      phone: readField(form, "phone"),
      first_name: readField(form, "first_name"),
      last_name: readField(form, "last_name"),
      event_source_url: window.location.origin + window.location.pathname,
      utm_source: readField(form, "utm_source"),
      utm_medium: readField(form, "utm_medium"),
      utm_campaign: readField(form, "utm_campaign"),
      utm_term: readField(form, "utm_term"),
      utm_content: readField(form, "utm_content"),
      score: Number(readField(form, "application_score")) || undefined,
      is_test: IS_TEST,
    };

    // fire-and-forget: do not block the redirect path. keepalive=true
    // lets the POST survive navigation, so the browser still sends it even
    // if Webflow's redirect fires microseconds later.
    try {
      fetch(CAPI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        mode: "cors",
      }).catch(function (e) {
        if (window.console) console.warn("[FOS CAPI] proxy post failed:", e);
      });
    } catch (e) {
      if (window.console) console.warn("[FOS CAPI] proxy fetch threw:", e);
    }
  }

  /**
   * Public API. Call from the form submit handler in
   * applicationFormControlNew.js on qualified submissions.
   *
   * Generates a single event_id used by both the client Pixel call
   * (fbq with eventID) AND the server CAPI call, so Meta dedupes them.
   *
   * Idempotent per-form: multiple calls for the same form element fire
   * exactly once. Protects against double-click submit + any future
   * rewiring mistake that might call the public API twice.
   */
  window.fireMetaCAPILead = function (form) {
    if (!form) return;
    if (FIRED_FORMS.has(form)) {
      if (window.console) console.warn("[FOS CAPI] duplicate fire suppressed");
      return;
    }
    FIRED_FORMS.add(form);
    var eventId = uuid4();
    firePixelLead(eventId);
    postCapi(eventId, form);
  };

})();
