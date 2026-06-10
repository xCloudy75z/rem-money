var App = (function () {
  'use strict';

  // ===== THE ONLY MODULE allowed to use new Date / crypto.randomUUID / Math.random =====
  // Local wall-clock ISO (NOT UTC): the rest of the app treats ISO strings as
  // literal components — todayISO() is local, fmtTime() reads HH:MM verbatim — so
  // createdAt must be local too, else displayed times are offset by the timezone.
  function nowISO() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.000Z';
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Convert a stored UTC instant (e.g. "...T10:00:00.000Z") to a local wall-clock
  // ISO matching nowISO's format. Used once by the timezone-repair migration.
  function localizeISO(utcISO) {
    if (!utcISO || typeof utcISO !== 'string') return utcISO;
    var d = new Date(utcISO);
    if (isNaN(d.getTime())) return utcISO;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.000Z';
  }
  function uuid(prefix) {
    var id;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) id = crypto.randomUUID();
    else id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return (prefix ? prefix + '-' : '') + id;
  }

  // ===== State + UI =====
  var state = null;
  var ui = { tab: 'home', viewingCycleId: null };
  var _pendingStorageRefresh = false;

  // ===== Lazy migration options (seed only generated if v0 path taken) =====
  function _migrateOpts() {
    var cachedSeed = null;
    var n = nowISO();
    return {
      now: n,
      idGen: uuid,
      localizeISO: localizeISO,
      empty: Store.empty,
      get defaultCategories() {
        if (!cachedSeed) cachedSeed = Seed.defaultCategories(n, uuid);
        return cachedSeed;
      }
    };
  }

  // ===== Cycle end date from salary day =====
  function _daysInMonth(y, m) {
    if (m === 2) return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function _cycleEndForStart(startISO, salaryDay) {
    var y = +startISO.slice(0, 4), m = +startISO.slice(5, 7), d = +startISO.slice(8, 10);
    var nextY = y, nextM = m;
    if (d >= salaryDay) { nextM = m + 1; if (nextM > 12) { nextM = 1; nextY = y + 1; } }
    var endD = salaryDay - 1, endY = nextY, endM = nextM;
    if (endD < 1) {
      endM -= 1; if (endM < 1) { endM = 12; endY -= 1; }
      endD = _daysInMonth(endY, endM);
    }
    return endY + '-' + String(endM).padStart(2, '0') + '-' + String(endD).padStart(2, '0');
  }

  // ===== Direction (RTL when locale = 'ar') =====
  function applyDir(locale) {
    var dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale || 'en');
  }

  // ===== Init =====
  function init() {
    var loaded = Store.load(window.localStorage);
    state = Migrate.migrate(loaded.state, _migrateOpts());
    I18n.setLocale(state.settings.locale || 'en');
    applyDir(state.settings.locale || 'en');

    if (loaded.recovered) {
      setTimeout(function () {
        Toast.show({
          message: I18n.t('banner_recovered'),
          action: I18n.t('banner_recovered_action'),
          duration: 10000,
          onAction: function () { _openSettings(); }
        });
      }, 100);
    }

    var firstRun = Object.keys(state.cycles).length === 0;
    if (firstRun) {
      ui.tab = 'landing';
      render();
      _registerSW();
      _listenStorageEvents();
      _listenVisibility();
      _listenSheetClosed();
      return;
    }

    ui.viewingCycleId = state.settings.activeCycleId;
    render();
    _checkCycleRollover();
    _registerSW();
    _listenStorageEvents();
    _listenVisibility();
    _listenSheetClosed();
  }

  function _onOnboardingComplete(opts) {
    var now = nowISO();
    var s = Store.empty();
    var otherId = null;
    if (opts.seedCats || opts.loadSample) {
      var cats = Seed.defaultCategories(now, uuid);
      s.categories = cats;
      for (var cid in cats) { if (cats[cid].name === 'Other') { otherId = cid; break; } }
    }
    var startDate = todayISO();
    var endDate = _cycleEndForStart(startDate, opts.salaryDay);
    var cycle = Seed.newCycle(startDate, endDate, opts.budget, now, uuid);
    s = Store.addCycle(s, cycle);
    s = Store.updateSettings(s, { salaryDay: opts.salaryDay, activeCycleId: cycle.id, lastUsedCategoryId: otherId });

    if (opts.loadSample) {
      var cats2 = Object.values(s.categories);
      for (var i = 0; i < 6; i++) {
        var cat = cats2[i % cats2.length];
        var amt = 20 + Math.round(Math.random() * 80);
        var txn = {
          id: uuid('txn'), cycleId: cycle.id, categoryId: cat.id, date: startDate,
          amount: amt, isRefund: false, isExcludedFromPace: false,
          note: 'Sample', createdAt: now, updatedAt: now
        };
        s = Store.addTransaction(s, txn);
      }
    }
    state = s;
    ui.tab = 'home';
    ui.viewingCycleId = cycle.id;
    persist(); render();
    setTimeout(_pulseHero, 50);
  }

  function _checkCycleRollover() {
    var cyc = Calc.activeCycle(state);
    if (!cyc) return;
    if (todayISO() > cyc.endDate) {
      CycleRolloverSheet.open(state, cyc, function (choice) { _rollCycle(cyc, choice); });
    }
  }

  function _rollCycle(oldCycle, choice) {
    var now = nowISO();
    var startDate = todayISO();
    var endDate = _cycleEndForStart(startDate, state.settings.salaryDay);
    var newCycle = Seed.newCycle(startDate, endDate, choice.sameBudget ? oldCycle.startBudget : choice.newBudget, now, uuid);
    var s = Store.archiveCycle(state, oldCycle.id, now);
    s = Store.addCycle(s, newCycle);
    s = Store.updateSettings(s, { activeCycleId: newCycle.id });
    state = s; ui.viewingCycleId = newCycle.id;
    persist(); render();
  }

  // ===== Persistence with debounce + flush =====
  var _saveTimer = null;
  var _pendingSave = false;

  function persist() {
    _pendingSave = true;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flushSave, 250);
  }
  function _flushSave() {
    if (!_pendingSave) return;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    _pendingSave = false;
    var r = Store.save(state, window.localStorage);
    if (!r.ok) Toast.show({ message: I18n.t('toast_save_failed'), variant: 'error' });
  }
  function _listenVisibility() {
    window.addEventListener('pagehide', _flushSave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') _flushSave();
    });
  }

  // ===== Cross-tab sync (queued while a sheet is open) =====
  function _applyStorageRefresh() {
    var loaded = Store.load(window.localStorage);
    state = Migrate.migrate(loaded.state, _migrateOpts());
    render();
    _pendingStorageRefresh = false;
  }
  function _listenStorageEvents() {
    window.addEventListener('storage', function (e) {
      if (e.key !== Store.STORAGE_KEY) return;
      if (Sheet.isOpen()) { _pendingStorageRefresh = true; return; }
      _applyStorageRefresh();
    });
  }
  function _listenSheetClosed() {
    document.addEventListener('sheet:closed', function () {
      if (_pendingStorageRefresh) _applyStorageRefresh();
    });
  }

  // ===== Theme =====
  function _applyTheme(theme) {
    var resolved = theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem(Store.THEME_KEY, theme); } catch (e) {}
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (state && state.settings.theme === 'system') _applyTheme('system');
  });

  // ===== Render =====
  function render() {
    var app = document.getElementById('app');
    var html = '';
    if (ui.tab === 'landing') {
      app.innerHTML = LandingView.render();
      return;
    }
    if (ui.tab === 'home') html = HomeView.render(state, { todayISO: todayISO() });
    else if (ui.tab === 'history') html = HistoryView.render(state, { todayISO: todayISO(), viewingCycleId: ui.viewingCycleId });
    else if (ui.tab === 'credit') html = LiabilitiesView.render(state, { todayISO: todayISO() });
    app.innerHTML = html + _renderTabbar() + _renderFab();
  }
  function _renderTabbar() {
    var owed = Calc.liabilitySummary(state).unpaidCount;
    var badge = owed > 0 ? '<span class="tab-badge">' + (owed > 99 ? '99+' : owed) + '</span>' : '';
    return '<nav class="tabbar">'
      + '<button class="tab ' + (ui.tab === 'home' ? 'active' : '') + '" data-tab="home"><div class="icon">⌂</div>' + I18n.t('tab_home') + '</button>'
      + '<button class="tab ' + (ui.tab === 'history' ? 'active' : '') + '" data-tab="history"><div class="icon">≣</div>' + I18n.t('tab_history') + '</button>'
      + '<button class="tab ' + (ui.tab === 'credit' ? 'active' : '') + '" data-tab="credit"><div class="icon">💳' + badge + '</div>' + I18n.t('tab_credit') + '</button>'
      + '</nav>';
  }
  function _renderFab() {
    return '<button class="fab" data-action="add-spend" aria-label="Add spend">'
      + '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">'
        + '<path d="M12 5 L12 19 M5 12 L19 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
      + '</svg>'
      + '</button>';
  }

  function _pulseHero() {
    var el = document.getElementById('hero-amount');
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  // ===== Event delegation =====
  document.addEventListener('click', function (e) {
    if (!(e.target instanceof Element)) return;
    var landingStart = e.target.closest('[data-action="landing-start"]');
    if (landingStart) { OnboardingSheet.open(_onOnboardingComplete); return; }
    var add = e.target.closest('[data-action="add-spend"]');
    if (add) { EntrySheet.open(state, todayISO(), _onAddTxn); return; }
    var settings = e.target.closest('[data-action="open-settings"]');
    if (settings) { _openSettings(); return; }
    var tab = e.target.closest('.tab[data-tab]');
    if (tab) { ui.tab = tab.getAttribute('data-tab'); if (ui.tab === 'history') ui.viewingCycleId = state.settings.activeCycleId; render(); return; }
    var cycChip = e.target.closest('[data-cycle-id]');
    if (cycChip) { ui.viewingCycleId = cycChip.getAttribute('data-cycle-id'); render(); return; }
    var payBtn = e.target.closest('[data-action="mark-paid"]');
    if (payBtn) { _markLiability(payBtn.getAttribute('data-liab-id'), true); return; }
    var unpayBtn = e.target.closest('[data-action="mark-unpaid"]');
    if (unpayBtn) { _markLiability(unpayBtn.getAttribute('data-liab-id'), false); return; }
    var payAll = e.target.closest('[data-action="mark-all-paid"]');
    if (payAll) { _markAllLiabilitiesPaid(); return; }
    var editRow = e.target.closest('[data-edit-id]');
    if (editRow) {
      var id = editRow.getAttribute('data-edit-id');
      var txn = state.transactions[id];
      if (txn) EditSheet.open(state, txn, function (action, patch) { _onEditAction(id, action, patch); });
      return;
    }
  });

  function _onAddTxn(txnInput) {
    var now = nowISO();
    var txn = Object.assign({
      id: uuid('txn'),
      cycleId: state.settings.activeCycleId,
      createdAt: now, updatedAt: now,
      isExcludedFromPace: false,
      isCredit: false, liabilitySettled: false, settledAt: null
    }, txnInput);
    state = Store.addTransaction(state, txn);
    state = Store.updateSettings(state, { lastUsedCategoryId: txn.categoryId });
    persist(); render(); _pulseHero();
    var cat = state.categories[txn.categoryId] || { name: '?' };
    Toast.show({
      message: I18n.t('toast_saved', {
        amount: Format.fmtMoney(txn.amount, state.settings.currency),
        cat: cat.name,
        left: Format.fmtMoney(Calc.aedLeftToday(state, todayISO(), state.settings.activeCycleId), state.settings.currency)
      }),
      variant: 'success'
    });
  }

  function _onEditAction(id, action, patch) {
    if (action === 'save') {
      state = Store.updateTransaction(state, id, Object.assign({ updatedAt: nowISO() }, patch));
      persist(); render(); _pulseHero();
      return;
    }
    if (action === 'delete') {
      var deleted = state.transactions[id];
      state = Store.deleteTransaction(state, id);
      persist(); render(); _pulseHero();
      Toast.show({
        message: I18n.t('toast_deleted', {
          left: Format.fmtMoney(Calc.aedLeftToday(state, todayISO(), state.settings.activeCycleId), state.settings.currency)
        }),
        action: I18n.t('undo'),
        onAction: function () { state = Store.addTransaction(state, deleted); persist(); render(); _pulseHero(); },
        variant: 'success'
      });
    }
  }

  // ===== Credit / liability settle =====
  function _markLiability(id, paid) {
    var txn = state.transactions[id];
    if (!txn) return;
    var now = nowISO();
    state = Store.updateTransaction(state, id, {
      liabilitySettled: paid, settledAt: paid ? now : null, updatedAt: now
    });
    persist(); render();
    var currency = state.settings.currency;
    var left = Calc.liabilitySummary(state).outstanding;
    if (paid) {
      Toast.show({
        message: I18n.t('toast_marked_paid', {
          amount: Format.fmtMoney(txn.amount, currency),
          left: Format.fmtMoney(left, currency)
        }),
        action: I18n.t('undo'),
        onAction: function () { _markLiability(id, false); },
        variant: 'success'
      });
    } else {
      Toast.show({
        message: I18n.t('toast_marked_unpaid', { left: Format.fmtMoney(left, currency) }),
        variant: 'success'
      });
    }
  }

  function _markAllLiabilitiesPaid() {
    var sum = Calc.liabilitySummary(state);
    if (!sum.items.length) return;
    ConfirmDialog.open({
      title: I18n.t('confirm_mark_all_paid_title'),
      text: I18n.t('confirm_mark_all_paid_text', {
        n: sum.items.length,
        amount: Format.fmtMoney(sum.outstanding, state.settings.currency)
      }),
      okLabel: I18n.t('credit_mark_all_paid')
    }).then(function (ok) {
      if (!ok) return;
      var ids = sum.items.map(function (t) { return t.id; });
      var now = nowISO();
      var s = state;
      ids.forEach(function (id) {
        s = Store.updateTransaction(s, id, { liabilitySettled: true, settledAt: now, updatedAt: now });
      });
      state = s;
      persist(); render();
      Toast.show({
        message: I18n.t('toast_marked_all_paid', { n: ids.length }),
        action: I18n.t('undo'),
        duration: 8000,
        onAction: function () {
          var s2 = state;
          ids.forEach(function (id) {
            if (s2.transactions[id]) s2 = Store.updateTransaction(s2, id, { liabilitySettled: false, settledAt: null, updatedAt: nowISO() });
          });
          state = s2; persist(); render();
        },
        variant: 'success'
      });
    });
  }

  function _openSettings() {
    SettingsSheet.open(state, {
      onCycleBudget: function (n) {
        var cyc = Calc.activeCycle(state);
        if (!cyc) return state;
        var s = Store.clone(state);
        s.cycles[cyc.id].startBudget = n;
        state = s;
        persist(); render(); return state;
      },
      onSalaryDay: function (d) {
        state = Store.updateSettings(state, { salaryDay: d });
        // Recompute active cycle's end date from new salaryDay
        var cyc = Calc.activeCycle(state);
        if (cyc) {
          var s = Store.clone(state);
          s.cycles[cyc.id].endDate = _cycleEndForStart(cyc.startDate, d);
          state = s;
        }
        persist(); render(); return state;
      },
      onAddCategory: function (input) {
        var cats = Object.values(state.categories);
        var maxOrder = cats.reduce(function (m, c) { return Math.max(m, c.order || 0); }, -1);
        var cat = {
          id: uuid('cat'), name: input.name, icon: input.icon || '•', color: input.color || '#5ab19a',
          order: maxOrder + 1, isArchived: false, createdAt: nowISO()
        };
        state = Store.addCategory(state, cat);
        persist(); render(); return state;
      },
      onUpdateCategory: function (id, patch) {
        state = Store.updateCategory(state, id, patch);
        persist(); render(); return state;
      },
      onDeleteCategory: function (id) {
        state = Store.deleteCategory(state, id);
        persist(); render(); return state;
      },
      onReassignAndDelete: function (fromId, toId) {
        state = Store.reassignCategory(state, fromId, toId);
        state = Store.deleteCategory(state, fromId);
        persist(); render(); return state;
      },
      onTheme: function (theme) {
        state = Store.updateSettings(state, { theme: theme });
        _applyTheme(theme);
        persist(); render(); return state;
      },
      onLang: function (lang) {
        state = Store.updateSettings(state, { locale: lang });
        I18n.setLocale(lang);
        applyDir(lang);
        persist(); render(); return state;
      },
      onExportJSON: function () { SettingsSheet.exportJSON(state, todayISO(), nowISO()); },
      onExportCSV: function () { SettingsSheet.exportCSV(state, todayISO()); },
      onRestore: function (importedRaw) {
        ConfirmDialog.open({
          title: I18n.t('confirm_replace_data_title'),
          text: I18n.t('confirm_replace_data_text'),
          okLabel: I18n.t('confirm_replace_action'),
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          Store.snapshot(state, window.localStorage);
          var migrated = Migrate.migrate(importedRaw, _migrateOpts());
          var v = Validate.validate(migrated);
          if (!v.ok) {
            Toast.show({ message: 'Invalid backup: ' + v.errors[0], variant: 'error' });
            return;
          }
          state = migrated;
          ui.viewingCycleId = state.settings.activeCycleId;
          persist(); render();
          Sheet.close();
          Toast.show({
            message: I18n.t('toast_restored'),
            action: I18n.t('undo'),
            duration: 8000,
            onAction: function () {
              var snap = Store.restoreSnapshot(window.localStorage);
              if (snap) {
                state = Migrate.migrate(snap, _migrateOpts());
                ui.viewingCycleId = state.settings.activeCycleId;
                persist(); render();
                Toast.show({ message: I18n.t('toast_restore_undone') });
              }
            },
            variant: 'success'
          });
        });
      },
      onResetAll: function () {
        Store.snapshot(state, window.localStorage);
        try { window.localStorage.removeItem(Store.STORAGE_KEY); } catch (e) {}
        state = Migrate.migrate(Store.empty(), _migrateOpts());
        ui.viewingCycleId = null;
        render();
        Toast.show({
          message: I18n.t('toast_reset_done'),
          action: I18n.t('undo'),
          duration: 30000,
          onAction: function () {
            var snap = Store.restoreSnapshot(window.localStorage);
            if (snap) {
              state = Migrate.migrate(snap, _migrateOpts());
              ui.viewingCycleId = state.settings.activeCycleId;
              persist(); render();
              Toast.show({ message: I18n.t('toast_restore_undone') });
            }
          },
          variant: 'success'
        });
        setTimeout(function () { OnboardingSheet.open(_onOnboardingComplete); }, 800);
      }
    });
  }

  // ===== Service worker =====
  function _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            Toast.show({
              message: I18n.t('toast_update_available'),
              action: I18n.t('reload'),
              duration: 8000,
              onAction: function () { nw.postMessage({ type: 'SKIP_WAITING' }); location.reload(); }
            });
          }
        });
      });
    }).catch(function (e) { console.warn('SW register failed:', e); });
  }

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init: init,
    _internal: { uuid: uuid, todayISO: todayISO, nowISO: nowISO },
    _migrateOpts: _migrateOpts
  };
})();
