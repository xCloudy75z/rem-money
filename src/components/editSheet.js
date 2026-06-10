var EditSheet = (function () {
  'use strict';

  function open(state, txn, onAction) {
    var local = { categoryId: txn.categoryId, date: txn.date, isRefund: !!txn.isRefund, isCredit: !!txn.isCredit };
    var cats = Object.values(state.categories)
      .filter(function (c) { return !c.isArchived || c.id === txn.categoryId; })
      .sort(function (a, b) { return a.order - b.order; });

    var html = ''
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('amount_aed') + '</label>'
      +   '<input class="input input-lg" id="ed-amount" inputmode="decimal" value="' + Number(txn.amount).toFixed(2) + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('category') + '</label>'
      +   '<div class="cat-chip-row">'
      +     cats.map(function (c) {
            return '<button class="cat-chip ' + (c.id === local.categoryId ? 'selected' : '') + '" data-cat-id="' + c.id + '">'
              + '<span class="dot" style="background:' + Format.escapeHTML(c.color) + '"></span>'
              + Format.escapeHTML(c.icon || '•') + ' ' + Format.escapeHTML(c.name)
              + '</button>';
          }).join('')
      +   '</div>'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('when') + '</label>'
      +   '<input type="date" class="input" id="ed-date" value="' + Format.escapeHTML(txn.date) + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('note') + '</label>'
      +   '<input class="input" id="ed-note" maxlength="280" value="' + Format.escapeHTML(txn.note || '') + '">'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('refund') + '</span>'
      +   '<button class="switch ' + (local.isRefund ? 'on' : '') + '" id="ed-refund" aria-pressed="' + local.isRefund + '"></button>'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_credit') + '</span>'
      +   '<button class="switch ' + (local.isCredit ? 'on' : '') + '" id="ed-credit" aria-pressed="' + local.isCredit + '"></button>'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-danger" id="ed-delete">' + I18n.t('delete') + '</button>'
      +   '<button class="btn btn-primary" id="ed-save">' + I18n.t('save_changes') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('edit_spend') });
    var amountEl = wrap.querySelector('#ed-amount');

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        wrap.querySelector('#ed-save').click();
      }
    });

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var cat = t.closest && t.closest('[data-cat-id]');
      if (cat) {
        local.categoryId = cat.getAttribute('data-cat-id');
        wrap.querySelectorAll('.cat-chip').forEach(function (el) { el.classList.toggle('selected', el === cat); });
        return;
      }
      if (t.id === 'ed-refund') {
        local.isRefund = !local.isRefund;
        t.classList.toggle('on', local.isRefund);
        t.setAttribute('aria-pressed', String(local.isRefund));
        return;
      }
      if (t.id === 'ed-credit') {
        local.isCredit = !local.isCredit;
        t.classList.toggle('on', local.isCredit);
        t.setAttribute('aria-pressed', String(local.isCredit));
        return;
      }
      if (t.id === 'ed-save') {
        var amt = Format.parseAmount(amountEl.value);
        if (!(amt > 0)) { amountEl.focus(); amountEl.classList.add('error'); return; }
        var date = wrap.querySelector('#ed-date').value || txn.date;
        var note = (wrap.querySelector('#ed-note').value || '').trim();
        onAction('save', { amount: amt, categoryId: local.categoryId, date: date, note: note, isRefund: local.isRefund, isCredit: local.isCredit });
        Sheet.close();
        return;
      }
      if (t.id === 'ed-delete') {
        var cat = state.categories[txn.categoryId] || { name: '?' };
        var notePart = txn.note ? ' "' + txn.note + '"' : '';
        ConfirmDialog.open({
          title: I18n.t('confirm_delete_txn_title'),
          text: I18n.t('confirm_delete_txn_text', { amount: Format.fmtMoney(txn.amount, state.settings.currency), cat: cat.name, notePart: notePart }),
          okLabel: I18n.t('delete'),
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          onAction('delete');
          Sheet.close();
        });
        return;
      }
    });
  }

  return { open: open };
})();
