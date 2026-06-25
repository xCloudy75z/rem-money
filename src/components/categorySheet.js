var CategorySheet = (function () {
  'use strict';

  var PALETTE = ['#5ab19a','#e67e22','#3498db','#9b59b6','#e74c3c','#f5a623','#16a34a','#7f8c8d','#ec4899','#06b6d4'];

  // opts: { title, initial:{name,icon,color}, onSave(input) }
  function open(opts) {
    var init = opts.initial || { name: '', icon: '•', color: PALETTE[0], budget: 0, budgetPeriod: 'monthly' };
    var local = {
      name: init.name, icon: init.icon || '•', color: init.color || PALETTE[0],
      budget: (typeof init.budget === 'number' ? init.budget : 0),
      budgetPeriod: (init.budgetPeriod === 'yearly' ? 'yearly' : 'monthly')
    };

    var html = ''
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_name_label') + '</label>'
      +   '<input class="input" id="cs-name" maxlength="32" value="' + Format.escapeHTML(local.name) + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_icon_label') + '</label>'
      +   '<input class="input" id="cs-icon" maxlength="2" value="' + Format.escapeHTML(local.icon) + '" style="text-align:center;font-size:22px">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_color_label') + '</label>'
      +   '<div class="cat-chip-row" id="cs-colors">'
      +     PALETTE.map(function (c) {
            var sel = c.toLowerCase() === (local.color || '').toLowerCase();
            return '<button class="cat-chip ' + (sel ? 'selected' : '') + '" data-color="' + c + '" aria-label="' + c + '">'
              + '<span class="dot" style="background:' + c + ';width:18px;height:18px"></span>'
              + '</button>';
          }).join('')
      +   '</div>'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_budget_label') + '</label>'
      +   '<input class="input" id="cs-budget" type="number" min="0" inputmode="decimal" value="' + (local.budget > 0 ? local.budget : '') + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_budget_period') + '</label>'
      +   '<div class="seg" id="cs-period">'
      +     '<button type="button" class="' + (local.budgetPeriod === 'monthly' ? 'active' : '') + '" data-period="monthly">' + I18n.t('period_monthly') + '</button>'
      +     '<button type="button" class="' + (local.budgetPeriod === 'yearly' ? 'active' : '') + '" data-period="yearly">' + I18n.t('period_yearly') + '</button>'
      +   '</div>'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-ghost" data-close>' + I18n.t('cancel') + '</button>'
      +   '<button class="btn btn-primary" id="cs-save">' + I18n.t('save') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: opts.title, onClose: opts.onClose });
    setTimeout(function () { wrap.querySelector('#cs-name').focus(); }, 60);

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var col = t.closest && t.closest('[data-color]');
      if (col) {
        local.color = col.getAttribute('data-color');
        wrap.querySelectorAll('[data-color]').forEach(function (el) { el.classList.toggle('selected', el === col); });
        return;
      }
      var per = t.closest && t.closest('[data-period]');
      if (per) {
        local.budgetPeriod = per.getAttribute('data-period');
        wrap.querySelectorAll('#cs-period [data-period]').forEach(function (el) { el.classList.toggle('active', el === per); });
        return;
      }
      if (t.id === 'cs-save') {
        var name = (wrap.querySelector('#cs-name').value || '').trim();
        var icon = (wrap.querySelector('#cs-icon').value || '•').trim() || '•';
        if (!name) { wrap.querySelector('#cs-name').classList.add('error'); Toast.show({ message: 'Name is required.', variant: 'error' }); return; }
        var budgetRaw = parseFloat(wrap.querySelector('#cs-budget').value);
        var budget = (isFinite(budgetRaw) && budgetRaw > 0) ? Math.round(budgetRaw * 100) / 100 : 0;
        if (opts.onSave) opts.onSave({ name: name, icon: icon, color: local.color, budget: budget, budgetPeriod: local.budgetPeriod });
        Sheet.close();
      }
    });

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        wrap.querySelector('#cs-save').click();
      }
    });
  }

  return { open: open };
})();
