var HomeView = (function () {
  'use strict';

  function _txnRow(t, state) {
    var cat = (state.categories[t.categoryId]) || { name: '—', icon: '•', color: '#999' };
    var time = t.createdAt ? Format.fmtTime(t.createdAt) : '';
    var creditTag = t.isCredit ? ' · ' + I18n.t(t.liabilitySettled ? 'credit_paid_tag' : 'credit_tag') : '';
    var wifeTag = t.byWife ? ' · ' + I18n.t('wife_tag') : '';
    return '<li class="txn" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + creditTag + wifeTag + '</div>'
      +     '<div class="bot-line">' + time + (t.note ? (time ? ' · ' : '') + Format.escapeHTML(t.note) : '') + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2) + '</div>'
      +   '<div class="chev">›</div>'
      + '</li>';
  }

  // Pace line: cumulative spend (solid) vs. the even ideal line (dashed), drawn
  // as inline SVG. Actual line stops at today; dot marks where you stand.
  function _paceCardHTML(pace, currency) {
    var x0 = 38, x1 = 304, y0 = 16, y1 = 132;
    var totalDays = pace.totalDays;
    var maxCum = 0;
    pace.days.forEach(function (d) { if (d.cumulative !== null && d.cumulative > maxCum) maxCum = d.cumulative; });
    var yMax = Math.max(pace.budget, maxCum, 1);
    function fx(i) { return totalDays > 1 ? x0 + (i - 1) / (totalDays - 1) * (x1 - x0) : x0; }
    function fy(v) { return y1 - (v / yMax) * (y1 - y0); }
    function r2(n) { return Math.round(n * 100) / 100; }
    var pts = pace.days.filter(function (d) { return d.cumulative !== null; })
      .map(function (d) { return r2(fx(d.dayIndex)) + ',' + r2(fy(d.cumulative)); });
    var poly = pts.join(' ');
    var firstX = pts.length ? pts[0].split(',')[0] : r2(fx(1));
    var lastX = pts.length ? pts[pts.length - 1].split(',')[0] : r2(fx(1));
    var area = pts.length ? ('M' + firstX + ',' + y1 + ' L' + pts.join(' L') + ' L' + lastX + ',' + y1 + ' Z') : '';
    var todayX = r2(fx(pace.todayIndex));
    var todayY = r2(fy(pace.spentToDate));
    var ratio = pace.idealToDate > 0 ? pace.spentToDate / pace.idealToDate : 0;
    var st = ratio <= 1.02 ? { t: I18n.t('pace_on_track'), c: 'good' }
           : ratio <= 1.15 ? { t: I18n.t('pace_ahead'), c: 'warn' }
           : { t: I18n.t('pace_over'), c: 'bad' };
    var yMid = (y0 + y1) / 2;
    return '<div class="summary-card pace-card">'
      + '<div class="head"><span class="label">' + I18n.t('pace_line_title') + '</span>'
      +   '<span class="chip ' + st.c + '">' + st.t + '</span></div>'
      + '<svg viewBox="0 0 320 150" class="pace-svg" role="img" aria-label="Cumulative spend versus ideal pace">'
      +   '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '" class="p-grid"/>'
      +   '<line x1="' + x0 + '" y1="' + yMid + '" x2="' + x1 + '" y2="' + yMid + '" class="p-grid"/>'
      +   '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" class="p-grid"/>'
      +   '<text x="' + (x0 - 4) + '" y="' + (y0 + 3) + '" class="p-ax" text-anchor="end">' + Math.round(yMax).toLocaleString('en-US') + '</text>'
      +   '<text x="' + (x0 - 4) + '" y="' + y1 + '" class="p-ax" text-anchor="end">0</text>'
      +   '<line x1="' + todayX + '" y1="' + y0 + '" x2="' + todayX + '" y2="' + y1 + '" class="p-today"/>'
      +   '<line x1="' + r2(fx(1)) + '" y1="' + r2(fy(pace.days[0].ideal)) + '" x2="' + r2(fx(totalDays)) + '" y2="' + r2(fy(pace.budget)) + '" class="p-ideal"/>'
      +   (area ? '<path d="' + area + '" class="p-area"/>' : '')
      +   (poly ? '<polyline points="' + poly + '" class="p-line"/>' : '')
      +   '<circle cx="' + todayX + '" cy="' + todayY + '" r="4" class="p-dot"/>'
      +   '<text x="' + x0 + '" y="147" class="p-ax" text-anchor="start">' + Format.escapeHTML(Format.fmtDateShort(pace.days[0].day)) + '</text>'
      +   '<text x="' + todayX + '" y="147" class="p-ax" text-anchor="middle">' + I18n.t('today') + '</text>'
      +   '<text x="' + x1 + '" y="147" class="p-ax" text-anchor="end">' + Format.escapeHTML(Format.fmtDateShort(pace.days[totalDays - 1].day)) + '</text>'
      + '</svg>'
      + '<div class="pace-legend">'
      +   '<span class="pl"><span class="pl-sw line"></span>' + I18n.t('pace_you') + ' · ' + Format.fmtMoney(pace.spentToDate, currency) + '</span>'
      +   '<span class="pl"><span class="pl-sw dash"></span>' + I18n.t('pace_ideal') + ' · ' + Format.fmtMoney(pace.idealToDate, currency) + '</span>'
      + '</div>'
      + '</div>';
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
      ? '<div class="card-list"><ul class="txn-list">' + todaysTxns.map(function (t) { return _txnRow(t, state); }).join('') + '</ul></div>'
      : '<div class="empty-state"><div class="e-emoji">🌱</div><div class="e-title">' + I18n.t('no_spends_today') + '</div></div>';

    var daysLabel = daysLeft === 1 ? I18n.t('day_left') : I18n.t('days_left', { n: daysLeft });

    var pace = Calc.paceSeries(state, cyc.id, today);
    var paceCard = (pace && pace.budget > 0) ? _paceCardHTML(pace, state.settings.currency) : '';

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
      +   paceCard
      +   '<div class="section-h">' + I18n.t('today_label') + '</div>'
      +   todayList
      + '</div>';
  }

  return { render: render };
})();
