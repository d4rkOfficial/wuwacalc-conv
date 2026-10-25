/* Events for the native Buff page; coverage and stack writes use the live handlers. */
(() => {
  function getViewState() {
    return window.__WC.buffCheckView || (window.__WC.buffCheckView = { selected: '0', view: 'team' });
  }
  const state = getViewState();
  let selected = state.selected;
  let view = state.view;
  const memberViews = new Map();
  function setView(page, next) {
    view = next; getViewState().view = next;
    if (next !== 'environment') memberViews.set(selected, next);
    page.dataset.buffView = next;
    page.querySelectorAll('[data-buff-view-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.buffViewChoice === next)));
    page.querySelector('.local-buff-workspace').hidden = next === 'environment';
    page.querySelector('.local-buff-environment').hidden = next !== 'environment';
  }
  const root = document.querySelector('#main');
  if (!root) return;
  function refreshBuffAvatarUrls() {
    root.querySelectorAll('.buff-check-page img[src*="assets/characters/131"]').forEach(image => {
      const src = image.getAttribute('src') || '';
      const id = /(?:^|\/)assets\/characters\/(1311|1312)\.webp(?:\?.*)?$/.exec(src)?.[1];
      if (!id) return;
      const version = id === '1311' ? '6af730ec27' : 'ccb5a44e79';
      const next = `assets/characters/${id}.webp?v=${version}`;
      if (src !== next) image.setAttribute('src', next);
    });
  }
  new MutationObserver(refreshBuffAvatarUrls).observe(root, { childList: true, subtree: true });
  refreshBuffAvatarUrls();
  let effectDialog;
  function openEffect(hit) {
    const api = window.__WC;
    const buff = api?.findBuffByIdAnywhere?.(hit.dataset.teamBuffFocus);
    if (!effectDialog) {
      effectDialog = document.createElement('dialog');
      effectDialog.className = 'local-buff-effect-dialog';
      effectDialog.setAttribute('aria-labelledby', 'local-buff-effect-title');
      effectDialog.innerHTML = '<header><h2 id="local-buff-effect-title"></h2><button type="button" aria-label="关闭 Buff 效果">×</button></header><div class="local-buff-effect-copy"></div>';
      effectDialog.querySelector('button').addEventListener('click', () => effectDialog.close());
      effectDialog.addEventListener('click', event => { if (event.target === effectDialog) { const r = effectDialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) effectDialog.close(); } });
      document.body.append(effectDialog);
    }
    effectDialog.querySelector('h2').textContent = buff ? api.formatBuffTooltipTitle?.(buff) || hit.textContent : hit.textContent;
    const copy = effectDialog.querySelector('.local-buff-effect-copy');
    copy.replaceChildren();
    const effects = buff?.category === 'composite' ? buff.effects || [] : buff ? [buff] : [];
    const number = value => Number.isFinite(Number(value)) ? String(Number(value)) : '待确认';
    effects.forEach(effect => {
      const composite = buff.category === 'composite';
      const zone = composite ? effect.zone : effect.category;
      const meta = api.BUFF_CATS?.[zone];
      const unit = meta?.unit ?? '';
      const stacked = composite ? effect.valueMode !== 'fixed' : buff.mode === 'stack';
      const row = document.createElement('section'); row.className = 'local-buff-value-row';
      const title = document.createElement('h3'); title.textContent = meta?.label || zone || '未知乘区';
      const value = document.createElement('strong');
      if (stacked && composite) {
        value.textContent = (effect.segments || []).map((segment, i) => {
          const start = i === 0 ? 1 : Number(effect.segments[i - 1].upTo) + 1;
          const range = effect.segments.length > 1 ? `${start}～${segment.upTo ?? '上限'}层：` : '';
          return `${range}${number(segment.perStack)}${unit}/层`;
        }).join('；') || '叠层数值待确认';
      } else value.textContent = `${number(stacked ? buff.perStack ?? buff.value : effect.value)}${unit}${stacked ? '/层' : ''}`;
      row.append(title, value);
      const scopes = [effect.element, effect.damageType, effect.effectType].filter(Boolean);
      if (effect.skillScope && effect.skillScope !== 'all') scopes.push(...(effect.skillNames || effect.catalogIds || []));
      const conditions = [];
      if (buff.mode === 'stack') conditions.push(`最多 ${buff.maxStacks ?? '待确认'} 层`);
      if (effect.minStacks) conditions.push(`达到 ${effect.minStacks} 层生效`);
      if (effect.minResonance) conditions.push(`${effect.minResonance} 链解锁`);
      if (effect.defenseKind) conditions.push(effect.defenseKind === 'pen' ? '防御穿透' : effect.defenseKind === 'reduce' ? '防御降低' : effect.defenseKind);
      if (effect.onlyCharacterIds?.length) conditions.push(`限定角色：${effect.onlyCharacterIds.join('、')}`);
      if (effect.onlyCombatModes?.length) conditions.push(`限定模态：${effect.onlyCombatModes.join('、')}`);
      const detail = document.createElement('p'); detail.textContent = [...scopes, ...conditions].join(' · ') || '泛用';
      row.append(detail); copy.append(row);
    });
    if (!effects.length) copy.textContent = '暂无可展示的数值效果。';
    effectDialog.showModal();
  }
  root.addEventListener('click', event => {
    const hit = event.target.closest('.local-buff-table [data-team-buff-focus]');
    if (!hit) return;
    event.preventDefault(); event.stopImmediatePropagation(); openEffect(hit);
  }, true);
  root.addEventListener('keydown', event => {
    const hit = event.target.closest('.local-buff-table [data-team-buff-focus]');
    if (!hit || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); openEffect(hit);
  }, true);
  function activate(page, value, focus = false) {
    if (selected !== value) view = memberViews.get(value) || 'team';
    selected = value; Object.assign(getViewState(), { selected: value, view });
    page.querySelectorAll('.local-buff-member-tab').forEach(button => {
      const active = button.dataset.member === value;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    page.querySelector('.local-buff-environment').hidden = value !== 'environment';
    const workspace = page.querySelector('.local-buff-workspace');
    workspace.hidden = value === 'environment';
    workspace.setAttribute('aria-labelledby', `local-buff-tab-${value}`);
    page.querySelectorAll('.buff-check-member-col').forEach(panel => { panel.hidden = panel.dataset.setupMember !== value; });
    page.querySelectorAll('.buff-source-card[data-tba-card]').forEach(card => {
      const member = /^src(\d+)$/.exec(card.dataset.tbaCard);
      card.hidden = member ? member[1] !== value : false;
    });
    const original = page.querySelector(`.buff-check-member-col[data-setup-member="${value}"] .buff-check-member-head`);
    const hero = page.querySelector('.local-buff-identity');
    hero.replaceChildren();
    if (original?.dataset.tbaAutoStack === '1') {
      const avatar = original.querySelector('img');
      if (avatar) { const image = document.createElement('img'); image.src = avatar.src; image.alt = ''; hero.append(image); }
      const text = document.createElement('div');
      const overline = document.createElement('small'); overline.textContent = `队员 ${Number(value) + 1} · BUFF 配置`;
      const name = document.createElement('h2'); name.textContent = original.querySelector('.buff-check-member-name')?.textContent || '未选择角色';
      const hint = document.createElement('p'); hint.textContent = '管理该角色提供的全队增益，检查实际生效的 Buff。';
      text.append(overline, name, hint); hero.append(text);
    }
    setView(page, view);
  }

  root.addEventListener('click', event => {
    const page = event.target.closest('.buff-check-page.local-buff-subpages');
    if (!page) return;
    const member = event.target.closest('.local-buff-member-tab');
    const viewButton = event.target.closest('[data-buff-view-choice]');
    if (member) activate(page, member.dataset.member);
    else if (viewButton) setView(page, viewButton.dataset.buffViewChoice);
    const stack = event.target.closest('.local-stat-stack');
    if (!stack) return;
    const input = stack.previousElementSibling;
    if (!input?.matches('.stack-input')) return;
    const panel = stack.closest('[data-setup-member]');
    const buff = window.__WC.findBuffByIdAnywhere?.(input.dataset.buffStackId);
    const sourceId = buff?.teamSourceId || input.dataset.buffStackId;
    const original = [...page.querySelectorAll('[data-tba-stack-open]')].find(node => node.dataset.tbaStackOpen === sourceId && node.dataset.memberIndex === panel?.dataset.setupMember);
    if (original) { for (const attr of original.attributes) { if (attr.name.startsWith('data-tba-') || attr.name === 'data-member-index') stack.setAttribute(attr.name, attr.value); } return; }
    document.querySelectorAll('.local-stack-editor').forEach(node => node.remove());
    const editor = document.createElement('div'); editor.className='local-stack-editor'; editor.popover='auto'; editor.setAttribute('role','dialog'); editor.setAttribute('aria-label','修改层数');
    const label=document.createElement('label'); label.textContent='层数';
    const field=document.createElement('input'); field.type='number';field.required=true;field.min=input.min||'0';field.step=input.step||'1';field.value=input.value;if(input.max)field.max=input.max;field.setAttribute('aria-label','层数');label.append(field);
    const apply=document.createElement('button');apply.type='button';apply.textContent='确定';
    apply.onclick=()=>{if(!field.reportValidity())return;const value=field.value;editor.hidePopover();if(input.isConnected){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}};
    editor.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply.click()}});
    editor.append(label,apply);document.body.append(editor);editor.showPopover();
    const rect=stack.getBoundingClientRect(),box=editor.getBoundingClientRect();editor.style.left=Math.max(8,Math.min(rect.right-box.width,innerWidth-box.width-8))+'px';editor.style.top=Math.max(8,rect.bottom+box.height+8<=innerHeight?rect.bottom+7:rect.top-box.height-7)+'px';
    editor.addEventListener('toggle',e=>{if(e.newState==='closed')editor.remove()});field.focus();field.select();
  });
  root.addEventListener('keydown', event => {
    const button=event.target.closest('.local-buff-member-tab');
    if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const page=button.closest('.buff-check-page'),tabs=[...page.querySelectorAll('.local-buff-member-tab')],index=tabs.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    activate(page,tabs[next].dataset.member,true);
  });
})();
