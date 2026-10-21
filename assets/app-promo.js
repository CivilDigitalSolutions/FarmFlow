/*
 * "Get the Android app" corner popup (owner, 2026-10-21). The website never opens the app by itself;
 * instead Android and desktop visitors get this small, dismissible card with the official Google Play
 * badge. Hidden on iPhone / iPad (no Android app for them — the website is their app), inside the
 * installed web app, and for 30 days after it's closed.
 */
(function () {
  var KEY = 'ff-app-promo-dismissed';
  var SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.civildigital.farmflow';

  var ua = navigator.userAgent || '';
  var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var installed = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (iOS || installed || navigator.standalone) return;
  try {
    var at = Number(localStorage.getItem(KEY));
    if (at && Date.now() - at < SNOOZE_MS) return;
  } catch (e) { /* storage blocked: show it, it can still be closed for this page */ }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function show() {
    var close = el('button', { type: 'button', class: 'app-promo-close', 'aria-label': 'Close' }, ['×']);
    var badge = el('a', { href: PLAY_URL, class: 'app-promo-badge', rel: 'noopener' }, [
      el('picture', {}, [
        el('source', { type: 'image/webp', srcset: '/images/google-play-badge-162.webp 1x, /images/google-play-badge-324.webp 2x' }),
        el('img', { src: '/images/google-play-badge-162.png', srcset: '/images/google-play-badge-324.png 2x', width: '162', height: '63', alt: 'Get it on Google Play' }),
      ]),
    ]);
    var card = el('aside', { class: 'app-promo', 'aria-label': 'Get the FarmFlow Android app' }, [
      close,
      el('img', { class: 'app-promo-icon', src: '/images/apple-touch-icon.png', width: '44', height: '44', alt: '' }),
      el('div', { class: 'app-promo-text' }, [
        el('strong', {}, ['Get the FarmFlow app']),
        el('span', {}, ['Buy and sell on Android — free.']),
        badge,
      ]),
    ]);
    close.addEventListener('click', function () {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
      card.classList.remove('is-open');
      setTimeout(function () { card.remove(); }, 250);
    });
    document.body.appendChild(card);
    requestAnimationFrame(function () { card.classList.add('is-open'); });
  }

  if (document.readyState === 'complete') setTimeout(show, 2500);
  else window.addEventListener('load', function () { setTimeout(show, 2500); });
})();
