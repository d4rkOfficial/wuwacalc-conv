/* 霜渐附着提示：只读统计；条件确认仅保存展示元数据，不产生特殊伤害。 */
(() => {
  'use strict';
  const wc = window.__WC;
  const filmName = '记忆宫殿·胶卷';
  const rules = new Map();
  const add = (id, names, times, extra = {}) => names.forEach(name => rules.set(`${id}:${name}`, { times, ...extra }));
  add('1108', ['灼樱刀术·普攻·常世身第三段','灼樱刀术·重击·寒簇·常世身','灼樱刀术·普攻·预求身第三段','灼樱刀术·普攻·预求身第四段','灼樱刀术·普攻·预求身第五段','灼樱刀术·重击·枯霜·预求身','灼樱刀术·空中攻击·预求身第二段','灼樱刀术·空中下落攻击·预求身','霜锋·技能'], 1);
  add('1108', ['预求我身·见心'], 4);
  add('1108', ['万世霜天·普攻·居合'], 3, { choices:[0,3], condition:'消耗武霜·居合时附加 3 次；未消耗为 0 次' });
  add('1108', ['灼樱刀术·普攻·预求身第一段','灼樱刀术·普攻·预求身第二段'], 1, { chain:1, choices:[0,1], condition:'1 链：见心后的下一次该段命中才附加 1 次' });
  add('1109', ['幻象定帧·追光','记忆宫殿·遗忘'], 1, { frost:true });
  add('1109', ['剪辑','剪辑·硬切'], 1);
  add('1109', [filmName], 2, { frost:true, condition:'每条代表一次胶卷触发，消耗 1 层胶卷；触发间隔 0.5 秒，次数由玩家确认' });
  add('1110', ['翠落画屏·醒春潮','泠泠漱玉声·技能','穗摇金·普攻·濯雨时第四段'], 1);
  add('1110', ['渌水盈盈'], 3, { choices:[0,1,2,3], condition:'延奏后的实际翾舞次数：芳菲信 200 / 400 / 600 解锁 1 / 2 / 3 次；需水境存在且穗穗在后台' });
  const profiles = {
    '1108':{name:'霜渐',color:'#80caff'},'1109':{name:'霜渐',color:'#80caff'},'1110':{name:'霜渐',color:'#80caff'},
    '1210':{name:'聚爆',color:'#ff8181',mode:'burst'},'1211':{name:'聚爆',color:'#ff8181',mode:'burst'},
    '1409':{name:'风蚀',color:'#72d9a2'},'1407':{name:'风蚀',color:'#72d9a2'},
    '1311':{name:'电磁',color:'#c49aff',mode:'dianci'},'1307':{name:'电磁',color:'#c49aff'},
    '1309':{name:'电磁',color:'#c49aff'},'1310':{name:'电磁',color:'#c49aff'}
  };
  const profile = member => profiles[String(member?.characterId)];
  const label = member => profile(member)?.name || '效应';
  const color = member => profile(member)?.color || '#80caff';
  const enabled = member => !profile(member)?.mode || member.combatMode === profile(member).mode;
  const burstNote='聚爆模态；同技能同目标冷却内重复命中不重复计数，请按有效施放次数填写';
  add('1211',['谨此致访·久疏问候！','谨此致访·轻叩门扉','帷幕终景·布景之形','帷幕终景·幻灭之形','“天衣无缝”·蚀域每次'],2,{condition:burstNote+'（2秒）；蚀域每次攻击单独计数'});
  add('1211',['织梦的飨宴·普攻·布景之形第三段','织梦的飨宴·普攻·布景之形第四段','织梦的飨宴·普攻·幻灭之形第三段','织梦的飨宴·普攻·幻灭之形第四段','织梦的飨宴·普攻·幻灭之形第三段·共鸣解放','织梦的飨宴·普攻·幻灭之形第四段·共鸣解放'],1,{condition:burstNote+'（2秒）'});
  add('1210',['校准无垠·普攻·爱弥斯第三段','校准无垠·普攻·爱弥斯第四段','共赴长航·普攻·机兵第三段','共赴长航·普攻·机兵第四段','共赴长航·合击·突刺·兵装融合','共赴长航·合击·突刺·启明之音','航程伊始的预兆·以旋律穿越长空','航程伊始的预兆·携星辉降临于此'],1,{condition:burstNote+'（3秒）'});
  add('1210',['校准无垠·重击·爱弥斯·一段蓄力','校准无垠·重击·爱弥斯·二段蓄力','共赴长航·重击·机兵·一段蓄力','共赴长航·重击·机兵·二段蓄力'],1,{chain:3,choices:[0,1],condition:'3链：处于即刻响应状态施放重击才附加1次；同一次蓄力只计一次，若拆录两段仅一段确认1'});
  add('1409',['以剑奉读此身·第四段·小卡'],1);
  add('1409',['此剑以人之名·技能·小卡','此剑，为潮水的过去·小卡'],2);
  add('1409',['暴风雨·普攻第五段·大卡','暴风雨·空中攻击第二段·大卡','暴风雨·强化重击·大卡','暴风雨·共鸣技能·凭风斩浪破敌·大卡'],2,{chain:3,condition:'3链附加2层；结算、消耗与复制已有层数不作固定新增计入'});
  add('1409',['听骑士从心祈愿·看潮怒风哮之刃·大卡'],0,{chain:6,manual:true,condition:'6链补至上限：填写每次实际新增层数，不把目标原有层数重复计入'});
  add('1407',['四拍的舞曲·第四段','谐律速奏·技能','携风吟游·技能','风与诗乐的交响·四拍重奏'],1);
  add('1407',['歌者的三重华彩·交响诗·主音'],1,{choices:[0,1],condition:'绿色主音附加1层风蚀；黄色为光噪，此处填0；混合颜色请拆分技能次数'});
  add('1307',['召劾鬼神·技能'],4,{condition:'同目标每10秒可生效1次'});
  add('1307',['雷炁化生·五雷荡煞阵持续'],2,{condition:'每次阵法攻击附加2层，间隔2秒；技能次数填实际命中次数，不按单次大招固定算满24秒'});
  add('1307',['雷炁化生·飞雷诀·归一'],6,{chain:5,condition:'5链：阵法生成立即附加6层；持续攻击另行统计'});
  for(const id of ['1309','1310']) {
    add(id,['天机万象·超负荷'],10);
    add(id,['最终战略·技能'],5,{chain:2,condition:'2链：共鸣解放造成伤害后附加5层'});
  }
  add('1311',['万相流转，此心自明·照世相·万阙连衡','万相流转，此心自明·照世相·镇寰宇'],5);
  add('1311',['乘兴一顾·变奏技能·应世相·电磁','乘兴一顾·变奏技能·照世相·电磁','万相流转，此心自明·应世相·镇红尘'],1);
  add('1311',['万相生华·普攻·照世相·万阙连衡第一段','万相生华·普攻·照世相·万阙连衡第二段','万相生华·普攻·照世相·万阙连衡第三段','万相生华·普攻·照世相·万阙连衡第四段','万相生华·闪避反击·照世相·万阙连衡'],1,{choices:[0,1],condition:'转相后才可附加；每次转相至多生效5次，按实际有效次数确认，超过额度填0'});
  const extraDefs = {
    '1210':[{key:'zeroRefill',name:'0层自动补至1层',factor:1,unit:'触发次数',note:'包含战斗中目标为0层时的补层；超过5层引爆清零后也可能触发。填写实际补层次数，不自动推算爆炸次数。'}],
    '1211':[{key:'air34',name:'空中攻击·幻灭之形第3/4段',factor:1,unit:'有效命中次数',note:'当前技能库缺少独立空中第3/4段条目，暂在此确认；每段附加1次，同技能同目标间隔2秒。地面技能统计不重复填写。'}],
    '1409':[{key:'inherit',name:'1链·集意转移',chain:1,factor:1,unit:'实际新增层数合计',note:'击败后下一次技能附加的实际层数，受目标上限限制。'},{key:'r1',name:'2链·变身后首次伤害',chain:2,factor:3,unit:'有效触发次数',note:'施放听骑士从心祈愿后，下一次直接伤害附加3层；此处只确认该额外附着。'},{key:'copy',name:'异权之力·复制风蚀',factor:1,unit:'实际新增层数合计',note:'群怪复制最高层数产生的新增层数，单目标无新增填0；不按结算次数推算。'}],
    '1311':[{key:'turn',name:'共鸣解放·转相',factor:5,unit:'有效施放次数',note:'转相无独立伤害条目，施放后附加5层；仅手动确认次数。'},{key:'zeroRefill',name:'信步拾清欢·0层补1层',factor:1,unit:'触发次数',note:'心相心生状态下目标为0层时的实际补层次数。'},{key:'fill',name:'疾霆·补至上限',factor:1,unit:'实际额外新增层数合计',note:'霆霓满层或目标层数上限增加时实际补齐的新增层数，至多补至16层；扣除原有层数和上项补1层，避免重复统计。'}]
  };
  function extras(member) {
    if (!enabled(member)) return [];
    const owner=member.cycleConfig?.enabled ? member.cycleConfig.rounds?.[wc.readActiveCycleRoundIndex(member)] : member;
    return (extraDefs[String(member.characterId)] || []).filter(x=>!x.chain || Number(member.resonanceUnlocked)>=x.chain).map(x=>{
      const value=owner?.effectHintExtras?.[member.characterId+':'+x.key];
      const pending=!Number.isInteger(value)||value<0||value>9999;
      return {...x,value:pending?'':value,pending,total:pending?0:value*x.factor};
    });
  }

  const esc = value => wc.escapeHtml(String(value ?? ''));
  const library = entry => wc.getEntryLibrarySkillName(entry) || entry?.libraryName || entry?.name || '';
  const isMarker = entry => !entry?.merged && library(entry) === filmName;
  function rule(member, entry) {
    if (!profile(member) || !enabled(member)) return null;
    if (entry?.merged) return {times:0,manual:true,condition:'旧合并技能缺少原始来源，请确认每次完整施放的总附着次数'};
    const key = `${member?.characterId}:${library(entry)}`;
    // 老轴可能已丢失 merged 标记；只提供人工确认，不从简称推断来源或次数。
    if (entry?.customName && Array.isArray(entry.multComponents) && entry.multComponents.length === 0 && rules.has(key)) {
      return {times:0,manual:true,condition:'旧合并或自定义技能缺少完整来源，请确认每次完整施放的总附着次数'};
    }
    const r = rules.get(key);
    if (!r || (r.chain && Number(member.resonanceUnlocked || 0) < r.chain)) return null;
    return {...r, disabled:r.frost && member.combatMode !== 'frost'};
  }
  function palette(member, entries) {
    if (String(member?.characterId) !== '1109') return entries;
    const result = (entries || []).filter(p => library(p) !== filmName);
    result.push({id:'frost_hint_film_1109',name:'胶卷',libraryName:filmName,librarySkillName:filmName,
      damageType:'',skillType:'共鸣回路',baseMult:0,multCount:1,energyRegen:0,fixedDamage:true,multComponents:[]});
    return result;
  }
  function badge(member, entry) {
    const r=rule(member,entry);if(!r)return '';
    const n=label(member),text=r.disabled ? n+'模态限定' : r.manual ? n+' · 待确认' : r.choices ? n+' ×'+r.times+' · 条件' : n+' ×'+r.times+(isMarker(entry)?' · 无伤害':'');
    return `<span class="frost-hint-badge${r.disabled?' is-inactive':''}" style="--effect-color:${color(member)}" title="${esc(r.condition||'每次完整有效命中；不按Hit重复计数')}">${esc(text)}</span>`;
  }
  const validChoice = (r, n) => r.manual ? Number.isInteger(n) && n >= 0 && n <= 9999 : r.choices?.includes(n);
  function sourceCopy(entry) {
    const result = {name:entry.name || '',librarySkillName:library(entry),multCount:(Number.isFinite(Number(entry.multCount)) && Number(entry.multCount) >= 1 ? Math.floor(Number(entry.multCount)) : 1)};
    if (entry.merged) result.merged = true;
    if (entry.customName && Array.isArray(entry.multComponents) && !entry.multComponents.length) { result.customName = true; result.multComponents = []; }
    if (Number.isFinite(entry.frostHintPerCast)) result.frostHintPerCast = entry.frostHintPerCast;
    return result;
  }
  function copySources(entry) {
    return Array.isArray(entry?.frostHintSources) ? entry.frostHintSources.map(sourceCopy) : undefined;
  }
  function buildMergedSources(items) {
    return items.flatMap(entry => {
      const sources = copySources(entry);
      if (!sources) return [sourceCopy(entry)];
      return sources.map(source => ({...source,multCount:source.multCount * (Number.isFinite(Number(entry.multCount)) && Number(entry.multCount) >= 1 ? Math.floor(Number(entry.multCount)) : 1)}));
    });
  }
  function atom(member, entry) {
    const r = rule(member, entry);
    if (!r) return null;
    const pending = !r.disabled && !!(r.choices || r.manual) && !validChoice(r, entry.frostHintPerCast);
    const perCast = r.disabled || pending ? 0 : r.choices || r.manual ? entry.frostHintPerCast : r.times;
    const count = (Number.isFinite(Number(entry.multCount)) && Number(entry.multCount) >= 1 ? Math.floor(Number(entry.multCount)) : 1);
    return {name:entry.name,libraryName:library(entry),count,perCast,total:count*perCast,pending,choices:r.choices,manual:r.manual,condition:r.condition||'',disabled:r.disabled};
  }
  function details(member) {
    return (member?.rotationCatalog || []).flatMap(entry => {
      if (Array.isArray(entry.frostHintSources)) {
        const parts = entry.frostHintSources.flatMap((s,index) => {
          const a=atom(member,s);return a ? [{...a,sourceIndex:index}] : [];
        });
        if (!parts.length) return [];
        const count=(Number.isFinite(Number(entry.multCount)) && Number(entry.multCount) >= 1 ? Math.floor(Number(entry.multCount)) : 1), perCast=parts.reduce((n,p)=>n+p.total,0);
        return [{id:entry.id,name:entry.name,libraryName:'合并技能',count,perCast,total:count*perCast,pending:parts.some(p=>p.pending),parts}];
      }
      const a=atom(member,entry);return a ? [{...a,id:entry.id}] : [];
    });
  }
  function choiceHtml(r,id,slot,sourceIndex) {
    const attrs=`data-frost-hint-choice="${esc(id)}"${slot === undefined ? '' : ` data-frost-hint-slot="${slot}"`}${sourceIndex === undefined ? '' : ` data-frost-hint-source="${sourceIndex}"`} aria-label="${esc(r.name)}每次施放附着次数"`;
    if (r.manual) return `<input type="number" min="0" max="9999" step="1" placeholder="待确认" style="width:84px" ${attrs} value="${r.pending ? '' : r.perCast}">`;
    return `<select ${attrs}><option value="" ${r.pending ? 'selected' : ''}>待确认</option>${r.choices.map(n=>`<option value="${n}" ${!r.pending && n===r.perCast ? 'selected' : ''}>${n} 次</option>`).join('')}</select>`;
  }
  function row(member,entry) {
    if(!enabled(member)||!profile(member))return '';
    if(entry.frostHintSources?.length) return `<span class="frost-hint-badge" style="--effect-color:${color(member)}">${label(member)} · 按合并来源统计</span>`;
    const a=atom(member,entry);if(!a)return '';
    if((!a.choices&&!a.manual)||a.disabled)return badge(member,entry);
    return `<label class="frost-hint-choice" style="--effect-color:${color(member)}" title="${esc(a.condition)}">${label(member)} / 次 ${choiceHtml(a,entry.id)}</label>`;
  }
  function renderDetailRow(r,slot) {
    const value = r.disabled ? '当前模态不适用' : r.choices || r.manual ? choiceHtml(r,r.id,slot) : r.perCast;
    const parts=(r.parts || []).map(p=>`<tr><td style="padding-left:26px">↳ ${esc(p.name)}<small>${esc(p.libraryName)}${p.condition ? ' · '+esc(p.condition) : ''}</small></td><td>×${p.count} ×${r.count}</td><td>${p.disabled ? '当前模态不适用' : p.choices || p.manual ? choiceHtml(p,r.id,slot,p.sourceIndex) : p.perCast}</td><td>${p.pending ? '待确认' : p.total*r.count}</td></tr>`).join('');
    return `<tr><td>${esc(r.name)}${r.name !== r.libraryName ? `<small>${esc(r.libraryName)}</small>` : ''}${r.condition ? `<small>${esc(r.condition)}</small>` : ''}</td><td>×${r.count}</td><td>${value}</td><td>${r.total}${r.pending ? ' + 待确认' : ''}</td></tr>${parts}`;
  }
  function summary(slot) {
    const member=wc.state.members[slot];if(!profile(member)||!enabled(member))return '';
    const rows=details(member),extra=extras(member),total=[...rows,...extra].reduce((n,r)=>n+r.total,0),pending=[...rows,...extra].filter(r=>r.pending).length;
    return `<button type="button" class="frost-hint-summary" style="--effect-color:${color(member)}" data-frost-hint-summary="${slot}" title="查看当前轮次的附着明细">当前角色附加 ${total} 次${label(member)}效应${pending?' · '+pending+' 项待确认':''}</button>`;
  }
  let dialog = null;
  function show(slot) {
    const member = wc.state.members[slot];
    if (!member) return;
    dialog?.close(); dialog?.remove();
    const rows = details(member), extra = extras(member), total = [...rows,...extra].reduce((n,r)=>n+r.total,0);
    dialog = document.createElement('dialog');
    dialog.className = 'frost-hint-dialog';
    dialog.style.setProperty('--effect-color',color(member));
    dialog.innerHTML = `<header><h3>${esc(member.name)} · ${label(member)}附着明细</h3><button type="button" data-frost-hint-close aria-label="关闭">×</button></header><p>当前轮次已确认附着合计 <strong>${total} 次</strong>。仅供参考，不自动填写特殊技能；附着合计不是目标当前层数，也不是效应伤害触发次数。</p><div class="frost-hint-table"><table><thead><tr><th>技能 / 合并来源</th><th>技能次数</th><th>每次附着</th><th>合计</th></tr></thead><tbody>${rows.map(r=>renderDetailRow(r,slot)).join('') || '<tr><td colspan="4">当前轮次还没有可统计的技能</td></tr>'}</tbody></table></div>${extra.length ? `<section class="effect-hint-extras"><h4>额外附着确认</h4>${extra.map(x=>`<label><span><b>${esc(x.name)}</b><small>${esc(x.note)}</small></span><span><input type="number" min="0" max="9999" step="1" placeholder="待确认" value="${x.value}" data-effect-hint-extra="${x.key}" data-effect-hint-slot="${slot}" aria-label="${esc(x.name)}${esc(x.unit)}"> ${esc(x.unit)}${x.factor===1?'':' ×'+x.factor}</span></label>`).join('')}</section>` : ''}<p class="hint">合并技能按原始来源累计；来源次数 × 合并技能重复次数。条件项可在此确认。仅统计附着，不自动填写特殊技能。</p>`;
    document.body.append(dialog);
    dialog.addEventListener('click',e=>{if(e.target.closest('[data-frost-hint-close]') || e.target === dialog)dialog.close();});
    const ownDialog = dialog;
    dialog.addEventListener('close',()=>ownDialog.remove(),{once:true});
    dialog.showModal();
  }
  document.addEventListener('click', e => {
    const target = e.target.closest('[data-frost-hint-summary]');
    if (target) { e.preventDefault(); show(Number(target.dataset.frostHintSummary)); }
  });
  document.addEventListener('change', e => {
    const input=e.target.closest('[data-effect-hint-extra]');if(!input)return;
    const slot=Number(input.dataset.effectHintSlot),member=wc.state.members[slot];
    const def=extras(member).find(x=>x.key===input.dataset.effectHintExtra);if(!def)return;
    const value=Number(input.value);if(input.value!==''&&(!Number.isInteger(value)||value<0||value>9999)){input.reportValidity();return;}
    const owner=member.cycleConfig?.enabled?member.cycleConfig.rounds[wc.readActiveCycleRoundIndex(member)]:member;
    owner.effectHintExtras={...(owner.effectHintExtras||{})};const key=member.characterId+':'+def.key;
    if(input.value==='')delete owner.effectHintExtras[key];else owner.effectHintExtras[key]=value;
    wc.scheduleSave();document.querySelector(`[data-frost-hint-summary="${slot}"]`)?.replaceWith(document.createRange().createContextualFragment(summary(slot)));show(slot);
  });
  document.addEventListener('change', e => {
    const target = e.target.closest('[data-frost-hint-choice]');
    if (!target) return;
    const slot = target.dataset.frostHintSlot === undefined ? wc.state.team.activeIndex : Number(target.dataset.frostHintSlot);
    const member = wc.state.members[slot], entry = member?.rotationCatalog?.find(c=>c.id===target.dataset.frostHintChoice);
    const sourceIndex = target.dataset.frostHintSource;
    const editEntry = sourceIndex === undefined ? entry : entry?.frostHintSources?.[Number(sourceIndex)];
    const r = editEntry && rule(member, editEntry);
    if (!r || (!r.choices && !r.manual)) return;
    if (target.value !== '' && !validChoice(r, Number(target.value))) { target.reportValidity(); return; }
    wc.pushEditUndo(member,'调整效应附着提示');
    if (target.value === '') delete editEntry.frostHintPerCast;
    else editEntry.frostHintPerCast = Number(target.value);
    wc.persistCycleEditingIfEnabled(member);
    wc.scheduleSave();
    const summaryButton = document.querySelector(`[data-frost-hint-summary="${slot}"]`);
    if (summaryButton) summaryButton.replaceWith(document.createRange().createContextualFragment(summary(slot)));
    if (target.dataset.frostHintSlot !== undefined) show(slot);
  });
  wc.frostHints = {rule,palette,badge,row,summary,details,filmName,isMarker,copySources,buildMergedSources,profile,color,extras};
})();

/* 用户提供的效应说明，仅阅读，不参与结算。 */
(() => {
  const entries = [
    ['风蚀效应','#72d9a2','每层持续14.8秒，重复获得刷新持续时间，常规上限3层。每3秒结算1次对应层数的异常倍率。处于无敌状态时，正常计时不进行结算。'],
    ['电磁效应','#c49aff','每层持续15秒，重复获得刷新持续时间，常规上限10层。每5秒结算1次对应层数倍率异常伤害、移除当前层数50%的异常层数。层数达到上限后，可额外叠加至多10层电磁爆发层数，下次结算电磁效应伤害时，额外附加当前电磁爆发层数倍率。处于无敌状态时不生效。'],
    ['霜渐效应','#80caff','每层持续15秒，重复获得刷新持续时间，常规上限10层，层数达到上限后清空、冻结2秒（对目标）/4秒（对角色）。每次获得层数时，结算对应层数的减速倍数、伤害倍率（对角色时倍率*0.5）。处于无敌状态、声骸变身状态、冻结状态时不可获得层数。'],
    ['聚爆效应','#ff8181','每层持续15秒，重复获得刷新持续时间，常规上限10层，达到上限层数时结算1次对应层数异常倍率，半径3米，结算冷却0.2秒。处于无敌状态时不结算。'],
    ['光噪效应','#f2d778','每层持续3秒，常规上限10层。每3秒结算1次对应层数的异常倍率，每次结算减少1层。处于无敌状态时，正常计时不进行结算。'],
    ['虚湮效应','#e394cc','每层持续25秒，持续时间结束后清空层数，常规上限3层。每层减少持有者对应层数防御。处于无敌状态时不生效。']
    ,['霜渐效应','#80caff','每层持续15秒，重复获得刷新持续时间，上限10层，层数达到上限且触发霜冻冻结监听后清空层数、霜结2秒。每次获得层数时，结算霜渐效应上限层数的伤害倍率。处于冻结、霜结状态时可继续获得层数。处于无敌状态时不可获得层数。']
  ];
  document.addEventListener('click', event => {
    const trigger=event.target.closest('[data-effect-guide]');if(!trigger)return;
    document.querySelector('.effect-guide-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.className='effect-guide-dialog';
    dialog.setAttribute('aria-labelledby','effect-guide-title');
    dialog.innerHTML='<header><h3 id="effect-guide-title">效应计算说明</h3><button type="button" aria-label="关闭说明">×</button></header><div class="effect-guide-grid"></div>';
    const grid=dialog.querySelector('.effect-guide-grid');
    for(const[name,color,text]of entries){const section=document.createElement('section');section.style.setProperty('--guide-color',color);const h=document.createElement('h4');h.textContent=name;const p=document.createElement('p');p.textContent=text;section.append(h,p);grid.append(section);}
    dialog.querySelector('button').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});document.body.append(dialog);dialog.showModal();
  });
})();
