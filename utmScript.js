/* ========================================
   Founder OS - UTM, Click ID & Event Persistence
   Captures UTMs, fbclid, event params
   on landing, persists in 30-day cookies,
   populates hidden form fields on every page load.
   ======================================== */

(function () {

  var UTM_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content"
  ];

  var HSA_PARAMS = [
    "hsa_acc",
    "hsa_cam",
    "hsa_grp",
    "hsa_ad",
    "hsa_src",
    "hsa_net"
  ];

  var CLICK_IDS = [
    "fbclid"
  ];

  /* ---- Calendly / Event Params ---- */

  var EVENT_PARAMS = [
    "assigned_to",
    "event_type_uuid",
    "event_type_name",
    "event_start_time",
    "event_end_time",
    "invitee_uuid",
    "invitee_first_name",
    "invitee_last_name",
    "invitee_full_name",
    "invitee_email",
    "text_reminder_number",
    "answer_1"
  ];

  var ALL_PARAMS = UTM_PARAMS
    .concat(HSA_PARAMS)
    .concat(CLICK_IDS)
    .concat(EVENT_PARAMS);

  var COOKIE_DAYS = 30;

  /* ---- Read URL param (anti-fragile, handles hash/encoding edge cases) ---- */

  function getParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(name) || null;
    } catch (e) {
      return null;
    }
  }

  /* ---- Cookie helpers ---- */

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 86400000).toUTCString();

    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; expires=" +
      expires +
      "; SameSite=Lax";
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name + "=([^;]*)")
    );

    return match ? decodeURIComponent(match[1]) : null;
  }

  /* ---- sessionStorage helpers (backup layer) ---- */

  function setSession(name, value) {
    try {
      sessionStorage.setItem(name, value);
    } catch (e) {}
  }

  function getSession(name) {
    try {
      return sessionStorage.getItem(name);
    } catch (e) {
      return null;
    }
  }

  /* ---- Save params from URL to cookie + sessionStorage ---- */

  function saveParams() {
    ALL_PARAMS.forEach(function (key) {
      var value = getParam(key);

      if (value) {
        setCookie(key, value, COOKIE_DAYS);
        setSession(key, value);
      }
    });
  }

  /* ---- Get stored value: URL param > cookie > sessionStorage ---- */

  function getStored(name) {
    return getParam(name) || getCookie(name) || getSession(name);
  }

  /* ---- Populate all matching hidden form fields ---- */

  function populateFields() {
    ALL_PARAMS.forEach(function (key) {
      var value = getStored(key);

      if (value) {
        var fields = document.querySelectorAll(
          'input[name="' + key + '"]'
        );

        for (var i = 0; i < fields.length; i++) {
          fields[i].value = value;
        }
      }
    });
  }

  /* ---- Init on DOM ready ---- */

  document.addEventListener("DOMContentLoaded", function () {
    saveParams();
    populateFields();
  });

})();