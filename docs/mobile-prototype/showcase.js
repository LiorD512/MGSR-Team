/* Showcase launcher — drives the phone-frame page (index.html).
   Keeps the app iframe in sync with the jump buttons + platform chips,
   and runs a live status-bar clock. Dependency-free. */
(function () {
  'use strict';

  var frame = document.getElementById('scApp');
  var jump = document.getElementById('scJump');
  var platBtns = document.querySelectorAll('.sc-plat');
  var clock = document.getElementById('scClock');

  function send(msg) {
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
    } catch (e) {
      /* cross-origin / file:// — the app still works via its own hash */
    }
  }

  if (jump) {
    jump.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-screen]');
      if (!btn) return;
      send({ type: 'brit-goto', screen: btn.getAttribute('data-screen') });
      var phone = document.getElementById('scPhone');
      if (phone && phone.scrollIntoView) {
        try { phone.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { phone.scrollIntoView(); }
      }
    });
  }

  platBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      platBtns.forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      send({ type: 'brit-platform', platform: btn.getAttribute('data-platform') });
    });
  });

  // Reflect platform changes initiated inside the app back onto the chips.
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'brit-platform-changed') {
      platBtns.forEach(function (b) {
        b.classList.toggle('is-on', b.getAttribute('data-platform') === d.platform);
      });
    }
  });

  // Live status-bar clock (local time).
  function tick() {
    if (!clock) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    clock.textContent = h + ':' + (m < 10 ? '0' + m : m);
  }
  tick();
  setInterval(tick, 15000);
})();
