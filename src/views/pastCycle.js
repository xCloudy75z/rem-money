var PastCycleView = (function () {
  'use strict';

  function render(state, cycle) {
    var sum = Calc.cycleSummary(state, cycle.id);
    if (!sum) return '';
    var currency = state.settings.currency;
    var under = cycle.startBudget - sum.total;
    var chipClass = under >= 0 ? 'good' : 'bad';
    var chipLabel = under >= 0 ? I18n.t('rollover_under') : I18n.t('rollover_over');

    var bars = sum.topCategories.map(function (tc) {
      var cat = state.categories[tc.categoryId] || { name: '?', icon: '•', color: '#999' };
      var pct = sum.total > 0 ? Math.max(2, Math.round((tc.amount / sum.total) * 100)) : 0;
      return '<div class="cat-bar-row">'
        + '<span>' + Format.escapeHTML(cat.icon || '•') + '</span>'
        + '<div><div style="font-weight:600;font-size:13px">' + Format.escapeHTML(cat.name) + '</div>'
        + '<div class="bar"><div style="width:' + pct + '%;background:' + cat.color + '"></div></div></div>'
        + '<span style="font-weight:600">' + Format.fmtMoney(tc.amount, currency) + '</span>'
        + '</div>';
    }).join('');

    var biggestDay = sum.biggestDay
      ? Format.fmtDateShort(sum.biggestDay.date) + ' · ' + Format.fmtMoney(sum.biggestDay.amount, currency)
      : '—';
    var biggestTxnLabel = '—';
    if (sum.biggestTxn) {
      var bc = state.categories[sum.biggestTxn.categoryId] || { name: '?' };
      biggestTxnLabel = Format.fmtDateShort(sum.biggestTxn.date) + ' · ' + Format.fmtMoney(sum.biggestTxn.amount, currency) + ' · ' + bc.name;
    }

    return ''
      + '<div class="summary-card">'
      +   '<div class="head">'
      +     '<span class="label">' + I18n.t('rollover_total_spent') + '</span>'
      +     '<span class="chip ' + chipClass + '">' + chipLabel + ' ' + Format.fmtMoney(Math.abs(under), currency) + '</span>'
      +   '</div>'
      +   '<div class="big">' + Format.fmtMoney(sum.total, currency) + '</div>'
      +   '<div style="color:var(--muted);font-size:13px;margin-top:4px">of ' + Format.fmtMoney(cycle.startBudget, currency) + ' cycle budget</div>'
      + '</div>'
      + (bars ? '<div class="summary-card">'
        + '<div class="head"><span class="label">' + I18n.t('by_category') + '</span></div>' + bars
        + '</div>' : '')
      + '<div class="summary-card">'
      +   '<div class="head"><span class="label">' + I18n.t('highlights') + '</span></div>'
      +   '<div class="stat-row"><span class="lbl">' + I18n.t('avg_per_day') + '</span><span style="font-weight:600">' + Format.fmtMoney(sum.avgDaily, currency) + '</span></div>'
      +   '<div class="stat-row"><span class="lbl">' + I18n.t('biggest_day_label') + '</span><span style="font-weight:600">' + biggestDay + '</span></div>'
      +   '<div class="stat-row"><span class="lbl">' + I18n.t('biggest_single') + '</span><span style="font-weight:600">' + biggestTxnLabel + '</span></div>'
      + '</div>'
      + '<p style="text-align:center;color:var(--muted);font-size:12px;margin:12px 0">' + I18n.t('readonly_archived') + '</p>';
  }

  return { render: render };
})();
