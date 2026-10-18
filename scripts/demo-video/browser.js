/*
 * Runs in every recorded page before the app does (plain JS on purpose: the TypeScript runner adds
 * helpers to functions that don't exist in the browser). window.__DEMO = { offset, phone } is set first.
 *  - the demo clock (see clock.cjs), so "today" matches the server;
 *  - a visible pointer, and a ripple wherever it presses;
 *  - demo-server notices ("Test mode: ...") hidden, as the live site never shows them;
 *  - the demo server's address shown as the product's own.
 */
(function () {
  var demo = window.__DEMO || { offset: 0, phone: false };

  if (demo.offset) {
    var RealDate = Date;
    var now = function () {
      return RealDate.now() + demo.offset;
    };
    window.Date = new Proxy(RealDate, {
      construct: function (target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [now()], newTarget);
      },
      apply: function () {
        return new RealDate(now()).toString();
      },
      get: function (target, prop, receiver) {
        return prop === "now" ? now : Reflect.get(target, prop, receiver);
      },
    });
  }

  var KEY = "__demo_pointer";
  function mount() {
    if (document.getElementById(KEY)) return;
    var saved = { x: -100, y: -100 };
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY) || '{"x":-100,"y":-100}');
    } catch {
      // storage blocked: start off-screen
    }
    var cursor = document.createElement("div");
    cursor.id = KEY;
    Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", display: demo.phone ? "none" : "block", transform: "translate(" + (saved.x - 3) + "px," + (saved.y - 2) + "px)" });
    cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2.5 18.5 12l-6.4 1.4 3.8 7.2-2.7 1.4-3.8-7.3L4 19z" fill="#1d1b19" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    addEventListener("mousemove", function (e) {
      cursor.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)";
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ x: e.clientX, y: e.clientY }));
      } catch {
        // storage blocked
      }
    }, true);
    addEventListener("mousedown", function (e) {
      var size = demo.phone ? 56 : 40;
      var ring = document.createElement("div");
      Object.assign(ring.style, { position: "fixed", left: e.clientX - size / 2 + "px", top: e.clientY - size / 2 + "px", width: size + "px", height: size + "px", borderRadius: "50%", border: "3px solid #fe6007", background: "rgba(254,96,7,0.18)", zIndex: "2147483646", pointerEvents: "none" });
      document.documentElement.appendChild(ring);
      ring.animate([{ transform: "scale(0.4)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 550, easing: "ease-out" }).onfinish = function () {
        ring.remove();
      };
    }, true);
  }

  function hideNotices() {
    var els = document.querySelectorAll("[role=status], [role=alert], div, p");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var text = (el.textContent || "").trim();
      if (text.indexOf("Test mode") !== 0) continue;
      // Start from the innermost element holding the notice: a section that merely begins with it
      // (the notice plus a pay form) has a child that starts with it too, so skip that section.
      var inner = false;
      for (var c = 0; c < el.children.length; c++) {
        if ((el.children[c].textContent || "").trim().indexOf("Test mode") === 0) inner = true;
      }
      if (inner) continue;
      // Then hide the outermost box that is only the notice.
      var box = el;
      while (box.parentElement && (box.parentElement.textContent || "").trim() === text) box = box.parentElement;
      box.style.display = "none";
    }
  }

  // Addresses on screen (invite links, the result-checker link) show the product's own address,
  // not the demo server's. Links keep working: only what's displayed changes.
  var SHOWN = "https://schoolhub.adalintech.com";
  function rewriteHost() {
    var origin = location.origin;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf(origin) !== -1) node.nodeValue = node.nodeValue.split(origin).join(SHOWN);
    }
    var fields = document.querySelectorAll("input, textarea");
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].value && fields[i].value.indexOf(origin) !== -1) fields[i].value = fields[i].value.split(origin).join(SHOWN);
    }
  }

  var busy = false;
  function tidy() {
    if (busy) return;
    busy = true;
    try {
      hideNotices();
      rewriteHost();
    } finally {
      busy = false;
    }
  }

  function start() {
    mount();
    tidy();
    new MutationObserver(tidy).observe(document.body, { childList: true, subtree: true, characterData: true });
    // Input values change without DOM mutations.
    setInterval(rewriteHost, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
