function setupReCAPTCHAForm({
  formSelector,
  redirectFields = null,
  redirectUrl = null,
  delay = 0,
  onSuccess = null
}) {

  function attachHandler(form) {
    // Bind once per form. setupReCAPTCHAForm can be called more than once for
    // the same selector (e.g. two custom-code blocks on a page). Without this
    // guard each call adds another submit listener + MutationObserver, so the
    // redirect from one setup races the onSuccess hook of another. First call
    // wins; keep the call that carries onSuccess. Fail-open: if dataset is
    // unavailable the handler still attaches.
    if (form.dataset.fosRecaptchaBound === '1') return;
    form.dataset.fosRecaptchaBound = '1';

    let submitted = false;

    form.addEventListener('submit', () => {
      if (submitted) return;
      submitted = true;

      // ensure HubSpot attribute persists
      const hubspotUrl = form.getAttribute('data-webflow-hubspot-api-form-url');
      if (hubspotUrl) {
        form.setAttribute('data-webflow-hubspot-api-form-url', hubspotUrl);
      }

      // Nothing to observe unless we have a success hook or a redirect.
      if (!onSuccess && (!redirectFields || !redirectUrl)) return;

      const wrapper = form.closest('.w-form');
      if (!wrapper) return;

      const observer = new MutationObserver(() => {
        const done = wrapper.querySelector('.w-form-done');
        const fail = wrapper.querySelector('.w-form-fail');

        if (done && done.offsetParent !== null) {
          observer.disconnect();

          // Success hook fires first (e.g. Meta CompleteRegistration), before
          // any redirect navigates away. A hook error must never block the
          // redirect or the submission flow.
          if (typeof onSuccess === 'function') {
            try {
              onSuccess(form);
            } catch (e) {
              if (window.console) console.warn('setupReCAPTCHAForm: onSuccess threw', e);
            }
          }

          // Redirect is optional; a caller may pass only onSuccess.
          if (!redirectFields || !redirectUrl) return;

          const params = new URLSearchParams();

          redirectFields.forEach(id => {
            const el = form.querySelector(`#${id}`);
            if (!el) {
              console.warn(`setupReCAPTCHAForm: missing field #${id}`);
            }
            params.append(id, el?.value || '');
          });

          const go = () => {
            window.location.href = `${redirectUrl}?${params.toString()}`;
          };

          delay && Number(delay) > 0 ? setTimeout(go, Number(delay)) : go();
        }

        if (fail && fail.offsetParent !== null) {
          observer.disconnect();
          submitted = false; // allow resubmit
        }
      });

      observer.observe(wrapper, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });
  }

  function initForms() {
    document.querySelectorAll(formSelector).forEach(attachHandler);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initForms);
  } else {
    initForms();
  }
}
