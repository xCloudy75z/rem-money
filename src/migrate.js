var Migrate = (function () {
  'use strict';

  // v0 = legacy single-file app shape:
  // { startBudget, startDate, endDate?, transactions: [{ id, datetime, amount, note }] }
  function isV0(obj) {
    return !!(obj
      && typeof obj.startBudget === 'number'
      && typeof obj.startDate === 'string'
      && Array.isArray(obj.transactions)
      && obj.schemaVersion == null);
  }

  function migrateV0toV1(v0, nowISO, idGen, defaultCategories) {
    var cycleId = idGen('cycle');
    var cycle = {
      id: cycleId,
      startDate: v0.startDate,
      endDate: v0.endDate || v0.startDate,
      startBudget: v0.startBudget,
      archivedAt: null,
      createdAt: nowISO
    };

    var otherId = null;
    for (var cid in defaultCategories) {
      if (defaultCategories[cid].name.toLowerCase() === 'other') { otherId = cid; break; }
    }

    var transactions = {};
    (v0.transactions || []).forEach(function (t) {
      var newId = idGen('txn');
      var iso = t.datetime || (t.date ? t.date + 'T00:00:00.000Z' : nowISO);
      var dateOnly = iso.slice(0, 10);
      transactions[newId] = {
        id: newId,
        cycleId: cycleId,
        categoryId: otherId,
        date: dateOnly,
        amount: Math.abs(Number(t.amount) || 0),
        isRefund: false,
        isExcludedFromPace: false,
        note: t.note || '',
        createdAt: iso,
        updatedAt: iso
      };
    });

    var cycles = {};
    cycles[cycleId] = cycle;

    return {
      schemaVersion: 1,
      settings: {
        currency: 'AED',
        salaryDay: 25,
        theme: 'system',
        activeCycleId: cycleId,
        locale: 'en',
        lastUsedCategoryId: otherId
      },
      categories: defaultCategories,
      cycles: cycles,
      transactions: transactions
    };
  }

  // One-time timezone repair. Early builds stamped createdAt/updatedAt as UTC
  // ISO strings, while the rest of the app reads ISO strings as literal local
  // wall-clock — so historical times displayed offset by the timezone.
  // Convert each stored UTC instant to a local wall-clock ISO via the
  // injected `localizeISO` (app.js owns the only Date), gated by a settings flag
  // so it runs exactly once and never double-shifts already-local entries.
  function localizeTimestamps(s, localizeISO) {
    var txns = s.transactions || {};
    for (var id in txns) {
      var t = txns[id];
      if (!t) continue;
      if (t.createdAt) t.createdAt = localizeISO(t.createdAt);
      if (t.updatedAt) t.updatedAt = localizeISO(t.updatedAt);
    }
    s.settings = s.settings || {};
    s.settings.localTimestamps = true;
    return s;
  }

  function migrate(state, options) {
    if (!state || typeof state !== 'object') return options.empty();

    var s;
    if (isV0(state)) {
      s = migrateV0toV1(state, options.now, options.idGen, options.defaultCategories);
    } else {
      s = JSON.parse(JSON.stringify(state));
      s.schemaVersion = s.schemaVersion || 1;
      s.settings = s.settings || {};
      if (s.settings.currency == null) s.settings.currency = 'AED';
      if (s.settings.salaryDay == null) s.settings.salaryDay = 25;
      if (s.settings.theme == null) s.settings.theme = 'system';
      if (s.settings.locale == null) s.settings.locale = 'en';
      if (s.settings.lastUsedCategoryId === undefined) s.settings.lastUsedCategoryId = null;
      if (s.settings.activeCycleId === undefined) s.settings.activeCycleId = null;
      s.categories = s.categories || {};
      s.cycles = s.cycles || {};
      s.transactions = s.transactions || {};
    }

    if (!s.settings.localTimestamps && typeof options.localizeISO === 'function') {
      s = localizeTimestamps(s, options.localizeISO);
    }

    // Backfill credit/liability fields so spends recorded before the Credit
    // tracker existed (and old JSON backups) load cleanly. Idempotent: only
    // fills when the field is absent, so already-tagged spends are untouched.
    var txns = s.transactions || {};
    for (var tid in txns) {
      var t = txns[tid];
      if (!t) continue;
      if (t.isCredit === undefined) t.isCredit = false;
      if (t.liabilitySettled === undefined) t.liabilitySettled = false;
      if (t.settledAt === undefined) t.settledAt = null;
    }

    return s;
  }

  return { migrate: migrate, migrateV0toV1: migrateV0toV1, localizeTimestamps: localizeTimestamps, isV0: isV0 };
})();
