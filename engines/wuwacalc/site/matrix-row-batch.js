/* 玩家选行和指定轮次的 Buff 编辑；写入复用既有覆盖和叠层入口。 */
(() => {
  const W = window.__WC;
  let scope = null;
  let rows = new Map();
  let busy = false;
  let drag = null;
  let consumeClick = false;
  let clickTimer = null;
  let stackEdit = null;
  let message = '';
  let targetRounds = new Set();
  const key = (phaseId, skillId, hitId = '') => JSON.stringify([phaseId, skillId, hitId || '']);
  const round = member => member.cycleConfig?.enabled ? W.readActiveCycleRoundIndex(member) : null;
  const structure = member => JSON.stringify((member.cycleConfig?.rounds || []).map(r => [
    (r.rotationCatalog || []).map(c => c.id), (r.phases || []).map(p => [p.id,
      (p.skills || []).map(s => [s.id, (s.hits || []).map(h => h.id)])]) ]));
  function reset() { endDrag(); scope = null; rows.clear(); targetRounds.clear(); stackEdit = null; message = ''; }
  function valid(member) {
    if (!scope) return false;
    if (scope.member !== member || scope.character !== member.characterId ||
        scope.chain !== member.resonanceUnlocked || scope.round !== round(member) ||
        scope.structure !== structure(member) || W.state._cfgV2Applying) {
      reset(); return false;
    }
    rows.forEach((row, id) => { if (!find(member, row)) rows.delete(id); });
    return true;
  }
  function ensureScope(member) {
    valid(member);
    if (!scope) {
      scope = { member, character: member.characterId, chain: member.resonanceUnlocked, round: round(member), structure: structure(member) };
      if (scope.round !== null) targetRounds.add(scope.round);
    }
  }
  function find(member, row) {
    const phase = (member.phases || []).find(p => p.id === row.phaseId);
    const skill = (phase?.skills || []).find(s => s.id === row.skillId);
    const hit = row.hitId ? (skill?.hits || []).find(h => h.id === row.hitId) : null;
    if (!phase || !skill || (row.hitId && !hit) || phase.locked || skill.locked || hit?.locked) return null;
    return { phase, skill, hit };
  }
  function selected(phase, skill, hit) {
    return valid(W.getActiveMember()) && rows.has(key(phase.id, skill.id, hit?.id));
  }
  function tools(phase, member) {
    valid(member);
    const current = round(member);
    const choices = current !== null && member.cycleConfig.rounds.length > 1
      ? `<fieldset class="matrix-row-rounds"><legend>同步到哪些轮次</legend>${member.cycleConfig.rounds.map((r, i) => `<label><input type="checkbox" data-matrix-rows-round="${i}"${i === current || targetRounds.has(i) ? ' checked' : ''}${i === current ? ' disabled' : ''}>第 ${i + 1} 轮${i === current ? '（当前）' : ''}</label>`).join('')}<span class="hint">整轮同步：无需选技能，勾选目标轮次后点击“本轮全部 Buff → 指定轮次”。选行编辑仍按对应技能同步，缺失或数量不一致会跳过。</span></fieldset>` : '';
    return `<div class="matrix-row-batch-toolbar" data-matrix-rows-tools="${W.escapeHtml(phase.id)}"><strong data-matrix-rows-count role="status">${W.escapeHtml(countText(member))}</strong><button type="button" class="btn sm primary" data-matrix-rows-copy-all${rows.size && [...targetRounds].some(i => i !== current) ? '' : ' disabled'}>同步所选技能 Buff</button><button type="button" class="btn sm" data-matrix-rows-copy-round${current !== null && [...targetRounds].some(i => i !== current) ? '' : ' disabled'} title="当前角色本轮所有阶段的技能 / Hit，按对应项同步覆盖和叠层；跳过锁定或缺失项，可撤回">本轮全部 Buff → 指定轮次</button><button type="button" class="btn sm" data-matrix-rows-clear${rows.size || targetRounds.size ? '' : ' disabled'}>清空选择</button><button type="button" class="btn sm" data-edit-undo${W.peekEditUndo(member) ? '' : ' disabled'}>撤回</button><span class="hint" data-matrix-rows-hint>${W.escapeHtml(message || 'Ctrl＋左键点选或拖动批选技能 / Hit；从已选行拖动可取消，各行仍独立同步。')}</span>${choices}</div>`;
  }
  function countText(member) {
    const selectedRounds = [...targetRounds].sort((a, b) => a - b);
    return `已选 ${rows.size} 行 · ${selectedRounds.length > 1 ? '第 ' + selectedRounds.map(i => i + 1).join('、') + ' 轮' : '当前轮'}`;
  }
  function refresh(member) {
    valid(member);
    document.querySelectorAll('[data-matrix-row-skill]').forEach(el => {
      const phaseId = el.closest('[data-phase-buff-matrix]')?.dataset.phaseBuffMatrix;
      const on = !!phaseId && rows.has(key(phaseId, el.dataset.matrixRowSkill, el.dataset.hitId));
      el.classList.toggle('matrix-row-selected', on);
      el.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-matrix-rows-count]').forEach(el => el.textContent = countText(member));
    document.querySelectorAll('[data-matrix-rows-copy-all]').forEach(el => el.disabled = !rows.size || ![...targetRounds].some(i => i !== round(member)));
    document.querySelectorAll('[data-matrix-rows-copy-round]').forEach(el => el.disabled = ![...targetRounds].some(i => i !== round(member)));
    document.querySelectorAll('[data-matrix-rows-clear]').forEach(el => el.disabled = !rows.size && !targetRounds.size);
    document.querySelectorAll('[data-matrix-rows-hint]').forEach(el => el.textContent = message ||
      'Ctrl＋左键点选或拖动批选技能 / Hit；从已选行拖动可取消，各行仍独立同步。');
    document.querySelectorAll('[data-matrix-rows-round]').forEach(el => {
      const i = Number(el.dataset.matrixRowsRound);
      el.checked = i === round(member) || targetRounds.has(i);
      el.disabled = i === round(member);
    });
  }
  function toggle(member, row, checked) {
    valid(member);
    if (!find(member, row)) { message = '锁定的技能或 Hit 无法选中'; refresh(member); return; }
    ensureScope(member);
    const id = key(row.phaseId, row.skillId, row.hitId);
    if (checked ?? !rows.has(id)) rows.set(id, row); else rows.delete(id);
    // 同一编辑手势只启用一种同步入口，避免既有跨轮入口再次广播。
    W.roundSync?.reset(); stackEdit = null; message = '';
    refresh(member);
    document.querySelectorAll('[data-round-sync-buff]').forEach(button => {
      button.textContent = '同步修改 Buff'; button.setAttribute('aria-pressed', 'false'); button.classList.remove('primary');
      const bar = button.closest('.round-sync-bar');
      const hint = bar?.querySelector('.hint'); if (hint) hint.textContent = '自行选择轮次和对应技能';
      bar?.querySelector('[data-round-sync-off]')?.remove();
    });
  }
  function units(member, phaseId, skillId, hitId) {
    // 多选表示可跨轮同步的行；一次编辑只取实际被操作的技能或 Hit。
    const item = find(member, { phaseId, skillId, hitId: hitId || '' });
    if (!item) return [];
    const hits = item.hit ? [item.hit] : item.skill.split && item.skill.hits?.length ? item.skill.hits : [null];
    return hits.filter(hit => !hit?.locked).map(hit => ({ ...item, hit }));
  }
  // 技能简称只影响展示；跨轮身份优先使用技能库原名，未关联技能库的自定义技能仍按名称匹配。
  const signature = s => JSON.stringify([s.librarySkillName || s.name, s.damageType || '',
    s.damageElement || '', s.scaleStat || '', !!s.fixedDamage, !!s.split]);
  function descriptor(item, phases) {
    const peers = item.phase.skills.filter(s => signature(s) === signature(item.skill));
    return { phaseId: item.phase.id, phaseName: item.phase.name,
      phaseCount: phases.filter(p => p.name === item.phase.name).length,
      skill: { id: item.skill.id, sync: item.skill.roundSyncKey, sig: signature(item.skill),
        count: peers.length, index: peers.indexOf(item.skill), peers: peers.map(s => s.id),
        totalCount: phases.reduce((count, phase) => count + (phase.skills || []).filter(s => signature(s) === signature(item.skill)).length, 0) },
      hit: item.hit ? { id: item.hit.id, sync: item.hit.roundSyncKey,
        index: item.skill.hits.indexOf(item.hit), ids: item.skill.hits.map(h => h.id), sigs: item.skill.hits.map(signature) } : null };
  }
  function corresponding(member, source, onSkip) {
    const skip = reason => { onSkip?.(reason); return null; };
    const phases = member.phases || [];
    const entries = phases.flatMap(phase => (phase.skills || []).map(skill => ({ phase, skill })));
    let found;
    if (source.skill.sync) {
      const linked = entries.filter(x => x.skill.roundSyncKey === source.skill.sync);
      if (linked.length > 1) return skip('跨轮关联不唯一');
      if (linked.length === 1) found = linked[0];
    }
    if (!found) {
      const exact = entries.filter(x => x.skill.id === source.skill.id && signature(x.skill) === source.skill.sig);
      if (exact.length > 1) return skip('对应技能不唯一');
      if (exact.length === 1) {
        if (exact[0].skill.roundSyncKey && exact[0].skill.roundSyncKey !== source.skill.sync) return skip('跨轮关联冲突');
        found = exact[0];
      } else {
        const sameId = phases.filter(p => p.id === source.phaseId);
        const sameName = phases.filter(p => p.name === source.phaseName);
        const phase = sameId.length === 1 ? sameId[0] : source.phaseCount === 1 && sameName.length === 1 ? sameName[0] : null;
        const peers = (phase?.skills || []).filter(s => signature(s) === source.skill.sig);
        // 混合保留/重建 ID 时，旧同组技能不能冒充缺失的对应项。
        if (phase && peers.length === source.skill.count &&
            (!source.skill.sync || (source.skill.totalCount === 1 && entries.filter(x => signature(x.skill) === source.skill.sig).length === 1)) &&
            !peers.some(s => source.skill.peers.includes(s.id) || s.roundSyncKey)) {
          found = { phase, skill: peers[source.skill.index] };
        }
        // 两轮独立新增的唯一技能允许跨阶段对应，不建立或改写跨轮关联。
        if (!found && source.skill.totalCount === 1) {
          const unique = entries.filter(x => signature(x.skill) === source.skill.sig);
          if (unique.length === 1) {
            if (unique[0].skill.roundSyncKey) return skip('跨轮关联冲突');
            found = unique[0];
          }
        }
      }
    }
    if (!found?.skill) return skip(entries.some(x => signature(x.skill) === source.skill.sig) ? '对应技能不唯一' : '缺少对应技能');
    if (found.phase.locked || found.skill.locked) return skip('阶段或技能已锁定');
    if (signature(found.skill) !== source.skill.sig) return skip('技能信息不一致');
    let hit = null;
    if (source.hit) {
      const hits = found.skill.hits || [];
      if (source.hit.sync) {
        const linked = hits.filter(h => h.roundSyncKey === source.hit.sync);
        if (linked.length > 1) return skip('Hit 关联不唯一');
        if (linked.length === 1) hit = linked[0];
      }
      if (!hit) {
        hit = hits.find(h => h.id === source.hit.id);
        if (hit?.roundSyncKey && hit.roundSyncKey !== source.hit.sync) return skip('Hit 关联冲突');
        if (!hit && !hits.some(h => source.hit.ids.includes(h.id) || h.roundSyncKey) &&
            JSON.stringify(hits.map(signature)) === JSON.stringify(source.hit.sigs)) hit = hits[source.hit.index];
      }
      if (!hit || signature(hit) !== source.hit.sigs[source.hit.index]) return skip('Hit 缺失或结构不一致');
      if (hit.locked) return skip('Hit 已锁定');
    }
    return { ...found, hit };
  }

  // 系统 Buff 的启用位固定，不妨碍同步其正常可编辑的层数。
  const canEditStack = (member, buff) => W.isStackBuff(buff) &&
    (W.isStackSyncUiAuthority(buff, member.buffs || []) || W.isStackSyncMemberBuff(buff, member.buffs || []));
  function changes(member, items, buff, buffId, next, isStack, opts = {}) {
    const allowed = items.filter(item => (!W.isForcedActiveSystemBuff(buff) || (isStack && canEditStack(member, buff))) &&
      (item.hit ? W.hitBuffCanApply(item.skill, item.hit, buff, member) : W.skillBuffCanApply(item.skill, buff, member)));
    return { skipped: items.length - allowed.length, changed: allowed.filter(item => {
      const phaseActive = W.resolveBuffActive(item.phase.buffMode, item.phase.buffActive, { ...member.globalBuffActive });
      const unit = item.hit || item.skill;
      const active = !!W.getBatchUnitResolvedActive(unit, phaseActive)[buffId];
      return isStack ? W.getBatchUnitResolvedStack(unit, item.skill, item.phase, member, buffId) !== next || active !== (typeof opts.enabled === 'boolean' ? opts.enabled : next > 0) : active !== next;
    }) };
  }
  function write(member, changed, buffId, next, isStack, opts = {}) {
    const groups = new Map();
    changed.filter(item => !item.hit).forEach(item => {
      if (!groups.has(item.phase.id)) groups.set(item.phase.id, { phase: item.phase, ids: [] });
      groups.get(item.phase.id).ids.push(item.skill.id);
    });
    groups.forEach(group => {
      if (isStack) W.applyBatchStackToSkills(member, group.phase, group.ids, buffId, next, { ...opts, skipPersist: true });
      else W.applyBatchBuffToggle(member, group.phase, group.ids, buffId, next, { skipPersist: true });
    });
    changed.filter(item => item.hit).forEach(item => {
      if (isStack) W.applyMatrixHitStack(member, item.phase, item.skill.id, item.hit.id, buffId, next, { ...opts, skipPersist: true });
      else W.applyMatrixHitBuffToggle(member, item.phase, item.skill.id, item.hit.id, buffId, next, { skipPersist: true });
    });
  }
  function apply(member, phase, skillId, hitId, buffId, value, isStack, opts = {}) {
    if (busy || !valid(member) || !rows.size) return false;
    const anchorSelected = rows.has(key(phase.id, skillId, hitId)) || (hitId && rows.has(key(phase.id, skillId)));
    if (!anchorSelected) return false;
    const buff = (member.buffs || []).find(b => b.id === buffId);
    if (!buff) return false;
    W.roundSync?.reset();
    const all = units(member, phase.id, skillId, hitId);
    const sources = all.map(item => descriptor(item, member.phases));
    const next = isStack ? W.normalizeStackInput(value, buffId) : !!value;
    const current = round(member);
    const targets = current === null ? [] : [...targetRounds].filter(i => i !== current && member.cycleConfig.rounds[i]);
    const first = changes(member, all, buff, buffId, next, isStack, opts);
    if (!first.changed.length && !targets.length) {
      message = `无需修改；跳过 ${first.skipped} 个不适用条目`; refresh(member); return true;
    }
    const editKey = key(phase.id, skillId, hitId) + buffId + JSON.stringify([...targetRounds]);
    let newUndo = false;
    if (!isStack || !stackEdit || stackEdit.key !== editKey || W.peekEditUndo(member) !== stackEdit.undo) {
      W.pushEditUndo(member, isStack ? '同步技能 Buff 叠层' : '同步技能 Buff 覆盖', { includeResonanceAxis: true, includeCycleRounds: targets.length > 0 });
      newUndo = true;
      stackEdit = isStack ? { key: editKey, undo: W.peekEditUndo(member) } : null;
    }
    busy = true;
    let modified = first.changed.length;
    let skipped = first.skipped;
    const details = [];
    try {
      write(member, first.changed, buffId, next, isStack, opts);
      if (first.changed.length) W.persistCycleEditingIfEnabled(member);
      if (targets.length) W.saveActiveRoundSnapshot(member);
      targets.forEach(index => {
        member.cycleConfig.activeRound = index;
        W.loadRoundSnapshot(member, index);
        const targetBuff = (member.buffs || []).find(b => b.id === buffId);
        const dedup = new Map();
        sources.forEach(source => {
          const item = corresponding(member, source);
          if (item) dedup.set(key(item.phase.id, item.skill.id, item.hit?.id), item);
        });
        const matches = [...dedup.values()];
        const result = targetBuff ? changes(member, matches, targetBuff, buffId, next, isStack, opts) : { skipped: matches.length, changed: [] };
        const missed = sources.length - matches.length + result.skipped;
        write(member, result.changed, buffId, next, isStack, opts);
        if (result.changed.length) W.persistCycleEditingIfEnabled(member);
        modified += result.changed.length; skipped += missed;
        details.push(`第 ${index + 1} 轮修改 ${result.changed.length}${missed ? `，跳过 ${missed}` : ''}`);
      });
    } finally {
      if (targets.length) {
        member.cycleConfig.activeRound = current;
        W.loadRoundSnapshot(member, current);
      }
      busy = false;
    }
    if (!modified && newUndo) { W.editUndoStacks.get(member.id)?.pop(); stackEdit = null; }
    const painted = new Set();
    first.changed.forEach(item => {
      const id = key(item.phase.id, item.skill.id); if (painted.has(id)) return; painted.add(id);
      const restoredPhase = member.phases.find(p => p.id === item.phase.id);
      if (restoredPhase) {
        W.refreshMatrixBuffColumnForSkill(member, restoredPhase, item.skill.id, buffId);
        W.refreshPhaseMatrixRowCustomClasses(member, restoredPhase.id);
      }
    });
    message = `已修改 ${modified} 个条目；跳过 ${skipped} 个不适用或缺失条目${details.length ? ' · ' + details.join('；') : ''}${modified ? ' · 可撤回' : ''}`;
    refresh(member); W.refreshUndoUi();
    return true;
  }
  const canApply = (member, item, buff) => !W.isForcedActiveSystemBuff(buff) &&
    (item.hit ? W.hitBuffCanApply(item.skill, item.hit, buff, member) : W.skillBuffCanApply(item.skill, buff, member));
  // 可编辑的系统叠层参与快照；强制启用位仍不随快照切换。
  const canCopy = (member, item, buff) => canApply(member, item, buff) ||
    (W.isForcedActiveSystemBuff(buff) && canEditStack(member, buff) &&
      (item.hit ? W.hitBuffCanApply(item.skill, item.hit, buff, member) : W.skillBuffCanApply(item.skill, buff, member)));
  function unitState(member, item) {
    const phaseActive = W.resolveBuffActive(item.phase.buffMode, item.phase.buffActive, { ...member.globalBuffActive });
    const active = { ...W.getBatchUnitResolvedActive(item.hit || item.skill, phaseActive) };
    const stacks = {};
    (member.buffs || []).filter(W.isStackBuff).forEach(buff => {
      stacks[buff.id] = W.getBatchUnitResolvedStack(item.hit || item.skill, item.skill, item.phase, member, buff.id);
    });
    return { active, stacks };
  }
  function snapshotSource(member, item) {
    const state = unitState(member, item);
    return { identity: descriptor(item, member.phases), buffs: (member.buffs || [])
      .filter(buff => canCopy(member, item, buff)).map(buff => ({
        id: buff.id, signature: W.buffSignature(buff), content: W.buffContentSignature(buff),
        checked: !!state.active[buff.id], stack: W.isStackBuff(buff) ? state.stacks[buff.id] : null,
        parts: Object.entries(state.active).filter(([id]) => id.startsWith(buff.id + '::'))
          .map(([id, value]) => [id.slice(buff.id.length), !!value])
      })) };
  }
  function snapshotBuff(member, source) {
    const buffs = member.buffs || [];
    const exact = buffs.filter(buff => buff.id === source.id && W.buffContentSignature(buff) === source.content);
    if (exact.length === 1) return exact[0];
    const signed = buffs.filter(buff => W.buffSignature(buff) === source.signature && W.buffContentSignature(buff) === source.content);
    if (signed.length === 1) return signed[0];
    const content = buffs.filter(buff => W.buffContentSignature(buff) === source.content);
    return content.length === 1 ? content[0] : null;
  }
  function applySnapshot(member, item, source) {
    const next = unitState(member, item);
    let copied = 0;
    source.buffs.forEach(from => {
      const buff = snapshotBuff(member, from);
      if (!buff || !canCopy(member, item, buff) || (from.stack !== null && !W.isStackBuff(buff))) return;
      copied++;
      if (canApply(member, item, buff)) {
        next.active[buff.id] = from.checked;
        // 复合 Buff 的独立乘区勾选也属于本次完整快照。
        Object.keys(next.active).filter(id => id.startsWith(buff.id + '::')).forEach(id => delete next.active[id]);
        from.parts.forEach(([suffix, value]) => { next.active[buff.id + suffix] = value; });
      }
      if (from.stack !== null) next.stacks[buff.id] = W.normalizeStackInput(from.stack, buff);
    });
    if (!copied) return { changed: false, copied, skipped: source.buffs.length };
    const previous = unitState(member, item);
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    if (changed) {
      // 只写对应单位的覆盖快照，保留兄弟 Hit 及共用目录的其他技能。
      const unit = item.hit || item.skill;
      unit.buffMode = 'custom'; unit.buffActive = next.active; unit.buffStacks = next.stacks;
      delete unit.buffActiveSig; delete unit.buffStacksSig;
      if (unit._autoMatchedFalse) source.buffs.forEach(from => {
        const buff = snapshotBuff(member, from); if (buff && canApply(member, item, buff)) delete unit._autoMatchedFalse[buff.id];
      });
      W.syncUnitBuffCoverageSigs(unit, member);
    }
    return { changed, copied, skipped: source.buffs.length - copied };
  }
  function copyAll(member, allSkills = false) {
    if (busy || !member) return;
    if (!allSkills && (!valid(member) || !rows.size)) return;
    if (allSkills) valid(member);
    const current = round(member);
    const targets = current === null ? [] : [...targetRounds].filter(i => i !== current && member.cycleConfig.rounds[i]);
    if (!targets.length) { message = '请勾选至少一个目标轮次'; refresh(member); return; }
    const dedup = new Map();
    const sourceRows = allSkills
      ? (member.phases || []).flatMap(phase => (phase.skills || []).map(skill => ({ phaseId: phase.id, skillId: skill.id })))
      : [...rows.values()];
    sourceRows.forEach(row => units(member, row.phaseId, row.skillId, row.hitId).forEach(item =>
      dedup.set(key(item.phase.id, item.skill.id, item.hit?.id), item)));
    const sources = [...dedup.values()].map(item => snapshotSource(member, item));
    if (!sources.length) { message = '没有可同步的技能或 Hit'; refresh(member); return; }
    W.roundSync?.reset(); stackEdit = null;
    W.pushEditUndo(member, allSkills ? '本轮全部 Buff → 指定轮次' : '立即同步全部 Buff', { includeResonanceAxis: true, includeCycleRounds: true });
    W.saveActiveRoundSnapshot(member);
    busy = true;
    let modified = 0, matched = 0; const details = [];
    try {
      targets.forEach(index => {
        member.cycleConfig.activeRound = index; W.loadRoundSnapshot(member, index);
        let count = 0, missed = 0, skippedBuffs = 0;
        const reasons = new Map();
        sources.forEach(source => {
          const item = corresponding(member, source.identity, reason => reasons.set(reason, (reasons.get(reason) || 0) + 1));
          if (!item) { missed++; return; }
          const result = applySnapshot(member, item, source);
          if (result.copied) matched++;
          if (result.changed) count++;
          skippedBuffs += result.skipped;
        });
        if (count) W.persistCycleEditingIfEnabled(member);
        modified += count;
        details.push(`第 ${index + 1} 轮更新 ${count} 行${missed ? `，跳过 ${missed} 行（${[...reasons].map(([reason, count]) => reason + ' ' + count + ' 行').join('、')}）` : ''}${skippedBuffs ? `，跳过 ${skippedBuffs} 项缺失或不适用 Buff` : ''}`);
      });
    } finally {
      member.cycleConfig.activeRound = current; W.loadRoundSnapshot(member, current); busy = false;
    }
    if (!modified) W.editUndoStacks.get(member.id)?.pop();
    message = `${modified ? '已同步当前全部 Buff' : matched ? '对应行状态一致，无需修改' : '没有可更新的对应项'} · ${details.join('；')}${modified ? ' · 可撤回' : ''}`;
    W.render(); refresh(member); W.refreshUndoUi();
  }

  const selectionRow = label => ({ phaseId: label.dataset.matrixFocusSkill,
    skillId: label.dataset.skillId, hitId: label.dataset.hitId || '' });
  function endDrag() {
    drag = null;
    document.documentElement.classList.remove('matrix-row-dragging');
  }
  function paintLabel(label) {
    if (!drag || !label) return;
    const row = selectionRow(label), id = key(row.phaseId, row.skillId, row.hitId);
    if (drag.visited.has(id)) return;
    drag.visited.add(id);
    if (find(drag.member, row)) toggle(drag.member, row, drag.checked);
  }
  document.addEventListener('pointerdown', event => {
    clearTimeout(clickTimer); consumeClick = false; endDrag();
    const label = event.target.closest('[data-matrix-focus-skill]');
    if (!label || event.button !== 0 || !(event.ctrlKey || event.metaKey) || event.pointerType === 'touch') return;
    event.preventDefault(); event.stopPropagation(); finishPopover();
    const member = W.getActiveMember(), row = selectionRow(label);
    valid(member);
    consumeClick = true;
    if (!find(member, row)) { message = '锁定的技能或 Hit 无法选中'; refresh(member); return; }
    const checked = !rows.has(key(row.phaseId, row.skillId, row.hitId));
    toggle(member, row, checked);
    drag = { member, scope, checked, pointerId: event.pointerId, last: label,
      visited: new Set([key(row.phaseId, row.skillId, row.hitId)]) };
    label.focus({ preventScroll: true });
    document.documentElement.classList.add('matrix-row-dragging');
  }, true);
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!(event.buttons & 1) || !(event.ctrlKey || event.metaKey) ||
        W.getActiveMember() !== drag.member || !valid(drag.member) || !drag || scope !== drag.scope) { endDrag(); return; }
    const label = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-matrix-focus-skill]');
    if (!label) { drag.last = null; return; }
    event.preventDefault(); event.stopPropagation();
    // 快速移过多行也补齐中间行；只在同一左侧技能列内连续选择。
    const host = label.closest('[data-phase-buff-matrix]');
    if (host && drag.last?.closest('[data-phase-buff-matrix]') === host) {
      const labels = [...host.querySelectorAll('[data-matrix-focus-skill]')].filter(el => el.getClientRects().length);
      const a = labels.indexOf(drag.last), b = labels.indexOf(label);
      if (a >= 0 && b >= 0) labels.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(paintLabel);
    }
    paintLabel(label);
    if (drag) drag.last = label;
  }, true);
  document.addEventListener('pointerup', () => {
    endDrag(); clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { consumeClick = false; }, 500);
  }, true);
  document.addEventListener('pointercancel', () => { endDrag(); consumeClick = false; }, true);
  document.addEventListener('keyup', event => { if (!(event.ctrlKey || event.metaKey)) endDrag(); }, true);
  window.addEventListener('blur', () => { endDrag(); consumeClick = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { endDrag(); consumeClick = false; } });

  function endEdit() { stackEdit = null; }
  function finishPopover() { if (document.getElementById('phaseStackPopover')?.hidden === false) W.closePhaseStackPopover(); }
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-matrix-rows-round]');
    if (!input) return;
    finishPopover(); const member = W.getActiveMember();
    if (!member) return;
    ensureScope(member);
    const index = Number(input.dataset.matrixRowsRound);
    if (!Number.isInteger(index) || !member.cycleConfig?.rounds[index] || index === round(member)) return;
    if (input.checked) targetRounds.add(index); else targetRounds.delete(index);
    stackEdit = null; message = ''; refresh(member);
  }, true);
  document.addEventListener('click', event => {
    if (consumeClick) { consumeClick = false; event.preventDefault(); event.stopPropagation(); return; }
    const label = event.target.closest('[data-matrix-focus-skill]');
    const wholeRound = event.target.closest('[data-matrix-rows-copy-round]');
    if (wholeRound) { event.preventDefault(); event.stopPropagation(); finishPopover(); copyAll(W.getActiveMember(), true); return; }
    const copy = event.target.closest('[data-matrix-rows-copy-all]');
    if (copy) { event.preventDefault(); event.stopPropagation(); finishPopover(); copyAll(W.getActiveMember()); return; }
    const clear = event.target.closest('[data-matrix-rows-clear]');
    if (clear || (label && (event.ctrlKey || event.metaKey))) {
      event.preventDefault(); event.stopPropagation(); finishPopover();
      const member = W.getActiveMember();
      if (clear) { reset(); refresh(member); }
      else toggle(member, { phaseId: label.dataset.matrixFocusSkill, skillId: label.dataset.skillId, hitId: label.dataset.hitId || '' });
      return;
    }
    if (event.target.closest('[data-export-cfg-apply], [data-export-cfg-delete], [data-cycle-round-tab], [data-cycle-count]')) {
      finishPopover(); reset();
    }
    if (event.target.closest('[data-edit-undo]')) stackEdit = null;
  }, true);
  document.addEventListener('keydown', event => {
    if (!drag) consumeClick = false;
    const label = event.target.closest('[data-matrix-focus-skill]');
    if (label && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      label.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
    } else if (event.key === 'Escape' && !event.target.closest('input, textarea, select, dialog')) {
      finishPopover(); reset(); refresh(W.getActiveMember());
    }
  }, true);
  W.matrixRows = { tools, selected, apply, endEdit, reset };
  // 永久兼容别名；跨文件调用继续使用 __WC。
  Object.defineProperty(window, 'matrixRows', {
    configurable: true, enumerable: true,
    get: () => W.matrixRows, set: value => { W.matrixRows = value; }
  });
})();
