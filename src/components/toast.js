var Toast = (function () {
  'use strict';

  var current = null;

  function show(opts) {
    hide();
    var root = document.getElementById('toast-root');
    if (!root) return;
    var variant = opts.variant || 'default';
    var duration = opts.duration || (opts.action ? 10000 : 3000);

    var el = document.createElement('div');
    el.className = 'toast' + (variant === 'success' ? ' success' : variant === 'error' ? ' error' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="toast-body">' + Format.escapeHTML(opts.message) + '</div>' +
      (opts.action ? '<button class="toast-action">' + Format.escapeHTML(opts.action) + '</button>' : '');
    root.appendChild(el);

    var actionBtn = el.querySelector('.toast-action');
    if (actionBtn && opts.onAction) {
      actionBtn.addEventListener('click', function () { var cb = opts.onAction; hide(); cb(); });
    }

    var timer = setTimeout(hide, duration);
    current = { el: el, timer: timer };
  }

  function hide() {
    if (!current) return;
    clearTimeout(current.timer);
    if (current.el.parentNode) current.el.parentNode.removeChild(current.el);
    current = null;
  }

  return { show: show, hide: hide };
})();
