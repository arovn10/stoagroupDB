/**
 * Mobile detection & bootstrap – runs before other scripts.
 * Sets data-mobile on <html> and window.IS_MOBILE for layout/UX branching.
 * Include this script in <head> before app.css for correct initial render.
 */
(function() {
  'use strict';
  var w = typeof window !== 'undefined' ? window : undefined;
  if (!w || !w.document) return;

  var doc = w.document;
  var html = doc.documentElement;

  function detectMobile() {
    var mq = w.matchMedia && w.matchMedia('(max-width: 768px)');
    var touch = 'ontouchstart' in w || (w.navigator && w.navigator.maxTouchPoints > 0);
    var ua = (w.navigator && w.navigator.userAgent) || '';
    var mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    if (mq && mq.matches) return true;
    if (mobileUA && touch) return true;
    if (w.innerWidth && w.innerWidth <= 768) return true;
    return false;
  }

  var isMobile = detectMobile();
  html.setAttribute('data-mobile', isMobile ? 'true' : 'false');
  w.IS_MOBILE = isMobile;

  function onResize() {
    var now = detectMobile();
    if (now !== isMobile) {
      isMobile = now;
      html.setAttribute('data-mobile', isMobile ? 'true' : 'false');
      w.IS_MOBILE = isMobile;
      if (typeof w.dispatchEvent === 'function') {
        w.dispatchEvent(new CustomEvent('mobilechange', { detail: { isMobile: isMobile } }));
      }
    }
  }

  if (w.matchMedia) {
    w.matchMedia('(max-width: 768px)').addListener(onResize);
  }
  w.addEventListener('resize', onResize);
  w.addEventListener('orientationchange', function() { setTimeout(onResize, 100); });
})();
