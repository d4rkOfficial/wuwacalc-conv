/* ============================================================
 * axis-chart-maker.js · 制作轴图（本地 v1）
 * 独立全屏页：选当前队伍角色 → 点击键位 / 实录键位 → 出图。
 * 设计依据：2026-09-10 站长确认的轴图版式（无音波、浅色键帽）。
 * 接入方式：轴编辑页「模板专区」右侧新增「制作轴图」按钮。
 * 依赖：html-to-image 导出能力（window.__WC.ensureHtmlToImage）。
 * ============================================================ */
(function () {
  var AXM_KEY = 'wuwacalc_axis_chart_v1';
  var MAX_CHARS = 3;
  var holdTimer = null;
  var holdFired = false;

  var ui = { host: null, recording: false, drag: null, suppressClick: false };

  var DEFS = [
    '<clipPath id="axm-mc-l"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z"/></clipPath>',
    '<clipPath id="axm-mc-lh"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z"/></clipPath>',
    '<clipPath id="axm-mc-r"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z"/></clipPath>',
    '<symbol id="axm-mouse-l" viewBox="0 0 30 44"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="#f6f8fb"/><rect x="0" y="0" width="15" height="44" fill="#ffd54f" clip-path="url(#axm-mc-l)"/><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="none" stroke="#39424c" stroke-width="2"/><path d="M15 2v14" stroke="#39424c" stroke-width="2"/><circle cx="15" cy="20.5" r="3.6" fill="none" stroke="#39424c" stroke-width="1.8"/></symbol>',
    '<symbol id="axm-mouse-lh" viewBox="0 0 30 44"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="#f6f8fb"/><rect x="0" y="0" width="15" height="44" fill="#e5534b" clip-path="url(#axm-mc-lh)"/><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="none" stroke="#39424c" stroke-width="2"/><path d="M15 2v14" stroke="#39424c" stroke-width="2"/><path d="M7.2 26.5v7M5 30.6l2.2 2.4 2.2-2.4" fill="none" stroke="#39424c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>',
    '<symbol id="axm-mouse-r" viewBox="0 0 30 44"><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="#f6f8fb"/><rect x="15" y="0" width="15" height="44" fill="#4da3ff" clip-path="url(#axm-mc-r)"/><path d="M15 2C7.82 2 2 7.82 2 15v14c0 7.18 5.82 13 13 13s13-5.82 13-13V15C28 7.82 22.18 2 15 2Z" fill="none" stroke="#39424c" stroke-width="2"/><path d="M15 2v14" stroke="#39424c" stroke-width="2"/><circle cx="15" cy="20.5" r="3.6" fill="none" stroke="#39424c" stroke-width="1.8"/></symbol>'
  ].join('');

  var ACTIONS = [
    { key: 'E', cap: 'E', label: '共鸣技能' },
    { key: 'Q', cap: 'Q', label: '声骸' },
    { key: 'R', cap: 'R', label: '共鸣解放' },
    { key: 'T', cap: 'T', label: '钩锁' },
    { key: 'F', cap: 'F', label: '处决' },
    { key: 'Space', cap: '空格', wide: true, label: '跳跃', desc: '空格键' },
    { key: 'LMB', icon: 'mouse-l', label: '普攻', desc: '左键' },
    { key: 'RMB', icon: 'mouse-r', label: '闪避', desc: '右键' },
    { key: 'LMBH', icon: 'mouse-lh', label: '重击', ext: '长按', desc: '长按左键' }
  ];
  // 旧草稿里已存在的「延奏离场」保留可渲染，但不再出现在下方键位选项
  var LEGACY_ACTIONS = [{ key: 'OUT', cap: '延', label: '延奏离场', desc: '自动' }];

  var KEY_TO_ACTION = {
    KeyE: 'E', KeyQ: 'Q', KeyR: 'R', KeyT: 'T', KeyF: 'F', Space: 'Space'
  };
  var EL_COLORS = {
    1: '#5eb8e8', 2: '#e85a4a', 3: '#a56be8', 4: '#5ecf7a', 5: '#e6b422', 6: '#d45a9e'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function appState() {
    try {
      if (typeof state !== 'undefined' && state) return state;
    } catch (_) { /* noop */ }
    return null;
  }
  function charDefOf(charId) {
    try {
      var ns = window.__WC;
      if (ns && typeof ns.findCharSkillDef === 'function') return ns.findCharSkillDef(charId) || null;
    } catch (_) { /* noop */ }
    return null;
  }
  function elementColor(charId) {
    var def = charDefOf(charId);
    if (def && def.element != null && EL_COLORS[def.element]) return EL_COLORS[def.element];
    var fallback = { 1107: '#5eb8e8', 1105: '#5eb8e8', 1503: '#e6b422' };
    return fallback[String(charId)] || '#8b9cb3';
  }
  function currentMembers() {
    var st = appState();
    if (!st || !Array.isArray(st.members)) return [];
    return st.members
      .map(function (m, idx) {
        var charId = String((m && m.characterId) || '').trim();
        if (!charId) return null;
        var def = charDefOf(charId) || {};
        var color = elementColor(charId);
        var halo = color + '55';
        return {
          slot: idx,
          charId: charId,
          name: (m && m.name) || def.name || ('角色' + (idx + 1)),
          element: def.element,
          color: color,
          halo: halo
        };
      })
      .filter(Boolean)
      .slice(0, MAX_CHARS);
  }
  function defaultChart() {
    var members = currentMembers();
    return {
      version: 1,
      members: members.map(function (m) { return m.charId; }),
      current: members.length ? 0 : -1,
      introNext: false,
      pendingBreak: false,
      merge: true,
      times: 1,
      mode: 'click',
      segments: [],
      undo: []
    };
  }
  function loadChart() {
    var base = defaultChart();
    try {
      var raw = localStorage.getItem(AXM_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      var validMembers = base.members.join(',');
      if (saved && saved.version === 1 && Array.isArray(saved.segments) &&
          Array.isArray(saved.members) && saved.members.join(',') === validMembers && validMembers) {
        base.segments = saved.segments;
        base.introNext = !!saved.introNext;
        base.merge = saved.merge !== false;
        var curOk = base.members.indexOf(String(saved.current)) >= 0;
        base.current = curOk ? base.members.indexOf(String(saved.current)) : (base.members.length ? 0 : -1);
      }
    } catch (_) { /* 损坏缓存直接重开 */ }
    return base;
  }
  function saveChart(chart) {
    try {
      localStorage.setItem(AXM_KEY, JSON.stringify({
        version: 1,
        members: chart.members,
        current: chart.members[chart.current] || null,
        introNext: chart.introNext,
        merge: chart.merge,
        segments: chart.segments
      }));
    } catch (_) { /* 忽略存储失败 */ }
  }

  function findActionMeta(key) {
    for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].key === key) return ACTIONS[i];
    for (var j = 0; j < LEGACY_ACTIONS.length; j++) if (LEGACY_ACTIONS[j].key === key) return LEGACY_ACTIONS[j];
    return null;
  }
  function actionCapHtml(meta) {
    if (meta.icon === 'mouse-l') return '<svg><use xlink:href="#axm-mouse-l" href="#axm-mouse-l"/></svg>';
    if (meta.icon === 'mouse-lh') return '<svg><use xlink:href="#axm-mouse-lh" href="#axm-mouse-lh"/></svg>';
    if (meta.icon === 'mouse-r') return '<svg><use xlink:href="#axm-mouse-r" href="#axm-mouse-r"/></svg>';
    var wide = meta.wide ? ' k-wide' : '';
    return '<span class="cap' + wide + '">' + esc(meta.cap || '') + '</span>';
  }
  function actorHtml(member, seg, extraClass, currentCharId) {
    var cls = extraClass || '';
    var imgErr = "if(window.__WC&&window.__WC.handlePortraitImgError){window.__WC.handlePortraitImgError(this)}else{this.style.display='none';this.nextElementSibling.style.display='flex'}";
    var remote = portraitRemote(member.charId);
    var target = member.charId === currentCharId ? ' is-target' : '';
    return '<div class="axm-actor' + cls + target + '" data-axm-pick-char="' + esc(member.charId) + '" title="点击切换为填充目标" style="--el:' + esc(member.color) + ';--halo:' + esc(member.halo) + '">' +
      '<div class="ring"><div class="clip">' +
      '<img src="' + esc('assets/characters/' + member.charId + '.webp') + '" alt=""' + (remote ? ' data-remote="' + esc(remote) + '"' : '') + ' onerror="' + imgErr + '" />' +
      '<span class="fb" style="display:none">' + esc((member.name || '?').slice(0, 1)) + '</span>' +
      '</div></div>' +
      (seg.intro ? '<div class="var">变奏</div>' : '') +
      '</div>';
  }
  function portraitRemote(charId) {
    try {
      var ns = window.__WC;
      var def = charDefOf(charId);
      if (!ns || !def || typeof ns.getCharPortraitRemoteUrl !== 'function') return '';
      var url = ns.safeAssetUrl ? ns.safeAssetUrl(ns.getCharPortraitRemoteUrl(def)) : ns.getCharPortraitRemoteUrl(def);
      return url || '';
    } catch (_) { return ''; }
  }
  function stepHtml(segIdx, actIdx, meta, act) {
    var cap = actionCapHtml(meta);
    var wide = meta.wide ? ' k-wide' : '';
    return '<span class="axm-step" data-seg="' + segIdx + '" data-act="' + actIdx + '" draggable="true" title="拖动调整顺序 · 点击移除一次 · 右键删除">' +
      '<span class="k' + wide + '">' + cap + '</span>' +
      '<b>' + esc(meta.label) + '</b>' +
      (Number(act.cnt) > 1 ? '<span class="cnt">×' + esc(act.cnt) + '</span>' : '') +
      (meta.ext ? '<span class="ext">' + esc(meta.ext) + '</span>' : '') +
      '</span>';
  }
  function trackHtml(chart, members) {
    if (!chart.segments.length) {
      return '<div class="axm-empty">请选择角色，再点击下方键位开始填充 · 点轨道上的动作可移除一次</div>';
    }
    var byId = {};
    members.forEach(function (m) { byId[m.charId] = m; });
    var out = '<div class="axm-line">';
    chart.segments.forEach(function (seg, si) {
      var member = byId[seg.charId];
      if (!member) return;
      // 手动「另起一排」的水位标记：排版时遇到它强制开新排
      if (seg.breakBefore) out += '<span class="axm-break"></span>';
      if (si > 0 && !seg.breakBefore) out += '<span class="axm-sep cy">⇄</span>';
      out += actorHtml(member, seg, '', chart.members[chart.current]);
      seg.actions.forEach(function (act, ai) {
        var meta = findActionMeta(act.key);
        if (!meta) return;
        if (ai > 0) out += '<span class="axm-sep">›</span>';
        out += stepHtml(si, ai, meta, act);
      });
    });
    out += '</div>';
    return out;
  }
  /**
   * 按真实宽度逐项排版：
   * - 默认允许一个角色的技能跨排续填（排满后新技能自动从下一排继续）；
   * - 遇到 breakBefore（玩家点了「下一笔另起一排」）才强制换排；
   * - 跨排续写的新排首加「…」提示，保证读得懂。
   */
  function layoutRows() {
    if (!ui.host) return;
    var track = ui.host.querySelector('.axm-track');
    if (!track) return;
    var line = track.querySelector('.axm-line');
    if (!line) return;
    var items = Array.prototype.slice.call(line.children);
    if (!items.length) return;
    var cs = getComputedStyle(track);
    var avail = track.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (!(avail > 120)) avail = track.clientWidth;
    var usable = Math.max(120, avail - 18); // 减去 .axm-row 自身左右 padding
    var GAP = 6;
    var row = null;
    var used = 0;
    var pendingSep = null;
    var pendingBreak = false;
    function openRow(withCont) {
      row = document.createElement('div');
      row.className = 'axm-row';
      if (withCont) row.innerHTML = '<span class="axm-cont">…</span>';
      used = 0;
      track.appendChild(row);
    }
    items.forEach(function (el) {
      if (el.classList.contains('axm-break')) {
        pendingBreak = true;
        el.remove();
        return;
      }
      if (el.classList.contains('axm-sep')) {
        pendingSep = el;
        return;
      }
      var w = el.getBoundingClientRect().width || 0;
      var sepW = pendingSep ? (pendingSep.getBoundingClientRect().width || 0) + GAP : 0;
      var need = (row && row.children.length ? GAP : 0) + sepW + w;
      if (pendingBreak || !row || used + need > usable + 0.5) {
        // 排满导致的换行 = 跨排续写；主动另起一排则不显示省略号
        openRow(!pendingBreak && !!row);
        pendingSep = null;
        pendingBreak = false;
        need = (row.children.length ? GAP : 0) + w;
      }
      if (pendingSep) {
        row.appendChild(pendingSep);
        used += (row.children.length > 1 ? GAP : 0) + (pendingSep.getBoundingClientRect().width || 0);
        pendingSep = null;
      }
      row.appendChild(el);
      used += need;
    });
    line.remove();
  }
  function charChipHtml(members, chart) {
    if (!members.length) {
      return '<div class="axm-status" style="color:#ff9a8f">当前队伍没有可用角色：请先上阵 1~3 名角色再打开本页。</div>';
    }
    return members.map(function (m, idx) {
      var active = chart.current === idx ? ' is-active' : '';
      var slot = '角色' + (m.slot + 1);
      var imgErr = "if(window.__WC&&window.__WC.handlePortraitImgError){window.__WC.handlePortraitImgError(this)}else{this.style.display='none';this.nextElementSibling.style.display='grid'}";
      var remote = portraitRemote(m.charId);
      return '<button type="button" class="axm-char' + active + '" data-axm-char="' + idx + '" style="--el:' + esc(m.color) + '" title="选择当前填充角色">' +
        '<span class="orb"><span class="clip"><img src="' + esc('assets/characters/' + m.charId + '.webp') + '" alt=""' + (remote ? ' data-remote="' + esc(remote) + '"' : '') + ' onerror="' + imgErr + '"><span class="char-fb" style="display:none">' + esc(m.name.slice(0, 1)) + '</span></span></span>' +
        '<span><span class="nm">' + esc(m.name) + '</span><span class="slot">' + esc(slot) + (idx === chart.current ? ' · 填充中' : '') + '</span></span>' +
        '</button>';
    }).join('');
  }
  function paletteHtml() {
    return ACTIONS.map(function (meta) {
      var wide = meta.wide ? ' k-wide' : '';
      var sub = meta.desc ? '<span class="sp">' + esc(meta.desc) + '</span>' : '';
      return '<button type="button" class="axm-pal-btn' + (ui.recording ? ' is-rec' : '') + '" data-axm-add="' + esc(meta.key) + '">' +
        '<span class="k' + wide + '">' + actionCapHtml(meta) + '</span>' +
        '<span><b>' + esc(meta.label) + '</b>' + (meta.ext ? ' <span class="ext">' + esc(meta.ext) + '</span>' : '') + sub + '</span>' +
        '</button>';
    }).join('');
  }
  function targetHtml(chart, members) {
    if (!members.length) return '';
    return '<span class="axm-targets">填充到：' + members.map(function (m, i) {
      return '<button type="button" class="axm-target-btn' + (i === chart.current ? ' is-on' : '') + '" data-axm-char="' + i + '">' + esc(m.name) + '</button>';
    }).join('') + '</span>';
  }
  function overlayHtml(chart, members) {
    var membersH = members.length ? '<div class="axm-chars"><span class="axm-chars-label">当前队伍</span>' + charChipHtml(members, chart) + '</div>' : '<div class="axm-chars">' + charChipHtml(members, chart) + '</div>';
    return '<div class="axm-root">' +
      '<svg class="axm-defs" aria-hidden="true"><defs>' + DEFS + '</defs></svg>' +
      '<div class="axm-frame">' +
        '<div class="axm-top">' +
          '<h1>制作轴图<small>AXIS CHART MAKER</small></h1>' +
          '<span class="hint">模板专区右侧入口 · 点击键位或实录键位填充 · 点轨道动作可减次数 · 右键技能删除</span>' +
          '<button type="button" class="axm-back" data-axm-close title="返回轴编辑工作台">← 返回工作台</button>' +
          '<button type="button" class="axm-close" data-axm-close title="关闭">×</button>' +
        '</div>' +
        membersH +
        '<div class="axm-options">' +
          '<span class="axm-mode" role="group">' +
            '<button type="button" data-axm-mode="click"' + (chart.mode === 'click' ? ' class="is-on"' : '') + '>点击填充</button>' +
            '<button type="button" data-axm-mode="rec"' + (chart.mode === 'rec' ? ' class="is-on"' : '') + '>键位实录</button>' +
          '</span>' +
          '<label class="axm-check"><input type="checkbox" data-axm-intro ' + (chart.introNext ? 'checked' : '') + '>下段标「变奏」</label>' +
          '<label class="axm-check"><input type="checkbox" data-axm-merge ' + (chart.merge ? 'checked' : '') + '>连续同类自动合并 ×N</label>' +
          '<span class="axm-count">本次次数<input type="number" min="1" max="99" value="' + chart.times + '" data-axm-times></span>' +
          '<button type="button" class="axm-btn' + (chart.pendingBreak ? ' is-on' : '') + '" data-axm-break title="勾选后，下一个技能会强制从新一排开始；不勾时排满自动续到下一排">下一笔另起一排' + (chart.pendingBreak ? ' ✓' : '') + '</button>' +
          (ui.recording ? '<span class="axm-rec-state"><i></i>实录中 · Esc 停止 · 1/2/3 切换角色</span>' : '') +
        '</div>' +
        '<div class="axm-scroll"><div class="axm-stage">' +
          '<div class="axm-stage-head"><span class="dia"></span><strong>队伍输出轴</strong><span>ROTATION</span></div>' +
          '<div class="axm-track" data-axm-track>' + trackHtml(chart, members) + '</div>' +
        '</div></div>' +
        '<div class="axm-panel">' +
          '<div class="axm-panel-title"><i></i>键位选项' + targetHtml(chart, members) + '</div>' +
          '<div class="axm-pal">' + paletteHtml() + '</div>' +
        '</div>' +
        '<div class="axm-ctl">' +
          '<button type="button" class="axm-btn" data-axm-undo>← 撤销</button>' +
          '<button type="button" class="axm-btn" data-axm-clear>清空</button>' +
          (ui.recording
            ? '<button type="button" class="axm-btn is-danger" data-axm-rec-stop>■ 停止实录</button>'
            : '<button type="button" class="axm-btn is-cyan" data-axm-rec-start>● 键位实录</button>') +
          '<button type="button" class="axm-btn is-primary" data-axm-export>↓ 导出 PNG</button>' +
          '<span class="axm-status">' + (chart.segments.reduce(function (s, x) { return s + x.actions.length; }, 0) || 0) + ' 个动作 · ' + chart.segments.length + ' 段</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    if (!ui.host) return;
    var chart = ui.chart;
    var members = currentMembers();
    ui.host.innerHTML = overlayHtml(chart, members);
    layoutRows();
  }
  function pushUndo(chart) {
    chart.undo.push(JSON.stringify(chart.segments));
    if (chart.undo.length > 60) chart.undo.shift();
  }
  function mutate(fn) {
    var chart = ui.chart;
    if (!chart) return;
    pushUndo(chart);
    fn(chart);
    saveChart(chart);
    render();
  }
  function findLastSegmentIndex(chart, charId) {
    for (var i = chart.segments.length - 1; i >= 0; i--) {
      if (chart.segments[i].charId === charId) return i;
    }
    return -1;
  }
  function ensureSegment(chart, charId) {
    var idx = findLastSegmentIndex(chart, charId);
    // 已有该角色的段且玩家没点「另起一排」→ 直接续在它后面（支持回头点头像补轴）
    if (idx >= 0 && !chart.pendingBreak) return chart.segments[idx];
    var exists = idx >= 0;
    var seg = {
      uid: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      charId: charId,
      // 同一角色的续段不再重复标「变奏」；只有新角色登场才按开关标
      intro: exists ? false : !!chart.introNext,
      breakBefore: exists ? true : !!chart.pendingBreak,
      actions: []
    };
    if (exists) chart.segments.splice(idx + 1, 0, seg);
    else chart.segments.push(seg);
    chart.pendingBreak = false;
    return seg;
  }
  function pushAction(chart, key, addCnt) {
    if (chart.current < 0 || !chart.members[chart.current]) return;
    var meta = findActionMeta(key);
    if (!meta) return;
    var seg = ensureSegment(chart, chart.members[chart.current]);
    var cnt = Math.max(1, Math.min(99, Math.round(Number(addCnt) || 1)));
    var last = seg.actions[seg.actions.length - 1];
    if (chart.merge && last && last.key === key) {
      last.cnt = Math.min(99, (Number(last.cnt) || 1) + cnt);
    } else {
      seg.actions.push({ key: key, label: meta.label, cnt: cnt, ext: meta.ext || '' });
    }
  }
  function deleteAction(chart, segIdx, actIdx) {
    var seg = chart.segments[segIdx];
    if (!seg) return;
    var act = seg.actions[actIdx];
    if (!act) return;
    if (Number(act.cnt) > 1) act.cnt -= 1;
    else seg.actions.splice(actIdx, 1);
    if (!seg.actions.length) chart.segments.splice(segIdx, 1);
  }
  function removeStepAt(segIdx, actIdx) {
    var chart = ui.chart;
    if (!chart) return;
    pushUndo(chart);
    deleteAction(chart, Number(segIdx), Number(actIdx));
    saveChart(chart);
    render();
  }
  function undoLast(chart) {
    var snap = chart.undo.pop();
    if (snap == null) return false;
    try { chart.segments = JSON.parse(snap); return true; }
    catch (_) { return false; }
  }

  function currentMemberOfChart(chart) {
    return chart.members[chart.current] || null;
  }
  function switchChar(chart, idx) {
    if (!chart.members[idx] || chart.current === idx) return;
    chart.current = idx;
    chart.introNext = chart.segments.length > 0;
    render();
  }

  // ---------- 入口按钮 ----------
  function injectButton() {
    var toolbar = document.querySelector('.team-axis-board .axis-board-toolbar .toolbar-left');
    if (!toolbar) return;
    var zone = toolbar.querySelector('[data-rt-zone]');
    if (!zone || toolbar.querySelector('[data-axm-open]')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'axm-entry';
    btn.dataset.axmOpen = '';
    btn.title = '制作轴图：选角色 → 点击键位或实录键位 → 导出 PNG';
    btn.setAttribute('aria-label', '制作轴图，导出 PNG 分享图片');
    btn.innerHTML = '<span class="axm-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h4m-4 4h8m-8 4h4m4-8h2m-2 8h2"/></svg></span>' +
      '<span class="axm-entry-copy"><strong>制作轴图</strong><small>导出 PNG · 便于分享</small></span>' +
      '<svg class="axm-entry-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
    zone.insertAdjacentElement('afterend', btn);
  }

  // ---------- 页面开关 ----------
  function open() {
    if (ui.host) return;
    var members = currentMembers();
    var chart = loadChart();
    ui.chart = chart;
    var host = document.createElement('div');
    document.body.appendChild(host);
    ui.host = host;
    host.innerHTML = overlayHtml(chart, members);
    layoutRows();
    if (!members.length) ui.noMembers = true;
    document.body.style.overflow = 'hidden';
    // 提前加载导出库，避免用户点导出时才现场拉脚本
    try {
      var ns = window.__WC || {};
      var pre = ns.ensureHtmlToImage || window.ensureHtmlToImage;
      if (typeof pre === 'function') pre().catch(function () { /* 导出时再兜底 */ });
    } catch (_) { /* noop */ }
  }
  function close() {
    stopRecording();
    if (ui.host) { ui.host.remove(); ui.host = null; ui.chart = null; ui.noMembers = false; }
    document.body.style.overflow = '';
  }

  // ---------- 实录 ----------
  function isControlTarget(el) {
    return !!(el && el.closest && el.closest('.axm-ctl,.axm-pal,.axm-options,.axm-top,.axm-panel,.axm-chars,.axm-actor'));
  }
  function recordKey(code) {
    var chart = ui.chart;
    if (!chart || !ui.recording) return false;
    if (code === 'Escape') { stopRecording(); render(); return true; }
    if (/^Digit[123]$/.test(code)) {
      var idx = Number(code.slice(-1)) - 1;
      if (chart.members[idx]) { switchChar(chart, idx); return true; }
      return false;
    }
    var key = KEY_TO_ACTION[code];
    if (key) {
      mutate(function (c) { pushAction(c, key, 1); });
      return true;
    }
    return false;
  }
  function appendMouse(key) {
    var chart = ui.chart;
    if (!chart || !ui.recording || chart.current < 0) return;
    mutate(function (c) { pushAction(c, key, 1); });
  }
  function clearHoldTimer(resetFired) {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (resetFired !== false) holdFired = false;
  }
  function stopRecording() {
    ui.recording = false;
    clearHoldTimer(true);
  }
  function startRecording() {
    if (!ui.chart || ui.chart.members.length < 1 || ui.chart.current < 0) return;
    ui.recording = true;
    render();
  }

  document.addEventListener('keydown', function (e) {
    if (!ui.recording || !ui.host) return;
    var t = e.target;
    if (t && t.closest && t.closest('input,textarea,select')) return;
    if (e.repeat) return;
    if (recordKey(e.code || '')) e.preventDefault();
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (!ui.recording || !ui.host) return;
    if (e.target && e.target.closest && e.target.closest('.axm-step')) return;
    if (isControlTarget(e.target)) return;
    if (e.button === 2) {
      appendMouse('RMB');
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      clearHoldTimer(true);
      holdTimer = setTimeout(function () {
        holdFired = true;
        appendMouse('LMBH');
      }, 420);
    }
  }, true);
  document.addEventListener('mouseup', function (e) {
    if (!ui.recording || !ui.host || e.button !== 0) return;
    var wasHold = holdFired;
    clearHoldTimer(false);
    holdFired = false;
    if (!wasHold && !isControlTarget(e.target)) appendMouse('LMB');
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (ui.host && e.target && e.target.closest && e.target.closest('.axm-step')) {
      e.preventDefault();
      var step = e.target.closest('.axm-step');
      removeStepAt(step.dataset.seg, step.dataset.act);
      return;
    }
    if (ui.recording && !isControlTarget(e.target)) e.preventDefault();
  }, true);

  // ---------- 同一角色段内拖动排序 ----------
  function clearDragMarks() {
    if (!ui.host) return;
    ui.host.querySelectorAll('.axm-step.is-dragging,.axm-step.is-drop-target').forEach(function (n) {
      n.classList.remove('is-dragging', 'is-drop-target');
    });
  }
  function reorderStep(e, target) {
    var drag = ui.drag;
    if (!drag || !target) return;
    var segIdx = Number(target.dataset.seg);
    var to = Number(target.dataset.act);
    if (segIdx !== drag.seg || to === drag.act) return;
    var chart = ui.chart;
    var seg = chart && chart.segments[segIdx];
    if (!seg) return;
    var rect = target.getBoundingClientRect();
    var after = e.clientX > rect.left + rect.width / 2;
    var insert = to + (after ? 1 : 0);
    pushUndo(chart);
    var item = seg.actions.splice(drag.act, 1)[0];
    if (!item) return;
    if (drag.act < insert) insert -= 1;
    insert = Math.max(0, Math.min(seg.actions.length, insert));
    seg.actions.splice(insert, 0, item);
    ui.suppressClick = true;
    saveChart(chart);
    render();
  }
  document.addEventListener('dragstart', function (e) {
    if (!ui.host || ui.recording) return;
    var step = e.target && e.target.closest ? e.target.closest('.axm-step') : null;
    if (!step) return;
    ui.drag = { seg: Number(step.dataset.seg), act: Number(step.dataset.act) };
    step.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', step.textContent.trim()); } catch (_) { /* noop */ }
    }
  }, true);
  document.addEventListener('dragover', function (e) {
    if (!ui.host || !ui.drag) return;
    var step = e.target && e.target.closest ? e.target.closest('.axm-step') : null;
    if (!step || Number(step.dataset.seg) !== ui.drag.seg) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    ui.host.querySelectorAll('.axm-step.is-drop-target').forEach(function (n) { n.classList.remove('is-drop-target'); });
    step.classList.add('is-drop-target');
  }, true);
  document.addEventListener('drop', function (e) {
    if (!ui.host || !ui.drag) return;
    var step = e.target && e.target.closest ? e.target.closest('.axm-step') : null;
    if (!step || Number(step.dataset.seg) !== ui.drag.seg) return;
    e.preventDefault();
    e.stopPropagation();
    reorderStep(e, step);
    ui.drag = null;
    clearDragMarks();
  }, true);
  document.addEventListener('dragend', function () {
    ui.drag = null;
    clearDragMarks();
  }, true);

  // ---------- 事件 ----------
  document.addEventListener('click', function (e) {
    var openBtn = e.target.closest('[data-axm-open]');
    if (openBtn) { e.preventDefault(); open(); return; }
    if (!ui.host) return;
    var host = ui.host;
    if (e.target.closest('[data-axm-close]')) { close(); return; }
    if (e.target.closest('[data-axm-pick-char]')) {
      var pickId = e.target.closest('[data-axm-pick-char]').dataset.axmPickChar;
      var pickIdx = ui.chart.members.indexOf(pickId);
      if (pickIdx >= 0) switchChar(ui.chart, pickIdx);
      return;
    }
    if (e.target.closest('[data-axm-char]')) {
      switchChar(ui.chart, Number(e.target.closest('[data-axm-char]').dataset.axmChar));
      return;
    }
    if (e.target.closest('[data-axm-mode]')) {
      ui.chart.mode = e.target.closest('[data-axm-mode]').dataset.axmMode;
      if (ui.chart.mode === 'rec') startRecording(); else stopRecording();
      render();
      return;
    }
    if (e.target.closest('[data-axm-break]')) {
      ui.chart.pendingBreak = !ui.chart.pendingBreak;
      render();
      return;
    }
    if (e.target.closest('[data-axm-add]')) {
      if (ui.recording) return;
      mutate(function (chart) {
        pushAction(chart, e.target.closest('[data-axm-add]').dataset.axmAdd, ui.chart.times || 1);
      });
      return;
    }
    if (e.target.closest('[data-axm-step]')) {
      if (ui.recording) return;
      if (ui.suppressClick) { ui.suppressClick = false; return; }
      var step = e.target.closest('[data-axm-step]');
      removeStepAt(step.dataset.seg, step.dataset.act);
      return;
    }
    if (e.target.closest('[data-axm-undo]')) {
      if (undoLast(ui.chart)) { saveChart(ui.chart); render(); }
      return;
    }
    if (e.target.closest('[data-axm-clear]')) {
      if (ui.chart.segments.length && window.confirm('清空整条轴？')) {
        mutate(function (chart) { chart.segments = []; });
      }
      return;
    }
    if (e.target.closest('[data-axm-rec-start]')) { startRecording(); return; }
    if (e.target.closest('[data-axm-rec-stop]')) { stopRecording(); render(); return; }
    if (e.target.closest('[data-axm-export]')) { void exportPng(); return; }
  });
  document.addEventListener('input', function (e) {
    if (!ui.host || e.target.dataset.axmTimes == null) return;
    var v = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
    ui.chart.times = v;
    e.target.value = String(v);
  });
  document.addEventListener('change', function (e) {
    if (!ui.host) return;
    if (e.target.dataset.axmIntro != null) { ui.chart.introNext = !!e.target.checked; return; }
    if (e.target.dataset.axmMerge != null) { ui.chart.merge = !!e.target.checked; saveChart(ui.chart); }
  });

  // ---------- 导出 ----------
  async function exportPng() {
    var chart = ui.chart;
    if (!chart || !chart.segments.length) { window.alert('请先填入至少一个动作再导出'); return; }
    var stage = ui.host && ui.host.querySelector('.axm-stage');
    if (!stage) return;
    var btn = ui.host.querySelector('[data-axm-export]');
    var oldText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    var prevOverflow = stage.style.overflow;
    try {
      var ns = window.__WC || {};
      var ensure = ns.ensureHtmlToImage || window.ensureHtmlToImage;
      if (typeof ensure !== 'function') throw new Error('导出组件未就绪');
      var api = await ensure();
      stage.style.overflow = 'visible';
      layoutRows(); // 按当前页面实际宽度排版，预览与导出完全一致
      var dataUrl = await api.toPng(stage, {
        pixelRatio: 2,
        backgroundColor: '#0a0b0d',
        cacheBust: false,
        skipFonts: true
      });
      var a = document.createElement('a');
      a.download = '队伍输出轴.png';
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      window.alert('导出失败：' + ((err && err.message) || err));
    } finally {
      stage.style.overflow = prevOverflow;
      layoutRows();
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }

  // ---------- 按钮保持注入 ----------
  if (typeof MutationObserver === 'function') {
    var mo = new MutationObserver(function () { injectButton(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  injectButton();
})();
