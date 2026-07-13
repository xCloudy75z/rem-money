var Sheet = (function () {
  'use strict';

  var current = null;

  function _installFocusTrap(wrap) {
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = wrap.querySelectorAll('input:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function open(opts) {
    close();
    var root = document.getElementById('modal-root');
    var lastFocus = document.activeElement;

    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    var titleHTML = opts.title
      ? '<h2 class="sheet-title">' + opts.title + '</h2>'
      : '<span></span>';
    wrap.innerHTML =
      '<div class="scrim" data-close></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1">' +
        '<div class="sheet-chrome">' +
          '<div class="sheet-handle"></div>' +
          '<div class="sheet-header">' +
            titleHTML +
            '<button class="sheet-close" data-close aria-label="Close">' +
              '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="sheet-body">' +
          opts.contentHTML +
        '</div>' +
      '</div>';
    root.appendChild(wrap);

    document.body.style.overflow = 'hidden';
    current = { wrap: wrap, onClose: opts.onClose, lastFocus: lastFocus, guard: opts.guard };

    _installFocusTrap(wrap);

    setTimeout(function () {
      var first = wrap.querySelector('input, button, select, [tabindex]:not([tabindex="-1"])');
      (first || wrap.querySelector('.sheet')).focus();
    }, 50);

    function onKey(e) { if (e.key === 'Escape') { if (current && current.guard) { current.guard(); return; } close(); } }
    document.addEventListener('keydown', onKey);
    current.onKey = onKey;

    wrap.addEventListener('click', function (e) {
      // Use closest() so a click on a child of a [data-close] element (e.g. the
      // SVG icon inside the X button) still closes the sheet.
      if (e.target.closest && e.target.closest('[data-close]')) {
        if (current && current.guard) { current.guard(); return; }
        close();
      }
    });

    return wrap;
  }

  function close() {
    if (!current) return;
    var c = current; current = null;
    document.removeEventListener('keydown', c.onKey);
    document.body.style.overflow = '';
    if (c.wrap.parentNode) c.wrap.parentNode.removeChild(c.wrap);
    if (c.lastFocus && c.lastFocus.focus) c.lastFocus.focus();
    if (c.onClose) c.onClose();
    document.dispatchEvent(new CustomEvent('sheet:closed'));
  }

  function isOpen() { return !!current; }

  return { open: open, close: close, isOpen: isOpen };
})();
