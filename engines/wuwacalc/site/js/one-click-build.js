/* Public equipment bundles. Calculations and workspace ownership stay in BuildLoadout. */
(() => {
  'use strict';
  const wc = () => window.__WC, clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner = () => String(wc()?.Cloud?.getUser()?.id || '');
  let flags = {enabled:false,readOnly:true}, overlay = null, session = null, requestEpoch = 0, mountQueued = false;
  function api(path, options = {}) { return wc().Cloud.api(path, {...options,timeoutMs:25000}); }
  function status(message, error = false) { const node = overlay?.querySelector('[data-oc-status]'); if(node) { node.textContent=message; node.classList.toggle('is-error',error); } }
  function close() { if(session?.busy)return; requestEpoch++; const old=overlay;overlay=null;session=null;if(old){old.remove();old._returnFocus?.focus();} }
  function controls(disabled) { session.busy=disabled;overlay.querySelectorAll('button,input,textarea,select').forEach(el=>{if(disabled){el.dataset.ocWasDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.ocWasDisabled==='true';delete el.dataset.ocWasDisabled;}}); }
  function image(type, id, name) { return /^\d+$/.test(String(id)) ? `<img src="assets/${type}/${id}.webp" alt="${esc(name)}" loading="lazy" onerror="this.hidden=true">` : ''; }
  function role(id) { return session.characters.find(c=>String(c.id)===String(id)); }
  function body(html) { overlay.querySelector('[data-oc-body]').innerHTML=html; }
  function login() { if(owner())return true;close();wc().Cloud.open('auth');return false; }
  function shell(index) {
    close();const root=document.createElement('div');root.className='one-click-overlay';root.innerHTML=`<section class="one-click-dialog" role="dialog" aria-modal="true" aria-labelledby="oneClickTitle" tabindex="-1"><header><div><h2 id="oneClickTitle">一键配装</h2><small data-oc-subtitle>载入角色配装，不包含轴</small></div><button type="button" data-oc-close aria-label="关闭一键配装">×</button></header><nav aria-label="一键配装功能"><button type="button" data-oc-page="browse">找配装</button><button type="button" data-oc-page="upload">分享当前配装</button><button type="button" data-oc-page="mine">我的分享</button><button type="button" data-oc-page="review" hidden>审核</button></nav><div class="one-click-body" data-oc-body><p>正在加载角色…</p></div><p data-oc-status role="status" aria-live="polite"></p></section>`;
    root._returnFocus=document.activeElement;overlay=root;const w=wc(),member=w.state.members[index];session={index,context:w.Cloud.BuildLoadout.workspaceContext(),roles:member?.characterId?[String(member.characterId)]:[],draft:[],choices:new Map(),rows:[],next:null,characters:[],weapons:[],page:'browse',busy:false,uploadIntent:null};document.body.append(root);
    root.addEventListener('click',event=>{if(event.target===root||event.target.closest('[data-oc-close]')){close();return;}const button=event.target.closest('button');if(button&&!button.disabled)void click(button).catch(error=>status(error.message,true));});
    root.addEventListener('change',event=>{const el=event.target;if(el.matches('[data-oc-choice]')){const row=session.rows.find(r=>r.code+'_'+r.position===el.value);if(row)session.choices.set(row.character_id,row);renderResults();overlay.querySelector(`[data-oc-choice][value="${el.value}"]`)?.focus();}});
    root.addEventListener('input',event=>{if(event.target.matches('[data-oc-search]'))renderPicker(event.target.value);});
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const elements=[...root.querySelectorAll('button,input,select,textarea,summary')].filter(el=>!el.disabled&&el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.querySelector('section'))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
    root.querySelector('section').focus();return root;
  }
  async function open(index) {
    if(overlay&&session?.busy)return;const root=shell(index);
    try { const [characters,weapons]=await Promise.all([wc().ensureCharSkillDb(),wc().ensureWeaponsDb(),wc().ensureEchoSetsDb()]);if(overlay!==root)return;
      session.characters=(characters?.characters||wc().charSkillDb?.characters||[]).filter(c=>!wc().isCustomCharacterId?.(c.id)&&!wc().isPublicSiteHiddenCharId?.(c.id)&&!/^9\d{3}$/.test(String(c.id)));
      session.weapons=weapons?.weapons||[];
      if(owner())void wc().Cloud.fetchMyRole().then(value=>{if(overlay===root&&['owner','admin','moderator'].includes(value))root.querySelector('[data-oc-page="review"]').hidden=false;});
      if(session.roles.length)await loadResults();else showPicker();
    } catch(error) { if(overlay===root){body('<button type="button" data-oc-retry-open>重新加载</button>');status(error.message,true);} }
  }
  function showPicker() {
    requestEpoch++;session.page='picker';session.draft=[...session.roles];body(`<label class="oc-search">选择角色，最多3名<input data-oc-search type="search" placeholder="输入角色名，如卡提" autocomplete="off" maxlength="60"></label><div class="oc-character-grid" data-oc-characters></div><footer><span data-oc-count></span><button type="button" class="oc-primary" data-oc-find>查看配装</button></footer>`);renderPicker('');status('');
  }
  function renderPicker(query) {
    const grid=overlay.querySelector('[data-oc-characters]');if(!grid)return;const term=query.trim().toLowerCase();grid.innerHTML=session.characters.filter(c=>c.name.toLowerCase().includes(term)).map(c=>`<button type="button" class="oc-character" data-oc-role="${esc(c.id)}" aria-pressed="${session.draft.includes(String(c.id))}" ${session.draft.length===3&&!session.draft.includes(String(c.id))?'disabled':''}>${image('characters',c.id,c.name)}<span>${esc(c.name)}</span></button>`).join('')||'<p>没有找到该角色</p>';overlay.querySelector('[data-oc-count]').textContent=`已选 ${session.draft.length} / 3`;overlay.querySelector('[data-oc-find]').disabled=!session.draft.length;
  }
  function card(row) {
    const summary=row.summary,selected=session.choices.get(row.character_id),key=row.code+'_'+row.position;
    const sets=summary.sets.filter(s=>s.id&&s.count>0);
    return `<article class="oc-build ${selected?.code===row.code&&selected.position===row.position?'is-picked':''}"><label class="oc-build-choice"><input type="radio" name="oc-${row.character_id}" data-oc-choice value="${esc(key)}" ${selected?.code===row.code&&selected.position===row.position?'checked':''}><span><span class="oc-card-heading"><strong>${esc(row.title)}</strong><small>${summary.resonanceUnlocked}链 · ${summary.memberCount}人配装</small></span><span class="oc-equipment"><span>${image('weapons',summary.weapon.id,summary.weapon.name)}<span>${esc(summary.weapon.name)}<small>精${summary.weapon.refinement}</small></span></span><span>${sets.map(s=>`${image('echo-sets',s.id,s.name)}<span>${esc(s.name)}<small>${s.count}件</small></span>`).join('')||'<small>未选择套装</small>'}</span></span><small>${esc(row.author)}</small></span></label><button type="button" class="oc-detail-button" data-oc-detail="${esc(key)}">查看词条</button><div data-oc-detail-body="${esc(key)}" hidden></div></article>`;
  }
  function renderResults() {
    const tags=session.roles.map(id=>`${image('characters',id,role(id)?.name||id)}<span>${esc(role(id)?.name||id)}</span>`).join('');
    body(`<div class="oc-role-bar"><div>${tags}</div><button type="button" data-oc-edit>更换 / 添加角色</button></div>${session.roles.map(id=>`<section class="oc-role-results"><h3>${esc(role(id)?.name||id)}</h3>${session.rows.filter(row=>row.character_id===id).map(card).join('')||'<p class="oc-muted">暂无已公开配装，可以分享你的配装。</p>'}</section>`).join('')}${session.next?'<button type="button" data-oc-more>加载更多</button>':''}<footer><span>${session.choices.size?`已选用${session.choices.size}名角色的配装`:'选择配装后应用'}</span><button type="button" class="oc-primary" data-oc-apply ${session.choices.size?'':'disabled'}>应用${session.choices.size||'所选'}名角色配装</button></footer>`);
  }
  async function loadResults(append=false) {
    if(!session.roles.length){showPicker();return;}session.page='browse';const root=overlay,epoch=++requestEpoch;status('正在查找配装…');
    try {const data=await api('/public-builds?character_ids='+encodeURIComponent(session.roles.join(','))+(append&&session.next?'&cursor='+encodeURIComponent(session.next):''));if(overlay!==root||epoch!==requestEpoch)return;
      session.rows=append?[...session.rows,...data.items]:data.items;session.next=data.next;const current=new Map(session.rows.map(r=>[r.code+'_'+r.position,r]));for(const [id,selected]of session.choices)if(!current.has(selected.code+'_'+selected.position)||!session.roles.includes(id))session.choices.delete(id);renderResults();status('');
    }catch(error){if(overlay===root&&epoch===requestEpoch){if(!append)body('<button type="button" data-oc-reload>重试检索</button>');status(error.message,true);}}
  }
  function detailsHtml(build) {
    const w=wc(),main=slot=>{const value=w.resolveEchoMain1Display(slot);return `${esc(value.label)} ${value.value}${value.panelTarget==='display_only'?'':'%'}`;};
    const sub=s=>{const def=w.ECHO_SUB_AFFIXES?.[s.id];return `${esc(def?.label||'其他词条')}${s.damageType?' · '+esc(s.damageType):''} ${esc(s.value)}${def?.unit==='percent'?'%':''}`;};
    const manual=Object.entries(build.manualSources).filter(([,rows])=>rows.some(s=>s.value!==0)).map(([key,rows])=>`${esc(w.CHAR_STATS[key]?.label||'手填属性')}：${rows.map(s=>esc(s.name)+' '+esc(s.value)).join(' / ')}`);
    return `<div class="oc-detail-content"><strong>${esc(role(build.characterId)?.name||build.characterId)} · ${build.resonanceUnlocked}链</strong>${build.echoConfig.slots.map((slot,i)=>`<p>声骸${i+1} · ${slot.cost}C · ${main(slot)}<br><small>${slot.subs.map(sub).join(' / ')||'未填副词条'}</small></p>`).join('')}${manual.length?`<p>手填面板<br><small>${manual.join('<br>')}</small></p>`:''}<small>角色、武器、套装、主副词条及手填面板一并载入；不包含轴。</small></div>`;
  }
  async function detail(key) {
    const row=session.rows.find(r=>r.code+'_'+r.position===key);if(!row)return;const target=overlay.querySelector(`[data-oc-detail-body="${key}"]`),root=overlay;if(!target.hidden){target.hidden=true;return;}target.hidden=false;target.textContent='正在读取词条…';
    try{const data=await api('/public-builds/'+row.code);if(overlay!==root||!target.isConnected)return;if(data.revision!==row.revision)throw Error('配装已更新，请重新检索');const build=data.bundle.members[row.position];if(build?.characterId!==row.character_id)throw Error('配装成员已变化，请重新检索');target.innerHTML=detailsHtml(build);}catch(error){if(overlay===root&&target.isConnected)target.textContent=error.message;}
  }
  async function apply() {
    const current=session,root=overlay,selected=current.roles.map(id=>current.choices.get(id)).filter(Boolean);if(!selected.length)return;controls(true);status('正在应用配装…');
    try {const codes=[...new Set(selected.map(row=>row.code))],details=await Promise.all(codes.map(code=>api('/public-builds/'+code)));if(overlay!==root)return;wc().Cloud.BuildLoadout.assertContext(current.context);
      const builds=selected.map(row=>{const data=details.find(d=>d.code===row.code),build=data?.bundle.members[row.position];if(data?.revision!==row.revision||build?.characterId!==row.character_id)throw Error('配装已更新，请重新检索');return build;});await wc().Cloud.BuildLoadout.applyBatch(builds,current.context,current.index);if(overlay!==root)return;current.context=wc().Cloud.BuildLoadout.workspaceContext();status('已应用'+builds.map(b=>role(b.characterId)?.name||b.characterId).join('、')+'的配装');
    }catch(error){if(overlay===root)status(error.message,true);}finally{if(overlay===root)controls(false);}
  }
  function uploadPage(updating=null) {
    if(!login())return;if(flags.readOnly){status('当前只可读取配装',true);return;}const w=wc();if(w.configWorkspaceOperation.active||w.state._workspaceImporting||w.state._bootReconciling)throw Error('请等待当前配置操作完成');requestEpoch++;session.page='upload';session.uploadOwner=owner();session.updating=updating;session.uploads=w.state.members.map((m,index)=>m.characterId?{index,name:m.name,build:w.Cloud.BuildLoadout.capture(index)}:null).filter(Boolean);session.uploadIntent=null;
    body(`<p>${updating?'更新此分享，重新提交审核。':'选择当前队伍中要公开分享的角色。'}仅包含配装。</p>${session.uploads.map((m,i)=>`<label class="oc-upload-member"><input type="checkbox" data-oc-upload-member="${i}" checked>${image('characters',m.build.characterId,m.name)}<span>${esc(m.name)} · ${m.build.resonanceUnlocked}链</span></label>`).join('')||'<p>当前队伍没有已选角色，请先选择角色。</p>'}<label class="oc-field">配装名称<input data-oc-title maxlength="60" value="${esc(updating?.title||session.uploads.map(m=>m.name).join(' / ')+' · 配装')}"></label><label class="oc-field">说明（选填）<textarea data-oc-description maxlength="300" rows="2">${esc(updating?.description||'')}</textarea></label><footer><span>审核通过后其他玩家可用</span><button type="button" class="oc-primary" data-oc-submit ${session.uploads.length?'':'disabled'}>提交审核</button></footer>`);status('');
  }
  async function submit() {
    if(session.uploadOwner!==owner())throw Error('账号已切换，请重新打开');const indexes=[...overlay.querySelectorAll('[data-oc-upload-member]:checked')].map(el=>Number(el.dataset.ocUploadMember));if(!indexes.length||indexes.length>3)throw Error('请选择1至3名角色');const title=overlay.querySelector('[data-oc-title]').value.trim(),description=overlay.querySelector('[data-oc-description]').value.trim();if(!title)throw Error('请输入配装名称');const bundle={schemaVersion:1,members:indexes.map(i=>session.uploads[i].build)},fingerprint=JSON.stringify({title,description,bundle});if(session.uploadIntent?.fingerprint!==fingerprint)session.uploadIntent={fingerprint,requestId:crypto.randomUUID()};
    const current=session,root=overlay,updating=current.updating;controls(true);status('正在提交…');try {const data=await api('/my/public-builds'+(updating?'/'+updating.id:''),{method:updating?'PUT':'POST',auth:true,body:{title,description,bundle,...(updating?{revision:updating.revision}:{requestId:current.uploadIntent.requestId})}});if(overlay!==root)return;if(current.uploadOwner!==owner())throw Error('账号已切换，请重新查看我的分享');if(updating)current.updating={...updating,revision:data.revision};status('已提交审核，分享码：'+data.code);}catch(error){if(overlay===root)status(error.message,true);}finally{if(overlay===root)controls(false);}
  }
  const statusNames={pending:'待审核',approved:'已公开',rejected:'未通过',withdrawn:'已下架'};
  async function manage(review=false) {
    if(!login())return;session.page=review?'review':'mine';const root=overlay,epoch=++requestEpoch,account=owner();body('<p>正在读取…</p>');status('');try{const data=await api(review?'/admin/public-builds':'/my/public-builds',{auth:true});if(overlay!==root||epoch!==requestEpoch)return;if(account!==owner())throw Error('账号已切换，请重新打开');session.managementOwner=account;session.managed=data.items;body(data.items.map(row=>`<article class="oc-managed"><strong>${esc(row.title)}</strong><small>${esc(row.characterIds.map(id=>role(id)?.name||id).join(' / '))} · ${esc(statusNames[row.status])} · ${esc(row.code)}</small>${row.reason?`<p>${esc(row.reason)}</p>`:''}${review?row.bundle.members.map(detailsHtml).join(''):''}<div class="oc-managed-actions">${review?`<button type="button" data-oc-review="${row.id}" data-approved="true" ${flags.readOnly?'disabled':''}>通过</button><button type="button" data-oc-review="${row.id}" data-approved="false" ${flags.readOnly?'disabled':''}>驳回</button><input data-oc-reason="${row.id}" aria-label="驳回原因" maxlength="200" placeholder="驳回原因（选填）">`:`<button type="button" data-oc-copy="${row.id}">复制分享码</button><button type="button" data-oc-update="${row.id}" ${flags.readOnly?'disabled':''}>更新配装</button><button type="button" data-oc-withdraw="${row.id}" ${flags.readOnly||row.status==='withdrawn'?'disabled':''}>下架</button>`}</div></article>`).join('')||'<p>暂无配装记录</p>');}catch(error){if(overlay===root&&epoch===requestEpoch){body('<button type="button" data-oc-refresh-managed>重新读取</button>');status(error.message,true);}}
  }
  async function mutateManaged(button) {
    if(session.managementOwner!==owner())throw Error('账号已切换，请重新打开');const id=button.dataset.ocWithdraw||button.dataset.ocReview,row=session.managed.find(r=>r.id===id);if(!row)return;if(button.hasAttribute('data-oc-withdraw')&&!confirm('下架「'+row.title+'」？已导入的配装副本不受影响。'))return;
    const review=button.hasAttribute('data-oc-review'),approved=button.dataset.approved==='true',reason=review?overlay.querySelector(`[data-oc-reason="${id}"]`).value.trim():'';const root=overlay;controls(true);status('正在处理…');try{await api((review?'/admin/public-builds/':'/my/public-builds/')+id+(review?'/review':''),{method:review?'POST':'DELETE',auth:true,body:review?{revision:row.revision,approved,reason}:{revision:row.revision}});if(overlay===root){controls(false);await manage(review);}}catch(error){if(overlay===root)status(error.message,true);}finally{if(overlay===root&&session.busy)controls(false);}
  }
  async function click(button) {
    if(session.busy)return;
    if(button.hasAttribute('data-oc-page')){const page=button.dataset.ocPage;if(page==='upload')uploadPage();else if(page==='mine'||page==='review')await manage(page==='review');else if(session.roles.length)await loadResults();else showPicker();}
    else if(button.hasAttribute('data-oc-role')){const id=button.dataset.ocRole;session.draft=session.draft.includes(id)?session.draft.filter(x=>x!==id):session.draft.length<3?[...session.draft,id]:session.draft;renderPicker(overlay.querySelector('[data-oc-search]').value);}
    else if(button.hasAttribute('data-oc-edit'))showPicker();
    else if(button.hasAttribute('data-oc-find')){session.roles=[...session.draft];session.choices.clear();await loadResults();}
    else if(button.hasAttribute('data-oc-more'))await loadResults(true);
    else if(button.hasAttribute('data-oc-reload'))await loadResults();
    else if(button.hasAttribute('data-oc-retry-open'))await open(session.index);
    else if(button.hasAttribute('data-oc-detail'))await detail(button.dataset.ocDetail);
    else if(button.hasAttribute('data-oc-apply'))await apply();
    else if(button.hasAttribute('data-oc-submit'))await submit();
    else if(button.hasAttribute('data-oc-refresh-managed'))await manage(session.page==='review');
    else if(button.hasAttribute('data-oc-update')){if(session.managementOwner!==owner())throw Error('账号已切换');uploadPage(session.managed.find(r=>r.id===button.dataset.ocUpdate));}
    else if(button.hasAttribute('data-oc-withdraw')||button.hasAttribute('data-oc-review'))await mutateManaged(button);
    else if(button.hasAttribute('data-oc-copy')){const row=session.managed.find(r=>r.id===button.dataset.ocCopy);await navigator.clipboard.writeText(row.code);status('已复制 '+row.code);}
  }
  function mount() {
    mountQueued=false;if(!flags.enabled||!wc()?.Cloud.BuildLoadout)return;document.querySelectorAll('.personal-build-actions').forEach(bar=>{const personal=bar.querySelector('[data-pb-load-open]');if(!personal||bar.querySelector('[data-oc-open]'))return;const pair=document.createElement('span');pair.className='one-click-entry-pair';personal.before(pair);pair.append(personal);const button=document.createElement('button');button.type='button';button.className='one-click-entry';button.dataset.ocOpen=personal.dataset.pbLoadOpen;button.innerHTML='一键配装<span>新</span>';pair.append(button);});
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-oc-open]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();void open(Number(button.dataset.ocOpen));},true);
  wc().Cloud.OneClickBuild=Object.freeze({open});
  fetch('/api/public-builds/config',{cache:'no-store',signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():Promise.reject(Error('config'))).then(value=>{flags=value;mount();new MutationObserver(()=>{if(!mountQueued){mountQueued=true;requestAnimationFrame(mount);}}).observe(document.getElementById('workspaceLayout')||document.body,{childList:true,subtree:true});}).catch(()=>{});
})();



