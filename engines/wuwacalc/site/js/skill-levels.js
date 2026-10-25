/* 技能等级：仅依据逐级原表更新倍率，默认10级；Buff/次数/阶段结构保持原值。 */
(() => {
  'use strict';
  const wc=window.__WC,data=wc.skillLevelData,groups=data.groups;
  // 项目永久兼容桥；功能代码仍只访问 __WC，同一对象不复制状态。
  for (const name of ['frostHints', 'skillLevelData', 'skillLevels', 'CardIdentity']) {
    if (!Object.getOwnPropertyDescriptor(window, name)) {
      Object.defineProperty(window, name, { configurable: true, enumerable: true,
        get: () => wc[name], set: value => { wc[name] = value; } });
    }
  }
  const copy=x=>JSON.parse(JSON.stringify(x));
  const lib=x=>x?.librarySkillName||x?.libraryName||'';
  const near=(a,b)=>Number.isFinite(Number(a))&&Math.abs(Number(a)-Number(b))<0.011;
  const comps=x=>(x||[]).map(c=>({rate:Number(c.rate),count:Number(c.count)||1}));
  const sameComps=(a,b)=>a.length===b.length&&a.every((v,i)=>near(v.rate,b[i].rate)&&v.count===b[i].count);
  const settings=m=>m?.skillLevelSettings?.characterId===String(m.characterId)?m.skillLevelSettings.values||{}:{};
  const level=(m,g,values=settings(m))=>Number.isInteger(values[g])&&values[g]>=1&&values[g]<=10?values[g]:10;
  const record=(m,x)=>data.characters[String(m?.characterId)]?.skills[typeof x==='string'?x:lib(x)];
  const at=(m,x,values=settings(m))=>{const r=record(m,x);return r?.levels?.[level(m,r.group,values)-1]||null;};
  function palette(member,items){return(items||[]).map(p=>{const r=record(member,p);if(!r?.levels||p.isTemplateExtra||p.isCustomSkill)return p;const v=at(member,p);return{...p,baseMult:v.baseMult,multComponents:copy(v.multComponents)};});}
  function controls(member){if(!data.characters[String(member?.characterId)])return '';const vals=settings(member);return `<div class="skill-level-controls" aria-label="所属技能等级">${groups.map(g=>`<label>${g}<select data-skill-level-group="${g}" data-skill-level-member="${wc.getMemberIndex(member)}" aria-label="${g}等级">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${level(member,g,vals)===i+1?'selected':''}>${i+1}级</option>`).join('')}</select></label>`).join('')}<small>按所属技能同步全轮次；自定义、锁定及无法还原的旧合并倍率保留。</small></div>`;}
  function badge(member,item){const r=record(member,item);return r?.levels?`<span class="skill-level-badge">${r.group} · Lv.${level(member,r.group)}</span>`:r?.fixed?'<span class="skill-level-badge is-fixed">固定倍率</span>':'';}
  function mergedValue(member,sources,values){return Math.round(sources.reduce((n,s)=>n+(s.fixed?s.baseMult:at(member,s.librarySkillName,values)?.baseMult??s.baseMult)*s.count,0)*100)/100;}
  function mergeSources(member,items){return items.flatMap(item=>{const count=Number(item.multCount)||1;if(item.skillLevelSources?.length&&near(item.baseMult,mergedValue(member,item.skillLevelSources,settings(member))))return item.skillLevelSources.map(s=>({...s,count:s.count*count}));const v=at(member,item);const fixed=!!item.merged||!!item.customStats||!v||!near(item.baseMult,v.baseMult);return[{librarySkillName:lib(item),baseMult:Number(item.baseMult)||0,count,fixed}];});}
  function apply(member,patch){if(!member||!data.characters[String(member.characterId)])throw Error('当前角色没有技能等级数据');for(const[g,v]of Object.entries(patch))if(!groups.includes(g)||!Number.isInteger(v)||v<1||v>10)throw Error('技能等级必须为1–10整数');const old={...settings(member)},next={...old,...patch};const changed=groups.filter(g=>level(member,g,old)!==level(member,g,next));if(!changed.length)return{updated:0,skipped:[]};
    const index=new Map(),patchRefs=new WeakMap(),seen=new WeakSet(),nodes=[];
    const ignored=new Set(['char','buffs','globalBuffActive','globalBuffStacks','echoConfig','weaponSelection','skillLevelSettings','skillLevelSources','frostHintSources','specialSkills','chainBuffStates','results']);
    function collect(x,locked=false){if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);const isLocked=locked||x.locked===true;nodes.push({x,locked:isLocked});if(x.op==='update'&&x.fields)patchRefs.set(x.fields,String(x.key||'').replace(/^(?:id|cat):/,''));if(x.id&&lib(x)&&!index.has(x.id))index.set(x.id,x);for(const[k,v]of Object.entries(x))if(!ignored.has(k)&&k!=='hits')collect(v,isLocked);}
    collect(member);const skipped=new Set();let updated=0;
    for(const {x,locked}of nodes){if(!Number.isFinite(x.baseMult))continue;const ref=index.get(x.catalogId)||index.get(patchRefs.get(x))||x;const name=lib(x)||lib(ref);let r=record(member,name),sources=x.skillLevelSources||ref.skillLevelSources;
      if(!r&&!sources)continue;
      const relevant=sources?sources.some(s=>changed.includes(record(member,s.librarySkillName)?.group)):changed.includes(r.group);if(!relevant)continue;
      if(locked){skipped.add((x.name||name)+'（锁定）');continue;}
      let before,after;
      if(sources?.length){before={baseMult:mergedValue(member,sources,old),multComponents:[]};after={baseMult:mergedValue(member,sources,next),multComponents:[]};}
      else {if(!r?.levels)continue;before=r.levels[level(member,r.group,old)-1];after=r.levels[level(member,r.group,next)-1];if(x.merged||x.customStats){skipped.add(x.name||name);continue;}}
      if(!near(x.baseMult,before.baseMult)){skipped.add(x.name||name);continue;}
      const bc=comps(before.multComponents),ac=comps(after.multComponents),tc=comps(x.multComponents);
      if(tc.length&&!sameComps(tc,bc)){skipped.add((x.name||name)+'（自定义分段）');continue;}
      if(x.split&&x.hits?.length){if(x.hits.length!==bc.length||bc.length!==ac.length||x.hits.some((h,i)=>!near(h.baseMult,bc[i].rate)||Number(h.multCount)!==bc[i].count)){skipped.add((x.name||name)+'（自定义Hit）');continue;}x.hits.forEach((h,i)=>{h.baseMult=ac[i].rate;});}
      x.baseMult=after.baseMult;if(Array.isArray(x.multComponents))x.multComponents=copy(after.multComponents);updated++;
    }
    member.skillLevelSettings={characterId:String(member.characterId),values:next};wc.editUndoStacks?.delete(member.id);return{updated,skipped:[...skipped]};
  }
  // 库街区后续接入使用同一接口；传入官方所属技能类别与整数等级，不推测平台字段。
  function importLevels(member,levels){return apply(member,levels);}
  document.addEventListener('change',event=>{const el=event.target.closest('[data-skill-level-group]');if(!el)return;const member=wc.state.members[Number(el.dataset.skillLevelMember)];try{const result=apply(member,{[el.dataset.skillLevelGroup]:Number(el.value)});wc.computeAll();wc.render();wc.scheduleSave();wc.setCatalogScrollHint(result.skipped.length?`技能等级已更新；${result.skipped.length} 项自定义或锁定倍率保留：${result.skipped.slice(0,3).join('、')}`:'技能等级已同步；倍率按对应等级计算');}catch(error){wc.setCatalogScrollHint(error.message);wc.render();}});
  wc.skillLevels={settings,level,record,at,palette,controls,badge,mergeSources,apply,importLevels,groups};
})();
