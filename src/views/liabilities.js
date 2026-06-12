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
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + (t.byWife ? ' · ' + I18n.t('wife_tag') : '') + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      +   btn
      + '</li>';
  }

  function _wifePurchaseRow(t, state) {
    var cat = state.categories[t.categoryId] || { name: '—', icon: '•', color: '#999' };
    var when = Format.fmtDateShort(t.date);
    var sub = when + (t.note ? ' · ' + Format.escapeHTML(t.note) : '');
    var amount = (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2);
    return '<li class="txn credit-row" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      +   '<button class="btn btn-ghost btn-sm" data-action="wife-prefill-pay" data-amount="' + Number(t.amount).toFixed(2) + '">' + I18n.t('wife_she_paid') + '</button>'
      + '</li>';
  }

  function _wifePaymentRow(p, currency) {
    var when = Format.fmtDateShort(p.date);
    var sub = when + (p.note ? ' · ' + Format.escapeHTML(p.note) : '');
    return '<li class="txn credit-row">'
      +   '<span class="cat-dot" style="background:#2ecc7133;color:#2ecc71">✓</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.fmtMoney(p.amount, currency) + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount refund">−' + Number(p.amount).toFixed(2) + '</div>'
      +   '<button class="btn btn-ghost btn-sm" data-action="remove-wife-payment" data-payment-id="' + p.id + '">' + I18n.t('wife_remove_payment') + '</button>'
      + '</li>';
  }

  function render(state, ctx) {
    var sum = Calc.liabilitySummary(state);
    var wife = Calc.wifeSummary(state);
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

    var wifeBalanceText = wife.balance < 0
      ? I18n.t('wife_credit_label') + ': ' + Format.fmtMoney(Math.abs(wife.balance), currency)
      : Format.fmtMoney(wife.balance, currency);

    var wifeCard = ''
      + '<div class="summary-card">'
      +   '<div class="head">'
      +     '<span class="label">' + I18n.t('wife_card_title') + '</span>'
      +   '</div>'
      +   '<div class="big">' + wifeBalanceText + '</div>'
      +   '<button class="btn btn-ghost btn-block" data-action="record-wife-payment" style="margin-top:12px">' + I18n.t('wife_record_payment') + '</button>'
      + '</div>';

    var wifePurchasesHTML = wife.purchases.length
      ? '<div class="section-h">' + I18n.t('wife_purchases_section') + '</div>'
        + '<ul class="txn-list">' + wife.purchases.map(function (t) { return _wifePurchaseRow(t, state); }).join('') + '</ul>'
      : '';

    var wifePaymentsHTML = wife.payments.length
      ? '<div class="section-h">' + I18n.t('wife_payments_section') + '</div>'
        + '<ul class="txn-list">' + wife.payments.map(function (p) { return _wifePaymentRow(p, currency); }).join('') + '</ul>'
      : '';

    var wifeSection = (wife.purchases.length || wife.payments.length || wife.balance !== 0)
      ? wifeCard + wifePurchasesHTML + wifePaymentsHTML
      : '';

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
      +   wifeSection
      + '</div>';
  }

  return { render: render };
})();
