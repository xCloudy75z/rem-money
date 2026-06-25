var Calc = (function () {
  'use strict';

  // ---- Pure date arithmetic (Howard Hinnant) — no Date constructors ----
  function _ymdToDays(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    var era = Math.floor((y >= 0 ? y : y - 399) / 400);
    var yoe = y - era * 400;
    var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function _daysToYmd(days) {
    days += 719468;
    var era = Math.floor((days >= 0 ? days : days - 146096) / 146097);
    var doe = days - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400;
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153);
    var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    var m = mp + (mp < 10 ? 3 : -9);
    y += m <= 2 ? 1 : 0;
    return { y: y, m: m, d: d };
  }
  function _addDays(iso, n) {
    var days = _ymdToDays(+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)) + n;
    var ymd = _daysToYmd(days);
    return ymd.y + '-' + String(ymd.m).padStart(2, '0') + '-' + String(ymd.d).padStart(2, '0');
  }
  function daysBetweenInclusive(startISO, endISO) {
    var a = _ymdToDays(+startISO.slice(0, 4), +startISO.slice(5, 7), +startISO.slice(8, 10));
    var b = _ymdToDays(+endISO.slice(0, 4), +endISO.slice(5, 7), +endISO.slice(8, 10));
    return b - a + 1;
  }

  function activeCycle(state) {
    var id = state && state.settings && state.settings.activeCycleId;
    return (id && state.cycles[id]) || null;
  }

  function cycleTransactions(state, cycleId) {
    var out = [];
    for (var tid in state.transactions) {
      if (state.transactions[tid].cycleId === cycleId) out.push(state.transactions[tid]);
    }
    return out;
  }

  function txnSignedAmount(t) {
    return t.isRefund ? -t.amount : t.amount;
  }

  function cycleTotalSpent(state, cycleId) {
    var sum = 0;
    var txns = cycleTransactions(state, cycleId);
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].isExcludedFromPace) continue;
      sum += txnSignedAmount(txns[i]);
    }
    return Math.round(sum * 100) / 100;
  }

  function todaySpent(state, todayISO, cycleId) {
    var sum = 0;
    var txns = cycleTransactions(state, cycleId);
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].date !== todayISO) continue;
      if (txns[i].isExcludedFromPace) continue;
      sum += txnSignedAmount(txns[i]);
    }
    return Math.round(sum * 100) / 100;
  }

  function daysLeftIncludingToday(cycle, todayISO) {
    if (todayISO < cycle.startDate) return daysBetweenInclusive(cycle.startDate, cycle.endDate);
    if (todayISO > cycle.endDate) return 0;
    return daysBetweenInclusive(todayISO, cycle.endDate);
  }

  function todayLimit(state, todayISO, cycleId) {
    var cycle = state.cycles[cycleId];
    if (!cycle) return 0;
    var dleft = daysLeftIncludingToday(cycle, todayISO);
    if (dleft <= 0) return 0;
    var spentBefore = 0;
    var txns = cycleTransactions(state, cycleId);
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].isExcludedFromPace) continue;
      if (txns[i].date < todayISO) spentBefore += txnSignedAmount(txns[i]);
    }
    var remaining = cycle.startBudget - spentBefore;
    return Math.round((remaining / dleft) * 100) / 100;
  }

  function aedLeftToday(state, todayISO, cycleId) {
    return Math.round((todayLimit(state, todayISO, cycleId) - todaySpent(state, todayISO, cycleId)) * 100) / 100;
  }

  // ---- Pace with ±3% deadband ----
  function _windowSpend(txns, fromISO, toISO) {
    var sum = 0;
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].isExcludedFromPace) continue;
      if (txns[i].date >= fromISO && txns[i].date <= toISO) sum += txnSignedAmount(txns[i]);
    }
    return sum;
  }

  function pace(state, todayISO, cycleId, minEntries) {
    minEntries = minEntries == null ? 4 : minEntries;
    var txns = cycleTransactions(state, cycleId);
    var counted = txns.filter(function (t) { return !t.isExcludedFromPace; });
    if (counted.length < minEntries) return 'unknown';

    var fromA = _addDays(todayISO, -2), toA = todayISO;
    var fromB = _addDays(todayISO, -5), toB = _addDays(todayISO, -3);
    var a = _windowSpend(txns, fromA, toA);
    var b = _windowSpend(txns, fromB, toB);

    if (b <= 0 && a <= 0) return 'on-track';
    if (b <= 0) return a > 0 ? 'fast' : 'on-track';

    var ratio = a / b;
    if (ratio <= 1.03) return 'on-track';
    if (ratio <= 1.15) return 'slightly-fast';
    return 'fast';
  }

  // ---- Historical reconstruction (single forward pass, O(N)) ----
  function historicalLimitsByDay(state, cycleId) {
    var cycle = state.cycles[cycleId];
    if (!cycle) return {};
    var byDay = {};
    var txns = cycleTransactions(state, cycleId).slice().sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });
    var spentBefore = 0;
    var i = 0;
    var day = cycle.startDate;
    while (true) {
      var dleft = daysLeftIncludingToday(cycle, day);
      var remaining = cycle.startBudget - spentBefore;
      var limit = dleft > 0 ? Math.round((remaining / dleft) * 100) / 100 : 0;
      var spentToday = 0;
      while (i < txns.length && txns[i].date === day) {
        if (!txns[i].isExcludedFromPace) spentToday += txnSignedAmount(txns[i]);
        i++;
      }
      byDay[day] = { limit: limit, spent: Math.round(spentToday * 100) / 100 };
      spentBefore += spentToday;
      if (day === cycle.endDate) break;
      day = _addDays(day, 1);
    }
    return byDay;
  }

  function cycleSummary(state, cycleId) {
    var cycle = state.cycles[cycleId];
    if (!cycle) return null;
    var txns = cycleTransactions(state, cycleId).filter(function (t) { return !t.isExcludedFromPace; });
    var total = cycleTotalSpent(state, cycleId);
    var totalDays = daysBetweenInclusive(cycle.startDate, cycle.endDate);
    var avgDaily = totalDays > 0 ? Math.round((total / totalDays) * 100) / 100 : 0;

    var byDay = {};
    for (var j = 0; j < txns.length; j++) {
      byDay[txns[j].date] = (byDay[txns[j].date] || 0) + txnSignedAmount(txns[j]);
    }
    var biggestDay = null;
    for (var d in byDay) {
      if (!biggestDay || byDay[d] > biggestDay.amount) biggestDay = { date: d, amount: Math.round(byDay[d] * 100) / 100 };
    }

    var biggestTxn = null;
    for (var k = 0; k < txns.length; k++) {
      if (!biggestTxn || txns[k].amount > biggestTxn.amount) biggestTxn = txns[k];
    }

    var byCat = {};
    for (var m = 0; m < txns.length; m++) {
      var cid = txns[m].categoryId;
      byCat[cid] = (byCat[cid] || 0) + txnSignedAmount(txns[m]);
    }
    var topCategories = Object.keys(byCat).map(function (id) {
      return { categoryId: id, amount: Math.round(byCat[id] * 100) / 100 };
    }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5);

    return { total: total, avgDaily: avgDaily, biggestDay: biggestDay, biggestTxn: biggestTxn, topCategories: topCategories };
  }

  // ---- Credit / liability overlay (global, across ALL cycles) ----
  // A credit spend still counts toward its cycle budget like any other spend;
  // this is a separate running tally of what is still owed. Refunds tagged as
  // credit reduce the owed amount (signed). Settled items drop out of the total.
  function liabilitySummary(state) {
    var items = [];
    var paidItems = [];
    var outstanding = 0;
    for (var tid in state.transactions) {
      var t = state.transactions[tid];
      if (!t || !t.isCredit) continue;
      if (t.liabilitySettled) { paidItems.push(t); }
      else { items.push(t); outstanding += txnSignedAmount(t); }
    }
    function _byDateDesc(a, b) {
      return (b.date || '').localeCompare(a.date || '')
        || (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    items.sort(_byDateDesc);
    paidItems.sort(function (a, b) {
      return (b.settledAt || '').localeCompare(a.settledAt || '') || _byDateDesc(a, b);
    });
    return {
      outstanding: Math.round(outstanding * 100) / 100,
      unpaidCount: items.length,
      items: items,
      paidItems: paidItems
    };
  }

  // ---- Wife reimbursement overlay (global, across ALL cycles) ----
  // A byWife spend is excluded from the user's pace/limit and counts toward the
  // bank-credit total; SEPARATELY the wife owes the user for it. Her balance is
  // derived: charged (signed, so a wife refund reduces it) minus her payments.
  function wifeSummary(state) {
    var purchases = [];
    var charged = 0;
    for (var tid in state.transactions) {
      var t = state.transactions[tid];
      if (!t || !t.byWife) continue;
      purchases.push(t);
      charged += txnSignedAmount(t);
    }
    var payments = [];
    var paid = 0;
    var wp = state.wifePayments || {};
    for (var pid in wp) {
      var p = wp[pid];
      if (!p) continue;
      payments.push(p);
      paid += Number(p.amount) || 0;
    }
    function _byDateDesc(a, b) {
      return (b.date || '').localeCompare(a.date || '')
        || (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    purchases.sort(_byDateDesc);
    payments.sort(_byDateDesc);
    charged = Math.round(charged * 100) / 100;
    paid = Math.round(paid * 100) / 100;
    return {
      charged: charged,
      paid: paid,
      balance: Math.round((charged - paid) * 100) / 100,
      purchases: purchases,
      payments: payments
    };
  }

  // ---- Per-category budgets (planning overlay) ----
  // Normalize a category's budget to a monthly figure. A yearly budget is the
  // owner's natural unit (e.g. car insurance 6,000/yr); we divide to a monthly
  // slice so progress can be compared against one cycle's spend.
  function monthlyBudget(category) {
    if (!category) return 0;
    var b = Number(category.budget) || 0;
    if (b <= 0) return 0;
    if (category.budgetPeriod === 'yearly') return Math.round((b / 12) * 100) / 100;
    return Math.round(b * 100) / 100;
  }

  // Total spent on a category within a cycle. Signed (refunds subtract).
  // Deliberately does NOT apply the isExcludedFromPace filter: the Plan page
  // answers "what did this category cost," so a byWife/credit spend still
  // counts against the category budget even though it is out of the daily pace.
  function categorySpentThisCycle(state, categoryId, cycleId) {
    var sum = 0;
    var txns = cycleTransactions(state, cycleId);
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].categoryId !== categoryId) continue;
      sum += txnSignedAmount(txns[i]);
    }
    return Math.round(sum * 100) / 100;
  }

  // Build the Plan-page model: one row per non-archived category (sorted by
  // order) with its monthly budget, this-cycle spend, percent, and over flag,
  // plus the total of all monthly budgets. Zero-budget categories are still
  // listed (so they can be edited) but contribute nothing to the total.
  function planSummary(state, cycleId) {
    var cats = [];
    for (var id in (state.categories || {})) {
      var c = state.categories[id];
      if (!c || c.isArchived) continue;
      cats.push(c);
    }
    cats.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var rows = [];
    var total = 0;
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var mb = monthlyBudget(cat);
      var spent = categorySpentThisCycle(state, cat.id, cycleId);
      var pct = mb > 0 ? Math.max(0, Math.min(100, Math.round((spent / mb) * 100))) : 0;
      var over = mb > 0 && spent > mb;
      if (mb > 0) total += mb;
      rows.push({
        categoryId: cat.id, name: cat.name, icon: cat.icon, color: cat.color,
        order: cat.order, spent: spent, monthlyBudget: mb, pct: pct, over: over
      });
    }
    return { rows: rows, totalMonthlyPlanned: Math.round(total * 100) / 100 };
  }

  return {
    daysBetweenInclusive: daysBetweenInclusive,
    activeCycle: activeCycle,
    cycleTransactions: cycleTransactions,
    cycleTotalSpent: cycleTotalSpent,
    todaySpent: todaySpent,
    daysLeftIncludingToday: daysLeftIncludingToday,
    todayLimit: todayLimit,
    aedLeftToday: aedLeftToday,
    pace: pace,
    historicalLimitsByDay: historicalLimitsByDay,
    cycleSummary: cycleSummary,
    liabilitySummary: liabilitySummary,
    wifeSummary: wifeSummary,
    monthlyBudget: monthlyBudget,
    categorySpentThisCycle: categorySpentThisCycle,
    planSummary: planSummary
  };
})();
