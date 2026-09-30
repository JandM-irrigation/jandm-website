/* J&M Irrigation Services — site script
   Reads /content/site.json (edited in the CMS at /admin) and applies it to the page,
   so CMS changes show up right after Netlify publishes them. The HTML ships with the
   same content baked in, so the page is complete even before this runs. */
(function () {
  "use strict";
  var LIVE = /jmirrigationco\.com$|netlify\.app$/.test(location.hostname);
  var content = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tel(p) { var d = String(p).replace(/\D/g, ""); return "tel:+" + (d.length === 10 ? "1" + d : d); }

  /* ---------- Templates (keep in sync with build.py) ---------- */
  var STAR = '<svg viewBox="0 0 20 20" class="h-[18px] w-[18px]" aria-hidden="true"><path fill="currentColor" d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z"/></svg>';
  function serviceCard(s, city, i) {
    var big = i === 0;
    return '<a href="' + esc(s.link || "contact.html") + '" class="card-link group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5' + (big ? ' sm:col-span-2 lg:row-span-2' : '') + '">' +
      '<div class="overflow-hidden ' + (big ? 'aspect-[16/10] lg:aspect-auto lg:flex-1' : 'aspect-[16/10]') + '"><img class="photo h-full w-full" src="' + esc(s.photo) + '" alt="' + esc(s.photo_alt) + '" width="1100" height="1100" loading="lazy" decoding="async"></div>' +
      '<div class="flex flex-col gap-2 p-6"><h3 class="' + (big ? 'text-2xl' : 'text-xl') + ' font-bold">' + esc(s.name) + ' in ' + esc(city) + '</h3>' +
      '<p class="text-base text-muted">' + esc(s.summary) + '</p>' +
      '<span class="mt-1 font-display text-[15px] font-bold text-water">See ' + esc(String(s.name).toLowerCase()) + ' details →</span></div></a>';
  }
  function reviewCard(r) {
    var n = Math.max(0, Math.min(5, +r.rating || 5)), stars = "";
    for (var i = 0; i < 5; i++) stars += '<span class="' + (i < n ? 'text-[#F5B301]' : 'text-line') + '">' + STAR + '</span>';
    return '<article' + (r.sample ? ' data-placeholder="review"' : '') + ' class="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-card ring-1 ring-black/5">' +
      '<div class="flex items-center gap-3"><span class="grid h-10 w-10 place-items-center rounded-full bg-forest font-display text-base font-bold text-white">' + esc(String(r.name || "?").charAt(0)) + '</span>' +
      '<div><p class="font-semibold leading-tight text-ink">' + esc(r.name) + '</p><p class="text-sm text-muted">' + esc(r.location) + (r.when ? ' · ' + esc(r.when) : '') + '</p></div></div>' +
      '<div class="flex gap-0.5" role="img" aria-label="' + n + ' out of 5 stars">' + stars + '</div>' +
      '<p class="text-base text-ink/90">' + esc(r.text) + '</p></article>';
  }

  /* ---------- Seasonal banner ---------- */
  function md(d) { return (d.getMonth() + 1) * 100 + d.getDate(); }
  function parseMD(s) { var p = String(s || "").split("-"); return (+p[0]) * 100 + (+p[1]); }
  function pickBanner(list, now) {
    var t = md(now);
    for (var i = 0; i < (list || []).length; i++) {
      var b = list[i], a = parseMD(b.start), z = parseMD(b.end);
      if (!a || !z) continue;
      if (a <= z ? (t >= a && t <= z) : (t >= a || t <= z)) return b;
    }
    return null;
  }

  function apply(c) {
    var now = new Date();
    // Phone number everywhere
    if (c.phone) {
      document.querySelectorAll("[data-phone-text]").forEach(function (el) { el.textContent = c.phone; });
      document.querySelectorAll("a[data-phone-link]").forEach(function (a) { a.setAttribute("href", tel(c.phone)); });
      document.querySelectorAll("a[data-sms-link]").forEach(function (a) { a.setAttribute("href", tel(c.phone).replace("tel:", "sms:")); });
    }
    if (c.hours) document.querySelectorAll("[data-hours]").forEach(function (el) { el.textContent = c.hours; });
    if (c.availability_badge) document.querySelectorAll("[data-availability]").forEach(function (el) { el.textContent = c.availability_badge; });
    if (c.google_review_url) document.querySelectorAll("a[data-review-link]").forEach(function (a) { a.setAttribute("href", c.google_review_url); });
    // Banner
    var bar = document.querySelector("[data-banner]"), b = pickBanner(c.banners, now);
    if (bar) {
      if (!b) { bar.hidden = true; }
      else {
        bar.hidden = false;
        bar.querySelector("[data-banner-text]").textContent = b.text;
        var link = bar.querySelector("[data-banner-link]");
        link.textContent = (b.button_text || "Learn more") + " →";
        link.setAttribute("href", b.button_link || "contact.html");
      }
    }
    // Services and reviews
    document.querySelectorAll("[data-services]").forEach(function (el) {
      if (!c.services || !c.services.length) return;
      var city = el.getAttribute("data-city") || "Denver";
      el.innerHTML = c.services.map(function (s, i) { return serviceCard(s, city, i); }).join("");
    });
    document.querySelectorAll("[data-reviews]").forEach(function (el) {
      if (!c.reviews || !c.reviews.length) return;
      el.innerHTML = c.reviews.map(reviewCard).join("");
      var chip = document.querySelector("[data-sample-chip]");
      if (chip) chip.hidden = !c.reviews.some(function (r) { return r.sample; });
    });
  }

  fetch("content/site.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { if (c) { content = c; apply(c); } })
    .catch(function () {});

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector("[data-menu-toggle]"), menu = document.getElementById("mobile-menu");
  function closeMenu() { if (!menu) return; menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  }

  /* ---------- Quote dialog ---------- */
  var dlg = document.getElementById("quote-dialog");
  document.querySelectorAll("[data-quote]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (!dlg || typeof dlg.showModal !== "function") return; // falls back to the link
      e.preventDefault(); closeMenu();
      var svc = a.getAttribute("data-quote"), sel = dlg.querySelector("select[name='service_needed']");
      if (svc && sel) { sel.value = svc; sel.dispatchEvent(new Event("change")); }
      dlg.showModal();
    });
  });
  if (dlg) {
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  }

  /* ---------- Forms ---------- */
  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    var sel = form.querySelector("select[name='service_needed']"), note = form.querySelector("[data-price-note]");
    function sync() {
      if (!sel || !note) return;
      var v = sel.value;
      note.hidden = !(v === "Sprinkler repair" || v === "New sprinkler system");
      note.textContent = v === "Sprinkler repair"
        ? "Repair visits start with a $75 diagnostic. It's waived if you have us do the repair."
        : "Estimates for new sprinkler systems are free.";
    }
    if (sel) { sel.addEventListener("change", sync); sync(); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var btn = form.querySelector("button[type='submit']"), label = btn.textContent;
      var err = form.querySelector("[data-form-error]");
      btn.disabled = true; btn.textContent = "Sending…"; if (err) err.hidden = true;
      var data = new FormData(form), body = new URLSearchParams(data).toString();
      function done(ok, preview) {
        var box = form.parentElement.querySelector("[data-form-success]");
        if (ok) {
          form.hidden = true; box.hidden = false;
          if (preview) box.querySelector("[data-preview-note]").hidden = false;
        } else {
          btn.disabled = false; btn.textContent = label;
          if (err) err.hidden = false;
        }
      }
      if (!LIVE) { done(true, true); return; }
      // Optional: copy the lead to GoHighLevel once a webhook URL is set in the CMS
      var hook = content && content.ghl_webhook_url;
      if (hook) {
        var payload = new URLSearchParams(data); payload.delete("form-name"); payload.delete("company");
        payload.append("source", location.href);
        fetch(hook, { method: "POST", mode: "no-cors", body: payload }).catch(function () {});
      }
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
        .then(function (r) { done(r.ok, false); })
        .catch(function () { done(false, false); });
    });
  });

  /* ---------- Before/after sliders ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-compare]").forEach(function (el) {
    var input = el.querySelector("input[type=range]"), touched = false;
    function set(v) { el.style.setProperty("--pos", v + "%"); }
    input.addEventListener("input", function () { touched = true; set(input.value); });
    if (reduce || !("IntersectionObserver" in window)) return;
    // One gentle sweep the first time it scrolls into view, so visitors see it moves
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var start = null, keys = [50, 22, 78, 50], dur = 2200;
      function step(t) {
        if (touched) return;
        if (start === null) start = t;
        var p = Math.min(1, (t - start) / dur), seg = Math.min(2, Math.floor(p * 3)), lp = p * 3 - seg;
        var ease = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2;
        var v = keys[seg] + (keys[seg + 1] - keys[seg]) * ease;
        set(v); input.value = Math.round(v);
        if (p < 1) requestAnimationFrame(step);
      }
      setTimeout(function () { requestAnimationFrame(step); }, 250 + Array.prototype.indexOf.call(document.querySelectorAll("[data-compare]"), el) * 180);
    }, { threshold: 0.5 });
    io.observe(el);
  });

  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
