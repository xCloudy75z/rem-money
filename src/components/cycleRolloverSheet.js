var CycleRolloverSheet = (function () {
  'use strict';

  function open(state, cycle, onChoice) {
    var sum = Calc.cycleSummary(state, cycle.id) || { total: 0, avgDaily: 0, biggestDay: null, biggestTxn: null, topCategories: [] };
    var currency = state.settings.currency;
    var under = cycle.startBudget - sum.total;
    var underLabel = under >= 0 ? I18n.t('rollover_under') : I18n.t('rollover_over');
    var underClass = under >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    var biggestCat = sum.topCategories[0] ? (state.categories[sum.topCategories[0].categoryId] || { name: '?' }) : null;

    var html = ''
      + '<p style="margin:-4px 0 14px;color:var(--muted)">' + I18n.t('cycle_ended_sub', { start: Format.fmtDateShort(cycle.startDate), end: Format.fmtDateShort(cycle.endDate) }) + '</p>'
      + '<div class="summary-card" style="margin-top:0">'
      +   '<div class="stat-row"><span class="lbl">' + I18n.t('rollover_total_spent') + '</span><span style="font-weight:600">' + Format.fmtMoney(sum.total, currency) + '</span></div>'
      +   '<div class="stat-row"><span class="lbl">' + underLabel + '</span><span style="font-weight:600;' + underClass + '">' + Format.fmtMoney(Math.abs(under), currency) + '</span></div>'
      +   (biggestCat ? '<div class="stat-row"><span class="lbl">' + I18n.t('rollover_biggest_cat') + '</span><span style="font-weight:600">' + Format.escapeHTML(biggestCat.icon || '•') + ' ' + Format.escapeHTML(biggestCat.name) + ' · ' + Format.fmtMoney(sum.topCategories[0].amount, currency) + '</span></div>' : '')
      +   (sum.biggestDay ? '<div class="stat-row"><span class="lbl">' + I18n.t('rollover_biggest_day') + '</span><span style="font-weight:600">' + Format.fmtDateShort(sum.biggestDay.date) + ' · ' + Format.fmtMoney(sum.biggestDay.amount, currency) + '</span></div>' : '')
      +   '<div class="stat-row"><span class="lbl">' + I18n.t('rollover_avg') + '</span><span style="font-weight:600">' + Format.fmtMoney(sum.avgDaily, currency) + '</span></div>'
      + '</div>'
      + '<div id="cr-new-budget-wrap" style="display:none" class="sheet-section">'
      +   '<label>' + I18n.t('rollover_new_budget') + '</label>'
      +   '<input class="input input-lg" id="cr-new-budget" inputmode="decimal" value="' + cycle.startBudget + '">'
      + '</div>'
      + '<div class="sheet-footer" style="grid-template-columns:1fr">'
      +   '<button class="btn btn-primary full-row" id="cr-same">' + I18n.t('rollover_same', { amount: Format.fmtMoney(cycle.startBudget, currency) }) + '</button>'
      +   '<button class="btn btn-ghost full-row" id="cr-diff">' + I18n.t('rollover_diff') + '</button>'
      +   '<button class="btn btn-primary full-row" id="cr-diff-save" style="display:none">' + I18n.t('save') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('cycle_ended_title') + ' 🎉' });

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'cr-same') { Sheet.close(); onChoice({ sameBudget: true }); return; }
      if (t.id === 'cr-diff') {
        wrap.querySelector('#cr-new-budget-wrap').style.display = '';
        wrap.querySelector('#cr-diff').style.display = 'none';
        wrap.querySelector('#cr-same').style.display = 'none';
        wrap.querySelector('#cr-diff-save').style.display = '';
        wrap.querySelector('#cr-new-budget').focus();
        return;
      }
      if (t.id === 'cr-diff-save') {
        var b = Format.parseAmount(wrap.querySelector('#cr-new-budget').value);
        if (!(b > 0)) { wrap.querySelector('#cr-new-budget').classList.add('error'); return; }
        Sheet.close();
        onChoice({ sameBudget: false, newBudget: b });
        return;
      }
    });
  }

  return { open: open };
})();
