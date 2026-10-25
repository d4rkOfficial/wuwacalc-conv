/* 配置变化窗口：只观察已保存工作台的配装/全队设置，不写保存记录。 */
(() => {
  const wc = window.__WC;
  if (!wc || wc.configChangeNotice) return;
  let baseline = null, latest = null, timer = 0, pending = false, busy = 0, weaponBusy = 0;
  let panel, badge, content, minimized = false, mounted = false, changeCount = 0;
  const fmt = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const safe = fn => { try { return fn(); } catch (error) { console.warn('[config-change-notice]', error); } };
  const saved = () => (wc.state.exportConfigSnapshots || []).length > 0;
  const effects = buff => (buff.effects || []).map(({ id, ...effect }) => effect);
  function snapshot() {
    const fields = {}, buffs = {}, results = {};
    const put = (key, name, value) => { fields[key] = { name, value }; };
    (wc.state.members || []).forEach((m, index) => {
      const who = m.name || `角色${index + 1}`, key = `${index}:${m.characterId}`;
      put(key + ':chain', who + ' · 共鸣链', `${m.resonanceUnlocked || 0} 链`);
      const weapon = wc.findWeaponDef?.(m.weaponSelection?.id);
      put(key + ':weapon', who + ' · 武器', `${weapon?.name || m.weaponSelection?.name || (m.weaponSelection?.id ? '自定义武器' : '无武器')} · R${m.weaponSelection?.refinement || 1}`);
      (m.echoConfig?.setLoadout || []).forEach((set, i) => {
        const def = wc.findEchoSetDef?.(set.setId);
        put(key + ':set:' + i, who + ' · 声骸套装 ' + (i + 1), set.setId ? `${def?.name || '套装 ' + set.setId} · ${set.count || 0} 件` : '未装备');
        const echo = wc.findEchoSpecimen?.(set.echoId);
        put(key + ':echo:' + i, who + ' · 主位声骸 ' + (i + 1), echo?.name || set.echoId || '无');
      });
      const panelLabels = { energyRegenPctSources: '共鸣效率', atkPercentSources: '攻击加成', flatAtkSources: '固定攻击', critRateSources: '暴击', critDmgSources: '暴击伤害', hpPercentSources: '生命加成', defPercentSources: '防御加成' };
      Object.entries(panelLabels).forEach(([stat, label]) => (m.char?.[stat] || []).forEach(source => {
        const name = source.name && source.name !== label ? `${label} · ${source.name}` : label;
        put(`${key}:panel:${stat}:${source.id}`, `${who} · ${name}`, String(source.value ?? 0) + (stat === 'flatAtkSources' ? '' : '%'));
      }));
      (m.buffs || []).forEach(b => {
        const identity = b.teamSourceId || b.templateKey || b.id;
        if (!identity) return;
        const active = m.globalBuffActive?.[b.id] !== false &&
          !(b.teamSourceId && (m.excludedTeamBuffIds || []).includes(b.teamSourceId));
        buffs[`${key}:${identity}:${b.category}:${b.element || ''}:${b.damageType || ''}`] = {
          name: `${who} · ${b.name || 'Buff'}`, active,
          value: b.mode === 'stack' ? `${b.perStack || 0} × ${m.globalBuffStacks?.[b.id] ?? b.defaultStacks ?? 0} 层` : String(b.value ?? 0),
          effects: effects(b),
        };
      });
      results[key] = { name: who, er: Number(wc.getMemberEnergyRegenPct?.(m)), energy: Number(m.results?.energyRegen) };
    });
    const shared = wc.state.team?.sharedBuffs;
    (shared?.buffs || []).forEach(b => {
      buffs['team:' + (b.templateKey || b.id)] = { name: '全队 · ' + b.name,
        active: shared.globalBuffActive?.[b.id] !== false,
        value: b.mode === 'stack' ? `${b.perStack || 0} × ${shared.globalBuffStacks?.[b.id] || 0} 层` : String(b.value ?? 0),
        effects: effects(b) };
    });
    return JSON.parse(JSON.stringify({ fields, buffs, results, dps: Number(wc.state.teamResults?.dps) || 0 }));
  }
  function compare(before, after) {
    const lines = [];
    for (const key of new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])) {
      const a = before.fields[key], b = after.fields[key];
      if (!equal(a?.value, b?.value)) lines.push(`${b?.name || a.name}：${a?.value || '无'} → ${b?.value || '无'}`);
    }
    for (const key of new Set([...Object.keys(before.buffs), ...Object.keys(after.buffs)])) {
      const a = before.buffs[key], b = after.buffs[key];
      if (!a) lines.push(`新增 ${b.name}（全局默认${b.active ? '启用' : '停用'}，数值 ${b.value}）`);
      else if (!b) lines.push(`移除 ${a.name}`);
      else {
        if (a.active !== b.active) lines.push(`${b.active ? '启用' : '停用'} ${b.name}（全局默认）`);
        if (a.value !== b.value) lines.push(`${b.name}：${a.value} → ${b.value}`);
        if (!equal(a.effects, b.effects)) lines.push(`${b.name}：复合效果发生变化`);
      }
    }
    return lines;
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    const style = document.createElement('style');
    style.textContent = `#cfgChangePanel{position:fixed;z-index:9000;right:20px;bottom:86px;width:min(390px,calc(100vw - 24px));max-height:70vh;display:flex;flex-direction:column;background:var(--panel-bg,#16202d);color:var(--text,#eaf0f6);border:1px solid #8392a8;border-radius:12px;box-shadow:0 10px 40px #0006;font:13px/1.55 system-ui}#cfgChangePanel[hidden],#cfgChangeBadge[hidden]{display:none}#cfgChangePanel header{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move;touch-action:none;border-bottom:1px solid #8392a844}#cfgChangePanel button,#cfgChangeBadge{font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid #8392a888;border-radius:6px;padding:5px 9px}#cfgChangePanel button:focus-visible,#cfgChangeBadge:focus-visible{outline:2px solid #61d5de;outline-offset:3px}#cfgChangeContent{padding:12px 14px;overflow:auto;overscroll-behavior:contain}#cfgChangeContent p{margin:0 0 9px}#cfgChangeContent ul{padding-left:19px;margin:0}#cfgChangeContent li{margin:5px 0}#cfgChangePanel footer{padding:10px 14px;border-top:1px solid #8392a844;display:flex;gap:10px;align-items:center}#cfgChangePanel small{opacity:.8;font-size:11px}#cfgChangeBadge{position:fixed;right:18px;bottom:86px;z-index:8999;background:#16202d;color:#eaf0f6;box-shadow:0 5px 20px #0004}@media(max-width:640px){#cfgChangePanel,#cfgChangeBadge{bottom:70px}}`;
    document.head.appendChild(style);
    panel = document.createElement('section'); panel.id = 'cfgChangePanel';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '配置变化');
    panel.innerHTML = '<header><strong>配置变化</strong><button type="button" data-cfg-change-minimize aria-label="收起配置变化">收起</button></header><div id="cfgChangeContent"></div><footer><button type="button" data-cfg-change-confirm>确认变化</button><small>清空本批变化，不覆盖保存配置</small></footer>';
    content = panel.querySelector('#cfgChangeContent');
    badge = document.createElement('button'); badge.id = 'cfgChangeBadge'; badge.type = 'button'; badge.hidden = true;
    badge.setAttribute('aria-label', '展开配置变化');
    document.body.append(panel, badge);
    panel.querySelector('[data-cfg-change-minimize]').onclick = () => { minimized = true; paintVisibility(); badge.focus(); };
    badge.onclick = () => { minimized = false; paintVisibility(); panel.querySelector('button').focus(); };
    panel.querySelector('[data-cfg-change-confirm]').onclick = () => {
      if (pending || weaponBusy || busy) return;
      baseline = safe(snapshot) || latest; latest = baseline; changeCount = 0;
      pending = false; clearTimeout(timer); render([]);
    };
    const header = panel.querySelector('header');
    let drag;
    header.onpointerdown = e => {
      if (e.target.closest('button') || e.button !== 0) return;
      const rect = panel.getBoundingClientRect(); drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      header.setPointerCapture(e.pointerId); e.preventDefault();
    };
    header.onpointermove = e => {
      if (!drag) return;
      panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, e.clientX - drag.x)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - panel.offsetHeight, e.clientY - drag.y)) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    };
    header.onpointerup = header.onpointercancel = () => { drag = null; };
    window.addEventListener('resize', () => {
      if (!panel.style.left) return;
      panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, parseFloat(panel.style.left))) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - panel.offsetHeight, parseFloat(panel.style.top))) + 'px';
    });
  }
  function paintVisibility() { panel.hidden = minimized; badge.hidden = !minimized; badge.textContent = `配置变化 · ${changeCount}`; }
  function render(lines) {
    mount(); content.replaceChildren();
    const p = text => { const node = document.createElement('p'); node.textContent = text; content.appendChild(node); };
    if (!lines.length) p('当前没有待确认的配置变化。');
    else {
      p(`DPS：${fmt(baseline.dps)} → ${fmt(latest.dps)}（${latest.dps >= baseline.dps ? '+' : ''}${fmt(latest.dps - baseline.dps)}）`);
      Object.entries(latest.results).forEach(([key, b]) => {
        const a = baseline.results[key]; if (!a) return;
        if (Number.isFinite(a.er) && Number.isFinite(b.er) && a.er !== b.er) p(`${b.name} · 共鸣效率：${fmt(a.er)}% → ${fmt(b.er)}%`);
        if (Number.isFinite(a.energy) && Number.isFinite(b.energy) && Math.abs(a.energy - b.energy) > 0.005) p(`${b.name} · 最终回能：${fmt(a.energy)} → ${fmt(b.energy)}`);
      });
      const list = document.createElement('ul');
      lines.forEach(text => { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); });
      content.appendChild(list);
      p('数值为整份当前方案的重算结果；Buff 列表记录全局设置，具体技能仍按对照表覆盖结算。');
    }
    panel.querySelector('[data-cfg-change-confirm]').disabled = pending || weaponBusy > 0 || busy > 0;
    paintVisibility();
  }
  function finish() {
    if (!pending || busy || weaponBusy) return;
    pending = false; if (!saved()) { reset(); return; }
    latest = snapshot(); const lines = compare(baseline, latest); changeCount = lines.length;
    if (changeCount || mounted) render(lines);
  }
  function reset() {
    clearTimeout(timer); pending = false; baseline = saved() ? snapshot() : null; latest = baseline; changeCount = 0;
    if (mounted) render([]);
  }
  const selectors = [
    '[data-echo-set-count]', '[data-echo-set-pick]', '[data-echo-set-entry-echo]', '[data-echo-active-set]', '[data-echo-specimen]', '[data-echo-main-slot]',
    '[role="radiogroup"][aria-label="共鸣链等级"]', '[role="radiogroup"][aria-label="武器精炼等级"]',
    '[data-set-resonance]', '[data-resonance-axis-enable]', '[data-weapon-select]', '[data-weapon-refinement]',
    '[data-pick-weapon]', '[data-weapon-refinement-btn]', '[data-weapon-picker-confirm]', '[data-weapon-picker-reset]',
    '[data-team-global-buff]', '[data-team-buff-assign]', '[data-weapon-team-buff-toggle]',
    '[data-add-team-buff]', '[data-del-team-buff]', '[data-team-buff-value]', '[data-team-buff-mode]',
    '[data-team-buff-stack]', '[data-team-buff-per-stack]',
  ].join(',');
  function observe(e) {
    if (busy || !saved() || !e.target.closest || e.target.closest('#cfgChangePanel, #cfgChangeBadge, .calc-buff-panel, .buff-matrix')) return;
    const globalControl = e.target.closest('[data-global-buff], [data-stack-scope="global"][data-buff-stack-id]');
    const buffId = globalControl?.dataset.globalBuff || globalControl?.dataset.buffStackId;
    const sharedGlobal = buffId && (wc.state.members || []).some(m => (m.buffs || []).some(b => b.id === buffId && b.teamSourceId));
    if (!e.target.closest(selectors) && !sharedGlobal) return;
    safe(() => {
      if (!baseline) baseline = snapshot(); pending = true;
      if (mounted) panel.querySelector('[data-cfg-change-confirm]').disabled = true;
      clearTimeout(timer); timer = setTimeout(() => safe(finish), 180);
    });
  }
  document.addEventListener('click', observe, true);
  document.addEventListener('change', observe, true);
  document.addEventListener('pointerdown', observe, true);
  document.addEventListener('pointerup', observe, true);
  document.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) observe(e); }, true);
  // 武器数据库加载是异步的，等原操作结束后再读取结果，不额外触发计算。
  const weaponApply = wc.applyWeaponSelectionToMember;
  wc.applyWeaponSelectionToMember = function (...args) {
    const tracked = pending && !busy;
    if (tracked) weaponBusy += 1;
    const done = () => { if (tracked) { weaponBusy -= 1; safe(finish); } };
    try { const result = weaponApply.apply(this, args); Promise.resolve(result).then(done, done); return result; }
    catch (error) { done(); throw error; }
  };
  // 保存/导入/应用属于更换比较基准；批处理过程保持静默。
  for (const name of ['saveExportCfgV2CurrentConfig', 'saveCurrentExportConfigSnapshot', 'applyExportCfgV2Row', 'importWorkspaceFromData']) {
    const original = wc[name]; if (typeof original !== 'function') continue;
    wc[name] = async function (...args) {
      busy += 1;
      try { const result = await original.apply(this, args); if (result?.ok !== false && !result?.cancelled) safe(reset); return result; }
      finally { busy -= 1; if (!busy) safe(finish); if (mounted && !pending && !weaponBusy) panel.querySelector('[data-cfg-change-confirm]').disabled = busy > 0; }
    };
  }
  wc.configChangeNotice = { reset, snapshot, compare };
})();
