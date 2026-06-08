var HomeView = (function () {
  'use strict';

  function _txnRow(t, state) {
    var cat = (state.categories[t.categoryId]) || { name: '—', icon: '•', color: '#999' };
    var time = t.createdAt ? Format.fmtTime(t.createdAt) : '';
    return '<li class="txn" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
      +     '<div class="bot-line">' + time + (t.note ? (time ? ' · ' : '') + Format.escapeHTML(t.note) : '') + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2) + '</div>'
      +   '<div class="chev">›</div>'
      + '</li>';
  }

  function render(state, ctx) {
    var today = ctx.todayISO;
    var cyc = Calc.activeCycle(state);
    if (!cyc) return '<div class="app-body"><div class="empty-state">' + I18n.t('no_active_cycle') + '</div></div>';

    var left   = Calc.aedLeftToday(state, today, cyc.id);
    var spent  = Calc.todaySpent(state, today, cyc.id);
    var limit  = Calc.todayLimit(state, today, cyc.id);
    var daysLeft = Calc.daysLeftIncludingToday(cyc, today);
    var paceKey = Calc.pace(state, today, cyc.id);
    var paceLabel = paceKey === 'unknown' ? I18n.t('pace_unknown')
                  : paceKey === 'on-track' ? I18n.t('pace_on_track')
                  : paceKey === 'slightly-fast' ? I18n.t('pace_slightly_fast')
                  : I18n.t('pace_fast');
    var paceClass = paceKey === 'on-track' ? 'good' : paceKey === 'slightly-fast' ? 'warn' : paceKey === 'fast' ? 'bad' : '';
    var paceIcon  = paceKey === 'on-track' ? '🟢' : paceKey === 'slightly-fast' ? '🟡' : paceKey === 'fast' ? '🔴' : '';

    var heroClass = left < 0 ? 'hero-amount over' : 'hero-amount';
    var heroLabel = left < 0 ? I18n.t('hero_over') : I18n.t('hero_left');
    var heroAbs = Math.abs(left).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var heroCurrency = left < 0 ? '−AED' : 'AED';

    var todaysTxns = Object.values(state.transactions)
      .filter(function (t) { return t.cycleId === cyc.id && t.date === today; })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });

    var todayList = todaysTxns.length
      ? todaysTxns.map(function (t) { return _txnRow(t, state); }).join('')
      : '<li><div class="empty-state"><div class="e-emoji">🌱</div><div class="e-title">' + I18n.t('no_spends_today') + '</div></div></li>';

    var daysLabel = daysLeft === 1 ? I18n.t('day_left') : I18n.t('days_left', { n: daysLeft });

    return ''
      + '<header class="app-header">'
      +   '<div class="app-title">' + I18n.t('app_title') + ' <small>· ' + Format.fmtDateShort(cyc.startDate) + ' → ' + Format.fmtDateShort(cyc.endDate) + '</small></div>'
      +   '<button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙</button>'
      + '</header>'
      + '<div class="app-body">'
      +   '<div class="hero">'
      +     '<div class="hero-label">' + heroLabel + '</div>'
      +     '<div class="' + heroClass + '" id="hero-amount" aria-label="' + Math.abs(left).toFixed(2) + ' dirhams ' + (left < 0 ? 'over' : 'left to spend') + ' today">'
      +       '<span class="currency">' + heroCurrency + '</span>' + heroAbs
      +     '</div>'
      +     '<div class="hero-sub">' + I18n.t('spent_today') + ' ' + Format.fmtMoney(spent, state.settings.currency) + ' · of ' + Format.fmtMoney(limit, state.settings.currency) + ' limit</div>'
      +     '<div class="chip-row">'
      +       (paceLabel ? '<span class="chip ' + paceClass + '">' + (paceIcon ? paceIcon + ' ' : '') + paceLabel + '</span>' : '')
      +       '<span class="chip">' + daysLabel + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="section-h">' + I18n.t('today_label') + '</div>'
      +   '<ul class="txn-list">' + todayList + '</ul>'
      + '</div>';
  }

  return { render: render };
})();
