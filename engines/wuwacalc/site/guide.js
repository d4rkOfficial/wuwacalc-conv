/* 新手指引 · 悬浮窗
 * ---------------------------------------------------------------------------
 * 形态：右下角常驻圆形按钮「新手指引」→ 点击在按钮上方弹出悬浮窗，
 *       窗内是该页面自己的图文卡片（可上下滚动，不遮挡/不锁定页面交互）。
 * 内容：全部来自 guide-content.js 的 window.WC_GUIDE_CONTENT，本文件只负责渲染。
 * 按页切换：跟着站点导航走 —— 用户切页时窗体内容自动换成新页面的指引。
 *
 * 依赖：无。主题色走站点 CSS 变量（--accent-primary / --surface / --text-primary …），
 *       因此「炭黑甜酷粉」「暖白深海蓝」两套主题都会自动跟随。
 * 不上线的开关：window.WC_GUIDE_CONTENT.meta.showOnMobile / hintDot 见内容文件。
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__wcGuide) return;
  window.__wcGuide = true;

  var STYLE_ID = 'wc-guide-style';
  var FAB_SEL = '[data-wc-guide-fab]';
  var PANEL_SEL = '[data-wc-guide-panel]';
  var LB_SEL = '[data-wc-guide-lb]';
  var OPENED_KEY = 'wavecalc-guide-opened';
  var POS_KEY = 'wavecalc-guide-pos'; // 拖动后的位置（{left,top}），全局共用一份

  var CFG = window.WC_GUIDE_CONTENT || {};
  var META = CFG.meta || {};
  var PAGES = CFG.pages || {};

  var bound = false;
  var open = false;
  var shownPage = null;
  var curStep = {}; // 每个页面各自记住看到第几步（切页回来还在原处）

  /* ------------------------------- 工具 ------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 只允许 **加粗** 与 `行内代码`，先转义再替换，绝不会执行文案里的 HTML
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* --------------------------- 当前页面识别 --------------------------- */
  // 站点权威接口是 window.getWorkspacePhase()（buff-templates.js 导出），
  // 返回 setup / buff / axis / calc / check / overview / export / template。
  // 首页、公开库、个人主页、伤害矩阵是几个独立整页，用 body 类名区分。
  function currentPage() {
    try {
      var html = document.documentElement;
      var body = document.body;
      if (!body) return '';
      if (html.classList.contains('intro-pending') || body.classList.contains('intro-open')) return 'home';
      if (body.classList.contains('public-db-open')) return 'public-db';
      if (body.classList.contains('user-profile-open')) return 'profile';
      if (body.classList.contains('matrix-page-open')) return 'matrix';
      if (window.__wcMobile) return 'mobile';
      if (typeof window.getWorkspacePhase === 'function') {
        var p = window.getWorkspacePhase();
        // 「Buff 模板」在侧栏属配置选择一组，指引沿用配置选择那份
        if (p) return p === 'template' ? 'setup' : String(p);
      }
      // 兜底一：侧栏当前高亮项
      var btn = document.querySelector('.workspace-phase-btn.active[data-workspace-phase]');
      if (btn) return btn.getAttribute('data-workspace-phase');
      // 兜底二：#workspaceLayout 上的 phase-* 类
      var layout = document.getElementById('workspaceLayout');
      var m = layout && /phase-(setup|buff|axis|calc|check|export|template)/.exec(layout.className || '');
      if (m) return m[1] === 'template' ? 'setup' : m[1];
    } catch (e) { /* 识别失败就当作无内容页 */ }
    return '';
  }

  // 该页面有没有指引内容（内容文件里没有这个键 = 这页不显示按钮）
  function pageConfig(page) {
    if (!page) return null;
    var cfg = PAGES[page];
    if (!cfg || cfg.hidden) return null;
    return cfg;
  }

  /* ------------------------------- 样式 ------------------------------- */

  var css = [
    /* 右下角常驻按钮 —— **反色**处理（2026-09-27 主人反馈「看了好几遍发现不了」）
       ⚠️ 原来底色用的是 --surface，跟页面背景几乎同色 ⇒ 等于隐形。
       现在底色 = --text-primary、字色 = --bg-deepest：
         · 深色主题（炭黑/peach）⇒ 浅底深字
         · 浅色主题（暖白深海蓝）⇒ 深底浅字
       两套主题自动都是高反差，不需要为每套主题单独写规则。 */
    '.wc-guide-fab{position:fixed;right:22px;bottom:22px;z-index:1500;display:inline-flex;align-items:center;gap:8px;',
    'height:48px;padding:0 18px 0 14px;border-radius:999px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;',
    'border:1px solid color-mix(in srgb,var(--text-primary,#e8ecf5) 22%,transparent);',
    'background:var(--text-primary,#e8ecf5);color:var(--bg-deepest,#0d0f13);',
    'box-shadow:0 10px 26px rgba(0,0,0,.45),0 0 0 3px color-mix(in srgb,var(--text-primary,#e8ecf5) 12%,transparent);',
    'transition:color .2s,border-color .2s,background .2s,transform .2s,box-shadow .2s;}',
    '.wc-guide-fab:hover{color:var(--bg-deepest,#0d0f13);background:var(--accent-primary,#c9a84c);',
    'border-color:transparent;transform:translateY(-2px);box-shadow:0 14px 32px rgba(0,0,0,.5);}',
    '.wc-guide-fab[aria-expanded="true"]{background:var(--accent-primary,#c9a84c);color:var(--bg-deepest,#0d0f13);',
    'border-color:transparent;}',
    '.wc-guide-fab[hidden]{display:none;}',
    '.wc-guide-fab-icon{width:18px;height:18px;flex:0 0 auto;display:block;}',
    '.wc-guide-fab-label{white-space:nowrap;}',
    '.wc-guide-fab-dot{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;',
    'background:rgba(228,80,80,.98);box-shadow:0 0 0 2px var(--text-primary,#e8ecf5);}',
    '.wc-guide-fab-dot[hidden]{display:none;}',
    '.wc-guide-fab.is-hint{animation:wcGuidePulse 2.4s ease-in-out infinite;}',
    '@keyframes wcGuidePulse{0%,100%{box-shadow:0 10px 26px rgba(0,0,0,.45),0 0 0 3px color-mix(in srgb,var(--text-primary,#e8ecf5) 12%,transparent);}',
    '50%{box-shadow:0 10px 26px rgba(0,0,0,.45),0 0 0 11px color-mix(in srgb,var(--accent-primary,#c9a84c) 20%,transparent);}}',

    /* 悬浮窗体：贴在按钮上方，不铺满屏、不锁页面滚动，方便边看边操作 */
    '.wc-guide-panel{position:fixed;right:22px;bottom:86px;z-index:200100;',
    'width:min(440px,calc(100vw - 32px));max-height:min(74vh,760px);display:flex;flex-direction:column;overflow:hidden;',
    'border-radius:14px;outline:none;color:var(--text-primary,#e8ecf5);',
    'border:1px solid color-mix(in srgb,var(--accent-primary,#c9a84c) 26%,transparent);',
    'background:color-mix(in srgb,var(--surface,#161618) 96%,transparent);',
    'box-shadow:0 24px 70px rgba(0,0,0,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
    'animation:wcGuideIn .22s ease both;}',
    '@keyframes wcGuideIn{from{opacity:0;transform:translateY(10px) scale(.99);}to{opacity:1;transform:none;}}',

    /* 头部（同时是拖动把手） */
    '.wc-guide-head{flex:0 0 auto;display:flex;align-items:flex-start;gap:12px;padding:14px 15px 12px;',
    'border-bottom:1px solid var(--border,rgba(255,255,255,.08));cursor:move;',
    'touch-action:none;-webkit-user-select:none;user-select:none;}',
    '.wc-guide-head:active{cursor:grabbing;}',
    '.wc-guide-grip{flex:0 0 auto;width:10px;height:15px;margin-top:3px;opacity:.4;',
    'background-image:radial-gradient(currentColor 1px,transparent 1.3px);background-size:5px 5px;}',
    // ⚠️ 这里别写 animation:none：那会在开窗动画（wcGuideIn 220ms）还没跑完时把 transform 抽掉，
    //    窗体位置会跳一下（自检里表现为拖动位移比预期少十几像素）。
    '.wc-guide-panel.is-dragging{box-shadow:0 30px 80px rgba(0,0,0,.62);}',
    '.wc-guide-head-main{flex:1;min-width:0;}',
    '.wc-guide-kicker{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;',
    'color:color-mix(in srgb,var(--accent-primary,#c9a84c) 84%,transparent);}',
    '.wc-guide-title{margin:3px 0 0;font-size:16px;font-weight:700;line-height:1.35;}',
    '.wc-guide-intro{margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--text-muted,#8b94a8);}',
    '.wc-guide-close{flex:0 0 auto;width:30px;height:30px;border:none;border-radius:8px;background:transparent;',
    'color:var(--text-muted,#8b94a8);font-size:15px;line-height:1;cursor:pointer;padding:0;}',
    '.wc-guide-close:hover{color:var(--text-primary,#e8ecf5);background:var(--hover-bg,rgba(255,255,255,.06));}',

    /* 窗体内容 */
    '.wc-guide-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;',
    'padding:14px 15px 18px;display:flex;flex-direction:column;gap:12px;}',
    '.wc-guide-card{border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:13px 14px;',
    'background:var(--hover-bg,rgba(255,255,255,.04));}',
    '.wc-guide-card-title{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;font-size:14px;font-weight:700;line-height:1.5;}',
    '.wc-guide-num{flex:0 0 auto;font-size:11px;font-weight:800;letter-spacing:.06em;',
    'color:color-mix(in srgb,var(--accent-primary,#c9a84c) 90%,transparent);font-variant-numeric:tabular-nums;}',
    '.wc-guide-p{margin:0;font-size:13px;line-height:1.75;color:var(--text-secondary,#c6cfdd);}',
    '.wc-guide-p + .wc-guide-p{margin-top:8px;}',
    '.wc-guide-p b,.wc-guide-list b,.wc-guide-tip b{color:var(--text-primary,#e8ecf5);font-weight:600;}',
    '.wc-guide-tip b{color:var(--accent-primary,#c9a84c);}',
    '.wc-guide-p code,.wc-guide-list code{padding:1px 5px;border-radius:5px;font-size:12px;',
    'background:color-mix(in srgb,var(--accent-primary,#c9a84c) 12%,transparent);color:var(--accent-primary,#c9a84c);}',
    '.wc-guide-list{margin:9px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}',
    '.wc-guide-list li{position:relative;padding-left:16px;font-size:13px;line-height:1.7;color:var(--text-secondary,#c6cfdd);}',
    '.wc-guide-list li:before{content:"";position:absolute;left:4px;top:.62em;width:5px;height:5px;border-radius:50%;',
    'background:color-mix(in srgb,var(--accent-primary,#c9a84c) 80%,transparent);}',
    '.wc-guide-tip{margin:10px 0 0;padding:9px 11px;border-radius:9px;font-size:12.5px;line-height:1.7;',
    'color:var(--text-secondary,#c6cfdd);',
    'border:1px solid color-mix(in srgb,var(--accent-primary,#c9a84c) 30%,transparent);',
    'background:color-mix(in srgb,var(--accent-primary,#c9a84c) 9%,transparent);}',

    /* 指引图：max-width 而不是 width:100%，小图按原尺寸显示不放大（放大看细节交给点图） */
    '.wc-guide-fig{margin:11px 0 0;}',
    '.wc-guide-fig img{display:block;max-width:100%;width:auto;height:auto;border-radius:9px;cursor:zoom-in;',
    'border:1px solid var(--border,rgba(255,255,255,.1));background:rgba(0,0,0,.18);}',
    '.wc-guide-fig figcaption{margin-top:6px;font-size:11.5px;line-height:1.55;color:var(--text-muted,#8b94a8);}',
    '.wc-guide-fig.is-empty{margin:11px 0 0;min-height:104px;border-radius:9px;border:1px dashed',
    'color-mix(in srgb,var(--accent-primary,#c9a84c) 34%,transparent);display:flex;align-items:center;',
    'justify-content:center;text-align:center;padding:12px;font-size:12px;line-height:1.6;color:var(--text-muted,#8b94a8);}',

    /* 步骤条：点哪一步看哪一步（只有 1 步的页面自动不显示） */
    '.wc-guide-rail{flex:0 0 auto;display:flex;gap:6px;padding:10px 15px 0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;}',
    '.wc-guide-rail::-webkit-scrollbar{display:none;}',
    '.wc-guide-rail[hidden]{display:none;}',
    '.wc-guide-rail-item{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;',
    'cursor:pointer;font-family:inherit;font-size:12px;line-height:1;white-space:nowrap;',
    'border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--text-secondary,#c6cfdd);',
    'transition:color .18s,border-color .18s,background .18s;}',
    '.wc-guide-rail-item:hover{color:var(--text-primary,#e8ecf5);',
    'border-color:color-mix(in srgb,var(--accent-primary,#c9a84c) 45%,transparent);}',
    '.wc-guide-rail-item.is-active{font-weight:600;color:var(--accent-primary,#c9a84c);',
    'border-color:color-mix(in srgb,var(--accent-primary,#c9a84c) 60%,transparent);',
    'background:color-mix(in srgb,var(--accent-primary,#c9a84c) 13%,transparent);}',
    '.wc-guide-rail-no{font-weight:800;font-variant-numeric:tabular-nums;}',

    /* 一步之内的若干「点」 */
    '.wc-guide-step-title{margin:0 0 10px;font-size:13.5px;font-weight:700;line-height:1.5;color:var(--text-primary,#e8ecf5);}',
    '.wc-guide-point{display:flex;gap:9px;}',
    '.wc-guide-point + .wc-guide-point{margin-top:13px;padding-top:13px;',
    'border-top:1px dashed var(--border,rgba(255,255,255,.1));}',
    '.wc-guide-point-no{flex:0 0 auto;min-width:17px;height:17px;margin-top:2px;border-radius:50%;',
    'display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;',
    'font-variant-numeric:tabular-nums;color:var(--accent-primary,#c9a84c);',
    'background:color-mix(in srgb,var(--accent-primary,#c9a84c) 14%,transparent);}',
    '.wc-guide-point-main{flex:1;min-width:0;}',

    /* 底部：上一步 / 第 N 步 / 下一步 */
    '.wc-guide-foot{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 12px;',
    'border-top:1px solid var(--border,rgba(255,255,255,.08));font-size:11.5px;line-height:1.4;color:var(--text-muted,#8b94a8);}',
    '.wc-guide-foot-mid{flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.wc-guide-nav{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;',
    'cursor:pointer;font-family:inherit;font-size:12px;border:1px solid var(--border,rgba(255,255,255,.14));',
    'background:transparent;color:var(--text-secondary,#c6cfdd);transition:color .18s,border-color .18s;}',
    '.wc-guide-nav:hover:not(:disabled){color:var(--accent-primary,#c9a84c);',
    'border-color:color-mix(in srgb,var(--accent-primary,#c9a84c) 55%,transparent);}',
    '.wc-guide-nav:disabled{opacity:.35;cursor:default;}',
    // ⚠️ 必须显式写：类上的 display:inline-flex 会盖掉 [hidden] 的 UA 样式，
    //    只设 hidden 属性按钮照样看得见（自检只查属性就漏了这个，靠截图才发现）
    '.wc-guide-nav[hidden]{display:none;}',
    '.wc-guide-foot[hidden]{display:none;}',

    /* 点图放大 */
    '.wc-guide-lb{position:fixed;inset:0;z-index:200400;display:flex;align-items:center;justify-content:center;',
    'padding:24px;box-sizing:border-box;cursor:zoom-out;',
    'background:color-mix(in srgb,var(--bg-deepest,#0d0f13) 88%,transparent);',
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
    '.wc-guide-lb img{max-width:94vw;max-height:88vh;width:auto;height:auto;border-radius:10px;',
    'box-shadow:0 24px 70px rgba(0,0,0,.6);}',
    '.wc-guide-lb-hint{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:12px;',
    'color:var(--text-muted,#8b94a8);}',

    /* 窄屏 */
    '@media (max-width:640px){.wc-guide-fab{right:14px;bottom:14px;height:42px;padding:0 14px;}',
    '.wc-guide-fab-label{display:none;}',
    '.wc-guide-panel{right:12px;left:12px;width:auto;bottom:70px;max-height:70vh;}}',
    '@media (prefers-reduced-motion:reduce){.wc-guide-panel{animation:none;}.wc-guide-fab{transition:none;}',
    '.wc-guide-fab.is-hint{animation:none;}}',
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ------------------------------- 渲染 ------------------------------- */

  var ICON =
    '<svg class="wc-guide-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 6.5C10.6 5.2 8.7 4.5 6 4.5H3.5v13H6c2.7 0 4.6.7 6 2 1.4-1.3 3.3-2 6-2h2.5v-13H18c-2.7 0-4.6.7-6 2Z"/>' +
    '<path d="M12 6.5v13"/></svg>';

  function fabHtml() {
    return (
      ICON +
      '<span class="wc-guide-fab-label">新手指引</span>' +
      '<span class="wc-guide-fab-dot" data-wc-guide-dot hidden></span>'
    );
  }

  function figureHtml(img, index) {
    var src = img && img.src ? String(img.src) : '';
    var caption = img && (img.caption || img.alt) ? String(img.caption || img.alt) : '';
    if (!src) {
      // 占位态：图片还没到位时不要把 img 塞进去（否则显示破图）
      return (
        '<div class="wc-guide-fig is-empty">' +
        esc(caption ? '图片占位 · ' + caption : '图片占位 · 待补第 ' + index + ' 张指引图') +
        '</div>'
      );
    }
    return (
      '<figure class="wc-guide-fig">' +
      '<img src="' + esc(src) + '" alt="' + esc((img && img.alt) || caption || '') + '" loading="lazy" ' +
      'decoding="async" data-wc-guide-zoom="' + esc(src) + '">' +
      (caption ? '<figcaption>' + inline(caption) + '</figcaption>' : '') +
      '</figure>'
    );
  }

  // 把内容规范化成「步骤 → 点」两级：
  //   steps 优先（新写法），兼容旧的 sections；一个步骤上直接写的 text/images 等价于它只有一个点。
  function stepsOf(cfg) {
    var raw = asArray(cfg && cfg.steps && cfg.steps.length ? cfg.steps : cfg && cfg.sections);
    return raw.map(function (s) {
      s = s || {};
      var pts = asArray(s.points);
      if (!pts.length) pts = [s];
      return { title: s.title || '', short: s.short || '', points: pts, noNum: !!s.noNum };
    });
  }

  function pointHtml(pt, index, showNo) {
    pt = pt || {};
    var html = '<div class="wc-guide-point">';
    if (showNo) html += '<span class="wc-guide-point-no">' + (index + 1) + '</span>';
    html += '<div class="wc-guide-point-main">';
    asArray(pt.text).forEach(function (p) {
      if (p) html += '<p class="wc-guide-p">' + inline(p) + '</p>';
    });
    var bullets = asArray(pt.bullets);
    if (bullets.length) {
      html +=
        '<ul class="wc-guide-list">' +
        bullets.map(function (b) { return '<li>' + inline(b) + '</li>'; }).join('') +
        '</ul>';
    }
    if (pt.tip) html += '<div class="wc-guide-tip"><b>提示</b> · ' + inline(pt.tip) + '</div>';
    var images = asArray(pt.images);
    if (pt.image) images = [pt.image].concat(images);
    images.forEach(function (img, i) { html += figureHtml(img, i + 1); });
    return html + '</div></div>';
  }

  function bodyHtml(cfg, stepIndex) {
    var steps = stepsOf(cfg);
    if (!steps.length) {
      return (
        '<section class="wc-guide-card">' +
        '<h3 class="wc-guide-card-title"><span>内容整理中</span></h3>' +
        '<p class="wc-guide-p">这一页的指引文案与示意图还没填进来，很快就补上。</p>' +
        '</section>'
      );
    }
    var step = steps[Math.max(0, Math.min(stepIndex, steps.length - 1))];
    var showNo = step.points.length > 1; // 一步里只有一个点就不必显示「1」
    return (
      '<section class="wc-guide-card">' +
      (step.title ? '<h3 class="wc-guide-step-title">' + inline(step.title) + '</h3>' : '') +
      step.points.map(function (pt, i) { return pointHtml(pt, i, showNo); }).join('') +
      '</section>'
    );
  }

  function railHtml(steps, activeIndex) {
    if (steps.length < 2) return '';
    return steps
      .map(function (s, i) {
        return (
          '<button type="button" class="wc-guide-rail-item' + (i === activeIndex ? ' is-active' : '') + '"' +
          ' data-wc-guide-step="' + i + '"' + (i === activeIndex ? ' aria-current="step"' : '') + '>' +
          '<span class="wc-guide-rail-no">' + (i + 1) + '</span>' +
          '<span>' + inline(s.short || s.title || '第 ' + (i + 1) + ' 步') + '</span>' +
          '</button>'
        );
      })
      .join('');
  }

  /* ------------------------------- 开合 ------------------------------- */

  function fabEl() { return document.querySelector(FAB_SEL); }
  function panelEl() { return document.querySelector(PANEL_SEL); }

  function closeLightbox() {
    var lb = document.querySelector(LB_SEL);
    if (lb) lb.remove();
  }

  function openLightbox(src, alt) {
    closeLightbox();
    var lb = document.createElement('div');
    lb.className = 'wc-guide-lb';
    lb.setAttribute('data-wc-guide-lb', '');
    lb.innerHTML =
      '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '">' +
      '<div class="wc-guide-lb-hint">点击任意处关闭（Esc 也可）</div>';
    document.body.appendChild(lb);
  }

  function paint() {
    var page = currentPage();
    var cfg = pageConfig(page);
    var fab = fabEl();
    if (!fab) return;

    // 手机端默认不挂按钮（内容文件里可开）
    var allowMobile = META.showOnMobile === true;
    if (!cfg || (window.__wcMobile && !allowMobile)) {
      fab.hidden = true;
      if (open) closePanel();
      return;
    }
    fab.hidden = false;
    fab.setAttribute('title', cfg.label ? cfg.label + ' · 新手指引' : '新手指引');

    // 一次性提示点：用户打开过一次就永久消失
    var dot = fab.querySelector('[data-wc-guide-dot]');
    if (dot) {
      var hint = META.hintDot !== false && lsGet(OPENED_KEY) !== '1';
      dot.hidden = !hint;
      fab.classList.toggle('is-hint', hint);
    }

    // 窗体开着时切页 → 内容自动换成新页面的
    if (open && page !== shownPage) render(page, cfg);
  }

  function render(page, cfg) {
    var panel = panelEl();
    if (!panel || !cfg) return;
    shownPage = page;
    var steps = stepsOf(cfg);
    if (typeof curStep[page] !== 'number' || curStep[page] > steps.length - 1) curStep[page] = 0;
    var idx = curStep[page];
    panel.querySelector('[data-wc-guide-title]').textContent = cfg.label || '新手指引';
    var introEl = panel.querySelector('[data-wc-guide-intro]');
    introEl.textContent = cfg.intro || '';
    introEl.hidden = !cfg.intro;

    // 步骤条：只有一步的页面直接不显示
    var rail = panel.querySelector('[data-wc-guide-rail]');
    rail.hidden = steps.length < 2;
    rail.innerHTML = railHtml(steps, idx);

    var body = panel.querySelector('[data-wc-guide-body]');
    body.innerHTML = bodyHtml(cfg, idx);
    body.scrollTop = 0;

    // 底部：上一步 / 第 N 步 / 下一步（步骤标题在内容区已经有了，这里不重复）
    var mid = panel.querySelector('[data-wc-guide-foot-text]');
    if (mid) {
      mid.textContent = steps.length < 2 ? '当前页面：' + (cfg.label || page) : '第 ' + (idx + 1) + ' / ' + steps.length + ' 步';
    }
    var prev = panel.querySelector('[data-wc-guide-prev]');
    var next = panel.querySelector('[data-wc-guide-next]');
    var nav = panel.querySelector('[data-wc-guide-navwrap]');
    // 底栏始终留着（「当前页面：X」这行有用），只有一步时把上一步/下一步两个按钮收掉
    if (nav) nav.hidden = false;
    if (prev) { prev.hidden = steps.length < 2; prev.disabled = idx <= 0; }
    if (next) { next.hidden = steps.length < 2; next.disabled = idx >= steps.length - 1; }
    panel.scrollTop = 0;
  }

  // 跳到某一步（左右方向键、上一步/下一步、点步骤条都走这里）
  function gotoStep(i) {
    var page = currentPage();
    var cfg = pageConfig(page);
    if (!cfg) return false;
    var steps = stepsOf(cfg);
    if (steps.length < 2) return false;
    var n = Math.max(0, Math.min(steps.length - 1, i));
    if (n === curStep[page]) return false;
    curStep[page] = n;
    render(page, cfg);
    return true;
  }

  /* --------------------------- 可移动悬浮窗 --------------------------- */
  // 位置存在 localStorage（全局一份，不按页分）：拖过之后开关窗都停在原处。
  // 双击把手复位到默认的右下角；窗口缩放时会把窗体夹回可视区，保证关闭按钮永远够得着。
  function loadPos() {
    try {
      var raw = lsGet(POS_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (p && typeof p.left === 'number' && typeof p.top === 'number' && isFinite(p.left) && isFinite(p.top)) return p;
    } catch (e) { /* ignore */ }
    return null;
  }
  function clampPos(left, top, w, h) {
    var m = 8;
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var maxL = Math.max(m, vw - w - m);
    var maxT = Math.max(m, vh - h - m);
    return { left: Math.max(m, Math.min(maxL, Math.round(left))), top: Math.max(m, Math.min(maxT, Math.round(top))) };
  }
  // 只把 right/bottom 锚点换成明确的 left/top，**不夹取**：按下时窗体必须原地不动
  // （夹取只发生在拖动过程中，见 move()；按下就夹会让位移比手指少几像素）
  function 钉住(panel, left, top) {
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }
  // 把 right/bottom 锚点换成 left/top 明确坐标，并夹回可视区（还原位置/窗口缩放用）
  function 落位(panel, left, top) {
    var q = clampPos(left, top, panel.offsetWidth, panel.offsetHeight);
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = q.left + 'px';
    panel.style.top = q.top + 'px';
    return q;
  }
  function applyStoredPos() {
    var panel = panelEl();
    if (!panel) return false;
    var p = loadPos();
    if (!p) return false;
    落位(panel, p.left, p.top);
    return true;
  }
  function 复位位置() {
    try { localStorage.removeItem(POS_KEY); } catch (e) { /* ignore */ }
    var panel = panelEl();
    if (panel) { panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.bottom = ''; }
  }
  function reclampPanel() {
    var panel = panelEl();
    if (!panel || !panel.style.left) return; // 还在默认位置就交给 CSS
    落位(panel, parseFloat(panel.style.left) || 0, parseFloat(panel.style.top) || 0);
  }

  function bindDrag() {
    var panel = panelEl();
    if (!panel) return;
    var head = panel.querySelector('[data-wc-guide-head]');
    if (!head) return;
    // 双击把手 = 复位（拖飞了的逃生口）
    head.addEventListener('dblclick', function (e) {
      if (e.target.closest && e.target.closest('[data-wc-guide-close]')) return;
      复位位置();
    });
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.button !== undefined) return;
      if (e.target.closest && e.target.closest('[data-wc-guide-close]')) return;
      var r = panel.getBoundingClientRect();
      var sx = e.clientX, sy = e.clientY;
      var 起 = { left: r.left, top: r.top, w: r.width, h: r.height };
      var 动过 = false;
      panel.classList.add('is-dragging');
      钉住(panel, 起.left, 起.top); // 按下时原地不动，只把锚点换成明确坐标
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真实 pointerId */ }
      function move(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!动过 && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) 动过 = true;
        var q = clampPos(起.left + dx, 起.top + dy, 起.w, 起.h);
        panel.style.left = q.left + 'px';
        panel.style.top = q.top + 'px';
      }
      function up() {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        head.removeEventListener('pointercancel', up);
        panel.classList.remove('is-dragging');
        if (动过) {
          lsSet(POS_KEY, JSON.stringify({ left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0 }));
        }
      }
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      head.addEventListener('pointercancel', up);
      e.preventDefault();
    });
  }

  function openPanel() {
    var page = currentPage();
    var cfg = pageConfig(page);
    if (!cfg) return;
    closePanel();
    var panel = document.createElement('div');
    panel.className = 'wc-guide-panel';
    panel.setAttribute('data-wc-guide-panel', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'wcGuideTitle');
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML =
      '<div class="wc-guide-head" data-wc-guide-head title="按住拖动可移动（双击复位到右下角）">' +
      '<span class="wc-guide-grip" aria-hidden="true"></span>' +
      '<div class="wc-guide-head-main">' +
      '<span class="wc-guide-kicker">新手指引</span>' +
      '<h2 class="wc-guide-title" id="wcGuideTitle" data-wc-guide-title></h2>' +
      '<p class="wc-guide-intro" data-wc-guide-intro></p>' +
      '</div>' +
      '<button type="button" class="wc-guide-close" data-wc-guide-close aria-label="关闭新手指引">✕</button>' +
      '</div>' +
      '<div class="wc-guide-rail" data-wc-guide-rail hidden></div>' +
      '<div class="wc-guide-body" data-wc-guide-body></div>' +
      '<div class="wc-guide-foot" data-wc-guide-navwrap hidden>' +
      '<button type="button" class="wc-guide-nav" data-wc-guide-prev>‹ 上一步</button>' +
      '<span class="wc-guide-foot-mid" data-wc-guide-foot-text></span>' +
      '<button type="button" class="wc-guide-nav" data-wc-guide-next>下一步 ›</button>' +
      '</div>';
    document.body.appendChild(panel);
    open = true;
    render(page, cfg);
    applyStoredPos();
    bindDrag();
    var fab = fabEl();
    if (fab) fab.setAttribute('aria-expanded', 'true');
    lsSet(OPENED_KEY, '1');
    var dot = fab && fab.querySelector('[data-wc-guide-dot]');
    if (dot) dot.hidden = true;
    if (fab) fab.classList.remove('is-hint');
    try { panel.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function closePanel() {
    var panel = panelEl();
    if (panel) panel.remove();
    if (open) {
      var fab = fabEl();
      if (fab) {
        fab.setAttribute('aria-expanded', 'false');
        try { fab.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    }
    open = false;
    shownPage = null;
  }

  /* ------------------------------- 事件 ------------------------------- */

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-wc-guide-close]')) {
      closePanel();
      return;
    }
    // 步骤条 / 上一步 / 下一步
    var railBtn = t.closest('[data-wc-guide-step]');
    if (railBtn) {
      gotoStep(Number(railBtn.getAttribute('data-wc-guide-step')));
      return;
    }
    if (t.closest('[data-wc-guide-prev]')) {
      gotoStep((curStep[currentPage()] || 0) - 1);
      return;
    }
    if (t.closest('[data-wc-guide-next]')) {
      gotoStep((curStep[currentPage()] || 0) + 1);
      return;
    }
    var zoom = t.closest('[data-wc-guide-zoom]');
    if (zoom) {
      openLightbox(zoom.getAttribute('data-wc-guide-zoom'), zoom.getAttribute('alt'));
      return;
    }
    if (t.closest(LB_SEL) || t.closest('.wc-guide-lb')) {
      closeLightbox();
      return;
    }
    var fab = t.closest(FAB_SEL);
    if (fab) {
      if (open) closePanel();
      else openPanel();
      return;
    }
    // 点窗体以外的地方收起。例外：点侧栏导航不算「点外面」——
    // 用户看完这页的指引顺手切到下一页时，窗体留着并把内容换成新页面的。
    var onNav = !!(t.closest('#workspacePhaseBar') || t.closest('.app-sidenav') || t.closest('[data-workspace-phase]'));
    if (open && !t.closest(PANEL_SEL) && !onNav) closePanel();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (document.querySelector(LB_SEL) || document.querySelector('.wc-guide-lb')) {
        closeLightbox();
        e.stopPropagation();
        return;
      }
      if (open) {
        closePanel();
        e.stopPropagation();
      }
      return;
    }
    // ← / → 翻步骤：只在窗体开着、且焦点不在页面输入框里时接管
    if (!open) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var ae = document.activeElement;
    var inPanel = !!(ae && ae.closest && ae.closest(PANEL_SEL));
    if (!inPanel && ae && ae !== document.body) return;
    var page = currentPage();
    var cfg = pageConfig(page);
    if (!cfg) return;
    if (stepsOf(cfg).length < 2) return;
    if (gotoStep((curStep[page] || 0) + (e.key === 'ArrowRight' ? 1 : -1))) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /* --------------------------- 页面变化监听 --------------------------- */
  // 只盯几个稳定的容器，不监听整个 body 子树（避免拖慢本就吃紧的渲染）
  var observers = [];
  var scheduled = false;
  var watching = [];

  function watch(target, options) {
    if (!target) return;
    if (watching.indexOf(target) >= 0) return;
    watching.push(target);
    var mo = new MutationObserver(schedule);
    mo.observe(target, options);
    observers.push(mo);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () {
      scheduled = false;
      paint();
    });
  }

  function bindObservers() {
    watch(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    watch(document.body, { attributes: true, attributeFilter: ['class'] });
    watch(document.getElementById('workspaceLayout'), { attributes: true, attributeFilter: ['class'] });
    // 侧栏会被整段重建，.active 的切换也在这里发生
    watch(document.getElementById('workspacePhaseBar'), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', function () { schedule(); reclampPanel(); });
  }

  function boot() {
    if (!document.body) return;
    injectStyle();
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'wc-guide-fab';
    fab.setAttribute('data-wc-guide-fab', '');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', '新手指引');
    fab.innerHTML = fabHtml();
    // 初始先收起来，paint() 判断出本页有内容再显示，避免无内容页闪一下
    fab.hidden = true;
    document.body.appendChild(fab);
    bindEvents();
    bindObservers();
    paint();
    // 站点首屏是异步渲染的（导航/阶段稍后才就绪），补几次轻量复检
    window.setTimeout(paint, 300);
    window.setTimeout(paint, 1200);
    // 公开库 / 个人主页 / 引导页等是后挂的整页，容器不在时补挂一次监听
    window.setTimeout(bindObservers, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
