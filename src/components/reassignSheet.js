var ReassignSheet = (function () {
  'use strict';

  // opts: { others, refCount, onPick, onClose }
  function open(opts) {
    var others = opts.others;
    var refCount = opts.refCount;
    var selected = others[0].id;
    var html = ''
      + '<p style="margin:-4px 0 14px;color:var(--muted)">' + I18n.t('reassign_help', { n: refCount }) + '</p>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('reassign_to') + '</label>'
      +   '<div class="cat-chip-row">'
      +     others.map(function (c) {
            return '<button class="cat-chip ' + (c.id === selected ? 'selected' : '') + '" data-cat-id="' + c.id + '">'
              + '<span class="dot" style="background:' + Format.escapeHTML(c.color) + '"></span>'
              + Format.escapeHTML(c.icon || '•') + ' ' + Format.escapeHTML(c.name)
              + '</button>';
          }).join('')
      +   '</div>'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-ghost" data-close>' + I18n.t('cancel') + '</button>'
      +   '<button class="btn btn-primary" id="rs-confirm">' + I18n.t('ok') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('reassign_title'), onClose: opts.onClose });
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var cat = t.closest && t.closest('[data-cat-id]');
      if (cat) {
        selected = cat.getAttribute('data-cat-id');
        wrap.querySelectorAll('.cat-chip').forEach(function (el) { el.classList.toggle('selected', el === cat); });
        return;
      }
      if (t.id === 'rs-confirm') {
        if (opts.onPick) opts.onPick(selected);
        Sheet.close();
        return;
      }
    });
  }

  return { open: open };
})();
