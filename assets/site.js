/* Crohn's Veteran — shared site behavior */
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var STORE_URL = "https://crohnsveteranstore.printful.me/";
  var EMAIL_LINK = '<a href="mailto:jordan@crohnsveteran.com">jordan@crohnsveteran.com</a>';

  /* --- Header: solid background after scroll --- */
  var header = $(".site-header");
  function onScroll() { if (header) header.classList.toggle("solid", (window.scrollY || 0) > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- Mobile menu --- */
  var toggle = $(".menu-toggle"), nav = $("#site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* --- Current page in nav --- */
  var page = document.body.getAttribute("data-page");
  if (page) $$('[data-nav="' + page + '"]').forEach(function (a) { a.setAttribute("aria-current", "page"); });

  /* --- Year --- */
  var yr = $("#year");
  if (yr) yr.textContent = new Date().getFullYear();

  /* --- GA4: store checkout clicks (kept from the original site) --- */
  function track(name, params) { if (typeof gtag === "function") gtag("event", name, params); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[href*='crohnsveteranstore.printful.me']") : null;
    if (!a) return;
    track("begin_checkout", { event_category: "ecommerce", event_label: a.getAttribute("data-product") || "store", destination: a.href });
  });

  /* --- Cookie consent (same cookie + Consent Mode v2 update as before) --- */
  var banner = $("#cookie-consent-banner");
  function resolveCookieConsent(status) {
    if (typeof gtag === "function") {
      gtag("consent", "update", {
        analytics_storage: status, ad_storage: status, ad_user_data: status, ad_personalization: status
      });
    }
    document.cookie = "cookie_consent=" + status + "; max-age=" + (365 * 24 * 60 * 60) + "; path=/; SameSite=Lax; Secure";
    if (banner) banner.hidden = true;
  }
  if (banner) {
    if (!/(^|;)\s*cookie_consent=/.test(document.cookie)) banner.hidden = false;
    $$("[data-consent]", banner).forEach(function (b) {
      b.addEventListener("click", function () { resolveCookieConsent(b.getAttribute("data-consent")); });
    });
  }

  /* --- Store: cards from products.json --- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https:\/\//i.test(u || "") ? u : STORE_URL; }

  function card(p) {
    var thumb = /^https:\/\//i.test(p.thumbnail || "") ? p.thumbnail : "assets/images/logo.png";
    var url = safeUrl(p.url);
    return '<li class="product">' +
      '<div class="product-img"><img src="' + esc(thumb) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" width="360" height="360"></div>' +
      '<p class="product-cat">' + esc(p.category || "Merch") + '</p>' +
      '<h3>' + esc(p.name) + '</h3>' +
      (p.blurb ? '<p class="blurb">' + esc(p.blurb) + '</p>' : '') +
      '<div class="product-foot">' +
        '<p class="price">' + (p.price ? '<small>Price</small>' + esc(p.price.replace(/^From /, "from ")) : '') + '</p>' +
        '<a class="btn btn-ink" data-product="' + esc(p.id) + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Choose size &amp; buy' +
          '<span class="sr-only"> ' + esc(p.name) + ' (opens checkout on Printful, in a new tab)</span></a>' +
      '</div>' +
    '</li>';
  }

  function renderInto(container, list) {
    container.innerHTML = list.map(card).join("");
    container.setAttribute("aria-busy", "false");
    $$("img", container).forEach(function (img) {
      img.addEventListener("error", function () {
        if (img.getAttribute("data-fallback") !== "1") { img.setAttribute("data-fallback", "1"); img.src = "assets/images/logo.png"; }
      });
    });
  }

  function showFallback(container) {
    container.setAttribute("aria-busy", "false");
    container.innerHTML = '<li class="store-note" style="grid-column:1/-1;display:block"><p>The catalog is loading slowly. <a class="text-link" href="' + STORE_URL + '" target="_blank" rel="noopener noreferrer">Browse the full store on Printful</a>.</p></li>';
  }

  var productGrids = $$("[data-products]");
  if (productGrids.length && window.fetch) {
    fetch("products.json", { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) throw new Error("empty catalog");
        productGrids.forEach(function (grid) {
          var mode = grid.getAttribute("data-products");
          var items = list;
          if (mode && mode !== "all") {
            var ids = mode.split(",");
            items = ids.map(function (id) { return list.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
          }
          renderInto(grid, items);
        });
      })
      .catch(function (err) {
        console.warn("Store catalog unavailable:", err);
        productGrids.forEach(showFallback);
      });
  }

  /* --- Contact form: Web3Forms, with a visible fallback until the access key is set --- */
  var form = $("#contact-form"), statusEl = $("#form-status");
  if (form) {
    var inquiry = new URLSearchParams(window.location.search).get("inquiry");
    var select = $("#form-inquiry");
    if (inquiry && select) {
      $$("option", select).forEach(function (o) { if (o.value === inquiry) select.value = inquiry; });
    }
    function setStatus(state, html) { statusEl.dataset.state = state; statusEl.innerHTML = html; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var key = form.querySelector('[name="access_key"]');
      if (!key || !key.value || key.value.indexOf("YOUR_") === 0) {
        setStatus("warn", "This form isn't connected yet. Please email " + EMAIL_LINK + " instead.");
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      btn.disabled = true; btn.textContent = "Sending…";
      setStatus("", "");
      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.body || !res.body.success) throw new Error("Send failed");
          track("generate_lead", { event_category: "engagement", event_label: data.inquiry_type || "General" });
          setStatus("ok", "Thanks! Your message is on its way. Jordan follows up within 24–48 hours.");
          form.reset();
        })
        .catch(function () {
          setStatus("warn", "Your message didn't send. Please try again, or email " + EMAIL_LINK + ".");
        })
        .then(function () { btn.disabled = false; btn.textContent = "Send message"; });
    });
  }
})();
