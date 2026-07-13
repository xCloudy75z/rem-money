var ImportSmsSheet = (function () {
  'use strict';

  // opts: { state, onCommit(rows) }
  //   rows: [{ amount, categoryId, dateISO, note, cycleId, byWife, createdAtISO }]
  // Model-driven: every edit is written back into m.items (resolved by idx), and
  // the preview always re-renders from the model — so a partial commit keeps the
  // owner's edits on the rows that remain.
  function open(opts) {
    var state = opts.state;
    var cats = Object.keys(state.categories).map(function (id) { return state.categories[id]; })
      .filter(function (c) { return !c.isArchived; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var cycles = Object.keys(state.cycles).map(function (id) { return state.cycles[id]; })
      .sort(function (a, b) { return b.startDate.localeCompare(a.startDate); });
    var activeCycleId = state.settings.activeCycleId;

    var m = { phase: 'paste', items: [], unrecognized: [], dirty: false, touched: {}, attemptedAdd: false };
    var lastCatId = '';

    // existing-txn dup keys (amount|NOTE|date|time)
    var existing = {};
    for (var tid in state.transactions) {
      var t = state.transactions[tid];
      var tm = (t.createdAt && t.createdAt.length >= 16) ? t.createdAt.slice(11, 16) : '';
      existing[_key(t.amount, t.note, t.date, tm)] = true;
    }

    var wrap = Sheet.open({
      contentHTML: _pasteHTML(),
      title: I18n.t('sms_title'),
      guard: function () {
        if (!m.dirty) { Sheet.close(); return; }
        ConfirmDialog.open({
          title: I18n.t('sms_discard_title'),
          text: I18n.t('sms_discard_text'),
          okLabel: I18n.t('sms_discard_ok'),
          danger: true
        }).then(function (ok) { if (ok) Sheet.close(); });
      }
    });
    function body() { return wrap.querySelector('.sheet-body'); }

    // ---- scan: text -> model ----
    function _scan(text) {
      var parsed = SmsParse.parse(text);
      m.unrecognized = parsed.unrecognized;
      m.items = parsed.rows.map(function (r, i) {
        var resolved = r.dateISO ? Calc.cycleIdForDate(state, r.dateISO) : null;
        var cObj = resolved ? state.cycles[resolved] : null;
        var group;
        if (r.kind === 'purchase' && r.status !== 'approved') group = 'notspend';
        else if (r.repeatOfIndex != null) group = 'repeat';
        else if (r.kind === 'purchase' && existing[_key(r.amount, r.note, r.dateISO, r.timeHHMM)]) group = 'repeat';
        else if (!r.dateISO) group = 'needs';                       // debits
        else if (!resolved || (cObj && cObj.archivedAt)) group = 'needs';   // back-dated / closed
        else group = 'purchase';
        return {
          idx: i, raw: r.raw, kind: r.kind, group: group,
          amount: r.amount, note: r.note, dateISO: r.dateISO || '', timeHHMM: r.timeHHMM,
          categoryId: '', byWife: false, include: (group === 'purchase'),
          cycleId: (group === 'purchase') ? resolved : (resolved || activeCycleId || '')
        };
      });
      m.phase = 'preview';
      body().innerHTML = _previewHTML();
      _syncRepeatChips();
      _refreshFooter();
    }

    // ---- paste phase (footer overrides the .sheet-footer 2-col grid) ----
    function _pasteHTML() {
      return '<div class="sheet-section">'
        + '<label>' + I18n.t('sms_paste_label') + '</label>'
        + '<textarea class="input" id="sms-text" rows="7" style="resize:vertical"></textarea>'
        + '<p style="color:var(--muted);font-size:12px;margin-top:8px;line-height:1.5">' + I18n.t('sms_paste_hint') + '</p>'
        + '</div>'
        + '<div class="sheet-footer" style="grid-template-columns:1fr"><button class="btn btn-primary btn-block" id="sms-scan">' + I18n.t('sms_scan') + '</button></div>';
    }

    // ---- preview render ----
    function _catOptions(sel) {
      return '<option value="">' + I18n.t('sms_choose_category') + '</option>'
        + cats.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>'
              + Format.escapeHTML((c.icon || '•') + ' ' + c.name) + '</option>';
          }).join('');
    }
    function _cycleOptions(sel) {
      return '<option value="">' + I18n.t('sms_choose_cycle') + '</option>'
        + cycles.map(function (c) {
            var label = Format.fmtDateShort(c.startDate) + ' → ' + Format.fmtDateShort(c.endDate) + (c.archivedAt ? ' ·closed' : '') + (c.id === activeCycleId ? ' ·now' : '');
            return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + label + '</option>';
          }).join('');
    }
    function _row(it) {
      var showCyc = (it.group === 'needs');   // only back-dated/closed/no-cycle rows pick a cycle
      return '<div class="sms-row" data-idx="' + it.idx + '">'
        + '<div class="sms-row-main">'
        +   '<label class="sms-inc-wrap">'
        +     '<input type="checkbox" class="sms-inc" aria-label="' + I18n.t('sms_include') + '"' + (it.include ? ' checked' : '') + '>'
        +     '<span class="sms-inc-box" aria-hidden="true">✓</span>'
        +   '</label>'
        +   '<input class="input sms-amt" type="number" min="0" inputmode="decimal" value="' + it.amount + '" aria-label="amount">'
        +   '<input class="input sms-date" type="date" value="' + it.dateISO + '" aria-label="date">'
        +   '<div class="sms-cat-wrap">'
        +     '<select class="input sms-cat" aria-label="category"' + (it.categoryId ? '' : ' data-empty') + '>' + _catOptions(it.categoryId) + '</select>'
        +     '<button type="button" class="chip sms-repeat" tabindex="0" hidden><span class="sms-repeat-lbl"></span></button>'
        +   '</div>'
        + '</div>'
        + '<input class="input sms-note" maxlength="280" value="' + Format.escapeHTML(it.note) + '" aria-label="note">'
        + '<div class="sms-row-opts">'
        +   '<label class="sms-wife"><span class="sms-wife-lbl">' + I18n.t('sms_wife') + '</span>'
        +     '<input type="checkbox" class="sms-wife-cb"' + (it.byWife ? ' checked' : '') + '>'
        +     '<span class="sms-switch" aria-hidden="true"></span></label>'
        +   (showCyc
            ? '<select class="input sms-cyc" aria-label="cycle">' + _cycleOptions(it.cycleId) + '</select>'
            : '<input type="hidden" class="sms-cyc" value="' + it.cycleId + '">')
        + '</div>'
        + '</div>';
    }
    function _group(key, titleKey) {
      var list = m.items.filter(function (it) { return it.group === key; });
      if (!list.length) return '';
      if (key === 'notspend') {
        var roRows = list.map(function (it) { return '<div class="sms-row ro">' + Format.escapeHTML(it.raw) + '</div>'; }).join('');
        return '<div class="section-h">' + I18n.t(titleKey) + '<span class="right">' + I18n.t('sms_group_readonly_note') + '</span></div>'
          + '<div class="sms-ro-block">' + roRows + '</div>';
      }
      var rows = list.map(_row).join('');
      return '<div class="section-h">' + I18n.t(titleKey) + '</div>' + rows;
    }
    function _counts() {
      var c = { purchase: 0, needs: 0, repeat: 0, notspend: 0 };
      m.items.forEach(function (it) { if (c[it.group] != null) c[it.group]++; });
      return c;
    }
    function _previewHTML() {
      var c = _counts();
      var unrec = m.unrecognized.length
        ? '<div class="section-h">' + I18n.t('sms_group_unrecognized') + '<span class="right">' + I18n.t('sms_group_readonly_note') + '</span></div>'
          + '<div class="sms-ro-block">'
          + m.unrecognized.map(function (l) { return '<div class="sms-row ro">' + Format.escapeHTML(l) + '</div>'; }).join('')
          + '</div>'
        : '';
      return '<div class="sheet-section">'
        + '<p style="color:var(--muted);font-size:12px;margin-bottom:10px">'
        + I18n.t('sms_summary', { p: c.purchase, n: c.needs, r: c.repeat, d: c.notspend, x: m.unrecognized.length }) + '</p>'
        + _group('purchase', 'sms_group_purchases')
        + _group('needs', 'sms_group_needs')
        + _group('repeat', 'sms_group_repeats')
        + _group('notspend', 'sms_group_notspend')
        + unrec
        + '</div>'
        + '<div class="sheet-footer" style="grid-template-columns:1fr;gap:6px">'
        + '<button type="button" class="btn btn-ghost" id="sms-blocker" style="display:none;font-size:12px;min-height:0;padding:4px 0;border:none;color:var(--red);text-align:start"></button>'
        + '<button class="btn btn-primary btn-block" id="sms-add"></button>'
        + '</div>';
    }

    // ---- model <-> DOM ----
    function _itemByIdx(idx) {
      for (var j = 0; j < m.items.length; j++) if (m.items[j].idx === idx) return m.items[j];
      return null;
    }
    function _writeBack(el) {
      var it = _itemByIdx(+el.getAttribute('data-idx'));
      if (!it) return;
      it.include = el.querySelector('.sms-inc').checked;
      var amt = parseFloat(el.querySelector('.sms-amt').value);
      it.amount = isFinite(amt) ? Math.round(amt * 100) / 100 : NaN;
      it.dateISO = el.querySelector('.sms-date').value;
      it.categoryId = el.querySelector('.sms-cat').value;
      el.querySelector('.sms-cat').toggleAttribute('data-empty', !it.categoryId);
      if (it.categoryId) lastCatId = it.categoryId;
      it.note = el.querySelector('.sms-note').value;
      it.byWife = el.querySelector('.sms-wife-cb').checked;
      var cyc = el.querySelector('.sms-cyc');
      if (cyc && cyc.tagName === 'SELECT') {
        // 'Needs your input' rows: owner picks the cycle explicitly.
        it.cycleId = cyc.value;
      } else {
        // Purchase/repeat rows have no picker — re-resolve the cycle from the
        // (possibly edited) date so a changed date can never mis-file into the
        // stale scan-time cycle. If it no longer lands in an open cycle, blank
        // the cycle so the row is blocked (gate) rather than filed wrongly.
        var rc = it.dateISO ? Calc.cycleIdForDate(state, it.dateISO) : null;
        var rcObj = rc ? state.cycles[rc] : null;
        it.cycleId = (rc && !(rcObj && rcObj.archivedAt)) ? rc : '';
      }
    }
    function _isValid(it) {
      return it.include && isFinite(it.amount) && it.amount > 0 && it.categoryId && it.dateISO && it.cycleId;
    }

    // ---- footer: gate + blocker + per-row highlight ----
    function _refreshFooter() {
      var addBtn = wrap.querySelector('#sms-add');
      var blocker = wrap.querySelector('#sms-blocker');
      if (!addBtn) return;
      var addable = 0, blocked = 0;
      wrap.querySelectorAll('.sms-row[data-idx]').forEach(function (el) {
        var it = _itemByIdx(+el.getAttribute('data-idx'));
        if (!it) return;
        var ok = _isValid(it);
        el.classList.toggle('included', it.include);
        el.classList.toggle('ok', it.include && ok);
        el.classList.toggle('blocked',
          it.include && !ok && (m.attemptedAdd || m.touched[el.getAttribute('data-idx')]));
        if (ok) addable++;
        else if (it.include) blocked++;
      });
      addBtn.textContent = I18n.t('sms_add_n', { n: addable });
      addBtn.disabled = addable === 0;
      blocker.textContent = blocked ? I18n.t('sms_blocked', { n: blocked }) : '';
      blocker.style.display = blocked ? '' : 'none';
      _syncRepeatChips();
    }
    function _scrollToFirstBlocked() {
      var first = wrap.querySelector('.sms-row.blocked');
      if (first) first.scrollIntoView({ block: 'center' });
    }
    function _syncRepeatChips() {
      var lc = lastCatId ? state.categories[lastCatId] : null;
      wrap.querySelectorAll('.sms-row[data-idx]').forEach(function (el) {
        var it = _itemByIdx(+el.getAttribute('data-idx'));
        var chip = el.querySelector('.sms-repeat'); if (!chip) return;
        var show = lc && it && it.include && it.categoryId !== lastCatId;
        chip.hidden = !show;
        if (show) chip.querySelector('.sms-repeat-lbl').textContent = (lc.icon || '•') + ' ' + lc.name;
      });
    }

    // ---- commit (from the model, not the DOM) ----
    function _commit() {
      m.attemptedAdd = true; _refreshFooter();
      var out = [], doneIdx = [];
      m.items.forEach(function (it) {
        if (!_isValid(it)) return;
        var time = it.timeHHMM || '12:00';
        out.push({
          amount: it.amount, categoryId: it.categoryId, dateISO: it.dateISO,
          note: it.note, cycleId: it.cycleId, byWife: it.byWife,
          createdAtISO: it.dateISO + 'T' + time + ':00.000Z'
        });
        doneIdx.push(it.idx);
      });
      if (!out.length) return;
      opts.onCommit(out);
      m.items = m.items.filter(function (it) { return doneIdx.indexOf(it.idx) === -1; });
      var left = m.items.filter(function (it) { return it.group !== 'notspend'; }).length;
      if (!left) { Sheet.close(); return; }
      body().innerHTML = _previewHTML();
      _syncRepeatChips();
      _refreshFooter();
      Toast.show({ message: I18n.t('sms_remaining', { added: out.length, left: left }), variant: 'success' });
    }

    // ---- events ----
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'sms-scan') {
        var text = wrap.querySelector('#sms-text').value;
        if (!text.trim()) { Toast.show({ message: I18n.t('sms_empty'), variant: 'error' }); return; }
        _scan(text);
        return;
      }
      if (t.id === 'sms-add') { _commit(); return; }
      if (t.closest && t.closest('.sms-repeat')) {
        var rrow = t.closest('.sms-row[data-idx]');
        var rsel = rrow.querySelector('.sms-cat');
        rsel.value = lastCatId; m.dirty = true;
        m.touched[rrow.getAttribute('data-idx')] = true;
        _writeBack(rrow); _refreshFooter(); return;
      }
      if (t.id === 'sms-blocker') { _scrollToFirstBlocked(); return; }
    });
    function _onEdit(e) {
      var el = e.target.closest && e.target.closest('.sms-row[data-idx]');
      if (!el) return;
      m.dirty = true;
      m.touched[el.getAttribute('data-idx')] = true;
      _writeBack(el);
      _refreshFooter();
    }
    wrap.addEventListener('input', _onEdit);
    wrap.addEventListener('change', _onEdit);
  }

  function _key(amount, note, dateISO, timeHHMM) {
    return Number(amount).toFixed(2) + '|' + String(note || '').trim().toUpperCase() + '|' + (dateISO || '') + '|' + (timeHHMM || '');
  }

  return { open: open };
})();
