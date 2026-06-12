var RecordPaymentSheet = (function () {
  'use strict';

  // opts: { prefillAmount (number|null), todayISO, onSave({amount,date,note}) }
  function open(opts) {
    var prefill = (typeof opts.prefillAmount === 'number' && opts.prefillAmount > 0)
      ? opts.prefillAmount.toFixed(2) : '';

    var html = ''
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('wife_payment_amount') + '</label>'
      +   '<input class="input input-lg" id="rp-amount" inputmode="decimal" placeholder="0.00" value="' + prefill + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('when') + '</label>'
      +   '<input type="date" class="input" id="rp-date" value="' + Format.escapeHTML(opts.todayISO) + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('note') + '</label>'
      +   '<input class="input" id="rp-note" maxlength="280" placeholder="' + Format.escapeHTML(I18n.t('note_placeholder')) + '">'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-primary btn-block" id="rp-save">' + I18n.t('wife_record_payment') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('wife_payment_title') });
    var amountEl = wrap.querySelector('#rp-amount');
    amountEl.focus();

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        wrap.querySelector('#rp-save').click();
      }
    });

    wrap.addEventListener('click', function (e) {
      if (e.target.id !== 'rp-save') return;
      var amt = Format.parseAmount(amountEl.value);
      if (!(amt > 0)) { amountEl.focus(); amountEl.classList.add('error'); return; }
      var date = wrap.querySelector('#rp-date').value || opts.todayISO;
      var note = (wrap.querySelector('#rp-note').value || '').trim();
      opts.onSave({ amount: amt, date: date, note: note });
      Sheet.close();
    });
  }

  return { open: open };
})();
