/* 移动精简首页：手机端默认登录 + 公开方案库/导入/出图/我的 大卡片。
 * 仅当 window.__wcMobile 为真（index.html 兼容守卫里检测）才渲染；PC 端不显示、不影响完整工作台。
 * 本文件不添加 'use strict'；一律显式 window 引用（避免跨文件裸标识符）。
 */
(function () {
  if (!window.__wcMobile) return;
  var NS = 'wc-mh-';
  function ensureStyle() {
    var style = document.getElementById('wc-mh-style');
    if (style) return;
    style = document.createElement('style');
    style.id = 'wc-mh-style';
    style.textContent =
      '.' + NS + 'overlay{position:fixed;inset:0;z-index:300000;background:radial-gradient(120% 80% at 50% 0%,#171b22,#07090d);color:#e9edf6;display:flex;flex-direction:column;overflow:auto;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);font-family:\'PingFang SC\',\'Microsoft YaHei\',system-ui,sans-serif;}' +
      '.' + NS + 'overlay .' + NS + 'head{padding:18px 20px 6px;display:flex;align-items:center;justify-content:space-between;}' +
      '.' + NS + 'brand{display:flex;align-items:center;gap:10px;}' +
      '.' + NS + 'brand img{width:34px;height:34px;object-fit:contain;}' +
      '.' + NS + 'brand b{font-size:18px;color:#f5c600;letter-spacing:1px;line-height:1;}' +
      '.' + NS + 'brand small{display:block;font-size:9px;color:#d8d2c6;letter-spacing:2px;margin-top:2px;}' +
      '.' + NS + 'login{font-size:12px;padding:6px 12px;border:1px solid rgba(0,230,230,.4);border-radius:999px;color:#00e6e6;background:rgba(0,230,230,.06);cursor:pointer;white-space:nowrap;}' +
      '.' + NS + 'title{padding:22px 20px 6px;font-size:20px;font-weight:700;letter-spacing:2px;}' +
      '.' + NS + 'sub{padding:0 20px 18px;font-size:12.5px;color:#9aa4b8;line-height:1.7;}' +
      '.' + NS + 'cards{padding:0 16px;display:flex;flex-direction:column;gap:12px;}' +
      '.' + NS + 'card{padding:18px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));display:flex;align-items:center;gap:14px;cursor:pointer;transition:border-color .15s,background .15s;}' +
      '.' + NS + 'card:active{border-color:rgba(245,198,0,.5);background:rgba(245,198,0,.06);}' +
      '.' + NS + 'card .' + NS + 'ic{width:44px;height:44px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;font-size:20px;background:rgba(245,198,0,.1);color:#f5c600;}' +
      '.' + NS + 'card .' + NS + 'c{flex:1;min-width:0;}' +
      '.' + NS + 'card .' + NS + 'c b{display:block;font-size:15.5px;color:#f5f6f7;}' +
      '.' + NS + 'card .' + NS + 'c span{font-size:12px;color:#9aa4b8;display:block;margin-top:2px;}' +
      '.' + NS + 'card .' + NS + 'ar{color:#7c8698;font-size:18px;}' +
      '.' + NS + 'foot{margin-top:auto;padding:18px 20px 8px;font-size:11px;color:#6b7488;line-height:1.7;}' +
      '.' + NS + 'foot b{color:#00e6e6;cursor:pointer;}' +
      '.' + NS + 'ranking{text-decoration:none;border-color:#dda4b766;background:linear-gradient(110deg,#dda4b718,#9cd9d509);}' +
      '.' + NS + 'ranking .' + NS + 'ic{color:#e9bdcd;background:#dda4b71c;font:700 18px Georgia,serif;}' +
      '.' + NS + 'ranking:focus-visible{outline:2px solid #dda4b7;outline-offset:3px;}';
    document.head.appendChild(style);
  }
  function dismissIntro() {
    // 手机端闸门已由 SiteIntro.start 跳过；这里再兜底移除一次，防遗漏（纯手动，不依赖 SiteIntro.enter）
    document.body.classList.remove('intro-open');
    document.documentElement.classList.remove('intro-pending');
    var root = document.getElementById('siteIntro');
    if (root) { root.hidden = true; if (root.parentNode) root.parentNode.removeChild(root); }
  }
  function render() {
    if (document.getElementById('wc-mobile-home')) return;
    ensureStyle();
    dismissIntro();
    function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
    var host = document.createElement('div');
    host.id = 'wc-mobile-home';
    host.className = NS + 'overlay';
    var user = (typeof window.Cloud !== 'undefined' && typeof Cloud.getUser === 'function') ? Cloud.getUser() : null;
    var loggedIn = !!user;
    var nick = (user && (user.display_name || user.nickname || user.username)) || '';
    host.innerHTML =
      '<div class="' + NS + 'head">' +
        '<div class="' + NS + 'brand"><img src="assets/brand/logo.png" alt=""><span><b>鳴算屋</b><small>WAVECALC</small></span></div>' +
        (loggedIn ? '<button class="' + NS + 'login" data-mh-profile>' + esc(nick || '已登录') + '</button>' : '<button class="' + NS + 'login" data-mh-login>登录 / 绑定</button>') +
      '</div>' +
      '<div class="' + NS + 'title">方案 · 榜单 · 出图</div>' +
      '<div class="' + NS + 'sub">浏览玩家分享的视频轴方案、一键导入，生成你的专属声骸分析卡。</div>' +
      '<div class="' + NS + 'cards">' +
        '<a class="' + NS + 'card ' + NS + 'ranking" href="leaderboard.html"><span class="' + NS + 'ic" aria-hidden="true">0+1</span><span class="' + NS + 'c"><b>0+1 角色榜单</b><span>基础轴 / 进阶轴 / 椰果轴 · 查看排名</span></span><span class="' + NS + 'ar" aria-hidden="true">↗</span></a>' +
        '<div class="' + NS + 'card" data-mh-pubdb><div class="' + NS + 'ic">📚</div><div class="' + NS + 'c"><b>公开方案库</b><span>浏览 / 搜索 玩家分享的配队方案</span></div><div class="' + NS + 'ar">›</div></div>' +
        '<div class="' + NS + 'card" data-mh-import><div class="' + NS + 'ic">⬇️</div><div class="' + NS + 'c"><b>导入方案</b><span>用分享码 / 文件导入到工作台</span></div><div class="' + NS + 'ar">›</div></div>' +
        '<div class="' + NS + 'card" data-mh-export><div class="' + NS + 'ic">🖼️</div><div class="' + NS + 'c"><b>出图</b><span>选一套方案生成声骸分析卡</span></div><div class="' + NS + 'ar">›</div></div>' +
        (loggedIn ? '' : '<div class="' + NS + 'card" data-mh-login><div class="' + NS + 'ic">👤</div><div class="' + NS + 'c"><b>登录 / 绑定库街区</b><span>同步个人声骸、上传分享方案</span></div><div class="' + NS + 'ar">›</div></div>') +
      '</div>' +
      '<div class="' + NS + 'foot">手机精简版 · 仅展示「榜单 / 浏览 / 导入 / 出图」。完整工作台（搭轴、配声骸）请点 <b data-mh-workspace>进入工作台</b>。</div>';
    document.body.appendChild(host);
    document.body.classList.add('wc-mobile-home-on');

    function goPubDb() {
      if (window.PublicDb && typeof window.PublicDb.open === 'function') window.PublicDb.open();
    }
    host.addEventListener('click', function (e) {
      var pub = e.target.closest('[data-mh-pubdb]');
      var imp = e.target.closest('[data-mh-import]');
      var exp = e.target.closest('[data-mh-export]');
      if (pub || imp || exp) {
        host.remove();
        document.body.classList.remove('wc-mobile-home-on');
        goPubDb();
        return;
      }
      var login = e.target.closest('[data-mh-login]');
      if (login) { if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth'); return; }
      var prof = e.target.closest('[data-mh-profile]');
      if (prof) { if (window.WaveCalcProfile && typeof WaveCalcProfile.open === 'function') WaveCalcProfile.open({}); return; }
      var ws = e.target.closest('[data-mh-workspace]');
      if (ws) { host.remove(); document.body.classList.remove('wc-mobile-home-on'); return; }
    });
  }
  // 手机端闸门已由 SiteIntro.start 跳过，此处立即渲染首页即可（defer 阶段 body 已就绪）。
  render();
})();
