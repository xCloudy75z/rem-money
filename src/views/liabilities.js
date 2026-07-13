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

  // A wife purchase row. When `settled`, it shows in the Reimbursed section with
  // an Undo button; otherwise it is still owed and shows the "She paid" button
  // that marks THIS purchase reimbursed (no separate payment record is created).
  function _wifePurchaseRow(t, state, settled) {
    var cat = state.categories[t.categoryId] || { name: '—', icon: '•', color: '#999' };
    var when = Format.fmtDateShort(t.date);
    var sub = when + (t.note ? ' · ' + Format.escapeHTML(t.note) : '');
    var amount = (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2);
    var btn = settled
      ? '<button class="btn btn-ghost btn-sm credit-action" data-action="mark-wife-unpaid" data-liab-id="' + t.id + '">' + I18n.t('wife_undo_settle') + '</button>'
      : '<button class="btn btn-primary btn-sm credit-action" data-action="mark-wife-paid" data-liab-id="' + t.id + '">' + I18n.t('wife_she_paid') + '</button>';
    return '<li class="txn credit-row' + (settled ? ' credit-settled' : '') + '" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      +   btn
      + '</li>';
  }

  // Show this many rows before collapsing the rest behind a "Show all" tap.
  var COLLAPSE_LIMIT = 5;

  // Wrap a section's rows in one enclosing card so the list reads as a single
  // panel with hairline row dividers (no per-row pills, no inner scroll box).
  // Long lists cap at COLLAPSE_LIMIT rows with a "Show all (N)" / "Show less"
  // footer instead of an internal scroll box, so the card never slices a row.
  // `rowsArr` is an array of row-HTML strings; `sectionKey` + `expanded` drive
  // the expander (state lives in app.js `ui.creditExpanded`).
  function _listCard(header, rowsArr, sectionKey, expanded) {
    var total = rowsArr.length;
    var showAll = expanded || total <= COLLAPSE_LIMIT;
    var visible = showAll ? rowsArr : rowsArr.slice(0, COLLAPSE_LIMIT);
    var footer = '';
    if (total > COLLAPSE_LIMIT) {
      footer = '<button class="credit-showall" data-action="credit-show-all" data-section="' + sectionKey + '">'
        + (expanded ? I18n.t('credit_show_less') : I18n.t('credit_show_all', { n: total }))
        + '</button>';
    }
    return '<div class="card-list">'
      + (header || '')
      + '<ul class="txn-list">' + visible.join('') + '</ul>'
      + footer
      + '</div>';
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
    var expanded = (ctx && ctx.expanded) || {};

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
      ? _listCard('<div class="section-h">' + I18n.t('wife_purchases_section') + '</div>',
          wife.purchases.map(function (t) { return _wifePurchaseRow(t, state, false); }), 'wifePurchases', expanded.wifePurchases)
      : '';

    var wifeReimbursedHTML = wife.settledPurchases.length
      ? _listCard('<div class="section-h">' + I18n.t('wife_reimbursed_section') + '</div>',
          wife.settledPurchases.map(function (t) { return _wifePurchaseRow(t, state, true); }), 'wifeReimbursed', expanded.wifeReimbursed)
      : '';

    var wifePaymentsHTML = wife.payments.length
      ? _listCard('<div class="section-h">' + I18n.t('wife_payments_section') + '</div>',
          wife.payments.map(function (p) { return _wifePaymentRow(p, currency); }), 'wifePayments', expanded.wifePayments)
      : '';

    var wifeSection = (wife.purchases.length || wife.settledPurchases.length || wife.payments.length || wife.balance !== 0)
      ? wifeCard + wifePurchasesHTML + wifeReimbursedHTML + wifePaymentsHTML
      : '';

    var unpaidHTML = sum.items.length
      ? _listCard('', sum.items.map(function (t) { return _row(t, state, { paid: false }); }), 'unpaid', expanded.unpaid)
      : '<div class="empty-state"><div class="e-emoji">✅</div><div class="e-title">' + I18n.t('credit_empty') + '</div></div>';

    var paidHTML = '';
    if (sum.paidItems.length) {
      paidHTML = _listCard(
        '<div class="section-h">' + I18n.t('credit_paid_section') + '</div>',
        sum.paidItems.map(function (t) { return _row(t, state, { paid: true }); }), 'paid', expanded.paid);
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
