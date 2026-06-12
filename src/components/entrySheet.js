var EntrySheet = (function () {
  'use strict';

  function _yesterdayISO(todayISO) {
    var y = +todayISO.slice(0, 4), m = +todayISO.slice(5, 7), d = +todayISO.slice(8, 10);
    d -= 1;
    if (d < 1) {
      m -= 1; if (m < 1) { m = 12; y -= 1; }
      var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      d = dim[m - 1];
    }
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function open(state, todayISO, onSave) {
    var defaultCatId = state.settings.lastUsedCategoryId || Object.keys(state.categories)[0];
    var local = { categoryId: defaultCatId, date: todayISO, isRefund: false, isCredit: false, byWife: false };

    var cats = Object.values(state.categories)
      .filter(function (c) { return !c.isArchived; })
      .sort(function (a, b) { return a.order - b.order; });

    var html = ''
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('amount_aed') + '</label>'
      +   '<input class="input input-lg" id="es-amount" inputmode="decimal" placeholder="0.00">'
      +   '<div class="qa-row">'
      +     '<button class="qa" data-qa="10">+10</button>'
      +     '<button class="qa" data-qa="25">+25</button>'
      +     '<button class="qa" data-qa="50">+50</button>'
      +     '<button class="qa" data-qa="100">+100</button>'
      +   '</div>'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('category') + '</label>'
      +   '<div class="cat-chip-row" id="es-cats">'
      +     cats.map(function (c) {
            return '<button class="cat-chip ' + (c.id === local.categoryId ? 'selected' : '') + '" data-cat-id="' + c.id + '">'
              + '<span class="dot" style="background:' + Format.escapeHTML(c.color) + '"></span>'
              + Format.escapeHTML(c.icon || '•') + ' ' + Format.escapeHTML(c.name)
              + '</button>';
          }).join('')
      +   '</div>'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('when') + '</label>'
      +   '<div class="date-row">'
      +     '<button class="date-chip selected" data-date-pick="today">' + I18n.t('today') + '</button>'
      +     '<button class="date-chip" data-date-pick="yesterday">' + I18n.t('yesterday') + '</button>'
      +     '<button class="date-chip" data-date-pick="custom">📅 ' + I18n.t('pick_date') + '</button>'
      +     '<input type="date" id="es-date-input" style="display:none">'
      +   '</div>'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<button class="btn btn-ghost btn-block" id="es-note-toggle">' + I18n.t('add_note') + '</button>'
      +   '<input class="input" id="es-note" placeholder="' + Format.escapeHTML(I18n.t('note_placeholder')) + '" style="display:none; margin-top:8px" maxlength="280">'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('refund') + '</span>'
      +   '<button class="switch" id="es-refund" aria-pressed="false"></button>'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_credit') + '</span>'
      +   '<button class="switch" id="es-credit" aria-pressed="false"></button>'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_wife') + '</span>'
      +   '<button class="switch" id="es-wife" aria-pressed="false"></button>'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-ghost" id="es-add-another">' + I18n.t('save_and_add') + '</button>'
      +   '<button class="btn btn-primary" id="es-save">' + I18n.t('save') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('add_spend') });
    var amountEl = wrap.querySelector('#es-amount');
    amountEl.focus();

    // Enter on any input → Save
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        wrap.querySelector('#es-save').click();
      }
    });

    function doSave(stayOpen) {
      var amt = Format.parseAmount(amountEl.value);
      if (!(amt > 0)) { amountEl.focus(); amountEl.classList.add('error'); return; }
      var note = (wrap.querySelector('#es-note').value || '').trim();
      onSave({ amount: amt, categoryId: local.categoryId, date: local.date, note: note, isRefund: local.isRefund, isCredit: local.isCredit, byWife: local.byWife });
      if (stayOpen) {
        amountEl.value = ''; amountEl.classList.remove('error');
        wrap.querySelector('#es-note').value = '';
        amountEl.focus();
      } else {
        Sheet.close();
      }
    }

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var qa = t.closest && t.closest('[data-qa]');
      if (qa) { var cur = Format.parseAmount(amountEl.value) || 0; amountEl.value = (cur + Number(qa.getAttribute('data-qa'))).toFixed(2); amountEl.focus(); return; }
      var cat = t.closest && t.closest('[data-cat-id]');
      if (cat) {
        local.categoryId = cat.getAttribute('data-cat-id');
        wrap.querySelectorAll('.cat-chip').forEach(function (el) { el.classList.toggle('selected', el === cat); });
        return;
      }
      var dp = t.closest && t.closest('[data-date-pick]');
      if (dp) {
        wrap.querySelectorAll('[data-date-pick]').forEach(function (el) { el.classList.toggle('selected', el === dp); });
        var v = dp.getAttribute('data-date-pick');
        if (v === 'today') local.date = todayISO;
        else if (v === 'yesterday') local.date = _yesterdayISO(todayISO);
        else if (v === 'custom') {
          var di = wrap.querySelector('#es-date-input');
          di.style.display = ''; di.value = local.date;
          di.onchange = function () { local.date = di.value; };
          di.focus();
        }
        return;
      }
      if (t.id === 'es-note-toggle') {
        t.style.display = 'none';
        var ni = wrap.querySelector('#es-note'); ni.style.display = ''; ni.focus();
        return;
      }
      if (t.id === 'es-refund') {
        local.isRefund = !local.isRefund;
        t.classList.toggle('on', local.isRefund);
        t.setAttribute('aria-pressed', String(local.isRefund));
        return;
      }
      if (t.id === 'es-credit') {
        if (t.classList.contains('disabled')) return;
        local.isCredit = !local.isCredit;
        t.classList.toggle('on', local.isCredit);
        t.setAttribute('aria-pressed', String(local.isCredit));
        return;
      }
      if (t.id === 'es-wife') {
        local.byWife = !local.byWife;
        t.classList.toggle('on', local.byWife);
        t.setAttribute('aria-pressed', String(local.byWife));
        var creditBtn = wrap.querySelector('#es-credit');
        if (local.byWife) {
          local.isCredit = true;
          creditBtn.classList.add('on', 'disabled');
          creditBtn.setAttribute('aria-pressed', 'true');
        } else {
          creditBtn.classList.remove('disabled');
        }
        return;
      }
      if (t.id === 'es-save') { doSave(false); return; }
      if (t.id === 'es-add-another') { doSave(true); return; }
    });
  }

  return { open: open };
})();
