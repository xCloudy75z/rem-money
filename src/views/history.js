var HistoryView = (function () {
  'use strict';

  function _txnRow(t, state) {
    var cat = state.categories[t.categoryId] || { name: '—', icon: '•', color: '#999' };
    var time = t.createdAt ? Format.fmtTime(t.createdAt) : '';
    var creditTag = t.isCredit ? ' · ' + I18n.t(t.liabilitySettled ? 'credit_paid_tag' : 'credit_tag') : '';
    return '<li class="txn" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + creditTag + '</div>'
      +     '<div class="bot-line">' + time + (t.note ? (time ? ' · ' : '') + Format.escapeHTML(t.note) : '') + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2) + '</div>'
      +   '<div class="chev">›</div>'
      + '</li>';
  }

  function _signed(t) { return t.isRefund ? -t.amount : t.amount; }

  function render(state, ctx) {
    var today = ctx.todayISO;
    var viewingCycleId = ctx.viewingCycleId || (state.settings.activeCycleId);
    var activeId = state.settings.activeCycleId;

    var cycles = Object.values(state.cycles).slice().sort(function (a, b) { return b.startDate.localeCompare(a.startDate); });
    var cycleChips = cycles.map(function (c) {
      var label = Format.fmtDateShort(c.startDate) + ' → ' + Format.fmtDateShort(c.endDate);
      if (c.id === activeId) label += ' · ' + I18n.t('cycle_current_chip');
      return '<button class="date-chip ' + (c.id === viewingCycleId ? 'selected' : '') + '" data-cycle-id="' + c.id + '">' + label + '</button>';
    }).join('');

    var viewing = state.cycles[viewingCycleId];
    if (!viewing) return '<div class="app-body"><div class="empty-state">' + I18n.t('no_active_cycle') + '</div></div>';

    var summaryHTML = '';
    if (viewing.id !== activeId) {
      summaryHTML = PastCycleView.render(state, viewing);
    } else {
      var currency = state.settings.currency;
      var spent = Calc.cycleTotalSpent(state, viewing.id);
      var leftAmt = Math.round((viewing.startBudget - spent) * 100) / 100;
      var pctRaw = viewing.startBudget > 0 ? (spent / viewing.startBudget) * 100 : 0;
      var pctDisplay = Math.round(pctRaw * 10) / 10;
      var barPct = Math.max(0, Math.min(100, pctRaw));
      var over = leftAmt < 0;
      summaryHTML = ''
        + '<div class="cycle-strip">'
        +   '<div class="cycle-strip-row">'
        +     '<div>'
        +       '<div class="cycle-strip-lbl">' + I18n.t('cycle_spent_label') + '</div>'
        +       '<div class="cycle-strip-val">' + Format.fmtMoney(spent, currency) + '</div>'
        +     '</div>'
        +     '<div style="text-align:end">'
        +       '<div class="cycle-strip-lbl">' + I18n.t('cycle_left_label') + '</div>'
        +       '<div class="cycle-strip-val ' + (over ? 'over' : 'left') + '">' + (over ? '−' : '') + Format.fmtMoney(Math.abs(leftAmt), currency) + '</div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="cycle-strip-bar"><div class="' + (over ? 'over' : '') + '" style="width:' + barPct + '%"></div></div>'
        +   '<div class="cycle-strip-sub">'
        +     '<span>' + I18n.t('cycle_of_budget', { amount: Format.fmtMoney(viewing.startBudget, currency) }) + '</span>'
        +     '<span>' + I18n.t('cycle_pct_used', { pct: pctDisplay }) + '</span>'
        +   '</div>'
        + '</div>';
    }

    // Group txns by day
    var txns = Object.values(state.transactions).filter(function (t) { return t.cycleId === viewing.id; });
    txns.sort(function (a, b) { return b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''); });

    var groups = {};
    var orderedDays = [];
    for (var i = 0; i < txns.length; i++) {
      var d = txns[i].date;
      if (!groups[d]) { groups[d] = []; orderedDays.push(d); }
      groups[d].push(txns[i]);
    }

    function _yesterdayOf(iso) {
      // Cheap helper for relative day labels — only compares strings
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7), dd = +iso.slice(8, 10);
      dd -= 1;
      if (dd < 1) {
        m -= 1; if (m < 1) { m = 12; y -= 1; }
        var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        dd = dim[m - 1];
      }
      return y + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    }

    var yesterdayISO = _yesterdayOf(today);

    var groupsHTML = orderedDays.length === 0
      ? '<div class="empty-state">' + I18n.t('empty_history') + '</div>'
      : orderedDays.map(function (d) {
          var label = d === today ? I18n.t('today_label')
                    : d === yesterdayISO ? I18n.t('yesterday_label')
                    : Format.fmtDateLong(d);
          var dayTotal = groups[d].reduce(function (s, t) { return s + _signed(t); }, 0);
          var rows = groups[d].map(function (t) { return _txnRow(t, state); }).join('');
          return '<div class="section-h">' + label + '<span class="right">' + groups[d].length + ' · ' + Format.fmtMoney(dayTotal, state.settings.currency) + '</span></div>'
            + '<ul class="txn-list">' + rows + '</ul>';
        }).join('');

    return ''
      + '<header class="app-header">'
      +   '<div class="app-title">' + I18n.t('tab_history') + '</div>'
      +   '<button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙</button>'
      + '</header>'
      + '<div class="app-body">'
      +   '<div style="display:flex;gap:6px;overflow-x:auto;padding-block:4px;margin-bottom:8px">' + cycleChips + '</div>'
      +   summaryHTML
      +   groupsHTML
      + '</div>';
  }

  return { render: render };
})();
