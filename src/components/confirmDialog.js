var ConfirmDialog = (function () {
  'use strict';

  function open(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var lastFocus = document.activeElement;
      var wrap = document.createElement('div');
      wrap.className = 'dialog-wrap';
      wrap.innerHTML =
        '<div class="scrim"></div>' +
        '<div class="dialog" role="dialog" aria-modal="true">' +
          '<h3>' + Format.escapeHTML(opts.title) + '</h3>' +
          (opts.text ? '<p>' + Format.escapeHTML(opts.text) + '</p>' : '') +
          '<div class="actions">' +
            '<button class="btn btn-ghost" data-action="cancel">' + Format.escapeHTML(opts.cancelLabel || I18n.t('cancel')) + '</button>' +
            '<button class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '" data-action="ok">' + Format.escapeHTML(opts.okLabel || I18n.t('ok')) + '</button>' +
          '</div>' +
        '</div>';
      root.appendChild(wrap);

      // Focus trap
      function trap(e) {
        if (e.key !== 'Tab') return;
        var f = wrap.querySelectorAll('button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      wrap.addEventListener('keydown', trap);

      function done(v) {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        document.removeEventListener('keydown', onKey);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', function (e) {
        if (!(e.target instanceof Element)) return;
        if (e.target.classList.contains('scrim')) return done(false);
        var a = e.target.getAttribute('data-action');
        if (a === 'ok') done(true);
        if (a === 'cancel') done(false);
      });
      setTimeout(function () {
        var ok = wrap.querySelector('[data-action="ok"]');
        if (ok) ok.focus();
      }, 50);
    });
  }

  return { open: open };
})();
