/* Continuous skill shelf: presentation state stays outside team/rotation data. */
(() => {
  const wc = window.__WC = window.__WC || {};
  const compactKey = 'wc_skill_palette_compact_v1';
  const positions = new Map(), bound = new WeakSet();
  let compact = true, mountScheduled = false;
  try { compact = localStorage.getItem(compactKey) !== '0'; } catch {}
  const escape = value => wc.escapeHtml(String(value ?? ''));
  const keyOf = host => host.dataset.axisPaletteMember + '|' + host.dataset.paletteCharacter + '|' + host.dataset.paletteGroupMode;
  function formsFor(items, member, split) {
    if (!split) return [{name:'', items}];
    const buckets = new Map();
    items.forEach(item => {
      const form = wc.skillDisplayAliases.getForm(member?.characterId, item);
      if (!buckets.has(form)) buckets.set(form, []);
      buckets.get(form).push(item);
    });
    const names = [...buckets.keys()].filter(name => name !== '共用');
    if (buckets.has('共用')) names.push('共用');
    const character = wc.findCharSkillDef(member?.characterId)?.name || '本体';
    return names.map(name => ({name:names.length === 1 ? '' : name === '本体' ? character : name,
      items:buckets.get(name)}));
  }
  function render({groups, member, memberIndex, groupMode, modeToggle, levelsHtml, renderCard}) {
    const knownForms = new Set(groups.flatMap(group => group.items)
      .map(item => wc.skillDisplayAliases.getForm(member?.characterId, item)).filter(form => form !== '共用'));
    const owner = String(memberIndex) + '|' + member?.characterId + '|' + groupMode;
    const saved = positions.get(owner);
    const active = groups.some(group => group.type === saved?.type) ? saved.type : groups[0]?.type;
    const id = index => 'skill-shelf-' + memberIndex + '-' + groupMode + '-' + index;
    const nav = groups.map((group, index) => `<button type="button" class="skill-type-tab${group.type === active ? ' active' : ''}"
      data-palette-jump="${index}" aria-controls="${id(index)}"${group.type === active ? ' aria-current="location"' : ''}
      aria-label="${escape(group.type + '，共' + group.items.length + '个技能')}">${escape(group.type)}<span class="count">${group.items.length}</span></button>`).join('');
    const sectionHtml = groups.map((group, index) => `<section class="palette-section" id="${id(index)}"
      data-palette-section="${index}" data-palette-type="${escape(group.type)}" aria-labelledby="${id(index)}-title" tabindex="-1">
      ${formsFor(group.items, member, knownForms.size > 1).map((form, formIndex) => `<div class="palette-form">
        <div class="palette-row-label">${formIndex === 0 ? `<h3 id="${id(index)}-title" class="palette-section-title">${escape(group.type)}<span>${group.items.length}</span></h3>` : ''}
        ${form.name ? `<h4 class="palette-form-title">${escape(form.name)}</h4>` : ''}</div>
        <div class="skill-grid">${form.items.map(item => renderCard(item, group)).join('')}</div></div>`).join('')}
      </section>`);
    // Reserve one complete skill row per form before putting E and R side by side.
    const pairWidths = groups.map(group => {
      const count = Math.max(1, ...formsFor(group.items, member, knownForms.size > 1).map(form => form.items.length));
      return 80 + count * 114;
    });
    const sections = sectionHtml.map((html, index) => {
      if (groups[index].type === 'R' && groups[index - 1]?.type === 'E') return '';
      if (groups[index].type !== 'E' || groups[index + 1]?.type !== 'R') return html;
      const sized = i => sectionHtml[i].replace('class="palette-section"',
        'class="palette-section" style="--palette-pair-width:' + pairWidths[i] + 'px"');
      return '<div class="palette-action-pair">' + sized(index) + sized(index + 1) + '</div>';
    }).join('');
    return `<div class="axis-skill-library palette-shelf${compact ? ' is-compact' : ''}" data-palette-shelf
      data-axis-palette-member="${memberIndex}" data-palette-character="${escape(member?.characterId || '')}" data-palette-group-mode="${escape(groupMode)}">
      <div class="skill-library-toolbar">${modeToggle}<label class="palette-compact-toggle"><input type="checkbox" data-palette-compact${compact ? ' checked' : ''}>简化排版</label></div>
      <div class="palette-level-controls">${levelsHtml || ''}</div>
      <nav class="skill-type-tabs" aria-label="技能分类定位">${nav}</nav>
      <div class="palette-scroll" role="region" aria-label="技能库列表" tabindex="0">${sections}</div>
      <p class="axis-skill-library-hint">点击技能添加 · Shift 指定插入位置 · 左侧分类定位 · 名称悬停查看详情</p>
    </div>`;
  }
  function setActive(host, type) {
    const sections = [...host.querySelectorAll('[data-palette-section]')];
    host.querySelectorAll('[data-palette-jump]').forEach(button => {
      const active = sections[Number(button.dataset.paletteJump)]?.dataset.paletteType === type;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current');
    });
    const key = keyOf(host), saved = positions.get(key) || {};
    positions.set(key, {...saved, type});
  }
  function remember(host) {
    const viewport = host.querySelector('.palette-scroll');
    const sections = [...host.querySelectorAll('[data-palette-section]')];
    if (!viewport || !sections.length) return;
    const top = viewport.getBoundingClientRect().top + 12;
    // Paired E/R sections share a row; keep the selected category within that row.
    const rows = [];
    sections.forEach(section => {
      const y = section.getBoundingClientRect().top;
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.top - y) < 1) row.sections.push(section);
      else rows.push({top:y, sections:[section]});
    });
    let row = rows[0];
    for (const candidate of rows) if (candidate.top <= top) row = candidate;
    if (viewport.scrollHeight > viewport.clientHeight + 2 && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2)
      row = rows[rows.length - 1];
    const saved = positions.get(keyOf(host)) || {};
    const current = row.sections.find(section => section.dataset.paletteType === saved.jumpType) ||
      row.sections.find(section => section.dataset.paletteType === saved.type) || row.sections[0];
    positions.set(keyOf(host), {...saved, top:viewport.scrollTop, type:current.dataset.paletteType});
    setActive(host, current.dataset.paletteType);
  }
  function mountAll() {
    document.querySelectorAll('[data-palette-shelf]').forEach(host => {
      if (bound.has(host)) return;
      bound.add(host);
      const viewport = host.querySelector('.palette-scroll');
      const saved = positions.get(keyOf(host));
      viewport.scrollTop = saved?.top || 0;
      remember(host);
      let pending = false;
      viewport.addEventListener('scroll', () => {
        // Store immediately: adding a skill can rerender the shelf before the next frame.
        const previous = positions.get(keyOf(host)) || {};
        positions.set(keyOf(host), {...previous, top:viewport.scrollTop});
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; if (host.isConnected) remember(host); });
      }, {passive:true});
    });
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-sync-skill-aliases]')) {
      event.preventDefault();
      const changed = wc.skillDisplayAliases.syncLegacyNames();
      if (changed) wc.scheduleSave();
      wc.setCatalogScrollHint(changed ? '已同步 ' + changed + ' 条技能名称（全队及所有轮次）' : '无需同步；手动改名和命名模板已保留');
      wc.renderMain();
      return;
    }
    const button = event.target.closest?.('[data-palette-jump]');
    if (!button) return;
    const host = button.closest('[data-palette-shelf]');
    if (!host) return;
    const section = host.querySelector('[data-palette-section="' + Number(button.dataset.paletteJump) + '"]');
    const viewport = host.querySelector('.palette-scroll');
    if (!section || !viewport) return;
    event.preventDefault();
    // Intermediate smooth-scroll frames may show a different category before this row.
    const key = keyOf(host);
    positions.set(key, {...positions.get(key), jumpType:section.dataset.paletteType});
    setActive(host, section.dataset.paletteType);
    const top = viewport.scrollTop + section.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTo({top, behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });
  document.addEventListener('change', event => {
    if (!event.target.matches?.('[data-palette-compact]')) return;
    compact = event.target.checked;
    try { localStorage.setItem(compactKey, compact ? '1' : '0'); } catch {}
    document.querySelectorAll('[data-palette-shelf]').forEach(host => {
      host.classList.toggle('is-compact', compact);
      host.querySelector('[data-palette-compact]').checked = compact;
      requestAnimationFrame(() => { if (host.isConnected) remember(host); });
    });
  });
  function boot() {
    mountAll();
    const main = document.getElementById('main');
    if (!main || typeof MutationObserver === 'undefined') return;
    new MutationObserver(() => {
      if (mountScheduled) return;
      mountScheduled = true;
      queueMicrotask(() => { mountScheduled = false; mountAll(); });
    }).observe(main, {childList:true, subtree:true});
  }
  wc.skillPaletteView = Object.freeze({render, formsFor});
  Object.defineProperty(window,'skillPaletteView',{configurable:true, enumerable:false, get:() => wc.skillPaletteView});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
