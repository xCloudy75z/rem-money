var CategoryTxnsSheet = (function () {
  'use strict';

  function _row(t) {
    var when = Format.fmtDateShort(t.date);
    var title = t.note ? Format.escapeHTML(t.note) : when;
    var sub = t.note ? when : '';
    var tags = '';
    if (t.isCredit) tags += ' <span class="ct-pill">' + I18n.t(t.liabilitySettled ? 'credit_paid_tag' : 'credit_tag') + '</span>';
    if (t.byWife) tags += ' <span class="ct-pill">' + I18n.t('wife_tag') + '</span>';
    var amount = (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2);
    return '<li class="ct-row" data-txn-id="' + t.id + '" tabindex="0" role="button">'
      +   '<div class="ct-main">'
      +     '<div class="ct-tt">' + title + tags + '</div>'
      +     (sub ? '<div class="ct-ts">' + sub + '</div>' : '')
      +   '</div>'
      +   '<div class="ct-amt ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      + '</li>';
  }

  // opts: { state, categoryId, cycleId, cycle, currency, onEditCategory(), onEditTxn(id) }
  function open(opts) {
    var state = opts.state;
    var cyc = opts.cycle;
    var currency = opts.currency;
    var cat = state.categories[opts.categoryId] || { name: '—', icon: '•', color: '#999' };
    var data = Calc.categoryTransactions(state, opts.categoryId, opts.cycleId);
    var mb = Calc.monthlyBudget(cat);
    var range = Format.fmtDateShort(cyc.startDate) + ' → ' + Format.fmtDateShort(cyc.endDate);
    var budgetVal = mb > 0 ? Format.fmtMoney(mb, currency) : I18n.t('plan_not_set');

    var listHTML = data.count
      ? '<div class="ct-txhdr">' + I18n.t('cat_txns_count', { n: data.count }) + '</div>'
        + '<ul class="ct-list">' + data.txns.map(_row).join('') + '</ul>'
      : '<div class="empty-state" style="margin-top:12px"><div class="e-title">' + I18n.t('cat_no_txns') + '</div></div>';

    var html = ''
      + '<div class="ct-meta">' + I18n.t('cat_this_cycle') + ' · ' + Format.escapeHTML(range) + '</div>'
      + '<div class="ct-stat">'
      +   '<div class="ct-box"><div class="ct-lbl">' + I18n.t('cat_spent') + '</div><div class="ct-val">' + Format.fmtMoney(data.total, currency) + '</div></div>'
      +   '<div class="ct-box"><div class="ct-lbl">' + I18n.t('cat_budget') + '</div><div class="ct-val' + (mb > 0 ? '' : ' muted') + '">' + budgetVal + '</div></div>'
      + '</div>'
      + '<button class="btn btn-ghost btn-block" id="ct-edit" style="margin-bottom:6px">' + I18n.t('cat_edit_btn') + '</button>'
      + listHTML;

    var title = '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">'
      + Format.escapeHTML(cat.icon || '•') + '</span> ' + Format.escapeHTML(cat.name);

    var wrap = Sheet.open({ contentHTML: html, title: title });

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('#ct-edit')) { opts.onEditCategory(); return; }
      var row = e.target.closest('[data-txn-id]');
      if (row) { opts.onEditTxn(row.getAttribute('data-txn-id')); }
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest && e.target.closest('[data-txn-id]');
      if (row) { e.preventDefault(); opts.onEditTxn(row.getAttribute('data-txn-id')); }
    });
  }

  return { open: open };
})();
