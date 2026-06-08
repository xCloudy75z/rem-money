var EditValueSheet = (function () {
  'use strict';

  // opts: { title, label, value, type: 'number'|'text', inputmode, hint, onSave, validate }
  function open(opts) {
    var html = ''
      + (opts.hint ? '<p style="margin:-4px 0 14px;color:var(--muted)">' + Format.escapeHTML(opts.hint) + '</p>' : '')
      + '<div class="sheet-section">'
      +   '<label>' + Format.escapeHTML(opts.label) + '</label>'
      +   '<input class="input ' + (opts.large ? 'input-lg' : '') + '" id="evs-input" '
      +     'type="' + (opts.type || 'text') + '" '
      +     (opts.inputmode ? 'inputmode="' + opts.inputmode + '" ' : '')
      +     'value="' + Format.escapeHTML(String(opts.value == null ? '' : opts.value)) + '">'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-ghost" data-close>' + I18n.t('cancel') + '</button>'
      +   '<button class="btn btn-primary" id="evs-save">' + I18n.t('save') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: opts.title, onClose: opts.onClose });
    var input = wrap.querySelector('#evs-input');
    setTimeout(function () { input.focus(); input.select && input.select(); }, 60);

    function doSave() {
      var raw = input.value;
      var v = opts.type === 'number' ? Format.parseAmount(raw) : String(raw).trim();
      var err = opts.validate ? opts.validate(v) : null;
      if (err) { input.classList.add('error'); Toast.show({ message: err, variant: 'error' }); return; }
      if (opts.onSave) opts.onSave(v);   // update state BEFORE close so onClose reopen sees fresh state
      Sheet.close();
    }

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target === input) { e.preventDefault(); doSave(); }
    });
    wrap.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'evs-save') doSave();
    });
  }

  return { open: open };
})();
