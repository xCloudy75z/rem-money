var PlanView = (function () {
  'use strict';

  function _catRow(r, currency, mult) {
    var hasBudget = r.monthlyBudget > 0;
    var barColor = r.over ? '#e74c3c' : r.color;
    // No-budget categories still track spend: show "X / Not set" with a faint
    // empty track instead of hiding the number.
    var bar = hasBudget
      ? '<div class="bar"><div style="width:' + r.pct + '%;background:' + barColor + '"></div></div>'
      : '<div class="bar bar-empty"></div>';
    var amounts = hasBudget
      ? '<span class="plan-amounts">' + Format.fmtMoney(r.spent * mult, currency)
        + ' <span class="muted">/ ' + Format.fmtMoney(r.monthlyBudget * mult, currency) + '</span></span>'
      : '<span class="plan-amounts">' + Format.fmtMoney(r.spent * mult, currency)
        + ' <span class="muted">/ ' + I18n.t('plan_not_set') + '</span></span>';
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

  // Pinned, non-editable row showing money not yet assigned to any category
  // budget (cycle budget − total budgeted). Red + "Over-allocated" when negative.
  function _unallocRow(sum, currency, mult) {
    var over = sum.unallocated < 0;
    var allocPct = sum.cycleBudget > 0
      ? Math.max(0, Math.min(100, Math.round((sum.totalMonthlyPlanned / sum.cycleBudget) * 100)))
      : 0;
    var barColor = over ? '#e74c3c' : '#5ab19a';
    var amounts = over
      ? '<span class="plan-amounts" style="color:#e74c3c">' + I18n.t('plan_over_allocated', { amount: Format.fmtMoney(Math.abs(sum.unallocated) * mult, currency) }) + '</span>'
      : '<span class="plan-amounts">' + Format.fmtMoney(sum.unallocated * mult, currency)
        + ' <span class="muted">' + I18n.t('plan_unallocated_left') + '</span></span>';
    return '<li class="plan-row plan-row-fixed">'
      +   '<div class="plan-row-head">'
      +     '<span class="cat-dot" style="background:#7f8c8d33;color:#7f8c8d">💰</span>'
      +     '<span class="plan-name">' + I18n.t('plan_unallocated') + '</span>'
      +     amounts
      +   '</div>'
      +   '<div class="bar"><div style="width:' + allocPct + '%;background:' + barColor + '"></div></div>'
      + '</li>';
  }

  // "Where it went" donut for the active cycle: one wedge per top category plus
  // an "Other" bucket. Drawn as stacked stroke-dasharray arcs (no dependencies).
  function _donutCard(bd, state, currency) {
    var C = 2 * Math.PI * 54;
    var items = bd.slices.map(function (sl) {
      var cat = state.categories[sl.categoryId] || { name: '—', color: '#999' };
      return { name: cat.name, color: cat.color, amount: sl.amount };
    });
    if (bd.otherAmount > 0) items.push({ name: I18n.t('plan_other'), color: '#7f8c8d', amount: bd.otherAmount });
    var total = bd.donutTotal;
    var offset = 0;
    var arcs = items.map(function (it) {
      var len = total > 0 ? (it.amount / total) * C : 0;
      var seg = '<circle cx="80" cy="80" r="54" fill="none" stroke="' + it.color + '" stroke-width="22"'
        + ' stroke-dasharray="' + (Math.round(len * 100) / 100) + ' ' + (Math.round((C - len) * 100) / 100) + '"'
        + ' stroke-dashoffset="' + (Math.round(-offset * 100) / 100) + '"></circle>';
      offset += len;
      return seg;
    }).join('');
    var legend = items.map(function (it) {
      var pct = total > 0 ? Math.round((it.amount / total) * 100) : 0;
      return '<div class="dl-row"><span class="sw" style="background:' + it.color + '"></span>'
        + '<span class="dl-name">' + Format.escapeHTML(it.name) + '</span>'
        + '<span class="dl-amt">' + Format.fmtMoney(it.amount, currency) + '</span>'
        + '<span class="dl-pct">' + pct + '%</span></div>';
    }).join('');
    return '<div class="summary-card">'
      + '<div class="head"><span class="label">' + I18n.t('plan_where_it_went') + '</span></div>'
      + '<div class="donut-wrap">'
      +   '<svg viewBox="0 0 160 160" width="132" height="132" class="donut" role="img" aria-label="Spend by category">'
      +     '<g transform="rotate(-90 80 80)">' + arcs + '</g>'
      +     '<text x="80" y="77" class="donut-c-amt">' + Math.round(bd.total).toLocaleString('en-US') + '</text>'
      +     '<text x="80" y="93" class="donut-c-sub">' + I18n.t('plan_spent_label') + '</text>'
      +   '</svg>'
      +   '<div class="donut-legend">' + legend + '</div>'
      + '</div></div>';
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

    var unallocLine = sum.unallocated < 0
      ? '<div class="plan-unalloc" style="color:#e74c3c">' + I18n.t('plan_over_allocated', { amount: Format.fmtMoney(Math.abs(sum.unallocated) * mult, currency) }) + '</div>'
      : '<div class="plan-unalloc">' + I18n.t('plan_unallocated') + ': ' + Format.fmtMoney(sum.unallocated * mult, currency) + '</div>';

    var totalCard = ''
      + '<div class="summary-card">'
      +   '<div class="head"><span class="label">' + I18n.t('plan_total_planned') + '</span>' + toggle + '</div>'
      +   '<div class="big">' + Format.fmtMoney(sum.totalMonthlyPlanned * mult, currency)
      +     ' <small style="font-size:14px;color:var(--muted)">' + unitSuffix + '</small></div>'
      +   unallocLine
      + '</div>';

    // Budgeted categories on top; not-set ones grouped below under a subheader,
    // so the planned list stays clean but no-budget spend is still visible.
    var catRowsHTML;
    if (sum.rows.length) {
      var budgeted = sum.rows.filter(function (r) { return r.monthlyBudget > 0; });
      var notBudgeted = sum.rows.filter(function (r) { return r.monthlyBudget <= 0; });
      catRowsHTML = budgeted.map(function (r) { return _catRow(r, currency, mult); }).join('');
      if (notBudgeted.length) {
        catRowsHTML += '<li class="plan-subhdr">' + I18n.t('plan_not_budgeted_section') + '</li>'
          + notBudgeted.map(function (r) { return _catRow(r, currency, mult); }).join('');
      }
    } else {
      catRowsHTML = '<li><div class="empty-state">' + I18n.t('plan_no_categories') + '</div></li>';
    }
    var rowsHTML = _unallocRow(sum, currency, mult) + catRowsHTML;

    var breakdown = Calc.categoryBreakdown(state, cyc.id, 5);
    var donutCard = (breakdown && breakdown.donutTotal > 0) ? _donutCard(breakdown, state, currency) : '';

    var addBtn = '<button class="btn btn-ghost btn-block" data-action="plan-add-cat" style="margin-top:6px">' + I18n.t('add_category') + '</button>';

    return header
      + '<div class="app-body">'
      +   totalCard
      +   donutCard
      +   '<ul class="plan-list">' + rowsHTML + '</ul>'
      +   addBtn
      + '</div>';
  }

  return { render: render };
})();
