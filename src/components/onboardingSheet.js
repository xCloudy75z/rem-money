var OnboardingSheet = (function () {
  'use strict';

  function open(onComplete) {
    var local = { seedCats: true };
    var html = ''
      + '<p style="margin:-4px 0 18px;color:var(--muted)">' + I18n.t('onboarding_intro') + '</p>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('onboarding_budget') + '</label>'
      +   '<input class="input input-lg" id="ob-budget" inputmode="decimal" value="12454.70">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('onboarding_salary_day') + '</label>'
      +   '<input class="input" id="ob-salary" inputmode="numeric" value="25" style="text-align:center; font-weight:600">'
      +   '<p style="font-size:12px;color:var(--muted);margin:6px 0 0">' + I18n.t('onboarding_salary_help') + '</p>'
      + '</div>'
      + '<div class="toggle-row" style="margin-bottom:12px">'
      +   '<span>' + I18n.t('onboarding_seed') + '<br><span style="font-size:11px;color:var(--muted)">' + I18n.t('onboarding_seed_help') + '</span></span>'
      +   '<button class="switch on" id="ob-seed" aria-pressed="true"></button>'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-ghost" id="ob-sample">' + I18n.t('load_sample') + '</button>'
      +   '<button class="btn btn-primary" id="ob-start">' + I18n.t('get_started') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('onboarding_title') });

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'ob-seed') {
        local.seedCats = !local.seedCats;
        t.classList.toggle('on', local.seedCats);
        t.setAttribute('aria-pressed', String(local.seedCats));
        return;
      }
      if (t.id === 'ob-start') {
        var b = Format.parseAmount(wrap.querySelector('#ob-budget').value);
        var s = parseInt(wrap.querySelector('#ob-salary').value, 10);
        if (!(b > 0)) { wrap.querySelector('#ob-budget').focus(); wrap.querySelector('#ob-budget').classList.add('error'); return; }
        if (!(s >= 1 && s <= 28)) { wrap.querySelector('#ob-salary').focus(); wrap.querySelector('#ob-salary').classList.add('error'); return; }
        Sheet.close();
        onComplete({ budget: b, salaryDay: s, seedCats: local.seedCats, loadSample: false });
        return;
      }
      if (t.id === 'ob-sample') {
        Sheet.close();
        onComplete({ budget: 12454.70, salaryDay: 25, seedCats: true, loadSample: true });
        return;
      }
    });
  }

  return { open: open };
})();
