/* J&M Irrigation Services — site script.
   The HTML is complete without this file. It adds: the phone menu, CMS updates from
   /content/site.json (phone, hours, seasonal banner, reviews), quote-form validation and
   sending, and privacy-safe analytics events. Keep the review excerpt and banner logic in step
   with tools/build.mjs. */
(function () {
  "use strict";

  /* Only the real production host sends leads or analytics. Preview hosts, Netlify deploy
     previews and local copies never trigger live delivery. */
  var PRODUCTION_HOSTS = ["jmirrigationco.com"];
  var LIVE = PRODUCTION_HOSTS.indexOf(location.hostname) !== -1;
  var PAGE_TYPE = document.body.getAttribute("data-page-type") || "other";
  var content = null;

  /* ---------- analytics (non-personal parameters only; fails silently) ---------- */
  function track(name, params) {
    if (!LIVE) return;
    try { if (typeof window.gtag === "function") window.gtag("event", name, params); } catch (e) { /* analytics unavailable */ }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="sms:"]');
    if (!a) return;
    track("contact_click", {
      contact_method: a.getAttribute("href").indexOf("sms:") === 0 ? "sms" : "phone",
      page_type: PAGE_TYPE,
      placement: a.getAttribute("data-placement") || "body"
    });
  });

  /* ---------- CMS content ---------- */
  function tel(p) { var d = String(p).replace(/\D/g, ""); return "tel:+" + (d.length === 10 ? "1" + d : d); }
  function md(d) { return (d.getMonth() + 1) * 100 + d.getDate(); }
  function parseMD(s) { var p = String(s || "").split("-"); return (+p[0]) * 100 + (+p[1]); }
  function currentBanner(list, now) {
    var t = md(now);
    for (var i = 0; i < (list || []).length; i++) {
      var b = list[i], a = parseMD(b.start), z = parseMD(b.end);
      if (!a || !z || !b.text) continue;
      if (a <= z ? (t >= a && t <= z) : (t >= a || t <= z)) return b;
    }
    return null;
  }
  function excerpt(text, max) {
    var t = String(text || "").trim(); max = max || 300;
    if (t.length <= max) return t;
    var cut = t.slice(0, max), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
    return (end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))) + " …";
  }
  function reviewHtml(r) {
    var esc = function (s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
    return '<figure class="quote-col"><blockquote><p>' + esc(excerpt(r.text)) + "</p></blockquote><figcaption>" +
      esc(r.name) + (r.when ? ", " + esc(r.when) : "") + " · Google review</figcaption></figure>";
  }

  function apply(c) {
    if (c.phone) {
      document.querySelectorAll("[data-phone-text]").forEach(function (el) { el.textContent = c.phone; });
      document.querySelectorAll("a[data-phone-link]").forEach(function (a) { a.setAttribute("href", tel(c.phone)); });
      document.querySelectorAll("a[data-sms-link]").forEach(function (a) { a.setAttribute("href", tel(c.phone).replace("tel:", "sms:")); });
    }
    if (c.hours) document.querySelectorAll("[data-hours]").forEach(function (el) { el.textContent = c.hours; });
    if (/^https:\/\//.test(c.google_review_url || "")) document.querySelectorAll("a[data-review-link]").forEach(function (a) { a.setAttribute("href", c.google_review_url); });

    var bar = document.querySelector("[data-banner]"), b = currentBanner(c.banners, new Date());
    if (bar && b) {
      bar.querySelector("[data-banner-text]").textContent = b.text;
      var link = bar.querySelector("[data-banner-link]");
      link.textContent = b.button_text || "Learn more";
      link.setAttribute("href", b.button_link ? "/" + String(b.button_link).replace(/^\//, "") : "/contact.html#quote");
      bar.hidden = false;
    }

    var reviews = (c.reviews || []).filter(function (r) { return !r.sample && r.text; }).slice(0, 2);
    if (reviews.length) document.querySelectorAll("[data-reviews]").forEach(function (el) { el.innerHTML = reviews.map(reviewHtml).join(""); });
  }

  fetch("/content/site.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { if (c) { content = c; apply(c); } })
    .catch(function () {});

  /* ---------- phone menu (disclosure) ---------- */
  var toggle = document.querySelector("[data-menu-toggle]"), menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    toggle.hidden = false;
    menu.hidden = true;
    var setOpen = function (open) { menu.hidden = !open; toggle.setAttribute("aria-expanded", open ? "true" : "false"); };
    toggle.addEventListener("click", function () { setOpen(menu.hidden); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); }
    });
  }

  /* ---------- quote forms ---------- */
  var MESSAGES = {
    full_name: "Enter your name.",
    phone: "Enter a phone number with at least 10 digits.",
    service_needed: "Choose the service you need, or Not sure.",
    email: "Enter a valid email address, or leave it empty."
  };

  function validate(form) {
    var invalid = [];
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (!el.id || el.type === "hidden" || el.closest(".hp")) return;
      var v = String(el.value || "").trim(), bad = false;
      if (el.required && !v) bad = true;
      if (!bad && el.name === "phone" && v.replace(/\D/g, "").length < 10) bad = true;
      if (!bad && el.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) bad = true;
      var msg = document.getElementById(el.id + "-error");
      if (bad) {
        el.setAttribute("aria-invalid", "true");
        if (msg) { msg.textContent = MESSAGES[el.name] || "Check this field."; msg.hidden = false; }
        invalid.push(el);
      } else {
        el.removeAttribute("aria-invalid");
        if (msg) { msg.textContent = ""; msg.hidden = true; }
      }
    });
    return invalid;
  }

  function serviceSlug(form) {
    var sel = form.querySelector("select[name='service_needed']");
    var opt = sel && sel.options[sel.selectedIndex];
    return (opt && opt.getAttribute("data-slug")) || "unknown";
  }

  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    form.noValidate = true; // JS shows its own inline errors; without JS the browser validates
    var wrap = form.closest("[data-lead]");
    var success = wrap.querySelector("[data-form-success]");
    var errorBox = form.querySelector("[data-form-error]");
    var btn = form.querySelector("button[type='submit']");
    var label = btn.textContent;
    var formId = form.getAttribute("data-form-id") || form.getAttribute("name");
    var started = false, sending = false;

    var sel = form.querySelector("select[name='service_needed']"), note = form.querySelector("[data-price-note]");
    function syncNote() {
      if (!sel || !note) return;
      var slug = serviceSlug(form);
      note.hidden = !(slug === "repair" || slug === "installation");
      // The wording lives on the element, which the build renders only once the facts are confirmed.
      note.textContent = note.getAttribute(slug === "repair" ? "data-note-repair" : "data-note-installation") || "";
    }
    if (sel) { sel.addEventListener("change", syncNote); syncNote(); }

    function start() {
      if (started) return;
      started = true;
      track("quote_start", { form_id: formId, page_type: PAGE_TYPE });
    }
    form.addEventListener("focusin", start);
    form.addEventListener("input", function (e) {
      if (e.target.getAttribute("aria-invalid") === "true") validate(form);
    });

    function finish(state) {
      sending = false;
      if (state === "sent" || state === "preview") {
        form.hidden = true;
        success.hidden = false;
        var title = success.querySelector(".lead__success-title"), preview = success.querySelector("[data-preview-note]");
        title.hidden = state === "preview";
        preview.hidden = state !== "preview";
        success.focus();
      } else {
        btn.disabled = false;
        btn.textContent = label;
        errorBox.hidden = false;
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      errorBox.hidden = true;
      var invalid = validate(form);
      if (invalid.length) { invalid[0].focus(); return; }

      sending = true;
      btn.disabled = true;
      btn.textContent = "Sending…";

      if (!LIVE) { finish("preview"); return; } // previews and local copies never send

      var data = new FormData(form);
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() })
        .then(function (r) {
          if (!r.ok) { finish("failed"); return; }
          finish("sent");
          track("generate_lead", { form_id: formId, service: serviceSlug(form), page_type: PAGE_TYPE });
          // Optional copy to GoHighLevel once a webhook URL is set in the CMS. Sent once, after the
          // site accepted the request; no-cors means its receipt cannot be confirmed from here.
          var hook = content && content.ghl_webhook_url;
          if (/^https:\/\//.test(hook || "")) {
            var payload = new URLSearchParams(data);
            payload.delete("form-name"); payload.delete("company");
            payload.append("source", location.pathname);
            fetch(hook, { method: "POST", mode: "no-cors", body: payload }).catch(function () {});
          }
        })
        .catch(function () { finish("failed"); });
    });
  });

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- scroll-entry reveals (CSS hides only under .js without reduced motion) ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (!reduce && "IntersectionObserver" in window) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); revealer.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { revealer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- before/after comparisons ----------
     The range input (visually hidden) gives keyboard control; pointer events give mouse and touch
     dragging anywhere on the photo. touch-action: pan-y keeps vertical page scrolling on phones. */
  document.querySelectorAll("[data-compare]").forEach(function (el, index) {
    var input = el.querySelector("input[type=range]"), touched = false, dragging = false;
    function set(v) {
      v = Math.max(0, Math.min(100, Math.round(v)));
      el.style.setProperty("--pos", v + "%");
      input.value = v;
      input.setAttribute("aria-valuetext", v + "% before, " + (100 - v) + "% after");
    }
    function fromPointer(e) { var r = el.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); }
    input.addEventListener("input", function () { touched = true; set(input.value); });
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      touched = dragging = true;
      el.classList.add("is-dragging");
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      if (e.pointerType !== "touch") fromPointer(e); // on touch, follow the horizontal drag only
      input.focus({ preventScroll: true });
    });
    el.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    function stop() { dragging = false; el.classList.remove("is-dragging"); }
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);

    if (reduce || !("IntersectionObserver" in window)) return;
    // One gentle sweep the first time it scrolls into view, so visitors see that it moves.
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var start = null, keys = [50, 28, 72, 50], dur = 2000;
      function step(t) {
        if (touched) return;
        if (start === null) start = t;
        var p = Math.min(1, (t - start) / dur), seg = p * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(seg)), f = seg - i;
        var ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        set(keys[i] + (keys[i + 1] - keys[i]) * ease);
        if (p < 1) requestAnimationFrame(step);
      }
      setTimeout(function () { requestAnimationFrame(step); }, 300 + index * 160);
    }, { threshold: 0.5 });
    io.observe(el);
  });

  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
