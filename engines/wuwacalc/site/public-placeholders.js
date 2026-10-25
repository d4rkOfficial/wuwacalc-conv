/* Public navigation placeholders. No data requests are made by these pages. */
(() => {
  'use strict';

  const page = document.getElementById('publicPlaceholderPage');
  if (!page) return;

  const title = page.querySelector('#publicPlaceholderTitle');
  const LEADERBOARD_ENABLED = true; // 0+1 leaderboard entry.
  const sections = {
    guides: '角色攻略统计',
    teams: '队伍数据演变',
  };
  let current = '';

  function syncNav() {
    document.querySelectorAll('[data-nav-public-placeholder]').forEach((button) => {
      if (LEADERBOARD_ENABLED && button.dataset.navPublicPlaceholder === 'guides') { const label = button.querySelector('.app-sidenav-label'); if (label && label.textContent !== '0+1角色榜单') label.textContent = '0+1角色榜单'; }
      const active = current === button.dataset.navPublicPlaceholder;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function close() {
    if (!current) return;
    current = '';
    page.hidden = true;
    document.body.classList.remove('public-section-open');
    syncNav();
  }

  function open(section) {
    if (LEADERBOARD_ENABLED && section === 'guides') { window.location.href = 'leaderboard.html'; return; }
    if (!Object.prototype.hasOwnProperty.call(sections, section)) return;
    if (window.PublicDb && typeof window.PublicDb.close === 'function') window.PublicDb.close();
    if (window.WaveCalcProfile && typeof window.WaveCalcProfile.close === 'function') window.WaveCalcProfile.close();
    if (window.Matrix && typeof window.Matrix.close === 'function') window.Matrix.close();

    current = section;
    title.textContent = sections[section];
    page.hidden = false;
    document.body.classList.add('public-section-open');
    document.body.classList.remove('sidenav-mobile-open');
    syncNav();
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
  }

  document.body.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav-public-placeholder]');
    if (nav) {
      event.preventDefault();
      event.stopPropagation();
      open(nav.dataset.navPublicPlaceholder);
      return;
    }
    if (event.target.closest('[data-public-placeholder-back]')) {
      event.preventDefault();
      close();
      return;
    }
    if (current && event.target.closest('[data-workspace-phase],[data-nav-public-db],[data-nav-matrix]')) close();
  }, true);

  new MutationObserver(() => {
    if (!current) return;
    if (document.body.matches('.public-db-open,.user-profile-open,.matrix-open,.matrix-page-open,.intro-open')) close();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const navHost = document.getElementById('workspacePhaseBar');
  if (navHost) new MutationObserver(syncNav).observe(navHost, { childList: true, subtree: true });
})();
