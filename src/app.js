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
  var ui = { tab: 'home', viewingCycleId: null, planUnit: 'monthly' };
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
          byWife: false,
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
    else if (ui.tab === 'plan') html = PlanView.render(state, { todayISO: todayISO(), unit: ui.planUnit });
    else if (ui.tab === 'credit') html = LiabilitiesView.render(state, { todayISO: todayISO() });
    app.innerHTML = html + _renderTabbar() + _renderFab();
  }
  function _renderTabbar() {
    var owed = Calc.liabilitySummary(state).unpaidCount;
    var badge = owed > 0 ? '<span class="tab-badge">' + (owed > 99 ? '99+' : owed) + '</span>' : '';
    return '<nav class="tabbar">'
      + '<button class="tab ' + (ui.tab === 'home' ? 'active' : '') + '" data-tab="home"><div class="icon">⌂</div>' + I18n.t('tab_home') + '</button>'
      + '<button class="tab ' + (ui.tab === 'history' ? 'active' : '') + '" data-tab="history"><div class="icon">≣</div>' + I18n.t('tab_history') + '</button>'
      + '<button class="tab ' + (ui.tab === 'plan' ? 'active' : '') + '" data-tab="plan"><div class="icon">▤</div>' + I18n.t('tab_plan') + '</button>'
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
    var planUnitBtn = e.target.closest('[data-action="plan-unit"]');
    if (planUnitBtn) { ui.planUnit = planUnitBtn.getAttribute('data-unit') === 'yearly' ? 'yearly' : 'monthly'; render(); return; }
    var planAddCat = e.target.closest('[data-action="plan-add-cat"]');
    if (planAddCat) { _openAddCategory(); return; }
    var delCatBtn = e.target.closest('[data-del-cat-id]');
    if (delCatBtn) { _deleteCategoryFlow(delCatBtn.getAttribute('data-del-cat-id')); return; }
    var editCatRow = e.target.closest('[data-edit-cat-id]');
    if (editCatRow) { _openEditCategory(editCatRow.getAttribute('data-edit-cat-id')); return; }
    var cycChip = e.target.closest('[data-cycle-id]');
    if (cycChip) { ui.viewingCycleId = cycChip.getAttribute('data-cycle-id'); render(); return; }
    var payBtn = e.target.closest('[data-action="mark-paid"]');
    if (payBtn) { _markLiability(payBtn.getAttribute('data-liab-id'), true); return; }
    var unpayBtn = e.target.closest('[data-action="mark-unpaid"]');
    if (unpayBtn) { _markLiability(unpayBtn.getAttribute('data-liab-id'), false); return; }
    var payAll = e.target.closest('[data-action="mark-all-paid"]');
    if (payAll) { _markAllLiabilitiesPaid(); return; }
    var recordWifePay = e.target.closest('[data-action="record-wife-payment"]');
    if (recordWifePay) { _openWifePayment(null); return; }
    var wifePaidBtn = e.target.closest('[data-action="mark-wife-paid"]');
    if (wifePaidBtn) { _markWifeSettled(wifePaidBtn.getAttribute('data-liab-id'), true); return; }
    var wifeUnpaidBtn = e.target.closest('[data-action="mark-wife-unpaid"]');
    if (wifeUnpaidBtn) { _markWifeSettled(wifeUnpaidBtn.getAttribute('data-liab-id'), false); return; }
    var removeWifePay = e.target.closest('[data-action="remove-wife-payment"]');
    if (removeWifePay) { _removeWifePayment(removeWifePay.getAttribute('data-payment-id')); return; }
    var editRow = e.target.closest('[data-edit-id]');
    if (editRow) {
      var id = editRow.getAttribute('data-edit-id');
      var txn = state.transactions[id];
      if (txn) EditSheet.open(state, txn, function (action, patch) { _onEditAction(id, action, patch); });
      return;
    }
  });

  // Single source of truth for a new transaction's default shape. Used by manual
  // entry (_onAddTxn) and SMS import (_onImportSms) so the two can never drift.
  function _buildTxn(input) {
    var now = nowISO();
    return Object.assign({
      id: uuid('txn'),
      cycleId: state.settings.activeCycleId,
      createdAt: now, updatedAt: now,
      isExcludedFromPace: false,
      isCredit: false, liabilitySettled: false, settledAt: null,
      byWife: false, wifeSettled: false, wifeSettledAt: null
    }, input);
  }

  function _onAddTxn(txnInput) {
    var txn = _buildTxn(txnInput);
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

  // ===== Wife reimbursement =====
  function _openWifePayment(prefillAmount) {
    RecordPaymentSheet.open({
      prefillAmount: (typeof prefillAmount === 'number' && prefillAmount > 0) ? prefillAmount : null,
      todayISO: todayISO(),
      onSave: function (input) {
        var payment = {
          id: uuid('wpay'),
          amount: input.amount,
          date: input.date,
          note: input.note || '',
          createdAt: nowISO()
        };
        state = Store.addWifePayment(state, payment);
        persist(); render();
        var bal = Calc.wifeSummary(state).balance;
        Toast.show({
          message: I18n.t('toast_wife_payment_added', { balance: Format.fmtMoney(bal, state.settings.currency) }),
          variant: 'success'
        });
      }
    });
  }

  // "She paid" on a purchase marks THAT purchase reimbursed (moves it to the
  // Reimbursed section) — it no longer spawns a separate payment record, which
  // was what made amounts look duplicated and still-owed.
  function _markWifeSettled(id, settled) {
    var txn = state.transactions[id];
    if (!txn) return;
    state = Store.setWifeSettled(state, id, settled, nowISO());
    persist(); render();
    var bal = Calc.wifeSummary(state).balance;
    var money = Format.fmtMoney(bal, state.settings.currency);
    if (settled) {
      Toast.show({
        message: I18n.t('toast_wife_settled', { balance: money }),
        action: I18n.t('undo'),
        onAction: function () { _markWifeSettled(id, false); },
        variant: 'success'
      });
    } else {
      Toast.show({
        message: I18n.t('toast_wife_unsettled', { balance: money }),
        variant: 'success'
      });
    }
  }

  function _removeWifePayment(id) {
    var removed = state.wifePayments && state.wifePayments[id];
    if (!removed) return;
    state = Store.deleteWifePayment(state, id);
    persist(); render();
    var bal = Calc.wifeSummary(state).balance;
    Toast.show({
      message: I18n.t('toast_wife_payment_removed', { balance: Format.fmtMoney(bal, state.settings.currency) }),
      action: I18n.t('undo'),
      onAction: function () { state = Store.addWifePayment(state, removed); persist(); render(); },
      variant: 'success'
    });
  }

  // ===== Category management (Plan page) =====
  function _openAddCategory() {
    CategorySheet.open({
      title: I18n.t('add_category').replace(/^\+\s*/, ''),
      initial: { name: '', icon: '•', color: '#5ab19a', budget: 0, budgetPeriod: 'monthly' },
      onSave: function (input) {
        try {
          var cats = Object.values(state.categories);
          var maxOrder = cats.reduce(function (m, c) { return Math.max(m, c.order || 0); }, -1);
          var cat = {
            id: uuid('cat'), name: input.name, icon: input.icon || '•', color: input.color || '#5ab19a',
            order: maxOrder + 1, isArchived: false, createdAt: nowISO(),
            budget: input.budget || 0, budgetPeriod: input.budgetPeriod || 'monthly'
          };
          state = Store.addCategory(state, cat);
          persist(); render();
        } catch (err) { Toast.show({ message: err.message, variant: 'error' }); }
      }
    });
  }

  function _openEditCategory(id) {
    var cat = state.categories[id];
    if (!cat) return;
    CategorySheet.open({
      title: I18n.t('edit_category'),
      initial: { name: cat.name, icon: cat.icon, color: cat.color, budget: cat.budget || 0, budgetPeriod: cat.budgetPeriod || 'monthly' },
      onSave: function (input) {
        try { state = Store.updateCategory(state, id, input); persist(); render(); }
        catch (err) { Toast.show({ message: err.message, variant: 'error' }); }
      }
    });
  }

  function _deleteCategoryFlow(id) {
    var refCount = Object.values(state.transactions).filter(function (x) { return x.categoryId === id; }).length;
    if (refCount === 0) {
      state = Store.deleteCategory(state, id);
      persist(); render();
      return;
    }
    var others = Object.values(state.categories).filter(function (c) { return c.id !== id && !c.isArchived; });
    if (others.length === 0) { Toast.show({ message: 'Add another category first.', variant: 'error' }); return; }
    ReassignSheet.open({
      others: others,
      refCount: refCount,
      onPick: function (newCatId) {
        state = Store.reassignCategory(state, id, newCatId);
        state = Store.deleteCategory(state, id);
        persist(); render();
      }
    });
  }

  function _onImportSms(rows) {
    if (!rows || !rows.length) return;
    var built = rows.map(function (r) {
      return _buildTxn({
        cycleId: r.cycleId,
        categoryId: r.categoryId,
        date: r.dateISO,
        amount: r.amount,
        isRefund: false,
        byWife: !!r.byWife,
        note: (r.note || '').slice(0, 280),
        createdAt: r.createdAtISO || nowISO(),
        updatedAt: r.createdAtISO || nowISO()
      });
    }).filter(function (t) { return t.cycleId; });   // belt-and-suspenders; Store also throws on null cycleId
    if (!built.length) return;
    state = Store.addTransactions(state, built);
    persist(); render();
    var ids = built.map(function (t) { return t.id; });
    Toast.show({
      message: I18n.t('sms_added', { n: built.length }),
      action: I18n.t('undo'),
      duration: 8000,
      onAction: function () {
        var s = state;
        ids.forEach(function (id) { s = Store.deleteTransaction(s, id); });
        state = s; persist(); render();
      },
      variant: 'success'
    });
  }

  function _openImportSms() {
    ImportSmsSheet.open({ state: state, onCommit: _onImportSms });
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
      onManageCategories: function () { ui.tab = 'plan'; render(); },
      onImportSms: function () { _openImportSms(); },
      onRefreshApp: function () { _refreshApp(); },
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

  // ===== Force-refresh to the latest deployed version =====
  // The service worker caches the app shell, so after a deploy the user can be
  // stuck on an old build. This drops the caches and asks the SW to update, then
  // reloads — so the next load fetches the freshly deployed files. Data in
  // localStorage is untouched. Guarded so we reload exactly once.
  function _refreshApp() {
    Toast.show({ message: I18n.t('toast_refreshing') });
    var reloaded = false;
    function done() { if (reloaded) return; reloaded = true; location.reload(); }

    var clearCaches = (window.caches && caches.keys)
      ? caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).catch(function () {})
      : Promise.resolve();

    var updateSW = ('serviceWorker' in navigator)
      ? navigator.serviceWorker.getRegistration().then(function (reg) {
          if (!reg) return;
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          return reg.update();
        }).catch(function () {})
      : Promise.resolve();

    Promise.all([clearCaches, updateSW]).then(done, done);
    setTimeout(done, 1500); // safety net if a promise stalls (e.g. offline)
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
