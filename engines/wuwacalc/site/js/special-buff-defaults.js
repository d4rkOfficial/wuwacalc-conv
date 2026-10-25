/* Defaults are attached only by interactive add actions; never inferred on import or recompute. */
(function () {
  const wc = window.__WC;
  const zones = new Set(['generalVulnerability', 'typeVulnerability',
    'elementVulnerability', 'extraVulnerability']);
  function enabled(buff) {
    // Retain the first release's recorded policy, but new workspaces use per-source intent.
    return buff?.specialVulnerabilityDefault === 1 || wc.state?.team?.specialVulnerabilityDefaults === 1;
  }
  function isSource(buff) {
    if (!buff) return false;
    if (buff.category === 'matrixFinal') return !buff.matrixSource?.resistanceOverride;
    return zones.has(buff.category) || (buff.category === 'composite' &&
      (buff.effects || []).some(effect => zones.has(effect.zone)));
  }
  function followsRecipient(buff) {
    return enabled(buff) && (!!buff?.matrixSource?.presetId ||
      buff?.sourceTag === 'matrixBuff' || buff?.sourceTag === 'matrixCharacterBuff');
  }
  function recipientDefault(slot, buff) {
    const live = wc.state.members[slot];
    const roundIndex = Number.isInteger(wc.state.specialSkills?._calcRoundIndex)
      ? wc.state.specialSkills._calcRoundIndex : wc.readActiveCycleRoundIndex(wc.getSpecialSkillsRoundOwner());
    const round = live?.cycleConfig?.enabled && wc.readActiveCycleRoundIndex(live) !== roundIndex
      ? live.cycleConfig.rounds?.[roundIndex] : null;
    const member = round ? { ...live, ...round } : live;
    const sourceId = buff.teamSourceId || buff.id;
    const mirror = member?.buffs?.find(b => b.teamSourceId === sourceId);
    return { active: !!mirror && !member.excludedTeamBuffIds?.includes(sourceId) &&
      member.globalBuffActive?.[mirror.id] !== false,
      stacks: mirror ? wc.normalizeStackInput(member.globalBuffStacks?.[mirror.id] ?? 0, buff) : 0 };
  }
  function resolve(item, member, active, stacks) {
    if (item.locked || !member) return active;
    const damageType = item.kind === 'effect' ? '效应' : '处决';
    const name = String(item.name || '').trim();
    // Same context as calcSpecialFixedBreakdown / calcSpecialFactorZones.
    const unit = { name, librarySkillName: name, libraryName: name, libraryKey: item.libraryKey };
    const opts = { damageElement: '', effectType: item.kind === 'effect' ? item.effectType || '' : '',
      member, unit, parentSkill: unit };
    const custom = item.buffMode === 'custom' ? item.buffActive || {} : {};
    for (const buff of member.buffs || []) {
      if (!enabled(buff) || !isSource(buff)) continue;
      // Team-source items use the same recipient default as character-source items.
      const slot = member.isTeamBuffSourceProxy
        ? (Number.isInteger(item.sourceRosterSlot) ? item.sourceRosterSlot : item.memberIndex ?? 0)
        : wc.getSpecialSkillRosterIndex(item);
      const control = member.isTeamBuffSourceProxy ? wc.state.specialSkills?.characters?.[slot] : member;
      const controlId = member.isTeamBuffSourceProxy ? wc.makeTeamMirrorBuffId(buff.id) : buff.id;
      const linked = control?.specialSourceControls?.[controlId];
      const recipient = followsRecipient(buff) ? recipientDefault(slot, buff) : null;
      const sourceOn = recipient ? recipient.active && (!linked?.active || control?.globalBuffActive?.[controlId] !== false) :
        member.isTeamBuffSourceProxy && !linked?.active
        ? member.globalBuffActive?.[buff.id] !== false
        : (control?.globalBuffActive?.[controlId] ?? member.globalBuffActive?.[buff.id]) !== false;
      if (stacks && wc.isStackBuff(buff) && item.buffStacks?.[buff.id] === undefined) {
        stacks[buff.id] = wc.normalizeStackInput(recipient ?
          (sourceOn ? recipient.stacks : control?.globalBuffStacks?.[controlId] ?? 0) : (!member.isTeamBuffSourceProxy || linked?.stacks ? control?.globalBuffStacks?.[controlId] : undefined) ??
          member.globalBuffStacks?.[buff.id] ?? 0, buff);
      }
      // A source disabled in Buff Check is a master switch for unlocked special items.
      if (!sourceOn && (recipient || linked?.active)) {
        active[buff.id] = false;
        for (const effect of buff.effects || []) active[buff.id + '::' + effect.zone] = false;
        continue;
      }
      const modeMatches = wc.buffMatchesResolvedCombatMode(buff, opts);
      if (buff.category === 'composite') {
        // Only the vulnerability zones default on; other effects retain their own coverage.
        const categories = new Set((buff.effects || []).map(effect => effect.zone).filter(zone => zones.has(zone)));
        for (const category of categories) {
          const key = buff.id + '::' + category;
          if (custom[key] !== undefined || custom[buff.id] !== undefined) continue;
          const globalOn = member.globalBuffActive?.[key] ?? sourceOn;
          active[key] = !!globalOn && modeMatches && (buff.effects || []).some(effect => {
            const resolved = wc.resolveCompositeEffectRuntime(buff, effect);
            return wc.compositeEffectMeetsMinResonance(effect, member, buff) &&
              wc.compositeEffectMeetsTargetFilters(effect, member) &&
              wc.compositeEffectMatchesFilters(resolved, category, damageType, opts) &&
              wc.compositeEffectAppliesToUnit(resolved, unit, unit, member);
          });
        }
      } else if (custom[buff.id] === undefined) {
        active[buff.id] = sourceOn && modeMatches && (buff.category === 'matrixFinal'
          ? wc.matchesMatrixFinalBuff(buff, damageType, opts)
          : wc.compositeEffectMatchesFilters({ ...buff, zone: buff.category }, buff.category, damageType, opts));
      }
    }
    return active;
  }
  function syncFromMember(member, buff, changes, options = {}) {
    if (!enabled(buff) || !isSource(buff)) return;
    const slot = wc.state.members.indexOf(member);
    if (slot < 0) return;
    const shared = wc.state.team?.sharedBuffs?.buffs || [];
    const source = buff.teamSourceId ? shared.find(b => b.id === buff.teamSourceId) : shared.find(b => b.id === buff.id);
    const sourceId = source?.id || buff.id;
    const isTeam = !!source;
    const owner = wc.getSpecialSkillsRoundOwner();
    const liveRound = owner?.cycleConfig?.enabled ? wc.readActiveCycleRoundIndex(owner) : 0;
    const memberRound = member.cycleConfig?.enabled ? wc.readActiveCycleRoundIndex(member) : liveRound;
    const scopes = [], seen = new Set();
    const add = holder => { if (holder && !seen.has(holder)) { seen.add(holder); scopes.push(holder); } };
    if (options.allRounds || liveRound === memberRound) add(wc.state.specialSkills);
    for (const m of wc.state.members) (m.cycleConfig?.rounds || []).forEach((round, index) => {
      if (options.allRounds || index === memberRound) add(round.specialSkills);
    });
    for (const holder of scopes) {
      const target = holder.characters?.[slot];
      if (!target) continue;
      const effective = { ...changes };
      if (followsRecipient(source || buff)) {
        const recipient = recipientDefault(slot, source || buff);
        const id = wc.makeTeamMirrorBuffId(sourceId);
        const sourceOn = recipient.active && (changes.active === true ||
          (!target.specialSourceControls?.[id]?.active || target.globalBuffActive?.[id] !== false));
        if (changes.active !== undefined) effective.active = !!changes.active && recipient.active;
        if (!sourceOn) delete effective.stacks;
        else if (changes.active === true && wc.isStackBuff(source || buff)) effective.stacks = recipient.stacks;
      }
      const matches = b => isTeam ? b.teamSourceId === sourceId : b.personalSourceId === sourceId;
      const mirrors = (target.buffs || []).filter(matches);
      const ids = isTeam ? [...new Set([wc.makeTeamMirrorBuffId(sourceId), ...mirrors.map(b => b.id)])] : mirrors.map(b => b.id);
      target.globalBuffActive ||= {};
      target.globalBuffStacks ||= {};
      target.specialSourceControls ||= {};
      for (const id of ids) {
        const previous = target.globalBuffStacks[id] ?? options.previousStacks ?? 0;
        const linked = target.specialSourceControls[id] ||= {};
        if (effective.active !== undefined) { target.globalBuffActive[id] = !!effective.active; linked.active = true; }
        if (effective.stacks === undefined) continue;
        linked.stacks = true;
        const next = wc.normalizeStackInput(effective.stacks, source || buff);
        target.globalBuffStacks[id] = next;
        for (const item of holder.items || []) {
          if (item.locked || item.buffMode !== 'custom') continue;
          const proxy = wc.isSpecialBuffSourceTeam(item);
          const itemSlot = proxy ? (Number.isInteger(item.sourceRosterSlot) ? item.sourceRosterSlot : item.memberIndex ?? 0) :
            holder.characters.findIndex(c => c.id === item.characterId);
          if (itemSlot !== slot) continue;
          const key = proxy && isTeam ? sourceId : id;
          if (proxy && !isTeam) continue;
          const value = item.buffStacks?.[key];
          if (value === undefined || (!options.replace && Number(value) !== Number(previous) &&
              Number(value) !== Number(options.previousStacks))) continue;
          item.buffStacks[key] = next;
          item.buffStacksSig = (item.buffStacksSig || []).filter(row => row.id !== key);
          const signatureOwner = proxy ? { buffs: [source || buff] } : target;
          wc.syncUnitBuffCoverageSigs(item, signatureOwner);
        }
      }
    }
  }
  function syncShared(buff, changes, options = {}) {
    for (const member of wc.state.members) syncFromMember(member, buff, changes, { ...options, allRounds: true });
  }
  wc.SpecialBuffDefaults = { enabled, isSource, resolve, syncFromMember, syncShared, followsRecipient };
})();
