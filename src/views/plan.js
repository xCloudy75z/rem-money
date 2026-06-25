var PlanView = (function () {
  'use strict';

  function _catRow(r, currency, mult) {
    var hasBudget = r.monthlyBudget > 0;
    var barColor = r.over ? '#e74c3c' : r.color;
    var bar = hasBudget
      ? '<div class="bar"><div style="width:' + r.pct + '%;background:' + barColor + '"></div></div>'
      : '';
    var amounts = hasBudget
      ? '<span class="plan-amounts">' + Format.fmtMoney(r.spent * mult, currency)
        + ' <span class="muted">/ ' + Format.fmtMoney(r.monthlyBudget * mult, currency) + '</span></span>'
      : '<span class="plan-amounts muted">' + I18n.t('plan_no_budget') + '</span>';
    var overLine = r.over
      ? '<div class="plan-over">' + I18n.t('plan_over_by', { amount: Format.fmtMoney((r.spent - r.monthlyBudget) * mult, currency) }) + '</div>'
      : '';
    return '<li class="plan-row" data-edit-cat-id="' + r.categoryId + '">'
      +   '<div class="plan-row-head">'
      +     '<span class="cat-dot" style="background:' + r.color + '33;color:' + r.color + '">' + Format.escapeHTML(r.icon || '•') + '</span>'
      +     '<span class="plan-name">' + Format.escapeHTML(r.name) + '</span>'
      +     amounts
      +     '<button class="del-cat" data-del-cat-id="' + r.categoryId + '" aria-label="Delete">×</button>'
      +   '</div>'
      +   bar
      +   overLine
      + '</li>';
  }

  function render(state, ctx) {
    var currency = state.settings.currency;
    var unit = ctx && ctx.unit === 'yearly' ? 'yearly' : 'monthly';
    var mult = unit === 'yearly' ? 12 : 1;
    var unitSuffix = unit === 'yearly' ? I18n.t('plan_per_year') : I18n.t('plan_per_month');

    var header = ''
      + '<header class="app-header">'
      +   '<div class="app-title">' + I18n.t('plan_title') + '</div>'
      +   '<button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙</button>'
      + '</header>';

    var cyc = Calc.activeCycle(state);
    if (!cyc) {
      return header + '<div class="app-body"><div class="empty-state">' + I18n.t('no_active_cycle') + '</div></div>';
    }

    var sum = Calc.planSummary(state, cyc.id);

    var toggle = ''
      + '<div class="seg plan-unit-seg">'
      +   '<button class="' + (unit === 'monthly' ? 'active' : '') + '" data-action="plan-unit" data-unit="monthly">' + I18n.t('plan_unit_monthly') + '</button>'
      +   '<button class="' + (unit === 'yearly' ? 'active' : '') + '" data-action="plan-unit" data-unit="yearly">' + I18n.t('plan_unit_annual') + '</button>'
      + '</div>';

    var totalCard = ''
      + '<div class="summary-card">'
      +   '<div class="head"><span class="label">' + I18n.t('plan_total_planned') + '</span>' + toggle + '</div>'
      +   '<div class="big">' + Format.fmtMoney(sum.totalMonthlyPlanned * mult, currency)
      +     ' <small style="font-size:14px;color:var(--muted)">' + unitSuffix + '</small></div>'
      + '</div>';

    var rowsHTML = sum.rows.length
      ? sum.rows.map(function (r) { return _catRow(r, currency, mult); }).join('')
      : '<li><div class="empty-state">' + I18n.t('plan_no_categories') + '</div></li>';

    var addBtn = '<button class="btn btn-ghost btn-block" data-action="plan-add-cat" style="margin-top:6px">' + I18n.t('add_category') + '</button>';

    return header
      + '<div class="app-body">'
      +   totalCard
      +   '<ul class="plan-list">' + rowsHTML + '</ul>'
      +   addBtn
      + '</div>';
  }

  return { render: render };
})();
