/* 矩阵伤害模拟：读取当前工作区方案，注入期次增益与 BOSS 修正，推演理论进度/伤害/分数。
   数据配置：matrix-sim-seasons.json（期次/BOSS血量/递增/计分/增益buff，全部可配）。
   模拟基于快照-恢复：跑完自动还原用户工作区，不污染配置。 */
(function () {
  'use strict';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '-';
    return Math.round(v).toLocaleString('zh-CN');
  }
  function fmtWan(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '-';
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + ' 万';
    return String(Math.round(v));
  }

  var SEASONS_URL = 'matrix-sim-seasons.json';
  var seasonsDb = null;
  var seasonsPromise = null;

  var ui = {
    seasonId: '',
    buffIds: [],
    startRound: 1,
    startBoss: 0,
    startHpPct: 100,
    running: false,
    result: null,
    error: '',
  };

  function isOpen() {
    return document.body.classList.contains('matrix-sim-open');
  }

  function loadSeasons(force) {
    if (seasonsDb && !force) return Promise.resolve(seasonsDb);
    if (seasonsPromise && !force) return seasonsPromise;
    seasonsPromise = fetch(SEASONS_URL + '?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('期次配置加载失败 (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        seasonsDb = data;
        if (!ui.seasonId && data && Array.isArray(data.seasons) && data.seasons.length) {
          var first = data.seasons.find(function (s) { return s && s.enabled !== false; }) || data.seasons[0];
          ui.seasonId = first.id || '';
        }
        return seasonsDb;
      })
      .catch(function (err) {
        ui.error = err.message || String(err);
        return null;
      });
    return seasonsPromise;
  }

  function currentSeason() {
    if (!seasonsDb || !Array.isArray(seasonsDb.seasons)) return null;
    return (
      seasonsDb.seasons.find(function (s) {
        return String(s.id) === String(ui.seasonId);
      }) || null
    );
  }

  function simDefaults() {
    return (seasonsDb && seasonsDb.simDefaults) || {};
  }

  /* ---------- 模拟核心 ---------- */

  function bossHpForRound(boss, round, season) {
    var base = Number(boss.baseHp) || 0;
    var g = (season && season.hpGrowth) || { mode: 'percent', value: 0 };
    var r = Math.max(1, Number(round) || 1) - 1;
    if (g.mode === 'linear') return base + (Number(g.value) || 0) * r;
    return base * Math.pow(1 + (Number(g.value) || 0) / 100, r);
  }

  function injectTeamBuffs(defs, idPrefix) {
    var sb = ensureTeamSharedBuffs();
    var ids = [];
    (defs || []).forEach(function (def) {
      if (!def || !Array.isArray(def.effects) || !def.effects.length) return;
      var entry = normalizeBuff({
        id: idPrefix + def.id,
        category: 'composite',
        name: def.name || '矩阵修正',
        effects: def.effects,
        sourceTag: 'matrixSim',
        gameText: def.gameText || '',
      });
      sb.buffs.push(entry);
      sb.globalBuffActive[entry.id] = true;
      sb.globalBuffStacks[entry.id] = 1;
      ids.push(entry.id);
    });
    if (ids.length) syncTeamBuffsToMembers();
    return ids;
  }

  function removeTeamBuffs(ids) {
    if (!ids || !ids.length) return;
    var sb = ensureTeamSharedBuffs();
    sb.buffs = (sb.buffs || []).filter(function (b) {
      return ids.indexOf(b.id) < 0;
    });
    ids.forEach(function (id) {
      delete sb.globalBuffActive[id];
      delete sb.globalBuffStacks[id];
    });
    syncTeamBuffsToMembers();
  }

  function bossModifierDefs(boss) {
    var mods = Array.isArray(boss.modifiers) ? boss.modifiers : [];
    if (!mods.length) return [];
    return [
      {
        id: 'boss_' + boss.id,
        name: (boss.name || 'BOSS') + '·场地修正',
        effects: mods,
        gameText: boss.modifiersText || '',
      },
    ];
  }

  function selectedBuffDefs(season) {
    var choices = (season && season.buffChoices) || [];
    return choices.filter(function (b) {
      return ui.buffIds.indexOf(String(b.id)) >= 0;
    });
  }

  function workspaceReady() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.members)) return false;
    return state.members.some(function (m) {
      if (!m || !m.characterId) return false;
      var phases = Array.isArray(m.phases) ? m.phases : [];
      return phases.some(function (p) {
        return Array.isArray(p.skills) && p.skills.length > 0;
      });
    });
  }

  function workspaceSummary() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.members)) return [];
    return state.members
      .filter(function (m) {
        return m && m.characterId;
      })
      .map(function (m) {
        return m.name || m.characterId;
      });
  }

  async function runSim() {
    var season = currentSeason();
    if (!season) {
      ui.error = '请先选择期次';
      renderShell();
      return;
    }
    if (!workspaceReady()) {
      ui.error = '当前工作区没有可用方案：请先在计算器主界面配好方案（可从公开数据库导入），并确认编辑轴内有技能。';
      renderShell();
      return;
    }
    ui.running = true;
    ui.error = '';
    ui.result = null;
    renderShell();

    var snapshot = buildWorkspacePayload();
    var res = { kills: [], totalDamage: 0, cleared: false, finalBoss: null, score: 0, seasonName: season.name };
    var gainIds = [];
    try {
      gainIds = injectTeamBuffs(selectedBuffDefs(season), 'mxsim_gain_');
      var bosses = Array.isArray(season.bosses) ? season.bosses : [];
      var maxRounds = Math.min(Number(season.rounds) || 20, Number(simDefaults().maxRounds) || 20);
      var stopped = false;
      for (var r = Math.max(1, ui.startRound); r <= maxRounds && !stopped; r++) {
        for (var bi = r === Math.max(1, ui.startRound) ? ui.startBoss : 0; bi < bosses.length && !stopped; bi++) {
          var boss = bosses[bi];
          var hp = bossHpForRound(boss, r, season);
          if (r === Math.max(1, ui.startRound) && bi === ui.startBoss) {
            hp = (hp * Math.min(100, Math.max(1, ui.startHpPct))) / 100;
          }
          state.team.monsterRes = boss.monsterRes != null ? Number(boss.monsterRes) : 20;
          state.team.monsterLevel = Number(boss.monsterLevel) || 100;
          var modIds = injectTeamBuffs(bossModifierDefs(boss), 'mxsim_mod_');
          computeAll();
          var dmg = (state.teamResults && Number(state.teamResults.total)) || 0;
          removeTeamBuffs(modIds);
          if (dmg >= hp && hp > 0) {
            res.kills.push({ round: r, bossIdx: bi, name: boss.name, hp: Math.round(hp), dmg: Math.round(dmg) });
            res.totalDamage += hp;
          } else {
            res.finalBoss = {
              round: r,
              bossIdx: bi,
              name: boss.name,
              hp: Math.round(hp),
              dealt: Math.round(dmg),
              remainPct: hp > 0 ? ((hp - dmg) / hp) * 100 : 0,
            };
            res.totalDamage += Math.max(0, dmg);
            stopped = true;
          }
        }
      }
      res.cleared = !stopped;
      var sr = season.scoreRule || {};
      var perPoint = Number(sr.damagePerPoint) || 0;
      var score = perPoint > 0 ? Math.floor(res.totalDamage / perPoint) : 0;
      score += res.kills.length * (Number(sr.killBonus) || 0);
      if (Number(sr.maxScore) > 0) score = Math.min(score, Number(sr.maxScore));
      res.score = score;
      res.totalDamage = Math.round(res.totalDamage);
    } catch (err) {
      ui.error = '模拟失败：' + (err && err.message ? err.message : String(err));
    } finally {
      removeTeamBuffs(gainIds);
      try {
        await importWorkspaceFromData(snapshot, {}, { axis: true, build: true, buff: true });
      } catch (err) {
        ui.error = '工作区恢复失败，建议刷新页面：' + (err && err.message ? err.message : String(err));
      }
    }
    ui.running = false;
    if (!ui.error) ui.result = res;
    renderShell();
  }

  /* ================= 阶段 F：模板模式（RT 码 + 玩家声骸配置 → 临时组装 → 模拟 → 必还原） =================
   * 依据 handoff-dsh-v2 阶段 F：由模板 chars 生成队伍骨架（角色+轴+时间标注）→ 叠加玩家声骸配置
   * （按 charId 取自当前工作区）→ 缺某角色声骸 → 明确提示缺谁，不允许半套 → 快照→注入→runSim→必还原。
   */
  function assembleTemplateWorkspacePayload(tpl, echoSource) {
    if (!tpl || !Array.isArray(tpl.chars) || !tpl.chars.length) return { error: '模板无效' };
    var missing = [];
    var members = tpl.chars.map(function (c, i) {
      var player = null;
      if (Array.isArray(echoSource)) {
        player = echoSource.find(function (m) { return m && String(m.characterId) === String(c.charId); }) || null;
      }
      if (!player || !player.echoConfig) missing.push(c.charName || c.charId);
      var rotationCatalog = (Array.isArray(c.skills) ? c.skills : []).map(function (s) {
        var t = Number(s.t) || 0;
        var entry = {
          id: 'rtm_' + i + '_' + Math.random().toString(36).slice(2, 8),
          name: s.name,
          librarySkillName: s.name,
          libraryName: s.name,
          damageType: '',
          baseMult: 0,
          multCount: 1,
          stackLayers: {},
          axisOffsetPx: Math.round(t * 10),
          timeSec: t,
          durSec: Number(s.dur) || 1,
          phase: Number.isInteger(s.phase) ? s.phase : 0,
        };
        if (s.key) entry.key = String(s.key);
        return entry;
      });
      return {
        id: 'rtm_' + i + '_' + c.charId,
        name: c.charName || c.charId,
        characterId: String(c.charId),
        resonanceUnlocked: 0,
        weaponSelection: { refinement: 1 },
        cycleConfig: { enabled: false },
        echoConfig: player ? player.echoConfig : null,
        rotationCatalog: rotationCatalog,
      };
    });
    if (missing.length) return { error: '缺少以下角色的声骸配置：' + missing.join('、') };
    return { payload: { team: { axisDuration: 20 }, members: members } };
  }

  async function runTemplateSim(rtCode) {
    if (typeof window.RotationTemplate === 'undefined') {
      ui.error = '模板模块未加载（rotation-template.js）';
      renderShell();
      return;
    }
    if (typeof importWorkspaceFromData !== 'function' || typeof buildWorkspacePayload !== 'function') {
      ui.error = '导入引擎未就绪';
      renderShell();
      return;
    }
    var det = null;
    try {
      det = await Cloud.api('/rotation-templates/' + encodeURIComponent(String(rtCode || '').trim().toUpperCase()));
    } catch (e) {
      ui.error = '获取模板失败：' + (e && e.message ? e.message : String(e));
      renderShell();
      return;
    }
    var tpl = det && det.payload;
    if (!tpl) { ui.error = '模板不存在或未通过审核'; renderShell(); return; }
    // 模板内容自校验（结构/角色在库/技能在库/CSF），不要求与当前队伍一致（以模板为准组装）
    var verdict = window.RotationTemplate.validateTemplateContent(tpl);
    if (!verdict.ok) { ui.error = '模板校验失败：' + verdict.reason; renderShell(); return; }
    var assembled = assembleTemplateWorkspacePayload(tpl, state.members);
    if (assembled.error) { ui.error = assembled.error; renderShell(); return; }
    ui.running = true;
    ui.error = '';
    ui.result = null;
    renderShell();
    var original = buildWorkspacePayload();
    try {
      await importWorkspaceFromData(assembled.payload, {}, { axis: true, build: true, buff: true });
      await runSim();
    } catch (e) {
      ui.error = '模板模拟失败：' + (e && e.message ? e.message : String(e));
    } finally {
      try {
        await importWorkspaceFromData(original, {}, { axis: true, build: true, buff: true });
      } catch (e2) {
        ui.error = '工作区还原失败，建议刷新页面：' + (e2 && e2.message ? e2.message : String(e2));
      }
    }
    ui.running = false;
    if (!ui.error && !ui.result) ui.result = { note: '模板模拟完成（工作区已还原）' };
    renderShell();
  }

  async function openTemplateMode() {
    var code = (typeof DialogKit !== 'undefined' && DialogKit.prompt)
      ? await DialogKit.prompt({
          title: '矩阵模板模式',
          placeholder: '输入队伍轴模板分享码（RT-XXXXXX）\n将用模板角色+轴+时间标注组装临时工作区，叠加你当前工作区的声骸配置（按角色匹配，缺哪个会明确提示），模拟结束后自动还原你的工作区。',
          max: 64,
        })
      : window.prompt(
          '矩阵模板模式：输入队伍轴模板分享码（RT-XXXXXX）\n' +
            '将用模板角色+轴+时间标注组装临时工作区，叠加你当前工作区的声骸配置（按角色匹配，缺哪个会明确提示），' +
            '模拟结束后自动还原你的工作区。',
          ''
        );
    if (!code || !String(code).trim()) return;
    var m = String(code).trim().match(/^RT-[A-Z0-9]{6}$/i);
    if (!m) { window.alert('分享码格式应为 RT-XXXXXX'); return; }
    await runTemplateSim(m[0].toUpperCase());
  }

  /* ---------- 渲染 ---------- */

  function renderSeasonPicker() {
    var seasons = (seasonsDb && seasonsDb.seasons) || [];
    if (!seasons.length) return '<p class="hint">期次配置加载中或为空…</p>';
    var opts = seasons
      .map(function (s) {
        return (
          '<option value="' + esc(s.id) + '"' + (String(s.id) === String(ui.seasonId) ? ' selected' : '') + '>' +
          esc(s.name || s.id) +
          '</option>'
        );
      })
      .join('');
    return (
      '<label class="mxsim-field"><span>期次</span>' +
      '<select data-mxsim-season>' + opts + '</select></label>'
    );
  }

  function renderBuffChoices() {
    var season = currentSeason();
    if (!season) return '';
    var choices = season.buffChoices || [];
    var maxPick = Number(simDefaults().maxBuffPick) || choices.length;
    var cards = choices
      .map(function (b) {
        var on = ui.buffIds.indexOf(String(b.id)) >= 0;
        var icon = b.icon ? '<img class="mxsim-buff-icon" src="' + esc(b.icon) + '" alt="" loading="lazy" />' : '';
        return (
          '<button type="button" class="mxsim-buff-card' + (on ? ' is-on' : '') + '" data-mxsim-buff="' + esc(b.id) + '">' +
          icon +
          '<span class="mxsim-buff-name">' + esc(b.name) + '</span>' +
          '<span class="mxsim-buff-desc">' + esc(b.gameText || '') + '</span>' +
          '</button>'
        );
      })
      .join('');
    return (
      '<div class="mxsim-buff-head">可选增益（最多选 ' + maxPick + ' 个）</div>' +
      '<div class="mxsim-buff-grid">' + cards + '</div>'
    );
  }

  function renderStartConfig() {
    var season = currentSeason();
    if (!season) return '';
    var bosses = season.bosses || [];
    var bossBtns = bosses
      .map(function (b, i) {
        return (
          '<button type="button" class="mxsim-boss-btn' + (i === ui.startBoss ? ' is-on' : '') + '" data-mxsim-boss="' + i + '">' +
          esc(b.name || 'BOSS ' + (i + 1)) +
          '</button>'
        );
      })
      .join('');
    var maxRounds = Math.min(Number(season.rounds) || 20, Number(simDefaults().maxRounds) || 20);
    return (
      '<div class="mxsim-start-grid">' +
      '<label class="mxsim-field"><span>起始轮次（1-' + maxRounds + '）</span>' +
      '<input type="number" min="1" max="' + maxRounds + '" step="1" value="' + ui.startRound + '" data-mxsim-round /></label>' +
      '<div class="mxsim-field"><span>起始 BOSS</span><div class="mxsim-boss-row">' + bossBtns + '</div></div>' +
      '<label class="mxsim-field"><span>开局血量 <b data-mxsim-hp-label>' + ui.startHpPct + '%</b></span>' +
      '<input type="range" min="1" max="100" step="1" value="' + ui.startHpPct + '" data-mxsim-hp /></label>' +
      '</div>'
    );
  }

  function renderSchemeCard() {
    var names = workspaceSummary();
    var ready = workspaceReady();
    var membersHtml = names.length
      ? names.map(function (n) { return '<span class="mxsim-member-chip">' + esc(n) + '</span>'; }).join('')
      : '<span class="hint">工作区为空</span>';
    return (
      '<div class="mxsim-scheme-card">' +
      '<div class="mxsim-scheme-members">' + membersHtml + '</div>' +
      '<p class="hint">模拟基于<b>当前工作区</b>：请先在计算器主界面配好方案（可从「公开数据库」导入），声骸词条用声骸配置里的 OCR 导入覆盖。模拟结束后工作区自动还原。</p>' +
      '<div class="mxsim-scheme-actions">' +
      '<button type="button" class="matrix-btn-sm" data-mxsim-goto-public>从公开数据库选方案</button>' +
      '</div>' +
      (ready ? '' : '<p class="mxsim-warn">当前工作区没有可计算的编辑轴，无法模拟。</p>') +
      '</div>'
    );
  }

  function renderResult() {
    if (ui.error) return '<p class="mxsim-warn">' + esc(ui.error) + '</p>';
    var res = ui.result;
    if (!res) return '';
    var progressHtml;
    if (res.cleared) {
      progressHtml = '<div class="mxsim-progress is-clear">打穿全部轮次</div>';
    } else if (res.finalBoss) {
      progressHtml =
        '<div class="mxsim-progress">预计进度：第 <b>' + res.finalBoss.round + '</b> 轮 · ' +
        esc(res.finalBoss.name) + ' · 剩余 <b>' + res.finalBoss.remainPct.toFixed(1) + '%</b> 血量</div>';
    } else {
      progressHtml = '';
    }
    var rows = res.kills
      .map(function (k) {
        return (
          '<tr><td>第 ' + k.round + ' 轮</td><td>' + esc(k.name) + '</td>' +
          '<td>' + fmtWan(k.hp) + '</td><td>' + fmtWan(k.dmg) + '</td><td>击杀</td></tr>'
        );
      })
      .join('');
    if (res.finalBoss) {
      rows +=
        '<tr class="is-final"><td>第 ' + res.finalBoss.round + ' 轮</td><td>' + esc(res.finalBoss.name) + '</td>' +
        '<td>' + fmtWan(res.finalBoss.hp) + '</td><td>' + fmtWan(res.finalBoss.dealt) + '</td><td>未击杀</td></tr>';
    }
    return (
      progressHtml +
      '<div class="mxsim-score-row">' +
      '<div class="mxsim-score-cell"><span>总分</span><b>' + fmtNum(res.score) + '</b></div>' +
      '<div class="mxsim-score-cell"><span>有效总伤害</span><b>' + fmtWan(res.totalDamage) + '</b></div>' +
      '<div class="mxsim-score-cell"><span>击杀数</span><b>' + res.kills.length + '</b></div>' +
      '</div>' +
      (rows
        ? '<table class="mxsim-table"><thead><tr><th>轮次</th><th>BOSS</th><th>血量</th><th>轴伤害</th><th>结果</th></tr></thead><tbody>' +
          rows + '</tbody></table>'
        : '')
    );
  }

  function renderShell() {
    var page = document.getElementById('matrixSimPage');
    if (!page) return;
    page.innerHTML =
      '<div class="matrix-shell matrix-sim-shell">' +
      '<header class="matrix-head">' +
      '<div><h1 class="matrix-title">矩阵伤害模拟</h1>' +
      '<p class="matrix-sub">基于当前工作区方案 · 注入期次规则推演理论进度与分数</p></div>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" class="matrix-back" data-mxsim-template title="模板模式：RT 码 + 你的声骸配置 → 模拟（结束自动还原工作区）">模板模式</button>' +
      '<button type="button" class="matrix-back" data-mxsim-back>← 返回计算器</button>' +
      '</div>' +
      '</header>' +

      '<section class="matrix-section">' +
      '<h2 class="matrix-section-title">期次与增益</h2>' +
      renderSeasonPicker() +
      renderBuffChoices() +
      '</section>' +

      '<section class="matrix-section">' +
      '<h2 class="matrix-section-title">开局设置</h2>' +
      renderStartConfig() +
      '</section>' +

      '<section class="matrix-section">' +
      '<h2 class="matrix-section-title">方案</h2>' +
      renderSchemeCard() +
      '</section>' +

      '<div class="mxsim-run-row">' +
      '<button type="button" class="mxsim-run-btn" data-mxsim-run' + (ui.running ? ' disabled' : '') + '>' +
      (ui.running ? '模拟中…' : '开始模拟') +
      '</button>' +
      '</div>' +

      '<section class="matrix-section" data-mxsim-result-section>' +
      '<h2 class="matrix-section-title">模拟结果</h2>' +
      '<div data-mxsim-result>' + renderResult() + '</div>' +
      '</section>' +
      '</div>';
  }

  /* ---------- 事件 ---------- */

  function toggleBuff(id) {
    var season = currentSeason();
    var maxPick = Number(simDefaults().maxBuffPick) || ((season && season.buffChoices) || []).length || 1;
    var idx = ui.buffIds.indexOf(id);
    if (idx >= 0) {
      ui.buffIds.splice(idx, 1);
    } else {
      if (ui.buffIds.length >= maxPick) ui.buffIds.shift();
      ui.buffIds.push(id);
    }
  }

  function bind() {
    document.body.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav-matrix-sim]');
      if (nav) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        return;
      }
      if (e.target.closest('[data-mxsim-back]')) {
        setOpen(false);
        return;
      }
      if (e.target.closest('[data-mxsim-template]')) {
        void openTemplateMode();
        return;
      }
      if (!isOpen()) return;
      var buffCard = e.target.closest('[data-mxsim-buff]');
      if (buffCard) {
        toggleBuff(String(buffCard.dataset.mxsimBuff));
        renderShell();
        return;
      }
      var bossBtn = e.target.closest('[data-mxsim-boss]');
      if (bossBtn) {
        ui.startBoss = Number(bossBtn.dataset.mxsimBoss) || 0;
        renderShell();
        return;
      }
      if (e.target.closest('[data-mxsim-goto-public]')) {
        setOpen(false);
        if (window.PublicDb && typeof PublicDb.open === 'function') PublicDb.open();
        return;
      }
      if (e.target.closest('[data-mxsim-run]')) {
        if (!ui.running) void runSim();
        return;
      }
    });
    document.body.addEventListener('change', function (e) {
      if (!isOpen()) return;
      if (e.target.matches('[data-mxsim-season]')) {
        ui.seasonId = e.target.value;
        ui.startBoss = 0;
        ui.result = null;
        renderShell();
        return;
      }
      if (e.target.matches('[data-mxsim-round]')) {
        ui.startRound = Math.max(1, Number(e.target.value) || 1);
        return;
      }
    });
    document.body.addEventListener('input', function (e) {
      if (!isOpen()) return;
      if (e.target.matches('[data-mxsim-hp]')) {
        ui.startHpPct = Math.min(100, Math.max(1, Number(e.target.value) || 100));
        var label = $('[data-mxsim-hp-label]');
        if (label) label.textContent = ui.startHpPct + '%';
      }
    });
  }

  /* ---------- 打开/关闭 ---------- */

  function setOpen(open) {
    document.body.classList.toggle('matrix-sim-open', !!open);
    var page = document.getElementById('matrixSimPage');
    if (page) page.hidden = !open;
    if (open) {
      if (window.PublicDb && typeof PublicDb.close === 'function') PublicDb.close();
      if (window.WaveCalcProfile && typeof WaveCalcProfile.close === 'function') WaveCalcProfile.close();
      if (window.Matrix && typeof Matrix.close === 'function') Matrix.close();
      renderShell();
      void loadSeasons().then(function () {
        if (isOpen()) renderShell();
      });
    }
  }

  function boot() {
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.MatrixSim = {
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    isOpen: isOpen,
    openTemplateMode: openTemplateMode,
    runTemplateSim: runTemplateSim,
    assembleTemplateWorkspacePayload: assembleTemplateWorkspacePayload,
  };
})();
