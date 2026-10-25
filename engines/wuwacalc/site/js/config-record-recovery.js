(function () {
  const W = window.__WC, records = W.configRecords;
  // Pure reconstruction from the row's own saved axis/stack evidence.
// `W` is the existing calculator namespace; this helper does not access live state.
function recoverSavedRowInputs(W, data, row, payload) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const out = clone(payload);
  if (row?.type !== 'cumulative' || row.diff?.roundAxisVersion !== 1)
    return { payload: out, evidence: null };
  const anchor = data?.exportConfigAnchor, rows = data?.exportConfigSnapshots;
  const index = Array.isArray(rows) ? rows.findIndex(item => item.id === row.id) : -1;
  if (!row.baseId || row.baseId !== anchor?.baseId || !anchor.workspace || index < 0 ||
      !Array.isArray(out.members) || !Array.isArray(anchor.workspace.members) ||
      out.members.length !== anchor.workspace.members.length)
    throw new Error('原记录缺少可确认的同一基底，未推测轴输入');
  if (out.members.some((member, i) => String(member.characterId) !== String(anchor.workspace.members[i].characterId)))
    throw new Error('保存轴的角色来源不一致，未生成替代数据');
  // A fields patch is relative to the saved anchor, not necessarily a preceding value patch.
  const axis = holder => holder && Array.isArray(holder.rotationCatalog) && Array.isArray(holder.phases)
    ? { rotationCatalog: clone(holder.rotationCatalog), phases: clone(holder.phases),
      resonanceAxis: clone(holder.resonanceAxis || null) } : null;
  let editable = { members: anchor.workspace.members.map(member => ({ roundAxis: {
    axis: axis(member), rounds: member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)
      ? Object.fromEntries(member.cycleConfig.rounds.map((round, ri) => [String(ri), axis(round)])) : null } })) };
  const prefix = rows.slice(0, index + 1).filter(item => item.type === 'cumulative' && item.baseId === row.baseId);
  const evidenceRows = [];
  for (const source of prefix) {
    const changes = source.diff?.members || [];
    if (source.diff?.roundAxisVersion !== 1 && changes.some(member => member.roundAxis || member.axis || member.skillBuffs || member.phaseStacks))
      throw new Error('保存轴包含不能确认的旧轮次差异，未混用恢复');
    const members = changes.filter(member => member.roundAxis).map(member => {
      if (!Number.isInteger(member.index) || member.index < 0 || member.index >= out.members.length ||
          !['value', 'fields'].includes(member.roundAxis.kind)) throw new Error('保存轴差异结构不完整');
      return { index: member.index, roundAxis: clone(member.roundAxis) };
    });
    editable = W.applyExportCfgV2DiffToEditable(editable, { roundAxisVersion: 1, members });
    if (members.length) evidenceRows.push(String(source.id));
  }
  const viewKeys = ['char', 'buffs', 'globalBuffActive', 'globalBuffStacks',
    'rotationCatalog', 'phases', 'resonanceAxis', 'effectHintExtras'];
  const restoreAxis = (holder, saved) => {
    if (!Array.isArray(saved?.rotationCatalog) || !Array.isArray(saved?.phases)) throw new Error('本行逐轮轴输入不完整');
    for (const key of ['rotationCatalog', 'phases', 'resonanceAxis']) holder[key] = clone(saved[key]);
  };
  out.members.forEach((member, mi) => {
    const cfg = member.cycleConfig, savedAxis = editable.members[mi].roundAxis;
    if (!cfg?.enabled) { restoreAxis(member, savedAxis?.axis); return; }
    if (!Array.isArray(cfg.rounds) || cfg.rounds.length !== Number(cfg.count) ||
        Object.keys(savedAxis?.rounds || {}).length !== cfg.rounds.length)
      throw new Error('保存轴缺少逐轮原始输入');
    const stacks = row.cycleCatalogStacks?.[mi];
    if (!Array.isArray(stacks) || stacks.length !== cfg.rounds.length)
      throw new Error('本行缺少独立保存的逐轮叠层，未从其他行补入');
    cfg.rounds.forEach((round, ri) => {
      if (!stacks[ri] || typeof stacks[ri] !== 'object' || Array.isArray(stacks[ri])) throw new Error('本行逐轮叠层快照不完整');
      restoreAxis(round, savedAxis.rounds[String(ri)]); round.catalogStacks = clone(stacks[ri]);
    });
    const activeRound = cfg.activeRound == null ? 0 : Number(cfg.activeRound);
    if (!Number.isInteger(activeRound) || activeRound < 0 || activeRound >= cfg.rounds.length)
      throw new Error('原记录当前轮次超出保存范围');
    const active = cfg.rounds[activeRound];
    for (const key of viewKeys) { if (active[key] === undefined) delete member[key]; else member[key] = clone(active[key]); }
  });
  const activeIndex = Number(out.team?.activeIndex), ownerIndex = out.members[activeIndex]?.cycleConfig?.enabled ? activeIndex : out.members.findIndex(member => member.cycleConfig?.enabled);
  const owner = out.members[ownerIndex], activeRound = owner?.cycleConfig.activeRound ?? 0;
  const singleRound = out.members.every(member => !member.cycleConfig?.enabled || member.cycleConfig.rounds.length === 1);
  const roundSpecial = owner?.cycleConfig.rounds[activeRound]?.specialSkills;
  const special = owner ? roundSpecial || (singleRound ? out.specialSkills : null) : out.specialSkills;
  if (!Array.isArray(special?.characters) || !Array.isArray(special?.items)) throw new Error('本行当前轮缺少特殊技能输入，未按名称猜测关联');
  out.specialSkills = clone(special);
  return { payload: out, evidence: { kind: 'saved-round-axis-v1', baseId: row.baseId,
    rowId: String(row.id), axisRowIds: evidenceRows, anchorAxis: true, stackRowId: String(row.id),
    sameBaseAnchorAxes: { baseId: String(anchor.baseId), recordedAt: anchor.savedAt || null,
      memberIndexes: anchor.workspace.members.map((member, mi) => mi) },
    viewRoundByMember: out.members.map(member => member.cycleConfig?.enabled ? Number(member.cycleConfig.activeRound ?? 0) : null),
    specialViewOwnerIndex: ownerIndex, specialViewRound: activeRound,
    specialInputSource: owner && roundSpecial ? 'saved-active-round' : 'saved-top-level-single-round' } };
}


  // Representation-only migration. The caller must compare old-profile and current-profile
// detailed results before adopting this clone. No library sync or invented values.
function migrateLegacyHarmonyMirrors(W, payload) {
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const output = copy(payload), evidence = [];
  if (payload.configRecord?.recovery?.profile !== 'pre-special-mirror') return { payload: output, evidence };
  function migrateSpecial(special, path) {
    if (!special || !Array.isArray(special.characters) || !Array.isArray(special.items))
      throw new Error('旧版特殊技能迁移缺少完整输入');
    if (special.items.some(item => W.isSpecialBuffSourceTeam(item)))
      throw new Error('旧版全队特殊技能来源尚无经过核验的迁移');
    for (let index = 0; index < special.characters.length; index++) {
      const target = special.characters[index], roster = output.members[index];
      if (!roster) continue;
      for (const source of roster.buffs || []) {
        if (W.isInnateHarmonyBuff(source)) continue;
        const harmonic = W.isHarmonyBreakAmpBuff(source);
        const composite = W.isCompositeBuff(source) && (source.effects || []).some(fx => fx?.zone === 'harmonyBreakAmp');
        const eligible = source.teamSourceId ? W.isSpecialEffectBuffSource(source) : W.shouldSyncPersonalBuffToSpecial(source);
        if (!(harmonic || composite) || !eligible) continue;
        const mirrors = (target.buffs || []).filter(buff => buff.teamSourceId ? buff.teamSourceId === source.teamSourceId : buff.personalSourceId ? buff.personalSourceId === source.id : buff.id === source.id);
        if (mirrors.length) continue; // Existing values and explicit custom coverage remain untouched.
        if (!harmonic || !source.teamSourceId)
          throw new Error('旧版复合谐幅来源尚无经过核验的迁移');
        const id = source.id;
        if ((target.buffs || []).some(buff => buff.id === id)) throw new Error('特殊技能谐幅来源标识冲突');
        if ([...(target.excludedTeamBuffIds || []), ...(target.manuallyExcludedTeamBuffIds || [])].includes(source.teamSourceId))
          throw new Error('旧版特殊技能存在明确排除的谐幅来源，未自动迁移');
        const active = roster.globalBuffActive?.[id];
        if (typeof active !== 'boolean') throw new Error('旧版谐幅来源未保存明确覆盖状态');
        const next = copy(source);
        target.buffs = [...(target.buffs || []), next];
        target.globalBuffActive = { ...(target.globalBuffActive || {}) };
        target.globalBuffStacks = { ...(target.globalBuffStacks || {}) };
        if (target.globalBuffActive[id] === undefined) target.globalBuffActive[id] = active;
        if (target.globalBuffStacks[id] === undefined && roster.globalBuffStacks?.[id] !== undefined)
          target.globalBuffStacks[id] = copy(roster.globalBuffStacks[id]);
        evidence.push({ path, characterIndex: index, sourceBuffId: source.id, teamSourceId: source.teamSourceId,
          active, stacks: copy(roster.globalBuffStacks?.[id]) });
      }
    }
  }
  migrateSpecial(output.specialSkills, 'specialSkills');
  const effectiveSingle = output.members.every(member => !member.cycleConfig?.enabled || member.cycleConfig.rounds.length === 1);
  output.members.forEach((member, mi) => {
    if (!member.cycleConfig?.enabled) return;
    member.cycleConfig.rounds.forEach((round, ri) => {
      // The single active view already uses the original top-level input; leave absent round fields absent.
      if (effectiveSingle && !round.specialSkills) return;
      migrateSpecial(round.specialSkills, `members/${mi}/cycleConfig/rounds/${ri}/specialSkills`);
    });
  });
  return { payload: output, evidence };
}

  function completeCalculatedRecord(W, payload, fresh, migration) {
  const records = W.configRecords, copy = records.clone, meta = payload.configRecord;
  const totals = { ...copy(meta.totals), teamTotal: fresh.teamResults.total, teamDps: fresh.teamResults.dps,
    axisDuration: fresh.teamResults.axisDuration, specialTotal: fresh.specialSkills.results.total, cycleAveraged: false,
    specialItems: fresh.specialSkills.items.map(item => ({ id: item.id, name: item.name,
      kind: item.kind, total: Number(item._damage) || 0 })).filter(item => item.total > 0),
    members: meta.totals.members.map((member, index) => ({ ...member,
      cycleCount: fresh.members[index].cycleConfig?.enabled ? fresh.members[index].cycleConfig.count : 1,
      total: fresh.members[index].results.total })) };
  fresh.configRecord = { ...copy(meta), kind: 'complete', detailVersion: 1, totalKind: 'total',
    dpsDamage: fresh.teamResults.total, totals, versions: records.versions(), recordedAt: new Date().toISOString(),
    recovery: meta.recovery ? { ...copy(meta.recovery), profile: 'current',
      ...(migration ? { migrations: [...(meta.recovery.migrations || []), {
        kind: 'legacy-harmony-mirrors-v1', sources: migration.evidence }] } : {}) } : undefined };
  records.validate(fresh);
  return fresh;
}

  function refreshSavedRecord(W, payload) {
  const records = W.configRecords, copy = records.clone, meta = payload.configRecord, current = records.versions();
  records.validate(payload);
  if (meta.versions?.data && JSON.stringify(meta.versions.data) !== JSON.stringify(current.data))
    throw new Error('计算数据版本已更新，但该版本迁移尚未核验；原输入和结果未更新');
  if (!meta.versions && !['pre-special-mirror', 'current'].includes(meta.recovery?.profile))
    throw new Error('该记录缺少可核验的计算版本，原输入和结果未更新');
  let input = payload, migration;
  if (meta.recovery?.profile === 'pre-special-mirror') {
    migration = migrateLegacyHarmonyMirrors(W, payload);
    input = migration.payload;
  }
  const fresh = records.recovery.calculate(input, 'current');
  if (migration) {
    const oldRepresentation = records.recovery.calculate(payload, 'pre-special-mirror', { ownerScopedBurstCrit: false });
    const details = value => JSON.stringify({ members: value.members.map(member => member.results),
      special: value.specialSkills.results, team: value.teamResults });
    if (details(fresh) !== details(oldRepresentation))
      throw new Error('特殊技能表示迁移未能保持完整明细一致，原输入和结果未更新');
  }
  return completeCalculatedRecord(W, payload, fresh, migration);
}

  const clone = records.clone;
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.0005;
  const sum = items => items.reduce((n, item) => n + item.total, 0);
  const resultKeys = new Set(['results', 'teamResults', '_damage', '_breakdown', '_cycleDamages', '_hitBreakdowns', '_cycleRounds', '_cycleTotal']);
  function rawInputs(value) {
    if (Array.isArray(value)) return value.map(rawInputs);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !resultKeys.has(key)).map(([key, item]) => [key, rawInputs(item)]));
  }
  function inputSnapshot(state) {
    return JSON.stringify(rawInputs({ team: state.team, members: state.members, specialSkills: state.specialSkills }));
  }
  function checkRound(round) {
    if (!round?.char || !Array.isArray(round.buffs) || !Array.isArray(round.rotationCatalog) ||
        !Array.isArray(round.phases) || !round.globalBuffActive || !round.globalBuffStacks)
      throw new Error('原记录缺少完整轮次输入，未生成替代数据');
  }
  function assertDetails(payload) {
    const fail = () => { throw new Error('保存明细不完整或与合计不符，原记录未改动'); };
    const number = value => { if (typeof value !== 'number' || !Number.isFinite(value)) fail(); return value; };
    const array = value => { if (!Array.isArray(value)) fail(); return value; };
    const equal = (a, b) => { if (!close(number(a), number(b))) fail(); };
    const energy = result => ['energyRegenBase', 'energyRegenPct', 'energyRegen'].forEach(key => number(result?.[key]));
    const totals = array(payload.members).map(member => {
      const result = member.results;
      energy(result);
      if (member.cycleConfig?.enabled) {
        const cycles = array(result.cycles);
        if (cycles.length !== member.cycleConfig.count || cycles.length !== member.cycleConfig.rounds.length) fail();
        for (const [index, cycle] of cycles.entries()) {
          energy(cycle);
          if (cycle.index !== index + 1) fail();
          equal(array(cycle.steps).reduce((n, step) => {
            if (!step.catalogId && !step.skillId) fail();
            equal(step.damage, step.breakdown?.total);
            return n + step.damage;
          }, 0), cycle.total);
        }
        equal(sum(cycles), result.total);
      } else {
        const phases = array(result.damagePhases);
        equal(phases.reduce((n, phase) => {
          const phaseTotal = array(phase.skills).reduce((s, skill) => {
            equal(skill._damage, skill._breakdown?.total);
            return s + skill._damage;
          }, 0);
          equal(phaseTotal, result.damagePhaseTotals?.[phase.id]);
          return n + phaseTotal;
        }, 0), result.total);
      }
      return number(result.total);
    });
    const special = payload.specialSkills.results, cycles = array(special.cycles);
    const count = Math.max(1, ...payload.members.map(member => member.cycleConfig?.enabled ? member.cycleConfig.count : 1));
    if (cycles.length !== count) fail();
    cycles.forEach(cycle => {
      const ids = new Set();
      equal(array(cycle.items).reduce((n, item) => {
        if (!item.id || ids.has(item.id)) fail();
        ids.add(item.id);
        equal(item.total, item.breakdown?.total);
        return n + item.total;
      }, 0), cycle.total);
    });
    equal(sum(cycles), special.total);
    equal(totals.reduce((a, b) => a + b, 0) + special.total, payload.teamResults.total);
    if (!(number(payload.teamResults.axisDuration) > 0)) fail();
    equal(payload.teamResults.dps * payload.teamResults.axisDuration, payload.teamResults.total);
    return true;
  }
  function usesOwnerScopedBurstCrit(meta, profile) {
    // 2026-08-28 deployment expanded owner-only burst crit to the full team.
    // Exclude the entire deployment date: exact within-day cutover is not known here.
    const date = Date.parse(meta?.recordedAt || '');
    return profile === 'pre-special-mirror' && Number.isFinite(date) && date < Date.parse('2026-08-27T16:00:00Z');
  }
  function calculate(payload, profile, options = {}) {
    if (records.recoveryContext) throw new Error('已有历史恢复计算正在进行');
    const saved = records.snapshotState(), state = W.state;
    Object.assign(state, clone(payload));
    const before = inputSnapshot(state);
    records.recoveryContext = { profile, ownerScopedBurstCrit: options.ownerScopedBurstCrit === false ? false : usesOwnerScopedBurstCrit(payload.configRecord, profile) };
    try {
      for (const member of state.members) {
        if (member.cycleConfig?.enabled) {
          if (member.cycleConfig.rounds.length !== member.cycleConfig.count) throw new Error('原记录轮数不完整');
          member.cycleConfig.rounds.forEach(checkRound);
          W.computeMemberWithCycles(member);
        } else {
          checkRound(member);
          const originalPhases = member.phases, originalCatalog = member.rotationCatalog;
          const view = member.resonanceAxis ? W.buildResonanceAxisView(member.resonanceAxis, 'damage') : null;
          let damageResults, damagePhases;
          try {
            member.phases = clone(view ? view.phases : originalPhases);
            member.rotationCatalog = clone(view ? view.rotationCatalog : originalCatalog);
            damageResults = W.computeMemberPhaseDamages(member);
            damagePhases = clone(member.phases);
          } finally { member.phases = originalPhases; member.rotationCatalog = originalCatalog; }
          const editResults = W.computeMemberPhaseDamages(member);
          member.results = { ...damageResults, damagePhases, damagePhaseTotals: clone(damageResults.phases),
            phases: editResults.phases, energyRegenBase: editResults.energyRegenBase,
            energyRegenPct: editResults.energyRegenPct, energyRegen: editResults.energyRegen };
        }
      }
      const owner = W.getSpecialSkillsRoundOwner(), live = state.specialSkills;
      const count = owner?.cycleConfig?.enabled ? owner.cycleConfig.rounds.length : 1;
      const effectiveSingle = state.members.every(member => !member.cycleConfig?.enabled || member.cycleConfig.rounds.length === 1);
      const topLevelSingleSource = owner?.cycleConfig?.enabled && effectiveSingle && !owner.cycleConfig.rounds[0].specialSkills;
      const cycles = [];
      for (let index = 0; index < count; index++) {
        const original = owner?.cycleConfig?.enabled
          ? owner.cycleConfig.rounds[index].specialSkills || (effectiveSingle ? live : null) : live;
        if (!original || !Array.isArray(original.items) || !Array.isArray(original.characters))
          throw new Error('原记录缺少本轮特殊技能输入');
        state.specialSkills = clone(original);
        Object.defineProperty(state.specialSkills, '_calcRoundIndex', { value: index });
        const items = state.specialSkills.items.map(item => {
          const breakdown = item.kind === 'execution' ? W.calcExecutionBreakdown(item) :
            item.kind === 'effect' ? W.calcEffectBreakdown(item) : null;
          if (!breakdown || !Number.isFinite(breakdown.total)) throw new Error('特殊技能结果无效');
          return { id: item.id, kind: item.kind, name: item.name, ownerIndex: W.getSpecialSkillRosterIndex(item),
            total: breakdown.total, critTotal: breakdown.critTotal, breakdown };
        });
        cycles.push({ total: sum(items), items });
      }
      state.specialSkills = live;
      const duration = Number(options.useInputDuration ? W.getTeamResultsDuration() : payload.configRecord?.totals?.axisDuration ?? state.team.axisDuration);
      if (!(duration > 0)) throw new Error('原记录缺少有效轴长');
      state.specialSkills.results = { total: sum(cycles), axisDuration: duration, dps: sum(cycles) / duration, cycles };
      const active = owner?.cycleConfig?.activeRound || 0;
      for (const item of live.items) {
        const savedItem = cycles[active].items.find(entry => entry.id === item.id);
        if (!savedItem) throw new Error('当前轮特殊技能与保存轮次不一致');
        item._damage = savedItem.total; item._breakdown = clone(savedItem.breakdown);
        item._cycleRounds = count;
        item._cycleTotal = cycles.reduce((n, cycle) => n + (cycle.items.find(entry => entry.id === item.id)?.total || 0), 0);
      }
      const members = state.members.map(member => member.results.total);
      const total = members.reduce((n, value) => n + value, 0) + state.specialSkills.results.total;
      state.teamResults = { total, dps: total / duration, axisDuration: duration,
        breakdown: [...state.members.map((member, i) => ({ id: member.id, name: member.name, total: members[i], sharePct: total ? members[i] / total * 100 : 0 })),
          { id: 'special', name: '特殊技能', total: state.specialSkills.results.total, sharePct: total ? state.specialSkills.results.total / total * 100 : 0 }] };
      if (inputSnapshot(state) !== before) throw new Error('计算改变了保存输入，结果未采用');
      const output = clone(payload);
      for (const key of ['members', 'specialSkills', 'teamResults']) output[key] = clone(state[key]);
      if (topLevelSingleSource && output.configRecord) output.configRecord.inputRecovery = {
        ...clone(output.configRecord.inputRecovery || {}), specialInputSource: 'saved-top-level-single-round',
        specialSourcePath: 'specialSkills', specialViewRound: 0 };
      assertDetails(output);
      return output;
    } finally {
      records.recoveryContext = null;
      records.restoreState(saved);
    }
  }
  function restore(payload, profile) {
    const meta = payload.configRecord;
    if (meta?.kind !== 'legacy-summary') return payload;
    const output = calculate(payload, profile), old = meta.totals;
    const errors = [];
    output.members.forEach((member, i) => {
      const expected = old.members[i].total * (meta.totalKind === 'cycle-average' ? old.members[i].cycleCount : 1);
      if (!close(member.results.total, expected)) errors.push({ member: member.name, old: expected, calculated: member.results.total });
    });
    if (!close(output.specialSkills.results.total, old.specialTotal)) errors.push({ member: '特殊技能', old: old.specialTotal, calculated: output.specialSkills.results.total });
    if (!close(output.teamResults.dps, old.teamDps)) errors.push({ member: 'DPS', old: old.teamDps, calculated: output.teamResults.dps });
    if (errors.length) {
      const error = new Error('历史明细与保存记录尚未对齐，原记录保持不变');
      error.differences = errors; throw error;
    }
    output.configRecord = { ...clone(meta), kind: 'complete', detailVersion: 1, totalKind: 'total', dpsDamage: output.teamResults.total, totals: { ...clone(old),
      teamTotal: output.teamResults.total, teamDps: output.teamResults.dps, specialTotal: output.specialSkills.results.total,
      members: old.members.map((member, i) => ({ ...member, total: output.members[i].results.total })) },
      recovery: { profile, historicalRules: usesOwnerScopedBurstCrit(meta, profile) ? ['owner-burst-crit-before-20260828'] : [], originalTotals: clone(old), originalTotalKind: meta.totalKind, inputSources: clone(output.configRecord?.inputRecovery || meta.inputRecovery) } };
    delete output.configRecordView;
    return output;
  }
  function profileFor(meta) {
    const date = Date.parse(meta.recordedAt);
    // Last evidenced release with the previous rule. The deployment interval stays unknown.
    return Number.isFinite(date) && date < Date.parse('2026-10-16T00:00:00Z') ? 'pre-special-mirror' : 'current';
  }
  function attachImportedMain() {
    const state = W.state, payload = records.payload(), totals = payload.configRecord.totals;
    if (!state._workspaceImporting || !state.configRecordView?.recovery) return;
    for (const row of state.exportConfigSnapshots || []) {
      if (row.payload || row.payloadId || row.members?.length !== state.members.length) continue;
      if (!close(row.teamDps, totals.teamDps) || !close(row.teamTotal, totals.teamTotal) || !close(row.specialTotal || 0, totals.specialTotal || 0)) continue;
      if (!row.members.every((member, i) => String(member.characterId) === String(state.members[i].characterId) &&
          Number(member.chain) === Number(state.members[i].resonanceUnlocked) &&
          Number(member.refinement) === Number(state.members[i].weaponSelection?.refinement) &&
          close(member.total, totals.members[i].total))) continue;
      row.payload = clone(payload);
    }
  }
  records.recovery = { calculate, restore, profileFor, attachImportedMain, assertDetails,
    refreshSaved: payload => refreshSavedRecord(W, payload),
    completeEdited: payload => completeCalculatedRecord(W, payload, calculate(payload, 'current', { useInputDuration: true })),
    resolveInputs: (data, row, payload) => recoverSavedRowInputs(W, data, row, payload) };
})();
