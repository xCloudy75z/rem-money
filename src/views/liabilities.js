var LiabilitiesView = (function () {
  'use strict';

  function _row(t, state, opts) {
    var cat = state.categories[t.categoryId] || { name: '—', icon: '•', color: '#999' };
    var currency = state.settings.currency;
    var when = Format.fmtDateShort(t.date);
    var sub = when + (t.note ? ' · ' + Format.escapeHTML(t.note) : '');
    var amount = (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2);
    var btn = opts.paid
      ? '<button class="btn btn-ghost btn-sm credit-action" data-action="mark-unpaid" data-liab-id="' + t.id + '">' + I18n.t('credit_unpay') + '</button>'
      : '<button class="btn btn-primary btn-sm credit-action" data-action="mark-paid" data-liab-id="' + t.id + '">' + I18n.t('credit_mark_paid') + '</button>';
    return '<li class="txn credit-row' + (opts.paid ? ' credit-settled' : '') + '" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      +   btn
      + '</li>';
  }

  function render(state, ctx) {
    var sum = Calc.liabilitySummary(state);
    var currency = state.settings.currency;

    var header = ''
      + '<header class="app-header">'
      +   '<div class="app-title">' + I18n.t('credit_title') + '</div>'
      +   '<button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙</button>'
      + '</header>';

    var totalCard = ''
      + '<div class="summary-card">'
      +   '<div class="head">'
      +     '<span class="label">' + I18n.t('credit_total') + '</span>'
      +     (sum.unpaidCount > 0
            ? '<span class="chip">' + I18n.t('credit_outstanding_count', { n: sum.unpaidCount }) + '</span>'
            : '')
      +   '</div>'
      +   '<div class="big">' + Format.fmtMoney(sum.outstanding, currency) + '</div>'
      +   (sum.unpaidCount > 0
          ? '<button class="btn btn-ghost btn-block credit-pay-all" data-action="mark-all-paid" style="margin-top:12px">' + I18n.t('credit_mark_all_paid') + '</button>'
          : '')
      + '</div>';

    var unpaidHTML = sum.items.length
      ? '<ul class="txn-list">' + sum.items.map(function (t) { return _row(t, state, { paid: false }); }).join('') + '</ul>'
      : '<div class="empty-state"><div class="e-emoji">✅</div><div class="e-title">' + I18n.t('credit_empty') + '</div></div>';

    var paidHTML = '';
    if (sum.paidItems.length) {
      paidHTML = ''
        + '<div class="section-h">' + I18n.t('credit_paid_section') + '</div>'
        + '<ul class="txn-list">' + sum.paidItems.map(function (t) { return _row(t, state, { paid: true }); }).join('') + '</ul>';
    }

    return header
      + '<div class="app-body">'
      +   totalCard
      +   unpaidHTML
      +   paidHTML
      + '</div>';
  }

  return { render: render };
})();
