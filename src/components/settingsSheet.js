var SettingsSheet = (function () {
  'use strict';

  function _downloadBlob(content, type, filename) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJSON(state, todayISO, nowISO) {
    var payload = { app: 'spending-tracker', schemaVersion: 1, exportedAt: nowISO, state: state };
    _downloadBlob(JSON.stringify(payload, null, 2), 'application/json', 'spending-tracker-backup-' + todayISO + '.json');
  }

  function exportCSV(state, todayISO) {
    var rows = [['date', 'categoryName', 'amount', 'isRefund', 'isExcludedFromPace', 'onCredit', 'byWife', 'creditSettled', 'note', 'cycleStart', 'cycleEnd']];
    var sorted = Object.values(state.transactions).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    for (var i = 0; i < sorted.length; i++) {
      var t = sorted[i];
      var c = state.categories[t.categoryId] || { name: '?' };
      var cyc = state.cycles[t.cycleId] || { startDate: '', endDate: '' };
      var note = '"' + (t.note || '').replace(/"/g, '""') + '"';
      var name = '"' + c.name.replace(/"/g, '""') + '"';
      rows.push([t.date, name, Number(t.amount).toFixed(2), t.isRefund ? 'true' : 'false', t.isExcludedFromPace ? 'true' : 'false', t.isCredit ? 'true' : 'false', t.byWife ? 'true' : 'false', t.liabilitySettled ? 'true' : 'false', note, cyc.startDate, cyc.endDate]);
    }
    var csv = '﻿' + rows.map(function (r) { return r.join(','); }).join('\r\n');
    _downloadBlob(csv, 'text/csv;charset=utf-8', 'spending-tracker-export-' + todayISO + '.csv');
  }

  function _render(state) {
    var cyc = Calc.activeCycle(state);
    var theme = state.settings.theme;

    return ''
      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('cycle') + '</h3>'
      +   '<div class="settings-row"><span>' + I18n.t('cycle_budget') + '</span><button data-action="edit-budget">' + Format.fmtMoney(cyc ? cyc.startBudget : 0, state.settings.currency) + '</button></div>'
      +   '<div class="settings-row"><span>' + I18n.t('cycle_salary') + '</span><button data-action="edit-salary">' + state.settings.salaryDay + '</button></div>'
      +   (cyc ? '<div class="settings-row"><span>' + I18n.t('cycle_current') + '</span><span class="value">' + Format.fmtDateShort(cyc.startDate) + ' → ' + Format.fmtDateShort(cyc.endDate) + '</span></div>' : '')
      + '</div>'

      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('categories') + '</h3>'
      +   '<button class="btn btn-ghost btn-block" data-action="manage-categories">' + I18n.t('manage_categories') + '</button>'
      + '</div>'

      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('display') + '</h3>'
      +   '<div class="settings-row"><span>' + I18n.t('theme_label') + '</span>'
      +     '<div class="seg">'
      +       '<button class="' + (theme === 'light' ? 'active' : '') + '" data-action="theme" data-theme="light">' + I18n.t('theme_light') + '</button>'
      +       '<button class="' + (theme === 'dark' ? 'active' : '') + '" data-action="theme" data-theme="dark">' + I18n.t('theme_dark') + '</button>'
      +       '<button class="' + (theme === 'system' ? 'active' : '') + '" data-action="theme" data-theme="system">' + I18n.t('theme_system') + '</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="settings-row"><span>' + I18n.t('language') + '</span>'
      +     '<div class="seg">'
      +       '<button class="' + ((state.settings.locale || 'en') === 'en' ? 'active' : '') + '" data-action="lang" data-lang="en">' + I18n.t('lang_english') + '</button>'
      +       '<button class="' + (state.settings.locale === 'ar' ? 'active' : '') + '" data-action="lang" data-lang="ar">' + I18n.t('lang_arabic') + '</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="settings-row"><span>' + I18n.t('currency') + '</span><span class="value">' + Format.escapeHTML(state.settings.currency) + '</span></div>'
      + '</div>'

      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('backup') + '</h3>'
      +   '<button class="btn btn-block" data-action="export-json" style="margin-bottom:6px">⬇ ' + I18n.t('export_json') + '</button>'
      +   '<button class="btn btn-block" data-action="import-json" style="margin-bottom:6px">⬆ ' + I18n.t('import_json') + '</button>'
      +   '<button class="btn btn-block" data-action="export-csv" style="margin-bottom:6px">⬇ ' + I18n.t('export_csv') + '</button>'
      +   '<button class="btn btn-block" data-action="import-sms" style="margin-bottom:6px">' + I18n.t('sms_import_btn') + '</button>'
      +   '<input type="file" id="ss-import-input" accept="application/json,.json" style="display:none">'
      +   '<p style="color:var(--muted);font-size:12px;margin-top:10px;line-height:1.5">' + I18n.t('backup_tip') + '</p>'
      + '</div>'

      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('app_section') + '</h3>'
      +   '<button class="btn btn-block" data-action="refresh-app">' + I18n.t('refresh_app') + '</button>'
      +   '<p style="color:var(--muted);font-size:12px;margin-top:10px;line-height:1.5">' + I18n.t('refresh_app_help') + '</p>'
      + '</div>'

      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('danger_zone') + '</h3>'
      +   '<button class="btn btn-danger btn-block" data-action="reset-all">' + I18n.t('reset_all') + '</button>'
      + '</div>'

      + '<p style="text-align:center;color:var(--muted);font-size:11px;margin:18px 0 0">' + I18n.t('version') + '</p>';
  }

  function open(state, callbacks) {
    var wrap = Sheet.open({ contentHTML: _render(state), title: I18n.t('settings') });

    function rerender() {
      // Only update the body so the sticky chrome (handle + close) stays intact
      var body = wrap.querySelector('.sheet-body');
      if (body) body.innerHTML = _render(state);
    }

    function reopenSelf() { open(state, callbacks); }

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var btn = t.closest && t.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');

      if (action === 'edit-budget') {
        var cyc = Calc.activeCycle(state);
        if (!cyc) return;
        EditValueSheet.open({
          title: I18n.t('cycle_edit_budget'),
          label: I18n.t('cycle_budget') + ' (AED)',
          value: cyc.startBudget,
          type: 'number',
          inputmode: 'decimal',
          large: true,
          validate: function (v) { return (v > 0) ? null : 'Budget must be greater than zero.'; },
          onSave: function (v) { state = callbacks.onCycleBudget(v); },
          onClose: reopenSelf
        });
        return;
      }
      if (action === 'edit-salary') {
        EditValueSheet.open({
          title: I18n.t('cycle_edit_salary'),
          label: I18n.t('salary_day') + ' (1–28)',
          value: state.settings.salaryDay,
          type: 'number',
          inputmode: 'numeric',
          validate: function (v) { return (v >= 1 && v <= 28) ? null : 'Salary day must be between 1 and 28.'; },
          onSave: function (v) { state = callbacks.onSalaryDay(Math.round(v)); },
          onClose: reopenSelf
        });
        return;
      }
      if (action === 'manage-categories') {
        Sheet.close();
        callbacks.onManageCategories();
        return;
      }
      if (action === 'theme') {
        var theme = btn.getAttribute('data-theme');
        state = callbacks.onTheme(theme);
        rerender();
        return;
      }
      if (action === 'lang') {
        var lang = btn.getAttribute('data-lang');
        state = callbacks.onLang(lang);
        // Re-open Settings so the entire sheet re-renders in the new language + new direction
        open(state, callbacks);
        return;
      }
      if (action === 'export-json') { callbacks.onExportJSON(); return; }
      if (action === 'export-csv') { callbacks.onExportCSV(); return; }
      if (action === 'import-sms') { Sheet.close(); callbacks.onImportSms(); return; }
      if (action === 'import-json') {
        wrap.querySelector('#ss-import-input').click();
        return;
      }
      if (action === 'refresh-app') {
        callbacks.onRefreshApp();
        return;
      }
      if (action === 'reset-all') {
        ConfirmDialog.open({
          title: I18n.t('confirm_reset_title'),
          text: I18n.t('confirm_reset_text'),
          okLabel: I18n.t('reset_action'),
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          callbacks.onResetAll();
          Sheet.close();
        });
        return;
      }
    });

    wrap.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'ss-import-input') {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var parsed = JSON.parse(reader.result);
            var s = parsed.state || parsed;
            if (typeof s.startBudget !== 'number' && (typeof s.schemaVersion !== 'number' || !s.transactions)) {
              Toast.show({ message: I18n.t('toast_invalid_backup'), variant: 'error' });
              return;
            }
            callbacks.onRestore(s);
          } catch (err) {
            Toast.show({ message: I18n.t('toast_invalid_backup'), variant: 'error' });
          } finally {
            e.target.value = '';
          }
        };
        reader.readAsText(file);
      }
    });
  }

  return { open: open, exportJSON: exportJSON, exportCSV: exportCSV };
})();
