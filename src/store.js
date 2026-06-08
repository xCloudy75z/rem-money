var Store = (function () {
  'use strict';

  var STORAGE_KEY = 'spending-tracker:v1';
  var BACKUP_KEY  = 'spending-tracker:lastAutoBackup';
  var THEME_KEY   = 'spending-tracker:theme-cache';

  function empty() {
    return {
      schemaVersion: 1,
      settings: {
        currency: 'AED',
        salaryDay: 25,
        theme: 'system',
        activeCycleId: null,
        locale: 'en',
        lastUsedCategoryId: null
      },
      categories: {},
      cycles: {},
      transactions: {}
    };
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }

  function parse(raw) {
    if (raw == null || raw === '') return { state: empty(), recovered: false };
    try {
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { state: empty(), recovered: true };
      return { state: obj, recovered: false };
    } catch (e) {
      return { state: empty(), recovered: true };
    }
  }

  function save(state, storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { ok: true };
    } catch (e) {
      var msg = (e && e.name === 'QuotaExceededError') ? 'quota' : (e && e.message) || 'unknown';
      return { ok: false, error: msg };
    }
  }

  function load(storage) {
    try { return parse(storage.getItem(STORAGE_KEY)); }
    catch (e) { return { state: empty(), recovered: true }; }
  }

  function snapshot(state, storage) {
    try { storage.setItem(BACKUP_KEY, JSON.stringify(state)); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  function restoreSnapshot(storage) {
    try {
      var raw = storage.getItem(BACKUP_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearSnapshot(storage) {
    try { storage.removeItem(BACKUP_KEY); } catch (e) {}
  }

  // ---- Immutable mutators: transactions ----
  function addTransaction(state, txn) {
    if (!txn || !txn.id) throw new Error('addTransaction: txn.id required');
    var s = clone(state);
    s.transactions[txn.id] = txn;
    return s;
  }

  function updateTransaction(state, id, patch) {
    if (!state.transactions[id]) throw new Error('updateTransaction: id not found');
    var s = clone(state);
    s.transactions[id] = Object.assign({}, s.transactions[id], patch);
    return s;
  }

  function deleteTransaction(state, id) {
    var s = clone(state);
    delete s.transactions[id];
    return s;
  }

  // ---- Immutable mutators: categories ----
  function addCategory(state, cat) {
    if (!cat || !cat.id || !cat.name) throw new Error('addCategory: id+name required');
    var lower = cat.name.toLowerCase().trim();
    for (var id in state.categories) {
      if (state.categories[id].name.toLowerCase().trim() === lower) {
        throw new Error('addCategory: duplicate name');
      }
    }
    var s = clone(state);
    s.categories[cat.id] = cat;
    return s;
  }

  function updateCategory(state, id, patch) {
    if (!state.categories[id]) throw new Error('updateCategory: id not found');
    if (patch.name) {
      var lower = patch.name.toLowerCase().trim();
      for (var oid in state.categories) {
        if (oid !== id && state.categories[oid].name.toLowerCase().trim() === lower) {
          throw new Error('updateCategory: duplicate name');
        }
      }
    }
    var s = clone(state);
    s.categories[id] = Object.assign({}, s.categories[id], patch);
    return s;
  }

  function archiveCategory(state, id) {
    return updateCategory(state, id, { isArchived: true });
  }

  function deleteCategory(state, id) {
    for (var tid in state.transactions) {
      if (state.transactions[tid].categoryId === id) {
        throw new Error('deleteCategory: category has transactions; reassign first');
      }
    }
    var s = clone(state);
    delete s.categories[id];
    return s;
  }

  function reassignCategory(state, fromId, toId) {
    if (!state.categories[toId]) throw new Error('reassignCategory: target id not found');
    var s = clone(state);
    for (var tid in s.transactions) {
      if (s.transactions[tid].categoryId === fromId) s.transactions[tid].categoryId = toId;
    }
    return s;
  }

  // ---- Immutable mutators: cycles ----
  function addCycle(state, cycle) {
    if (!cycle || !cycle.id) throw new Error('addCycle: id required');
    var s = clone(state);
    s.cycles[cycle.id] = cycle;
    return s;
  }

  function archiveCycle(state, id, archivedAt) {
    if (!state.cycles[id]) throw new Error('archiveCycle: id not found');
    var s = clone(state);
    s.cycles[id] = Object.assign({}, s.cycles[id], { archivedAt: archivedAt });
    return s;
  }

  // ---- Immutable mutators: settings ----
  function updateSettings(state, patch) {
    var s = clone(state);
    s.settings = Object.assign({}, s.settings, patch);
    if (typeof s.settings.salaryDay === 'number') {
      s.settings.salaryDay = Math.max(1, Math.min(28, Math.round(s.settings.salaryDay)));
    }
    return s;
  }

  return {
    STORAGE_KEY: STORAGE_KEY, BACKUP_KEY: BACKUP_KEY, THEME_KEY: THEME_KEY,
    empty: empty, clone: clone,
    parse: parse, save: save, load: load,
    snapshot: snapshot, restoreSnapshot: restoreSnapshot, clearSnapshot: clearSnapshot,
    addTransaction: addTransaction, updateTransaction: updateTransaction, deleteTransaction: deleteTransaction,
    addCategory: addCategory, updateCategory: updateCategory, archiveCategory: archiveCategory,
    deleteCategory: deleteCategory, reassignCategory: reassignCategory,
    addCycle: addCycle, archiveCycle: archiveCycle,
    updateSettings: updateSettings
  };
})();
