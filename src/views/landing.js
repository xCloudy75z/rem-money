var LandingView = (function () {
  'use strict';

  function render() {
    return ''
      + '<div class="landing">'
      +   '<div class="landing-inner">'
      +     '<div class="landing-mark">'
      +       '<svg viewBox="0 0 192 192" width="64" height="64" aria-hidden="true">'
      +         '<rect width="192" height="192" rx="36" fill="var(--accent)"/>'
      +         '<text x="96" y="126" font-size="92" font-weight="700" fill="#fff" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif">AED</text>'
      +       '</svg>'
      +     '</div>'
      +     '<h1 class="landing-h1">Spend without guessing.</h1>'
      +     '<p class="landing-sub">Your salary, divided by the days until payday. One number — refreshed every morning — that tells you exactly how much you can spend today and still make it to the 25th.</p>'
      +     '<ul class="landing-bullets">'
      +       '<li><span class="emoji">🎯</span><div><b>One number to check.</b> "AED left today" — the only thing you look at before you pay.</div></li>'
      +       '<li><span class="emoji">📈</span><div><b>Self-correcting.</b> Overspend Monday, tomorrow\'s limit drops. Underspend Tuesday, it goes up. Always finds the path back to payday.</div></li>'
      +       '<li><span class="emoji">🔒</span><div><b>Stays on your device.</b> No accounts, no cloud, no tracking. Your money data never leaves your browser.</div></li>'
      +     '</ul>'
      +     '<button class="btn btn-primary landing-cta" data-action="landing-start">Start tracking &rarr;</button>'
      +     '<p class="landing-foot">Free · Works offline · Install as an app</p>'
      +   '</div>'
      + '</div>';
  }

  return { render: render };
})();
