# Import SMS sheet — UI/UX redesign spec (post multi-agent attack)

**Date:** 2026-07-13
**Source:** adversarial UI/UX workflow (14 confirmed directives, merged + conflict-resolved).
**Files:** `src/components/importSmsSheet.js`, `src/styles/main.css`, `src/i18n.js`.
**Constraints kept:** manual category pick per row; nothing dropped; both themes; ≥44px tap targets; no horizontal scroll at 360px; RTL-safe (logical props).

Conflicts already resolved (implement as written, no further decisions):
- Include control = custom `.sms-inc-box` ✓ glyph + `.included` card tint (supersedes native accent-color box).
- Wife control = full-width `.sms-switch`, space-between, `--text` label.
- Category gets its own full-width grid row via `grid-template-areas` (replaces fixed track widths and the `.sms-date{width:128px}` cap).
- Blocked = `border-inline-start` red rail + `--red-soft` fill + red border on offending controls (matches the `.ok` green rail). No `outline`, no raw `#e74c3c`.
- Read-only rows: muted `--surface-2` card, NO `opacity` (keep Unrecognized legible for hand re-entry).
- Repeat chip lives inside `.sms-cat-wrap`.

## 0. Tokens — add to `:root` (main.css, after the shadow vars ~line 10)
```css
--red-soft: rgba(231,76,60,0.14);
--green-soft: rgba(46,204,113,0.10);
```

## 1. Row markup — replace `_row()`
```js
function _row(it) {
  var showCyc = (it.group === 'needs');
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
```
Every native control (`.sms-inc`, `.sms-wife-cb`, `.sms-cyc`) still exists, so `_writeBack` reads unchanged.

## 2. Card + grid + compact inputs — REPLACE the current `.sms-row*` block wholesale
```css
.sms-row { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); padding: 8px 10px; margin-bottom: 8px; }
.sms-row.included { border-color: var(--accent); background: var(--accent-soft); }
.sms-row-main {
  display: grid;
  grid-template-columns: 44px 1fr 1fr;
  grid-template-areas: 'chk amt date' 'cat cat cat';
  gap: 8px; align-items: center;
}
.sms-inc-wrap { grid-area: chk; }
.sms-amt { grid-area: amt; }
.sms-date { grid-area: date; }
.sms-cat-wrap { grid-area: cat; display: flex; gap: 6px; align-items: center; }
.sms-cat { flex: 1; min-width: 0; }
.sms-row .input { min-height: 44px; padding: 8px 10px; font-size: 14px; border-radius: var(--radius-sm); }
.sms-amt { text-align: end; font-weight: 700; font-variant-numeric: tabular-nums; }
.sms-cat { font-weight: 600; }
.sms-date { color: var(--muted); }
.sms-row .sms-note { width: 100%; margin-top: 8px; }
.sms-row-opts { display: flex; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
.sms-row-opts .sms-cyc { flex: 1; min-width: 150px; }
```

## 3. Include control — 44px hit-area, themed ✓ box
```css
.sms-inc-wrap { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.sms-inc { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
.sms-inc-box { width: 26px; height: 26px; border-radius: 8px; border: 2px solid var(--border); background: var(--surface-2); display: inline-flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; line-height: 1; color: transparent; transition: background .12s, border-color .12s; }
.sms-inc:checked + .sms-inc-box { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.sms-inc:focus-visible + .sms-inc-box { outline: 2px solid var(--accent); outline-offset: 2px; }
```

## 4. Wife control — full-width labeled switch ≥44px
```css
.sms-wife { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: 1; min-height: 44px; padding: 0 4px; font-size: 14px; color: var(--text); cursor: pointer; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
.sms-wife-lbl { font-weight: 500; }
.sms-wife-cb { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
.sms-switch { width: 44px; height: 26px; border-radius: var(--radius-pill); background: var(--surface-3); position: relative; flex: 0 0 auto; transition: background .15s; }
.sms-switch::after { content: ''; position: absolute; top: 3px; inset-inline-start: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: inset-inline-start .15s; }
.sms-wife-cb:checked + .sms-switch { background: var(--accent); }
.sms-wife-cb:checked + .sms-switch::after { inset-inline-start: 21px; }
.sms-wife-cb:focus-visible + .sms-switch { outline: 2px solid var(--accent); outline-offset: 2px; }
```

## 5. State-model colors (append AFTER `.sms-row.included`)
```css
.sms-row:not(.blocked) .sms-cat[data-empty] { border-color: var(--amber); }
.sms-row.ok { border-inline-start: 3px solid var(--green); padding-inline-start: 7px; background: var(--green-soft); }
.sms-row.blocked { border-inline-start: 3px solid var(--red); padding-inline-start: 7px; background: var(--red-soft); outline: none; }
.sms-row.blocked .sms-cat, .sms-row.blocked .sms-amt { border-color: var(--red); }
```

## 6. State-model JS
(a) model init: `var m = { phase: 'paste', items: [], unrecognized: [], dirty: false, touched: {}, attemptedAdd: false };`
(b) `_onEdit` after `m.dirty = true;`: `m.touched[el.getAttribute('data-idx')] = true;`
(c) `_commit` first line (before building `out`): `m.attemptedAdd = true; _refreshFooter();`
(d) `_writeBack` after setting `it.categoryId`: `el.querySelector('.sms-cat').toggleAttribute('data-empty', !it.categoryId);`
(e) `_refreshFooter` — replace the single `el.classList.toggle('blocked', ...)` with:
```js
var ok = _isValid(it);
el.classList.toggle('included', it.include);
el.classList.toggle('ok', it.include && ok);
el.classList.toggle('blocked',
  it.include && !ok && (m.attemptedAdd || m.touched[el.getAttribute('data-idx')]));
```

## 7. Footer blocker as a focusable button
Markup — replace the `<p id="sms-blocker">` with:
```js
+ '<button type="button" class="btn btn-ghost" id="sms-blocker" style="display:none;font-size:12px;min-height:0;padding:4px 0;border:none;color:var(--red);text-align:start"></button>'
```
JS — in `_refreshFooter`, after setting `blocker.textContent`: `blocker.style.display = blocked ? '' : 'none';`
(The existing `t.id === 'sms-blocker' → _scrollToFirstBlocked()` branch now fires from a real button.)

## 8. Last-category accelerator (owner-initiated; NOT auto-guess)
- closure var near model: `var lastCatId = '';`
- `_writeBack` after category set: `if (it.categoryId) lastCatId = it.categoryId;`
- add fn (call at end of `_refreshFooter`, and after each `body().innerHTML = _previewHTML()`):
```js
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
```
- click branch (in the `wrap` click handler, before the blocker branch):
```js
if (t.closest && t.closest('.sms-repeat')) {
  var rrow = t.closest('.sms-row[data-idx]');
  var rsel = rrow.querySelector('.sms-cat');
  rsel.value = lastCatId; m.dirty = true;
  m.touched[rrow.getAttribute('data-idx')] = true;
  _writeBack(rrow); _refreshFooter(); return;
}
```
- CSS:
```css
.sms-repeat { min-height: 44px; cursor: pointer; flex: 0 0 auto; background: var(--accent-soft); border-color: var(--accent); color: var(--text); }
```

## 9. Read-only groups — de-emphasize
```css
.sms-ro-block { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 12px; }
.sms-row.ro { display: block; border: none; padding: 5px 0; font-size: 12px; color: var(--muted); word-break: break-word; }
```
- In `_group`, wrap the `notspend` read-only rows in `'<div class="sms-ro-block">' + rows + '</div>'`.
- In `_previewHTML`, wrap the unrecognized rows the same way.
- notspend + unrecognized headers get a muted badge via the existing `.right` slot:
  `'<div class="section-h">' + I18n.t(titleKey) + '<span class="right">' + I18n.t('sms_group_readonly_note') + '</span></div>'`

## 10. i18n keys (en + ar)
- `sms_include` — en "Include this purchase" / ar "أدرج هذه العملية"
- `sms_group_readonly_note` — en "not added" / ar "لم تُضَف"

## Coverage
44px targets ✓ · no 360px overflow (44px+1fr+1fr, category own row, opts flex-wrap) ✓ · both themes (all token-based; white knob mirrors shipped `.switch`) ✓ · manual category preserved ✓ · nothing dropped (`_isValid`/`_commit` logic unchanged) ✓ · RTL logical props ✓ · wall-of-red gone (`.blocked` gated behind touch/Add; amber cue until then) ✓.
