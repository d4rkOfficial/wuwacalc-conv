/* Chinese / English display adapter. Canonical values and calculation functions are preserved. */
(()=>{'use strict';
const data=window.__WC.localeEnData,dict=data.map,original=new WeakMap(),attrs=new WeakMap(),frameDocs=new WeakSet(),richOriginal=new WeakMap();
const localeParams=new URLSearchParams(location.search),previewTools=false;
const legalDocument=/^\/(privacy|terms|copyright)\.html$/.test(location.pathname),pageTitle=document.title;
let locale=localeParams.get('lang')||localStorage.getItem('wc-locale')||'zh',pending=false,observer;
locale=locale==='en'?'en':'zh';
const keys=Object.keys(dict).filter(k=>/[\u3400-\u9fff]/.test(k)).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(keys.map(s=>s.replace(/[\^$.*+?()[\]{}|\\]/g,'\\$&')).join('|'),'g');
function translate(s){const exact=data.exactMap?.[s.trim()];if(exact)return s.replace(s.trim(),exact);if(dict[s])return dict[s];const out=s.replace(/^副(\d+)([：:]?)$/,'Substat $1$2').replace(/共\s*(\d+)\s*种配置/g,'$1 configurations').replace(/位(\d+)/g,'Slot $1').replace(/已选\s*(\d+)\/(\d+)/g,'Selected $1/$2').replace(/共\s*(\d+)\s*条数据/g,'$1 entries').replace(/更新\s*([\d-]+)\s*·\s*技能(\d+)级倍率\s*·\s*共\s*(\d+)\s*角色\s*·\s*当前\s*(\d+)\s*人/g,'Updated $1 · Skill Lv. $2 · $3 resonators · Showing $4').replace(/更新\s*([\d-]+)\s*·\s*(\d+)\s*把/g,'Updated $1 · $2 weapons').replace(/(\d+)人/g,'$1 characters').replace(/显示\s*(\d+)/g,'Showing $1').replace(/\((\d+)把\)/g,'($1 weapons)').replace(/槽(\d+)/g,'Slot $1').replace(/攻(?=\d)/g,'ATK ').replace(/配装已有\s*(\d+)\s*条/g,'$1 Existing Rolls').replace(/模拟已添加\s*(\d+)\s*条/g,'$1 Simulated Rolls').replace(/还可添加\s*(\d+)\s*条/g,'$1 Rolls Available').replace(/阶段\s*(\d+)/g,'Phase $1').replace(/第\s*(\d+)\s*步\s*\/\s*共\s*(\d+)\s*步/g,'Step $1 / $2').replace(/第\s*(\d+)\s*轮/g,'Round $1').replace(/第\s*(\d+)\s*步/g,'Step $1').replace(/◇\s*(\d+)\s*链\s*◆\s*(\d+)\s*精/g,'S$1 · R$2').replace(/(\d+)\s*链/g,'S$1').replace(/(\d+)\s*层/g,'$1 stacks').replace(pattern,k=>dict[k]).replace(/([a-z])(?=DMG|Crit\.|ATK|DEF|HP|Multiplier|Bonus|Amplification)/g,'$1 ').replace(/(DMG|ATK|DEF|HP)(?=Bonus|Increase|Reduction|Amplification)/g,'$1 ').replace(/\s*·\s*/g,' · ');return /[\u3400-\u9fff]/.test(out)?s:out}
// Legacy saves can omit customName and library identity. Only the four built-in
// starter labels are known defaults; preserve all other unbound catalog names.
const starterNames=new Set(['变奏入场','共鸣技能','重击','共鸣解放']);
function customNames(){
 const names=new Set(),w=window.__WC;if(!w?.state)return names;
 for(const m of w.state.members||[]){
  const customIds=new Set();
  for(const c of m.rotationCatalog||[]){
   const linked=!!w.getEntryLibrarySkillName?.(c);
   const customized=c.customName||(linked?w.isCatalogDisplayNameCustomized?.(c):!starterNames.has(c.name));
   if(customized){names.add(c.name);customIds.add(c.id)}
  }
  for(const s of m.skills||[])if(customIds.has(s.catalogId))names.add(s.name);
 }
 return names;
}
function excluded(el){return !el||el.closest('script,style,textarea,[contenteditable="true"],#locale-preview-toolbar,[data-no-localize],.user-profile-name,.scheme-title,.wall-tile,.pdb-card .card-title,.pdb-card-user-name,.pdb-review-author,.pdb-review-content,.pdb-detail-desc,.pdb-review-dialog-target,.pdb-detail-author,.up2-picker-item-name')}
function paint(){pending=false;if(!document.body)return;observer?.disconnect();const custom=customNames();
const languageBar=document.getElementById('locale-preview-toolbar')||bar;
if(!previewTools&&languageBar){
 const mobile=document.querySelector('#wc-mobile-home');let host;
 if(mobile){host=mobile.querySelector('.locale-mobile-host');if(!host){host=document.createElement('div');host.className='locale-mobile-host';mobile.querySelector('.wc-mh-head')?.insertAdjacentElement('afterend',host);if(!host.parentElement)mobile.prepend(host)}}
 else host=legalDocument?document.querySelector('.page-head')||document.body:document.body.classList.contains('intro-open')?document.body:document.querySelector('.app-topbar-tools')||document.body;
 if(languageBar.parentElement!==host)host.append(languageBar);
}
if(legalDocument)document.title=locale==='en'?translate(pageTitle):pageTitle;
for(const link of document.querySelectorAll('a[href]')){try{const u=new URL(link.getAttribute('href'),location.href);if(u.origin===location.origin&&(/^\/(privacy|terms|copyright)\.html$/.test(u.pathname)||(legalDocument&&u.pathname==='/'))){u.searchParams.set('lang',locale);const href=u.pathname+u.search+u.hash;if(link.getAttribute('href')!==href)link.setAttribute('href',href)}}catch{}}
const docs=[document];for(const frame of document.querySelectorAll('.site-intro-drift-frame')){try{const doc=frame.contentDocument;if(doc?.body){docs.push(doc);if(!frameDocs.has(doc)){frameDocs.add(doc);new MutationObserver(queue).observe(doc.body,{subtree:true,childList:true,characterData:true});}}}catch{}}
for(const doc of docs){
// Buff tooltips split the original sentence into highlighted spans. Translate the whole paragraph,
// retaining its original markup for an exact return to Chinese.
for(const el of doc.querySelectorAll('.wc-tooltip-desc')){
 let info=richOriginal.get(el);const html=el.innerHTML;
 if(!info||html!==info.rendered){const source=[...el.childNodes].map(n=>n.nodeName==='BR'?'\n':n.textContent).join('');info={source,html,rendered:html,whiteSpace:el.style.whiteSpace};richOriginal.set(el,info)}
 const next=locale==='en'?translate(info.source):info.source;
 if(next!==info.source){if(el.textContent!==next)el.textContent=next;el.style.whiteSpace='pre-wrap'}
 else if(info.rendered!==info.html){el.innerHTML=info.html;el.style.whiteSpace=info.whiteSpace}
 info.rendered=el.innerHTML;
}
const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let n;
while(n=walker.nextNode()){if(n.parentElement.matches('.pdb-detail-v')&&/^(轴名称|Rotation Name)$/.test(n.parentElement.previousElementSibling?.textContent?.trim()||''))continue;if(excluded(n.parentElement)||(n.parentElement.matches('.up-scheme-title')||(n.parentElement.matches('.up-nick')&&window.Cloud?.getUser?.())))continue;let info=original.get(n);const current=n.nodeValue;if(!info||current!==info.rendered){info={source:current,rendered:current};original.set(n,info)}
const raw=info.source,trim=raw.trim();if(!trim)continue;
const option=n.parentElement.closest('option');if(option&&!option.hasAttribute('value'))option.setAttribute('value',option.value);
const next=locale==='en'&&!custom.has(trim)?translate(raw):raw;if(n.nodeValue!==next)n.nodeValue=next;info.rendered=next}
for(const el of doc.querySelectorAll('[title],[placeholder],[aria-label]')){if(excluded(el))continue;let record=attrs.get(el);if(!record){record={};attrs.set(el,record)}for(const key of ['title','placeholder','aria-label']){if(!el.hasAttribute(key))continue;const current=el.getAttribute(key);let info=record[key];if(!info||current!==info.rendered)info=record[key]={source:current,rendered:current};const next=locale==='en'&&!custom.has(info.source.trim())?translate(info.source):info.source;if(current!==next)el.setAttribute(key,next);info.rendered=next}}
doc.documentElement.lang=locale==='en'?'en':'zh-CN';}
document.documentElement.lang=locale==='en'?'en':'zh-CN';document.documentElement.dataset.previewLocale=locale;
document.querySelectorAll('#locale-preview-toolbar button[data-locale]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.locale===locale)));
observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
}
function queue(){if(pending)return;pending=true;requestAnimationFrame(paint)}
function setLocale(next){locale=next==='en'?'en':'zh';localStorage.setItem('wc-locale',locale);paint()}
// Browser dialogs are outside the DOM; translate only their message, preserving return values and input defaults.
for(const name of ['alert','confirm','prompt']){const native=window[name].bind(window);window[name]=function(message,...args){return native(locale==='en'?translate(String(message??'')):message,...args)}}
const style=document.createElement('style');style.textContent='#locale-preview-toolbar{position:fixed;z-index:99999;bottom:18px;left:16px;width:158px;box-sizing:border-box;padding:10px;background:#211c22f5;border:1px solid #ad718a;border-radius:12px;color:#f9eff3;font:12px/1.4 system-ui;box-shadow:0 5px 22px #0008}#locale-preview-toolbar strong{display:block;margin-bottom:7px}#locale-preview-toolbar .locale-row{display:flex;gap:5px}#locale-preview-toolbar button{min-height:44px;flex:1;border:1px solid #856274;border-radius:7px;background:#30232c;color:#eee;cursor:pointer}#locale-preview-toolbar button[aria-pressed=true]{background:#d48dac;color:#20121a}#locale-preview-toolbar button:focus-visible{outline:2px solid white;outline-offset:2px}#locale-preview-toolbar small{display:block;margin-top:6px;color:#c8b4c0}html[data-preview-locale=en] .rotation-chip{white-space:normal;overflow-wrap:anywhere;max-width:100%}html[data-preview-locale=en] .axis-skill-label{font-size:11px}html[data-preview-locale=en] .app-sidenav-label{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.2}html[data-preview-locale=en] .skill-type-tab{white-space:normal;line-height:1.3}';
style.textContent+='html[data-preview-locale=en] .weapon-effect-text{max-height:none;overflow:visible}html[data-preview-locale=en] .weapon-pick-name{white-space:normal;overflow-wrap:anywhere;text-overflow:clip;line-height:1.3;min-height:2.6em}';
if(!previewTools)style.textContent+='#locale-preview-toolbar{position:static;z-index:auto;width:auto;padding:0;background:transparent;border:0;box-shadow:none}#locale-preview-toolbar button{min-width:52px;min-height:36px;padding:5px 9px;font-size:12px}';
if(!previewTools)style.textContent+='body.intro-open #locale-preview-toolbar{position:fixed;left:50%;top:18px;bottom:auto;transform:translateX(-50%);z-index:100010;background:#211c22e8;border-radius:8px;padding:4px}';
style.textContent+='@media(max-width:480px){html[data-preview-locale] .app-brand-text{display:none}#locale-preview-toolbar button{min-width:44px;padding:4px 6px}html[data-preview-locale=en] .pdb-chip-btn{white-space:normal}}';
style.textContent+='.locale-mobile-host{display:flex;justify-content:flex-end;padding:4px 20px 0}.locale-mobile-host #locale-preview-toolbar{position:static;transform:none}.page-head:has(#locale-preview-toolbar){flex-wrap:wrap;gap:10px}';
document.head.append(style);
const bar=document.createElement('aside');bar.id='locale-preview-toolbar';bar.setAttribute('aria-label','Preview language');bar.innerHTML='<strong>English preview</strong><div class="locale-row"><button type="button" data-locale="zh">中文</button><button type="button" data-locale="en">English</button></div><button type="button" id="locale-load-demo" style="width:100%;margin-top:7px">Load Changli demo</button><small>Local test · English UI<br>English localization test</small>';if(!previewTools){bar.setAttribute('aria-label','Language');bar.innerHTML='<div class="locale-row"><button type="button" data-locale="zh" lang="zh-CN">中文</button><button type="button" data-locale="en" lang="en">English</button></div>';}
(document.querySelector('.app-topbar-tools')&&!previewTools?document.querySelector('.app-topbar-tools'):document.body).append(bar);
bar.addEventListener('click',e=>{const b=e.target.closest('[data-locale]');if(b)setLocale(b.dataset.locale)});
document.getElementById('locale-load-demo')?.addEventListener('click',async()=>{const button=document.getElementById('locale-load-demo');button.disabled=true;try{const payload=await(await fetch('/english-demo.json')).json();await window.__WC.importWorkspaceFromData(payload);window.SiteIntro?.enter();window.__WC.setWorkspacePhase('axis');window.__WC.render();setLocale('en')}catch(e){button.textContent='Demo failed to load';console.error(e)}finally{button.disabled=false}});
document.addEventListener('load',e=>{if(e.target?.matches?.('.site-intro-drift-frame'))queue()},true);new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['class']});
observer=new MutationObserver(queue);
if(!window.__WC)window.__WC={};window.__WC.localePreview={setLocale,getLocale:()=>locale,translate,matchesSearch:(value,query)=>translate(String(value||'')).toLowerCase().includes(String(query||'').toLowerCase()),refresh:paint};
paint();
})();
