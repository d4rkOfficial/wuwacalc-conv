/* 玩家指定轮次的编辑辅助；计算沿用既有技能、Buff 和叠层解析。 */
(() => {
  const W = window.__WC;
  const clone = value => JSON.parse(JSON.stringify(value));
  let session = null;
  let busy = false;
  let pending = false;
  const fields = ['buffMode', 'buffActive', 'buffStacks', '_autoMatchedFalse', 'buffActiveSig', 'buffStacksSig'];
  const skills = member => (member.phases || []).flatMap(phase =>
    (phase.skills || []).map(skill => ({ phase, skill })));
  // 叠层读数会规范化轮次快照；内容身份相同的副本仍属于本次同步会话。
  const roundStructure = member => JSON.stringify((member.cycleConfig?.rounds || []).map(round => [
    (round.rotationCatalog || []).map(entry => entry.id),
    (round.phases || []).map(phase => [phase.id,
      (phase.skills || []).map(skill => [skill.id, skill.roundSyncKey,
        (skill.hits || []).map(hit => [hit.id, hit.roundSyncKey])])])
  ]));
  const coverage = (skill, member) => JSON.stringify([fields.map(k => skill[k]),
    (skill.hits || []).map(hit => [hit.roundSyncKey, ...fields.map(k => hit[k])]),
    member.cycleConfig.rounds[W.readActiveCycleRoundIndex(member)]?.catalogStacks?.[skill.catalogId]]);
  function reset() { session = null; pending = false; }
  function valid(member) {
    if (!session) return false;
    if (session.member !== member || session.chain !== member.resonanceUnlocked ||
        session.character !== member.characterId || W.state._cfgV2Applying ||
        session.structure !== roundStructure(member)) { reset(); return false; }
    return true;
  }
  function remember(member) {
    if (!session) return;
    session.before = new Map(skills(member).map(({ skill }) => [skill.id, coverage(skill, member)]));
    session.activeRound = W.readActiveCycleRoundIndex(member);
  }
  function undo(member, label) {
    W.pushEditUndo(member, label, { includeResonanceAxis: true, includeCycleRounds: true });
  }
  function begin(member, skillIds, hitId) {
    if (busy || !valid(member) || !session.targets.has(W.readActiveCycleRoundIndex(member))) return false;
    const ids = new Set(skillIds || []);
    const eligible = skills(member).filter(({ phase, skill }) => ids.has(skill.id) && !phase.locked &&
      !skill.locked && session.keys.has(skill.roundSyncKey));
    if (!eligible.length) return false;
    if (!pending) {
      remember(member);
      undo(member, '同步修改多轮 Buff');
      pending = { ids: new Set(), hitId, undo: W.peekEditUndo(member) };
    }
    eligible.forEach(({ skill }) => pending.ids.add(skill.id));
    return true;
  }
  function writeCoverage(from, to) {
    fields.forEach(key => {
      if (from[key] === undefined) delete to[key];
      else to[key] = clone(from[key]);
    });
  }
  function followDefault(skillId, hitId) {
    const member = W.getActiveMember();
    const item = skills(member).find(({ skill }) => skill.id === skillId);
    if (!item || item.skill.locked || item.phase.locked) return;
    if (!begin(member, [skillId], hitId)) undo(member, '技能跟随默认 Buff');
    const units = hitId ? (item.skill.hits || []).filter(h => h.id === hitId) :
      [item.skill, ...(item.skill.hits || [])];
    units.filter(unit => !unit.locked).forEach(unit => {
      unit.buffMode = 'inherit'; unit.buffActive = {}; unit.buffStacks = {};
      delete unit.buffActiveSig; delete unit.buffStacksSig; delete unit._autoMatchedFalse;
    });
    if (!hitId && item.skill.catalogId) delete member.cycleConfig.rounds[W.readActiveCycleRoundIndex(member)].catalogStacks[item.skill.catalogId];
    W.persistCycleEditingIfEnabled(member); W.computeAll(); W.render(); W.scheduleSave();
  }
  function editRound(member, index, fn) {
    member.cycleConfig.activeRound = index;
    W.loadRoundSnapshot(member, index);
    fn();
    W.persistCycleEditingIfEnabled(member);
  }
  function propagate(member) {
    if (busy || !valid(member)) return;
    const active = W.readActiveCycleRoundIndex(member);
    // 切轮只是改变查看内容，不应被当作一次 Buff 编辑。
    if (active !== session.activeRound) { pending = false; remember(member); return; }
    if (!pending || !session.targets.has(active)) { remember(member); return; }
    const hitId = pending.hitId;
    const changed = skills(member).filter(({ skill }) => pending.ids.has(skill.id) && skill.roundSyncKey &&
      session.keys.has(skill.roundSyncKey) && session.before.has(skill.id) &&
      session.before.get(skill.id) !== coverage(skill, member)).map(({ skill }) => ({ skill: clone(skill),
        layers: clone(member.cycleConfig.rounds[active].catalogStacks?.[skill.catalogId] || {}) }));
    if (!changed.length) {
      if (W.peekEditUndo(member) === pending.undo) {
        W.editUndoStacks.get(member.id)?.pop();
        W.refreshUndoUi();
      }
      pending = false; remember(member); return;
    }
    busy = true;
    try {
      W.saveActiveRoundSnapshot(member);
      session.targets.forEach(index => {
        if (index === active || !member.cycleConfig.rounds[index]) return;
        editRound(member, index, () => {
          skills(member).forEach(({ phase, skill }) => {
            if (skill.locked || phase.locked) return;
            const entry = changed.find(s => s.skill.roundSyncKey === skill.roundSyncKey);
            const from = entry?.skill;
            if (!from || !!from.split !== !!skill.split) return;
            if (!hitId) {
              writeCoverage(from, skill);
              if (skill.catalogId) {
                member.cycleConfig.rounds[index].catalogStacks ||= {};
                member.cycleConfig.rounds[index].catalogStacks[skill.catalogId] = clone(entry.layers);
              }
            }
            (skill.hits || []).forEach(hit => {
              if (hit.locked) return;
              const source = (from.hits || []).find(h => h.roundSyncKey && h.roundSyncKey === hit.roundSyncKey);
              if (source && (!hitId || source.id === hitId)) writeCoverage(source, hit);
            });
            W.collectSkillBuffUnits(skill).forEach(unit => W.syncUnitBuffCoverageSigs(unit, member));
          });
        });
      });
    } finally {
      member.cycleConfig.activeRound = active;
      W.loadRoundSnapshot(member, active);
      busy = false;
      pending = false;
      remember(member);
    }
  }
  const axisSignature = c => JSON.stringify([c.name || '', c.librarySkillName || '',
    c.damageType || '', c.damageElement || '', c.scaleStat || '', !!c.fixedDamage]);
  function phaseForSource(member, source) {
    const exact = (member.phases || []).filter(p => p.id === source.phase.id);
    if (exact.length === 1) return exact[0];
    const named = (member.phases || []).filter(p => p.name === source.phase.name);
    return named.length === 1 ? named[0] : null;
  }
  function preservePhaseBuffs(member, skill, from, to) {
    if (!from || from === to || JSON.stringify([from.buffMode, from.buffActive, from.buffStacks]) ===
        JSON.stringify([to.buffMode, to.buffActive, to.buffStacks])) return;
    const active = W.resolveBuffActive(from.buffMode, from.buffActive, { ...member.globalBuffActive });
    W.collectSkillBuffUnits(skill).filter(unit => !unit.locked).forEach(unit => {
      const coverage = clone(W.getBatchUnitResolvedActive(unit, active));
      const stacks = {};
      (member.buffs || []).filter(W.isStackBuff).forEach(buff => {
        stacks[buff.id] = W.getBatchUnitResolvedStack(unit, skill, from, member, buff.id);
      });
      unit.buffMode = 'custom'; unit.buffActive = coverage; unit.buffStacks = stacks;
      W.syncUnitBuffCoverageSigs(unit, member);
    });
  }
  function insertTimelineItems(member, entries, order) {
    const ranks = new Map(order.map((c, i) => [c.id, i]));
    entries.sort((a, b) => ranks.get(a.skill.catalogId) - ranks.get(b.skill.catalogId));
    entries.forEach(entry => {
      preservePhaseBuffs(member, entry.skill, entry.from, entry.phase);
      (member.phases || []).forEach(p => { p.skills = p.skills.filter(s => s !== entry.skill); });
      const rank = ranks.get(entry.skill.catalogId);
      const at = entry.phase.skills.findIndex(s => ranks.has(s.catalogId) && ranks.get(s.catalogId) > rank);
      entry.phase.skills.splice(at < 0 ? entry.phase.skills.length : at, 0, entry.skill);
    });
    // 只清理由旧同步入口遗留、且已迁空的自动阶段。
    member.phases = member.phases.filter(p => p.locked || p.skills.length || !p.name?.startsWith('同步添加 · '));
  }
  function matchAxisAnchor(source, baseSource, target, sourceKeys, member) {
    const exact = target.filter(c => c.id === source.id && axisSignature(c) === axisSignature(source));
    if (exact.length === 1) return exact[0];
    const keys = sourceKeys.get(source.id) || [];
    const linked = skills(member).filter(x => keys.includes(x.skill.roundSyncKey));
    const ids = [...new Set(linked.map(x => x.skill.catalogId))];
    if (ids.length === 1) return target.find(c => c.id === ids[0]) || null;
    const peers = baseSource.filter(c => axisSignature(c) === axisSignature(source));
    const matches = target.filter(c => axisSignature(c) === axisSignature(source));
    // 部分稳定ID保留时，不能把另一个同名条目当作缺失锚点。
    if (peers.length !== matches.length || matches.some(c => peers.some(p => p.id === c.id))) return null;
    return matches[peers.indexOf(source)] || null;
  }
  function arrangeAxisTarget(member, index, payload, sourceOrder, sourceKeys, stats) {
    W.ensureMemberAxisOffsets(member); W.sortCatalogByAxisOffset(member);
    const original = [...member.rotationCatalog];
    const originals = skills(member);
    const selectedIds = new Set(payload.map(p => p.catalog.id));
    const existingCats = new Set(originals.filter(x => payload.some(p => p.skill.roundSyncKey === x.skill.roundSyncKey)).map(x => x.skill.catalogId));
    const base = original.filter(c => !existingCats.has(c.id));
    const baseSource = sourceOrder.filter(c => !selectedIds.has(c.id));
    const anchors = new Map(baseSource.map(c => [c.id, matchAxisAnchor(c, baseSource, base, sourceKeys, member)]));
    const slots = new Map(); const entries = []; const cats = new Map(); const createdPhases = new Map();
    const widths = new Map(original.map(c => [c.id, W.getCatalogAxisOffset(c)]));
    const sorted = [...payload].sort((a, b) => sourceOrder.findIndex(c => c.id === a.catalog.id) - sourceOrder.findIndex(c => c.id === b.catalog.id));
    sorted.forEach(source => {
      const linked = originals.filter(x => x.skill.roundSyncKey === source.skill.roundSyncKey);
      if (linked.length > 1 || linked.some(x => x.skill.locked || x.phase.locked)) { stats.skipped++; return; }
      const rank = sourceOrder.findIndex(c => c.id === source.catalog.id);
      const previous = sourceOrder.slice(0, rank).reverse().map(c => anchors.get(c.id)).find(Boolean);
      const next = sourceOrder.slice(rank + 1).map(c => anchors.get(c.id)).find(Boolean);
      if (previous && next && base.indexOf(previous) >= base.indexOf(next)) { stats.skipped++; return; }
      const slot = next ? base.indexOf(next) : previous ? base.indexOf(previous) + 1 : base.length;
      let phase = phaseForSource(member, source);
      if (!phase) {
        const nearby = originals.find(x => x.skill.catalogId === (next || previous)?.id);
        phase = nearby?.phase;
      }
      if (phase?.locked) { stats.skipped++; return; }
      if (!phase) {
        phase = createdPhases.get(source.phase.id);
        if (!phase) {
          phase = clone(source.phase); phase.id = W.genId(); phase.skills = [];
          phase.name = `同步添加 · ${source.phase.name || '阶段'}`;
          phase.locked = false; phase.collapsed = false;
          member.phases.push(phase); createdPhases.set(source.phase.id, phase);
        }
      }
      const old = linked[0];
      let cat = cats.get(source.catalog.id) || (old && original.find(c => c.id === old.skill.catalogId));
      if (old && !cat) { stats.skipped++; return; }
      if (!cat) {
        cat = clone(source.catalog); cat.id = W.genId();
        member.cycleConfig.rounds[index].catalogStacks ||= {};
        member.cycleConfig.rounds[index].catalogStacks[cat.id] = clone(source.layers);
      }
      if (!cats.has(source.catalog.id)) {
        cats.set(source.catalog.id, cat);
        if (!slots.has(slot)) slots.set(slot, []);
        slots.get(slot).push({ cat, sourceOffset: source.catalog.axisOffsetPx });
      }
      let skill = old?.skill;
      if (!skill) {
        skill = clone(source.skill); skill.id = W.genId(); skill.catalogId = cat.id;
        (skill.hits || []).forEach(hit => { hit.id = W.genId(); });
        W.stripSkillRuntimeFields(skill); stats.added++;
      } else stats.updated++;
      entries.push({ skill, phase, from: old?.phase || source.phase });
      if (!previous && !next) stats.appended++;
    });
    if (!entries.length) return;
    // 被跳过的已同步条目继续保留原轴顺序，绝不能从轨道消失。
    const moving = new Set([...cats.values()].map(c => c.id));
    const retained = original.filter(c => existingCats.has(c.id) && !moving.has(c.id));
    retained.reverse().forEach(c => {
      const before = original.slice(0, original.indexOf(c)).reverse().find(x => base.includes(x));
      const slot = before ? base.indexOf(before) + 1 : 0;
      if (!slots.has(slot)) slots.set(slot, []);
      slots.get(slot).unshift({ cat: c, sourceOffset: widths.get(c.id) });
    });
    const order = []; const inserted = new Map();
    for (let i = 0; i <= base.length; i++) {
      (slots.get(i) || []).forEach(x => { order.push(x.cat); inserted.set(x.cat.id, x.sourceOffset); });
      if (i < base.length) order.push(base[i]);
    }
    const wrap = Math.round(document.querySelector('.axis-time-canvas')?.getBoundingClientRect().width || 920);
    let end = 8;
    order.forEach(cat => {
      const width = W.estimateAxisChipWidthPx(cat.name);
      let offset = Math.max(end, Number(inserted.has(cat.id) ? inserted.get(cat.id) : widths.get(cat.id)) || 0);
      if (wrap > width && offset % wrap + width > wrap) offset = (Math.floor(offset / wrap) + 1) * wrap + 8;
      W.setCatalogAxisOffset(cat, offset); end = offset + width + 8;
    });
    member.rotationCatalog = order;
    insertTimelineItems(member, entries, order);
  }
  function add(member, catalogIds, targetIndices) {
    if (!member.cycleConfig?.enabled) throw Error('请先启用多轮轴');
    const active = W.readActiveCycleRoundIndex(member);
    const targets = [...new Set(targetIndices)].filter(i => Number.isInteger(i) &&
      i >= 0 && i < member.cycleConfig.rounds.length && i !== active);
    const chosen = new Set(catalogIds);
    const catalog = (member.rotationCatalog || []).filter(c => chosen.has(c.id) && !W.isAxisLinkedSpecialCatalogEntry(c));
    if (!catalog.length || !targets.length) throw Error('请选择技能和目标轮次');
    chosen.clear(); catalog.forEach(c => chosen.add(c.id));
    reset(); W.matrixRows?.reset();
    undo(member, '按源轴顺序同步添加');
    busy = true;
    const stats = { added: 0, updated: 0, skipped: 0, appended: 0 };
    try {
      W.ensureMemberAxisOffsets(member); W.sortCatalogByAxisOffset(member);
      W.addCatalogSkillsToTimeline(catalog.map(c => c.id), { quiet: true, skipUndo: true });
      const sourceOrder = clone(member.rotationCatalog);
      const sources = skills(member).filter(({ phase, skill }) => chosen.has(skill.catalogId) && !skill.locked && !phase.locked);
      sources.forEach(({ skill }) => {
        skill.roundSyncKey ||= W.genId();
        (skill.hits || []).forEach(hit => { hit.roundSyncKey ||= W.genId(); });
      });
      insertTimelineItems(member, sources.map(x => ({ ...x, from: x.phase })), member.rotationCatalog);
      W.persistCycleEditingIfEnabled(member);
      const sourceKeys = new Map(sourceOrder.map(c => [c.id, skills(member).filter(x => x.skill.catalogId === c.id).map(x => x.skill.roundSyncKey).filter(Boolean)]));
      const payload = sources.map(({ phase, skill }) => ({ phase: clone(phase), skill: clone(skill),
        catalog: clone(sourceOrder.find(c => c.id === skill.catalogId)),
        layers: clone(member.cycleConfig.rounds[active].catalogStacks?.[skill.catalogId] || {}) }));
      targets.forEach(index => editRound(member, index, () => arrangeAxisTarget(member, index, payload, sourceOrder, sourceKeys, stats)));
    } finally {
      member.cycleConfig.activeRound = active;
      W.loadRoundSnapshot(member, active);
      busy = false;
    }
    W.computeAll(); W.render(); W.scheduleSave(); W.refreshUndoUi();
    W.setCatalogScrollHint(`已按源轴顺序向 ${targets.length} 轮添加 ${stats.added} 个技能，更新 ${stats.updated} 个已同步技能排列${stats.skipped ? `，跳过 ${stats.skipped} 个锁定或顺序冲突条目` : ''}${stats.appended ? `；${stats.appended} 个无对应前后技能，按源轴顺序追加到末尾` : ''} · 可撤回`);
    return stats;
  }

  function enable(member, keys, targets) {
    reset();
    session = { member, character: member.characterId, chain: member.resonanceUnlocked,
      structure: roundStructure(member), keys: new Set(keys), targets: new Set(targets) };
    remember(member);
  }
  function axisTools(member) {
    if (!member.cycleConfig?.enabled || member.cycleConfig.rounds.length < 2) return '';
    return '<button type="button" class="toolbar-btn" data-round-sync-add>同步添加到轮次</button>';
  }
  function buffTools(phase, member) {
    const linked = (phase.skills || []).filter(s => s.roundSyncKey);
    if (!member.cycleConfig?.enabled || !linked.length) return '';
    const on = valid(member) && linked.some(s => session.keys.has(s.roundSyncKey));
    const rounds = on ? [...session.targets].map(i => `第${i + 1}轮`).join('、') : '';
    return `<div class="round-sync-bar"><button type="button" class="btn sm${on ? ' primary' : ''}" data-round-sync-buff="${W.escapeHtml(phase.id)}" aria-pressed="${!!on}">${on ? '同步修改 Buff：已开启' : '同步修改 Buff'}</button><span class="hint">${on ? W.escapeHtml(rounds) + ' · 仅本批对应技能' : '自行选择轮次和对应技能'}</span>${on ? '<button type="button" class="btn sm" data-round-sync-off>关闭同步</button>' : ''}</div>`;
  }
  function defaultTool(skill, hit) {
    if (!skill.roundSyncKey || skill.locked || hit?.locked) return '';
    return `<button type="button" class="round-sync-default" data-round-sync-default="${W.escapeHtml(skill.id)}"${hit ? ` data-round-sync-hit="${W.escapeHtml(hit.id)}"` : ''} title="此${hit ? ' Hit' : '技能'}跟随默认 Buff${hit ? '' : '（含 Hit）'}">跟随默认</button>`;
  }
  let dialog = null;
  let returnFocus = null;
  function close() { dialog?.close(); dialog?.remove(); dialog = null; returnFocus?.focus(); }
  function open(mode, phaseId, opener) {
    const member = W.getActiveMember();
    const active = W.readActiveCycleRoundIndex(member);
    const phase = member.phases.find(p => p.id === phaseId);
    const entries = mode === 'add' ? (member.rotationCatalog || []).filter(c =>
      W.getCatalogSelectedIds(member).includes(c.id) && !W.isAxisLinkedSpecialCatalogEntry(c)) :
      (phase?.skills || []).filter(s => s.roundSyncKey && !s.locked);
    if (!entries.length) { W.setCatalogScrollHint('请先选中要同步添加的普通技能'); return; }
    close(); returnFocus = opener;
    dialog = document.createElement('dialog'); dialog.className = 'round-sync-dialog';
    dialog.innerHTML = `<form method="dialog"><h3>${mode === 'add' ? '同步添加到轮次' : '同步修改 Buff'}</h3><p class="hint">${mode === 'add' ? '按当前轴顺序插入并留出空间。再次同步更新排列，保留目标轮已修改的 Buff。' : '开启后，将以下技能的 Buff 勾选、叠层与跟随默认设置同步到选定轮次。'}</p><fieldset><legend>${mode === 'add' ? '添加到哪些轮次' : '同步哪些轮次'}</legend><div class="round-sync-options">${member.cycleConfig.rounds.map((r, i) => `<label><input type="checkbox" data-round-sync-target value="${i}"${i === active ? ' checked disabled' : ''}>第${i + 1}轮${i === active ? '（当前）' : ''}</label>`).join('')}</div></fieldset><fieldset><legend>${mode === 'add' ? `选中 ${entries.length} 个技能` : '同步哪些技能'}</legend><div class="round-sync-options">${entries.map((e, i) => `<label>${mode === 'buff' ? `<input type="checkbox" data-round-sync-key value="${W.escapeHtml(e.roundSyncKey)}" checked>` : ''}${i + 1}. ${W.escapeHtml(e.name)}</label>`).join('')}</div></fieldset><p class="hint" data-round-sync-error role="status"></p><div class="round-sync-actions"><button type="button" class="btn" data-round-sync-cancel>取消</button><button type="button" class="btn primary" data-round-sync-confirm>${mode === 'add' ? '添加到选定轮次' : '开启同步'}</button></div></form>`;
    document.body.append(dialog); dialog.showModal();
    dialog.addEventListener('cancel', close);
    dialog.querySelector('[data-round-sync-cancel]').onclick = close;
    dialog.querySelector('[data-round-sync-confirm]').onclick = () => {
      if (W.getActiveMember() !== member) { close(); return; }
      const targets = [...dialog.querySelectorAll('[data-round-sync-target]:checked')].map(e => Number(e.value));
      const keys = [...dialog.querySelectorAll('[data-round-sync-key]:checked')].map(e => e.value);
      if (targets.length < 2 || (mode === 'buff' && !keys.length)) {
        dialog.querySelector('[data-round-sync-error]').textContent = '请至少选择一个其他轮次' + (mode === 'buff' ? '和一个技能' : ''); return;
      }
      if (mode === 'add') add(member, entries.map(e => e.id), targets);
      else { enable(member, keys, targets); W.render(); }
      close();
    };
  }
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-round-sync-add], [data-round-sync-buff], [data-round-sync-off], [data-round-sync-default]');
    if (!el) return;
    event.preventDefault(); event.stopPropagation();
    if (el.hasAttribute('data-round-sync-default')) followDefault(el.dataset.roundSyncDefault, el.dataset.roundSyncHit);
    else if (el.hasAttribute('data-round-sync-off')) { reset(); W.render(); }
    else open(el.hasAttribute('data-round-sync-add') ? 'add' : 'buff', el.dataset.roundSyncBuff, el);
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-export-cfg-apply], [data-export-cfg-delete]')) reset();
  }, true);
  W.roundSync = { axisTools, buffTools, defaultTool, begin, propagate, add, enable, reset };
  // 永久兼容别名；跨文件调用继续使用 __WC。
  Object.defineProperty(window, 'roundSync', {
    configurable: true, enumerable: true,
    get: () => W.roundSync, set: value => { W.roundSync = value; }
  });
})();
