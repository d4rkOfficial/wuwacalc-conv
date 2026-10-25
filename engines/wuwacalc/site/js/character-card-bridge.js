/* Single-character export: reads the current engine outputs, never saves a scheme. */
(() => {
  const W = window.__WC;
  let busy = false, batch = null;
  let viewerId = null, viewerProfile = null, viewerTask = null;
  function viewerName() {
    const user = W.Cloud?.getUser?.();
    if (!user) return '未登录';
    const profile = String(user.id) === viewerId ? viewerProfile : null;
    const meta = user.user_metadata || {};
    return profile?.display_name || profile?.nickname || profile?.name || user.display_name || user.nickname || meta.display_name || meta.nickname || meta.full_name || meta.name || meta.username || user.username || user.name || String(user.id || '未署名');
  }
  async function prepareViewer() {
    const user = W.Cloud?.getUser?.(), id = user ? String(user.id) : '';
    if (id !== viewerId) { viewerId = id; viewerProfile = null; viewerTask = null; }
    if (!id || viewerProfile) return false;
    if (!viewerTask) viewerTask = W.Cloud.api('/me/profile', {auth:true}).then(response => {
      if (viewerId !== id) return false;
      viewerProfile = response?.profile || response?.user_metadata || response || {};
      return true;
    }).catch(() => false).finally(() => { if (viewerId === id) viewerTask = null; });
    return viewerTask;
  }
  const num = v => Number(v) || 0;
  const absolute = v => v ? new URL(v, location.href).href : '';
  const echoCache = new Map();
  let echoCatalog=null,echoCatalogTask=null;
  async function prepareAssets(){
    const viewerChanged = await prepareViewer();
    if(echoCatalog)return viewerChanged;
    if(!echoCatalogTask)echoCatalogTask=(async()=>{
      const response=await fetch('echo-catalog.json?v=3c007ba832',{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('声骸图鉴暂不可用');
      const data=await response.json();if(!Array.isArray(data.echoes))throw Error('声骸图鉴格式异常');
      echoCatalog=data.echoes;
    })().catch(error=>{echoCatalogTask=null;throw error;});
    await echoCatalogTask;return true;
  }
  W.CardIdentity = {
    currentName: viewerName,
    author: () => W.cardExportAttribution && !W.cardExportAttribution.personal ? W.cardExportAttribution.author : null,
    usePersonal: () => { if (W.cardExportAttribution) W.cardExportAttribution.personal = true; }
  };
  function echoAppearance(slot){
    const specimen=W.findEchoSpecimen(slot.echoId),name=String(slot.name||'').trim();
    const catalog=echoCatalog?.find(e=>String(e.id)===String(slot.echoId))||echoCatalog?.find(e=>e.name===(specimen?.name||name)&&Number(e.cost)===Number(slot.cost));
    const icon=specimen?.icon?W.nanokaAssetUrl(specimen.icon):catalog?.iconUrl||'';
    return {name:specimen?.name||catalog?.name||name||(slot.echoId?'名称待确认':'未指定声骸'),icon};
  }
  const subKey = sub => sub.id + '|' + (sub.damageType || '');
  const subLabel = sub => sub.damageType || W.ECHO_SUB_AFFIXES[sub.id]?.label || sub.id;
  // Verified from nanoka 3.7 zh character skill_trees (共鸣解放), 2026-10-11.
  // Zero means an explicitly energy-free liberation; unknown IDs stay unknown.
  const liberationCosts = {"1102":100,"1103":175,"1104":125,"1105":125,"1106":100,"1107":125,"1108":125,"1109":0,"1110":175,"1202":150,"1203":125,"1204":125,"1205":125,"1206":175,"1207":125,"1208":125,"1209":175,"1210":125,"1211":125,"1212":125,"1301":125,"1302":125,"1303":125,"1304":150,"1305":125,"1306":125,"1307":150,"1308":125,"1309":125,"1310":125,"1311":125,"1312":125,"1402":100,"1403":150,"1404":125,"1405":150,"1406":150,"1407":125,"1408":150,"1409":125,"1410":125,"1411":125,"1412":125,"1413":125,"1501":125,"1502":125,"1503":175,"1504":125,"1505":175,"1506":125,"1507":125,"1508":125,"1509":125,"1510":125,"1511":125,"1601":125,"1602":100,"1603":125,"1604":125,"1605":125,"1606":125,"1607":125,"1608":0,"1610":125};
  const energyCache = new Map();
  function energyStatus(index, requestedRound){
    const m=W.state.members[index],cost=liberationCosts[String(m.characterId)];
    const cycles=m.results?.cycleMode?m.results.cycles:[],count=cycles?.length||0;
    const roundCount=count||1,defaultRound=Math.min(roundCount,Math.max(1,(m.cycleConfig?.activeRound||0)+1));
    const selectedRound=Number.isInteger(requestedRound)&&requestedRound>=1&&requestedRound<=roundCount?requestedRound:defaultRound;
    const efficiency=Number(cycles?.[selectedRound-1]?.energyRegenPct)||W.getMemberEnergyRegenPct(m);
    const rounds=count?cycles.map((cycle,i)=>({round:i+1,value:W.computeRoundTotalEnergy(m,i)})):[{round:1,value:W.computeMemberTotalEnergy(m)}];
    const value=rounds[selectedRound-1].value;
    const basis={efficiency,rounds,roundCount,selectedRound,value,roundAdjusted:requestedRound!=null&&requestedRound!==selectedRound};
    if(cost===undefined)return {...basis,status:'unknown',message:'大招能量需求待确认'};
    if(cost===0)return {...basis,status:'not-required',cost,message:'大招不消耗共鸣能量，可优先考虑输出词条'};
    if(!Number.isFinite(value))return {...basis,status:'unknown',cost,message:'方案回能数据待确认'};
    const status=value<cost?'deficit':value<=cost+5?'minimum':'safe';
    const message=status==='deficit'?'回能不足，优先补足共鸣效率':status==='minimum'?'当前共鸣效率已达到最低要求，实战建议再提升5%共鸣效率':'当前共鸣效率已达安全范围，可进一步优先考虑输出词条';
    return {...basis,status,cost,message};
  }
  async function energyAdvice(index, requestedRound, onProgress, liveScene){
    const s=W.state,real={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
    const original=structuredClone(real),energy=energyStatus(index,requestedRound),round=energy.selectedRound;
    if(liveScene)Object.assign(s,liveScene);
    const fingerprint=W.echoFingerprintState();
    if(energy.status!=='deficit')return energy;
    const measure=async extra=>{
      if(s._exportCalcAborted)throw Error('已取消计算');
      onProgress?.('计算第'+round+'轮需要补充的共鸣效率');
      await new Promise(resolve=>setTimeout(resolve,0));
      if(s._exportCalcAborted)throw Error('已取消计算');
      if(!sameInputs(fingerprint,W.echoFingerprintState()))throw Error('方案已变化，请重新预览后再选择轮次');
      const live={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
      try{
        Object.assign(s,structuredClone(original));
        const m=s.members[index],chars=new Set([m.char,...(m.cycleConfig?.rounds||[]).map(r=>r.char)].filter(Boolean));
        for(const char of chars)char.energyRegenPctSources=(char.energyRegenPctSources||[]).concat({id:'card_energy_trial',name:'充能缺口试算',value:extra});
        W.refreshRuntimeConvertedTeamBuffs();W.computeAll();return energyStatus(index,round);
      }finally{Object.assign(s,live);W.invalidateMergedTemplateMap?.();}
    };
    let low=0,high=5,test=await measure(high);
    while(test.value<energy.cost&&high<2560){high*=2;test=await measure(high);}
    if(test.value>=energy.cost){
      while(high-low>.05){const mid=(low+high)/2,result=await measure(mid);if(result.value>=energy.cost)high=mid;else low=mid;}
      let extra=Math.ceil((high-1e-9)*10)/10,verified=await measure(extra);
      if(extra>=.1){const previous=Number((extra-.1).toFixed(1)),testPrevious=await measure(previous);if(testPrevious.value>=energy.cost){extra=previous;verified=testPrevious;}}
      if(verified.value>=energy.cost){energy.additionalEfficiency=extra;energy.targetEfficiency=energy.efficiency+extra;energy.verifiedValue=verified.value;}
    }
    return energy;
  }
  async function calculateEnergy(index,round){
    if(busy||batch||document.getElementById('exportCardCalcOverlay')||W.state._bootReconciling)throw Error('已有计算正在进行，请稍后再试');
    busy=true;
    const s=W.state,fp=W.echoFingerprintState(),real={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
    try{
      let scene,selected;
      try{
        Object.assign(s,structuredClone(real));W.computeAll();
        scene={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
        selected=energyStatus(index,round);
      }finally{Object.assign(s,real);}
      s._exportCalcAborted=false;
      // Each trial restores live objects before yielding to other UI events.
      const cached=energyCache.get(index);
      if(sameInputs(cached?.fp,fp)&&cached.data.selectedRound===selected.selectedRound)return {...cached.data,roundAdjusted:selected.roundAdjusted};
      Object.assign(s,scene);
      let task;
      try{task=energyAdvice(index,round,undefined,real);}finally{Object.assign(s,real);}
      const data=await task;
      if(!sameInputs(fp,W.echoFingerprintState()))throw Error('方案已变化，请重新预览后再选择轮次');
      energyCache.set(index,{fp,data});return data;
    }finally{W.invalidateMergedTemplateMap?.();busy=false;}
  }
  function primaryPanel(member){
    // Explicit conversions also cover characters whose damage is formally ATK
    // scaling after converting HP, so damage scale alone is insufficient.
    let kind=({'1110':'hp','1409':'hp','1505':'hp','1212':'hp','1601':'def'})[String(member.characterId)];
    if(!kind){const weights=W.EchoSubSim.buildInputFromMember(member)?.basePanel?.scaleWeights||{};kind=weights.hp>weights.atk&&weights.hp>=weights.def?'hp':weights.def>weights.atk&&weights.def>weights.hp?'def':'atk';}
    return kind==='hp'?['生命',Math.round(W.getFinalHp(member.char,member)).toLocaleString('en-US')]:kind==='def'?['防御',Math.round(W.getFinalDef(member.char,member)).toLocaleString('en-US')]:['攻击',Math.round(W.getFinalAtk(member.char,member)).toLocaleString('en-US')];
  }
  const referenceStoreKey='wuwacalc_character_card_references_v1';
  let references=[];
  try { const saved=JSON.parse(localStorage.getItem(referenceStoreKey)||'[]');if(Array.isArray(saved))references=saved.filter(row=>row&&typeof row.key==='string'&&row.data&&(row.kind==='full'||row.kind==='single')).slice(-12); } catch (_) {}
  const readReference=(kind,key)=>references.find(row=>row.kind===kind&&row.key===key)?.data;
  function saveReference(kind,key,data){
    references=references.filter(row=>row.kind!==kind||row.key!==key);
    references.push({kind,key,data});references=references.slice(-12);
    try {localStorage.setItem(referenceStoreKey,JSON.stringify(references));}catch(_){}
  }
  function syncEchoPanels(member){
    W.syncEchoLoadout(member);const char=member.char;
    try {for(const round of member.cycleConfig?.enabled?member.cycleConfig.rounds:[])if(round?.char){member.char=round.char;W.syncEchoToCharacterPanel(member);}}
    finally {member.char=char;}
  }
  function stableInputs(fp){
    const inputs=JSON.parse(fp),special=inputs.specialSkills;
    // Shadow scoring may regenerate slot IDs; preserve slot identity and item ownership.
    const slotIds=new Map((special?.characters||[]).map((character,index)=>[character.id,'slot:'+index]));
    if(special?.characters)special.characters=special.characters.map((character,index)=>({...character,id:'slot:'+index}));
    for(const member of inputs.members||[]){
      const element=W.getMemberElementLabel(member);
      for(const row of [member,...(member.cycleConfig?.rounds||[])])for(const source of row.char?.attrBonusSources||[]){
        source.element=W.parseAttrSourceElement(source)||element;
      }
    }
    return JSON.stringify(inputs,(key,value)=>{
      if(key==='characterId'&&slotIds.has(value))return slotIds.get(value);
      if(['_damage','_breakdown','_hitBreakdowns','_cycleDamages','_cycleTotal','_cycleRounds'].includes(key))return undefined;
      // Only additive source order is immaterial; never reorder the skill axis.
      if(key.endsWith('Sources')&&Array.isArray(value))return value.map(({locked,...source})=>{if(Number(source.value)===0)delete source.element;return source;}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
      return value;
    });
  }
  const sameInputs=(a,b)=>a===b||!!(a&&b&&stableInputs(a)===stableInputs(b));
  function mechanismPool(member,pool){
    // A type bonus is read only for the unit's primary and additional types.
    // Inspect every round, catalog and hit, including zero-damage entries. Do
    // not infer HP/DEF/ER independence from damage weights or a zero probe:
    // conversion and threshold mechanics can make those stats useful together.
    const types=new Set();let uncertain=false;
    const unit=(row,parent)=>{
      if(!row||typeof row!=='object'){uncertain=true;return;}
      const primary=W.getUnitDamageType(row,parent);
      if(!primary)uncertain=true;
      if(primary)types.add(primary);
      for(const type of W.getUnitAlsoDamageTypes(row,parent,member)||[])types.add(type);
      for(const hit of row.hits||[])unit(hit,row);
    };
    try {
      for(const round of [member,...(member.cycleConfig?.rounds||[])]){
        const view=round.resonanceAxis?W.buildResonanceAxisView(round.resonanceAxis,'damage'):null;
        for(const source of [round,view].filter(Boolean)){
          for(const row of source.rotationCatalog||[])unit(row,null);
          for(const phase of source.phases||[])for(const row of phase.skills||[])unit(row,null);
        }
      }
    } catch(_){uncertain=true;}
    return uncertain||!types.size?pool:pool.filter(sub=>sub.id!=='sub_type_dmg'||types.has(sub.damageType));
  }
  async function referenceKeys(index){
    const s=W.state,real={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
    const signature=W.exportBaselineSearchProfile(real.members).signature;
    const normalized=indices=>{
      try {
        Object.assign(s,structuredClone(real));
        for(const i of indices){s.members[i].echoConfig.slots.forEach(slot=>slot.subs=[]);syncEchoPanels(s.members[i]);}
        W.refreshRuntimeConvertedTeamBuffs();W.computeAll();
        return stableInputs(W.echoFingerprintState());
      } finally {Object.assign(s,real);W.invalidateMergedTemplateMap?.();}
    };
    const engine=[...document.scripts].map(script=>script.src).filter(src=>/\/(?:js\/(?:core|ui|buff-templates|matrix-buffs|character-card-bridge)|round-sync|matrix-row-batch)\.js\?/.test(src)).map(src=>new URL(src).pathname+new URL(src).search).sort();
    const full=JSON.stringify({engine,signature,scene:normalized(real.members.map((_,i)=>i))});
    const single=JSON.stringify({engine,index,scene:normalized([index])});
    // Hash only after restoring the live scene: crypto yields to the browser.
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
    return {full:await hash(full),single:await hash(single)};
  }
  // A shared, empty-substat reference makes slot-to-slot comparisons meaningful.
  // Recommendations instead keep the other four equipped pieces intact.
  async function scoreEchoes(index, onProgress, referenceKey, forceExact = false) {
    const s=W.state, real={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
    const original=structuredClone(real), slots=original.members[index].echoConfig.slots;
    const started=performance.now();let lastYield=started,evaluations=0;
    const attach=value=>Object.assign(s,value);
    const checkpoint=async stage=>{
      if(s._exportCalcAborted)throw Error('已取消计算');
      if(performance.now()-started>180000)throw Error('声骸评分超过 3 分钟，已停止并恢复方案');
      if(performance.now()-lastYield<100)return;
      const trial={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
      attach(real);onProgress?.(stage+' · 已校验 '+evaluations+' 组词条');
      try { await new Promise(resolve=>{const ch=new MessageChannel();ch.port1.onmessage=()=>{ch.port1.close();ch.port2.close();resolve();};ch.port2.postMessage(null);}); }
      finally { attach(trial); }
      lastYield=performance.now();if(s._exportCalcAborted)throw Error('已取消计算');
    };
    const install=config=>{
      attach(structuredClone(original));const m=s.members[index];m.echoConfig=structuredClone(config);
      syncEchoPanels(m);
      W.refreshRuntimeConvertedTeamBuffs();W.computeAll();return m;
    };
    const flat=config=>config.slots.flatMap((slot,slotIndex)=>(slot.subs||[]).map(sub=>({...sub,slotIndex})));
    const actualConfig=original.members[index].echoConfig, empty=structuredClone(actualConfig);
    empty.slots.forEach(slot=>slot.subs=[]);
    const pool=Object.entries(W.ECHO_SUB_AFFIXES).flatMap(([id,def])=>(def.needsDamageType?W.ECHO_SUB_TYPE_DAMAGE_TYPES:['']).map(damageType=>({id,damageType,value:Math.max(...def.rolls)})));
    const candidates=mechanismPool(original.members[index],pool);
    const exactMode=forceExact||readReference('single',referenceKey)?.exactMode===true;
    const memo=new Map(),convertedScenes=new Map();
    let commonScene;
    const converter=String(original.members[index].characterId)===W.SUISUI_CHAR_ID?W.syncSuisuiOutroErConvert:
      String(original.members[index].characterId)===W.SHOREKEEPER_CHAR_ID?W.syncShorekeeperStarErConvert:null;
    const evaluateFast=(member,subs)=>{
      if(!converter)return W.EchoSubSim.evaluateSubstats(member,subs);
      // This scoring reference has no substats. Only ER changes these two
      // engine-owned conversions; share their prepared mirrors across trials.
      const extraEr=subs.reduce((total,sub)=>total+(sub.id==='sub_energy_regen'?num(sub.value):0),0);
      if(!convertedScenes.has(extraEr)){
        const scene=structuredClone(commonScene);attach(scene);
        const trial=scene.members[index],char=trial.char;
        try{
          trial.char=structuredClone(char);
          trial.char.energyRegenPctSources=(trial.char.energyRegenPctSources||[]).concat({id:'card_conversion_trial',name:'评分效率试算',value:extraEr});
          converter(trial);
        }finally{trial.char=char;}
        convertedScenes.set(extraEr,scene);
      }
      const scene=convertedScenes.get(extraEr);attach(scene);
      // Keep baseline panels/config: evaluateSubstats applies each candidate
      // delta once. Only the derived Buff mirrors above use the trial ER.
      return W.EchoSubSim.evaluateSubstats(scene.members[index],subs);
    };
    const evaluate=async(member,subs,stage)=>{
      await checkpoint(stage);evaluations++;
      let damage;
      if(exactMode){
        const config=structuredClone(empty);
        for(const sub of subs)config.slots[sub.slotIndex||0].subs.push({...sub});
        damage=num(install(config).results?.total);
      }else damage=evaluateFast(member,subs);
      if(!Number.isFinite(damage))throw Error('声骸词条结算异常，请重新计算');
      return damage;
    };
    try {
      const common=install(empty);
      commonScene={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
      const baseline=await evaluate(common,[],'建立统一评分基准');
      const tolerance=Math.max(.1,Math.abs(baseline)*1e-7);
      if(Math.abs(baseline-num(common.results?.total))>tolerance){
        if(!exactMode){attach(real);return await scoreEchoes(index,onProgress,referenceKey,true);}
        throw Error('声骸评分基准与技能轴结算不一致');
      }
      const stored=readReference('single',referenceKey);
      const reference=stored&&!!stored.exactMode===exactMode&&Number.isFinite(stored.ideal)&&Math.abs(stored.baseline-baseline)<=tolerance&&Array.isArray(stored.subs)?structuredClone(stored):null;
      const commonEval=async subs=>{
        const key=subs.map(x=>subKey(x)+':'+x.value).sort().join(',');
        if(!memo.has(key))memo.set(key,await evaluate(common,subs.map(x=>({...x,slotIndex:0})),'计算单张声骸评分'));
        return memo.get(key);
      };
      // Dependency probes do not form a scoring reference. Distribute them across
      // legal-sized slots, avoiding the engine's five-substats-per-slot truncation.
      let best=reference?{damage:reference.ideal,subs:reference.subs}:{damage:baseline,subs:[]};
      if(!reference){
      const all=candidates.map((sub,i)=>({...sub,slotIndex:Math.floor(i/5)}));
      const allDamage=await evaluate(common,all,'筛选本角色有效词条');
      const relevant=[];
      for(const sub of candidates){
        const single=await commonEval([sub]);
        const without=await evaluate(common,all.filter(x=>subKey(x)!==subKey(sub)),'筛选本角色有效词条');
        if(Math.abs(single-baseline)>tolerance || Math.abs(allDamage-without)>tolerance)relevant.push(sub);
      }
      // Search all distinct five-affix combinations in the effective pool. Never
      // compare to the other four actual pieces, or to a different COST baseline.
      const visit=async(start,chosen)=>{
        if(chosen.length===Math.min(5,relevant.length)){
          const damage=await commonEval(chosen);if(damage>best.damage)best={damage,subs:chosen.slice()};return;
        }
        for(let j=start;j<=relevant.length-(Math.min(5,relevant.length)-chosen.length);j++)await visit(j+1,[...chosen,relevant[j]]);
      };
      await visit(0,[]);
      }
      const gainCache=reference?.gains||{};
      const gainKey=subs=>subs.map(x=>subKey(x)+':'+Number(x.value)).sort().join(',');
      const gains=[];
      for(const slot of slots){
        const subs=slot.subs||[],keys=subs.map(subKey);
        if(subs.length>5||new Set(keys).size!==keys.length||subs.some(sub=>!pool.some(p=>subKey(p)===subKey(sub)&&Number.isFinite(Number(sub.value))&&sub.value>=0&&sub.value<=p.value))) {
          gains.push(null);continue;
        }
        const hit=gainCache[gainKey(subs)];
        gains.push(Number.isFinite(hit)?hit:await commonEval(subs)-baseline);
      }
      if(!reference){
      const idealConfig=structuredClone(empty);idealConfig.slots[0].subs=structuredClone(best.subs);
      const exactIdeal=num(install(idealConfig).results?.total);
      if(Math.abs(exactIdeal-best.damage)>Math.max(tolerance,Math.abs(exactIdeal)*1e-7)){
        if(!exactMode){attach(real);onProgress?.('转为完整结算校准评分');return await scoreEchoes(index,onProgress,referenceKey,true);}
        throw Error('声骸评分词条模拟与引擎不一致');
      }
      }
      const denominator=best.damage-baseline;
      for(let i=0;i<slots.length;i++)if(gains[i]!==null){
        const key=gainKey(slots[i].subs||[]);if(Number.isFinite(gainCache[key]))continue;
        const cfg=structuredClone(empty);cfg.slots[0].subs=structuredClone(slots[i].subs||[]);
        const exact=num(install(cfg).results?.total)-baseline;
        if(Math.abs(exact-gains[i])>tolerance){
          if(!exactMode){attach(real);onProgress?.('转为完整结算校准评分');return await scoreEchoes(index,onProgress,referenceKey,true);}
          gains[i]=null;
        }
        else gainCache[key]=gains[i];
      }
      const ratings=gains.map(gain=>({score:gain===null||denominator<=tolerance||gain>denominator+tolerance?null:Math.max(0,Math.min(100,100*gain/denominator))}));
      // Energy and marginal recommendations use the actual equipped scene.
      await checkpoint('读取词条模拟边际收益');
      const current=install(actualConfig),input=W.EchoSubSim.buildInputFromMember(current);
      const marginalData=W.EchoSubSim.calcRealMargins(current,{subs:input.subs,mains:input.mains,memberIndex:index,critDmgStep:2});
      const marginalPriority=Object.entries({...marginalData.margins,...marginalData.typeMargins})
        .filter(([,item])=>Number.isFinite(item.liftPct)&&item.liftPct>1e-4)
        .sort((a,b)=>b[1].liftPct-a[1].liftPct)
        .map(([key,item])=>({key,label:item.label,step:item.step,liftPct:item.liftPct,unit:key==='flatAtk'?'点':'%'}));
      await checkpoint('边际收益已更新');
      saveReference('single',referenceKey,{baseline,ideal:best.damage,subs:best.subs,exactMode,gains:Object.fromEntries(Object.entries(gainCache).slice(-40))});
      return {ratings,marginalPriority,marginalData,baseline,ideal:best.damage,idealSubs:best.subs.map(subLabel),exactMode,referenceCached:!!reference,mechanismExcluded:pool.filter(sub=>!candidates.includes(sub)).map(subLabel),evaluations,milliseconds:performance.now()-started};
    } finally {attach(real);W.invalidateMergedTemplateMap?.();}
  }
  // Static icon paths for the published character catalog, ordered by skill group.
  const cardSkillGroups=["常态攻击","共鸣技能","共鸣回路","共鸣解放","变奏技能"];
  const cardSkillIcons={"1102":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconSanhua/SP_IconSanhuaB1.webp","assets/character-card/skills/SkillIconSanhua/SP_IconSanhuaY.webp","assets/character-card/skills/SkillIconSanhua/SP_IconSanhuaC1.webp","assets/character-card/skills/SkillIconSanhua/SP_IconSanhuaQTE.webp"],"1103":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconBailian/SP_IconBailianB1.webp","assets/character-card/skills/SkillIconBailian/SP_IconBailianY.webp","assets/character-card/skills/SkillIconBailian/SP_IconBailianC1.webp","assets/character-card/skills/SkillIconBailian/SP_IconBailianQTE.webp"],"1104":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconLingyang/SP_IconLingyangB1.webp","assets/character-card/skills/SkillIconLingyang/SP_IconLingyangY.webp","assets/character-card/skills/SkillIconLingyang/SP_IconLingyangC1.webp","assets/character-card/skills/SkillIconLingyang/SP_IconLingyangQTE.webp"],"1105":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconZhezhi/SP_IconZhezhiB1.webp","assets/character-card/skills/SkillIconZhezhi/SP_IconZhezhiY.webp","assets/character-card/skills/SkillIconZhezhi/SP_IconZhezhiC1.webp","assets/character-card/skills/SkillIconZhezhi/SP_IconZhezhiQTE.webp"],"1106":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconYouhu/SP_IconYouhuB4.webp","assets/character-card/skills/SkillIconYouhu/SP_IconYouhuY.webp","assets/character-card/skills/SkillIconYouhu/SP_IconYouhuC1.webp","assets/character-card/skills/SkillIconYouhu/SP_IconYouhuQTE.webp"],"1107":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconKelaita/SP_IconKelaitaB1.webp","assets/character-card/skills/SkillIconKelaita/SP_IconKelaitaY.webp","assets/character-card/skills/SkillIconKelaita/SP_IconKelaitaC1.webp","assets/character-card/skills/SkillIconKelaita/SP_IconKelaitaQTE.webp"],"1108":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconFeixue/SP_IconFeixueB1.webp","assets/character-card/skills/SkillIconFeixue/SP_IconFeixueY.webp","assets/character-card/skills/SkillIconFeixue/SP_IconFeixueC1.webp","assets/character-card/skills/SkillIconFeixue/SP_IconFeixueQTE.webp"],"1109":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconLuosela/SP_SkillIconLuoselaB1.webp","assets/character-card/skills/SkillIconLuosela/SP_SkillIconLuoselaY.webp","assets/character-card/skills/SkillIconLuosela/SP_SkillIconLuoselaC1.webp","assets/character-card/skills/SkillIconLuosela/SP_SkillIconLuoselaQTE.webp"],"1110":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconSuisui/SP_IconSuisuiB1.webp","assets/character-card/skills/SkillIconSuisui/SP_IconSuisuiY.webp","assets/character-card/skills/SkillIconSuisui/SP_IconSuisuiC1.webp","assets/character-card/skills/SkillIconSuisui/SP_IconSuisuiQTE.webp"],"1202":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconMaxiaofang/SP_IconMaxiaofangB1.webp","assets/character-card/skills/SkillIconMaxiaofang/SP_IconMaxiaofangY.webp","assets/character-card/skills/SkillIconMaxiaofang/SP_IconMaxiaofangC1.webp","assets/character-card/skills/SkillIconMaxiaofang/SP_IconMaxiaofangQTE.webp"],"1203":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconAnke/SP_IconAnkeB1.webp","assets/character-card/skills/SkillIconAnke/SP_IconAnkeY.webp","assets/character-card/skills/SkillIconAnke/SP_IconAnkeC1.webp","assets/character-card/skills/SkillIconAnke/SP_IconAnkeQTE.webp"],"1204":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconMotefei/SP_IconMotefeiB1.webp","assets/character-card/skills/SkillIconMotefei/SP_IconMotefeiY.webp","assets/character-card/skills/SkillIconMotefei/SP_IconMotefeiC1.webp","assets/character-card/skills/SkillIconMotefei/SP_IconMotefeiQTE.webp"],"1205":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconChangli/SP_IconChangliB1.webp","assets/character-card/skills/SkillIconChangli/SP_IconChangliY.webp","assets/character-card/skills/SkillIconChangli/SP_IconChangliC1.webp","assets/character-card/skills/SkillIconChangli/SP_IconChangliQTE.webp"],"1206":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconBulante/SP_IconBulanteB1.webp","assets/character-card/skills/SkillIconBulante/SP_IconBulanteY.webp","assets/character-card/skills/SkillIconBulante/SP_IconBulanteC1.webp","assets/character-card/skills/SkillIconBulante/SP_IconBulanteQTE.webp"],"1207":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconLupa/SP_IconLupaB1.webp","assets/character-card/skills/SkillIconLupa/SP_IconLupaY.webp","assets/character-card/skills/SkillIconLupa/SP_IconLupaC1.webp","assets/character-card/skills/SkillIconLupa/SP_IconLupaQTE.webp"],"1208":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconJiaBeiLiNa/SP_IconJiaBeiLiNaB1.webp","assets/character-card/skills/SkillIconJiaBeiLiNa/SP_IconJiaBeiLiNaY.webp","assets/character-card/skills/SkillIconJiaBeiLiNa/SP_IconJiaBeiLiNaC1.webp","assets/character-card/skills/SkillIconJiaBeiLiNa/SP_IconJiaBeiLiNaQTE.webp"],"1209":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconMoNing/SP_IconMoNingB1.webp","assets/character-card/skills/SkillIconMoNing/SP_IconMoNingY1.webp","assets/character-card/skills/SkillIconMoNing/SP_IconMoNingC1.webp","assets/character-card/skills/SkillIconMoNing/SP_IconMoNingQTE.webp"],"1210":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconAimisi/SP_IconAimisiB1.webp","assets/character-card/skills/SkillIconAimisi/SP_IconAimisiY.webp","assets/character-card/skills/SkillIconAimisi/SP_IconAimisiC1.webp","assets/character-card/skills/SkillIconAimisi/SP_IconAimisiQTE.webp"],"1211":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconDaniya/SP_IconDaniyaB1.webp","assets/character-card/skills/SkillIconDaniya/SP_IconDaniyaY.webp","assets/character-card/skills/SkillIconDaniya/SP_IconDaniyaC1.webp","assets/character-card/skills/SkillIconDaniya/SP_IconDaniyaQTE.webp"],"1212":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconJingran/SP_IconJingranB1.webp","assets/character-card/skills/SkillIconJingran/SP_IconJingranY.webp","assets/character-card/skills/SkillIconJingran/SP_IconJingranC1.webp","assets/character-card/skills/SkillIconJingran/SP_IconJingranQTE.webp"],"1301":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconKakaluo/SP_IconKakaluoB1.webp","assets/character-card/skills/SkillIconKakaluo/SP_IconKakaluoY.webp","assets/character-card/skills/SkillIconKakaluo/SP_IconKakaluoC1.webp","assets/character-card/skills/SkillIconKakaluo/SP_IconKakaluoQTE.webp"],"1302":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconYinlin/SP_IconYinlinB1.webp","assets/character-card/skills/SkillIconYinlin/SP_IconYinlinY.webp","assets/character-card/skills/SkillIconYinlin/SP_IconYinlinC1.webp","assets/character-card/skills/SkillIconYinlin/SP_IconYinlinQTE.webp"],"1303":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconYuanwu/SP_IconYuanwuB1.webp","assets/character-card/skills/SkillIconYuanwu/SP_IconYuanwuY.webp","assets/character-card/skills/SkillIconYuanwu/SP_IconYuanwuC1.webp","assets/character-card/skills/SkillIconYuanwu/SP_IconYuanwuQTE.webp"],"1304":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconJinxi/SP_IconJinxiB1.webp","assets/character-card/skills/SkillIconJinxi/SP_IconJinxiY.webp","assets/character-card/skills/SkillIconJinxi/SP_IconJinxiC1.webp","assets/character-card/skills/SkillIconJinxi/SP_IconJinxiQTE.webp"],"1305":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconXiangliyao/SP_IconXiangliyaoB1.webp","assets/character-card/skills/SkillIconXiangliyao/SP_IconXiangliyaoY.webp","assets/character-card/skills/SkillIconXiangliyao/SP_IconXiangliyaoC1.webp","assets/character-card/skills/SkillIconXiangliyao/SP_IconXiangliyaoQTE.webp"],"1306":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconAogusita/SP_IconAogusitaB3.webp","assets/character-card/skills/SkillIconAogusita/SP_IconAogusitaY.webp","assets/character-card/skills/SkillIconAogusita/SP_IconAogusitaC2.webp","assets/character-card/skills/SkillIconAogusita/SP_IconAogusitaQTE.webp"],"1307":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconBuling/SP_IconBulingB1.webp","assets/character-card/skills/SkillIconBuling/SP_IconBulingC2.webp","assets/character-card/skills/SkillIconBuling/SP_IconBulingC1.webp","assets/character-card/skills/SkillIconBuling/SP_IconBulingQTE.webp"],"1308":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconLibeika/SP_IconLibeikaB1.webp","assets/character-card/skills/SkillIconLibeika/SP_IconLibeikaY.webp","assets/character-card/skills/SkillIconLibeika/SP_IconLibeikaC1.webp","assets/character-card/skills/SkillIconLibeika/SP_IconLibeikaQTE.webp"],"1309":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuA1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuY1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuC1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuQTE.webp"],"1310":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuA1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuY1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuC1.webp","assets/character-card/skills/SkillIconThunderzhu/SP_IconThunderzhuQTE.webp"],"1311":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconXin/SP_IconXinB1.webp","assets/character-card/skills/SkillIconXin/SP_IconXinY.webp","assets/character-card/skills/SkillIconXin/SP_IconXinC1.webp","assets/character-card/skills/SkillIconXin/SP_IconXinQTE.webp"],"1312":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconSuoming/SP_IconSuomingB1.webp","assets/character-card/skills/SkillIconSuoming/SP_IconSuomingY.webp","assets/character-card/skills/SkillIconSuoming/SP_IconSuomingC1.webp","assets/character-card/skills/SkillIconSuoming/SP_IconSuomingQTE.webp"],"1402":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconYangyang/SP_IconYangyangB1.webp","assets/character-card/skills/SkillIconYangyang/SP_IconYangyangY.webp","assets/character-card/skills/SkillIconYangyang/SP_IconYangyangC1.webp","assets/character-card/skills/SkillIconYangyang/SP_IconYangyangQTE.webp"],"1403":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconQiushui/SP_IconQiushuiB1.webp","assets/character-card/skills/SkillIconQiushui/SP_IconQiushuiY.webp","assets/character-card/skills/SkillIconQiushui/SP_IconQiushuiC1.webp","assets/character-card/skills/SkillIconQiushui/SP_IconQiushuiQTE.webp"],"1404":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconJiyan/SP_IconJiyanB1.webp","assets/character-card/skills/SkillIconJiyan/SP_IconJiyanY.webp","assets/character-card/skills/SkillIconJiyan/SP_IconJiyanC1.webp","assets/character-card/skills/SkillIconJiyan/SP_IconJiyanQTE.webp"],"1405":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconJianxin/SP_IconJianxinB1.webp","assets/character-card/skills/SkillIconJianxin/SP_IconJianxinY.webp","assets/character-card/skills/SkillIconJianxin/SP_IconJianxinC1.webp","assets/character-card/skills/SkillIconJianxin/SP_IconJianxinQTE.webp"],"1406":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuB1.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuY.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuC1.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuQTE.webp"],"1407":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconXiakong/SP_IconXiakongB1.webp","assets/character-card/skills/SkillIconXiakong/SP_IconXiakongY.webp","assets/character-card/skills/SkillIconXiakong/SP_IconXiakongC1.webp","assets/character-card/skills/SkillIconXiakong/SP_IconXiakongQTE.webp"],"1408":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuB1.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuY.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuC1.webp","assets/character-card/skills/SkillIconFengzhu/SP_IconFengzhuQTE.webp"],"1409":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconKatixiya/SP_IconKatixiyaB3.webp","assets/character-card/skills/SkillIconKatixiya/SP_IconKatixiyaY.webp","assets/character-card/skills/SkillIconKatixiya/SP_IconKatixiyaC1.webp","assets/character-card/skills/SkillIconKatixiya/SP_IconKatixiyaQTE.webp"],"1410":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconYounuo/SP_IconYounuoB1.webp","assets/character-card/skills/SkillIconYounuo/SP_IconYounuoY.webp","assets/character-card/skills/SkillIconYounuo/SP_IconYounuoC1.webp","assets/character-card/skills/SkillIconYounuo/SP_IconYounuoQTE.webp"],"1411":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconQiuyuan/SP_IconQiuyuanB1.webp","assets/character-card/skills/SkillIconQiuyuan/SP_IconQiuyuanY.webp","assets/character-card/skills/SkillIconQiuyuan/SP_IconQiuyuanC1.webp","assets/character-card/skills/SkillIconQiuyuan/SP_IconQiuyuanQTE.webp"],"1412":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconXigelika/SP_IconXigelikaB1.webp","assets/character-card/skills/SkillIconXigelika/SP_IconXigelikaY.webp","assets/character-card/skills/SkillIconXigelika/SP_IconXigelikaC1.webp","assets/character-card/skills/SkillIconXigelika/SP_IconXigelikaQTE.webp"],"1413":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconQingxiao/SP_IconQingxiaoB1.webp","assets/character-card/skills/SkillIconQingxiao/SP_IconQingxiaoY.webp","assets/character-card/skills/SkillIconQingxiao/SP_IconQingxiaoC1.webp","assets/character-card/skills/SkillIconQingxiao/SP_IconQingxiaoQTE.webp"],"1501":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueB1.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueY.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueC1.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueQTE.webp"],"1502":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueB1.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueY.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueC1.webp","assets/character-card/skills/SkillIconZhujue/SP_IconZhujueQTE.webp"],"1503":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconJueyuan/SP_IconJueyuanB1.webp","assets/character-card/skills/SkillIconJueyuan/SP_IconJueyuanY.webp","assets/character-card/skills/SkillIconJueyuan/SP_IconJueyuanC1.webp","assets/character-card/skills/SkillIconJueyuan/SP_IconJueyuanQTE.webp"],"1504":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconDengdeng/SP_IconDengdengB1.webp","assets/character-card/skills/SkillIconDengdeng/SP_IconDengdengY.webp","assets/character-card/skills/SkillIconDengdeng/SP_IconDengdengC1.webp","assets/character-card/skills/SkillIconDengdeng/SP_IconDengdengQTE.webp"],"1505":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconShouanren/SP_IconShouanrenB1.webp","assets/character-card/skills/SkillIconShouanren/SP_IconShouanrenY.webp","assets/character-card/skills/SkillIconShouanren/SP_IconShouanrenC1.webp","assets/character-card/skills/SkillIconShouanren/SP_IconShouanrenQTE.webp"],"1506":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconFeibi/SP_IconFeibiB1.webp","assets/character-card/skills/SkillIconFeibi/SP_IconFeibiY.webp","assets/character-card/skills/SkillIconFeibi/SP_IconFeibiC1.webp","assets/character-card/skills/SkillIconFeibi/SP_IconFeibiQTE.webp"],"1507":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconZanni/SP_IconZanniB1.webp","assets/character-card/skills/SkillIconZanni/SP_IconZanniY.webp","assets/character-card/skills/SkillIconZanni/SP_IconZanniC1.webp","assets/character-card/skills/SkillIconZanni/SP_IconZanniQTE.webp"],"1508":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconQianxiao/SP_IconQianxiaoB1.webp","assets/character-card/skills/SkillIconQianxiao/SP_IconQianxiaoY.webp","assets/character-card/skills/SkillIconQianxiao/SP_IconQianxiaoC1.webp","assets/character-card/skills/SkillIconQianxiao/SP_IconQianxiaoQTE.webp"],"1509":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconLinNai/SP_IconLinNaiB1.webp","assets/character-card/skills/SkillIconLinNai/SP_IconLinNaiY1.webp","assets/character-card/skills/SkillIconLinNai/SP_IconLinNaiC1.webp","assets/character-card/skills/SkillIconLinNai/SP_IconLinNaiQTE.webp"],"1510":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconLuhesi/SP_IconLuhesiB1.webp","assets/character-card/skills/SkillIconLuhesi/SP_IconLuhesiY.webp","assets/character-card/skills/SkillIconLuhesi/SP_IconLuhesiC1.webp","assets/character-card/skills/SkillIconLuhesi/SP_IconLuhesiQTE.webp"],"1511":["assets/character-card/skills/SkillIconNor/SP_IconNorGun.webp","assets/character-card/skills/SkillIconLucy/SP_SkillIconLucyB1.webp","assets/character-card/skills/SkillIconLucy/SP_SkillIconLucyY.webp","assets/character-card/skills/SkillIconLucy/SP_SkillIconLucyC1.webp","assets/character-card/skills/SkillIconLucy/SP_SkillIconLucyQTE.webp"],"1601":["assets/character-card/skills/SkillIconNor/SP_IconNorSword.webp","assets/character-card/skills/SkillIconTaohua/SP_IconTaoHuaB1.webp","assets/character-card/skills/SkillIconTaohua/SP_IconTaoHuaY.webp","assets/character-card/skills/SkillIconTaohua/SP_IconTaoHuaC1.webp","assets/character-card/skills/SkillIconTaohua/SP_IconTaoHuaQTE.webp"],"1602":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconMicai/SP_IconMicaiB1.webp","assets/character-card/skills/SkillIconMicai/SP_IconMicaiY.webp","assets/character-card/skills/SkillIconMicai/SP_IconMicaiC1.webp","assets/character-card/skills/SkillIconMicai/SP_IconMicaiQTE.webp"],"1603":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconChun/SP_IconChunB1.webp","assets/character-card/skills/SkillIconChun/SP_IconChunY.webp","assets/character-card/skills/SkillIconChun/SP_IconChunC1.webp","assets/character-card/skills/SkillIconChun/SP_IconChunQTE.webp"],"1604":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkB1.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkY.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkC1.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkQTE.webp"],"1605":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkB1.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkY.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkC1.webp","assets/character-card/skills/SkillIconZhujueDark/SP_IconZhujueDarkQTE.webp"],"1606":["assets/character-card/skills/SkillIconNor/SP_IconNorFist.webp","assets/character-card/skills/SkillIconLuokeke/SP_IconLuokekeB1.webp","assets/character-card/skills/SkillIconLuokeke/SP_IconLuokekeY.webp","assets/character-card/skills/SkillIconLuokeke/SP_IconLuokekeC1.webp","assets/character-card/skills/SkillIconLuokeke/SP_IconLuokekeQTE.webp"],"1607":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconKanteleila/SP_IconKanteleilaB1.webp","assets/character-card/skills/SkillIconKanteleila/SP_IconKanteleilaY.webp","assets/character-card/skills/SkillIconKanteleila/SP_IconKanteleilaC1.webp","assets/character-card/skills/SkillIconKanteleila/SP_IconKanteleilaQTE.webp"],"1608":["assets/character-card/skills/SkillIconNor/SP_IconNorMagic.webp","assets/character-card/skills/SkillIconFuluoluo/SP_IconFuluoluoB1.webp","assets/character-card/skills/SkillIconFuluoluo/SP_IconFuluoluoY.webp","assets/character-card/skills/SkillIconFuluoluo/SP_IconFuluoluoC1.webp","assets/character-card/skills/SkillIconFuluoluo/SP_IconFuluoluoQTE.webp"],"1610":["assets/character-card/skills/SkillIconNor/SP_IconNorKnife.webp","assets/character-card/skills/SkillIconXuanLing/SP_IconXuanLingB1.webp","assets/character-card/skills/SkillIconXuanLing/SP_IconXuanLingY.webp","assets/character-card/skills/SkillIconXuanLing/SP_IconXuanLingC1.webp","assets/character-card/skills/SkillIconXuanLing/SP_IconXuanLingQTE.webp"]};
  function cardCharacterLevel(member) {
    const value=W.characterLevels?.level(member) ?? member?.characterLevel ?? 90;
    return Number.isInteger(value)&&value>=1&&value<=90?value:null;
  }
  function cardSkillLevels(member, images) {
    const paths=cardSkillIcons[String(member.characterId)]||[];
    return cardSkillGroups.map((type,i)=>{
      const image='skillLevel'+i;
      if(paths[i])images[image]=absolute(paths[i]);
      const value=W.skillLevels?.level(member,type);
      return {type,image:paths[i]?image:null,level:Number.isInteger(value)&&value>=1&&value<=10?value:null};
    });
  }
  function members() {
    return W.state.members.map((m, index) => ({index, id: String(m.characterId || ''), name:m.name || '未选择角色'})).filter(m=>m.id);
  }
  function build(index, allowPending = false, inputFingerprint, energyRound) {
    const s=W.state, m=s.members[index];
    if (!m?.characterId) throw Error('请先选择角色');
    const fp=inputFingerprint || W.echoFingerprintState(), cache=s.fullBaselineCache?.get(0);
    const scoreReady=!!(cache && sameInputs(cache.fp,fp) && W.baselineDataValid(cache.data));
    if (!scoreReady && !allowPending) throw Error('方案数据已变化，请重新开始计算');
    const echoResult=echoCache.get(index), echoScored=sameInputs(echoResult?.fp,fp)?echoResult.data:null;
    const currentEnergy=energyStatus(index,energyRound),cachedEnergy=energyCache.get(index);
    const energy=sameInputs(cachedEnergy?.fp,fp)&&cachedEnergy.data.selectedRound===currentEnergy.selectedRound?{...cachedEnergy.data,roundAdjusted:currentEnergy.roundAdjusted}:currentEnergy;
    const vm=W.buildExportCardViewModel(), def=W.findCharSkillDef(m.characterId), weapon=W.findWeaponDef(m.weaponSelection?.id);
    const personal=scoreReady?W.exportMemberPersonalGrade(cache.data,m.results?.dps,index):{score:null,grade:null};
    if (personal.score==null && !allowPending) throw Error('该角色没有可评分的伤害，请先完成配装与技能轴');
    const records=[];
    const append=(row, owner, source, id, name, damage, bd)=>records.push({characterId:String(owner),skillId:source+':'+id,name:name||'未命名技能',source,expected:num(damage),critical:Number.isFinite(bd?.critTotal)?bd.critTotal:null});
    const originalName=(row, catalog)=>W.getEntryLibrarySkillName(row)||W.getEntryLibrarySkillName(catalog)||row.name||catalog?.name||'未命名技能';
    s.members.forEach(member=>{
      if(member.results?.cycleMode){
        (member.results.cycles||[]).forEach(c=>{
          const round=member.cycleConfig?.rounds?.[c.index-1];
          const catalog=round?.rotationCatalog||member.rotationCatalog||[];
          (c.steps||[]).forEach(step=>{
            const entry=catalog.find(item=>item.id===step.catalogId);
            const name=originalName(step,entry);
            append(step,member.characterId,'普通技能',name,name,step.damage,step.breakdown);
          });
        });
      } else (member.phases||[]).forEach(p=>(p.skills||[]).forEach(skill=>{
        const entry=(member.rotationCatalog||[]).find(item=>item.id===skill.catalogId);
        const name=originalName(skill,entry);
        append(skill,member.characterId,'普通技能',name,name,skill._damage,skill._breakdown);
      }));
    });
    (s.specialSkills?.results?.cycles||[]).forEach(c=>(c.items||[]).forEach(it=>{
      const owner=s.members[it.ownerIndex]?.characterId;
      append(it,owner||'unassigned','特殊技能',it.name||it.id,it.name||'特殊技能',it.total,{critTotal:it.critTotal});
    }));
    const teamTotal=num(s.teamResults?.total), seconds=num(s.teamResults?.axisDuration)||num(s.team.axisDuration);
    const sum=records.reduce((n,r)=>n+r.expected,0);
    if(!(seconds>0) || Math.abs(sum-teamTotal)>Math.max(.05,teamTotal*1e-8)) throw Error('技能伤害与全队总伤未对齐，请返回计算器重新计算');
    const images={portrait:absolute(W.getExportCardDefaultArt(index)),weapon:absolute(weapon?W.getWeaponDefIconUrl(weapon):'')};
    const shortLabel=label=>String(label||'').replace('百分比','').replace('伤害加成','').replace('伤害提升','');
    const echoes=(m.echoConfig?.slots||[]).map((slot,i)=>{
      const opt=(W.ECHO_MAIN1_OPTIONS[slot.cost]||[]).find(o=>o.id===slot.main1);
      const appearance=echoAppearance(slot);
      images['echo'+i]=absolute(appearance.icon);
      return {id:slot.echoId||null,name:appearance.name,rating:echoScored?.ratings[i]?.score??null,cost:slot.cost,main:opt?.needsElement?String(slot.main1Element||'属性')+'伤害':opt?.label||'未选择',value:opt?opt.value+'%':'—',image:'echo'+i,affixes:(slot.subs||[]).map(sub=>{
        const d=W.ECHO_SUB_AFFIXES[sub.id];
        return {name:sub.damageType||shortLabel(d?.label)||sub.id,value:num(sub.value),unit:d?.unit==='flat'?'':'%',max:Math.max(...(d?.rolls||[Infinity]))};
      })};
    });
    const skillLevels=cardSkillLevels(m,images);
    const teamMates=members().filter(x=>x.index!==index).map(x=>{
      const member=s.members[x.index],key='mate'+x.index,weaponImage='mateWeapon'+x.index;
      const selected=W.findWeaponDef(member.weaponSelection?.id);
      images[key]=absolute(W.getCharacterAvatarUrl?.(x.id)||'assets/characters/'+x.id+'.webp');
      if(selected)images[weaponImage]=absolute(W.getWeaponDefIconUrl(selected));
      return {...x,image:key,level:cardCharacterLevel(member),chain:num(member.resonanceUnlocked),weaponImage:selected?weaponImage:null,weaponName:selected?.name||'未选择武器',refinement:selected?(num(member.weaponSelection?.refinement)||1):null};
    });
    const sets=W.getMemberEchoSummary(m).sets;

    return {echoScoreReady:!!echoScored,marginalPriority:echoScored?.marginalPriority||[],echoScoreDetails:echoScored,scoreReady:scoreReady && personal.score!=null,fingerprint:fp,character:{id:String(m.characterId),name:m.name||def?.name,rarity:num(def?.rank)||5,level:cardCharacterLevel(m),chain:num(m.resonanceUnlocked)},weapon:{refinement:num(m.weaponSelection?.refinement)||1},user:W.CardIdentity.author()?.name||viewerName(),code:vm.shareCode,axis:{name:vm.axisName,seconds,mode:s.exportCardDraft?.axisKind||'cycle'},energy,stats:[primaryPanel(m),['暴击率',num(W.getCharStatTotal(m.char,'critRate')).toFixed(1)+'%'],['暴击伤害',num(W.getCharStatTotal(m.char,'critDmg')).toFixed(1)+'%'],['共鸣效率',num(W.getMemberEnergyRegenPct(m)).toFixed(1)+'%']],score:personal.score,grade:personal.grade,gapPercent:personal.score==null?null:100-personal.score/2.5,skillLevels,fullCharacterDamage:scoreReady?num(cache.data.fullMemberTotals[index]):null,teamMates,setName:sets.map(x=>x.name+' ×'+x.count).join(' / '),echoes,records,images,teamTotal};
  }
  function preview(index, energyRound) {
    if(busy || document.getElementById('exportCardCalcOverlay') || W.state._bootReconciling) throw Error('已有计算正在进行，请稍后再试');
    const s=W.state,fp=W.echoFingerprintState(),refs={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults},saved=structuredClone(refs),members=refs.members.slice();
    try { W.computeAll();const packet=build(index,true,fp,energyRound);return packet; }
    finally { const restore=(target,source)=>{for(const k of Object.keys(target))delete target[k];Object.assign(target,source);};refs.members.splice(0,refs.members.length,...members);members.forEach((m,i)=>restore(m,saved.members[i]));restore(refs.team,saved.team);if(refs.specialSkills)restore(refs.specialSkills,saved.specialSkills);Object.assign(s,refs); }
  }
  async function calculate(index, onProgress, energyRound) {
    if(busy || document.getElementById('exportCardCalcOverlay') || W.state._bootReconciling) throw Error('已有计算正在进行，请稍后再试');
    busy=true;
    const s=W.state, originalFp=W.echoFingerprintState();
    const cachedEcho=sameInputs(echoCache.get(index)?.fp,originalFp)?echoCache.get(index).data:null;
    // The legacy calculation normalizes defaults in computeAll. Keep the exact
    // editable input objects, including absent overrides, intact for this reader.
    const refs={members:s.members,team:s.team,specialSkills:s.specialSkills,teamResults:s.teamResults};
    const saved=structuredClone(refs), memberRefs=refs.members.slice();
    let packet, completed=false;
    try {
      W.computeAll();
      s._exportCalcAborted=false;onProgress?.('检查可复用的评分基准…');
      const keys=await referenceKeys(index);
      if(s._exportCalcAborted)throw Error('已取消计算，原方案已恢复');
      const reused=readReference('full',keys.full);
      const fullReferenceCached=W.baselineDataValid(reused)&&reused.fullMemberDps.length===s.members.length;
      if(fullReferenceCached){
        const fp=W.echoFingerprintState();s.fullBaselineCache=new Map([[0,{fp,data:{...structuredClone(reused),fp}}]]);
        onProgress?.('已复用满配基准，正在更新当前词条结果…');
      }
      await W.runExportCardInlineCalc(undefined,{scoreOnly:true,onProgress});
      if(W.state._exportCalcAborted) throw Error('已取消计算，原方案已恢复');
      const full=s.fullBaselineCache?.get(0)?.data;
      if(W.baselineDataValid(full))saveReference('full',keys.full,{ok:true,ver:full.ver,fullDps:full.fullDps,fullMemberDps:full.fullMemberDps,fullMemberTotals:full.fullMemberTotals});
      const fp=W.echoFingerprintState();
      echoCache.set(index,{fp,data:cachedEcho||await scoreEchoes(index,onProgress,keys.single)});
      const energy=await energyAdvice(index,energyRound,onProgress);
      energyCache.set(index,{fp,data:energy});
      packet=build(index,false,fp,energyRound);completed=true;
      packet.fullReferenceCached=!!fullReferenceCached;
    } catch (e) {
      if (s._exportCalcAborted) throw Error('已取消计算，原方案已恢复');
      throw e;
    } finally {
      const restore=(target,source)=>{for(const k of Object.keys(target))delete target[k];Object.assign(target,source);};
      refs.members.splice(0,refs.members.length,...memberRefs);
      memberRefs.forEach((m,i)=>restore(m,saved.members[i]));restore(refs.team,saved.team);
      if(refs.specialSkills)restore(refs.specialSkills,saved.specialSkills);
      Object.assign(s,refs);
      if(completed){
        const cache=s.fullBaselineCache.get(0);cache.fp=originalFp;cache.data.fp=originalFp;
        const echoResult=echoCache.get(index);if(echoResult)echoResult.fp=originalFp;
        const energyResult=energyCache.get(index);if(energyResult)energyResult.fp=originalFp;
        packet.fingerprint=originalFp;
      }
      busy=false;
    }
    return packet;
  }
  async function calculateTeam(index,onProgress,onMemberReady,energyRounds={}){
    if(busy||batch)throw Error('已有计算正在进行，请稍后再试');
    const roster=members(),selected=roster.find(m=>m.index===index);
    if(!selected)throw Error('请先选择角色');
    const order=[selected,...roster.filter(m=>m.index!==index)],fp=W.echoFingerprintState();
    const run={cancelled:false};batch=run;let selectedPacket,completed=0;
    const failures=[];
    try{
      for(const [position,member]of order.entries()){
        if(run.cancelled)throw Error('已取消计算，已完成角色的评分已保留');
        if(!sameInputs(W.echoFingerprintState(),fp))throw Error('方案已变化，请重新计算');
        const prefix=member.name+'（'+(position+1)+'/'+order.length+'）';
        onProgress?.('正在计算 '+prefix);
        try{
          const packet=await calculate(member.index,message=>onProgress?.(prefix+' · '+message),energyRounds[member.index]);
          completed++;
          if(member.index===index)selectedPacket=packet;
          await onMemberReady?.(packet,member.index,completed,order.length);
        }catch(error){
          if(run.cancelled||W.state._exportCalcAborted)throw error;
          failures.push({index:member.index,name:member.name,message:error.message});
          onProgress?.(prefix+' 未完成：'+error.message);
        }
      }
      if(run.cancelled)throw Error('已取消计算，已完成角色的评分已保留');
      if(!completed)throw Error(failures.map(m=>m.name+'：'+m.message).join('；')||'没有可评分的角色');
      const packet=selectedPacket||preview(index,energyRounds[index]);
      packet.teamScoreCompleted=completed;packet.teamScoreFailures=failures;return packet;
    }finally{batch=null;}
  }
  W.CharacterCard={isBusy:()=>busy||!!batch,members,prepareAssets,preview,calculateEnergy,calculate:calculateTeam,build,isCurrent:fp=>!busy&&!batch&&sameInputs(fp,W.echoFingerprintState()),cancel:()=>{if(batch)batch.cancelled=true;if(busy)W.state._exportCalcAborted=true;}};
  // Permanent compatibility bridge required by the project's namespace gate.
  Object.defineProperty(window,'CharacterCard',{get:()=>W.CharacterCard,set:value=>{W.CharacterCard=value;},enumerable:true,configurable:true});
  document.addEventListener('click',e=>{
    if(!e.target.closest('[data-open-character-card]'))return;
    e.preventDefault();e.stopPropagation();
    window.open('character-card.html','_blank');
  },true);
})();
