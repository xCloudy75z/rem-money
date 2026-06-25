var Validate = (function () {
  'use strict';

  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function validate(state) {
    var errors = [];
    if (!state || typeof state !== 'object') {
      errors.push('state not an object');
      return { ok: false, errors: errors };
    }
    if (state.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!state.settings) errors.push('settings missing');
    else {
      if (typeof state.settings.salaryDay !== 'number' || state.settings.salaryDay < 1 || state.settings.salaryDay > 28)
        errors.push('settings.salaryDay must be 1-28');
      if (typeof state.settings.currency !== 'string') errors.push('settings.currency must be string');
    }

    var seenNames = {};
    for (var cid in (state.categories || {})) {
      var c = state.categories[cid];
      if (!c.id || !c.name) { errors.push('category ' + cid + ' missing id/name'); continue; }
      if (c.name.length > 32) errors.push('category ' + cid + ' name >32 chars');
      if (c.budget !== undefined && (typeof c.budget !== 'number' || !isFinite(c.budget) || c.budget < 0))
        errors.push('category ' + cid + ' budget must be a number >= 0');
      if (c.budgetPeriod !== undefined && c.budgetPeriod !== 'monthly' && c.budgetPeriod !== 'yearly')
        errors.push('category ' + cid + ' budgetPeriod must be monthly or yearly');
      var key = c.name.toLowerCase().trim();
      if (seenNames[key]) errors.push('category name duplicated: ' + c.name);
      seenNames[key] = true;
    }

    var cycleList = Object.values(state.cycles || {}).slice().sort(function (a, b) {
      return a.startDate.localeCompare(b.startDate);
    });
    for (var i = 0; i < cycleList.length; i++) {
      var cyc = cycleList[i];
      if (!ISO_DATE.test(cyc.startDate) || !ISO_DATE.test(cyc.endDate))
        errors.push('cycle ' + cyc.id + ' has malformed dates');
      if (cyc.startDate > cyc.endDate) errors.push('cycle ' + cyc.id + ' start > end');
      if (typeof cyc.startBudget !== 'number' || cyc.startBudget <= 0)
        errors.push('cycle ' + cyc.id + ' startBudget must be positive number');
      if (i > 0) {
        var prev = cycleList[i - 1];
        if (cyc.startDate <= prev.endDate) errors.push('cycle ' + cyc.id + ' overlaps prior');
      }
    }

    for (var tid in (state.transactions || {})) {
      var t = state.transactions[tid];
      if (!ISO_DATE.test(t.date || '')) errors.push('txn ' + tid + ' has malformed date');
      if (typeof t.amount !== 'number' || t.amount < 0) errors.push('txn ' + tid + ' amount must be >= 0');
      if (!t.categoryId || !state.categories[t.categoryId]) errors.push('txn ' + tid + ' categoryId invalid');
      if (!t.cycleId || !state.cycles[t.cycleId]) errors.push('txn ' + tid + ' cycleId invalid');
      if (typeof t.note === 'string' && t.note.length > 280) errors.push('txn ' + tid + ' note >280 chars');
      if (t.byWife !== undefined && typeof t.byWife !== 'boolean') errors.push('txn ' + tid + ' byWife must be boolean');
    }

    for (var pid in (state.wifePayments || {})) {
      var p = state.wifePayments[pid];
      if (!p || !p.id) { errors.push('wifePayment ' + pid + ' missing id'); continue; }
      if (typeof p.amount !== 'number' || p.amount <= 0) errors.push('wifePayment ' + pid + ' amount must be > 0');
      if (!ISO_DATE.test(p.date || '')) errors.push('wifePayment ' + pid + ' has malformed date');
      if (typeof p.note === 'string' && p.note.length > 280) errors.push('wifePayment ' + pid + ' note >280 chars');
    }

    return { ok: errors.length === 0, errors: errors };
  }

  return { validate: validate };
})();
