/* J&M Irrigation Services — site script */
(function () {
  "use strict";

  /* ---------- Seasonal banner + home seasonal feature ---------- */
  var SEASONS = {
    fall:   { text: "Freeze season is coming. Book your sprinkler blowout now. New J&M installs get their first blowout free.", link: "sprinkler-blowouts.html", cta: "Book a Blowout" },
    winter: { text: "Planning a new lawn or sprinkler system for spring? Get on our schedule early.", link: "contact.html", cta: "Get an Estimate" },
    spring: { text: "Spring is here. Book your sprinkler start-up before the rush.", link: "spring-start-up.html", cta: "Book a Start-Up" },
    summer: { text: "Brown spots or high water bills? We'll find the problem.", link: "sprinkler-repair.html", cta: "Schedule a Repair" }
  };
  function seasonFor(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    if (m >= 9 && (m < 11 || (m === 11 && day <= 15))) return "fall";
    if ((m === 11 && day > 15) || m === 12 || m <= 2) return "winter";
    if (m >= 3 && (m < 5 || (m === 5 && day <= 15))) return "spring";
    return "summer";
  }
  var now = new Date();
  var season = seasonFor(now);
  var banner = document.querySelector("[data-banner]");
  if (banner) {
    var s = SEASONS[season];
    banner.querySelector("[data-banner-text]").textContent = s.text;
    var a = banner.querySelector("[data-banner-link]");
    a.textContent = s.cta + " →";
    a.setAttribute("href", s.link);
  }
  // Home feature: spring start-up Mar–Jun, blowouts the rest of the year
  var m = now.getMonth() + 1;
  var feature = (m >= 3 && m <= 6) ? "spring" : "fall";
  document.querySelectorAll("[data-season]").forEach(function (el) {
    el.hidden = el.getAttribute("data-season") !== feature;
  });

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  var scrim;
  function closeNav() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    if (scrim) { scrim.remove(); scrim = null; }
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        scrim = document.createElement("div");
        scrim.className = "nav-scrim";
        scrim.addEventListener("click", closeNav);
        document.body.appendChild(scrim);
      } else { closeNav(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
  }

  /* ---------- Button ripple ---------- */
  document.addEventListener("pointerdown", function (e) {
    var btn = e.target.closest(".btn");
    if (!btn || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var r = btn.getBoundingClientRect(), size = Math.max(r.width, r.height);
    var span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = (e.clientX - r.left - size / 2) + "px";
    span.style.top = (e.clientY - r.top - size / 2) + "px";
    btn.appendChild(span);
    setTimeout(function () { span.remove(); }, 650);
  });

  /* ---------- Estimate modal ---------- */
  var dialog = document.getElementById("estimate-dialog");
  document.querySelectorAll("[data-estimate]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      if (!dialog || typeof dialog.showModal !== "function") return; // falls back to contact page
      e.preventDefault();
      closeNav && nav && nav.classList.contains("open") && closeNav();
      var svc = link.getAttribute("data-estimate");
      var sel = dialog.querySelector("select[name='service']");
      if (svc && sel) { sel.value = svc; sel.dispatchEvent(new Event("change")); }
      dialog.showModal();
    });
  });
  if (dialog) {
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    dialog.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { dialog.close(); }); });
  }

  /* ---------- Forms: repair price note + submit ---------- */
  var LIVE = /jmirrigationco\.com$|netlify\.app$/.test(location.hostname);
  document.querySelectorAll("form.form").forEach(function (form) {
    var sel = form.querySelector("select[name='service']");
    var note = form.querySelector(".price-note");
    function syncNote() {
      if (!note || !sel) return;
      var v = sel.value;
      note.hidden = !(v === "Repair" || v === "New sprinkler system");
      note.textContent = v === "Repair"
        ? "Repair visits start with a $75 diagnostic fee. It's waived if you have us do the repair."
        : "Estimates for new sprinkler systems are free.";
    }
    if (sel) { sel.addEventListener("change", syncNote); syncNote(); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var btn = form.querySelector("button[type='submit']");
      btn.disabled = true; btn.textContent = "Sending…";
      function done(ok, preview) {
        var box = form.parentElement.querySelector(".form-success");
        if (ok) {
          form.hidden = true;
          if (preview) box.querySelector("[data-preview-note]").hidden = false;
          box.hidden = false;
        } else {
          btn.disabled = false; btn.textContent = "Send My Request";
          alertBox(form, "Your request didn't go through. Please try again, or call or text 303-549-0712.");
        }
      }
      if (!LIVE) { done(true, true); return; }
      var body = new URLSearchParams(new FormData(form)).toString();
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
        .then(function (r) { done(r.ok, false); })
        .catch(function () { done(false, false); });
    });
  });
  function alertBox(form, msg) {
    var el = form.querySelector(".form-error");
    if (!el) { el = document.createElement("p"); el.className = "form-error full"; el.setAttribute("role", "alert"); el.style.color = "#9B3B3B"; form.appendChild(el); }
    el.textContent = msg;
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = now.getFullYear(); });
})();
