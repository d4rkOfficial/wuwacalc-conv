/* Matrix fixed tokens S1-1 through S2-3; class 6/Z4 adds internally. */
(function () {
  'use strict';
  const wc = window.__WC;
  const periods = [
    {
      "id": "S1-1",
      "name": "S1第一阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/6"
    },
    {
      "id": "S1-2",
      "name": "S1第二阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/8"
    },
    {
      "id": "S1-3",
      "name": "S1第三阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/10"
    },
    {
      "id": "S2-1",
      "name": "S2第一阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/12"
    },
    {
      "id": "S2-2",
      "name": "S2第二阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/14"
    },
    {
      "id": "S2-3",
      "name": "S2第三阶段",
      "sourcePage": "https://ww.nanoka.cc/newtower/16"
    }
  ];
  const presets = [
    {"id":"c14","source":"fixed","period":"S1-1","name":"异常效应强化","gameText":"角色附加异常效应时，使目标受到最终伤害提升20%，持续30秒；敌人受到的光噪效应最终伤害提升50%。","effects":[{"key":"e1","name":"异常触发：敌方全伤最终提升","value":20,"recipient":"enemy","trigger":"附加异常效应","duration":30},{"key":"e2","name":"光噪效应最终提升","value":50,"recipient":"enemy","damageType":"效应","effectType":"光噪"}]},
    {"id":"c15","source":"fixed","period":"S1-1","name":"声骸技能强化","gameText":"我方声骸技能最终伤害提升40%，气动最终伤害提升20%。","effects":[{"key":"e1","name":"声骸最终提升","value":40,"recipient":"team","damageType":"声骸"},{"key":"e2","name":"气动最终提升","value":20,"recipient":"team","element":"气动"}]},
    {"id":"c16","source":"fixed","period":"S1-1","name":"谐度破坏强化","gameText":"角色附加震谐·偏移状态时，最终伤害提升20%，造成震谐最终伤害提升200%，持续15秒。\n角色附加集谐·偏移状态时，最终伤害提升50%，持续15秒。","effects":[{"key":"e1","name":"震谐偏移触发：自身全伤最终提升","value":20,"recipient":"triggerActor","trigger":"附加震谐·偏移","duration":15},{"key":"e2","name":"震谐偏移触发：震谐最终提升","value":200,"recipient":"triggerActor","damageType":"处决","damageMechanism":"shock","trigger":"附加震谐·偏移","duration":15},{"key":"e3","name":"集谐偏移触发：自身全伤最终提升","value":50,"recipient":"triggerActor","trigger":"附加集谐·偏移","duration":15}]},
    {"id":"c17","source":"fixed","period":"S1-1","name":"通用强化","gameText":"敌人受到最终伤害提升20%，敌人受到重击最终伤害提升20%。","effects":[{"key":"e1","name":"敌方全伤最终提升","value":20,"recipient":"enemy"},{"key":"e2","name":"敌方重击最终提升","value":20,"recipient":"enemy","damageType":"重击"}]},
    {"id":"c18","source":"fixed","period":"S1-2","name":"异常效应强化","gameText":"角色附加异常效应时，使目标受到最终伤害提升20%，受到冷凝最终伤害提升30%，持续30秒；\n敌人受到霜渐和聚爆效应最终伤害提升80%。","effects":[{"key":"e1","name":"异常触发：敌方全伤最终提升","value":20,"recipient":"enemy","trigger":"附加异常效应","duration":30},{"key":"e2","name":"异常触发：敌方冷凝最终提升","value":30,"recipient":"enemy","element":"冷凝","trigger":"附加异常效应","duration":30},{"key":"e3","name":"霜渐效应最终提升","value":80,"recipient":"enemy","damageType":"效应","effectType":"霜渐"},{"key":"e4","name":"聚爆效应最终提升","value":80,"recipient":"enemy","damageType":"效应","effectType":"聚爆"}]},
    {"id":"c19","source":"fixed","period":"S1-2","name":"声骸技能强化","gameText":"我方声骸技能最终伤害提升20%，湮灭最终伤害提升20%，共鸣技能最终伤害提升20%。","effects":[{"key":"e1","name":"声骸最终提升","value":20,"recipient":"team","damageType":"声骸"},{"key":"e2","name":"湮灭最终提升","value":20,"recipient":"team","element":"湮灭"},{"key":"e3","name":"共鸣技能最终提升","value":20,"recipient":"team","damageType":"共鸣技能"}]},
    {"id":"c20","source":"fixed","period":"S1-2","name":"谐度破坏强化","gameText":"角色附加谐度·偏移状态时，全队最终伤害提升20%，持续30秒。角色附加集谐·偏移状态时，最终伤害提升30%，持续15秒。","effects":[{"key":"e1","name":"谐度偏移触发：全队全伤最终提升","value":20,"recipient":"team","trigger":"附加谐度·偏移","duration":30},{"key":"e2","name":"集谐偏移触发：自身全伤最终提升","value":30,"recipient":"triggerActor","trigger":"附加集谐·偏移","duration":15}]},
    {"id":"c21","source":"fixed","period":"S1-2","name":"通用强化","gameText":"敌人受到最终伤害提升20%，受到共鸣解放最终伤害提升20%。","effects":[{"key":"e1","name":"敌方全伤最终提升","value":20,"recipient":"enemy"},{"key":"e2","name":"敌方共鸣解放最终提升","value":20,"recipient":"enemy","damageType":"共鸣解放"}]},
    {"id":"c22","source":"fixed","period":"S1-3","name":"异常效应强化","gameText":"共鸣者附加异常效应时，使目标受到伤害最终提升20%，持续30秒；\n敌人受到霜渐效应和聚爆效应伤害最终提升80%。","effects":[{"key":"e1","name":"异常触发：敌方全伤最终提升","value":20,"recipient":"enemy","trigger":"附加异常效应","duration":30},{"key":"e2","name":"霜渐效应最终提升","value":80,"recipient":"enemy","damageType":"效应","effectType":"霜渐"},{"key":"e3","name":"聚爆效应最终提升","value":80,"recipient":"enemy","damageType":"效应","effectType":"聚爆"}]},
    {"id":"c23","source":"fixed","period":"S1-3","name":"声骸技能强化","gameText":"我方声骸技能伤害最终提升40%，气动伤害最终提升20%。","effects":[{"key":"e1","name":"声骸最终提升","value":40,"recipient":"team","damageType":"声骸"},{"key":"e2","name":"气动最终提升","value":20,"recipient":"team","element":"气动"}]},
    {"id":"c24","source":"fixed","period":"S1-3","name":"骇破强化","gameText":"共鸣者附加谐度·偏移状态时，全队伤害最终提升20%，持续30秒。\n共鸣者附加骇破·偏移状态时，造成伤害最终提升30%，持续30秒。","effects":[{"key":"e1","name":"谐度偏移触发：全队全伤最终提升","value":20,"recipient":"team","trigger":"附加谐度·偏移","duration":30},{"key":"e2","name":"骇破偏移触发：自身全伤最终提升","value":30,"recipient":"triggerActor","trigger":"附加骇破·偏移","duration":30}]},
    {"id":"c25","source":"fixed","period":"S1-3","name":"通用强化","gameText":"敌人受到伤害最终提升20%，敌人受到普攻伤害最终提升20%。","effects":[{"key":"e1","name":"敌方全伤最终提升","value":20,"recipient":"enemy"},{"key":"e2","name":"敌方普攻最终提升","value":20,"recipient":"enemy","damageType":"普攻"}]},
    {"id":"c26","source":"fixed","period":"S2-1","name":"异常效应强化","gameText":"角色附加异常效应时，使目标受到伤害最终提升25%，持续30秒。\n角色附加虚湮效应时，自身造成伤害最终提升30%，持续15秒。","effects":[{"key":"e1","name":"异常触发：敌方全伤最终提升","value":25,"recipient":"enemy","trigger":"附加异常效应","duration":30},{"key":"e2","name":"虚湮触发：自身全伤最终提升","value":30,"recipient":"triggerActor","trigger":"附加虚湮效应","duration":15}]},
    {"id":"c27","source":"fixed","period":"S2-1","name":"声骸技能强化","gameText":"我方声骸技能伤害最终提升30%，热熔伤害最终提升20%，重击伤害最终提升20%。","effects":[{"key":"e1","name":"声骸最终提升","value":30,"recipient":"team","damageType":"声骸"},{"key":"e2","name":"热熔最终提升","value":20,"recipient":"team","element":"热熔"},{"key":"e3","name":"重击最终提升","value":20,"recipient":"team","damageType":"重击"}]},
    {"id":"c28","source":"fixed","period":"S2-1","name":"谐度破坏强化","gameText":"角色震谐伤害最终提升150%。\n角色附加谐度·偏移状态时，伤害最终提升25%，持续30秒。","effects":[{"key":"e1","name":"震谐最终提升","value":150,"recipient":"team","damageType":"处决","damageMechanism":"shock"},{"key":"e2","name":"谐度偏移触发：自身全伤最终提升","value":25,"recipient":"triggerActor","trigger":"附加谐度·偏移","duration":30}]},
    {"id":"c29","source":"fixed","period":"S2-1","name":"通用强化","gameText":"敌人受到伤害最终提升20%，敌人受到共鸣技能伤害最终提升20%。","effects":[{"key":"e1","name":"敌方全伤最终提升","value":20,"recipient":"enemy"},{"key":"e2","name":"敌方共鸣技能最终提升","value":20,"recipient":"enemy","damageType":"共鸣技能"}]},
    {"id":"c30","source":"fixed","period":"S2-2","name":"异常效应强化","gameText":"角色附加异常效应时，使目标受到伤害最终提升25%，持续30秒；\n敌人受到霜渐效应伤害最终提升80%。","effects":[{"key":"e1","name":"异常触发：敌方全伤最终提升","value":25,"recipient":"enemy","trigger":"附加异常效应","duration":30},{"key":"e2","name":"霜渐效应最终提升","value":80,"recipient":"enemy","damageType":"效应","effectType":"霜渐"}]},
    {"id":"c31","source":"fixed","period":"S2-2","name":"声骸技能强化","gameText":"我方声骸技能伤害最终提升30%，湮灭伤害最终提升20%，共鸣技能伤害最终提升20%。","effects":[{"key":"e1","name":"声骸最终提升","value":30,"recipient":"team","damageType":"声骸"},{"key":"e2","name":"湮灭最终提升","value":20,"recipient":"team","element":"湮灭"},{"key":"e3","name":"共鸣技能最终提升","value":20,"recipient":"team","damageType":"共鸣技能"}]},
    {"id":"c32","source":"fixed","period":"S2-2","name":"谐度破坏强化","gameText":"角色附加谐度·偏移状态时，全队伤害最终提升25%，持续30秒。角色附加集谐·偏移状态时，伤害最终提升30%，持续15秒。","effects":[{"key":"e1","name":"谐度偏移触发：全队全伤最终提升","value":25,"recipient":"team","trigger":"附加谐度·偏移","duration":30},{"key":"e2","name":"集谐偏移触发：自身全伤最终提升","value":30,"recipient":"triggerActor","trigger":"附加集谐·偏移","duration":15}]},
    {"id":"c33","source":"fixed","period":"S2-2","name":"通用强化","gameText":"敌人受到伤害最终提升20%，敌人受到重击伤害最终提升20%。","effects":[{"key":"e1","name":"敌方全伤最终提升","value":20,"recipient":"enemy"},{"key":"e2","name":"敌方重击最终提升","value":20,"recipient":"enemy","damageType":"重击"}]},
    {"id":"c34","source":"fixed","name":"异常效应强化","gameText":"角色附加异常效应时，使目标受到最终伤害提升25%，受到导电最终伤害额外提升30%，持续30秒。","effects":[{"key":"all","name":"目标最终伤害","value":25,"recipient":"enemy","duration":30,"trigger":"附加异常效应"},{"key":"electro","name":"目标导电最终伤害","value":30,"element":"导电","recipient":"enemy","duration":30,"trigger":"附加异常效应"}],"period":"S2-3"},
    {"id":"c35","source":"fixed","name":"基础伤害强化","gameText":"声骸技能伤害最终提升40%；\n角色响应同奏时，造成伤害最终提升55%，持续30秒；\n角色获得护盾时造成的最终伤害提升11%，最大可叠加5层，持续2秒，角色下场时清空；","effects":[{"key":"echo","name":"声骸最终伤害","value":40,"damageType":"声骸","recipient":"team"},{"key":"tongzou","name":"响应同奏后最终伤害","value":55,"recipient":"triggerActor","duration":30,"trigger":"响应同奏"},{"key":"shield","name":"获盾后最终伤害","value":11,"recipient":"triggerActor","duration":2,"maxStacks":5,"clear":"下场清空","trigger":"获得护盾"}],"period":"S2-3"},
    {"id":"c36","source":"fixed","name":"谐度破坏强化","gameText":"角色附加谐度·偏移状态时，全队伤害最终提升25%，持续30秒。\n角色附加骇破·偏移状态时，造成伤害最终提升30%，持续30秒。","effects":[{"key":"offset","name":"谐度偏移后全队最终伤害","value":25,"recipient":"team","duration":30,"trigger":"附加谐度·偏移"},{"key":"havoc","name":"骇破偏移后自身最终伤害","value":30,"recipient":"triggerActor","duration":30,"trigger":"附加骇破·偏移"}],"period":"S2-3"},
    {"id":"c37","source":"fixed","name":"通用强化","gameText":"敌人受到伤害最终提升20%，敌人受到普攻伤害最终提升20%。","effects":[{"key":"all","name":"目标最终伤害","value":20,"recipient":"enemy"},{"key":"basic","name":"目标普攻最终伤害","value":20,"damageType":"普攻","recipient":"enemy"}],"period":"S2-3"},
    {"id":"boss602850001","source":"boss","name":"封庭械囿","gameText":"半径100米内的敌方目标获得护盾时，封庭械囿受到的最终伤害提升10%，持续6秒，每0.5秒可触发一次，最多可叠加4层。","effects":[{"key":"shield","name":"获盾触发承伤","value":10,"recipient":"enemy","duration":6,"cooldown":0.5,"maxStacks":4}],"period":"S2-3"},
    {"id":"boss665850005","source":"boss","name":"天傀劫煞","gameText":"受到的电磁效应最终伤害提升100%。 被成功赋予异常效应后，受到的最终伤害提升20%。","effects":[{"key":"electro","name":"电磁效应承伤","value":100,"damageType":"效应","effectType":"电磁","recipient":"enemy"},{"key":"abnormal","name":"附加异常后承伤","value":20,"recipient":"enemy"}],"period":"S2-3"}
  ];
  presets.push(...[{"id":"boss_haiveixia","name":"海维夏","gameText":"受到的震谐伤害最终提高100%（作用于目标减伤区）。处于震谐·偏移状态下，被谐度破坏命中时，受到的伤害最终提升15%（8类加深），持续15秒。","effects":[{"key":"shock","name":"震谐承伤·目标减伤区","value":100,"recipient":"enemy","zoneClass":2,"damageType":"处决","damageMechanism":"shock"},{"key":"break","name":"偏移破坏后承伤·第8类","value":15,"recipient":"enemy","zoneClass":8,"trigger":"震谐·偏移下被谐度破坏命中","duration":15}],"source":"boss","period":"boss"},{"id":"boss_luxinjihai","name":"炉芯机骸","gameText":"若炉芯机骸拥有异常效应时被破坏装甲，其受到的异常效应伤害最终提升100%（8类加深），持续30秒。","effects":[{"key":"abnormal","name":"破甲后异常效应承伤·第8类","value":100,"recipient":"enemy","zoneClass":8,"damageType":"效应","trigger":"拥有异常效应时被破坏装甲","duration":30}],"source":"boss","period":"boss"},{"id":"boss_xinjilemu","name":"辛吉勒姆","gameText":"声骸技能命中辛吉勒姆时，将为其附加一层【迷航】，最多叠加5层，同名声骸仅可触发一次。每层【迷航】使辛吉勒姆受到的最终伤害提升10%（6类最终伤害）。【迷航】达到5层时，辛吉勒姆受到最终伤害额外提升30%（6类最终伤害）。\n矩阵S1第一期额外规则：辛吉勒姆受到的伤害降低25%。站长确认此项归第8类，仅作为本场景独立可选项，不代表通用常驻减伤。来源：https://ww.nanoka.cc/newtower/6","effects":[{"key":"maze","name":"迷航承伤·第6类","value":10,"recipient":"enemy","maxStacks":5,"fullStackBonus":30,"trigger":"声骸技能命中，同名声骸仅一次；满5层额外30%"},{"key":"s1_reduction","name":"矩阵S1第一期承伤降低·第8类","value":-25,"zoneClass":8,"recipient":"enemy","trigger":"仅矩阵S1第一期，手动选择对应场景"}],"source":"boss","period":"boss"},{"id":"boss_wuming","name":"无铭探索者","gameText":"受到【集谐·干涉】效果的层数上限增加2层（额外效果，不经过角色【集谐干涉上限】）。当无铭探索者处于集谐·偏移的状态时被谐度破坏命中，将被额外附加1层【集谐·干涉】。每层【集谐·干涉】将使无铭探索者受到的最终伤害额外提升4%（6类最终伤害，上限10层）。","effects":[{"key":"interference","name":"干涉承伤·第6类","value":4,"recipient":"enemy","maxStacks":10,"trigger":"附有集谐·干涉"}],"source":"boss","period":"boss"},{"id":"boss_dania","name":"达妮娅","gameText":"受到异常效应类型伤害提升50%（6类最终伤害）。被霜结后，受到的最终伤害提升20%（6类最终伤害），持续15秒。","effects":[{"key":"effect","name":"异常效应承伤·第6类","value":50,"recipient":"enemy","damageType":"效应"},{"key":"frost","name":"霜结后承伤·第6类","value":20,"recipient":"enemy","trigger":"被霜结","duration":15}],"source":"boss","period":"boss"},{"id":"boss_qianyanchonglou","name":"千魇重楼","gameText":"【集谐·干涉】层数达到3～6层时，受到的最终伤害提升25%。站长确认：第6类，与矩阵信物同区相加。","effects":[{"key":"interference","name":"3～6层干涉承伤·第6类","value":25,"recipient":"enemy","trigger":"集谐·干涉为3～6层"}],"source":"boss","period":"boss"},{"id":"boss_wanquelao","name":"万阕牢·朽躯","gameText":"被成功赋予虚湮效应时，受到的最终伤害提升15%（6类最终伤害），最多可叠加5层，持续20秒。拥有的虚湮效应被移除时，受到的最终伤害提升30%（6类最终伤害），持续30秒。","effects":[{"key":"apply","name":"赋予虚湮后承伤·第6类","value":15,"recipient":"enemy","maxStacks":5,"trigger":"被成功赋予虚湮效应","duration":20},{"key":"remove","name":"移除虚湮后承伤·第6类","value":30,"recipient":"enemy","trigger":"虚湮效应被移除","duration":30}],"source":"boss","period":"boss"}]);
  presets.push(...[{"id":"boss_impermanence_heron","source":"boss","period":"boss","name":"无常凶鹭","gameText":"受到的最终伤害提升10%（第6类），常驻。","effects":[{"key":"all","name":"常驻承伤","value":10,"zoneClass":6,"recipient":"enemy","unconditional":true}]},{"id":"boss_crownless","source":"boss","period":"boss","name":"无冠者","gameText":"角色同奏入场且对目标造成伤害时，30秒内对该目标造成的伤害最终提升40%（6类最终伤害）。","effects":[{"key":"tongzou_entry","name":"同奏入场命中后承伤","value":40,"zoneClass":6,"recipient":"triggerActor","trigger":"同奏入场且对目标造成伤害","duration":30}]}]);
  presets.push({"id":"boss_feilian_beringal","source":"boss","period":"boss","name":"飞廉之猩","gameText":"受到谐度破坏伤害后，伤害减免-12.5%，冷却2秒，上限4层。降低目标伤害减免，按目标减伤区承伤增加12.5%/层结算，满4层50%；层数手动填写。","effects":[{"key":"break_reduction","name":"谐度破坏后减免降低","value":12.5,"zoneClass":2,"recipient":"enemy","trigger":"受到谐度破坏伤害","cooldown":2,"maxStacks":4}]});
  const bossImages = {"boss602850001":{"monsterId":"320000680","name":"封庭械囿","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_32068_UI.webp"},"boss_dania":{"monsterId":"340000280","name":"达妮娅","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34028_UI.webp"},"boss_impermanence_heron":{"monsterId":"330000030","name":"无常凶鹭","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_995_UI.webp"},"boss_haiveixia":{"monsterId":"340000210","name":"海维夏","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34021_UI.webp"},"boss_qianyanchonglou":{"monsterId":"340000310","name":"千傀重楼","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34031_UI.webp"},"boss_luxinjihai":{"monsterId":"340000220","name":"炉芯机骸","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34022_UI.webp"},"boss_wuming":{"monsterId":"340000260","name":"无铭探索者","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34026_UI.webp"},"boss_xinjilemu":{"monsterId":"340000250","name":"辛吉勒姆","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34025_UI.webp"},"boss665850005":{"monsterId":"340000320","name":"天傀劫煞","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34032_UI.webp"},"boss_wanquelao":{"monsterId":"340000300","name":"万囮牢·朽躯","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_34030_UI.webp"},"boss_crownless":{"monsterId":"340000010","name":"无冠者","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_999_UI.webp"},"boss_feilian_beringal":{"monsterId":"330000050","name":"飞廉之猩","url":"https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconMonsterHead/T_IconMonsterHead_996_UI.webp"}};
  presets.filter(p => p.source === 'boss').forEach(p => {
    const image = bossImages[p.id];
    p.image = image.url;
    p.monsterId = image.monsterId;
    p.name = image.name;
  });
  let source = 'fixed', query = '', period = '';
  const esc = value => wc.escapeHtml(String(value ?? ''));
  const buffId = (p, e) => 'matrix_' + p.period.toLowerCase().replace('-', '_') + '_' + p.id + '_' + e.key;
  function scopeLabel(effect) {
    if (effect.damageMechanism === 'shock') return '震谐特殊技能';
    if (effect.effectType) return effect.effectType + '效应';
    return effect.element || effect.damageType || '全伤害';
  }
  function render() {
    const shared = wc.ensureTeamSharedBuffs();
    const selected = presets.find(p => p.source === 'fixed' && p.effects.some(e => shared.buffs.some(b => b.id === buffId(p,e))));
    if (!period) period = selected?.period || 'S2-3';
    const currentPeriod = periods.find(p => p.id === period);
    const season = period.split('-')[0];
    const seasonPeriods = periods.filter(p => p.id.startsWith(season + '-'));
    const seasons = [...new Set(periods.map(p => p.id.split('-')[0]))];
    const list = presets.filter(p => p.source === source && (source !== 'fixed' || p.period === period) && (p.name + p.gameText).includes(query.trim()));
    return '<section class="matrix-buff-panel" data-matrix-source-view="' + source + '" aria-label="矩阵 Buff"><header><div><small>' + (source === 'fixed' ? esc(currentPeriod.name) + ' / 奇点扩张' : 'Boss 自带') + '</small><h2>' + (source === 'fixed' ? '矩阵 Buff' : 'Boss Buff') + '</h2><p>' + (source === 'fixed' ? '选择信物后，在全队 Buff 中分配覆盖。' : '添加后，在全队 Buff 中分配覆盖。') + '</p></div><span class="matrix-buff-zone">' + (source === 'fixed' ? '第 6 类易伤 · 同区相加' : '同区加算 · 异区乘算') + '</span></header>' +
      '<div class="matrix-buff-toolbar"><div role="group" aria-label="矩阵 Buff 来源">' +
      [['fixed','固定信物'],['boss','Boss 自带']].map(([key,label]) => '<button type="button" data-matrix-source="' + key + '" aria-pressed="' + (key === source) + '">' + label + '</button>').join('') +
      '</div>' + (source === 'fixed' ? '<div class="matrix-buff-filters"><label>赛季<select data-matrix-season aria-label="矩阵信物赛季">' + seasons.map(key => '<option value="' + key + '"' + (key === season ? ' selected' : '') + '>' + key + '</option>').join('') + '</select></label><label>期次<select data-matrix-period aria-label="矩阵信物期次">' + seasonPeriods.map(p => '<option value="' + p.id + '"' + (p.id === period ? ' selected' : '') + '>' + esc(p.name.replace(/^S\d+/, '')) + '</option>').join('') + '</select></label></div>' : '') + '<label>搜索 Buff<input type="search" data-matrix-query value="' + esc(query) + '" placeholder="名称或原文"></label></div>' +
      (source === 'fixed' && selected ? '<p class="hint" data-matrix-selected>当前信物：' + esc(periods.find(p => p.id === selected.period).name) + ' · ' + esc(selected.name) + '</p>' : '') +
      '<div class="matrix-buff-list">' +
      (list.map(p => {
        const present = p.effects.some(e => shared.buffs.some(b => b.id === buffId(p,e)));
        const missing = p.effects.some(e => !shared.buffs.some(b => b.id === buffId(p,e)));
        const otherFixed = p.source === 'fixed' && presets.some(other => other.source === 'fixed' && other.id !== p.id && other.effects.some(e => shared.buffs.some(b => b.id === buffId(other,e))));
        const label = p.source === 'fixed' ? (otherFixed ? '切换信物' : '选择信物') : '添加';
        const select = missing || otherFixed ? '<button type="button" class="btn sm primary" data-matrix-add="' + p.id + '">' + label + '</button>' : '';
        const cancel = present ? '<button type="button" class="btn sm" data-matrix-remove="' + p.id + '">' + (p.source === 'fixed' ? '取消选择' : '移除') + '</button>' : '';
        const title = '<h3>' + esc(p.name) + (present ? ' · 已添加' : '') + '</h3>';
        const identity = p.source === 'boss' ? '<div class="matrix-boss-identity"><img src="' + esc(p.image) + '" alt="" width="52" height="52" loading="lazy" decoding="async">' + title + '</div>' : title;
        return '<article data-matrix-preset="' + p.id + '"><div class="matrix-buff-card-head">' + identity + '<div class="matrix-buff-card-actions">' + select + cancel + '</div></div>' +
          '<ul>' + p.effects.map(e => '<li><strong>' + esc(p.source === 'boss' ? e.name.replace(/·(?:第[68]类|目标减伤区)/g, '') : e.name) + ' ' + (e.value > 0 ? '+' : '') + e.value + '%' + (e.maxStacks ? '/层 · 最多 ' + e.maxStacks + ' 层' : '') + (e.fullStackBonus ? ' · 满层额外 +' + e.fullStackBonus + '%' : '') + '</strong><span>' + esc(scopeLabel(e)) + ' · ' + (e.zoneClass === 2 ? '目标减伤区' : '第' + (e.zoneClass || 6) + '类') + (p.source === 'boss' ? (e.unconditional ? ' · 常驻' : e.recipient === 'triggerActor' ? ' · 仅触发角色' : '') : e.trigger ? ' · ' + esc(e.trigger) + '后' : !e.duration ? ' · 无触发前提' : '') + (e.duration ? ' · ' + e.duration + ' 秒' : '') + (e.clear ? ' · ' + esc(e.clear) : '') + '</span></li>').join('') + '</ul>' +
          '<details><summary>原文与触发条件</summary><p class="matrix-buff-game-text">' + esc(p.gameText) + '</p><p class="hint">自身增益请只勾选触发角色；Boss 效果请只覆盖对应敌人的伤害。时间与触发由手动覆盖表达。</p></details></article>';
      }).join('') || '<p class="hint">没有匹配的 Buff。</p>') +
      '</div><p class="hint">筛选不改变已有覆盖。切换信物会清除旧信物覆盖与叠层；新信物默认关闭、0层。</p></section>';
  }
  function purgeRemovedMatrixReferences(ids) {
    const removed = new Set(ids.flatMap(id => [id, wc.makeTeamMirrorBuffId(id)]));
    const matches = key => typeof key === 'string' && (removed.has(key) || removed.has(key.split('::')[0]));
    const visited = new WeakSet();
    const walk = value => {
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          if (matches(value[i]?.id)) value.splice(i, 1);
          else walk(value[i]);
        }
      } else {
        for (const key of Object.keys(value)) {
          if (matches(key)) delete value[key];
          else walk(value[key]);
        }
      }
    };
    // Only removed matrix identities; include dormant axes and signature remapping records.
    [...wc.state.members, ...wc.state.specialSkills.characters, ...wc.state.specialSkills.items].forEach(walk);
  }
  function removePresetBuffs(preset) {
    const shared = wc.ensureTeamSharedBuffs();
    const ids = preset.effects.map(effect => buffId(preset, effect)).filter(id => shared.buffs.some(b => b.id === id));
    wc.ensureSpecialSkillsState();
    for (const id of ids) {
      wc.deleteTeamSharedBuff(id);
      const mirrorId = wc.makeTeamMirrorBuffId(id);
      // 取消覆盖会保留叠层；即使已无镜像，也要通过正常清理函数移除这些隐藏引用。
      for (const target of [...wc.state.members, ...wc.state.specialSkills.characters]) {
        wc.purgeMemberBuffReferences(target, mirrorId, {allRounds:true});
        target.excludedTeamBuffIds = (target.excludedTeamBuffIds || []).filter(value => value !== id);
        target.manuallyExcludedTeamBuffIds = (target.manuallyExcludedTeamBuffIds || []).filter(value => value !== id);
      }
      wc.state.specialSkills.characters.forEach((_, index) => wc.purgeSpecialSkillItemBuffReferences(mirrorId, index));
    }
    if (ids.length) purgeRemovedMatrixReferences(ids);
    return ids.length;
  }
  function remove(id) {
    const preset = presets.find(p => p.id === id);
    if (!preset || !removePresetBuffs(preset)) return false;
    wc.syncTeamBuffsToMembers();
    wc.render(); wc.saveState();
    return true;
  }
  function add(id) {
    const preset = presets.find(p => p.id === id);
    if (!preset) return false;
    const shared = wc.ensureTeamSharedBuffs(), added = [];
    let removed = 0;
    if (preset.source === 'fixed') {
      for (const other of presets.filter(p => p.source === 'fixed' && p.id !== id)) removed += removePresetBuffs(other);
    }
    preset.effects.forEach(effect => {
      const id = buffId(preset,effect);
      if (shared.buffs.some(b => b.id === id)) return;
      const buff = wc.normalizeBuff({
        id, category:'matrixFinal', sourceTag:'matrixBuff', templateKey:id,
        name:(preset.source === 'boss' ? '【Boss】' : '【矩阵·' + periods.find(p => p.id === preset.period).name + '】') + preset.name + ' · ' + effect.name,
        gameText:preset.gameText, mode:effect.maxStacks ? 'stack' : 'fixed', value:effect.value,
        perStack:effect.maxStacks ? effect.value : 0, maxStacks:effect.maxStacks || 1,
        clampStacks:!!effect.maxStacks, element:effect.element || '',
        damageType:effect.damageType || '', effectType:effect.effectType || '',
        matrixSource:{zoneClass:effect.zoneClass ?? 6,fullStackBonus:effect.fullStackBonus || 0,period:preset.period,sourceType:preset.source,presetId:preset.id,recipient:effect.recipient,duration:effect.duration || null,cooldown:effect.cooldown || null,clear:effect.clear || null,...(effect.trigger ? {trigger:effect.trigger} : {}),...(effect.damageMechanism ? {damageMechanism:effect.damageMechanism} : {})}
      });
      shared.buffs.push(buff); shared.globalBuffActive[id] = false;
      if (effect.maxStacks) shared.globalBuffStacks[id] = 0;
      added.push(id);
    });
    if (!added.length && !removed) return false;
    wc.ensureSpecialSkillsState();
    for (const target of [...wc.state.members, ...wc.state.specialSkills.characters]) {
      for (const id of added) wc.excludeTeamBuffFromTarget(target, id);
    }
    wc.syncTeamBuffsToMembers();
    wc.buffCheckView = {...wc.buffCheckView,view:'team'};
    wc.render(); wc.saveState();
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-team-buff-focus]')].find(el => added.includes(el.dataset.teamBuffFocus));
      if (target) {
        target.classList.add('matrix-buff-added'); target.scrollIntoView({block:'center'});
        target.focus?.();
      }
    });
    return true;
  }
  wc.MatrixBuff = Object.freeze({matches:wc.matchesMatrixFinalBuff,sum:wc.sumMatrixFinalPct,render,add,remove,getPresets:()=>JSON.parse(JSON.stringify(presets))});
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-matrix-source],[data-matrix-add],[data-matrix-remove],[data-buff-view-choice]');
    if (!button) return;
    const view = button.dataset.buffViewChoice;
    if (view && !['team','stats','matrix','environment'].includes(view)) return;
    event.stopImmediatePropagation();
    if (button.dataset.matrixRemove) { remove(button.dataset.matrixRemove); return; }
    if (button.dataset.matrixAdd) { add(button.dataset.matrixAdd); return; }
    if (button.dataset.matrixSource) { source = button.dataset.matrixSource; wc.render(); return; }
    wc.buffCheckView = {...wc.buffCheckView,view}; wc.render();
  }, true);
  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-matrix-season]')) {
      const nextPeriods = periods.filter(p => p.id.startsWith(event.target.value + '-'));
      if (!nextPeriods.length) return;
      period = nextPeriods.find(p => p.id.split('-')[1] === period.split('-')[1])?.id || nextPeriods[0].id;
      wc.render();
      document.querySelector('[data-matrix-season]')?.focus();
      return;
    }
    if (!event.target.matches?.('[data-matrix-period]')) return;
    if (!periods.some(p => p.id === event.target.value && p.id.split('-')[0] === period.split('-')[0])) return;
    period = event.target.value;
    wc.render();
    document.querySelector('[data-matrix-period]')?.focus();
  });
  document.addEventListener('input', event => {
    if (!event.target.matches?.('[data-matrix-query]')) return;
    query = event.target.value; wc.render();
    document.querySelector('[data-matrix-query]')?.focus();
  });
})();
