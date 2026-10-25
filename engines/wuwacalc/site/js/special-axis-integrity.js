/* Reconcile only explicit axis links. Standalone special skills remain independent. */
(() => {
  const W = window.__WC;
  const cleaned = new WeakMap();
  const clone = value => JSON.parse(JSON.stringify(value));

  function collect(scope) {
    const catalogs = new Set(), specials = new Set();
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.id === 'string') catalogs.add(value.id);
      if (typeof value.linkedSpecialSkillId === 'string') specials.add(value.linkedSpecialSkillId);
      for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
    }
    let complete = true;
    for (const member of scope) {
      if (!member || (!member.resonanceAxis && !Array.isArray(member.rotationCatalog))) { complete = false; continue; }
      // Include dormant chain patches, so changing chains never loses a legitimate skill.
      visit(member.resonanceAxis || member.rotationCatalog);
    }
    return { catalogs, specials, complete };
  }

  function audit(repair = false) {
    const state = W.state, members = state.members || [];
    const owner = W.getSpecialSkillsRoundOwner();
    const count = owner ? Math.max(1, ...members.map(m => m.cycleConfig?.enabled ? m.cycleConfig.rounds?.length || 1 : 1)) : 1;
    const removed = new Set(), missing = [], orphaned = new Set();
    function inspect(ss, scope, index, active = false) {
      if (!Array.isArray(ss?.items)) return;
      const refs = collect(scope);
      const invalid = item => refs.complete && typeof item?.linkedCatalogId === 'string' && item.linkedCatalogId.length > 0 &&
        !refs.specials.has(item.id) && !refs.catalogs.has(item.linkedCatalogId);
      for (const item of ss.items) if (invalid(item)) {
        const key = `${index}:${item.id}`; orphaned.add(key);
        if (repair) removed.add(key);
      }
      if (repair && removed.size) ss.items = ss.items.filter(item => !invalid(item));
      if (!active) return;
      const present = new Set(ss.items.map(item => item.id));
      scope.forEach((member, memberIndex) => {
        if (!member) return;
        const view = member.resonanceAxis
          ? W.buildResonanceAxisView(clone(member.resonanceAxis), 'damage') : member;
        for (const entry of view.rotationCatalog || []) {
          if (entry.linkedSpecialSkillId && !present.has(entry.linkedSpecialSkillId)) {
            missing.push({ round: index + 1, member: members[memberIndex]?.name || `角色${memberIndex + 1}`, name: entry.name || '特殊技能', id: entry.linkedSpecialSkillId });
          }
        }
      });
    }
    const activeRound = owner ? W.readActiveCycleRoundIndex(owner) : 0;
    for (let index = 0; index < count; index++) {
      const scopes = members.map(member => member.cycleConfig?.enabled ? member.cycleConfig.rounds?.[index] : member);
      const liveScope = index === activeRound ? members.map((member, memberIndex) =>
        !member.cycleConfig?.enabled || W.readActiveCycleRoundIndex(member) === index ? member : scopes[memberIndex]) : scopes;
      // The live editing data is authoritative for its round; other rounds stay independent.
      const primary = index === activeRound ? state.specialSkills : owner?.cycleConfig.rounds?.[index]?.specialSkills ||
        scopes.find(member => member?.specialSkills)?.specialSkills;
      inspect(primary, liveScope, index, true);
      for (const member of scopes) if (member?.specialSkills && member.specialSkills !== primary) inspect(member.specialSkills, scopes, index);
    }
    if (repair && removed.size) {
      let previous = cleaned.get(members);
      if (!previous) cleaned.set(members, previous = new Set());
      removed.forEach(key => previous.add(key));
    }
    return { removed: removed.size, orphaned: orphaned.size, missing, cleaned: cleaned.get(members)?.size || 0 };
  }

  function reconcile() {
    // Recorded configurations are immutable views. Editing them uses the normal calculation path.
    return audit(!W.configRecords.hold());
  }

  function renderNotice() {
    const report = audit(false), lines = [];
    if (report.orphaned) lines.push(`此保存记录包含 ${report.orphaned} 条失效的轴关联特殊技能；当前保留原记录结果，请进入编辑后核对。`);
    else if (report.cleaned) lines.push(`已清理 ${report.cleaned} 条失效的轴关联特殊技能，独立添加的特殊技能保持不变。`);
    for (const row of report.missing) lines.push(`第 ${row.round} 轮：${row.member}的「${row.name}」缺少对应特殊技能数据，该次伤害未计入；请删除这个失效轨道条目后重新添加，并核对参数。`);
    if (!lines.length) return '';
    return `<div class="hint special-axis-integrity-note" role="status" style="padding:10px 12px;margin:10px 0;border:1px solid currentColor;border-radius:6px;line-height:1.7">${lines.map(line => `<div>${W.escapeHtml(line)}</div>`).join('')}</div>`;
  }

  W.SpecialAxisIntegrity = { audit, reconcile, renderNotice };
})();
