/* Data overview only: aggregate cached results without changing the editing round. */
(() => {
  const W = window.__WC;
  const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const escape = value => W.escapeHtml(String(value ?? ''));
  const format = value => W.fmt(value);

  function roundCount() {
    const members = W.state.members || [];
    if (!members.some(m => m.cycleConfig?.enabled)) return 1;
    return Math.max(1, ...members.filter(m => m.cycleConfig?.enabled).map(m => m.results?.cycles?.length || m.cycleConfig.count || 1));
  }

  function getUi() {
    const ui = W.ensureExportSummaryUi();
    if (ui.analysisRound !== 'all' && (!Number.isInteger(ui.analysisRound) || ui.analysisRound < 0 || ui.analysisRound >= roundCount())) ui.analysisRound = 'all';
    return ui;
  }

  // Metadata must come from the same round as its cached damage, including axis patches.
  function roundView(member, index) {
    const round = member.cycleConfig?.rounds?.[index];
    if (!round) return { phases: [], rotationCatalog: [] };
    if (round.resonanceAxis) return W.buildResonanceAxisView(JSON.parse(JSON.stringify(round.resonanceAxis)), 'damage');
    return { phases: round.phases || [], rotationCatalog: round.rotationCatalog || [] };
  }

  function collectMember(member, scope) {
    const entries = [];
    const add = (skill, damage, viewMember, hitBreakdowns) => {
      const total = positive(damage);
      if (!total) return;
      const name = String(skill.name || skill.librarySkillName || '未命名技能');
      const identity = String(skill.librarySkillName || skill.libraryKey || name);
      const units = skill.split && skill.hits?.length ? skill.hits : [skill];
      const raw = units.map((unit, i) => ({
        name, key: 'skill:' + identity,
        damageType: W.getUnitDamageType(unit, unit === skill ? null : skill) || '未分类',
        skillType: W.resolveUnitSkillType(unit, unit === skill ? null : skill, viewMember) || '未分类',
        total: units.length === 1 ? total : positive(hitBreakdowns?.[i]?.total),
      }));
      // A split skill with incomplete Hit details remains visible, without inventing a split.
      const accounted = raw.reduce((sum, row) => sum + row.total, 0);
      if (Math.abs(accounted - total) > Math.max(1e-6, total * 1e-9)) {
        entries.push({ name, key: 'skill:' + identity, damageType: '未分类', skillType: '未分类', total });
      } else entries.push(...raw.filter(row => row.total > 0));
    };
    if (member.cycleConfig?.enabled) {
      (member.results?.cycles || []).forEach((cycle, index) => {
        if (scope !== 'all' && scope !== index) return;
        const view = roundView(member, index);
        const skills = view.phases.flatMap(phase => phase.skills || []);
        const context = { ...member, phases: view.phases, rotationCatalog: view.rotationCatalog };
        (cycle.steps || []).forEach(step => {
          const skill = (step.skillId && skills.find(s => s.id === step.skillId)) ||
            (step.catalogId && skills.find(s => s.catalogId === step.catalogId)) ||
            (step.catalogId && view.rotationCatalog.find(s => s.id === step.catalogId)) ||
            { name: step.name };
          add(skill, step.damage, context, step.hitBreakdowns);
        });
      });
    } else {
      // A member without cycle mode contributes once to the engine's team total.
      (member.phases || []).forEach(phase => (phase.skills || []).forEach(skill => {
        const hitDetails = (skill.hits || []).map(hit => ({ total: hit._damage ?? hit._breakdown?.total }));
        const damage = skill.split && skill.hits?.length
          ? hitDetails.reduce((sum, hit) => sum + positive(hit.total), 0)
          : skill._damage ?? skill._breakdown?.total;
        add(skill, damage, member, hitDetails);
      }));
    }
    return entries;
  }

  function specialRoundConfig(index) {
    const members = W.state.members || [];
    const active = members[W.state.team?.activeIndex];
    if (active?.cycleConfig?.enabled && active.cycleConfig.rounds?.[index]?.specialSkills) return active.cycleConfig.rounds[index].specialSkills;
    const owner = members.find(m => m.cycleConfig?.enabled && m.cycleConfig?.rounds?.[index]?.specialSkills);
    return owner?.cycleConfig.rounds[index].specialSkills || W.state.specialSkills || {};
  }

  function build(scope = getUi().analysisRound) {
    const members = (W.state.members || []).map((member, index) => ({
      index, name: member.name || `角色${index + 1}`, entries: collectMember(member, scope),
    }));
    const unowned = [];
    const cycles = W.state.specialSkills?.results?.cycles || [];
    cycles.forEach((cycle, index) => {
      if (scope !== 'all' && scope !== index) return;
      const config = specialRoundConfig(index);
      (cycle.items || []).forEach(result => {
        const item = (config.items || []).find(s => s.id === result.id) || {};
        const total = positive(result.total);
        if (!total) return;
        const entry = {
          name: String(item.name || '特殊技能'),
          key: 'special:' + String(item.libraryKey || item.name || result.id), total,
          damageType: W.getSpecialSkillExportGroupLabel(item, W.SKILL_GROUP_MODE_DAMAGE) || '特殊技能',
          skillType: W.getSpecialSkillExportGroupLabel(item, W.SKILL_GROUP_MODE_OFFICIAL) || '特殊技能',
        };
        const owner = Number.isInteger(result.ownerIndex) && !W.isSpecialBuffSourceTeam(item) ? members[result.ownerIndex] : null;
        (owner ? owner.entries : unowned).push(entry);
      });
    });
    members.forEach(member => { member.total = member.entries.reduce((sum, entry) => sum + entry.total, 0); });
    const unownedTotal = unowned.reduce((sum, entry) => sum + entry.total, 0);
    return { members, unownedTotal, total: members.reduce((sum, m) => sum + m.total, unownedTotal), scope };
  }

  function group(entries, mode) {
    const map = new Map();
    entries.forEach(entry => {
      const key = mode === 'name' ? entry.key : entry[mode];
      if (!map.has(key)) map.set(key, { type: mode === 'name' ? entry.name : key, total: 0 });
      map.get(key).total += entry.total;
    });
    const total = entries.reduce((sum, entry) => sum + entry.total, 0);
    return [...map.values()].map(row => ({ ...row, sharePct: total > 0 ? row.total / total * 100 : 0 })).sort((a, b) => b.total - a.total);
  }

  function render() {
    const ui = getUi(), count = roundCount(), data = build(ui.analysisRound);
    const selected = data.members[ui.memberIndex] || data.members[0];
    const member = W.state.members[selected?.index || 0];
    const entries = selected?.entries || [];
    const official = W.isSkillGroupModeOfficial(ui.pieGroupMode);
    const scopeLabel = ui.analysisRound === 'all' && count > 1 ? `全部 ${count} 轮合计` : `第${ui.analysisRound === 'all' ? 1 : ui.analysisRound + 1}轮`;
    const options = (count > 1 ? `<button type="button" data-oa-round="all" aria-pressed="${ui.analysisRound === 'all'}">全部轮次</button>` : '') +
      Array.from({ length: count }, (_, index) => `<button type="button" data-oa-round="${index}" aria-pressed="${ui.analysisRound === index || (count === 1 && ui.analysisRound === 'all')}">第${index + 1}轮</button>`).join('');
    const teamSlices = data.members.map(m => ({ type: m.name, total: m.total, slot: m.index }));
    if (data.unownedTotal > 0) teamSlices.push({ type: '特殊技能（全队/无属主）', total: data.unownedTotal, slot: 3 });
    const teamSlots = teamSlices.filter(slice => slice.total > 0).map(slice => slice.slot);
    const skills = group(entries, 'name');
    const displayedSkills = skills.slice(0, 6);
    if (skills.length > 6) {
      const total = skills.slice(6).reduce((sum, skill) => sum + skill.total, 0);
      const memberTotal = selected?.total || 0;
      displayedSkills.push({ type: '其他', total, sharePct: memberTotal > 0 ? total / memberTotal * 100 : 0 });
    }
    const ranking = group(entries, 'skillType');
    const skillRows = displayedSkills.map((row, index) => `<tr><td>${index < 6 ? index + 1 : '—'}</td><th scope="row">${escape(row.type)}<span class="oa-skill-track" aria-hidden="true"><i style="width:${row.sharePct.toFixed(3)}%"></i></span></th><td>${format(row.total)}</td><td>${row.sharePct.toFixed(1)}%</td></tr>`).join('');
    const charDef = member?.characterId ? W.findCharSkillDef(member.characterId) : null;
    const weapon = member?.weaponSelection?.id ? W.findWeaponDef(member.weaponSelection.id) : null;
    const sets = (member?.echoConfig?.setLoadout || []).filter(s => s.setId && s.count > 0).map(s => `${W.findEchoSetDef(s.setId)?.name || s.setId}×${s.count}`).join(' / ');
    const mixed = count > 1 && (W.state.members || []).some(m => !m.cycleConfig?.enabled && positive(m.results?.total));
    return `<section class="export-section export-data-summary export-region embossed large oa-analysis">
      <div class="export-region-head oa-analysis-head"><h3 class="export-region-title">伤害分析</h3><div class="oa-rounds" role="group" aria-label="分析轮次">${options}</div></div>
      <p class="oa-scope-label">${escape(scopeLabel)} · 队伍总伤 <strong>${format(data.total)}</strong></p>
      ${mixed ? '<p class="oa-scope-note">未开启多轮的角色在全部轮次汇总中只计一次；单轮视图沿用该角色的当前轴。</p>' : ''}
      <div class="export-summary-tabs">${data.members.map(m => `<button type="button" class="export-summary-tab${m.index === selected?.index ? ' active' : ''}" data-export-summary-member="${m.index}" aria-pressed="${m.index === selected?.index}">${escape(m.name)}</button>`).join('')}</div>
      <div class="oa-charts">
        <div class="export-summary-pie panel-inner oa-team-pie"><div class="export-pie-head"><h4>队伍输出占比</h4><span class="oa-card-caption">${escape(scopeLabel)}</span></div>${W.renderExportSvgPie(teamSlices, 180, { id: 'oa-team', label: '队伍输出占比', color: (_, i) => ['#79cbe3', '#c6a3ef', '#e5bf78', '#9faeba'][teamSlots[i]] })}</div>
        <div class="export-summary-pie panel-inner"><div class="export-pie-head"><h4>${escape(selected?.name || '角色')} · ${official ? '技能类型占比' : '伤害类型占比'}</h4><div class="oa-mode" role="group" aria-label="占比分类"><button type="button" data-oa-mode="damage" aria-pressed="${!official}">伤害类型</button><button type="button" data-oa-mode="official" aria-pressed="${official}">技能类型</button></div></div>${W.renderExportSvgPie(group(entries, official ? 'skillType' : 'damageType'), 180, { id: 'oa-member', label: official ? '技能类型占比' : '伤害类型占比' })}</div>
      </div>
      <div class="oa-details">
        <div class="panel-inner oa-skills"><div class="export-pie-head"><h4>角色技能伤害占比</h4><span class="oa-card-caption">${escape(selected?.name || '')} · ${escape(scopeLabel)}</span></div><p class="oa-scope-note">按具体技能汇总，包含该角色来源的特殊技能；占比以本角色总伤为准。</p><table class="oa-skill-table"><thead><tr><th>排名</th><th>技能</th><th>伤害</th><th>占比</th></tr></thead><tbody>${skillRows || '<tr><td colspan="4" class="oa-empty">暂无技能伤害数据，请先结算轴。</td></tr>'}</tbody></table></div>
        <div class="export-summary-below">
          <div class="export-summary-loadout panel-inner"><h4>当前配装</h4><div class="loadout-line"><span class="muted">角色</span><strong>${escape(charDef?.name || selected?.name || '未选择')}</strong></div><div class="loadout-line"><span class="muted">共鸣链</span><strong>${W.normalizeResonanceUnlocked(member?.resonanceUnlocked)} 链</strong></div><div class="loadout-line"><span class="muted">武器</span><strong>${escape(weapon?.name || '未选择')}${weapon ? ` · R${W.normalizeWeaponRefinement(member?.weaponSelection?.refinement)}` : ''}</strong></div><div class="loadout-line"><span class="muted">声骸</span><span>${escape(sets || '未配置')}</span></div><div class="loadout-line"><span class="muted">本角色总伤</span><strong class="result loadout-total">${format(selected?.total || 0)}</strong></div></div>
          <div class="export-summary-priority panel-inner"><h4>技能类型伤害排行</h4><div class="priority-list">${ranking.map((row, index) => `<div class="priority-row"><span class="priority-rank">${index + 1}</span><span class="priority-name">${escape(row.type)}</span><span class="priority-pct">${row.sharePct.toFixed(1)}%</span></div>`).join('') || '<p class="oa-empty">暂无技能类型数据</p>'}</div></div>
        </div>
      </div>
    </section>`;
  }

  function refresh(control) {
    const host = document.querySelector('.oa-analysis');
    if (!host) return;
    const box = document.createElement('div');
    box.innerHTML = render();
    const next = box.firstElementChild;
    host.replaceWith(next);
    next.querySelector(control)?.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-oa-round],[data-oa-mode]');
    if (!button || !button.closest('.oa-analysis')) return;
    const ui = getUi();
    let selector;
    if (button.hasAttribute('data-oa-round')) {
      const value = button.dataset.oaRound;
      ui.analysisRound = value === 'all' ? 'all' : Number(value);
      selector = `[data-oa-round="${value}"]`;
    } else {
      const official = button.dataset.oaMode === 'official';
      ui.pieGroupMode = official ? W.SKILL_GROUP_MODE_OFFICIAL : W.SKILL_GROUP_MODE_DAMAGE;
      selector = `[data-oa-mode="${button.dataset.oaMode}"]`;
    }
    refresh(selector);
  });

  W.OverviewAnalysis = { build, group, render };
})();
