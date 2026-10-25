(function () {
// Extracted from monolithic app.js — load order: core → buff-templates → ui
const DEF_CONST = 1520;
/**
 * 游戏伤害唯一取整节点：全乘区浮点连乘完成后向下取整（舍弃小数，不四舍五入）。
 * 分段/多次伤害：每一段独立 Floor，再求和或 × 次数。
 */
function floorGameDamage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
/** 抗性乘区：基抗 = 1-怪物抗性%；加减抗后若超过 100%，超出部分减半 */
function calcResistanceMultiplier(monsterResPct, resReducePct) {
  const base = 1 - (Number(monsterResPct) || 0) / 100;
  const reduce = (Number(resReducePct) || 0) / 100;
  const raw = base + reduce;
  if (raw <= 1) return raw;
  return 1 + (raw - 1) / 2;
}
const EXECUTION_BASE = 10027;
const EFFECT_BASE = 3674;
const EFFECT_TYPE_LIST = ['聚爆', '光噪', '霜渐', '电磁', '风蚀'];
/** 效应类型 → 属性（光噪=衍射、风蚀=气动、霜渐=冷凝、电磁=导电、聚爆=热熔）
 * 特殊技能效应伤害按此属性匹配属性减抗（elementResReduce）等 */
const EFFECT_TYPE_ELEMENT = {
  '聚爆': '热熔',
  '光噪': '衍射',
  '霜渐': '冷凝',
  '电磁': '导电',
  '风蚀': '气动',
};
const EFFECT_LAYER_MIN = 1;
const EFFECT_LAYER_MAX = 16;
const EFFECT_BURST_LAYER_MIN = 0;
const EFFECT_LAYER_DEFAULT = 13;
// 各效应类型在不同层数下的基础倍率（%）
const EFFECT_LAYER_MULTS = Object.fromEntries(
  EFFECT_TYPE_LIST.map((type) => [
    type,
    Object.fromEntries(Array.from({ length: EFFECT_LAYER_MAX }, (_, i) => [i + 1, 0])),
  ])
);
Object.assign(EFFECT_LAYER_MULTS['光噪'], {
  1: 30,
  2: 54.39,
  3: 78.78,
  4: 103.17,
  5: 127.56,
  6: 151.95,
  7: 176.34,
  8: 200.73,
  9: 225.12,
  10: 249.51,
  11: 332.68,
  12: 415.85,
  13: 499.02,
  14: 582.19,
  15: 665.36,
  16: 748.53,
});
Object.assign(EFFECT_LAYER_MULTS['聚爆'], {
  1: 84,
  2: 152.29,
  3: 220.58,
  4: 288.88,
  5: 357.17,
  6: 425.46,
  7: 493.75,
  8: 562.04,
  9: 630.34,
  10: 698.63,
  11: 931.5,
  12: 1164.38,
  13: 1397.26,
  14: 1630.13,
  15: 1863.01,
  16: 2095.88,
});
Object.assign(EFFECT_LAYER_MULTS['风蚀'], {
  1: 45,
  2: 112.5,
  3: 225,
  4: 337.5,
  5: 450,
  6: 562.5,
  7: 675,
  8: 787.5,
  9: 900,
  10: 1012.5,
  11: 1125,
  12: 1237.5,
  13: 1350,
  14: 1462.5,
  15: 1575,
  16: 1687.5,
});
Object.assign(EFFECT_LAYER_MULTS['霜渐'], {
  1: 24.5,
  2: 44.42,
  3: 64.34,
  4: 84.26,
  5: 104.17,
  6: 124.09,
  7: 144.01,
  8: 163.93,
  9: 183.85,
  10: 203.77,
  11: 271.69,
  12: 339.61,
  13: 407.53,
  14: 475.46,
  15: 543.38,
  16: 611.3,
});
// 电磁爆发倍率（按爆发层数查表，与电磁层数倍率相加）
const EFFECT_ELECTRO_BURST_LAYER_MULTS = Object.fromEntries(
  Array.from({ length: EFFECT_LAYER_MAX }, (_, i) => [i + 1, 0])
);
const ELECTRO_LAYER_MULT_DATA = {
  1: 50,
  2: 90.65,
  3: 131.3,
  4: 171.95,
  5: 212.6,
  6: 253.25,
  7: 293.9,
  8: 334.55,
  9: 375.2,
  10: 415.85,
  11: 554.47,
  12: 693.08,
  13: 831.7,
  14: 970.32,
  15: 1108.93,
  16: 1247.55,
};
Object.assign(EFFECT_LAYER_MULTS['电磁'], ELECTRO_LAYER_MULT_DATA);
Object.assign(EFFECT_ELECTRO_BURST_LAYER_MULTS, ELECTRO_LAYER_MULT_DATA);

function isElectroEffectItem(item) {
  return item?.kind === 'effect' && item.effectType === '电磁';
}

const SPECIAL_SKILL_KINDS = {
  execution: { label: '处决', enabled: true },
  effect: { label: '效应', enabled: true },
};

const DAMAGE_TYPES = ['共鸣解放', '共鸣技能', '普攻', '重击', '变奏', '延奏', '声骸', '效应', '处决', '协同攻击'];
const PALETTE_TYPE_ORDER = ['普攻', '重击', '共鸣技能', '共鸣解放', '变奏', '延奏', '声骸', '效应', '处决', '协同攻击'];
/** 官网页签（技能类型）：与伤害类型并列的第二套分组 */
const OFFICIAL_SKILL_TYPES = ['常态攻击', '共鸣技能', '共鸣回路', '共鸣解放', '变奏技能', '延奏技能'];
const PALETTE_SKILL_TYPE_ORDER = ['常态攻击', '共鸣技能', '共鸣回路', '共鸣解放', '变奏技能', '延奏技能', '未分类'];
/** 技能库 / 伤害占比：按「伤害类型」或「技能类型（官网页签）」分组 */
const SKILL_GROUP_MODE_DAMAGE = 'damageType';
const SKILL_GROUP_MODE_OFFICIAL = 'skillType';
/** 解包常无此标签；指定技能名 / 含「协同攻击」的技能同时视为协同攻击 */
const COORD_ATTACK_DAMAGE_TYPE = '协同攻击';

const CHAR_SKILL_DB_URL = 'character-skills.json?v=433aa7767e';
const CHAR_SKILL_DB_CACHE_KEY = 'charSkillDbCache-v67';
/** 漂泊者男女重复：只保留女性立绘；男性 id → 女性 id */
const ROVER_MALE_TO_FEMALE_ID = {
  '1309': '1310', // 导电
  '1406': '1408', // 气动
  '1605': '1604', // 湮灭
  '1501': '1502', // 衍射
};
const ROVER_HIDDEN_MALE_IDS = new Set(Object.keys(ROVER_MALE_TO_FEMALE_ID));
/** 技能库纠错：覆盖上游/旧缓存里的错误（P7 覆盖表合一——原 4 张 *_OVERRIDES 合并）。
 * kind: 'damageType' | 'damageElement' | 'alsoAsEffect' | 'baseMult'；includes 为名称包含匹配。 */
const CHAR_SKILL_CORRECTIONS = [
  // ---- damageType（覆盖上游/旧缓存里错误的伤害类型）----
  { includes: '放逐·幻灭之形第二段', kind: 'damageType', damageType: '共鸣解放' },
  // 折枝【虚实境趣·墨鹤】：协同攻击，实为普攻伤害（不吃共鸣技能/解放加成）
  { includes: '墨鹤', kind: 'damageType', damageType: '普攻' },
  { includes: '普攻·机兵第四段', kind: 'damageType', damageType: '普攻' },
  { includes: '空中攻击·布景之形', kind: 'damageType', damageType: '普攻' },
  { includes: '燃星·空中攻击第三段', kind: 'damageType', damageType: '普攻' },
  { includes: '共鸣技能·此剑为潮浪之意·大卡', kind: 'damageType', damageType: '共鸣技能' },
  { includes: '共鸣技能·凭风斩浪破敌·大卡', kind: 'damageType', damageType: '共鸣技能' },
  // 弗洛洛【致命组歌·永生组歌】：解包为变奏，实为共鸣技能伤害
  { includes: '永生组歌', kind: 'damageType', damageType: '共鸣技能' },
  // ---- damageElement（覆盖上游/旧缓存里错误的伤害属性：漂泊者·导电·千声翻涌等）----
  { includes: '千声翻涌·衍射', kind: 'damageElement', damageElement: '衍射' },
  { includes: '千声翻涌·湮灭', kind: 'damageElement', damageElement: '湮灭' },
  { includes: '千声翻涌·剑止万律', kind: 'damageElement', damageElement: '气动' },
  { includes: '千声翻涌·气动', kind: 'damageElement', damageElement: '气动' },
  // ---- alsoAsEffect（主类型不变，额外吃效应加深等；赞妮重斩系列/卡提希娅空中攻击）----
  { includes: '重斩·破晓', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '重斩·将明', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '重斩·终夜', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '重斩·闪裂', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '集中压制', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '破袭反击', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '来日道标', kind: 'alsoAsEffect', alsoAsEffect: '光噪' },
  { includes: '以剑奉读此身·空中攻击', kind: 'alsoAsEffect', alsoAsEffect: '风蚀' },
  // ---- baseMult（覆盖上游/旧缓存里误并入链加成的基础倍率）----
  // 珂莱塔【致辞】：解包把 3 链 +1032.18% 并进基础，0 链应为 794.2%
  { includes: '致辞', characterId: '1107', kind: 'baseMult', baseMult: 794.2 },
  // 忌炎【克己】：延奏基础倍率纠错为 313.40%
  { includes: '克己', characterId: '1404', kind: 'baseMult', baseMult: 313.4 },
  // 尤诺【晦渡为明】：解包无倍率，游戏文本为 100%
  { includes: '晦渡为明', characterId: '1410', kind: 'baseMult', baseMult: 100 },
  // 丽贝卡【好搭档】：延奏基础倍率 2.5%
  { includes: '好搭档', characterId: '1308', kind: 'baseMult', baseMult: 2.5 },
  // 菲比【倾听之心】：基础倍率纠错为 528.41%
  { includes: '倾听之心', characterId: '1506', kind: 'baseMult', baseMult: 528.41 },
];
/** 仅回复协奏能量的条目（名称以该短语结尾）；上游常把能量点数误写成 baseMult */
const CONCERTO_ENERGY_UTILITY_NAME_RE = /(额外)?(恢复|回复)协奏能量$/;
const CHAR_BUFF_TEMPLATE_DB_URL = 'character-buff-templates.json?v=1516781e61';
/** 随包模板变更时抬版本，避免 localStorage 旧缓存挡住新 gameText 等字段 */
const CHAR_BUFF_TEMPLATE_DB_CACHE_KEY = 'charBuffTemplateDbCache-v194';
// C1 分片（2026-08-28）：整库 JSON → 索引 + 57 角色分片；索引 URL 带内容哈希，分片 token 由索引 sha1 提供
const CHAR_BUFF_TEMPLATE_INDEX_URL = 'character-buff-templates/index.json?v=2768a3184d';
const CHAR_BUFF_TEMPLATE_SHARD_URL = 'character-buff-templates/{id}.json';
const CHAR_BUFF_TEMPLATE_INDEX_CACHE_KEY = 'charBuffTemplateDbIndex-v194';
const CHAR_BUFF_TEMPLATE_LOCAL_KEY = 'charBuffTemplateLocalOverrides';
const CHAR_BUFF_TEMPLATE_SOURCE_TAG = 'characterTemplate';
/** 奥古斯塔：溢出暴击→暴伤转化 +【以众愿为冕】叠层（链相关上限） */
const AUGUSTA_CHAR_ID = '1306';
const AUGUSTA_SPECIAL_STACK_KEY = 'augusta_special_stacks';
const AUGUSTA_SPECIAL_MECH_KIND = 'augustaCritConvert';
/** 奥古斯塔：全队【奥古斯塔·延奏】泛用加深（本人不生效） */
const AUGUSTA_OUTRO_GENERAL_DEEP_KEY = 'augusta_outro_general_deep';
const AUGUSTA_OUTRO_GENERAL_DEEP_PCT = 15;
/** 奥古斯塔【以众愿为冕】：每层导电增伤；≥1 链每层暴伤；≥2 链每层暴击（专属面板可调） */
const AUGUSTA_CROWN_ELECTRO_PER_STACK = 15;
const AUGUSTA_CROWN_CRIT_DMG_PER_STACK = 15;
const AUGUSTA_CROWN_CRIT_DMG_MIN_RESONANCE = 1;
const AUGUSTA_CROWN_CRIT_RATE_MIN_RESONANCE = 2;
/** 奥古斯塔 3 链：指定技能倍率提升 +25% */
const AUGUSTA_C3_MULT_BOOST_KEY = 'augusta_c3_mult_boost';
const AUGUSTA_C3_MULT_BOOST_PCT = 25;
const AUGUSTA_C3_SKILLS = [
  '逐狩·重击·烁雷·后撤',
  '逐狩·闪避反击·烁雷·后撤',
  '逐狩·重击·烁雷·旋切',
  '逐狩·重击·烁雷·升拳',
  '曜阳如我·共鸣技能·不败恒阳·落袭',
  '至日的征伐·赫日威临·烈阳',
  '至日的征伐·赫日威临·不朽者之肃',
  '重击·烁雷·后撤',
  '闪避反击·烁雷·后撤',
  '重击·烁雷·旋切',
  '重击·烁雷·升拳',
  '共鸣技能·不败恒阳·落袭',
  '赫日威临·烈阳',
  '赫日威临·不朽者之肃',
];
/** 奥古斯塔 4 链：变奏后全队攻击 +20% */
const AUGUSTA_C4_TEAM_ATK_KEY = 'augusta_c4_team_atk';
const AUGUSTA_C4_TEAM_ATK_PCT = 20;
/** 奥古斯塔 6 链：怒霆（两次各 100% 攻击，合计写入 200%） */
const AUGUSTA_C6_NUTING_SKILL_KEY = 'augusta_c6_nuting';
const AUGUSTA_C6_NUTING_BASE_MULT = 200;
/** 布兰特：共鸣效率超额 → 固定攻击（戏中人生 / 我的人生） */
const BRANT_CHAR_ID = '1206';
const BRANT_SPECIAL_MECH_KIND = 'erToFlatAtk';
const BRANT_LIFE_PLAY = 'playLife';
const BRANT_LIFE_MY = 'myLife';
const BRANT_OUTRO_KEY = 'brant_outro';
/** 露帕【荣光】/【追猎】：各一条全队复合；层数随队内热熔角色数；≥3链时固定满层 */
const LUPA_CHAR_ID = '1207';
const LUPA_RONGGUANG_KEY = 'lupa_rongguang';
const LUPA_ZHUILIE_KEY = 'lupa_zhuilie';
const LUPA_OUTRO_KEY = 'lupa_outro';
/** 露帕 6 链：指定技能泛用防御（旧名「余响」） */
const LUPA_C6_DEF_KEY = 'lupa_c6_general_defense';
const LUPA_C6_DEF_LEGACY_KEY = 'tpl_mryvg2u0_5gh4i';
const LUPA_C6_DEF_NAME = '6链';
const TEAM_FUSION_STACK_SYNC = 'teamFusionCount';
const LUPA_C3_FULL_STACK_UNLOCK = 3;
/** 旧版拆条 / 误挂布兰特的 key，ensure 时剥离 */
const LUPA_LEGACY_FRAGMENT_TEAM_KEYS = new Set([
  'lupa_rongguang_full',
  'lupa_zhuilie_atk',
  'lupa_zhuilie_fusion',
  'lupa_zhuilie_fusion_full',
  'lupa_zhuilie_atk_stack',
  'brant_rongguang',
  'brant_rongguang_full',
  'brant_zhuilie_atk',
  'brant_zhuilie_fusion',
  'brant_zhuilie_fusion_full',
  'brant_zhuilie_atk_stack',
]);
const BRANT_LEGACY_LUPA_TEAM_KEYS = new Set([
  ...LUPA_LEGACY_FRAGMENT_TEAM_KEYS,
  LUPA_RONGGUANG_KEY,
  LUPA_ZHUILIE_KEY,
]);
const WEAPONS_DB_URL = 'weapons.json?v=4d8cfb52ca';
const WEAPONS_DB_CACHE_KEY = 'weaponsDbCache-v9';
const WEAPON_BUFF_ID_PREFIX = 'weapon_fx_';
const WEAPON_TEAM_BUFF_ID_PREFIX = 'weapon_team_fx_';
/** 文案写「无视防御」但实测为穿防（减防）的武器：不屈命定之冠 / 焰光裁定 / 幽冥的忘忧章 */
const WEAPON_IGNORE_DEF_AS_PEN_IDS = new Set(['21020056', '21040036', '21050066']);
const WEAPON_CHAR_SOURCE_PREFIX = 'weapon_panel_';
const CHAR_DEF_HARMONY_BREAK_AMP_SOURCE_ID = 'char_def_harmony_break_amp';
const CHAR_INNATE_HARMONY_SOURCE_TAG = 'charInnate';
const CONVERGENCE_MODE_SOURCE_TAG = 'convergenceMode';
/** 爱弥斯：模态切换写入的固有2 个人 Buff */
const AMIS_MODE_BUFF_SOURCE_TAG = 'amisCombatMode';
const AMIS_INNATE2_CRIT_KEY = 'amis_innate2_crit_dmg';
const AMIS_INNATE2_DEEP_KEY = 'amis_innate2_finale_deep';
/** 角色本体固定面板（分支等） */
const CHAR_KIT_PANEL_PREFIX = 'char_kit_panel_';
const BRANT_FLAT_ATK_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}brant_er_atk`;
const DANIA_CHAR_ID = '1211';
/** 达妮娅全队【达妮娅·延奏】泛用加深（本人不生效）；仅集谐模态 */
const DANIA_OUTRO_KEY = 'dania_outro_general_deep';
/** 非指定角色加深 */
const DANIA_OUTRO_BASE_DEEP_PCT = 15;
/** 陆·赫斯 / 集谐模态琳奈 / 清宵 合计加深 */
const DANIA_OUTRO_PRIVILEGED_DEEP_PCT = 40;
const DANIA_OUTRO_EXTRA_DEEP_PCT =
  DANIA_OUTRO_PRIVILEGED_DEEP_PCT - DANIA_OUTRO_BASE_DEEP_PCT;
const DANIA_OUTRO_EXTRA_EFFECT_KEY = 'dania_outro_privileged_extra';
/** @deprecated 旧名：现为特权角色合计加深，保留别名避免漏改 */
const DANIA_OUTRO_CONV_DEEP_PCT = DANIA_OUTRO_PRIVILEGED_DEEP_PCT;
/** 达妮娅全队【固有】谐幅：基础 10 + 按覆盖角色偏谐值累积效率转化（上限 40） */
const DANIA_INNATE_OFFSET_HARMONY_AMP_KEY = 'dania_innate_offset_harmony_amp';
const DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY = 'tpl_mrywdsdv_4moht';
/** 旧版拆出的「达妮娅·固有」+10，已并入上一键 */
const DANIA_INNATE_BASE_HARMONY_AMP_KEY = 'tpl_mrywamxp_axdcm';
const DANIA_INNATE_BASE_HARMONY_AMP = 10;
const DANIA_INNATE_OFFSET_HARMONY_AMP_THRESHOLD = 100;
const DANIA_INNATE_OFFSET_HARMONY_AMP_PER_CHUNK = 8;
const DANIA_INNATE_OFFSET_HARMONY_AMP_CHUNK_PCT = 10;
const DANIA_INNATE_OFFSET_HARMONY_AMP_CAP = 40;
const ENCORE_CHAR_ID = '1203';
const MORTEFI_CHAR_ID = '1204';
const MORTEFI_OUTRO_HEAVY_DEEP_KEY = 'mortefi_outro_heavy_deep';
/** 尤诺：全队【尤诺·延奏】重击加深（本人不生效） */
const YUNO_CHAR_ID = '1410';
const YUNO_OUTRO_HEAVY_DEEP_KEY = 'yuno_outro_heavy_deep';
/** 尤诺：全队叠层【苍白死光的祝颂】；2链且≥10层额外泛用加深+40% */
const YUNO_BLESSING_KEY = 'yuno_pale_deadlight_blessing';
const YUNO_BLESSING_STACK_DEEP_EFFECT_KEY = 'yuno_blessing_stack_deep';
const YUNO_BLESSING_C2_DEEP_EFFECT_KEY = 'yuno_blessing_c2_general_deep';
const YUNO_BLESSING_MAX_STACKS = 10;
const YUNO_BLESSING_DEEP_PER_STACK = 4;
const YUNO_BLESSING_C2_EXTRA_DEEP = 40;
const YUNO_BLESSING_C2_MIN_STACKS = 10;
const YUNO_BLESSING_C2_MIN_RESONANCE = 2;
const YUNO_BLESSING_AUTO_EFFECT_KEYS = new Set([
  YUNO_BLESSING_STACK_DEEP_EFFECT_KEY,
  YUNO_BLESSING_C2_DEEP_EFFECT_KEY,
]);
const SANHUA_CHAR_ID = '1102';
const SANHUA_OUTRO_NORMAL_DEEP_KEY = 'sanhua_outro_normal_deep';
/** 鉴心：全队【鉴心·延奏】共鸣解放加深（本人不生效） */
const JIANXIN_CHAR_ID = '1405';
const JIANXIN_OUTRO_LIBERATION_DEEP_KEY = 'jianxin_outro_liberation_deep';
/** 仇远：全队【仇远·延奏】声骸加深（本人不生效） */
const CHOUYUAN_CHAR_ID = '1411';
const CHOUYUAN_OUTRO_ECHO_DEEP_KEY = 'chouyuan_outro_echo_deep';
/** 仇远共鸣解放：暴击>50%时每1%超额→全队暴伤+2%，上限30%（按面板暴击只读同步） */
const CHOUYUAN_LIBERATION_CRIT_DMG_KEY = 'chouyuan_liberation_crit_dmg';
const CHOUYUAN_LIBERATION_CRIT_THRESHOLD = 50;
const CHOUYUAN_LIBERATION_CRIT_DMG_PER_PCT = 2;
const CHOUYUAN_LIBERATION_CRIT_DMG_CAP = 30;
/** 仇远6链：施放荷蓑出林后自身暴伤+100%，持续6秒。旧技能名单仅保留兼容导出。 */
const CHOUYUAN_C6_HESUO_CRIT_DMG_KEY = 'chouyuan_c6_hesuo_crit_dmg';
const CHOUYUAN_C6_HESUO_SKILLS = ['3链·荷蓑出林'];
/** 仇远 1 链：角色面板暴击 +20%（随链数开关只读同步） */
const CHOUYUAN_C1_CRIT_RATE_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}chouyuan_c1_crit_rate`;
const CHOUYUAN_C1_CRIT_RATE_PCT = 20;
const BAIZHI_CHAR_ID = '1103';
const BAIZHI_C3_HP_KEY = 'baizhi_c3_hp_percent';
const ZHEZHI_CHAR_ID = '1105';
const ZHEZHI_OUTRO_KEY = 'zhezhi_outro';
/** 吟霖：全队【吟霖·延奏】导电加深 + 共鸣解放加深（本人不生效） */
const YINLIN_CHAR_ID = '1302';
const YINLIN_OUTRO_KEY = 'yinlin_outro';
/** 弗洛洛：全队【弗洛洛·延奏】湮灭加深 + 重击加深（本人不生效） */
const FLORO_CHAR_ID = '1608';
const FLORO_OUTRO_KEY = 'floro_outro';
const FLORO_OUTRO_HAVOC_DEEP_PCT = 20;
const FLORO_OUTRO_HEAVY_DEEP_PCT = 25;
/** 坎特蕾拉：全队【坎特雷拉·延奏】湮灭加深 + 共鸣技能加深（本人不生效；旧拆条「坎延暗伤」「坎延技伤」） */
const CANTARELLA_CHAR_ID = '1607';
const CANTARELLA_OUTRO_KEY = 'cantarella_outro';
const CANTARELLA_OUTRO_NAME = '坎特雷拉·延奏';
const CANTARELLA_OUTRO_HAVOC_DEEP_PCT = 20;
const CANTARELLA_OUTRO_SKILL_DEEP_PCT = 25;
const CANTARELLA_OUTRO_LEGACY_KEYS = new Set([
  'tpl_mrxcut8c_77mm9',
  'tpl_mrxcuz19_a6hnf',
]);
/** 坎特蕾拉：已移除的个人「天赋」两条（攻击12 / 暴击8） */
const CANTARELLA_LEGACY_TALENT_KEYS = new Set([
  'tpl_mrxcswey_0pob2',
  'tpl_mrxct4df_m5kc0',
]);
/** 洛可可：全队【洛可可·延奏】湮灭加深 + 普攻加深（本人不生效；旧拆条「洛延暗伤」「洛延普攻」） */
const ROCOCO_CHAR_ID = '1606';
const ROCOCO_OUTRO_KEY = 'rococo_outro';
const ROCOCO_OUTRO_NAME = '洛可可·延奏';
const ROCOCO_OUTRO_HAVOC_DEEP_PCT = 20;
const ROCOCO_OUTRO_NORMAL_DEEP_PCT = 25;
const ROCOCO_OUTRO_LEGACY_KEYS = new Set([
  'tpl_mrvhuq04_1xuc7',
  'tpl_mrvhv6kc_o5ejd',
]);
/** 洛可可：已移除的个人「天赋」两条（攻击12 / 暴伤16） */
const ROCOCO_LEGACY_TALENT_KEYS = new Set([
  'tpl_mrvi7iwk_pvfn2',
  'tpl_mrvi87fk_ikxoy',
]);
/** 桃祈：已移除的个人「天赋」两条（湮灭增伤12 / 防御比15.2） */
const TAOQI_CHAR_ID = '1601';
const TAOQI_LEGACY_TALENT_KEYS = new Set([
  'tpl_mrxdww9u_udcqf',
  'tpl_ms07xnqx_7oqcd',
]);
/** 洛可可大招：暴击>50% 时每满 0.1%→全队固定攻击+1，上限 200（按洛可可面板只读同步） */
const ROCOCO_FLAT_ATK_KEY = 'rococo_liberation_flat_atk';
const ROCOCO_FLAT_ATK_NAME = '洛可可·大招';
const ROCOCO_FLAT_ATK_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}rococo_liberation_flat_atk`;
const ROCOCO_FLAT_ATK_CRIT_THRESHOLD = 50;
const ROCOCO_FLAT_ATK_CRIT_CHUNK = 0.1;
const ROCOCO_FLAT_ATK_PER_CHUNK = 1;
const ROCOCO_FLAT_ATK_CAP = 200;
const YOUHU_CHAR_ID = '1106';
const YOUHU_OUTRO_COORD_DEEP_KEY = 'youhu_outro_coord_deep';
const YOUHU_SHIZHONGWU_DUIOU_KEY = 'tpl_mrz1n0oh_cnzm1';
const YOUHU_SHIZHONGWU_LIANZHU_KEY = 'tpl_mrz1n5tz_td65i';
const YOUHU_SHIZHONGWU_DUIOU_NAME = '诗中物·对偶';
const YOUHU_SHIZHONGWU_LIANZHU_NAME = '诗中物·联珠';
/** 卡提希娅：全队【延奏·卡提】气动加深（本人不生效） */
const CARTETHYIA_CHAR_ID = '1409';
const CARTETHYIA_OUTRO_AERO_DEEP_KEY = 'cartethyia_outro_aero_deep';
/** 卡提希娅：全队【显化+神权】风蚀效应加深（仅卡提个人/特殊库计入，其他角色统计不分配） */
const CARTETHYIA_XIANHUA_SHENQUAN_KEY = 'cartethyia_xianhua_shenquan';
const CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEY = 'tpl_ms0jqqtm_0ljmt';
const CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEYS = new Set([CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEY]);
const CARTETHYIA_XIANHUA_SHENQUAN_PCT = 50;
/** 夏空：全队【夏空·延奏】按风蚀伤害类型生效，不限伤害归属角色。 */
const XIAKONG_CHAR_ID = '1407';
const XIAKONG_OUTRO_WIND_EROSION_KEY = 'xiakong_outro_wind_erosion_deep';
const XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEY = 'tpl_ms0edoxd_l75i6';
const XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEYS = new Set([XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEY]);
const XIAKONG_OUTRO_WIND_EROSION_PCT = 100;
/** 卡提希娅本体【大招强化】（旧名「决意」）：指定大招泛用加深叠层 */
const CARTETHYIA_ULT_BOOST_KEY = 'cartethyia_ult_boost';
const CARTETHYIA_ULT_BOOST_LEGACY_KEY = 'tpl_ms0ke9p0_iipsx';
const CARTETHYIA_ULT_BOOST_NAME = '大招强化';
/** 卡提希娅 1 链（旧名「余响」）：指定技能泛用暴伤叠层 */
const CARTETHYIA_C1_KEY = 'cartethyia_c1';
const CARTETHYIA_C1_LEGACY_KEY = 'tpl_ms0l3ai9_capxw';
const CARTETHYIA_C1_NAME = '1链';
/** 秋水：全队【秋水·延奏】气动加深（本人不生效） */
const QIUSHUI_CHAR_ID = '1403';
const QIUSHUI_OUTRO_AERO_DEEP_KEY = 'qiushui_outro_aero_deep';
/** 灯灯：全队【灯灯·延奏】共鸣技能加深（本人不生效） */
const LUMI_CHAR_ID = '1504';
const LUMI_OUTRO_SKILL_DEEP_KEY = 'lumi_outro_skill_deep';
/** 漂泊者·导电：全队【雷主·延奏】泛用加深（本人不生效） */
const ROVER_ELECTRO_CHAR_ID = '1310';
const ROVER_ELECTRO_OUTRO_GENERAL_DEEP_KEY = 'rover_electro_outro_general_deep';
/** 漂泊者·衍射：已移除的个人「天赋」两条（衍射增伤12 / 攻击12） */
const ROVER_SPECTRO_CHAR_ID = '1502';
const ROVER_SPECTRO_LEGACY_TALENT_KEYS = new Set([
  'tpl_ms0bchfw_dujlz',
  'tpl_ms0bcp41_bvlg2',
]);
/** 赞妮：全队【延奏·赞妮】衍射加深（本人不生效） */
const ZANNI_CHAR_ID = '1507';

const ZANNI_OUTRO_DIFFRACTION_DEEP_KEY = 'zanni_outro_diffraction_deep';
const ZANNI_OUTRO_DIFFRACTION_DEEP_PCT = 20;
/** 琳奈：全队【琳奈·延奏】泛用加深 + 共鸣解放加深（本人不生效） */
const LINNEI_CHAR_ID = '1509';
const LINNEI_OUTRO_KEY = 'linnei_outro';
const LINNEI_OUTRO_GENERAL_DEEP_PCT = 15;
/** ≥3 链：泛用加深提升至 40%（追加 +25%） */
const LINNEI_OUTRO_C3_GENERAL_DEEP_PCT = 40;
const LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP =
  LINNEI_OUTRO_C3_GENERAL_DEEP_PCT - LINNEI_OUTRO_GENERAL_DEEP_PCT;
const LINNEI_OUTRO_C3_MIN_RESONANCE = 3;
const LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY = 'linnei_outro_c3_general_deep';
const LINNEI_OUTRO_AUTO_EFFECT_KEYS = new Set([LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY]);
/** 露西：特殊技能库固有处决【骇破响应·数据崩解】 */
const LUCY_CHAR_ID = '1511';
/** 卜灵：全队【雷法·三才合一】共鸣技能增伤（≥6 链 25%→50%） */
const BULING_CHAR_ID = '1307';
const BULING_SANCAI_KEY = 'buling_sancai_heyi';
const BULING_SANCAI_SKILL_BONUS_BASE = 25;
const BULING_SANCAI_C6_TOTAL = 50;
const BULING_SANCAI_C6_EXTRA = BULING_SANCAI_C6_TOTAL - BULING_SANCAI_SKILL_BONUS_BASE;
const BULING_SANCAI_C6_MIN_RESONANCE = 6;
const BULING_SANCAI_BASE_EFFECT_KEY = 'buling_sancai_skill_bonus_base';
const BULING_SANCAI_C6_EFFECT_KEY = 'buling_sancai_skill_bonus_c6';
const BULING_SANCAI_AUTO_EFFECT_KEYS = new Set([
  BULING_SANCAI_BASE_EFFECT_KEY,
  BULING_SANCAI_C6_EFFECT_KEY,
]);
/** 丽贝卡：【露西·延奏】泛用加深仅对该角色生效 */
const REBECCA_CHAR_ID = '1308';
/** 共鸣回响·梦魇亚当·重锤：按装配角色替换声骸技能（露西→273.60%衍射；丽贝卡→十六段17.10%导电） */
const ADAM_HAMMER_SPECIMEN_ID = '6000201';
/** 心（1311）装配 6000225 声骸时替换为心专属形态：五段13.68% + 一段232.56%（合计300.96%） */
const XIN_CHAR_ID = '1311';
const XIN_ECHO_SPECIMEN_ID = '6000225';
const XIN_ECHO_HEART_MULT_COMPONENTS = [
  { rate: 13.68, count: 5 },
  { rate: 232.56, count: 1 },
];
const XIN_ECHO_HEART_ENERGY = 4.18;
/** 丽贝卡：全队【丽贝卡·延奏】叠层重击加深 + 固定泛用加深（本人不生效） */
const REBECCA_OUTRO_KEY = 'rebecca_outro';
const REBECCA_OUTRO_HEAVY_DEEP_PER_STACK = 0.5;
const REBECCA_OUTRO_HEAVY_DEEP_CAP_PCT = 35;
const REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS = Math.round(
  REBECCA_OUTRO_HEAVY_DEEP_CAP_PCT / REBECCA_OUTRO_HEAVY_DEEP_PER_STACK
);
const REBECCA_OUTRO_GENERAL_DEEP_PCT = 15;
/** 丽贝卡本体【猎手模式】【铁胆模式】：≥4 链数值 ×1.6（同 Buff 追加差额） */
const REBECCA_HUNTER_MODE_KEY = 'rebecca_hunter_mode';
const REBECCA_IRON_MODE_KEY = 'rebecca_iron_mode';
const REBECCA_HUNTER_CRIT_DMG_BASE = 30;
const REBECCA_IRON_DEF_IGNORE_BASE = 15;
const REBECCA_MODE_C4_MULT = 1.6;
const REBECCA_MODE_C4_MIN_RESONANCE = 4;
const REBECCA_HUNTER_CRIT_DMG_C4_EXTRA =
  REBECCA_HUNTER_CRIT_DMG_BASE * REBECCA_MODE_C4_MULT - REBECCA_HUNTER_CRIT_DMG_BASE;
const REBECCA_IRON_DEF_IGNORE_C4_EXTRA =
  REBECCA_IRON_DEF_IGNORE_BASE * REBECCA_MODE_C4_MULT - REBECCA_IRON_DEF_IGNORE_BASE;
const REBECCA_HUNTER_BASE_EFFECT_KEY = 'rebecca_hunter_crit_base';
const REBECCA_HUNTER_C4_EFFECT_KEY = 'rebecca_hunter_crit_c4';
const REBECCA_IRON_BASE_EFFECT_KEY = 'rebecca_iron_def_base';
const REBECCA_IRON_C4_EFFECT_KEY = 'rebecca_iron_def_c4';
const REBECCA_MODE_AUTO_EFFECT_KEYS = new Set([
  REBECCA_HUNTER_BASE_EFFECT_KEY,
  REBECCA_HUNTER_C4_EFFECT_KEY,
  REBECCA_IRON_BASE_EFFECT_KEY,
  REBECCA_IRON_C4_EFFECT_KEY,
]);
/** 丽贝卡 6 链：所有来源的普攻伤害加成数值 ×1.4（结算乘区，不改写各条 Buff） */
const REBECCA_C6_NORMAL_ATK_BONUS_SCALE = 1.4;
const REBECCA_C6_MIN_RESONANCE = 6;
/** 露西【后门0/1/2】：全伤害加深（每层+10%，满2层额外+5%，合计25%）+ 指定【欺骗程式·运动失能】【骇破响应·数据崩解】【骇破响应·熔融】倍率提升（每层+10%，满2层额外+5%，合计25%） */
const LUCY_HOUMEN_KEY = 'lucy_houmen';
const LUCY_HOUMEN_MULT_EFFECT_KEY = 'lucy_houmen_data_collapse_mult_boost';
const LUCY_HOUMEN_DEEP_EFFECT_KEY = 'lucy_houmen_general_deep';
const LUCY_HOUMEN_MAX_STACKS = 2;
/** 第1层贡献 */
const LUCY_HOUMEN_STACK1_MULT_BOOST = 10;
/** 第2层贡献10%并额外获得5%，与第1层加算后合计25% */
const LUCY_HOUMEN_STACK2_MULT_BOOST = 15;
/** 全伤害加深：每层10%，满2层额外5%（合计25%） */
const LUCY_HOUMEN_STACK1_DEEP_PCT = 10;
const LUCY_HOUMEN_STACK2_DEEP_PCT = 15;
const LUCY_HOUMEN_TARGET_SKILLS = ["骇破响应·数据崩解","黑墙深度·骇破响应·数据崩解","欺骗程式·运动失能","网络行者·欺骗程式·运动失能","骇破响应·熔融"];
const LUCY_HOUMEN_AUTO_EFFECT_KEYS = new Set([
  LUCY_HOUMEN_MULT_EFFECT_KEY,
  LUCY_HOUMEN_DEEP_EFFECT_KEY,
]);
/** 露西：全队【露西·延奏】普攻加深 + 仅丽贝卡泛用加深（本人不生效） */
const LUCY_OUTRO_KEY = 'lucy_outro';
const LUCY_OUTRO_NORMAL_DEEP_PCT = 25;
const LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT = 20;
const LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY = 'lucy_outro_rebecca_general_deep';
const LUCY_OUTRO_AUTO_EFFECT_KEYS = new Set([LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY]);
/** 露西【多线程·SQL】：倍率提升 270%；≥2 链变为 560%（基础 + 链追加） */
const LUCY_MULTITHREAD_SQL_KEY = 'lucy_multithread_sql';
const LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY = 'lucy_multithread_sql_base_mult_boost';
const LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY = 'lucy_multithread_sql_c2_mult_boost';
const LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST = 270;
const LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST = 560;
const LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST =
  LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST - LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST;
const LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE = 2;
const LUCY_MULTITHREAD_SQL_AUTO_EFFECT_KEYS = new Set([
  LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY,
  LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY,
]);
/** 露西特殊技能库目标（处决） */
const LUCY_SPECIAL_EXEC_SKILLS = [
  '骇破响应·数据崩解',
  '黑墙深度·骇破响应·数据崩解',
  '欺骗程式·运动失能',
  '网络行者·欺骗程式·运动失能',
];
/** ≥3 链：两处决基础倍率提升 +65%（写入库 chain3BaseMultBoost，与后门等 Buff 倍率提升乘算） */
const LUCY_SPECIAL_C3_BASE_MULT_BOOST = 0.65;
/** ≥6 链：两处决泛用易伤 +60%（个人复合，同步特殊技能库） */
const LUCY_C6_EXEC_VULN_KEY = 'lucy_c6_exec_vuln';
const LUCY_C6_EXEC_VULN_EFFECT_KEY = 'lucy_c6_exec_general_vuln';
const LUCY_C6_EXEC_VULN_PCT = 60;
const LUCY_C6_EXEC_VULN_MIN_RESONANCE = 6;
const LUCY_C6_EXEC_VULN_AUTO_EFFECT_KEYS = new Set([LUCY_C6_EXEC_VULN_EFFECT_KEY]);
/** 曾误加的内置全队易伤/穿防 templateKey：加载时从露西模板剥离（用户自建 Buff 保留） */
const LUCY_TEAM_GENERAL_VULN_KEY = 'lucy_team_general_vuln';
const LUCY_TEAM_GENERAL_PEN_KEY = 'lucy_team_general_pen';
/** 赞妮【焰光】3 链：指定【终绝将至之刻】倍率增加 +8%/层 */
const ZANNI_YANGUANG_C3_MULT_EFFECT_KEY = 'zanni_yanguang_c3_mult_add';
const ZANNI_YANGUANG_C3_MULT_PER_STACK = 8;
const ZANNI_YANGUANG_C3_MIN_RESONANCE = 3;
const ZANNI_YANGUANG_C3_SKILLS = ['晨昏交替之时·终绝将至之刻', '终绝将至之刻'];
const ZANNI_YANGUANG_AUTO_EFFECT_KEYS = new Set([ZANNI_YANGUANG_C3_MULT_EFFECT_KEY]);
/** 曾误加的内置 3 链致辞倍率；与用户自建复合 Buff 冲突，加载时剥离 */
const CARLOTTA_LEGACY_C3_OUTRO_MULT_KEY = 'carlotta_c3_outro_mult_add';
/** 凌阳 */
const LINGYANG_CHAR_ID = '1104';
const LINGYANG_C5_BUFF_KEY = 'tpl_mrz0r11o_4urdl';
const LINGYANG_C5_BUFF_NAME = '【5链】';
/** 维里奈 6 链：指定技能泛用增伤（旧名「余响」） */
const VERINA_CHAR_ID = '1503';
const VERINA_C6_BUFF_KEY = 'tpl_ms1pmzw2_oq6ux';
const VERINA_C6_BUFF_NAME = '6链';
/** 椿 6 链：指定技能倍率提升（旧名「余响」） */
const CHUN_CHAR_ID = '1603';
const CHUN_C6_BUFF_KEY = 'tpl_ms05lh7h_d8j54';
const CHUN_C6_BUFF_NAME = '6链';
/** 椿：已移除的个人「天赋」两条（攻击12 / 暴伤16） */
const CHUN_LEGACY_TALENT_KEYS = new Set([
  'tpl_mrvil7pc_3mjj5',
  'tpl_mrvilgk6_qowfh',
]);
const FEIXUE_CHAR_ID = '1108';
/** 洛瑟菈（霜渐体系，可接收绯雪全队【雪锈】） */
const LOSERA_CHAR_ID = '1109';
const LOSERA_ECHO_BIANJIAO_KEY = 'tpl_mrz8jcir_pzd3o';
const LOSERA_ECHO_BIANJIAO_NAME = '变焦';
/** 洛瑟菈：霜渐模态全队【洛瑟菈·霜渐】冷凝抗性降低（对应霜渐效应伤害） */
const LOSERA_TEAM_RES_REDUCE_KEY = 'losera_team_res_reduce';
const LOSERA_TEAM_RES_REDUCE_PCT = 8;
const FEIXUE_XUEXIU_KEY = 'feixue_xuexiu';
/** 全队【雪锈】复合（霜渐加深 / 6链易伤）；与个人雪锈同名、层数同步 */
const FEIXUE_XUEXIU_TEAM_KEY = 'feixue_xuexiu_frost_deep';
const FEIXUE_OUTRO_ELEMENT_DEEP_KEY = 'feixue_outro_element_deep';
/** 旧版拆成多条的雪锈派生 Buff，加载时剥离并并入同名【雪锈】 */
const FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS = new Set([
  'feixue_c6_xuexiu_crit_dmg',
  'feixue_c6_frost_vuln',
]);
const FEIXUE_XUEXIU_STACK_SYNC = 'feixueXuexiu';
const FEIXUE_XUEXIU_MAX_STACKS = 3;
/** 绯雪共鸣链 Buff（写入 resonanceChains，切链后由 collectTemplateBuffLists 载入） */
const FEIXUE_C1_YUQIU_MULT_KEY = 'feixue_c1_yuqiu_mult';
const FEIXUE_C2_JUHE_MULT_KEY = 'feixue_c2_juhe_mult';
const FEIXUE_C3_HEAVY_MULT_KEY = 'feixue_c3_heavy_mult';
const FEIXUE_C4_TEAM_BONUS_KEY = 'feixue_c4_team_bonus';
const FEIXUE_C5_SKILL_MULT_KEY = 'feixue_c5_skill_mult';
const FEIXUE_C6_JIANXIN_CRIT_KEY = 'feixue_c6_jianxin_crit';
const FEIXUE_C1_YUQIU_SKILLS = [
  '灼樱刀术·普攻·预求身第一段',
  '灼樱刀术·普攻·预求身第二段',
  '灼樱刀术·普攻·预求身第三段',
  '灼樱刀术·普攻·预求身第四段',
  '灼樱刀术·普攻·预求身第五段',
  '灼樱刀术·重击·预求身',
  '灼樱刀术·空中攻击·预求身第一段',
  '灼樱刀术·空中攻击·预求身第二段',
  '灼樱刀术·闪避反击·预求身',
];
const FEIXUE_C2_JUHE_SKILLS = ['万世霜天·普攻·居合'];
const FEIXUE_C3_HEAVY_SKILLS = ['灼樱刀术·重击·寒簇·常世身', '灼樱刀术·重击·枯霜·预求身'];
const FEIXUE_C5_SKILL_SKILLS = ['霜罚·共鸣技能·常世身', '霜罚·白玉切', '霜罚·落华'];
const FEIXUE_C6_JIANXIN_SKILLS = ['预求我身·见心', '预求我身·归刃基础'];
/** 穗穗：全队【穗穗·消耗虚湮效应】（本人不生效） */
const SUISUI_CHAR_ID = '1110';
/** 全队【雪锈】霜渐效应：仅同步到绯雪 / 洛瑟菈 / 穗穗个人库 */
const FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS = [FEIXUE_CHAR_ID, LOSERA_CHAR_ID, SUISUI_CHAR_ID];
const SUISUI_CONSUME_XUYAN_KEY = 'suisui_consume_xuyan';
/** 穗穗延奏2：共鸣效率>200% 时每满1%→全队增伤+0.2%，不足不转化，上限12%（含本人） */
const SUISUI_OUTRO2_ER_BONUS_KEY = 'suisui_outro2_er_bonus';
const SUISUI_OUTRO2_LEGACY_KEYS = new Set(['tpl_mrzacxev_k7atx']);
const SUISUI_OUTRO2_ER_THRESHOLD = 200;
const SUISUI_OUTRO2_BONUS_PER_PCT = 0.2;
const SUISUI_OUTRO2_BONUS_CAP = 12;
/** 穗穗·延奏3·烟岚：共鸣效率>200% 时每满0.12%→全队攻击+0.1%，不足不转化，上限50%（本人不生效） */
const SUISUI_OUTRO3_ER_ATK_KEY = 'suisui_outro3_er_atk';
const SUISUI_OUTRO3_LEGACY_KEYS = new Set(['tpl_mrzads0b_ay3ch']);
const SUISUI_OUTRO3_ER_THRESHOLD = 200;
const SUISUI_OUTRO3_ER_PER_CHUNK = 0.12;
const SUISUI_OUTRO3_ATK_PER_CHUNK = 0.1;
const SUISUI_OUTRO3_ATK_CAP = 50;
/** 守岸人：全队星域按共鸣效率转模（每满一段才转化；满额约 250% 效率） */
const SHOREKEEPER_CHAR_ID = '1505';
/** P4：角色特判 id 聚合表（防散落硬编码；新增特判统一在此登记，供 inline/其它文件查表）。
 *  注意：须放在所有被引用常量（BRANT/LUPA/AUGUSTA/YUNO/CHOUYUAN/CANTARELLA/ROCOCO/SUISUI/DANIA/ZANNI/SHOREKEEPER）定义之后。 */
const SPECIAL_CHAR_IDS = {
  brant: BRANT_CHAR_ID,
  shorekeeper: SHOREKEEPER_CHAR_ID,
  lupa: LUPA_CHAR_ID,
  augusta: AUGUSTA_CHAR_ID,
  yuno: YUNO_CHAR_ID,
  chouyuan: CHOUYUAN_CHAR_ID,
  cantarella: CANTARELLA_CHAR_ID,
  rococo: ROCOCO_CHAR_ID,
  suishui: SUISUI_CHAR_ID,
  dania: DANIA_CHAR_ID,
  zanni: ZANNI_CHAR_ID,
};
/** 深潜星域(紫)：每满 0.2% 共鸣效率 → 全队暴击 +0.01%，上限 12.5% */
const SHOREKEEPER_STAR_PURPLE_KEY = 'shorekeeper_star_purple_er_crit';
const SHOREKEEPER_STAR_PURPLE_LEGACY_KEYS = new Set(['tpl_mrzz8vwx_b0bfq']);
const SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK = 0.2;
const SHOREKEEPER_STAR_PURPLE_CRIT_PER_CHUNK = 0.01;
const SHOREKEEPER_STAR_PURPLE_CRIT_CAP = 12.5;
/** 解限星域(金)：每满 0.1% 共鸣效率 → 全队暴伤 +0.01%，上限 25% */
const SHOREKEEPER_STAR_GOLD_KEY = 'shorekeeper_star_gold_er_crit_dmg';
const SHOREKEEPER_STAR_GOLD_LEGACY_KEYS = new Set(['tpl_mrzza29a_tlxdr']);
const SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK = 0.1;
const SHOREKEEPER_STAR_GOLD_CRIT_DMG_PER_CHUNK = 0.01;
const SHOREKEEPER_STAR_GOLD_CRIT_DMG_CAP = 25;
/** 守岸人固有2：星域范围内自身共鸣效率+10%；同队漂泊者+10%（写入面板） */
const SHOREKEEPER_INNATE2_ER_KEY = 'shorekeeper_innate2_er';
const SHOREKEEPER_INNATE2_ER_PCT = 10;
const SHOREKEEPER_INNATE2_ER_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}shorekeeper_innate2_er`;
/** 漂泊者全系（导电/衍射/气动/湮灭，女性 id） */
const SHOREKEEPER_INNATE2_ROVER_IDS = new Set([
  ROVER_ELECTRO_CHAR_ID,
  ROVER_SPECTRO_CHAR_ID,
  '1408', // 漂泊者·气动
  '1604', // 漂泊者·湮灭
]);
/** 秧秧·玄翎：全队【秧秧·延奏】湮灭加深（本人不生效） */
const YANGYANG_XUANLING_CHAR_ID = '1610';
const YANGYANG_XUANLING_OUTRO_DEEP_KEY = 'yangyang_xuanling_outro_element_deep';
const YANGYANG_XUANLING_C6_ZHI_SKILL_KEY = 'yangyang_xuanling_c6_zhi_skill';
const YANGYANG_XUANLING_C6_ZHI_CRIT_KEY = 'yangyang_xuanling_c6_zhi_crit_set';
const YANGYANG_XUANLING_C6_ZHI_SKILLS = ['玄翎之影·止如槁木'];
const YANGYANG_XUANLING_C6_ZHI_BASE_MULT = 337.98;
/** 穗穗【消耗虚湮效应】仅对秧秧·玄翎生效（分配矩阵 √ / ×） */
const SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS = [YANGYANG_XUANLING_CHAR_ID];
/** 陆·赫斯：固有2 谐幅→泛用加深（每满10点+5%，上限30%；2链翻倍为+10%/上限60%） */
const LUHESI_CHAR_ID = '1510';
/** 清宵（测试服集谐角色，正式服转正后同 id） */
const QINGXIAO_CHAR_ID = '1413';
/** 达妮娅·延奏特权加深：陆·赫斯 / 琳奈 / 清宵（均需集谐模态） */
const DANIA_OUTRO_PRIVILEGED_CHAR_IDS = [LUHESI_CHAR_ID, LINNEI_CHAR_ID, QINGXIAO_CHAR_ID];
const LUHESI_INNATE2_DEEP_KEY = 'luhesi_innate2_harmony_deep';
const LUHESI_INNATE2_AMP_PER_CHUNK = 10;
const LUHESI_INNATE2_DEEP_PER_CHUNK = 5;
const LUHESI_INNATE2_DEEP_CAP = 30;
const LUHESI_INNATE2_C2_DEEP_PER_CHUNK = 10;
const LUHESI_INNATE2_C2_DEEP_CAP = 60;
/** 西格莉卡：固有2 共鸣效率>125%时，每超过1%→声骸技能伤害加成+2%，上限50% */
const SIGRIKA_CHAR_ID = '1412';
const SIGRIKA_INNATE2_ECHO_BONUS_KEY = 'sigrika_innate2_echo_bonus';
const SIGRIKA_INNATE2_ER_THRESHOLD = 125;
const SIGRIKA_INNATE2_BONUS_PER_PCT = 2;
const SIGRIKA_INNATE2_BONUS_CAP = 50;
const SIGRIKA_INNATE2_DEEP_PCT = 15;
const SIGRIKA_INNATE2_ER_ECHO_EFFECT_KEY = 'sigrika_innate2_er_echo_bonus';
const SIGRIKA_INNATE2_ER_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}sigrika_innate2_er_echo`;
/** 西格莉卡【天赋】：默认层 2；≥3链默认层 4；≥6链追加指定技能加深/无视防御 */
const SIGRIKA_TALENT_KEY = 'sigrika_talent';
const SIGRIKA_TALENT_STACKS_BASE = 2;
const SIGRIKA_TALENT_STACKS_AT_C3 = 4;
const SIGRIKA_TALENT_C3_UNLOCK = 3;
const SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY = 'sigrika_talent_c6_deep';
const SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY = 'sigrika_talent_c6_def_ignore';
const SIGRIKA_TALENT_C6_DEEP_PER_STACK = 15;
const SIGRIKA_TALENT_C6_DEF_IGNORE_PER_STACK = 7.5;
const SIGRIKA_TALENT_AUTO_EFFECT_KEYS = new Set([
  SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY,
  SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY,
]);
/** 西格莉卡 4 链全队泛用攻击（旧误名「西格·2链」） */
const SIGRIKA_C4_TEAM_ATK_KEY = 'sigrika_c4_team_attack';
const SIGRIKA_C4_TEAM_ATK_LEGACY_KEY = 'tpl_ms0n4b31_hhk57';
const SIGRIKA_C4_TEAM_ATK_NAME = '4链';
const SIGRIKA_C4_TEAM_ATK_PCT = 20;
const LUHESI_C2_YONGDONG_MULT_KEY = 'luhesi_c2_yongdong_mult_boost';
const LUHESI_YONGDONG_SKILLS = ['于永冻中释义·技能'];
const LUHESI_C3_MULT_KEY = 'luhesi_c3_zhanmie_mult_boost';
const LUHESI_C3_MULT_SKILLS = [
  '所有陨落在此重逢·斩杀日冕·环',
  '所有陨落在此重逢·斩杀日冕·破',
  '所有陨落在此重逢·斩杀日冕·曜',
  '自霜中诞生的火光·判决大地裂响',
  '所有陨落在此重逢·日髓阵列',
];
/** 特殊技能 Buff 来源：全队（效应相关 + 易伤/防御类全队 Buff） */
const SPECIAL_BUFF_SOURCE_TEAM = 'team';
const CHANGLI_CHAR_ID = '1205';
const CHANGLI_INNATE1_LIHUO_KEY = 'changli_innate1_lihuo_element';
const CHANGLI_INNATE2_KEY = 'changli_innate2';
/** 长离固有2拆分（2026-08-27 站长确认）：攻击+25% 独立开关，仅作用于焚身以火 */
const CHANGLI_INNATE2_ATTACK_KEY = 'changli_innate2_attack';
/** 长离·延奏：热熔加深 + 共鸣解放加深（旧拆条延奏1/2） */
const CHANGLI_OUTRO_KEY = 'changli_outro';
const CHANGLI_OUTRO_LEGACY_KEYS = new Set([
  'changli_outro1_element_deep',
  'changli_outro2_type_deep',
]);
const CHANGLI_C1_SKILL_TYPE_BONUS_KEY = 'changli_c1_skill_type_bonus';
const CHANGLI_C2_CRIT_RATE_KEY = 'changli_c2_general_crit_rate';
const CHANGLI_C3_LIHUO_BONUS_KEY = 'changli_c3_lihuo_bonus';
const CHANGLI_C4_TEAM_ATK_KEY = 'changli_c4_team_general_attack';
const CHANGLI_C5_FENSHEN_KEY = 'changli_c5_fenshen';
const CHANGLI_C6_DEFENSE_PEN_KEY = 'changli_c6_defense_pen';
const CHANGLI_LIHUO_SKILLS = ['离火照丹心·技能'];
const CHANGLI_FENSHEN_SKILLS = ['焚身以火'];
const CHIXIA_CHAR_ID = '1202';
const CHIXIA_C1_HONGHONG_CRIT_KEY = 'chixia_c1_honghong_crit_set';
const CHIXIA_HONGHONG_SKILLS = ['英魂炽火流·轰轰'];
const MONING_CHAR_ID = '1209';
const MONING_FIELD_DEF_KEY = 'moning_strong_resonance_field_def';
const MONING_C5_RESPONSE_BOOST_KEY = 'moning_c5_response_boost';
const MONING_C5_RESPONSE_BOOST_SOURCE_TAG = 'moningC5ResponseBoost';
const MONING_RESPONSE_SHOCK_SKILLS = ['莫宁·响应震谐'];
const MONING_RESPONSE_SHOCK_LIB_KEY = 'moning_response_shock';
const MONING_C5_RESPONSE_BOOST_PCT = 160;
/** 莫宁 0 链固有：【临界协议】共鸣效率>100% 时超额转该技能暴击/暴伤 */
const MONING_CRITICAL_PROTOCOL_ER_KEY = 'moning_critical_protocol_er';
const MONING_CRITICAL_PROTOCOL_SKILLS = ['临界协议·技能', '临界协议'];
const MONING_CRITICAL_PROTOCOL_ER_THRESHOLD = 100;
const MONING_CRITICAL_PROTOCOL_CRIT_RATE_PER_PCT = 0.5;
const MONING_CRITICAL_PROTOCOL_CRIT_RATE_CAP = 80;
const MONING_CRITICAL_PROTOCOL_CRIT_DMG_PER_PCT = 1;
const MONING_CRITICAL_PROTOCOL_CRIT_DMG_CAP = 160;
const MONING_CRITICAL_PROTOCOL_CRIT_RATE_EFFECT_KEY = 'moning_cp_er_crit_rate';
const MONING_CRITICAL_PROTOCOL_CRIT_DMG_EFFECT_KEY = 'moning_cp_er_crit_dmg';
/** Moning innate: unconditional +10% energy regen on her own panel */
const MONING_INNATE_ER_KEY = 'moning_innate_er';
const MONING_INNATE_ER_PCT = 10;
const MONING_INNATE_ER_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}moning_innate_er`;
/** 莫宁 2 链全队：共鸣效率>100% 时每超过1%→全队暴伤+0.2%，上限32% */
const MONING_C2_ER_CRIT_DMG_KEY = 'moning_c2_er_crit_dmg';
const MONING_C2_ER_THRESHOLD = 100;
const MONING_C2_CRIT_DMG_PER_PCT = 0.2;
const MONING_C2_CRIT_DMG_CAP = 32;
const MONING_C2_LEGACY_CRIT_DMG_KEYS = new Set(['tpl_mryv6xt7_jg5cp']);
/** 莫宁：全队【偏谐值累积效率】+50%；2 链再 +20%（同步写入全队角色面板） */
const MONING_OFFSET_HARMONY_EFF_KEY = 'moning_offset_harmony_eff';
const MONING_OFFSET_HARMONY_EFF_PCT = 50;
const MONING_C2_OFFSET_HARMONY_EFF_KEY = 'moning_c2_offset_harmony_eff';
const MONING_C2_OFFSET_HARMONY_EFF_PCT = 20;
/** 旧版重复条目（pianxieAccumEff / 带「莫宁·」前缀），与正式键并存时需剔除 */
const MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS = new Set([
  'moning_pianxie_accum_eff',
  'moning_c2_pianxie_accum_eff',
]);
const MONING_OFFSET_HARMONY_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}moning_offset_harmony_eff`;
const MONING_C2_OFFSET_HARMONY_PANEL_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}moning_c2_offset_harmony_eff`;
const JIABEILINA_CHAR_ID = '1208';
/** 嘉贝莉娜 3 链：大招（炼净）倍率提升（旧名「余响」） */
const JIABEILINA_C3_ULT_MULT_KEY = 'jiabeilina_c3_ult_mult_boost';
const JIABEILINA_C3_ULT_MULT_LEGACY_KEY = 'tpl_mryvzl30_awdzu';
const JIABEILINA_C3_ULT_MULT_NAME = '3链·大招倍率提升';
/** 嘉贝莉娜本体【内燃烧】：泛用攻击 +20%；2 链将该加成再提升 350%（额外 +70%，合计 90%） */
const JIABEILINA_NEIRANSHAO_ATK_KEY = 'jiabeilina_neiranshao_atk';
const JIABEILINA_NEIRANSHAO_ATK_PCT = 20;
const JIABEILINA_NEIRANSHAO_C2_EXTRA_PCT = JIABEILINA_NEIRANSHAO_ATK_PCT * 3.5;
const JIABEILINA_NEIRANSHAO_C2_KEY = 'tpl_mryvypvi_0sh9u';
/** 嘉贝莉娜【余火】1 链附加：指定技能泛用暴伤 +2%/层（与本体同一 Buff） */
const JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY = 'jiabeilina_yuhuo_c1_crit_dmg';
/** 嘉贝莉娜【余火】6 链附加：指定技能热熔加深 +0.875%/层（与本体同一 Buff） */
const JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY = 'jiabeilina_yuhuo_c6_element_deep';
const JIABEILINA_YUHUO_AUTO_EFFECT_KEYS = new Set([
  JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY,
  JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY,
]);
/** 角色 id → 分支面板：攻击比 / 暴击 / 暴伤 / 属性加成（字段均可选） */
const CHAR_BRANCH_PANEL_BY_ID = {

  '1210': {
    // 爱弥斯：0链分支攻击比 + 暴击率（解包：暴击提升合计 8%，非暴伤）
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}amis_branch_atk`,
    critRateSourceId: `${CHAR_KIT_PANEL_PREFIX}amis_branch_crit_rate`,
    atkPct: 12,
    critRatePct: 8,
  },
  [DANIA_CHAR_ID]: {
    // 达妮娅
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}dania_branch_atk`,
    critDmgSourceId: `${CHAR_KIT_PANEL_PREFIX}dania_branch_crit_dmg`,
    atkPct: 12,
    critDmgPct: 16,
  },
  [ENCORE_CHAR_ID]: {
    // 安可：0链分支攻击比 + 热熔属性加成
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}encore_branch_atk`,
    atkPct: 12,
    attrSourceId: `${CHAR_KIT_PANEL_PREFIX}encore_branch_attr`,
    attrPct: 12,
    attrElement: '热熔',
  },
  [MORTEFI_CHAR_ID]: {
    // 莫特斐：0链分支攻击比 + 热熔属性加成
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}mortefi_branch_atk`,
    atkPct: 12,
    attrSourceId: `${CHAR_KIT_PANEL_PREFIX}mortefi_branch_attr`,
    attrPct: 12,
    attrElement: '热熔',
  },
  [CHANGLI_CHAR_ID]: {
    // 长离：0链分支攻击比 + 暴击率
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}changli_branch_atk`,
    atkPct: 12,
    critRateSourceId: `${CHAR_KIT_PANEL_PREFIX}changli_branch_crit_rate`,
    critRatePct: 8,
  },
  '1207': {
    // 露帕：0链分支攻击比 + 暴击率
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}lupa_branch_atk`,
    atkPct: 12,
    critRateSourceId: `${CHAR_KIT_PANEL_PREFIX}lupa_branch_crit_rate`,
    critRatePct: 8,
  },
  '1208': {
    // 嘉贝莉娜：0链分支攻击比 + 暴伤
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}jiabeilina_branch_atk`,
    critDmgSourceId: `${CHAR_KIT_PANEL_PREFIX}jiabeilina_branch_crit_dmg`,
    atkPct: 12,
    critDmgPct: 16,
  },
  '1212': {
    // 景燃：0链分支生命比 + 暴击率
    hpSourceId: `${CHAR_KIT_PANEL_PREFIX}jingran_branch_hp`,
    hpPct: 12,
    critRateSourceId: `${CHAR_KIT_PANEL_PREFIX}jingran_branch_crit_rate`,
    critRatePct: 8,
  },
  '1413': {
    // 清宵（测试服）：0链分支攻击比 + 暴伤（解包：攻击提升合计 12%，暴击伤害提升合计 16%）
    atkSourceId: `${CHAR_KIT_PANEL_PREFIX}qingxiao_branch_atk`,
    critDmgSourceId: `${CHAR_KIT_PANEL_PREFIX}qingxiao_branch_crit_dmg`,
    atkPct: 12,
    critDmgPct: 16,
  },
};
/** 景燃【阳变阴合】：生命上限 → 固定攻击（每1000生命 +36，上限1800） */
const JINGRAN_CHAR_ID = '1212';
/* ========== 最高优先级安全红线（勿删）：测试服角色严禁出现在网站版 ==========
   景燃(id 1212) 为测试服数据、存在法律风险，仅允许本地/内测版使用。
   - 网站版（wuwacalc.cn）运行时强制过滤：角色库(buff-templates.js normalizeCharSkillDb)、
     Buff 模板库(normalizeTemplateLibrary)、硬编码景燃分支(createEmptyCharacterBuffTemplate 等)
   - 部署时也必须剔除：F:\codex\work\paddle-demo\sdk-demo\deploy-hide-jingran.js
   新增测试服角色时，把 id 加进 TEST_SERVER_CHARACTER_IDS。 */
const TEST_SERVER_CHARACTER_IDS = new Set(['1512']); // 仅未获公开放行的莉莉；已获批角色不拦截
const IS_PUBLIC_SITE =
  typeof location !== 'undefined' &&
  (String(location.hostname || '').replace(/^www\./, '').toLowerCase() === 'wuwacalc.cn' ||
    /wuwacalc\.cn/i.test(String(location.href || '')));
function isPublicSiteHiddenCharId(id) {
  const sid = String(id || '');
  if (!IS_PUBLIC_SITE) return false;
  if (!TEST_SERVER_CHARACTER_IDS.has(sid)) return false;
  // R3（2026-08-16 更新）：CSF 模式仅对 manifest 内的 CSF 角色解除隐藏。
  // 站长已批准 1212 入 CSF manifest：口令门控后测试人员可见；公开页/公开数据仍强制隐藏。
  // 红线口径：测试服角色禁止出现在公开数据文件与公开静态路径（nginx 已 deny /csf/），
  // 不再要求「CSF manifest 与 TEST 名单互斥」。
  if (CSF_MODE && CSF_CHARACTER_IDS.has(sid)) return false;
  return true;
}

/* ===== CSF（测试服角色）独立叠加层 =====
 * 设计依据：F:\codex\work\20260816-csf-module\csf-handoff-rev2.md（R1~R4 修订版）
 * - 仅当 URL 带 ?csf=<口令> 且口令匹配时启用（CSF_MODE）
 * - 数据独立存放在 csf/*.csf.json，公开路径永不加载
 * - CSF_CHARACTER_IDS 由口令校验后的manifest填充；未获批ID同时列入公开隐藏名单，已获批角色不拦截
 * - 服务端 R1 校验（payloadContainsCsfCharacter → 400）才是泄漏防线，本模块只是体验层
 */
const CSF_QUERY_KEY = 'csf';
const CSF_QUERY_TOKEN = (() => {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get(CSF_QUERY_KEY) || '';
  } catch {
    return '';
  }
})();
// 口令由服务端校验（/api/csf/manifest），前端只判断"是否携带口令参数"；
// 换口令 = 改服务器 .env 的 CSF_ACCESS_TOKEN 后重启后端，无需重发前端。
const CSF_MODE = CSF_QUERY_TOKEN !== '';
const CSF_CHARACTER_IDS = new Set(); // manifest 加载后填充（独立集合）
let csfManifest = null;
let csfSkillsMerged = false;
let csfTemplatesMerged = false;
let csfOverlayPromise = null;

function isCsfCharacter(id) {
  return CSF_MODE && CSF_CHARACTER_IDS.has(String(id || ''));
}

async function loadCsfManifest() {
  if (!CSF_MODE) return null;
  if (csfManifest) return csfManifest;
  // 服务端口令门控：口令错误返回 403 → 视为未启用 CSF
  const res = await fetch(`/api/csf/manifest?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  csfManifest = await res.json();
  (csfManifest.characters || []).forEach((ch) => {
    if (ch && ch.id) CSF_CHARACTER_IDS.add(String(ch.id));
  });
  return csfManifest;
}

/** 技能库加载完成后合并 CSF 技能数据（幂等；仅 CSF 模式）。 */
async function loadCsfSkillOverlay() {
  if (!CSF_MODE || csfSkillsMerged) return;
  const manifest = await loadCsfManifest();
  if (!manifest) return;
  csfSkillsMerged = true;
  try {
    const token = manifest.dataTokens?.['character-skills.csf.json'] || '';
    const res = await fetch(
      `/api/csf/data?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}&file=character-skills.csf.json&v=${token || ''}`,
      { cache: token ? 'force-cache' : 'no-store' }
    );
    if (!res.ok) return;
    const data = await res.json();
    const chars = Array.isArray(data?.characters) ? data.characters : [];
    if (!chars.length || !charSkillDb || !Array.isArray(charSkillDb.characters)) return;
    const index = new Map(charSkillDb.characters.map((c) => [String(c.id), c]));
    for (const raw of chars) {
      const id = String(raw?.id || '');
      if (!id) continue;
      const entry = { ...raw, id, _csf: true };
      const existing = index.get(id);
      if (existing !== undefined) {
        const at = charSkillDb.characters.indexOf(existing);
        if (at >= 0) charSkillDb.characters[at] = entry;
        else charSkillDb.characters.push(entry);
      } else {
        charSkillDb.characters.push(entry);
      }
      index.set(id, entry);
    }
  } catch (err) {
    csfSkillsMerged = false;
    console.warn('[csf] 技能叠加失败:', err);
  }
}

/** Buff 模板库加载完成后合并 CSF 模板（幂等；仅 CSF 模式）。 */
async function loadCsfTemplateOverlay() {
  if (!CSF_MODE || csfTemplatesMerged) return;
  const manifest = await loadCsfManifest();
  if (!manifest) return;
  try {
    const token = manifest.dataTokens?.['character-buff-templates.csf.json'] || '';
    const res = await fetch(
      `/api/csf/data?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}&file=character-buff-templates.csf.json&v=${token || ''}`,
      { cache: token ? 'force-cache' : 'no-store' }
    );
    if (!res.ok) return;
    const data = await res.json();
    const tpls = Array.isArray(data?.templates) ? data.templates : [];
    if (!tpls.length) return;
    // 纯 CSF 队伍不会命中公开模板分片，先建立空库再叠加测试服模板。
    if (!charBuffTemplateDb || !Array.isArray(charBuffTemplateDb.templates)) {
      charBuffTemplateDb = normalizeTemplateLibrary({ templates: [] });
    }
    for (const raw of tpls) {
      const cid = String(raw?.characterId || '');
      if (!cid) continue;
      const tpl = { ...raw, characterId: cid, _csf: true };
      const at = charBuffTemplateDb.templates.findIndex((t) => String(t.characterId) === cid);
      if (at >= 0) charBuffTemplateDb.templates[at] = tpl;
      else charBuffTemplateDb.templates.push(tpl);
    }
    invalidateMergedTemplateMap();
    csfTemplatesMerged = true;
  } catch (err) {
    csfTemplatesMerged = false;
    console.warn('[csf] 模板叠加失败:', err);
  }
}

let csfWeaponsMerged = false;
let csfEchoMerged = false;

/** 武器库加载完成后合并 CSF 武器（幂等；仅 CSF 模式）。 */
async function loadCsfWeaponOverlay() {
  if (!CSF_MODE || csfWeaponsMerged) return;
  const manifest = await loadCsfManifest();
  if (!manifest) return;
  csfWeaponsMerged = true;
  try {
    if (typeof ensureWeaponsDb === 'function') await ensureWeaponsDb();
    if (typeof weaponsDb === 'undefined' || !Array.isArray(weaponsDb?.weapons)) return;
    const token = manifest.dataTokens?.['weapons.csf.json'] || '';
    const res = await fetch(
      `/api/csf/data?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}&file=weapons.csf.json&v=${token || ''}`,
      { cache: token ? 'force-cache' : 'no-store' }
    );
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data?.weapons) ? data.weapons : [];
    if (!list.length) return;
    const index = new Map(weaponsDb.weapons.map((w) => [String(w.id), w]));
    for (const raw of list) {
      const id = String(raw?.id || '');
      if (!id) continue;
      const entry = { ...raw, id, _csf: true };
      const existing = index.get(id);
      if (existing !== undefined) {
        const at = weaponsDb.weapons.indexOf(existing);
        if (at >= 0) weaponsDb.weapons[at] = entry;
        else weaponsDb.weapons.push(entry);
      } else {
        weaponsDb.weapons.push(entry);
      }
      index.set(id, entry);
    }
  } catch (err) {
    csfWeaponsMerged = false;
    console.warn('[csf] 武器叠加失败:', err);
  }
}

/** 声骸主位/映射加载完成后合并 CSF 声骸（幂等；仅 CSF 模式）。 */
async function loadCsfEchoOverlay() {
  if (!CSF_MODE || csfEchoMerged) return;
  const manifest = await loadCsfManifest();
  if (!manifest) return;
  csfEchoMerged = true;
  try {
    if (typeof ensureEchoSpecimensDb === 'function') await ensureEchoSpecimensDb();
    if (typeof ensureEchoSetMainMapDb === 'function') await ensureEchoSetMainMapDb();
    if (!echoSpecimensDb || !Array.isArray(echoSpecimensDb.specimens)) return;
    const token = manifest.dataTokens?.['echo-specimens.csf.json'] || '';
    const res = await fetch(
      `/api/csf/data?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}&file=echo-specimens.csf.json&v=${token || ''}`,
      { cache: token ? 'force-cache' : 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.specimens) ? data.specimens : [];
      if (list.length) {
        const index = new Map(echoSpecimensDb.specimens.map((s) => [String(s.id), s]));
        for (const raw of list) {
          const id = String(raw?.id || '');
          if (!id) continue;
          const entry = {
            ...raw,
            id,
            _csf: true,
            mainEffects: typeof normalizeMainEffects === 'function' ? normalizeMainEffects(raw.mainEffects) : raw.mainEffects,
          };
          const existing = index.get(id);
          if (existing !== undefined) {
            const at = echoSpecimensDb.specimens.indexOf(existing);
            if (at >= 0) echoSpecimensDb.specimens[at] = entry;
            else echoSpecimensDb.specimens.push(entry);
          } else {
            echoSpecimensDb.specimens.push(entry);
          }
          index.set(id, entry);
        }
      }
    }
    const mapToken = manifest.dataTokens?.['echo-set-main-map.csf.json'] || '';
    const mres = await fetch(
      `/api/csf/data?csf=${encodeURIComponent(CSF_QUERY_TOKEN)}&file=echo-set-main-map.csf.json&v=${mapToken || ''}`,
      { cache: mapToken ? 'force-cache' : 'no-store' }
    );
    if (mres.ok && echoSetMainMapDb) {
      const mdata = await mres.json();
      Object.entries(mdata?.sets || {}).forEach(([setId, ids]) => {
        const sid = String(setId);
        const arr = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
        if (!arr.length) return;
        if (!echoSetMainMapDb.sets[sid]) echoSetMainMapDb.sets[sid] = [];
        const cur = echoSetMainMapDb.sets[sid];
        arr.forEach((id) => {
          if (!cur.includes(id)) cur.push(id);
        });
      });
    }
    // 重建 specimen 索引与主位归属
    echoSpecimenIndex = new Map();
    (echoSpecimensDb.specimens || []).forEach((s) => {
      const id = String(s.id);
      if (!echoSpecimenIndex.has(id)) echoSpecimenIndex.set(id, s);
    });
    if (typeof rebuildSpecimenMainSetIdsFromMap === 'function') rebuildSpecimenMainSetIdsFromMap();
  } catch (err) {
    csfEchoMerged = false;
    console.warn('[csf] 声骸叠加失败:', err);
  }
}

/** CSF 就绪入口（由 ensure*Db 完成后调用，幂等）。 */
function ensureCsfOverlay() {
  if (!CSF_MODE) return Promise.resolve();
  if (!csfOverlayPromise) {
    csfOverlayPromise = Promise.all([
      loadCsfSkillOverlay(),
      loadCsfTemplateOverlay(),
      loadCsfWeaponOverlay(),
      loadCsfEchoOverlay(),
    ]).catch(() => null);
  }
  return csfOverlayPromise;
}
const JINGRAN_HP_FLAT_ATK_SOURCE_ID = `${CHAR_KIT_PANEL_PREFIX}jingran_yangbian_yinhe`;
const JINGRAN_HP_FLAT_ATK_PER_CHUNK = 36;
const JINGRAN_HP_FLAT_ATK_HP_CHUNK = 1000;
const JINGRAN_HP_FLAT_ATK_CAP = 1800;
/** 景燃【阴阳相生】（3链替换阳变阴合）：每1000生命+50固定攻击，上限2500 */
const JINGRAN_YINYANG_XIANGSHENG_PER_CHUNK = 50;
const JINGRAN_YINYANG_XIANGSHENG_CAP = 2500;
/** 景燃【命火】：生命(>25000部分) → 劫魄/踏罡倍率增加（每1000生命一段，最多计入25000=25段） */
const JINGRAN_MINGHUO_KEY = 'jingran_minghuo';
const JINGRAN_MINGHUO_HP_THRESHOLD = 25000;
const JINGRAN_MINGHUO_HP_CAP = 25000;
const JINGRAN_MINGHUO_MAX_CHUNKS = 25;
const JINGRAN_MINGHUO_JIEPO_PER_CHUNK = 21.10;
const JINGRAN_MINGHUO_TAGANG_PER_CHUNK = 21.65;
const JINGRAN_MINGHUO_JIEPO_EFFECT_KEY = 'jingran_minghuo_jiepo';
const JINGRAN_MINGHUO_TAGANG_EFFECT_KEY = 'jingran_minghuo_tagang';
const JINGRAN_JIEPO_SKILLS = ['逆渡三途·重击·劫魄', '劫魄'];
const JINGRAN_TAGANG_SKILLS = ['逆渡三途·重击·踏罡', '踏罡'];
/** 景燃【祸兮福兮】：叠层热熔增伤；每层按生命转化，每1000生命+0.05%，单层上限2.5%，最多50层 */
const JINGRAN_HUOXI_FUXI_KEY = 'jingran_huoxi_fuxi';
const JINGRAN_HUOXI_FUXI_MAX_STACKS = 50;
const JINGRAN_HUOXI_FUXI_PER_CHUNK = 0.05;
const JINGRAN_HUOXI_FUXI_PER_STACK_CAP = 2.5;
/** 景燃【幽而复明】：常驻 生命 → 热熔伤害加成（每1000生命+1.5%，上限75%） */
const JINGRAN_YOUFU_FUMING_KEY = 'jingran_youfu_fuming';
const JINGRAN_YOUFU_FUMING_PER_CHUNK = 1.5;
const JINGRAN_YOUFU_FUMING_CAP = 75;
const JINGRAN_YOUFU_FUMING_EFFECT_KEY = 'jingran_youfu_fuming_fusion';
/** 战斗模态（角色专属；集谐有计算，其余先占位） */
const COMBAT_MODE_DEFS = {
  convergence: { id: 'convergence', label: '集谐' },
  convergenceResponse: { id: 'convergenceResponse', label: '集谐·响应' },
  burst: { id: 'burst', label: '聚爆' },
  shock: { id: 'shock', label: '震谐' },
  shockResponse: { id: 'shockResponse', label: '震谐·响应' },
  frost: { id: 'frost', label: '霜渐' },
  echo: { id: 'echo', label: '声骸' },
  absolution: { id: 'absolution', label: '赦罪' },
  confession: { id: 'confession', label: '告解' },
  tongzou: { id: 'tongzou', label: '同奏' },
  dianci: { id: 'dianci', label: '电磁' },
};
/**
 * 指定角色可选模态。
 * fixed: 仅一种模态且不可退出；集谐与陆·赫斯/达妮娅共用现有易伤计算。
 */
const CHAR_COMBAT_MODE_CONFIG = {
  '1510': { modes: ['convergence'], fixed: true, defaultMode: 'convergence' }, // 陆·赫斯
  '1413': { modes: ['convergence'], fixed: true, defaultMode: 'convergence' }, // 清宵（测试服）：引剑破万法走系统集谐易伤
  '1210': { modes: ['shock', 'burst'], fixed: false, defaultMode: 'shock' }, // 爱弥斯
  '1211': { modes: ['convergence', 'burst'], fixed: false, defaultMode: 'convergence' }, // 达妮娅
  '1109': { modes: ['frost', 'echo'], fixed: false, defaultMode: 'frost' }, // 洛瑟菈
  '1509': { modes: ['shock', 'convergence'], fixed: false, defaultMode: 'shock' }, // 琳奈
  [MONING_CHAR_ID]: {
    modes: ['convergenceResponse', 'shockResponse'],
    fixed: false,
    defaultMode: 'convergenceResponse',
  }, // 莫宁
  '1506': { modes: ['absolution', 'confession'], fixed: false, defaultMode: 'absolution' }, // 菲比
  '1311': { modes: ['tongzou', 'dianci'], fixed: false, defaultMode: 'tongzou' }, // 心
};
const PHOEBE_CHAR_ID = '1506';
/** 菲比混合编轴：阶段/技能可覆盖战斗模态（赦罪/告解） */
const PHOEBE_HYBRID_COMBAT_MODES = ['absolution', 'confession'];
/** 菲比·固有2：赦罪/告解均生效，衍射增伤 +12% */
const PHOEBE_INNATE2_ELEMENT_KEY = 'phoebe_innate2_diffraction';
const PHOEBE_INNATE2_ELEMENT_PCT = 12;
/** 菲比·赦罪：重击·星辉加深 / 启明之誓愿倍率 / 倾听之心倍率 */
const PHOEBE_ABSOLUTION_KIT_KEY = 'phoebe_absolution_kit';
const PHOEBE_STARLIGHT_HEAVY_DEEP_PCT = 256;
const PHOEBE_DAWN_OATH_MULT_BOOST_PCT = 255;
/** ≥1 链赦罪：启明之誓愿倍率提升合计 480%（本体 255 + 追加 225） */
const PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL = 480;
const PHOEBE_DAWN_OATH_C1_ABSOLUTION_EXTRA =
  PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL - PHOEBE_DAWN_OATH_MULT_BOOST_PCT;
/** ≥1 链告解：启明之誓愿倍率提升 +90% */
const PHOEBE_C1_CONFESSION_DAWN_KEY = 'phoebe_c1_confession_dawn_mult';
const PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT = 90;
const PHOEBE_LISTEN_HEART_MULT_BOOST_PCT = 255;
/** ≥2 链赦罪：倾听之心伤害加深 +120% */
const PHOEBE_C2_ABSOLUTION_LISTEN_DEEP_KEY = 'phoebe_c2_absolution_listen_deep';
const PHOEBE_LISTEN_HEART_C2_DEEP_PCT = 120;
const PHOEBE_STARLIGHT_HEAVY_SKILLS = [
  '交错星辉的祝祷·重击·星辉',
  '重击·星辉',
];
const PHOEBE_DAWN_OATH_SKILLS = ['启明之誓愿·技能', '启明之誓愿'];
const PHOEBE_LISTEN_HEART_SKILLS = ['倾听之心'];
/** 菲比·告解延奏：全队衍射减抗 + 光噪加深（含本人） */
const PHOEBE_OUTRO_KEY = 'phoebe_outro';
const PHOEBE_OUTRO_RES_REDUCE_PCT = 10;
const PHOEBE_OUTRO_GUANGZAO_DEEP_PCT = 100;
/** ≥2 链告解：菲比·延奏光噪加深 100%→220%（追加 +120%） */
const PHOEBE_OUTRO_GUANGZAO_C2_EXTRA_PCT = 120;
const PHOEBE_OUTRO_GUANGZAO_C2_TOTAL =
  PHOEBE_OUTRO_GUANGZAO_DEEP_PCT + PHOEBE_OUTRO_GUANGZAO_C2_EXTRA_PCT;
/** ≥3 链：重击·星辉倍率提升（赦罪 / 告解） */
const PHOEBE_C3_ABSOLUTION_STARLIGHT_KEY = 'phoebe_c3_absolution_starlight_mult';
const PHOEBE_C3_CONFESSION_STARLIGHT_KEY = 'phoebe_c3_confession_starlight_mult';
const PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT = 91;
const PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT = 249;
/** ≥4 链：全队【菲比·4链】衍射抗性降低；个人【4链】衍射增伤 */
const PHOEBE_C4_TEAM_RES_KEY = 'phoebe_c4_team_res_reduce';
const PHOEBE_C4_TEAM_RES_REDUCE_PCT = 10;
const PHOEBE_C4_PERSONAL_ELEMENT_KEY = 'phoebe_c4_personal_diffraction';
const PHOEBE_C4_PERSONAL_ELEMENT_PCT = 12;
/** ≥6 链：赦罪/告解均生效，个人攻击 +10% */
const PHOEBE_C6_PERSONAL_ATK_KEY = 'phoebe_c6_personal_atk';
const PHOEBE_C6_PERSONAL_ATK_PCT = 10;
/** 千咲 ≥1 链：技能库【1链·额外】固定伤害（不受任何乘区加成） */
const QIANXIAO_CHAR_ID = '1508';
const QIANXIAO_C1_EXTRA_SKILL_KEY = 'qianxiao_c1_extra_fixed';
const QIANXIAO_C1_EXTRA_SKILL_NAME = '1链·额外';
const QIANXIAO_C1_EXTRA_FIXED_DMG = 61803;
/** 千咲本体【万缕·汇终】：指定技能倍率提升 +120%；≥3 链再 +120%（加算 → 合计 240%） */
const QIANXIAO_HUIZHONG_KEY = 'qianxiao_wanlv_huizhong';
const QIANXIAO_HUIZHONG_MULT_PCT = 120;
const QIANXIAO_HUIZHONG_C2_MIN_RESONANCE = 3;
const QIANXIAO_HUIZHONG_BASE_EFFECT_KEY = 'qianxiao_huizhong_mult';
const QIANXIAO_HUIZHONG_C2_EFFECT_KEY = 'qianxiao_huizhong_mult_c2';
/** 固有技能【万缕·汇终】游戏原文案（ensure 重建时保留用户已填文案） */
const QIANXIAO_HUIZHONG_GAME_TEXT =
  '万缕·汇终\n锯环·疾攻、电锯模式·闪避反击、锯环·终结伤害倍率提升120%。\n锯环·疾攻、电锯模式·闪避反击消耗【锯环残响】提供的锯环·终结倍率增加效果提升120%。';
/** 千咲全队【虚无纹痕】：虚湮之线，无视防御 18%（延奏后全队可吃） */
const QIANXIAO_XUWUWENHEN_KEY = 'qianxiao_xuwuwenhen';
const QIANXIAO_XUWUWENHEN_NAME = '虚无纹痕';
const QIANXIAO_XUWUWENHEN_IGNORE_PCT = 18;
/** 千咲全队【暗效应】：虚湮效应，每层穿防 2%（敌方减防，全队受益） */
const QIANXIAO_ANYINGXIAO_KEY = 'qianxiao_anyingxiao';
const QIANXIAO_ANYINGXIAO_NAME = '暗效应';
const QIANXIAO_ANYINGXIAO_PEN_PER_STACK = 2;
const QIANXIAO_ANYINGXIAO_MAX_STACKS = 6;
const QIANXIAO_HUIZHONG_SKILLS = [
  '解弦视界·万理归尘·锯环·疾攻第一段',
  '解弦视界·万理归尘·锯环·疾攻第二段',
  '解弦视界·万理归尘·锯环·疾攻第二段长按',
  '解弦视界·万理归尘·锯环·疾攻第二段·折鸣',
  '解弦视界·万理归尘·锯环·疾攻第三段',
  '解弦视界·万理归尘·锯环·疾攻第三段长按',
  '解弦视界·万理归尘·锯环·疾攻第三段·坠响',
  '解弦视界·万理归尘·电锯模式·闪避反击',
  '解弦视界·万理归尘·电锯模式·闪避反击长按',
  '解弦视界·万理归尘·锯环·终结',
];
const AMIS_CHAR_ID = '1210';
const SPECIAL_SKILL_LIB_SOURCE_TAG = 'specialSkillLib';
/** 爱弥斯 6 链：聚爆光翼 / 聚爆效应额外暴击、暴伤 */
const AMIS_CHAIN6_CRIT_RATE = 80;
const AMIS_CHAIN6_CRIT_DMG = 275;
/**
 * 特殊技能库：按「角色id|战斗模态」提供可点选入算的技能。
 * trackLayers：可填轨迹层数；trackLayerBonus 默认 0.04（震谐），聚爆光翼为 0.10
 * chain2TrackLayerBonus：共鸣链 ≥2 时替换轨迹每层加成（聚爆光翼 0.15）
 * stackMultTable：按层数档查基础倍率（如聚爆 10/13/16）
 * baseMultBoost：固定基础倍率提升（如强化光翼 2.0 = +200%），与轨迹加成加算：×(1+boost+轨迹×rate)
 * chain2BaseMultBoost：共鸣链 ≥2 时在同一乘区再叠加的固定提升（强化光翼 +200% → 合计 400%）
 * chain3BaseMultBoost：共鸣链 ≥3 时同乘区追加固定提升（如绯雪额外效应 +488%）
 * chain2MultBonus：共鸣链 ≥2 时倍率 ×(1+bonus)（震谐光翼用）
 * chain6CritRate / chain6CritDmg：共鸣链 ≥6 时额外计入暴击% / 暴伤%
 * kind：execution（默认）或 effect；聚爆光翼为效应（基数 3674）
 */
const AMIS_BURST_WING_STACK_TABLE = {
  10: 698.63,
  13: 1397.26,
  16: 2095.88,
};
const AMIS_BURST_WING_STACK_OPTIONS = [10, 13, 16];
const SPECIAL_SKILL_LIBRARIES = {
  [`${AMIS_CHAR_ID}|shock`]: [
    {
      key: 'amis_shock_response',
      name: '震谐响应·爱弥斯',
      skillType: '共鸣回路',
      baseMult: 596.43,
      chain2MultBonus: 0,
      chain6CritRate: 80,
      chain6CritDmg: 275,
    },
    {
      key: 'amis_shock_wing_strong',
      name: '震谐·强化光翼',
      skillType: '共鸣回路',
      baseMult: 1093.5,
      chain2MultBonus: 0.7,
      trackLayers: true,
      trackLayerBonus: 0.04,
      defaultTrackLayers: 0,
      chain6CritRate: 80,
      chain6CritDmg: 275,
    },
    {
      key: 'amis_shock_wing_normal',
      name: '震谐·普通光翼',
      skillType: '共鸣回路',
      baseMult: 546.75,
      chain2MultBonus: 0.4,
      trackLayers: true,
      trackLayerBonus: 0.04,
      defaultTrackLayers: 0,
      chain6CritRate: 80,
      chain6CritDmg: 275,
    },
  ],
  [`${AMIS_CHAR_ID}|burst`]: [
    {
      key: 'amis_burst_wing_strong',
      name: '聚爆·强化光翼',
      kind: 'effect',
      effectType: '聚爆',
      skillType: '共鸣回路',
      stackMultTable: { ...AMIS_BURST_WING_STACK_TABLE },
      defaultStackLayers: 10,
      trackLayers: true,
      trackLayerBonus: 0.1,
      chain2TrackLayerBonus: 0.15,
      defaultTrackLayers: 30,
      baseMultBoost: 2,
      chain2BaseMultBoost: 2,
      chain2MultBonus: 0,
      chain6CritRate: AMIS_CHAIN6_CRIT_RATE,
      chain6CritDmg: AMIS_CHAIN6_CRIT_DMG,
    },
    {
      key: 'amis_burst_wing_normal',
      name: '聚爆·普通光翼',
      kind: 'effect',
      effectType: '聚爆',
      skillType: '共鸣回路',
      stackMultTable: { ...AMIS_BURST_WING_STACK_TABLE },
      defaultStackLayers: 10,
      trackLayers: true,
      trackLayerBonus: 0.1,
      chain2TrackLayerBonus: 0.15,
      defaultTrackLayers: 30,
      baseMultBoost: 0,
      chain2MultBonus: 0,
      chain6CritRate: AMIS_CHAIN6_CRIT_RATE,
      chain6CritDmg: AMIS_CHAIN6_CRIT_DMG,
    },
  ],
  /** 达妮娅 6 链 × 聚爆：强化聚爆效应（查表 10/13/16，再 ×(1+200%)）；无官网页签 */
  [`${DANIA_CHAR_ID}|burst`]: [
    {
      key: 'dania_c6_burst_reinforce',
      name: '达妮娅·6链·强化聚爆',
      kind: 'effect',
      effectType: '聚爆',
      stackMultTable: { ...AMIS_BURST_WING_STACK_TABLE },
      defaultStackLayers: 10,
      baseMultBoost: 2,
      requireResonance: 6,
      autoAdd: true,
    },
  ],
  /** 莫宁·震谐·响应：可选手动加入【莫宁·响应震谐】 */
  [`${MONING_CHAR_ID}|shockResponse`]: [
    {
      key: 'moning_response_shock',
      name: '莫宁·响应震谐',
      skillType: '共鸣回路',
      baseMult: 298.22,
      chain5MultBoost: MONING_C5_RESPONSE_BOOST_PCT / 100,
    },
  ],
  /** 琳奈·震谐：处决【震谐响应·光谱解析】（已从普通技能库移出） */
  [`${LINNEI_CHAR_ID}|shock`]: [
    {
      key: 'linnei_shock_spectral_analysis',
      name: '震谐响应·光谱解析',
      kind: 'execution',
      skillType: '共鸣回路',
      baseMult: 1880.75,
    },
  ],
  /** 露西·固有：处决【骇破响应·数据崩解】【欺骗程式·运动失能】（已从普通技能库移出；≥3链基础倍率提升+65%） */
  [`${LUCY_CHAR_ID}|kit`]: [
    {
      key: 'lucy_breach_data_collapse',
      name: '骇破响应·数据崩解',
      kind: 'execution',
      skillType: '共鸣回路',
      baseMult: 1367.75,
      chain3BaseMultBoost: LUCY_SPECIAL_C3_BASE_MULT_BOOST,
    },
    {
      key: 'lucy_deception_motor_disable',
      name: '欺骗程式·运动失能',
      kind: 'execution',
      skillType: '共鸣解放',
      baseMult: 911.83,
      chain3BaseMultBoost: LUCY_SPECIAL_C3_BASE_MULT_BOOST,
    },
  ],
  /** 丽贝卡·固有：处决【骇破响应·熔融】（已从普通技能库移出） */
  [`${REBECCA_CHAR_ID}|kit`]: [
    {
      key: 'rebecca_breach_melt',
      name: '骇破响应·熔融',
      kind: 'execution',
      skillType: '共鸣回路',
      baseMult: 2358.89,
    },
  ],
  /** 绯雪·雪锈≥2：霜渐额外效应（基础 102%；≥3链 基础倍率提升+488%）；无官网页签 */
  [`${FEIXUE_CHAR_ID}|kit`]: [
    {
      key: 'feixue_extra_effect',
      name: '绯雪·额外效应',
      kind: 'effect',
      effectType: '霜渐',
      baseMult: 102,
      requireXuexiuStacks: 2,
      chain3BaseMultBoost: 4.88,
      autoAdd: true,
    },
  ],
  /** 心·电磁特殊技能（1311|dianci）：霆心域/电磁层数由玩家填；链6固定暴击 */
  ['1311|dianci']: [
    {
      key: 'xin_dianci_zhaoshixiang',
      name: '共鸣技能·照世相·电磁',
      kind: 'effect',
      effectType: '电磁',
      skillType: '共鸣回路',
      layerRate: 0.35,
      chain1LayerRate: 0.42,
      defaultXinTingLayers: 5,
      chain6CritRate: 80,
      chain6CritDmg: 230,
    },
    {
      key: 'xin_dianci_wanquetian',
      name: '万阙垂天·附带电磁',
      kind: 'effect',
      effectType: '电磁',
      skillType: '共鸣解放',
      effectLayerRatio: 15,
      requireResonance: 3,
      // 与爱弥斯库技能一致，玩家点选添加并填写本轮触发次数。
      chain6CritRate: 80,
      chain6CritDmg: 230,
    },
  ],
};
/** 旧技能库 key → 新 key（可选默认轨迹层） */
const SPECIAL_SKILL_LIB_KEY_MIGRATE = {
  amis_shock_wing_strong_0: { key: 'amis_shock_wing_strong' },
  amis_shock_wing_strong_30: { key: 'amis_shock_wing_strong', trackLayers: 30 },
  amis_shock_wing_normal_0: { key: 'amis_shock_wing_normal' },
  amis_shock_wing_normal_30: { key: 'amis_shock_wing_normal', trackLayers: 30 },
};
const WEAPON_REFINEMENT_OPTIONS = [1, 2, 3, 4, 5];
const WEAPON_TYPE_LABELS = { 1: '长刃', 2: '迅刀', 3: '佩枪', 4: '臂铠', 5: '音感仪' };
const ELEMENT_TYPES = {
  all: { label: '全部', icon: '全', color: '#8b9cb3', glow: 'rgba(139,156,179,0.35)' },
  1: { label: '冷凝', icon: '冰', color: '#5eb8e8', glow: 'rgba(94,184,232,0.45)' },
  2: { label: '热熔', icon: '焰', color: '#e85a4a', glow: 'rgba(232,90,74,0.45)' },
  3: { label: '导电', icon: '雷', color: '#a56be8', glow: 'rgba(165,107,232,0.45)' },
  4: { label: '气动', icon: '风', color: '#5ecf7a', glow: 'rgba(94,207,122,0.45)' },
  5: { label: '衍射', icon: '光', color: '#e6b422', glow: 'rgba(230,180,34,0.45)' },
  6: { label: '湮灭', icon: '湮', color: '#d45a9e', glow: 'rgba(212,90,158,0.45)' },
};
const CHAR_ELEMENT_COLORS = {
  1: ['#4a9fd4', '#5eb8e8'],
  2: ['#d94a3a', '#e85a4a'],
  3: ['#8b4fd4', '#a56be8'],
  4: ['#3da85c', '#5ecf7a'],
  5: ['#c99a18', '#e6b422'],
  6: ['#a8327a', '#d45a9e'],
  0: ['#6b7c93', '#8b9cb3'],
};
const NANOKA_ASSET_BASE = 'https://static.nanoka.cc/assets/ww';
const ELEMENT_ICON_FILES = {
  1: 'assets/icons/element-1.webp',
  2: 'assets/icons/element-2.webp',
  3: 'assets/icons/element-3.webp',
  4: 'assets/icons/element-4.webp',
  5: 'assets/icons/element-5.webp',
  6: 'assets/icons/element-6.webp',
};
const WEAPON_ICON_FILES = {
  1: 'assets/icons/weapon-1.webp',
  2: 'assets/icons/weapon-2.webp',
  3: 'assets/icons/weapon-3.webp',
  4: 'assets/icons/weapon-4.webp',
  5: 'assets/icons/weapon-5.webp',
};
const NANOKA_ELEMENT_ICON_PATHS = {
  1: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriIce',
  2: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriFire',
  3: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriThunder',
  4: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriWind',
  5: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriLight',
  6: 'UIResources/Common/Image/IconElementAttri/T_IconElementAttriDark',
};
const NANOKA_WEAPON_ICON_PATHS = {
  1: 'UIResources/Common/Image/IconWeapon/T_IconWeapon21010011_UI',
  2: 'UIResources/Common/Image/IconWeapon/T_IconWeapon21020011_UI',
  3: 'UIResources/Common/Image/IconWeapon/T_IconWeapon21030011_UI',
  4: 'UIResources/Common/Image/IconWeapon/T_IconWeapon21040011_UI',
  5: 'UIResources/Common/Image/IconWeapon/T_IconWeapon21050011_UI',
};
/** 面板属性图标（本地透明 PNG；来源 nanoka IconAttribute） */
const PANEL_STAT_ICON_FILES = {
  finalAtk: 'assets/icons/panel/atk.png',
  finalHp: 'assets/icons/panel/hp.png',
  finalDef: 'assets/icons/panel/def.png',
  harmonyBreakAmp: 'assets/icons/panel/harmony.png',
  critRate: 'assets/icons/panel/crit-rate.png',
  // crit.png 为「暴击伤害」样式（四箭头向心）
  critDmg: 'assets/icons/panel/crit.png',
  energyRegenPct: 'assets/icons/panel/energy.png',
  attrBonus: 'assets/icons/panel/general.png',
};
const NANOKA_PANEL_STAT_ICON_PATHS = {
  finalAtk: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredattack_UI',
  critDmg: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredcrit_UI',
  attrBonus: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredgeneral_UI',
};
/** 属性伤害加成：按角色元素切换图标 */
const PANEL_ATTR_BONUS_ICON_BY_ELEMENT = {
  1: { local: 'assets/icons/panel/elem-ice.png', remote: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredice_UI' },
  2: { local: 'assets/icons/panel/elem-hot.png', remote: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredhot_UI' },
  3: { local: 'assets/icons/panel/elem-thunder.png', remote: '' },
  4: { local: 'assets/icons/panel/elem-wind.png', remote: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredwind_UI' },
  5: { local: 'assets/icons/panel/elem-light.png', remote: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyredlight_UI' },
  6: { local: 'assets/icons/panel/elem-dark.png', remote: 'UIResources/Common/Image/IconAttribute/T_Iconpropertyreddark_UI' },
};
/** 类型伤害加成：按当前主要类型切换 */
const PANEL_TYPE_DMG_ICON_TYPES = ['普攻', '重击', '共鸣技能', '共鸣解放'];
const PANEL_TYPE_DMG_ICON_BY_TYPE = {
  普攻: { local: 'assets/icons/panel/type-basic.png', remote: '' },
  重击: { local: 'assets/icons/panel/type-heavy.png', remote: '' },
  共鸣技能: { local: 'assets/icons/panel/type-skill.png', remote: '' },
  共鸣解放: { local: 'assets/icons/panel/type-liberation.png', remote: '' },
};

/** 类型增伤来源里数值最高的主类型（仅普攻/重击/技能/解放） */
function getPrimaryTypeDmgBonusType(member) {
  const sources = member?.char?.typeDmgBonusSources || [];
  const totals = Object.create(null);
  PANEL_TYPE_DMG_ICON_TYPES.forEach((t) => {
    totals[t] = 0;
  });
  sources.forEach((item) => {
    const dt = typeof parseTypeSourceDamageType === 'function' ? parseTypeSourceDamageType(item) : String(item?.damageType || '');
    if (!Object.prototype.hasOwnProperty.call(totals, dt)) return;
    totals[dt] += Number(item?.value) || 0;
  });
  let best = '';
  let bestVal = 0;
  PANEL_TYPE_DMG_ICON_TYPES.forEach((t) => {
    if (totals[t] > bestVal) {
      bestVal = totals[t];
      best = t;
    }
  });
  return bestVal > 0 ? best : '';
}

function getPanelStatIconInfo(key, member) {
  if (key === 'attrBonus') {
    const charDef = member?.characterId ? findCharSkillDef(member.characterId) : null;
    const el = charDef?.element;
    const byEl = PANEL_ATTR_BONUS_ICON_BY_ELEMENT[el];
    if (byEl) return { local: byEl.local, remotePath: byEl.remote };
  }
  if (key === 'typeDmgBonus') {
    const primary = getPrimaryTypeDmgBonusType(member);
    const byType = primary ? PANEL_TYPE_DMG_ICON_BY_TYPE[primary] : null;
    if (byType) return { local: byType.local, remotePath: byType.remote };
  }
  const local = PANEL_STAT_ICON_FILES[key] || '';
  const remotePath = NANOKA_PANEL_STAT_ICON_PATHS[key] || '';
  return local || remotePath ? { local, remotePath } : null;
}

const ECHO_COST_CAP = 12;
const ECHO_SOURCE_ID = 'echo_agg_total';
const ECHO_SOURCE_NAME = '声骸（合计）';
const ECHO_DMG_SOURCE_PREFIX = 'echo_panel_dmg_';
const ECHO_ATTR_SOURCE_PREFIX = 'echo_panel_attr_';
const ECHO_TYPE_DMG_SOURCE_PREFIX = 'echo_panel_type_';

function isEchoAttrPanelSource(item) {
  const id = String(item?.id || '');
  return id.startsWith(ECHO_ATTR_SOURCE_PREFIX) || id.startsWith(`${ECHO_DMG_SOURCE_PREFIX}elem_`);
}

function isEchoTypeDmgPanelSource(item) {
  const id = String(item?.id || '');
  return id.startsWith(ECHO_TYPE_DMG_SOURCE_PREFIX) || id.startsWith(`${ECHO_DMG_SOURCE_PREFIX}type_`);
}

function isEchoDmgPanelSource(item) {
  return isEchoAttrPanelSource(item) || isEchoTypeDmgPanelSource(item);
}

/** 声骸词条合计行（含克隆后 id 被改写的孤儿行） */
function isEchoAggTotalSource(item) {
  if (item?.id === ECHO_SOURCE_ID) return true;
  // 兼容全角/半角括号、多余空格
  const name = String(item?.name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[()]/g, (ch) => (ch === '(' ? '（' : '）'));
  return name === ECHO_SOURCE_NAME || name === '声骸合计';
}

function isEchoPanelSource(item) {
  return (
    isEchoAggTotalSource(item) ||
    isEchoDmgPanelSource(item) ||
    isEchoMainPanelSource(item) ||
    isEchoSetPanelSource(item)
  );
}

const ECHO_SET_BONUS_TIERS = [1, 2, 3, 5];

function getEchoSetActiveTiers(def, count) {
  if (!def?.bonuses || !count) return [];
  return ECHO_SET_BONUS_TIERS.filter((tier) => def.bonuses[String(tier)] && count >= tier);
}

const ECHO_SET_PANEL_PREFIX = 'echo_set_panel_';
const ECHO_MAIN_PANEL_ATTR_PREFIX = 'echo_main_panel_attr_';
const ECHO_MAIN_PANEL_TYPE_PREFIX = 'echo_main_panel_type_';
const ECHO_MAIN_PANEL_STAT_PREFIX = 'echo_main_panel_stat_';
const ECHO_MAIN_BUFF_PREFIX = 'echo_main_buff_';
const ECHO_SET_BUFF_PREFIX = 'echo_set_fx_';
const ECHO_SET_TEAM_BUFF_PREFIX = 'echo_set_team_fx_';
const ECHO_SET_SKILL_PREFIX = 'echo_set_skill_';
const ECHO_MAIN_TEAM_BUFF_PREFIX = 'echo_main_team_fx_';
const ECHO_SKILL_PALETTE_ID = 'echo_main_skill_palette';
const ECHO_MAIN_SKILL_PREFIX = 'echo_main_skill_';
/** 逆光跃彩之约 5 件：基础攻击15% + 装备者谐幅额外攻击（0.3%/点，上限15%）合并为一条 */
const ECHO_SET_NIGUANG_YUECAI_ID = '24';
const ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC = 'echoSetSourceHarmonyAmp';
const ECHO_NIGUANG_ATK_BASE = 15;
const ECHO_NIGUANG_ATK_PER_POINT = 0.3;
const ECHO_NIGUANG_ATK_EXTRA_CAP = 15;
const ECHO_SETS_DB_URL = 'echo-sets.json?v=b4027ae07a';
const ECHO_SPECIMENS_DB_URL = 'echo-specimens.json?v=d11342668b';
const ECHO_SET_MAIN_MAP_URL = 'echo-set-main-map.json?v=78b9bb0529';
const ECHO_SETS_DB_CACHE_KEY = 'mc-echo-sets-db-v29';
const ECHO_SPECIMENS_DB_CACHE_KEY = 'mc-echo-specimens-db-v27';
const ECHO_SET_MAIN_MAP_CACHE_KEY = 'mc-echo-set-main-map-v14';
const ECHO_SET_MAIN_MAP_MIN_SETS = 30;
const ECHO_SPECIMENS_MIN_COUNT = 40;

function isEchoSetPanelSource(item) {
  const id = String(item?.id || '');
  return (
    id.startsWith(ECHO_SET_PANEL_PREFIX) ||
    id.startsWith(ECHO_MAIN_PANEL_ATTR_PREFIX) ||
    id.startsWith(ECHO_MAIN_PANEL_TYPE_PREFIX) ||
    id.startsWith(ECHO_MAIN_PANEL_STAT_PREFIX)
  );
}

function isEchoMainTypePanelSource(item) {
  return String(item?.id || '').startsWith(ECHO_MAIN_PANEL_TYPE_PREFIX);
}

function isEchoSetGeneratedBuff(buff) {
  return !!buff?.echoSetGenerated || String(buff?.id || '').startsWith(ECHO_SET_BUFF_PREFIX);
}

function isEchoSetTeamBuff(buff) {
  return !!buff?.echoSetTeamBuff || String(buff?.id || '').startsWith(ECHO_SET_TEAM_BUFF_PREFIX);
}

function isEchoMainTeamBuff(buff) {
  return !!buff?.echoMainTeamBuff || String(buff?.id || '').startsWith(ECHO_MAIN_TEAM_BUFF_PREFIX);
}

function isEchoMainPanelSource(item) {
  return isEchoSetPanelSource(item) || isEchoMainTypePanelSource(item);
}

function parseAttrSourceElement(item) {
  if (item?.element && ECHO_ELEMENTS.includes(item.element)) return item.element;
  const id = String(item?.id || '');
  if (id.startsWith(ECHO_ATTR_SOURCE_PREFIX)) {
    return id.slice(ECHO_ATTR_SOURCE_PREFIX.length) || '';
  }
  if (id.startsWith(ECHO_MAIN_PANEL_ATTR_PREFIX)) {
    let el = id.slice(ECHO_MAIN_PANEL_ATTR_PREFIX.length) || '';
    if (el.endsWith('_bonus')) el = el.slice(0, -6);
    return el;
  }
  if (id.startsWith(ECHO_SET_PANEL_PREFIX)) {
    const parts = id.split('_');
    const last = parts[parts.length - 1];
    if (ECHO_ELEMENTS.includes(last)) return last;
  }
  const name = String(item?.name || '');
  for (const el of ECHO_ELEMENTS) {
    if (name.includes(el)) return el;
  }
  return '';
}

function parseTypeSourceDamageType(item) {
  if (item?.damageType) return String(item.damageType);
  const id = String(item?.id || '');
  if (id.startsWith(ECHO_TYPE_DMG_SOURCE_PREFIX)) {
    return id.slice(ECHO_TYPE_DMG_SOURCE_PREFIX.length) || '';
  }
  if (id.startsWith(ECHO_MAIN_PANEL_TYPE_PREFIX)) {
    return id.slice(ECHO_MAIN_PANEL_TYPE_PREFIX.length) || '';
  }
  if (id.startsWith(ECHO_SET_PANEL_PREFIX) && id.includes('_type_')) {
    return id.slice(id.indexOf('_type_') + 6) || '';
  }
  const name = String(item?.name || '');
  for (const dt of DAMAGE_TYPES) {
    if (name.includes(dt)) return dt;
  }
  return '';
}

/** 手动面板属性增伤：无元素标记时视为角色自身属性 */
function getManualAttrBonusForElement(char, member, elementLabel) {
  if (!elementLabel) return 0;
  const charEl = member ? getMemberElementLabel(member) : '';
  return (char?.attrBonusSources || []).reduce((s, item) => {
    if (isEchoAttrPanelSource(item) || isEchoSetPanelSource(item) || isEchoMainPanelSource(item)) return s;
    const srcEl = parseAttrSourceElement(item);
    if (srcEl) {
      return srcEl === elementLabel ? s + (Number(item.value) || 0) : s;
    }
    return charEl && elementLabel === charEl ? s + (Number(item.value) || 0) : s;
  }, 0);
}

/** 手动面板类型增伤：须与技能 damageType 一致（或来源名/ID 含类型） */
function getManualTypeDmgBonusForType(char, damageType) {
  if (!damageType) return 0;
  return (char?.typeDmgBonusSources || []).reduce((s, item) => {
    // 声骸副词条（echo_panel_type_*）与主位类型面板（echo_main_panel_type_*）由
    // getEchoTypeDmgBonusPct / getEchoMainTypeDmgBonusPct 按 ID 精确消费；
    // 套装类型增伤面板（echo_set_panel_*_type_*）无专用消费方，须按 ID 解析类型在此计入
    // （修复：碎梦亡鬼之魇 普攻/重击 +35%、凌冽决断之心 共鸣技能 +12% 此前从未进结算）。
    if (isEchoTypeDmgPanelSource(item) || isEchoMainTypePanelSource(item)) return s;
    const srcType = parseTypeSourceDamageType(item);
    return srcType === damageType ? s + (Number(item.value) || 0) : s;
  }, 0);
}

/** 丽贝卡≥6链：普攻伤害加成结算系数（1 或 1.4）；覆盖面板/声骸/Buff 全部来源 */
function getRebeccaC6NormalAtkBonusScale(member) {
  if (!member || String(member.characterId) !== REBECCA_CHAR_ID) return 1;
  if (normalizeResonanceUnlocked(member.resonanceUnlocked) < REBECCA_C6_MIN_RESONANCE) return 1;
  return REBECCA_C6_NORMAL_ATK_BONUS_SCALE;
}

function getEchoMainAttrBonusPct(member, elementLabel) {
  if (!member?.char || !elementLabel) return 0;
  const sources = member.char.attrBonusSources || [];
  let sum = 0;
  sources.forEach((item) => {
    const id = String(item.id || '');
    if (!id.startsWith(ECHO_MAIN_PANEL_ATTR_PREFIX) && !id.startsWith(ECHO_SET_PANEL_PREFIX)) return;
    let el = '';
    if (id.startsWith(ECHO_SET_PANEL_PREFIX)) {
      const parts = id.split('_');
      el = parts[parts.length - 1];
    } else {
      el = id.slice(ECHO_MAIN_PANEL_ATTR_PREFIX.length);
      if (el.endsWith('_bonus')) el = el.slice(0, -6);
    }
    if (el && el !== elementLabel) return;
    sum += Number(item.value) || 0;
  });
  return sum;
}

function getEchoMainTypeDmgBonusPct(member, damageType) {
  if (!member?.char || !damageType) return 0;
  const key = ECHO_MAIN_PANEL_TYPE_PREFIX + damageType;
  const item = (member.char.typeDmgBonusSources || []).find((s) => s.id === key);
  return item ? Number(item.value) || 0 : 0;
}
const ECHO_LAYOUTS = {
  '43311': { label: '43311', costs: [4, 3, 3, 1, 1], default: true },
  '44111': { label: '44111', costs: [4, 4, 1, 1, 1], default: false },
  '43111': { label: '43111', costs: [4, 3, 1, 1, 1], default: false },
  '33111': { label: '33111', costs: [3, 3, 1, 1, 1], default: false },
};
const ECHO_ELEMENTS = [1, 2, 3, 4, 5, 6].map((id) => ELEMENT_TYPES[id].label);
/** 属性增伤页签内的「泛用」选项（对应 generalBonus） */
const BUFF_ELEMENT_GENERAL = '泛用';
/** 类型 Buff 选「效应」时的子类型；泛用 = 对全部效应类型生效 */
const BUFF_EFFECT_TYPE_GENERAL = '泛用';

const ECHO_MAIN1_OPTIONS = {
  4: [
    { id: 'main_crit_rate', label: '暴击率', value: 22, panelTarget: 'crit_rate' },
    { id: 'main_crit_dmg', label: '暴击伤害', value: 44, panelTarget: 'crit_dmg' },
    { id: 'main_atk_percent', label: '攻击', value: 33, panelTarget: 'atk_percent' },
    { id: 'main_hp_percent', label: '生命', value: 33, panelTarget: 'hp_percent' },
    { id: 'main_def_percent', label: '防御', value: 41.8, panelTarget: 'def_percent' },
    { id: 'main_healing_bonus', label: '治疗效果加成', value: 26.4, panelTarget: 'display_only' },
  ],
  3: [
    { id: 'main_element_dmg', label: '属性伤害加成', value: 30, panelTarget: 'element_dmg', needsElement: true },
    { id: 'main_energy_regen', label: '共鸣效率', value: 32, panelTarget: 'energy_regen_pct' },
    { id: 'main_atk_percent', label: '攻击', value: 30, panelTarget: 'atk_percent' },
    { id: 'main_hp_percent', label: '生命', value: 30, panelTarget: 'hp_percent' },
    { id: 'main_def_percent', label: '防御', value: 38, panelTarget: 'def_percent' },
  ],
  1: [
    { id: 'main_atk_percent', label: '攻击', value: 18, panelTarget: 'atk_percent' },
    { id: 'main_hp_percent', label: '生命', value: 22.8, panelTarget: 'hp_percent' },
    { id: 'main_def_percent', label: '防御', value: 18, panelTarget: 'def_percent' },
  ],
};

const ECHO_MAIN2_FIXED = {
  4: { label: '攻击', value: 150, panelTarget: 'flat_atk' },
  3: { label: '攻击', value: 100, panelTarget: 'flat_atk' },
  1: { label: '生命', value: 2280, panelTarget: 'flat_hp' },
};

const ECHO_SUB_TYPE_DAMAGE_TYPES = ['普攻', '重击', '共鸣技能', '共鸣解放'];
const ECHO_SUB_TYPE_DMG_LEGACY = {
  sub_basic_dmg: '普攻',
  sub_heavy_dmg: '重击',
  sub_skill_dmg: '共鸣技能',
  sub_liberation_dmg: '共鸣解放',
};
/** 副词条档位（高→低），来自既有词条表 */
const ECHO_SUB_ROLLS_ATK_HP_TYPE = [11.6, 10.9, 10.1, 9.4, 8.6, 7.9, 7.1, 6.4, 6.0];
const ECHO_SUB_AFFIXES = {
  sub_crit_rate: {
    label: '暴击率',
    unit: 'percent',
    panelTarget: 'crit_rate',
    rolls: [10.5, 9.9, 9.3, 8.7, 8.1, 7.5, 6.9, 6.3],
  },
  sub_crit_dmg: {
    label: '暴击伤害',
    unit: 'percent',
    panelTarget: 'crit_dmg',
    rolls: [21, 19.8, 18.6, 17.4, 16.2, 15, 13.8, 12.6],
  },
  sub_atk_percent: {
    label: '攻击百分比',
    unit: 'percent',
    panelTarget: 'atk_percent',
    rolls: ECHO_SUB_ROLLS_ATK_HP_TYPE,
  },
  sub_flat_atk: {
    label: '固定攻击',
    unit: 'flat',
    panelTarget: 'flat_atk',
    rolls: [60, 50, 40, 30],
  },
  sub_hp_percent: {
    label: '生命百分比',
    unit: 'percent',
    panelTarget: 'hp_percent',
    rolls: ECHO_SUB_ROLLS_ATK_HP_TYPE,
  },
  sub_flat_hp: {
    label: '固定生命',
    unit: 'flat',
    panelTarget: 'flat_hp',
    rolls: [580, 540, 510, 470, 430, 390, 360, 320],
  },
  sub_def_percent: {
    label: '防御百分比',
    unit: 'percent',
    panelTarget: 'def_percent',
    rolls: [14.7, 13.8, 12.8, 11.8, 10.9, 10, 9, 8.1],
  },
  sub_flat_def: {
    label: '固定防御',
    unit: 'flat',
    panelTarget: 'flat_def',
    rolls: [70, 60, 50, 40],
  },
  sub_type_dmg: {
    label: '类型增伤',
    unit: 'percent',
    panelTarget: 'type_dmg',
    needsDamageType: true,
    rolls: ECHO_SUB_ROLLS_ATK_HP_TYPE,
  },
  sub_energy_regen: {
    label: '共鸣效率',
    unit: 'percent',
    panelTarget: 'energy_regen_pct',
    rolls: [12.4, 11.6, 10.8, 10, 9.2, 8.4, 7.6, 6.8],
  },
};

function echoSubRollEquals(a, b) {
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

function getEchoSubRolls(affixId) {
  const rolls = ECHO_SUB_AFFIXES[affixId]?.rolls;
  return Array.isArray(rolls) ? rolls : [];
}

function isEchoSubOfficialRoll(affixId, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return false;
  return getEchoSubRolls(affixId).some((r) => echoSubRollEquals(r, v));
}

function snapEchoSubValueToRolls(affixId, value) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (isEchoSubOfficialRoll(affixId, v)) return v;
  return 0;
}

function formatEchoSubRollOption(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (unit === 'flat') return String(n);
  return `${n}%`;
}

/** 声骸副词条预设模板（仅写入副词条，主词条/套装不变；应用后仍可改数值） */
const ECHO_SUB_TEMPLATES = {
  '14': {
    label: '【14输出词条模板】',
    buttonLabel: '14输出词条',
    /** 5 暴击 + 5 暴伤 + 2 攻击% + 2 类型增伤 + 2×10% 共鸣效率（类型先留空） */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_atk_percent', value: 8.6 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_atk_percent', value: 8.6 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 10 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 10 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
    ],
  },
  'balanced': {
    label: '【均衡词条】',
    buttonLabel: '均衡词条',
    /** 5 暴击(6.3%) + 5 暴伤(12.6%) + 5 攻击%(10.9%)：每槽 3 条，共 5 槽 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 6.3 },
        { id: 'sub_crit_dmg', value: 12.6 },
        { id: 'sub_atk_percent', value: 10.9 },
      ],
      [
        { id: 'sub_crit_rate', value: 6.3 },
        { id: 'sub_crit_dmg', value: 12.6 },
        { id: 'sub_atk_percent', value: 10.9 },
      ],
      [
        { id: 'sub_crit_rate', value: 6.3 },
        { id: 'sub_crit_dmg', value: 12.6 },
        { id: 'sub_atk_percent', value: 10.9 },
      ],
      [
        { id: 'sub_crit_rate', value: 6.3 },
        { id: 'sub_crit_dmg', value: 12.6 },
        { id: 'sub_atk_percent', value: 10.9 },
      ],
      [
        { id: 'sub_crit_rate', value: 6.3 },
        { id: 'sub_crit_dmg', value: 12.6 },
        { id: 'sub_atk_percent', value: 10.9 },
      ],
    ],
  },
};

/**
 * 角色专属「特制词条」：characterIds 命中当前角色时，在「14输出词条」旁显示按钮。
 */
const ECHO_SUB_SPECIAL_TEMPLATES = {
  special_cartethyia: {
    label: '【特制词条·卡提希娅】',
    buttonLabel: '特制词条',
    characterIds: [CARTETHYIA_CHAR_ID],
    layout: '44111',
    mainBySlotIndex: {
      0: 'main_crit_rate',
      1: 'main_crit_dmg',
    },
    mainByCost: { 1: 'main_hp_percent' },
    /** 5 暴击 + 5 暴伤 + 2 生命% + 2 普攻增伤 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 8.6 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '普攻' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 8.6 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '普攻' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
    ],
  },
  special_brant: {
    label: '【特制词条·布兰特】',
    buttonLabel: '特制词条',
    characterIds: [BRANT_CHAR_ID],
    layout: '43311',
    mainByCost: { 4: 'main_crit_rate', 3: 'main_energy_regen', 1: 'main_atk_percent' },
    /** 5 暴击 + 5 暴伤 + 3×9.2% 共鸣效率 + 3 普攻增伤；切 43311，两枚 3cost 主词条=共鸣效率 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '普攻' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '普攻' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '普攻' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
    ],
  },
  special_moning: {
    label: '【特制词条·莫宁】',
    buttonLabel: '特制词条',
    characterIds: [MONING_CHAR_ID],
    layout: '43311',
    mainBySlotIndex: {
      1: 'main_energy_regen',
      2: 'main_def_percent',
    },
    mainByCost: { 4: 'main_crit_dmg', 1: 'main_def_percent' },
    /** 2 暴击 + 3 暴伤 + 2 防御% + 2 共鸣解放增伤 + 5×9.2% 共鸣效率 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_def_percent', value: 10.9 },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_def_percent', value: 10.9 },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [{ id: 'sub_energy_regen', value: 9.2 }],
      [{ id: 'sub_energy_regen', value: 9.2 }],
    ],
  },
  special_shorekeeper: {
    label: '【特制词条·守岸人】',
    buttonLabel: '特制词条',
    characterIds: [SHOREKEEPER_CHAR_ID],
    layout: '43311',
    mainBySlotIndex: {
      1: 'main_element_dmg',
      2: 'main_energy_regen',
    },
    mainElementBySlotIndex: { 1: '衍射' },
    mainByCost: { 4: 'main_crit_dmg', 1: 'main_hp_percent' },
    /** 43311：4C=暴伤；3C 槽1=衍射、槽2=共鸣效率；1C=生命。副条 5×16.2%暴伤 + 5×8.6%共鸣解放 + 3×9.2%共鸣效率 + 1×8.6%生命 */
    slotSubs: [
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
        { id: 'sub_energy_regen', value: 9.2 },
        { id: 'sub_hp_percent', value: 8.6 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_type_dmg', value: 8.6, damageType: '共鸣解放' },
      ],
    ],
  },
  special_suisui: {
    label: '【特制词条·穗穗】',
    buttonLabel: '特制词条',
    characterIds: [SUISUI_CHAR_ID],
    layout: '43111',
    mainByCost: {
      4: 'main_crit_dmg',
      3: 'main_energy_regen',
      1: 'main_hp_percent',
    },
    /** 2 暴击 + 5 暴伤 + 2 生命% + 5×9.2% 共鸣效率；切 43111；4cost 主=暴伤，1cost 主=生命，3cost 主=共鸣效率 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 8.6 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 8.6 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
    ],
  },
  special_sigrika: {
    label: '【特制词条·西格莉卡】',
    buttonLabel: '特制词条',
    characterIds: [SIGRIKA_CHAR_ID],
    layout: '43311',
    /** 43311：第1个3cost=共鸣效率，第2个3cost=攻击比 */
    mainBySlotIndex: {
      1: 'main_energy_regen',
      2: 'main_atk_percent',
    },
    mainByCost: { 4: 'main_crit_dmg', 1: 'main_atk_percent' },
    /** 5 暴击 + 5 暴伤 + 2×40 固定攻 + 2 攻击% + 2×9.2% 共鸣效率 */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_flat_atk', value: 40 },
        { id: 'sub_atk_percent', value: 8.6 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_flat_atk', value: 40 },
        { id: 'sub_atk_percent', value: 8.6 },
        { id: 'sub_energy_regen', value: 9.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
    ],
  },
  special_jingran: {
    label: '【特制词条·景燃】',
    buttonLabel: '特制词条',
    characterIds: [JINGRAN_CHAR_ID],
    layout: '44111',
    /** 44111：两枚 4cost 主词条=暴伤，三枚 1cost 主词条=生命 */
    mainByCost: { 4: 'main_crit_dmg', 1: 'main_hp_percent' },
    /** 5×8.1% 暴击 + 5×16.2% 暴伤 + 2×9.4% 生命% + 2×7.9% 重击伤害 + 2×10% 共鸣效率（共 16 条） */
    slotSubs: [
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 9.4 },
        { id: 'sub_type_dmg', value: 7.9, damageType: '重击' },
        { id: 'sub_energy_regen', value: 10 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
        { id: 'sub_hp_percent', value: 9.4 },
        { id: 'sub_type_dmg', value: 7.9, damageType: '重击' },
        { id: 'sub_energy_regen', value: 10 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
      [
        { id: 'sub_crit_rate', value: 8.1 },
        { id: 'sub_crit_dmg', value: 16.2 },
      ],
    ],
  },
};

function isEchoSubTemplateForMember(tpl, member) {
  if (!tpl) return false;
  const ids = tpl.characterIds;
  if (!ids || !ids.length) return true;
  const cid = String(member?.characterId || '');
  return ids.some((id) => String(id) === cid);
}

function getEchoSubTemplatesForMember(member) {
  const out = {};
  Object.entries(ECHO_SUB_TEMPLATES).forEach(([id, tpl]) => {
    if (isEchoSubTemplateForMember(tpl, member)) out[id] = tpl;
  });
  Object.entries(ECHO_SUB_SPECIAL_TEMPLATES).forEach(([id, tpl]) => {
    if (isEchoSubTemplateForMember(tpl, member)) out[id] = tpl;
  });
  return out;
}

function resolveEchoSubTemplate(templateId) {
  return (
    ECHO_SUB_TEMPLATES[templateId] ||
    ECHO_SUB_SPECIAL_TEMPLATES[templateId] ||
    null
  );
}

function defaultEchoMain1ForCost(cost) {
  if (cost === 3) return 'main_element_dmg';
  if (cost === 4) return 'main_crit_rate';
  return 'main_atk_percent';
}

function createEchoSlot(cost) {
  return {
    cost,
    name: '',
    activeSetId: null,
    echoId: null,
    main1: defaultEchoMain1ForCost(cost),
    main1Element: ECHO_ELEMENTS[5] || '湮灭',
    subs: [],
  };
}

function getDefaultMainSlotIndex(config) {
  const slots = config?.slots || [];
  const idx = slots.findIndex((s) => Number(s.cost) === 4);
  return idx >= 0 ? idx : 0;
}

const ECHO_SET_LOADOUT_MAX = 3;

function defaultEchoSetLoadout() {
  return Array.from({ length: ECHO_SET_LOADOUT_MAX }, () => ({
    setId: null,
    count: 0,
    echoId: null,
  }));
}

function padEchoSetLoadout(entries) {
  const next = (entries || []).map(normalizeEchoSetLoadoutEntry).slice(0, ECHO_SET_LOADOUT_MAX);
  while (next.length < ECHO_SET_LOADOUT_MAX) next.push({ setId: null, count: 0, echoId: null });
  return next;
}

function normalizeEchoSetLoadoutEntry(raw) {
  return {
    setId: raw?.setId ? String(raw.setId) : null,
    count: Math.max(0, Math.min(5, Number(raw?.count) || 0)),
    echoId: raw?.echoId ? String(raw.echoId) : null,
  };
}

function deriveSetLoadoutFromSlots(cfg) {
  const slots = cfg?.slots || [];
  const mainIdx = Number.isInteger(cfg?.mainSlotIndex) ? cfg.mainSlotIndex : 0;
  const counts = {};
  const order = [];
  slots.forEach((slot) => {
    const setId = slot?.activeSetId ? String(slot.activeSetId) : null;
    if (!setId) return;
    counts[setId] = (counts[setId] || 0) + 1;
    if (!order.includes(setId)) order.push(setId);
  });
  const entries = order.slice(0, ECHO_SET_LOADOUT_MAX).map((setId) => {
    const mainSlot = slots[mainIdx];
    let echoId = null;
    if (mainSlot?.activeSetId === setId && mainSlot?.echoId) echoId = String(mainSlot.echoId);
    else {
      const withEcho = slots.find((s) => s.activeSetId === setId && s.echoId);
      if (withEcho) echoId = String(withEcho.echoId);
    }
    return { setId, count: counts[setId], echoId };
  });
  return padEchoSetLoadout(entries);
}

function clampEchoSetLoadoutCounts(loadout) {
  const entries = padEchoSetLoadout(loadout);
  let total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= 5) return entries;
  for (let i = entries.length - 1; i >= 0 && total > 5; i -= 1) {
    const overflow = total - 5;
    const cut = Math.min(entries[i].count, overflow);
    entries[i].count -= cut;
    total -= cut;
  }
  return entries;
}

function resolveMainEchoPrimarySetId(echoId, preferredSetIds) {
  if (!echoId) return null;
  const preferred = (preferredSetIds || []).map(String).filter(Boolean);
  for (const sid of preferred) {
    if (isMainEchoValidForSet(echoId, sid)) return sid;
  }
  const sp = findEchoSpecimen(echoId);
  if (!sp) return null;
  const candidates = [];
  if (Array.isArray(sp.mainSetIds)) candidates.push(...sp.mainSetIds.map(String));
  if (Array.isArray(sp.setIds)) candidates.push(...sp.setIds.map(String));
  for (const sid of candidates) {
    if (isMainEchoValidForSet(echoId, sid)) return sid;
  }
  return null;
}

function getMainEchoFromLoadout(cfg) {
  const entries = cfg?.setLoadout || [];
  const preferred = entries.map((e) => e?.setId).filter(Boolean);
  for (const entry of entries) {
    if (!entry?.echoId) continue;
    const echoId = String(entry.echoId);
    const setId =
      entry.setId && isMainEchoValidForSet(echoId, entry.setId)
        ? String(entry.setId)
        : resolveMainEchoPrimarySetId(echoId, preferred);
    if (setId) return { echoId, setId };
  }
  return null;
}

function syncSetLoadoutToSlots(cfg) {
  const entries = padEchoSetLoadout(cfg?.setLoadout || defaultEchoSetLoadout());
  cfg.setLoadout = entries;
  const slots = cfg?.slots || [];
  const mainIdx = Number.isInteger(cfg?.mainSlotIndex) ? cfg.mainSlotIndex : getDefaultMainSlotIndex(cfg);
  // 保留槽位自带的声骸/套装信息（导入/OCR 每个槽位都有真实数据）；
  // 仅当按 loadout 派分到同一套装时才还原，避免用户改套装后出现“图标与套装不符”。
  const keptSlotEcho = slots.map((slot) =>
    slot?.activeSetId && slot?.echoId
      ? { setId: String(slot.activeSetId), echoId: String(slot.echoId) }
      : null
  );
  slots.forEach((slot) => {
    slot.activeSetId = null;
    slot.echoId = null;
  });
  const remaining = entries.map((e) => ({
    setId: e.setId ? String(e.setId) : null,
    count: Math.max(0, Number(e.count) || 0),
  }));
  const main = getMainEchoFromLoadout(cfg);
  if (main && slots[mainIdx]) {
    const rem = remaining.find((r) => r.setId === main.setId && r.count > 0);
    if (rem) {
      slots[mainIdx].activeSetId = main.setId;
      slots[mainIdx].echoId = main.echoId;
      rem.count -= 1;
    }
  }
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i].activeSetId) continue;
    const next = remaining.find((r) => r.setId && r.count > 0);
    if (!next) break;
    slots[i].activeSetId = next.setId;
    if (keptSlotEcho[i] && keptSlotEcho[i].setId === next.setId) {
      slots[i].echoId = keptSlotEcho[i].echoId;
    }
    next.count -= 1;
  }
}

function defaultEchoConfig(layoutId) {
  const layout = ECHO_LAYOUTS[layoutId] || ECHO_LAYOUTS['43311'];
  const slots = layout.costs.map((cost) => createEchoSlot(cost));
  return {
    layout: layout.label,
    mainSlotIndex: getDefaultMainSlotIndex({ slots }),
    setLoadout: defaultEchoSetLoadout(),
    slots,
  };
}

function normalizeEchoSub(sub) {
  if (!sub) return null;
  let id = String(sub.id || '');
  let damageType = String(sub.damageType || '');
  if (ECHO_SUB_TYPE_DMG_LEGACY[id]) {
    damageType = ECHO_SUB_TYPE_DMG_LEGACY[id];
    id = 'sub_type_dmg';
  }
  const def = ECHO_SUB_AFFIXES[id];
  if (!def) return null;
  if (def.needsDamageType) {
    if (damageType && !ECHO_SUB_TYPE_DAMAGE_TYPES.includes(damageType)) damageType = '';
  } else {
    damageType = '';
  }
  return {
    id,
    value: Number(sub.value) || 0,
    damageType,
  };
}

function normalizeEchoSlot(slot) {
  const cost = [1, 3, 4].includes(Number(slot?.cost)) ? Number(slot.cost) : 3;
  const options = ECHO_MAIN1_OPTIONS[cost] || [];
  // 主词条：显式清空(main1==='')保持为空(无主词条)，未设置(null/undefined)或未知id才用默认。
  // 否则"清空主词条"的无声骸基线会被塞进默认主词条(如cost-4默认暴击率22%)，导致词条模拟里"副词条收益>总词条收益"。
  let main1 = slot?.main1;
  if (main1 == null) main1 = defaultEchoMain1ForCost(cost);
  else if (main1 !== '') {
    if (!options.some((o) => o.id === main1)) main1 = defaultEchoMain1ForCost(cost);
  }
  const subs = (slot?.subs || []).map(normalizeEchoSub).filter(Boolean).slice(0, 5);
  // 属性主词条元素：配置统一存中文名（冷凝/热熔…）；兼容旧格式数字键（1=冷凝…6=湮灭）
  const rawEl = slot?.main1Element;
  let elLabel = '';
  if (ECHO_ELEMENTS.includes(rawEl)) elLabel = rawEl;
  else if (rawEl != null && ELEMENT_TYPES[String(rawEl)] && ECHO_ELEMENTS.includes(ELEMENT_TYPES[String(rawEl)].label)) {
    elLabel = ELEMENT_TYPES[String(rawEl)].label;
  }
  return {
    cost,
    name: String(slot?.name || ''),
    activeSetId: slot?.activeSetId ? String(slot.activeSetId) : null,
    echoId: slot?.echoId ? String(slot.echoId) : null,
    main1,
    main1Element: elLabel || ECHO_ELEMENTS[5],
    subs,
    // 空白槽位选定主词条后恢复固有属性，同时修复已保存的残留禁用标记。
    noMain2: !!slot?.noMain2 && main1 === '',
  };
}

function normalizeEchoConfig(raw) {
  const layoutKey = raw?.layout && ECHO_LAYOUTS[raw.layout] ? raw.layout : '43311';
  const layout = ECHO_LAYOUTS[layoutKey];
  const slots = (raw?.slots || []).map(normalizeEchoSlot);
  const normalized = {
    layout: layout.label,
    mainSlotIndex: Number.isInteger(raw?.mainSlotIndex) ? raw.mainSlotIndex : 0,
    slots: layout.costs.map((cost, i) => {
      const existing = slots.find((s, idx) => idx === i && s.cost === cost) || slots[i];
      return normalizeEchoSlot(existing ? { ...existing, cost } : createEchoSlot(cost));
    }),
    setLoadout: defaultEchoSetLoadout(),
  };
  if (!Number.isInteger(normalized.mainSlotIndex) || normalized.mainSlotIndex < 0 || normalized.mainSlotIndex >= normalized.slots.length) {
    normalized.mainSlotIndex = getDefaultMainSlotIndex(normalized);
  }
  if (Array.isArray(raw?.setLoadout) && raw.setLoadout.length) {
    normalized.setLoadout = clampEchoSetLoadoutCounts(raw.setLoadout.slice(0, ECHO_SET_LOADOUT_MAX));
  } else {
    normalized.setLoadout = clampEchoSetLoadoutCounts(deriveSetLoadoutFromSlots(normalized));
  }
  syncSetLoadoutToSlots(normalized);
  return normalized;
}

function ensureEchoConfig(member) {
  if (!member.echoConfig) member.echoConfig = defaultEchoConfig('43311');
  else member.echoConfig = normalizeEchoConfig(member.echoConfig);
  return member.echoConfig;
}

function getEchoCostTotal(config) {
  return (config?.slots || []).reduce((s, slot) => s + (Number(slot.cost) || 0), 0);
}

function getEchoMain1Option(cost, main1Id) {
  const options = ECHO_MAIN1_OPTIONS[cost] || [];
  // 无主词条(未设置/清空) → 返回 null：避免回退到"该cost第一个默认主词条"，否则"清空主词条"的无声骸基数会被塞默认主词条而虚高，
  // 导致词条模拟里"副词条收益 > 总词条收益"（逻辑不可能）。非空但未知 id 仍回退 options[0] 以兼容旧数据。
  if (!main1Id) return null;
  return options.find((o) => o.id === main1Id) || options[0] || null;
}

function resolveEchoMain1Display(slot) {
  const opt = getEchoMain1Option(slot.cost, slot.main1);
  if (!opt) return { label: '—', value: 0, panelTarget: 'display_only' };
  if (opt.needsElement) {
    const el = slot.main1Element || ECHO_ELEMENTS[0];
    return { ...opt, label: `${el}伤害加成`, element: el };
  }
  return { ...opt };
}

function accumulateEchoStat(agg, panelTarget, value, extra) {
  const v = Number(value) || 0;
  if (!v) return;
  if (panelTarget === 'atk_percent') agg.atkPercent += v;
  else if (panelTarget === 'flat_atk') agg.flatAtk += v;
  else if (panelTarget === 'hp_percent') agg.hpPercent += v;
  else if (panelTarget === 'flat_hp') agg.flatHp += v;
  else if (panelTarget === 'def_percent') agg.defPercent += v;
  else if (panelTarget === 'flat_def') agg.flatDef += v;
  else if (panelTarget === 'crit_rate') agg.critRate += v;
  else if (panelTarget === 'crit_dmg') agg.critDmg += v;
  else if (panelTarget === 'energy_regen_pct') agg.energyRegenPct += v;
  else if (panelTarget === 'element_dmg') {
    const el = extra?.element;
    if (!el) return;
    if (!agg.elementDmgByElement) agg.elementDmgByElement = {};
    agg.elementDmgByElement[el] = (agg.elementDmgByElement[el] || 0) + v;
  } else if (panelTarget === 'type_dmg') {
    const dt = extra?.damageType;
    if (!dt) return;
    if (!agg.typeDmgByType) agg.typeDmgByType = {};
    agg.typeDmgByType[dt] = (agg.typeDmgByType[dt] || 0) + v;
  } else if (panelTarget === 'display_only') {
    const key = extra?.label || 'other';
    agg.displayOnly[key] = (agg.displayOnly[key] || 0) + v;
  }
}

function aggregateEchoStats(member) {
  const agg = {
    atkPercent: 0,
    flatAtk: 0,
    hpPercent: 0,
    flatHp: 0,
    defPercent: 0,
    flatDef: 0,
    critRate: 0,
    critDmg: 0,
    energyRegenPct: 0,
    elementDmgByElement: {},
    typeDmgByType: {},
    displayOnly: {},
  };
  const config = ensureEchoConfig(member);
  config.slots.forEach((slot) => {
    const main1 = resolveEchoMain1Display(slot);
    accumulateEchoStat(agg, main1.panelTarget, main1.value, {
      element: main1.element,
      label: main1.label,
    });
    const main2 = ECHO_MAIN2_FIXED[slot.cost];
    if (!slot.noMain2 && main2) accumulateEchoStat(agg, main2.panelTarget, main2.value, { label: main2.label });
    slot.subs.forEach((sub) => {
      const def = ECHO_SUB_AFFIXES[sub.id];
      if (!def) return;
      accumulateEchoStat(agg, def.panelTarget, sub.value, {
        damageType: def.needsDamageType ? sub.damageType : def.damageType,
        label: def.label,
      });
    });
  });
  return agg;
}

function getMemberElementLabel(member) {
  const charDef = findCharSkillDef(member?.characterId);
  if (!charDef?.element) return '';
  return ELEMENT_TYPES[charDef.element]?.label || '';
}

function getEchoAttrBonusPct(member, elementLabel) {
  if (!elementLabel) return 0;
  const agg = aggregateEchoStats(member);
  return Number(agg.elementDmgByElement[elementLabel]) || 0;
}

function inferEchoSkillElement(specimen, effect) {
  if (effect?.element) return effect.element;
  const skillFx = specimen?.mainEffects?.find((fx) => fx.kind === 'skillMult');
  if (skillFx?.element) return skillFx.element;
  const resolved = String(specimen?.skillResolved || specimen?.skillDesc || '');
  // 只解析首句：变体/装配条件（“在首位装配/若装配角色/变奏/延奏”等）里的其它元素词不能污染基础形态
  const head = String(resolved).split(/在首位装配|若装配角色|使用变奏|使用延奏/)[0] || resolved;
  for (const el of ECHO_ELEMENTS) {
    if (head.includes(`${el}伤害`)) return el;
  }
  return '';
}

/** 技能实际造成的属性伤害（可与角色属性不同，如声骸技能） */
function getUnitDamageElement(unit, parentSkill, member) {
  if (unit?.damageElement) return unit.damageElement;
  if (parentSkill?.damageElement) return parentSkill.damageElement;
  const catalogId = unit?.catalogId || parentSkill?.catalogId;
  if (catalogId && member) {
    const cat = findCatalogItemInMember(member, catalogId);
    if (cat?.damageElement) return cat.damageElement;
  }
  const damageType = getUnitDamageType(unit, parentSkill);
  if (damageType === '声骸' && member) {
    // 角色技能（技能库内，含模态切换或天然声骸类型）的元素 = 角色自身属性
    // （可吃属性增伤 + 声骸增伤）；只有真正的声骸技能（声骸本体/套装，
    // 不在角色技能库）才取所装声骸的元素。
    const libName =
      (typeof getEntryLibrarySkillName === 'function' && getEntryLibrarySkillName(unit)) ||
      (typeof getEntryLibrarySkillName === 'function' && getEntryLibrarySkillName(parentSkill)) ||
      '';
    let isCharSkill = false;
    if (libName && typeof findCharSkillDef === 'function') {
      const charDef = findCharSkillDef(member.characterId);
      isCharSkill = !!(
        charDef &&
        (charDef.skills || []).some(
          (s) => String(s.name || '').trim() === libName
        )
      );
    }
    if (!isCharSkill) {
    const echoPal = (member.skillPalette || []).find((p) => p.id === ECHO_SKILL_PALETTE_ID);
    if (echoPal?.damageElement) return echoPal.damageElement;
    const cfg = ensureEchoConfig(member);
    const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
    const mainSlot = cfg.slots?.[mainIdx];
    if (mainSlot?.echoId) {
      const specimen = findEchoSpecimen(mainSlot.echoId);
      const skillFx = specimen?.mainEffects?.find((fx) => fx.kind === 'skillMult');
      return inferEchoSkillElement(specimen, skillFx);
    }
    }
  }
  return member ? getMemberElementLabel(member) : '';
}

function getEchoTypeDmgBonusPct(member, damageType) {
  if (!damageType) return 0;
  const agg = aggregateEchoStats(member);
  return Number(agg.typeDmgByType[damageType]) || 0;
}

function getCharFlatHpTotal(char) {
  return getCharStatTotal(char, 'flatHp');
}

function getCharFlatDefTotal(char) {
  return getCharStatTotal(char, 'flatDef');
}

function getMemberActiveHpPctBuff(member) {
  if (!member?.buffs) return 0;
  return sumActiveBuffs(
    member.globalBuffActive || {},
    'generalHpPct',
    '',
    member.buffs,
    member.globalBuffStacks || {},
    { ignoreType: true, member }
  );
}

function getFinalHp(char, member) {
  const pct = getCharStatTotal(char, 'hpPercent') / 100;
  const buffPct = getMemberActiveHpPctBuff(member) / 100;
  return (Number(char.charHp) || 0) * (1 + pct + buffPct) + getCharFlatHpTotal(char);
}

/** 面板攻击力（公式完整小数；展示取整不等于结算用值） */
function getFinalAtk(char, member) {
  const pct = getCharStatTotal(char, 'atkPercent') / 100;
  return (
    ((Number(char.charAtk) || 0) + (Number(char.weaponAtk) || 0)) * (1 + pct) +
    getCharFlatAtkTotal(char, member)
  );
}

function getFinalDef(char) {
  const pct = getCharStatTotal(char, 'defPercent') / 100;
  return (Number(char.charDef) || 0) * (1 + pct) + getCharFlatDefTotal(char);
}

function getCharFlatAtkTotal(char, member, opts) {
  const isBrant = member && String(member.characterId) === BRANT_CHAR_ID;
  if (char && Array.isArray(char.flatAtkSources)) {
    if (isBrant) {
      const base = char.flatAtkSources
        .filter((s) => String(s?.id || '') !== BRANT_FLAT_ATK_SOURCE_ID)
        .reduce((sum, s) => sum + (Number(s.value) || 0), 0);
      const mode =
        opts?.brantLifeMode ||
        normalizeBrantLifeMode(member.brantLifeMode) ||
        BRANT_LIFE_PLAY;
      return base + computeBrantErFlatAtk(member, mode);
    }
    return getCharStatTotal(char, 'flatAtk');
  }
  const echoFlat = member ? aggregateEchoStats(member).flatAtk : Number(char?.flatAtk) || 0;
  if (isBrant) {
    const mode =
      opts?.brantLifeMode ||
      normalizeBrantLifeMode(member.brantLifeMode) ||
      BRANT_LIFE_PLAY;
    return echoFlat + computeBrantErFlatAtk(member, mode);
  }
  return echoFlat;
}

function getBrantSpecialMechanicsForMember(member) {
  if (String(member?.characterId || '') !== BRANT_CHAR_ID) return null;
  const tpl = getCharacterBuffTemplate(BRANT_CHAR_ID);
  return normalizeBrantSpecialMechanics(tpl?.specialMechanics);
}

function normalizeBrantLifeMode(raw) {
  return raw === BRANT_LIFE_MY ? BRANT_LIFE_MY : BRANT_LIFE_PLAY;
}

/** 技能显式形态优先；空/null 继承角色默认 */
function resolveBrantLifeMode(unit, parentSkill, member) {
  if (!member || String(member.characterId) !== BRANT_CHAR_ID) return null;
  const skill = parentSkill || unit;
  const explicit = skill?.brantLifeMode;
  if (explicit === BRANT_LIFE_PLAY || explicit === BRANT_LIFE_MY) return explicit;
  return normalizeBrantLifeMode(member.brantLifeMode);
}

function getBrantLifeVariant(mech, variantId) {
  const m = normalizeBrantSpecialMechanics(mech);
  const id = normalizeBrantLifeMode(variantId || m.defaultVariant);
  return m.variants[id] || m.variants[BRANT_LIFE_PLAY];
}

function getBrantLifeModeLabel(variantId, mech) {
  const v = getBrantLifeVariant(mech || defaultBrantSpecialMechanics(), variantId);
  return v?.label || (variantId === BRANT_LIFE_MY ? '我的人生' : '戏中人生');
}

/**
 * 超额% = max(0, 共鸣效率 − 阈值)；固定攻 = min(上限, 超额 × 每1%攻击)
 */
function computeBrantErFlatAtk(member, variantId) {
  const mech = getSpecialMechanicsForMember(member);
  if (!mech) return 0;
  const variant = getBrantLifeVariant(mech, variantId);
  const er = getMemberEnergyRegenPct(member);
  const excess = Math.max(0, er - mech.thresholdPct);
  const raw = excess * (Number(variant.atkPerPct) || 0);
  const cap = Number(variant.cap) || 0;
  return Math.min(cap, raw);
}

function describeBrantErFlatAtk(member, variantId) {
  const mech = getSpecialMechanicsForMember(member) || defaultBrantSpecialMechanics();
  const variant = getBrantLifeVariant(mech, variantId);
  const er = getMemberEnergyRegenPct(member);
  const excess = Math.max(0, er - mech.thresholdPct);
  const flat = computeBrantErFlatAtk(member, variantId);
  const capped = flat >= (Number(variant.cap) || 0) && (Number(variant.cap) || 0) > 0;
  return { mech, variant, er, excess, flat, capped };
}

/** 面板预览：写入默认形态固定攻（伤害计算时会按技能形态覆盖） */
function syncBrantErFlatAtkPanelPreview(member) {
  if (!member?.char) return;
  if (String(member.characterId) !== BRANT_CHAR_ID) {
    const key = charStatSourcesKey('flatAtk');
    if (Array.isArray(member.char[key])) {
      member.char[key] = member.char[key].filter(
        (s) => String(s?.id || '') !== BRANT_FLAT_ATK_SOURCE_ID
      );
    }
    return;
  }
  const mode = normalizeBrantLifeMode(member.brantLifeMode);
  const info = describeBrantErFlatAtk(member, mode);
  const label = `${info.variant.label}（默认）`;
  upsertCharKitPanelSource(
    member.char,
    'flatAtk',
    BRANT_FLAT_ATK_SOURCE_ID,
    label,
    info.flat
  );
}

/** 景燃 3链：施放万鬼同葬后【阳变阴合】无前置替换为【阴阳相生】（面板攻击来源参数直接切换，不做局内切换） */
function isJingranYinyangXiangsheng(member) {
  return normalizeResonanceUnlocked(member?.resonanceUnlocked) >= 3;
}

function getJingranHpFlatAtkParams(member) {
  if (isJingranYinyangXiangsheng(member)) {
    return {
      name: '阴阳相生',
      perChunk: JINGRAN_YINYANG_XIANGSHENG_PER_CHUNK,
      cap: JINGRAN_YINYANG_XIANGSHENG_CAP,
    };
  }
  return {
    name: '阳变阴合',
    perChunk: JINGRAN_HP_FLAT_ATK_PER_CHUNK,
    cap: JINGRAN_HP_FLAT_ATK_CAP,
  };
}

/** 景燃【阳变阴合/阴阳相生】：floor(最终生命/1000)×每段，上限 */
function computeJingranHpFlatAtk(member) {
  if (!member || String(member.characterId) !== JINGRAN_CHAR_ID) return 0;
  const hp = Math.max(0, getFinalHp(member.char || {}, member));
  const p = getJingranHpFlatAtkParams(member);
  const chunks = Math.floor(hp / JINGRAN_HP_FLAT_ATK_HP_CHUNK);
  return Math.min(p.cap, chunks * p.perChunk);
}

function describeJingranHpFlatAtk(member) {
  const hp = Math.max(0, getFinalHp(member?.char || {}, member));
  const p = getJingranHpFlatAtkParams(member);
  const chunks = Math.floor(hp / JINGRAN_HP_FLAT_ATK_HP_CHUNK);
  const flat = computeJingranHpFlatAtk(member);
  const capped = flat >= p.cap && p.cap > 0;
  return { hp, chunks, flat, capped, name: p.name, perChunk: p.perChunk, cap: p.cap };
}

/** 按当前生命与链数同步写入固定攻击来源【阳变阴合/阴阳相生】 */
function syncJingranHpFlatAtkPanel(member) {
  if (!member?.char) return;
  if (String(member.characterId) !== JINGRAN_CHAR_ID) {
    const key = charStatSourcesKey('flatAtk');
    if (Array.isArray(member.char[key])) {
      member.char[key] = member.char[key].filter(
        (s) => String(s?.id || '') !== JINGRAN_HP_FLAT_ATK_SOURCE_ID
      );
    }
    return;
  }
  const info = describeJingranHpFlatAtk(member);
  upsertCharKitPanelSource(
    member.char,
    'flatAtk',
    JINGRAN_HP_FLAT_ATK_SOURCE_ID,
    info.name,
    info.flat
  );
  member._jingranHpFlatAtkName = info.name;
  member._jingranHpFlatAtkHint = `最终生命 ${Math.round(info.hp)} → ${info.chunks}×${info.perChunk}=${info.flat}${
    info.capped ? '（已达上限）' : ''
  }（每${JINGRAN_HP_FLAT_ATK_HP_CHUNK}生命+${info.perChunk}，上限${info.cap}）`;
}

/** 景燃【命火】计入生命段数：floor(min(max(最终生命-25000,0),25000)/1000)，最多25 */
function getJingranMinghuoChunks(member) {
  if (!member || String(member.characterId) !== JINGRAN_CHAR_ID) return 0;
  const hp = Math.max(0, getFinalHp(member.char || {}, member));
  const counted = Math.min(JINGRAN_MINGHUO_HP_CAP, Math.max(hp - JINGRAN_MINGHUO_HP_THRESHOLD, 0));
  return Math.min(JINGRAN_MINGHUO_MAX_CHUNKS, Math.floor(counted / JINGRAN_HP_FLAT_ATK_HP_CHUNK));
}

function computeJingranMinghuoBonus(member) {
  const hp = Math.max(0, getFinalHp(member?.char || {}, member));
  const chunks = getJingranMinghuoChunks(member);
  return {
    hp,
    chunks,
    capped: chunks >= JINGRAN_MINGHUO_MAX_CHUNKS || hp >= JINGRAN_MINGHUO_HP_THRESHOLD + JINGRAN_MINGHUO_HP_CAP,
    jiepo: +(chunks * JINGRAN_MINGHUO_JIEPO_PER_CHUNK).toFixed(2),
    tagang: +(chunks * JINGRAN_MINGHUO_TAGANG_PER_CHUNK).toFixed(2),
  };
}

function isJingranMinghuoBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  if (key === JINGRAN_MINGHUO_KEY) return true;
  return String(b.name || '') === '命火';
}

function createJingranMinghuoBuffEntry(bonus) {
  const b = bonus || computeJingranMinghuoBonus(null);
  return normalizeTemplateBuffEntry({
    templateKey: JINGRAN_MINGHUO_KEY,
    category: 'composite',
    name: '命火',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multAdd',
        valueMode: 'fixed',
        value: b.jiepo,
        skillScope: 'names',
        librarySkillNames: [...JINGRAN_JIEPO_SKILLS],
        skillNames: [...JINGRAN_JIEPO_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: JINGRAN_MINGHUO_JIEPO_EFFECT_KEY,
      },
      {
        zone: 'multAdd',
        valueMode: 'fixed',
        value: b.tagang,
        skillScope: 'names',
        librarySkillNames: [...JINGRAN_TAGANG_SKILLS],
        skillNames: [...JINGRAN_TAGANG_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: JINGRAN_MINGHUO_TAGANG_EFFECT_KEY,
      },
    ],
  });
}

function upsertJingranMinghuoEffect(buff, effectKey, value, skills) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    zone: 'multAdd',
    valueMode: 'fixed',
    value,
    skillScope: 'names',
    librarySkillNames: [...skills],
    skillNames: [...skills],
    damageType: '',
    element: '',
    defenseKind: '',
    minStacks: 0,
    minResonance: 0,
    effectKey,
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 按当前生命面板同步【命火】对劫魄/踏罡的倍率增加 */
function syncJingranMinghuoMult(member) {
  if (!member) return;
  if (String(member.characterId) !== JINGRAN_CHAR_ID) {
    const drop = (member.buffs || []).filter(isJingranMinghuoBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    return;
  }
  const bonus = computeJingranMinghuoBonus(member);
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  let b = member.buffs.find(isJingranMinghuoBuff);
  if (!b) {
    b = normalizeBuff({
      id: genId(),
      ...createJingranMinghuoBuffEntry(bonus),
      sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    });
    member.buffs.unshift(b);
  } else {
    b.category = 'composite';
    b.mode = 'fixed';
    b.value = 0;
    b.perStack = 0;
    b.name = '命火';
    b.templateKey = JINGRAN_MINGHUO_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    upsertJingranMinghuoEffect(
      b,
      JINGRAN_MINGHUO_JIEPO_EFFECT_KEY,
      bonus.jiepo,
      JINGRAN_JIEPO_SKILLS
    );
    upsertJingranMinghuoEffect(
      b,
      JINGRAN_MINGHUO_TAGANG_EFFECT_KEY,
      bonus.tagang,
      JINGRAN_TAGANG_SKILLS
    );
  }
  member.globalBuffActive[b.id] = true;
  b._jingranMinghuoHint = `最终生命 ${Math.round(bonus.hp)}（计入≤${JINGRAN_MINGHUO_HP_CAP}）→ ${bonus.chunks}段${
    bonus.capped ? '（已达上限）' : ''
  }：劫魄倍率增加+${bonus.jiepo}%（每段+${JINGRAN_MINGHUO_JIEPO_PER_CHUNK}%）、踏罡倍率增加+${bonus.tagang}%（每段+${JINGRAN_MINGHUO_TAGANG_PER_CHUNK}%）`;
}

/** 景燃【祸兮福兮】单层热熔增伤：min(2.5, floor(最终生命/1000)×0.05) */
function computeJingranHuoxiFuxiPerStack(member) {
  const hp = Math.max(0, getFinalHp(member?.char || {}, member));
  const chunks = Math.floor(hp / JINGRAN_HP_FLAT_ATK_HP_CHUNK);
  const perStack = Math.min(
    JINGRAN_HUOXI_FUXI_PER_STACK_CAP,
    +(chunks * JINGRAN_HUOXI_FUXI_PER_CHUNK).toFixed(4)
  );
  return {
    hp,
    chunks,
    perStack,
    capped: perStack >= JINGRAN_HUOXI_FUXI_PER_STACK_CAP,
    maxTotal: +(JINGRAN_HUOXI_FUXI_MAX_STACKS * JINGRAN_HUOXI_FUXI_PER_STACK_CAP).toFixed(2),
  };
}

function isJingranHuoxiFuxiBuff(b) {
  if (!b) return false;
  if (String(b.templateKey || '') === JINGRAN_HUOXI_FUXI_KEY) return true;
  return String(b.name || '') === '祸兮福兮';
}

function createJingranHuoxiFuxiBuffEntry(bonus) {
  const info = bonus || computeJingranHuoxiFuxiPerStack(null);
  return normalizeTemplateBuffEntry({
    templateKey: JINGRAN_HUOXI_FUXI_KEY,
    category: 'elementBonus',
    name: '祸兮福兮',
    mode: 'stack',
    value: 0,
    perStack: info.perStack,
    maxStacks: JINGRAN_HUOXI_FUXI_MAX_STACKS,
    clampStacks: true,
    element: '热熔',
    damageType: '',
    defenseKind: '',
  });
}

/** 按当前生命同步【祸兮福兮】每层热熔增伤（层数由轴上叠层控制，上限50） */
function syncJingranHuoxiFuxiBonus(member) {
  if (!member) return;
  if (String(member.characterId) !== JINGRAN_CHAR_ID) {
    const drop = (member.buffs || []).filter(isJingranHuoxiFuxiBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    return;
  }
  const info = computeJingranHuoxiFuxiPerStack(member);
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  if (!member.globalBuffStacks) member.globalBuffStacks = {};
  let b = member.buffs.find(isJingranHuoxiFuxiBuff);
  if (!b) {
    b = normalizeBuff({
      id: genId(),
      ...createJingranHuoxiFuxiBuffEntry(info),
      sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    });
    member.buffs.unshift(b);
    if (member.globalBuffStacks[b.id] === undefined) member.globalBuffStacks[b.id] = 0;
  } else {
    b.category = 'elementBonus';
    b.mode = 'stack';
    b.value = 0;
    b.perStack = info.perStack;
    b.maxStacks = JINGRAN_HUOXI_FUXI_MAX_STACKS;
    b.clampStacks = true;
    b.element = '热熔';
    b.damageType = '';
    b.name = '祸兮福兮';
    b.templateKey = JINGRAN_HUOXI_FUXI_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    delete b.effects;
  }
  member.globalBuffActive[b.id] = true;
  if (member.globalBuffStacks[b.id] === undefined) member.globalBuffStacks[b.id] = 0;
  const stacksRaw = Math.max(0, Math.round(Number(member.globalBuffStacks[b.id]) || 0));
  const stacksEff = Math.min(JINGRAN_HUOXI_FUXI_MAX_STACKS, stacksRaw);
  const total = +(stacksEff * info.perStack).toFixed(2);
  b._jingranHuoxiFuxiHint = `最终生命 ${Math.round(info.hp)} → 每层热熔增伤 ${info.perStack}%${
    info.capped ? '（单层已达上限）' : ''
  }（每${JINGRAN_HP_FLAT_ATK_HP_CHUNK}生命+${JINGRAN_HUOXI_FUXI_PER_CHUNK}%，单层上限${JINGRAN_HUOXI_FUXI_PER_STACK_CAP}%）；当前 ${stacksRaw} 层（生效 ${stacksEff}）→ +${total}%（满层理论 ${info.maxTotal}%）`;
}

/** 景燃【幽而复明】：常驻 生命 → 热熔伤害加成（每1000生命+1.5%，上限75%） */
function computeJingranYoufuFumingBonus(member) {
  const hp = Math.max(0, getFinalHp(member?.char || {}, member));
  const chunks = Math.floor(hp / JINGRAN_HP_FLAT_ATK_HP_CHUNK);
  const value = Math.min(JINGRAN_YOUFU_FUMING_CAP, +(chunks * JINGRAN_YOUFU_FUMING_PER_CHUNK).toFixed(2));
  return { hp, chunks, value, capped: value >= JINGRAN_YOUFU_FUMING_CAP };
}

function isJingranYoufuFumingBuff(b) {
  if (!b) return false;
  if (String(b.templateKey || '') === JINGRAN_YOUFU_FUMING_KEY) return true;
  return String(b.name || '') === '幽而复明';
}

function createJingranYoufuFumingBuffEntry(bonus) {
  const info = bonus || computeJingranYoufuFumingBonus(null);
  return normalizeTemplateBuffEntry({
    templateKey: JINGRAN_YOUFU_FUMING_KEY,
    category: 'elementBonus',
    name: '幽而复明',
    mode: 'fixed',
    value: info.value,
    perStack: 0,
    maxStacks: 99,
    element: '热熔',
    damageType: '',
    defenseKind: '',
  });
}

/** 按当前生命同步【幽而复明】常驻热熔伤害加成 */
function syncJingranYoufuFumingBonus(member) {
  if (!member) return;
  if (String(member.characterId) !== JINGRAN_CHAR_ID) {
    const drop = (member.buffs || []).filter(isJingranYoufuFumingBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    return;
  }
  const info = computeJingranYoufuFumingBonus(member);
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  let b = member.buffs.find(isJingranYoufuFumingBuff);
  if (!b) {
    b = normalizeBuff({
      id: genId(),
      ...createJingranYoufuFumingBuffEntry(info),
      sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    });
    member.buffs.unshift(b);
  } else {
    b.category = 'elementBonus';
    b.mode = 'fixed';
    b.value = info.value;
    b.perStack = 0;
    b.maxStacks = 99;
    b.element = '热熔';
    b.damageType = '';
    b.name = '幽而复明';
    b.templateKey = JINGRAN_YOUFU_FUMING_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    delete b.effects;
  }
  member.globalBuffActive[b.id] = true;
  b._jingranYoufuFumingHint = `最终生命 ${Math.round(info.hp)} → ${info.chunks}×${JINGRAN_YOUFU_FUMING_PER_CHUNK}% = 热熔伤害加成 +${info.value}%${
    info.capped ? '（已达上限）' : ''
  }（每${JINGRAN_HP_FLAT_ATK_HP_CHUNK}生命+${JINGRAN_YOUFU_FUMING_PER_CHUNK}%，上限${JINGRAN_YOUFU_FUMING_CAP}%）`;
}

function upsertEchoCharSource(char, statKey, value) {
  const key = charStatSourcesKey(statKey);
  if (!char[key]) char[key] = [];
  const v = Number(value) || 0;
  // 先清掉全部合计行（含克隆后 id 丢失的孤儿），再按需写回唯一一行
  char[key] = char[key].filter((s) => !isEchoAggTotalSource(s));
  if (v <= 0) return;
  char[key].push({ id: ECHO_SOURCE_ID, name: ECHO_SOURCE_NAME, value: v });
}

function syncEchoAttrBonusSources(char, agg) {
  const key = charStatSourcesKey('attrBonus');
  if (!char[key]) char[key] = [];
  char[key] = char[key].filter((s) => !isEchoAttrPanelSource(s));
  Object.entries(agg.elementDmgByElement || {}).forEach(([el, v]) => {
    const val = Number(v) || 0;
    if (val <= 0) return;
    char[key].push({
      id: `${ECHO_ATTR_SOURCE_PREFIX}${el}`,
      name: `${el}属性伤害加成`,
      value: val,
    });
  });
}

function syncEchoTypeDmgBonusSources(char, agg) {
  const key = charStatSourcesKey('typeDmgBonus');
  if (!char[key]) char[key] = [];
  char[key] = char[key].filter((s) => !isEchoTypeDmgPanelSource(s));
  Object.entries(agg.typeDmgByType || {}).forEach(([dt, v]) => {
    const val = Number(v) || 0;
    if (val <= 0) return;
    char[key].push({
      id: `${ECHO_TYPE_DMG_SOURCE_PREFIX}${dt}`,
      name: `${dt}伤害加成`,
      value: val,
    });
  });
}

/** 清理克隆/复制后残留的托管面板孤儿行（id 已变、仅剩固定显示名）
 * @returns {{ weaponOrphan: boolean, needBranchResync: boolean }}
 */
function sanitizeOrphanManagedPanelSources(char, member) {
  const result = { weaponOrphan: false, needBranchResync: false };
  if (!char) return result;
  const kitOrphanNames = new Set(['分支', '1链', '莫宁', '莫宁·2链', '阳变阴合']);
  const branchKeepIds = new Set();
  const enforceBranchKeep = !!member;
  if (member && typeof resolveCharBranchPanelDef === 'function') {
    const def = resolveCharBranchPanelDef(member.characterId);
    if (def) {
      [
        def.atkSourceId,
        def.critRateSourceId,
        def.critDmgSourceId,
        def.hpSourceId,
        def.defSourceId,
        def.attrSourceId,
      ].forEach((id) => {
        if (id) branchKeepIds.add(String(id));
      });
    }
  }
  Object.keys(CHAR_STATS).forEach((statKey) => {
    const key = charStatSourcesKey(statKey);
    if (!Array.isArray(char[key])) return;
    // 声骸合计：一律先清空，由后续 upsert 写回唯一一行（避免同 id 重复或漏网孤儿）
    char[key] = char[key].filter((s) => !isEchoAggTotalSource(s));
    char[key] = char[key].filter((s) => {
      const name = String(s?.name || '').trim();
      const id = String(s?.id || '');
      if (
        (name.startsWith('[武器副词条]') || name.startsWith('[武器被动]')) &&
        !id.startsWith(WEAPON_CHAR_SOURCE_PREFIX)
      ) {
        result.weaponOrphan = true;
        return false;
      }
      if (name === '分支') {
        if (!id.startsWith(CHAR_KIT_PANEL_PREFIX)) {
          result.needBranchResync = true;
          return false;
        }
        // 有 member 上下文时：无分支定义清全部；有定义只留本角色 id
        if (enforceBranchKeep) {
          if (!branchKeepIds.size || !branchKeepIds.has(id)) {
            result.needBranchResync = true;
            return false;
          }
        }
        return true;
      }
      if (kitOrphanNames.has(name) && !id.startsWith(CHAR_KIT_PANEL_PREFIX)) return false;
      if (/（默认）$/.test(name) && !id.startsWith(CHAR_KIT_PANEL_PREFIX)) return false;
      return true;
    });
  });
  if (enforceBranchKeep && branchKeepIds.size) {
    const hasKeep = [...branchKeepIds].some((keepId) =>
      Object.keys(CHAR_STATS).some((statKey) =>
        (char[charStatSourcesKey(statKey)] || []).some((s) => String(s?.id || '') === keepId)
      )
    );
    if (!hasKeep) result.needBranchResync = true;
  }
  return result;
}

function syncEchoToCharacterPanel(member) {
  if (!member?.char) return;
  if (member._syncingEchoPanel) return;
  member._syncingEchoPanel = true;
  try {
    const cleaned = sanitizeOrphanManagedPanelSources(member.char, member);
    const agg = aggregateEchoStats(member);
    upsertEchoCharSource(member.char, 'atkPercent', agg.atkPercent);
    upsertEchoCharSource(member.char, 'critRate', agg.critRate);
    upsertEchoCharSource(member.char, 'critDmg', agg.critDmg);
    upsertEchoCharSource(member.char, 'energyRegenPct', agg.energyRegenPct);
    syncEchoAttrBonusSources(member.char, agg);
    syncEchoTypeDmgBonusSources(member.char, agg);
    upsertEchoCharSource(member.char, 'flatAtk', agg.flatAtk);
    upsertEchoCharSource(member.char, 'hpPercent', agg.hpPercent);
    upsertEchoCharSource(member.char, 'flatHp', agg.flatHp);
    upsertEchoCharSource(member.char, 'defPercent', agg.defPercent);
    upsertEchoCharSource(member.char, 'flatDef', agg.flatDef);
    member._echoFlatAtk = agg.flatAtk;
    member._echoSummary = agg;
    if (cleaned.needBranchResync && typeof syncCharBranchPanelSources === 'function') {
      syncCharBranchPanelSources(member);
      if (typeof syncMoningOffsetHarmonyEffToAllPanels === 'function') {
        syncMoningOffsetHarmonyEffToAllPanels();
      }
      if (typeof syncJingranHpFlatAtkPanel === 'function') syncJingranHpFlatAtkPanel(member);
      if (typeof syncBrantErFlatAtkPanelPreview === 'function') syncBrantErFlatAtkPanelPreview(member);
    }
    if (
      cleaned.weaponOrphan &&
      member.weaponSelection?.id &&
      typeof syncWeaponToMember === 'function'
    ) {
      syncWeaponToMember(member, { silent: true });
    }
  } finally {
    delete member._syncingEchoPanel;
  }
}

let echoSetsDb = null;
let echoSetsDbPromise = null;
let echoSpecimensDb = null;
let echoSpecimensDbPromise = null;
let echoSetMainMapDb = null;
let echoSetMainMapPromise = null;
let echoSetDefIndex = new Map();       // String(id) -> set def（仅 setEchoSetsDb 落定时重建）
let echoSpecimenIndex = new Map();     // String(id) -> specimen（仅 setEchoSpecimensDb 落定时重建）

function normalizeEchoSetMainMap(raw) {
  const sets = {};
  Object.entries(raw?.sets || {}).forEach(([setId, ids]) => {
    sets[String(setId)] = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  });
  return { version: Number(raw?.version) || 1, sets };
}

function isEchoSetMainMapReady(map) {
  const keys = Object.keys(map?.sets || {});
  return keys.length >= ECHO_SET_MAIN_MAP_MIN_SETS && !!(map.sets['27'] || []).includes('6000191');
}

function rebuildSpecimenMainSetIdsFromMap() {
  if (!echoSetMainMapDb?.sets || !echoSpecimensDb?.specimens?.length) return;
  const bySpecimen = {};
  Object.entries(echoSetMainMapDb.sets).forEach(([setId, ids]) => {
    (ids || []).forEach((specimenId) => {
      const key = String(specimenId);
      if (!bySpecimen[key]) bySpecimen[key] = new Set();
      bySpecimen[key].add(String(setId));
    });
  });
  echoSpecimensDb.specimens.forEach((sp) => {
    const mapped = bySpecimen[String(sp.id)];
    if (mapped?.size) sp.mainSetIds = [...mapped];
  });
}

function loadEchoSetMainMapFromCache() {
  try {
    const raw = localStorage.getItem(ECHO_SET_MAIN_MAP_CACHE_KEY);
    if (!raw) return null;
    const data = normalizeEchoSetMainMap(JSON.parse(raw));
    return isEchoSetMainMapReady(data) ? data : null;
  } catch {
    return null;
  }
}

function setEchoSetMainMapDb(data) {
  echoSetMainMapDb = normalizeEchoSetMainMap(data);
  rebuildSpecimenMainSetIdsFromMap();
  return echoSetMainMapDb;
}

function ensureEchoSetMainMapDb() {
  if (echoSetMainMapDb && isEchoSetMainMapReady(echoSetMainMapDb)) return Promise.resolve(echoSetMainMapDb);
  if (echoSetMainMapPromise) return echoSetMainMapPromise;
  const cached = loadEchoSetMainMapFromCache();
  if (cached) {
    echoSetMainMapDb = cached;
    rebuildSpecimenMainSetIdsFromMap();
    echoSetMainMapPromise = Promise.resolve(echoSetMainMapDb);
    return echoSetMainMapPromise;
  }
  if (location.protocol === 'file:') {
    echoSetMainMapDb = normalizeEchoSetMainMap({ version: 1, sets: {} });
    echoSetMainMapPromise = Promise.resolve(echoSetMainMapDb);
    return echoSetMainMapPromise;
  }
  echoSetMainMapPromise = fetch(ECHO_SET_MAIN_MAP_URL, { cache: 'force-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('echo-set-main-map load failed');
      return r.json();
    })
    .then((data) => setEchoSetMainMapDb(data))
    .catch(() => {
      echoSetMainMapDb = normalizeEchoSetMainMap({ version: 1, sets: {} });
      return echoSetMainMapDb;
    });
  return echoSetMainMapPromise;
}

/** 某套装可选主位 id：优先用手动映射；否则 specimen.mainSetIds；再否则独占单套 */
function getEchoSetMainEchoIds(setId) {
  const sid = String(setId || '');
  if (!sid) return new Set();
  const manual = echoSetMainMapDb?.sets?.[sid];
  if (manual && manual.length) return new Set(manual.map(String));
  const out = new Set();
  (echoSpecimensDb?.specimens || []).forEach((sp) => {
    const groups = (sp.setIds || []).map(String);
    const mains = (sp.mainSetIds || []).map(String);
    if (mains.includes(sid)) out.add(String(sp.id));
    else if (groups.length === 1 && groups[0] === sid) out.add(String(sp.id));
  });
  return out;
}

function loadEchoSetsDbFromCache() {
  try {
    const raw = localStorage.getItem(ECHO_SETS_DB_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.sets?.length ? data : null;
  } catch {
    return null;
  }
}

function loadEchoSpecimensDbFromCache() {
  try {
    const raw = localStorage.getItem(ECHO_SPECIMENS_DB_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.specimens?.length >= ECHO_SPECIMENS_MIN_COUNT ? data : null;
  } catch {
    return null;
  }
}

function setEchoSetsDb(data) {
  echoSetsDb = {
    version: data?.version || 1,
    sets: (data?.sets || []).map((set) => ({
      ...set,
      bonuses: Object.fromEntries(
        Object.entries(set.bonuses || {}).map(([tier, tierData]) => [
          tier,
          {
            ...tierData,
            effects: normalizeMainEffects(tierData?.effects),
          },
        ])
      ),
    })),
  };
  echoSetDefIndex = new Map();
  (echoSetsDb.sets || []).forEach((s) => {
    const id = String(s.id);
    if (!echoSetDefIndex.has(id)) echoSetDefIndex.set(id, s);
  });
  return echoSetsDb;
}

function normalizeMainEffects(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.kind ? [raw] : [];
  // 纠错：谐度破坏增幅点数 → harmonyBreakAmp（旧数据误标 convergence 会被全队过滤）
  // 例外：名称含「攻击」时是「按谐幅加攻击」（如逆光跃彩之约），勿改成谐幅乘区
  // 纠错：协同攻击伤害提升 → typeBonus + damageType 协同攻击（旧数据误标 generalBonus）
  return list.map((fx) => {
    if (!fx || typeof fx !== 'object') return fx;
    const text = `${fx.name || ''}${fx.label || ''}${fx.text || ''}`;
    if (
      /谐度破坏增幅/.test(text) &&
      (fx.kind === 'teamBuff' || fx.kind === 'buff') &&
      !echoEffectIsHarmonyDrivenAttack(text, fx.category)
    ) {
      if (fx.category !== 'harmonyBreakAmp') {
        return { ...fx, category: 'harmonyBreakAmp' };
      }
    }
    if (fx.kind === 'buff' && /协同攻击/.test(text) && /伤害/.test(text)) {
      if (fx.category !== 'typeBonus' || fx.damageType !== COORD_ATTACK_DAMAGE_TYPE) {
        return { ...fx, category: 'typeBonus', damageType: COORD_ATTACK_DAMAGE_TYPE };
      }
    }
    return fx;
  });
}

/** 套装文案：按谐幅叠层加攻击（非「获得谐幅」本身） */
function echoEffectIsHarmonyDrivenAttack(text, category) {
  const t = String(text || '');
  if (category === 'generalAttack' || category === 'typeAttack') return true;
  if (!/谐度破坏增幅/.test(t)) return false;
  return /攻击/.test(t) && /(?:提升|提高)/.test(t);
}

function setEchoSpecimensDb(data) {
  echoSpecimensDb = {
    version: data?.version || 1,
    specimens: (data?.specimens || []).map((sp) => ({
      ...sp,
      mainEffects: normalizeMainEffects(sp.mainEffects),
    })),
  };
  rebuildSpecimenMainSetIdsFromMap();
  echoSpecimenIndex = new Map();
  (echoSpecimensDb.specimens || []).forEach((s) => {
    const id = String(s.id);
    if (!echoSpecimenIndex.has(id)) echoSpecimenIndex.set(id, s);
  });
  return echoSpecimensDb;
}

function ensureEchoSetsDb() {
  if (echoSetsDb?.sets?.length) return Promise.resolve(echoSetsDb);
  if (echoSetsDbPromise) return echoSetsDbPromise;
  const cached = loadEchoSetsDbFromCache();
  if (cached) {
    setEchoSetsDb(cached);
    echoSetsDbPromise = Promise.resolve(echoSetsDb);
    return echoSetsDbPromise;
  }
  if (location.protocol === 'file:') {
    echoSetsDbPromise = Promise.reject(new Error('file'));
    return echoSetsDbPromise;
  }
  echoSetsDbPromise = fetch(ECHO_SETS_DB_URL, { cache: 'force-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('echo-sets load failed');
      return r.json();
    })
    .then((data) => setEchoSetsDb(data))
    .catch((err) => {
      echoSetsDbPromise = null;
      throw err;
    });
  return echoSetsDbPromise;
}

function ensureEchoSpecimensDb() {
  if (echoSpecimensDb?.specimens?.length >= ECHO_SPECIMENS_MIN_COUNT) return Promise.resolve(echoSpecimensDb);
  if (echoSpecimensDbPromise) return echoSpecimensDbPromise;
  const cached = loadEchoSpecimensDbFromCache();
  if (cached) {
    setEchoSpecimensDb(cached);
    echoSpecimensDbPromise = Promise.resolve(echoSpecimensDb);
    return echoSpecimensDbPromise;
  }
  if (location.protocol === 'file:') {
    echoSpecimensDbPromise = Promise.reject(new Error('file'));
    return echoSpecimensDbPromise;
  }
  echoSpecimensDbPromise = fetch(ECHO_SPECIMENS_DB_URL, { cache: 'force-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('echo-specimens load failed');
      return r.json();
    })
    .then((data) => setEchoSpecimensDb(data))
    .catch((err) => {
      echoSpecimensDbPromise = null;
      throw err;
    });
  return echoSpecimensDbPromise;
}

function findEchoSetDef(setId) {
  return echoSetDefIndex.get(String(setId)) || null;
}

function findEchoSpecimen(specimenId) {
  return echoSpecimenIndex.get(String(specimenId)) || null;
}

const ECHO_GAME_TEXT_LOCAL_KEY = 'mc-echo-game-text-v1';

function loadEchoGameTextLocal() {
  try {
    const raw = localStorage.getItem(ECHO_GAME_TEXT_LOCAL_KEY);
    if (!raw) return { sets: {}, specimens: {} };
    const data = JSON.parse(raw);
    return {
      sets: data?.sets && typeof data.sets === 'object' ? data.sets : {},
      specimens: data?.specimens && typeof data.specimens === 'object' ? data.specimens : {},
    };
  } catch {
    return { sets: {}, specimens: {} };
  }
}

function saveEchoGameTextLocal(map) {
  try {
    localStorage.setItem(
      ECHO_GAME_TEXT_LOCAL_KEY,
      JSON.stringify({
        sets: map?.sets && typeof map.sets === 'object' ? map.sets : {},
        specimens: map?.specimens && typeof map.specimens === 'object' ? map.specimens : {},
      })
    );
  } catch (err) {
    console.warn('saveEchoGameTextLocal failed', err);
  }
}

function getEchoSetDefaultGameText(setId) {
  const def = findEchoSetDef(setId);
  if (!def) return '';
  const lines = [];
  if (def.name) lines.push(String(def.name));
  const bonuses = def.bonuses || {};
  Object.keys(bonuses)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((tier) => {
      const block = bonuses[tier];
      const desc = String(block?.resolved || block?.desc || '').trim();
      if (desc) lines.push(`${tier}件：${desc}`);
    });
  return normalizeBuffGameText(lines.join('\n'));
}

function getEchoSpecimenDefaultGameText(specimenId) {
  const sp = findEchoSpecimen(specimenId);
  if (!sp) return '';
  const name = String(sp.name || '').trim();
  const body = String(sp.skillResolved || sp.skillDesc || '').trim();
  if (name && body) return normalizeBuffGameText(`${name}\n${body}`);
  return normalizeBuffGameText(body || name);
}

function getEchoSetGameText(setId) {
  const id = String(setId || '').trim();
  if (!id) return '';
  const local = normalizeBuffGameText(loadEchoGameTextLocal().sets[id]);
  if (local) return local;
  return getEchoSetDefaultGameText(id);
}

function getEchoSpecimenGameText(specimenId) {
  const id = String(specimenId || '').trim();
  if (!id) return '';
  const local = normalizeBuffGameText(loadEchoGameTextLocal().specimens[id]);
  if (local) return local;
  return getEchoSpecimenDefaultGameText(id);
}

function resolveEchoGameTextSource(buff) {
  if (!buff) return null;
  if (buff.teamSourceId && typeof ensureTeamSharedBuffs === 'function') {
    const src = ensureTeamSharedBuffs().buffs.find((b) => b.id === buff.teamSourceId);
    if (src && src !== buff) return resolveEchoGameTextSource(src);
  }
  if (
    buff.echoSetSourceId ||
    buff.echoSetGenerated ||
    buff.echoSetTeamBuff ||
    String(buff.id || '').startsWith(ECHO_SET_BUFF_PREFIX) ||
    String(buff.id || '').startsWith(ECHO_SET_TEAM_BUFF_PREFIX)
  ) {
    let setId = String(buff.echoSetSourceId || '').trim();
    if (!setId) {
      const id = String(buff.id || '');
      if (id.startsWith(ECHO_SET_TEAM_BUFF_PREFIX)) {
        const parts = id.slice(ECHO_SET_TEAM_BUFF_PREFIX.length).split('_');
        // mi_setId_tier_buffKey...
        if (parts.length >= 3) setId = parts[1];
      } else if (id.startsWith(ECHO_SET_BUFF_PREFIX)) {
        const parts = id.slice(ECHO_SET_BUFF_PREFIX.length).split('_');
        // setId_tier_buffKey...
        if (parts.length >= 2) setId = parts[0];
      }
    }
    if (setId) return { kind: 'echoSet', id: setId };
  }
  if (
    buff.echoMainSourceId ||
    buff.echoMainGenerated ||
    buff.echoMainTeamBuff ||
    String(buff.id || '').startsWith(ECHO_MAIN_BUFF_PREFIX) ||
    String(buff.id || '').startsWith(ECHO_MAIN_TEAM_BUFF_PREFIX)
  ) {
    let specimenId = String(buff.echoMainSourceId || '').trim();
    if (!specimenId) {
      const id = String(buff.id || '');
      if (id.startsWith(ECHO_MAIN_TEAM_BUFF_PREFIX)) {
        const parts = id.slice(ECHO_MAIN_TEAM_BUFF_PREFIX.length).split('_');
        // mi_echoId_buffKey...
        if (parts.length >= 2) specimenId = parts[1];
      } else if (id.startsWith(ECHO_MAIN_BUFF_PREFIX)) {
        const parts = id.slice(ECHO_MAIN_BUFF_PREFIX.length).split('_');
        // specimenId_buffKey...
        if (parts.length >= 1) specimenId = parts[0];
      }
    }
    if (specimenId) return { kind: 'echoSpecimen', id: specimenId };
  }
  return null;
}

function getEchoGameTextForSource(source) {
  if (!source?.id) return '';
  if (source.kind === 'echoSet') return getEchoSetGameText(source.id);
  if (source.kind === 'echoSpecimen') return getEchoSpecimenGameText(source.id);
  return '';
}

function syncEchoGameTextToRuntime(source, gameText) {
  if (!source?.id || !source.kind) return;
  const text = normalizeBuffGameText(gameText);
  const apply = (b) => {
    const src = resolveEchoGameTextSource(b);
    if (!src || src.kind !== source.kind || src.id !== source.id) return;
    if (text) b.gameText = text;
    else delete b.gameText;
  };
  (state?.members || []).forEach((m) => {
    (m.buffs || []).forEach(apply);
    (m.cycleConfig?.rounds || []).forEach((round) => {
      (round.buffs || []).forEach(apply);
    });
  });
  if (typeof ensureTeamSharedBuffs === 'function') {
    ensureTeamSharedBuffs().buffs.forEach(apply);
  }
}

/**
 * 保存声骸原文案到本机覆盖库。
 * source.kind = echoSet | echoSpecimen
 */
function patchEchoBuffGameText(sourceKind, sourceId, gameText) {
  const kind = sourceKind === 'echoSpecimen' ? 'echoSpecimen' : 'echoSet';
  const id = String(sourceId || '').trim();
  if (!id) return { ok: false, reason: '缺少声骸来源 id' };
  if (kind === 'echoSet' && !findEchoSetDef(id)) return { ok: false, reason: '未找到声骸套装' };
  if (kind === 'echoSpecimen' && !findEchoSpecimen(id)) return { ok: false, reason: '未找到声骸个体' };
  const text = normalizeBuffGameText(gameText);
  const lib = loadEchoGameTextLocal();
  const bucket = kind === 'echoSpecimen' ? 'specimens' : 'sets';
  if (text) lib[bucket][id] = text;
  else delete lib[bucket][id];
  saveEchoGameTextLocal(lib);
  const source = { kind, id };
  const display = text || getEchoGameTextForSource(source);
  syncEchoGameTextToRuntime(source, display);
  return { ok: true, text: display, source };
}

/** 套装展示顺序：沿用 echo-sets.json 中的游戏筛选顺序（凝夜白霜 → … → 冥途夜行之灯） */
function getEchoSetsSorted() {
  return [...(echoSetsDb?.sets || [])];
}

function isMainEchoValidForSet(echoId, setId) {
  if (!echoId || !setId) return false;
  return getEchoSetMainEchoIds(setId).has(String(echoId));
}

/** 配置选择页：只刷新受影响角色列，避免整页 sidebar / 左侧阶段导航重绘导致图标跳动 */
function refreshSetupBuildInPlace(member) {
  if (typeof getWorkspacePhase !== 'function' || getWorkspacePhase() !== 'setup') return false;
  if (typeof isSpecialView === 'function' && isSpecialView()) return false;
  if (typeof renderBuildPanel !== 'function') return false;
  const idx = typeof getMemberIndex === 'function' ? getMemberIndex(member) : -1;
  if (idx < 0) return false;
  const col = document.querySelector(`.setup-team-grid [data-setup-member="${idx}"]`);
  if (!col) return false;

  const shell = document.querySelector('.setup-workspace .sidebar-shell');
  const scrollTop = shell?.scrollTop ?? 0;
  const ae = document.activeElement;
  const focusSel =
    ae && col.contains(ae) && ae.tagName === 'SELECT'
      ? {
          slot: ae.getAttribute('data-echo-slot'),
          main1: ae.getAttribute('data-echo-main1'),
          mainEl: ae.getAttribute('data-echo-main-element'),
          subStat: ae.getAttribute('data-echo-sub-stat'),
          subVal: ae.getAttribute('data-echo-sub-value'),
          subType: ae.getAttribute('data-echo-sub-dmgtype'),
          subIndex: ae.getAttribute('data-echo-sub-index'),
        }
      : null;

  // Keep the grid's height through the column swap so the viewport cannot jump while effects reattach.
  const grid = col.closest('.setup-team-grid');
  const previousMinHeight = grid?.style.minHeight || '';
  const gridHeight = grid?.getBoundingClientRect().height || 0;
  const nextPanel = renderBuildPanel(member, idx);
  if (gridHeight > 0) grid.style.minHeight = `${gridHeight}px`;
  col.outerHTML = nextPanel;
  if (gridHeight > 0) requestAnimationFrame(() => {
    grid.style.minHeight = previousMinHeight;
  });

  if (shell) shell.scrollTop = scrollTop;

  // 全队总伤可能变化，只改数字，不重绘其它列
  if (Array.isArray(state?.members)) {
    state.members.forEach((m, i) => {
      const el = document.querySelector(
        `.setup-team-grid [data-setup-member="${i}"] .setup-member-dmg-value`
      );
      if (el) el.textContent = typeof fmt === 'function' ? fmt(m.results?.total || 0) : String(m.results?.total || 0);
    });
  }

  if (focusSel) {
    const nextCol = document.querySelector(`.setup-team-grid [data-setup-member="${idx}"]`);
    let sel = null;
    if (focusSel.subStat != null) {
      sel = nextCol?.querySelector(
        `select[data-echo-sub-stat="${focusSel.subStat}"][data-echo-sub-index="${focusSel.subIndex}"]`
      );
    } else if (focusSel.subVal != null) {
      sel = nextCol?.querySelector(
        `select[data-echo-sub-value="${focusSel.subVal}"][data-echo-sub-index="${focusSel.subIndex}"]`
      );
    } else if (focusSel.subType != null) {
      sel = nextCol?.querySelector(
        `select[data-echo-sub-dmgtype="${focusSel.subType}"][data-echo-sub-index="${focusSel.subIndex}"]`
      );
    } else if (focusSel.main1 != null) {
      sel = nextCol?.querySelector(`select[data-echo-main1="${focusSel.main1}"]`);
    } else if (focusSel.mainEl != null) {
      sel = nextCol?.querySelector(`select[data-echo-main-element="${focusSel.mainEl}"]`);
    }
    if (sel && typeof sel.focus === 'function') sel.focus({ preventScroll: true });
  }
  return true;
}

function refreshEchoUiPanels(member) {
  if (refreshSetupBuildInPlace(member)) return true;
  if (refreshEchoPanelInPlace(member)) return true;
  return false;
}

function refreshEchoUiAfterChange(member) {
  updateResultsOnly();
  renderTeamBar();
  if (!isSpecialView()) {
    renderMain(captureMainScrollState());
  }
  if (!refreshEchoUiPanels(member)) {
    const tab = getSidebarTab();
    const scrollSaved = tab === 'echo' || tab === 'build' ? captureEchoPanelScrollState() : null;
    // 阶段导航已在页上时勿整段重绘，避免图标闪烁
    if (typeof renderSidebar === 'function') renderSidebar({ skipPhaseBar: true });
    if (scrollSaved) restoreEchoPanelScrollState(scrollSaved);
  }
  persistCycleEditingIfEnabled(member);
  scheduleSave();
}

function getSpecimensForEchoSlot(member, slot, activeSetId) {
  const setId = String(activeSetId || slot?.activeSetId || '');
  const cost = Number(slot?.cost);
  const allowed = getEchoSetMainEchoIds(setId);
  if (!allowed.size) return [];
  return (echoSpecimensDb?.specimens || []).filter((sp) => {
    if (!allowed.has(String(sp.id))) return false;
    if (!Number.isFinite(cost)) return true;
    const costs = Array.isArray(sp.costs) && sp.costs.length ? sp.costs.map(Number) : [Number(sp.cost)];
    return costs.includes(cost);
  });
}

function countEchoSetPieces(source) {
  if (source?.setLoadout) {
    const counts = {};
    (source.setLoadout || []).forEach((entry) => {
      if (!entry?.setId) return;
      const count = Number(entry.count) || 0;
      if (count <= 0) return;
      counts[entry.setId] = (counts[entry.setId] || 0) + count;
    });
    return counts;
  }
  const counts = {};
  (source || []).forEach((slot) => {
    const setId = slot?.activeSetId;
    if (!setId) return;
    counts[setId] = (counts[setId] || 0) + 1;
  });
  return counts;
}

function getEchoSetLoadoutTotal(loadout) {
  return (loadout || []).reduce((sum, entry) => sum + (Number(entry?.count) || 0), 0);
}

function getEchoSetIconUrl(setDef) {
  if (!setDef) return '';
  if (setDef.iconUrl) return setDef.iconUrl;
  const setId = String(setDef.id);
  const mainIds = getEchoSetMainEchoIds(setId);
  for (const echoId of mainIds) {
    const specimen = findEchoSpecimen(echoId);
    if (specimen?.icon) return nanokaAssetUrl(specimen.icon);
  }
  const sample = findEchoSpecimen(setDef.sampleEchoId);
  if (sample?.icon) return nanokaAssetUrl(sample.icon);
  return '';
}

function getSpecimensForSetEntry(member, setId) {
  const cfg = ensureEchoConfig(member);
  const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
  const mainCost = cfg.slots[mainIdx]?.cost ?? 4;
  return getSpecimensForEchoSlot(member, { cost: mainCost, activeSetId: setId }, setId);
}

function renderEchoSetIconHtml(setDef, className = 'echo-set-icon') {
  const url = getEchoSetIconUrl(setDef);
  if (url) {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="" loading="lazy" />`;
  }
  const label = setDef?.name ? String(setDef.name).slice(0, 1) : '?';
  return `<span class="${className} placeholder">${escapeHtml(label)}</span>`;
}

function upsertEchoSetPanelSource(char, statKey, sourceId, name, value) {
  const key = charStatSourcesKey(statKey);
  if (!char[key]) char[key] = [];
  const v = Number(value) || 0;
  const idx = char[key].findIndex((s) => s.id === sourceId);
  if (v <= 0) {
    if (idx >= 0) char[key].splice(idx, 1);
    return;
  }
  if (idx >= 0) {
    char[key][idx].name = name;
    char[key][idx].value = v;
  } else {
    char[key].push({ id: sourceId, name, value: v });
  }
}

function clearEchoSetPanelSources(char) {
  Object.keys(CHAR_STATS).forEach((statKey) => {
    const key = charStatSourcesKey(statKey);
    if (!char[key]) return;
    char[key] = char[key].filter(
      (s) =>
        !String(s.id || '').startsWith(ECHO_SET_PANEL_PREFIX) &&
        !String(s.id || '').startsWith(ECHO_MAIN_PANEL_ATTR_PREFIX) &&
        !String(s.id || '').startsWith(ECHO_MAIN_PANEL_TYPE_PREFIX) &&
        !String(s.id || '').startsWith(ECHO_MAIN_PANEL_STAT_PREFIX)
    );
  });
}

function isEchoSetGeneratedSkill(p) {
  return !!p?.echoSetGenerated || String(p?.id || '').startsWith(ECHO_SET_SKILL_PREFIX);
}

function removeEchoSetGeneratedSkills(member) {
  if (!member.skillPalette?.length) return;
  member.skillPalette = member.skillPalette.filter((p) => !isEchoSetGeneratedSkill(p));
}

function removeEchoSetGeneratedBuffs(member, opts = {}) {
  const removeIds = new Set((member.buffs || []).filter(isEchoSetGeneratedBuff).map((b) => b.id));
  if (!removeIds.size) return removeIds;
  member.buffs = member.buffs.filter((b) => !removeIds.has(b.id));
  if (opts.soft) {
    // 软重建：只摘列表。勾选/叠层/技能覆盖均按稳定 id 留在原 map，禁止 delete/purge。
    return removeIds;
  }
  removeIds.forEach((id) => purgeMemberBuffReferences(member, id));
  removeIds.forEach((id) => {
    delete member.globalBuffActive[id];
    delete member.globalBuffStacks[id];
  });
  return removeIds;
}

function applyParsedSetEffect(member, effect, setId, tier) {
  if (!effect || effect.kind === 'note') return;
  const label = effect.label || effect.name || `套装${tier}件`;
  if (effect.kind === 'panel') {
    // 来源标识与属性含义分开；旧记录未指定 sourceKey 时沿用原编号。
    const sourceId = `${ECHO_SET_PANEL_PREFIX}${setId}_${tier}_${effect.sourceKey || effect.stat || 'x'}`;
    if (effect.stat === 'attrBonus' && effect.element) {
      upsertEchoSetPanelSource(member.char, 'attrBonus', `${ECHO_SET_PANEL_PREFIX}${setId}_${tier}_${effect.element}`, `${label}`, effect.value);
    } else if (effect.stat === 'typeDmgBonus' && effect.damageType) {
      upsertEchoSetPanelSource(
        member.char,
        'typeDmgBonus',
        `${ECHO_SET_PANEL_PREFIX}${setId}_${tier}_type_${effect.damageType}`,
        label,
        effect.value
      );
    } else if (effect.stat === 'critRate') {
      upsertEchoSetPanelSource(member.char, 'critRate', sourceId, label, effect.value);
    } else if (effect.stat === 'atkPercent') {
      upsertEchoSetPanelSource(member.char, 'atkPercent', sourceId, label, effect.value);
    } else if (effect.stat === 'hpPercent') {
      upsertEchoSetPanelSource(member.char, 'hpPercent', sourceId, label, effect.value);
    } else if (effect.stat === 'defPercent') {
      upsertEchoSetPanelSource(member.char, 'defPercent', sourceId, label, effect.value);
    } else if (
      effect.stat === 'energyRegenPct' ||
      effect.stat === 'energyRegen' ||
      (effect.stat === 'displayOnly' && /共鸣效率/.test(String(effect.label || label || '')))
    ) {
      upsertEchoSetPanelSource(member.char, 'energyRegenPct', sourceId, label, effect.value);
    }
    return;
  }
  if (effect.kind === 'skillMult') {
    if (!member.skillPalette) member.skillPalette = [];
    const paletteId = `${ECHO_SET_SKILL_PREFIX}${setId}_${tier}`;
    const setDef = findEchoSetDef(setId);
    const name = effect.name || `${setDef?.name || '套装'}·${label}`;
    const payload = {
      id: paletteId,
      name,
      damageType: effect.damageType || '延奏',
      damageElement: effect.element || '',
      baseMult: Number(effect.value) || 0,
      energyRegen: Number(effect.energyRegen) || 0,
      echoSetGenerated: true,
      echoSetSourceId: String(setId),
      echoSetTier: tier,
    };
    const existing = member.skillPalette.find((p) => p.id === paletteId);
    if (existing) Object.assign(existing, payload);
    else member.skillPalette.push(payload);
    return;
  }
  if (effect.kind === 'buff') {
    // 复合效果：单条 Buff 内多个乘区共用同一叠层（如荣斗铸锋之冠：攻击+暴伤）
    if (effect.category === 'composite' || Array.isArray(effect.effects)) {
      // 同一套装同一件数可能出现多条复合效果，用 label 作区分，避免 id 撞车互相覆盖
      const disc =
        String(effect.label || effect.name || 'fx')
          .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
          .slice(0, 16) || 'composite';
      const buffId = `${ECHO_SET_BUFF_PREFIX}${setId}_${tier}_composite_${disc}`;
      const compositeGameText = getEchoSetGameText(setId);
      const buff = normalizeBuff({
        id: buffId,
        category: 'composite',
        name: withManagedBuffSourcePrefix(
          findEchoSetDef(setId)?.name || effect.name || label,
          '【声骸】'
        ),
        mode: 'stack',
        value: 0,
        perStack: 0,
        maxStacks: Math.max(1, Number(effect.maxStacks) || 5),
        echoSetGenerated: true,
        echoSetSourceId: String(setId),
        echoSetTier: tier,
        ...(compositeGameText ? { gameText: compositeGameText } : {}),
        effects: (effect.effects || []).map((fx) =>
          normalizeCompositeEffect({
            ...fx,
            valueMode: fx.valueMode === 'fixed' ? 'fixed' : 'stack',
            skillScope: fx.skillScope || 'all',
          })
        ),
      });
      member.buffs.push(buff);
      if (member.globalBuffActive[buffId] === undefined) {
        member.globalBuffActive[buffId] = false;
      }
      if (!member.globalBuffStacks) member.globalBuffStacks = {};
      if (member.globalBuffStacks[buffId] === undefined) member.globalBuffStacks[buffId] = 0;
      return;
    }
    const isElementBuff = !!(effect.element && effect.element !== '全属性');
    const text = `${effect.name || ''}${effect.label || ''}${label || ''}`;
    let category =
      effect.category || (isElementBuff ? 'elementBonus' : 'generalBonus');
    let damageType = effect.damageType || '';
    if (/协同攻击/.test(text) && /伤害/.test(text)) {
      category = 'typeBonus';
      damageType = COORD_ATTACK_DAMAGE_TYPE;
    }
    if (/谐度破坏增幅/.test(text) && !echoEffectIsHarmonyDrivenAttack(text, category)) {
      category = 'harmonyBreakAmp';
    }
    const buffKey = [category || 'bonus', damageType || effect.element || ''].filter(Boolean).join('_');
    const buffId = `${ECHO_SET_BUFF_PREFIX}${setId}_${tier}_${buffKey}`;
    const isStack = effect.mode === 'stack' || (Number(effect.maxStacks) > 1 && Number(effect.perStack) > 0);
    const mode = isStack ? 'stack' : 'fixed';
    const perStack = Number(effect.perStack) || (mode === 'stack' ? Number(effect.value) || 0 : 0);
    const setGameText = getEchoSetGameText(setId);
    const buff = normalizeBuff({
      id: buffId,
      category,
      name: withManagedBuffSourcePrefix(
        findEchoSetDef(setId)?.name || effect.name || label,
        '【声骸】'
      ),
      mode,
      value: mode === 'stack' ? 0 : Number(effect.value) || 0,
      perStack,
      maxStacks: Math.max(1, Number(effect.maxStacks) || 5),
      element:
        isElementBuff || category === 'elementBonus' || category === 'elementDeep'
          ? effect.element || ''
          : '',
      damageType,
      echoSetGenerated: true,
      echoSetSourceId: String(setId),
      echoSetTier: tier,
      ...(setGameText ? { gameText: setGameText } : {}),
    });
    member.buffs.push(buff);
    // 软重建时 map 里可能已有旧值：仅在缺省时写入，禁止覆盖用户层数/勾选
    if (member.globalBuffActive[buffId] === undefined) {
      // 声骸个人 Buff 默认不勾选（对照表/阶段按需开启）
      member.globalBuffActive[buffId] = false;
    }
    if (mode === 'stack') {
      if (!member.globalBuffStacks) member.globalBuffStacks = {};
      if (member.globalBuffStacks[buffId] === undefined) member.globalBuffStacks[buffId] = 0;
    }
    return;
  }
  if (effect.kind === 'teamBuff') {
    return;
  }
}

function buildEchoSetTeamBuffKey(effect, category, mode) {
  const typed = [effect.damageType, effect.element].filter(Boolean).join('_');
  const namePart = String(effect.name || effect.label || 'fx')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .slice(0, 24);
  return [category, typed, mode, namePart].filter(Boolean).join('_');
}

function isNiguangCombinedAtkEffect(effect, setId, tier) {
  if (String(setId) !== ECHO_SET_NIGUANG_YUECAI_ID || Number(tier) !== 5) return false;
  if (!effect || effect.kind !== 'teamBuff') return false;
  if (Number(effect.harmonyAtkPerPoint) > 0 || Number(effect.harmonyAtkCap) > 0) return true;
  const text = `${effect.name || ''}${effect.label || ''}`;
  return /谐度破坏增幅/.test(text) || /变奏登场攻击/.test(text);
}

/** 星构按偏谐效率、羽落按共鸣效率：每满1%转攻击，上限25%。 */
function getEchoSetConvertedAttackValue(member, setId = '25') {
  const feather = String(setId) === '33';
  const efficiency = getCharStatTotal(member?.char || {}, feather ? 'energyRegenPct' : 'offsetHarmonyEffPct');
  return Math.min(25, Math.max(0, Math.floor(Number(efficiency) || 0)) / (feather ? 10 : 5));
}

/** 在偏谐效率面板同步后刷新共享条目及现存镜像，保留勾选和稳定id。 */
function syncEchoSetConvertedAttackValues() {
  const shared = state.team?.sharedBuffs?.buffs || [];
  const values = new Map();
  shared.forEach((buff) => {
    if (!buff.echoSetTeamBuff || !['25', '33'].includes(String(buff.echoSetSourceId)) || Number(buff.echoSetTier) !== 5 || buff.category !== 'generalAttack') return;
    const holder = state.members?.[buff.echoSetSourceMember];
    if (!holder) return;
    buff.value = getEchoSetConvertedAttackValue(holder, buff.echoSetSourceId);
    values.set(buff.id, buff.value);
  });
  (state.members || []).forEach((member) => {
    const patch = (buff) => {
      if (values.has(buff.teamSourceId)) buff.value = values.get(buff.teamSourceId);
    };
    (member.buffs || []).forEach(patch);
    (member.cycleConfig?.rounds || []).forEach((round) => (round.buffs || []).forEach(patch));
  });
  (state.specialSkills?.characters || []).forEach((character) => {
    (character.buffs || []).forEach((buff) => {
      if (values.has(buff.teamSourceId)) buff.value = values.get(buff.teamSourceId);
    });
  });
}


function buildEchoSetTeamBuffPayload(effect, setId, tier, memberIndex, label) {
  const setDef = findEchoSetDef(setId);
  const isElementBuff = !!(effect.element && effect.element !== '全属性');
  const text = `${effect.name || ''}${effect.label || ''}${label || ''}`;
  let category = effect.category || (isElementBuff ? 'elementBonus' : 'typeBonus');
  if (/谐度破坏增幅/.test(text) && !echoEffectIsHarmonyDrivenAttack(text, category)) {
    category = 'harmonyBreakAmp';
  }
  // 泛用增伤等旧键并入属性页签时，勿把谐幅误并
  if (category === 'convergence' && /谐度破坏增幅/.test(text) && !echoEffectIsHarmonyDrivenAttack(text, category)) {
    category = 'harmonyBreakAmp';
  }
  if (echoEffectIsHarmonyDrivenAttack(text, category)) {
    category = effect.category === 'typeAttack' ? 'typeAttack' : 'generalAttack';
  }
  const isNiguangCombined = isNiguangCombinedAtkEffect(effect, setId, tier);
  // 逆光跃彩：固定一条「基础15% + 谐幅额外」，不再拆固定/叠层两列
  if (isNiguangCombined) {
    category = 'generalAttack';
  }
  const isStack =
    !isNiguangCombined &&
    (effect.mode === 'stack' || (Number(effect.maxStacks) > 1 && Number(effect.perStack) > 0));
  const mode = isStack ? 'stack' : 'fixed';
  const perStack = Number(effect.perStack) || (mode === 'stack' ? Number(effect.value) || 0 : 0);
  const buffKey = isNiguangCombined
    ? 'generalAttack_niguang_combined'
    : buildEchoSetTeamBuffKey(effect, category, mode);
  const teamId = `${ECHO_SET_TEAM_BUFF_PREFIX}${memberIndex}_${setId}_${tier}_${buffKey}`;
  const baseAtk = isNiguangCombined
    ? Number(effect.value) || ECHO_NIGUANG_ATK_BASE
    : ['25', '33'].includes(String(setId)) && Number(tier) === 5 && category === 'generalAttack'
      ? getEchoSetConvertedAttackValue(state.members[memberIndex], setId)
      : Number(effect.value) || 0;
  const perPoint = isNiguangCombined
    ? Number(effect.harmonyAtkPerPoint) || ECHO_NIGUANG_ATK_PER_POINT
    : 0;
  const extraCap = isNiguangCombined
    ? Number(effect.harmonyAtkCap) || ECHO_NIGUANG_ATK_EXTRA_CAP
    : 0;
  const setGameText = getEchoSetGameText(setId);
  return {
    id: teamId,
    buff: normalizeBuff({
      id: teamId,
      category,
      name: withManagedBuffSourcePrefix(
        setDef?.name || effect.name || label || '套装',
        '【声骸】'
      ),
      mode,
      value: mode === 'stack' ? 0 : baseAtk,
      perStack,
      maxStacks: Math.max(1, Number(effect.maxStacks) || 5),
      element:
        isElementBuff || category === 'elementBonus' || category === 'elementDeep'
          ? effect.element || ''
          : '',
      damageType: effect.damageType || '',
      echoSetTeamBuff: true,
      echoSetSourceMember: memberIndex,
      echoSetSourceId: String(setId),
      echoSetTier: tier,
      sourceMemberIndex: memberIndex,
      ...(setGameText ? { gameText: setGameText } : {}),
      ...(isNiguangCombined
        ? {
            echoSetHarmonyAmpSync: true,
            echoSetNiguangCombinedAtk: true,
            echoSetNiguangBaseAtk: baseAtk,
            echoSetNiguangAtkPerPoint: perPoint,
            echoSetNiguangAtkCap: extraCap,
            stackSync: ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC,
          }
        : {}),
    }),
    mode,
  };
}

function isEchoSetHarmonyAmpAtkBuff(b) {
  if (!b) return false;
  if (b.echoSetNiguangCombinedAtk || b.echoSetHarmonyAmpSync) return true;
  if (b.stackSync === ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC) return true;
  const name = String(b.name || '');
  return (
    isEchoSetTeamBuff(b) &&
    String(b.echoSetSourceId || '') === ECHO_SET_NIGUANG_YUECAI_ID &&
    (/谐度破坏增幅/.test(name) || /变奏登场攻击/.test(name) || /逆光跃彩/.test(name)) &&
    (b.category === 'generalAttack' || b.category === 'harmonyBreakAmp' || /攻击/.test(name))
  );
}

/** 逆光跃彩之约：value = 基础15% + min(上限15%, floor(装备者谐幅)×0.3%) */
function syncEchoSetHarmonyAmpAtkStacks(opts = {}) {
  const shared = ensureTeamSharedBuffs();
  if (!shared.globalBuffStacks) shared.globalBuffStacks = {};
  let changed = false;
  (shared.buffs || []).forEach((b) => {
    if (!isEchoSetHarmonyAmpAtkBuff(b)) return;
    if (b.category !== 'generalAttack') {
      b.category = 'generalAttack';
      changed = true;
    }
    const srcIdx = Number.isInteger(b.echoSetSourceMember) ? b.echoSetSourceMember : -1;
    const source = srcIdx >= 0 ? state.members?.[srcIdx] : null;
    const amp = source ? getMemberHarmonyBreakAmpTotal(source) : 0;
    const base = Number(b.echoSetNiguangBaseAtk);
    const perPoint = Number(b.echoSetNiguangAtkPerPoint);
    const extraCap = Number(b.echoSetNiguangAtkCap);
    const useCombined =
      !!b.echoSetNiguangCombinedAtk ||
      (Number.isFinite(base) && base > 0) ||
      !isStackBuff(b);
    if (useCombined || !isStackBuff(b)) {
      const baseAtk = Number.isFinite(base) && base > 0 ? base : ECHO_NIGUANG_ATK_BASE;
      const per = Number.isFinite(perPoint) && perPoint > 0 ? perPoint : ECHO_NIGUANG_ATK_PER_POINT;
      const cap =
        Number.isFinite(extraCap) && extraCap > 0 ? extraCap : ECHO_NIGUANG_ATK_EXTRA_CAP;
      const rawExtra = Math.max(0, Math.floor(Number(amp) || 0) * per);
      const extra = Math.min(cap, Math.round(rawExtra * 1000) / 1000);
      const nextVal = Math.round((baseAtk + extra) * 1000) / 1000;
      b.mode = 'fixed';
      b.perStack = 0;
      b.echoSetNiguangCombinedAtk = true;
      b.echoSetNiguangBaseAtk = baseAtk;
      b.echoSetNiguangAtkPerPoint = per;
      b.echoSetNiguangAtkCap = cap;
      b.echoSetHarmonyAmpSync = true;
      b.stackSync = ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC;
      if (Number(b.value) !== nextVal) {
        b.value = nextVal;
        changed = true;
      } else {
        b.value = nextVal;
      }
      // 合并后不再使用叠层键
      if (shared.globalBuffStacks[b.id] !== undefined) {
        delete shared.globalBuffStacks[b.id];
        changed = true;
      }
      b._echoHarmonyAmpHint = `基础攻击 ${baseAtk}% + 谐幅 ${Number(amp) || 0}→额外 ${extra}%（每点+${per}%，上限 ${cap}%）= ${nextVal}%`;
      return;
    }
    // 兼容旧档拆分出来的叠层条（同步后会被合并键替换）
    const cap = Math.max(1, Number(b.maxStacks) || 50);
    const next = Math.min(cap, Math.max(0, Math.floor(Number(amp) || 0)));
    const prev = normalizeStackInput(shared.globalBuffStacks[b.id] ?? 0);
    if (prev !== next) {
      shared.globalBuffStacks[b.id] = next;
      changed = true;
    } else {
      shared.globalBuffStacks[b.id] = next;
    }
    b.echoSetHarmonyAmpSync = true;
    b.stackSync = ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC;
    b._echoHarmonyAmpHint = `装备者谐幅 ${Number(amp) || 0} → ${next} 层（每点攻击+${Number(b.perStack) || 0.3}%，上限 ${cap} 层）`;
  });
  if (changed && opts.skipMemberSync !== true) {
    syncTeamBuffsToMembers();
  }
  return changed;
}

function syncEchoSetTeamBuffs() {
  if (!ensureEchoRuntimeDbsFromCache()) return;
  ensureTeamSharedBuffs();
  const shared = state.team.sharedBuffs;
  shared.buffs = shared.buffs.filter((b) => !isEchoSetTeamBuff(b));
  state.members.forEach((member, memberIndex) => {
    const cfg = ensureEchoConfig(member);
    syncSetLoadoutToSlots(cfg);
    const counts = countEchoSetPieces(cfg);
    Object.entries(counts).forEach(([setId, n]) => {
      const def = findEchoSetDef(setId);
      if (!def?.bonuses) return;
      getEchoSetActiveTiers(def, n).forEach((tier) => {
        const tierData = def.bonuses[String(tier)];
        if (!tierData) return;
        normalizeMainEffects(tierData.effects).forEach((fx) => {
          if (fx.kind !== 'teamBuff') return;
          const label = fx.label || fx.name || `套装${tier}件`;
          const { id: teamId, buff, mode } = buildEchoSetTeamBuffPayload(fx, setId, tier, memberIndex, label);
          if (shared.buffs.some((b) => b.id === teamId)) return;
          shared.buffs.push(buff);
          invalidateSharedBuffsCache();
          if (shared.globalBuffActive[teamId] === undefined) shared.globalBuffActive[teamId] = true;
          if (mode === 'stack') {
            if (!shared.globalBuffStacks) shared.globalBuffStacks = {};
            if (shared.globalBuffStacks[teamId] === undefined) {
              // 重同步时从角色侧 tm_* / 镜像键恢复，避免刷新后被写成默认 0
              const mirrorId =
                typeof makeTeamMirrorBuffId === 'function'
                  ? makeTeamMirrorBuffId(teamId)
                  : `tm_${teamId}`;
              let recovered;
              (state.members || []).some((m) => {
                const map = m?.globalBuffStacks || {};
                if (map[mirrorId] !== undefined) {
                  recovered = map[mirrorId];
                  return true;
                }
                if (map[teamId] !== undefined) {
                  recovered = map[teamId];
                  return true;
                }
                return false;
              });
              const n =
                typeof normalizeStackInput === 'function'
                  ? normalizeStackInput(recovered ?? 0)
                  : Math.max(0, Number(recovered) || 0);
              shared.globalBuffStacks[teamId] = n;
            }
          }
        });
      });
    });
  });
  // 先镜像正确乘区（攻击），再按装备者谐幅写层数，避免误进谐幅时自抬合计
  syncTeamBuffsToMembers();
  syncEchoSetHarmonyAmpAtkStacks();
}

function isEchoMainGeneratedBuff(buff) {
  return !!buff?.echoMainGenerated || String(buff?.id || '').startsWith(ECHO_MAIN_BUFF_PREFIX);
}

function removeEchoMainGeneratedBuffs(member, opts = {}) {
  const removeIds = new Set((member.buffs || []).filter(isEchoMainGeneratedBuff).map((b) => b.id));
  if (!removeIds.size) return removeIds;
  member.buffs = member.buffs.filter((b) => !removeIds.has(b.id));
  if (opts.soft) {
    // 同套装：软重建不碰运行时勾选/叠层 map
    return removeIds;
  }
  removeIds.forEach((id) => purgeMemberBuffReferences(member, id));
  removeIds.forEach((id) => {
    delete member.globalBuffActive[id];
    delete member.globalBuffStacks[id];
  });
  return removeIds;
}

function buildEchoMainSlotLabel(specimen) {
  const base = String(specimen?.name || '声骸').trim();
  return `${base} · 首位`;
}

function buildEchoMainTeamBuffKey(effect, category, mode) {
  const typed = [effect.damageType, effect.element].filter(Boolean).join('_');
  const namePart = String(effect.name || effect.label || 'fx')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .slice(0, 24);
  return [category, typed, mode, namePart].filter(Boolean).join('_');
}

function resolveEchoSkillScaleStat(effect) {
  if (effect?.scaleStat === 'hp' || effect?.scaleStat === 'def') return effect.scaleStat;
  const hint = `${effect?.note || ''}${effect?.label || ''}`;
  if (/生命/.test(hint)) return 'hp';
  if (/防御/.test(hint)) return 'def';
  return 'atk';
}

function resolveMainEchoSkillPaletteId(effect) {
  const skillKey = String(effect?.skillKey || '')
    .trim()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
  if (skillKey) return `${ECHO_MAIN_SKILL_PREFIX}${skillKey}`;
  return ECHO_SKILL_PALETTE_ID;
}

function isEchoMainGeneratedSkill(p) {
  const id = String(p?.id || '');
  return (
    !!p?.echoMainGenerated ||
    id === ECHO_SKILL_PALETTE_ID ||
    id.startsWith(ECHO_MAIN_SKILL_PREFIX)
  );
}

function removeEchoMainGeneratedSkills(member) {
  if (!member?.skillPalette) return;
  member.skillPalette = member.skillPalette.filter((p) => !isEchoMainGeneratedSkill(p));
}

function syncEchoPaletteSkillToAxis(member, paletteItem, specimen) {
  if (!member || !paletteItem?.name) return;
  const baseName = String(paletteItem.name).replace(/（[^）]*）$/, '').replace(/\([^)]*\)$/, '');
  // 声骸主位多形态拆分（短按/长按/各段）后，同一 baseName 会有多个变体。
  // 旧存档轴里只有不带后缀的旧技能名（如「声骸·梦魇·燎照之骑」= 拆分前单条模型），
  // 若按 baseName 模糊匹配会把旧条目改写成最后一个变体（405 → 长按 283.5，静默掉伤害）。
  // 修复：以声骸数据本身的 skillMult 条数判定多形态（不依赖调色板当前已添加几个，
  // 否则第一条变体应用时计数=1 仍会把旧条目改写掉）；梦魇亚当·重锤会按装配角色追加
  // 变体（露西长按 / 丽贝卡导电），同样视为多形态。多形态时只允许「精确全名」同步。
  const multEffects = (specimen?.mainEffects || []).filter((e) => e.kind === 'skillMult');
  let variantCount = multEffects.length;
  const isAdam = String(specimen?.id) === ADAM_HAMMER_SPECIMEN_ID;
  if (isAdam) variantCount += 1;
  const splitVariants = variantCount > 1;
  // 梦魇亚当·重锤：旧轴可能以「基础名（无角色后缀）」放置（后缀/长按功能为后期本地新增），
  // 切角后必须跟随当前角色版本；仅主条目（非 adam_lucy_long 变体）承担基础名同步，避免长按重复覆盖。
  const adamMainPaletteItem =
    isAdam && paletteItem.id !== ECHO_MAIN_SKILL_PREFIX + 'adam_lucy_long';
    const adamBaseName = isAdam
      ? String(paletteItem.name).replace(/（.*）$/, '').replace(/\([^)]*\)$/, '')
      : '';
    const adamVariantNames = adamMainPaletteItem
      ? [
          `${adamBaseName}（基础（非露西/丽贝卡））`,
          `${adamBaseName}（露西·短按）`,
          `${adamBaseName}（丽贝卡·十六段导电）`,
        ]
      : [];
  const nameMatches = (n) => {
    const s = String(n || '');
    if (!s) return false;
    if (s === paletteItem.name) return true;
    if (splitVariants && adamMainPaletteItem && s === adamBaseName) return true;
    if (splitVariants && adamVariantNames.includes(s)) return true;
    if (splitVariants) return false;
    return s === baseName || s.startsWith(`${baseName}（`) || s.startsWith(`${baseName}(`);
  };
  const applyFields = (target) => {
    if (!target || !nameMatches(target.name)) return;
    target.name = paletteItem.name;
    target.baseMult = paletteItem.baseMult;
    if (Array.isArray(paletteItem.multComponents)) target.multComponents = paletteItem.multComponents;
    target.damageType = paletteItem.damageType || '声骸';
    if (paletteItem.damageElement) target.damageElement = paletteItem.damageElement;
    target.alsoAsEffect = normalizeAlsoAsEffectType(paletteItem.alsoAsEffect);
    target.scaleStat = paletteItem.scaleStat === 'hp' || paletteItem.scaleStat === 'def' ? paletteItem.scaleStat : 'atk';
    target.energyRegen = normalizeEnergyRegen(paletteItem.energyRegen);
  };
  (member.rotationCatalog || []).forEach(applyFields);
  forEachEditingPhaseSkill(member, (skill) => {
    if (skill.locked) return;
    applyFields(skill);
    if (skill.split && skill.hits?.length) {
      skill.hits.forEach((h) => {
        h.scaleStat = skill.scaleStat;
      });
    }
  });
}

function mainEchoEffectAllowedForMember(member, effect) {
  const ids = effect?.onlyCharacterIds;
  if (!Array.isArray(ids) || !ids.length) return true;
  const charId = String(member?.characterId || '').trim();
  if (!charId) return false;
  return ids.map(String).includes(charId);
}

/** 主位声骸的角色专属形态：技能生成与面板说明共用；每次返回独立对象，不改写角色或数据。 */
function resolveMainEchoSkillForm(member, specimen) {
  const specimenId = String(specimen?.id);
  const charId = String(member?.characterId || '');
  if (specimenId === ADAM_HAMMER_SPECIMEN_ID) {
    if (charId === LUCY_CHAR_ID) {
      return {
        skill: {
          baseMult: 273.6,
          damageElement: '衍射',
          multComponents: [{ rate: 273.6, count: 1 }],
          energyRegen: 3.8,
        },
        nameNote: '露西·短按',
        summaryNote: '露西·短按/长按',
        extraSkill: { key: 'adam_lucy_long', nameNote: '露西·长按' },
      };
    }
    if (charId === REBECCA_CHAR_ID) {
      return {
        skill: {
          baseMult: 273.6,
          damageElement: '导电',
          multComponents: [{ rate: 17.1, count: 16 }],
          energyRegen: 0.23,
        },
        nameNote: '丽贝卡·十六段导电',
        summaryNote: '丽贝卡·十六段',
      };
    }
  }
  if (specimenId === XIN_ECHO_SPECIMEN_ID && charId === XIN_CHAR_ID) {
    return {
      skill: {
        baseMult: 300.96,
        damageElement: '导电',
        multComponents: XIN_ECHO_HEART_MULT_COMPONENTS.map((c) => ({ ...c })),
        energyRegen: XIN_ECHO_HEART_ENERGY,
      },
      summaryNote: '心装配·五段+终结',
    };
  }
  return null;
}


function applyMainEchoEffect(member, effect, specimen) {
  if (!effect || effect.kind === 'note') return;
  if (!mainEchoEffectAllowedForMember(member, effect)) return;
  if (effect.kind === 'skillMult') {
    if (!member.skillPalette) member.skillPalette = [];
    const paletteId = resolveMainEchoSkillPaletteId(effect);
    let item = member.skillPalette.find((p) => p.id === paletteId);
    const baseName = specimen?.name ? `声骸·${specimen.name}` : '声骸技能';
    const name = effect.note ? `${baseName}（${effect.note}）` : baseName;
    const scaleStat = resolveEchoSkillScaleStat(effect);
    const damageType = effect.damageType || '声骸';
    // 声骸主位多段倍率：baseMult 为总倍率（各段 rate×count 之和），multComponents 供「倍率拆分」还原成 Hit
    const comps =
      typeof normalizeMultComponents === 'function'
        ? normalizeMultComponents(effect.multComponents)
        : [];
    const baseMult = comps.length
      ? comps.reduce((s, c) => s + c.rate * c.count, 0)
      : Number(effect.value) || 0;
    const payload = {
      id: paletteId,
      name,
      damageType,
      damageElement: inferEchoSkillElement(specimen, effect),
      baseMult,
      multComponents: comps.length ? comps : undefined,
      energyRegen: Number(effect.energyRegen) || 0,
      scaleStat,
      echoMainGenerated: true,
    };
    const form = resolveMainEchoSkillForm(member, specimen);
    if (form) {
      Object.assign(payload, form.skill);
      if (form.nameNote) payload.name = `${baseName}（${form.nameNote}）`;
      // 保持既有长按技能的编号、插入顺序及清理路径。
      if (form.extraSkill) {
        const extraItem = {
          ...payload,
          id: ECHO_MAIN_SKILL_PREFIX + form.extraSkill.key,
          name: `${baseName}（${form.extraSkill.nameNote}）`,
        };
        const existingExtra = member.skillPalette.find((p) => p.id === extraItem.id);
        if (existingExtra) Object.assign(existingExtra, extraItem);
        else member.skillPalette.push(extraItem);
      }
    }
    if (!item) {
      item = payload;
      member.skillPalette.push(item);
    } else {
      Object.assign(item, payload);
    }
    syncEchoPaletteSkillToAxis(member, item, specimen);
    return;
  }
  if (effect.kind === 'panel') {
    const stat = String(effect.stat || '');
    if (
      stat === 'energyRegenPct' ||
      stat === 'energyRegen' ||
      (stat === 'displayOnly' && /共鸣效率/.test(String(effect.label || '')))
    ) {
      upsertEchoSetPanelSource(
        member.char,
        'energyRegenPct',
        `${ECHO_MAIN_PANEL_STAT_PREFIX}energyRegenPct`,
        '主位·共鸣效率',
        effect.value
      );
    } else if (stat === 'critRate') {
      upsertEchoSetPanelSource(
        member.char,
        'critRate',
        `${ECHO_MAIN_PANEL_STAT_PREFIX}critRate`,
        '主位·暴击率',
        effect.value
      );
    } else if (stat === 'atkPercent') {
      upsertEchoSetPanelSource(
        member.char,
        'atkPercent',
        `${ECHO_MAIN_PANEL_STAT_PREFIX}atkPercent`,
        '主位·攻击%',
        effect.value
      );
    } else if (stat === 'hpPercent') {
      upsertEchoSetPanelSource(
        member.char,
        'hpPercent',
        `${ECHO_MAIN_PANEL_STAT_PREFIX}hpPercent`,
        '主位·生命%',
        effect.value
      );
    } else if (stat === 'defPercent') {
      upsertEchoSetPanelSource(
        member.char,
        'defPercent',
        `${ECHO_MAIN_PANEL_STAT_PREFIX}defPercent`,
        '主位·防御%',
        effect.value
      );
    }
    return;
  }
  if (effect.kind === 'panelAttr' && effect.element) {
    const cond = Array.isArray(effect.onlyCharacterIds) && effect.onlyCharacterIds.length;
    const sourceId = cond
      ? `${ECHO_MAIN_PANEL_ATTR_PREFIX}${effect.element}_bonus`
      : `${ECHO_MAIN_PANEL_ATTR_PREFIX}${effect.element}`;
    const label = cond
      ? `主位·${effect.element}伤（专属）`
      : `主位·${effect.element}伤`;
    upsertEchoSetPanelSource(member.char, 'attrBonus', sourceId, label, effect.value);
    return;
  }
  if (effect.kind === 'panelType' && effect.damageType) {
    upsertEchoSetPanelSource(
      member.char,
      'typeDmgBonus',
      `${ECHO_MAIN_PANEL_TYPE_PREFIX}${effect.damageType}`,
      `主位·${effect.damageType}伤加成`,
      effect.value
    );
    return;
  }
  if (effect.kind === 'panelBonus') {
    // 显式来源后缀保留旧配置中的勾选与覆盖；分类只负责计算范围。
    const buffKey = effect.sourceKey || [effect.category || 'bonus', effect.damageType || effect.element || ''].filter(Boolean).join('_');
    const buffId = `${ECHO_MAIN_BUFF_PREFIX}${specimen?.id || 'x'}_${buffKey}`;
    const category = effect.category || 'generalBonus';
    const specimenId = String(specimen?.id || '');
    const mainGameText = specimenId ? getEchoSpecimenGameText(specimenId) : '';
    member.buffs.push(
      normalizeBuff({
        id: buffId,
        category,
        name: withManagedBuffSourcePrefix(buildEchoMainSlotLabel(specimen), '【声骸】'),
        mode: 'fixed',
        value: Number(effect.value) || 0,
        element:
          category === 'elementBonus' || category === 'elementDeep' ? effect.element || '' : '',
        damageType: effect.damageType || '',
        echoMainGenerated: true,
        echoMainSourceId: specimenId,
        ...(mainGameText ? { gameText: mainGameText } : {}),
      })
    );
    if (member.globalBuffActive[buffId] === undefined) member.globalBuffActive[buffId] = false;
    return;
  }
  if (effect.kind === 'teamBuff') {
    if (!member._pendingEchoTeamBuffs) member._pendingEchoTeamBuffs = [];
    member._pendingEchoTeamBuffs.push({ effect, specimen });
  }
}

function syncEchoMainTeamBuffs() {
  ensureEchoRuntimeDbsFromCache();
  if (!echoSpecimensDb?.specimens?.length) return;
  ensureTeamSharedBuffs();
  const shared = state.team.sharedBuffs;
  shared.buffs = shared.buffs.filter((b) => !isEchoMainTeamBuff(b));
  state.members.forEach((m) => delete m._pendingEchoTeamBuffs);

  state.members.forEach((member, memberIndex) => {
    const cfg = ensureEchoConfig(member);
    const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
    const mainSlot = cfg.slots[mainIdx];
    if (!mainSlot?.echoId) return;
    const specimen = findEchoSpecimen(mainSlot.echoId);
    if (!specimen?.mainEffects) return;
    normalizeMainEffects(specimen.mainEffects).forEach((fx) => {
      if (fx.kind !== 'teamBuff') return;
      const text = `${fx.name || ''}${fx.label || ''}`;
      let category =
        fx.category || (fx.element ? 'elementBonus' : fx.damageType ? 'typeBonus' : 'generalBonus');
      if (/谐度破坏增幅/.test(text) && !echoEffectIsHarmonyDrivenAttack(text, category)) {
        category = 'harmonyBreakAmp';
      }
      if (echoEffectIsHarmonyDrivenAttack(text, category)) {
        category = fx.category === 'typeAttack' ? 'typeAttack' : 'generalAttack';
      }
      const mode = fx.mode === 'stack' ? 'stack' : 'fixed';
      const buffKey = buildEchoMainTeamBuffKey(fx, category, mode);
      const teamId = `${ECHO_MAIN_TEAM_BUFF_PREFIX}${memberIndex}_${mainSlot.echoId}_${buffKey}`;
      if (shared.buffs.some((b) => b.id === teamId)) return;
      const specimenId = String(specimen?.id || mainSlot.echoId || '');
      const mainGameText = specimenId ? getEchoSpecimenGameText(specimenId) : '';
      shared.buffs.push(
        normalizeBuff({
          id: teamId,
          category,
          name: withManagedBuffSourcePrefix(buildEchoMainSlotLabel(specimen), '【声骸】'),
          mode,
          value: Number(fx.value) || 0,
          perStack: Number(fx.perStack) || 0,
          maxStacks: Math.max(1, Number(fx.maxStacks) || 5),
          damageType: fx.damageType === '全属性' ? '' : fx.damageType || '',
          element:
            category === 'elementBonus' || category === 'elementDeep' ? fx.element || '' : '',
          echoMainTeamBuff: true,
          echoMainSourceMember: memberIndex,
          echoMainSourceId: specimenId,
          sourceMemberIndex: memberIndex,
          ...(mainGameText ? { gameText: mainGameText } : {}),
        })
      );
      invalidateSharedBuffsCache();
      if (shared.globalBuffActive[teamId] === undefined) shared.globalBuffActive[teamId] = true;
    });
  });
  syncTeamBuffsToMembers();
}

/** 同步声骸 Buff 前尽量从本机缓存灌库；库未就绪时禁止拆掉已有 Buff（否则会 purge 叠层） */
function ensureEchoRuntimeDbsFromCache() {
  if (!echoSetsDb?.sets?.length) {
    const cached = loadEchoSetsDbFromCache();
    if (cached) setEchoSetsDb(cached);
  }
  if (!echoSpecimensDb?.specimens?.length) {
    const cached = loadEchoSpecimensDbFromCache();
    if (cached) setEchoSpecimensDb(cached);
  }
  return !!(echoSetsDb?.sets?.length);
}

/**
 * 声骸套装/主位 Buff 软重建。
 * 原则：稳定 id 的运行时状态（globalBuffActive / globalBuffStacks / 阶段·技能覆盖）
 * 只随「卸下套装」purge；换定义时绝不 capture→restore 覆盖（尤其禁止用技能层数盖全局）。
 */
function syncEchoSetToMember(member) {
  ensureMemberUiState(member, { light: true });
  if (!ensureEchoRuntimeDbsFromCache()) return;
  if (!member.globalBuffStacks) member.globalBuffStacks = {};
  if (!member.globalBuffActive) member.globalBuffActive = {};

  const specimensReady = !!(echoSpecimensDb?.specimens?.length);
  const softRemovedIds = new Set([...removeEchoSetGeneratedBuffs(member, { soft: true })]);
  if (specimensReady) {
    removeEchoMainGeneratedBuffs(member, { soft: true }).forEach((id) => softRemovedIds.add(id));
  }
  removeEchoSetGeneratedSkills(member);
  clearEchoSetPanelSources(member.char);

  const cfg = ensureEchoConfig(member);
  syncSetLoadoutToSlots(cfg);
  const counts = countEchoSetPieces(cfg);
  Object.entries(counts).forEach(([setId, n]) => {
    const def = findEchoSetDef(setId);
    if (!def?.bonuses) return;
    getEchoSetActiveTiers(def, n).forEach((tier) => {
      const tierData = def.bonuses[String(tier)];
      if (!tierData) return;
      normalizeMainEffects(tierData.effects).forEach((fx) =>
        applyParsedSetEffect(member, fx, setId, tier)
      );
    });
  });

  const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
  const mainSlot = cfg.slots[mainIdx];
  if (specimensReady) {
    removeEchoMainGeneratedSkills(member);
    if (mainSlot?.echoId) {
      const specimen = findEchoSpecimen(mainSlot.echoId);
      const canApply =
        !mainSlot.activeSetId || isMainEchoValidForSet(mainSlot.echoId, mainSlot.activeSetId);
      if (canApply && specimen?.mainEffects) {
        (specimen.mainEffects || []).forEach((fx) => applyMainEchoEffect(member, fx, specimen));
      }
    }
  }

  // 仅清理真正卸下的声骸 Buff；仍存在的 id 保留勾选/叠层/对照表覆盖
  softRemovedIds.forEach((id) => {
    if ((member.buffs || []).some((b) => b.id === id)) return;
    if (!specimensReady && String(id).startsWith(ECHO_MAIN_BUFF_PREFIX)) return;
    purgeMemberBuffReferences(member, id);
  });
}

function syncEchoLoadout(member) {
  syncEchoToCharacterPanel(member);
  // 套装库未就绪时只同步面板，勿拆声骸 Buff / 全队声骸条目（启动竞态会清空叠层）
  if (!ensureEchoRuntimeDbsFromCache()) return;
  syncEchoSetToMember(member);
  syncEchoSetTeamBuffs();
  if (echoSpecimensDb?.specimens?.length) syncEchoMainTeamBuffs();
  if (echoSpecimensDb?.specimens?.length) backfillAxisEchoEnergy(member);
}

/** 旧存档声骸轴条目回能补全：数据补齐 energyRegen 后，已放置的声骸技能条目仍可能为 0。
 *  只按条目当前倍率在声骸 skillMult 变体里匹配回能（精确单条 → 子集求和 → 整条等分），
 *  只补 energyRegen，绝不动倍率/元素/名称——与拆分防改写同一红线（不静默改用户数值）。 */
function resolveEchoEnergyForMult(entryMult, variants) {
  if (!(entryMult > 0) || !Array.isArray(variants) || !variants.length) return null;
  const eps = 1e-6;
  for (const v of variants) {
    if (Math.abs((Number(v.value) || 0) - entryMult) < eps) return Number(v.energy) || 0;
  }
  // 子集求和：旧合并模型（如燎照之骑 808 = 242.4+282.8+282.8）→ 对应变体回能合计
  let best = null;
  const n = Math.min(variants.length, 6);
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += Number(variants[i].value) || 0;
        energy += Number(variants[i].energy) || 0;
      }
    }
    if (Math.abs(sum - entryMult) < eps) {
      best = best === null ? energy : Math.max(best, energy);
    }
  }
  if (best !== null) return Math.round(best * 100) / 100;
  // 整条等分回退：如旧角鳄单次 268.2 = 新合并条 536.4/2 → 7.44/2
  for (const v of variants) {
    const vv = Number(v.value) || 0;
    const ev = Number(v.energy) || 0;
    if (vv > 0 && ev > 0 && vv / entryMult > 1 && Math.abs(vv / entryMult - Math.round(vv / entryMult)) < eps) {
      const k = Math.round(vv / entryMult);
      if (k >= 2 && k <= 6) return Math.round((ev / k) * 100) / 100;
    }
  }
  return null;
}

function backfillAxisEchoEnergy(member) {
  if (!member || !Array.isArray(echoSpecimensDb?.specimens)) return;
  const byBase = new Map();
  echoSpecimensDb.specimens.forEach((s) => {
    const base = '声骸·' + String(s.name || '');
    if (!byBase.has(base)) byBase.set(base, s);
  });
  const patch = (entry) => {
    if (!entry || typeof entry?.name !== 'string' || !entry.name.startsWith('声骸·')) return;
    const mult = Number(entry.baseMult);
    if (!(mult > 0)) return;
    const baseName = String(entry.name).replace(/（[^）]*）$/, '').replace(/\([^)]*\)$/, '');
    const specimen = byBase.get(baseName);
    if (!specimen) return;
    const variants = (specimen.mainEffects || [])
      .filter((e) => e?.kind === 'skillMult')
      .map((e) => ({ value: Number(e.value) || 0, energy: Number(e.energyRegen) || 0 }));
    if (!variants.length) return;
    const energy = resolveEchoEnergyForMult(mult, variants);
    if (energy === null) return;
    if (!(Number(entry.energyRegen) > 0)) entry.energyRegen = energy;
  };
  const patchPhases = (phases) => {
    (phases || []).forEach((phase) => (phase.skills || []).forEach(patch));
  };
  const patchAxis = (axis) => {
    if (!axis?.base) return;
    (axis.base.rotationCatalog || []).forEach(patch);
    patchPhases(axis.base.phases);
    Object.values(axis.patches || {}).forEach((pd) => {
      (pd?.ops || []).forEach((op) => {
        if (op?.item && op.scope === 'phaseSkill') patch(op.item);
      });
    });
  };
  (member.rotationCatalog || []).forEach(patch);
  patchPhases(member.phases);
  patchAxis(member.resonanceAxis);
  (member.cycleConfig?.rounds || []).forEach((round) => {
    (round.rotationCatalog || []).forEach(patch);
    patchPhases(round.phases);
    patchAxis(round.resonanceAxis);
  });
}

function describeEchoEffectRouting(effect, specimen, member) {
  if (!effect) return { text: '—', applied: false, pending: true };
  if (effect.kind === 'note') {
    return {
      text: effect.needsReview ? '未识别（未写入面板/Buff）' : effect.text || '说明',
      applied: false,
      pending: !!effect.needsReview,
    };
  }
  if (effect.kind === 'panel') {
    let text = '角色面板';
    if (effect.stat === 'attrBonus' && effect.element) text += ` · ${effect.element}伤害 +${effect.value}%`;
    else if (effect.stat === 'typeDmgBonus' && effect.damageType) text += ` · ${effect.damageType}伤害加成 +${effect.value}%`;
    else if (effect.stat === 'critRate') text += ` · 暴击率 +${effect.value}%`;
    else if (effect.stat === 'atkPercent') text += ` · 攻击% +${effect.value}%`;
    else if (effect.stat === 'hpPercent') text += ` · 生命% +${effect.value}%`;
    else if (effect.stat === 'defPercent') text += ` · 防御% +${effect.value}%`;
    else if (effect.stat === 'energyRegenPct' || effect.stat === 'energyRegen')
      text += ` · 共鸣效率 +${effect.value}%`;
    else if (effect.stat === 'displayOnly') text += ` · ${effect.label || '显示项'}（暂不计伤害）`;
    else text += ` · ${effect.stat} +${effect.value}%`;
    return { text, applied: true, pending: false };
  }
  if (effect.kind === 'buff') {
    const catMap = {
      generalAttack: '泛用攻击',
      generalCritRate: '泛用暴击',
      generalCritDmg: '泛用暴伤',
      typeCritRate: '类型暴击',
      elementBonus: '属性增伤',
      elementDeep: '属性加深',
      typeBonus: '类型增伤',
      generalBonus: '泛用增伤',
      generalDeep: '泛用加深',
      typeDeep: '类型加深',
    };
    const catLabel = catMap[effect.category] || 'Buff库';
    const dt = effect.damageType ? ` · ${effect.damageType}` : '';
    const el = effect.element ? ` · ${effect.element}` : '';
    const valText =
      effect.mode === 'stack'
        ? `${Number(effect.perStack) || Number(effect.value) || 0}%/层 · 上限${Number(effect.maxStacks) || 5}层`
        : `+${effect.value}%`;
    return {
      text: `${catLabel} · ${effect.name || effect.label || '加成'} ${valText}${dt}${el}`,
      applied: true,
      pending: false,
    };
  }
  if (effect.kind === 'skillMult') {
    const dt = effect.damageType || '声骸';
    let el = effect.element ? ` · ${effect.element}` : '';
    let note = effect.note ? `（${effect.note}）` : '';
    let value = effect.value;
    const form = resolveMainEchoSkillForm(member, specimen);
    if (form) {
      value = form.skill.baseMult;
      el = ` · ${form.skill.damageElement}`;
      note = `（${form.summaryNote}）`;
    }
    return { text: `技能库 · ${dt} ${value}%${el}${note}`, applied: true, pending: false };
  }
  if (effect.kind === 'panelAttr' && effect.element) {
    const cond =
      Array.isArray(effect.onlyCharacterIds) && effect.onlyCharacterIds.length
        ? '（仅卡提希娅 / 漂泊者·气动）'
        : '';
    return {
      text: `角色面板 · ${effect.element}伤害 +${effect.value}%${cond}`,
      applied: true,
      pending: false,
    };
  }
  if (effect.kind === 'panelType' && effect.damageType) {
    return { text: `角色面板 · ${effect.damageType}伤害加成 +${effect.value}%`, applied: true, pending: false };
  }
  if (effect.kind === 'panelBonus') {
    const catMap = {
      generalAttack: '泛用攻击',
      generalBonus: '泛用增伤',
      elementBonus: '属性增伤',
      elementDeep: '属性加深',
      typeBonus: '类型增伤',
    };
    const catLabel = catMap[effect.category] || 'Buff库';
    return {
      text: `角色Buff · ${catLabel} · ${effect.name || '加成'} +${effect.value}%`,
      applied: true,
      pending: false,
    };
  }
  if (effect.kind === 'teamBuff') {
    const dt = effect.damageType ? ` · ${effect.damageType}` : '';
    const el = effect.element ? ` · ${effect.element}` : '';
    const isHarmony =
      effect.category === 'harmonyBreakAmp' ||
      /谐度破坏增幅/.test(`${effect.name || ''}${effect.label || ''}`);
    const unit = isHarmony ? '点' : '%';
    const valText =
      effect.mode === 'stack'
        ? `${Number(effect.perStack) || Number(effect.value) || 0}${unit}/层 · 上限${Number(effect.maxStacks) || 5}层`
        : `+${effect.value}${unit}`;
    const displayName = specimen?.name ? buildEchoMainSlotLabel(specimen) : effect.name || effect.label || '加成';
    const catHint = isHarmony ? '谐幅' : '';
    return {
      text: `全队Buff${catHint ? ` · ${catHint}` : ''} · ${displayName} ${valText}${dt}${el}`,
      applied: true,
      pending: false,
    };
  }
  return { text: `${effect.kind || '未知'}（未映射）`, applied: false, pending: true };
}

function getActiveEchoSetTierDetails(setId, count, member = getActiveMember()) {
  const def = findEchoSetDef(setId);
  if (!def?.bonuses) return [];
  return getEchoSetActiveTiers(findEchoSetDef(setId), count).map((tier) => {
      const tierData = def.bonuses[String(tier)];
      const effects = normalizeMainEffects(tierData?.effects);
      const desc = tierData.resolved || tierData.desc || '';
      const fxRows =
        effects.length > 0
          ? effects.map((fx) => {
              if (['25', '33'].includes(String(setId)) && tier === 5 && fx.kind === 'teamBuff' && fx.category === 'generalAttack') {
                const value = getEchoSetConvertedAttackValue(member, setId);
                fx = { ...fx, value, label: '队伍中角色攻击提升' + value + '%（当前生效）' };
              }
              const routing = describeEchoEffectRouting(fx, null, member);
              return {
                source: fx.text || fx.label || fx.name || desc,
                ...routing,
              };
            })
          : [{ source: desc, text: '无解析条目', applied: false, pending: true }];
      return { tier, desc, effects: fxRows };
    });
}

function getActiveEchoMainEffectSummary(member) {
  const cfg = ensureEchoConfig(member);
  const items = [];
  (cfg.setLoadout || []).forEach((entry) => {
    if (!entry?.echoId) return;
    const specimen = findEchoSpecimen(entry.echoId);
    if (!specimen?.mainEffects?.length) return;
    const setDef = entry.setId ? findEchoSetDef(entry.setId) : null;
    normalizeMainEffects(specimen.mainEffects).forEach((fx) => {
      if (!mainEchoEffectAllowedForMember(member, fx)) return;
      const routing = describeEchoEffectRouting(fx, specimen, member);
      items.push({
        setName: setDef?.name || '',
        echoName: specimen.name,
        source: fx.label || fx.text || specimen.skillResolved?.split('\n')[0] || specimen.name,
        ...routing,
      });
    });
  });
  return items;
}

function renderEchoActiveEffectLines(effects) {
  return (effects || [])
    .map((fx) => {
      const cls = fx.pending ? 'pending' : fx.applied ? 'applied' : '';
      const route = fx.text ? `→ ${escapeHtml(fx.text)}` : '';
      const source = fx.source && fx.source !== fx.text ? `<div class="echo-set-active-fx">${escapeHtml(fx.source)}</div>` : '';
      return `${source}<div class="echo-set-active-fx ${cls}">${route || escapeHtml(fx.source || '—')}</div>`;
    })
    .join('');
}

function getActiveEchoSetSummary(member) {
  const cfg = ensureEchoConfig(member);
  const counts = countEchoSetPieces(cfg);
  return Object.entries(counts).map(([setId, n]) => {
    const def = findEchoSetDef(setId);
    const tiers = getEchoSetActiveTiers(def, n);
    return {
      setId,
      name: def?.name || setId,
      count: n,
      tiers,
      tierDetails: getActiveEchoSetTierDetails(setId, n, member),
    };
  });
}

function ensureEchoActiveSlot(member) {
  if (member.echoActiveSlot === undefined) member.echoActiveSlot = null;
  if (member.echoExpandedSetEntry === undefined) member.echoExpandedSetEntry = null;
  const slots = member.echoConfig?.slots || [];
  if (member.echoActiveSlot !== null && (!Number.isInteger(member.echoActiveSlot) || member.echoActiveSlot >= slots.length)) {
    member.echoActiveSlot = null;
  }
  if (
    member.echoExpandedSetEntry !== null &&
    (!Number.isInteger(member.echoExpandedSetEntry) ||
      member.echoExpandedSetEntry < 0 ||
      member.echoExpandedSetEntry >= ECHO_SET_LOADOUT_MAX)
  ) {
    member.echoExpandedSetEntry = null;
  }
}

function applyEchoLayout(member, layoutId) {
  const layout = ECHO_LAYOUTS[layoutId];
  if (!layout) return;
  const prev = ensureEchoConfig(member);
  const prevKey = getBuildLayoutKey(prev);
  const layoutChanged = prevKey !== layoutId;
  member.echoConfig = {
    layout: layout.label,
    mainSlotIndex: Number.isInteger(prev.mainSlotIndex) ? prev.mainSlotIndex : getDefaultMainSlotIndex({ slots: layout.costs.map((cost) => createEchoSlot(cost)) }),
    setLoadout: padEchoSetLoadout(prev.setLoadout || defaultEchoSetLoadout()),
    slots: layout.costs.map((cost, i) => {
      const old = prev.slots[i];
      if (!old) return createEchoSlot(cost);
      // 切换 COST 模板时重置主①，保留副词条；cost 变化时同样重置主①
      if (old.cost === cost && !layoutChanged) return normalizeEchoSlot(old);
      return normalizeEchoSlot({
        cost,
        name: old.name || '',
        activeSetId: old.activeSetId || null,
        echoId: old.echoId || null,
        main1: defaultEchoMain1ForCost(cost),
        main1Element: old.main1Element,
        subs: old.subs || [],
      });
    }),
  };
  if (!Number.isInteger(member.echoConfig.mainSlotIndex) || member.echoConfig.mainSlotIndex >= member.echoConfig.slots.length) {
    member.echoConfig.mainSlotIndex = getDefaultMainSlotIndex(member.echoConfig);
  }
  syncSetLoadoutToSlots(member.echoConfig);
  member.echoActiveSlot = null;
  syncEchoLoadout(member);
}

function renderEchoSubAffixOptions(selectedId) {
  return Object.entries(ECHO_SUB_AFFIXES)
    .map(([id, def]) => `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${def.label}</option>`)
    .join('');
}

function renderEchoSubValueOptions(sub) {
  const def = ECHO_SUB_AFFIXES[sub?.id];
  const rolls = getEchoSubRolls(sub?.id);
  const unit = def?.unit || 'percent';
  const current = Number(sub?.value) || 0;
  const parts = [`<option value="0" ${current <= 0 ? 'selected' : ''}>选择数值</option>`];
  if (current > 0 && !rolls.some((r) => echoSubRollEquals(r, current))) {
    parts.push(
      `<option value="${current}" selected>${formatEchoSubRollOption(current, unit)}（自定义）</option>`
    );
  }
  rolls.forEach((r) => {
    parts.push(
      `<option value="${r}" ${echoSubRollEquals(r, current) ? 'selected' : ''}>${formatEchoSubRollOption(r, unit)}</option>`
    );
  });
  return parts.join('');
}

function renderEchoSubDamageTypeOptions(selected) {
  const empty = `<option value="" ${!selected ? 'selected' : ''}>选择类型</option>`;
  return (
    empty +
    ECHO_SUB_TYPE_DAMAGE_TYPES.map(
      (t) => `<option value="${t}" ${selected === t ? 'selected' : ''}>${t}</option>`
    ).join('')
  );
}

function renderEchoSubTemplateOptions(selectedId, member) {
  const empty = `<option value="" ${!selectedId ? 'selected' : ''}>— 词条模板 —</option>`;
  const map = member ? getEchoSubTemplatesForMember(member) : { ...ECHO_SUB_TEMPLATES };
  return (
    empty +
    Object.entries(map)
      .map(
        ([id, tpl]) =>
          `<option value="${id}" ${String(selectedId) === String(id) ? 'selected' : ''}>${tpl.label}</option>`
      )
      .join('')
  );
}

function renderEchoSubTemplateButtons(member) {
  const map = getEchoSubTemplatesForMember(member);
  const tplBtns = Object.entries(map)
    .map(([id, tpl]) => {
      const label = tpl.buttonLabel || tpl.label || id;
      const active = String(member?.echoSubTemplateId || '') === String(id);
      return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-echo-sub-template-btn="${id}">${escapeHtml(label)}</button>`;
    })
    .join('');
  return (
    tplBtns +
    `<button type="button" class="btn sm" data-open-personal-echo-profile title="选择个人主页保存的声骸配置方案，导入词条/套装/主位">个人方案</button>`
  );
}

function applyEchoSubTemplateMain1(slot, main1) {
  if (!slot || !main1) return;
  const options = ECHO_MAIN1_OPTIONS[slot.cost] || [];
  if (!options.some((o) => o.id === main1)) return;
  slot.main1 = main1;
}

function applyEchoSubTemplateMainByCost(cfg, mainByCost) {
  if (!cfg?.slots?.length || !mainByCost || typeof mainByCost !== 'object') return;
  cfg.slots.forEach((slot) => applyEchoSubTemplateMain1(slot, mainByCost[Number(slot.cost)]));
}

function applyEchoSubTemplateMainBySlotIndex(cfg, mainBySlotIndex) {
  if (!cfg?.slots?.length || !mainBySlotIndex || typeof mainBySlotIndex !== 'object') return;
  Object.entries(mainBySlotIndex).forEach(([idx, main1]) => {
    const slot = cfg.slots[Number(idx)];
    applyEchoSubTemplateMain1(slot, main1);
  });
}

function applyEchoSubTemplate(member, templateId) {
  const tpl = resolveEchoSubTemplate(templateId);
  if (!tpl || !member) return false;
  if (!isEchoSubTemplateForMember(tpl, member)) return false;
  if (tpl.layout && ECHO_LAYOUTS[tpl.layout]) {
    applyEchoLayout(member, tpl.layout);
  }
  const cfg = ensureEchoConfig(member);
  applyEchoSubTemplateMainByCost(cfg, tpl.mainByCost);
  applyEchoSubTemplateMainBySlotIndex(cfg, tpl.mainBySlotIndex);
  cfg.slots.forEach((slot, i) => {
    const rows = tpl.slotSubs[i] || [];
    slot.subs = rows
      .map((row) =>
        normalizeEchoSub({
          id: row.id,
          value: row.value,
          damageType: row.damageType || '',
        })
      )
      .filter(Boolean)
      .slice(0, 5);
  });
  // 元素主词条（main_element_dmg）需同步槽位属性，如守岸人 3C=衍射
  if (tpl.mainElementBySlotIndex && typeof tpl.mainElementBySlotIndex === 'object') {
    Object.entries(tpl.mainElementBySlotIndex).forEach(([idx, el]) => {
      const slot = cfg.slots[Number(idx)];
      const elLabel = String(el || '');
      if (slot && ECHO_ELEMENTS.includes(elLabel)) slot.main1Element = elLabel;
    });
  }
  member.echoSubTemplateId = String(templateId);
  return true;
}

function renderEchoMain1Options(slot) {
  const options = ECHO_MAIN1_OPTIONS[slot.cost] || [];
  return options
    .map((o) => `<option value="${o.id}" ${slot.main1 === o.id ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}

function renderEchoElementOptions(selected) {
  return ECHO_ELEMENTS.map((el) => `<option value="${el}" ${el === selected ? 'selected' : ''}>${el}</option>`).join('');
}

function formatEchoSummaryLine(agg, member) {
  const el = getMemberElementLabel(member);
  const parts = [];
  if (agg.atkPercent) parts.push(`攻击+${agg.atkPercent.toFixed(1)}%`);
  if (agg.flatAtk) parts.push(`固定攻+${Math.round(agg.flatAtk)}`);
  if (agg.hpPercent) parts.push(`生命+${agg.hpPercent.toFixed(1)}%`);
  if (agg.flatHp) parts.push(`固定生命+${Math.round(agg.flatHp)}`);
  if (agg.defPercent) parts.push(`防御+${agg.defPercent.toFixed(1)}%`);
  if (agg.flatDef) parts.push(`固定防御+${Math.round(agg.flatDef)}`);
  if (agg.critRate) parts.push(`暴击+${agg.critRate.toFixed(1)}%`);
  if (agg.critDmg) parts.push(`暴伤+${agg.critDmg.toFixed(1)}%`);
  if (agg.energyRegenPct) parts.push(`共鸣效率+${agg.energyRegenPct.toFixed(1)}%`);
  if (el && agg.elementDmgByElement[el]) parts.push(`${el}伤+${agg.elementDmgByElement[el].toFixed(1)}%`);
  Object.entries(agg.typeDmgByType || {}).forEach(([dt, v]) => {
    if (v) parts.push(`${dt}+${Number(v).toFixed(1)}%`);
  });
  return parts.length ? parts.join(' · ') : '暂无计入伤害的声骸属性';
}

function formatEchoMainValue(slot) {
  const disp = resolveEchoMain1Display(slot);
  const v = disp.value;
  if (disp.panelTarget === 'flat_atk' || disp.panelTarget === 'flat_hp' || disp.panelTarget === 'flat_def') return String(Math.round(v));
  return `${v}%`;
}

function renderEchoSlotCard(slot, index) {
  const main1Opt = getEchoMain1Option(slot.cost, slot.main1);
  const showElement = !!main1Opt?.needsElement;
  const main2 = ECHO_MAIN2_FIXED[slot.cost];
  const subs = slot.subs || [];
  const subRows = subs
    .map((sub, si) => {
      const def = ECHO_SUB_AFFIXES[sub.id];
      const needsType = !!def?.needsDamageType;
      const typeSelect = needsType
        ? `<select class="echo-field-select" data-echo-sub-dmgtype="${index}" data-echo-sub-index="${si}" title="伤害类型">${renderEchoSubDamageTypeOptions(sub.damageType)}</select>`
        : '';
      return `
    <div class="echo-sub-row${needsType ? ' has-type' : ''}" data-echo-sub-row="${index}-${si}">
      <span class="tag">副${si + 1}</span>
      <select class="echo-field-select" data-echo-sub-stat="${index}" data-echo-sub-index="${si}">${renderEchoSubAffixOptions(sub.id)}</select>
      ${typeSelect}
      <select class="echo-field-select echo-sub-value" data-echo-sub-value="${index}" data-echo-sub-index="${si}" title="词条档位">${renderEchoSubValueOptions(sub)}</select>
      <button type="button" class="btn sm danger" data-echo-sub-del="${index}" data-echo-sub-index="${si}">删</button>
    </div>`;
    })
    .join('');
  const main2Val = main2 ? (main2.panelTarget === 'flat_atk' || main2.panelTarget === 'flat_hp' || main2.panelTarget === 'flat_def' ? String(main2.value) : `${main2.value}%`) : '—';
  return `
    <div class="echo-slot-card" data-echo-slot="${index}">
      <div class="echo-slot-head">
        <span class="cost-tag">${slot.cost}C</span>
        <input type="text" data-echo-slot-name="${index}" value="${slot.name || ''}" placeholder="声骸名称（可选）" />
      </div>
      <div class="echo-main-row">
        <span class="tag">主①</span>
        <div class="echo-main-fields">
          <select class="echo-field-select" data-echo-main1="${index}">${renderEchoMain1Options(slot)}</select>
          ${showElement ? `<select class="echo-field-select" data-echo-main-element="${index}">${renderEchoElementOptions(slot.main1Element)}</select>` : ''}
          <input class="echo-main-value" type="text" readonly value="${formatEchoMainValue(slot)}" title="主①数值" />
        </div>
      </div>
      <div class="echo-main-row main2-row">
        <span class="tag">主②</span>
        <div class="echo-main-fields">
          <input class="echo-main2-label" type="text" readonly value="${main2?.label || '—'}" />
          <input class="echo-main-value" type="text" readonly value="${main2Val}" />
        </div>
      </div>
      <div class="echo-sub-head">副词条（最多 5 条）</div>
      ${subRows}
      <button type="button" class="btn sm" data-echo-sub-add="${index}" ${subs.length >= 5 ? 'disabled' : ''}>+ 添加副词条</button>
    </div>`;
}

function renderEchoSlotTabs(member, config) {
  const active = member.echoActiveSlot;
  const mainIdx = Number.isInteger(config.mainSlotIndex) ? config.mainSlotIndex : 0;
  return config.slots
    .map((slot, i) => {
      const activeClass = active === i ? ' active' : '';
      const mainMark = i === mainIdx ? '★' : '';
      const setDef = slot.activeSetId ? findEchoSetDef(slot.activeSetId) : null;
      const setMark = setDef ? ` · ${String(setDef.name).slice(0, 2)}` : '';
      const title = slot.name ? ` title="${slot.name}"` : setDef ? ` title="${setDef.name}"` : '';
      return `<button type="button" class="echo-slot-tab${activeClass}" data-echo-slot-tab="${i}"${title}>${slot.cost}C${mainMark}${setMark}</button>`;
    })
    .join('');
}

function renderEchoSetEntrySpecimenOptions(member, entry) {
  const list = getSpecimensForSetEntry(member, entry.setId);
  const empty = `<option value="">— 主位声骸（可选）—</option>`;
  if (entry.setId && !list.length) {
    const hasManual = !!(echoSetMainMapDb?.sets && echoSetMainMapDb.sets[String(entry.setId)]?.length);
    const hint = hasManual ? '该套装暂无可用主位声骸' : '该套装暂无白名单主位';
    return empty + `<option value="" disabled>${hint}</option>`;
  }
  return (
    empty +
    list
      .map(
        (sp) =>
          `<option value="${escapeHtml(String(sp.id))}" ${String(sp.id) === String(entry.echoId) ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`
      )
      .join('')
  );
}

function renderEchoSetTierHints(entry) {
  if (!entry?.setId) return '';
  const def = findEchoSetDef(entry.setId);
  if (!def?.bonuses) return '';
  const count = Number(entry.count) || 0;
  return ECHO_SET_BONUS_TIERS.filter((tier) => def.bonuses[String(tier)]).map((tier) => {
      const active = count >= tier;
      const tierData = def.bonuses[String(tier)];
      const desc = tierData.resolved || tierData.desc || '';
      return `<div class="${active ? 'active-tier' : ''}">${tier}件${active ? ' ✓' : ''}：${escapeHtml(desc)}</div>`;
    })
    .join('');
}

function renderEchoSetLoadoutEntry(member, entryIndex) {
  const cfg = member.echoConfig;
  const entry = cfg.setLoadout[entryIndex] || { setId: null, count: 0, echoId: null };
  const def = entry.setId ? findEchoSetDef(entry.setId) : null;
  const expanded = member.echoExpandedSetEntry === entryIndex;
  const setName =
    entryIndex > 0 && !def ? '不选' : def?.name || '点击选择套装';
  const nameClass = def ? '' : ' empty';
  const loadoutTotal = getEchoSetLoadoutTotal(cfg.setLoadout);
  const otherCount = cfg.setLoadout.reduce(
    (sum, row, idx) => (idx === entryIndex ? sum : sum + (Number(row.count) || 0)),
    0
  );
  const maxCount = Math.max(0, 5 - otherCount);
  const usedSetIds = new Set(
    cfg.setLoadout
      .map((row, idx) => (idx !== entryIndex && row.setId ? String(row.setId) : null))
      .filter(Boolean)
  );
  const emptyPickHtml =
    entryIndex > 0
      ? `<button type="button" class="echo-set-pick-btn empty${
          !entry.setId ? ' active' : ''
        }" data-echo-set-pick="${entryIndex}" data-set-id="">
          <span class="echo-set-icon placeholder">—</span>
          <span>不选</span>
        </button>`
      : '';
  const expandedBody = expanded
    ? `<div class="echo-set-entry-body">
      <div class="hint">选择套装（当前已分配 ${loadoutTotal}/5 个声骸槽位）</div>
      <div class="echo-set-picker">
        ${emptyPickHtml}
        ${getEchoSetsSorted()
          .filter((setDef) => !usedSetIds.has(String(setDef.id)))
          .map(
            (setDef) =>
              `<button type="button" class="echo-set-pick-btn${
                String(setDef.id) === String(entry.setId) ? ' active' : ''
              }" data-echo-set-pick="${entryIndex}" data-set-id="${escapeHtml(String(setDef.id))}">
                ${renderEchoSetIconHtml(setDef, 'echo-set-icon')}
                <span>${escapeHtml(setDef.name)}</span>
              </button>`
          )
          .join('')}
      </div>
      ${
        entry.setId
          ? `<div class="echo-set-entry-main echo-set-row">
        <label class="hint">主位声骸</label>
        <select class="echo-field-select" data-echo-set-entry-echo="${entryIndex}">${renderEchoSetEntrySpecimenOptions(member, entry)}</select>
      </div>
      <div class="echo-set-tier-hints">${renderEchoSetTierHints(entry)}</div>`
          : ''
      }
    </div>`
    : '';
  return `
    <div class="echo-set-entry${expanded ? ' expanded' : ''}">
      <div class="echo-set-entry-head" data-echo-set-entry-toggle="${entryIndex}">
        <span class="echo-set-entry-label">套装 ${entryIndex + 1}</span>
        ${renderEchoSetIconHtml(def, 'echo-set-icon')}
        <span class="echo-set-name${nameClass}">${escapeHtml(setName)}</span>
        <label class="echo-set-count-wrap" data-echo-set-count-wrap="${entryIndex}">
          数量
          <input type="number" min="0" max="${maxCount}" step="1" data-echo-set-count="${entryIndex}" value="${entry.count || 0}"${
            entry.setId ? '' : ' disabled'
          } />
        </label>
      </div>
      ${expandedBody}
    </div>`;
}

function renderEchoSetLoadoutPanel(member) {
  return `
    <div class="echo-set-loadout">
      <div class="echo-set-loadout-head">
        <strong>套装配置</strong>
        <span class="hint">最多 3 套；先选套装再填数量（如 5 件触发 2 件 + 5 件效果）</span>
      </div>
      ${Array.from({ length: ECHO_SET_LOADOUT_MAX }, (_, i) => renderEchoSetLoadoutEntry(member, i)).join('')}
    </div>`;
}

function applyBuildMainEcho(member, echoId) {
  const cfg = ensureEchoConfig(member);
  cfg.mainSlotIndex = getDefaultMainSlotIndex(cfg);
  cfg.setLoadout = padEchoSetLoadout(cfg.setLoadout);
  cfg.setLoadout.forEach((entry) => {
    entry.echoId = null;
  });
  if (echoId) {
    const preferred = cfg.setLoadout.map((e) => e.setId).filter(Boolean);
    let setId = resolveMainEchoPrimarySetId(echoId, preferred);
    if (!setId) setId = resolveMainEchoPrimarySetId(echoId, []);
    if (setId) {
      let entry = cfg.setLoadout.find((e) => e.setId === setId);
      if (!entry) {
        entry = cfg.setLoadout.find((e) => !e.setId);
        if (entry) entry.setId = setId;
      }
      if (entry) {
        entry.echoId = String(echoId);
        if (entry.count < 1) entry.count = 1;
        cfg.setLoadout = clampEchoSetLoadoutCounts(cfg.setLoadout);
      }
    }
  }
  syncSetLoadoutToSlots(cfg);
  const main = cfg.slots[cfg.mainSlotIndex];
  if (main && echoId) {
    const sp = findEchoSpecimen(echoId);
    if (sp?.name) main.name = sp.name;
  }
  syncEchoLoadout(member);
  state.buildModal = null;
  refreshEchoUiAfterChange(member);
}

function getBuildLayoutKey(config) {
  const label = config?.layout || '43311';
  return Object.keys(ECHO_LAYOUTS).find((k) => ECHO_LAYOUTS[k].label === label) || '43311';
}

function getBuildSlotColumnIndices(config) {
  const slots = config?.slots || [];
  const left = [];
  const mid = [];
  slots.forEach((slot, i) => {
    if (Number(slot.cost) === 1) mid.push(i);
    else left.push(i);
  });
  return { left, mid };
}

function renderBuildSlotCard(member, slot, index) {
  const cfg = member.echoConfig;
  const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
  const isMain = index === mainIdx;
  const setDef = slot.activeSetId ? findEchoSetDef(slot.activeSetId) : null;
  const specimen = slot.echoId ? findEchoSpecimen(slot.echoId) : null;
  // 非主位/标本库未收录：回退到本地声骸目录图标（含按名字反查）
  let localEchoId = slot.echoId ? String(slot.echoId) : '';
  if (!localEchoId && slot.name && typeof window !== 'undefined' && window.ECHO_ECHO_BY_NAME) {
    try {
      const hit = window.ECHO_ECHO_BY_NAME[String(slot.name).replace(/\s+/g, '').toLowerCase()];
      if (hit) localEchoId = String(hit.id);
    } catch (e) {
      /* ignore */
    }
  }
  const showElement = (ECHO_MAIN1_OPTIONS[slot.cost] || []).some(
    (o) => o.id === slot.main1 && o.needsElement
  );
  const subs = slot.subs || [];
  const subRows = subs
    .map((sub, si) => {
      const affix = ECHO_SUB_AFFIXES[sub.id];
      const needsType = !!affix?.needsDamageType;
      const target = String(affix?.panelTarget || '');
      const tipClass = needsType
        ? ' tip-type'
        : target.includes('crit')
          ? ' tip-crit'
          : target.includes('atk')
            ? ' tip-atk'
            : target.includes('hp')
              ? ' tip-hp'
              : ' tip-neutral';
      const typeSelect = needsType
        ? `<select class="echo-field-select" data-echo-sub-dmgtype="${index}" data-echo-sub-index="${si}" title="伤害类型">${renderEchoSubDamageTypeOptions(sub.damageType)}</select>`
        : '';
      return `
    <div class="echo-sub-row${needsType ? ' has-type' : ''}${tipClass}" data-echo-sub-row="${index}-${si}">
      <span class="echo-sub-tip" aria-hidden="true"></span>
      <span class="echo-row-label">副${si + 1}：</span>
      <div class="echo-row-fields">
        <select class="echo-field-select" data-echo-sub-stat="${index}" data-echo-sub-index="${si}">${renderEchoSubAffixOptions(sub.id)}</select>
        ${typeSelect}
        <select class="echo-field-select echo-sub-value" data-echo-sub-value="${index}" data-echo-sub-index="${si}" title="词条档位">${renderEchoSubValueOptions(sub)}</select>
        <button type="button" class="btn sm setup-icon-btn echo-sub-del" data-echo-sub-del="${index}" data-echo-sub-index="${si}" title="删除">×</button>
      </div>
    </div>`;
    })
    .join('');
  const iconUrl = specimen?.icon
    ? nanokaAssetUrl(specimen.icon)
    : localEchoId
      ? `assets/echoes-thumb/${encodeURIComponent(localEchoId)}.png`
      : '';
  let catEcho = null;
  if (localEchoId && typeof window !== 'undefined' && window.ECHO_ECHO_BY_ID) {
    try {
      catEcho = window.ECHO_ECHO_BY_ID[localEchoId] || null;
    } catch (e) {
      catEcho = null;
    }
  }
  // 名称优先：声骸名（标本库 → 目录 → 槽位名），都为空才落到套装名
  const echoName = specimen?.name || (catEcho && catEcho.name) || slot.name || '';
  const titleName = isMain
    ? echoName
      ? `主位：${echoName}`
      : '未选择主位'
    : echoName || setDef?.name || '未选择声骸';
  const identityTag = isMain ? 'button' : 'div';
  const identityAttrs = isMain
    ? ' type="button" data-build-open-modal="mainEcho" title="点击选择主位声骸"'
    : ` title="${echoName ? escapeHtml(echoName) : '声骸槽'}"`;
  return `
    <div class="build-slot-card${isMain ? ' is-main' : ''}" data-echo-slot="${index}">
      <${identityTag} class="build-slot-identity"${identityAttrs}>
        <span class="build-slot-visual">
          ${
            iconUrl
              ? `<img src="${iconUrl}" alt="" loading="lazy"${specimen?.icon || !localEchoId ? '' : ` onerror="this.onerror=null;this.src='assets/echoes/${encodeURIComponent(localEchoId)}.png'"`} />`
              : `<span class="build-slot-visual-ph">${isMain ? '+' : slot.cost + 'C'}</span>`
          }
        </span>
        <span class="build-slot-meta">
          <span class="build-slot-title-row">
            <strong class="build-slot-visual-name">${escapeHtml(titleName)}</strong>
            ${isMain ? '<span class="build-slot-main-badge">当前主位</span>' : ''}
          </span>
          <span class="build-slot-meta-line">cost：${slot.cost}C</span>
          <span class="build-slot-meta-line build-slot-set${setDef ? '' : ' empty'}">套装：${escapeHtml(setDef?.name || '未选择套装')}</span>
        </span>
      </${identityTag}>
      <div class="echo-main-row echo-main-card">
        <span class="echo-row-label">主词条：</span>
        <div class="echo-row-fields echo-main-fields">
          <select class="echo-field-select" data-echo-main1="${index}">${renderEchoMain1Options(slot)}</select>
          ${showElement ? `<select class="echo-field-select" data-echo-main-element="${index}">${renderEchoElementOptions(slot.main1Element)}</select>` : ''}
          <input class="echo-main-value" type="text" readonly value="${formatEchoMainValue(slot)}" title="主词条数值" />
        </div>
      </div>
      <div class="echo-sub-block">
        <div class="echo-sub-divider" aria-hidden="true"></div>
        ${subRows || '<div class="hint echo-sub-empty">暂无副词条</div>'}
        <button type="button" class="btn sm setup-add-sub" data-echo-sub-add="${index}" ${subs.length >= 5 ? 'disabled' : ''}>+ 添加副词条</button>
      </div>
      <div class="build-slot-foot">
        <button type="button" class="btn sm${isMain ? ' primary' : ''}" data-echo-main-slot="${index}">${isMain ? '当前主位' : '设为主位'}</button>
      </div>
    </div>`;
}

function renderBuildSetRows(member) {
  const cfg = ensureEchoConfig(member);
  const rows = cfg.setLoadout
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => entry.setId);
  const rowHtml = rows
    .map(({ entry, entryIndex }) => {
      const def = findEchoSetDef(entry.setId);
      const otherCount = cfg.setLoadout.reduce(
        (sum, row, idx) => (idx === entryIndex ? sum : sum + (Number(row.count) || 0)),
        0
      );
      const maxCount = Math.max(0, 5 - otherCount);
      return `
      <div class="build-set-row">
        <button type="button" class="build-set-pick" data-build-open-modal="setPick:${entryIndex}" title="更换套装">
          ${renderEchoSetIconHtml(def, 'echo-set-icon')}
          <span>${escapeHtml(def?.name || '选择套装')}</span>
        </button>
        <span class="echo-set-count-label">数量</span>
        <input class="echo-set-count-input" type="number" min="0" max="${maxCount}" step="1" data-echo-set-count="${entryIndex}" value="${entry.count || 0}" />
        <button type="button" class="btn sm danger setup-icon-btn" data-echo-set-pick="${entryIndex}" data-set-id="" title="移除套装">×</button>
      </div>`;
    })
    .join('');
  const canAdd = cfg.setLoadout.some((e) => !e.setId);
  return `
    <div class="build-set-rows">
      ${rowHtml}
      ${
        canAdd
          ? `<button type="button" class="btn sm setup-add-set" data-build-add-set><span class="setup-add-set-plus">+</span> 选择套装</button>`
          : '<span class="hint">已达 3 套上限</span>'
      }
    </div>`;
}

function renderBuildMainEchoPicker(member) {
  const cfg = ensureEchoConfig(member);
  const setIds = cfg.setLoadout.map((e) => e.setId).filter(Boolean);
  const seen = new Set();
  const list = [];
  const pushSpecimens = (setId) => {
    getSpecimensForSetEntry(member, setId).forEach((sp) => {
      if (seen.has(String(sp.id))) return;
      seen.add(String(sp.id));
      list.push(sp);
    });
  };
  if (setIds.length) setIds.forEach(pushSpecimens);
  else {
    getEchoSetsSorted().forEach((s) => pushSpecimens(s.id));
  }
  const main = getMainEchoFromLoadout(cfg);
  const cards = list.length
    ? list
        .map((sp) => {
          const active = main && String(main.echoId) === String(sp.id) ? ' active' : '';
          const iconUrl = sp.icon ? nanokaAssetUrl(sp.icon) : '';
          return `<button type="button" class="build-echo-pick-btn${active}" data-build-pick-main-echo="${escapeHtml(String(sp.id))}" title="${escapeHtml(sp.name)}">
            <span class="build-echo-pick-icon">${iconUrl ? `<img src="${iconUrl}" alt="" loading="lazy" />` : '<span>声</span>'}</span>
            <span class="build-echo-pick-name">${escapeHtml(sp.name)}</span>
          </button>`;
        })
        .join('')
    : '<span class="hint">请先选择套装，或确认主位白名单已加载</span>';
  return `
    <div class="build-echo-picker">
      <button type="button" class="btn sm" data-build-pick-main-echo="" style="margin-bottom:0.5rem">清除主位</button>
      <div class="build-echo-pick-grid">${cards}</div>
    </div>`;
}

function getEchoSetCardSummary(setDef) {
  const bonuses = setDef?.bonuses || {};
  const tiers = Object.keys(bonuses).sort((a, b) => Number(a) - Number(b));
  for (const tier of tiers) {
    const block = bonuses[tier];
    let text = String(block?.resolved || block?.desc || '').trim();
    if (!text) {
      const effects = normalizeMainEffects(block?.effects);
      const fx = effects[0];
      if (fx) text = String(fx.label || fx.text || fx.name || '').trim();
    }
    if (!text) continue;
    const short = text.split(/[\n；;]/)[0].trim();
    return short.length > 36 ? `${short.slice(0, 36)}…` : short;
  }
  return '套装效果';
}

function renderBuildSetPicker(member, entryIndex) {
  const cfg = ensureEchoConfig(member);
  const entry = cfg.setLoadout[entryIndex] || { setId: null };
  const usedSetIds = new Set(
    cfg.setLoadout
      .map((row, idx) => (idx !== entryIndex && row.setId ? String(row.setId) : null))
      .filter(Boolean)
  );
  const query = String(state.echoSetPickQuery || '').trim().toLowerCase();
  const newestFirst = !!state.echoSetPickNewestFirst;
  let sets = getEchoSetsSorted().filter((setDef) => !usedSetIds.has(String(setDef.id)));
  if (newestFirst) sets = sets.slice().reverse();
  const filtered = query
    ? sets.filter((setDef) => {
        const name = String(setDef.name || '').toLowerCase();
        const summary = getEchoSetCardSummary(setDef).toLowerCase();
        return name.includes(query) || summary.includes(query) || !!window.__WC.localePreview?.matchesSearch(setDef.name, query);
      })
    : sets;

  const emptyCard =
    entryIndex > 0
      ? `<button type="button" class="esp-card${!entry.setId ? ' is-selected' : ''}" data-echo-set-pick="${entryIndex}" data-set-id="" data-esp-name="不选" data-esp-summary="">
          ${!entry.setId ? '<span class="esp-check" aria-hidden="true">✓</span>' : ''}
          <span class="esp-card-icon placeholder" aria-hidden="true">—</span>
          <span class="esp-card-name">不选</span>
        </button>`
      : '';

  const cards = filtered
    .map((setDef) => {
      const selected = String(setDef.id) === String(entry.setId);
      const summary = getEchoSetCardSummary(setDef);
      return `<button type="button" class="esp-card${selected ? ' is-selected' : ''}" data-echo-set-pick="${entryIndex}" data-set-id="${escapeHtml(String(setDef.id))}" data-esp-name="${escapeHtml(setDef.name || '')}" data-esp-summary="${escapeHtml(summary)}" title="${escapeHtml(setDef.name || '')}">
          ${selected ? '<span class="esp-check" aria-hidden="true">✓</span>' : ''}
          ${renderEchoSetIconHtml(setDef, 'esp-card-icon')}
          <span class="esp-card-name">${escapeHtml(setDef.name || '未命名套装')}</span>
        </button>`;
    })
    .join('');

  const showEmptyMsg = query ? !filtered.length : !sets.length && !emptyCard;

  return `
    <div class="esp" data-esp-root>
      <div class="esp-search-wrap">
        <input type="search" class="esp-search" data-echo-set-search placeholder="搜索套装名称…" value="${escapeHtml(state.echoSetPickQuery || '')}" autocomplete="off" />
        <button type="button" class="esp-sort-btn${newestFirst ? ' is-active' : ''}" data-echo-set-sort-newest aria-pressed="${newestFirst ? 'true' : 'false'}" title="按发布时间倒序（新套装在前）">时间倒序</button>
      </div>
      <div class="esp-grid" data-esp-grid>
        ${!query ? emptyCard : ''}
        ${cards}
        ${showEmptyMsg || (query && !filtered.length) ? '<div class="esp-empty" data-esp-empty>未找到</div>' : ''}
      </div>
    </div>`;
}

function renderBuildModal(member) {
  const modal = state.buildModal;
  if (!modal) return '';
  let title = '';
  let body = '';
  let extraClass = '';
  let headHtml = '';
  if (modal === 'char') {
    title = '选择角色';
    body = renderCharacterPicker(member);
    extraClass = ' build-modal--char';
    const metaText = extractCharPickerMetaText();
    headHtml = `<div class="build-modal-head char-picker-head">
          <div class="char-picker-head-text">
            <strong>${title}</strong>
            ${metaText ? `<span class="char-picker-sub">${metaText}</span>` : ''}
          </div>
          <button type="button" class="char-picker-close" data-build-modal-close aria-label="关闭">✕</button>
        </div>`;
  } else if (modal === 'weapon') {
    title = '选择武器';
    body = renderWeaponPicker(member);
    extraClass = ' build-modal--weapon';
    const metaText = typeof extractWeaponPickerMetaText === 'function' ? extractWeaponPickerMetaText(member) : '';
    headHtml = `<div class="build-modal-head char-picker-head">
          <div class="char-picker-head-text">
            <strong>${title}</strong>
            ${metaText ? `<span class="char-picker-sub">${metaText}</span>` : ''}
          </div>
          <button type="button" class="char-picker-close" data-build-modal-close aria-label="关闭">✕</button>
        </div>`;
  } else if (modal === 'mainEcho') {
    title = '主位选择';
    body = renderBuildMainEchoPicker(member);
  } else if (String(modal).startsWith('setPick:')) {
    const idx = parseInt(String(modal).split(':')[1], 10);
    title = '选择套装';
    body = Number.isInteger(idx) ? renderBuildSetPicker(member, idx) : '';
    extraClass = ' build-modal--set-pick';
    headHtml = `<div class="build-modal-head esp-head">
          <strong class="esp-head-title">选择套装</strong>
          <button type="button" class="psm-close" data-build-modal-close aria-label="关闭">×</button>
        </div>`;
  } else if (String(modal).startsWith('panelStat:')) {
    const key = String(modal).slice('panelStat:'.length);
    const content = renderPanelStatSourceModal(member, key);
    if (!content) return '';
    title = content.title;
    body = content.body;
    extraClass = ' build-modal--panel-stat';
    headHtml = `<div class="build-modal-head psm-head">
          <strong class="psm-head-title">${content.titleHtml || escapeHtml(content.title)}</strong>
          <button type="button" class="psm-close" data-build-modal-close aria-label="关闭">×</button>
        </div>`;
  } else {
    return '';
  }
  if (!headHtml) {
    headHtml = `<div class="build-modal-head">
          <strong>${title}</strong>
          <button type="button" class="btn sm" data-build-modal-close>关闭</button>
        </div>`;
  }
  return `
    <div class="build-modal-backdrop${modal === 'char' || modal === 'weapon' ? ' is-char-picker' : ''}" data-build-modal-close>
      <div class="build-modal${extraClass}" role="dialog" aria-modal="true" data-build-modal-dialog>
        ${headHtml}
        <div class="build-modal-body">${body}</div>
      </div>
    </div>`;
}

function renderBuffCategorySelectOptions(selected) {
  return Object.entries(BUFF_CATS)
    .filter(([k]) => k !== 'convergence')
    .map(
      ([k, v]) =>
        `<option value="${k}" ${selected === k ? 'selected' : ''}>${escapeHtml(v.label)}</option>`
    )
    .join('');
}

function formatTplBuffSummary(buff) {
  if (!buff) return '';
  const cat = BUFF_CATS[buff.category]?.label || buff.category || '';
  const typeExtra = buff.damageType
    ? buff.damageType === '效应'
      ? ` · 效应·${normalizeBuffEffectType(buff.effectType)}`
      : ` · ${buff.damageType}`
    : '';
  const elExtra = buff.element && buff.element !== BUFF_ELEMENT_GENERAL ? ` · ${buff.element}` : '';
  if (buff.category === 'composite') {
    const n = (buff.effects || []).length;
    const modes = (buff.effects || [])
      .map((fx) => (fx.valueMode === 'fixed' ? '固' : '层'))
      .join('/');
    const named = (buff.effects || []).some((fx) => fx.skillScope === 'names');
    return `${cat} · ${n}效果${modes ? `(${modes})` : ''}${named ? ' · 指定技能' : ''}${typeExtra}${elExtra}`;
  }
  const val =
    buff.mode === 'stack'
      ? `每层${formatBuffScalar(buff.perStack ?? buff.value, buff.category)}`
      : formatBuffScalar(buff.value, buff.category);
  return `${cat} ${val}${typeExtra}${elExtra}`;
}

function renderCharBuffTplBuffList(list) {
  if (!list?.length) return '<p class="hint">暂无条目，下方表单可添加</p>';
  return `<div class="char-buff-tpl-list">${list
    .map((b, i) => {
      return `<div class="char-buff-tpl-row" data-tpl-buff-index="${i}">
        <div>
          <strong>${escapeHtml(b.name || '未命名')}</strong>
          <div class="meta">${escapeHtml(formatTplBuffSummary(b))} · key:${escapeHtml(b.templateKey || '')}</div>
        </div>
        <div style="display:flex;gap:0.25rem">
          <button type="button" class="btn sm" data-tpl-edit-buff="${i}">编辑</button>
          <button type="button" class="btn sm danger" data-tpl-del-buff="${i}">删</button>
        </div>
      </div>`;
    })
    .join('')}</div>`;
}

function renderTplCompositeEffectCard(fx, ei, charId, canDelete) {
  const skillOpts = getCharLibrarySkillOptions(charId);
  const selected = new Set(fx.librarySkillNames || []);
  const isFixed = fx.valueMode === 'fixed';
  const isYuhuoAuto = JIABEILINA_YUHUO_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''));
  const isSigrikaAuto = SIGRIKA_TALENT_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''));
  const isZanniYanguangAuto = ZANNI_YANGUANG_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''));
  const isAutoSkillFollow = isYuhuoAuto || isSigrikaAuto || isZanniYanguangAuto;
  const skillPicker =
    fx.skillScope === 'names' && !isAutoSkillFollow
      ? `<div class="field full tpl-skill-picker">
          <label>从技能库选择（可多选；类型/属性会按所选技能自动识别）</label>
          <div class="tpl-skill-check-grid">
            ${
              skillOpts.length
                ? skillOpts
                    .map((sk) => {
                      const checked = selected.has(sk.libraryName) ? ' checked' : '';
                      return `<label class="tpl-skill-check" title="${escapeHtml(sk.libraryName)}">
                        <input type="checkbox" data-tpl-fx-skill="${ei}" value="${escapeHtml(sk.libraryName)}"${checked} />
                        <span>${escapeHtml(sk.displayName)}</span>
                        <span class="meta">${escapeHtml(sk.damageType || '—')}${sk.damageElement ? ` · ${escapeHtml(sk.damageElement)}` : ''}</span>
                      </label>`;
                    })
                    .join('')
                : '<span class="hint">请先在上方选择角色</span>'
            }
          </div>
          <p class="hint" style="margin:0.25rem 0 0">指定技能按<strong>技能库全名</strong>绑定；编辑轴可改成 R/E1 等键位名，只要入轴时带有库名关联就不会丢 Buff。</p>
        </div>`
      : '';
  return `
    <div class="composite-effect-card tpl-fx-card" data-tpl-fx-index="${ei}">
      <div class="composite-effect-head" style="flex-wrap:wrap;gap:0.35rem">
        <select data-tpl-fx-field="zone" data-tpl-fx-index="${ei}" title="计入乘区">${renderCompositeZoneOptions(fx.zone || 'generalBonus')}</select>
        <select data-tpl-fx-field="valueMode" data-tpl-fx-index="${ei}" title="固定或叠层">
          <option value="fixed" ${isFixed ? 'selected' : ''}>固定</option>
          <option value="stack" ${!isFixed ? 'selected' : ''}>叠层</option>
        </select>
        <input type="number" data-tpl-fx-field="${isFixed ? 'value' : 'perStack'}" data-tpl-fx-index="${ei}" value="${Number(isFixed ? fx.value : fx.perStack) || 0}" step="0.1" title="${isFixed ? '固定数值' : '每层数值'}" style="width:5.5rem" />
        <label class="composite-inline" title="≥N层才计入；叠满额外效果用">≥
          <input type="number" data-tpl-fx-field="minStacks" data-tpl-fx-index="${ei}" value="${Math.max(0, Number(fx.minStacks) || 0)}" min="0" step="1" style="width:3.2rem" />
          层
        </label>
        <label class="composite-inline" title="共鸣链达到该值才计入本条效果；0=不限">≥
          <input type="number" data-tpl-fx-field="minResonance" data-tpl-fx-index="${ei}" value="${Math.max(0, Math.min(6, Math.round(Number(fx.minResonance) || 0)))}" min="0" max="6" step="1" style="width:3.2rem" />
          链
        </label>
        <select data-tpl-fx-field="skillScope" data-tpl-fx-index="${ei}" title="技能范围"${isAutoSkillFollow ? ' disabled' : ''}>
          <option value="all" ${fx.skillScope !== 'names' ? 'selected' : ''}>全部技能</option>
          <option value="names" ${fx.skillScope === 'names' ? 'selected' : ''}>指定技能</option>
        </select>
        <button type="button" class="btn sm danger" data-tpl-fx-del="${ei}"${canDelete ? '' : ' disabled'}>删效果</button>
      </div>
      ${
        String(fx.effectKey || '') === JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY
          ? '<p class="hint" style="margin:0.25rem 0 0">【余火·1链】技能范围自动跟随本 Buff 其它效果的指定技能；需 ≥1 链才计入。</p>'
          : String(fx.effectKey || '') === JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY
            ? '<p class="hint" style="margin:0.25rem 0 0">【余火·6链】技能范围自动跟随本 Buff 其它效果的指定技能；需 ≥6 链才计入热熔加深。</p>'
            : String(fx.effectKey || '') === SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY
              ? '<p class="hint" style="margin:0.25rem 0 0">【天赋·6链】技能范围自动跟随本 Buff 其它效果的指定技能；需 ≥6 链才计入伤害加深+15%/层。</p>'
              : String(fx.effectKey || '') === SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY
                ? '<p class="hint" style="margin:0.25rem 0 0">【天赋·6链】技能范围自动跟随本 Buff 其它效果的指定技能；需 ≥6 链才计入无视防御+7.5%/层。</p>'
                : String(fx.effectKey || '') === ZANNI_YANGUANG_C3_MULT_EFFECT_KEY
                  ? `<p class="hint" style="margin:0.25rem 0 0">【焰光·3链】指定【终绝将至之刻】倍率增加+${ZANNI_YANGUANG_C3_MULT_PER_STACK}%/层；需 ≥${ZANNI_YANGUANG_C3_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【琳奈·延奏·3链】泛用加深追加+${LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP}%（合计${LINNEI_OUTRO_C3_GENERAL_DEEP_PCT}%）；需 ≥${LINNEI_OUTRO_C3_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === LUCY_HOUMEN_DEEP_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【后门·全伤害加深】第1层+${LUCY_HOUMEN_STACK1_DEEP_PCT}%，第2层再+${LUCY_HOUMEN_STACK2_DEEP_PCT}%（合计${LUCY_HOUMEN_STACK1_DEEP_PCT + LUCY_HOUMEN_STACK2_DEEP_PCT}%）。</p>`
                  : String(fx.effectKey || '') === LUCY_HOUMEN_MULT_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【后门】指定【欺骗程式·运动失能】【骇破响应·数据崩解】【骇破响应·熔融】：第1层倍率提升+${LUCY_HOUMEN_STACK1_MULT_BOOST}%，第2层再+${LUCY_HOUMEN_STACK2_MULT_BOOST}%（合计${LUCY_HOUMEN_STACK1_MULT_BOOST + LUCY_HOUMEN_STACK2_MULT_BOOST}%；全阶段/特殊技能同步）。</p>`
                  : String(fx.effectKey || '') === LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【露西·延奏】泛用加深+${LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT}%：仅队伍中的【丽贝卡】计入；其他角色该效果不生效（矩阵/计算视为 ×）。</p>`
                  : String(fx.effectKey || '') === AMIS_OUTRO_EXTRA_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【爱弥斯·延奏】额外泛用加深+10%：仅【达妮娅】【琳奈】计入（合计20%）；其他角色该效果不生效。</p>`
                  : String(fx.effectKey || '') === DANIA_OUTRO_EXTRA_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【达妮娅·延奏】额外泛用加深+${DANIA_OUTRO_EXTRA_DEEP_PCT}%：仅【陆·赫斯】及集谐模态【琳奈】【清宵】计入（合计${DANIA_OUTRO_PRIVILEGED_DEEP_PCT}%）；其他角色/震谐琳奈仅基础${DANIA_OUTRO_BASE_DEEP_PCT}%。</p>`
                  : String(fx.effectKey || '') === REBECCA_HUNTER_C4_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【猎手模式·4链】泛用暴伤追加+${REBECCA_HUNTER_CRIT_DMG_C4_EXTRA}%（合计${REBECCA_HUNTER_CRIT_DMG_BASE * REBECCA_MODE_C4_MULT}%＝${REBECCA_HUNTER_CRIT_DMG_BASE}×${REBECCA_MODE_C4_MULT}）；需 ≥${REBECCA_MODE_C4_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === REBECCA_IRON_C4_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【铁胆模式·4链】无视防御追加+${REBECCA_IRON_DEF_IGNORE_C4_EXTRA}%（合计${REBECCA_IRON_DEF_IGNORE_BASE * REBECCA_MODE_C4_MULT}%＝${REBECCA_IRON_DEF_IGNORE_BASE}×${REBECCA_MODE_C4_MULT}）；需 ≥${REBECCA_MODE_C4_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === BULING_SANCAI_C6_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【雷法·三才合一·6链】共鸣技能增伤追加+${BULING_SANCAI_C6_EXTRA}%（合计${BULING_SANCAI_C6_TOTAL}%）；需 ≥${BULING_SANCAI_C6_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【多线程·SQL】基础倍率提升+${LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST}%（&lt;${LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE}链时仅此项）。</p>`
                  : String(fx.effectKey || '') === LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【多线程·SQL·2链】再+${LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST}% → 合计+${LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST}%；需 ≥${LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE} 链才计入。</p>`
                  : String(fx.effectKey || '') === LUCY_C6_EXEC_VULN_EFFECT_KEY
                    ? `<p class="hint" style="margin:0.25rem 0 0">【6链·处决易伤】指定【骇破响应·数据崩解】【欺骗程式·运动失能】泛用易伤+${LUCY_C6_EXEC_VULN_PCT}%；需 ≥${LUCY_C6_EXEC_VULN_MIN_RESONANCE} 链才计入（同步特殊技能）。</p>`
                : ''
      }
      ${skillPicker}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.35rem;margin-top:0.35rem">
        <div class="field" style="margin:0">
          <label>伤害类型</label>
          <select data-tpl-fx-field="damageType" data-tpl-fx-index="${ei}">${renderDamageTypeOptions(fx.damageType || '', true)}</select>
        </div>
        <div class="field" style="margin:0">
          <label>属性</label>
          <select data-tpl-fx-field="element" data-tpl-fx-index="${ei}">${renderElementOptions(fx.element || '', true)}</select>
        </div>
      </div>
      ${
        fx.damageType === '效应'
          ? `<div class="field" style="margin:0.35rem 0 0;max-width:12rem">
          <label>效应类型</label>
          <select data-tpl-fx-field="effectType" data-tpl-fx-index="${ei}">${renderEffectTypeOptions(fx.effectType)}</select>
        </div>`
          : ''
      }
    </div>`;
}

function renderCharBuffTplForm(ui, member) {
  const form = ui.form || defaultTplBuffForm();
  const isComposite = form.category === 'composite';
  const charId = ensureCharBuffTplUi().characterId || member?.characterId || '';
  const effects = Array.isArray(form.effects) && form.effects.length ? form.effects : [defaultTplCompositeEffectForm()];
  form.effects = effects;
  const effectsHtml = isComposite
    ? `<div class="field full">
        <label>效果列表（一条 Buff 名称可挂多条效果）</label>
        <div class="composite-effects">${effects
          .map((fx, ei) =>
            renderTplCompositeEffectCard(
              fx,
              ei,
              charId,
              effects.length > 1 &&
                !JIABEILINA_YUHUO_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !SIGRIKA_TALENT_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !ZANNI_YANGUANG_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !LINNEI_OUTRO_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !LUCY_HOUMEN_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !LUCY_OUTRO_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !LUCY_MULTITHREAD_SQL_AUTO_EFFECT_KEYS.has(String(fx.effectKey || '')) &&
                !LUCY_C6_EXEC_VULN_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''))
            )
          )
          .join('')}</div>
        <button type="button" class="btn sm primary" data-tpl-fx-add style="margin-top:0.35rem">+ 添加效果</button>
        <div class="field" style="margin-top:0.45rem;max-width:10rem">
          <label>层数上限</label>
          <input type="number" data-tpl-form-field="maxStacks" value="${Number(form.maxStacks) || 5}" min="1" step="1" />
        </div>
        <p class="hint">固定效果：Buff 层数&gt;0 时计入固定值；叠层效果：按层数×每层。指定技能从技能库勾选，类型/属性自动识别（可再改）。≥N链：共鸣链未达门槛时本条效果不计入。</p>
      </div>`
    : '';
  return `
    <div class="char-buff-tpl-form">
      <div class="field">
        <label>乘区</label>
        <select data-tpl-form-field="category">${renderBuffCategorySelectOptions(form.category)}</select>
      </div>
      <div class="field">
        <label>名称</label>
        <input type="text" data-tpl-form-field="name" value="${escapeHtml(form.name || '')}" placeholder="Buff 名称，如：余响" />
      </div>
      ${
        isComposite
          ? effectsHtml
          : `
      <div class="field">
        <label>模式</label>
        <select data-tpl-form-field="mode">
          <option value="fixed" ${form.mode !== 'stack' ? 'selected' : ''}>固定</option>
          <option value="stack" ${form.mode === 'stack' ? 'selected' : ''}>叠层</option>
        </select>
      </div>
      <div class="field">
        <label>${form.mode === 'stack' ? '每层' : '数值'}</label>
        <input type="number" data-tpl-form-field="value" value="${Number(form.mode === 'stack' ? form.perStack ?? form.value : form.value) || 0}" step="0.1" />
      </div>
      ${
        form.mode === 'stack'
          ? `<div class="field"><label>最大层数</label><input type="number" data-tpl-form-field="maxStacks" value="${Number(form.maxStacks) || 5}" min="1" step="1" /></div>`
          : ''
      }
      <div class="field">
        <label>伤害类型</label>
        <select data-tpl-form-field="damageType">${renderDamageTypeOptions(form.damageType || '', true)}</select>
      </div>
      ${
        form.damageType === '效应'
          ? `<div class="field">
        <label>效应类型</label>
        <select data-tpl-form-field="effectType">${renderEffectTypeOptions(form.effectType)}</select>
      </div>`
          : ''
      }
      <div class="field">
        <label>属性</label>
        <select data-tpl-form-field="element">${renderElementOptions(form.element || '', true)}</select>
      </div>`
      }
      <div class="field full" style="display:flex;flex-wrap:wrap;gap:0.35rem">
        <button type="button" class="btn sm primary" data-tpl-form-save>${ui.form?.editIndex >= 0 ? '保存修改' : '添加到列表'}</button>
        <button type="button" class="btn sm" data-tpl-form-cancel>取消表单</button>
      </div>
    </div>`;
}

function formToTemplateBuffEntry(form, charId) {
  if (!form) return null;
  if (form.category === 'composite') {
    const effects = (form.effects || []).map((fx) => {
      const librarySkillNames = [...(fx.librarySkillNames || [])];
      const skillNames =
        fx.skillScope === 'names' ? buildSkillNamesForMatch(librarySkillNames, charId) : [];
      const valueMode = fx.valueMode === 'fixed' ? 'fixed' : 'stack';
      return {
        zone: fx.zone || 'generalBonus',
        valueMode,
        value: valueMode === 'fixed' ? Number(fx.value) || 0 : 0,
        segments:
          valueMode === 'fixed'
            ? [{ upTo: null, perStack: 0 }]
            : [{ upTo: null, perStack: Number(fx.perStack) || 0 }],
        skillScope: fx.skillScope === 'names' ? 'names' : 'all',
        skillNames,
        librarySkillNames,
        damageType: fx.damageType || '',
        effectType: fx.damageType === '效应' ? normalizeBuffEffectType(fx.effectType) : '',
        element: fx.element || '',
        defenseKind: fx.defenseKind || '',
        minStacks: Math.max(0, Math.round(Number(fx.minStacks) || 0)),
        minResonance: Math.max(0, Math.min(6, Math.round(Number(fx.minResonance) || 0))),
        effectKey: String(fx.effectKey || '').trim(),
      };
    });
    return normalizeTemplateBuffEntry({
      templateKey: form.templateKey || makeTemplateKey('tpl'),
      category: 'composite',
      name: form.name || '复合效果',
      mode: inferCompositeBuffMode(effects, form.templateKey),
      maxStacks: Math.max(1, Number(form.maxStacks) || 1),
      effects,
    });
  }
  const mode = form.mode === 'stack' ? 'stack' : 'fixed';
  const value = Number(form.value) || 0;
  return normalizeTemplateBuffEntry({
    templateKey: form.templateKey || makeTemplateKey('tpl'),
    category: form.category || 'generalBonus',
    name: form.name || 'Buff',
    mode,
    value: mode === 'stack' ? 0 : value,
    perStack: mode === 'stack' ? value : 0,
    maxStacks: Math.max(1, Number(form.maxStacks) || 5),
    damageType: form.damageType || '',
    effectType: form.damageType === '效应' ? normalizeBuffEffectType(form.effectType) : '',
    element: form.element || '',
    defenseKind: form.defenseKind || '',
  });
}

function buffEntryToForm(entry, editIndex) {
  const form = defaultTplBuffForm(entry?.category);
  form.editIndex = editIndex;
  form.templateKey = entry.templateKey || form.templateKey;
  form.name = entry.name || '';
  form.category = entry.category || 'generalBonus';
  form.mode = entry.mode === 'stack' ? 'stack' : 'fixed';
  form.value = entry.mode === 'stack' ? entry.perStack ?? entry.value : entry.value;
  form.perStack = entry.perStack ?? 0;
  form.maxStacks = entry.maxStacks || 5;
  form.damageType = entry.damageType || '';
  form.effectType = entry.damageType === '效应' ? normalizeBuffEffectType(entry.effectType) : '';
  form.element = entry.element || '';
  form.defenseKind = entry.defenseKind || '';
  if (entry.category === 'composite') {
    form.effects = (entry.effects || []).map((fx) => {
      const valueMode = fx.valueMode === 'fixed' ? 'fixed' : 'stack';
      const charId = ensureCharBuffTplUi().characterId || '';
      const opts = getCharLibrarySkillOptions(charId);
      const rawLibs = [...(fx.librarySkillNames || [])];
      const rawNames = [...(fx.skillNames || [])];
      const resolved = new Set(rawLibs);
      rawNames.concat(rawLibs).forEach((n) => {
        const hit = opts.find(
          (o) =>
            o.libraryName === n ||
            o.displayName === n ||
            skillNamesLooselyMatch(n, o.libraryName) ||
            skillNamesLooselyMatch(n, o.displayName)
        );
        if (hit) resolved.add(hit.libraryName);
        else if (n) resolved.add(n);
      });
      return {
        zone: fx.zone || 'generalBonus',
        valueMode,
        value: valueMode === 'fixed' ? Number(fx.value) || 0 : 0,
        perStack: valueMode === 'stack' ? Number(fx.segments?.[0]?.perStack) || 0 : 0,
        skillScope: fx.skillScope === 'names' ? 'names' : 'all',
        librarySkillNames: [...resolved],
        damageType: fx.damageType || '',
        effectType: fx.damageType === '效应' ? normalizeBuffEffectType(fx.effectType) : '',
        element: fx.element || '',
        defenseKind: fx.defenseKind || '',
        minStacks: Math.max(0, Math.round(Number(fx.minStacks) || 0)),
        minResonance: Math.max(0, Math.min(6, Math.round(Number(fx.minResonance) || 0))),
        effectKey: String(fx.effectKey || '').trim(),
      };
    });
    if (!form.effects.length) form.effects = [defaultTplCompositeEffectForm()];
  }
  return form;
}

function renderCharBuffTemplateEditor(_member) {
  return '';
}

function getTemplatePageTabLabel(ui) {
  if (!ui) return '本体·个人';
  const modeHint = ui.modeFilter ? ` · ${getCombatModeLabel(ui.modeFilter)}` : '';
  if (ui.tab === 'team') return `本体·全队${modeHint}`;
  if (ui.tab === 'chain') {
    const scope = ui.chainScope === 'team' ? '全队' : '个人';
    return `${ui.chainIndex || 1}链 · ${scope}${modeHint}`;
  }
  return `本体·个人${modeHint}`;
}

/** 模板页 / 复合指定技能：与编辑轴同结构的技能库数据（含库全名） */
function buildTemplateCharacterPalette(charId) {
  const def = findCharSkillDef(charId);
  if (!def?.skills?.length) return [];
  const mapped = def.skills.map((entry) => {
    const libraryName = String(entry.name || '').trim();
    const name = simplifySkillPaletteName(libraryName) || libraryName;
    return {
      id: libraryName,
      name,
      libraryName,
      damageType: entry.damageType || '',
      baseMult: entry.baseMult,
      energyRegen: normalizeEnergyRegen(entry.energyRegen),
      damageElement: entry.damageElement || '',
      scaleStat: entry.scaleStat === 'hp' || entry.scaleStat === 'def' ? entry.scaleStat : 'atk',
      fixedDamage: !!entry.fixedDamage || isFixedDamageByName(libraryName) || isFixedDamageByName(name),
    };
  });
  return disambiguatePaletteDisplayNames(mapped);
}

function renderCompositePaletteChip(p, buffId, effectIndex, selected) {
  const fixedHint = isFixedDamageUnit(p) ? ' · 固定伤害' : '';
  return `<span class="rotation-chip${selected ? ' is-selected' : ''}" data-composite-pick-library-skill="${buffId}" data-effect-index="${effectIndex}" data-library-name="${escapeHtml(p.libraryName)}" title="${escapeHtml(p.libraryName)}${fixedHint}">${escapeHtml(p.name)}${formatSkillMultChipSuffix(p)}</span>`;
}

function renderTemplateAxisSkillLibrary(charId, opts) {
  const { buffId, effectIndex, selectedNames } = opts || {};
  const palette = buildTemplateCharacterPalette(charId);
  if (!palette.length) {
    return '<p class="hint" style="margin:0">暂无技能库；请先选择角色并加载 character-skills.json。</p>';
  }
  const key = `${buffId}:${effectIndex}`;
  // 默认收起：未记录过的 key 视为 collapsed，避免一进复合页就展开技能库
  const collapsed = ensureCharBuffTplUi().compositeSkillLibCollapsed?.[key] !== false;
  const selected = new Set(selectedNames || []);
  const body = groupPaletteByType(palette)
    .map(
      ({ type, items }) => `
    <div class="palette-group">
      <div class="palette-group-label">${escapeHtml(type)}<span class="palette-group-count">${items.length}</span></div>
      <div class="palette-group-chips">${items
        .map((p) => renderCompositePaletteChip(p, buffId, effectIndex, selected.has(p.libraryName)))
        .join('')}</div>
    </div>`
    )
    .join('');
  return `
    <div class="palette-section composite-axis-skill-lib">
      <div class="palette-section-header">
        <button type="button" class="btn sm icon" data-toggle-composite-skill-lib="${buffId}" data-effect-index="${effectIndex}" title="展开/收起技能库">${collapsed ? '▶' : '▼'}</button>
        <span class="palette-section-label">技能库</span>
        <span class="hint">${collapsed ? '已收起 · 点击展开选技' : '点击添加/取消指定技能（与编辑轴相同）'}</span>
      </div>
      <div class="palette-section-body ${collapsed ? 'collapsed' : ''}">
        <div class="rotation-strip">${body}</div>
      </div>
    </div>`;
}

function renderTemplatePageSidebar() {
  const ui = ensureCharBuffTplUi();
  const draft = getCharBuffTplDraft();
  const charOpts = (charSkillDb?.characters || [])
    .map(
      (c) =>
        `<option value="${escapeHtml(String(c.id))}" ${String(ui.characterId) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    )
    .join('');
  const tabBtn = (id, label) =>
    `<button type="button" class="btn sm${ui.tab === id ? ' primary' : ''}" data-tpl-tab="${id}">${label}</button>`;
  const chainTabs = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `<button type="button" class="btn sm${ui.tab === 'chain' && ui.chainIndex === n ? ' primary' : ''}" data-tpl-chain="${n}">${n}链</button>`
    )
    .join('');
  const modeCfg = getCharCombatModeConfig(ui.characterId);
  syncTplUiCombatMode(ui);
  const modeTabs = modeCfg?.modes?.length
    ? `<div class="char-buff-tpl-tabs" style="margin-top:0.35rem">
        <span class="hint" style="margin:0;align-self:center">模态筛选</span>
        <button type="button" class="btn sm${!ui.modeFilter ? ' primary' : ''}" data-tpl-mode-filter="">通用</button>
        ${modeCfg.modes
          .map((id) => {
            const active = ui.modeFilter === id;
            return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-tpl-mode-filter="${id}">${escapeHtml(getCombatModeLabel(id))}</button>`;
          })
          .join('')}
      </div>`
    : '';
  let scopeNote = '';
  if (ui.tab === 'chain') {
    scopeNote = `<div class="char-buff-tpl-tabs">
          <button type="button" class="btn sm${ui.chainScope !== 'team' ? ' primary' : ''}" data-tpl-chain-scope="personal">链·个人</button>
          <button type="button" class="btn sm${ui.chainScope === 'team' ? ' primary' : ''}" data-tpl-chain-scope="team">链·全队</button>
        </div>
        <p class="hint">只录本链新增 Buff，应用时与低链累计叠加。${
          ui.modeFilter
            ? `当前写入「${escapeHtml(getCombatModeLabel(ui.modeFilter))}」模态下的本链 Buff。`
            : '当前为「通用」（任意模态都生效）。'
        }</p>`;
  } else if (modeCfg) {
    scopeNote = `<p class="hint">先选模态筛选：<strong>通用</strong>=任意模态都生效；选具体模态后，下方来源库只显示/写入该模态的 Buff（通用条目不会出现在列表里，并未删除）。切换本体/链页签会保留模态勾选。</p>`;
  }
  return `
    <div class="panel char-buff-tpl-page-sidebar">
      <h2>Buff 模板</h2>
      <div class="field">
        <label>编辑角色</label>
        <select data-tpl-character>${charOpts || '<option value="">请先加载角色库</option>'}</select>
      </div>
      <div class="field" style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
        <div><label>作者</label><input type="text" data-tpl-meta="author" value="${escapeHtml(draft?.author || '')}" /></div>
        <div><label>版本 revision</label><input type="number" data-tpl-meta="revision" value="${draft?.revision || 1}" min="1" step="1" /></div>
      </div>
      <div class="field"><label>备注</label><input type="text" data-tpl-meta="notes" value="${escapeHtml(draft?.notes || '')}" /></div>
      <div class="char-buff-tpl-tabs">
        ${tabBtn('personal', '本体·个人')}
        ${tabBtn('team', '本体·全队')}
        ${chainTabs}
      </div>
      ${modeTabs}
      ${scopeNote}
      ${ui.message ? `<p class="char-buff-tpl-msg${ui.messageWarn ? ' warn' : ''}">${escapeHtml(ui.message)}</p>` : ''}
      <div class="char-buff-tpl-actions">
        <button type="button" class="btn sm primary" data-tpl-save-local>保存到本机库</button>
        <button type="button" class="btn sm" data-tpl-capture>从当前槽位捕获</button>
        <button type="button" class="btn sm" data-tpl-preview>预览应用到当前槽</button>
        <button type="button" class="btn sm" data-tpl-export-one>导出本角色</button>
        <button type="button" class="btn sm" data-tpl-export-all>导出全部本机</button>
        <button type="button" class="btn sm" data-tpl-import>导入模板包</button>
        <button type="button" class="btn sm" data-workspace-phase="setup">返回构筑</button>
      </div>
      <input type="file" accept="application/json,.json" hidden data-tpl-import-file />
      <p class="hint" style="margin-top:0.5rem">本机库优先于随包 JSON。导入/保存后写入浏览器本机库（不会被「清理缓存」清掉）。建议定期「导出全部本机」备份；也可把导出 JSON 合并进项目 <code>character-buff-templates.json</code> 随包持久化。武器/声骸 Buff 不进模板。</p>
    </div>`;
}

function renderTemplateExtraSkillsEditor() {
  const ui = ensureCharBuffTplUi();
  const draft = getCharBuffTplDraft();
  if (!draft) return '';
  const list = getDraftExtraSkillList(draft, ui);
  const modeHint = ui.modeFilter ? `·${getCombatModeLabel(ui.modeFilter)}` : '';
  const scopeLabel =
    ui.tab === 'chain' ? `${ui.chainIndex || 1}链${modeHint}` : `本体${modeHint}`;
  const layerOpts = Array.from({ length: EFFECT_LAYER_MAX }, (_, i) => i + 1)
    .map((n) => `<option value="${n}">${n}</option>`)
    .join('');
  const burstOpts = Array.from({ length: EFFECT_LAYER_MAX + 1 }, (_, i) => i)
    .map((n) => `<option value="${n}">${n}</option>`)
    .join('');
  const rows = list.length
    ? list
        .map((entry, i) => {
          const isEffect = entry.damageType === '效应';
          const isExec = entry.damageType === '处决';
          const dmgOpts = DAMAGE_TYPES.map(
            (t) =>
              `<option value="${escapeHtml(t)}" ${entry.damageType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
          ).join('');
          let condFields = '';
          if (isEffect) {
            const isLayersMode = entry.effectMultMode === 'layers';
            const effectOpts = EFFECT_TYPE_LIST.map(
              (t) =>
                `<option value="${escapeHtml(t)}" ${entry.effectType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
            ).join('');
            const layers = Array.from({ length: EFFECT_LAYER_MAX }, (_, n) => n + 1)
              .map(
                (n) =>
                  `<option value="${n}" ${entry.effectLayers === n ? 'selected' : ''}>${n}</option>`
              )
              .join('');
            const bursts = Array.from({ length: EFFECT_LAYER_MAX + 1 }, (_, n) => n)
              .map(
                (n) =>
                  `<option value="${n}" ${entry.effectBurstLayers === n ? 'selected' : ''}>${n}</option>`
              )
              .join('');
            const previewMult = isLayersMode
              ? computeEffectBaseMult({
                  effectType: entry.effectType,
                  effectLayers: entry.effectLayers,
                  effectBurstLayers: entry.effectBurstLayers,
                })
              : null;
            const layersFields = isLayersMode
              ? `
              <span class="field-label">层数</span>
              <select data-tpl-extra-field="effectLayers" data-tpl-extra-index="${i}">${layers || layerOpts}</select>
              <span class="field-label">电磁爆</span>
              <select data-tpl-extra-field="effectBurstLayers" data-tpl-extra-index="${i}">${bursts || burstOpts}</select>
              <span class="field-label">查表倍率%</span>
              <input type="number" value="${previewMult ?? 0}" step="0.01" style="width:5.5rem" readonly title="由效应类型与层数自动查表" />
            `
              : `
              <span class="field-label">自定义倍率%</span>
              <input type="number" data-tpl-extra-field="baseMult" data-tpl-extra-index="${i}" value="${Number.isFinite(entry.baseMult) ? entry.baseMult : 100}" step="0.1" style="width:5.5rem" title="固定倍率，不随层数查表" />
            `;
            condFields = `
              <span class="field-label">倍率模式</span>
              <select data-tpl-extra-field="effectMultMode" data-tpl-extra-index="${i}" title="额外技能可用固定倍率">
                <option value="custom" ${!isLayersMode ? 'selected' : ''}>自定义固定</option>
                <option value="layers" ${isLayersMode ? 'selected' : ''}>按层数查表</option>
              </select>
              <span class="field-label">效应</span>
              <select data-tpl-extra-field="effectType" data-tpl-extra-index="${i}">${effectOpts}</select>
              <span class="field-label">次数</span>
              <input type="number" data-tpl-extra-field="effectCount" data-tpl-extra-index="${i}" value="${entry.effectCount || 1}" min="1" step="1" style="width:4rem" />
              ${layersFields}
            `;
          } else {
            const isFixed = !!entry.fixedDamage || isFixedDamageByName(entry.name);
            const multLabel = isExec ? '倍率(默认1600)' : isFixed ? '固定伤害' : '倍率%';
            const multStep = isFixed ? '1' : '0.1';
            const multTitle = isFixed ? '固定伤害（不受任何乘区加成）' : '';
            condFields = `
              <span class="field-label">${multLabel}</span>
              <input type="number" data-tpl-extra-field="baseMult" data-tpl-extra-index="${i}" value="${Number.isFinite(entry.baseMult) ? entry.baseMult : isExec ? 1600 : 0}" step="${multStep}" style="width:5.5rem" title="${escapeHtml(multTitle)}" />
            `;
          }
          return `
            <div class="template-extra-skill-row" data-tpl-extra-row="${i}">
              <input type="text" data-tpl-extra-field="name" data-tpl-extra-index="${i}" value="${escapeHtml(entry.name || '')}" placeholder="技能名" style="width:8.5rem" />
              <select data-tpl-extra-field="damageType" data-tpl-extra-index="${i}">${dmgOpts}</select>
              ${condFields}
              <button type="button" class="btn sm danger" data-tpl-extra-del="${i}">删</button>
            </div>`;
        })
        .join('')
    : '<p class="hint" style="margin:0.25rem 0 0">暂无额外技能。效应/处决进特殊技能；其它类型进技能条（巧克力黄标签）。</p>';
  return `
    <div class="template-extra-skills panel">
      <div class="template-extra-skills-head">
        <strong>额外技能（当前：${escapeHtml(scopeLabel)}）</strong>
        <span class="hint">本体与 1–6 链各自维护；应用时累计本体 + 已解锁链</span>
      </div>
      ${rows}
      <div class="template-extra-skills-actions">
        <button type="button" class="btn sm primary" data-tpl-extra-add>+ 添加额外技能</button>
      </div>
    </div>`;
}

function renderAugustaSpecialMechanicsEditor() {
  const ui = ensureCharBuffTplUi();
  const draft = getCharBuffTplDraft();
  if (!draft || String(draft.characterId) !== AUGUSTA_CHAR_ID) return '';
  ensureAugustaTemplateShape(draft);
  const mech = draft.specialMechanics;
  const previewChain = Math.max(0, Math.min(6, Math.round(Number(ui.augustaPreviewChain) || 6)));
  const previewCr = Math.max(0, Number(ui.augustaPreviewCr) || 160);
  const preview = computeAugustaCritConversion(previewCr, 0, mech, previewChain);
  const cap = getAugustaStackCap(mech, previewChain);
  const ruleLines = (mech.convertRules || [])
    .map(
      (r) =>
        `<li>${escapeHtml(r.label || `${r.minChain}链`)}：暴击超过 ${r.threshold}% 后，每 1% → ${r.ratio}% 暴伤，上限 ${r.maxCritDmg}%（需 ≥${r.minChain} 链）</li>`
    )
    .join('');
  return `
    <div class="panel augusta-mech-panel">
      <h3>奥古斯塔 · 专属机制</h3>
      <p class="hint" style="margin:0">溢出暴击转化与【以众愿为冕】层数上限由本面板驱动（非普通 Buff 表单）。转化自 2 链起；本体个人 Buff「以众愿为冕」请勿删除。</p>
      <div class="augusta-mech-grid">
        <label>每层暴击率%（≥2链）
          <input type="number" data-augusta-mech="stackPerCritRate" value="${mech.stackPerCritRate}" min="0" step="1" />
        </label>
        <label>0链层数上限
          <input type="number" data-augusta-mech="stackCapAtBase" value="${mech.stackCapAtBase}" min="1" step="1" />
        </label>
        <label>≥1链层数上限
          <input type="number" data-augusta-mech="stackCapAtChain2" value="${mech.stackCapAtChain2}" min="1" step="1" />
        </label>
        <label>≥6链层数上限
          <input type="number" data-augusta-mech="stackCapAtChain6" value="${mech.stackCapAtChain6}" min="1" step="1" />
        </label>
        <label>2链转化阈值%
          <input type="number" data-augusta-mech="rule0_threshold" value="${mech.convertRules[0]?.threshold ?? 100}" min="0" step="1" />
        </label>
        <label>2链转化比
          <input type="number" data-augusta-mech="rule0_ratio" value="${mech.convertRules[0]?.ratio ?? 2}" min="0" step="0.1" />
        </label>
        <label>2链转化暴伤上限%
          <input type="number" data-augusta-mech="rule0_maxCritDmg" value="${mech.convertRules[0]?.maxCritDmg ?? 100}" min="0" step="1" />
        </label>
        <label>6链转化阈值%
          <input type="number" data-augusta-mech="rule1_threshold" value="${mech.convertRules[1]?.threshold ?? 150}" min="0" step="1" />
        </label>
        <label>6链转化比
          <input type="number" data-augusta-mech="rule1_ratio" value="${mech.convertRules[1]?.ratio ?? 2}" min="0" step="0.1" />
        </label>
        <label>6链转化暴伤上限%
          <input type="number" data-augusta-mech="rule1_maxCritDmg" value="${mech.convertRules[1]?.maxCritDmg ?? 50}" min="0" step="1" />
        </label>
      </div>
      <ul class="augusta-mech-rules">${ruleLines}</ul>
      <div class="augusta-mech-grid" style="margin-top:0.65rem">
        <label>预览链数
          <select data-augusta-preview="chain">
            ${[0, 1, 2, 3, 4, 5, 6]
              .map((n) => `<option value="${n}" ${previewChain === n ? 'selected' : ''}>${n}链</option>`)
              .join('')}
          </select>
        </label>
        <label>预览·合计暴击率%
          <input type="number" data-augusta-preview="cr" value="${previewCr}" min="0" step="1" />
        </label>
      </div>
      <div class="augusta-mech-preview">
        当前预览链【以众愿为冕】上限 <strong>${cap}</strong>（≥2 链每层 +${mech.stackPerCritRate}% 暴击）。
        暴击合计 ${formatBuffPct(preview.rawCritRatePct)} → 溢出转暴伤 <strong>+${formatBuffPct(preview.convertedCritDmgPct)}</strong>；
        期望计算用暴击 ${formatBuffPct(preview.effectiveCritRatePct)}，暴伤在面板基础上再加转化值。
      </div>
    </div>`;
}

function renderBrantSpecialMechanicsEditor() {
  const ui = ensureCharBuffTplUi();
  const draft = getCharBuffTplDraft();
  if (!draft || String(draft.characterId) !== BRANT_CHAR_ID) return '';
  ensureBrantTemplateShape(draft);
  const mech = draft.specialMechanics;
  const play = mech.variants[BRANT_LIFE_PLAY];
  const my = mech.variants[BRANT_LIFE_MY];
  const previewEr = Math.max(0, Number(ui.brantPreviewEr) || 250);
  const previewMode =
    ui.brantPreviewMode === BRANT_LIFE_MY ? BRANT_LIFE_MY : BRANT_LIFE_PLAY;
  const variant = getBrantLifeVariant(mech, previewMode);
  const excess = Math.max(0, previewEr - mech.thresholdPct);
  const flat = Math.min(variant.cap, excess * variant.atkPerPct);
  const capped = flat >= variant.cap && variant.cap > 0;
  return `
    <div class="panel augusta-mech-panel">
      <h3>布兰特 · 专属机制</h3>
      <p class="hint" style="margin:0">共鸣效率超过阈值后转化为固定攻击；【戏中人生】与大招后【我的人生】系数不同。编轴技能可单独切换形态。</p>
      <div class="augusta-mech-grid">
        <label>阈值共鸣效率%
          <input type="number" data-brant-mech="thresholdPct" value="${mech.thresholdPct}" min="0" step="1" />
        </label>
        <label>戏中人生·每1%攻击
          <input type="number" data-brant-mech="play_atkPerPct" value="${play.atkPerPct}" min="0" step="1" />
        </label>
        <label>戏中人生·上限
          <input type="number" data-brant-mech="play_cap" value="${play.cap}" min="0" step="1" />
        </label>
        <label>我的人生·每1%攻击
          <input type="number" data-brant-mech="my_atkPerPct" value="${my.atkPerPct}" min="0" step="1" />
        </label>
        <label>我的人生·上限
          <input type="number" data-brant-mech="my_cap" value="${my.cap}" min="0" step="1" />
        </label>
      </div>
      <div class="augusta-mech-grid" style="margin-top:0.65rem">
        <label>预览形态
          <select data-brant-preview="mode">
            <option value="${BRANT_LIFE_PLAY}" ${previewMode === BRANT_LIFE_PLAY ? 'selected' : ''}>戏中人生</option>
            <option value="${BRANT_LIFE_MY}" ${previewMode === BRANT_LIFE_MY ? 'selected' : ''}>我的人生</option>
          </select>
        </label>
        <label>预览·共鸣效率%
          <input type="number" data-brant-preview="er" value="${previewEr}" min="0" step="0.1" />
        </label>
      </div>
      <div class="augusta-mech-preview">
        ${escapeHtml(variant.label)}：效率 ${previewEr}% → 超额 ${excess.toFixed(1)}% → 固定攻 <strong>+${Math.round(flat)}</strong>${capped ? '（已达上限）' : ''}
      </div>
    </div>`;
}

function renderTemplatePageMain() {
  const ui = ensureCharBuffTplUi();
  const draft = getCharBuffTplDraft();
  const charDef = findCharSkillDef(ui.characterId);
  const proxy = getTemplateBuffEditProxy();
  const tabLabel = getTemplatePageTabLabel(ui);
  const name = charDef?.name || draft?.characterName || '未选择角色';
  if (!proxy) {
    return `<div class="template-page-main"><div class="panel"><p class="hint">请先在左侧选择角色。</p></div></div>`;
  }
  return `
    <div class="template-page-main">
      <p class="hint" style="margin:0 0 0.55rem">角色 <strong>${escapeHtml(name)}</strong> · 当前编辑 <strong>${escapeHtml(tabLabel)}</strong> · 下方即为完整 Buff 来源库（与配装页相同）。复合效果选「指定技能名」时，会展开与编辑轴一致的技能库。</p>
      ${renderAugustaSpecialMechanicsEditor()}
      ${renderBrantSpecialMechanicsEditor()}
      ${renderTemplateExtraSkillsEditor()}
      ${renderMemberBuffSourceAndStats(proxy, {
        title: 'Buff 来源库',
        editorId: 'tplBuffEditor',
      })}
    </div>`;
}

function formatResonanceRelative(map, n) {
  if (n === 0) return '基准';
  const entry = map[String(n)];
  const baseline = map['0'];
  if (!entry || !baseline?.memberTotal) return '—';
  const pct = ((entry.memberTotal / baseline.memberTotal) - 1) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatWeaponRefRelative(map, r) {
  if (r === 1) return '基准';
  const entry = map[String(r)];
  const baseline = map['1'];
  if (!entry || !baseline?.memberTotal) return '—';
  const pct = ((entry.memberTotal / baseline.memberTotal) - 1) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** ——— 共鸣链轴底轴 + 增量 ——— */
function cloneAxisCatalogItem(c) {
  const item = {
    customName: !!c?.customName,
    id: c?.id || genId(),
    name: c?.name || '',
    damageType: c?.damageType || '',
    baseMult: Number.isFinite(c?.baseMult) ? c.baseMult : parseFloat(c?.baseMult) || 0,
    multCount: normalizeMultCount(c?.multCount),
    energyRegen: normalizeEnergyRegen(c?.energyRegen),
    scaleStat: c?.scaleStat === 'hp' || c?.scaleStat === 'def' ? c.scaleStat : 'atk',
    fixedDamage: !!c?.fixedDamage || isFixedDamageByName(c?.name),
    stackLayers: { ...(c?.stackLayers || {}) },
    multComponents: normalizeMultComponents(c?.multComponents),
  };
  if (Array.isArray(c?.skillLevelSources)) item.skillLevelSources = c.skillLevelSources.map(source => ({ ...source }));
  if (Number.isFinite(c?.frostHintPerCast)) item.frostHintPerCast = c.frostHintPerCast;
  if (Array.isArray(c?.frostHintSources)) item.frostHintSources = c.frostHintSources.map(source => ({ ...source }));
  else if (c?.merged) item.frostHintSources = [{ name:c.name, librarySkillName:c.librarySkillName || c.libraryName || c.name, multCount:1, merged:true, frostHintPerCast:c.frostHintPerCast }];
  if (c?.damageElement) item.damageElement = c.damageElement;
  if (Number.isFinite(c?.axisOffsetPx)) item.axisOffsetPx = Math.max(0, Math.round(c.axisOffsetPx));
  if (c?.linkedSpecialSkillId) item.linkedSpecialSkillId = c.linkedSpecialSkillId;
  assignLibrarySkillName(item, getEntryLibrarySkillName(c));
  return item;
}

function cloneAxisCatalog(catalog) {
  return (catalog || []).map(cloneAxisCatalogItem);
}

function cloneAxisPhases(phases) {
  return clonePhasesSnapshot(phases || []);
}

function catalogAxisKey(item) {
  if (item?.id) return String(item.id);
  return `sig:${item?.name || ''}|${item?.damageType || ''}|${item?.baseMult}|${item?.multCount}`;
}

function phaseAxisKey(phase, index) {
  if (phase?.id) return String(phase.id);
  return `phase:${index}`;
}

function phaseSkillAxisKey(skill) {
  if (skill?.catalogId) return `cat:${skill.catalogId}`;
  if (skill?.id) return `id:${skill.id}`;
  return `sig:${skill?.name || ''}|${skill?.damageType || ''}|${skill?.baseMult}|${skill?.multCount}`;
}

function catalogAxisFields(item) {
  return {
    customName: !!item?.customName,
    name: item?.name || '',
    damageType: item?.damageType || '',
    baseMult: Number.isFinite(item?.baseMult) ? item.baseMult : parseFloat(item?.baseMult) || 0,
    multCount: normalizeMultCount(item?.multCount),
    energyRegen: normalizeEnergyRegen(item?.energyRegen),
    scaleStat: item?.scaleStat === 'hp' || item?.scaleStat === 'def' ? item.scaleStat : 'atk',
    fixedDamage: !!item?.fixedDamage || isFixedDamageByName(item?.name),
  };
}

function phaseSkillAxisFields(skill) {
  const fields = {
    name: skill?.name || '',
    damageType: skill?.damageType || '',
    baseMult: Number.isFinite(skill?.baseMult) ? skill.baseMult : parseFloat(skill?.baseMult) || 0,
    multCount: normalizeMultCount(skill?.multCount),
    energyRegen: normalizeEnergyRegen(skill?.energyRegen),
    scaleStat: skill?.scaleStat === 'hp' || skill?.scaleStat === 'def' ? skill.scaleStat : 'atk',
    fixedDamage: !!skill?.fixedDamage || isFixedDamageByName(skill?.name),
    catalogId: skill?.catalogId || null,
    split: !!skill?.split,
    timelineMultOverride: skill?.timelineMultOverride === true,
    multComponents: window.__WC.normalizeMultComponents(skill?.multComponents),
  };
  if (skill?.split && Array.isArray(skill.hits)) {
    fields.hits = skill.hits.map((h) => ({
      id: h.id,
      name: h.name || '',
      damageType: h.damageType || '',
      baseMult: Number.isFinite(h.baseMult) ? h.baseMult : parseFloat(h.baseMult) || 0,
      multCount: normalizeMultCount(h.multCount),
      multLocked: !!h.multLocked,
      energyRegen: normalizeEnergyRegen(h.energyRegen),
      scaleStat: h.scaleStat === 'hp' || h.scaleStat === 'def' ? h.scaleStat : 'atk',
      fixedDamage: !!h.fixedDamage,
    }));
  }
  if (skill?.roundSyncKey) {
    fields.roundSyncKey = skill.roundSyncKey;
    ['buffMode', 'buffActive', 'buffStacks', '_autoMatchedFalse', 'buffActiveSig', 'buffStacksSig'].forEach(key => {
      if (skill[key] !== undefined) fields[key] = JSON.parse(JSON.stringify(skill[key]));
    });
    if (fields.hits) fields.hits.forEach((hit, index) => {
      const source = skill.hits[index];
      if (source.roundSyncKey) hit.roundSyncKey = source.roundSyncKey;
      ['buffMode', 'buffActive', 'buffStacks', '_autoMatchedFalse', 'buffActiveSig', 'buffStacksSig'].forEach(key => {
        if (source[key] !== undefined) hit[key] = JSON.parse(JSON.stringify(source[key]));
      });
    });
  }
  return fields;
}

function axisFieldsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createEmptyResonanceAxis(catalog, phases) {
  const patches = {};
  for (let k = 1; k <= 6; k++) patches[String(k)] = { enabled: false, ops: [] };
  return {
    base: {
      rotationCatalog: cloneAxisCatalog(catalog),
      phases: cloneAxisPhases(phases),
    },
    editTarget: 0,
    patches,
  };
}

function normalizeResonanceAxis(raw, fallbackCatalog, fallbackPhases) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyResonanceAxis(fallbackCatalog, fallbackPhases);
  }
  const patches = {};
  for (let k = 1; k <= 6; k++) {
    const key = String(k);
    const src = raw.patches?.[key] || {};
    patches[key] = {
      enabled: !!src.enabled,
      ops: Array.isArray(src.ops) ? JSON.parse(JSON.stringify(src.ops)) : [],
    };
  }
  const baseCatalog = raw.base?.rotationCatalog;
  const basePhases = raw.base?.phases;
  const editTarget = Math.max(0, Math.min(6, Math.round(Number(raw.editTarget) || 0)));
  return {
    base: {
      rotationCatalog: cloneAxisCatalog(
        Array.isArray(baseCatalog) ? baseCatalog : fallbackCatalog || []
      ),
      phases: cloneAxisPhases(Array.isArray(basePhases) ? basePhases : fallbackPhases || []),
    },
    editTarget,
    patches,
  };
}

function cloneResonanceAxis(axis) {
  return normalizeResonanceAxis(axis);
}

function getResonanceAxisHolder(member) {
  if (!member) return null;
  if (member.cycleConfig?.enabled) {
    const idx = readActiveCycleRoundIndex(member);
    const round = member.cycleConfig.rounds?.[idx];
    if (round) return round;
  }
  return member;
}

function getResonanceAxisState(member) {
  const holder = getResonanceAxisHolder(member);
  return holder?.resonanceAxis || null;
}

function pickNonEmptyAxisList(primary, fallback) {
  return Array.isArray(primary) && primary.length ? primary : fallback;
}

function ensureResonanceAxis(member) {
  if (!member) return null;
  const holder = getResonanceAxisHolder(member);
  if (!holder) return null;
  // 轮次快照里空数组 [] 也是 truthy，不能用 || 回退，否则会把实况轴盖成空
  const fallbackCatalog =
    holder === member
      ? member.rotationCatalog
      : pickNonEmptyAxisList(holder.rotationCatalog, member.rotationCatalog);
  const fallbackPhases =
    holder === member
      ? member.phases
      : pickNonEmptyAxisList(holder.phases, member.phases);
  if (!holder.resonanceAxis) {
    holder.resonanceAxis = createEmptyResonanceAxis(
      fallbackCatalog || member.rotationCatalog,
      fallbackPhases || member.phases
    );
  } else {
    holder.resonanceAxis = normalizeResonanceAxis(
      holder.resonanceAxis,
      fallbackCatalog || member.rotationCatalog,
      fallbackPhases || member.phases
    );
  }
  if (holder !== member) member.resonanceAxis = holder.resonanceAxis;
  return holder.resonanceAxis;
}

function diffAxisCatalog(baseCatalog, liveCatalog) {
  const ops = [];
  const baseMap = new Map((baseCatalog || []).map((c) => [catalogAxisKey(c), c]));
  const liveMap = new Map((liveCatalog || []).map((c) => [catalogAxisKey(c), c]));
  baseMap.forEach((item, key) => {
    if (!liveMap.has(key)) ops.push({ op: 'remove', scope: 'catalog', key });
  });
  liveMap.forEach((item, key) => {
    if (!baseMap.has(key)) {
      ops.push({ op: 'add', scope: 'catalog', key, item: cloneAxisCatalogItem(item) });
      return;
    }
    const fields = catalogAxisFields(item);
    if (!axisFieldsEqual(fields, catalogAxisFields(baseMap.get(key)))) {
      ops.push({ op: 'update', scope: 'catalog', key, fields });
    }
  });
  const liveKeys = (liveCatalog || []).map(catalogAxisKey);
  const baseKeysKept = (baseCatalog || []).map(catalogAxisKey).filter((k) => liveMap.has(k));
  const expectedOrder = [...baseKeysKept, ...liveKeys.filter((k) => !baseMap.has(k))];
  if (liveKeys.join('\0') !== expectedOrder.join('\0') && liveKeys.length) {
    ops.push({ op: 'reorderCatalog', scope: 'catalog', keys: liveKeys });
  }
  return ops;
}

function diffAxisPhases(basePhases, livePhases) {
  const ops = [];
  const baseList = basePhases || [];
  const liveList = livePhases || [];
  const baseMap = new Map(baseList.map((p, i) => [phaseAxisKey(p, i), p]));
  const liveMap = new Map(liveList.map((p, i) => [phaseAxisKey(p, i), { phase: p, index: i }]));
  baseMap.forEach((phase, key) => {
    if (!liveMap.has(key)) ops.push({ op: 'removePhase', scope: 'phase', phaseKey: key });
  });
  liveList.forEach((phase, index) => {
    const key = phaseAxisKey(phase, index);
    if (!baseMap.has(key)) {
      ops.push({
        op: 'addPhase',
        scope: 'phase',
        phaseKey: key,
        phase: cloneAxisPhases([phase])[0],
      });
      return;
    }
    const basePhase = baseMap.get(key);
    const baseSkills = basePhase.skills || [];
    const liveSkills = phase.skills || [];
    const baseSkillMap = new Map(baseSkills.map((s) => [phaseSkillAxisKey(s), s]));
    const liveSkillMap = new Map(liveSkills.map((s) => [phaseSkillAxisKey(s), s]));
    baseSkillMap.forEach((skill, sk) => {
      if (!liveSkillMap.has(sk)) {
        ops.push({ op: 'remove', scope: 'phaseSkill', phaseKey: key, key: sk });
      }
    });
    liveSkills.forEach((skill) => {
      const sk = phaseSkillAxisKey(skill);
      if (!baseSkillMap.has(sk)) {
        ops.push({
          op: 'add',
          scope: 'phaseSkill',
          phaseKey: key,
          key: sk,
          item: JSON.parse(JSON.stringify(skill)),
        });
        return;
      }
      const fields = phaseSkillAxisFields(skill);
      if (!axisFieldsEqual(fields, phaseSkillAxisFields(baseSkillMap.get(sk)))) {
        ops.push({ op: 'update', scope: 'phaseSkill', phaseKey: key, key: sk, fields });
      }
    });
    const liveSkillKeys = liveSkills.map(phaseSkillAxisKey);
    const baseSkillKeysKept = baseSkills.map(phaseSkillAxisKey).filter((k) => liveSkillMap.has(k));
    const expected = [...baseSkillKeysKept, ...liveSkillKeys.filter((k) => !baseSkillMap.has(k))];
    if (liveSkillKeys.join('\0') !== expected.join('\0') && liveSkillKeys.length) {
      ops.push({
        op: 'reorderPhaseSkills',
        scope: 'phaseSkill',
        phaseKey: key,
        keys: liveSkillKeys,
      });
    }
    if ((phase.name || '') !== (basePhase.name || '')) {
      ops.push({
        op: 'updatePhase',
        scope: 'phase',
        phaseKey: key,
        fields: { name: phase.name || '' },
      });
    }
  });
  return ops;
}

function diffAxis(base, live) {
  return [
    ...diffAxisCatalog(base?.rotationCatalog, live?.rotationCatalog),
    ...diffAxisPhases(base?.phases, live?.phases),
  ];
}

function findPhaseByAxisKey(phases, phaseKey) {
  const list = phases || [];
  for (let i = 0; i < list.length; i++) {
    if (phaseAxisKey(list[i], i) === phaseKey) return list[i];
  }
  return null;
}

function applyAxisOps(axisSnapshot, ops) {
  const catalog = cloneAxisCatalog(axisSnapshot?.rotationCatalog);
  const phases = cloneAxisPhases(axisSnapshot?.phases);
  const catalogIndex = () => {
    const map = new Map();
    catalog.forEach((c, i) => map.set(catalogAxisKey(c), i));
    return map;
  };
  (ops || []).forEach((op) => {
    if (!op) return;
    if (op.scope === 'catalog' || (!op.scope && op.op !== 'addPhase' && op.op !== 'removePhase' && op.op !== 'updatePhase' && op.scope !== 'phaseSkill' && op.scope !== 'phase')) {
      if (op.op === 'remove') {
        const idx = catalog.findIndex((c) => catalogAxisKey(c) === op.key);
        if (idx >= 0) {
          const removed = catalog[idx];
          catalog.splice(idx, 1);
          phases.forEach((phase) => {
            phase.skills = (phase.skills || []).filter((s) => s.catalogId !== removed.id);
          });
        }
      } else if (op.op === 'add' && op.item) {
        if (!catalog.some((c) => catalogAxisKey(c) === (op.key || catalogAxisKey(op.item)))) {
          catalog.push(cloneAxisCatalogItem(op.item));
        }
      } else if (op.op === 'update' && op.fields) {
        const item = catalog.find((c) => catalogAxisKey(c) === op.key);
        if (item) Object.assign(item, op.fields);
      } else if (op.op === 'reorderCatalog' && Array.isArray(op.keys)) {
        const byKey = new Map(catalog.map((c) => [catalogAxisKey(c), c]));
        const next = [];
        op.keys.forEach((k) => {
          if (byKey.has(k)) {
            next.push(byKey.get(k));
            byKey.delete(k);
          }
        });
        byKey.forEach((c) => next.push(c));
        catalog.length = 0;
        catalog.push(...next);
      }
      return;
    }
    if (op.op === 'removePhase') {
      const idx = phases.findIndex((p, i) => phaseAxisKey(p, i) === op.phaseKey);
      if (idx >= 0) phases.splice(idx, 1);
      return;
    }
    if (op.op === 'addPhase' && op.phase) {
      if (!findPhaseByAxisKey(phases, op.phaseKey)) {
        phases.push(JSON.parse(JSON.stringify(op.phase)));
      }
      return;
    }
    if (op.op === 'updatePhase' && op.fields) {
      const phase = findPhaseByAxisKey(phases, op.phaseKey);
      if (phase && op.fields.name !== undefined) phase.name = op.fields.name;
      return;
    }
    if (op.scope === 'phaseSkill') {
      const phase = findPhaseByAxisKey(phases, op.phaseKey);
      if (!phase) return;
      if (!Array.isArray(phase.skills)) phase.skills = [];
      if (op.op === 'remove') {
        phase.skills = phase.skills.filter((s) => phaseSkillAxisKey(s) !== op.key);
      } else if (op.op === 'add' && op.item) {
        if (!phase.skills.some((s) => phaseSkillAxisKey(s) === op.key)) {
          phase.skills.push(JSON.parse(JSON.stringify(op.item)));
        }
      } else if (op.op === 'update' && op.fields) {
        const skill = phase.skills.find((s) => phaseSkillAxisKey(s) === op.key);
        if (!skill) return;
        Object.keys(op.fields).forEach((fk) => {
          if (fk === 'hits' && Array.isArray(op.fields.hits)) {
            skill.hits = JSON.parse(JSON.stringify(op.fields.hits));
          } else {
            skill[fk] = op.fields[fk];
          }
        });
      } else if (op.op === 'reorderPhaseSkills' && Array.isArray(op.keys)) {
        const byKey = new Map(phase.skills.map((s) => [phaseSkillAxisKey(s), s]));
        const next = [];
        op.keys.forEach((k) => {
          if (byKey.has(k)) {
            next.push(byKey.get(k));
            byKey.delete(k);
          }
        });
        byKey.forEach((s) => next.push(s));
        phase.skills = next;
      }
    }
  });
  void catalogIndex;
  return { rotationCatalog: catalog, phases };
}

function buildResonanceAxisView(axis, mode) {
  const normalized = normalizeResonanceAxis(axis);
  let result = {
    rotationCatalog: cloneAxisCatalog(normalized.base.rotationCatalog),
    phases: cloneAxisPhases(normalized.base.phases),
  };
  if (mode === 'edit') {
    if (normalized.editTarget > 0) {
      const patch = normalized.patches[String(normalized.editTarget)];
      if (patch?.ops?.length) result = applyAxisOps(result, patch.ops);
    }
    return result;
  }
  for (let k = 1; k <= 6; k++) {
    const patch = normalized.patches[String(k)];
    if (patch?.enabled && patch.ops?.length) {
      result = applyAxisOps(result, patch.ops);
    }
  }
  return result;
}

function materializeResonanceAxis(member, opts = {}) {
  if (!member) return;
  const axis = ensureResonanceAxis(member);
  if (!axis) return;
  const mode = opts.mode === 'damage' ? 'damage' : 'edit';
  const view = buildResonanceAxisView(axis, mode);
  member.rotationCatalog = cloneAxisCatalog(view.rotationCatalog);
  member.phases = cloneAxisPhases(view.phases);
  if (!member.cycleConfig?.enabled) {
    // non-cycle: keep stackLayers on catalog items
  } else {
    member.rotationCatalog.forEach((c) => {
      delete c.stackLayers;
    });
  }
}

function commitResonanceAxisEdit(member) {
  if (!member || member._resonanceAxisApplying) return;
  const axis = ensureResonanceAxis(member);
  if (!axis) return;
  const live = {
    rotationCatalog: cloneAxisCatalog(member.rotationCatalog),
    phases: cloneAxisPhases(member.phases),
  };
  if (axis.editTarget === 0) {
    axis.base = live;
  } else {
    const key = String(axis.editTarget);
    if (!axis.patches[key]) axis.patches[key] = { enabled: false, ops: [] };
    axis.patches[key].ops = diffAxis(axis.base, live);
  }
  const holder = getResonanceAxisHolder(member);
  if (holder) holder.resonanceAxis = axis;
  if (holder !== member) member.resonanceAxis = axis;
}

function setResonanceAxisEditTarget(member, target) {
  if (!member) return;
  commitResonanceAxisEdit(member);
  const axis = ensureResonanceAxis(member);
  axis.editTarget = Math.max(0, Math.min(6, Math.round(Number(target) || 0)));
  member._resonanceAxisApplying = true;
  try {
    materializeResonanceAxis(member, { mode: 'edit' });
  } finally {
    delete member._resonanceAxisApplying;
  }
  persistCycleEditingIfEnabled(member);
}

function getResonanceUnlockedFromAxisPatches(axis) {
  let max = 0;
  for (let k = 1; k <= 6; k++) {
    if (axis?.patches?.[String(k)]?.enabled) max = k;
  }
  return max;
}

/** 以 resonanceUnlocked（紧凑链位）为准，把轴增量勾选 1..N 对齐，避免加载时被空 patches 刷回 0 */
function syncResonanceAxisPatchesFromUnlocked(member) {
  if (!member) return;
  const axis = ensureResonanceAxis(member);
  const n = normalizeResonanceUnlocked(member.resonanceUnlocked);
  for (let k = 1; k <= 6; k += 1) {
    const key = String(k);
    if (!axis.patches[key]) axis.patches[key] = { enabled: false, ops: [] };
    axis.patches[key].enabled = k <= n;
  }
  const holder = getResonanceAxisHolder(member);
  if (holder) holder.resonanceAxis = axis;
  if (holder !== member) member.resonanceAxis = axis;
  if (typeof persistCycleEditingIfEnabled === 'function') persistCycleEditingIfEnabled(member);
}

function syncResonanceUnlockedFromAxisPatches(member, opts = {}) {
  if (!member) return;
  const axis = ensureResonanceAxis(member);
  const next = getResonanceUnlockedFromAxisPatches(axis);
  if (normalizeResonanceUnlocked(member.resonanceUnlocked) === next) {
    if (opts.compute !== false) computeAll();
    return;
  }
  setMemberResonanceUnlocked(member, next, { record: false, compute: opts.compute !== false });
}

function setResonanceAxisPatchEnabled(member, chain, enabled) {
  if (!member) return;
  commitResonanceAxisEdit(member);
  const axis = ensureResonanceAxis(member);
  const key = String(Math.max(1, Math.min(6, Math.round(Number(chain) || 1))));
  if (!axis.patches[key]) axis.patches[key] = { enabled: false, ops: [] };
  axis.patches[key].enabled = !!enabled;
  const holder = getResonanceAxisHolder(member);
  if (holder) holder.resonanceAxis = axis;
  persistCycleEditingIfEnabled(member);
  syncResonanceUnlockedFromAxisPatches(member, { compute: false });
}

function saveResonanceChainDamageSnapshot(member) {
  if (!member) return;
  commitResonanceAxisEdit(member);
  computeAll();
  recordResonanceChainDamage(member);
}

function resonanceAxisPatchHasOps(axis, chain) {
  const ops = axis?.patches?.[String(chain)]?.ops;
  return Array.isArray(ops) && ops.length > 0;
}

function withResonanceAxisDamageView(member, fn) {
  const axis = getResonanceAxisState(member) || ensureResonanceAxis(member);
  if (!axis) return fn();
  const editView = buildResonanceAxisView(axis, 'edit');
  const dmgView = buildResonanceAxisView(axis, 'damage');
  if (axisFieldsEqual(
    { c: editView.rotationCatalog.map(catalogAxisFields), p: editView.phases.map((ph) => ({ id: ph.id, skills: (ph.skills || []).map(phaseSkillAxisFields) })) },
    { c: dmgView.rotationCatalog.map(catalogAxisFields), p: dmgView.phases.map((ph) => ({ id: ph.id, skills: (ph.skills || []).map(phaseSkillAxisFields) })) }
  )) {
    return fn();
  }
  const savedCatalog = member.rotationCatalog;
  const savedPhases = member.phases;
  member._resonanceAxisApplying = true;
  try {
    member.rotationCatalog = cloneAxisCatalog(dmgView.rotationCatalog);
    member.phases = cloneAxisPhases(dmgView.phases);
    return fn();
  } finally {
    member.rotationCatalog = savedCatalog;
    member.phases = savedPhases;
    delete member._resonanceAxisApplying;
  }
}

function renderResonanceAxisPatchBoard(member) {
  const axis = ensureResonanceAxis(member);
  const target = axis.editTarget || 0;
  const res = normalizeResonanceUnlocked(member.resonanceUnlocked);
  const baseBtn = `<button type="button" class="btn sm${target === 0 ? ' primary' : ''}" data-resonance-axis-edit="0" title="编辑 0 链底轴（改底轴会改变各链叠后结果，但不删除各链增量）">编辑底轴</button>`;
  const rows = [1, 2, 3, 4, 5, 6]
    .map((k) => {
      const patch = axis.patches[String(k)] || { enabled: false, ops: [] };
      const hasOps = resonanceAxisPatchHasOps(axis, k);
      const editing = target === k;
      const current = res === k;
      return `<div class="resonance-axis-row${current ? ' current' : ''}">
        <label class="resonance-chain-check" title="勾选后按该链 Buff/公式演算，并叠上所有已勾选链的轴增量">
          <input type="checkbox" data-resonance-axis-enable="${k}" ${patch.enabled ? 'checked' : ''}/>
          ${k}链
        </label>
        <button type="button" class="btn sm${editing ? ' primary' : ''}" data-resonance-axis-edit="${k}" title="编辑相对底轴的轴增减（不影响底轴本身）">编辑轴</button>
        ${hasOps ? '<span class="resonance-axis-mark" title="已有轴增量">有改动</span>' : '<span class="resonance-axis-mark muted">—</span>'}
      </div>`;
    })
    .join('');
  return `
    <div class="resonance-axis-board">
      <div class="resonance-axis-head">
        <strong>共鸣链 / 轴增量</strong>
        <span class="resonance-chain-current">${target === 0 ? '正在编辑底轴' : `正在编辑 ${target} 链轴`}</span>
      </div>
      <div class="resonance-axis-base-row">${baseBtn}</div>
      <div class="resonance-axis-rows">${rows}</div>
      <p class="hint" style="margin:0">勾选=按最高勾选链演算（含低链 Buff）并叠轴增量。改底轴会影响叠后有效轴，不删各链增量。</p>
    </div>`;
}

function renderResonanceChainBoard(member) {
  const res = normalizeResonanceUnlocked(member.resonanceUnlocked);
  const btns = [0, 1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `<button type="button" class="resonance-chip${res === n ? ' active' : ''}" data-set-resonance="${n}" title="${n === 0 ? '0链（未解锁共鸣链）' : `按 ${n} 链演算`}">${n === 0 ? 'R0' : `R${n}`}</button>`
    )
    .join('');
  return `
    <div class="resonance-chain-compact setup-chip-board">
      <div class="resonance-chain-checks-head">
        <span>共鸣链</span>
        <span class="resonance-chain-current">${res}链</span>
      </div>
      <div class="resonance-chip-row">${btns}</div>
    </div>`;
}

function renderWeaponRefDmgBoard(member) {
  const sel = member.weaponSelection || defaultWeaponSelection();
  const weaponDef = findWeaponDef(sel.id);
  const currentR = normalizeWeaponRefinement(sel.refinement);
  const refDisabled = weaponDef ? '' : 'disabled';
  const refBtns = WEAPON_REFINEMENT_OPTIONS.map(
    (n) =>
      `<button type="button" class="resonance-chip${sel.refinement === n ? ' active' : ''}" data-weapon-refinement-btn="${n}" ${refDisabled} title="精炼 ${n}">R${n}</button>`
  ).join('');
  return `
    <div class="resonance-chain-compact weapon-ref-compact setup-chip-board">
      <div class="resonance-chain-checks-head">
        <span>精炼</span>
        <span class="resonance-chain-current">${weaponDef ? `R${currentR}` : '未选'}</span>
      </div>
      <div class="resonance-chip-row">${refBtns}</div>
    </div>`;
}

function getCharCombatModeConfig(charId) {
  if (charId == null || charId === '') return null;
  return CHAR_COMBAT_MODE_CONFIG[String(charId)] || null;
}

function getCombatModeLabel(modeId) {
  return COMBAT_MODE_DEFS[modeId]?.label || String(modeId || '');
}

/** 集谐 / 集谐·响应：共用集谐易伤计算 */
function isConvergenceLikeCombatMode(modeId) {
  return modeId === 'convergence' || modeId === 'convergenceResponse';
}

function normalizeCombatModeId(modeId, cfg) {
  if (!cfg?.modes?.length) return null;
  const id = String(modeId || '');
  if (cfg.modes.includes(id)) return id;
  if (cfg.modes.includes(cfg.defaultMode)) return cfg.defaultMode;
  return cfg.modes[0];
}

/** 按角色配置同步战斗模态；集谐态启用现有集谐易伤 Buff */
function syncMemberCombatModeState(member, opts = {}) {
  if (!member) return;
  const cfg = getCharCombatModeConfig(member.characterId);
  const forceDefault = !!opts.forceDefault;
  if (!cfg) {
    member.combatMode = null;
    member.convergenceMode = false;
    ensureConvergenceModeBuff(member);
    syncAmisCombatModeKit(member);
    syncCombatModeSkillDamageTypes(member);
    return;
  }
  let mode = forceDefault ? null : member.combatMode;
  if (!cfg.modes.includes(mode)) {
    if (!forceDefault && member.convergenceMode) {
      const convLike = cfg.modes.find((m) => isConvergenceLikeCombatMode(m));
      mode = convLike || normalizeCombatModeId(cfg.defaultMode, cfg);
    } else {
      mode = normalizeCombatModeId(cfg.defaultMode, cfg);
    }
  }
  if (cfg.fixed) mode = cfg.modes[0];
  member.combatMode = mode;
  member.convergenceMode = isConvergenceLikeCombatMode(mode);
  ensureConvergenceModeBuff(member);
  syncAmisCombatModeKit(member);
  syncSpecialSkillLibraryMults(member);
  syncCombatModeSkillDamageTypes(member);
}

function setMemberCombatMode(member, modeId) {
  if (!member) return false;
  const cfg = getCharCombatModeConfig(member.characterId);
  if (!cfg || cfg.fixed) return false;
  const next = normalizeCombatModeId(modeId, cfg);
  if (!next || next === member.combatMode) return false;
  member.combatMode = next;
  member.convergenceMode = isConvergenceLikeCombatMode(next);
  ensureConvergenceModeBuff(member);
  syncAmisCombatModeKit(member);
  syncSpecialSkillLibraryMults(member);
  // 模态切换：重套模板（含 combatModes 下该模态专属 Buff）
  if (member.characterId) applyCharacterBuffTemplate(member, member.characterId);
  syncCombatModeSkillDamageTypes(member);
  syncPersonalEffectBuffsAfterMemberChange(member);
  return true;
}

function renderCombatModeControls(member) {
  const cfg = getCharCombatModeConfig(member?.characterId);
  if (!cfg) return '';
  const mode = normalizeCombatModeId(member.combatMode, cfg);
  const modeButtons = cfg.modes
    .map((id) => {
      const active = id === mode;
      const label = getCombatModeLabel(id);
      if (cfg.fixed) {
        return `<button type="button" class="btn sm primary" disabled title="该角色固定为此模态">${label}模态</button>`;
      }
      return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-set-combat-mode="${id}" title="切换至${label}模态">${label}</button>`;
    })
    .join('');
  const title =
    isConvergenceLikeCombatMode(mode)
      ? '易伤 = 层数 × 谐度破坏增幅总和 × 0.12%'
      : String(member.characterId) === AMIS_CHAR_ID
        ? '爱弥斯固有2随模态切换写入个人 Buff；分支面板固定攻击12%/暴击8%'
        : String(member.characterId) === DANIA_CHAR_ID && mode === 'burst'
          ? '聚爆模态写入全队【达妮娅·聚爆加深】效应·聚爆加深+60%；切走模态/角色后自动清除'
          : String(member.characterId) === MONING_CHAR_ID && mode === 'shockResponse'
            ? '震谐·响应下特殊技能库显示【莫宁·响应震谐】，可手动加入'
            : String(member.characterId) === '1109'
              ? '洛瑟菈：霜渐模态下遗忘/历历在目/断舍离为普攻，声骸模态下为声骸'
              : String(member.characterId) === PHOEBE_CHAR_ID
                ? '菲比混合编轴：角色默认模态供「继承」；阶段可指定赦罪/告解（本阶段技能默认继承）；单技能可再覆盖。计算时读取模板中对应模态的 Buff。'
                : '该模态计算规则尚未录入，切换仅作标记';
  return `
    <div class="combat-mode-bar setup-combat-mode" title="${escapeTooltip(title)}">
      <div class="setup-combat-mode-main">
        <span class="setup-combat-mode-label">战斗模态：</span>
        <div class="setup-chip-row">${modeButtons}</div>
      </div>
    </div>`;
}

function supportsPhoebeHybridCombatMode(member) {
  return String(member?.characterId || '') === PHOEBE_CHAR_ID;
}

/** 空=继承；仅承认菲比双模态 id */
function normalizePhoebeOverrideCombatMode(raw) {
  const id = String(raw || '').trim();
  return PHOEBE_HYBRID_COMBAT_MODES.includes(id) ? id : '';
}

function findPhaseForTimelineUnit(member, unit, parentSkill) {
  if (!member?.phases?.length) return null;
  const skill = parentSkill || unit;
  const skillId = skill?.id;
  const unitId = unit?.id;
  for (const phase of member.phases) {
    for (const s of phase.skills || []) {
      if (skillId && s.id === skillId) return phase;
      if (unitId && s.id === unitId) return phase;
      if (unitId && (s.hits || []).some((h) => h.id === unitId)) return phase;
    }
  }
  return null;
}

/**
 * 菲比技能结算模态：技能显式 > 阶段 > 角色默认。
 * 非菲比返回 null。
 */
function resolvePhoebeCombatMode(unit, parentSkill, member, phase) {
  if (!supportsPhoebeHybridCombatMode(member)) return null;
  const skill = parentSkill || unit;
  const skillMode = normalizePhoebeOverrideCombatMode(skill?.combatMode);
  if (skillMode) return skillMode;
  const ph = phase || findPhaseForTimelineUnit(member, unit, parentSkill);
  const phaseMode = normalizePhoebeOverrideCombatMode(ph?.combatMode);
  if (phaseMode) return phaseMode;
  return normalizeCombatModeId(member.combatMode, getCharCombatModeConfig(PHOEBE_CHAR_ID));
}

function getPhoebeDefaultCombatModeLabel(member) {
  const mode = normalizeCombatModeId(member?.combatMode, getCharCombatModeConfig(PHOEBE_CHAR_ID));
  return getCombatModeLabel(mode);
}

function renderPhasePhoebeCombatModeSelect(phase, member) {
  if (!supportsPhoebeHybridCombatMode(member) || !phase) return '';
  const cur = normalizePhoebeOverrideCombatMode(phase.combatMode);
  const defLabel = getPhoebeDefaultCombatModeLabel(member);
  const opts = [
    `<option value="" ${!cur ? 'selected' : ''}>继承角色（${escapeHtml(defLabel)}）</option>`,
    ...PHOEBE_HYBRID_COMBAT_MODES.map(
      (id) =>
        `<option value="${id}" ${cur === id ? 'selected' : ''}>${escapeHtml(getCombatModeLabel(id))}</option>`
    ),
  ];
  return `<select class="mode-select phoebe-phase-mode" data-phase-combat-mode="${phase.id}" title="本阶段战斗模态：本阶段技能默认继承；技能可再单独覆盖">${opts.join('')}</select>`;
}

function renderSkillPhoebeCombatModeSelect(skill, phase, member, locked) {
  if (!supportsPhoebeHybridCombatMode(member) || !skill) return '';
  const cur = normalizePhoebeOverrideCombatMode(skill.combatMode);
  const phaseMode = normalizePhoebeOverrideCombatMode(phase?.combatMode);
  const inheritLabel = phaseMode
    ? `继承阶段（${getCombatModeLabel(phaseMode)}）`
    : `继承（${getPhoebeDefaultCombatModeLabel(member)}）`;
  const dis = locked ? 'disabled' : '';
  const btn = (value, label, title) => {
    const active = value === cur;
    return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-set-skill-combat-mode="${skill.id}" data-combat-mode="${value}" title="${escapeHtml(title)}" ${dis}>${escapeHtml(label)}</button>`;
  };
  return `
        <div class="phoebe-mode-skill-btns" title="本技能战斗模态（影响模板模态 Buff）">
          ${btn('', '继承', inheritLabel)}
          ${btn('absolution', '赦罪', '赦罪模态')}
          ${btn('confession', '告解', '告解模态')}
        </div>`;
}

/** 模态限定 Buff：仅在结算模态匹配时计入 */
function buffMatchesResolvedCombatMode(buff, opts) {
  const scope = String(buff?.combatModeKey || '').trim();
  if (!scope) return true;
  // 菲比编轴：技能已解析出明确模态
  if (opts?.combatMode) return scope === opts.combatMode;
  const member = opts?.member;
  if (member?.combatMode && String(member.combatMode) === scope) return true;
  // 全队镜像：按来源角色当前默认模态判定（非混合技能结算）
  const srcId = String(buff.sourceCharacterId || '').trim();
  if (srcId) {
    const srcMember = (state.members || []).find((m) => String(m?.characterId || '') === srcId);
    if (srcMember) return String(srcMember.combatMode || '') === scope;
  }
  if (supportsPhoebeHybridCombatMode(member)) {
    return (
      scope === normalizeCombatModeId(member.combatMode, getCharCombatModeConfig(PHOEBE_CHAR_ID))
    );
  }
  return true;
}

function renderSetupSecTitle(label) {
  return `<div class="setup-sec-title"><span class="setup-sec-mark" aria-hidden="true"></span><span>${escapeHtml(label)}</span></div>`;
}

function renderBuildHeroChar(member) {
  const charDef = member.characterId ? findCharSkillDef(member.characterId) : null;
  const portrait = charDef
    ? renderCharAvatarCard(charDef, { plain: true })
    : '<div class="char-avatar-card build-hero-empty is-plain"><span class="char-avatar-fallback">+</span></div>';
  const name = charDef?.name || '未选择角色';
  const metaBadges = typeof renderCharMetaBadges === 'function' ? renderCharMetaBadges(charDef) : '';
  return `
    <section class="setup-sec setup-sec-char">
      ${renderSetupSecTitle('角色属性')}
      <div class="setup-sec-body">
        <div class="setup-pick-card-wrap">
          <button type="button" class="build-hero-card setup-pick-card" data-build-open-modal="char" title="点击选择角色">
            ${portrait}
            <div class="build-hero-meta">
              <strong class="build-hero-name">${escapeHtml(name)}</strong>
              ${metaBadges}
            </div>
          </button>
          ${renderCombatModeControls(member)}
        </div>
        ${window.__WC.characterLevels?.controls(member) || ''}
        ${renderBrantLifeModeControls(member)}
        ${renderResonanceChainBoard(member)}
      </div>
    </section>`;
}

function renderBrantLifeModeControls(member) {
  if (String(member?.characterId) !== BRANT_CHAR_ID) return '';
  const mech = getSpecialMechanicsForMember(member) || defaultBrantSpecialMechanics();
  const mode = normalizeBrantLifeMode(member.brantLifeMode);
  const info = describeBrantErFlatAtk(member, mode);
  const modeButtons = [BRANT_LIFE_PLAY, BRANT_LIFE_MY]
    .map((id) => {
      const label = getBrantLifeModeLabel(id, mech);
      const active = id === mode;
      return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-set-brant-life="${id}" title="默认形态：${label}">${escapeHtml(label)}</button>`;
    })
    .join('');
  const detail = `共鸣效率 ${info.er.toFixed(1)}% · 超额 ${info.excess.toFixed(1)}% · 固定攻 +${Math.round(info.flat)}${info.capped ? '（已达上限）' : ''}`;
  return `
    <div class="combat-mode-bar brant-life-bar" style="margin-top:0.45rem;display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;padding:0.4rem 0.5rem;border:1px solid rgba(230,180,34,0.4);border-radius:8px;background:rgba(230,180,34,0.08)">
      <span class="hint" style="margin:0;color:#e6b422;font-weight:600">人生形态</span>
      ${modeButtons}
      <span class="hint" style="margin:0" title="${escapeTooltip('默认供编轴技能「继承」；技能可单独改成戏中人生/我的人生')}">${escapeHtml(detail)}</span>
    </div>`;
}

function renderSkillBrantLifeSelect(skill, member, locked) {
  if (String(member?.characterId) !== BRANT_CHAR_ID) return '';
  const mech = getSpecialMechanicsForMember(member) || defaultBrantSpecialMechanics();
  const defLabel = getBrantLifeModeLabel(member.brantLifeMode, mech);
  const cur =
    skill.brantLifeMode === BRANT_LIFE_PLAY || skill.brantLifeMode === BRANT_LIFE_MY
      ? skill.brantLifeMode
      : '';
  const dis = locked ? 'disabled' : '';
  const btn = (value, label, title) => {
    const active = value === cur;
    return `<button type="button" class="btn sm${active ? ' primary' : ''}" data-set-skill-brant-life="${skill.id}" data-brant-life="${value}" title="${escapeHtml(title)}" ${dis}>${escapeHtml(label)}</button>`;
  };
  return `
        <div class="brant-life-skill-btns" title="本技能人生形态（影响共鸣效率转固定攻击）">
          ${btn('', '继承', `继承角色默认：${defLabel}`)}
          ${btn(BRANT_LIFE_PLAY, '戏中', '戏中人生')}
          ${btn(BRANT_LIFE_MY, '我的', '我的人生')}
        </div>`;
}

function renderBuildHeroWeapon(member) {
  const sel = member.weaponSelection || defaultWeaponSelection();
  const weaponDef = findWeaponDef(sel.id);
  const iconUrl = weaponDef ? getWeaponDefIconUrl(weaponDef) : '';
  const iconRemote = weaponDef ? getWeaponDefIconRemoteUrl(weaponDef) : '';
  const remoteAttr = iconRemote && iconRemote !== iconUrl ? ` data-remote="${iconRemote}"` : '';
  const atkVal = weaponDef
    ? weaponDef.baseAtk90 || Math.round(Number(member.char?.weaponAtk) || 0) || '—'
    : '';
  const mainStat = weaponDef ? `主：攻击 ${atkVal}` : '';
  const subStat = weaponDef ? `副：${formatWeaponSubStatBrief(weaponDef.subStat)}` : '';
  return `
    <section class="setup-sec setup-sec-weapon">
      ${renderSetupSecTitle('武器属性')}
      <div class="setup-sec-body">
        <button type="button" class="build-hero-card setup-pick-card" data-build-open-modal="weapon" title="点击选择武器">
          <span class="build-weapon-icon">${
            iconUrl
              ? `<img src="${iconUrl}" alt="" loading="lazy"${remoteAttr} onerror="handleWeaponIconError(this)" />`
              : '<span class="build-weapon-ph">+</span>'
          }</span>
          <div class="build-hero-meta">
            <strong class="build-hero-name">${escapeHtml(weaponDef?.name || '未选择武器')}</strong>
            ${mainStat ? `<span class="build-hero-stat-line">${escapeHtml(mainStat)}</span>` : ''}
            ${subStat ? `<span class="build-hero-stat-line is-weapon-sub">${escapeHtml(subStat)}</span>` : ''}
          </div>
        </button>
        ${renderWeaponRefDmgBoard(member)}
      </div>
    </section>`;
}

function renderBuildHeroMid(_member) {
  return '';
}

function renderBuildEchoSection(member) {
  ensureEchoConfig(member);
  ensureEchoActiveSlot(member);
  syncEchoLoadout(member);
  const config = member.echoConfig;
  const layoutKey = getBuildLayoutKey(config);
  const costTotal = getEchoCostTotal(config);
  const costClass = costTotal > ECHO_COST_CAP ? ' over' : '';
  const agg = aggregateEchoStats(member);
  const mainIdx = Number.isInteger(config.mainSlotIndex) ? config.mainSlotIndex : 0;
  const layoutBtns = Object.keys(ECHO_LAYOUTS)
    .map(
      (k) =>
        `<button type="button" class="resonance-chip${layoutKey === k ? ' active' : ''}" data-echo-layout-btn="${k}">${ECHO_LAYOUTS[k].label}</button>`
    )
    .join('');
  const subTplBtns = renderEchoSubTemplateButtons(member).replaceAll(
    /class="btn sm( primary)?"/g,
    (_m, primary) => `class="resonance-chip${primary ? ' active' : ''}"`
  );
  const mainSlotBtns = config.slots
    .map(
      (s, i) =>
        `<button type="button" class="resonance-chip${i === mainIdx ? ' active' : ''}" data-echo-main-slot="${i}" title="将 ${s.cost}C 槽设为主位">${s.cost}C</button>`
    )
    .join('');
  const slotsHtml = config.slots.map((slot, i) => renderBuildSlotCard(member, slot, i)).join('');
  return `
    <section class="setup-sec setup-sec-echo">
      <div class="setup-echo-heading">${renderSetupSecTitle('声骸信息')}<button type="button" class="setup-kuro-entry" data-setup-kuro-import>登录库街区导入声骸</button></div>
      <div class="setup-sec-body build-echo-block">
        <div class="build-controls compact setup-echo-controls">
          <div class="setup-echo-ctrl-row">
            <span class="setup-echo-ctrl-label">COST模板</span>
            <div class="setup-chip-row">${layoutBtns}<span class="echo-cost-badge${costClass}">${costTotal}/${ECHO_COST_CAP}</span></div>
          </div>
          <div class="setup-echo-ctrl-row">
            <span class="setup-echo-ctrl-label">词条模板</span>
            <div class="setup-chip-row">${subTplBtns || '<span class="hint">暂无</span>'}</div>
          </div>
          <div class="setup-echo-ctrl-row">
            <span class="setup-echo-ctrl-label">选择主位</span>
            <div class="setup-chip-row">
              ${mainSlotBtns}
              <button type="button" class="resonance-chip" data-build-open-modal="mainEcho" title="打开主位声骸选择">选声骸</button>
            </div>
          </div>
          ${renderBuildSetRows(member)}
        </div>
        <div class="build-slots build-slots-stack">${slotsHtml}</div>
        <div class="echo-summary compact">
          <div data-echo-summary-line>${formatEchoSummaryLine(agg, member)}</div>
          <div class="echo-set-summary-block">${renderEchoActiveSetsSummary(member)}</div>
        </div>
      </div>
    </section>`;
}

function renderBuildPanel(member, memberIndex = 0) {
  ensureMemberUiState(member, { light: true });
  // 配装页固定声骸；个人 Buff 来源改到「Buff检查」
  member.setupLowerTab = 'echo';
  const charDef = member.characterId ? findCharSkillDef(member.characterId) : null;
  const chipLabel = charDef?.name || '未选择';
  const elDef = charDef ? ELEMENT_TYPES[charDef.element] : null;
  const elIconUrl = charDef && typeof getElementIconUrl === 'function' ? getElementIconUrl(charDef.element) : '';
  const elRemote =
    charDef && NANOKA_ELEMENT_ICON_PATHS[charDef.element]
      ? nanokaAssetUrl(NANOKA_ELEMENT_ICON_PATHS[charDef.element])
      : '';
  const elRemoteAttr = elRemote && elRemote !== elIconUrl ? ` data-remote="${escapeHtml(elRemote)}"` : '';
  const chipElIcon = elIconUrl
    ? `<img class="setup-member-chip-el" src="${escapeHtml(elIconUrl)}" alt="" loading="lazy"${elRemoteAttr} onerror="handleWeaponIconError(this)" />`
    : elDef
      ? `<span class="setup-member-chip-el fallback" style="background:${elDef.color}">${escapeHtml(elDef.icon)}</span>`
      : '';
  const showModal = state.team.activeIndex === memberIndex ? renderBuildModal(member) : '';
  return `
    <div class="panel build-panel setup-member-col" data-setup-member="${memberIndex}">
      <div class="setup-member-col-head">
        <div class="setup-member-col-title">
          <strong>角色 ${memberIndex + 1}</strong>
          <button type="button" class="setup-member-chip" data-build-open-modal="char" title="选择角色">
            ${chipElIcon}
            <span class="setup-member-chip-name">${escapeHtml(chipLabel)}</span>
          </button>
          <button type="button" class="setup-clear-member" data-clear-member title="清空该角色所有基础信息">清空内容</button>
        </div>
        <span class="setup-member-dmg" title="该角色单人总伤">
          <img class="setup-member-dmg-icon" src="assets/icons/panel/total-dmg.png" alt="" />
          <span class="setup-member-dmg-label">单人总伤</span>
          <span class="setup-member-dmg-value">${fmt(member.results?.total || 0)}</span>
        </span>
      </div>
      <div class="setup-member-upper">
        <div class="setup-member-upper-left">
          ${renderBuildHeroChar(member)}
          ${renderBuildHeroWeapon(member)}
        </div>
        <div class="setup-member-upper-right build-hero-panel">
          ${renderBuildPanelSummary(member)}
        </div>
      </div>
      <div class="setup-lower-body">${renderBuildEchoSection(member)}</div>
      ${showModal}
    </div>`;
}

function renderEchoSetOptions(selectedId) {
  const sets = getEchoSetsSorted();
  const empty = `<option value="">— 选择套装 —</option>`;
  const opts = sets
    .map((s) => `<option value="${escapeHtml(String(s.id))}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  return empty + opts;
}

function renderEchoSpecimenOptions(member, slot, slotIndex) {
  const list = getSpecimensForEchoSlot(member, slot, slot.activeSetId);
  const empty = `<option value="">— 主位声骸（可选）—</option>`;
  if (slot.activeSetId && !list.length) {
    const hasManual = !!(echoSetMainMapDb?.sets && echoSetMainMapDb.sets[String(slot.activeSetId)]?.length);
    const hint = hasManual
      ? `该套装暂无 ${slot.cost}C 主位（请检查映射）`
      : `该套装暂无白名单主位（${slot.cost}C）；可在 echo-set-main-map.json 配置`;
    return empty + `<option value="" disabled>${hint}</option>`;
  }
  const opts = list
    .map(
      (sp) =>
        `<option value="${escapeHtml(String(sp.id))}" ${String(sp.id) === String(slot.echoId) ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`
    )
    .join('');
  return empty + opts;
}

function renderEchoSlotSetPanel(member, slot, slotIndex) {
  const cfg = member.echoConfig;
  const mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
  const isMain = slotIndex === mainIdx;
  const showSpecimen = isMain && (slot.cost === 4 || slot.cost === 3);
  const specimen = slot.echoId ? findEchoSpecimen(slot.echoId) : null;
  const preview = specimen?.skillResolved
    ? `<div class="echo-set-preview hint">${escapeHtml(String(specimen.skillResolved).split('\n')[0])}</div>`
    : '';
  return `
    <div class="echo-set-row">
      <label class="hint">① 套装效果</label>
      <select class="echo-field-select" data-echo-active-set="${slotIndex}">${renderEchoSetOptions(slot.activeSetId)}</select>
    </div>
    ${
      showSpecimen
        ? `<div class="echo-set-row">
      <label class="hint">② 主位声骸</label>
      <select class="echo-field-select" data-echo-specimen="${slotIndex}" ${slot.activeSetId ? '' : 'disabled'}>${renderEchoSpecimenOptions(member, slot, slotIndex)}</select>
      <button type="button" class="btn sm${isMain ? ' primary' : ''}" data-echo-main-slot="${slotIndex}">${isMain ? '当前主位' : '设为主位'}</button>
    </div>${preview}`
        : `<div class="echo-set-row"><button type="button" class="btn sm${isMain ? ' primary' : ''}" data-echo-main-slot="${slotIndex}">${isMain ? '当前主位' : '设为主位'}</button></div>`
    }`;
}

function renderEchoActiveSetsSummary(member) {
  const lines = getActiveEchoSetSummary(member);
  const mainEffects = getActiveEchoMainEffectSummary(member);
  if (!lines.length && !mainEffects.length) return '<div class="hint">尚未选择套装效果</div>';
  const setHtml = lines
    .map((row) => {
      const tierLabel = row.tiers.length ? row.tiers.map((t) => `${t}件`).join('+') : '未激活';
      const tierBlocks = (row.tierDetails || [])
        .map(
          (tier) =>
            `<div class="echo-set-active-tier">
          <div class="echo-set-active-tier-head">${tier.tier}件 · ${escapeHtml(tier.desc)}</div>
          ${renderEchoActiveEffectLines(tier.effects)}
        </div>`
        )
        .join('');
      return `<div class="echo-set-active-block">
      <div class="echo-set-active-line"><strong>${escapeHtml(row.name)}</strong> ${row.count}/5 · ${tierLabel}</div>
      <div class="echo-set-active-tiers">${tierBlocks}</div>
    </div>`;
    })
    .join('');
  const mainHtml = mainEffects.length
    ? `<div class="echo-set-active-block echo-set-active-main">
      <div class="echo-set-active-main-title"><strong>主位声骸效果</strong></div>
      ${mainEffects
        .map(
          (fx) =>
            `<div class="echo-set-active-tier">
          <div class="echo-set-active-tier-head">${escapeHtml(fx.echoName)}${fx.setName ? ` · ${escapeHtml(fx.setName)}` : ''}</div>
          ${renderEchoActiveEffectLines([fx])}
        </div>`
        )
        .join('')}
    </div>`
    : '';
  return setHtml + mainHtml;
}

function renderEchoActiveSlotHtml(member) {
  const config = member.echoConfig;
  const activeIdx = member.echoActiveSlot;
  if (Number.isInteger(activeIdx) && config.slots[activeIdx]) {
    return `<div class="echo-slot-detail">${renderEchoSlotCard(config.slots[activeIdx], activeIdx)}</div>`;
  }
  return '<div class="echo-slot-placeholder">点击上方槽位编辑词条属性（主/副词条）</div>';
}

function captureEchoPanelScrollState() {
  return {
    windowY: window.scrollY,
    pickerScroll: document.querySelector('.echo-set-picker')?.scrollTop ?? 0,
  };
}

function restoreEchoPanelScrollState(saved) {
  if (!saved) return;
  requestAnimationFrame(() => {
    window.scrollTo(0, saved.windowY);
    const picker = document.querySelector('.echo-set-picker');
    if (picker) picker.scrollTop = saved.pickerScroll;
  });
}

function refreshEchoPanelInPlace(member) {
  const panel = document.querySelector('.echo-panel');
  if (!panel || getSidebarTab() !== 'echo') return false;

  const scrollSaved = captureEchoPanelScrollState();
  ensureEchoConfig(member);
  ensureEchoActiveSlot(member);
  syncEchoLoadout(member);

  const config = member.echoConfig;
  const costTotal = getEchoCostTotal(config);
  const loadoutCollapsed = !!member.echoLoadoutCollapsed;
  const activeSetLines = getActiveEchoSetSummary(member);
  const loadoutHint =
    loadoutCollapsed && activeSetLines.length
      ? `<span class="hint"> · ${activeSetLines.map((r) => `${r.name} ${r.count}件`).join(' / ')}</span>`
      : '';

  const head = panel.querySelector('.echo-panel-head');
  if (head) {
    const h2 = head.querySelector('h2');
    const btn = head.querySelector('[data-toggle-echo-loadout]');
    if (h2) h2.innerHTML = `声骸${loadoutHint}`;
    if (btn) btn.textContent = loadoutCollapsed ? '展开' : '收起';
  }

  const loadoutBody = panel.querySelector('.echo-loadout-body');
  if (loadoutBody) {
    loadoutBody.classList.toggle('collapsed', loadoutCollapsed);
    const badge = loadoutBody.querySelector('.echo-cost-badge');
    if (badge) {
      badge.textContent = `Cost ${costTotal}/${ECHO_COST_CAP}`;
      badge.classList.toggle('over', costTotal > ECHO_COST_CAP);
    }
    const summaryBlock = loadoutBody.querySelector('.echo-set-summary-block');
    if (summaryBlock) {
      summaryBlock.innerHTML = `<div><strong>已激活套装</strong></div>${renderEchoActiveSetsSummary(member)}`;
    }
    const loadout = loadoutBody.querySelector('.echo-set-loadout');
    if (loadout) loadout.outerHTML = renderEchoSetLoadoutPanel(member).trim();
  }

  const tabs = panel.querySelector('.echo-slot-tabs');
  if (tabs) tabs.innerHTML = renderEchoSlotTabs(member, config);

  const slotArea = panel.querySelector('.echo-slot-detail, .echo-slot-placeholder');
  if (slotArea) slotArea.outerHTML = renderEchoActiveSlotHtml(member);

  const el = getMemberElementLabel(member);
  const elHint = el
    ? `当前角色属性：<strong>${el}</strong>；3cost 属性伤与角色一致时全额计入伤害。`
    : '请先在「构筑」页选择角色，以匹配属性伤害加成。';
  const hintDiv = panel.querySelector('.echo-summary div[style*="margin-top"]');
  if (hintDiv) hintDiv.innerHTML = elHint;

  refreshEchoSummaryPanel(member);
  refreshEchoPanelCharDisplays(member);
  restoreEchoPanelScrollState(scrollSaved);
  return true;
}

function renderEchoPanel(member) {
  ensureEchoConfig(member);
  ensureEchoActiveSlot(member);
  syncEchoLoadout(member);
  const config = member.echoConfig;
  const costTotal = getEchoCostTotal(config);
  const costClass = costTotal > ECHO_COST_CAP ? ' over' : '';
  const agg = aggregateEchoStats(member);
  const layoutOpts = Object.entries(ECHO_LAYOUTS)
    .map(
      ([k, l]) =>
        `<option value="${k}" ${config.layout === l.label ? 'selected' : ''}>${l.label}</option>`
    )
    .join('');
  const tabsHtml = renderEchoSlotTabs(member, config);
  const activeCardHtml = renderEchoActiveSlotHtml(member);
  const el = getMemberElementLabel(member);
  const elHint = el
    ? `当前角色属性：<strong>${el}</strong>；3cost 属性伤与角色一致时全额计入伤害。`
    : '请先在「构筑」页选择角色，以匹配属性伤害加成。';
  const loadoutCollapsed = !!member.echoLoadoutCollapsed;
  const activeSetLines = getActiveEchoSetSummary(member);
  const loadoutHint =
    loadoutCollapsed && activeSetLines.length
      ? `<span class="hint"> · ${activeSetLines.map((r) => `${r.name} ${r.count}件`).join(' / ')}</span>`
      : '';
  return `
    <div class="panel echo-panel">
      <div class="echo-panel-head">
        <h2>声骸${loadoutHint}</h2>
        <button class="btn sm" type="button" data-toggle-echo-loadout title="展开/收起套装配置">${loadoutCollapsed ? '展开' : '收起'}</button>
      </div>
      <div class="echo-loadout-body${loadoutCollapsed ? ' collapsed' : ''}">
      <div class="echo-toolbar">
        <label class="hint" style="margin:0">配装</label>
        <select class="echo-field-select" data-echo-layout>${layoutOpts}</select>
        <label class="hint" style="margin:0">模板</label>
        <select class="echo-field-select" data-echo-sub-template title="选择后自动填入副词条，仍可修改数值">
          ${renderEchoSubTemplateOptions(member.echoSubTemplateId, member)}
        </select>
        <span class="echo-cost-badge${costClass}">Cost ${costTotal}/${ECHO_COST_CAP}</span>
      </div>
      <div class="echo-set-summary-block">
        <div><strong>已激活套装</strong></div>
        ${renderEchoActiveSetsSummary(member)}
      </div>
      ${renderEchoSetLoadoutPanel(member)}
      </div>
      <div class="echo-slot-tabs">${tabsHtml}</div>
      ${activeCardHtml}
      <div class="echo-summary">
        <div><strong>声骸词条合计（已同步至面板）</strong></div>
        <div data-echo-summary-line>${formatEchoSummaryLine(agg, member)}</div>
        <div style="margin-top:0.35rem">${elHint}</div>
      </div>
    </div>`;
}

function refreshEchoSummaryPanel(member) {
  const el = document.querySelector('[data-echo-summary-line]');
  if (!el) return;
  el.textContent = formatEchoSummaryLine(aggregateEchoStats(member), member);
}

/** 配装页「面板」卡片就地刷新（quiet 同步时不走完整 sidebar 重绘） */
function refreshBuildPanelSummary(member) {
  if (typeof renderBuildPanelSummary !== 'function') return;
  const idx = typeof getMemberIndex === 'function' ? getMemberIndex(member) : -1;
  // 必须替换整块 setup-sec-panel：renderBuildPanelSummary 含「面板属性」标题，
  // 若只换内部 .build-panel-summary，标题会每次刷新叠加。
  const root =
    idx >= 0
      ? document.querySelector(`[data-setup-member="${idx}"] .setup-sec-panel`) ||
        document.querySelector(`[data-setup-member="${idx}"] .build-panel-summary`)
      : document.querySelector(
          '.build-hero-panel .setup-sec-panel, .setup-sec-panel, .build-hero-panel .build-panel-summary, .build-panel-summary'
        );
  if (!root) return;
  root.outerHTML = renderBuildPanelSummary(member);
}

function refreshEchoPanelCharDisplays(member) {
  refreshEchoSummaryPanel(member);
  refreshBuildPanelSummary(member);
  Object.keys(CHAR_STATS).forEach((statKey) => {
    const sourcesKey = charStatSourcesKey(statKey);
    const sources = member.char[sourcesKey] || [];
    const liveIds = new Set(sources.map((s) => String(s?.id || '')));
    // 数据已去重后，删掉 DOM 里已不存在的来源行（避免 quiet 刷新留幽灵行）
    document.querySelectorAll(`[data-char-stat-name="${statKey}"]`).forEach((nameEl) => {
      const id = String(nameEl.dataset.charStatId || '');
      if (liveIds.has(id)) return;
      nameEl.closest('[data-char-stat-row], .char-stat-item')?.remove();
    });
    const totalEl = document.querySelector(`[data-char-stat-total="${statKey}"]`);
    if (totalEl) {
      const total =
        statKey === 'harmonyBreakAmp'
          ? getMemberHarmonyBreakAmpTotal(member)
          : getCharStatTotal(member.char, statKey);
      totalEl.value = statKey === 'flatAtk' ? Math.round(total) : total;
    }
    sources.forEach((item) => {
      if (!isEchoPanelSource(item) && !isWeaponPanelSource(item) && !isCharKitPanelSource(item)) {
        return;
      }
      const nameEl = document.querySelector(
        `[data-char-stat-name="${statKey}"][data-char-stat-id="${item.id}"]`
      );
      const valEl = document.querySelector(
        `[data-char-stat-value="${statKey}"][data-char-stat-id="${item.id}"]`
      );
      if (nameEl) nameEl.value = item.name;
      if (valEl) valEl.value = item.value;
    });
  });
}

function syncEchoStatsQuiet(member) {
  syncEchoLoadout(member);
  // Editing a substat value changes the loadout shared by every rotation round.
  if (member?.cycleConfig?.enabled && typeof window.__WC?.syncMemberEchoAcrossRounds === 'function') {
    window.__WC.syncMemberEchoAcrossRounds(member);
  }
  updateResultsOnly();
  refreshEchoPanelCharDisplays(member);
  persistCycleEditingIfEnabled(member);
  scheduleSave();
}

function handleEchoFieldChange(member) {
  syncEchoLoadout(member);
  // 多轮轴：手动改词条后，把成员面板同步到所有轮次快照（否则轮次面板仍是旧声骸 → 多轮计算偏高/不变，直到切轮才重刷）
  if (member?.cycleConfig?.enabled && typeof window.__WC?.syncMemberEchoAcrossRounds === 'function') {
    try { window.__WC.syncMemberEchoAcrossRounds(member); } catch (e) { /* noop */ }
  }
  refreshEchoUiAfterChange(member);
}

function applyEchoSetLoadoutSet(member, entryIndex, setId) {
  const cfg = ensureEchoConfig(member);
  const entry = cfg.setLoadout[entryIndex];
  if (!entry) return;
  const prevSetId = entry.setId ? String(entry.setId) : '';
  const nextSetId = setId ? String(setId) : null;
  entry.setId = nextSetId;
  if (prevSetId !== nextSetId) entry.echoId = null;
  if (!nextSetId) entry.count = 0;
  cfg.setLoadout = clampEchoSetLoadoutCounts(cfg.setLoadout);
  syncSetLoadoutToSlots(cfg);
  member.echoExpandedSetEntry = entryIndex;
  if (state.buildModal && String(state.buildModal).startsWith('setPick')) {
    state.buildModal = null;
    state.echoSetPickQuery = '';
  }
  handleEchoFieldChange(member);
}

function applyEchoSetLoadoutCount(member, entryIndex, rawCount) {
  const cfg = ensureEchoConfig(member);
  const entry = cfg.setLoadout[entryIndex];
  if (!entry) return;
  if (!entry.setId) {
    entry.count = 0;
    syncSetLoadoutToSlots(cfg);
      handleEchoFieldChange(member);
    return;
  }
  const otherCount = cfg.setLoadout.reduce(
    (sum, row, idx) => (idx === entryIndex ? sum : sum + (Number(row.count) || 0)),
    0
  );
  const maxCount = Math.max(0, 5 - otherCount);
  let count = parseInt(rawCount, 10);
  if (!Number.isFinite(count)) count = 0;
  entry.count = Math.max(0, Math.min(maxCount, count));
  if (!entry.count) entry.echoId = null;
  cfg.setLoadout = clampEchoSetLoadoutCounts(cfg.setLoadout);
  syncSetLoadoutToSlots(cfg);
  handleEchoFieldChange(member);
}

function applyEchoSetLoadoutEcho(member, entryIndex, echoId) {
  const cfg = ensureEchoConfig(member);
  const entry = cfg.setLoadout[entryIndex];
  if (!entry?.setId) return;
  entry.echoId = echoId || null;
  syncSetLoadoutToSlots(cfg);
  handleEchoFieldChange(member);
}

function toggleEchoSetEntryExpand(member, entryIndex) {
  ensureEchoActiveSlot(member);
  member.echoExpandedSetEntry = member.echoExpandedSetEntry === entryIndex ? null : entryIndex;
  if (!refreshEchoUiPanels(member)) {
    if (typeof renderSidebar === 'function') renderSidebar({ skipPhaseBar: true });
  }
  scheduleSave();
}

function applyEchoActiveSet(member, slotIndex, setId) {
  const cfg = ensureEchoConfig(member);
  const slot = cfg.slots[slotIndex];
  if (!slot) return;
  const prevSetId = slot.activeSetId ? String(slot.activeSetId) : '';
  const nextSetId = setId ? String(setId) : '';
  slot.activeSetId = setId ? String(setId) : null;
  if (prevSetId !== nextSetId) {
    slot.echoId = null;
  } else if (slot.echoId && !isMainEchoValidForSet(slot.echoId, slot.activeSetId)) {
    slot.echoId = null;
  }
  syncEchoLoadout(member);
  refreshEchoUiAfterChange(member);
}

function applyEchoSpecimen(member, slotIndex, echoId) {
  const cfg = ensureEchoConfig(member);
  const slot = cfg.slots[slotIndex];
  if (!slot) return;
  slot.echoId = echoId || null;
  if (echoId && !slot.activeSetId) {
    const sp = findEchoSpecimen(echoId);
    if (sp?.setIds?.length === 1) slot.activeSetId = sp.setIds[0];
  }
  syncEchoLoadout(member);
  refreshEchoUiAfterChange(member);
}

function applyEchoMainSlot(member, slotIndex) {
  const cfg = ensureEchoConfig(member);
  const slot = cfg.slots[slotIndex];
  if (!slot) return;
  if (slot.cost === 1) {
    alert('1C 槽位一般不作为主位声骸');
  }
  cfg.mainSlotIndex = slotIndex;
  syncEchoLoadout(member);
  refreshEchoUiAfterChange(member);
}


let charSkillDb = null;
let charSkillDbPromise = null;
let charSkillDbError = null;
let charSkillDbSource = '';
let charSkillDbReloading = false;

function loadCharSkillDbFromCache() {
  try {
    const raw = localStorage.getItem(CHAR_SKILL_DB_CACHE_KEY);
    if (!raw) return null;
    const data = normalizeCharSkillDb(JSON.parse(raw));
    return data.characters.length ? data : null;
  } catch {
    return null;
  }
}

function saveCharSkillDbToCache(data) {
  try {
    localStorage.setItem(CHAR_SKILL_DB_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* 同步写缓存失败时忽略（读路径仍可走网络） */
  }
}

function setCharSkillDb(data, source) {
  charSkillDb = normalizeCharSkillDb(data);
  charSkillDbSource = source || '';
  charSkillDbError = null;
  saveCharSkillDbToCache(charSkillDb);
  charSkillDbPromise = Promise.resolve(charSkillDb);
  return charSkillDb;
}

function loadCharSkillDbFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setCharSkillDb(data, file.name);
        resolve(charSkillDb);
      } catch (err) {
        reject(new Error('JSON 格式无效'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file, 'UTF-8');
  });
}

function triggerCharSkillDbFilePick() {
  let input = document.getElementById('charSkillDbFileInput');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'charSkillDbFileInput';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      loadCharSkillDbFromFile(file)
        .then((db) => {
          const count = refreshAllMemberPalettesFromDb({ forceSyncStats: true });
          setCatalogScrollHint(
            `已加载 ${file.name}（${db.characters.length} 角色${count ? `，已更新 ${count} 个已选角色技能条` : ''}）`
          );
          render();
          scheduleSave();
        })
        .catch((err) => alert(`技能库加载失败：${err?.message || err}`));
      input.value = '';
    });
    document.body.appendChild(input);
  }
  input.click();
}

function ensureCharSkillDb(forceReload) {
  if (charSkillDb && !forceReload) return Promise.resolve(charSkillDb);
  if (charSkillDbPromise && !forceReload) return charSkillDbPromise;
  charSkillDbError = null;

  if (!forceReload) {
    const cached = loadCharSkillDbFromCache();
    if (cached) {
      charSkillDb = cached;
      charSkillDbSource = '缓存';
      charSkillDbPromise = Promise.resolve(charSkillDb);
      return charSkillDbPromise.then((db) => ensureCsfOverlay().then(() => db));
    }
  } else {
    charSkillDb = null;
    charSkillDbPromise = null;
    try {
      localStorage.removeItem(CHAR_SKILL_DB_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (location.protocol === 'file:') {
    charSkillDbError = new Error('file');
    charSkillDbPromise = Promise.reject(charSkillDbError);
    return charSkillDbPromise;
  }

  charSkillDbPromise = fetch(CHAR_SKILL_DB_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`技能库加载失败 (${r.status})`);
      return r.json();
    })
    .then((data) => setCharSkillDb(data, 'character-skills.json'))
    .catch((err) => {
      charSkillDbError = err;
      charSkillDbPromise = null;
      throw err;
    });
  return charSkillDbPromise.then((db) => ensureCsfOverlay().then(() => db));
}

/* ========== 角色 Buff 模板库 ========== */
let charBuffTemplateDb = null;
let charBuffTemplateDbPromise = null;
let charBuffTemplateLocal = null;

/* ---- 批次2 · 合并模板缓存与索引（只加缓存，不碰计算算法） ---- */
let charBuffTemplateLocalRev = 0;          // 本机模板库修订号
let mergedTemplateMapCache = null;         // getMergedTemplateMap 的 memo
let mergedTemplateMapRev = -1;
let mergedTemplateDbRef = null;            // 随包库引用指纹（引用变化自动失效）
let templateBuffKeyIndexByChar = new Map();   // charId -> Map<templateKey, {entry, meta}>
let templateBuffNameIndexByChar = new Map();  // charId -> Map<exactName, {entry, meta}>
let bundledTemplateByChar = new Map();        // charId -> 随包原始模板
let bundledEntryByChar = new Map();           // charId -> Map<templateKey, entry>
let normalizedTemplateCache = new Map();      // (charId \u0000 revision) -> normalizedTemplate
let mergedTemplateRefByChar = new Map();      // charId -> merged 模板对象引用（索引身份校验用）
function invalidateMergedTemplateMap() {
  mergedTemplateMapRev = -1;
  normalizedTemplateCache.clear();
}

/* ---- C1 分片：索引 + per-shard 并发去重 + 缺失告警去重 ---- */
let charBuffTemplateIndex = null;             // 分片索引（内存）
let charBuffTemplateIndexPromise = null;      // 索引加载单飞
let charBuffTemplateShardPromises = {};       // per-shard promise（防 boot/选角并发重复拉）
const charBuffTemplateMissingWarned = new Set(); // 缺失模板 per-char 告警去重

function emptyResonanceChains() {
  const chains = {};
  for (let i = 1; i <= 6; i += 1) {
    chains[String(i)] = {
      enabledByDefault: false,
      personalBuffs: [],
      teamBuffs: [],
      extraSkills: [],
      notes: '细则待定',
    };
  }
  return chains;
}

function emptyCombatModeBlock() {
  return {
    notes: '',
    personalBuffs: [],
    teamBuffs: [],
    extraSkills: [],
  };
}

function normalizeCombatModeBlock(raw) {
  return {
    notes: String(raw?.notes || ''),
    personalBuffs: (raw?.personalBuffs || []).map(normalizeTemplateBuffEntry),
    teamBuffs: (raw?.teamBuffs || []).map(normalizeTemplateBuffEntry),
    extraSkills: (raw?.extraSkills || []).map(normalizeTemplateExtraSkillEntry),
  };
}

/** 按角色模态配置生成/规范化 combatModes；无模态角色为空对象 */
function normalizeTemplateCombatModes(raw, charId) {
  const cfg = getCharCombatModeConfig(charId);
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const modeIds = cfg?.modes?.length ? [...cfg.modes] : [];
  // 保留导入包里多出来的模态键，避免协作数据丢失
  Object.keys(src).forEach((id) => {
    if (!modeIds.includes(id)) modeIds.push(id);
  });
  modeIds.forEach((id) => {
    out[String(id)] = normalizeCombatModeBlock(src[id] || {});
  });
  return out;
}

function ensureTemplateCombatModes(tpl) {
  if (!tpl) return null;
  // 只补齐键与空数组，禁止每次 normalize 重建列表（否则来源库 proxy 会与草稿脱节，保存后 buff 像被清空）
  const cfg = getCharCombatModeConfig(tpl.characterId);
  if (!tpl.combatModes || typeof tpl.combatModes !== 'object') tpl.combatModes = {};
  const modeIds = cfg?.modes?.length ? [...cfg.modes] : [];
  Object.keys(tpl.combatModes).forEach((id) => {
    if (!modeIds.includes(id)) modeIds.push(id);
  });
  modeIds.forEach((id) => {
    const key = String(id);
    const block = tpl.combatModes[key];
    if (!block || typeof block !== 'object') {
      tpl.combatModes[key] = emptyCombatModeBlock();
      return;
    }
    if (!Array.isArray(block.personalBuffs)) block.personalBuffs = [];
    if (!Array.isArray(block.teamBuffs)) block.teamBuffs = [];
    if (!Array.isArray(block.extraSkills)) block.extraSkills = [];
    if (block.notes == null) block.notes = '';
  });
  return tpl.combatModes;
}

/** 模态筛选与本体/链正交：modeFilter 空=通用；有值=仅编辑该模态下的列表 */
function syncTplUiCombatMode(ui) {
  if (!ui) return;
  // 兼容旧 UI：曾把模态做成独立 tab
  if (ui.tab === 'mode') {
    ui.tab = 'personal';
    if (!ui.modeFilter && ui.modeId) ui.modeFilter = ui.modeId;
  }
  const cfg = getCharCombatModeConfig(ui.characterId);
  if (!cfg?.modes?.length) {
    ui.modeFilter = '';
    return;
  }
  const filter = String(ui.modeFilter || '').trim();
  ui.modeFilter = cfg.modes.includes(filter) ? filter : '';
}

function getTemplateCombatModeBlock(draft, modeId) {
  if (!draft) return emptyCombatModeBlock();
  ensureTemplateCombatModes(draft);
  const key = String(modeId || '').trim();
  if (!key) return emptyCombatModeBlock();
  if (!draft.combatModes[key]) draft.combatModes[key] = emptyCombatModeBlock();
  return draft.combatModes[key];
}

function getChainCombatModeBlock(draft, chainIndex, modeId) {
  if (!draft) return emptyCombatModeBlock();
  const key = String(chainIndex || 1);
  if (!draft.resonanceChains) draft.resonanceChains = emptyResonanceChains();
  let chain = draft.resonanceChains[key];
  if (!chain) {
    chain = normalizeChainBlock({}, draft.characterId);
    draft.resonanceChains[key] = chain;
  }
  if (!chain.combatModes || typeof chain.combatModes !== 'object') chain.combatModes = {};
  const cfg = getCharCombatModeConfig(draft.characterId);
  (cfg?.modes || []).forEach((id) => {
    const mk = String(id);
    if (!chain.combatModes[mk] || typeof chain.combatModes[mk] !== 'object') {
      chain.combatModes[mk] = emptyCombatModeBlock();
    } else {
      const block = chain.combatModes[mk];
      if (!Array.isArray(block.personalBuffs)) block.personalBuffs = [];
      if (!Array.isArray(block.teamBuffs)) block.teamBuffs = [];
      if (!Array.isArray(block.extraSkills)) block.extraSkills = [];
      if (block.notes == null) block.notes = '';
    }
  });
  const modeKey = String(modeId || '').trim();
  if (!modeKey) return emptyCombatModeBlock();
  if (!chain.combatModes[modeKey] || typeof chain.combatModes[modeKey] !== 'object') {
    chain.combatModes[modeKey] = emptyCombatModeBlock();
  } else {
    const block = chain.combatModes[modeKey];
    if (!Array.isArray(block.personalBuffs)) block.personalBuffs = [];
    if (!Array.isArray(block.teamBuffs)) block.teamBuffs = [];
    if (!Array.isArray(block.extraSkills)) block.extraSkills = [];
    if (block.notes == null) block.notes = '';
  }
  return chain.combatModes[modeKey];
}

/** 按当前 tab + 模态筛选解析要编辑的 Buff 列表 */
function resolveTplEditBuffList(draft, ui) {
  if (!draft || !ui) return [];
  const modeFilter = String(ui.modeFilter || '').trim();
  if (ui.tab === 'chain') {
    const chainKey = String(ui.chainIndex || 1);
    const chain = draft.resonanceChains?.[chainKey] || normalizeChainBlock({}, draft.characterId);
    draft.resonanceChains[chainKey] = chain;
    if (modeFilter) {
      const block = getChainCombatModeBlock(draft, chainKey, modeFilter);
      return ui.chainScope === 'team' ? block.teamBuffs : block.personalBuffs;
    }
    return ui.chainScope === 'team' ? chain.teamBuffs : chain.personalBuffs;
  }
  if (modeFilter) {
    const block = getTemplateCombatModeBlock(draft, modeFilter);
    return ui.tab === 'team' ? block.teamBuffs : block.personalBuffs;
  }
  return ui.tab === 'team' ? draft.teamBuffs : draft.personalBuffs;
}

function resolveTplEditExtraSkillList(draft, ui) {
  if (!draft || !ui) return [];
  const modeFilter = String(ui.modeFilter || '').trim();
  if (ui.tab === 'chain') {
    const chainKey = String(ui.chainIndex || 1);
    const chain = draft.resonanceChains?.[chainKey] || normalizeChainBlock({}, draft.characterId);
    draft.resonanceChains[chainKey] = chain;
    if (modeFilter) {
      const block = getChainCombatModeBlock(draft, chainKey, modeFilter);
      if (!Array.isArray(block.extraSkills)) block.extraSkills = [];
      return block.extraSkills;
    }
    if (!Array.isArray(chain.extraSkills)) chain.extraSkills = [];
    return chain.extraSkills;
  }
  if (modeFilter) {
    const block = getTemplateCombatModeBlock(draft, modeFilter);
    if (!Array.isArray(block.extraSkills)) block.extraSkills = [];
    return block.extraSkills;
  }
  if (!Array.isArray(draft.extraSkills)) draft.extraSkills = [];
  return draft.extraSkills;
}

function defaultAugustaSpecialMechanics() {
  return {
    kind: AUGUSTA_SPECIAL_MECH_KIND,
    stackTemplateKey: AUGUSTA_SPECIAL_STACK_KEY,
    stackPerCritRate: 20,
    /** 0 链【以众愿为冕】上限 */
    stackCapAtBase: 1,
    /** ≥1 链上限（历史字段名 stackCapAtChain2，与编辑器共用） */
    stackCapAtChain2: 2,
    stackCapAtChain6: 4,
    convertRules: [
      {
        minChain: 2,
        threshold: 100,
        ratio: 2,
        maxCritDmg: 100,
        label: '2链·超100%暴击',
      },
      {
        minChain: 6,
        threshold: 150,
        ratio: 2,
        maxCritDmg: 50,
        label: '6链·超150%暴击',
      },
    ],
  };
}

function normalizeAugustaConvertRule(raw) {
  return {
    minChain: Math.max(0, Math.min(6, Math.round(Number(raw?.minChain) || 0))),
    threshold: Math.max(0, Number(raw?.threshold) || 0),
    ratio: Math.max(0, Number(raw?.ratio) || 0),
    maxCritDmg: Math.max(0, Number(raw?.maxCritDmg) || 0),
    label: String(raw?.label || '').trim(),
  };
}

function normalizeAugustaSpecialMechanics(raw) {
  const base = defaultAugustaSpecialMechanics();
  if (!raw || typeof raw !== 'object') return base;
  const rules = Array.isArray(raw.convertRules) && raw.convertRules.length
    ? raw.convertRules.map(normalizeAugustaConvertRule)
    : base.convertRules;
  return {
    kind: AUGUSTA_SPECIAL_MECH_KIND,
    stackTemplateKey: String(raw.stackTemplateKey || base.stackTemplateKey).trim() || AUGUSTA_SPECIAL_STACK_KEY,
    stackPerCritRate: Math.max(0, Number(raw.stackPerCritRate) || base.stackPerCritRate),
    stackCapAtBase: Math.max(1, Math.round(Number(raw.stackCapAtBase) || base.stackCapAtBase)),
    stackCapAtChain2: Math.max(1, Math.round(Number(raw.stackCapAtChain2) || base.stackCapAtChain2)),
    stackCapAtChain6: Math.max(1, Math.round(Number(raw.stackCapAtChain6) || base.stackCapAtChain6)),
    convertRules: rules,
  };
}

function defaultBrantSpecialMechanics() {
  return {
    kind: BRANT_SPECIAL_MECH_KIND,
    thresholdPct: 150,
    flatAtkSourceId: BRANT_FLAT_ATK_SOURCE_ID,
    defaultVariant: BRANT_LIFE_PLAY,
    variants: {
      [BRANT_LIFE_PLAY]: {
        id: BRANT_LIFE_PLAY,
        label: '戏中人生',
        atkPerPct: 12,
        cap: 1560,
      },
      [BRANT_LIFE_MY]: {
        id: BRANT_LIFE_MY,
        label: '我的人生',
        atkPerPct: 20,
        cap: 2600,
      },
    },
  };
}

function normalizeBrantLifeVariant(raw, fallback) {
  const base = fallback || { id: BRANT_LIFE_PLAY, label: '戏中人生', atkPerPct: 12, cap: 1560 };
  return {
    id: String(raw?.id || base.id || BRANT_LIFE_PLAY),
    label: String(raw?.label || base.label || '').trim() || base.label,
    atkPerPct: Math.max(0, Number(raw?.atkPerPct) || base.atkPerPct || 0),
    cap: Math.max(0, Number(raw?.cap) || base.cap || 0),
  };
}

function normalizeBrantSpecialMechanics(raw) {
  const base = defaultBrantSpecialMechanics();
  if (!raw || typeof raw !== 'object') return base;
  const srcVariants = raw.variants && typeof raw.variants === 'object' ? raw.variants : {};
  return {
    kind: BRANT_SPECIAL_MECH_KIND,
    thresholdPct: Math.max(0, Number(raw.thresholdPct) || base.thresholdPct),
    flatAtkSourceId:
      String(raw.flatAtkSourceId || base.flatAtkSourceId).trim() || BRANT_FLAT_ATK_SOURCE_ID,
    defaultVariant:
      raw.defaultVariant === BRANT_LIFE_MY ? BRANT_LIFE_MY : BRANT_LIFE_PLAY,
    variants: {
      [BRANT_LIFE_PLAY]: normalizeBrantLifeVariant(
        srcVariants[BRANT_LIFE_PLAY] || srcVariants.playLife,
        base.variants[BRANT_LIFE_PLAY]
      ),
      [BRANT_LIFE_MY]: normalizeBrantLifeVariant(
        srcVariants[BRANT_LIFE_MY] || srcVariants.myLife,
        base.variants[BRANT_LIFE_MY]
      ),
    },
  };
}

function createBrantOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: BRANT_OUTRO_KEY,
    category: 'composite',
    name: '延奏·布兰特',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: 20,
        element: '热熔',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣技能',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

function ensureBrantTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== BRANT_CHAR_ID) return tpl;
  tpl.specialMechanics = normalizeBrantSpecialMechanics(tpl.specialMechanics);
  // 【荣光】/【追猎】属露帕，若误挂在布兰特则剥离
  tpl.teamBuffs = (tpl.teamBuffs || []).filter(
    (b) => !BRANT_LEGACY_LUPA_TEAM_KEYS.has(String(b?.templateKey || ''))
  );
  upsertAmisBodyTeamBuff(tpl, BRANT_OUTRO_KEY, createBrantOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '布兰特';
  const notesHint =
    '布兰特专属：共鸣效率＞150%时转化为固定攻击（戏中人生12点/1%、上限1560；大招后·我的人生20点/1%、上限2600）；全队复合【延奏·布兰特】热熔加深+20% + 共鸣技能加深+25%（对布兰特本人不生效）。角色默认形态 + 编轴技能可单独切换。';
  const notes = String(tpl.notes || '');
  if (!notes.includes('延奏·布兰特') || notes.includes('荣光') || notes.includes('追猎')) {
    tpl.notes = notesHint;
  }
  return tpl;
}

/** 景燃：【命火】【祸兮福兮】【幽而复明】；【阳变阴合】由面板同步写入 */
function ensureJingranTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== JINGRAN_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '景燃';
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(tpl.personalBuffs, JINGRAN_MINGHUO_KEY, createJingranMinghuoBuffEntry);
  ensureTemplateListBuff(tpl.personalBuffs, JINGRAN_HUOXI_FUXI_KEY, createJingranHuoxiFuxiBuffEntry);
  ensureTemplateListBuff(tpl.personalBuffs, JINGRAN_YOUFU_FUMING_KEY, createJingranYoufuFumingBuffEntry);
  const notesHint =
    '景燃（测试服 3.6.7）：【阳变阴合】每1000生命上限+36固定攻击（上限1800，写入面板）；【命火】生命上限>25000部分每1000生命为【劫魄】+21.10%、【踏罡】+21.65%倍率增加（最多计入25000生命/25段）；【幽而复明】常驻热熔伤害加成每1000生命+1.5%（上限75%，自动同步）；【祸兮福兮】叠层热熔增伤（上限50层，每层按生命转化：每1000生命+0.05%、单层上限2.5%，满层理论+125%）。';
  setTemplateNotesIfEmpty(tpl, notesHint);
  return tpl;
}

function createLupaRongguangBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUPA_RONGGUANG_KEY,
    category: 'composite',
    name: '荣光',
    mode: 'stack',
    maxStacks: 3,
    stackSync: TEAM_FUSION_STACK_SYNC,
    effects: [
      {
        zone: 'elementResReduce',
        valueMode: 'stack',
        segments: [{ upTo: null, perStack: 3 }],
        element: '热熔',
        minStacks: 0,
      },
      {
        zone: 'elementResReduce',
        valueMode: 'fixed',
        value: 6,
        element: '热熔',
        minStacks: 3,
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = 3;
  entry.stackSync = TEAM_FUSION_STACK_SYNC;
  return entry;
}

function createLupaZhuilieBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUPA_ZHUILIE_KEY,
    category: 'composite',
    name: '追猎',
    mode: 'stack',
    maxStacks: 3,
    effects: [
      {
        zone: 'generalAttack',
        valueMode: 'fixed',
        value: 6,
        minStacks: 0,
      },
      // 文案：攻击怒涛级/海啸级目标时热熔伤害加成提升10%（无条件常驻建模，与荣光同口径）
      {
        zone: 'elementBonus',
        valueMode: 'fixed',
        value: 10,
        element: '热熔',
        minStacks: 0,
      },
      {
        zone: 'generalAttack',
        valueMode: 'stack',
        segments: [{ upTo: null, perStack: 6 }],
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = 3;
  return entry;
}

function createLupaOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUPA_OUTRO_KEY,
    category: 'composite',
    name: '延奏·露帕',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: 20,
        element: '热熔',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '普攻',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

function ensureLupaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LUPA_CHAR_ID) return tpl;
  // 只清旧版拆条 key，不删用户自定义同名条目（避免本机库被静默清空）
  tpl.teamBuffs = (tpl.teamBuffs || []).filter(
    (b) => !LUPA_LEGACY_FRAGMENT_TEAM_KEYS.has(String(b?.templateKey || ''))
  );
  upsertAmisBodyTeamBuff(tpl, LUPA_RONGGUANG_KEY, createLupaRongguangBuffEntry);
  upsertAmisBodyTeamBuff(tpl, LUPA_ZHUILIE_KEY, createLupaZhuilieBuffEntry);
  upsertAmisBodyTeamBuff(tpl, LUPA_OUTRO_KEY, createLupaOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '露帕';
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c3 = tpl.resonanceChains['3'] || normalizeChainBlock({}, LUPA_CHAR_ID);
  if (!String(c3.notes || '').trim()) {
    c3.notes =
      '3链：【荣光】【追猎】额外效果无需 3 名热熔即可激活；层数固定满层（全额增益），不再随队内热熔人数变化。';
  }
  tpl.resonanceChains['3'] = c3;
  // 6 链「余响」→「6链」（指定技能泛用防御 +30%）
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => renameLupaC6DefBuff(b));
      return list;
    });
  } else {
    (tpl.resonanceChains['6']?.personalBuffs || []).forEach((b) => renameLupaC6DefBuff(b));
  }
  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({}, LUPA_CHAR_ID);
  if (!Array.isArray(c6.personalBuffs)) c6.personalBuffs = [];
  if (!c6.personalBuffs.some(isLupaC6DefBuff)) {
    c6.personalBuffs.unshift(
      normalizeTemplateBuffEntry({
        templateKey: LUPA_C6_DEF_KEY,
        category: 'composite',
        name: LUPA_C6_DEF_NAME,
        mode: 'fixed',
        value: 0,
        effects: [
          {
            zone: 'generalDefense',
            valueMode: 'fixed',
            value: 30,
            skillScope: 'names',
            librarySkillNames: [
              '荣光欢酣于火·技能',
              '你在看哪里？·你无法逃离！',
              '焰狼宣告·狼舞的决意·极',
            ],
            skillNames: [
              '荣光欢酣于火·技能',
              '你在看哪里？·你无法逃离！',
              '你无法逃离！',
              '焰狼宣告·狼舞的决意·极',
              '狼舞的决意·极',
            ],
            damageType: '共鸣解放',
            element: '热熔',
            defenseKind: 'pen',
          },
        ],
      })
    );
  }
  tpl.resonanceChains['6'] = c6;
  if (!String(tpl.notes || '').trim()) {
    tpl.notes =
      '露帕：0链分支攻击比12%、暴击率8%；全队复合【荣光】【追猎】（层数=热熔人数；≥3链时固定满层、额外效果直接全额）；全队复合【延奏·露帕】热熔加深+20% + 普攻加深+25%（对露帕本人不生效）。';
  }
  return tpl;
}

function isLupaC6DefBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === LUPA_C6_DEF_KEY || key === LUPA_C6_DEF_LEGACY_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name === LUPA_C6_DEF_NAME) {
    const effects = Array.isArray(buff.effects) ? buff.effects : [];
    return effects.some((fx) => fx?.zone === 'generalDefense' && Number(fx.value) === 30);
  }
  if (name !== '余响') return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'generalDefense') return false;
    if (Number(fx.value) !== 30) return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /狼舞的决意|荣光欢酣于火|你无法逃离/.test(names);
  });
}

function renameLupaC6DefBuff(buff, opts) {
  if (!isLupaC6DefBuff(buff)) return;
  const bare = LUPA_C6_DEF_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (
    !buff.templateKey ||
    buff.templateKey === LUPA_C6_DEF_LEGACY_KEY ||
    String(buff.templateKey).startsWith('tpl_')
  ) {
    buff.templateKey = LUPA_C6_DEF_KEY;
  }
}

function syncLupaC6DefBuffNames(member) {
  if (!member || String(member.characterId) !== LUPA_CHAR_ID) return;
  (member.buffs || []).forEach((b) => renameLupaC6DefBuff(b, { runtime: true }));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => renameLupaC6DefBuff(b, { runtime: true }))
    );
  }
}

function countTeamFusionCharacters() {
  return (state.members || []).filter((m) => {
    if (!m?.characterId) return false;
    const def = findCharSkillDef(m.characterId);
    if (!def) return false;
    return Number(def.element) === 2 || String(def.element) === '2';
  }).length;
}

function isTeamFusionStackSyncBuff(buff) {
  return !!buff && buff.stackSync === TEAM_FUSION_STACK_SYNC;
}

/** 露帕【荣光】/【追猎】：仅用于首次默认层数初始化（不锁定 UI，层数可手动修改） */
function isLupaStackDefaultInitBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === LUPA_RONGGUANG_KEY || key === LUPA_ZHUILIE_KEY) return true;
  // 兼容旧存档：露帕来源且名为荣光/追猎
  if (String(buff.sourceCharacterId || '') === LUPA_CHAR_ID) {
    const name = String(buff.name || '').trim();
    if (name === '荣光' || name === '追猎') return true;
  }
  return false;
}

function isLupaZhuilieBuff(buff) {
  return !!buff && String(buff.templateKey || '') === LUPA_ZHUILIE_KEY;
}

/** 露帕 ≥3 链：【荣光】【追猎】按满层结算（额外效果直接全额，不受热熔人数限制） */
function isLupaC3FullStackUnlocked(buff) {
  if (!isLupaStackDefaultInitBuff(buff)) return false;
  const srcIdx = getTeamBuffSourceMemberIndex(buff);
  const source = srcIdx != null ? state.members?.[srcIdx] : null;
  if (source && String(source.characterId) === LUPA_CHAR_ID) {
    return normalizeResonanceUnlocked(source.resonanceUnlocked) >= LUPA_C3_FULL_STACK_UNLOCK;
  }
  return (state.members || []).some(
    (m) =>
      String(m?.characterId) === LUPA_CHAR_ID &&
      normalizeResonanceUnlocked(m.resonanceUnlocked) >= LUPA_C3_FULL_STACK_UNLOCK
  );
}

/** 清掉旧版拆条（荣光·叠满 / 追猎·*），避免全队来源重复 */
function purgeLupaLegacyTeamBuffFragments() {
  const shared = ensureTeamSharedBuffs();
  const legacyNames = new Set([
    '荣光·叠满',
    '追猎·攻击',
    '追猎·热熔',
    '追猎·热熔·满员',
    '追猎·攻击叠层',
  ]);
  const toDelete = (shared.buffs || []).filter((b) => {
    const key = String(b?.templateKey || '');
    if (LUPA_LEGACY_FRAGMENT_TEAM_KEYS.has(key)) return true;
    if (legacyNames.has(String(b?.name || '').trim())) return true;
    return false;
  });
  toDelete.forEach((b) => deleteTeamSharedBuff(b.id));
  return toDelete.length > 0;
}

/** 同 templateKey 只保留一条（优先复合） */
function dedupeLupaTeamBuffKeys() {
  const shared = ensureTeamSharedBuffs();
  const keys = [LUPA_RONGGUANG_KEY, LUPA_ZHUILIE_KEY, LUPA_OUTRO_KEY];
  let changed = false;
  keys.forEach((key) => {
    const matches = (shared.buffs || []).filter((b) => String(b?.templateKey || '') === key);
    if (matches.length <= 1) return;
    const keep = matches.find((b) => isCompositeBuff(b)) || matches[matches.length - 1];
    matches.forEach((b) => {
      if (b.id !== keep.id) {
        deleteTeamSharedBuff(b.id);
        changed = true;
      }
    });
  });
  return changed;
}

function isLupaTeamBuffSource(buff) {
  if (!buff) return false;
  if (String(buff.sourceCharacterId || '') === LUPA_CHAR_ID) return true;
  const src = getTeamBuffSourceMemberIndex(buff);
  if (src == null) return false;
  return String(state.members?.[src]?.characterId || '') === LUPA_CHAR_ID;
}

function lupaRongguangEffectsLookCorrect(buff) {
  if (!isCompositeBuff(buff) || !Array.isArray(buff.effects) || buff.effects.length < 2) return false;
  return buff.effects.every((fx) => fx?.zone === 'elementResReduce');
}

/** 露帕同名全队 Buff 只留一条，并纠正【荣光】效果（清掉错误暴击/暴伤副本） */
function consolidateLupaNamedTeamBuffs() {
  const shared = ensureTeamSharedBuffs();
  const groups = [
    { name: '荣光', key: LUPA_RONGGUANG_KEY, factory: createLupaRongguangBuffEntry },
    { name: '追猎', key: LUPA_ZHUILIE_KEY, factory: createLupaZhuilieBuffEntry },
    { name: '延奏·露帕', key: LUPA_OUTRO_KEY, factory: createLupaOutroBuffEntry },
  ];
  let changed = false;
  groups.forEach(({ name, key, factory }) => {
    const matches = (shared.buffs || []).filter(
      (b) => String(b?.name || '').trim() === name && isLupaTeamBuffSource(b)
    );
    if (!matches.length) return;
    let keep =
      matches.find((b) => String(b.templateKey || '') === key && isCompositeBuff(b)) ||
      matches.find((b) => String(b.templateKey || '') === key) ||
      matches.find((b) => isCompositeBuff(b) && (name !== '荣光' || lupaRongguangEffectsLookCorrect(b))) ||
      matches[0];
    matches.forEach((b) => {
      if (b.id !== keep.id) {
        deleteTeamSharedBuff(b.id);
        changed = true;
      }
    });
    // 效果被污染（如暴击/暴伤）时，用模板定义覆盖
    if (name === '荣光' && !lupaRongguangEffectsLookCorrect(keep)) {
      const fresh = factory();
      keep.category = 'composite';
      keep.mode = 'stack';
      keep.maxStacks = 3;
            keep.stackSync = TEAM_FUSION_STACK_SYNC;
      keep.templateKey = key;
      keep.effects = (fresh.effects || []).map((fx) => normalizeCompositeEffect({ ...fx, id: genId() }));
      keep.name = '荣光';
      changed = true;
    } else {
      keep.templateKey = key;
      if (name !== '延奏·露帕') {
        
                if (name === '荣光') {
          keep.stackSync = TEAM_FUSION_STACK_SYNC;
        }
        keep.mode = 'stack';
        keep.maxStacks = Math.max(3, Number(keep.maxStacks) || 3);
      }
    }
  });
  return changed;
}

/** 按队内热熔角色数同步露帕【荣光】/【追猎】复合层数；露帕≥3链时固定满层 */
function syncTeamFusionLinkedBuffs(opts = {}) {
  let changed = purgeLupaLegacyTeamBuffFragments();
  if (dedupeLupaTeamBuffKeys()) changed = true;
  if (consolidateLupaNamedTeamBuffs()) changed = true;
  const shared = ensureTeamSharedBuffs();
  const fusionCount = countTeamFusionCharacters();
  (shared.buffs || []).forEach((b) => {
    const key = String(b.templateKey || '');
    const isRongguang = key === LUPA_RONGGUANG_KEY;
    const isZhuilie = key === LUPA_ZHUILIE_KEY;
    if (!isRongguang && !isZhuilie) return;
    if (isRongguang) {
      // 荣光：层数自动同步（按队内热熔角色数，不可手动改）
      b.stackSync = TEAM_FUSION_STACK_SYNC;
    } else if (b.stackSync) {
      // 追猎：清除旧锁定标记，层数可手动修改
      delete b.stackSync;
      changed = true;
    }
    if (isCompositeBuff(b) || b.mode === 'stack') {
      b.mode = 'stack';
      b.maxStacks = Math.max(3, Number(b.maxStacks) || 3);
    }
    if (!isStackBuff(b)) return;
    const cap = Math.max(1, Number(b.maxStacks) || 3);
    const next = isLupaC3FullStackUnlocked(b)
      ? cap
      : Math.min(cap, Math.max(0, fusionCount));
    if (isRongguang) {
      const prev = normalizeStackInput(shared.globalBuffStacks[b.id] ?? 0);
      if (prev !== next) {
        shared.globalBuffStacks[b.id] = next;
        changed = true;
      }
    } else {
      const cur = shared.globalBuffStacks[b.id];
      if (cur === undefined) {
        shared.globalBuffStacks[b.id] = next;
        changed = true;
      }
      // 追猎·热熔共鸣（自动）：队伍≥3名热熔角色 或 露帕≥3链 → 10%热熔伤害（与层数解耦，随队伍构成自动增删）
      const extraKey = 'lupa_zhuilie_fusion_extra';
      const extraActive = fusionCount >= 3 || isLupaC3FullStackUnlocked(b);
      const fxIdx = (b.effects || []).findIndex((fx) => String(fx?.effectKey || '') === extraKey);
      if (extraActive && fxIdx < 0) {
        if (!Array.isArray(b.effects)) b.effects = [];
        b.effects.push(normalizeCompositeEffect({
          zone: 'elementBonus',
          valueMode: 'fixed',
          value: 10,
          element: '热熔',
          skillScope: 'all',
          minStacks: 0,
          minResonance: 0,
          effectKey: extraKey,
        }));
        changed = true;
      } else if (!extraActive && fxIdx >= 0) {
        b.effects.splice(fxIdx, 1);
        changed = true;
      }
    }
  });
  if (!opts.skipMemberSync) syncTeamBuffsToMembers();
  else if (changed) {
    /* caller will syncTeamBuffsToMembers */
  }
  return changed;
}

/** 绯雪【雪锈】个人 ↔ 全队同名【雪锈】层数同步 */
function isFeixueXuexiuStackSyncBuff(buff) {
  if (!buff) return false;
  if (buff.stackSync === FEIXUE_XUEXIU_STACK_SYNC) return true;
  const key = String(buff.templateKey || '');
  return key === FEIXUE_XUEXIU_KEY || key === FEIXUE_XUEXIU_TEAM_KEY;
}

/** 同 stackSync 组只保留一条用于填层数（优先个人 / 指定 templateKey） */
function isStackSyncUiAuthority(buff, buffs) {
  if (!buff || !isStackBuff(buff)) return false;
  const sync = String(buff.stackSync || '').trim();
  if (!sync) return true;
  const group = (buffs || []).filter(
    (b) => isStackBuff(b) && String(b.stackSync || '').trim() === sync
  );
  if (group.length <= 1) return true;
  const score = (b) => {
    let s = 0;
    if (!b.teamSourceId) s += 100;
    if (String(b.templateKey || '') === FEIXUE_XUEXIU_KEY) s += 50;
    if (String(b.templateKey || '') === LUPA_RONGGUANG_KEY) s += 40;
    s -= String(b.name || '').length;
    return s;
  };
  const best = group.reduce((a, b) => (score(b) > score(a) ? b : a));
  return best.id === buff.id;
}

function listStackBuffsForStackUi(buffs) {
  return (buffs || []).filter((b) =>
    isStackBuff(b) && (!b?.tongzouLinkedStack || b.templateKey === 'suoming_c2_outro_critdmg_stack') &&
    isStackSyncUiAuthority(b, buffs)
  );
}

/** 复合叠层 Buff：若「当前链已解锁」的效果全部为指定技能，则编辑轴仅在这些技能旁显示层数框 */
function compositeStackBuffIsNamedSkillsOnly(buff, member) {
  if (!isCompositeBuff(buff)) return false;
  const unlocked = (buff.effects || []).filter((fx) =>
    compositeEffectMeetsMinResonance(fx, member, buff)
  );
  if (!unlocked.length) return false;
  return unlocked.every((fx) => {
    const resolved = resolveCompositeEffectRuntime(buff, fx);
    return resolved.skillScope === 'names';
  });
}

function stackBuffVisibleOnCatalogItem(buff, catalogId, member) {
  if (!buff || !catalogId || !member) return false;
  if (!isCompositeBuff(buff)) return true;
  const item = findCatalogItemInMember(member, catalogId);
  if (!item) return false;
  const unlocked = (buff.effects || []).filter((fx) =>
    compositeEffectMeetsMinResonance(fx, member, buff)
  );
  if (!unlocked.length) return false;
  // 任一已解锁效果为「全部技能」→ 编辑轴各技能都显示层数
  const resolvedList = unlocked.map((fx) => resolveCompositeEffectRuntime(buff, fx));
  if (resolvedList.some((fx) => fx.skillScope !== 'names')) return true;
  // 全部为指定技能（含赞妮焰光·3链锁定终绝等自动效果）→ 仅匹配技能显示
  return resolvedList.some((fx) => compositeEffectAppliesToUnit(fx, item, null, member));
}

function getStackSyncSiblingBuffs(member, buff, opts = {}) {
  if (!buff || !member?.buffs) return buff ? [buff] : [];
  // C2 的可编辑层数与接收者同奏共用一份值；两边都可改，各自仍按 4/6 层封顶。
  const key = String(buff.templateKey || '');
  const c2 = key === 'suoming_c2_outro_critdmg_stack';
  const tongzou = key === 'tongzou_shared_gain_final_vuln';
  if (opts.layersOnly && (c2 || tongzou)) {
    return member.buffs.filter((b) => b.id === buff.id ||
      (c2 && b.templateKey === 'tongzou_shared_gain_final_vuln') ||
      (tongzou && b.templateKey === 'suoming_c2_outro_critdmg_stack'));
  }
  const sync = String(buff.stackSync || '').trim();
  if (!sync) return [buff];
  return member.buffs.filter((b) => isStackBuff(b) && String(b.stackSync || '').trim() === sync);
}

function writeStackMapForSyncGroup(member, buff, stackMap, value, opts = {}) {
  if (!stackMap || !buff) return;
  const siblings = getStackSyncSiblingBuffs(member, buff, { layersOnly: true });
  const clear = !!opts.clear;
  const next = buff.templateKey === 'suoming_c2_outro_critdmg_stack'
    ? Math.min(4, normalizeStackInput(value)) : value;
  siblings.forEach((b) => {
    if (clear) delete stackMap[b.id];
    else stackMap[b.id] = b.templateKey === 'suoming_c2_outro_critdmg_stack'
      ? Math.min(4, normalizeStackInput(next)) : next;
  });
}

function getMemberFeixueXuexiuStacks(member) {
  if (!member || String(member.characterId) !== FEIXUE_CHAR_ID) return 0;
  const b = (member.buffs || []).find(
    (x) => String(x.templateKey || '') === FEIXUE_XUEXIU_KEY || x.stackSync === FEIXUE_XUEXIU_STACK_SYNC
  );
  if (!b || !isStackBuff(b)) return 0;
  return normalizeStackInput(member.globalBuffStacks?.[b.id] ?? 0);
}

function syncFeixueXuexiuLinkedBuffs(opts = {}) {
  // PROBE_FIX_FEIXUE_TEAM_STACK：全队 Buff 页改层数时，调用方传入 opts.stacks。
  // 原逻辑只从「绯雪个人雪锈」读 masterStacks，忽略该参数，导致干净工作区
  // （个人雪锈为 0）下镜像恒为 0、霜渐加深不生效。此处优先采用传入值并传播到三处。
  if (opts && opts.stacks !== undefined) {
    const __n = Math.max(0, Math.round(Number(opts.stacks) || 0));
    (state.members || []).forEach((m, mi) => {
      if (!m || !m.buffs) return;
      if (!m.globalBuffStacks) m.globalBuffStacks = {};
      (m.buffs || []).forEach((b) => {
        if (!isFeixueXuexiuStackSyncBuff(b)) return;
        m.globalBuffStacks[b.id] = __n;
      });
      const sc = state.specialSkills && state.specialSkills.characters && state.specialSkills.characters[mi];
      if (sc) {
        if (!sc.globalBuffStacks) sc.globalBuffStacks = {};
        (sc.buffs || []).forEach((b) => {
          if (!isFeixueXuexiuStackSyncBuff(b)) return;
          sc.globalBuffStacks[b.id] = __n;
        });
      }
    });
    if (state.specialSkills && Array.isArray(state.specialSkills.items)) {
      state.specialSkills.items.forEach((item) => {
        if (!item || !item.buffStacks) return;
        Object.keys(item.buffStacks).forEach((k) => {
          const find = (list) => (list || []).find((b) => String(b.id) === String(k));
          let b = null;
          (state.members || []).forEach((m) => { if (!b) b = find(m && m.buffs); });
          if (!b && state.specialSkills.characters) {
            state.specialSkills.characters.forEach((c) => { if (!b) b = find(c && c.buffs); });
          }
          if (b && isFeixueXuexiuStackSyncBuff(b)) item.buffStacks[k] = __n;
        });
      });
    }
  }

  // 雪锈层数各角色独立：绯雪/洛瑟菈/穗穗各自管理自己的【雪锈】层数，不跨角色/跨镜像广播。
  // 绯雪本人 personal（暴伤）与全队镜像（霜冻效应加深）由同一【雪锈】层数驱动，
  // 保留 stackSync 标记，让 UI 合并为同一个层数输入（个人为主源，同步同成员镜像）。
  // 同步绯雪「雪锈≥2 层」自动特殊技能（只读绯雪自身层数）。
  // 雪锈层数镜像同步（各角色独立）：以绯雪个人雪锈为该角色主源，
  // 同步同成员的全队镜像，并同步到特殊技能页对应角色的雪锈镜像（显示/编辑一致）
  if (state.specialSkills && Array.isArray(state.specialSkills.characters)) {
    (state.members || []).forEach((m, mi) => {
      if (!m?.buffs) return;
      const personal =
        (m.buffs || []).find((b) => String(b.templateKey || '') === FEIXUE_XUEXIU_KEY) || null;
      const anySnow = personal || (m.buffs || []).find(isFeixueXuexiuStackSyncBuff);
      if (!anySnow) return;
      const masterStacks = normalizeStackInput(m.globalBuffStacks?.[anySnow.id] ?? 0);
      (m.buffs || []).forEach((b) => {
        if (!isFeixueXuexiuStackSyncBuff(b) || b.id === anySnow.id) return;
        if (!m.globalBuffStacks) m.globalBuffStacks = {};
        m.globalBuffStacks[b.id] = masterStacks;
      });
      const sc = state.specialSkills.characters[mi];
      if (sc?.buffs) {
        if (!sc.globalBuffStacks) sc.globalBuffStacks = {};
        (sc.buffs || []).forEach((b) => {
          if (!isFeixueXuexiuStackSyncBuff(b)) return;
          sc.globalBuffStacks[b.id] = masterStacks;
        });
      }
      // 特殊技能条目内的雪锈叠层覆盖也同步（个人/全队镜像同值，避免条目停留在 0 层）
      if (Array.isArray(state.specialSkills.items)) {
        state.specialSkills.items.forEach((item) => {
          if (!item?.buffStacks) return;
          const slot = Number.isInteger(item.sourceRosterSlot)
            ? item.sourceRosterSlot
            : typeof getSpecialSkillRosterIndex === 'function'
              ? getSpecialSkillRosterIndex(item)
              : -1;
          if (slot !== mi || !item.buffStacks) return;
          let touched = false;
          (m.buffs || []).forEach((b) => {
            if (!isFeixueXuexiuStackSyncBuff(b)) return;
            item.buffStacks[b.id] = masterStacks;
            touched = true;
          });
          if (touched) changed = true;
        });
      }
    });
  }
  if (!opts.skipSpecialSkillSync) {
    (state.members || [])
      .filter((m) => String(m?.characterId) === FEIXUE_CHAR_ID)
      .forEach((m) => syncSpecialSkillLibraryMults(m));
  }
  return true;
}

/** 奥古斯塔【以众愿为冕】：导电增伤 / ≥1链暴伤 / ≥2链暴击（层数上限见专属机制） */
function createAugustaSpecialStackBuffEntry(mech) {
  const m = normalizeAugustaSpecialMechanics(mech);
  const entry = normalizeTemplateBuffEntry({
    templateKey: m.stackTemplateKey,
    category: 'composite',
    name: '以众愿为冕',
    mode: 'stack',
    value: 0,
    perStack: 0,
    maxStacks: m.stackCapAtBase,
    damageType: '',
    element: '',
    defenseKind: '',
    clampStacks: true,
    gameText:
      '每层使导电伤害加成提升15%，上限为1层。共鸣解放·赫日威临·不朽者之肃结束时，清除自身全部的【以众愿为冕】。1链时，【以众愿为冕】每层使暴击伤害额外提升15%。【以众愿为冕】上限提高至2层。2链时，【以众愿为冕】获得额外效果：每层使暴击提升20%。6链时【以众愿为冕】的上限提升至4层。',
    effects: [
      {
        zone: 'elementBonus',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: AUGUSTA_CROWN_ELECTRO_PER_STACK }],
        skillScope: 'all',
        skillNames: [],
        librarySkillNames: [],
        catalogIds: [],
        damageType: '',
        effectType: '',
        element: '导电',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: 'augusta_crown_electro',
      },
      {
        zone: 'generalCritDmg',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: AUGUSTA_CROWN_CRIT_DMG_PER_STACK }],
        skillScope: 'all',
        skillNames: [],
        librarySkillNames: [],
        catalogIds: [],
        damageType: '',
        effectType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: AUGUSTA_CROWN_CRIT_DMG_MIN_RESONANCE,
        effectKey: 'augusta_crown_crit_dmg',
      },
      {
        zone: 'generalCritRate',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: m.stackPerCritRate }],
        skillScope: 'all',
        skillNames: [],
        librarySkillNames: [],
        catalogIds: [],
        damageType: '',
        effectType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: AUGUSTA_CROWN_CRIT_RATE_MIN_RESONANCE,
        effectKey: 'augusta_crown_crit_rate',
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = m.stackCapAtBase;
  entry.clampStacks = true;
  return entry;
}

function createAugustaC3MultBoostBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AUGUSTA_C3_MULT_BOOST_KEY,
    category: 'composite',
    name: '奥古斯塔·3链',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: AUGUSTA_C3_MULT_BOOST_PCT,
        skillScope: 'names',
        librarySkillNames: [...AUGUSTA_C3_SKILLS],
        skillNames: [...AUGUSTA_C3_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'augusta_c3_mult_boost',
      },
    ],
  });
}

function createAugustaC4TeamAtkBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AUGUSTA_C4_TEAM_ATK_KEY,
    category: 'generalAttack',
    name: '奥古斯塔·4链',
    mode: 'fixed',
    value: AUGUSTA_C4_TEAM_ATK_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createAugustaC6NutingExtraSkillEntry() {
  return normalizeTemplateExtraSkillEntry({
    templateKey: AUGUSTA_C6_NUTING_SKILL_KEY,
    name: '怒霆',
    damageType: '重击',
    baseMult: AUGUSTA_C6_NUTING_BASE_MULT,
  });
}

const AMIS_C1_HEAVY_CRIT_KEY = 'amis_c1_heavy_crit_dmg';
const AMIS_INNATE_HEAVY_DEEP_KEY = 'amis_innate_heavy_deep';
/** 爱弥斯·延奏：全员泛用加深+10%；达妮娅/琳奈再+10%（合计20%）；本人不生效 */
const AMIS_OUTRO_KEY = 'amis_outro_general_deep';
const AMIS_OUTRO_EXTRA_EFFECT_KEY = 'amis_outro_dania_linnei_extra';
const AMIS_OUTRO_LEGACY_KEYS = new Set([
  'amis_outro1_general_deep',
  'amis_outro2_general_deep',
]);
const AMIS_C2_WING_MULT_KEY = 'amis_c2_wing_mult_boost';
const AMIS_C3_STAR_MULT_KEY = 'amis_c3_star_mult_boost';
const AMIS_C4_TEAM_BONUS_KEY = 'amis_c4_team_general_bonus';
const AMIS_C6_LIB_VULN_KEY = 'amis_c6_lib_type_vuln';
const AMIS_C1_HEAVY_SKILLS = [
  '校准无垠·重击·爱弥斯·二段蓄力',
  '共赴长航·重击·机兵·二段蓄力',
];
const AMIS_C2_WING_SKILLS = [
  '为寂静赋形·光翼共奏·降临',
  '为寂静赋形·光翼共奏·登台',
];
const AMIS_C3_STAR_FINALE_SKILLS = ['飞至启明之时·星辉破界而来·终结'];
const AMIS_C3_STAR_OVERLOAD_SKILLS = ['飞至启明之时·星辉破界而来·过载'];
const DANIA_SKILL_EXILE_S2_MULT_KEY = 'dania_skill_exile_s2_mult_boost';
const DANIA_SKILL_ILLUSION_FORM_MULT_KEY = 'dania_skill_illusion_form_mult_boost';
const DANIA_C2_EXILE_MULT_KEY = 'dania_c2_exile_mult_boost';
/** 达妮娅聚爆模态：全队效应·聚爆加深 +60% */
const DANIA_BURST_EFFECT_DEEP_KEY = 'dania_burst_effect_deep';
const DANIA_EXILE_S1_SKILLS = ['泡沫蜜饵·放逐·幻灭之形第一段'];
const DANIA_EXILE_S2_SKILLS = ['泡沫蜜饵·放逐·幻灭之形第二段'];
const DANIA_ILLUSION_FORM_SKILLS = [
  '织梦的飨宴·普攻·幻灭之形第一段',
  '织梦的飨宴·普攻·幻灭之形第二段',
  '织梦的飨宴·普攻·幻灭之形第三段',
  '织梦的飨宴·普攻·幻灭之形第四段',
  '织梦的飨宴·闪避反击·幻灭之形',
  '织梦的飨宴·普攻·幻灭之形第一段·共鸣解放',
  '织梦的飨宴·普攻·幻灭之形第二段·共鸣解放',
  '织梦的飨宴·普攻·幻灭之形第三段·共鸣解放',
  '织梦的飨宴·普攻·幻灭之形第四段·共鸣解放',
  '织梦的飨宴·闪避反击·幻灭之形·共鸣解放',
];

/** 已有模板条目只补结构字段，绝不覆盖 effects / value 等用户编辑内容 */
function patchTemplateBuffMetaFromFresh(prev, fresh) {
  if (!prev || !fresh) return;
  if (!prev.name && fresh.name) prev.name = fresh.name;
  if (fresh.category && !prev.category) prev.category = fresh.category;
  if (fresh.mode && !prev.mode) prev.mode = fresh.mode;
  if (Number(fresh.maxStacks) > 0 && !(Number(prev.maxStacks) > 0)) {
    prev.maxStacks = fresh.maxStacks;
  }
  if (fresh.stackSync) prev.stackSync = fresh.stackSync;
  if (fresh.activeSync) prev.activeSync = fresh.activeSync;
  if (fresh.excludeSource) prev.excludeSource = true;
  if (fresh.clampStacks) prev.clampStacks = true;
  if (Array.isArray(fresh.onlyCharacterIds) && fresh.onlyCharacterIds.length) {
    prev.onlyCharacterIds = fresh.onlyCharacterIds.map((id) => String(id || '').trim()).filter(Boolean);
  }
}

/**
 * ensure*Shape 整条替换时保留已有 gameText（工厂条目通常没有原文案）。
 * @param {object|null} prev
 * @param {object} fresh
 * @param {object} [extras]
 */
function mergeTemplateBuffKeepGameText(prev, fresh, extras = {}) {
  const kept = normalizeBuffGameText(prev?.gameText);
  return normalizeTemplateBuffEntry({
    ...fresh,
    ...extras,
    templateKey: extras.templateKey || fresh?.templateKey || prev?.templateKey,
    name: extras.name || prev?.name || fresh?.name,
    ...(kept ? { gameText: kept } : {}),
  });
}

/** 备注仅在空时写入，避免 ensure*Shape 覆盖用户侧栏备注 */
function setTemplateNotesIfEmpty(tpl, notes) {
  if (!tpl || notes == null) return;
  if (!String(tpl.notes || '').trim()) tpl.notes = notes;
}

/** 列表内按 templateKey 补齐：已有则只补 meta，缺失才插入工厂条目 */
function ensureTemplateListBuff(list, templateKey, entryFactory) {
  if (!Array.isArray(list) || !templateKey) return;
  const idx = list.findIndex((b) => b?.templateKey === templateKey);
  if (idx >= 0) {
    patchTemplateBuffMetaFromFresh(list[idx], entryFactory());
    return;
  }
  list.unshift(entryFactory());
}

function upsertAmisBodyPersonalBuff(tpl, templateKey, entryFactory) {
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(tpl.personalBuffs, templateKey, entryFactory);
}

function upsertAmisBodyTeamBuff(tpl, templateKey, entryFactory) {
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  ensureTemplateListBuff(tpl.teamBuffs, templateKey, entryFactory);
}

/** 本体 combatModes[mode].teamBuffs 写入/补齐 */
function upsertAmisBodyCombatModeTeamBuff(tpl, modeKey, templateKey, entryFactory) {
  if (!tpl || !modeKey || !templateKey) return;
  ensureTemplateCombatModes(tpl);
  if (!tpl.combatModes[modeKey] || typeof tpl.combatModes[modeKey] !== 'object') {
    tpl.combatModes[modeKey] = emptyCombatModeBlock();
  }
  const block = tpl.combatModes[modeKey];
  if (!Array.isArray(block.teamBuffs)) block.teamBuffs = [];
  // 避免误挂到本体 teamBuffs
  if (Array.isArray(tpl.teamBuffs)) {
    tpl.teamBuffs = tpl.teamBuffs.filter((b) => String(b?.templateKey || '') !== templateKey);
  }
  ensureTemplateListBuff(block.teamBuffs, templateKey, entryFactory);
}

/** 本体 combatModes[mode].personalBuffs 写入/补齐（保留用户已改数值） */
function upsertAmisBodyCombatModePersonalBuff(tpl, modeKey, templateKey, entryFactory) {
  if (!tpl || !modeKey || !templateKey) return;
  ensureTemplateCombatModes(tpl);
  if (!tpl.combatModes[modeKey] || typeof tpl.combatModes[modeKey] !== 'object') {
    tpl.combatModes[modeKey] = emptyCombatModeBlock();
  }
  const block = tpl.combatModes[modeKey];
  if (!Array.isArray(block.personalBuffs)) block.personalBuffs = [];
  if (Array.isArray(tpl.personalBuffs)) {
    tpl.personalBuffs = tpl.personalBuffs.filter((b) => String(b?.templateKey || '') !== templateKey);
  }
  ensureTemplateListBuff(block.personalBuffs, templateKey, entryFactory);
}

function upsertAmisChainBuff(tpl, chainIndex, templateKey, entryFactory, notesHint, scope) {
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const key = String(chainIndex);
  const block = tpl.resonanceChains[key] || normalizeChainBlock({});
  const listKey = scope === 'team' ? 'teamBuffs' : 'personalBuffs';
  if (!Array.isArray(block[listKey])) block[listKey] = [];
  const idx = block[listKey].findIndex((b) => b?.templateKey === templateKey);
  const fresh = entryFactory();
  if (idx >= 0) {
    const prev = block[listKey][idx];
    const prevEffects = Array.isArray(prev?.effects) ? prev.effects : [];
    const freshEffects = Array.isArray(fresh?.effects) ? fresh.effects : [];
    const brokenComposite =
      fresh.category === 'composite' && (!prevEffects.length || prev.category !== 'composite');
    const brokenSimple =
      fresh.category !== 'composite' &&
      !(Number(prev?.value) > 0) &&
      !(Number(prev?.perStack) > 0) &&
      Number(fresh?.value) > 0;
    if (brokenComposite || brokenSimple || (freshEffects.length && !prevEffects.length)) {
      block[listKey][idx] = mergeTemplateBuffKeepGameText(prev, fresh, { templateKey });
    } else {
      patchTemplateBuffMetaFromFresh(prev, fresh);
    }
  } else {
    block[listKey].unshift(fresh);
  }
  // 不覆盖用户已写的链备注
  if (notesHint && !String(block.notes || '').trim()) {
    block.notes = `内置：${notesHint}`;
  }
  tpl.resonanceChains[key] = block;
}

function upsertAmisChainPersonalBuff(tpl, chainIndex, templateKey, entryFactory, notesHint) {
  upsertAmisChainBuff(tpl, chainIndex, templateKey, entryFactory, notesHint, 'personal');
}

function upsertAmisChainTeamBuff(tpl, chainIndex, templateKey, entryFactory, notesHint) {
  upsertAmisChainBuff(tpl, chainIndex, templateKey, entryFactory, notesHint, 'team');
}

function createAmisInnateHeavyDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_INNATE_HEAVY_DEEP_KEY,
    category: 'composite',
    name: '爱弥斯·固有·二段蓄力加深',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: 200,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C1_HEAVY_SKILLS],
        skillNames: [
          '重击·爱弥斯·二段蓄力',
          '重击·机兵·二段蓄力',
          ...AMIS_C1_HEAVY_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createAmisChain1HeavyCritBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_C1_HEAVY_CRIT_KEY,
    category: 'composite',
    name: '爱弥斯·1链·二段蓄力暴伤',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: 300,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C1_HEAVY_SKILLS],
        skillNames: [
          '重击·爱弥斯·二段蓄力',
          '重击·机兵·二段蓄力',
          ...AMIS_C1_HEAVY_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createAmisChain2WingMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_C2_WING_MULT_KEY,
    category: 'composite',
    name: '爱弥斯·2链·光翼共奏倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 100,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C2_WING_SKILLS],
        skillNames: [
          '光翼共奏·降临',
          '光翼共奏·登台',
          ...AMIS_C2_WING_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createAmisChain3StarMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_C3_STAR_MULT_KEY,
    category: 'composite',
    name: '爱弥斯·3链·星辉破界而来倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 100,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C3_STAR_FINALE_SKILLS],
        skillNames: ['星辉破界而来·终结', ...AMIS_C3_STAR_FINALE_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 40,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C3_STAR_OVERLOAD_SKILLS],
        skillNames: ['星辉破界而来·过载', ...AMIS_C3_STAR_OVERLOAD_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createAmisOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: AMIS_OUTRO_KEY,
    category: 'composite',
    name: '爱弥斯·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: 10,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: 10,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        onlyCharacterIds: [DANIA_CHAR_ID, LINNEI_CHAR_ID],
        effectKey: AMIS_OUTRO_EXTRA_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  ensureAmisOutroEffects(entry);
  return entry;
}

function isAmisOutroBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === AMIS_OUTRO_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  return name === '爱弥斯·延奏';
}

/** 爱弥斯·延奏：全员+10%加深；达妮娅/琳奈再+10% */
function ensureAmisOutroEffects(buff) {
  if (!buff || !isAmisOutroBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = AMIS_OUTRO_KEY;
  if (!buff.name || /延奏[12]/.test(String(buff.name))) buff.name = '爱弥斯·延奏';
  buff.excludeSource = true;
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const baseIdx = buff.effects.findIndex(
    (fx) =>
      fx?.zone === 'generalDeep' &&
      String(fx?.effectKey || '') !== AMIS_OUTRO_EXTRA_EFFECT_KEY
  );
  const baseFx = {
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: 10,
    skillScope: 'all',
    damageType: '',
    element: '',
    defenseKind: '',
    minStacks: 0,
    minResonance: 0,
  };
  if (baseIdx >= 0) {
    const prevId = buff.effects[baseIdx].id;
    buff.effects[baseIdx] = normalizeCompositeEffect({ ...baseFx, id: prevId });
  } else {
    buff.effects.unshift(normalizeCompositeEffect(baseFx));
  }
  if (typeof upsertLucyOutroAutoEffect === 'function') {
    upsertLucyOutroAutoEffect(buff, AMIS_OUTRO_EXTRA_EFFECT_KEY, {
      zone: 'generalDeep',
      valueMode: 'fixed',
      value: 10,
      skillScope: 'all',
      onlyCharacterIds: [DANIA_CHAR_ID, LINNEI_CHAR_ID],
      minStacks: 0,
      minResonance: 0,
    });
  } else {
    const extraIdx = buff.effects.findIndex(
      (fx) => String(fx?.effectKey || '') === AMIS_OUTRO_EXTRA_EFFECT_KEY
    );
    const extraFx = {
      zone: 'generalDeep',
      valueMode: 'fixed',
      value: 10,
      skillScope: 'all',
      damageType: '',
      element: '',
      defenseKind: '',
      minStacks: 0,
      minResonance: 0,
      onlyCharacterIds: [DANIA_CHAR_ID, LINNEI_CHAR_ID],
      effectKey: AMIS_OUTRO_EXTRA_EFFECT_KEY,
    };
    if (extraIdx >= 0) {
      const prevId = buff.effects[extraIdx].id;
      buff.effects[extraIdx] = normalizeCompositeEffect({ ...extraFx, id: prevId });
    } else {
      buff.effects.push(normalizeCompositeEffect(extraFx));
    }
  }
  const base = buff.effects.find(
    (fx) =>
      fx?.zone === 'generalDeep' &&
      String(fx?.effectKey || '') !== AMIS_OUTRO_EXTRA_EFFECT_KEY
  );
  const extra = buff.effects.find(
    (fx) => String(fx?.effectKey || '') === AMIS_OUTRO_EXTRA_EFFECT_KEY
  );
  buff.effects = [base, extra].filter(Boolean);
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

/** 运行时：去掉旧延奏1/2，补齐新【爱弥斯·延奏】 */
function migrateAmisOutroSharedBuffs() {
  const shared = ensureTeamSharedBuffs();
  if (!Array.isArray(shared.buffs)) shared.buffs = [];
  shared.buffs = shared.buffs.filter((b) => {
    const key = String(b?.templateKey || '');
    if (AMIS_OUTRO_LEGACY_KEYS.has(key)) {
      if (b?.id) {
        delete shared.globalBuffActive[b.id];
        delete shared.globalBuffStacks[b.id];
      }
      return false;
    }
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b?.name)
        : String(b?.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (/^爱弥斯·延奏[12]$/.test(name)) {
      if (b?.id) {
        delete shared.globalBuffActive[b.id];
        delete shared.globalBuffStacks[b.id];
      }
      return false;
    }
    return true;
  });
  (shared.buffs || []).forEach((b) => {
    if (isAmisOutroBuff(b)) ensureAmisOutroEffects(b);
  });
  (state.members || []).forEach((m, mi) => {
    if (String(m?.characterId) !== AMIS_CHAR_ID) return;
    const has = (shared.buffs || []).some(
      (b) => isAmisOutroBuff(b) && getTeamBuffSourceMemberIndex(b) === mi
    );
    if (has) return;
    const hadAmisTemplate =
      (shared.buffs || []).some(
        (b) =>
          typeof isCharacterTemplateBuff === 'function' &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === mi
      ) ||
      (m.buffs || []).some(
        (b) => typeof isCharacterTemplateBuff === 'function' && isCharacterTemplateBuff(b)
      );
    if (!hadAmisTemplate) return;
    const tpl =
      typeof getCharacterBuffTemplate === 'function'
        ? getCharacterBuffTemplate(AMIS_CHAR_ID)
        : null;
    const entry = (tpl?.teamBuffs || []).find(
      (e) => String(e?.templateKey || '') === AMIS_OUTRO_KEY
    );
    if (!entry || typeof materializeTemplateBuff !== 'function') return;
    const buff = materializeTemplateBuff(entry, {
      characterId: AMIS_CHAR_ID,
      memberIndex: mi,
      scope: 'team',
    });
    ensureAmisOutroEffects(buff);
    shared.buffs.push(buff);
    invalidateSharedBuffsCache();
    if (shared.globalBuffActive[buff.id] === undefined) {
      shared.globalBuffActive[buff.id] = true;
    }
    if (buff.excludeSource) {
      const excl = ensureExcludedTeamBuffIds(m);
      if (!excl.includes(buff.id)) excl.push(buff.id);
    }
  });
}

function createAmisChain4TeamBonusBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_C4_TEAM_BONUS_KEY,
    category: 'generalBonus',
    name: '爱弥斯·4链·全队泛用增伤',
    mode: 'fixed',
    value: 20,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createAmisChain6LibVulnBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_C6_LIB_VULN_KEY,
    category: 'typeVulnerability',
    name: '爱弥斯·6链·共鸣解放易伤',
    mode: 'fixed',
    value: 40,
    damageType: '共鸣解放',
    element: '',
    defenseKind: '',
  });
}

function isAmisInnate2TemplateKey(key) {
  const k = String(key || '').trim();
  return k === AMIS_INNATE2_CRIT_KEY || k === AMIS_INNATE2_DEEP_KEY;
}

/** 模板占位：仅存【固有2】原文案；数值仍由模态 kit 写入运行时 */
function createAmisInnate2CritBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_INNATE2_CRIT_KEY,
    category: 'generalCritDmg',
    name: '固有2',
    mode: 'stack',
    value: 0,
    perStack: 20,
    maxStacks: 99,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createAmisInnate2FinaleDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AMIS_INNATE2_DEEP_KEY,
    category: 'composite',
    name: '固有2',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: 25,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C3_STAR_FINALE_SKILLS],
        skillNames: ['星辉破界而来·终结', ...AMIS_C3_STAR_FINALE_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

/** 爱弥斯链 Buff：震谐/聚爆均生效，不随模态切换 */
function ensureAmisTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== AMIS_CHAR_ID) return tpl;
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) =>
      (list || []).filter((b) => {
        const key = String(b?.templateKey || '');
        if (AMIS_OUTRO_LEGACY_KEYS.has(key)) return false;
        const name =
          typeof stripManagedBuffSourcePrefixes === 'function'
            ? stripManagedBuffSourcePrefixes(b?.name)
            : String(b?.name || '').trim();
        return !/^爱弥斯·延奏[12]$/.test(name);
      })
    );
  }
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(tpl.personalBuffs, AMIS_INNATE2_CRIT_KEY, createAmisInnate2CritBuffEntry);
  ensureTemplateListBuff(
    tpl.personalBuffs,
    AMIS_INNATE2_DEEP_KEY,
    createAmisInnate2FinaleDeepBuffEntry
  );
  upsertAmisBodyPersonalBuff(tpl, AMIS_INNATE_HEAVY_DEEP_KEY, createAmisInnateHeavyDeepBuffEntry);
  upsertForcedTeamBuffEntry(tpl, AMIS_OUTRO_KEY, createAmisOutroBuffEntry, AMIS_OUTRO_LEGACY_KEYS);
  (tpl.teamBuffs || []).forEach((b) => {
    if (isAmisOutroBuff(b)) ensureAmisOutroEffects(b);
  });
  upsertAmisChainPersonalBuff(
    tpl,
    1,
    AMIS_C1_HEAVY_CRIT_KEY,
    createAmisChain1HeavyCritBuffEntry,
    '指定技能【重击·爱弥斯/机兵·二段蓄力】暴伤+300%（双模态均生效）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    2,
    AMIS_C2_WING_MULT_KEY,
    createAmisChain2WingMultBuffEntry,
    '指定技能【光翼共奏·降临/登台】倍率提升+100%（双模态均生效）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    3,
    AMIS_C3_STAR_MULT_KEY,
    createAmisChain3StarMultBuffEntry,
    '指定技能【星辉破界而来·终结】倍率提升+100%、【过载】+40%（双模态均生效）'
  );
  upsertAmisChainTeamBuff(
    tpl,
    4,
    AMIS_C4_TEAM_BONUS_KEY,
    createAmisChain4TeamBonusBuffEntry,
    '全队泛用增伤+20%（固定，默认全队生效；震谐/聚爆均生效）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    6,
    AMIS_C6_LIB_VULN_KEY,
    createAmisChain6LibVulnBuffEntry,
    '共鸣解放类型易伤+40%（震谐/聚爆均生效）'
  );
  backfillChainEntryGameTextsFromBlocks(tpl);
  if (!tpl.characterName) tpl.characterName = '爱弥斯';
  const amisNotes =
    '爱弥斯：0链分支攻击12%/暴击率8%；固有指定二段蓄力加深+200%；固有2随震谐/聚爆切换（暴伤叠层20%/30% + 星辉终结加深25%）；全队【爱弥斯·延奏】泛用加深+10%、达妮娅/琳奈再+10%（合计20%；对爱弥斯本人不生效；震谐/聚爆均生效）；1链指定二段蓄力暴伤+300%；2链光翼共奏倍率提升+100%；3链星辉破界而来·终结+100%/过载+40%；4链全队泛用增伤+20%；6链共鸣解放类型易伤+40%。';
  if (
    !String(tpl.notes || '').trim() ||
    /爱弥斯·延奏[12]/.test(String(tpl.notes || '')) ||
    !/爱弥斯·延奏/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = amisNotes;
  }
  return tpl;
}

function createDaniaSkillExileS2MultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: DANIA_SKILL_EXILE_S2_MULT_KEY,
    category: 'composite',
    name: '达妮娅·技能·放逐第二段倍率提升',
    mode: 'stack',
    value: 0,
    maxStacks: 99,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: 150 }],
        skillScope: 'names',
        librarySkillNames: [...DANIA_EXILE_S2_SKILLS],
        skillNames: ['放逐·幻灭之形第二段', ...DANIA_EXILE_S2_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createDaniaSkillIllusionFormMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: DANIA_SKILL_ILLUSION_FORM_MULT_KEY,
    category: 'composite',
    name: '达妮娅·技能·幻灭之形倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 50,
        skillScope: 'names',
        librarySkillNames: [...DANIA_ILLUSION_FORM_SKILLS],
        skillNames: [
          '普攻·幻灭之形',
          '闪避反击·幻灭之形',
          '普攻·幻灭之形第一段',
          '普攻·幻灭之形第二段',
          '普攻·幻灭之形第三段',
          '普攻·幻灭之形第四段',
          ...DANIA_ILLUSION_FORM_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createDaniaChain2ExileMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: DANIA_C2_EXILE_MULT_KEY,
    category: 'composite',
    name: '达妮娅·2链·放逐倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoostExtra',
        valueMode: 'fixed',
        value: 40,
        skillScope: 'names',
        librarySkillNames: [...DANIA_EXILE_S1_SKILLS, ...DANIA_EXILE_S2_SKILLS],
        skillNames: [
          '放逐·幻灭之形第一段',
          '放逐·幻灭之形第二段',
          ...DANIA_EXILE_S1_SKILLS,
          ...DANIA_EXILE_S2_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

/** 达妮娅本体技能 Buff */
function createDaniaBurstEffectDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: DANIA_BURST_EFFECT_DEEP_KEY,
    category: 'typeDeep',
    name: '达妮娅·聚爆加深',
    mode: 'fixed',
    value: 60,
    damageType: '效应',
    effectType: '聚爆',
    element: '',
    defenseKind: '',
  });
}

function isDaniaOutroBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  if (key === DANIA_OUTRO_KEY) return true;
  return String(b.name || '').includes('达妮娅·延奏');
}

function createDaniaOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: DANIA_OUTRO_KEY,
    category: 'composite',
    name: '达妮娅·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: DANIA_OUTRO_BASE_DEEP_PCT,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: DANIA_OUTRO_EXTRA_DEEP_PCT,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        onlyCharacterIds: [...DANIA_OUTRO_PRIVILEGED_CHAR_IDS],
        onlyCombatModes: ['convergence'],
        effectKey: DANIA_OUTRO_EXTRA_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  ensureDaniaOutroEffects(entry);
  return entry;
}

/** 达妮娅·延奏：全员+15%；陆·赫斯/集谐琳奈/清宵再+25%（合计40%） */
function ensureDaniaOutroEffects(buff) {
  if (!buff || !isDaniaOutroBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = DANIA_OUTRO_KEY;
  if (!buff.name) buff.name = '达妮娅·延奏';
  buff.excludeSource = true;
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  buff.combatModeKey = 'convergence';
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const baseIdx = buff.effects.findIndex(
    (fx) =>
      fx?.zone === 'generalDeep' &&
      String(fx?.effectKey || '') !== DANIA_OUTRO_EXTRA_EFFECT_KEY
  );
  const baseFx = {
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: DANIA_OUTRO_BASE_DEEP_PCT,
    skillScope: 'all',
    damageType: '',
    element: '',
    defenseKind: '',
    minStacks: 0,
    minResonance: 0,
  };
  if (baseIdx >= 0) {
    const prevId = buff.effects[baseIdx].id;
    buff.effects[baseIdx] = normalizeCompositeEffect({ ...baseFx, id: prevId });
  } else {
    buff.effects.unshift(normalizeCompositeEffect(baseFx));
  }
  if (typeof upsertLucyOutroAutoEffect === 'function') {
    upsertLucyOutroAutoEffect(buff, DANIA_OUTRO_EXTRA_EFFECT_KEY, {
      zone: 'generalDeep',
      valueMode: 'fixed',
      value: DANIA_OUTRO_EXTRA_DEEP_PCT,
      skillScope: 'all',
      onlyCharacterIds: [...DANIA_OUTRO_PRIVILEGED_CHAR_IDS],
      onlyCombatModes: ['convergence'],
      minStacks: 0,
      minResonance: 0,
    });
  } else {
    const extraIdx = buff.effects.findIndex(
      (fx) => String(fx?.effectKey || '') === DANIA_OUTRO_EXTRA_EFFECT_KEY
    );
    const extraFx = {
      zone: 'generalDeep',
      valueMode: 'fixed',
      value: DANIA_OUTRO_EXTRA_DEEP_PCT,
      skillScope: 'all',
      damageType: '',
      element: '',
      defenseKind: '',
      minStacks: 0,
      minResonance: 0,
      onlyCharacterIds: [...DANIA_OUTRO_PRIVILEGED_CHAR_IDS],
      onlyCombatModes: ['convergence'],
      effectKey: DANIA_OUTRO_EXTRA_EFFECT_KEY,
    };
    if (extraIdx >= 0) {
      const prevId = buff.effects[extraIdx].id;
      buff.effects[extraIdx] = normalizeCompositeEffect({ ...extraFx, id: prevId });
    } else {
      buff.effects.push(normalizeCompositeEffect(extraFx));
    }
  }
  const base = buff.effects.find(
    (fx) =>
      fx?.zone === 'generalDeep' &&
      String(fx?.effectKey || '') !== DANIA_OUTRO_EXTRA_EFFECT_KEY
  );
  const extra = buff.effects.find(
    (fx) => String(fx?.effectKey || '') === DANIA_OUTRO_EXTRA_EFFECT_KEY
  );
  buff.effects = [base, extra].filter(Boolean);
  buff._daniaOutroHint = `集谐模态 · 泛用加深 ${DANIA_OUTRO_BASE_DEEP_PCT}%；陆·赫斯/集谐琳奈/清宵 ${DANIA_OUTRO_PRIVILEGED_DEEP_PCT}%（本人不生效）`;
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function patchDaniaOutroBuff(b) {
  if (!isDaniaOutroBuff(b)) return;
  ensureDaniaOutroEffects(b);
}

function syncAllDaniaOutroDeep() {
  const shared = ensureTeamSharedBuffs();
  (shared.buffs || []).forEach((b) => patchDaniaOutroBuff(b));
  (state.members || []).forEach((m) => {
    (m.buffs || []).forEach((b) => patchDaniaOutroBuff(b));
    (m.cycleConfig?.rounds || []).forEach((round) => {
      (round.buffs || []).forEach((b) => patchDaniaOutroBuff(b));
    });
  });
}

// 角色/系统机制同步步骤注册表（A2 阶段一）：按站点分组的**有序**清单。
// 每个步骤 = { fn: 函数引用, arg: 'member'|'none' }，调用时 typeof 守卫（与原代码一致）。
// 新增角色机制时在此登记，而不是到三个站点分别插代码。
const MECH_SYNC_STEPS = {
  skillUnitMember: [{ fn: syncLilyErCrit, arg: 'member' }],
  computeAllMember: [
    { fn: syncLuhesiInnate2HarmonyDeep, arg: 'member' },
    { fn: syncSigrikaInnate2EchoBonus, arg: 'member' },
    { fn: syncChouyuanLiberationCritDmg, arg: 'member' },
    { fn: syncRococoCritFlatAtk, arg: 'member' },
    { fn: syncMoningInnateErPanel, arg: 'member' },
    { fn: syncMoningCriticalProtocolErConvert, arg: 'member' },
    { fn: syncMoningC2ErCritDmg, arg: 'member' },
    { fn: syncMoningInterferenceMarkEr, arg: 'member' },
    { fn: syncLilyErCrit, arg: 'member' },
    { fn: syncSuisuiOutroErConvert, arg: 'member' },
    { fn: syncShorekeeperStarErConvert, arg: 'member' },
    { fn: syncJingranHpFlatAtkPanel, arg: 'member' },
    { fn: syncJingranMinghuoMult, arg: 'member' },
    { fn: syncJingranHuoxiFuxiBonus, arg: 'member' },
    { fn: syncJingranYoufuFumingBonus, arg: 'member' },
    { fn: syncDaniaInnateOffsetHarmonyAmp, arg: 'member' },
    { fn: syncLingyangC5BuffNames, arg: 'member' },
    { fn: syncVerinaC6BuffNames, arg: 'member' },
    { fn: syncChunC6BuffNames, arg: 'member' },
    { fn: syncJiabeilinaC3UltMultBuffNames, arg: 'member' },
    { fn: syncLoseraEchoBianjiaoNames, arg: 'member' },
    { fn: syncYouhuShizhongwuBuffNames, arg: 'member' },
    { fn: syncEchoSetConvertedAttackValues, arg: 'none' },
  ],
  uiStateMember: [
    { fn: syncMemberCombatModeState, arg: 'member' },
    { fn: syncBrantErFlatAtkPanelPreview, arg: 'member' },
    { fn: syncJingranHpFlatAtkPanel, arg: 'member' },
    { fn: syncJingranMinghuoMult, arg: 'member' },
    { fn: syncJingranHuoxiFuxiBonus, arg: 'member' },
    { fn: syncJingranYoufuFumingBonus, arg: 'member' },
    { fn: syncLuhesiInnate2HarmonyDeep, arg: 'member' },
    { fn: syncSigrikaInnate2EchoBonus, arg: 'member' },
    { fn: syncChouyuanLiberationCritDmg, arg: 'member' },
    { fn: syncRococoCritFlatAtk, arg: 'member' },
    { fn: syncMoningInnateErPanel, arg: 'member' },
    { fn: syncMoningCriticalProtocolErConvert, arg: 'member' },
    { fn: syncMoningC2ErCritDmg, arg: 'member' },
    { fn: syncMoningInterferenceMarkEr, arg: 'member' },
    { fn: syncLilyErCrit, arg: 'member' },
    { fn: syncSuisuiOutroErConvert, arg: 'member' },
    { fn: syncShorekeeperStarErConvert, arg: 'member' },
    { fn: syncMoningOffsetHarmonyEffToAllPanels, arg: 'none' },
    { fn: syncRococoFlatAtkToAllPanels, arg: 'none' },
    { fn: syncDaniaInnateOffsetHarmonyAmp, arg: 'member' },
    { fn: syncLingyangC5BuffNames, arg: 'member' },
    { fn: syncVerinaC6BuffNames, arg: 'member' },
    { fn: syncChunC6BuffNames, arg: 'member' },
    { fn: syncJiabeilinaC3UltMultBuffNames, arg: 'member' },
    { fn: syncLoseraEchoBianjiaoNames, arg: 'member' },
    { fn: syncYouhuShizhongwuBuffNames, arg: 'member' },
    { fn: syncEchoSetConvertedAttackValues, arg: 'none' },
  ],
  convertedTeam: [
    { fn: syncMoningOffsetHarmonyEffToAllPanels, arg: 'none' },
    { fn: syncShorekeeperInnate2ErPanels, arg: 'none' },
    { fn: syncRococoFlatAtkToAllPanels, arg: 'none' },
    { fn: syncAllDaniaOutroDeep, arg: 'none' },
  ],
  convertedMember: [
    { fn: syncDaniaInnateOffsetHarmonyAmp, arg: 'member' },
    { fn: syncChouyuanLiberationCritDmg, arg: 'member' },
    { fn: syncRococoCritFlatAtk, arg: 'member' },
    { fn: syncMoningInnateErPanel, arg: 'member' },
    { fn: syncMoningC2ErCritDmg, arg: 'member' },
    { fn: syncMoningInterferenceMarkEr, arg: 'member' },
    { fn: syncLilyErCrit, arg: 'member' },
    { fn: syncSuisuiOutroErConvert, arg: 'member' },
    { fn: syncShorekeeperStarErConvert, arg: 'member' },
    { fn: syncEchoSetConvertedAttackValues, arg: 'none' },
  ],
};

/**
 * 重新勾选全队覆盖 / 局部重同步后：刷新「共享库存结构、镜像写真实值」类转模 Buff。
 * 普通固定全队 Buff 不依赖此函数；达妮娅谐幅等若漏刷会停在 0。
 */
function refreshRuntimeConvertedTeamBuffs() {
  if (typeof syncTeamFusionLinkedBuffs === 'function') {
    syncTeamFusionLinkedBuffs({ skipMemberSync: true });
  }
  if (typeof syncFeixueXuexiuLinkedBuffs === 'function') {
    syncFeixueXuexiuLinkedBuffs({ skipMemberSync: true });
  }
  if (typeof syncEchoSetHarmonyAmpAtkStacks === 'function') {
    syncEchoSetHarmonyAmpAtkStacks({ skipMemberSync: true });
  }
  // 须先按覆盖勾选重写偏谐效率面板，再算达妮娅谐幅转模
  MECH_SYNC_STEPS.convertedTeam.forEach((step) => {
    if (typeof step.fn === 'function') step.fn();
  });
  (state.members || []).forEach((m) => {
    MECH_SYNC_STEPS.convertedMember.forEach((step) => {
      if (typeof step.fn === 'function') step.fn(m);
    });
  });
}

/** 把共享库叠层写回目标角色的全队镜像（仅自动同步层数类；手工层数不覆盖） */
function syncTargetTeamMirrorStacksFromShared(target) {
  if (!target) return;
  const shared = ensureTeamSharedBuffs();
  if (!target.globalBuffStacks) target.globalBuffStacks = {};
  (target.buffs || []).forEach((b) => {
    if (!b?.teamSourceId) return;
    const tb = (shared.buffs || []).find((x) => x.id === b.teamSourceId);
    if (!tb || !isStackBuff(tb)) return;
    const autoStack =
      (typeof isTeamFusionStackSyncBuff === 'function' && isTeamFusionStackSyncBuff(tb)) ||
      (typeof isEchoSetHarmonyAmpAtkBuff === 'function' && isEchoSetHarmonyAmpAtkBuff(tb));
    if (!autoStack && target.globalBuffStacks[b.id] !== undefined) return;
    target.globalBuffStacks[b.id] = normalizeStackInput(shared.globalBuffStacks?.[tb.id] ?? 0);
  });
}

/** 偏谐值累积效率 → 谐幅：超过100%时每满10% +8，上限40 */
function computeDaniaOffsetHarmonyAmp(effPct) {
  const raw = Number(effPct);
  const pct =
    Number.isFinite(raw) && raw > 0 ? raw : typeof OFFSET_HARMONY_EFF_BASE_VALUE === 'number'
      ? OFFSET_HARMONY_EFF_BASE_VALUE
      : 100;
  const excess = Math.max(0, pct - DANIA_INNATE_OFFSET_HARMONY_AMP_THRESHOLD);
  const chunks = Math.floor(excess / DANIA_INNATE_OFFSET_HARMONY_AMP_CHUNK_PCT);
  const amp = Math.min(
    DANIA_INNATE_OFFSET_HARMONY_AMP_CAP,
    chunks * DANIA_INNATE_OFFSET_HARMONY_AMP_PER_CHUNK
  );
  return { eff: pct, excess, chunks, amp };
}

function getMemberOffsetHarmonyEffPct(member) {
  const total = getCharStatTotal(member?.char || {}, 'offsetHarmonyEffPct');
  if (Number.isFinite(total) && total > 0) return total;
  return typeof OFFSET_HARMONY_EFF_BASE_VALUE === 'number' ? OFFSET_HARMONY_EFF_BASE_VALUE : 100;
}

function isDaniaInnateOffsetHarmonyAmpBuff(b) {
  if (!b || b.category !== 'harmonyBreakAmp') return false;
  const key = String(b.templateKey || '');
  if (
    key === DANIA_INNATE_OFFSET_HARMONY_AMP_KEY ||
    key === DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY ||
    key === DANIA_INNATE_BASE_HARMONY_AMP_KEY
  ) {
    return true;
  }
  const name = String(b.name || '');
  // 「达妮娅·固有」谐幅（不含聚爆模态同名热熔增伤）
  return name.includes('固有每层8点增幅') || name === '达妮娅·固有';
}

function createDaniaInnateOffsetHarmonyAmpBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: DANIA_INNATE_OFFSET_HARMONY_AMP_KEY,
    category: 'harmonyBreakAmp',
    name: '达妮娅·固有',
    mode: 'fixed',
    value: DANIA_INNATE_BASE_HARMONY_AMP,
    perStack: 0,
    maxStacks: 5,
    damageType: '',
    element: '',
    defenseKind: '',
    gameText:
      '若处于共鸣模态·集谐，队伍中的角色谐度破坏增幅提升10点。队伍中的角色偏谐值累积效率超过100%时，每超过10%的偏谐值累积效率使对应角色谐度破坏增幅提升8点，上限40点。',
  });
}

function patchDaniaInnateOffsetHarmonyAmpBuff(b, member) {
  if (!isDaniaInnateOffsetHarmonyAmpBuff(b)) return;
  const info = computeDaniaOffsetHarmonyAmp(getMemberOffsetHarmonyEffPct(member));
  const total = DANIA_INNATE_BASE_HARMONY_AMP + info.amp;
  b.category = 'harmonyBreakAmp';
  b.mode = 'fixed';
  b.value = total;
  b.perStack = 0;
  b.templateKey = DANIA_INNATE_OFFSET_HARMONY_AMP_KEY;
  b.name = '达妮娅·固有';
  b._daniaOffsetHarmonyEff = info.eff;
  b._daniaOffsetHarmonyAmp = info.amp;
  b._daniaOffsetHarmonyBase = DANIA_INNATE_BASE_HARMONY_AMP;
  b._daniaOffsetHarmonyHint = `基础 ${DANIA_INNATE_BASE_HARMONY_AMP} + 偏谐转化 ${info.amp}（效率 ${info.eff.toFixed(1)}%，超额 ${info.excess.toFixed(1)}%，每满${DANIA_INNATE_OFFSET_HARMONY_AMP_CHUNK_PCT}%+${DANIA_INNATE_OFFSET_HARMONY_AMP_PER_CHUNK}，转化上限${DANIA_INNATE_OFFSET_HARMONY_AMP_CAP}）= ${total}`;
}

/** 按「被覆盖角色」自身偏谐值累积效率刷新【达妮娅·固有】谐幅（基础10+转化） */
function syncDaniaInnateOffsetHarmonyAmp(member) {
  if (!member) return;
  const list = member.buffs || [];
  list.forEach((b) => patchDaniaInnateOffsetHarmonyAmpBuff(b, member));
  (member.cycleConfig?.rounds || []).forEach((round) => {
    (round.buffs || []).forEach((b) => patchDaniaInnateOffsetHarmonyAmpBuff(b, member));
  });
}

function syncAllDaniaInnateOffsetHarmonyAmp() {
  (state.members || []).forEach((m) => syncDaniaInnateOffsetHarmonyAmp(m));
}

/** 同槽只保留一条【达妮娅·固有】谐幅（合并旧「+10」与「每层8点转化」） */
function dedupeDaniaInnateOffsetHarmonyAmpShared() {
  const shared = ensureTeamSharedBuffs();
  if (!shared?.buffs?.length) return;
  const keepBySource = new Map();
  const dropIds = new Set();
  const rank = (b) => {
    const key = String(b?.templateKey || '');
    if (key === DANIA_INNATE_OFFSET_HARMONY_AMP_KEY) return 3;
    if (key === DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY) return 2;
    if (key === DANIA_INNATE_BASE_HARMONY_AMP_KEY) return 1;
    return 0;
  };
  // 先按优先级排序，优先保留合并键
  const family = shared.buffs
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => isDaniaInnateOffsetHarmonyAmpBuff(b))
    .sort((a, b) => rank(b.b) - rank(a.b) || a.i - b.i);
  family.forEach(({ b }) => {
    const mi = getTeamBuffSourceMemberIndex(b);
    const srcKey = Number.isInteger(mi) ? String(mi) : String(b.sourceCharacterId || '');
    if (keepBySource.has(srcKey)) {
      dropIds.add(b.id);
      return;
    }
    keepBySource.set(srcKey, b.id);
    b.combatModeKey = 'convergence';
    b.templateKey = DANIA_INNATE_OFFSET_HARMONY_AMP_KEY;
    b.name = '达妮娅·固有';
    b.mode = 'fixed';
    b.perStack = 0;
  });
  if (!dropIds.size) {
    // 即使无重复，也把遗留键统一到合并键
    shared.buffs.forEach((b) => {
      if (!isDaniaInnateOffsetHarmonyAmpBuff(b)) return;
      b.combatModeKey = 'convergence';
      b.templateKey = DANIA_INNATE_OFFSET_HARMONY_AMP_KEY;
      b.name = '达妮娅·固有';
    });
    return;
  }
  shared.buffs = shared.buffs.filter((b) => !dropIds.has(b.id));
  dropIds.forEach((id) => {
    delete shared.globalBuffActive[id];
    delete shared.globalBuffStacks[id];
  });
  (state.members || []).forEach((m) => {
    const mirrorIds = (m.buffs || [])
      .filter((b) => b.teamSourceId && dropIds.has(b.teamSourceId))
      .map((b) => b.id);
    if (!mirrorIds.length) return;
    const drop = new Set(mirrorIds);
    m.buffs = (m.buffs || []).filter((b) => !drop.has(b.id));
    mirrorIds.forEach((id) => purgeMemberBuffReferences(m, id, { allRounds: true }));
  });
}

function ensureDaniaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== DANIA_CHAR_ID) return tpl;
  upsertAmisBodyPersonalBuff(tpl, DANIA_SKILL_EXILE_S2_MULT_KEY, createDaniaSkillExileS2MultBuffEntry);
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(
    tpl.personalBuffs,
    DANIA_SKILL_ILLUSION_FORM_MULT_KEY,
    createDaniaSkillIllusionFormMultBuffEntry
  );
  upsertAmisChainPersonalBuff(
    tpl,
    2,
    DANIA_C2_EXILE_MULT_KEY,
    createDaniaChain2ExileMultBuffEntry,
    '指定技能【放逐·幻灭之形第一段/第二段】倍率提升+40%（固定；与其它倍率提升相乘，独立乘区）'
  );
  const daniaC2 = tpl.resonanceChains?.['2'];
  // 本地库/旧数据可能把 2 链写成 multBoost（加算）：ensure 时强制修复为独立乘区，
  // 并随 persistEnsuredCharacterTemplate 固化，避免旧本机模板覆盖新数据
  (daniaC2?.personalBuffs || []).forEach((b) => {
    if (String(b?.templateKey || '') !== DANIA_C2_EXILE_MULT_KEY) return;
    (b.effects || []).forEach((fx) => {
      if (fx && fx.zone === 'multBoost') fx.zone = 'multBoostExtra';
    });
  });
  if (daniaC2 && /与其它倍率提升加算叠加/.test(String(daniaC2.notes || ''))) {
    daniaC2.notes =
      '内置：指定技能【放逐·幻灭之形第一段/第二段】倍率提升+40%（固定；与其它倍率提升相乘，独立乘区）';
  }
  upsertAmisBodyCombatModeTeamBuff(
    tpl,
    'burst',
    DANIA_BURST_EFFECT_DEEP_KEY,
    createDaniaBurstEffectDeepBuffEntry
  );
  // 全队【达妮娅·延奏】：仅集谐模态；从本体 teamBuffs 剥离
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  tpl.teamBuffs = tpl.teamBuffs.filter(
    (b) =>
      String(b?.templateKey || '') !== DANIA_OUTRO_KEY &&
      !String(b?.name || '').includes('达妮娅·延奏')
  );
  upsertAmisBodyCombatModeTeamBuff(
    tpl,
    'convergence',
    DANIA_OUTRO_KEY,
    createDaniaOutroBuffEntry
  );
  (tpl.combatModes?.convergence?.teamBuffs || []).forEach((b) => {
    if (isDaniaOutroBuff(b)) ensureDaniaOutroEffects(b);
  });
  // 全队【达妮娅·固有】谐幅：仅集谐模态；剥离本体 teamBuffs 与旧版拆分的 +10 / 每层8点条目
  const isLegacyDaniaInnateHarmonySplit = (b) => {
    if (!b || b.category !== 'harmonyBreakAmp') return false;
    const key = String(b.templateKey || '');
    if (
      key === DANIA_INNATE_OFFSET_HARMONY_AMP_KEY ||
      key === DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY ||
      key === DANIA_INNATE_BASE_HARMONY_AMP_KEY
    ) {
      return true;
    }
    const name = String(b.name || '');
    return name.includes('固有每层8点增幅') || name === '达妮娅·固有';
  };
  tpl.teamBuffs = tpl.teamBuffs.filter((b) => !isLegacyDaniaInnateHarmonySplit(b));
  if (tpl.combatModes?.convergence?.teamBuffs) {
    tpl.combatModes.convergence.teamBuffs = tpl.combatModes.convergence.teamBuffs.filter(
      (b) => !isLegacyDaniaInnateHarmonySplit(b)
    );
  }
  upsertAmisBodyCombatModeTeamBuff(
    tpl,
    'convergence',
    DANIA_INNATE_OFFSET_HARMONY_AMP_KEY,
    createDaniaInnateOffsetHarmonyAmpBuffEntry
  );
  if (!tpl.characterName) tpl.characterName = '达妮娅';
  const daniaNotes =
    `达妮娅：0链分支攻击12%/暴伤16%；技能指定【放逐·幻灭之形第二段】倍率提升叠层+150%/层；带【普攻/闪避反击·幻灭之形】伤害倍率提升+50%（固定）；2链指定【放逐·幻灭之形第一段/第二段】倍率提升+40%（固定，与其它倍率提升加算叠加）；集谐模态全队【达妮娅·延奏】泛用加深+${DANIA_OUTRO_BASE_DEEP_PCT}%、陆·赫斯/集谐模态琳奈/清宵再+${DANIA_OUTRO_EXTRA_DEEP_PCT}%（合计${DANIA_OUTRO_PRIVILEGED_DEEP_PCT}%；本人不生效）；集谐模态全队【达妮娅·固有】谐幅基础${DANIA_INNATE_BASE_HARMONY_AMP}点，另按覆盖角色偏谐值累积效率转化（超过100%时每满10%+8点，转化上限${DANIA_INNATE_OFFSET_HARMONY_AMP_CAP}，只读同步）；聚爆模态全队【达妮娅·聚爆加深】效应·聚爆加深+60%；6链+聚爆模态自动加入特殊技能【达妮娅·6链·强化聚爆】（聚爆查表10/13/16，默认10，再×(1+200%)）。`;
  if (
    !String(tpl.notes || '').trim() ||
    !/达妮娅·延奏/.test(String(tpl.notes || '')) ||
    !/集谐模态全队【达妮娅·延奏】/.test(String(tpl.notes || '')) ||
    !/陆·赫斯/.test(String(tpl.notes || '')) ||
    /队内有集谐模态角色时升至/.test(String(tpl.notes || '')) ||
    /泛用加深\+40%（本人不生效）/.test(String(tpl.notes || '')) ||
    !/聚爆加深/.test(String(tpl.notes || '')) ||
    !/达妮娅·固有】谐幅基础/.test(String(tpl.notes || '')) ||
    /固有每层8点增幅/.test(String(tpl.notes || '')) ||
    /与其它倍率提升相乘/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = daniaNotes;
  }
  const c6 = tpl.resonanceChains?.['6'] || normalizeChainBlock({}, DANIA_CHAR_ID);
  if (!String(c6.notes || '').trim()) {
    c6.notes =
      '内置：聚爆模态下自动加入特殊技能【达妮娅·6链·强化聚爆】（聚爆效应，层数档10/13/16默认10，基础倍率查表后再提升200%）。';
  }
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  tpl.resonanceChains['6'] = c6;
  return tpl;
}

/** 安可 0 链：分支面板攻击比 + 热熔属性加成（写入角色面板，非 Buff 列表） */
function ensureEncoreTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ENCORE_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '安可';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes = '安可：0链分支攻击比12%；属性加成·分支热熔伤害加成12%。';
  }
  return tpl;
}

function createMortefiOutroHeavyDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: MORTEFI_OUTRO_HEAVY_DEEP_KEY,
    category: 'typeDeep',
    name: '莫特斐·延奏',
    mode: 'fixed',
    value: 38,
    damageType: '重击',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 莫特斐 0 链：分支面板 + 全队延奏重击加深（本人不生效） */
function ensureMortefiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== MORTEFI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, MORTEFI_OUTRO_HEAVY_DEEP_KEY, createMortefiOutroHeavyDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '莫特斐';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes =
      '莫特斐：0链分支攻击比12%、热熔伤害加成12%；全队【莫特斐·延奏】重击加深+38%（对莫特斐本人不生效）。';
  }
  return tpl;
}

function createYunoOutroHeavyDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: YUNO_OUTRO_HEAVY_DEEP_KEY,
    category: 'typeDeep',
    name: '尤诺·延奏',
    mode: 'fixed',
    value: 50,
    damageType: '重击',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

function isYunoBlessingBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === YUNO_BLESSING_KEY || /^yuno_pale_deadlight/i.test(key)) return true;
  return String(buff.name || '').includes('苍白死光的祝颂');
}

function upsertYunoBlessingAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: payloadBase.skillScope || 'all',
    librarySkillNames: payloadBase.librarySkillNames || [],
    skillNames: payloadBase.skillNames || [],
    damageType: payloadBase.damageType || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 尤诺【苍白死光的祝颂】：每层泛用加深+4%（上限10）；2链且≥10层额外泛用加深+40% */
function ensureYunoBlessingEffects(buff) {
  if (!isYunoBlessingBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) {
    buff.templateKey = YUNO_BLESSING_KEY;
  }
  if (buff.category !== 'composite') {
    const per =
      Number(buff.perStack) > 0 ? Number(buff.perStack) : YUNO_BLESSING_DEEP_PER_STACK;
    buff.category = 'composite';
    buff.mode = 'stack';
    buff.value = 0;
    buff.perStack = 0;
    buff.effects = [
      normalizeCompositeEffect({
        zone: 'generalDeep',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: per }],
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
        effectKey: YUNO_BLESSING_STACK_DEEP_EFFECT_KEY,
      }),
    ];
  }
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.mode = 'stack';
  buff.maxStacks = Math.max(Number(buff.maxStacks) || 0, YUNO_BLESSING_MAX_STACKS);
  // 若用户已自建叠层加深效果则保留；否则补默认每层+4%
  const hasStackDeep = buff.effects.some(
    (fx) =>
      String(fx?.effectKey || '') === YUNO_BLESSING_STACK_DEEP_EFFECT_KEY ||
      (fx?.zone === 'generalDeep' &&
        fx?.valueMode === 'stack' &&
        !YUNO_BLESSING_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')))
  );
  if (!hasStackDeep) {
    upsertYunoBlessingAutoEffect(buff, YUNO_BLESSING_STACK_DEEP_EFFECT_KEY, {
      zone: 'generalDeep',
      valueMode: 'stack',
      value: 0,
      segments: [{ upTo: null, perStack: YUNO_BLESSING_DEEP_PER_STACK }],
      minStacks: 0,
      minResonance: 0,
    });
  }
  upsertYunoBlessingAutoEffect(buff, YUNO_BLESSING_C2_DEEP_EFFECT_KEY, {
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: YUNO_BLESSING_C2_EXTRA_DEEP,
    minStacks: YUNO_BLESSING_C2_MIN_STACKS,
    minResonance: YUNO_BLESSING_C2_MIN_RESONANCE,
  });
  return buff;
}

function createYunoBlessingTeamBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: YUNO_BLESSING_KEY,
    category: 'composite',
    name: '苍白死光的祝颂',
    mode: 'stack',
    maxStacks: YUNO_BLESSING_MAX_STACKS,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'stack',
        value: 0,
        segments: [{ upTo: null, perStack: YUNO_BLESSING_DEEP_PER_STACK }],
        minStacks: 0,
        minResonance: 0,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        effectKey: YUNO_BLESSING_STACK_DEEP_EFFECT_KEY,
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: YUNO_BLESSING_C2_EXTRA_DEEP,
        minStacks: YUNO_BLESSING_C2_MIN_STACKS,
        minResonance: YUNO_BLESSING_C2_MIN_RESONANCE,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        effectKey: YUNO_BLESSING_C2_DEEP_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = YUNO_BLESSING_MAX_STACKS;
  ensureYunoBlessingEffects(entry);
  return entry;
}

/** 尤诺：全队延奏重击加深（本人 X）+ 全队【苍白死光的祝颂】叠层（2链≥10层额外加深） */
function ensureYunoTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== YUNO_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, YUNO_OUTRO_HEAVY_DEEP_KEY, createYunoOutroHeavyDeepBuffEntry);
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const bIdx = tpl.teamBuffs.findIndex((b) => isYunoBlessingBuff(b));
  if (bIdx >= 0) {
    const prev = tpl.teamBuffs[bIdx];
    ensureYunoBlessingEffects(prev);
    prev.templateKey = YUNO_BLESSING_KEY;
    if (!prev.name) prev.name = '苍白死光的祝颂';
    prev.maxStacks = Math.max(Number(prev.maxStacks) || 0, YUNO_BLESSING_MAX_STACKS);
    tpl.teamBuffs[bIdx] = normalizeTemplateBuffEntry(prev);
    ensureYunoBlessingEffects(tpl.teamBuffs[bIdx]);
  } else {
    tpl.teamBuffs.unshift(createYunoBlessingTeamBuffEntry());
  }
  if (!tpl.characterName) tpl.characterName = '尤诺';
  if (
    !String(tpl.notes || '').trim() ||
    !/尤诺·延奏/.test(String(tpl.notes || '')) ||
    !/苍白死光的祝颂/.test(String(tpl.notes || ''))
  ) {
    tpl.notes =
      '尤诺：全队【尤诺·延奏】重击加深+50%（固定；对尤诺本人不生效）。全队叠层【苍白死光的祝颂】每层泛用加深+4%（上限10层）；2链且层数≥10时额外泛用加深+40%。';
  }
  return tpl;
}

function createSanhuaOutroNormalDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: SANHUA_OUTRO_NORMAL_DEEP_KEY,
    category: 'typeDeep',
    name: '散华·延奏',
    mode: 'fixed',
    value: 38,
    damageType: '普攻',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 散华：全队延奏普攻加深（本人不生效，矩阵显示 X） */
function ensureSanhuaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== SANHUA_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, SANHUA_OUTRO_NORMAL_DEEP_KEY, createSanhuaOutroNormalDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '散华';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes = '散华：全队【散华·延奏】普攻加深+38%（固定；对散华本人不生效）。';
  }
  return tpl;
}

function createJianxinOutroLiberationDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: JIANXIN_OUTRO_LIBERATION_DEEP_KEY,
    category: 'typeDeep',
    name: '鉴心·延奏',
    mode: 'fixed',
    value: 38,
    damageType: '共鸣解放',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 鉴心：全队延奏共鸣解放加深（本人不生效，矩阵显示 X） */
function ensureJianxinTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== JIANXIN_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, JIANXIN_OUTRO_LIBERATION_DEEP_KEY, createJianxinOutroLiberationDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '鉴心';
  if (!String(tpl.notes || '').trim() || !/鉴心·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = '鉴心：全队【鉴心·延奏】共鸣解放加深+38%（固定；对鉴心本人不生效）。';
  }
  return tpl;
}

function createChouyuanOutroEchoDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHOUYUAN_OUTRO_ECHO_DEEP_KEY,
    category: 'typeDeep',
    name: '仇远·延奏',
    mode: 'fixed',
    value: 50,
    damageType: '声骸',
    element: '',
    defenseKind: '',
    excludeSource: true,
    gameText: '下一个登场角色声骸技能伤害加深50%，持续14秒，若切换至其他角色则该效果提前结束。',
  });
}

function createChouyuanLiberationCritDmgBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHOUYUAN_LIBERATION_CRIT_DMG_KEY,
    category: 'generalCritDmg',
    name: '仇远·万钧一断',
    mode: 'fixed',
    value: 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function isChouyuanLiberationCritDmgBuff(b) {
  return !!b && String(b.templateKey || '') === CHOUYUAN_LIBERATION_CRIT_DMG_KEY;
}

/** 仇远共鸣解放：min(30, max(0, 暴击−50)×2) */
function computeChouyuanLiberationCritDmgPct(critRatePct) {
  const cr = Number(critRatePct);
  const pct = Number.isFinite(cr) ? cr : 0;
  const excess = Math.max(0, pct - CHOUYUAN_LIBERATION_CRIT_THRESHOLD);
  return Math.min(
    CHOUYUAN_LIBERATION_CRIT_DMG_CAP,
    excess * CHOUYUAN_LIBERATION_CRIT_DMG_PER_PCT
  );
}

/** 按仇远面板暴击刷新全队【仇远·万钧一断】暴伤（模板写结构，数值运行时同步） */
function syncChouyuanLiberationCritDmg(member) {
  if (!member || String(member.characterId) !== CHOUYUAN_CHAR_ID) return;
  if (typeof ensureTeamCritRateConversionsSynced === 'function') ensureTeamCritRateConversionsSynced();
  const critRate = getMemberFinalCritRatePct(member);
  const cdPct = computeChouyuanLiberationCritDmgPct(critRate);
  const excess = Math.max(0, critRate - CHOUYUAN_LIBERATION_CRIT_THRESHOLD);
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const shared = ensureTeamSharedBuffs();
  const hint = `最终暴击 ${critRate.toFixed(1)}%（面板+Buff，超额 ${excess.toFixed(1)}%）→ 全队暴伤 +${cdPct.toFixed(1)}%（每1%超额+${CHOUYUAN_LIBERATION_CRIT_DMG_PER_PCT}%，上限${CHOUYUAN_LIBERATION_CRIT_DMG_CAP}%）`;
  const patch = (b) => {
    if (!b) return;
    b.category = 'generalCritDmg';
    b.mode = 'fixed';
    b.value = cdPct;
    b.perStack = 0;
    b.damageType = '';
    if (!b.name) b.name = '仇远·万钧一断';
    b.templateKey = CHOUYUAN_LIBERATION_CRIT_DMG_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b._chouyuanCritRatePct = critRate;
    b._chouyuanCritDmgHint = hint;
    delete b.effectType;
  };
  const sourceIds = new Set();
  (shared.buffs || []).forEach((b) => {
    if (!isChouyuanLiberationCritDmgBuff(b)) return;
    if (getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    patch(b);
    sourceIds.add(b.id);
  });
  if (!sourceIds.size) return;
  const patchMirrors = (buffs) => {
    (buffs || []).forEach((b) => {
      if (!b?.teamSourceId || !sourceIds.has(b.teamSourceId)) return;
      patch(b);
    });
  };
  (state.members || []).forEach((m) => {
    patchMirrors(m.buffs);
    (m.cycleConfig?.rounds || []).forEach((round) => patchMirrors(round.buffs));
  });
  ensureSpecialSkillsState();
  (state.specialSkills?.characters || []).forEach((c) => patchMirrors(c.buffs));
}

function createChouyuanC6HesuoCritDmgBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHOUYUAN_C6_HESUO_CRIT_DMG_KEY,
    category: 'composite',
    name: '仇远·6链·荷蓑出林后暴伤',
    onlyCharacterIds: [CHOUYUAN_CHAR_ID],
    gameText: '施放共鸣技能荷蓑出林时，仇远暴击伤害增加100%，持续6秒。切换至其他角色时，效果提前结束。',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: 100,
        skillScope: 'all',
        librarySkillNames: [],
        skillNames: [],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

/** 仇远：全队延奏/万钧一断 + 6链施放荷蓑出林后6秒自身暴伤 */
function ensureChouyuanTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CHOUYUAN_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, CHOUYUAN_OUTRO_ECHO_DEEP_KEY, createChouyuanOutroEchoDeepBuffEntry);
  upsertAmisBodyTeamBuff(tpl, CHOUYUAN_LIBERATION_CRIT_DMG_KEY, createChouyuanLiberationCritDmgBuffEntry);
  upsertAmisChainPersonalBuff(
    tpl,
    6,
    CHOUYUAN_C6_HESUO_CRIT_DMG_KEY,
    createChouyuanC6HesuoCritDmgBuffEntry,
    '施放荷蓑出林后自身暴伤+100%，持续6秒，切人结束'
  );
  if (!tpl.characterName) tpl.characterName = '仇远';
  tpl.notes = String(tpl.notes || '').replace('6链指定【3链·荷蓑出林】暴伤+100%。', '6链施放荷蓑出林后自身暴伤+100%，持续6秒，切人结束。');
  if (
    !String(tpl.notes || '').trim() ||
    !/仇远·延奏/.test(String(tpl.notes || '')) ||
    !/万钧一断/.test(String(tpl.notes || '')) ||
    !/荷蓑出林/.test(String(tpl.notes || '')) ||
    !/1链角色面板暴击/.test(String(tpl.notes || ''))
  ) {
    tpl.notes =
      '仇远：全队【仇远·延奏】声骸加深+38%（固定；对仇远本人不生效）。全队【仇远·万钧一断】：暴击>50%时每多出1%暴击→全队暴伤+2%，上限30%（按仇远面板暴击只读同步）。1链角色面板暴击+20%（取消1链自动扣除）。6链施放荷蓑出林后自身暴伤+100%，持续6秒，切人结束。';
  }
  return tpl;
}

function createBaizhiChain3HpBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: BAIZHI_C3_HP_KEY,
    category: 'generalHpPct',
    name: '白芷·【3链】生命提升',
    mode: 'fixed',
    value: 12,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

/** 白芷 3 链：个人生命比 +12% */
function ensureBaizhiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== BAIZHI_CHAR_ID) return tpl;
  upsertAmisChainPersonalBuff(
    tpl,
    3,
    BAIZHI_C3_HP_KEY,
    createBaizhiChain3HpBuffEntry,
    '【3链】生命值提升+12%（固定）'
  );
  if (!tpl.characterName) tpl.characterName = '白芷';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes = '白芷：3链个人生命比+12%（固定）。';
  }
  return tpl;
}

function createZhezhiOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: ZHEZHI_OUTRO_KEY,
    category: 'composite',
    name: '折枝·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: 20,
        element: '冷凝',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣技能',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

/** 折枝：全队延奏冷凝加深 + 共鸣技能加深（本人不生效，矩阵显示 X） */
function ensureZhezhiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ZHEZHI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, ZHEZHI_OUTRO_KEY, createZhezhiOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '折枝';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes =
      '折枝：全队复合【折枝·延奏】冷凝加深+20% + 共鸣技能加深+25%（固定；对折枝本人不生效）。';
  }
  return tpl;
}

function createYinlinOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: YINLIN_OUTRO_KEY,
    category: 'composite',
    name: '吟霖·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: 20,
        element: '导电',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣解放',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

/** 吟霖：全队复合延奏导电加深 + 共鸣解放加深（本人不生效，矩阵显示 X） */
function ensureYinlinTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== YINLIN_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, YINLIN_OUTRO_KEY, createYinlinOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '吟霖';
  if (!String(tpl.notes || '').trim() || !/吟霖·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes =
      '吟霖：全队复合【吟霖·延奏】导电加深+20% + 共鸣解放加深+25%（固定；对吟霖本人不生效）。';
  }
  return tpl;
}

function createFloroOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: FLORO_OUTRO_KEY,
    category: 'composite',
    name: '弗洛洛·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: FLORO_OUTRO_HAVOC_DEEP_PCT,
        element: '湮灭',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: FLORO_OUTRO_HEAVY_DEEP_PCT,
        damageType: '重击',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

/** 弗洛洛：全队复合延奏湮灭加深 + 重击加深（本人不生效，矩阵显示 X） */
function ensureFloroTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== FLORO_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  ensureTemplateListBuff(tpl.teamBuffs, FLORO_OUTRO_KEY, createFloroOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '弗洛洛';
  setTemplateNotesIfEmpty(
    tpl,
    `弗洛洛：全队复合【弗洛洛·延奏】湮灭加深+${FLORO_OUTRO_HAVOC_DEEP_PCT}% + 重击加深+${FLORO_OUTRO_HEAVY_DEEP_PCT}%（固定；对弗洛洛本人不生效）。`
  );
  return tpl;
}

function createCantarellaOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: CANTARELLA_OUTRO_KEY,
    category: 'composite',
    name: CANTARELLA_OUTRO_NAME,
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: CANTARELLA_OUTRO_HAVOC_DEEP_PCT,
        element: '湮灭',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: CANTARELLA_OUTRO_SKILL_DEEP_PCT,
        damageType: '共鸣技能',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

/** 坎特蕾拉：全队复合延奏；剥离已废弃的个人「天赋」；合并旧「坎延暗伤」「坎延技伤」 */
function ensureCantarellaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CANTARELLA_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '坎特蕾拉';
  const isLegacyTalent = (b) => {
    if (!b) return false;
    if (CANTARELLA_LEGACY_TALENT_KEYS.has(String(b.templateKey || ''))) return true;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (name !== '天赋') return false;
    if (b.category === 'generalAttack' && Number(b.value) === 12) return true;
    if (b.category === 'generalCritRate' && Number(b.value) === 8) return true;
    return false;
  };
  tpl.personalBuffs = (tpl.personalBuffs || []).filter((b) => !isLegacyTalent(b));
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  tpl.teamBuffs = tpl.teamBuffs.filter((b) => {
    const key = String(b?.templateKey || '');
    if (CANTARELLA_OUTRO_LEGACY_KEYS.has(key)) return false;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b?.name)
        : String(b?.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    return name !== '坎延暗伤' && name !== '坎延技伤';
  });
  upsertForcedTeamBuffEntry(
    tpl,
    CANTARELLA_OUTRO_KEY,
    createCantarellaOutroBuffEntry,
    CANTARELLA_OUTRO_LEGACY_KEYS
  );
  if (!String(tpl.notes || '').trim() || !/坎特雷拉·延奏|坎特蕾拉·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = `坎特蕾拉：全队复合【${CANTARELLA_OUTRO_NAME}】湮灭加深+${CANTARELLA_OUTRO_HAVOC_DEEP_PCT}% + 共鸣技能加深+${CANTARELLA_OUTRO_SKILL_DEEP_PCT}%（固定；对坎特蕾拉本人不生效）。`;
  }
  return tpl;
}

/** 桃祈：剥离已废弃的个人「天赋」两条 */
function ensureTaoqiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== TAOQI_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '桃祈';
  const isLegacyTalent = (b) => {
    if (!b) return false;
    if (TAOQI_LEGACY_TALENT_KEYS.has(String(b.templateKey || ''))) return true;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (name !== '天赋') return false;
    if (b.category === 'elementBonus' && Number(b.value) === 12 && b.element === '湮灭') return true;
    if (b.category === 'generalDefPct' && Number(b.value) === 15.2) return true;
    return false;
  };
  tpl.personalBuffs = (tpl.personalBuffs || []).filter((b) => !isLegacyTalent(b));
  return tpl;
}

function createRococoOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: ROCOCO_OUTRO_KEY,
    category: 'composite',
    name: ROCOCO_OUTRO_NAME,
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: ROCOCO_OUTRO_HAVOC_DEEP_PCT,
        element: '湮灭',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: ROCOCO_OUTRO_NORMAL_DEEP_PCT,
        damageType: '普攻',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

/** 洛可可：全队复合延奏；剥离已废弃的个人「天赋」；合并旧「洛延暗伤」「洛延普攻」；大招暴击→固定攻 */
function ensureRococoTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ROCOCO_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '洛可可';
  const isLegacyTalent = (b) => {
    if (!b) return false;
    if (ROCOCO_LEGACY_TALENT_KEYS.has(String(b.templateKey || ''))) return true;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (name !== '天赋') return false;
    if (b.category === 'generalAttack' && Number(b.value) === 12) return true;
    if (b.category === 'generalCritDmg' && Number(b.value) === 16) return true;
    return false;
  };
  tpl.personalBuffs = (tpl.personalBuffs || []).filter((b) => !isLegacyTalent(b));
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  tpl.teamBuffs = tpl.teamBuffs.filter((b) => {
    const key = String(b?.templateKey || '');
    if (ROCOCO_OUTRO_LEGACY_KEYS.has(key)) return false;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b?.name)
        : String(b?.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    return name !== '洛延暗伤' && name !== '洛延普攻';
  });
  upsertForcedTeamBuffEntry(tpl, ROCOCO_OUTRO_KEY, createRococoOutroBuffEntry, ROCOCO_OUTRO_LEGACY_KEYS);
  // 全队覆盖含本人（本人同样走全队镜像，避免出现重复条目）
  upsertAmisBodyTeamBuff(tpl, ROCOCO_FLAT_ATK_KEY, () => createRococoFlatAtkBuffEntry(0, { excludeSource: true }));
  const notesHint = `洛可可：全队复合【${ROCOCO_OUTRO_NAME}】湮灭加深+${ROCOCO_OUTRO_HAVOC_DEEP_PCT}% + 普攻加深+${ROCOCO_OUTRO_NORMAL_DEEP_PCT}%（固定；对洛可可本人不生效）。全队【${ROCOCO_FLAT_ATK_NAME}】：暴击>${ROCOCO_FLAT_ATK_CRIT_THRESHOLD}%时每满${ROCOCO_FLAT_ATK_CRIT_CHUNK}%→固定攻击+${ROCOCO_FLAT_ATK_PER_CHUNK}，上限${ROCOCO_FLAT_ATK_CAP}（按洛可可面板只读同步，写入覆盖角色固定攻；全队覆盖含本人）。`;
  if (!String(tpl.notes || '').trim() || !/洛可可·大招|洛可可·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = notesHint;
  } else if (!/洛可可·大招/.test(String(tpl.notes || ''))) {
    tpl.notes = `${String(tpl.notes).trim()} 全队【${ROCOCO_FLAT_ATK_NAME}】：暴击>${ROCOCO_FLAT_ATK_CRIT_THRESHOLD}%时每满${ROCOCO_FLAT_ATK_CRIT_CHUNK}%→固定攻击+${ROCOCO_FLAT_ATK_PER_CHUNK}，上限${ROCOCO_FLAT_ATK_CAP}（按洛可可面板只读同步）。`;
  }
  return tpl;
}

function createRococoFlatAtkBuffEntry(flatAtk, opts) {
  const entry = normalizeTemplateBuffEntry({
    templateKey: ROCOCO_FLAT_ATK_KEY,
    category: 'flatAtk',
    name: ROCOCO_FLAT_ATK_NAME,
    mode: 'fixed',
    value: Number(flatAtk) || 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
  if (opts?.excludeSource) entry.excludeSource = true;
  else delete entry.excludeSource;
  return entry;
}

function isRococoFlatAtkBuff(b) {
  if (!b) return false;
  if (String(b.templateKey || '') === ROCOCO_FLAT_ATK_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(b.name)
      : String(b.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  return name === ROCOCO_FLAT_ATK_NAME || name === '洛可可大招';
}

/** min(200, floor(max(0, 暴击−50) / 0.1)) */
function computeRococoCritFlatAtk(critRatePct) {
  const cr = Number(critRatePct);
  const pct = Number.isFinite(cr) ? cr : 0;
  const excess = Math.max(0, pct - ROCOCO_FLAT_ATK_CRIT_THRESHOLD);
  const chunks = Math.floor(excess / ROCOCO_FLAT_ATK_CRIT_CHUNK + 1e-9);
  return Math.min(ROCOCO_FLAT_ATK_CAP, chunks * ROCOCO_FLAT_ATK_PER_CHUNK);
}

/** 暴击转模使用的最终暴击：面板 + 当前对该角色生效的暴击类 Buff（如守岸人深潜星域(紫)） */
function getMemberFinalCritRatePct(member) {
  if (!member?.char) return 5;
  let total = getCharStatTotal(member.char, 'critRate');
  const stackMap = member.globalBuffStacks || {};
  const critCats = ['generalCritRate', 'elementCritRate', 'typeCritRate', 'critRateSet'];
  (member.buffs || []).forEach((b) => {
    if (member.globalBuffActive && member.globalBuffActive[b.id] === false) return;
    if (typeof getBuffCategoryContribution !== 'function') return;
    critCats.forEach((cat) => {
      total += getBuffCategoryContribution(b, stackMap, cat, member);
    });
  });
  return total;
}

/** 转模前确保守岸人等“共鸣效率→暴击”换算已就位（与成员遍历顺序无关，避免读到上一轮旧值） */
function ensureTeamCritRateConversionsSynced() {
  const sk = (state.members || []).find((m) => String(m?.characterId) === SHOREKEEPER_CHAR_ID);
  if (sk && typeof syncShorekeeperStarErConvert === 'function') {
    syncShorekeeperStarErConvert(sk);
  }
}

function isRococoPersonalFlatAtkActive(member) {
  if (!member || String(member.characterId) !== ROCOCO_CHAR_ID) return false;
  return (member.buffs || []).some((b) => {
    if (!isRococoFlatAtkBuff(b) || b.teamSourceId) return false;
    return member.globalBuffActive?.[b.id] !== false;
  });
}

function isRococoFlatAtkCoveredOnMember(member) {
  if (!member) return false;
  if (isTeamBuffTemplateCoveredOnMember(member, ROCOCO_FLAT_ATK_KEY)) return true;
  return isRococoPersonalFlatAtkActive(member);
}

/** 按洛可可面板暴击刷新【洛可可·大招】固定攻（个人 + 全队展示；面板固定攻另行写入） */
function syncRococoCritFlatAtk(member) {
  if (!member || String(member.characterId) !== ROCOCO_CHAR_ID) return;
  if (typeof ensureTeamCritRateConversionsSynced === 'function') ensureTeamCritRateConversionsSynced();
  const critRate = getMemberFinalCritRatePct(member);
  const flat = computeRococoCritFlatAtk(critRate);
  const excess = Math.max(0, critRate - ROCOCO_FLAT_ATK_CRIT_THRESHOLD);
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const shared = ensureTeamSharedBuffs();
  const hint = `最终暴击 ${critRate.toFixed(1)}%（面板+Buff，超额 ${excess.toFixed(1)}%）→ 固定攻 +${Math.round(flat)}（每满${ROCOCO_FLAT_ATK_CRIT_CHUNK}%+${ROCOCO_FLAT_ATK_PER_CHUNK}，上限${ROCOCO_FLAT_ATK_CAP}）`;
  const patch = (b) => {
    if (!b) return;
    b.category = 'flatAtk';
    b.mode = 'fixed';
    b.value = flat;
    b.perStack = 0;
    b.damageType = '';
    if (!b.name) b.name = ROCOCO_FLAT_ATK_NAME;
    b.templateKey = ROCOCO_FLAT_ATK_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b._rococoCritRatePct = critRate;
    b._rococoFlatAtkHint = hint;
    delete b.effectType;
  };
  (member.buffs || []).forEach((b) => {
    if (!isRococoFlatAtkBuff(b) || b.teamSourceId) return;
    patch(b);
  });
  const sourceIds = new Set();
  (shared.buffs || []).forEach((b) => {
    if (!isRococoFlatAtkBuff(b)) return;
    if (getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    b.excludeSource = true;
    patch(b);
    sourceIds.add(b.id);
  });
  if (sourceIds.size) {
    const patchMirrors = (buffs) => {
      (buffs || []).forEach((b) => {
        if (!b?.teamSourceId || !sourceIds.has(b.teamSourceId)) return;
        patch(b);
      });
    };
    (state.members || []).forEach((m) => {
      patchMirrors(m.buffs);
      (m.cycleConfig?.rounds || []).forEach((round) => patchMirrors(round.buffs));
    });
    ensureSpecialSkillsState();
    (state.specialSkills?.characters || []).forEach((c) => patchMirrors(c.buffs));
  }
  syncRococoFlatAtkToAllPanels(flat);
}

/** 将洛可可大招固定攻写入各角色面板（本人看个人勾选；队友看全队覆盖） */
function syncRococoFlatAtkToAllPanels(flatOverride) {
  const rococo = (state.members || []).find((m) => String(m?.characterId) === ROCOCO_CHAR_ID);
  const present = !!rococo;
  const flat =
    flatOverride !== undefined && flatOverride !== null
      ? Number(flatOverride) || 0
      : present
        ? (() => {
            if (typeof ensureTeamCritRateConversionsSynced === 'function') {
              ensureTeamCritRateConversionsSynced();
            }
            return computeRococoCritFlatAtk(getMemberFinalCritRatePct(rococo));
          })()
        : 0;
  (state.members || []).forEach((member) => {
    if (!member?.char) return;
    const covered = present && isRococoFlatAtkCoveredOnMember(member);
    upsertCharKitPanelSource(
      member.char,
      'flatAtk',
      ROCOCO_FLAT_ATK_PANEL_SOURCE_ID,
      ROCOCO_FLAT_ATK_NAME,
      covered ? flat : 0
    );
  });
}

function createRebeccaOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: REBECCA_OUTRO_KEY,
    category: 'composite',
    name: '丽贝卡·延奏',
    mode: 'stack',
    maxStacks: REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS,
    clampStacks: true,
    excludeSource: true,
    effects: [
      {
        zone: 'typeDeep',
        valueMode: 'stack',
        segments: [{ upTo: null, perStack: REBECCA_OUTRO_HEAVY_DEEP_PER_STACK }],
        damageType: '重击',
        minStacks: 0,
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: REBECCA_OUTRO_GENERAL_DEEP_PCT,
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS;
  entry.clampStacks = true;
  entry.excludeSource = true;
  return entry;
}

function isRebeccaHunterModeBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === REBECCA_HUNTER_MODE_KEY || /猎手模式/.test(name);
}

function isRebeccaIronModeBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === REBECCA_IRON_MODE_KEY || /铁胆模式/.test(name);
}

function upsertRebeccaModeAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: payloadBase.skillScope || 'all',
    librarySkillNames: payloadBase.librarySkillNames || [],
    skillNames: payloadBase.skillNames || [],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 猎手模式：泛用暴伤 30%；≥4 链追加 18%（合计 48%＝30×1.6） */
function ensureRebeccaHunterModeEffects(buff) {
  if (!isRebeccaHunterModeBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = REBECCA_HUNTER_MODE_KEY;
  if (!buff.name || !/猎手模式/.test(String(buff.name))) buff.name = '猎手模式';
  if (!isCompositeBuff(buff)) {
    buff.category = 'composite';
    buff.mode = 'fixed';
    buff.value = 0;
    buff.perStack = 0;
    buff.effects = [];
  }
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.effects = buff.effects.filter(
    (fx) =>
      REBECCA_MODE_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'generalCritDmg' && !String(fx?.effectKey || '').trim())
  );
  upsertRebeccaModeAutoEffect(buff, REBECCA_HUNTER_BASE_EFFECT_KEY, {
    zone: 'generalCritDmg',
    valueMode: 'fixed',
    value: REBECCA_HUNTER_CRIT_DMG_BASE,
    skillScope: 'all',
    minStacks: 0,
    minResonance: 0,
  });
  upsertRebeccaModeAutoEffect(buff, REBECCA_HUNTER_C4_EFFECT_KEY, {
    zone: 'generalCritDmg',
    valueMode: 'fixed',
    value: REBECCA_HUNTER_CRIT_DMG_C4_EXTRA,
    skillScope: 'all',
    minStacks: 0,
    minResonance: REBECCA_MODE_C4_MIN_RESONANCE,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

/** 铁胆模式：无视防御 15%；≥4 链追加 9%（合计 24%＝15×1.6） */
function ensureRebeccaIronModeEffects(buff) {
  if (!isRebeccaIronModeBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = REBECCA_IRON_MODE_KEY;
  if (!buff.name || !/铁胆模式/.test(String(buff.name))) buff.name = '铁胆模式';
  if (!isCompositeBuff(buff)) {
    buff.category = 'composite';
    buff.mode = 'fixed';
    buff.value = 0;
    buff.perStack = 0;
    buff.effects = [];
  }
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  buff.defenseKind = 'ignore';
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.effects = buff.effects.filter(
    (fx) =>
      REBECCA_MODE_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'generalDefense' && !String(fx?.effectKey || '').trim())
  );
  upsertRebeccaModeAutoEffect(buff, REBECCA_IRON_BASE_EFFECT_KEY, {
    zone: 'generalDefense',
    valueMode: 'fixed',
    value: REBECCA_IRON_DEF_IGNORE_BASE,
    defenseKind: 'ignore',
    skillScope: 'all',
    minStacks: 0,
    minResonance: 0,
  });
  upsertRebeccaModeAutoEffect(buff, REBECCA_IRON_C4_EFFECT_KEY, {
    zone: 'generalDefense',
    valueMode: 'fixed',
    value: REBECCA_IRON_DEF_IGNORE_C4_EXTRA,
    defenseKind: 'ignore',
    skillScope: 'all',
    minStacks: 0,
    minResonance: REBECCA_MODE_C4_MIN_RESONANCE,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function createRebeccaHunterModeBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: REBECCA_HUNTER_MODE_KEY,
    category: 'composite',
    name: '猎手模式',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: REBECCA_HUNTER_CRIT_DMG_BASE,
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
        effectKey: REBECCA_HUNTER_BASE_EFFECT_KEY,
      },
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: REBECCA_HUNTER_CRIT_DMG_C4_EXTRA,
        skillScope: 'all',
        minStacks: 0,
        minResonance: REBECCA_MODE_C4_MIN_RESONANCE,
        effectKey: REBECCA_HUNTER_C4_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  ensureRebeccaHunterModeEffects(entry);
  return entry;
}

function createRebeccaIronModeBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: REBECCA_IRON_MODE_KEY,
    category: 'composite',
    name: '铁胆模式',
    mode: 'fixed',
    value: 0,
    defenseKind: 'ignore',
    effects: [
      {
        zone: 'generalDefense',
        valueMode: 'fixed',
        value: REBECCA_IRON_DEF_IGNORE_BASE,
        defenseKind: 'ignore',
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
        effectKey: REBECCA_IRON_BASE_EFFECT_KEY,
      },
      {
        zone: 'generalDefense',
        valueMode: 'fixed',
        value: REBECCA_IRON_DEF_IGNORE_C4_EXTRA,
        defenseKind: 'ignore',
        skillScope: 'all',
        minStacks: 0,
        minResonance: REBECCA_MODE_C4_MIN_RESONANCE,
        effectKey: REBECCA_IRON_C4_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.defenseKind = 'ignore';
  ensureRebeccaIronModeEffects(entry);
  return entry;
}

/** 本体个人 Buff：按名/键归并猎手、铁胆，并写入 4 链 ×1.6 追加 */
function upsertRebeccaBodyModeBuff(tpl, templateKey, nameRe, entryFactory, ensureFx) {
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  const idx = tpl.personalBuffs.findIndex(
    (b) => String(b?.templateKey || '') === templateKey || nameRe.test(String(b?.name || ''))
  );
  if (idx >= 0) {
    const prev = tpl.personalBuffs[idx];
    prev.templateKey = templateKey;
    ensureFx(prev);
    return;
  }
  tpl.personalBuffs.unshift(entryFactory());
}

/** 丽贝卡：本体猎手/铁胆（≥4链×1.6）+ 全队延奏（本人 X） */
function ensureRebeccaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== REBECCA_CHAR_ID) return tpl;
  upsertRebeccaBodyModeBuff(
    tpl,
    REBECCA_HUNTER_MODE_KEY,
    /猎手模式/,
    createRebeccaHunterModeBuffEntry,
    ensureRebeccaHunterModeEffects
  );
  upsertRebeccaBodyModeBuff(
    tpl,
    REBECCA_IRON_MODE_KEY,
    /铁胆模式/,
    createRebeccaIronModeBuffEntry,
    ensureRebeccaIronModeEffects
  );
  upsertAmisBodyTeamBuff(tpl, REBECCA_OUTRO_KEY, createRebeccaOutroBuffEntry);
  if (!tpl.characterName) tpl.characterName = '丽贝卡';
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  if (!tpl.resonanceChains['6'] || typeof tpl.resonanceChains['6'] !== 'object') {
    tpl.resonanceChains['6'] = emptyResonanceChains()['6'];
  }
  tpl.resonanceChains['6'].notes =
    `内置：≥${REBECCA_C6_MIN_RESONANCE}链时，所有来源普攻伤害加成数值×${REBECCA_C6_NORMAL_ATK_BONUS_SCALE}（结算乘区，覆盖面板/声骸/Buff）。`;
  const notesHint =
    `丽贝卡：【猎手模式】泛用暴伤+${REBECCA_HUNTER_CRIT_DMG_BASE}%（≥${REBECCA_MODE_C4_MIN_RESONANCE}链×${REBECCA_MODE_C4_MULT}→${REBECCA_HUNTER_CRIT_DMG_BASE * REBECCA_MODE_C4_MULT}%）；【铁胆模式】无视防御+${REBECCA_IRON_DEF_IGNORE_BASE}%（≥${REBECCA_MODE_C4_MIN_RESONANCE}链×${REBECCA_MODE_C4_MULT}→${REBECCA_IRON_DEF_IGNORE_BASE * REBECCA_MODE_C4_MULT}%）。≥${REBECCA_C6_MIN_RESONANCE}链：普攻伤害加成数值×${REBECCA_C6_NORMAL_ATK_BONUS_SCALE}（面板/声骸/Buff 全来源，结算乘区）。全队复合【丽贝卡·延奏】重击加深+${REBECCA_OUTRO_HEAVY_DEEP_PER_STACK}%/层（上限${REBECCA_OUTRO_HEAVY_DEEP_CAP_PCT}%/${REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS}层）+ 泛用加深+${REBECCA_OUTRO_GENERAL_DEEP_PCT}%（固定；对丽贝卡本人不生效）。`;
  if (
    !String(tpl.notes || '').trim() ||
    !/猎手模式/.test(String(tpl.notes || '')) ||
    !/铁胆模式/.test(String(tpl.notes || '')) ||
    !/丽贝卡·延奏/.test(String(tpl.notes || '')) ||
    !/普攻伤害加成/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function isBulingSancaiBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === BULING_SANCAI_KEY || /三才合一/.test(name);
}

function upsertBulingSancaiAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: payloadBase.skillScope || 'all',
    librarySkillNames: payloadBase.librarySkillNames || [],
    skillNames: payloadBase.skillNames || [],
    damageType: payloadBase.damageType || '共鸣技能',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 卜灵【雷法·三才合一】：共鸣技能增伤 25%；≥6 链追加 25%（合计 50%） */
function ensureBulingSancaiEffects(buff) {
  if (!isBulingSancaiBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = BULING_SANCAI_KEY;
  if (!buff.name || !/三才合一/.test(String(buff.name))) buff.name = '雷法·三才合一';
  if (!isCompositeBuff(buff)) {
    buff.category = 'composite';
    buff.mode = 'fixed';
    buff.value = 0;
    buff.perStack = 0;
    buff.effects = [];
  }
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.effects = buff.effects.filter(
    (fx) =>
      BULING_SANCAI_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'typeBonus' && fx?.damageType === '共鸣技能' && !String(fx?.effectKey || '').trim())
  );
  upsertBulingSancaiAutoEffect(buff, BULING_SANCAI_BASE_EFFECT_KEY, {
    zone: 'typeBonus',
    valueMode: 'fixed',
    value: BULING_SANCAI_SKILL_BONUS_BASE,
    damageType: '共鸣技能',
    skillScope: 'all',
    minStacks: 0,
    minResonance: 0,
  });
  upsertBulingSancaiAutoEffect(buff, BULING_SANCAI_C6_EFFECT_KEY, {
    zone: 'typeBonus',
    valueMode: 'fixed',
    value: BULING_SANCAI_C6_EXTRA,
    damageType: '共鸣技能',
    skillScope: 'all',
    minStacks: 0,
    minResonance: BULING_SANCAI_C6_MIN_RESONANCE,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function createBulingSancaiBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: BULING_SANCAI_KEY,
    category: 'composite',
    name: '雷法·三才合一',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'typeBonus',
        valueMode: 'fixed',
        value: BULING_SANCAI_SKILL_BONUS_BASE,
        damageType: '共鸣技能',
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
        effectKey: BULING_SANCAI_BASE_EFFECT_KEY,
      },
      {
        zone: 'typeBonus',
        valueMode: 'fixed',
        value: BULING_SANCAI_C6_EXTRA,
        damageType: '共鸣技能',
        skillScope: 'all',
        minStacks: 0,
        minResonance: BULING_SANCAI_C6_MIN_RESONANCE,
        effectKey: BULING_SANCAI_C6_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  ensureBulingSancaiEffects(entry);
  return entry;
}

function upsertBulingBodyTeamSancai(tpl) {
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const idx = tpl.teamBuffs.findIndex(
    (b) =>
      String(b?.templateKey || '') === BULING_SANCAI_KEY || /三才合一/.test(String(b?.name || ''))
  );
  if (idx >= 0) {
    const prev = tpl.teamBuffs[idx];
    prev.templateKey = BULING_SANCAI_KEY;
    ensureBulingSancaiEffects(prev);
    return;
  }
  tpl.teamBuffs.unshift(createBulingSancaiBuffEntry());
}

/** 卜灵：全队【雷法·三才合一】共鸣技能增伤 25%；≥6 链合计 50% */
function ensureBulingTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== BULING_CHAR_ID) return tpl;
  upsertBulingBodyTeamSancai(tpl);
  if (!tpl.characterName) tpl.characterName = '卜灵';
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  if (!tpl.resonanceChains['6'] || typeof tpl.resonanceChains['6'] !== 'object') {
    tpl.resonanceChains['6'] = emptyResonanceChains()['6'];
  }
  tpl.resonanceChains['6'].notes =
    `内置：【雷法·三才合一】共鸣技能增伤 ${BULING_SANCAI_SKILL_BONUS_BASE}%→${BULING_SANCAI_C6_TOTAL}%（同 Buff ≥${BULING_SANCAI_C6_MIN_RESONANCE}链追加+${BULING_SANCAI_C6_EXTRA}%）。`;
  const notesHint =
    `卜灵：全队【雷法·三才合一】共鸣技能增伤+${BULING_SANCAI_SKILL_BONUS_BASE}%；≥${BULING_SANCAI_C6_MIN_RESONANCE}链提升至+${BULING_SANCAI_C6_TOTAL}%（同 Buff 追加）。`;
  if (!String(tpl.notes || '').trim() || !/三才合一/.test(String(tpl.notes || ''))) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function createYouhuOutroCoordDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: YOUHU_OUTRO_COORD_DEEP_KEY,
    category: 'typeDeep',
    name: '延奏·釉瑚',
    mode: 'fixed',
    value: 100,
    damageType: '协同攻击',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 釉瑚：全队延奏协同攻击加深（本人不生效，矩阵显示 X）；诗中物对偶/联珠改名 */
function ensureYouhuTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== YOUHU_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, YOUHU_OUTRO_COORD_DEEP_KEY, createYouhuOutroCoordDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '釉瑚';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes = '釉瑚：全队【延奏·釉瑚】协同攻击加深+100%（固定；对釉瑚本人不生效）。';
  }
  const renameList = (list) => {
    (list || []).forEach((b) => {
      const key = String(b?.templateKey || '');
      const name =
        typeof stripManagedBuffSourcePrefixes === 'function'
          ? stripManagedBuffSourcePrefixes(b?.name)
          : String(b?.name || '')
              .trim()
              .replace(/^【本体】\s*/u, '');
      if (key === YOUHU_SHIZHONGWU_DUIOU_KEY || name === '余响·对偶' || name === '【诗中物·】对偶' || name === YOUHU_SHIZHONGWU_DUIOU_NAME) {
        b.name = YOUHU_SHIZHONGWU_DUIOU_NAME;
        if (!b.templateKey) b.templateKey = YOUHU_SHIZHONGWU_DUIOU_KEY;
      } else if (
        key === YOUHU_SHIZHONGWU_LIANZHU_KEY ||
        name === '余响·联珠' ||
        name === '【诗中物·】联珠' ||
        name === YOUHU_SHIZHONGWU_LIANZHU_NAME
      ) {
        b.name = YOUHU_SHIZHONGWU_LIANZHU_NAME;
        if (!b.templateKey) b.templateKey = YOUHU_SHIZHONGWU_LIANZHU_KEY;
      }
    });
  };
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      renameList(list);
      return list;
    });
  } else {
    renameList(tpl.personalBuffs);
  }
  return tpl;
}

function syncYouhuShizhongwuBuffNames(member) {
  if (!member || String(member.characterId) !== YOUHU_CHAR_ID) return;
  const rename = (b) => {
    if (!b) return;
    const key = String(b.templateKey || '');
    const bare =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    let next = '';
    if (key === YOUHU_SHIZHONGWU_DUIOU_KEY || bare === '余响·对偶' || bare === '【诗中物·】对偶' || bare === YOUHU_SHIZHONGWU_DUIOU_NAME) {
      next = YOUHU_SHIZHONGWU_DUIOU_NAME;
      if (!b.templateKey) b.templateKey = YOUHU_SHIZHONGWU_DUIOU_KEY;
    } else if (
      key === YOUHU_SHIZHONGWU_LIANZHU_KEY ||
      bare === '余响·联珠' ||
      bare === '【诗中物·】联珠' ||
      bare === YOUHU_SHIZHONGWU_LIANZHU_NAME
    ) {
      next = YOUHU_SHIZHONGWU_LIANZHU_NAME;
      if (!b.templateKey) b.templateKey = YOUHU_SHIZHONGWU_LIANZHU_KEY;
    }
    if (!next) return;
    b.name =
      typeof withManagedBuffSourcePrefix === 'function'
        ? withManagedBuffSourcePrefix(next, '【本体】')
        : next;
  };
  (member.buffs || []).forEach(rename);
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) => (round.buffs || []).forEach(rename));
  }
}

function createCartethyiaOutroAeroDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CARTETHYIA_OUTRO_AERO_DEEP_KEY,
    category: 'elementDeep',
    name: '延奏·卡提',
    mode: 'fixed',
    value: 17.5,
    element: '气动',
    damageType: '',
    defenseKind: '',
    excludeSource: true,
  });
}

function createCartethyiaXianhuaShenquanBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: CARTETHYIA_XIANHUA_SHENQUAN_KEY,
    category: 'typeDeep',
    name: '显化+神权',
    mode: 'fixed',
    value: CARTETHYIA_XIANHUA_SHENQUAN_PCT,
    damageType: '效应',
    effectType: '风蚀',
    element: '',
    defenseKind: '',
    onlyCharacterIds: [CARTETHYIA_CHAR_ID],
  });
  entry.onlyCharacterIds = [CARTETHYIA_CHAR_ID];
  return entry;
}

function isCartethyiaXianhuaShenquanBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === CARTETHYIA_XIANHUA_SHENQUAN_KEY || key === CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEY) {
    return true;
  }
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  return (
    name === '显化+神权' &&
    buff.category === 'typeDeep' &&
    buff.damageType === '效应' &&
    String(buff.effectType || '') === '风蚀'
  );
}

/** 卡提希娅：0 链全队【延奏·卡提】气动加深（本人不生效）；【显化+神权】风蚀效应加深仅卡提计入 */
function ensureCartethyiaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CARTETHYIA_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, CARTETHYIA_OUTRO_AERO_DEEP_KEY, createCartethyiaOutroAeroDeepBuffEntry);
  upsertForcedTeamBuffEntry(
    tpl,
    CARTETHYIA_XIANHUA_SHENQUAN_KEY,
    createCartethyiaXianhuaShenquanBuffEntry,
    CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEYS
  );
  (tpl.teamBuffs || []).forEach((b) => {
    if (isCartethyiaXianhuaShenquanBuff(b)) {
      b.templateKey = CARTETHYIA_XIANHUA_SHENQUAN_KEY;
      b.name = '显化+神权';
      b.category = 'typeDeep';
      b.mode = 'fixed';
      b.value = CARTETHYIA_XIANHUA_SHENQUAN_PCT;
      b.damageType = '效应';
      b.effectType = '风蚀';
      b.onlyCharacterIds = [CARTETHYIA_CHAR_ID];
    }
  });
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => {
        renameCartethyiaUltBoostBuff(b);
        renameCartethyiaC1Buff(b);
      });
      return list;
    });
  } else {
    (tpl.personalBuffs || []).forEach((b) => {
      renameCartethyiaUltBoostBuff(b);
      renameCartethyiaC1Buff(b);
    });
    (tpl.resonanceChains?.['1']?.personalBuffs || []).forEach((b) => renameCartethyiaC1Buff(b));
  }
  if (!tpl.characterName) tpl.characterName = '卡提希娅';
  const notesHint =
    '卡提希娅：全队【延奏·卡提】气动加深+17.5%（固定；对卡提希娅本人不生效）；全队【显化+神权】风蚀效应加深+50%（仅卡提个人/特殊库计入，其他角色统计不分配）。';
  if (!String(tpl.notes || '').trim() || !/显化\+神权/.test(String(tpl.notes || ''))) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function isCartethyiaUltBoostBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === CARTETHYIA_ULT_BOOST_KEY || key === CARTETHYIA_ULT_BOOST_LEGACY_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name === CARTETHYIA_ULT_BOOST_NAME) return true;
  if (name !== '决意') return false;
  if (!isCompositeBuff(buff)) return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'generalDeep') return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /看潮怒风哮之刃/.test(names);
  });
}

function renameCartethyiaUltBoostBuff(buff, opts) {
  if (!isCartethyiaUltBoostBuff(buff)) return;
  const bare = CARTETHYIA_ULT_BOOST_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (
    !buff.templateKey ||
    buff.templateKey === CARTETHYIA_ULT_BOOST_LEGACY_KEY ||
    String(buff.templateKey).startsWith('tpl_')
  ) {
    buff.templateKey = CARTETHYIA_ULT_BOOST_KEY;
  }
}

function syncCartethyiaUltBoostBuffNames(member) {
  if (!member || String(member.characterId) !== CARTETHYIA_CHAR_ID) return;
  (member.buffs || []).forEach((b) => {
    renameCartethyiaUltBoostBuff(b, { runtime: true });
    renameCartethyiaC1Buff(b, { runtime: true });
  });
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => {
        renameCartethyiaUltBoostBuff(b, { runtime: true });
        renameCartethyiaC1Buff(b, { runtime: true });
      })
    );
  }
}

function isCartethyiaC1Buff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === CARTETHYIA_C1_KEY || key === CARTETHYIA_C1_LEGACY_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name === CARTETHYIA_C1_NAME) {
    if (!isCompositeBuff(buff)) return true;
    const effects = Array.isArray(buff.effects) ? buff.effects : [];
    return effects.some((fx) => fx?.zone === 'generalCritDmg');
  }
  if (name !== '余响') return false;
  if (!isCompositeBuff(buff)) return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'generalCritDmg') return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /暴风雨|看潮怒风哮之刃|凭风斩浪破敌/.test(names);
  });
}

function renameCartethyiaC1Buff(buff, opts) {
  if (!isCartethyiaC1Buff(buff)) return;
  const bare = CARTETHYIA_C1_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (
    !buff.templateKey ||
    buff.templateKey === CARTETHYIA_C1_LEGACY_KEY ||
    String(buff.templateKey).startsWith('tpl_')
  ) {
    buff.templateKey = CARTETHYIA_C1_KEY;
  }
}

function createXiakongOutroWindErosionBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: XIAKONG_OUTRO_WIND_EROSION_KEY,
    category: 'typeDeep',
    name: '夏空·延奏',
    mode: 'fixed',
    value: XIAKONG_OUTRO_WIND_EROSION_PCT,
    damageType: '效应',
    effectType: '风蚀',
    element: '',
    defenseKind: '',
    onlyCharacterIds: [],
  });
  return entry;
}

function isXiakongOutroWindErosionBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === XIAKONG_OUTRO_WIND_EROSION_KEY || key === XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEY) {
    return true;
  }
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  return (
    name === '夏空·延奏' &&
    buff.category === 'typeDeep' &&
    buff.damageType === '效应' &&
    String(buff.effectType || '') === '风蚀'
  );
}

/** 夏空：风蚀效应加深覆盖所有角色，含同时视为风蚀的伤害。 */
function ensureXiakongTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== XIAKONG_CHAR_ID) return tpl;
  upsertForcedTeamBuffEntry(
    tpl,
    XIAKONG_OUTRO_WIND_EROSION_KEY,
    createXiakongOutroWindErosionBuffEntry,
    XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEYS
  );
  (tpl.teamBuffs || []).forEach((b) => {
    if (isXiakongOutroWindErosionBuff(b)) {
      b.templateKey = XIAKONG_OUTRO_WIND_EROSION_KEY;
      b.name = '夏空·延奏';
      b.category = 'typeDeep';
      b.mode = 'fixed';
      b.value = XIAKONG_OUTRO_WIND_EROSION_PCT;
      b.damageType = '效应';
      b.effectType = '风蚀';
      b.onlyCharacterIds = [];
    }
  });
  if (!tpl.characterName) tpl.characterName = '夏空';
  const notesHint =
    '全队【夏空·延奏】风蚀效应加深+100%（适用于所有角色的风蚀效应伤害，含同时视为风蚀）。';
  if (!String(tpl.notes || '').trim() || /仅卡提/.test(String(tpl.notes || '')) || !/夏空·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = `夏空：${notesHint}`;
  }
  return tpl;
}

function createQiushuiOutroAeroDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: QIUSHUI_OUTRO_AERO_DEEP_KEY,
    category: 'elementDeep',
    name: '秋水·延奏',
    mode: 'fixed',
    value: 23,
    element: '气动',
    damageType: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 秋水：0 链全队【秋水·延奏】气动加深（本人不生效，矩阵显示 X） */
function ensureQiushuiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== QIUSHUI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, QIUSHUI_OUTRO_AERO_DEEP_KEY, createQiushuiOutroAeroDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '秋水';
  if (!String(tpl.notes || '').trim() || !/秋水·延奏|延奏·秋水/.test(String(tpl.notes || ''))) {
    tpl.notes = '秋水：全队【秋水·延奏】气动加深+23%（固定；对秋水本人不生效）。';
  }
  return tpl;
}

function createLumiOutroSkillDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: LUMI_OUTRO_SKILL_DEEP_KEY,
    category: 'typeDeep',
    name: '灯灯·延奏',
    mode: 'fixed',
    value: 38,
    damageType: '共鸣技能',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 灯灯：0 链全队【灯灯·延奏】共鸣技能加深（本人不生效，矩阵显示 X） */
function ensureLumiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LUMI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, LUMI_OUTRO_SKILL_DEEP_KEY, createLumiOutroSkillDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '灯灯';
  if (!String(tpl.notes || '').trim() || !/灯灯·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = '灯灯：全队【灯灯·延奏】共鸣技能加深+38%（固定；对灯灯本人不生效）。';
  }
  return tpl;
}

function createRoverElectroOutroGeneralDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: ROVER_ELECTRO_OUTRO_GENERAL_DEEP_KEY,
    category: 'generalDeep',
    name: '雷主·延奏',
    mode: 'fixed',
    value: 25,
    damageType: '',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

/** 漂泊者·导电：0 链全队【雷主·延奏】泛用加深（本人不生效，矩阵显示 X） */
function ensureRoverElectroTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ROVER_ELECTRO_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, ROVER_ELECTRO_OUTRO_GENERAL_DEEP_KEY, createRoverElectroOutroGeneralDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '漂泊者·导电';
  if (!String(tpl.notes || '').trim() || !/雷主·延奏/.test(String(tpl.notes || ''))) {
    tpl.notes = '漂泊者·导电：全队【雷主·延奏】泛用加深+25%（固定；对漂泊者·导电本人不生效）。';
  }
  return tpl;
}

/** 漂泊者·衍射：剥离已废弃的个人「天赋」Buff（本机旧模板） */
function ensureRoverSpectroTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ROVER_SPECTRO_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '漂泊者·衍射';
  const isLegacyTalent = (b) => {
    if (!b) return false;
    if (ROVER_SPECTRO_LEGACY_TALENT_KEYS.has(String(b.templateKey || ''))) return true;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (name !== '天赋') return false;
    if (b.category === 'elementBonus' && Number(b.value) === 12 && b.element === '衍射') return true;
    if (b.category === 'generalAttack' && Number(b.value) === 12) return true;
    return false;
  };
  tpl.personalBuffs = (tpl.personalBuffs || []).filter((b) => !isLegacyTalent(b));
  return tpl;
}

function createZanniOutroDiffractionDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: ZANNI_OUTRO_DIFFRACTION_DEEP_KEY,
    category: 'elementDeep',
    name: '延奏·赞妮',
    mode: 'fixed',
    value: ZANNI_OUTRO_DIFFRACTION_DEEP_PCT,
    element: '衍射',
    damageType: '',
    defenseKind: '',
    excludeSource: true,
  });
}

function createLinneiOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LINNEI_OUTRO_KEY,
    category: 'composite',
    name: '琳奈·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: LINNEI_OUTRO_GENERAL_DEEP_PCT,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣解放',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: LINNEI_OUTRO_C3_MIN_RESONANCE,
        effectKey: LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  ensureLinneiOutroEffects(entry);
  return entry;
}

function isLinneiOutroBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === LINNEI_OUTRO_KEY || name === '琳奈·延奏' || name.includes('琳奈·延奏');
}

function upsertLinneiOutroAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: payloadBase.skillScope || 'all',
    librarySkillNames: payloadBase.librarySkillNames || [],
    skillNames: payloadBase.skillNames || [],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 琳奈【琳奈·延奏】：≥3 链追加泛用加深+25%（合计 40%） */
function ensureLinneiOutroEffects(buff) {
  if (!isLinneiOutroBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = LINNEI_OUTRO_KEY;
  if (!buff.name) buff.name = '琳奈·延奏';
  buff.excludeSource = true;
  if (buff.category !== 'composite') {
    buff.category = 'composite';
    buff.mode = 'fixed';
    buff.value = 0;
    buff.perStack = 0;
    buff.effects = [];
  }
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const hasBaseGeneral = buff.effects.some(
    (fx) =>
      fx?.zone === 'generalDeep' &&
      String(fx?.effectKey || '') !== LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY
  );
  if (!hasBaseGeneral) {
    buff.effects.unshift(
      normalizeCompositeEffect({
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: LINNEI_OUTRO_GENERAL_DEEP_PCT,
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
      })
    );
  }
  const hasTypeDeep = buff.effects.some(
    (fx) => fx?.zone === 'typeDeep' && fx?.damageType === '共鸣解放'
  );
  if (!hasTypeDeep) {
    buff.effects.push(
      normalizeCompositeEffect({
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣解放',
        minStacks: 0,
        minResonance: 0,
      })
    );
  }
  upsertLinneiOutroAutoEffect(buff, LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY, {
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP,
    skillScope: 'all',
    minStacks: 0,
    minResonance: LINNEI_OUTRO_C3_MIN_RESONANCE,
  });
  return buff;
}

/** 琳奈：0 链全队【琳奈·延奏】；≥3 链泛用加深 15%→40%（本人不生效，矩阵显示 X） */
function ensureLinneiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LINNEI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, LINNEI_OUTRO_KEY, createLinneiOutroBuffEntry);
  const idx = (tpl.teamBuffs || []).findIndex((b) => isLinneiOutroBuff(b));
  if (idx >= 0) ensureLinneiOutroEffects(tpl.teamBuffs[idx]);
  if (!tpl.characterName) tpl.characterName = '琳奈';
  if (
    !String(tpl.notes || '').trim() ||
    !/琳奈·延奏/.test(String(tpl.notes || '')) ||
    !/3链/.test(String(tpl.notes || ''))
  ) {
    tpl.notes =
      `琳奈：全队复合【琳奈·延奏】泛用加深+${LINNEI_OUTRO_GENERAL_DEEP_PCT}% + 共鸣解放加深+25%（固定；对琳奈本人不生效）；≥${LINNEI_OUTRO_C3_MIN_RESONANCE}链时泛用加深提升至${LINNEI_OUTRO_C3_GENERAL_DEEP_PCT}%。`;
  }
  return tpl;
}

function isLucyHoumenBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  if (key === LUCY_HOUMEN_KEY) return true;
  // 兼容「后门0/1/2」「后门/0/1/2」「后门」
  return (
    /^后门\/?0\/1\/2$/.test(name) ||
    name === '后门' ||
    name.includes('后门0/1/2') ||
    name.includes('后门/0/1/2')
  );
}

function createLucyHoumenBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUCY_HOUMEN_KEY,
    category: 'composite',
    name: '后门0/1/2',
    mode: 'stack',
    maxStacks: LUCY_HOUMEN_MAX_STACKS,
    onlyCharacterIds: [LUCY_CHAR_ID, REBECCA_CHAR_ID],
    value: 0,

    effects: [
      {
        zone: 'multBoost',
        valueMode: 'stack',
        value: 0,
        // 每层+10%，满2层额外+5% → 合计25%
        segments: [
          { upTo: 1, perStack: LUCY_HOUMEN_STACK1_MULT_BOOST },
          {
            upTo: LUCY_HOUMEN_MAX_STACKS,
            perStack: LUCY_HOUMEN_STACK2_MULT_BOOST,
          },
        ],
        skillScope: 'names',
        librarySkillNames: [...LUCY_HOUMEN_TARGET_SKILLS],
        skillNames: [...LUCY_HOUMEN_TARGET_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: LUCY_HOUMEN_MULT_EFFECT_KEY,
      },
      {
        zone: 'generalDeep',
        valueMode: 'stack',
        value: 0,
        // 每层+10%，满2层额外+5% → 合计25%
        segments: [
          { upTo: 1, perStack: LUCY_HOUMEN_STACK1_DEEP_PCT },
          {
            upTo: LUCY_HOUMEN_MAX_STACKS,
            perStack: LUCY_HOUMEN_STACK2_DEEP_PCT,
          },
        ],
        skillScope: 'all',
        librarySkillNames: [],
        skillNames: [],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: LUCY_HOUMEN_DEEP_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = LUCY_HOUMEN_MAX_STACKS;
  ensureLucyHoumenEffects(entry);
  return entry;
}

function upsertLucyHoumenAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const scope = payloadBase.skillScope === 'names' ? 'names' : 'all';
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: scope,
    librarySkillNames: scope === 'names' ? [...LUCY_HOUMEN_TARGET_SKILLS] : [],
    skillNames: scope === 'names' ? [...LUCY_HOUMEN_TARGET_SKILLS] : [],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 露西【后门0/1/2】：全伤害加深 + 指定【欺骗程式·运动失能】【骇破响应·数据崩解】【骇破响应·熔融】倍率提升（每层+10%，满2层额外+5%，各合计25%） */
function ensureLucyHoumenEffects(buff) {
  if (!isLucyHoumenBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = LUCY_HOUMEN_KEY;
  if (!buff.name || !/后门/.test(String(buff.name))) buff.name = '后门0/1/2';
  buff.category = 'composite';
  buff.mode = 'stack';
  buff.maxStacks = Math.max(Number(buff.maxStacks) || 0, LUCY_HOUMEN_MAX_STACKS);
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.effects = buff.effects.filter(
    (fx) =>
      String(fx?.effectKey || '') === LUCY_HOUMEN_MULT_EFFECT_KEY ||
      String(fx?.effectKey || '') === LUCY_HOUMEN_DEEP_EFFECT_KEY ||
      !(
        (fx?.zone === 'multBoost' && fx?.skillScope === 'names') ||
        (fx?.zone === 'generalDeep' && fx?.skillScope === 'all')
      )
  );
  upsertLucyHoumenAutoEffect(buff, LUCY_HOUMEN_MULT_EFFECT_KEY, {
    zone: 'multBoost',
    valueMode: 'stack',
    value: 0,
    segments: [
      { upTo: 1, perStack: LUCY_HOUMEN_STACK1_MULT_BOOST },
      {
        upTo: LUCY_HOUMEN_MAX_STACKS,
        perStack: LUCY_HOUMEN_STACK2_MULT_BOOST,
      },
    ],
    // 骇破倍率提升仅对【骇破响应】技能生效（原文案限定；不得写成 all）
    skillScope: 'names',
    minStacks: 0,
    minResonance: 0,
  });

  upsertLucyHoumenAutoEffect(buff, LUCY_HOUMEN_DEEP_EFFECT_KEY, {
    zone: 'generalDeep',
    valueMode: 'stack',
    value: 0,
    segments: [
      { upTo: 1, perStack: LUCY_HOUMEN_STACK1_DEEP_PCT },
      {
        upTo: LUCY_HOUMEN_MAX_STACKS,
        perStack: LUCY_HOUMEN_STACK2_DEEP_PCT,
      },
    ],
    skillScope: 'all',
    minStacks: 0,
    minResonance: 0,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function isLucyMultithreadSqlBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim().replace(/[【】\[\]]/g, '');
  return (
    key === LUCY_MULTITHREAD_SQL_KEY ||
    name === '多线程·SQL' ||
    name === '多线程SQL' ||
    /多线程[·･.]?SQL/i.test(name)
  );
}

/** 简单倍率 Buff 升为复合，便于挂 2 链门槛 */
function ensureLucyMultithreadSqlAsComposite(buff) {
  if (!buff || isCompositeBuff(buff)) return buff;
  const value = Number(buff.value) || LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST;
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  buff.effects = [
    normalizeCompositeEffect({
      zone: 'multBoost',
      valueMode: 'fixed',
      value,
      skillScope: 'all',
      librarySkillNames: [],
      skillNames: [],
      damageType: buff.damageType || '',
      element: buff.element || '',
      defenseKind: buff.defenseKind || '',
      minStacks: 0,
      minResonance: 0,
      effectKey: LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY,
    }),
  ];
  return buff;
}

function createLucyMultithreadSqlBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUCY_MULTITHREAD_SQL_KEY,
    category: 'composite',
    name: '多线程·SQL',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST,
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
        effectKey: LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY,
      },
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST,
        skillScope: 'all',
        minStacks: 0,
        minResonance: LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE,
        effectKey: LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  ensureLucyMultithreadSqlEffects(entry);
  return entry;
}

function upsertLucyMultithreadSqlAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    // SQL 只作用于重击·多线程；同时修正旧模板和旧存档的全技能范围。
    skillScope: 'names',
    librarySkillNames: ['靶定线程·重击·多线程'],
    skillNames: ['靶定线程·重击·多线程'],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 露西【多线程·SQL】：倍率提升 270%；≥2 链再 +290% → 合计 560% */
function ensureLucyMultithreadSqlEffects(buff) {
  if (!isLucyMultithreadSqlBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = LUCY_MULTITHREAD_SQL_KEY;
  if (!buff.name || !/多线程/.test(String(buff.name))) buff.name = '多线程·SQL';
  ensureLucyMultithreadSqlAsComposite(buff);
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  // 去掉旧版误放的非锁定同区效果，改由内置 effectKey 托管
  buff.effects = buff.effects.filter(
    (fx) =>
      LUCY_MULTITHREAD_SQL_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'multBoost' && !String(fx?.effectKey || '').trim())
  );
  upsertLucyMultithreadSqlAutoEffect(buff, LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY, {
    zone: 'multBoost',
    valueMode: 'fixed',
    value: LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST,
    skillScope: 'all',
    minStacks: 0,
    minResonance: 0,
  });
  upsertLucyMultithreadSqlAutoEffect(buff, LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY, {
    zone: 'multBoost',
    valueMode: 'fixed',
    value: LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST,
    skillScope: 'all',
    minStacks: 0,
    minResonance: LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function isLucyC6ExecVulnBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return (
    key === LUCY_C6_EXEC_VULN_KEY ||
    name === '6链·处决易伤' ||
    /6\s*链.*处决.*易伤/.test(name) ||
    /处决.*易伤.*6/.test(name)
  );
}

function createLucyC6ExecVulnBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUCY_C6_EXEC_VULN_KEY,
    category: 'composite',
    name: '6链·处决易伤',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalVulnerability',
        valueMode: 'fixed',
        value: LUCY_C6_EXEC_VULN_PCT,
        skillScope: 'names',
        librarySkillNames: [...LUCY_SPECIAL_EXEC_SKILLS],
        skillNames: [...LUCY_SPECIAL_EXEC_SKILLS],
        minStacks: 0,
        minResonance: LUCY_C6_EXEC_VULN_MIN_RESONANCE,
        effectKey: LUCY_C6_EXEC_VULN_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  ensureLucyC6ExecVulnEffects(entry);
  return entry;
}

function upsertLucyC6ExecVulnAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: 'names',
    librarySkillNames: [...LUCY_SPECIAL_EXEC_SKILLS],
    skillNames: [...LUCY_SPECIAL_EXEC_SKILLS],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 露西【6链·处决易伤】：指定两处决泛用易伤 +60%（需 ≥6 链；同步特殊技能） */
function ensureLucyC6ExecVulnEffects(buff) {
  if (!isLucyC6ExecVulnBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = LUCY_C6_EXEC_VULN_KEY;
  if (!buff.name) buff.name = '6链·处决易伤';
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  buff.effects = buff.effects.filter(
    (fx) =>
      LUCY_C6_EXEC_VULN_AUTO_EFFECT_KEYS.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'generalVulnerability' && !String(fx?.effectKey || '').trim())
  );
  upsertLucyC6ExecVulnAutoEffect(buff, LUCY_C6_EXEC_VULN_EFFECT_KEY, {
    zone: 'generalVulnerability',
    valueMode: 'fixed',
    value: LUCY_C6_EXEC_VULN_PCT,
    minStacks: 0,
    minResonance: LUCY_C6_EXEC_VULN_MIN_RESONANCE,
  });
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}


/** 露西：本体叠层【后门0/1/2】全伤害加深 + 指定特殊技能【欺骗程式·运动失能】【骇破响应·数据崩解】【骇破响应·熔融】倍率提升 */
function ensureLucyTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LUCY_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  // 后门：全队 buff（露西/丽贝卡 onlyCharacterIds），原文案为击败傀儡标记目标后露西/丽贝卡获得；不再放个人
  const houmenPersonal = tpl.personalBuffs.filter((b) => isLucyHoumenBuff(b));
  houmenPersonal.forEach((b) => { const i = tpl.personalBuffs.indexOf(b); if (i >= 0) tpl.personalBuffs.splice(i, 1); });
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const houmenTeamAliases = tpl.teamBuffs.filter(
    (b) => isLucyHoumenBuff(b) && String(b?.templateKey || '') !== LUCY_HOUMEN_KEY
  );
  houmenTeamAliases.forEach((alias) => { const i = tpl.teamBuffs.indexOf(alias); if (i >= 0) tpl.teamBuffs.splice(i, 1); });
  upsertAmisBodyTeamBuff(tpl, LUCY_HOUMEN_KEY, createLucyHoumenBuffEntry);
  const houmenIdx = (tpl.teamBuffs || []).findIndex((b) => isLucyHoumenBuff(b));
  if (houmenIdx >= 0) ensureLucyHoumenEffects(tpl.teamBuffs[houmenIdx]);

  // 合并用户自建「多线程·SQL」无 templateKey 的条目
  const sqlAliases = tpl.personalBuffs.filter(
    (b) => isLucyMultithreadSqlBuff(b) && String(b?.templateKey || '') !== LUCY_MULTITHREAD_SQL_KEY
  );
  sqlAliases.forEach((alias) => {
    const i = tpl.personalBuffs.indexOf(alias);
    if (i >= 0) tpl.personalBuffs.splice(i, 1);
  });
  upsertAmisBodyPersonalBuff(tpl, LUCY_MULTITHREAD_SQL_KEY, createLucyMultithreadSqlBuffEntry);
  (tpl.personalBuffs || []).forEach((b) => {
    if (isLucyMultithreadSqlBuff(b)) ensureLucyMultithreadSqlEffects(b);
  });
  // 合并用户自建「6链…易伤」无 templateKey 的条目
  const c6Aliases = tpl.personalBuffs.filter(
    (b) => isLucyC6ExecVulnBuff(b) && String(b?.templateKey || '') !== LUCY_C6_EXEC_VULN_KEY
  );
  c6Aliases.forEach((alias) => {
    const i = tpl.personalBuffs.indexOf(alias);
    if (i >= 0) tpl.personalBuffs.splice(i, 1);
  });
  upsertAmisBodyPersonalBuff(tpl, LUCY_C6_EXEC_VULN_KEY, createLucyC6ExecVulnBuffEntry);
  (tpl.personalBuffs || []).forEach((b) => {
    if (isLucyC6ExecVulnBuff(b)) ensureLucyC6ExecVulnEffects(b);
  });
  upsertAmisBodyTeamBuff(tpl, LUCY_OUTRO_KEY, createLucyOutroBuffEntry);
  const outroIdx = (tpl.teamBuffs || []).findIndex(
    (b) => String(b?.templateKey || '') === LUCY_OUTRO_KEY || String(b?.name || '').includes('露西·延奏')
  );
  if (outroIdx >= 0) ensureLucyOutroEffects(tpl.teamBuffs[outroIdx]);
  // 撤掉曾误加的内置【泛用易伤/穿防】；用户自建全队 Buff（如义体故障/突破协议）保留
  if (Array.isArray(tpl.teamBuffs)) {
    tpl.teamBuffs = tpl.teamBuffs.filter(
      (b) =>
        String(b?.templateKey || '') !== LUCY_TEAM_GENERAL_VULN_KEY &&
        String(b?.templateKey || '') !== LUCY_TEAM_GENERAL_PEN_KEY &&
        String(b?.name || '').trim() !== '泛用易伤' &&
        String(b?.name || '').trim() !== '泛用穿防'
    );
  }
  if (!tpl.characterName) tpl.characterName = '露西';
  const notes = String(tpl.notes || '');
  if (
    !notes.trim() ||
    !/后门/.test(notes) ||
    !/露西·延奏/.test(notes) ||
    !/多线程/.test(notes) ||
    !/3链/.test(notes)
  ) {
    tpl.notes =
      `露西：【后门0/1/2】全伤害加深（第1层+${LUCY_HOUMEN_STACK1_DEEP_PCT}%，第2层再+${LUCY_HOUMEN_STACK2_DEEP_PCT}%，合计${LUCY_HOUMEN_STACK1_DEEP_PCT + LUCY_HOUMEN_STACK2_DEEP_PCT}%）+ 指定【欺骗程式·运动失能】【骇破响应·数据崩解】【骇破响应·熔融】倍率提升（第1层+${LUCY_HOUMEN_STACK1_MULT_BOOST}%，第2层再+${LUCY_HOUMEN_STACK2_MULT_BOOST}%，合计${LUCY_HOUMEN_STACK1_MULT_BOOST + LUCY_HOUMEN_STACK2_MULT_BOOST}%；全阶段与特殊技能同步）。【多线程·SQL】倍率提升+${LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST}%（≥${LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE}链变为+${LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST}%）。特殊技能【骇破响应·数据崩解】【欺骗程式·运动失能】：≥3链基础倍率提升+${Math.round(LUCY_SPECIAL_C3_BASE_MULT_BOOST * 100)}%（与后门乘算）；≥${LUCY_C6_EXEC_VULN_MIN_RESONANCE}链指定易伤+${LUCY_C6_EXEC_VULN_PCT}%。全队易伤/穿防等乘区 Buff 默认同步特殊技能（选露西来源=全队+个人）。全队复合【露西·延奏】普攻加深+${LUCY_OUTRO_NORMAL_DEEP_PCT}%（对露西本人不生效）+ 泛用加深+${LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT}%（仅丽贝卡生效，其他角色该效果不计）。`;
  }
  return tpl;
}

function isLucyOutroBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === LUCY_OUTRO_KEY || name === '露西·延奏' || name.includes('露西·延奏');
}

function createLucyOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: LUCY_OUTRO_KEY,
    category: 'composite',
    name: '露西·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: LUCY_OUTRO_NORMAL_DEEP_PCT,
        damageType: '普攻',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        skillScope: 'all',
      },
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        onlyCharacterIds: [REBECCA_CHAR_ID],
        effectKey: LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  ensureLucyOutroEffects(entry);
  return entry;
}

function upsertLucyOutroAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: payloadBase.skillScope || 'all',
    librarySkillNames: payloadBase.librarySkillNames || [],
    skillNames: payloadBase.skillNames || [],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
    minResonance: Math.max(0, Math.min(6, Math.round(Number(payloadBase.minResonance) || 0))),
    onlyCharacterIds: Array.isArray(payloadBase.onlyCharacterIds)
      ? payloadBase.onlyCharacterIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    onlyCombatModes: Array.isArray(payloadBase.onlyCombatModes)
      ? payloadBase.onlyCombatModes.map((m) => String(m || '').trim()).filter(Boolean)
      : [],
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 露西【露西·延奏】：普攻加深25% + 仅丽贝卡泛用加深20% */
function ensureLucyOutroEffects(buff) {
  if (!isLucyOutroBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = LUCY_OUTRO_KEY;
  if (!buff.name) buff.name = '露西·延奏';
  buff.excludeSource = true;
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const hasNormalDeep = buff.effects.some(
    (fx) =>
      fx?.zone === 'typeDeep' &&
      fx?.damageType === '普攻' &&
      String(fx?.effectKey || '') !== LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY
  );
  if (!hasNormalDeep) {
    buff.effects.unshift(
      normalizeCompositeEffect({
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: LUCY_OUTRO_NORMAL_DEEP_PCT,
        damageType: '普攻',
        skillScope: 'all',
        minStacks: 0,
        minResonance: 0,
      })
    );
  }
  upsertLucyOutroAutoEffect(buff, LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY, {
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT,
    skillScope: 'all',
    onlyCharacterIds: [REBECCA_CHAR_ID],
    minStacks: 0,
    minResonance: 0,
  });
  return buff;
}

/** 赞妮：0 链全队【延奏·赞妮】衍射加深（本人不生效，矩阵显示 X）；本体【焰光】≥3链追加终绝倍率增加 */
function ensureZanniTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== ZANNI_CHAR_ID) return tpl;
  upsertAmisBodyTeamBuff(tpl, ZANNI_OUTRO_DIFFRACTION_DEEP_KEY, createZanniOutroDiffractionDeepBuffEntry);
  if (!tpl.characterName) tpl.characterName = '赞妮';
  (tpl.personalBuffs || []).forEach((b) => ensureZanniYanguangEffects(b));
  const notesParts = [];
  if (!/延奏·赞妮/.test(String(tpl.notes || ''))) {
    notesParts.push(
      `全队【延奏·赞妮】衍射加深+${ZANNI_OUTRO_DIFFRACTION_DEEP_PCT}%（固定；对赞妮本人不生效）`
    );
  }
  if (!/焰光/.test(String(tpl.notes || '')) || !/终绝将至之刻/.test(String(tpl.notes || ''))) {
    notesParts.push(
      `【焰光】≥3链时追加：指定【终绝将至之刻】倍率增加+${ZANNI_YANGUANG_C3_MULT_PER_STACK}%/层（与本体同一Buff）`
    );
  }
  if (notesParts.length) {
    const prefix = String(tpl.notes || '').trim();
    tpl.notes = prefix
      ? `${prefix}${/；$/.test(prefix) ? '' : '；'}${notesParts.join('；')}`
      : `赞妮：${notesParts.join('；')}。`;
  }
  return tpl;
}

function isZanniYanguangBuff(buff) {
  if (!buff) return false;
  const name = String(buff.name || '').trim();
  const key = String(buff.templateKey || '');
  return name === '焰光' || name.includes('焰光') || /yanguang/i.test(key);
}

/** 将简单叠层 Buff 升为复合，便于挂链门槛附加效果 */
function ensureZanniYanguangAsComposite(buff) {
  if (!buff || isCompositeBuff(buff)) return buff;
  const mode = buff.mode === 'stack' ? 'stack' : 'fixed';
  const zone =
    buff.category && buff.category !== 'composite' && BUFF_CATS[buff.category]
      ? buff.category
      : 'multAdd';
  const perStack = Number(buff.perStack) || Number(buff.value) || 0;
  const value = Number(buff.value) || 0;
  buff.category = 'composite';
  buff.mode = mode;
  buff.value = 0;
  buff.perStack = 0;
  buff.effects = [
    normalizeCompositeEffect({
      zone,
      valueMode: mode,
      value: mode === 'fixed' ? value : 0,
      segments: mode === 'stack' ? [{ upTo: null, perStack }] : [{ upTo: null, perStack: 0 }],
      skillScope: 'all',
      librarySkillNames: [],
      skillNames: [],
      damageType: buff.damageType || '',
      element: buff.element || '',
      defenseKind: buff.defenseKind || '',
      minStacks: 0,
      minResonance: 0,
    }),
  ];
  return buff;
}

function upsertZanniYanguangAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: 'names',
    librarySkillNames: [...ZANNI_YANGUANG_C3_SKILLS],
    skillNames: [...ZANNI_YANGUANG_C3_SKILLS],
    damageType: payloadBase.damageType || '',
    element: payloadBase.element || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 赞妮【焰光】：≥3 链追加指定【终绝将至之刻】倍率增加 +8%/层 */
function ensureZanniYanguangEffects(buff) {
  if (!isZanniYanguangBuff(buff)) return buff;
  ensureZanniYanguangAsComposite(buff);
  if (!isCompositeBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) {
    buff.templateKey = 'zanni_yanguang';
  }
  upsertZanniYanguangAutoEffect(buff, ZANNI_YANGUANG_C3_MULT_EFFECT_KEY, {
    zone: 'multAdd',
    valueMode: 'stack',
    value: 0,
    segments: [{ upTo: null, perStack: ZANNI_YANGUANG_C3_MULT_PER_STACK }],
    minResonance: ZANNI_YANGUANG_C3_MIN_RESONANCE,
  });
  syncCompositeBuffModeFromEffects(buff);
  return buff;
}

function createSuisuiConsumeXuyanBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: SUISUI_CONSUME_XUYAN_KEY,
    category: 'composite',
    name: '穗穗·消耗虚湮效应',
    mode: 'fixed',
    excludeSource: true,
    onlyCharacterIds: [...SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS],
    effects: [
      {
        zone: 'elementDefense',
        valueMode: 'fixed',
        value: 6,
        element: '湮灭',
        damageType: '',
        defenseKind: 'ignore',
        minStacks: 0,
        skillScope: 'all',
      },
      {
        zone: 'elementResReduce',
        valueMode: 'fixed',
        value: 12,
        element: '湮灭',
        damageType: '',
        defenseKind: '',
        minStacks: 0,
        skillScope: 'all',
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  entry.onlyCharacterIds = [...SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS];
  return entry;
}

function createPhoebeInnate2ElementBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_INNATE2_ELEMENT_KEY,
    category: 'elementBonus',
    name: '固有2',
    mode: 'fixed',
    value: PHOEBE_INNATE2_ELEMENT_PCT,
    damageType: '',
    element: '衍射',
    defenseKind: '',
  });
}

function createPhoebeAbsolutionKitBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_ABSOLUTION_KIT_KEY,
    category: 'composite',
    name: '赦罪',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: PHOEBE_STARLIGHT_HEAVY_DEEP_PCT,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_STARLIGHT_HEAVY_SKILLS],
        skillNames: [...PHOEBE_STARLIGHT_HEAVY_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'phoebe_starlight_heavy_deep',
      },
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: PHOEBE_DAWN_OATH_MULT_BOOST_PCT,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        skillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'phoebe_dawn_oath_mult',
      },
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: PHOEBE_DAWN_OATH_C1_ABSOLUTION_EXTRA,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        skillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 1,
        effectKey: 'phoebe_dawn_oath_mult_c1',
      },
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: PHOEBE_LISTEN_HEART_MULT_BOOST_PCT,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_LISTEN_HEART_SKILLS],
        skillNames: [...PHOEBE_LISTEN_HEART_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'phoebe_listen_heart_mult',
      },
    ],
  });
}

function createPhoebeC1ConfessionDawnMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_C1_CONFESSION_DAWN_KEY,
    category: 'composite',
    name: '菲比·1链·告解',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        skillNames: [...PHOEBE_DAWN_OATH_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'phoebe_c1_confession_dawn_mult',
      },
    ],
  });
}

function createPhoebeOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: PHOEBE_OUTRO_KEY,
    category: 'composite',
    name: '菲比·延奏',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'elementResReduce',
        valueMode: 'fixed',
        value: PHOEBE_OUTRO_RES_REDUCE_PCT,
        element: '衍射',
        damageType: '',
        defenseKind: '',
        minStacks: 0,
        skillScope: 'all',
        effectKey: 'phoebe_outro_res_reduce',
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: PHOEBE_OUTRO_GUANGZAO_DEEP_PCT,
        damageType: '效应',
        effectType: '光噪',
        element: '',
        defenseKind: '',
        minStacks: 0,
        skillScope: 'all',
        minResonance: 0,
        effectKey: 'phoebe_outro_guangzao_deep',
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: PHOEBE_OUTRO_GUANGZAO_C2_EXTRA_PCT,
        damageType: '效应',
        effectType: '光噪',
        element: '',
        defenseKind: '',
        minStacks: 0,
        skillScope: 'all',
        minResonance: 2,
        effectKey: 'phoebe_outro_guangzao_deep_c2',
      },
    ],
  });
  entry.mode = 'fixed';
  return entry;
}

function createPhoebeC2AbsolutionListenDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_C2_ABSOLUTION_LISTEN_DEEP_KEY,
    category: 'composite',
    name: '菲比·2链·赦罪',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: PHOEBE_LISTEN_HEART_C2_DEEP_PCT,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_LISTEN_HEART_SKILLS],
        skillNames: [...PHOEBE_LISTEN_HEART_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: 'phoebe_c2_absolution_listen_deep',
      },
    ],
  });
}

function createPhoebeC4TeamResReduceBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_C4_TEAM_RES_KEY,
    category: 'elementResReduce',
    name: '菲比·4链',
    mode: 'fixed',
    value: PHOEBE_C4_TEAM_RES_REDUCE_PCT,
    damageType: '',
    element: '衍射',
    defenseKind: '',
  });
}

function createPhoebeC4PersonalElementBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_C4_PERSONAL_ELEMENT_KEY,
    category: 'elementBonus',
    name: '4链',
    mode: 'fixed',
    value: PHOEBE_C4_PERSONAL_ELEMENT_PCT,
    damageType: '',
    element: '衍射',
    gameText: '施放变奏技能金色恩典时，菲比的衍射伤害加成提升12%，持续15秒。',
    defenseKind: '',
  });
}

function createPhoebeC6PersonalAtkBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: PHOEBE_C6_PERSONAL_ATK_KEY,
    category: 'generalAttack',
    name: '6链',
    mode: 'fixed',
    value: PHOEBE_C6_PERSONAL_ATK_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createPhoebeC3StarlightMultBuffEntry(modeKey) {
  const absolution = modeKey === 'absolution';
  const pct = absolution
    ? PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT
    : PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT;
  const key = absolution
    ? PHOEBE_C3_ABSOLUTION_STARLIGHT_KEY
    : PHOEBE_C3_CONFESSION_STARLIGHT_KEY;
  return normalizeTemplateBuffEntry({
    templateKey: key,
    category: 'composite',
    name: absolution ? '菲比·3链·赦罪' : '菲比·3链·告解',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: pct,
        skillScope: 'names',
        librarySkillNames: [...PHOEBE_STARLIGHT_HEAVY_SKILLS],
        skillNames: [...PHOEBE_STARLIGHT_HEAVY_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minResonance: 0,
        effectKey: absolution
          ? 'phoebe_c3_absolution_starlight_mult'
          : 'phoebe_c3_confession_starlight_mult',
      },
    ],
  });
}

/** 菲比：固有2 衍射+12%；赦罪模态加深/倍率；告解模态全队延奏（含本人） */
function ensurePhoebeTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== PHOEBE_CHAR_ID) return tpl;
  upsertAmisBodyPersonalBuff(tpl, PHOEBE_INNATE2_ELEMENT_KEY, createPhoebeInnate2ElementBuffEntry);
  upsertAmisBodyCombatModePersonalBuff(
    tpl,
    'absolution',
    PHOEBE_ABSOLUTION_KIT_KEY,
    createPhoebeAbsolutionKitBuffEntry
  );
  upsertAmisBodyCombatModeTeamBuff(tpl, 'confession', PHOEBE_OUTRO_KEY, createPhoebeOutroBuffEntry);
  // 1 链·告解：启明之誓愿倍率 +90%（挂在 1 链 confession 模态）
  {
    if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
    const c1 = tpl.resonanceChains['1'] || normalizeChainBlock({}, PHOEBE_CHAR_ID);
    tpl.resonanceChains['1'] = c1;
    const block = getChainCombatModeBlock(tpl, 1, 'confession');
    ensureTemplateListBuff(
      block.personalBuffs,
      PHOEBE_C1_CONFESSION_DAWN_KEY,
      createPhoebeC1ConfessionDawnMultBuffEntry
    );
    if (!String(c1.notes || '').trim() || /细则待定/.test(String(c1.notes || ''))) {
      c1.notes =
        `内置：赦罪下【启明之誓愿】倍率提升 ${PHOEBE_DAWN_OATH_MULT_BOOST_PCT}%→${PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL}%（本体同 Buff ≥1链追加）；告解下【启明之誓愿】倍率提升+${PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT}%。`;
    }
  }
  // 2 链·赦罪：倾听之心伤害加深 +120%
  {
    if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
    const c2 = tpl.resonanceChains['2'] || normalizeChainBlock({}, PHOEBE_CHAR_ID);
    tpl.resonanceChains['2'] = c2;
    const block = getChainCombatModeBlock(tpl, 2, 'absolution');
    ensureTemplateListBuff(
      block.personalBuffs,
      PHOEBE_C2_ABSOLUTION_LISTEN_DEEP_KEY,
      createPhoebeC2AbsolutionListenDeepBuffEntry
    );
    if (!String(c2.notes || '').trim() || /细则待定/.test(String(c2.notes || ''))) {
      c2.notes =
        `内置：赦罪下【倾听之心】伤害加深+${PHOEBE_LISTEN_HEART_C2_DEEP_PCT}%；告解【菲比·延奏】光噪加深 ${PHOEBE_OUTRO_GUANGZAO_DEEP_PCT}%→${PHOEBE_OUTRO_GUANGZAO_C2_TOTAL}%（同 Buff ≥2链追加）。`;
    }
  }
  // 3 链：赦罪/告解【重击·星辉】倍率提升
  {
    if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
    const c3 = tpl.resonanceChains['3'] || normalizeChainBlock({}, PHOEBE_CHAR_ID);
    tpl.resonanceChains['3'] = c3;
    for (const modeKey of ['absolution', 'confession']) {
      const block = getChainCombatModeBlock(tpl, 3, modeKey);
      const tplKey =
        modeKey === 'absolution'
          ? PHOEBE_C3_ABSOLUTION_STARLIGHT_KEY
          : PHOEBE_C3_CONFESSION_STARLIGHT_KEY;
      ensureTemplateListBuff(block.personalBuffs, tplKey, () =>
        createPhoebeC3StarlightMultBuffEntry(modeKey)
      );
    }
    if (!String(c3.notes || '').trim() || /细则待定/.test(String(c3.notes || ''))) {
      c3.notes =
        `内置：赦罪下【重击·星辉】倍率提升+${PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT}%；告解下【重击·星辉】倍率提升+${PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT}%。`;
    }
  }
  // 4 链：全队衍射抗性降低（含本人）+ 个人衍射增伤
  upsertAmisChainTeamBuff(
    tpl,
    4,
    PHOEBE_C4_TEAM_RES_KEY,
    createPhoebeC4TeamResReduceBuffEntry,
    `全队【菲比·4链】衍射抗性降低${PHOEBE_C4_TEAM_RES_REDUCE_PCT}%；个人【4链】衍射增伤+${PHOEBE_C4_PERSONAL_ELEMENT_PCT}%`
  );
  upsertAmisChainPersonalBuff(
    tpl,
    4,
    PHOEBE_C4_PERSONAL_ELEMENT_KEY,
    createPhoebeC4PersonalElementBuffEntry,
    `全队【菲比·4链】衍射抗性降低${PHOEBE_C4_TEAM_RES_REDUCE_PCT}%；个人【4链】衍射增伤+${PHOEBE_C4_PERSONAL_ELEMENT_PCT}%`
  );
  // 6 链：个人攻击 +10%（赦罪/告解均生效）
  upsertAmisChainPersonalBuff(
    tpl,
    6,
    PHOEBE_C6_PERSONAL_ATK_KEY,
    createPhoebeC6PersonalAtkBuffEntry,
    `个人【6链】攻击+${PHOEBE_C6_PERSONAL_ATK_PCT}%（赦罪/告解均生效）`
  );
  if (!tpl.characterName) tpl.characterName = '菲比';
  setTemplateNotesIfEmpty(
    tpl,
    `菲比：【固有2】衍射增伤+${PHOEBE_INNATE2_ELEMENT_PCT}%（赦罪/告解均生效）。赦罪：【重击·星辉】伤害加深+${PHOEBE_STARLIGHT_HEAVY_DEEP_PCT}%（≥3链倍率+${PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT}%）；【启明之誓愿】倍率+${PHOEBE_DAWN_OATH_MULT_BOOST_PCT}%（≥1链合计${PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL}%）、【倾听之心】倍率+${PHOEBE_LISTEN_HEART_MULT_BOOST_PCT}%（≥2链伤害加深+${PHOEBE_LISTEN_HEART_C2_DEEP_PCT}%）。告解全队【菲比·延奏】衍射抗性降低${PHOEBE_OUTRO_RES_REDUCE_PCT}% + 光噪效应伤害加深+${PHOEBE_OUTRO_GUANGZAO_DEEP_PCT}%（≥2链合计${PHOEBE_OUTRO_GUANGZAO_C2_TOTAL}%；含本人）；≥1链告解【启明之誓愿】倍率+${PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT}%；≥3链告解【重击·星辉】倍率+${PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT}%；≥4链全队【菲比·4链】衍射抗性降低${PHOEBE_C4_TEAM_RES_REDUCE_PCT}% + 个人【4链】衍射增伤+${PHOEBE_C4_PERSONAL_ELEMENT_PCT}%；≥6链个人【6链】攻击+${PHOEBE_C6_PERSONAL_ATK_PCT}%。延奏【倾听之心】基础倍率 528.41%。`
  );
  return tpl;
}

function createSuisuiOutro2ErBonusBuffEntry(bonusPct) {
  return normalizeTemplateBuffEntry({
    templateKey: SUISUI_OUTRO2_ER_BONUS_KEY,
    category: 'generalBonus',
    name: '穗穗延奏2',
    mode: 'fixed',
    value: Number(bonusPct) || 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createSuisuiOutro3ErAtkBuffEntry(atkPct) {
  const entry = normalizeTemplateBuffEntry({
    templateKey: SUISUI_OUTRO3_ER_ATK_KEY,
    category: 'generalAttack',
    name: '穗穗·延奏3·烟岚',
    mode: 'fixed',
    value: Number(atkPct) || 0,
    damageType: '',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
  entry.excludeSource = true;
  return entry;
}

/** 穗穗延奏2：min(12, floor(max(0, 效率−200))×0.2) — 每满1%才转化 */
function computeSuisuiOutro2ErBonusPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const excess = Math.max(0, pct - SUISUI_OUTRO2_ER_THRESHOLD);
  const chunks = Math.floor(excess);
  return {
    er: pct,
    excess,
    bonus: Math.min(SUISUI_OUTRO2_BONUS_CAP, chunks * SUISUI_OUTRO2_BONUS_PER_PCT),
  };
}

/** 穗穗延奏3：min(50, floor(超额/0.12)×0.1) — 每满0.12%才转化 */
function computeSuisuiOutro3ErAtkPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const excess = Math.max(0, pct - SUISUI_OUTRO3_ER_THRESHOLD);
  const chunks =
    SUISUI_OUTRO3_ER_PER_CHUNK > 0
      ? Math.floor((excess + 1e-9) / SUISUI_OUTRO3_ER_PER_CHUNK)
      : 0;
  return {
    er: pct,
    excess,
    atk: Math.min(SUISUI_OUTRO3_ATK_CAP, chunks * SUISUI_OUTRO3_ATK_PER_CHUNK),
  };
}

function isSuisuiOutro2ErBonusBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  return key === SUISUI_OUTRO2_ER_BONUS_KEY || SUISUI_OUTRO2_LEGACY_KEYS.has(key);
}

function isSuisuiOutro3ErAtkBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  return key === SUISUI_OUTRO3_ER_ATK_KEY || SUISUI_OUTRO3_LEGACY_KEYS.has(key);
}

function upsertForcedTeamBuffEntry(tpl, templateKey, entryFactory, legacyKeys) {
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const legacy = legacyKeys instanceof Set ? legacyKeys : new Set();
  tpl.teamBuffs = tpl.teamBuffs.filter((b) => !legacy.has(String(b?.templateKey || '')));
  const fresh = entryFactory();
  const idx = tpl.teamBuffs.findIndex((b) => String(b?.templateKey || '') === templateKey);
  if (idx >= 0) {
    tpl.teamBuffs[idx] = mergeTemplateBuffKeepGameText(tpl.teamBuffs[idx], fresh, { templateKey });
  } else {
    tpl.teamBuffs.push(fresh);
  }
}

/** 按穗穗面板共鸣效率刷新全队延奏2增伤 / 延奏3攻击（模板写结构，数值运行时同步） */
function syncSuisuiOutroErConvert(member) {
  if (!member || String(member.characterId) !== SUISUI_CHAR_ID) return;
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const er = getMemberEnergyRegenPct(member);
  const bonusInfo = computeSuisuiOutro2ErBonusPct(er);
  const atkInfo = computeSuisuiOutro3ErAtkPct(er);
  const shared = ensureTeamSharedBuffs();
  const bonusHint = `共鸣效率 ${bonusInfo.er.toFixed(1)}%（超额 ${bonusInfo.excess.toFixed(1)}%）→ 全队增伤 +${bonusInfo.bonus.toFixed(1)}%（每满1%超额+${SUISUI_OUTRO2_BONUS_PER_PCT}%，不足1%不转化，上限${SUISUI_OUTRO2_BONUS_CAP}%）`;
  const atkHint = `共鸣效率 ${atkInfo.er.toFixed(1)}%（超额 ${atkInfo.excess.toFixed(1)}%）→ 全队攻击 +${atkInfo.atk.toFixed(1)}%（每满${SUISUI_OUTRO3_ER_PER_CHUNK}%超额+${SUISUI_OUTRO3_ATK_PER_CHUNK}%，不足不转化，上限${SUISUI_OUTRO3_ATK_CAP}%；穗穗本人不生效）`;
  const patchBonus = (b) => {
    if (!b) return;
    b.category = 'generalBonus';
    b.mode = 'fixed';
    b.value = bonusInfo.bonus;
    b.perStack = 0;
    b.damageType = '';
    b.name = b.name || '穗穗延奏2';
    b.templateKey = SUISUI_OUTRO2_ER_BONUS_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b.excludeSource = false;
    b._suisuiEnergyRegenPct = bonusInfo.er;
    b._suisuiOutro2Hint = bonusHint;
    delete b.effectType;
  };
  const patchAtk = (b) => {
    if (!b) return;
    b.category = 'generalAttack';
    b.mode = 'fixed';
    b.value = atkInfo.atk;
    b.perStack = 0;
    b.damageType = '';
    b.name = b.name || '穗穗·延奏3·烟岚';
    b.templateKey = SUISUI_OUTRO3_ER_ATK_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b.excludeSource = true;
    b._suisuiEnergyRegenPct = atkInfo.er;
    b._suisuiOutro3Hint = atkHint;
    delete b.effectType;
  };
  const sourceIds = new Set();
  const excluded = ensureExcludedTeamBuffIds(member);
  (shared.buffs || []).forEach((b) => {
    if (getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    if (isSuisuiOutro2ErBonusBuff(b)) {
      patchBonus(b);
      sourceIds.add(b.id);
    } else if (isSuisuiOutro3ErAtkBuff(b)) {
      patchAtk(b);
      sourceIds.add(b.id);
      if (!excluded.includes(b.id)) excluded.push(b.id);
    }
  });
  if (!sourceIds.size) return;
  const patchMirrors = (buffs) => {
    (buffs || []).forEach((b) => {
      if (!b?.teamSourceId || !sourceIds.has(b.teamSourceId)) return;
      if (isSuisuiOutro2ErBonusBuff(b)) patchBonus(b);
      else if (isSuisuiOutro3ErAtkBuff(b)) patchAtk(b);
    });
  };
  (state.members || []).forEach((m) => {
    patchMirrors(m.buffs);
    (m.cycleConfig?.rounds || []).forEach((round) => patchMirrors(round.buffs));
  });
  ensureSpecialSkillsState();
  (state.specialSkills?.characters || []).forEach((c) => patchMirrors(c.buffs));
}

/** 穗穗：全队【穗穗·消耗虚湮效应】湮灭无视防御+减抗（本人不生效）；延奏2/3 按共鸣效率转模 */
function ensureSuisuiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== SUISUI_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const fresh = createSuisuiConsumeXuyanBuffEntry();
  const idx = tpl.teamBuffs.findIndex((b) => b?.templateKey === SUISUI_CONSUME_XUYAN_KEY);
  if (idx >= 0) {
    tpl.teamBuffs[idx] = mergeTemplateBuffKeepGameText(tpl.teamBuffs[idx], fresh, {
      templateKey: SUISUI_CONSUME_XUYAN_KEY,
    });
  } else {
    tpl.teamBuffs.unshift(fresh);
  }
  const consumeXuyan = (tpl.teamBuffs || []).find(
    (b) => String(b?.templateKey || '') === SUISUI_CONSUME_XUYAN_KEY
  );
  if (consumeXuyan) {
    consumeXuyan.onlyCharacterIds = [...SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS];
    consumeXuyan.excludeSource = true;
  }
  // 旧固定 12%/50% 改为共鸣效率转模
  upsertForcedTeamBuffEntry(
    tpl,
    SUISUI_OUTRO2_ER_BONUS_KEY,
    () => createSuisuiOutro2ErBonusBuffEntry(0),
    SUISUI_OUTRO2_LEGACY_KEYS
  );
  upsertForcedTeamBuffEntry(
    tpl,
    SUISUI_OUTRO3_ER_ATK_KEY,
    () => createSuisuiOutro3ErAtkBuffEntry(0),
    SUISUI_OUTRO3_LEGACY_KEYS
  );
  if (!tpl.characterName) tpl.characterName = '穗穗';
  const notesHint =
    '穗穗：全队复合【穗穗·消耗虚湮效应】湮灭伤害无视防御+6%、降低湮灭抗性+12%（固定；仅秧秧·玄翎生效，穗穗本人不生效）。全队【穗穗延奏2】：共鸣效率>200%时每满1%→增伤+0.2%（不足1%不转化，上限12%，含本人，随面板同步）。全队【穗穗·延奏3·烟岚】：共鸣效率>200%时每满0.12%→攻击+0.1%（不足不转化，上限50%，对穗穗本人不生效，随面板同步）。';
  if (
    !String(tpl.notes || '').trim() ||
    !/穗穗延奏2/.test(String(tpl.notes || '')) ||
    !/延奏3/.test(String(tpl.notes || '')) ||
    !/不足/.test(String(tpl.notes || '')) ||
    !/秧秧·玄翎/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function createShorekeeperStarPurpleBuffEntry(critPct) {
  return normalizeTemplateBuffEntry({
    templateKey: SHOREKEEPER_STAR_PURPLE_KEY,
    category: 'generalCritRate',
    name: '深潜星域(紫）',
    mode: 'fixed',
    value: Number(critPct) || 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createShorekeeperStarGoldBuffEntry(critDmgPct) {
  return normalizeTemplateBuffEntry({
    templateKey: SHOREKEEPER_STAR_GOLD_KEY,
    category: 'generalCritDmg',
    name: '解限星域(金)',
    mode: 'fixed',
    value: Number(critDmgPct) || 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

/** 深潜星域：min(12.5, floor(效率/0.2)×0.01) — 每满 0.2% 才转化 */
function computeShorekeeperStarPurpleCritPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const chunks =
    SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK > 0
      ? Math.floor((pct + 1e-9) / SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK)
      : 0;
  return {
    er: pct,
    crit: Math.min(
      SHOREKEEPER_STAR_PURPLE_CRIT_CAP,
      chunks * SHOREKEEPER_STAR_PURPLE_CRIT_PER_CHUNK
    ),
  };
}

/** 解限星域：min(25, floor(效率/0.1)×0.01) — 每满 0.1% 才转化 */
function computeShorekeeperStarGoldCritDmgPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const chunks =
    SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK > 0
      ? Math.floor((pct + 1e-9) / SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK)
      : 0;
  return {
    er: pct,
    critDmg: Math.min(
      SHOREKEEPER_STAR_GOLD_CRIT_DMG_CAP,
      chunks * SHOREKEEPER_STAR_GOLD_CRIT_DMG_PER_CHUNK
    ),
  };
}

function isShorekeeperStarPurpleBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  return key === SHOREKEEPER_STAR_PURPLE_KEY || SHOREKEEPER_STAR_PURPLE_LEGACY_KEYS.has(key);
}

function isShorekeeperStarGoldBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  return key === SHOREKEEPER_STAR_GOLD_KEY || SHOREKEEPER_STAR_GOLD_LEGACY_KEYS.has(key);
}

function isShorekeeperInnate2ErBuff(b) {
  return !!b && String(b.templateKey || '') === SHOREKEEPER_INNATE2_ER_KEY;
}

function isShorekeeperInnate2ErBuffActive(member) {
  if (!member?.buffs) return false;
  const buff = (member.buffs || []).find(isShorekeeperInnate2ErBuff);
  if (!buff) return false;
  if (typeof isForcedActiveSystemBuff === 'function' && isForcedActiveSystemBuff(buff)) return true;
  return !!member.globalBuffActive?.[buff.id];
}

/** 守岸人固有2：共鸣效率+10% 写入守岸人面板；同队漂泊者同样 +10% */
function syncShorekeeperInnate2ErPanels() {
  const sk = (state.members || []).find((m) => String(m?.characterId) === SHOREKEEPER_CHAR_ID);
  const buff = sk ? (sk.buffs || []).find(isShorekeeperInnate2ErBuff) : null;
  const active = isShorekeeperInnate2ErBuffActive(sk);
  const erValue =
    active && buff && Number(buff.value) > 0 ? Number(buff.value) : active ? SHOREKEEPER_INNATE2_ER_PCT : 0;
  (state.members || []).forEach((m) => {
    if (!m?.char) return;
    const id = String(m.characterId || '');
    const resolved = ROVER_MALE_TO_FEMALE_ID[id] || id;
    const isRover = SHOREKEEPER_INNATE2_ROVER_IDS.has(resolved);
    if (id !== SHOREKEEPER_CHAR_ID && !isRover) return;
    upsertCharKitPanelSource(
      m.char,
      'energyRegenPct',
      SHOREKEEPER_INNATE2_ER_PANEL_SOURCE_ID,
      '守岸人·固有2',
      erValue
    );
  });
}

/** 按守岸人面板共鸣效率刷新全队深潜/解限星域（模板写结构，数值运行时同步） */
function syncShorekeeperStarErConvert(member) {
  if (!member || String(member.characterId) !== SHOREKEEPER_CHAR_ID) return;
  syncShorekeeperInnate2ErPanels();
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const er = getMemberEnergyRegenPct(member);
  const purple = computeShorekeeperStarPurpleCritPct(er);
  const gold = computeShorekeeperStarGoldCritDmgPct(er);
  const shared = ensureTeamSharedBuffs();
  const purpleHint = `共鸣效率 ${purple.er.toFixed(1)}% → 全队暴击 +${purple.crit.toFixed(2)}%（每满${SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK}%+${SHOREKEEPER_STAR_PURPLE_CRIT_PER_CHUNK}%，不足不转化，上限${SHOREKEEPER_STAR_PURPLE_CRIT_CAP}%）`;
  const goldHint = `共鸣效率 ${gold.er.toFixed(1)}% → 全队暴伤 +${gold.critDmg.toFixed(2)}%（每满${SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK}%+${SHOREKEEPER_STAR_GOLD_CRIT_DMG_PER_CHUNK}%，不足不转化，上限${SHOREKEEPER_STAR_GOLD_CRIT_DMG_CAP}%）`;
  const patchPurple = (b) => {
    if (!b) return;
    b.category = 'generalCritRate';
    b.mode = 'fixed';
    b.value = purple.crit;
    b.perStack = 0;
    b.damageType = '';
    b.name = b.name || '深潜星域(紫）';
    b.templateKey = SHOREKEEPER_STAR_PURPLE_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b._shorekeeperEnergyRegenPct = purple.er;
    b._shorekeeperStarPurpleHint = purpleHint;
    delete b.effectType;
  };
  const patchGold = (b) => {
    if (!b) return;
    b.category = 'generalCritDmg';
    b.mode = 'fixed';
    b.value = gold.critDmg;
    b.perStack = 0;
    b.damageType = '';
    b.name = b.name || '解限星域(金)';
    b.templateKey = SHOREKEEPER_STAR_GOLD_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b._shorekeeperEnergyRegenPct = gold.er;
    b._shorekeeperStarGoldHint = goldHint;
    delete b.effectType;
  };
  const sourceIds = new Set();
  (shared.buffs || []).forEach((b) => {
    if (getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    if (isShorekeeperStarPurpleBuff(b)) {
      patchPurple(b);
      sourceIds.add(b.id);
    } else if (isShorekeeperStarGoldBuff(b)) {
      patchGold(b);
      sourceIds.add(b.id);
    }
  });
  if (!sourceIds.size) return;
  const patchMirrors = (buffs) => {
    (buffs || []).forEach((b) => {
      if (!b?.teamSourceId || !sourceIds.has(b.teamSourceId)) return;
      if (isShorekeeperStarPurpleBuff(b)) patchPurple(b);
      else if (isShorekeeperStarGoldBuff(b)) patchGold(b);
    });
  };
  (state.members || []).forEach((m) => {
    patchMirrors(m.buffs);
    (m.cycleConfig?.rounds || []).forEach((round) => patchMirrors(round.buffs));
  });
  ensureSpecialSkillsState();
  (state.specialSkills?.characters || []).forEach((c) => patchMirrors(c.buffs));
}

function createShorekeeperInnate2ErBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: SHOREKEEPER_INNATE2_ER_KEY,
    category: 'energyRegenPct',
    name: '固有2',
    mode: 'fixed',
    value: SHOREKEEPER_INNATE2_ER_PCT,
    perStack: 0,
    maxStacks: 1,
    damageType: '',
    element: '',
    defenseKind: '',
    defaultActive: true,
    gameText:
      '队伍中登场角色处于【星域】生效范围内时，守岸人共鸣效率提升10%；若漂泊者处于同一编队中，漂泊者共鸣效率提升10%。',
  });
}

/** 守岸人：全队深潜星域/解限星域按共鸣效率转模 */
function ensureShorekeeperTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== SHOREKEEPER_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  upsertForcedTeamBuffEntry(
    tpl,
    SHOREKEEPER_STAR_PURPLE_KEY,
    () => createShorekeeperStarPurpleBuffEntry(0),
    SHOREKEEPER_STAR_PURPLE_LEGACY_KEYS
  );
  upsertForcedTeamBuffEntry(
    tpl,
    SHOREKEEPER_STAR_GOLD_KEY,
    () => createShorekeeperStarGoldBuffEntry(0),
    SHOREKEEPER_STAR_GOLD_LEGACY_KEYS
  );
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(
    tpl.personalBuffs,
    SHOREKEEPER_INNATE2_ER_KEY,
    createShorekeeperInnate2ErBuffEntry
  );
  if (!tpl.characterName) tpl.characterName = '守岸人';
  const notesHint =
    '守岸人：全队【深潜星域(紫)】每满0.2%共鸣效率→暴击+0.01%（不足不转化，上限12.5%，随面板同步）。全队【解限星域(金)】每满0.1%共鸣效率→暴伤+0.01%（不足不转化，上限25%，随面板同步）。';
  if (
    !String(tpl.notes || '').trim() ||
    !/深潜星域/.test(String(tpl.notes || '')) ||
    !/解限星域/.test(String(tpl.notes || '')) ||
    !/不足/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function createYangyangXuanlingOutroDeepBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: YANGYANG_XUANLING_OUTRO_DEEP_KEY,
    category: 'elementDeep',
    name: '秧秧·延奏',
    mode: 'fixed',
    value: 20,
    element: '湮灭',
    damageType: '',
    defenseKind: '',
    excludeSource: true,
  });
  entry.excludeSource = true;
  return entry;
}

/** 秧秧·玄翎：全队【秧秧·延奏】湮灭加深+20%（本人不生效，矩阵显示 X）；6链额外技能+暴击固定 */
function ensureYangyangXuanlingTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== YANGYANG_XUANLING_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  ensureTemplateListBuff(
    tpl.teamBuffs,
    YANGYANG_XUANLING_OUTRO_DEEP_KEY,
    createYangyangXuanlingOutroDeepBuffEntry
  );
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({}, YANGYANG_XUANLING_CHAR_ID);
  if (!Array.isArray(c6.extraSkills)) c6.extraSkills = [];
  const skillFresh = createYangyangXuanlingC6ZhiExtraSkillEntry();
  const sIdx = c6.extraSkills.findIndex((e) => e?.templateKey === YANGYANG_XUANLING_C6_ZHI_SKILL_KEY);
  if (sIdx >= 0) {
    c6.extraSkills[sIdx] = normalizeTemplateExtraSkillEntry({
      ...skillFresh,
      templateKey: YANGYANG_XUANLING_C6_ZHI_SKILL_KEY,
      name: c6.extraSkills[sIdx].name || skillFresh.name,
    });
  } else {
    c6.extraSkills.unshift(skillFresh);
  }
  if (!Array.isArray(c6.personalBuffs)) c6.personalBuffs = [];
  const critFresh = createYangyangXuanlingC6ZhiCritBuffEntry();
  const cIdx = c6.personalBuffs.findIndex((b) => b?.templateKey === YANGYANG_XUANLING_C6_ZHI_CRIT_KEY);
  if (cIdx >= 0) {
    c6.personalBuffs[cIdx] = mergeTemplateBuffKeepGameText(
      c6.personalBuffs[cIdx],
      critFresh,
      { templateKey: YANGYANG_XUANLING_C6_ZHI_CRIT_KEY }
    );
  } else {
    c6.personalBuffs.unshift(critFresh);
  }
  if (!String(c6.notes || '').trim() || !/止如槁木/.test(String(c6.notes || ''))) {
    c6.notes =
      '内置：技能库加入【玄翎之影·止如槁木】（重击 337.98%）；该技能暴击率固定为100%';
  }
  tpl.resonanceChains['6'] = c6;
  if (!tpl.characterName) tpl.characterName = '秧秧·玄翎';
  setTemplateNotesIfEmpty(
    tpl,
    '秧秧·玄翎：全队【秧秧·延奏】湮灭伤害加深+20%（固定；对秧秧·玄翎本人不生效）。6链加入技能【玄翎之影·止如槁木】（重击 337.98%，入轴时暴击率固定100%）。'
  );
  return tpl;
}

function createYangyangXuanlingC6ZhiExtraSkillEntry() {
  return normalizeTemplateExtraSkillEntry({
    templateKey: YANGYANG_XUANLING_C6_ZHI_SKILL_KEY,
    name: YANGYANG_XUANLING_C6_ZHI_SKILLS[0],
    damageType: '重击',
    baseMult: YANGYANG_XUANLING_C6_ZHI_BASE_MULT,
  });
}

function createQianxiaoC1ExtraSkillEntry() {
  return normalizeTemplateExtraSkillEntry({
    templateKey: QIANXIAO_C1_EXTRA_SKILL_KEY,
    name: QIANXIAO_C1_EXTRA_SKILL_NAME,
    damageType: '共鸣技能',
    baseMult: QIANXIAO_C1_EXTRA_FIXED_DMG,
    fixedDamage: true,
  });
}

function isQianxiaoHuizhongBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  const name = String(buff.name || '').trim();
  return key === QIANXIAO_HUIZHONG_KEY || name === '万缕·汇终' || /万缕.*汇终/.test(name);
}

function createQianxiaoHuizhongMultEffect(effectKey, minResonance) {
  return {
    zone: 'multBoost',
    valueMode: 'fixed',
    value: QIANXIAO_HUIZHONG_MULT_PCT,
    skillScope: 'names',
    librarySkillNames: [...QIANXIAO_HUIZHONG_SKILLS],
    skillNames: [
      ...QIANXIAO_HUIZHONG_SKILLS,
      ...QIANXIAO_HUIZHONG_SKILLS.map((n) => simplifySkillPaletteName(n)).filter(Boolean),
    ],
    damageType: '',
    element: '',
    defenseKind: '',
    minStacks: 0,
    minResonance,
    effectKey,
  };
}

function createQianxiaoHuizhongBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: QIANXIAO_HUIZHONG_KEY,
    category: 'composite',
    name: '万缕·汇终',
    mode: 'fixed',
    value: 0,
    gameText: QIANXIAO_HUIZHONG_GAME_TEXT,
    effects: [
      createQianxiaoHuizhongMultEffect(QIANXIAO_HUIZHONG_BASE_EFFECT_KEY, 0),
      createQianxiaoHuizhongMultEffect(
        QIANXIAO_HUIZHONG_C2_EFFECT_KEY,
        QIANXIAO_HUIZHONG_C2_MIN_RESONANCE
      ),
    ],
  });
}

  /** 千咲【万缕·汇终】：本体 +120%；≥3 链再 +120%（与本体加算，合计 240%） */
function ensureQianxiaoHuizhongEffects(buff) {
  if (!isQianxiaoHuizhongBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) buff.templateKey = QIANXIAO_HUIZHONG_KEY;
  if (!buff.name || !/万缕/.test(String(buff.name))) buff.name = '万缕·汇终';
  buff.category = 'composite';
  buff.mode = 'fixed';
  buff.value = 0;
  buff.perStack = 0;
  if (!normalizeBuffGameText(buff.gameText)) {
    buff.gameText = QIANXIAO_HUIZHONG_GAME_TEXT;
  }
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const autoKeys = new Set([QIANXIAO_HUIZHONG_BASE_EFFECT_KEY, QIANXIAO_HUIZHONG_C2_EFFECT_KEY]);
  // 去掉旧版无 effectKey 的同区倍率提升，改由内置 effectKey 托管（避免与本体 120% 重复）
  buff.effects = buff.effects.filter(
    (fx) =>
      autoKeys.has(String(fx?.effectKey || '')) ||
      !(fx?.zone === 'multBoost' && !String(fx?.effectKey || '').trim())
  );
  const upsert = (effectKey, minResonance) => {
    const fresh = createQianxiaoHuizhongMultEffect(effectKey, minResonance);
    const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
    if (idx >= 0) {
      buff.effects[idx] = {
        ...buff.effects[idx],
        ...fresh,
        effectKey,
        name: buff.effects[idx].name,
      };
    } else {
      buff.effects.push(fresh);
    }
  };
  upsert(QIANXIAO_HUIZHONG_BASE_EFFECT_KEY, 0);
  upsert(QIANXIAO_HUIZHONG_C2_EFFECT_KEY, QIANXIAO_HUIZHONG_C2_MIN_RESONANCE);
  if (typeof syncCompositeBuffModeFromEffects === 'function') {
    syncCompositeBuffModeFromEffects(buff);
  }
  return buff;
}

function qianxiaoBuffBareName(b) {
  const raw = String(b?.name || '').trim();
  if (typeof stripManagedBuffSourcePrefixes === 'function') {
    return stripManagedBuffSourcePrefixes(raw);
  }
  return raw.replace(/^(?:【(?:声骸|本体|武器|全队·[^】]*)】|\[(?:声骸|本体|武器(?:被动)?)\])\s*/u, '');
}

function isQianxiaoXuwuwenhenBuff(b) {
  if (!b) return false;
  if (String(b.templateKey || '') === QIANXIAO_XUWUWENHEN_KEY) return true;
  const name = qianxiaoBuffBareName(b);
  return name === QIANXIAO_XUWUWENHEN_NAME || name === '虚湮之线' || name === '千被动';
}

function isQianxiaoAnyingxiaoBuff(b) {
  if (!b) return false;
  if (String(b.templateKey || '') === QIANXIAO_ANYINGXIAO_KEY) return true;
  const name = qianxiaoBuffBareName(b);
  return name === QIANXIAO_ANYINGXIAO_NAME || name === '虚湮效应';
}

function createQianxiaoXuwuwenhenBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: QIANXIAO_XUWUWENHEN_KEY,
    category: 'generalDefense',
    name: QIANXIAO_XUWUWENHEN_NAME,
    mode: 'fixed',
    value: QIANXIAO_XUWUWENHEN_IGNORE_PCT,
    perStack: 0,
    maxStacks: 5,
    damageType: '',
    element: '',
    defenseKind: 'ignore',
  });
}

function createQianxiaoAnyingxiaoBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: QIANXIAO_ANYINGXIAO_KEY,
    category: 'generalDefense',
    name: QIANXIAO_ANYINGXIAO_NAME,
    mode: 'stack',
    value: 0,
    perStack: QIANXIAO_ANYINGXIAO_PEN_PER_STACK,
    maxStacks: QIANXIAO_ANYINGXIAO_MAX_STACKS,
    damageType: '',
    element: '',
    defenseKind: 'pen',
  });
}

/** 将误挂在个人的防御拐力迁到全队，并补齐稳定键 */
function promoteQianxiaoPersonalDefBuffToTeam(tpl, isMatch, templateKey, entryFactory) {
  if (!tpl) return;
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  const collected = [];
  const takeFrom = (list) => {
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (!isMatch(list[i])) continue;
      collected.push(list[i]);
      list.splice(i, 1);
    }
  };
  takeFrom(tpl.personalBuffs);
  Object.values(tpl.combatModes || {}).forEach((block) => takeFrom(block?.personalBuffs));
  Object.values(tpl.resonanceChains || {}).forEach((chain) => {
    takeFrom(chain?.personalBuffs);
    Object.values(chain?.combatModes || {}).forEach((block) => takeFrom(block?.personalBuffs));
  });

  const fresh = entryFactory();
  let idx = tpl.teamBuffs.findIndex(isMatch);
  if (idx < 0) {
    const src = collected[0];
    if (src) {
      src.templateKey = templateKey;
      src.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
      src.category = fresh.category;
      src.defenseKind = fresh.defenseKind;
      if (!src.name) src.name = fresh.name;
      if (!src.mode) src.mode = fresh.mode;
      if (!(Number(src.maxStacks) > 0)) src.maxStacks = fresh.maxStacks;
      if (src.mode === 'stack' && !(Number(src.perStack) > 0)) src.perStack = fresh.perStack;
      if (src.mode === 'fixed' && !(Number(src.value) > 0)) src.value = fresh.value;
      tpl.teamBuffs.push(normalizeTemplateBuffEntry(src));
    } else {
      tpl.teamBuffs.push(fresh);
    }
  } else {
    const b = tpl.teamBuffs[idx];
    b.templateKey = templateKey;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b.category = fresh.category;
    b.defenseKind = fresh.defenseKind;
    if (!b.name) b.name = fresh.name;
    patchTemplateBuffMetaFromFresh(b, fresh);
  }
}

/** 千咲：本体【万缕·汇终】；全队【虚无纹痕】【暗效应】；≥1 链【1链·额外】固定伤害 */
function ensureQianxiaoTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== QIANXIAO_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  const huizhongFresh = createQianxiaoHuizhongBuffEntry();
  const hIdx = tpl.personalBuffs.findIndex((b) => isQianxiaoHuizhongBuff(b));
  if (hIdx >= 0) {
    const merged = mergeTemplateBuffKeepGameText(tpl.personalBuffs[hIdx], huizhongFresh, {
      templateKey: QIANXIAO_HUIZHONG_KEY,
      name: tpl.personalBuffs[hIdx].name || huizhongFresh.name,
    });
    ensureQianxiaoHuizhongEffects(merged);
    tpl.personalBuffs[hIdx] = merged;
  } else {
    tpl.personalBuffs.unshift(huizhongFresh);
  }

  promoteQianxiaoPersonalDefBuffToTeam(
    tpl,
    isQianxiaoXuwuwenhenBuff,
    QIANXIAO_XUWUWENHEN_KEY,
    createQianxiaoXuwuwenhenBuffEntry
  );
  promoteQianxiaoPersonalDefBuffToTeam(
    tpl,
    isQianxiaoAnyingxiaoBuff,
    QIANXIAO_ANYINGXIAO_KEY,
    createQianxiaoAnyingxiaoBuffEntry
  );

  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c1 = tpl.resonanceChains['1'] || normalizeChainBlock({}, QIANXIAO_CHAR_ID);
  if (!Array.isArray(c1.extraSkills)) c1.extraSkills = [];
  const skillFresh = createQianxiaoC1ExtraSkillEntry();
  const sIdx = c1.extraSkills.findIndex((e) => e?.templateKey === QIANXIAO_C1_EXTRA_SKILL_KEY);
  if (sIdx >= 0) {
    c1.extraSkills[sIdx] = normalizeTemplateExtraSkillEntry({
      ...skillFresh,
      templateKey: QIANXIAO_C1_EXTRA_SKILL_KEY,
      name: c1.extraSkills[sIdx].name || skillFresh.name,
    });
  } else {
    c1.extraSkills.unshift(skillFresh);
  }
  if (!String(c1.notes || '').trim() || !/1链·额外/.test(String(c1.notes || ''))) {
    c1.notes = `内置：技能库加入【${QIANXIAO_C1_EXTRA_SKILL_NAME}】固定伤害 ${QIANXIAO_C1_EXTRA_FIXED_DMG}（不受任何乘区加成）。`;
  }
  tpl.resonanceChains['1'] = c1;

  const c2 = tpl.resonanceChains['2'] || normalizeChainBlock({}, QIANXIAO_CHAR_ID);
  if (!String(c2.notes || '').trim() || !/万缕·汇终/.test(String(c2.notes || ''))) {
    c2.notes = `内置：本体【万缕·汇终】指定技能倍率提升 ${QIANXIAO_HUIZHONG_MULT_PCT}%→${QIANXIAO_HUIZHONG_MULT_PCT * 2}%（同 Buff ≥${QIANXIAO_HUIZHONG_C2_MIN_RESONANCE}链追加，加算）。`;
  }
  tpl.resonanceChains['2'] = c2;

  if (!tpl.characterName) tpl.characterName = '千咲';
  const notesHint = `千咲：本体【万缕·汇终】指定技能倍率提升+${QIANXIAO_HUIZHONG_MULT_PCT}%（≥${QIANXIAO_HUIZHONG_C2_MIN_RESONANCE}链再+${QIANXIAO_HUIZHONG_MULT_PCT}%，加算合计${QIANXIAO_HUIZHONG_MULT_PCT * 2}%）。全队【${QIANXIAO_XUWUWENHEN_NAME}】无视防御+${QIANXIAO_XUWUWENHEN_IGNORE_PCT}%；全队【${QIANXIAO_ANYINGXIAO_NAME}】穿防+${QIANXIAO_ANYINGXIAO_PEN_PER_STACK}%/层（上限${QIANXIAO_ANYINGXIAO_MAX_STACKS}层）。≥1 链技能库加入【${QIANXIAO_C1_EXTRA_SKILL_NAME}】固定伤害 ${QIANXIAO_C1_EXTRA_FIXED_DMG}（不受任何乘区加成）。`;
  if (
    !String(tpl.notes || '').trim() ||
    !/万缕·汇终/.test(String(tpl.notes || '')) ||
    !/1链·额外/.test(String(tpl.notes || '')) ||
    !/虚无纹痕|暗效应/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function createYangyangXuanlingC6ZhiCritBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: YANGYANG_XUANLING_C6_ZHI_CRIT_KEY,
    category: 'composite',
    name: '秧秧·玄翎·6链·止如槁木暴击固定',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'critRateSet',
        valueMode: 'fixed',
        value: 100,
        skillScope: 'names',
        librarySkillNames: [...YANGYANG_XUANLING_C6_ZHI_SKILLS],
        skillNames: ['止如槁木', '玄翎之影·止如槁木', ...YANGYANG_XUANLING_C6_ZHI_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

/** 陆·赫斯固有2：floor(谐幅/10)×每档加深%，不足10点不转化；2链时每档/上限翻倍 */
function getLuhesiInnate2DeepParams(resonanceUnlocked) {
  const c2 = normalizeResonanceUnlocked(resonanceUnlocked) >= 2;
  return {
    ampPerChunk: LUHESI_INNATE2_AMP_PER_CHUNK,
    deepPerChunk: c2 ? LUHESI_INNATE2_C2_DEEP_PER_CHUNK : LUHESI_INNATE2_DEEP_PER_CHUNK,
    deepCap: c2 ? LUHESI_INNATE2_C2_DEEP_CAP : LUHESI_INNATE2_DEEP_CAP,
    c2,
  };
}

function computeLuhesiInnate2DeepPct(harmonyAmp, resonanceUnlocked) {
  const amp = Math.max(0, Number(harmonyAmp) || 0);
  const { ampPerChunk, deepPerChunk, deepCap } = getLuhesiInnate2DeepParams(resonanceUnlocked);
  const chunks = Math.floor(amp / ampPerChunk);
  return Math.min(deepCap, chunks * deepPerChunk);
}

function createLuhesiInnate2DeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: LUHESI_INNATE2_DEEP_KEY,
    category: 'generalDeep',
    name: '固有2',
    mode: 'fixed',
    value: 0,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function ensureLuhesiTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LUHESI_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(tpl.personalBuffs, LUHESI_INNATE2_DEEP_KEY, createLuhesiInnate2DeepBuffEntry);
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c2 = tpl.resonanceChains['2'] || normalizeChainBlock({}, LUHESI_CHAR_ID);
  if (!Array.isArray(c2.personalBuffs)) c2.personalBuffs = [];
  ensureTemplateListBuff(
    c2.personalBuffs,
    LUHESI_C2_YONGDONG_MULT_KEY,
    createLuhesiChain2YongdongMultBuffEntry
  );
  if (!String(c2.notes || '').trim() || !/于永冻中释义/.test(String(c2.notes || '')) || !/固有2/.test(String(c2.notes || ''))) {
    c2.notes =
      '内置：①固有2加深翻倍（每满10点谐幅+10%泛用加深，上限60%，不足10点不转化）；②指定【于永冻中释义】倍率提升+60%（与其它倍率提升加算叠加）';
  }
  tpl.resonanceChains['2'] = c2;
  const c3 = tpl.resonanceChains['3'] || normalizeChainBlock({}, LUHESI_CHAR_ID);
  if (!Array.isArray(c3.personalBuffs)) c3.personalBuffs = [];
  const c3Fresh = createLuhesiChain3MultBuffEntry();
  const c3Idx = c3.personalBuffs.findIndex((b) => b?.templateKey === LUHESI_C3_MULT_KEY);
  if (c3Idx >= 0) {
    c3.personalBuffs[c3Idx] = mergeTemplateBuffKeepGameText(
      c3.personalBuffs[c3Idx],
      c3Fresh,
      { templateKey: LUHESI_C3_MULT_KEY }
    );
  } else {
    c3.personalBuffs.unshift(c3Fresh);
  }
  if (!String(c3.notes || '').trim() || !/斩杀日冕/.test(String(c3.notes || ''))) {
    c3.notes =
      '内置：指定【斩杀日冕】【判决大地裂响】【日髓阵列】倍率提升+136%（与其它倍率提升加算叠加）';
  }
  tpl.resonanceChains['3'] = c3;
  // 5链两句分别建模，避免复合 Buff 在技能对照表中合并展示作用范围。
  const c5 = tpl.resonanceChains['5'] || normalizeChainBlock({}, LUHESI_CHAR_ID);
  if (!Array.isArray(c5.personalBuffs)) c5.personalBuffs = [];
  const c5Entries = [
    { key: 'tpl_ms05xtb1_mu9sa', name: '5链·变奏/延奏增伤', zone: 'generalBonus', value: 80,
      names: ['注入黎明以前·技能', '致濒死以答'],
      text: '变奏技能注入黎明以前和延奏技能致濒死以答伤害加成提升80%。' },
    { key: 'luhesi_c5_liujin_mult', name: '5链·流金回潮倍率', zone: 'multBoost', value: 50,
      names: ['所有陨落在此重逢·流金回潮', '流金回潮'],
      text: '共鸣技能流金回潮伤害倍率提升50%，冷却时间降低2秒，可施放次数增加1次。' },
  ];
  c5Entries.forEach(({ key, name, zone, value, names, text }) => {
    const previous = c5.personalBuffs.find((b) => b?.templateKey === key);
    const fresh = normalizeTemplateBuffEntry({
      ...previous, templateKey: key, name, category: 'composite', mode: 'fixed',
      value: 0, perStack: 0, maxStacks: 1, gameText: text,
      effects: [{ zone, valueMode: 'fixed', value, skillScope: 'names',
        skillNames: names, librarySkillNames: names }],
    });
    const index = c5.personalBuffs.findIndex((b) => b?.templateKey === key);
    if (index >= 0) c5.personalBuffs[index] = fresh;
    else c5.personalBuffs.push(fresh);
  });
  tpl.resonanceChains['5'] = c5;
  // 6链：易伤固定开关；解放增伤属于终局之释义的每层效果，二者独立。
  const terminus = tpl.personalBuffs.find((b) => b?.templateKey === 'tpl_ms05lb1a_zl4rn');
  if (terminus) {
    terminus.effects = (terminus.effects || []).filter((fx) => fx.effectKey !== 'luhesi_c6_yongdong_bonus');
    terminus.effects.push(normalizeCompositeEffect({
      effectKey: 'luhesi_c6_yongdong_bonus', zone: 'generalBonus', valueMode: 'stack',
      segments: [{ upTo: 3, perStack: 40 }], minResonance: 6,
      skillScope: 'names', skillNames: [...LUHESI_YONGDONG_SKILLS],
      librarySkillNames: [...LUHESI_YONGDONG_SKILLS],
    }));
    terminus.maxStacks = 3;
    terminus.clampStacks = true;
    const c6Text = '6链：每层终局之释义额外使于永冻中释义伤害加成提升40%，最高120%。';
    if (!String(terminus.gameText || '').includes(c6Text)) {
      terminus.gameText = [terminus.gameText, c6Text].filter(Boolean).join('\n');
    }
  }
  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({}, LUHESI_CHAR_ID);
  if (!Array.isArray(c6.personalBuffs)) c6.personalBuffs = [];
  const c6Index = c6.personalBuffs.findIndex((b) => b?.templateKey === 'tpl_ms061a22_13o8i');
  const c6Vulnerability = normalizeTemplateBuffEntry({
    ...(c6.personalBuffs[c6Index] || {}), templateKey: 'tpl_ms061a22_13o8i',
    name: '6链·指定技能易伤', category: 'composite', mode: 'fixed',
    value: 0, perStack: 0, maxStacks: 1, clampStacks: false,
    effects: [{ zone: 'generalVulnerability', valueMode: 'fixed', value: 30,
      skillScope: 'names', skillNames: [...LUHESI_C3_MULT_SKILLS],
      librarySkillNames: [...LUHESI_C3_MULT_SKILLS] }],
    gameText: '附近队伍中所有角色造成【谐度破坏】伤害时，使目标受到陆·赫斯所有形态的共鸣技能斩杀日冕、日髓阵列和空中攻击·判决大地裂响的伤害提升30%，持续25秒。',
  });
  delete c6Vulnerability.stackSync;
  delete c6Vulnerability.activeSync;
  delete c6Vulnerability.defaultStacks;
  if (c6Index >= 0) c6.personalBuffs[c6Index] = c6Vulnerability;
  else c6.personalBuffs.push(c6Vulnerability);
  tpl.resonanceChains['6'] = c6;

  if (!tpl.characterName) tpl.characterName = '陆·赫斯';
  setTemplateNotesIfEmpty(
    tpl,
    '陆·赫斯：固有2—读取当前谐度破坏增幅，每满10点转化泛用加深+5%（不足10点不转化），上限30%；数值随谐幅实时同步。2链时固有2翻倍（每满10点+10%，上限60%），并指定【于永冻中释义】倍率提升+60%（与其它倍率提升加算叠加）。3链指定【斩杀日冕】【判决大地裂响】【日髓阵列】倍率提升+136%（与其它倍率提升加算叠加）。'
  );
  return tpl;
}

function createLuhesiChain2YongdongMultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: LUHESI_C2_YONGDONG_MULT_KEY,
    category: 'composite',
    name: '陆·赫斯·2链·于永冻中释义倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 60,
        skillScope: 'names',
        librarySkillNames: [...LUHESI_YONGDONG_SKILLS],
        skillNames: ['于永冻中释义', '于永冻中释义·技能', ...LUHESI_YONGDONG_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createLuhesiChain3MultBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: LUHESI_C3_MULT_KEY,
    category: 'composite',
    name: '陆·赫斯·3链·斩杀/判决/日髓倍率提升',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 136,
        skillScope: 'names',
        librarySkillNames: [...LUHESI_C3_MULT_SKILLS],
        skillNames: [
          '斩杀日冕',
          '斩杀日冕·环',
          '斩杀日冕·破',
          '斩杀日冕·曜',
          '判决大地裂响',
          '日髓阵列',
          ...LUHESI_C3_MULT_SKILLS,
        ],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function isLuhesiInnate2DeepBuff(b) {
  return !!b && String(b.templateKey || '') === LUHESI_INNATE2_DEEP_KEY;
}

/** 按当前谐幅总和刷新【固有2】泛用加深（模板写结构，数值运行时同步） */
function syncLuhesiInnate2HarmonyDeep(member) {
  if (!member) return;
  if (String(member.characterId) !== LUHESI_CHAR_ID) {
    const drop = (member.buffs || []).filter(isLuhesiInnate2DeepBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    return;
  }
  const amp = getMemberHarmonyBreakAmpTotal(member);
  const resonance = normalizeResonanceUnlocked(member.resonanceUnlocked);
  const params = getLuhesiInnate2DeepParams(resonance);
  const deepPct = computeLuhesiInnate2DeepPct(amp, resonance);
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  let b = member.buffs.find(isLuhesiInnate2DeepBuff);
  if (!b) {
    b = normalizeBuff({
      id: genId(),
      category: 'generalDeep',
      name: '固有2',
      mode: 'fixed',
      value: deepPct,
      damageType: '',
      element: '',
      defenseKind: '',
      templateKey: LUHESI_INNATE2_DEEP_KEY,
      sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    });
    member.buffs.push(b);
  } else {
    b.category = 'generalDeep';
    b.mode = 'fixed';
    b.value = deepPct;
    b.perStack = 0;
    if (!b.name) b.name = '固有2';
    b.templateKey = LUHESI_INNATE2_DEEP_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    delete b.effectType;
  }
  member.globalBuffActive[b.id] = true;
  // 清掉阶段/技能上误冻的 false，避免「来源已勾、结算不加」
  (member.phases || []).forEach((phase) => {
    if (phase?.buffActive && phase.buffActive[b.id] === false) delete phase.buffActive[b.id];
    (phase?.skills || []).forEach((skill) => {
      const units =
        skill?.split && skill.hits?.length ? skill.hits : skill ? [skill] : [];
      units.forEach((unit) => {
        if (unit?.buffActive && unit.buffActive[b.id] === false) delete unit.buffActive[b.id];
      });
    });
  });
  b._luhesiHarmonyAmp = amp;
  b._luhesiC2Doubled = params.c2;
  b._luhesiDeepHint = params.c2
    ? `谐幅 ${amp} → 2链翻倍：每满${params.ampPerChunk}点+${params.deepPerChunk}%加深，当前 ${deepPct}%（上限${params.deepCap}%）`
    : `谐幅 ${amp} → 每满${params.ampPerChunk}点+${params.deepPerChunk}%加深，当前 ${deepPct}%（上限${params.deepCap}%）`;
}

/** 西格莉卡固有2：max(0, 共鸣效率−125) × 2%，上限50%（125%恰好为0） */
function computeSigrikaInnate2EchoBonusPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : ENERGY_REGEN_BASE_VALUE;
  const excess = Math.max(0, pct - SIGRIKA_INNATE2_ER_THRESHOLD);
  return Math.min(SIGRIKA_INNATE2_BONUS_CAP, excess * SIGRIKA_INNATE2_BONUS_PER_PCT);
}

function createSigrikaInnate2EchoBonusBuffEntry() {
  const deepEffect = (full, bare) => ({
    zone: 'generalDeep',
    valueMode: 'fixed',
    value: SIGRIKA_INNATE2_DEEP_PCT,
    segments: [{ upTo: null, perStack: 0 }],
    skillScope: 'names',
    skillNames: [full, bare],
    librarySkillNames: [full],
    catalogIds: [],
    damageType: '声骸',
    effectType: '',
    element: '气动',
    defenseKind: '',
    minStacks: 0,
    minResonance: 0,
    effectKey: '',
  });
  return normalizeTemplateBuffEntry({
    templateKey: SIGRIKA_INNATE2_ECHO_BONUS_KEY,
    category: 'composite',
    name: '固有2',
    mode: 'fixed',
    value: 0,
    perStack: 0,
    maxStacks: 99,
    damageType: '',
    element: '',
    defenseKind: '',
    effects: [
      deepEffect('在那浩瀚中·符语爆破', '符语爆破'),
      deepEffect('在那浩瀚中·符语链刃', '符语链刃'),
      deepEffect('在那浩瀚中·符语日灵', '符语日灵'),
    ],
  });
}

function isSigrikaTalentBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === SIGRIKA_TALENT_KEY || /^sigrika_talent/i.test(key)) return true;
  return String(buff.name || '').includes('天赋');
}

function getSigrikaTalentDefaultStacks(resonanceUnlocked) {
  return normalizeResonanceUnlocked(resonanceUnlocked) >= SIGRIKA_TALENT_C3_UNLOCK
    ? SIGRIKA_TALENT_STACKS_AT_C3
    : SIGRIKA_TALENT_STACKS_BASE;
}

function collectSigrikaTalentBaseSkillTargets(effects) {
  const libs = new Set();
  const names = new Set();
  (effects || []).forEach((fx) => {
    if (!fx || SIGRIKA_TALENT_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''))) return;
    if (fx.skillScope !== 'names') return;
    (fx.librarySkillNames || []).forEach((n) => {
      const s = String(n || '').trim();
      if (s) libs.add(s);
    });
    (fx.skillNames || []).forEach((n) => {
      const s = String(n || '').trim();
      if (s) names.add(s);
    });
  });
  return {
    librarySkillNames: [...libs],
    skillNames: [...names],
  };
}

function upsertSigrikaTalentAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const skills = collectSigrikaTalentBaseSkillTargets(buff.effects);
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: 'names',
    librarySkillNames: skills.librarySkillNames,
    skillNames: skills.skillNames.length ? skills.skillNames : [...skills.librarySkillNames],
    damageType: payloadBase.damageType || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 西格莉卡【天赋】：6链追加指定技能加深+15%/层、无视防御+7.5%/层（技能跟随其它效果） */
function ensureSigrikaTalentEffects(buff) {
  if (!isCompositeBuff(buff) || !isSigrikaTalentBuff(buff)) return buff;
  if (!String(buff.templateKey || '').trim()) {
    buff.templateKey = SIGRIKA_TALENT_KEY;
  }
  upsertSigrikaTalentAutoEffect(buff, SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY, {
    zone: 'generalDeep',
    valueMode: 'stack',
    value: 0,
    segments: [{ upTo: null, perStack: SIGRIKA_TALENT_C6_DEEP_PER_STACK }],
    element: '',
    minResonance: 6,
  });
  upsertSigrikaTalentAutoEffect(buff, SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY, {
    zone: 'generalDefense',
    valueMode: 'stack',
    value: 0,
    segments: [{ upTo: null, perStack: SIGRIKA_TALENT_C6_DEF_IGNORE_PER_STACK }],
    element: '',
    defenseKind: 'ignore',
    minResonance: 6,
  });
  const minCap = SIGRIKA_TALENT_STACKS_AT_C3;
  buff.maxStacks = Math.max(minCap, Number(buff.maxStacks) || minCap);
  syncCompositeBuffModeFromEffects(buff);
  return buff;
}

/** 按链数同步【天赋】默认层数：<3链→2；≥3链→4（跨过3链门槛时强制切换，并清掉编辑轴层数覆盖） */
function applySigrikaTalentStackValue(member, buff, stacks) {
  const next = normalizeStackInput(stacks);
  if (!member.globalBuffStacks) member.globalBuffStacks = {};
  member.globalBuffStacks[buff.id] = next;
  (member.rotationCatalog || []).forEach((item) => {
    if (item?.stackLayers && item.stackLayers[buff.id] !== undefined) {
      delete item.stackLayers[buff.id];
    }
  });
  const cfg = member.cycleConfig;
  if (cfg?.enabled && Array.isArray(cfg.rounds) && cfg.rounds.length) {
    const idx =
      typeof readActiveCycleRoundIndex === 'function'
        ? readActiveCycleRoundIndex(member)
        : Math.max(0, Math.min(cfg.rounds.length - 1, Number(cfg.activeRound) || 0));
    const round = cfg.rounds[idx];
    if (round) {
      Object.values(round.catalogStacks || {}).forEach((layers) => {
        if (layers && layers[buff.id] !== undefined) delete layers[buff.id];
      });
      if (round.globalBuffStacks) round.globalBuffStacks[buff.id] = next;
    }
  }
  (member.phases || []).forEach((phase) => {
    if (phase.buffStacks && phase.buffStacks[buff.id] !== undefined) {
      phase.buffStacks[buff.id] = next;
    }
    (phase.skills || []).forEach((skill) => {
      if (skill.buffStacks && skill.buffStacks[buff.id] !== undefined) {
        skill.buffStacks[buff.id] = next;
      }
      (skill.hits || []).forEach((hit) => {
        if (hit.buffStacks && hit.buffStacks[buff.id] !== undefined) {
          hit.buffStacks[buff.id] = next;
        }
      });
    });
  });
}

function syncSigrikaTalentDefaultStacks(member) {
  if (!member || String(member.characterId) !== SIGRIKA_CHAR_ID) return;
  const buff = (member.buffs || []).find(isSigrikaTalentBuff);
  if (!buff || !isStackBuff(buff)) return;
  ensureSigrikaTalentEffects(buff);
  const resonance = normalizeResonanceUnlocked(member.resonanceUnlocked);
  const nextDefault = getSigrikaTalentDefaultStacks(resonance);
  buff.maxStacks = Math.max(Number(buff.maxStacks) || 0, nextDefault, SIGRIKA_TALENT_STACKS_AT_C3);
  if (!member.globalBuffStacks) member.globalBuffStacks = {};
  const curRaw = member.globalBuffStacks[buff.id];
  const cur = curRaw === undefined ? undefined : normalizeStackInput(curRaw);
  const prevRes =
    member._sigrikaTalentPrevResonance !== undefined
      ? normalizeResonanceUnlocked(member._sigrikaTalentPrevResonance)
      : undefined;
  const prevDefault =
    prevRes !== undefined ? getSigrikaTalentDefaultStacks(prevRes) : undefined;
  // 仅：首次无层数，或用户仍停在「上一档默认层」时随链数切换默认；手填层数不覆盖
  if (cur === undefined) {
    applySigrikaTalentStackValue(member, buff, nextDefault);
  } else if (prevDefault !== undefined && cur === prevDefault && cur !== nextDefault) {
    applySigrikaTalentStackValue(member, buff, nextDefault);
  } else {
    // 全局已正确或为手填时，清掉仍等于「另一档默认」的编辑轴覆盖
    const wrongDefault =
      nextDefault === SIGRIKA_TALENT_STACKS_AT_C3
        ? SIGRIKA_TALENT_STACKS_BASE
        : SIGRIKA_TALENT_STACKS_AT_C3;
    (member.rotationCatalog || []).forEach((item) => {
      if (item?.stackLayers && item.stackLayers[buff.id] === wrongDefault) {
        delete item.stackLayers[buff.id];
      }
    });
    const cfg = member.cycleConfig;
    if (cfg?.rounds) {
      cfg.rounds.forEach((round) => {
        Object.values(round.catalogStacks || {}).forEach((layers) => {
          if (layers && layers[buff.id] === wrongDefault) delete layers[buff.id];
        });
      });
    }
  }
  delete member._sigrikaTalentPrevResonance;
  member._sigrikaTalentSyncedResonance = resonance;
}

function ensureSigrikaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== SIGRIKA_CHAR_ID) return tpl;
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  // 防御性：剔除历史遗留的重复「天赋？」旧条目（正式键为 sigrika_talent）
  tpl.personalBuffs = tpl.personalBuffs.filter(
    (b) => String(b.templateKey || '') !== 'tpl_ms0myf52_rneek'
  );
  const fresh = createSigrikaInnate2EchoBonusBuffEntry();
  const idx = tpl.personalBuffs.findIndex((b) => b?.templateKey === SIGRIKA_INNATE2_ECHO_BONUS_KEY);
  if (idx >= 0) {
    tpl.personalBuffs[idx] = mergeTemplateBuffKeepGameText(tpl.personalBuffs[idx], fresh, {
      templateKey: SIGRIKA_INNATE2_ECHO_BONUS_KEY,
    });
  } else {
    tpl.personalBuffs.unshift(fresh);
  }
  tpl.personalBuffs.forEach((b) => {
    if (isSigrikaTalentBuff(b)) ensureSigrikaTalentEffects(b);
  });
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c3 = tpl.resonanceChains['3'] || normalizeChainBlock({}, SIGRIKA_CHAR_ID);
  if (!String(c3.notes || '').trim() || !/天赋/.test(String(c3.notes || ''))) {
    c3.notes = '内置：【天赋】默认层数 2→4（选≥3链时自动切换）';
  }
  tpl.resonanceChains['3'] = c3;
  const c4 = tpl.resonanceChains['4'] || normalizeChainBlock({}, SIGRIKA_CHAR_ID);
  if (!Array.isArray(c4.teamBuffs)) c4.teamBuffs = [];
  const c4Idx = c4.teamBuffs.findIndex(isSigrikaC4TeamAtkBuff);
  if (c4Idx >= 0) {
    renameSigrikaC4TeamAtkBuff(c4.teamBuffs[c4Idx]);
  } else {
    c4.teamBuffs.unshift(
      normalizeTemplateBuffEntry({
        templateKey: SIGRIKA_C4_TEAM_ATK_KEY,
        category: 'generalAttack',
        name: SIGRIKA_C4_TEAM_ATK_NAME,
        mode: 'fixed',
        value: SIGRIKA_C4_TEAM_ATK_PCT,
        damageType: '',
        element: '',
        defenseKind: '',
        gameText: '队伍中的角色施放声骸技能时，使队伍中的角色攻击提升20%，持续20秒。',
      })
    );
  }
  if (!String(c4.notes || '').trim() || /细则待定|西格·2链/.test(String(c4.notes || ''))) {
    c4.notes = '内置：全队【4链】泛用攻击+20%（固定）';
  }
  tpl.resonanceChains['4'] = c4;
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => renameSigrikaC4TeamAtkBuff(b));
      return list;
    });
  }
  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({}, SIGRIKA_CHAR_ID);
  if (
    !String(c6.notes || '').trim() ||
    !/天赋/.test(String(c6.notes || '')) ||
    !/7\.5/.test(String(c6.notes || ''))
  ) {
    c6.notes =
      '内置：【天赋】指定技能每层伤害加深+15%、无视防御+7.5%（与本体同一Buff，需≥6链；技能范围跟随其它指定技能）';
  }
  tpl.resonanceChains['6'] = c6;
  if (!tpl.characterName) tpl.characterName = '西格莉卡';
  const notesHint =
    '固有2—共鸣效率>125%时每超过1%→声骸技能伤害加成+2%（上限50%，随面板同步）。【天赋】默认层数2，≥3链改为4；≥6链指定技能加深+15%/层、无视防御+7.5%/层。';
  if (!tpl.notes || !String(tpl.notes).includes('天赋')) {
    tpl.notes = tpl.notes ? `${tpl.notes}；${notesHint}` : `西格莉卡：${notesHint}`;
  }
  return tpl;
}

function isSigrikaC4TeamAtkBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === SIGRIKA_C4_TEAM_ATK_KEY || key === SIGRIKA_C4_TEAM_ATK_LEGACY_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  // 仅旧误名；勿用裸「4链」（仇远/琳奈/吟霖等同名全队攻）
  return name === '西格·2链' || name === '西格·4链';
}

function renameSigrikaC4TeamAtkBuff(buff, opts) {
  if (!isSigrikaC4TeamAtkBuff(buff)) return;
  const bare = SIGRIKA_C4_TEAM_ATK_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  buff.category = 'generalAttack';
  buff.mode = 'fixed';
  if (!Number.isFinite(Number(buff.value)) || Number(buff.value) <= 0) {
    buff.value = SIGRIKA_C4_TEAM_ATK_PCT;
  }
  if (
    !buff.templateKey ||
    buff.templateKey === SIGRIKA_C4_TEAM_ATK_LEGACY_KEY ||
    String(buff.templateKey).startsWith('tpl_')
  ) {
    buff.templateKey = SIGRIKA_C4_TEAM_ATK_KEY;
  }
}

function syncSigrikaC4TeamAtkBuffNames(member) {
  if (!member || String(member.characterId) !== SIGRIKA_CHAR_ID) return;
  (member.buffs || []).forEach((b) => renameSigrikaC4TeamAtkBuff(b, { runtime: true }));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => renameSigrikaC4TeamAtkBuff(b, { runtime: true }))
    );
  }
  const shared = typeof ensureTeamSharedBuffs === 'function' ? ensureTeamSharedBuffs() : null;
  (shared?.buffs || []).forEach((b) => {
    if (!isSigrikaC4TeamAtkBuff(b)) return;
    if (getTeamBuffSourceMemberIndex(b) !== getMemberIndex(member)) return;
    renameSigrikaC4TeamAtkBuff(b, { runtime: true });
  });
}

function isSigrikaInnate2EchoBonusBuff(b) {
  return !!b && String(b.templateKey || '') === SIGRIKA_INNATE2_ECHO_BONUS_KEY;
}

/** 固有2：效率转化只计入面板；Buff保留符语技能加深。 */
function syncSigrikaInnate2EchoBonus(member) {
  if (!member) return;
  if (String(member.characterId) !== SIGRIKA_CHAR_ID) {
    const drop = (member.buffs || []).filter(isSigrikaInnate2EchoBonusBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    if (typeof upsertCharKitPanelSource === 'function' && member.char) {
      upsertCharKitPanelSource(
        member.char,
        'typeDmgBonus',
        SIGRIKA_INNATE2_ER_PANEL_SOURCE_ID,
        '固有2·共鸣效率',
        0
      );
    }
    return;
  }
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  let b = member.buffs.find(isSigrikaInnate2EchoBonusBuff);
  if (!b) {
    b = createSigrikaInnate2EchoBonusBuffEntry();
    member.buffs.push(b);
  }
  member.globalBuffActive[b.id] = true;
  const erPct = getMemberEnergyRegenPct(member);
  const bonusPct = computeSigrikaInnate2EchoBonusPct(erPct);
  // 旧存档中的效率转化效果也须移除，避免与下方面板来源重复结算。
  b.effects = (b.effects || []).filter(
    (f) => String(f?.effectKey || '') !== SIGRIKA_INNATE2_ER_ECHO_EFFECT_KEY
  );
  b._sigrikaEchoBonusHint =
    '日灵能量<30点时，每消耗10点使符语爆破/符语链刃/符语日灵伤害加深15%';
  if (typeof upsertCharKitPanelSource === 'function' && member.char) {
    upsertCharKitPanelSource(
      member.char,
      'typeDmgBonus',
      SIGRIKA_INNATE2_ER_PANEL_SOURCE_ID,
      '固有2·共鸣效率',
      bonusPct,
      { damageType: '声骸' }
    );
  }
}

function createFeixueXuexiuBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: FEIXUE_XUEXIU_KEY,
    category: 'composite',
    name: '雪锈',
    mode: 'stack',
    maxStacks: FEIXUE_XUEXIU_MAX_STACKS,
    effects: [
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: 40,
        minStacks: 1,
        minResonance: 0,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
      },
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: 40,
        minStacks: 2,
        minResonance: 6,
        skillScope: 'all',
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = FEIXUE_XUEXIU_MAX_STACKS;
  entry.stackSync = FEIXUE_XUEXIU_STACK_SYNC;
  return entry;
}

function isFeixueXuexiuTeamRecipientCharId(charId) {
  const id = String(charId || '').trim();
  return !!id && FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS.includes(id);
}

/** 全队同名【雪锈】：≥3霜渐加深；6链≥3霜渐易伤；仅绯雪/洛瑟菈/穗穗 */
function createFeixueXuexiuTeamBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: FEIXUE_XUEXIU_TEAM_KEY,
    category: 'composite',
    name: '雪锈',
    mode: 'stack',
    maxStacks: FEIXUE_XUEXIU_MAX_STACKS,
    onlyCharacterIds: [...FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS],
    effects: [
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 30,
        minStacks: 1,
        minResonance: 0,
        skillScope: 'all',
        damageType: '效应',
        effectType: '霜渐',
        element: '',
        defenseKind: '',
      },
      {
        // PROBE_FIX_XUEXIU_TEAM_ENTRY：3 层额外 +30%（游戏原文案「3层：受到霜冻效应伤害额外加深30%」）
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 30,
        minStacks: 3,
        minResonance: 0,
        skillScope: 'all',
        damageType: '效应',
        effectType: '霜渐',
        element: '',
        defenseKind: '',
      },
      {
        zone: 'typeVulnerability',
        valueMode: 'fixed',
        value: 25,
        minStacks: 3,
        minResonance: 6,
        skillScope: 'all',
        damageType: '效应',
        effectType: '霜渐',
        element: '',
        defenseKind: '',
      },
    ],
  });
  entry.mode = 'stack';
  entry.maxStacks = FEIXUE_XUEXIU_MAX_STACKS;
  entry.onlyCharacterIds = [...FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS];
  entry.stackSync = FEIXUE_XUEXIU_STACK_SYNC;
  return entry;
}

function createFeixueOutroElementDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: FEIXUE_OUTRO_ELEMENT_DEEP_KEY,
    category: 'elementDeep',
    name: '绯雪·延奏',
    mode: 'fixed',
    value: 20,
    element: '冷凝',
    damageType: '',
    defenseKind: '',
    excludeSource: true,
  });
}

function createFeixueChainMultBuffEntry(templateKey, name, value, librarySkills, aliases) {
  const libs = [...(librarySkills || [])];
  const skillNames = [...new Set([...(aliases || []), ...libs])];
  return normalizeTemplateBuffEntry({
    templateKey,
    category: 'composite',
    name,
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value,
        skillScope: 'names',
        librarySkillNames: libs,
        skillNames,
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

function createFeixueC1YuqiuMultBuffEntry() {
  return createFeixueChainMultBuffEntry(FEIXUE_C1_YUQIU_MULT_KEY, '绯雪·1链', 120, FEIXUE_C1_YUQIU_SKILLS, [
    '普攻·预求身第一段',
    '普攻·预求身第二段',
    '普攻·预求身第三段',
    '普攻·预求身第四段',
    '普攻·预求身第五段',
    '重击·预求身',
    '空中攻击·预求身第一段',
    '空中攻击·预求身第二段',
    '闪避反击·预求身',
  ]);
}

function createFeixueC2JuheMultBuffEntry() {
  return createFeixueChainMultBuffEntry(FEIXUE_C2_JUHE_MULT_KEY, '绯雪·2链', 125, FEIXUE_C2_JUHE_SKILLS, [
    '普攻·居合',
  ]);
}

function createFeixueC3HeavyMultBuffEntry() {
  return createFeixueChainMultBuffEntry(FEIXUE_C3_HEAVY_MULT_KEY, '绯雪·3链', 160, FEIXUE_C3_HEAVY_SKILLS, [
    '重击·寒簇·常世身',
    '重击·枯霜·预求身',
  ]);
}

function createFeixueC4TeamBonusBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: FEIXUE_C4_TEAM_BONUS_KEY,
    category: 'generalBonus',
    name: '绯雪·4链',
    mode: 'fixed',
    value: 20,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createFeixueC5SkillMultBuffEntry() {
  return createFeixueChainMultBuffEntry(FEIXUE_C5_SKILL_MULT_KEY, '绯雪·5链', 80, FEIXUE_C5_SKILL_SKILLS, [
    '共鸣技能·常世身',
    '白玉切',
    '落华',
  ]);
}

function createFeixueC6JianxinCritBuffEntry() {
  const libs = [...FEIXUE_C6_JIANXIN_SKILLS];
  return normalizeTemplateBuffEntry({
    templateKey: FEIXUE_C6_JIANXIN_CRIT_KEY,
    category: 'composite',
    name: '绯雪·6链',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: 500,
        skillScope: 'names',
        librarySkillNames: libs,
        skillNames: ['见心', '归刃基础', ...libs],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  });
}

/**
 * 就地改写模板内全部 Buff 列表（本体 / 模态 / 链 / 链×模态）。
 * rewrite(list) 应返回新数组；原 list 会被清空后填入。
 */
function rewriteAllTemplateBuffLists(tpl, rewrite) {
  if (!tpl || typeof rewrite !== 'function') return;
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  const apply = (list) => {
    if (!Array.isArray(list)) return;
    if (seen) {
      if (seen.has(list)) return;
      seen.add(list);
    }
    const next = rewrite(list);
    if (next === list) return;
    list.length = 0;
    (next || []).forEach((item) => list.push(item));
  };
  apply(tpl.personalBuffs);
  apply(tpl.teamBuffs);
  Object.values(tpl.combatModes || {}).forEach((block) => {
    if (!block) return;
    apply(block.personalBuffs);
    apply(block.teamBuffs);
  });
  Object.values(tpl.resonanceChains || {}).forEach((chain) => {
    if (!chain) return;
    apply(chain.personalBuffs);
    apply(chain.teamBuffs);
    Object.values(chain.combatModes || {}).forEach((block) => {
      if (!block) return;
      apply(block.personalBuffs);
      apply(block.teamBuffs);
    });
  });
}

function stripFeixueLegacyXuexiuSplitBuffs(tpl) {
  if (!tpl) return;
  rewriteAllTemplateBuffLists(tpl, (list) =>
    list.filter((b) => !FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS.has(String(b?.templateKey || '')))
  );
}

/** 绯雪：同名【雪锈】+延奏；1–6 链倍率/增伤/暴伤写入对应链位；雪锈 6 链效果用 minResonance 挂在本体 */
function ensureFeixueTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== FEIXUE_CHAR_ID) return tpl;
  stripFeixueLegacyXuexiuSplitBuffs(tpl);
  // 补齐全队【雪锈】结构（保留用户已改 effects/value）
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(tpl.personalBuffs, FEIXUE_XUEXIU_KEY, createFeixueXuexiuBuffEntry);
  ensureTemplateListBuff(tpl.personalBuffs, 'feixue_guiren_multadd', () => ({
    "templateKey": "feixue_guiren_multadd",
    "category": "composite",
    "name": "锻雪·归刃",
    "mode": "stack",
    "maxStacks": 3,
    "clampStacks": true,
    "defaultActive": true,
    "defaultStacks": 0,
    "effects": [
      {
        "effectKey": "feixue_guiren_multadd",
        "zone": "multAdd",
        "valueMode": "stack",
        "value": 0,
        "segments": [
          {
            "upTo": 3,
            "perStack": 795.24
          }
        ],
        "skillScope": "names",
        "skillNames": [
          "预求我身·归刃",
          "预求我身·归刃基础"
        ],
        "librarySkillNames": [
          "预求我身·归刃基础"
        ],
        "minStacks": 0,
        "minResonance": 0
      }
    ],
    "gameText": "预求身期间施放预求我身·归刃，每消耗1点【锻雪·归刃】，该次攻击的伤害倍率增加795.24%。【锻雪·归刃】上限3点。\n模拟时可输入0～3的小数层数，例如1.25层；默认0层，由玩家填写本次消耗点数。"
  }));
  if (!Array.isArray(tpl.teamBuffs)) tpl.teamBuffs = [];
  ensureTemplateListBuff(tpl.teamBuffs, FEIXUE_XUEXIU_TEAM_KEY, createFeixueXuexiuTeamBuffEntry);
  const teamXuexiu = (tpl.teamBuffs || []).find(
    (b) => String(b?.templateKey || '') === FEIXUE_XUEXIU_TEAM_KEY
  );
  if (teamXuexiu) teamXuexiu.onlyCharacterIds = [...FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS];
  upsertAmisBodyTeamBuff(tpl, FEIXUE_OUTRO_ELEMENT_DEEP_KEY, createFeixueOutroElementDeepBuffEntry);
  upsertAmisChainPersonalBuff(
    tpl,
    1,
    FEIXUE_C1_YUQIU_MULT_KEY,
    createFeixueC1YuqiuMultBuffEntry,
    '预求身普攻/重击/空中/闪避反击倍率提升+120%'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    2,
    FEIXUE_C2_JUHE_MULT_KEY,
    createFeixueC2JuheMultBuffEntry,
    '普攻·居合倍率提升+125%'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    3,
    FEIXUE_C3_HEAVY_MULT_KEY,
    createFeixueC3HeavyMultBuffEntry,
    '重击·寒簇·常世身 / 枯霜·预求身倍率提升+160%'
  );
  upsertAmisChainTeamBuff(
    tpl,
    4,
    FEIXUE_C4_TEAM_BONUS_KEY,
    createFeixueC4TeamBonusBuffEntry,
    '全队造成伤害提升+20%'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    5,
    FEIXUE_C5_SKILL_MULT_KEY,
    createFeixueC5SkillMultBuffEntry,
    '共鸣技能·常世身 / 白玉切 / 落华倍率提升+80%'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    6,
    FEIXUE_C6_JIANXIN_CRIT_KEY,
    createFeixueC6JianxinCritBuffEntry,
    '预求我身·见心 / 归刃暴伤+500%；雪锈≥2/≥3 的 6 链加成见本体同名【雪锈】'
  );
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({}, FEIXUE_CHAR_ID);
  c6.personalBuffs = (c6.personalBuffs || []).filter(
    (b) => !FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS.has(String(b?.templateKey || ''))
  );
  c6.teamBuffs = (c6.teamBuffs || []).filter(
    (b) => !FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS.has(String(b?.templateKey || ''))
  );
  if (!String(c6.notes || '').trim()) {
    c6.notes =
      '内置：见心/归刃暴伤+500%；雪锈≥2层自身暴伤+40%、≥3层全队霜渐易伤+25%已并入本体同名【雪锈】（需6链）。';
  }
  tpl.resonanceChains['6'] = c6;
  if (!tpl.characterName) tpl.characterName = '绯雪';
  setTemplateNotesIfEmpty(
    tpl,
    '绯雪：同名叠层【雪锈】—个人≥1暴伤+40%、6链≥2暴伤再+40%；全队≥3霜渐加深+30%、6链≥3霜渐易伤+25%（层数同步；个人库仅同步绯雪/洛瑟菈/穗穗）；1–5/6链技能倍率与暴伤见对应链位；全队【绯雪·延奏】冷凝加深+20%（本人不生效）；雪锈≥2自动加入【绯雪·额外效应】（102%，3链+488%）。'
  );
  return tpl;
}

function isLingyangC5BuffEntry(buff) {
  if (!buff) return false;
  if (String(buff.templateKey || '') === LINGYANG_C5_BUFF_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name !== '余响' && name !== LINGYANG_C5_BUFF_NAME) return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'multAdd') return false;
    if (!(Number(fx.value) === 200 || Number(fx.perStack) === 200)) return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /狮子奋迅|俱足万行/.test(names);
  });
}

/** 凌阳：5 链 Buff 统一命名为【5链】（覆盖本机旧名「余响」） */
function ensureLingyangTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LINGYANG_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '凌阳';
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => {
        if (!isLingyangC5BuffEntry(b)) return;
        b.name = LINGYANG_C5_BUFF_NAME;
        if (!b.templateKey) b.templateKey = LINGYANG_C5_BUFF_KEY;
      });
      return list;
    });
  } else {
    const c5 = tpl.resonanceChains?.['5'];
    (c5?.personalBuffs || []).forEach((b) => {
      if (!isLingyangC5BuffEntry(b)) return;
      b.name = LINGYANG_C5_BUFF_NAME;
      if (!b.templateKey) b.templateKey = LINGYANG_C5_BUFF_KEY;
    });
  }
  return tpl;
}

function syncLingyangC5BuffNames(member) {
  if (!member || String(member.characterId) !== LINGYANG_CHAR_ID) return;
  const rename = (b) => {
    if (!isLingyangC5BuffEntry(b)) return;
    const next =
      typeof withManagedBuffSourcePrefix === 'function'
        ? withManagedBuffSourcePrefix(LINGYANG_C5_BUFF_NAME, '【本体】')
        : LINGYANG_C5_BUFF_NAME;
    b.name = next;
    if (!b.templateKey) b.templateKey = LINGYANG_C5_BUFF_KEY;
  };
  (member.buffs || []).forEach(rename);
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) => (round.buffs || []).forEach(rename));
  }
}

function isVerinaC6BuffEntry(buff) {
  if (!buff) return false;
  if (String(buff.templateKey || '') === VERINA_C6_BUFF_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name !== '余响' && name !== VERINA_C6_BUFF_NAME) return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'generalBonus') return false;
    if (Number(fx.value) !== 20) return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /星星花绽放/.test(names);
  });
}

function renameVerinaC6Buff(buff, opts) {
  if (!isVerinaC6BuffEntry(buff)) return;
  const bare = VERINA_C6_BUFF_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (!buff.templateKey) buff.templateKey = VERINA_C6_BUFF_KEY;
}

/** 维里奈：6 链 Buff 统一命名为【6链】（覆盖本机旧名「余响」） */
function ensureVerinaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== VERINA_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '维里奈';
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => renameVerinaC6Buff(b));
      return list;
    });
  } else {
    (tpl.resonanceChains?.['6']?.personalBuffs || []).forEach((b) => renameVerinaC6Buff(b));
  }
  return tpl;
}

function syncVerinaC6BuffNames(member) {
  if (!member || String(member.characterId) !== VERINA_CHAR_ID) return;
  (member.buffs || []).forEach((b) => renameVerinaC6Buff(b, { runtime: true }));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => renameVerinaC6Buff(b, { runtime: true }))
    );
  }
}

function isChunC6BuffEntry(buff) {
  if (!buff) return false;
  if (String(buff.templateKey || '') === CHUN_C6_BUFF_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name !== '余响' && name !== CHUN_C6_BUFF_NAME) return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'multBoost') return false;
    if (Number(fx.value) !== 150) return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /育种|红椿盛绽|蔓舞|永生花|酣梦/.test(names);
  });
}

function renameChunC6Buff(buff, opts) {
  if (!isChunC6BuffEntry(buff)) return;
  const bare = CHUN_C6_BUFF_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (!buff.templateKey) buff.templateKey = CHUN_C6_BUFF_KEY;
}

/** 椿：6 链 Buff 统一命名为【6链】；剥离已废弃的个人「天赋」 */
function ensureChunTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CHUN_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '椿';
  const isLegacyTalent = (b) => {
    if (!b) return false;
    if (CHUN_LEGACY_TALENT_KEYS.has(String(b.templateKey || ''))) return true;
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b.name)
        : String(b.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (name !== '天赋') return false;
    if (b.category === 'generalAttack' && Number(b.value) === 12) return true;
    if (b.category === 'generalCritDmg' && Number(b.value) === 16) return true;
    return false;
  };
  tpl.personalBuffs = (tpl.personalBuffs || []).filter((b) => !isLegacyTalent(b));
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => renameChunC6Buff(b));
      return list;
    });
  } else {
    (tpl.resonanceChains?.['6']?.personalBuffs || []).forEach((b) => renameChunC6Buff(b));
  }
  return tpl;
}

function syncChunC6BuffNames(member) {
  if (!member || String(member.characterId) !== CHUN_CHAR_ID) return;
  (member.buffs || []).forEach((b) => renameChunC6Buff(b, { runtime: true }));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => renameChunC6Buff(b, { runtime: true }))
    );
  }
}

function isLoseraEchoBianjiaoBuff(buff) {
  if (!buff) return false;
  if (String(buff.templateKey || '') === LOSERA_ECHO_BIANJIAO_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name !== '胶卷' && name !== LOSERA_ECHO_BIANJIAO_NAME) return false;
  return (
    buff.category === 'typeCritDmg' &&
    buff.damageType === '声骸' &&
    (buff.mode === 'stack' || Number(buff.perStack) > 0)
  );
}

/** 洛瑟菈：声骸模态【胶卷】统一改名为【变焦】 */
/** 洛瑟菈：全队【洛瑟菈·霜渐】冷凝抗性降低 8%（霜渐模态，对应霜渐效应伤害） */
function createLoseraTeamResReduceBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: LOSERA_TEAM_RES_REDUCE_KEY,
    category: 'elementResReduce',
    name: '洛瑟菈·全队·霜渐',
    mode: 'fixed',
    value: LOSERA_TEAM_RES_REDUCE_PCT,
    damageType: '',
    element: '冷凝',
    defenseKind: '',
    gameText: '处于共鸣模态·霜渐时，队伍中登场角色一定范围内的目标冷凝抗性降低8%，持续30秒。',
  });
}

function ensureLoseraTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== LOSERA_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '洛瑟菈';
  const renameList = (list) => {
    (list || []).forEach((b) => {
      if (!isLoseraEchoBianjiaoBuff(b)) return;
      b.name = LOSERA_ECHO_BIANJIAO_NAME;
      if (!b.templateKey) b.templateKey = LOSERA_ECHO_BIANJIAO_KEY;
    });
  };
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      renameList(list);
      return list;
    });
  } else {
    renameList(tpl.combatModes?.echo?.personalBuffs);
  }
  const echo = tpl.combatModes?.echo;
  if (echo) {
    const legacy = (echo.personalBuffs || []).filter(isLoseraEchoBianjiaoBuff);
    echo.personalBuffs = (echo.personalBuffs || []).filter((b) => !isLoseraEchoBianjiaoBuff(b));
    if (!Array.isArray(echo.teamBuffs)) echo.teamBuffs = [];
    if (!echo.teamBuffs.some(isLoseraEchoBianjiaoBuff) && legacy.length) echo.teamBuffs.push(legacy[0]);
    echo.teamBuffs.forEach((b) => {
      if (!isLoseraEchoBianjiaoBuff(b)) return;
      b.maxStacks = 4;
      b.clampStacks = true;
    });
  }
  // 全队【洛瑟菈·霜渐】冷凝抗性降低（对应霜渐效应伤害，自动同步特殊技能库）——仅霜渐模态
  if (!tpl.combatModes || typeof tpl.combatModes !== 'object') tpl.combatModes = {};
  if (!tpl.combatModes.frost || typeof tpl.combatModes.frost !== 'object') {
    tpl.combatModes.frost = {};
  }
  if (!Array.isArray(tpl.combatModes.frost.teamBuffs)) tpl.combatModes.frost.teamBuffs = [];
  ensureTemplateListBuff(
    tpl.combatModes.frost.teamBuffs,
    LOSERA_TEAM_RES_REDUCE_KEY,
    createLoseraTeamResReduceBuffEntry
  );
  // 本体 teamBuffs 不再注入该条（旧数据若有则移除，避免切模态后仍全局生效）
  if (Array.isArray(tpl.teamBuffs)) {
    tpl.teamBuffs = tpl.teamBuffs.filter(
      (b) => String(b?.templateKey || '') !== LOSERA_TEAM_RES_REDUCE_KEY
    );
  }
  // 移除霜渐模态个人重复条目「固有1·霜渐」：8% 冷凝减抗由全队条目承担，避免双倍计入
  if (Array.isArray(tpl.combatModes.frost.personalBuffs)) {
    tpl.combatModes.frost.personalBuffs = tpl.combatModes.frost.personalBuffs.filter(
      (b) =>
        !(
          b.category === 'elementResReduce' &&
          String(b.element || '') === '冷凝' &&
          /固有1·霜渐/.test(String(b.name || ''))
        )
    );
  }
  return tpl;
}

function syncLoseraEchoBianjiaoNames(member) {
  if (!member || String(member.characterId) !== LOSERA_CHAR_ID) return;
  const rename = (b) => {
    if (!isLoseraEchoBianjiaoBuff(b)) return;
    const next =
      typeof withManagedBuffSourcePrefix === 'function'
        ? withManagedBuffSourcePrefix(LOSERA_ECHO_BIANJIAO_NAME, '【本体】')
        : LOSERA_ECHO_BIANJIAO_NAME;
    b.name = next;
    if (!b.templateKey) b.templateKey = LOSERA_ECHO_BIANJIAO_KEY;
  };
  (member.buffs || []).forEach(rename);
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) => (round.buffs || []).forEach(rename));
  }
}

/** 剥离误加的珂莱塔 3 链致辞倍率（保留用户自建 Buff） */
function stripCarlottaLegacyC3OutroMult(tpl) {
  if (!tpl || String(tpl.characterId) !== '1107') return tpl;
  rewriteAllTemplateBuffLists(tpl, (list) =>
    list.filter((b) => String(b?.templateKey || '') !== CARLOTTA_LEGACY_C3_OUTRO_MULT_KEY)
  );
  const chain3 = tpl.resonanceChains?.['3'];
  if (chain3 && String(chain3.notes || '').includes('致辞】倍率加算')) chain3.notes = '';
  if (String(tpl.notes || '').includes('致辞】倍率加算')) {
    tpl.notes = '';
  }
  return tpl;
}

/** 分支面板已计入的【天赋】误加本体 Buff（相里要 / 渊武） */
const XIANGALIYAO_CHAR_ID = '1305';
const YUANWU_CHAR_ID = '1303';
const BRANCH_PANEL_DUP_TALENT_KEYS = new Set([
  // 相里要：攻12% / 暴伤16%
  'tpl_ms09vrgv_j517z',
  'tpl_ms09y8k5_tl8hb',
  // 渊武：防御15.2% / 导电12%
  'tpl_ms09d7vn_hn3wn',
  'tpl_ms09eeaa_8i2k6',
]);

function bareManagedBuffName(buff) {
  return typeof stripManagedBuffSourcePrefixes === 'function'
    ? stripManagedBuffSourcePrefixes(buff?.name)
    : String(buff?.name || '')
        .trim()
        .replace(/^【本体】\s*/u, '');
}

function isBranchPanelDuplicateTalentBuff(buff, charId) {
  if (!buff) return false;
  const id = String(charId || '');
  if (id !== XIANGALIYAO_CHAR_ID && id !== YUANWU_CHAR_ID) return false;
  const key = String(buff.templateKey || '');
  if (BRANCH_PANEL_DUP_TALENT_KEYS.has(key)) return true;
  if (bareManagedBuffName(buff) !== '天赋') return false;
  if (id === XIANGALIYAO_CHAR_ID) {
    if (buff.category === 'generalAttack' && Number(buff.value) === 12) return true;
    if (buff.category === 'generalCritDmg' && Number(buff.value) === 16) return true;
  }
  if (id === YUANWU_CHAR_ID) {
    if (buff.category === 'generalDefPct' && Number(buff.value) === 15.2) return true;
    if (
      buff.category === 'elementBonus' &&
      Number(buff.value) === 12 &&
      String(buff.element || '') === '导电'
    ) {
      return true;
    }
  }
  return false;
}

function stripBranchPanelDuplicateTalents(tpl) {
  if (!tpl) return tpl;
  const id = String(tpl.characterId || '');
  if (id !== XIANGALIYAO_CHAR_ID && id !== YUANWU_CHAR_ID) return tpl;
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) =>
      (list || []).filter((b) => !isBranchPanelDuplicateTalentBuff(b, id))
    );
  } else if (Array.isArray(tpl.personalBuffs)) {
    tpl.personalBuffs = tpl.personalBuffs.filter((b) => !isBranchPanelDuplicateTalentBuff(b, id));
  }
  return tpl;
}

function purgeBranchPanelDuplicateTalentBuffs(member) {
  if (!member) return;
  const id = String(member.characterId || '');
  if (id !== XIANGALIYAO_CHAR_ID && id !== YUANWU_CHAR_ID) return;
  member.buffs = (member.buffs || []).filter((b) => !isBranchPanelDuplicateTalentBuff(b, id));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) => {
      if (Array.isArray(round.buffs)) {
        round.buffs = round.buffs.filter((b) => !isBranchPanelDuplicateTalentBuff(b, id));
      }
    });
  }
}

/** @deprecated 兼容旧名 */
function stripXiangliYaoLegacyDuplicateTalents(tpl) {
  return stripBranchPanelDuplicateTalents(tpl);
}
/** @deprecated 兼容旧名 */
function purgeXiangliYaoLegacyDuplicateTalentBuffs(member) {
  return purgeBranchPanelDuplicateTalentBuffs(member);
}

/** 长离 0 链：分支面板 + 固有个人 Buff */
function createChangliInnate1LihuoBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_INNATE1_LIHUO_KEY,
    category: 'elementBonus',
    name: '长离·固有1·离火',
    mode: 'stack',
    value: 0,
    perStack: 5,
    maxStacks: 99,
    element: '热熔',
    damageType: '',
    defenseKind: '',
  });
}

function createChangliInnate2BuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_INNATE2_KEY,
    category: 'composite',
    name: '长离·固有2',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'elementBonus',
        valueMode: 'fixed',
        value: 20,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_LIHUO_SKILLS, ...CHANGLI_FENSHEN_SKILLS],
        skillNames: ['离火照丹心', '焚身以火', ...CHANGLI_LIHUO_SKILLS, ...CHANGLI_FENSHEN_SKILLS],
        damageType: '',
        element: '热熔',
        defenseKind: '',
        minStacks: 0,
      },
      {
        zone: 'generalDefense',
        valueMode: 'fixed',
        value: 15,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_LIHUO_SKILLS, ...CHANGLI_FENSHEN_SKILLS],
        skillNames: ['离火照丹心', '焚身以火', ...CHANGLI_LIHUO_SKILLS, ...CHANGLI_FENSHEN_SKILLS],
        damageType: '',
        element: '',
        defenseKind: 'pen',
        minStacks: 0,
      },
    ],
  });
}

function createChangliInnate2AttackBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_INNATE2_ATTACK_KEY,
    category: 'composite',
    name: '长离·固有2·焰羽攻击',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalAttack',
        valueMode: 'fixed',
        value: 25,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_FENSHEN_SKILLS],
        skillNames: ['焚身以火', ...CHANGLI_FENSHEN_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

function createChangliOutroBuffEntry() {
  const entry = normalizeTemplateBuffEntry({
    templateKey: CHANGLI_OUTRO_KEY,
    category: 'composite',
    name: '长离·延奏',
    mode: 'fixed',
    excludeSource: true,
    effects: [
      {
        zone: 'elementDeep',
        valueMode: 'fixed',
        value: 20,
        element: '热熔',
        damageType: '',
        defenseKind: '',
        minStacks: 0,
      },
      {
        zone: 'typeDeep',
        valueMode: 'fixed',
        value: 25,
        damageType: '共鸣解放',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
  entry.mode = 'fixed';
  entry.excludeSource = true;
  return entry;
}

function isChangliOutroBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === CHANGLI_OUTRO_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  return name === '长离·延奏';
}

/** 运行时：去掉旧延奏1/2，补齐新【长离·延奏】 */
function migrateChangliOutroSharedBuffs() {
  const shared = ensureTeamSharedBuffs();
  if (!Array.isArray(shared.buffs)) shared.buffs = [];
  shared.buffs = shared.buffs.filter((b) => {
    const key = String(b?.templateKey || '');
    if (CHANGLI_OUTRO_LEGACY_KEYS.has(key)) {
      if (b?.id) {
        delete shared.globalBuffActive[b.id];
        delete shared.globalBuffStacks[b.id];
      }
      return false;
    }
    const name =
      typeof stripManagedBuffSourcePrefixes === 'function'
        ? stripManagedBuffSourcePrefixes(b?.name)
        : String(b?.name || '')
            .trim()
            .replace(/^【本体】\s*/u, '');
    if (/^长离延奏[12]$/.test(name) || /^长离·延奏[12]$/.test(name)) {
      if (b?.id) {
        delete shared.globalBuffActive[b.id];
        delete shared.globalBuffStacks[b.id];
      }
      return false;
    }
    return true;
  });
  (state.members || []).forEach((m, mi) => {
    if (String(m?.characterId) !== CHANGLI_CHAR_ID) return;
    const has = (shared.buffs || []).some(
      (b) => isChangliOutroBuff(b) && getTeamBuffSourceMemberIndex(b) === mi
    );
    if (has) return;
    const hadChangliTemplate =
      (shared.buffs || []).some(
        (b) =>
          typeof isCharacterTemplateBuff === 'function' &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === mi
      ) ||
      (m.buffs || []).some(
        (b) => typeof isCharacterTemplateBuff === 'function' && isCharacterTemplateBuff(b)
      );
    if (!hadChangliTemplate) return;
    const tpl =
      typeof getCharacterBuffTemplate === 'function'
        ? getCharacterBuffTemplate(CHANGLI_CHAR_ID)
        : null;
    const entry = (tpl?.teamBuffs || []).find(
      (e) => String(e?.templateKey || '') === CHANGLI_OUTRO_KEY
    );
    if (!entry || typeof materializeTemplateBuff !== 'function') return;
    const buff = materializeTemplateBuff(entry, {
      characterId: CHANGLI_CHAR_ID,
      memberIndex: mi,
      scope: 'team',
    });
    shared.buffs.push(buff);
    invalidateSharedBuffsCache();
    if (shared.globalBuffActive[buff.id] === undefined) {
      shared.globalBuffActive[buff.id] = true;
    }
    if (buff.excludeSource) {
      const excl = ensureExcludedTeamBuffIds(m);
      if (!excl.includes(buff.id)) excl.push(buff.id);
    }
  });
}

function createChangliChain1SkillTypeBonusBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C1_SKILL_TYPE_BONUS_KEY,
    category: 'typeBonus',
    name: '长离·【1链】共鸣技能增伤',
    mode: 'fixed',
    value: 10,
    damageType: '共鸣技能',
    element: '',
    defenseKind: '',
  });
}

function createChangliChain2CritRateBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C2_CRIT_RATE_KEY,
    category: 'generalCritRate',
    name: '长离·【2链】泛用暴击',
    mode: 'fixed',
    value: 25,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createChangliChain3LihuoBonusBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C3_LIHUO_BONUS_KEY,
    category: 'composite',
    name: '长离·【3链】离火照丹心增伤',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalBonus',
        valueMode: 'fixed',
        value: 80,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_LIHUO_SKILLS],
        skillNames: ['离火照丹心', ...CHANGLI_LIHUO_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

function createChangliChain4TeamAtkBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C4_TEAM_ATK_KEY,
    category: 'generalAttack',
    name: '【4链·长离】',
    mode: 'fixed',
    value: 20,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createChangliChain5FenshenBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C5_FENSHEN_KEY,
    category: 'composite',
    name: '【5链】',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'multBoost',
        valueMode: 'fixed',
        value: 50,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_FENSHEN_SKILLS],
        skillNames: ['焚身以火', ...CHANGLI_FENSHEN_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
      {
        zone: 'generalBonus',
        valueMode: 'fixed',
        value: 50,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_FENSHEN_SKILLS],
        skillNames: ['焚身以火', ...CHANGLI_FENSHEN_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

function createChangliChain6DefensePenBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHANGLI_C6_DEFENSE_PEN_KEY,
    category: 'composite',
    name: '【6链】',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'typeDefense',
        valueMode: 'fixed',
        value: 40,
        skillScope: 'all',
        librarySkillNames: [],
        skillNames: [],
        damageType: '共鸣技能',
        element: '',
        defenseKind: 'pen',
        minStacks: 0,
      },
      {
        zone: 'generalDefense',
        valueMode: 'fixed',
        value: 40,
        skillScope: 'names',
        librarySkillNames: [...CHANGLI_LIHUO_SKILLS],
        skillNames: ['离火照丹心', ...CHANGLI_LIHUO_SKILLS],
        damageType: '',
        element: '',
        defenseKind: 'pen',
        minStacks: 0,
      },
    ],
  });
}

/**
 * 长离固有2拆分（2026-08-27 站长确认）：
 * 旧模板把「热熔+20% / 穿防+15%」（无条件）与「焚身以火 攻击+25%」（焰羽状态，独立开关）
 * 绑成同一个复合 buff。加载时若 changli_innate2 仍带 generalAttack 效果（含本机覆盖的旧形状），
 * 整体替换为两效果版；并确保独立攻击开关 changli_innate2_attack 存在（插在固有2之后）。
 */
function ensureChangliInnate2Split(tpl) {
  if (!tpl || String(tpl.characterId) !== CHANGLI_CHAR_ID) return tpl;
  const list = tpl.personalBuffs;
  if (!Array.isArray(list)) return tpl;
  const innIdx = list.findIndex((b) => String(b?.templateKey || '') === CHANGLI_INNATE2_KEY);
  if (innIdx >= 0) {
    const entry = list[innIdx];
    const hasLegacyAttack =
      Array.isArray(entry?.effects) && entry.effects.some((fx) => fx?.zone === 'generalAttack');
    if (hasLegacyAttack) {
      const fresh = createChangliInnate2BuffEntry();
      const kept = normalizeBuffGameText(entry?.gameText);
      list[innIdx] = normalizeTemplateBuffEntry({
        ...fresh,
        ...(kept ? { gameText: kept } : {}),
      });
    }
  }
  const hasAttack = list.some((b) => String(b?.templateKey || '') === CHANGLI_INNATE2_ATTACK_KEY);
  if (!hasAttack) {
    const entry = createChangliInnate2AttackBuffEntry();
    const bundled =
      typeof getBundledCharacterBuffTemplate === 'function'
        ? getBundledCharacterBuffTemplate(CHANGLI_CHAR_ID)
        : null;
    const bEntry = bundled
      ? (bundledEntryByChar.get(CHANGLI_CHAR_ID) || new Map()).get(CHANGLI_INNATE2_ATTACK_KEY)
      : null;
    if (bEntry) {
      const gt = normalizeBuffGameText(bEntry?.gameText);
      if (gt) entry.gameText = gt;
    }
    list.splice(innIdx >= 0 ? innIdx + 1 : list.length, 0, entry);
  }
  return tpl;
}

function ensureChangliTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CHANGLI_CHAR_ID) return tpl;
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) =>
      (list || []).filter((b) => {
        const key = String(b?.templateKey || '');
        if (CHANGLI_OUTRO_LEGACY_KEYS.has(key)) return false;
        const name =
          typeof stripManagedBuffSourcePrefixes === 'function'
            ? stripManagedBuffSourcePrefixes(b?.name)
            : String(b?.name || '').trim();
        return !/^长离延奏[12]$/.test(name) && !/^长离·延奏[12]$/.test(name);
      })
    );
  }
  upsertAmisBodyPersonalBuff(tpl, CHANGLI_INNATE1_LIHUO_KEY, createChangliInnate1LihuoBuffEntry);
  upsertAmisBodyPersonalBuff(tpl, CHANGLI_INNATE2_KEY, createChangliInnate2BuffEntry);
  ensureChangliInnate2Split(tpl);
  upsertForcedTeamBuffEntry(tpl, CHANGLI_OUTRO_KEY, createChangliOutroBuffEntry, CHANGLI_OUTRO_LEGACY_KEYS);
  upsertAmisChainPersonalBuff(
    tpl,
    1,
    CHANGLI_C1_SKILL_TYPE_BONUS_KEY,
    createChangliChain1SkillTypeBonusBuffEntry,
    '【1链】共鸣技能类型伤害提升+10%（固定）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    2,
    CHANGLI_C2_CRIT_RATE_KEY,
    createChangliChain2CritRateBuffEntry,
    '【2链】泛用暴击+25%（固定）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    3,
    CHANGLI_C3_LIHUO_BONUS_KEY,
    createChangliChain3LihuoBonusBuffEntry,
    '【3链】指定技能【离火照丹心】伤害提升+80%（固定）'
  );
  upsertAmisChainTeamBuff(
    tpl,
    4,
    CHANGLI_C4_TEAM_ATK_KEY,
    createChangliChain4TeamAtkBuffEntry,
    '【4链·长离】全队泛用攻击+20%（固定）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    5,
    CHANGLI_C5_FENSHEN_KEY,
    createChangliChain5FenshenBuffEntry,
    '【5链】指定技能【焚身以火】倍率提升+50%、泛用增伤+50%（固定）'
  );
  upsertAmisChainPersonalBuff(
    tpl,
    6,
    CHANGLI_C6_DEFENSE_PEN_KEY,
    createChangliChain6DefensePenBuffEntry,
    '【6链】共鸣技能类型穿防+40%、指定技能【离火照丹心】穿防+40%（固定）'
  );
  if (!tpl.characterName) tpl.characterName = '长离';
  const notesHint =
    '长离：0链分支攻击比12%、暴击率8%；固有1·离火热熔增伤叠层+5%/层；固有2指定【离火照丹心/焚身以火】热熔+20%、穿防+15%、指定【焚身以火】攻击+25%；全队【长离·延奏】热熔加深+20% + 共鸣解放加深+25%（对长离本人不生效）；1链共鸣技能类型增伤+10%；2链泛用暴击+25%；3链指定【离火照丹心】增伤+80%；4链全队泛用攻击+20%；5链指定【焚身以火】倍率提升+50%/泛用增伤+50%；6链共鸣技能穿防+40%/指定【离火照丹心】穿防+40%（均为固定）。';
  if (!String(tpl.notes || '').trim() || /延奏1热熔加深/.test(String(tpl.notes || ''))) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function createChixiaChain1HonghongCritBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: CHIXIA_C1_HONGHONG_CRIT_KEY,
    category: 'composite',
    name: '炽霞·【1链】轰轰暴击',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'critRateSet',
        valueMode: 'fixed',
        value: 100,
        skillScope: 'names',
        librarySkillNames: [...CHIXIA_HONGHONG_SKILLS],
        skillNames: ['轰轰', ...CHIXIA_HONGHONG_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
      },
    ],
  });
}

/** 炽霞：1链指定【轰轰】暴击率固定为100% */
function ensureChixiaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== CHIXIA_CHAR_ID) return tpl;
  upsertAmisChainPersonalBuff(
    tpl,
    1,
    CHIXIA_C1_HONGHONG_CRIT_KEY,
    createChixiaChain1HonghongCritBuffEntry,
    '【1链】指定技能【轰轰】暴击率固定为100%'
  );
  if (!tpl.characterName) tpl.characterName = '炽霞';
  if (!String(tpl.notes || '').trim()) {
    tpl.notes =
      '炽霞：0链分支攻击比12%、热熔伤害加成12%；1链指定技能【轰轰】暴击率固定为100%。';
  }
  return tpl;
}

function createMoningFieldDefBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: MONING_FIELD_DEF_KEY,
    category: 'generalDefPct',
    name: '强谐振场',
    mode: 'fixed',
    value: 20,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createMoningOffsetHarmonyEffBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: MONING_OFFSET_HARMONY_EFF_KEY,
    category: 'offsetHarmonyEff',
    name: '偏谐值累积效率',
    mode: 'fixed',
    value: MONING_OFFSET_HARMONY_EFF_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function createMoningC2OffsetHarmonyEffBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: MONING_C2_OFFSET_HARMONY_EFF_KEY,
    category: 'offsetHarmonyEff',
    name: '偏谐值累积效率·2链',
    mode: 'fixed',
    value: MONING_C2_OFFSET_HARMONY_EFF_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function isMoningOffsetHarmonyEffBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  if (
    key === MONING_OFFSET_HARMONY_EFF_KEY ||
    key === MONING_C2_OFFSET_HARMONY_EFF_KEY ||
    MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS.has(key)
  ) {
    return true;
  }
  return (
    (b.category === 'offsetHarmonyEff' || b.category === 'pianxieAccumEff') &&
    /偏谐值累积效率/.test(String(b.name || ''))
  );
}

/** 某角色是否仍覆盖指定 templateKey 的全队 Buff（未排除且镜像勾选开） */
function isTeamBuffTemplateCoveredOnMember(member, templateKey) {
  if (!member || !templateKey) return false;
  const shared = typeof ensureTeamSharedBuffs === 'function' ? ensureTeamSharedBuffs() : null;
  if (!shared?.buffs?.length) return false;
  const excluded = new Set(member.excludedTeamBuffIds || []);
  return (shared.buffs || []).some((tb) => {
    if (String(tb?.templateKey || '') !== String(templateKey)) return false;
    if (excluded.has(tb.id)) return false;
    const mirror = (member.buffs || []).find((x) => x.teamSourceId === tb.id);
    if (!mirror) return false;
    return member.globalBuffActive?.[mirror.id] !== false;
  });
}

function stripMoningLegacyOffsetHarmonyEffFromList(list) {
  if (!Array.isArray(list) || !list.length) return list || [];
  return list.filter((b) => {
    const key = String(b?.templateKey || '');
    if (MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS.has(key)) return false;
    // 旧名「莫宁·偏谐… / 2链·莫宁·偏谐…」且非正式键
    if (
      key !== MONING_OFFSET_HARMONY_EFF_KEY &&
      key !== MONING_C2_OFFSET_HARMONY_EFF_KEY &&
      /^(?:2链·)?莫宁·偏谐值累积效率/.test(String(b?.name || ''))
    ) {
      return false;
    }
    return true;
  });
}

/** 去掉共享库 / 角色镜像里的莫宁偏谐效率旧重复条目 */
function dedupeMoningOffsetHarmonyEffShared() {
  const shared = ensureTeamSharedBuffs();
  if (!shared?.buffs?.length) return;
  const dropIds = new Set();
  const seenCanonical = new Set();
  shared.buffs.forEach((b) => {
    if (!isMoningOffsetHarmonyEffBuff(b)) return;
    const key = String(b.templateKey || '');
    if (MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS.has(key) || key === 'pianxieAccumEff') {
      dropIds.add(b.id);
      return;
    }
    if (
      key !== MONING_OFFSET_HARMONY_EFF_KEY &&
      key !== MONING_C2_OFFSET_HARMONY_EFF_KEY &&
      /^(?:2链·)?莫宁·偏谐值累积效率/.test(String(b.name || ''))
    ) {
      dropIds.add(b.id);
      return;
    }
    const canon =
      key === MONING_C2_OFFSET_HARMONY_EFF_KEY
        ? MONING_C2_OFFSET_HARMONY_EFF_KEY
        : key === MONING_OFFSET_HARMONY_EFF_KEY
          ? MONING_OFFSET_HARMONY_EFF_KEY
          : '';
    if (!canon) return;
    if (seenCanonical.has(canon)) {
      dropIds.add(b.id);
      return;
    }
    seenCanonical.add(canon);
  });
  if (!dropIds.size) return;
  shared.buffs = shared.buffs.filter((b) => !dropIds.has(b.id));
  dropIds.forEach((id) => {
    delete shared.globalBuffActive[id];
    delete shared.globalBuffStacks[id];
  });
  (state.members || []).forEach((m) => {
    const mirrorIds = (m.buffs || [])
      .filter((b) => b.teamSourceId && dropIds.has(b.teamSourceId))
      .map((b) => b.id);
    if (!mirrorIds.length) return;
    const drop = new Set(mirrorIds);
    m.buffs = (m.buffs || []).filter((b) => !drop.has(b.id));
    mirrorIds.forEach((id) => purgeMemberBuffReferences(m, id, { allRounds: true }));
    if (Array.isArray(m.excludedTeamBuffIds)) {
      m.excludedTeamBuffIds = m.excludedTeamBuffIds.filter((id) => !dropIds.has(id));
    }
    if (Array.isArray(m.manuallyExcludedTeamBuffIds)) {
      m.manuallyExcludedTeamBuffIds = m.manuallyExcludedTeamBuffIds.filter((id) => !dropIds.has(id));
    }
  });
}

/** 队内有莫宁时，按各角色全队覆盖勾选写入偏谐值累积效率（0链+50%；≥2链再+20%） */
function syncMoningOffsetHarmonyEffToAllPanels() {
  const moning = (state.members || []).find((m) => String(m?.characterId) === MONING_CHAR_ID);
  const present = !!moning;
  const c2 =
    present && normalizeResonanceUnlocked(moning.resonanceUnlocked) >= 2;
  (state.members || []).forEach((member) => {
    if (!member?.char) return;
    const baseOn =
      present &&
      (isTeamBuffTemplateCoveredOnMember(member, MONING_OFFSET_HARMONY_EFF_KEY) ||
        isTeamBuffTemplateCoveredOnMember(member, 'moning_pianxie_accum_eff'));
    const c2On =
      c2 &&
      (isTeamBuffTemplateCoveredOnMember(member, MONING_C2_OFFSET_HARMONY_EFF_KEY) ||
        isTeamBuffTemplateCoveredOnMember(member, 'moning_c2_pianxie_accum_eff'));
    upsertCharKitPanelSource(
      member.char,
      'offsetHarmonyEffPct',
      MONING_OFFSET_HARMONY_PANEL_SOURCE_ID,
      '莫宁',
      baseOn ? MONING_OFFSET_HARMONY_EFF_PCT : 0
    );
    upsertCharKitPanelSource(
      member.char,
      'offsetHarmonyEffPct',
      MONING_C2_OFFSET_HARMONY_PANEL_SOURCE_ID,
      '莫宁·2链',
      c2On ? MONING_C2_OFFSET_HARMONY_EFF_PCT : 0
    );
  });
  syncEchoSetConvertedAttackValues();
}

/** 莫宁【临界协议】：超额共鸣效率 → 该技能暴击/暴伤（随面板同步） */
function computeMoningCriticalProtocolErBonus(energyRegenPct) {
  const er = Number(energyRegenPct);
  // 默认按基础共鸣效率 100%（与面板「基础」一致）
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const excess = Math.max(0, pct - MONING_CRITICAL_PROTOCOL_ER_THRESHOLD);
  return {
    er: pct,
    excess,
    critRate: Math.min(
      MONING_CRITICAL_PROTOCOL_CRIT_RATE_CAP,
      excess * MONING_CRITICAL_PROTOCOL_CRIT_RATE_PER_PCT
    ),
    critDmg: Math.min(
      MONING_CRITICAL_PROTOCOL_CRIT_DMG_CAP,
      excess * MONING_CRITICAL_PROTOCOL_CRIT_DMG_PER_PCT
    ),
  };
}

function isMoningCriticalProtocolErBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  if (key === MONING_CRITICAL_PROTOCOL_ER_KEY) return true;
  return String(b.name || '').includes('临界协议·共鸣效率');
}

function createMoningCriticalProtocolErBuffEntry(bonus) {
  const b = bonus || computeMoningCriticalProtocolErBonus(100);
  const skills = [...MONING_CRITICAL_PROTOCOL_SKILLS];
  return normalizeTemplateBuffEntry({
    templateKey: MONING_CRITICAL_PROTOCOL_ER_KEY,
    category: 'composite',
    name: '临界协议·共鸣效率',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalCritRate',
        valueMode: 'fixed',
        value: b.critRate,
        skillScope: 'names',
        librarySkillNames: ['临界协议·技能'],
        skillNames: skills,
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: MONING_CRITICAL_PROTOCOL_CRIT_RATE_EFFECT_KEY,
      },
      {
        zone: 'generalCritDmg',
        valueMode: 'fixed',
        value: b.critDmg,
        skillScope: 'names',
        librarySkillNames: ['临界协议·技能'],
        skillNames: skills,
        damageType: '',
        element: '',
        defenseKind: '',
        minStacks: 0,
        minResonance: 0,
        effectKey: MONING_CRITICAL_PROTOCOL_CRIT_DMG_EFFECT_KEY,
      },
    ],
  });
}

function upsertMoningCriticalProtocolErEffect(buff, effectKey, zone, value) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const skills = [...MONING_CRITICAL_PROTOCOL_SKILLS];
  const payload = {
    zone,
    valueMode: 'fixed',
    value,
    skillScope: 'names',
    librarySkillNames: ['临界协议·技能'],
    skillNames: skills,
    damageType: '',
    element: '',
    defenseKind: '',
    minStacks: 0,
    minResonance: 0,
    effectKey,
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 按当前共鸣效率刷新【临界协议·共鸣效率】指定技能暴击/暴伤 */
function syncMoningInnateErPanel(member) {
  if (!member || String(member.characterId) !== MONING_CHAR_ID || !member.char) return;
  upsertCharKitPanelSource(
    member.char,
    'energyRegenPct',
    MONING_INNATE_ER_PANEL_SOURCE_ID,
    '莫宁·固有',
    MONING_INNATE_ER_PCT
  );
}

function syncMoningCriticalProtocolErConvert(member) {
  if (!member) return;
  if (String(member.characterId) !== MONING_CHAR_ID) {
    const drop = (member.buffs || []).filter(isMoningCriticalProtocolErBuff);
    if (!drop.length) return;
    const ids = new Set(drop.map((b) => b.id));
    member.buffs = member.buffs.filter((b) => !ids.has(b.id));
    drop.forEach((b) => purgeMemberBuffReferences(member, b.id, { allRounds: true }));
    return;
  }
  const bonus = computeMoningCriticalProtocolErBonus(getMemberEnergyRegenPct(member));
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  let b = member.buffs.find(isMoningCriticalProtocolErBuff);
  if (!b) {
    b = normalizeBuff({
      id: genId(),
      ...createMoningCriticalProtocolErBuffEntry(bonus),
      sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    });
    member.buffs.unshift(b);
  } else {
    b.category = 'composite';
    b.mode = 'fixed';
    b.value = 0;
    b.perStack = 0;
    b.name = b.name || '临界协议·共鸣效率';
    b.templateKey = MONING_CRITICAL_PROTOCOL_ER_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    upsertMoningCriticalProtocolErEffect(
      b,
      MONING_CRITICAL_PROTOCOL_CRIT_RATE_EFFECT_KEY,
      'generalCritRate',
      bonus.critRate
    );
    upsertMoningCriticalProtocolErEffect(
      b,
      MONING_CRITICAL_PROTOCOL_CRIT_DMG_EFFECT_KEY,
      'generalCritDmg',
      bonus.critDmg
    );
  }
  member.globalBuffActive[b.id] = true;
  b._moningEnergyRegenPct = bonus.er;
  b._moningCriticalProtocolHint = `共鸣效率 ${bonus.er.toFixed(1)}%（超额 ${bonus.excess.toFixed(1)}%）→ 【临界协议】暴击+${bonus.critRate.toFixed(1)}%（每1%超额+${MONING_CRITICAL_PROTOCOL_CRIT_RATE_PER_PCT}%，上限${MONING_CRITICAL_PROTOCOL_CRIT_RATE_CAP}%）、暴伤+${bonus.critDmg.toFixed(1)}%（每1%超额+${MONING_CRITICAL_PROTOCOL_CRIT_DMG_PER_PCT}%，上限${MONING_CRITICAL_PROTOCOL_CRIT_DMG_CAP}%）`;
}


/** 莉莉：超过100%的整1%效率转指定三个技能双暴，数值同步但覆盖开关保留。 */
function syncLilyErCrit(member) {
  if (!member || String(member.characterId) !== '1512' || !CSF_MODE) return;
  const er = window.__WC.getMemberEnergyRegenPct(member);
  const steps = Math.floor(Math.max(0, er - 100) + 1e-9);
  const rate = Math.min(80, steps * 0.5), dmg = Math.min(160, steps);
  (member.buffs || []).forEach(b => {
    if (b.teamSourceId || b.templateKey !== 'lily_er_crit') return;
    (b.effects || []).forEach(effect => {
      if (effect.effectKey === 'lily_er_rate') effect.value = rate;
      if (effect.effectKey === 'lily_er_dmg') effect.value = dmg;
    });
    b._lilyErCritHint = '共鸣效率 ' + er.toFixed(2) + '% → 暴击+' + rate +
      '%、暴伤+' + dmg + '%（仅两种重击终结与永绽；超过100%后每满1%转化，260%封顶）';
  });
}

/** 干涉标记：莫宁共鸣效率超过100%的整1%转0.25%增伤，最多40%。 */
function syncMoningInterferenceMarkEr(member) {
  const { getMemberIndex, getMemberEnergyRegenPct, ensureTeamSharedBuffs,
    getTeamBuffSourceMemberIndex, ensureSpecialSkillsState } = window.__WC;
  if (!member || String(member.characterId) !== MONING_CHAR_ID) return;
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const er = getMemberEnergyRegenPct(member);
  const steps = Math.floor(Math.max(0, er - 100) + 1e-9);
  const bonus = Math.min(40, steps * 0.25);
  const shared = ensureTeamSharedBuffs();
  const sourceIds = new Set();
  const patch = b => {
    b.category = 'generalBonus';
    b.mode = 'fixed';
    b.value = bonus;
    b.perStack = 0;
    b._moningInterferenceMarkHint = '莫宁共鸣效率 ' + er.toFixed(1) +
      '% → 干涉标记增伤 +' + bonus + '%（超过100%后每满1%转0.25%，上限40%）';
  };
  (shared.buffs || []).forEach(b => {
    if (String(b.templateKey || '') !== 'tpl_mryv4mqi_pdcbl' ||
      getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    patch(b);
    sourceIds.add(b.id);
  });
  if (!sourceIds.size) return;
  const patchMirrors = buffs => (buffs || []).forEach(b => {
    if (b.teamSourceId && sourceIds.has(b.teamSourceId)) patch(b);
  });
  (state.members || []).forEach(m => {
    patchMirrors(m.buffs);
    (m.cycleConfig?.rounds || []).forEach(round => patchMirrors(round.buffs));
  });
  ensureSpecialSkillsState();
  (state.specialSkills?.characters || []).forEach(c => patchMirrors(c.buffs));
}

/** 莫宁 2 链：max(0, 效率−100) × 0.2%，上限 32% */
function computeMoningC2ErCritDmgPct(energyRegenPct) {
  const er = Number(energyRegenPct);
  const pct = Number.isFinite(er) && er > 0 ? er : 100;
  const excess = Math.max(0, pct - MONING_C2_ER_THRESHOLD);
  return {
    er: pct,
    excess,
    critDmg: Math.min(MONING_C2_CRIT_DMG_CAP, excess * MONING_C2_CRIT_DMG_PER_PCT),
  };
}

function isMoningC2ErCritDmgBuff(b) {
  if (!b) return false;
  const key = String(b.templateKey || '');
  return key === MONING_C2_ER_CRIT_DMG_KEY || MONING_C2_LEGACY_CRIT_DMG_KEYS.has(key);
}

function createMoningC2ErCritDmgBuffEntry(bonus) {
  const b = bonus || computeMoningC2ErCritDmgPct(100);
  return normalizeTemplateBuffEntry({
    templateKey: MONING_C2_ER_CRIT_DMG_KEY,
    category: 'generalCritDmg',
    name: '2链·莫宁·共鸣效率暴伤',
    mode: 'fixed',
    value: b.critDmg,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

/** 按莫宁面板共鸣效率刷新全队【2链·莫宁·共鸣效率暴伤】（需≥2链） */
function syncMoningC2ErCritDmg(member) {
  if (!member || String(member.characterId) !== MONING_CHAR_ID) return;
  const memberIndex = getMemberIndex(member);
  if (memberIndex == null || memberIndex < 0) return;
  const unlocked = normalizeResonanceUnlocked(member.resonanceUnlocked) >= 2;
  const bonus = computeMoningC2ErCritDmgPct(getMemberEnergyRegenPct(member));
  const cdPct = unlocked ? bonus.critDmg : 0;
  const shared = ensureTeamSharedBuffs();
  const hint = unlocked
    ? `共鸣效率 ${bonus.er.toFixed(1)}%（超额 ${bonus.excess.toFixed(1)}%）→ 全队暴伤 +${cdPct.toFixed(1)}%（每1%超额+${MONING_C2_CRIT_DMG_PER_PCT}%，上限${MONING_C2_CRIT_DMG_CAP}%）`
    : '需≥2链解锁；数值随莫宁共鸣效率面板同步';
  const patch = (b) => {
    if (!b) return;
    b.category = 'generalCritDmg';
    b.mode = 'fixed';
    b.value = cdPct;
    b.perStack = 0;
    b.damageType = '';
    b.name = '2链·莫宁·共鸣效率暴伤';
    b.templateKey = MONING_C2_ER_CRIT_DMG_KEY;
    b.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
    b._moningEnergyRegenPct = bonus.er;
    b._moningC2CritDmgHint = hint;
    delete b.effectType;
  };
  const sourceIds = new Set();
  (shared.buffs || []).forEach((b) => {
    if (!isMoningC2ErCritDmgBuff(b)) return;
    if (getTeamBuffSourceMemberIndex(b) !== memberIndex) return;
    patch(b);
    sourceIds.add(b.id);
  });
  if (!sourceIds.size) return;
  const patchMirrors = (buffs) => {
    (buffs || []).forEach((b) => {
      if (!b?.teamSourceId || !sourceIds.has(b.teamSourceId)) return;
      patch(b);
    });
  };
  (state.members || []).forEach((m) => {
    patchMirrors(m.buffs);
    (m.cycleConfig?.rounds || []).forEach((round) => patchMirrors(round.buffs));
  });
  ensureSpecialSkillsState();
  (state.specialSkills?.characters || []).forEach((c) => patchMirrors(c.buffs));
}

/** 莫宁：全队【强谐振场】；全队【偏谐值累积效率】；0链临界协议 ER 转双暴；2链全队 ER 转暴伤 + 偏谐额外；5链响应提升挂特殊技能 */
/** 莫宁5/6链从旧全队条目迁回本人；先迁覆盖，再让模板正常重建，避免 soft-clear 清掉旧勾选。 */
function migrateMoningSelfChainBuffs(member, shared) {
  if (String(member?.characterId) !== MONING_CHAR_ID) return;
  const keys = ['tpl_mryv7kv2_4cv4f', 'tpl_mryv86cz_z6xmn'];
  const index = window.__WC.getMemberIndex(member);
  const sources = shared.buffs.filter((b) => keys.includes(String(b.templateKey || '')) && window.__WC.getTeamBuffSourceMemberIndex(b) === index);
  const sourceIds = new Set(sources.map((b) => b.id));
  const ownerDefs = [member, ...(member.cycleConfig?.rounds || [])];
  ownerDefs.forEach((target) => (target.buffs || []).forEach((b) => {
    if (keys.includes(String(b.templateKey || '')) && b.teamSourceId &&
        !shared.buffs.some((source) => source.id === b.teamSourceId && window.__WC.getTeamBuffSourceMemberIndex(source) !== index)) sourceIds.add(b.teamSourceId);
  }));
  if (!sourceIds.size) return;
  keys.forEach((key) => {
    const source = sources.find((b) => b.templateKey === key);
    const old = ownerDefs.flatMap((target) => target.buffs || []).filter((b) => b.templateKey === key && (!b.teamSourceId || sourceIds.has(b.teamSourceId)));
    const previousPersonal = (member.buffs || []).find((b) => b.templateKey === key && !b.teamSourceId);
    const mirror = (member.buffs || []).find((b) => b.templateKey === key && sourceIds.has(b.teamSourceId));
    const base = previousPersonal || mirror || old[0] || source;
    if (!base) return;
    const id = makeTemplateBuffStableId({ templateKey: key, memberIndex: index, scope: 'personal' });
    const buff = window.__WC.normalizeBuff({ ...base, id, sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG, sourceCharacterId: MONING_CHAR_ID,
      name: window.__WC.withManagedBuffSourcePrefix(window.__WC.stripManagedBuffSourcePrefixes(base.name || ''), '【本体】') });
    delete buff.teamSourceId;
    delete buff.sourceMemberIndex;
    const fromIds = new Set(old.map((b) => b.id));
    if (source) fromIds.add(window.__WC.makeTeamMirrorBuffId(source.id));
    const previousId = previousPersonal?.id || mirror?.id || (source ? window.__WC.makeTeamMirrorBuffId(source.id) : undefined);
    const active = previousId && member.globalBuffActive?.[previousId] !== undefined
      ? member.globalBuffActive[previousId]
      : source ? shared.globalBuffActive[source.id] !== false &&
        ![...(member.excludedTeamBuffIds || []), ...(member.manuallyExcludedTeamBuffIds || [])].includes(source.id) : undefined;
    if (active !== undefined) member.globalBuffActive[id] = active;
    fromIds.forEach((fromId) => {
      window.__WC.remapMemberBuffReferences(member, fromId, id, { allRounds: true });
      // 当前轮快照有自己的 phases 副本，通用 remap 只处理顶层当前 phases。
      (member.cycleConfig?.rounds || []).forEach((round) => window.__WC.remapMemberBuffReferences({ phases: round.phases }, fromId, id));
    });
    ownerDefs.forEach((target) => {
      const matching = (b) => b.templateKey === key && (!b.teamSourceId || sourceIds.has(b.teamSourceId));
      const had = (target.buffs || []).some(matching);
      target.buffs = (target.buffs || []).filter((b) => !matching(b));
      if (target === member || had) target.buffs.push(JSON.parse(JSON.stringify(buff)));
    });
  });
  shared.buffs = shared.buffs.filter((b) => !sourceIds.has(b.id));
  sourceIds.forEach((id) => { delete shared.globalBuffActive[id]; delete shared.globalBuffStacks[id]; });
  window.__WC.invalidateSharedBuffsCache();
  (state.members || []).forEach((target) => {
    ['excludedTeamBuffIds', 'manuallyExcludedTeamBuffIds'].forEach((field) => {
      if (Array.isArray(target[field])) target[field] = target[field].filter((id) => !sourceIds.has(id));
    });
    if (target === member) return;
    const ids = new Set([target, ...(target.cycleConfig?.rounds || [])].flatMap((owner) => owner.buffs || [])
      .filter((b) => sourceIds.has(b.teamSourceId)).map((b) => b.id));
    target.buffs = (target.buffs || []).filter((b) => !sourceIds.has(b.teamSourceId));
    ids.forEach((id) => {
      window.__WC.purgeMemberBuffReferences(target, id, { allRounds: true });
      (target.cycleConfig?.rounds || []).forEach((round) => window.__WC.purgePhasesBuffReferences(round.phases, id));
    });
  });
  (state.specialSkills?.characters || []).forEach((target, slot) => {
    const ids = (target.buffs || []).filter((b) => sourceIds.has(b.teamSourceId)).map((b) => b.id);
    target.buffs = (target.buffs || []).filter((b) => !sourceIds.has(b.teamSourceId));
    ids.forEach((id) => {
      window.__WC.purgeMemberBuffReferences(target, id, { allRounds: true });
      window.__WC.purgeSpecialSkillItemBuffReferences(id, slot);
    });
  });
}

function ensureMoningTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== MONING_CHAR_ID) return tpl;
  if (Array.isArray(tpl.teamBuffs) || tpl.resonanceChains || tpl.combatModes) {
    rewriteAllTemplateBuffLists(tpl, (list) => stripMoningLegacyOffsetHarmonyEffFromList(list));
  }
  upsertAmisBodyTeamBuff(tpl, MONING_FIELD_DEF_KEY, createMoningFieldDefBuffEntry);
  upsertAmisBodyTeamBuff(tpl, MONING_OFFSET_HARMONY_EFF_KEY, createMoningOffsetHarmonyEffBuffEntry);
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  {
    const fresh = createMoningCriticalProtocolErBuffEntry();
    const pIdx = tpl.personalBuffs.findIndex(
      (b) => String(b?.templateKey || '') === MONING_CRITICAL_PROTOCOL_ER_KEY
    );
    if (pIdx >= 0) {
      tpl.personalBuffs[pIdx] = mergeTemplateBuffKeepGameText(tpl.personalBuffs[pIdx], fresh, {
        templateKey: MONING_CRITICAL_PROTOCOL_ER_KEY,
      });
    } else {
      tpl.personalBuffs.unshift(fresh);
    }
  }
  // 2 链全队：旧固定 +32% 改为共鸣效率转模；偏谐值累积效率额外 +20%
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  {
    const c2 = tpl.resonanceChains['2'] || normalizeChainBlock({}, MONING_CHAR_ID);
    if (!Array.isArray(c2.teamBuffs)) c2.teamBuffs = [];
    c2.teamBuffs = c2.teamBuffs.filter(
      (b) => !MONING_C2_LEGACY_CRIT_DMG_KEYS.has(String(b?.templateKey || ''))
    );
    const fresh = createMoningC2ErCritDmgBuffEntry();
    const idx = c2.teamBuffs.findIndex(
      (b) => String(b?.templateKey || '') === MONING_C2_ER_CRIT_DMG_KEY
    );
    if (idx >= 0) {
      c2.teamBuffs[idx] = mergeTemplateBuffKeepGameText(c2.teamBuffs[idx], fresh, {
        templateKey: MONING_C2_ER_CRIT_DMG_KEY,
      });
    } else {
      c2.teamBuffs.unshift(fresh);
    }
    const ohFresh = createMoningC2OffsetHarmonyEffBuffEntry();
    const ohIdx = c2.teamBuffs.findIndex(
      (b) => String(b?.templateKey || '') === MONING_C2_OFFSET_HARMONY_EFF_KEY
    );
    if (ohIdx >= 0) {
      c2.teamBuffs[ohIdx] = mergeTemplateBuffKeepGameText(c2.teamBuffs[ohIdx], ohFresh, {
        templateKey: MONING_C2_OFFSET_HARMONY_EFF_KEY,
      });
    } else {
      c2.teamBuffs.unshift(ohFresh);
    }
    if (
      !String(c2.notes || '').trim() ||
      !/共鸣效率/.test(String(c2.notes || '')) ||
      !/偏谐值累积效率/.test(String(c2.notes || ''))
    ) {
      c2.notes =
        '内置：全队【2链·莫宁·共鸣效率暴伤】—共鸣效率>100%时每超过1%→全队暴伤+0.2%（上限32%，随莫宁面板同步）；全队【偏谐值累积效率·2链】+20%（同步写入面板）。';
    }
    tpl.resonanceChains['2'] = c2;
  }
  // 临界协议5/6链只强化莫宁本人；旧本机模板同样从团队库迁回个人库。
  [[5, 'tpl_mryv7kv2_4cv4f'], [6, 'tpl_mryv86cz_z6xmn']].forEach(([chain, key]) => {
    const block = tpl.resonanceChains[String(chain)];
    if (!block) return;
    if (!Array.isArray(block.personalBuffs)) block.personalBuffs = [];
    const old = (block.teamBuffs || []).find((b) => b.templateKey === key);
    block.teamBuffs = (block.teamBuffs || []).filter((b) => b.templateKey !== key);
    if (old && !block.personalBuffs.some((b) => b.templateKey === key)) block.personalBuffs.push(old);
    block.personalBuffs.filter((b) => b.templateKey === key).forEach((b) => {
      b.onlyCharacterIds = [MONING_CHAR_ID];
      (b.effects || []).forEach((fx) => { fx.onlyCharacterIds = [MONING_CHAR_ID]; });
    });
  });
  // 旧版曾写入角色个人/链 Buff，改为特殊技能侧挂载后需清掉
  const c5 = tpl.resonanceChains?.['5'];
  if (c5 && Array.isArray(c5.personalBuffs)) {
    c5.personalBuffs = c5.personalBuffs.filter(
      (b) => String(b?.templateKey || '') !== MONING_C5_RESPONSE_BOOST_KEY
    );
    if (!c5.notes || String(c5.notes).includes('响应提升')) c5.notes = '';
  }
  if (!tpl.characterName) tpl.characterName = '莫宁';
  const notesHint =
    '固有：自身共鸣效率+10%（无条件，写入面板）。莫宁：全队【强谐振场】防御比+20%（固定）。全队【偏谐值累积效率】+50%（同步写入全员面板；2链再+20%）。0链【临界协议·共鸣效率】：共鸣效率>100%时每超过1%→该技能暴击+0.5%（上限80%）、暴伤+1%（上限160%），随面板同步。2链全队【共鸣效率暴伤】：每超过1%→全队暴伤+0.2%（上限32%，随面板同步）。5链时特殊技能【莫宁·响应震谐】自动挂【5链·响应提升】倍率提升+160%（固定）。';
  if (
    !String(tpl.notes || '').trim() ||
    !/固有/.test(String(tpl.notes || '')) ||
    !/临界协议/.test(String(tpl.notes || '')) ||
    !/偏谐值累积效率/.test(String(tpl.notes || '')) ||
    !/2链/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  return tpl;
}

function isJiabeilinaYuhuoBuff(buff) {
  if (!buff) return false;
  const name = String(buff.name || '');
  const key = String(buff.templateKey || '');
  return name.includes('余火') || /yuhuo/i.test(key);
}

function collectJiabeilinaYuhuoBaseSkillTargets(effects) {
  const libs = new Set();
  const names = new Set();
  (effects || []).forEach((fx) => {
    if (!fx || JIABEILINA_YUHUO_AUTO_EFFECT_KEYS.has(String(fx.effectKey || ''))) return;
    if (fx.skillScope !== 'names') return;
    (fx.librarySkillNames || []).forEach((n) => {
      const s = String(n || '').trim();
      if (s) libs.add(s);
    });
    (fx.skillNames || []).forEach((n) => {
      const s = String(n || '').trim();
      if (s) names.add(s);
    });
  });
  return {
    librarySkillNames: [...libs],
    skillNames: [...names],
  };
}

function upsertJiabeilinaYuhuoAutoEffect(buff, effectKey, payloadBase) {
  if (!Array.isArray(buff.effects)) buff.effects = [];
  const skills = collectJiabeilinaYuhuoBaseSkillTargets(buff.effects);
  const payload = {
    ...payloadBase,
    effectKey,
    skillScope: 'names',
    librarySkillNames: skills.librarySkillNames,
    skillNames: skills.skillNames.length ? skills.skillNames : [...skills.librarySkillNames],
    damageType: payloadBase.damageType || '',
    defenseKind: payloadBase.defenseKind || '',
    minStacks: Math.max(0, Math.round(Number(payloadBase.minStacks) || 0)),
  };
  const idx = buff.effects.findIndex((fx) => String(fx?.effectKey || '') === effectKey);
  if (idx >= 0) {
    const prevId = buff.effects[idx].id;
    buff.effects[idx] = normalizeCompositeEffect({ ...payload, id: prevId });
  } else {
    buff.effects.push(normalizeCompositeEffect(payload));
  }
}

/** 嘉贝莉娜【余火】：同 Buff 挂 1 链暴伤、6 链热熔加深（技能范围跟随其它指定技能） */
function ensureJiabeilinaYuhuoC1Effect(buff) {
  if (!isCompositeBuff(buff) || !isJiabeilinaYuhuoBuff(buff)) return buff;
  upsertJiabeilinaYuhuoAutoEffect(buff, JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY, {
    zone: 'generalCritDmg',
    valueMode: 'stack',
    value: 0,
    segments: [{ upTo: null, perStack: 2 }],
    element: '',
    minResonance: 1,
  });
  upsertJiabeilinaYuhuoAutoEffect(buff, JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY, {
    zone: 'elementDeep',
    valueMode: 'stack',
    value: 0,
    segments: [{ upTo: null, perStack: 0.875 }],
    element: '热熔',
    minResonance: 6,
  });
  syncCompositeBuffModeFromEffects(buff);
  return buff;
}

function isJiabeilinaC3UltMultBuff(buff) {
  if (!buff) return false;
  const key = String(buff.templateKey || '');
  if (key === JIABEILINA_C3_ULT_MULT_KEY || key === JIABEILINA_C3_ULT_MULT_LEGACY_KEY) return true;
  const name =
    typeof stripManagedBuffSourcePrefixes === 'function'
      ? stripManagedBuffSourcePrefixes(buff.name)
      : String(buff.name || '')
          .trim()
          .replace(/^【本体】\s*/u, '');
  if (name === JIABEILINA_C3_ULT_MULT_NAME) return true;
  if (name !== '余响') return false;
  const effects = Array.isArray(buff.effects) ? buff.effects : [];
  return effects.some((fx) => {
    if (fx?.zone !== 'multBoost') return false;
    if (!(Number(fx.value) === 130 || Number(fx.perStack) === 130)) return false;
    const names = [...(fx.librarySkillNames || []), ...(fx.skillNames || [])].join(' ');
    return /炼净/.test(names);
  });
}

function renameJiabeilinaC3UltMultBuff(buff, opts) {
  if (!isJiabeilinaC3UltMultBuff(buff)) return;
  const bare = JIABEILINA_C3_ULT_MULT_NAME;
  const runtime = !!opts?.runtime;
  buff.name =
    runtime && typeof withManagedBuffSourcePrefix === 'function'
      ? withManagedBuffSourcePrefix(bare, '【本体】')
      : bare;
  if (
    !buff.templateKey ||
    buff.templateKey === JIABEILINA_C3_ULT_MULT_LEGACY_KEY ||
    String(buff.templateKey).startsWith('tpl_')
  ) {
    buff.templateKey = JIABEILINA_C3_ULT_MULT_KEY;
  }
}

function createJiabeilinaNeiranshaoAtkBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: JIABEILINA_NEIRANSHAO_ATK_KEY,
    category: 'generalAttack',
    name: '内燃烧',
    mode: 'fixed',
    value: JIABEILINA_NEIRANSHAO_ATK_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
  });
}

function ensureJiabeilinaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== JIABEILINA_CHAR_ID) return tpl;
  if (!tpl.characterName) tpl.characterName = '嘉贝莉娜';
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  ensureTemplateListBuff(
    tpl.personalBuffs,
    JIABEILINA_NEIRANSHAO_ATK_KEY,
    createJiabeilinaNeiranshaoAtkBuffEntry
  );
  // 2 链【2链·内燃烧】：仅计「提升 350%」的额外泛攻（旧数据曾写成合计 90%）
  const c2block = tpl.resonanceChains['2'] || normalizeChainBlock({}, JIABEILINA_CHAR_ID);
  if (!Array.isArray(c2block.personalBuffs)) c2block.personalBuffs = [];
  const c2Idx = c2block.personalBuffs.findIndex(
    (b) =>
      String(b?.templateKey || '') === JIABEILINA_NEIRANSHAO_C2_KEY ||
      String(b?.name || '') === '2链·内燃烧'
  );
  if (c2Idx >= 0) {
    const b = c2block.personalBuffs[c2Idx];
    b.name = '2链·内燃烧';
    b.category = 'generalAttack';
    b.mode = 'fixed';
    if (Number(b.value) === 90 || !Number.isFinite(Number(b.value))) {
      b.value = JIABEILINA_NEIRANSHAO_C2_EXTRA_PCT;
    }
    if (!b.templateKey) b.templateKey = JIABEILINA_NEIRANSHAO_C2_KEY;
  } else {
    c2block.personalBuffs.unshift(
      normalizeTemplateBuffEntry({
        templateKey: JIABEILINA_NEIRANSHAO_C2_KEY,
        category: 'generalAttack',
        name: '2链·内燃烧',
        mode: 'fixed',
        value: JIABEILINA_NEIRANSHAO_C2_EXTRA_PCT,
        damageType: '',
        element: '',
        defenseKind: '',
        gameText: '内燃烧提供的攻击加成提升350%。',
      })
    );
  }
  tpl.resonanceChains['2'] = c2block;
  // 误挂在本体的「余响/3链大招倍率」迁到 3 链
  const misplaced = tpl.personalBuffs.filter(isJiabeilinaC3UltMultBuff);
  if (misplaced.length) {
    tpl.personalBuffs = tpl.personalBuffs.filter((b) => !isJiabeilinaC3UltMultBuff(b));
    const c3 = tpl.resonanceChains['3'] || normalizeChainBlock({}, JIABEILINA_CHAR_ID);
    if (!Array.isArray(c3.personalBuffs)) c3.personalBuffs = [];
    misplaced.forEach((b) => {
      renameJiabeilinaC3UltMultBuff(b);
      if (!c3.personalBuffs.some((x) => isJiabeilinaC3UltMultBuff(x))) c3.personalBuffs.unshift(b);
    });
    tpl.resonanceChains['3'] = c3;
  }
  if (typeof rewriteAllTemplateBuffLists === 'function') {
    rewriteAllTemplateBuffLists(tpl, (list) => {
      (list || []).forEach((b) => renameJiabeilinaC3UltMultBuff(b));
      return list;
    });
  } else {
    (tpl.resonanceChains['3']?.personalBuffs || []).forEach((b) => renameJiabeilinaC3UltMultBuff(b));
  }
  const c3block = tpl.resonanceChains['3'] || normalizeChainBlock({}, JIABEILINA_CHAR_ID);
  if (!Array.isArray(c3block.personalBuffs)) c3block.personalBuffs = [];
  const hasC3 = c3block.personalBuffs.some(isJiabeilinaC3UltMultBuff);
  if (!hasC3) {
    c3block.personalBuffs.unshift(
      normalizeTemplateBuffEntry({
        templateKey: JIABEILINA_C3_ULT_MULT_KEY,
        category: 'composite',
        name: JIABEILINA_C3_ULT_MULT_NAME,
        mode: 'fixed',
        value: 0,
        effects: [
          {
            zone: 'multBoost',
            valueMode: 'fixed',
            value: 130,
            skillScope: 'names',
            librarySkillNames: ['炼净·共鸣解放·炼净'],
            skillNames: ['炼净·共鸣解放·炼净', '共鸣解放·炼净'],
            damageType: '',
            element: '',
            defenseKind: '',
          },
        ],
      })
    );
  }
  if (!String(c3block.notes || '').trim() || /细则待定/.test(String(c3block.notes || ''))) {
    c3block.notes = '内置：【3链·大招倍率提升】共鸣解放·炼净倍率提升+130%';
  }
  tpl.resonanceChains['3'] = c3block;
  (tpl.personalBuffs || []).forEach((b) => ensureJiabeilinaYuhuoC1Effect(b));
  const notesHint = `【内燃烧】泛用攻击+${JIABEILINA_NEIRANSHAO_ATK_PCT}%；【余火】1链指定技能泛用暴伤+2%/层；6链指定技能热熔加深+0.875%/层（与本体同一Buff，分别需≥1/≥6链）；3链【3链·大招倍率提升】炼净倍率+130%。`;
  if (!tpl.notes || !String(tpl.notes).includes('余火')) {
    tpl.notes = notesHint;
  } else if (!/【内燃烧】泛用攻击/.test(String(tpl.notes || ''))) {
    tpl.notes = `【内燃烧】泛用攻击+${JIABEILINA_NEIRANSHAO_ATK_PCT}%；${String(tpl.notes).trim()}`;
  } else if (!/3链·大招倍率提升/.test(String(tpl.notes || ''))) {
    tpl.notes = `${String(tpl.notes).trim().replace(/；$/, '')}；3链【3链·大招倍率提升】炼净倍率+130%`;
  } else if (!String(tpl.notes).includes('0.875')) {
    tpl.notes = `${tpl.notes}；6链指定技能热熔加深+0.875%/层（≥6链）`;
  }
  return tpl;
}

function syncJiabeilinaC3UltMultBuffNames(member) {
  if (!member || String(member.characterId) !== JIABEILINA_CHAR_ID) return;
  (member.buffs || []).forEach((b) => renameJiabeilinaC3UltMultBuff(b, { runtime: true }));
  if (member.cycleConfig?.enabled && Array.isArray(member.cycleConfig.rounds)) {
    member.cycleConfig.rounds.forEach((round) =>
      (round.buffs || []).forEach((b) => renameJiabeilinaC3UltMultBuff(b, { runtime: true }))
    );
  }
}

function isAmisModeBuff(b) {
  return !!b && b.sourceTag === AMIS_MODE_BUFF_SOURCE_TAG;
}

function isCharKitPanelSource(item) {
  const id = String(item?.id || '');
  if (id.startsWith(CHAR_KIT_PANEL_PREFIX)) return true;
  // 克隆后 id 被改写：仍按锁定托管显示名识别，便于 clear/sanitize
  if (!item?.locked) return false;
  const name = String(item?.name || '').trim();
  return (
    name === '分支' ||
    name === '1链' ||
    name === '莫宁' ||
    name === '莫宁·2链' ||
    name === '阳变阴合' ||
    /（默认）$/.test(name)
  );
}

function upsertCharKitPanelSource(char, statKey, sourceId, name, value, extra) {
  if (!char) return;
  const key = charStatSourcesKey(statKey);
  if (!char[key]) char[key] = [];
  const v = Number(value) || 0;
  const idx = char[key].findIndex((s) => s.id === sourceId);
  if (v <= 0) {
    if (idx >= 0) char[key].splice(idx, 1);
    return;
  }
  const payload = {
    id: sourceId,
    name,
    value: v,
    locked: true,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
  if (idx >= 0) {
    Object.assign(char[key][idx], payload);
  } else {
    char[key].push(payload);
  }
}

function clearCharKitPanelSources(char) {
  if (!char) return;
  const kitOrphanNames = new Set(['分支', '1链', '莫宁', '莫宁·2链', '阳变阴合', '守岸人·固有2']);
  ['atkPercent', 'critRate', 'critDmg', 'attrBonus', 'hpPercent', 'defPercent', 'offsetHarmonyEffPct', 'flatAtk', 'energyRegenPct'].forEach(
    (statKey) => {
      const key = charStatSourcesKey(statKey);
      if (!Array.isArray(char[key])) return;
      char[key] = char[key].filter((s) => {
        if (isCharKitPanelSource(s)) return false;
        const name = String(s?.name || '').trim();
        const id = String(s?.id || '');
        if (kitOrphanNames.has(name) && !id.startsWith(CHAR_KIT_PANEL_PREFIX)) return false;
        if (/（默认）$/.test(name) && !id.startsWith(CHAR_KIT_PANEL_PREFIX)) return false;
        return true;
      });
    }
  );
}

/** 从技能库 branchPanel（抓取）或内置 CHAR_BRANCH_PANEL_BY_ID 解析分支面板 */
function resolveCharBranchPanelDef(charId) {
  const id = String(charId || '');
  if (!id) return null;
  const hardcoded = CHAR_BRANCH_PANEL_BY_ID[id] || null;
  const fromDb = findCharSkillDef(id)?.branchPanel || null;
  // 已手填内置表的角色：优先内置，避免库内抓取覆盖
  const preferHardcoded = !!hardcoded;
  const pick = (dbVal, hardVal) => {
    if (preferHardcoded && Number(hardVal) > 0) return Number(hardVal) || 0;
    if (Number(dbVal) > 0) return Number(dbVal) || 0;
    return Number(hardVal) || 0;
  };
  const atkPct = pick(fromDb?.atkPct, hardcoded?.atkPct);
  const critRatePct = pick(fromDb?.critRatePct, hardcoded?.critRatePct);
  const critDmgPct = pick(fromDb?.critDmgPct, hardcoded?.critDmgPct);
  const hpPct = pick(fromDb?.hpPct, hardcoded?.hpPct);
  const defPct = pick(fromDb?.defPct, hardcoded?.defPct);
  const healPct = pick(fromDb?.healPct, hardcoded?.healPct);
  const attrPct = pick(fromDb?.attrPct, hardcoded?.attrPct);
  let attrElement = preferHardcoded
    ? String(hardcoded?.attrElement || fromDb?.attrElement || '').trim()
    : String(fromDb?.attrElement || hardcoded?.attrElement || '').trim();
  if (attrElement === '湫灭') attrElement = '湮灭';
  if (
    atkPct <= 0 &&
    critRatePct <= 0 &&
    critDmgPct <= 0 &&
    hpPct <= 0 &&
    defPct <= 0 &&
    healPct <= 0 &&
    attrPct <= 0
  ) {
    return null;
  }
  return {
    atkSourceId: hardcoded?.atkSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_atk`,
    critRateSourceId: hardcoded?.critRateSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_crit_rate`,
    critDmgSourceId: hardcoded?.critDmgSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_crit_dmg`,
    hpSourceId: hardcoded?.hpSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_hp`,
    defSourceId: hardcoded?.defSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_def`,
    attrSourceId: hardcoded?.attrSourceId || `${CHAR_KIT_PANEL_PREFIX}${id}_branch_attr`,
    atkPct,
    critRatePct,
    critDmgPct,
    hpPct,
    defPct,
    healPct,
    attrPct,
    attrElement,
  };
}

/** 仇远 1 链：面板暴击 +20%；取消 1 链（链数 < 1）时移除 */
function syncChouyuanC1CritPanel(member) {
  if (!member?.char) return;
  if (String(member.characterId) !== CHOUYUAN_CHAR_ID) {
    upsertCharKitPanelSource(member.char, 'critRate', CHOUYUAN_C1_CRIT_RATE_SOURCE_ID, '1链', 0);
    return;
  }
  const on = normalizeResonanceUnlocked(member.resonanceUnlocked) >= 1;
  upsertCharKitPanelSource(
    member.char,
    'critRate',
    CHOUYUAN_C1_CRIT_RATE_SOURCE_ID,
    '1链',
    on ? CHOUYUAN_C1_CRIT_RATE_PCT : 0
  );
}

/** 角色固定面板：分支攻击比 / 暴击 / 暴伤 / 生命 / 防御 / 属性加成（优先技能库抓取，手填内置优先） */
function syncCharBranchPanelSources(member) {
  if (!member?.char) return;
  clearCharKitPanelSources(member.char);
  const def = resolveCharBranchPanelDef(member.characterId);
  if (def) {
    if (def.atkSourceId && Number(def.atkPct) > 0) {
      upsertCharKitPanelSource(member.char, 'atkPercent', def.atkSourceId, '分支', def.atkPct);
    }
    if (def.critRateSourceId && Number(def.critRatePct) > 0) {
      upsertCharKitPanelSource(member.char, 'critRate', def.critRateSourceId, '分支', def.critRatePct);
    }
    if (def.critDmgSourceId && Number(def.critDmgPct) > 0) {
      upsertCharKitPanelSource(member.char, 'critDmg', def.critDmgSourceId, '分支', def.critDmgPct);
    }
    if (def.hpSourceId && Number(def.hpPct) > 0) {
      upsertCharKitPanelSource(member.char, 'hpPercent', def.hpSourceId, '分支', def.hpPct);
    }
    if (def.defSourceId && Number(def.defPct) > 0) {
      upsertCharKitPanelSource(member.char, 'defPercent', def.defSourceId, '分支', def.defPct);
    }
    if (def.attrSourceId && Number(def.attrPct) > 0) {
      const el = String(def.attrElement || '').trim();
      upsertCharKitPanelSource(member.char, 'attrBonus', def.attrSourceId, '分支', def.attrPct, {
        element: el || undefined,
      });
    }
  }
  // 分支清空后补挂：仇远 1 链面板暴击（无分支表时也要生效）
  syncChouyuanC1CritPanel(member);
}

function clearAmisModeBuffs(member) {
  if (!member || !Array.isArray(member.buffs)) return;
  const removeIds = member.buffs.filter(isAmisModeBuff).map((b) => b.id);
  if (!removeIds.length) return;
  const idSet = new Set(removeIds);
  member.buffs = member.buffs.filter((b) => !idSet.has(b.id));
  removeIds.forEach((id) => purgeMemberBuffReferences(member, id, { allRounds: true }));
}

function upsertAmisModeBuff(member, templateKey, factory) {
  if (!member) return null;
  if (!Array.isArray(member.buffs)) member.buffs = [];
  if (!member.globalBuffActive) member.globalBuffActive = {};
  if (!member.globalBuffStacks) member.globalBuffStacks = {};
  const prepared = factory();
  let b = member.buffs.find((x) => isAmisModeBuff(x) && x.templateKey === templateKey);
  const keptGameText = normalizeBuffGameText(b?.gameText);
  let lookedGameText = '';
  if (!keptGameText && typeof getCharacterBuffTemplate === 'function') {
    const tpl = getCharacterBuffTemplate(AMIS_CHAR_ID);
    const hit = tpl ? findTemplateBuffEntryByKey(tpl, templateKey) : null;
    lookedGameText = normalizeBuffGameText(hit?.entry?.gameText);
    // 两条固有2共用一份原文案
    if (!lookedGameText && isAmisInnate2TemplateKey(templateKey)) {
      const altKey =
        templateKey === AMIS_INNATE2_CRIT_KEY ? AMIS_INNATE2_DEEP_KEY : AMIS_INNATE2_CRIT_KEY;
      const alt = tpl ? findTemplateBuffEntryByKey(tpl, altKey) : null;
      lookedGameText = normalizeBuffGameText(alt?.entry?.gameText);
    }
  }
  const gameText = keptGameText || lookedGameText;
  if (!b) {
    b = normalizeBuff({
      ...prepared,
      id: genId(),
      sourceTag: AMIS_MODE_BUFF_SOURCE_TAG,
      templateKey,
      ...(gameText ? { gameText } : {}),
    });
    member.buffs.push(b);
  } else {
    const keptId = b.id;
    const next = normalizeBuff({
      ...prepared,
      id: keptId,
      sourceTag: AMIS_MODE_BUFF_SOURCE_TAG,
      templateKey,
      ...(gameText ? { gameText } : {}),
    });
    Object.keys(b).forEach((k) => {
      if (!(k in next)) delete b[k];
    });
    Object.assign(b, next);
  }
  if (gameText) b.gameText = gameText;
  else delete b.gameText;
  member.globalBuffActive[b.id] = true;
  if (isStackBuff(b) && member.globalBuffStacks[b.id] === undefined) {
    member.globalBuffStacks[b.id] = 0;
  }
  return b;
}

function createAmisInnate2CritBuff(perStack) {
  return {
    category: 'generalCritDmg',
    name: '固有2',
    mode: 'stack',
    value: 0,
    perStack: Number(perStack) || 0,
    maxStacks: 99,
    damageType: '',
    element: '',
    defenseKind: '',
  };
}

function createAmisInnate2FinaleDeepBuff() {
  return {
    category: 'composite',
    name: '固有2',
    mode: 'fixed',
    value: 0,
    effects: [
      {
        zone: 'generalDeep',
        valueMode: 'fixed',
        value: 25,
        skillScope: 'names',
        librarySkillNames: [...AMIS_C3_STAR_FINALE_SKILLS],
        skillNames: ['星辉破界而来·终结', ...AMIS_C3_STAR_FINALE_SKILLS],
        damageType: '',
        element: '',
        defenseKind: '',
      },
    ],
  };
}

/**
 * 爱弥斯 0 链本体：固定面板分支 + 按战斗模态写入固有2
 * 震谐：泛用暴伤叠层 20%/层（全覆盖）+ 星辉终结加深 25%
 * 聚爆：泛用暴伤叠层 30%/层（全覆盖）+ 星辉终结加深 25%
 */
function syncAmisCombatModeKit(member) {
  if (!member) return;
  syncCharBranchPanelSources(member);
  if (String(member.characterId) !== AMIS_CHAR_ID) {
    clearAmisModeBuffs(member);
    return;
  }
  const mode = member.combatMode;
  if (mode !== 'shock' && mode !== 'burst') {
    clearAmisModeBuffs(member);
    return;
  }
  const critPerStack = mode === 'burst' ? 30 : 20;
  const keep = new Set([AMIS_INNATE2_CRIT_KEY, AMIS_INNATE2_DEEP_KEY]);
  (member.buffs || [])
    .filter((b) => isAmisModeBuff(b) && !keep.has(b.templateKey))
    .slice()
    .forEach((b) => {
      member.buffs = member.buffs.filter((x) => x.id !== b.id);
      purgeMemberBuffReferences(member, b.id, { allRounds: true });
    });
  upsertAmisModeBuff(member, AMIS_INNATE2_CRIT_KEY, () => createAmisInnate2CritBuff(critPerStack));
  upsertAmisModeBuff(member, AMIS_INNATE2_DEEP_KEY, createAmisInnate2FinaleDeepBuff);
  normalizeMemberBuffKeys(member);
}

function createAugustaOutroGeneralDeepBuffEntry() {
  return normalizeTemplateBuffEntry({
    templateKey: AUGUSTA_OUTRO_GENERAL_DEEP_KEY,
    category: 'generalDeep',
    name: '奥古斯塔·延奏',
    mode: 'fixed',
    value: AUGUSTA_OUTRO_GENERAL_DEEP_PCT,
    damageType: '',
    element: '',
    defenseKind: '',
    excludeSource: true,
  });
}

function ensureAugustaTemplateShape(tpl) {
  if (!tpl || String(tpl.characterId) !== AUGUSTA_CHAR_ID) return tpl;
  tpl.specialMechanics = normalizeAugustaSpecialMechanics(tpl.specialMechanics);
  const mech = tpl.specialMechanics;
  upsertAmisBodyTeamBuff(tpl, AUGUSTA_OUTRO_GENERAL_DEEP_KEY, createAugustaOutroGeneralDeepBuffEntry);
  if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();

  // 【以众愿为冕】迁至本体；清掉旧版挂在各层上的同 key
  rewriteAllTemplateBuffLists(tpl, (list) =>
    list.filter((b) => String(b?.templateKey || '') !== mech.stackTemplateKey)
  );
  if (!Array.isArray(tpl.personalBuffs)) tpl.personalBuffs = [];
  const crownFresh = createAugustaSpecialStackBuffEntry(mech);
  const crownIdx = tpl.personalBuffs.findIndex((b) => b?.templateKey === mech.stackTemplateKey);
  if (crownIdx >= 0) {
    tpl.personalBuffs[crownIdx] = mergeTemplateBuffKeepGameText(
      tpl.personalBuffs[crownIdx],
      crownFresh,
      { templateKey: mech.stackTemplateKey }
    );
  } else {
    tpl.personalBuffs.unshift(crownFresh);
  }

  const c1 = tpl.resonanceChains['1'] || normalizeChainBlock({});
  if (!String(c1.notes || '').trim() || /细则待定/.test(String(c1.notes || ''))) {
    c1.notes =
      '内置：【以众愿为冕】上限→2，每层额外暴伤+15%（已写入本体同名 Buff，≥1链生效）；变奏可叠层 / 共鸣技能免疫打断不计入伤害。';
  }
  tpl.resonanceChains['1'] = c1;

  const c2 = tpl.resonanceChains['2'] || normalizeChainBlock({});
  if (!String(c2.notes || '').trim() || /特殊层数/.test(String(c2.notes || '')) || /细则待定/.test(String(c2.notes || ''))) {
    c2.notes =
      '内置：【以众愿为冕】每层暴击+20%（本体同名 Buff，≥2链）+ 暴击超100%溢出转化暴伤（专属机制）。';
  }
  tpl.resonanceChains['2'] = c2;

  upsertAmisChainPersonalBuff(
    tpl,
    3,
    AUGUSTA_C3_MULT_BOOST_KEY,
    createAugustaC3MultBoostBuffEntry,
    `指定技能倍率提升+${AUGUSTA_C3_MULT_BOOST_PCT}%（烁雷后撤/旋切/升拳、落袭、赫日威临·烈阳/不朽者之肃）`
  );

  upsertAmisChainTeamBuff(
    tpl,
    4,
    AUGUSTA_C4_TEAM_ATK_KEY,
    createAugustaC4TeamAtkBuffEntry,
    `变奏后全队攻击+${AUGUSTA_C4_TEAM_ATK_PCT}%`
  );

  const c5 = tpl.resonanceChains['5'] || normalizeChainBlock({});
  if (!String(c5.notes || '').trim() || /细则待定/.test(String(c5.notes || ''))) {
    c5.notes = '固有·荣誉的加护护盾量+50%（非伤害 Buff，不计入计算器）。';
  }
  tpl.resonanceChains['5'] = c5;

  const c6 = tpl.resonanceChains['6'] || normalizeChainBlock({});
  if (!Array.isArray(c6.extraSkills)) c6.extraSkills = [];
  const nutingFresh = createAugustaC6NutingExtraSkillEntry();
  const nutingIdx = c6.extraSkills.findIndex((e) => e?.templateKey === AUGUSTA_C6_NUTING_SKILL_KEY);
  if (nutingIdx >= 0) {
    c6.extraSkills[nutingIdx] = normalizeTemplateExtraSkillEntry({
      ...nutingFresh,
      templateKey: AUGUSTA_C6_NUTING_SKILL_KEY,
      name: c6.extraSkills[nutingIdx].name || nutingFresh.name,
    });
  } else {
    c6.extraSkills.unshift(nutingFresh);
  }
  if (!String(c6.notes || '').trim() || /特殊层数/.test(String(c6.notes || '')) || /细则待定/.test(String(c6.notes || ''))) {
    c6.notes =
      `内置：【以众愿为冕】上限→4 + 暴击超150%额外溢出转化暴伤（专属机制）；额外技能【怒霆】重击 ${AUGUSTA_C6_NUTING_BASE_MULT}%（两次各100%合计）。`;
  }
  tpl.resonanceChains['6'] = c6;

  const notesHint =
    `奥古斯塔：全队【奥古斯塔·延奏】泛用加深+${AUGUSTA_OUTRO_GENERAL_DEEP_PCT}%（固定；对奥古斯塔本人不生效）。本体【以众愿为冕】叠层：导电+${AUGUSTA_CROWN_ELECTRO_PER_STACK}%/层；≥1链暴伤+${AUGUSTA_CROWN_CRIT_DMG_PER_STACK}%/层；≥2链暴击（专属面板）+ 溢出暴击→暴伤转化。3链指定倍率+${AUGUSTA_C3_MULT_BOOST_PCT}%；4链全队攻击+${AUGUSTA_C4_TEAM_ATK_PCT}%；6链【怒霆】+层数/转化上限。`;
  if (
    !String(tpl.notes || '').trim() ||
    !/以众愿为冕/.test(String(tpl.notes || '')) ||
    /留给协作编辑/.test(String(tpl.notes || ''))
  ) {
    tpl.notes = notesHint;
  }
  if (!tpl.characterName) tpl.characterName = '奥古斯塔';
  return tpl;
}

function getAugustaSpecialMechanicsForMember(member) {
  const charId = String(member?.characterId || '').trim();
  if (charId !== AUGUSTA_CHAR_ID) return null;
  const tpl = getCharacterBuffTemplate(charId);
  return normalizeAugustaSpecialMechanics(tpl?.specialMechanics);
}

  /* ===== P5-4: 特判注册表（[predicate, handler] 二元组）— D4rk 建议 + V4pro P4 阶段3 =====
   * predicate: (member) => boolean；getMechanics: (member) => specialMechanics | null
   * 仅登记「代码级机制特判」角色（有 getXxxSpecialMechanicsForMember 引擎函数，kind:'code'）；
   * 数据/模板驱动角色（kind:'data'）特判走 buff 模板管线，不入引擎分发。
   * 新角色加入 SPECIAL_CHAR_IDS 时必须同步本表（缺失会在实际命中时告警一次，勿删）。 */
  var SPECIAL_HANDLERS = [
    { key: 'brant', kind: 'code', predicate: function (m) { return String((m && m.characterId) || '') === BRANT_CHAR_ID; }, getMechanics: getBrantSpecialMechanicsForMember },
    { key: 'augusta', kind: 'code', predicate: function (m) { return String((m && m.characterId) || '') === AUGUSTA_CHAR_ID; }, getMechanics: getAugustaSpecialMechanicsForMember },
    { key: 'shorekeeper', kind: 'data' },
    { key: 'lupa', kind: 'data' },
    { key: 'yuno', kind: 'data' },
    { key: 'chouyuan', kind: 'data' },
    { key: 'cantarella', kind: 'data' },
    { key: 'rococo', kind: 'data' },
    { key: 'suishui', kind: 'data' },
    { key: 'dania', kind: 'data' },
    { key: 'zanni', kind: 'data' },
  ];
  function getSpecialMechanicsForMember(member) {
    if (!member) return null;
    for (var i = 0; i < SPECIAL_HANDLERS.length; i++) {
      var h = SPECIAL_HANDLERS[i];
      if (h.kind === 'code' && h.predicate(member)) {
        return h.getMechanics ? h.getMechanics(member) : null;
      }
    }
    return null;
  }
  var __specialHandlerWarnedKey = null;
  function ensureSpecialHandlerRegistered(member) {
    if (!member) return;
    var id = String(member.characterId || '');
    if (!id) return;
    var key = null;
    for (var k in SPECIAL_CHAR_IDS) {
      if (String(SPECIAL_CHAR_IDS[k]) === id) { key = k; break; }
    }
    if (!key) return;
    var has = false;
    for (var j = 0; j < SPECIAL_HANDLERS.length; j++) {
      if (SPECIAL_HANDLERS[j].key === key) { has = true; break; }
    }
    if (!has && __specialHandlerWarnedKey !== key) {
      __specialHandlerWarnedKey = key;
      console.warn('[wuwacalc] SPECIAL_CHAR_IDS 新增角色 ' + key + '（' + id + '）未登记 SPECIAL_HANDLERS——机制特判可能缺失，请登记注册表');
    }
  }

function getAugustaStackCap(mech, resonanceUnlocked) {
  const m = normalizeAugustaSpecialMechanics(mech);
  const n = normalizeResonanceUnlocked(resonanceUnlocked);
  if (n >= 6) return m.stackCapAtChain6;
  if (n >= 1) return m.stackCapAtChain2;
  return m.stackCapAtBase;
}

/** 溢出暴击→暴伤：各规则独立按 (暴击-阈值) 计算，互不扣减同一段溢出 */
function computeAugustaCritConversion(rawCritRatePct, baseCritDmgPct, mech, resonanceUnlocked) {
  const m = normalizeAugustaSpecialMechanics(mech);
  const n = normalizeResonanceUnlocked(resonanceUnlocked);
  const rawCr = Math.max(0, Number(rawCritRatePct) || 0);
  const baseCd = Math.max(0, Number(baseCritDmgPct) || 0);
  let convertedCritDmg = 0;
  const ruleDetails = [];
  for (const rule of m.convertRules) {
    if (n < rule.minChain) continue;
    const overflow = Math.max(0, rawCr - rule.threshold);
    const gained = Math.min(rule.maxCritDmg, overflow * rule.ratio);
    convertedCritDmg += gained;
    ruleDetails.push({ ...rule, overflow, gained });
  }
  return {
    rawCritRatePct: rawCr,
    effectiveCritRatePct: Math.min(100, rawCr),
    baseCritDmgPct: baseCd,
    convertedCritDmgPct: convertedCritDmg,
    effectiveCritDmgPct: baseCd + convertedCritDmg,
    ruleDetails,
    active: convertedCritDmg > 0 || n >= 2,
  };
}

function syncAugustaSpecialStackOnMember(member, tpl, resonanceUnlocked) {
  if (!member || String(member.characterId) !== AUGUSTA_CHAR_ID) return;
  const mech = normalizeAugustaSpecialMechanics(tpl?.specialMechanics);
  const cap = getAugustaStackCap(mech, resonanceUnlocked);
  const buff = (member.buffs || []).find((b) => b.templateKey === mech.stackTemplateKey);
  if (!buff) return;
  buff.maxStacks = Math.max(1, cap);
  buff.clampStacks = true;
  buff.name = buff.name || '以众愿为冕';
  // 复合 Buff：同步 ≥2 链暴击每层数值
  if (Array.isArray(buff.effects)) {
    buff.effects.forEach((fx) => {
      if (fx?.effectKey === 'augusta_crown_crit_rate' || fx?.zone === 'generalCritRate') {
        fx.valueMode = 'stack';
        fx.segments = [{ upTo: null, perStack: mech.stackPerCritRate }];
        fx.minResonance = AUGUSTA_CROWN_CRIT_RATE_MIN_RESONANCE;
      }
    });
  }
  if (member.globalBuffStacks && member.globalBuffStacks[buff.id] !== undefined) {
    member.globalBuffStacks[buff.id] = Math.min(
      normalizeStackInput(member.globalBuffStacks[buff.id]),
      buff.maxStacks
    );
  }
}

function createEmptyCharacterBuffTemplate(charId, charName) {
  // 最高优先级红线：网站版不得生成测试服角色模板
  if (isPublicSiteHiddenCharId(charId)) {
    return {
      characterId: String(charId || ''),
      characterName: '未知角色',
      revision: 1,
      author: '',
      notes: '',
      personalBuffs: [],
      teamBuffs: [],
      extraSkills: [],
      resonanceChains: emptyResonanceChains(),
      combatModes: normalizeTemplateCombatModes({}, charId),
    };
  }
  const tpl = {
    characterId: String(charId || ''),
    characterName: charName || '',
    revision: 1,
    author: '',
    notes: '',
    personalBuffs: [],
    teamBuffs: [],
    extraSkills: [],
    resonanceChains: emptyResonanceChains(),
    combatModes: normalizeTemplateCombatModes({}, charId),
  };
  if (String(charId) === AUGUSTA_CHAR_ID) {
    tpl.characterName = charName || '奥古斯塔';
    tpl.specialMechanics = defaultAugustaSpecialMechanics();
    ensureAugustaTemplateShape(tpl);
  }
  if (String(charId) === BRANT_CHAR_ID) {
    tpl.characterName = charName || '布兰特';
    tpl.specialMechanics = defaultBrantSpecialMechanics();
    ensureBrantTemplateShape(tpl);
  }
  if (String(charId) === JINGRAN_CHAR_ID) {
    tpl.characterName = charName || '景燃';
    ensureJingranTemplateShape(tpl);
  }
  if (String(charId) === LUPA_CHAR_ID) {
    tpl.characterName = charName || '露帕';
    ensureLupaTemplateShape(tpl);
  }
  if (String(charId) === AMIS_CHAR_ID) {
    tpl.characterName = charName || '爱弥斯';
    ensureAmisTemplateShape(tpl);
  }
  if (String(charId) === DANIA_CHAR_ID) {
    tpl.characterName = charName || '达妮娅';
    ensureDaniaTemplateShape(tpl);
  }
  if (String(charId) === ENCORE_CHAR_ID) {
    tpl.characterName = charName || '安可';
    ensureEncoreTemplateShape(tpl);
  }
  if (String(charId) === MORTEFI_CHAR_ID) {
    tpl.characterName = charName || '莫特斐';
    ensureMortefiTemplateShape(tpl);
  }
  if (String(charId) === YUNO_CHAR_ID) {
    tpl.characterName = charName || '尤诺';
    ensureYunoTemplateShape(tpl);
  }
  if (String(charId) === SANHUA_CHAR_ID) {
    tpl.characterName = charName || '散华';
    ensureSanhuaTemplateShape(tpl);
  }
  if (String(charId) === JIANXIN_CHAR_ID) {
    tpl.characterName = charName || '鉴心';
    ensureJianxinTemplateShape(tpl);
  }
  if (String(charId) === CHOUYUAN_CHAR_ID) {
    tpl.characterName = charName || '仇远';
    ensureChouyuanTemplateShape(tpl);
  }
  if (String(charId) === BAIZHI_CHAR_ID) {
    tpl.characterName = charName || '白芷';
    ensureBaizhiTemplateShape(tpl);
  }
  if (String(charId) === ZHEZHI_CHAR_ID) {
    tpl.characterName = charName || '折枝';
    ensureZhezhiTemplateShape(tpl);
  }
  if (String(charId) === YINLIN_CHAR_ID) {
    tpl.characterName = charName || '吟霖';
    ensureYinlinTemplateShape(tpl);
  }
  if (String(charId) === FLORO_CHAR_ID) {
    tpl.characterName = charName || '弗洛洛';
    ensureFloroTemplateShape(tpl);
  }
  if (String(charId) === CANTARELLA_CHAR_ID) {
    tpl.characterName = charName || '坎特蕾拉';
    ensureCantarellaTemplateShape(tpl);
  }
  if (String(charId) === ROCOCO_CHAR_ID) {
    tpl.characterName = charName || '洛可可';
    ensureRococoTemplateShape(tpl);
  }
  if (String(charId) === TAOQI_CHAR_ID) {
    tpl.characterName = charName || '桃祈';
    ensureTaoqiTemplateShape(tpl);
  }
  if (String(charId) === REBECCA_CHAR_ID) {
    tpl.characterName = charName || '丽贝卡';
    ensureRebeccaTemplateShape(tpl);
  }
  if (String(charId) === BULING_CHAR_ID) {
    tpl.characterName = charName || '卜灵';
    ensureBulingTemplateShape(tpl);
  }
  if (String(charId) === YOUHU_CHAR_ID) {
    tpl.characterName = charName || '釉瑚';
    ensureYouhuTemplateShape(tpl);
  }
  if (String(charId) === CARTETHYIA_CHAR_ID) {
    tpl.characterName = charName || '卡提希娅';
    ensureCartethyiaTemplateShape(tpl);
  }
  if (String(charId) === XIAKONG_CHAR_ID) {
    tpl.characterName = charName || '夏空';
    ensureXiakongTemplateShape(tpl);
  }
  if (String(charId) === QIUSHUI_CHAR_ID) {
    tpl.characterName = charName || '秋水';
    ensureQiushuiTemplateShape(tpl);
  }
  if (String(charId) === LUMI_CHAR_ID) {
    tpl.characterName = charName || '灯灯';
    ensureLumiTemplateShape(tpl);
  }
  if (String(charId) === ROVER_ELECTRO_CHAR_ID) {
    tpl.characterName = charName || '漂泊者·导电';
    ensureRoverElectroTemplateShape(tpl);
  }
  if (String(charId) === ROVER_SPECTRO_CHAR_ID) {
    tpl.characterName = charName || '漂泊者·衍射';
    ensureRoverSpectroTemplateShape(tpl);
  }
  if (String(charId) === ZANNI_CHAR_ID) {
    tpl.characterName = charName || '赞妮';
    ensureZanniTemplateShape(tpl);
  }
  if (String(charId) === LINNEI_CHAR_ID) {
    tpl.characterName = charName || '琳奈';
    ensureLinneiTemplateShape(tpl);
  }
  if (String(charId) === LUCY_CHAR_ID) {
    tpl.characterName = charName || '露西';
    ensureLucyTemplateShape(tpl);
  }
  if (String(charId) === LINGYANG_CHAR_ID) {
    tpl.characterName = charName || '凌阳';
    ensureLingyangTemplateShape(tpl);
  }
  if (String(charId) === VERINA_CHAR_ID) {
    tpl.characterName = charName || '维里奈';
    ensureVerinaTemplateShape(tpl);
  }
  if (String(charId) === CHUN_CHAR_ID) {
    tpl.characterName = charName || '椿';
    ensureChunTemplateShape(tpl);
  }
  if (String(charId) === LOSERA_CHAR_ID) {
    tpl.characterName = charName || '洛瑟菈';
    ensureLoseraTemplateShape(tpl);
  }
  if (String(charId) === FEIXUE_CHAR_ID) {
    tpl.characterName = charName || '绯雪';
    ensureFeixueTemplateShape(tpl);
  }
  if (String(charId) === SUISUI_CHAR_ID) {
    tpl.characterName = charName || '穗穗';
    ensureSuisuiTemplateShape(tpl);
  }
  if (String(charId) === SHOREKEEPER_CHAR_ID) {
    tpl.characterName = charName || '守岸人';
    ensureShorekeeperTemplateShape(tpl);
  }
  if (String(charId) === PHOEBE_CHAR_ID) {
    tpl.characterName = charName || '菲比';
    ensurePhoebeTemplateShape(tpl);
  }
  if (String(charId) === QIANXIAO_CHAR_ID) {
    tpl.characterName = charName || '千咲';
    ensureQianxiaoTemplateShape(tpl);
  }
  if (String(charId) === YANGYANG_XUANLING_CHAR_ID) {
    tpl.characterName = charName || '秧秧·玄翎';
    ensureYangyangXuanlingTemplateShape(tpl);
  }
  if (String(charId) === LUHESI_CHAR_ID) {
    tpl.characterName = charName || '陆·赫斯';
    ensureLuhesiTemplateShape(tpl);
  }
  if (String(charId) === SIGRIKA_CHAR_ID) {
    tpl.characterName = charName || '西格莉卡';
    ensureSigrikaTemplateShape(tpl);
  }
  if (String(charId) === CHANGLI_CHAR_ID) {
    tpl.characterName = charName || '长离';
    ensureChangliTemplateShape(tpl);
  }
  if (String(charId) === CHIXIA_CHAR_ID) {
    tpl.characterName = charName || '炽霞';
    ensureChixiaTemplateShape(tpl);
  }
  if (String(charId) === MONING_CHAR_ID) {
    tpl.characterName = charName || '莫宁';
    ensureMoningTemplateShape(tpl);
  }
  if (String(charId) === JIABEILINA_CHAR_ID) {
    tpl.characterName = charName || '嘉贝莉娜';
    ensureJiabeilinaTemplateShape(tpl);
  }
  if (String(charId) === XIANGALIYAO_CHAR_ID) {
    tpl.characterName = charName || '相里要';
    stripBranchPanelDuplicateTalents(tpl);
  }
  if (String(charId) === YUANWU_CHAR_ID) {
    tpl.characterName = charName || '渊武';
    stripBranchPanelDuplicateTalents(tpl);
  }
  return tpl;
}

function makeTemplateKey(prefix) {
  return `${prefix || 'buff'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function stripRuntimeBuffFields(buff) {
  if (!buff || typeof buff !== 'object') return {};
  const clone = JSON.parse(JSON.stringify(buff));
  delete clone.id;
  delete clone.teamSourceId;
  delete clone.personalSourceId;
  delete clone.weaponGenerated;
  delete clone.weaponTeamBuff;
  delete clone.echoSetTeamBuff;
  delete clone.echoMainTeamBuff;
  delete clone.weaponSourceMemberIndex;
  delete clone.echoSetSourceMember;
  delete clone.echoMainSourceMember;
  delete clone.weaponId;
  delete clone.echoSetSourceId;
  delete clone.echoSetTier;
  delete clone.echoMainSourceId;
  delete clone.sourceMemberIndex;
  delete clone.scope;
  return clone;
}

function normalizeTemplateBuffEntry(raw) {
  const base = stripRuntimeBuffFields(raw);
  const normalized = normalizeBuff({
    ...base,
    id: base.id || genId(),
    sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    templateKey: String(base.templateKey || '').trim() || makeTemplateKey('tpl'),
  });
  const out = stripRuntimeBuffFields(normalized);
  out.templateKey = normalized.templateKey;
  out.sourceTag = CHAR_BUFF_TEMPLATE_SOURCE_TAG;
  const gameText = normalizeBuffGameText(base.gameText ?? raw?.gameText ?? normalized.gameText);
  if (gameText) out.gameText = gameText;
  else delete out.gameText;
  if (base.excludeSource || normalized.excludeSource) out.excludeSource = true;
  if (base.clampStacks || normalized.clampStacks) out.clampStacks = true;
  if (base.stackSync || normalized.stackSync) out.stackSync = base.stackSync || normalized.stackSync;
  if (base.activeSync || normalized.activeSync) out.activeSync = base.activeSync || normalized.activeSync;
  const onlyIds = Array.isArray(base.onlyCharacterIds)
    ? base.onlyCharacterIds
    : Array.isArray(normalized.onlyCharacterIds)
      ? normalized.onlyCharacterIds
      : Array.isArray(raw?.onlyCharacterIds)
        ? raw.onlyCharacterIds
        : null;
  if (Array.isArray(onlyIds) && onlyIds.length) {
    out.onlyCharacterIds = onlyIds.map((id) => String(id || '').trim()).filter(Boolean);
  }
  if (base.defaultActive !== undefined) out.defaultActive = !!base.defaultActive;
  else if (raw?.defaultActive !== undefined) out.defaultActive = !!raw.defaultActive;
  if (base.defaultStacks !== undefined && Number.isFinite(Number(base.defaultStacks))) {
    out.defaultStacks = normalizeStackInput(base.defaultStacks, normalized);
  } else if (raw?.defaultStacks !== undefined && Number.isFinite(Number(raw.defaultStacks))) {
    out.defaultStacks = normalizeStackInput(raw.defaultStacks, normalized);
  }
  if (Array.isArray(normalized.effects)) {
    const rawEffects = Array.isArray(base.effects) ? base.effects : [];
    out.effects = normalized.effects.map((fx, i) => {
      const rawLibs = rawEffects[i]?.librarySkillNames;
      const n = normalizeCompositeEffect(fx);
      if (Array.isArray(rawLibs) && rawLibs.length && !(n.librarySkillNames?.length)) {
        n.librarySkillNames = rawLibs.map((x) => String(x || '').trim()).filter(Boolean);
      }
      delete n.id;
      return n;
    });
  }
  // Older local templates may still model this conditional 25% outro as a stack.
  if (out.templateKey === 'suoming_outro_reso_deep') {
    out.mode = 'fixed';
    out.maxStacks = 1;
    out.value = 0;
    out.perStack = 0;
    delete out.clampStacks;
    delete out.defaultStacks;
    delete out.tongzouLinkedStack;
    delete out.tongzouStackScope;
    const effect = normalizeCompositeEffect({
      ...(out.effects?.[0] || {}),
      zone: 'typeDeep',
      valueMode: 'fixed',
      value: 25,
      segments: [{ upTo: null, perStack: 0 }],
      skillScope: 'all',
      damageType: '共鸣技能',
      minStacks: 0,
    });
    delete effect.id;
    out.effects = [effect];
  }
  return out;
}

/** 角色模板 Buff 的游戏原文案（多行） */
function normalizeBuffGameText(raw) {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function normalizeTemplateExtraSkillEntry(raw) {
  const damageType = DAMAGE_TYPES.includes(raw?.damageType) ? raw.damageType : DAMAGE_TYPES[0];
  let effectLayers =
    normalizeStackInput(raw?.effectLayers ?? EFFECT_LAYER_DEFAULT) || EFFECT_LAYER_DEFAULT;
  effectLayers = Math.max(EFFECT_LAYER_MIN, Math.min(EFFECT_LAYER_MAX, effectLayers));
  let effectBurstLayers = Number.isFinite(Number(raw?.effectBurstLayers))
    ? Number(raw.effectBurstLayers)
    : 0;
  effectBurstLayers = Math.max(
    EFFECT_BURST_LAYER_MIN,
    Math.min(EFFECT_LAYER_MAX, normalizeStackInput(effectBurstLayers))
  );
  let effectCount = normalizeStackInput(raw?.effectCount ?? 1) || 1;
  effectCount = Math.max(1, effectCount);
  const defaultMult = damageType === '处决' ? 1600 : damageType === '效应' ? 100 : 0;
  const baseMult = Number.isFinite(Number(raw?.baseMult)) ? Number(raw.baseMult) : defaultMult;
  return {
    templateKey: String(raw?.templateKey || '').trim() || makeTemplateKey('extra'),
    name: String(raw?.name || '').trim() || '额外技能',
    damageType,
    effectType: EFFECT_TYPE_LIST.includes(raw?.effectType) ? raw.effectType : EFFECT_TYPE_LIST[0],
    effectLayers,
    effectBurstLayers,
    effectCount,
    baseMult,
    fixedDamage: !!raw?.fixedDamage || isFixedDamageByName(raw?.name),
    effectMultMode: raw?.effectMultMode === 'layers' ? 'layers' : 'custom',
  };
}

function normalizeChainBlock(raw, charId) {
  const out = {
    enabledByDefault: !!raw?.enabledByDefault,
    notes: String(raw?.notes || ''),
    personalBuffs: (raw?.personalBuffs || []).map(normalizeTemplateBuffEntry),
    teamBuffs: (raw?.teamBuffs || []).map(normalizeTemplateBuffEntry),
    extraSkills: (raw?.extraSkills || []).map(normalizeTemplateExtraSkillEntry),
    combatModes: normalizeTemplateCombatModes(raw?.combatModes, charId),
  };
  const chainText = normalizeBuffGameText(raw?.gameText);
  if (chainText) out.gameText = chainText;
  else delete out.gameText;
  return out;
}

function normalizeCharacterBuffTemplate(raw) {
  const rawId = String(raw?.characterId || '').trim();
  const charId = ROVER_MALE_TO_FEMALE_ID[rawId] || rawId;
  const chains = emptyResonanceChains();
  const srcChains = raw?.resonanceChains || {};
  for (let i = 1; i <= 6; i += 1) {
    const key = String(i);
    chains[key] = normalizeChainBlock(srcChains[key] || {}, charId);
  }
  const out = {
    characterId: charId,
    characterName: String(raw?.characterName || ''),
    revision: Math.max(1, Math.round(Number(raw?.revision) || 1)),
    author: String(raw?.author || ''),
    notes: String(raw?.notes || ''),
    personalBuffs: (raw?.personalBuffs || []).map(normalizeTemplateBuffEntry),
    teamBuffs: (raw?.teamBuffs || []).map(normalizeTemplateBuffEntry),
    extraSkills: (raw?.extraSkills || []).map(normalizeTemplateExtraSkillEntry),
    resonanceChains: chains,
    combatModes: normalizeTemplateCombatModes(raw?.combatModes, charId),
  };
  if (charId === '1312') {
    const list = out.resonanceChains['2'].teamBuffs;
    const base = list.find(b => b.templateKey === 'suoming_c2_outro_critdmg_base');
    if (base && !list.some(b => b.templateKey === 'suoming_c2_outro_critdmg_stack')) {
      list.push(normalizeTemplateBuffEntry({ ...base, templateKey: 'suoming_c2_outro_critdmg_stack' }));
    }
    out.resonanceChains['2'].teamBuffs = list.filter(b => b.templateKey !== 'suoming_c2_outro_critdmg_base');
  }
  // 旧本机模板可能仍含两份漂泊者协同增伤；统一为可手动覆盖的全队来源。
  if (charId === XIN_CHAR_ID && out.combatModes.dianci) {
    const mode = out.combatModes.dianci;
    const legacy = mode.personalBuffs.find((b) => b.templateKey === 'xin_dc_rover_sync_bonus');
    let team = mode.teamBuffs.find((b) => b.templateKey === 'xin_dc_rover_teammate_bonus');
    if (!team && legacy) {
      team = { ...legacy, templateKey: 'xin_dc_rover_teammate_bonus' };
      mode.teamBuffs.push(team);
    }
    if (team) {
      team.onlyCharacterIds = ['1311', '1309', '1310'];
      team.defaultActive = false;
      delete team.excludeSource;
      mode.personalBuffs = mode.personalBuffs.filter((b) => b.templateKey !== 'xin_dc_rover_sync_bonus');
    }
  }
  if (charId === AUGUSTA_CHAR_ID) {
    out.specialMechanics = normalizeAugustaSpecialMechanics(raw?.specialMechanics);
    ensureAugustaTemplateShape(out);
  }
  if (charId === BRANT_CHAR_ID) {
    out.specialMechanics = normalizeBrantSpecialMechanics(raw?.specialMechanics);
    ensureBrantTemplateShape(out);
  }
  if (charId === JINGRAN_CHAR_ID) {
    ensureJingranTemplateShape(out);
  }
  if (charId === LUPA_CHAR_ID) {
    ensureLupaTemplateShape(out);
  }
  if (charId === AMIS_CHAR_ID) {
    ensureAmisTemplateShape(out);
  }
  if (charId === DANIA_CHAR_ID) {
    ensureDaniaTemplateShape(out);
  }
  if (charId === ENCORE_CHAR_ID) {
    ensureEncoreTemplateShape(out);
  }
  if (charId === MORTEFI_CHAR_ID) {
    ensureMortefiTemplateShape(out);
  }
  if (charId === YUNO_CHAR_ID) {
    ensureYunoTemplateShape(out);
  }
  if (charId === SANHUA_CHAR_ID) {
    ensureSanhuaTemplateShape(out);
  }
  if (charId === JIANXIN_CHAR_ID) {
    ensureJianxinTemplateShape(out);
  }
  if (charId === CHOUYUAN_CHAR_ID) {
    ensureChouyuanTemplateShape(out);
  }
  if (charId === BAIZHI_CHAR_ID) {
    ensureBaizhiTemplateShape(out);
  }
  if (charId === ZHEZHI_CHAR_ID) {
    ensureZhezhiTemplateShape(out);
  }
  if (charId === YINLIN_CHAR_ID) {
    ensureYinlinTemplateShape(out);
  }
  if (charId === FLORO_CHAR_ID) {
    ensureFloroTemplateShape(out);
  }
  if (charId === CANTARELLA_CHAR_ID) {
    ensureCantarellaTemplateShape(out);
  }
  if (charId === ROCOCO_CHAR_ID) {
    ensureRococoTemplateShape(out);
  }
  if (charId === TAOQI_CHAR_ID) {
    ensureTaoqiTemplateShape(out);
  }
  if (charId === REBECCA_CHAR_ID) {
    ensureRebeccaTemplateShape(out);
  }
  if (charId === BULING_CHAR_ID) {
    ensureBulingTemplateShape(out);
  }
  if (charId === YOUHU_CHAR_ID) {
    ensureYouhuTemplateShape(out);
  }
  if (charId === CARTETHYIA_CHAR_ID) {
    ensureCartethyiaTemplateShape(out);
  }
  if (charId === XIAKONG_CHAR_ID) {
    ensureXiakongTemplateShape(out);
  }
  if (charId === QIUSHUI_CHAR_ID) {
    ensureQiushuiTemplateShape(out);
  }
  if (charId === LUMI_CHAR_ID) {
    ensureLumiTemplateShape(out);
  }
  if (charId === ROVER_ELECTRO_CHAR_ID) {
    ensureRoverElectroTemplateShape(out);
  }
  if (charId === ROVER_SPECTRO_CHAR_ID) {
    ensureRoverSpectroTemplateShape(out);
  }
  if (charId === ZANNI_CHAR_ID) {
    ensureZanniTemplateShape(out);
  }
  if (charId === LINNEI_CHAR_ID) {
    ensureLinneiTemplateShape(out);
  }
  if (charId === LUCY_CHAR_ID) {
    ensureLucyTemplateShape(out);
  }
  if (charId === LINGYANG_CHAR_ID) {
    ensureLingyangTemplateShape(out);
  }
  if (charId === VERINA_CHAR_ID) {
    ensureVerinaTemplateShape(out);
  }
  if (charId === CHUN_CHAR_ID) {
    ensureChunTemplateShape(out);
  }
  if (charId === LOSERA_CHAR_ID) {
    ensureLoseraTemplateShape(out);
  }
  if (charId === FEIXUE_CHAR_ID) {
    ensureFeixueTemplateShape(out);
  }
  if (charId === SUISUI_CHAR_ID) {
    ensureSuisuiTemplateShape(out);
  }
  if (charId === SHOREKEEPER_CHAR_ID) {
    ensureShorekeeperTemplateShape(out);
  }
  if (charId === PHOEBE_CHAR_ID) {
    ensurePhoebeTemplateShape(out);
  }
  if (charId === QIANXIAO_CHAR_ID) {
    ensureQianxiaoTemplateShape(out);
  }
  if (charId === YANGYANG_XUANLING_CHAR_ID) {
    ensureYangyangXuanlingTemplateShape(out);
  }
  if (charId === LUHESI_CHAR_ID) {
    ensureLuhesiTemplateShape(out);
  }
  if (charId === SIGRIKA_CHAR_ID) {
    ensureSigrikaTemplateShape(out);
  }
  if (charId === '1107') {
    stripCarlottaLegacyC3OutroMult(out);
  }
  if (charId === XIANGALIYAO_CHAR_ID || charId === YUANWU_CHAR_ID) {
    stripBranchPanelDuplicateTalents(out);
  }
  if (charId === CHANGLI_CHAR_ID) {
    ensureChangliTemplateShape(out);
  }
  if (charId === CHIXIA_CHAR_ID) {
    ensureChixiaTemplateShape(out);
  }
  if (charId === MONING_CHAR_ID) {
    ensureMoningTemplateShape(out);
  }
  if (charId === JIABEILINA_CHAR_ID) {
    ensureJiabeilinaTemplateShape(out);
  }
  return out;
}

function normalizeTemplateLibrary(data) {
  const templates = Array.isArray(data?.templates)
    ? data.templates
        .map(normalizeCharacterBuffTemplate)
        .filter((t) => t.characterId && !isPublicSiteHiddenCharId(t.characterId))
    : [];
  return {
    version: Number(data?.version) || 1,
    kind: 'character-buff-templates',
    updated: data?.updated || new Date().toISOString().slice(0, 10),
    note: data?.note || '',
    templates,
  };
}

function loadCharBuffTemplateLocal() {
  if (charBuffTemplateLocal) return charBuffTemplateLocal;
  try {
    const raw = localStorage.getItem(CHAR_BUFF_TEMPLATE_LOCAL_KEY);
    if (!raw) {
      charBuffTemplateLocal = normalizeTemplateLibrary({ templates: [] });
      return charBuffTemplateLocal;
    }
    charBuffTemplateLocal = normalizeTemplateLibrary(JSON.parse(raw));
  } catch {
    charBuffTemplateLocal = normalizeTemplateLibrary({ templates: [] });
  }
  return charBuffTemplateLocal;
}

function saveCharBuffTemplateLocal() {
  const lib = loadCharBuffTemplateLocal();
  lib.updated = new Date().toISOString().slice(0, 10);
  charBuffTemplateLocalRev += 1;
  invalidateMergedTemplateMap();
  try {
    localStorage.setItem(CHAR_BUFF_TEMPLATE_LOCAL_KEY, JSON.stringify(lib));
  } catch (err) {
    console.warn('saveCharBuffTemplateLocal failed', err);
  }
}

function setCharBuffTemplateDb(data, source) {
  charBuffTemplateDb = normalizeTemplateLibrary(data);
  charBuffTemplateDb._source = source || 'file';
  return charBuffTemplateDb;
}

function ensureCharBuffTemplateDb(forceReload, charIds) {
  if (forceReload) {
    charBuffTemplateDb = null;
    charBuffTemplateDbPromise = null;
    if (CSF_MODE) csfTemplatesMerged = false;
    charBuffTemplateIndex = null;
    charBuffTemplateIndexPromise = null;
    charBuffTemplateShardPromises = {};
    try { localStorage.removeItem(CHAR_BUFF_TEMPLATE_DB_CACHE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(CHAR_BUFF_TEMPLATE_INDEX_CACHE_KEY); } catch { /* ignore */ }
    clearCharBuffTemplateShardCaches();
  } else {
    // 旧整库缓存键（v167/v166）一次性清理，避免残留旧格式
    try { localStorage.removeItem(CHAR_BUFF_TEMPLATE_DB_CACHE_KEY); } catch { /* ignore */ }
  }
  return loadCharBuffTemplateIndex(forceReload)
    .then((idx) => {
      const ids = resolveCharTemplateIds(charIds && charIds.length ? charIds : currentTeamCharIds());
      return Promise.allSettled(ids.map((id) => ensureCharBuffTemplateShard(id, idx)));
    })
    .then(() => ensureCsfOverlay())
    // 技能库可能先触发 CSF 叠加；模板库就绪后再确认一次，允许失败后重试。
    .then(() => loadCsfTemplateOverlay())
    .then(() => charBuffTemplateDb || normalizeTemplateLibrary({ templates: [] }));
}

/** 加载分片索引（内存 → localStorage → 网络；失败降级空索引，本机覆盖仍生效） */
function loadCharBuffTemplateIndex(forceReload) {
  if (!forceReload && charBuffTemplateIndex) return Promise.resolve(charBuffTemplateIndex);
  if (!forceReload && charBuffTemplateIndexPromise) return charBuffTemplateIndexPromise;
  if (!forceReload) {
    try {
      const raw = localStorage.getItem(CHAR_BUFF_TEMPLATE_INDEX_CACHE_KEY);
      if (raw) {
        const idx = JSON.parse(raw);
        if (idx && Array.isArray(idx.characters) && idx.characters.length) {
          charBuffTemplateIndex = idx;
          return Promise.resolve(idx);
        }
      }
    } catch { /* ignore */ }
  } else {
    charBuffTemplateIndex = null;
    charBuffTemplateIndexPromise = null;
    try { localStorage.removeItem(CHAR_BUFF_TEMPLATE_INDEX_CACHE_KEY); } catch { /* ignore */ }
  }
  charBuffTemplateIndexPromise = fetch(CHAR_BUFF_TEMPLATE_INDEX_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`角色 Buff 模板索引加载失败 (${r.status})`);
      return r.json();
    })
    .then((data) => {
      try { localStorage.setItem(CHAR_BUFF_TEMPLATE_INDEX_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      charBuffTemplateIndex = data;
      return data;
    })
    .catch((err) => {
      console.warn(err);
      charBuffTemplateIndex = { characters: [] };
      return charBuffTemplateIndex;
    });
  return charBuffTemplateIndexPromise;
}

/** 归一化角色 id（漂泊者男→女）+ 去重；空输入兜底当前队伍全角色 */
function resolveCharTemplateIds(rawIds) {
  const out = [];
  (rawIds || []).forEach((raw) => {
    const id = ROVER_MALE_TO_FEMALE_ID[String(raw)] || String(raw);
    if (id && out.indexOf(id) < 0) out.push(id);
  });
  return out;
}

function currentTeamCharIds() {
  const ids = [];
  ((state && state.members) || []).forEach((m) => {
    if (m && m.characterId) ids.push(String(m.characterId));
  });
  return ids;
}

/** 从索引取分片元信息（sha1 token）；索引无此角色 = 无模板角色 */
function getShardMeta(id, idx) {
  const list = ((idx && idx.characters) || (charBuffTemplateIndex && charBuffTemplateIndex.characters) || []);
  for (let i = 0; i < list.length; i++) {
    if (String(list[i].id) === String(id)) return list[i];
  }
  return null;
}

/** 确保某角色分片已加载（内存 → localStorage 分片缓存 → 网络；per-shard 并发去重） */
function ensureCharBuffTemplateShard(id, idx) {
  if (charBuffTemplateDb && (charBuffTemplateDb.templates || []).some((t) => String(t.characterId) === String(id))) {
    return Promise.resolve();
  }
  if (charBuffTemplateShardPromises[id]) return charBuffTemplateShardPromises[id];
  const meta = getShardMeta(id, idx);
  if (!meta) return Promise.resolve();
  const cacheKey = 'charBuffTemplateDbCache-' + id;
  const cached = readCharBuffTemplateShardCache(cacheKey, meta.sha1);
  if (cached) return Promise.resolve();
  const url = CHAR_BUFF_TEMPLATE_SHARD_URL.replace('{id}', encodeURIComponent(id)) + '?v=' + meta.sha1;
  charBuffTemplateShardPromises[id] = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`角色 Buff 模板分片加载失败 ${id} (${r.status})`);
      return r.json();
    })
    .then((data) => {
      try { localStorage.setItem(cacheKey, JSON.stringify(data));
          try {
            localStorage.setItem(cacheKey + '-sha', String(meta.sha1 || ''));
          } catch (e) {
            /* ignore */
          } } catch { /* ignore */ }
      mergeCharBuffTemplateShard(data);
      return data;
    })
    .catch((err) => {
      console.warn('[buff-template-shard] ' + id, (err && err.message) || err);
      return null;
    })
    .finally(() => { delete charBuffTemplateShardPromises[id]; });
  return charBuffTemplateShardPromises[id];
}

/** 分片 localStorage 缓存：gameText 启发式下沉到分片级（单片无 gameText → 该片重拉） */
function readCharBuffTemplateShardCache(cacheKey, expectSha) {
  // PROBE_FIX_SHARD_SHA_GUARD：分片缓存必须校验内容 sha，否则模板更新后老用户永远读旧数据。
  // 旧实现只检查"有没有 gameText"就采用，且缓存键不带版本 → 永不刷新。
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    if (expectSha) {
      let cachedSha = '';
      try {
        cachedSha = localStorage.getItem(cacheKey + '-sha') || '';
      } catch (e) {
        cachedSha = '';
      }
      if (cachedSha !== expectSha) {
        try {
          localStorage.removeItem(cacheKey);
          localStorage.removeItem(cacheKey + '-sha');
        } catch (e) {
          /* ignore */
        }
        return null;
      }
    }
    const data = JSON.parse(raw);
    let hits = 0;
    (data.templates || []).forEach((tpl) => {
      forEachTemplateBuffEntry(tpl, (entry) => {
        if (normalizeBuffGameText(entry && entry.gameText)) hits += 1;
      });
    });
    if (hits > 0) {
      mergeCharBuffTemplateShard(data);
      return data;
    }
    try {
      localStorage.removeItem(cacheKey);
    } catch (e) {
      /* ignore */
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

/** 合并分片进随包库：新对象引用（getMergedTemplateMap 缓存自动失效）+ 重跑索引 */
function mergeCharBuffTemplateShard(data) {
  const tpl = data && data.templates && data.templates[0];
  if (!tpl || !tpl.characterId) return;
  const id = ROVER_MALE_TO_FEMALE_ID[String(tpl.characterId)] || String(tpl.characterId);
  const current = charBuffTemplateDb || normalizeTemplateLibrary({ templates: [] });
  const merged = normalizeTemplateLibrary({
    version: current.version,
    updated: current.updated,
    note: current.note,
    templates: (current.templates || []).filter((t) => String(t.characterId) !== id).concat([tpl]),
  });
  merged._source = (current && current._source) || 'shard';
  charBuffTemplateDb = merged;
  invalidateMergedTemplateMap();
}

/** forceReload：清空全部分片 localStorage 缓存 */
function clearCharBuffTemplateShardCaches() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^charBuffTemplateDbCache-/.test(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/**
 * 本机模板缺 gameText 时，按 templateKey /「N链」名称从随包底稿补齐（不覆盖本机已有原文）。
 * 解决：本机曾整份覆盖同角色后，随包新抓的链文案看起来「没导进去」。
 */
function fillMissingTemplateGameTexts(targetTpl, sourceTpl) {
  if (!targetTpl || !sourceTpl || targetTpl === sourceTpl) return targetTpl;
  const byKey = new Map();
  const byChain = new Map();
  for (let n = 1; n <= 6; n += 1) {
    const key = String(n);
    const blockText = normalizeBuffGameText(sourceTpl.resonanceChains?.[key]?.gameText);
    if (blockText) byChain.set(n, blockText);
  }
  forEachTemplateBuffEntry(sourceTpl, (entry, meta) => {
    const key = String(entry?.templateKey || '').trim();
    const text = normalizeBuffGameText(entry?.gameText);
    if (key && text) byKey.set(key, text);
    if (!text) return;
    const chainN = resolveTemplateBuffChainNumber(entry, meta) || parseChainNumberFromBuffName(entry?.name);
    if (chainN && !byChain.has(chainN)) byChain.set(chainN, text);
  });
  // 链块级原文
  if (!targetTpl.resonanceChains) targetTpl.resonanceChains = emptyResonanceChains();
  byChain.forEach((text, n) => {
    const key = String(n);
    if (!targetTpl.resonanceChains[key] || typeof targetTpl.resonanceChains[key] !== 'object') {
      targetTpl.resonanceChains[key] = normalizeChainBlock({}, targetTpl.characterId);
    }
    if (!normalizeBuffGameText(targetTpl.resonanceChains[key].gameText)) {
      targetTpl.resonanceChains[key].gameText = text;
    }
  });
  forEachTemplateBuffEntry(targetTpl, (entry, meta) => {
    if (normalizeBuffGameText(entry?.gameText)) return;
    const key = String(entry?.templateKey || '').trim();
    if (key && byKey.has(key)) {
      entry.gameText = byKey.get(key);
      return;
    }
    const chainN =
      resolveTemplateBuffChainNumber(entry, meta) || parseChainNumberFromBuffName(entry?.name);
    if (chainN && byChain.has(chainN)) entry.gameText = byChain.get(chainN);
  });
  // 本机条目键名与随包不一致（旧键/旧结构）时，按「位置 + 名称」从随包补文案
  const byNamePos = new Map();
  forEachTemplateBuffEntry(sourceTpl, (entry, meta) => {
    const text = normalizeBuffGameText(entry?.gameText);
    const name = String(entry?.name || '').trim();
    if (!text || !name) return;
    const pos = String(meta?.location || 'root') + '|' + String(meta?.modeKey || '') + '|' + name;
    if (!byNamePos.has(pos)) byNamePos.set(pos, text);
  });
  forEachTemplateBuffEntry(targetTpl, (entry, meta) => {
    if (normalizeBuffGameText(entry?.gameText)) return;
    const name = String(entry?.name || '').trim();
    if (!name) return;
    const pos = String(meta?.location || 'root') + '|' + String(meta?.modeKey || '') + '|' + name;
    const text = byNamePos.get(pos);
    if (text) entry.gameText = text;
  });
  // 位置不一致时（本机库旧结构），按纯名称从随包补文案
  const byName = new Map();
  forEachTemplateBuffEntry(sourceTpl, (entry) => {
    const text = normalizeBuffGameText(entry?.gameText);
    const name = String(entry?.name || '').trim();
    if (!text || !name) return;
    if (!byName.has(name)) byName.set(name, text);
  });
  forEachTemplateBuffEntry(targetTpl, (entry) => {
    if (normalizeBuffGameText(entry?.gameText)) return;
    const name = String(entry?.name || '').trim();
    if (!name) return;
    const text = byName.get(name);
    if (text) entry.gameText = text;
  });
  return targetTpl;
}

function getMergedTemplateMap() {
  loadCharBuffTemplateLocal();
  const dbRef = charBuffTemplateDb;
  if (
    mergedTemplateMapCache &&
    mergedTemplateMapRev === charBuffTemplateLocalRev &&
    mergedTemplateDbRef === dbRef
  ) {
    return mergedTemplateMapCache;
  }
  const map = new Map();
  const bundled = dbRef || normalizeTemplateLibrary({ templates: [] });
  const local = loadCharBuffTemplateLocal();
  const bundledById = new Map();
  // 漂泊者男性 id → 女性 id（与选角/技能库一致；旧模板挂在男 id 时也能命中）
  const resolveId = (rawId) => {
    const id = String(rawId || '').trim();
    if (!id) return '';
    return ROVER_MALE_TO_FEMALE_ID[id] || id;
  };
  // 随包底稿
  (bundled.templates || []).forEach((t) => {
    const id = resolveId(t.characterId);
    if (!id) return;
    if (String(t.characterId) !== id) t.characterId = id;
    bundledById.set(id, t);
    map.set(id, t);
  });
  // 本机库覆盖同角色；缺文案的条目从随包补齐
  (local.templates || []).forEach((t) => {
    const id = resolveId(t.characterId);
    if (!id) return;
    if (String(t.characterId) !== id) t.characterId = id;
    const base = bundledById.get(id);
    if (base) fillMissingTemplateGameTexts(t, base);
    map.set(id, t);
  });
  mergedTemplateMapCache = map;
  mergedTemplateMapRev = charBuffTemplateLocalRev;
  mergedTemplateDbRef = dbRef;
  rebuildTemplateBuffIndexes(map);
  return map;
}

/** 从合并模板 Map 重建 key/name 索引与随包兜底索引（仅在 getMergedTemplateMap 重建时调用） */
function rebuildTemplateBuffIndexes(map) {
  templateBuffKeyIndexByChar = new Map();
  templateBuffNameIndexByChar = new Map();
  bundledTemplateByChar = new Map();
  bundledEntryByChar = new Map();
  mergedTemplateRefByChar = new Map();
  map.forEach((tpl, charId) => {
    mergedTemplateRefByChar.set(charId, tpl);
    const keyIndex = new Map();
    const nameIndex = new Map();
    forEachTemplateBuffEntry(tpl, (entry, meta) => {
      const k = String(entry?.templateKey || '').trim();
      if (k && !keyIndex.has(k)) keyIndex.set(k, { entry, meta });
      const en = String(entry?.name || '').trim();
      const dn = String(entry?.displayName || '').trim();
      if (en && !nameIndex.has(en)) nameIndex.set(en, { entry, meta });
      if (dn && !nameIndex.has(dn)) nameIndex.set(dn, { entry, meta });
    });
    templateBuffKeyIndexByChar.set(charId, keyIndex);
    templateBuffNameIndexByChar.set(charId, nameIndex);
  });
  (charBuffTemplateDb?.templates || []).forEach((t) => {
    const id = String(t.characterId || '').trim();
    if (!id) return;
    bundledTemplateByChar.set(id, t);
    const entryIndex = new Map();
    forEachTemplateBuffEntry(t, (entry) => {
      const k = String(entry?.templateKey || '').trim();
      if (k && !entryIndex.has(k)) entryIndex.set(k, entry);
    });
    bundledEntryByChar.set(id, entryIndex);
  });
}

function getCharacterBuffTemplate(charId) {
  if (!charId) return null;
  const id = ROVER_MALE_TO_FEMALE_ID[String(charId)] || String(charId);
  const existing = getMergedTemplateMap().get(id);
  if (existing) {
    if (id === MORTEFI_CHAR_ID) ensureMortefiTemplateShape(existing);
    if (id === YUNO_CHAR_ID) ensureYunoTemplateShape(existing);
    if (id === SANHUA_CHAR_ID) ensureSanhuaTemplateShape(existing);
    if (id === JIANXIN_CHAR_ID) ensureJianxinTemplateShape(existing);
    if (id === CHOUYUAN_CHAR_ID) ensureChouyuanTemplateShape(existing);
    if (id === BAIZHI_CHAR_ID) ensureBaizhiTemplateShape(existing);
    if (id === ZHEZHI_CHAR_ID) ensureZhezhiTemplateShape(existing);
    if (id === YINLIN_CHAR_ID) ensureYinlinTemplateShape(existing);
    if (id === FLORO_CHAR_ID) ensureFloroTemplateShape(existing);
    if (id === CANTARELLA_CHAR_ID) ensureCantarellaTemplateShape(existing);
    if (id === ROCOCO_CHAR_ID) ensureRococoTemplateShape(existing);
    if (id === TAOQI_CHAR_ID) ensureTaoqiTemplateShape(existing);
    if (id === REBECCA_CHAR_ID) ensureRebeccaTemplateShape(existing);
    if (id === BULING_CHAR_ID) ensureBulingTemplateShape(existing);
    if (id === YOUHU_CHAR_ID) ensureYouhuTemplateShape(existing);
    if (id === CARTETHYIA_CHAR_ID) ensureCartethyiaTemplateShape(existing);
    if (id === XIAKONG_CHAR_ID) ensureXiakongTemplateShape(existing);
    if (id === QIUSHUI_CHAR_ID) ensureQiushuiTemplateShape(existing);
    if (id === LUMI_CHAR_ID) ensureLumiTemplateShape(existing);
    if (id === ROVER_ELECTRO_CHAR_ID) ensureRoverElectroTemplateShape(existing);
    if (id === ROVER_SPECTRO_CHAR_ID) ensureRoverSpectroTemplateShape(existing);
    if (id === ZANNI_CHAR_ID) ensureZanniTemplateShape(existing);
    if (id === LINNEI_CHAR_ID) ensureLinneiTemplateShape(existing);
    if (id === LUCY_CHAR_ID) ensureLucyTemplateShape(existing);
    if (id === LINGYANG_CHAR_ID) ensureLingyangTemplateShape(existing);
    if (id === VERINA_CHAR_ID) ensureVerinaTemplateShape(existing);
    if (id === CHUN_CHAR_ID) ensureChunTemplateShape(existing);
    if (id === LOSERA_CHAR_ID) ensureLoseraTemplateShape(existing);
    if (id === FEIXUE_CHAR_ID) ensureFeixueTemplateShape(existing);
    if (id === SUISUI_CHAR_ID) ensureSuisuiTemplateShape(existing);
    if (id === SHOREKEEPER_CHAR_ID) ensureShorekeeperTemplateShape(existing);
    if (id === PHOEBE_CHAR_ID) ensurePhoebeTemplateShape(existing);
    if (id === QIANXIAO_CHAR_ID) ensureQianxiaoTemplateShape(existing);
    if (id === YANGYANG_XUANLING_CHAR_ID) ensureYangyangXuanlingTemplateShape(existing);
    if (id === LUHESI_CHAR_ID) ensureLuhesiTemplateShape(existing);
    if (id === SIGRIKA_CHAR_ID) ensureSigrikaTemplateShape(existing);
    if (id === '1107') stripCarlottaLegacyC3OutroMult(existing);
    if (id === XIANGALIYAO_CHAR_ID || id === YUANWU_CHAR_ID) {
      stripBranchPanelDuplicateTalents(existing);
    }
    if (id === CHANGLI_CHAR_ID) ensureChangliTemplateShape(existing);
    if (id === CHIXIA_CHAR_ID) ensureChixiaTemplateShape(existing);
    if (id === MONING_CHAR_ID) ensureMoningTemplateShape(existing);
    if (id === JIABEILINA_CHAR_ID) ensureJiabeilinaTemplateShape(existing);
    if (id === BRANT_CHAR_ID) ensureBrantTemplateShape(existing);
    if (id === JINGRAN_CHAR_ID) ensureJingranTemplateShape(existing);
    if (id === LUPA_CHAR_ID) ensureLupaTemplateShape(existing);
    if (id === AUGUSTA_CHAR_ID) ensureAugustaTemplateShape(existing);
    if (id === AMIS_CHAR_ID) {
      ensureAmisTemplateShape(existing);
      const bundled = getBundledCharacterBuffTemplate(id);
      // ensure 可能刚插入链条目：再从随包补原文（填缺不覆盖）
      if (bundled && bundled !== existing) fillMissingTemplateGameTexts(existing, bundled);
      backfillChainEntryGameTextsFromBlocks(existing);
      persistEnsuredCharacterTemplate(existing);
    }
    if (id === DANIA_CHAR_ID) {
      ensureDaniaTemplateShape(existing);
      persistEnsuredCharacterTemplate(existing);
    }
    return existing;
  }
  // C1 分片：索引声明有模板但未加载到（漏拉/加载失败）→ per-char 告警一次
  // （本机覆盖有该角色时 existing 非空不会走到这里，故告警口径天然排除本机兜底）
  if (getShardMeta(id, null) && !charBuffTemplateMissingWarned.has(id)) {
    charBuffTemplateMissingWarned.add(id);
    console.warn('[buff-template] 角色 ' + id + ' 模板缺失（分片未加载或加载失败），已用空模板兜底，请刷新或重新选角。');
  }
  if (id === AUGUSTA_CHAR_ID) return createEmptyCharacterBuffTemplate(AUGUSTA_CHAR_ID, '奥古斯塔');
  if (id === AMIS_CHAR_ID) {
    const tpl = createEmptyCharacterBuffTemplate(AMIS_CHAR_ID, '爱弥斯');
    persistEnsuredCharacterTemplate(tpl);
    return getMergedTemplateMap().get(AMIS_CHAR_ID) || tpl;
  }
  if (id === DANIA_CHAR_ID) {
    const tpl = createEmptyCharacterBuffTemplate(DANIA_CHAR_ID, '达妮娅');
    persistEnsuredCharacterTemplate(tpl);
    return getMergedTemplateMap().get(DANIA_CHAR_ID) || tpl;
  }
  if (id === ENCORE_CHAR_ID) return createEmptyCharacterBuffTemplate(ENCORE_CHAR_ID, '安可');
  if (id === MORTEFI_CHAR_ID) return createEmptyCharacterBuffTemplate(MORTEFI_CHAR_ID, '莫特斐');
  if (id === YUNO_CHAR_ID) return createEmptyCharacterBuffTemplate(YUNO_CHAR_ID, '尤诺');
  if (id === SANHUA_CHAR_ID) return createEmptyCharacterBuffTemplate(SANHUA_CHAR_ID, '散华');
  if (id === JIANXIN_CHAR_ID) return createEmptyCharacterBuffTemplate(JIANXIN_CHAR_ID, '鉴心');
  if (id === CHOUYUAN_CHAR_ID) return createEmptyCharacterBuffTemplate(CHOUYUAN_CHAR_ID, '仇远');
  if (id === BAIZHI_CHAR_ID) return createEmptyCharacterBuffTemplate(BAIZHI_CHAR_ID, '白芷');
  if (id === ZHEZHI_CHAR_ID) return createEmptyCharacterBuffTemplate(ZHEZHI_CHAR_ID, '折枝');
  if (id === YINLIN_CHAR_ID) return createEmptyCharacterBuffTemplate(YINLIN_CHAR_ID, '吟霖');
  if (id === FLORO_CHAR_ID) return createEmptyCharacterBuffTemplate(FLORO_CHAR_ID, '弗洛洛');
  if (id === CANTARELLA_CHAR_ID) return createEmptyCharacterBuffTemplate(CANTARELLA_CHAR_ID, '坎特蕾拉');
  if (id === ROCOCO_CHAR_ID) return createEmptyCharacterBuffTemplate(ROCOCO_CHAR_ID, '洛可可');
  if (id === TAOQI_CHAR_ID) return createEmptyCharacterBuffTemplate(TAOQI_CHAR_ID, '桃祈');
  if (id === REBECCA_CHAR_ID) return createEmptyCharacterBuffTemplate(REBECCA_CHAR_ID, '丽贝卡');
  if (id === BULING_CHAR_ID) return createEmptyCharacterBuffTemplate(BULING_CHAR_ID, '卜灵');
  if (id === YOUHU_CHAR_ID) return createEmptyCharacterBuffTemplate(YOUHU_CHAR_ID, '釉瑚');
  if (id === CARTETHYIA_CHAR_ID) return createEmptyCharacterBuffTemplate(CARTETHYIA_CHAR_ID, '卡提希娅');
  if (id === XIAKONG_CHAR_ID) return createEmptyCharacterBuffTemplate(XIAKONG_CHAR_ID, '夏空');
  if (id === QIUSHUI_CHAR_ID) return createEmptyCharacterBuffTemplate(QIUSHUI_CHAR_ID, '秋水');
  if (id === LUMI_CHAR_ID) return createEmptyCharacterBuffTemplate(LUMI_CHAR_ID, '灯灯');
  if (id === ROVER_ELECTRO_CHAR_ID) {
    return createEmptyCharacterBuffTemplate(ROVER_ELECTRO_CHAR_ID, '漂泊者·导电');
  }
  if (id === ZANNI_CHAR_ID) return createEmptyCharacterBuffTemplate(ZANNI_CHAR_ID, '赞妮');
  if (id === LINNEI_CHAR_ID) return createEmptyCharacterBuffTemplate(LINNEI_CHAR_ID, '琳奈');
  if (id === LUCY_CHAR_ID) return createEmptyCharacterBuffTemplate(LUCY_CHAR_ID, '露西');
  if (id === LINGYANG_CHAR_ID) return createEmptyCharacterBuffTemplate(LINGYANG_CHAR_ID, '凌阳');
  if (id === VERINA_CHAR_ID) return createEmptyCharacterBuffTemplate(VERINA_CHAR_ID, '维里奈');
  if (id === CHUN_CHAR_ID) return createEmptyCharacterBuffTemplate(CHUN_CHAR_ID, '椿');
  if (id === LOSERA_CHAR_ID) return createEmptyCharacterBuffTemplate(LOSERA_CHAR_ID, '洛瑟菈');
  if (id === FEIXUE_CHAR_ID) return createEmptyCharacterBuffTemplate(FEIXUE_CHAR_ID, '绯雪');
  if (id === SUISUI_CHAR_ID) return createEmptyCharacterBuffTemplate(SUISUI_CHAR_ID, '穗穗');
  if (id === SHOREKEEPER_CHAR_ID) return createEmptyCharacterBuffTemplate(SHOREKEEPER_CHAR_ID, '守岸人');
  if (id === PHOEBE_CHAR_ID) return createEmptyCharacterBuffTemplate(PHOEBE_CHAR_ID, '菲比');
  if (id === QIANXIAO_CHAR_ID) return createEmptyCharacterBuffTemplate(QIANXIAO_CHAR_ID, '千咲');
  if (id === YANGYANG_XUANLING_CHAR_ID) {
    return createEmptyCharacterBuffTemplate(YANGYANG_XUANLING_CHAR_ID, '秧秧·玄翎');
  }
  if (id === LUHESI_CHAR_ID) return createEmptyCharacterBuffTemplate(LUHESI_CHAR_ID, '陆·赫斯');
  if (id === SIGRIKA_CHAR_ID) return createEmptyCharacterBuffTemplate(SIGRIKA_CHAR_ID, '西格莉卡');
  if (id === CHANGLI_CHAR_ID) return createEmptyCharacterBuffTemplate(CHANGLI_CHAR_ID, '长离');
  if (id === CHIXIA_CHAR_ID) return createEmptyCharacterBuffTemplate(CHIXIA_CHAR_ID, '炽霞');
  if (id === MONING_CHAR_ID) return createEmptyCharacterBuffTemplate(MONING_CHAR_ID, '莫宁');
  if (id === JIABEILINA_CHAR_ID) return createEmptyCharacterBuffTemplate(JIABEILINA_CHAR_ID, '嘉贝莉娜');
  if (id === BRANT_CHAR_ID) return createEmptyCharacterBuffTemplate(BRANT_CHAR_ID, '布兰特');
  if (id === JINGRAN_CHAR_ID) return createEmptyCharacterBuffTemplate(JINGRAN_CHAR_ID, '景燃');
  if (id === LUPA_CHAR_ID) return createEmptyCharacterBuffTemplate(LUPA_CHAR_ID, '露帕');
  return null;
}

function listCharacterBuffTemplates() {
  return [...getMergedTemplateMap().values()].sort((a, b) =>
    String(a.characterName || a.characterId).localeCompare(String(b.characterName || b.characterId), 'zh')
  );
}

function upsertLocalCharacterBuffTemplate(template) {
  const normalized = normalizeCharacterBuffTemplate(template);
  if (!normalized.characterId) return null;
  // 保存时 revision 至少比随包高，便于导出协作
  const bundled = (charBuffTemplateDb?.templates || []).find(
    (t) => String(t.characterId) === String(normalized.characterId)
  );
  const bundledRev = Math.max(0, Math.round(Number(bundled?.revision) || 0));
  if ((normalized.revision || 1) <= bundledRev) {
    normalized.revision = bundledRev + 1;
  }
  const lib = loadCharBuffTemplateLocal();
  const idx = lib.templates.findIndex((t) => String(t.characterId) === normalized.characterId);
  if (idx >= 0) lib.templates[idx] = normalized;
  else lib.templates.push(normalized);
  saveCharBuffTemplateLocal();
  return normalized;
}

/** 遍历角色模板内全部 Buff 条目（本体 / 模态 / 共鸣链 · 个人与全队，含链下模态） */
function forEachTemplateBuffEntry(tpl, fn) {
  if (!tpl || typeof fn !== 'function') return;
  const visit = (list, meta) => {
    (list || []).forEach((entry, index) => {
      if (entry && typeof entry === 'object') fn(entry, { ...meta, index, list });
    });
  };
  visit(tpl.personalBuffs, { scope: 'personal', location: 'root' });
  visit(tpl.teamBuffs, { scope: 'team', location: 'root' });
  Object.entries(tpl.combatModes || {}).forEach(([modeKey, block]) => {
    if (!block || typeof block !== 'object') return;
    visit(block.personalBuffs, { scope: 'personal', location: 'combatMode', modeKey });
    visit(block.teamBuffs, { scope: 'team', location: 'combatMode', modeKey });
  });
  Object.entries(tpl.resonanceChains || {}).forEach(([chainKey, block]) => {
    if (!block || typeof block !== 'object') return;
    visit(block.personalBuffs, { scope: 'personal', location: 'chain', chainKey });
    visit(block.teamBuffs, { scope: 'team', location: 'chain', chainKey });
    Object.entries(block.combatModes || {}).forEach(([modeKey, modeBlock]) => {
      if (!modeBlock || typeof modeBlock !== 'object') return;
      visit(modeBlock.personalBuffs, {
        scope: 'personal',
        location: 'chainCombatMode',
        chainKey,
        modeKey,
      });
      visit(modeBlock.teamBuffs, {
        scope: 'team',
        location: 'chainCombatMode',
        chainKey,
        modeKey,
      });
    });
  });
}

function findTemplateBuffEntryByKey(tpl, templateKey) {
  const key = String(templateKey || '').trim();
  if (!tpl || !key) return null;
  const cid = String(tpl.characterId || '').trim();
  const byChar = templateBuffKeyIndexByChar.get(cid);
  // 仅当 tpl 正是 merged 模板对象时才用索引；深拷/临时模板回退线性（避免改错对象）
  if (byChar && mergedTemplateRefByChar.get(cid) === tpl) {
    return byChar.get(key) || null;
  }
  let found = null;
  let foundMeta = null;
  forEachTemplateBuffEntry(tpl, (entry, meta) => {
    if (found) return;
    if (String(entry.templateKey || '').trim() === key) {
      found = entry;
      foundMeta = meta;
    }
  });
  return found ? { entry: found, meta: foundMeta } : null;
}

function findTemplateBuffEntryByName(tpl, name) {
  const n = String(name || '')
    .trim()
    .replace(/^【本体】/, '')
    .replace(/^\[本体\]/, '');
  if (!tpl || !n) return null;
  const cid = String(tpl.characterId || '').trim();
  const byChar = templateBuffNameIndexByChar.get(cid);
  const exactFromIndex =
    byChar && mergedTemplateRefByChar.get(cid) === tpl ? byChar.get(n) : null;
  if (exactFromIndex) return exactFromIndex;
  // 精确未命中（或非 merged 模板）时走原线性（精确 + 模糊），保持语义一致
  let exact = null;
  let exactMeta = null;
  let partial = null;
  let partialMeta = null;
  forEachTemplateBuffEntry(tpl, (entry, meta) => {
    const en = String(entry.name || '').trim();
    const dn = String(entry.displayName || '').trim();
    if (!exact && (en === n || dn === n)) {
      exact = entry;
      exactMeta = meta;
    }
    if (
      !partial &&
      n.length >= 4 &&
      (en.includes(n) || n.includes(en) || dn.includes(n) || n.includes(dn))
    ) {
      partial = entry;
      partialMeta = meta;
    }
  });
  if (exact) return { entry: exact, meta: exactMeta };
  return partial ? { entry: partial, meta: partialMeta } : null;
}

function describeTemplateBuffGameTextSource(meta) {
  if (!meta) return '角色本体模板';
  if (meta.location === 'chainCombatMode') {
    const chain = meta.chainKey || '?';
    const mode =
      typeof getCombatModeLabel === 'function'
        ? getCombatModeLabel(meta.modeKey)
        : meta.modeKey || '?';
    return `共鸣链 ${chain} · ${mode}模态`;
  }
  if (meta.location === 'chain') return `共鸣链 ${meta.chainKey || '?'}`;
  if (meta.location === 'combatMode') {
    const mode =
      typeof getCombatModeLabel === 'function'
        ? getCombatModeLabel(meta.modeKey)
        : meta.modeKey || '?';
    return `战斗模态 · ${mode}`;
  }
  return meta.scope === 'team' ? '全队 · 角色本体模板' : '角色本体模板';
}

function resolveBuffSourceCharacterId(buff) {
  if (!buff) return '';
  const direct = String(buff.sourceCharacterId || '').trim();
  if (direct) return direct;
  if (Number.isInteger(buff.sourceMemberIndex) && state?.members?.[buff.sourceMemberIndex]) {
    return String(state.members[buff.sourceMemberIndex].characterId || '').trim();
  }
  if (buff.teamSourceId && typeof ensureTeamSharedBuffs === 'function') {
    const src = ensureTeamSharedBuffs().buffs.find((b) => b.id === buff.teamSourceId);
    if (src && src !== buff) return resolveBuffSourceCharacterId(src);
  }
  if (buff.personalSourceId && Array.isArray(state?.members)) {
    for (const m of state.members) {
      const src = (m.buffs || []).find((b) => b.id === buff.personalSourceId);
      if (src) {
        if (src.characterId) return String(src.characterId).trim();
        if (m.characterId) return String(m.characterId).trim();
        return resolveBuffSourceCharacterId(src);
      }
    }
  }
  return '';
}

function lookupTemplateBuffGameText(buff) {
  const key = String(buff?.templateKey || '').trim();
  let characterId = resolveBuffSourceCharacterId(buff);
  if (!characterId && Array.isArray(state?.members)) {
    for (const m of state.members) {
      if ((m.buffs || []).some((b) => b.id === buff?.id) && m.characterId) {
        characterId = String(m.characterId);
        break;
      }
    }
  }
  const runtimeText = normalizeBuffGameText(buff?.gameText);
  if (!characterId) {
    return { text: runtimeText, characterId: '', sourceLabel: '', templateKey: key };
  }
  const tpl = getCharacterBuffTemplate(characterId);
  if (!tpl) {
    return { text: runtimeText, characterId, sourceLabel: '', templateKey: key };
  }
  const hit = key ? findTemplateBuffEntryByKey(tpl, key) : null;
  let text = normalizeBuffGameText(hit?.entry?.gameText ?? runtimeText);
  let sourceLabel = describeTemplateBuffGameTextSource(hit?.meta);
  // 键未命中或命中条目无文案时，按 Buff 名称回退匹配模板条目（修复本体 Buff 反查）
  if (!text) {
    const nameToMatch =
      String(buff?.name || '').trim() ||
      (typeof formatBuffDisplayName === 'function'
        ? String(formatBuffDisplayName(buff) || '').trim()
        : '');
    if (nameToMatch) {
      const byName = findTemplateBuffEntryByName(tpl, nameToMatch);
      if (byName?.entry) {
        const t = normalizeBuffGameText(byName.entry.gameText);
        if (t) {
          text = t;
          sourceLabel = describeTemplateBuffGameTextSource(byName.meta);
        }
      }
    }
  }
  // 终极兜底：直接从随包原始模板（不经 ensure / 本机覆盖）按 key 查文案
  if (!text && key && characterId) {
    const rawEntry = bundledEntryByChar.get(characterId)?.get(key);
    if (rawEntry) {
      const t = normalizeBuffGameText(rawEntry.gameText);
      if (t) {
        text = t;
        sourceLabel = describeTemplateBuffGameTextSource({ location: 'root' });
      }
    }
  }
  // 爱弥斯两条【固有2】共用原文案
  if (!text && isAmisInnate2TemplateKey(key)) {
    const altKey = key === AMIS_INNATE2_CRIT_KEY ? AMIS_INNATE2_DEEP_KEY : AMIS_INNATE2_CRIT_KEY;
    const alt = findTemplateBuffEntryByKey(tpl, altKey);
    text = normalizeBuffGameText(alt?.entry?.gameText);
    if (text) sourceLabel = '角色本体模板 · 固有2';
  }
  // 条目本身无文案时：按位置链号或名称中的「N链」回退到同链原文
  if (!text) {
    const chainN =
      resolveTemplateBuffChainNumber(hit?.entry || buff, hit?.meta) ||
      parseChainNumberFromBuffName(buff?.name) ||
      parseChainNumberFromBuffName(
        typeof formatBuffDisplayName === 'function' ? formatBuffDisplayName(buff) : ''
      );
    if (chainN) {
      text = getExistingChainGameTextFromTemplate(tpl, chainN);
      if (text && !sourceLabel) sourceLabel = `共鸣链 ${chainN}`;
      else if (text && sourceLabel === '角色本体模板') sourceLabel = `共鸣链 ${chainN}`;
    }
  }
  return {
    text,
    characterId,
    sourceLabel,
    templateKey: key || String(hit?.entry?.templateKey || '').trim(),
  };
}

/** 解析运行时 Buff 的游戏原文案（含模板回查） */
function getBuffGameTextInfo(buff) {
  const runtime = normalizeBuffGameText(buff?.gameText);
  const displayName =
    typeof formatBuffDisplayName === 'function'
      ? formatBuffDisplayName(buff)
      : String(buff?.name || '');

  // 武器生成 Buff：原文案 = 本机覆盖或武器库特效全文
  const weaponId =
    typeof resolveWeaponIdFromBuff === 'function'
      ? resolveWeaponIdFromBuff(buff)
      : String(buff?.weaponId || '').trim();
  const isWeapon =
    !!weaponId &&
    (typeof isWeaponGeneratedBuff === 'function'
      ? isWeaponGeneratedBuff(buff) || !!buff?.weaponId || !!buff?.weaponTeamBuff
      : !!buff?.weaponGenerated || !!buff?.weaponId || !!buff?.weaponTeamBuff);
  if (isWeapon && weaponId) {
    const refinement =
      typeof resolveWeaponRefinementForBuff === 'function'
        ? resolveWeaponRefinementForBuff(buff)
        : 1;
    // 优先本机覆盖 / 按精炼解析后的武器库原文；忽略仍含 {0} 的旧运行时草稿
    const fromLib =
      typeof getWeaponGameText === 'function' ? getWeaponGameText(weaponId, refinement) : '';
    const runtimeUsable = runtime && !/\{\d+\}/.test(runtime) ? runtime : '';
    const text = fromLib || runtimeUsable || '';
    const weaponDef = typeof findWeaponDef === 'function' ? findWeaponDef(weaponId) : null;
    return {
      kind: 'weapon',
      text,
      hasText: !!text,
      canEdit: true,
      characterId: '',
      templateKey: '',
      weaponId,
      echoSourceKind: '',
      echoSourceId: '',
      sourceLabel: weaponDef?.name
        ? `武器 · ${weaponDef.name} · R${refinement}`
        : `武器特效 · R${refinement}`,
      displayName,
    };
  }

  const echoSource =
    typeof resolveEchoGameTextSource === 'function' ? resolveEchoGameTextSource(buff) : null;
  if (echoSource?.id) {
    const text =
      runtime ||
      (typeof getEchoGameTextForSource === 'function' ? getEchoGameTextForSource(echoSource) : '') ||
      '';
    let sourceLabel = '声骸';
    if (echoSource.kind === 'echoSet') {
      const setDef = findEchoSetDef(echoSource.id);
      sourceLabel = setDef?.name ? `声骸套装 · ${setDef.name}` : '声骸套装';
    } else {
      const sp = findEchoSpecimen(echoSource.id);
      sourceLabel = sp?.name ? `主位声骸 · ${sp.name}` : '主位声骸';
    }
    return {
      kind: 'echo',
      text,
      hasText: !!text,
      canEdit: true,
      characterId: '',
      templateKey: '',
      weaponId: '',
      echoSourceKind: echoSource.kind,
      echoSourceId: echoSource.id,
      sourceLabel,
      displayName,
    };
  }

  const looked = lookupTemplateBuffGameText(buff);
  const text = runtime || looked.text || '';
  const isAmisInnate2Runtime =
    typeof isAmisModeBuff === 'function' &&
    isAmisModeBuff(buff) &&
    isAmisInnate2TemplateKey(buff?.templateKey);
  const canEdit =
    !!String(buff?.templateKey || '').trim() &&
    (isCharacterTemplateBuff(buff) ||
      !!buff?.teamSourceId ||
      !!buff?.personalSourceId ||
      buff?.sourceTag === CHAR_BUFF_TEMPLATE_SOURCE_TAG ||
      isAmisInnate2Runtime);
  return {
    kind: 'character',
    text,
    hasText: !!text,
    canEdit: canEdit && !!String(looked.templateKey || buff?.templateKey || '').trim(),
    characterId: looked.characterId || resolveBuffSourceCharacterId(buff) || (isAmisInnate2Runtime ? AMIS_CHAR_ID : ''),
    templateKey: String(looked.templateKey || buff?.templateKey || '').trim(),
    weaponId: '',
    echoSourceKind: '',
    echoSourceId: '',
    sourceLabel:
      looked.sourceLabel ||
      (isAmisInnate2Runtime ? '角色本体模板 · 固有2' : canEdit ? '角色本体模板' : ''),
    displayName,
  };
}

function syncGameTextToRuntimeBuffs(characterId, templateKey, gameText) {
  const key = String(templateKey || '').trim();
  const cid = String(characterId || '').trim();
  const text = normalizeBuffGameText(gameText);
  if (!key) return;
  const apply = (b) => {
    if (!b || String(b.templateKey || '').trim() !== key) return false;
    const bCid = resolveBuffSourceCharacterId(b);
    if (cid && bCid && bCid !== cid) return false;
    if (text) b.gameText = text;
    else delete b.gameText;
    return true;
  };
  (state?.members || []).forEach((m) => {
    (m.buffs || []).forEach(apply);
    (m.cycleConfig?.rounds || []).forEach((round) => {
      (round.buffs || []).forEach(apply);
    });
  });
  if (typeof ensureTeamSharedBuffs === 'function') {
    ensureTeamSharedBuffs().buffs.forEach(apply);
  }
}

/**
 * 将 gameText 写回本机角色模板并同步运行时。
 * 若目标属于共鸣链 N，则把同一文案扩散到该角色同链其它匹配条目（含各模态 / 名称带 N链 前缀）。
 * @returns {{ ok: boolean, reason?: string, text?: string, sourceLabel?: string, fanOutCount?: number }}
 */
function patchTemplateBuffGameText(characterId, templateKey, gameText) {
  const cid = String(characterId || '').trim();
  const key = String(templateKey || '').trim();
  if (!cid || !key) return { ok: false, reason: '缺少角色或 templateKey' };
  const base = getCharacterBuffTemplate(cid);
  if (!base) return { ok: false, reason: '未找到角色 Buff 模板' };
  // 深拷一份再改，避免直接改 merged 引用导致未入库
  const tpl = normalizeCharacterBuffTemplate(JSON.parse(JSON.stringify(base)));
  const hit = findTemplateBuffEntryByKey(tpl, key);
  if (!hit?.entry) return { ok: false, reason: '模板中未找到该 Buff' };
  const text = normalizeBuffGameText(gameText);
  if (text) hit.entry.gameText = text;
  else delete hit.entry.gameText;

  const syncedKeys = new Set([key]);
  let fanOutCount = 0;
  // 爱弥斯两条【固有2】共用原文案
  if (cid === AMIS_CHAR_ID && isAmisInnate2TemplateKey(key)) {
    const altKey = key === AMIS_INNATE2_CRIT_KEY ? AMIS_INNATE2_DEEP_KEY : AMIS_INNATE2_CRIT_KEY;
    const altHit = findTemplateBuffEntryByKey(tpl, altKey);
    if (altHit?.entry && !syncedKeys.has(altKey)) {
      if (text) altHit.entry.gameText = text;
      else delete altHit.entry.gameText;
      syncedKeys.add(altKey);
      fanOutCount += 1;
    }
  }
  const chainN = resolveTemplateBuffChainNumber(hit.entry, hit.meta);
  if (chainN) {
    if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
    const ck = String(chainN);
    if (!tpl.resonanceChains[ck] || typeof tpl.resonanceChains[ck] !== 'object') {
      tpl.resonanceChains[ck] = normalizeChainBlock({}, cid);
    }
    if (text) tpl.resonanceChains[ck].gameText = text;
    else delete tpl.resonanceChains[ck].gameText;
    forEachTemplateBuffEntry(tpl, (entry, meta) => {
      const ek = String(entry.templateKey || '').trim();
      if (!ek || syncedKeys.has(ek)) return;
      if (!templateBuffBelongsToChain(entry, meta, chainN)) return;
      if (text) entry.gameText = text;
      else delete entry.gameText;
      syncedKeys.add(ek);
      fanOutCount += 1;
    });
  }

  upsertLocalCharacterBuffTemplate(tpl);
  syncedKeys.forEach((k) => syncGameTextToRuntimeBuffs(cid, k, text));
  return {
    ok: true,
    text,
    sourceLabel: describeTemplateBuffGameTextSource(hit.meta),
    fanOutCount,
  };
}

/** 名称是否带有「N链」标记（剥净展示前缀后判断；任意位置出现即可） */
const CHAIN_MARKER_REGS = {
  1: /(?:^|[^0-9])1链/,
  2: /(?:^|[^0-9])2链/,
  3: /(?:^|[^0-9])3链/,
  4: /(?:^|[^0-9])4链/,
  5: /(?:^|[^0-9])5链/,
  6: /(?:^|[^0-9])6链/,
};
function buffNameHasChainMarker(name, chainN) {
  const n = Math.max(1, Math.min(6, Math.round(Number(chainN) || 0)));
  if (!n) return false;
  let s = String(name || '').trim();
  if (typeof stripManagedBuffSourcePrefixes === 'function') {
    s = stripManagedBuffSourcePrefixes(s);
  }
  if (!s) return false;
  // 避免「12链」误匹配「2链」：前一位不能是数字（预编译常量正则，结果与原 new RegExp 逐字节一致）
  return CHAIN_MARKER_REGS[n].test(s);
}

/** 从名称解析链号；无则 0（取名称中首次出现的 1～6 链） */
function parseChainNumberFromBuffName(name) {
  let s = String(name || '').trim();
  if (typeof stripManagedBuffSourcePrefixes === 'function') {
    s = stripManagedBuffSourcePrefixes(s);
  }
  const m = s.match(/(?:^|[^0-9])([1-6])链/);
  return m ? Number(m[1]) : 0;
}

/** 条目是否属于共鸣链 N（位置或名称前缀） */
function templateBuffBelongsToChain(entry, meta, chainN) {
  const n = String(Math.max(1, Math.min(6, Math.round(Number(chainN) || 0))));
  if (n === '0') return false;
  if (
    (meta?.location === 'chain' || meta?.location === 'chainCombatMode') &&
    String(meta.chainKey || '') === n
  ) {
    return true;
  }
  return buffNameHasChainMarker(entry?.name, n);
}

/** 解析条目所属链号：优先 meta.chainKey，其次名称 */
function resolveTemplateBuffChainNumber(entry, meta) {
  if (meta?.location === 'chain' || meta?.location === 'chainCombatMode') {
    const n = Math.round(Number(meta.chainKey) || 0);
    if (n >= 1 && n <= 6) return n;
  }
  return parseChainNumberFromBuffName(entry?.name) || 0;
}

/** 链块已有原文时，回填到同链仍缺文案的条目（批量填链后新插入的 Buff 常见） */
function backfillChainEntryGameTextsFromBlocks(tpl) {
  if (!tpl?.resonanceChains) return;
  for (let n = 1; n <= 6; n += 1) {
    const blockText = normalizeBuffGameText(tpl.resonanceChains[String(n)]?.gameText);
    if (!blockText) continue;
    forEachTemplateBuffEntry(tpl, (entry, meta) => {
      if (!templateBuffBelongsToChain(entry, meta, n)) return;
      if (!normalizeBuffGameText(entry?.gameText)) entry.gameText = blockText;
    });
  }
}

/**
 * ensure*Shape 后把代码补齐的模板落到本机库，避免刷新后链 Buff / 原文案丢失。
 * 已在本机则只 save（ensure 已就地改引用）；不在本机则 upsert。
 */
function persistEnsuredCharacterTemplate(tpl) {
  if (!tpl || !String(tpl.characterId || '').trim()) return;
  const id = String(tpl.characterId);
  const lib = loadCharBuffTemplateLocal();
  const idx = lib.templates.findIndex((t) => String(t.characterId) === id);
  if (idx < 0) {
    upsertLocalCharacterBuffTemplate(tpl);
    return;
  }
  if (lib.templates[idx] !== tpl) {
    lib.templates[idx] = tpl;
  }
  saveCharBuffTemplateLocal();
}

function getBundledCharacterBuffTemplate(charId) {
  const id = String(charId || '').trim();
  if (!id) return null;
  return bundledTemplateByChar.get(id) || null;
}

/** 读取模板中链 N 已有的非空原文案（链块 gameText 优先，否则任一条 Buff） */
function getExistingChainGameTextFromTemplate(tpl, chainN) {
  const n = String(Math.max(1, Math.min(6, Math.round(Number(chainN) || 0))));
  if (n === '0' || !tpl) return '';
  const blockText = normalizeBuffGameText(tpl.resonanceChains?.[n]?.gameText);
  if (blockText) return blockText;
  let found = '';
  forEachTemplateBuffEntry(tpl, (entry, meta) => {
    if (found) return;
    if (!templateBuffBelongsToChain(entry, meta, n)) return;
    const t = normalizeBuffGameText(entry.gameText);
    if (t) found = t;
  });
  return found;
}

/**
 * 按角色批量写入 1～6 链原文案到模板（同链位置含双模态 + 名称带链前缀）。
 * chainsByN: { "1": text, ... }；空文本跳过该链。
 * opts.overwriteExisting 默认 true。
 * @returns {{ ok: boolean, reason?: string, perChainCounts: Object, updatedKeys: string[], totalUpdated: number }}
 */
function patchCharacterChainGameTexts(characterId, chainsByN, opts = {}) {
  const cid = String(characterId || '').trim();
  if (!cid) return { ok: false, reason: '缺少角色 id', perChainCounts: {}, updatedKeys: [], totalUpdated: 0 };
  const base = getCharacterBuffTemplate(cid);
  if (!base) return { ok: false, reason: '未找到角色 Buff 模板', perChainCounts: {}, updatedKeys: [], totalUpdated: 0 };
  const tpl = normalizeCharacterBuffTemplate(JSON.parse(JSON.stringify(base)));
  const overwrite = opts.overwriteExisting !== false;
  const perChainCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const keyToText = new Map();

  for (let n = 1; n <= 6; n += 1) {
    const raw = chainsByN && (chainsByN[n] ?? chainsByN[String(n)]);
    const text = normalizeBuffGameText(raw);
    if (!text) continue;
    if (!tpl.resonanceChains) tpl.resonanceChains = emptyResonanceChains();
    const chainKey = String(n);
    if (!tpl.resonanceChains[chainKey] || typeof tpl.resonanceChains[chainKey] !== 'object') {
      tpl.resonanceChains[chainKey] = normalizeChainBlock({}, cid);
    }
    const prevBlock = normalizeBuffGameText(tpl.resonanceChains[chainKey].gameText);
    if ((overwrite || !prevBlock) && prevBlock !== text) {
      tpl.resonanceChains[chainKey].gameText = text;
      perChainCounts[n] += 1;
    }
    forEachTemplateBuffEntry(tpl, (entry, meta) => {
      if (!templateBuffBelongsToChain(entry, meta, n)) return;
      const prev = normalizeBuffGameText(entry.gameText);
      if (!overwrite && prev) return;
      if (prev === text) return;
      entry.gameText = text;
      perChainCounts[n] += 1;
      const key = String(entry.templateKey || '').trim();
      if (key) keyToText.set(key, text);
    });
  }

  const updatedKeys = [...keyToText.keys()];
  const totalUpdated = Object.values(perChainCounts).reduce((a, b) => a + b, 0);
  if (!totalUpdated) {
    return {
      ok: true,
      perChainCounts,
      updatedKeys,
      totalUpdated: 0,
      reason: '没有可写入的条目（请确认模板里已有对应链 Buff，或名称含「N链」）',
    };
  }

  upsertLocalCharacterBuffTemplate(tpl);
  keyToText.forEach((text, key) => syncGameTextToRuntimeBuffs(cid, key, text));

  return { ok: true, perChainCounts, updatedKeys, totalUpdated };
}

function mergeImportedCharacterBuffTemplates(templates, opts) {
  const force = !!opts?.force;
  const lib = loadCharBuffTemplateLocal();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  (templates || []).forEach((raw) => {
    const incoming = normalizeCharacterBuffTemplate(raw);
    if (!incoming.characterId) return;
    const idx = lib.templates.findIndex((t) => String(t.characterId) === incoming.characterId);
    if (idx < 0) {
      lib.templates.push(incoming);
      added += 1;
      return;
    }
    const cur = lib.templates[idx];
    if (!force && (incoming.revision || 0) < (cur.revision || 0)) {
      skipped += 1;
      return;
    }
    if (!force && (incoming.revision || 0) === (cur.revision || 0)) {
      incoming.revision = (cur.revision || 1) + 1;
    }
    lib.templates[idx] = incoming;
    updated += 1;
  });
  saveCharBuffTemplateLocal();
  return { added, updated, skipped };
}

function buildCharacterBuffTemplatePack(charId, templateOverride) {
  const tpl = templateOverride
    ? normalizeCharacterBuffTemplate(templateOverride)
    : getCharacterBuffTemplate(charId);
  if (!tpl) throw new Error('未找到该角色模板');
  return {
    version: 1,
    kind: 'character-buff-template-pack',
    exportedAt: new Date().toISOString(),
    template: normalizeCharacterBuffTemplate(tpl),
  };
}

function buildCharacterBuffTemplatesPack(charIds) {
  const map = getMergedTemplateMap();
  const ids = Array.isArray(charIds) && charIds.length ? charIds.map(String) : [...map.keys()];
  const templates = ids.map((id) => map.get(id)).filter(Boolean).map(normalizeCharacterBuffTemplate);
  return {
    version: 1,
    kind: 'character-buff-templates-pack',
    exportedAt: new Date().toISOString(),
    templates,
  };
}

function parseCharacterBuffTemplateImport(data) {
  if (!data || typeof data !== 'object') throw new Error('无效的模板包');
  if (data.kind === 'character-buff-template-pack' && data.template) {
    return [normalizeCharacterBuffTemplate(data.template)];
  }
  if (data.kind === 'character-buff-templates-pack' || data.kind === 'character-buff-templates') {
    return (data.templates || []).map(normalizeCharacterBuffTemplate);
  }
  if (data.template) return [normalizeCharacterBuffTemplate(data.template)];
  if (Array.isArray(data.templates)) return data.templates.map(normalizeCharacterBuffTemplate);
  if (data.characterId) return [normalizeCharacterBuffTemplate(data)];
  throw new Error('无法识别的模板包格式');
}

function downloadCharacterBuffTemplatePack(pkg, filename) {
  const name = filename || sanitizeFileName(pkg.template?.characterName || pkg.meta?.name || '角色Buff模板');
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.json') ? name : `${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isCharacterTemplateBuff(buff) {
  if (!buff) return false;
  // 仅角色模板物化条目；爱弥斯固有2 / 集谐 / 武器等虽可能带 templateKey，但不走 soft-rebuild
  if (buff.sourceTag === CHAR_BUFF_TEMPLATE_SOURCE_TAG) return true;
  // 遗留存档：有 templateKey、无系统 sourceTag
  if (!buff.templateKey || buff.sourceTag) return false;
  return true;
}

function normalizeResonanceUnlocked(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(6, n));
}

/** 角色模板 Buff 的稳定 id：刷新/重建不再 genId，避免多轮 catalogStacks 对不上。 */
function sanitizeBuffIdToken(s) {
  return String(s || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function makeTemplateBuffStableId(ctx) {
  const key = sanitizeBuffIdToken(ctx?.templateKey);
  if (!key) return genId();
  const scope = ctx?.scope === 'team' ? 'tb' : 'pk';
  const slot = Number.isInteger(ctx?.memberIndex) ? ctx.memberIndex : 0;
  const mode = sanitizeBuffIdToken(ctx?.combatModeKey);
  return mode ? `${scope}_${slot}_${key}__${mode}` : `${scope}_${slot}_${key}`;
}

function materializeTemplateBuff(entry, ctx) {
  const characterId = String(ctx?.characterId || '');
  const memberIndex = Number.isInteger(ctx?.memberIndex) ? ctx.memberIndex : null;
  const scope = ctx?.scope === 'team' ? 'team' : 'personal';
  const prepared = normalizeTemplateBuffEntry(entry);
  let id = makeTemplateBuffStableId({
    templateKey: prepared.templateKey,
    combatModeKey: ctx?.combatModeKey,
    memberIndex,
    scope,
  });
  if (ctx?.usedIds?.has(id)) id = genId();
  ctx?.usedIds?.add(id);
  const buff = normalizeBuff({
    ...prepared,
    id,
    name: withManagedBuffSourcePrefix(prepared.name || '来源', '【本体】'),
    sourceTag: CHAR_BUFF_TEMPLATE_SOURCE_TAG,
    templateKey: prepared.templateKey,
    sourceCharacterId: characterId,
  });
  if (scope === 'team' && memberIndex != null) buff.sourceMemberIndex = memberIndex;
  if (prepared.excludeSource) buff.excludeSource = true;
  if (prepared.stackSync) buff.stackSync = prepared.stackSync;
  if (prepared.activeSync) buff.activeSync = prepared.activeSync;
  if (Array.isArray(prepared.onlyCharacterIds) && prepared.onlyCharacterIds.length) {
    buff.onlyCharacterIds = prepared.onlyCharacterIds
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  }
  let gameText = normalizeBuffGameText(prepared.gameText);
  // 兜底：模板条目被 ensure/本机覆盖清空文案时，从随包原始数据按 key 补
  if (!gameText && prepared.templateKey && characterId) {
    const rawEntry = bundledEntryByChar.get(characterId)?.get(prepared.templateKey);
    if (rawEntry) gameText = normalizeBuffGameText(rawEntry.gameText);
  }
  if (gameText) buff.gameText = gameText;
  else delete buff.gameText;
  if (Array.isArray(prepared.effects)) {
    buff.effects = prepared.effects.map((fx) => normalizeCompositeEffect({ ...fx, id: genId() }));
  }
  const modeKey = String(ctx?.combatModeKey || '').trim();
  if (modeKey) buff.combatModeKey = modeKey;
  else delete buff.combatModeKey;
  return buff;
}

/**
 * 卸下角色模板 Buff。soft=true 时保留编辑轴/目录上的层数与勾选键，
 * 供 apply 重建后按 templateKey/名称 remap 到新 id（避免切共鸣链清空层数）。
 */
function clearCharacterTemplateBuffsForSlot(member, opts) {
  if (!member) return { personalRemoved: [], teamRemoved: [] };
  ensureMemberUiState(member, { light: true });
  const soft = !!opts?.soft;
  const memberIndex = getMemberIndex(member);
  const personalRemoved = [];
  (member.buffs || []).forEach((b) => {
    if (b.teamSourceId || !isCharacterTemplateBuff(b)) return;
    // 爱弥斯固有2 由模态 kit 管理（固定 id 重建），模板清理不参与，
    // 否则 remap 找不到新条目会 purge 掉技能级手动关闭，导致刷新后误开
    if (typeof isAmisInnate2TemplateKey === 'function' && isAmisInnate2TemplateKey(String(b.templateKey || ''))) {
      return;
    }
    personalRemoved.push({
      id: b.id,
      templateKey: String(b.templateKey || ''),
      name: String(b.name || '').trim(),
      combatModeKey: String(b.combatModeKey || '').trim(),
    });
  });
  const removeIds = new Set(personalRemoved.map((x) => x.id));
  if (removeIds.size) {
    member.buffs = (member.buffs || []).filter((b) => !removeIds.has(b.id));
    if (soft) {
      // 仅摘掉 active；层数键留给 remap / 快照写到新 id，避免先删导致层数丢失
      removeIds.forEach((id) => {
        if (member.globalBuffActive) delete member.globalBuffActive[id];
      });
    } else {
      removeIds.forEach((id) => purgeMemberBuffReferences(member, id, { allRounds: true }));
    }
  }
  const shared = ensureTeamSharedBuffs();
  const teamRemoved = [];
  const teamToRemove = shared.buffs.filter(
    (b) => isCharacterTemplateBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex
  );
  if (soft) {
    const teamIds = new Set(teamToRemove.map((b) => b.id));
    teamToRemove.forEach((b) => {
      teamRemoved.push({
        id: b.id,
        templateKey: String(b.templateKey || ''),
        name: String(b.name || '').trim(),
        combatModeKey: String(b.combatModeKey || '').trim(),
        mirrorIdsByMember: (state.members || []).map((m) => {
          const mir = (m.buffs || []).find((x) => x.teamSourceId === b.id);
          return mir ? mir.id : null;
        }),
      });
    });
    shared.buffs = shared.buffs.filter((b) => !teamIds.has(b.id));
    invalidateSharedBuffsCache();
    teamIds.forEach((id) => {
      delete shared.globalBuffActive[id];
      // 保留 shared.globalBuffStacks[id] 供后续 remap / 快照
    });
    (state.members || []).forEach((m) => {
      const mirrorIds = (m.buffs || [])
        .filter((b) => b.teamSourceId && teamIds.has(b.teamSourceId))
        .map((b) => b.id);
      if (!mirrorIds.length) return;
      const drop = new Set(mirrorIds);
      m.buffs = (m.buffs || []).filter((b) => !drop.has(b.id));
      mirrorIds.forEach((id) => {
        if (m.globalBuffActive) delete m.globalBuffActive[id];
      });
    });
  } else {
    teamToRemove.slice().forEach((b) => deleteTeamSharedBuff(b.id));
  }
  return { personalRemoved, teamRemoved };
}

/** 将编辑轴等处的旧 Buff id 映射到重建后的新 id（优先 templateKey+模态，其次同名+模态） */
function remapTemplateBuffAxisIds(member, removedList, newBuffs, opts) {
  if (!member || !removedList?.length) return;
  const used = new Set();
  const modeOf = (b) => String(b?.combatModeKey || '').trim();
  // 单次调用内预建 4 桶，保留原 4 级匹配优先级与「首次未使用」语义
  const keyMode = [];
  const keyAny = [];
  const nameMode = [];
  const nameAny = [];
  (newBuffs || []).forEach((b) => {
    if (b?.templateKey) {
      keyMode.push(b);
      keyAny.push(b);
    }
    if (String(b?.name || '').trim()) {
      nameMode.push(b);
      nameAny.push(b);
    }
  });
  const pick = (bucket, pred) => {
    for (let i = 0; i < bucket.length; i += 1) {
      const b = bucket[i];
      if (!used.has(b.id) && pred(b)) return b;
    }
    return null;
  };
  const findNew = (old) => {
    const oldMode = modeOf(old);
    if (old.templateKey) {
      const byKey = pick(
        keyMode,
        (b) => String(b.templateKey || '') === old.templateKey && modeOf(b) === oldMode
      );
      if (byKey) return byKey;
      // 模态不一致时按裸 templateKey 兜底（刷新重套时常出现）
      const byKeyAnyMode = pick(
        keyAny,
        (b) => String(b.templateKey || '') === old.templateKey
      );
      if (byKeyAnyMode) return byKeyAnyMode;
    }
    if (old.name) {
      const byName = pick(
        nameMode,
        (b) => String(b.name || '').trim() === old.name && modeOf(b) === oldMode
      );
      if (byName) return byName;
      return pick(nameAny, (b) => String(b.name || '').trim() === old.name);
    }
    return null;
  };
  removedList.forEach((old) => {
    const neu = findNew(old);
    if (neu) {
      used.add(neu.id);
      remapMemberBuffReferences(member, old.id, neu.id, opts);
    } else {
      purgeMemberBuffReferences(member, old.id, opts);
    }
  });
}

/** 全队模板 Buff 重建后，先把各成员「排除列表」里的旧 id 迁到新 id。
 * 必须在 syncTeamBuffsToMembers 之前执行——否则该同步会把旧 id 当孤儿清掉，
 * 原本排除的全队加成（如延奏·露帕对嘉贝莉娜）会意外生效，导入/刷新后伤害虚增（数值漂移根因）。 */
function migrateTeamTemplateBuffExcludedIds(memberIndex, teamRemoved) {
  if (!Array.isArray(teamRemoved) || !teamRemoved.length) return;
  const shared = ensureTeamSharedBuffs();
  const modeOf = (b) => String(b?.combatModeKey || '').trim();
  teamRemoved.forEach((old) => {
    let neu = null;
    const oldMode = modeOf(old);
    if (old.templateKey) {
      neu = shared.buffs.find(
        (b) =>
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.templateKey || '') === old.templateKey &&
          modeOf(b) === oldMode
      );
    }
    if (!neu && old.name) {
      neu = shared.buffs.find(
        (b) =>
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.name || '').trim() === old.name &&
          modeOf(b) === oldMode
      );
    }
    (state.members || []).forEach((m) => {
      if (Array.isArray(m.excludedTeamBuffIds)) {
        const idx = m.excludedTeamBuffIds.indexOf(old.id);
        if (idx >= 0) {
          if (neu) m.excludedTeamBuffIds[idx] = neu.id;
          else m.excludedTeamBuffIds.splice(idx, 1);
        }
      }
      if (Array.isArray(m.manuallyExcludedTeamBuffIds)) {
        const idx = m.manuallyExcludedTeamBuffIds.indexOf(old.id);
        if (idx >= 0) {
          if (neu) m.manuallyExcludedTeamBuffIds[idx] = neu.id;
          else m.manuallyExcludedTeamBuffIds.splice(idx, 1);
        }
      }
    });
  });
}

function remapTeamTemplateBuffAxisIds(memberIndex, teamRemoved) {
  if (!teamRemoved?.length) return;
  const shared = ensureTeamSharedBuffs();
  const usedShared = new Set();
  const modeOf = (b) => String(b?.combatModeKey || '').trim();
  teamRemoved.forEach((old) => {
    let neu = null;
    const oldMode = modeOf(old);
    if (old.templateKey) {
      neu = shared.buffs.find(
        (b) =>
          !usedShared.has(b.id) &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.templateKey || '') === old.templateKey &&
          modeOf(b) === oldMode
      );
    }
    if (!neu && old.name) {
      neu = shared.buffs.find(
        (b) =>
          !usedShared.has(b.id) &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.name || '').trim() === old.name &&
          modeOf(b) === oldMode
      );
    }
    // 模态 key 对不上时再按裸 templateKey / 名称兜底
    if (!neu && old.templateKey) {
      neu = shared.buffs.find(
        (b) =>
          !usedShared.has(b.id) &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.templateKey || '') === old.templateKey
      );
    }
    if (!neu && old.name) {
      neu = shared.buffs.find(
        (b) =>
          !usedShared.has(b.id) &&
          isCharacterTemplateBuff(b) &&
          getTeamBuffSourceMemberIndex(b) === memberIndex &&
          String(b.name || '').trim() === old.name
      );
    }
    if (neu) {
      usedShared.add(neu.id);
      transferStackMapEntry(shared.globalBuffStacks, old.id, neu.id);
      transferBoolMapEntry(shared.globalBuffActive, old.id, neu.id);
    }
    (state.members || []).forEach((m, mi) => {
      const oldMirror = old.mirrorIdsByMember?.[mi];
      if (!oldMirror) return;
      const newMirror = neu ? (m.buffs || []).find((b) => b.teamSourceId === neu.id) : null;
      if (newMirror) {
        remapMemberBuffReferences(m, oldMirror, newMirror.id, { allRounds: true });
      } else {
        purgeMemberBuffReferences(m, oldMirror, { allRounds: true });
      }
    });
  });
}

function templateBuffSnapIdentity(templateKey, combatModeKey, name) {
  const mode = String(combatModeKey || '').trim();
  const key = String(templateKey || '').trim();
  const n = String(name || '').trim();
  return {
    keyId: key ? (mode ? `${mode}::${key}` : key) : '',
    nameId: n ? (mode ? `${mode}::${n}` : n) : '',
  };
}

function tagTemplateBuffEntries(entries, combatModeKey) {
  const mode = String(combatModeKey || '').trim();
  return (entries || []).map((entry) => ({ entry, combatModeKey: mode }));
}

function collectTemplateBuffLists(tpl, resonanceUnlocked, combatMode, opts) {
  const personal = tagTemplateBuffEntries(tpl.personalBuffs, '');
  const team = tagTemplateBuffEntries(tpl.teamBuffs, '');
  const charId = String(opts?.characterId || '').trim();
  const modesToLoad =
    opts?.allCombatModes && getCharCombatModeConfig(charId)?.modes?.length
      ? [...getCharCombatModeConfig(charId).modes]
      : (() => {
          const modeKey = String(combatMode || '').trim();
          return modeKey ? [modeKey] : [];
        })();

  const appendModeBlock = (block, modeKey) => {
    if (!block || typeof block !== 'object') return;
    personal.push(...tagTemplateBuffEntries(block.personalBuffs, modeKey));
    team.push(...tagTemplateBuffEntries(block.teamBuffs, modeKey));
  };

  modesToLoad.forEach((modeKey) => {
    if (!modeKey) return;
    appendModeBlock(tpl.combatModes?.[modeKey], modeKey);
  });

  const n = normalizeResonanceUnlocked(resonanceUnlocked);
  for (let i = 1; i <= n; i += 1) {
    const chain = tpl.resonanceChains?.[String(i)];
    if (!chain) continue;
    personal.push(...tagTemplateBuffEntries(chain.personalBuffs, ''));
    team.push(...tagTemplateBuffEntries(chain.teamBuffs, ''));
    modesToLoad.forEach((modeKey) => {
      if (!modeKey) return;
      appendModeBlock(chain.combatModes?.[modeKey], modeKey);
    });
  }
  return { personal, team };
}

function snapshotTemplateBuffStateByKey(buffs, activeMap, stackMap, pred) {
  const activeByKey = {};
  const stacksByKey = {};
  const activeByName = {};
  const stacksByName = {};
  (buffs || []).forEach((b) => {
    if (!pred(b)) return;
    const key = String(b.templateKey || '');
    const name = String(b.name || '').trim();
    const ids = templateBuffSnapIdentity(key, b.combatModeKey, name);
    const writeActive = (map, id) => {
      if (!id || !activeMap || activeMap[b.id] === undefined) return;
      map[id] = !!activeMap[b.id];
    };
    const writeStacks = (map, id) => {
      if (!id || !stackMap || stackMap[b.id] === undefined) return;
      map[id] = normalizeStackInput(stackMap[b.id], b);
    };
    writeActive(activeByKey, ids.keyId);
    writeStacks(stacksByKey, ids.keyId);
    writeActive(activeByName, ids.nameId);
    writeStacks(stacksByName, ids.nameId);
    // 同时写入无模态前缀的裸 key，便于与爱弥斯固有2等无 combatModeKey 条目互认
    if (key && ids.keyId && ids.keyId !== key) {
      writeActive(activeByKey, key);
      writeStacks(stacksByKey, key);
    }
    if (name && ids.nameId && ids.nameId !== name) {
      writeActive(activeByName, name);
      writeStacks(stacksByName, name);
    }
  });
  return { activeByKey, stacksByKey, activeByName, stacksByName };
}

function lookupTemplateBuffSnapValue(snapMapByKey, snapMapByName, key, name) {
  const lookup = (map, id) => {
    if (!id || !map) return undefined;
    if (map[id] !== undefined) return map[id];
    const sep = id.indexOf('::');
    if (sep >= 0) {
      const bare = id.slice(sep + 2);
      if (bare && map[bare] !== undefined) return map[bare];
      return undefined;
    }
    // 裸 key → 任意「模态::裸 key」
    const suffix = `::${id}`;
    for (const k of Object.keys(map)) {
      if (k.endsWith(suffix)) return map[k];
    }
    return undefined;
  };
  const byKey = lookup(snapMapByKey, key);
  if (byKey !== undefined) return byKey;
  return lookup(snapMapByName, name);
}

function applyCharacterBuffTemplate(member, charId, opts) {
  if (!member) return false;
  const charIdStr = String(charId || member.characterId || '').trim();
  if (!charIdStr) return false;
  ensureMemberUiState(member, { light: true });
  const prevResonance = normalizeResonanceUnlocked(member.resonanceUnlocked);
  const resonance =
    opts?.resonanceUnlocked !== undefined
      ? normalizeResonanceUnlocked(opts.resonanceUnlocked)
      : prevResonance;
  member.resonanceUnlocked = resonance;
  if (charIdStr === SIGRIKA_CHAR_ID) member._sigrikaTalentPrevResonance = prevResonance;
  const memberIndex = getMemberIndex(member);
  const shared = ensureTeamSharedBuffs();
  if (charIdStr === MONING_CHAR_ID) migrateMoningSelfChainBuffs(member, shared);
  const personalSnap = snapshotTemplateBuffStateByKey(
    member.buffs,
    member.globalBuffActive,
    member.globalBuffStacks,
    (b) => !b.teamSourceId && isCharacterTemplateBuff(b)
  );
  const teamSnap = snapshotTemplateBuffStateByKey(
    shared.buffs,
    shared.globalBuffActive,
    shared.globalBuffStacks,
    (b) => isCharacterTemplateBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex
  );
  const loseraRecipients = charIdStr === LOSERA_CHAR_ID ? (state.members || []).map((target) => {
    const mirror = (target.buffs || []).find((b) => isLoseraEchoBianjiaoBuff(b) && b.teamSourceId &&
      shared.buffs.some((src) => src.id === b.teamSourceId && window.__WC.getTeamBuffSourceMemberIndex(src) === memberIndex));
    return mirror ? { target, active: target.globalBuffActive?.[mirror.id], stacks: target.globalBuffStacks?.[mirror.id] } : null;
  }).filter(Boolean) : [];
  const luhesiLegacyC5 = charIdStr === LUHESI_CHAR_ID
    ? member.buffs.find((b) => b.templateKey === 'tpl_ms05xtb1_mu9sa' &&
      b.effects?.some((fx) => fx.zone === 'multBoost')) : null;
  const luhesiLegacyC5Active = luhesiLegacyC5
    ? member.globalBuffActive[luhesiLegacyC5.id + '::multBoost'] ?? member.globalBuffActive[luhesiLegacyC5.id] : undefined;
  const { personalRemoved, teamRemoved } = clearCharacterTemplateBuffsForSlot(member, {
    soft: true,
  });
  let tpl = null;
  if (opts?.template) {
    // opts.template 覆盖路径不缓存（保持深拷 + 规范化）
    tpl = normalizeCharacterBuffTemplate(JSON.parse(JSON.stringify(opts.template)));
  } else {
    const rawTpl = getCharacterBuffTemplate(charIdStr);
    if (rawTpl) {
      const revision = Math.max(1, Math.round(Number(rawTpl?.revision) || 1));
      const cacheKey = charIdStr + '\u0000' + revision;
      const cached = normalizedTemplateCache.get(cacheKey);
      if (cached) {
        tpl = cached;
      } else {
        tpl = normalizeCharacterBuffTemplate(JSON.parse(JSON.stringify(rawTpl)));
        normalizedTemplateCache.set(cacheKey, tpl);
      }
    }
  }
  if (!tpl) {
    personalRemoved.forEach((old) => purgeMemberBuffReferences(member, old.id, { allRounds: true }));
    remapTeamTemplateBuffAxisIds(memberIndex, teamRemoved);
    clearCharacterTemplateExtraSkillsForSlot(memberIndex);
    syncCharBranchPanelSources(member);
    computeSpecialSkills();
    if (!(window.__WC && window.__WC.__deferMemberRebind)) syncTeamBuffsToMembers(); // PROBE_FIX_DEFER_MEMBER_REBIND
    return false;
  }
  const combatMode =
    opts?.combatMode !== undefined
      ? opts.combatMode
      : member.combatMode || normalizeCombatModeId(null, getCharCombatModeConfig(charIdStr));
  // 菲比：两模态 Buff 同时载入，编轴按技能/阶段解析模态再过滤
  const hybridAllModes = charIdStr === PHOEBE_CHAR_ID;
  const { personal, team } = collectTemplateBuffLists(tpl, resonance, combatMode, {
    characterId: charIdStr,
    allCombatModes: hybridAllModes,
  });
  const newPersonalBuffs = [];
  const usedPersonalIds = new Set();
  personal.forEach((tagged) => {
    const entry = tagged?.entry || tagged;
    const modeKey = tagged?.combatModeKey || '';
    // 固有2 由模态 kit 管理，模板条目只存原文案，不物化以免双份
    if (charIdStr === AMIS_CHAR_ID && isAmisInnate2TemplateKey(entry?.templateKey)) return;
    const buff = materializeTemplateBuff(entry, {
      characterId: charIdStr,
      memberIndex,
      scope: 'personal',
      combatModeKey: modeKey,
      usedIds: usedPersonalIds,
    });
    if (!normalizeBuffGameText(buff.gameText)) {
      const chainN =
        parseChainNumberFromBuffName(entry?.name) || parseChainNumberFromBuffName(buff.name);
      const chainText = chainN ? getExistingChainGameTextFromTemplate(tpl, chainN) : '';
      if (chainText) buff.gameText = chainText;
    }
    const key = String(entry.templateKey || buff.templateKey || '');
    const name = String(entry.name || buff.name || '').trim();
    const ids = templateBuffSnapIdentity(key, modeKey, name);
    member.buffs.push(buff);
    newPersonalBuffs.push(buff);
    let snapActive = lookupTemplateBuffSnapValue(
      personalSnap.activeByKey,
      personalSnap.activeByName,
      ids.keyId,
      ids.nameId
    );
    // 长离固有2拆分：新「焰羽攻击」无历史快照时，继承旧复合 changli_innate2 的开关状态，
    // 保证旧方案拆分前后勾选一致（旧开→两个都开；旧关→两个都关）。
    if (
      snapActive === undefined &&
      charIdStr === CHANGLI_CHAR_ID &&
      key === CHANGLI_INNATE2_ATTACK_KEY
    ) {
      const legacy = lookupTemplateBuffSnapValue(
        personalSnap.activeByKey,
        personalSnap.activeByName,
        CHANGLI_INNATE2_KEY,
        ''
      );
      if (legacy !== undefined) snapActive = legacy;
    }
    // 锁暝禁锁契主拆分：旧方案的统一开关只作为新暴伤 Buff 的初始状态。
    // 此后两条 Buff 各有独立 templateKey / id，开关互不联动。
    if (snapActive === undefined && charIdStr === '1312' && key === 'suoming_innate2_jinsuo_critdmg') {
      snapActive = lookupTemplateBuffSnapValue(
        personalSnap.activeByKey,
        personalSnap.activeByName,
        'suoming_innate2_jinsuo',
        ''
      );
    }
    const entryDefaultActive =
      entry.defaultActive !== undefined ? !!entry.defaultActive : true;
    member.globalBuffActive[buff.id] = snapActive !== undefined ? snapActive : entryDefaultActive;
    if (isStackBuff(buff)) {
      const snapStacks = lookupTemplateBuffSnapValue(
        personalSnap.stacksByKey,
        personalSnap.stacksByName,
        ids.keyId,
        ids.nameId
      );
      if (snapStacks !== undefined) {
        member.globalBuffStacks[buff.id] = snapStacks;
      } else if (entry.defaultStacks !== undefined) {
        member.globalBuffStacks[buff.id] = normalizeStackInput(entry.defaultStacks, buff);
      } else if (charIdStr === SIGRIKA_CHAR_ID && isSigrikaTalentBuff(buff)) {
        member.globalBuffStacks[buff.id] = getSigrikaTalentDefaultStacks(resonance);
      }
      // 否则先不写 0，留给 remap 从旧 id 迁层数
    }
  });
  // 5链拆分首次升级：继承旧倍率乘区开关，包括逐轮、阶段、技能和Hit覆盖。
  if (charIdStr === LUHESI_CHAR_ID) {
    const legacy = luhesiLegacyC5;
    const bonus = newPersonalBuffs.find((b) => b.templateKey === 'tpl_ms05xtb1_mu9sa');
    const mult = newPersonalBuffs.find((b) => b.templateKey === 'luhesi_c5_liujin_mult');
    if (legacy && bonus && mult) {
      const migrate = (node) => {
        if (!node || typeof node !== 'object') return;
        ['globalBuffActive', 'buffActive', 'frozenBuffActive'].forEach((field) => {
          const map = node[field];
          if (!map) return;
          const oldValue = node === member ? luhesiLegacyC5Active
            : map[legacy.id + '::multBoost'] ?? map[legacy.id];
          if (oldValue !== undefined && (node === member || map[mult.id] === undefined)) {
            map[mult.id] = !!oldValue;
          }
        });
        if (node !== member && Array.isArray(node.buffs)) {
          const index = node.buffs.findIndex((b) => b.templateKey === legacy.templateKey);
          if (index >= 0 && node.buffs[index].effects?.some((fx) => fx.zone === 'multBoost')) {
            node.buffs[index] = JSON.parse(JSON.stringify(bonus));
            if (!node.buffs.some((b) => b.templateKey === mult.templateKey)) {
              node.buffs.push(JSON.parse(JSON.stringify(mult)));
            }
          }
        }
        ['phases', 'skills', 'hits'].forEach((field) => (node[field] || []).forEach(migrate));
        (node.cycleConfig?.rounds || []).forEach(migrate);
      };
      migrate(member);
    }
  }
  const loseraTeam = charIdStr === LOSERA_CHAR_ID
    ? team.find((tagged) => isLoseraEchoBianjiaoBuff(tagged.entry || tagged)) : null;
  let loseraMirror = null;
  if (loseraTeam) {
    const entry = loseraTeam.entry || loseraTeam;
    const modeKey = loseraTeam.combatModeKey || '';
    const sourceId = makeTemplateBuffStableId({ templateKey: entry.templateKey, combatModeKey: modeKey, memberIndex, scope: 'team' });
    loseraMirror = { id: window.__WC.makeTeamMirrorBuffId(sourceId), templateKey: entry.templateKey, combatModeKey: modeKey };
    // Only seed the new shared identity; existing team choices take precedence.
    ['activeByKey', 'stacksByKey'].forEach((field) => {
      [entry.templateKey, modeKey + '::' + entry.templateKey].forEach((key) => {
        if (teamSnap[field][key] === undefined && personalSnap[field][key] !== undefined) teamSnap[field][key] = personalSnap[field][key];
      });
    });
    const active = lookupTemplateBuffSnapValue(personalSnap.activeByKey, personalSnap.activeByName, entry.templateKey, '');
    if (member.globalBuffActive[loseraMirror.id] === undefined && active !== undefined) member.globalBuffActive[loseraMirror.id] = active;
  }
  remapTemplateBuffAxisIds(member, personalRemoved, loseraMirror ? [...newPersonalBuffs, loseraMirror] : newPersonalBuffs, { allRounds: true });
  if (loseraMirror) {
    personalRemoved.filter((b) => b.templateKey === LOSERA_ECHO_BIANJIAO_KEY).forEach((old) => {
      // Team sync may reload the active snapshot; migrate its separate phase copy too.
      (member.cycleConfig?.rounds || []).forEach((round) => {
        window.__WC.remapMemberBuffReferences({ phases: round.phases }, old.id, loseraMirror.id);
      });
    });
  }
  newPersonalBuffs.forEach((buff) => {
    if (!isStackBuff(buff)) return;
    if (member.globalBuffStacks[buff.id] === undefined) member.globalBuffStacks[buff.id] = 0;
  });
  // 清掉未迁走的旧模板层数键（新 Buff 复用同一 id 时跳过：快照已在上面写回其叠层，
  // 此处再删会误清稳定 id 的叠层——如秧秧·玄翎【虚湮效应/固有1】6 层、西格莉卡【天赋】轮次/技能级
  // 手填覆盖（2026-08-16 站长确认：西格莉卡天赋也纳入保留，syncSigrikaTalentDefaultStacks 的
  // 「手填层数不覆盖」分支会保留非默认覆盖、仅清错档默认）。
  const newPersonalIds = new Set(newPersonalBuffs.map((b) => b.id));
  personalRemoved.forEach((old) => {
    if (
      member.globalBuffStacks &&
      member.globalBuffStacks[old.id] !== undefined &&
      !newPersonalIds.has(old.id)
    ) {
      delete member.globalBuffStacks[old.id];
    }
  });
  const usedTeamIds = new Set();
  const newTeamBuffs = [];
  team.forEach((tagged) => {
    const entry = tagged?.entry || tagged;
    const modeKey = tagged?.combatModeKey || '';
    // 心/锁暝提供同一条同奏定义；层数由接收角色的镜像分别保存。
    const sharedTongzou =
      String(entry?.tongzouSharedKey || '') === 'tongzou_shared_gain_final_vuln';
    if (sharedTongzou && shared.buffs.some((b) =>
      String(b?.tongzouSharedKey || b?.templateKey || '') === 'tongzou_shared_gain_final_vuln'
    )) return;
    const buff = materializeTemplateBuff(entry, {
      characterId: charIdStr,
      memberIndex,
      scope: 'team',
      combatModeKey: modeKey,
      usedIds: usedTeamIds,
    });
    if (sharedTongzou) {
      buff.id = 'ct_team_tongzou_shared_gain_final_vuln';
      delete buff.sourceMemberIndex;
    }
    if (!normalizeBuffGameText(buff.gameText)) {
      const chainN =
        parseChainNumberFromBuffName(entry?.name) || parseChainNumberFromBuffName(buff.name);
      const chainText = chainN ? getExistingChainGameTextFromTemplate(tpl, chainN) : '';
      if (chainText) buff.gameText = chainText;
    }
    const key = String(entry.templateKey || buff.templateKey || '');
    const name = String(entry.name || buff.name || '').trim();
    const ids = templateBuffSnapIdentity(key, modeKey, name);
    shared.buffs.push(buff);
    newTeamBuffs.push(buff);
    invalidateSharedBuffsCache();
    const snapActive = lookupTemplateBuffSnapValue(
      teamSnap.activeByKey,
      teamSnap.activeByName,
      ids.keyId,
      ids.nameId
    );
    const entryDefaultActive =
      entry.defaultActive !== undefined ? !!entry.defaultActive : true;
    shared.globalBuffActive[buff.id] = snapActive !== undefined ? snapActive : entryDefaultActive;
    // 新配置的条件增伤默认不覆盖，分配格与实际开关保持一致；旧方案保留已有选择。
    if (charIdStr === XIN_CHAR_ID && key === 'xin_dc_rover_teammate_bonus' && snapActive === undefined && !entryDefaultActive) {
      (state.members || []).forEach((target) => {
        const excluded = window.__WC.ensureExcludedTeamBuffIds(target);
        if (!excluded.includes(buff.id)) excluded.push(buff.id);
      });
    }

    if (isStackBuff(buff)) {
      const snapStacks = lookupTemplateBuffSnapValue(
        teamSnap.stacksByKey,
        teamSnap.stacksByName,
        ids.keyId,
        ids.nameId
      );
      if (snapStacks !== undefined) shared.globalBuffStacks[buff.id] = snapStacks;
      else if (entry.defaultStacks !== undefined) {
        shared.globalBuffStacks[buff.id] = normalizeStackInput(entry.defaultStacks, buff);
      }
      // 否则留给 remapTeam 迁层数
    }
    if (buff.excludeSource &&
      memberIndex != null &&
      memberIndex >= 0 &&
      !(typeof isRococoFlatAtkBuff === 'function' && isRococoFlatAtkBuff(buff)) &&
      !(typeof isSpecialDefaultSyncBuffSource === 'function' && isSpecialDefaultSyncBuffSource(buff))
    ) {
      const excluded = ensureExcludedTeamBuffIds(member);
      if (!excluded.includes(buff.id)) excluded.push(buff.id);
    }
  });
  if (charIdStr === YUNO_CHAR_ID) {
    (shared.buffs || []).forEach((b) => {
      if (
        isYunoBlessingBuff(b) &&
        getTeamBuffSourceMemberIndex(b) === memberIndex
      ) {
        ensureYunoBlessingEffects(b);
      }
    });
  }
  if (charIdStr === LINNEI_CHAR_ID) {
    (shared.buffs || []).forEach((b) => {
      if (isLinneiOutroBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex) {
        ensureLinneiOutroEffects(b);
      }
    });
  }
  if (charIdStr === AMIS_CHAR_ID) {
    (shared.buffs || []).forEach((b) => {
      if (isAmisOutroBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex) {
        ensureAmisOutroEffects(b);
      }
    });
  }
  if (charIdStr === LUCY_CHAR_ID) {
    (member.buffs || []).forEach((b) => {
      ensureLucyHoumenEffects(b);
      ensureLucyMultithreadSqlEffects(b);
      ensureLucyC6ExecVulnEffects(b);
    });
    (shared.buffs || []).forEach((b) => {
      if (isLucyOutroBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex) {
        ensureLucyOutroEffects(b);
      }
    });
  }
  if (charIdStr === QIANXIAO_CHAR_ID) {
    (member.buffs || []).forEach((b) => ensureQianxiaoHuizhongEffects(b));
  }
  syncTeamFusionLinkedBuffs({ skipMemberSync: true });
  syncFeixueXuexiuLinkedBuffs({ skipMemberSync: true, skipSpecialSkillSync: true });
  // 先迁移成员排除列表旧 id，再同步全队镜像，否则旧排除项会被当孤儿清掉
  if (typeof migrateTeamTemplateBuffExcludedIds === 'function') {
    migrateTeamTemplateBuffExcludedIds(memberIndex, teamRemoved);
  }
  syncTeamBuffsToMembers();
  remapTeamTemplateBuffAxisIds(memberIndex, teamRemoved);
  if (loseraMirror) {
    const mirror = member.buffs.find((b) => b.id === loseraMirror.id);
    if (mirror) (member.cycleConfig?.rounds || []).forEach((round) => {
      // The generic id remap preserves per-round maps; replace only the old definition.
      round.buffs = (round.buffs || []).map((b) => b.id === mirror.id ? JSON.parse(JSON.stringify(mirror)) : b);
    });
    loseraRecipients.forEach(({ target, active, stacks }) => {
      if (!target.buffs.some((b) => b.id === loseraMirror.id)) return;
      if (active !== undefined) target.globalBuffActive[loseraMirror.id] = active;
      if (stacks !== undefined) target.globalBuffStacks[loseraMirror.id] = stacks;
    });
  }
  // 全队模板 Buff：remap 后补默认层数并清理旧键（同样跳过被新 Buff 复用的稳定 id）
  const newTeamIds = new Set(newTeamBuffs.map((b) => b.id));
  teamRemoved.forEach((old) => {
    if (
      shared.globalBuffStacks[old.id] !== undefined &&
      !newTeamIds.has(old.id)
    ) {
      delete shared.globalBuffStacks[old.id];
    }
  });
  (shared.buffs || []).forEach((b) => {
    if (
      isCharacterTemplateBuff(b) &&
      getTeamBuffSourceMemberIndex(b) === memberIndex &&
      isStackBuff(b) &&
      shared.globalBuffStacks[b.id] === undefined
    ) {
      shared.globalBuffStacks[b.id] = 0;
    }
  });
  (state.members || []).forEach((m) => {
    // PROBE_FIX_DEFER_MEMBER_REBIND：延迟窗内只登记，末尾统一重绑（窗口外行为同线上）
    if (!(window.__WC && window.__WC.__deferMemberRebind) && typeof rebindMemberBuffCoverageMaps === 'function') rebindMemberBuffCoverageMaps(m);
    else if (window.__WC && window.__WC.requestMemberRebind) window.__WC.requestMemberRebind(m);
  });
  normalizeMemberBuffKeys(member);
  applyTemplateExtraSkills(member, tpl, resonance, combatMode);
  if (charIdStr === FEIXUE_CHAR_ID || charIdStr === LUCY_CHAR_ID) syncSpecialSkillLibraryMults(member);
  syncAugustaSpecialStackOnMember(member, tpl, resonance);
  if (charIdStr === JIABEILINA_CHAR_ID) {
    (member.buffs || []).forEach((b) => ensureJiabeilinaYuhuoC1Effect(b));
    if (typeof syncJiabeilinaC3UltMultBuffNames === 'function') syncJiabeilinaC3UltMultBuffNames(member);
  }
  if (charIdStr === LUPA_CHAR_ID && typeof syncLupaC6DefBuffNames === 'function') {
    syncLupaC6DefBuffNames(member);
  }
  if (charIdStr === VERINA_CHAR_ID && typeof syncVerinaC6BuffNames === 'function') {
    syncVerinaC6BuffNames(member);
  }
  if (charIdStr === CHUN_CHAR_ID && typeof syncChunC6BuffNames === 'function') {
    syncChunC6BuffNames(member);
  }
  if (charIdStr === CARTETHYIA_CHAR_ID && typeof syncCartethyiaUltBoostBuffNames === 'function') {
    syncCartethyiaUltBoostBuffNames(member);
  }
  if (charIdStr === '1404') {
    // 忌炎【枪扫风定】：删除历史重复的「消耗30点破阵值」（与「破阵状态下」同效果，避免 +40% 重复计入）
    const jiyanDropIds = new Set(
      (member.buffs || [])
        .filter(
          (b) =>
            String(b.templateKey || '') === 'tpl_ms0qrcj9_yudzo' &&
            String(b.name || '').includes('消耗30点')
        )
        .map((b) => b.id)
    );
    if (jiyanDropIds.size) {
      member.buffs = member.buffs.filter((b) => !jiyanDropIds.has(b.id));
      jiyanDropIds.forEach((id) => {
        if (typeof purgeMemberBuffReferences === 'function') {
          purgeMemberBuffReferences(member, id, { allRounds: true });
        }
      });
    }
  }
  if (charIdStr === '1508') {
    // 千咲：删除个人重复的「虚无绞痕」（与全队「虚无纹痕」同效果，避免千咲自己 18% 变 36%）
    const qxDropIds = new Set(
      (member.buffs || [])
        .filter(
          (b) =>
            !b.teamSourceId &&
            String(b.templateKey || '') === 'tpl_ms2aunw9_t2krc' &&
            /虚无/.test(String(b.name || ''))
        )
        .map((b) => b.id)
    );
    if (qxDropIds.size) {
      member.buffs = member.buffs.filter((b) => !qxDropIds.has(b.id));
      qxDropIds.forEach((id) => {
        if (typeof purgeMemberBuffReferences === 'function') {
          purgeMemberBuffReferences(member, id, { allRounds: true });
        }
      });
    }
  }
  if (charIdStr === SIGRIKA_CHAR_ID && typeof syncSigrikaC4TeamAtkBuffNames === 'function') {
    syncSigrikaC4TeamAtkBuffNames(member);
  }
  if (charIdStr === XIANGALIYAO_CHAR_ID || charIdStr === YUANWU_CHAR_ID) {
    purgeBranchPanelDuplicateTalentBuffs(member);
  }
  if (charIdStr === REBECCA_CHAR_ID) {
    (member.buffs || []).forEach((b) => {
      ensureRebeccaHunterModeEffects(b);
      ensureRebeccaIronModeEffects(b);
    });
  }
  if (charIdStr === BULING_CHAR_ID) {
    (shared.buffs || []).forEach((b) => {
      if (isBulingSancaiBuff(b) && getTeamBuffSourceMemberIndex(b) === memberIndex) {
        ensureBulingSancaiEffects(b);
      }
    });
  }
  if (charIdStr === ZANNI_CHAR_ID) {
    (member.buffs || []).forEach((b) => ensureZanniYanguangEffects(b));
  }
  if (charIdStr === SIGRIKA_CHAR_ID) {
    // 去重历史遗留的重复「天赋？」（保留正式 sigrika_talent，避免深潜被叠加两次）
    const sigTalents = (member.buffs || []).filter(isSigrikaTalentBuff);
    const sigCanonical =
      sigTalents.find((b) => String(b.templateKey || '') === SIGRIKA_TALENT_KEY) || sigTalents[0];
    const sigDrops = sigTalents.filter((b) => b !== sigCanonical);
    if (sigDrops.length) {
      const sigDropIds = new Set(sigDrops.map((b) => b.id));
      member.buffs = member.buffs.filter((b) => !sigDropIds.has(b.id));
      sigDropIds.forEach((id) => {
        if (typeof purgeMemberBuffReferences === 'function') {
          purgeMemberBuffReferences(member, id, { allRounds: true });
        }
      });
    }
    (member.buffs || []).forEach((b) => ensureSigrikaTalentEffects(b));
    syncSigrikaTalentDefaultStacks(member);
  }
  syncCharBranchPanelSources(member);
  syncLuhesiInnate2HarmonyDeep(member);
  syncSigrikaInnate2EchoBonus(member);
  syncChouyuanLiberationCritDmg(member);
  if (typeof syncRococoCritFlatAtk === 'function') syncRococoCritFlatAtk(member);
  syncMoningCriticalProtocolErConvert(member);
  syncMoningC2ErCritDmg(member);
  syncMoningInterferenceMarkEr(member);
  syncLilyErCrit(member);
  syncSuisuiOutroErConvert(member);
  syncShorekeeperStarErConvert(member);
  syncJingranHpFlatAtkPanel(member);
  syncJingranMinghuoMult(member);
  syncJingranHuoxiFuxiBonus(member);
  syncJingranYoufuFumingBonus(member);
  syncMemberSkillsTypedBuffAutoMatch(member, { restoreMatches: true });
  // 爱弥斯固有2由模态 kit 管理（非模板 soft-rebuild），套完模板后补回以免层数被误清
  if (charIdStr === AMIS_CHAR_ID) syncAmisCombatModeKit(member);
  return true;
}

/** 启动/模板库就绪后：给已选角色补齐最新本体/链 Buff */
function syncAllMembersCharacterBuffTemplates() {
  let n = 0;
  (state.members || []).forEach((m) => {
    if (!m?.characterId) return;
    if (applyCharacterBuffTemplate(m, m.characterId)) {
      // 最新模板同时写入各轮快照，避免切轮后恢复旧技能范围。
      syncMemberResonanceAcrossRounds(m, normalizeResonanceUnlocked(m.resonanceUnlocked));
      n += 1;
    }
  });
  return n;
}

function collectTemplateExtraSkills(tpl, resonanceUnlocked, combatMode, opts) {
  if (!tpl) return [];
  const list = [...(tpl.extraSkills || [])];
  const charId = String(opts?.characterId || '').trim();
  const modesToLoad =
    opts?.allCombatModes && getCharCombatModeConfig(charId)?.modes?.length
      ? [...getCharCombatModeConfig(charId).modes]
      : (() => {
          const modeKey = String(combatMode || '').trim();
          return modeKey ? [modeKey] : [];
        })();
  modesToLoad.forEach((modeKey) => {
    if (modeKey && tpl.combatModes?.[modeKey]?.extraSkills?.length) {
      list.push(...tpl.combatModes[modeKey].extraSkills);
    }
  });
  const n = normalizeResonanceUnlocked(resonanceUnlocked);
  for (let i = 1; i <= n; i += 1) {
    const chain = tpl.resonanceChains?.[String(i)];
    if (!chain) continue;
    if (chain.extraSkills?.length) list.push(...chain.extraSkills);
    modesToLoad.forEach((modeKey) => {
      if (modeKey && chain.combatModes?.[modeKey]?.extraSkills?.length) {
        list.push(...chain.combatModes[modeKey].extraSkills);
      }
    });
  }
  return list.map(normalizeTemplateExtraSkillEntry);
}

  /* ===== __WC_IIFE_EXPORT_TABLE__ begin (自动生成: V4 Pro 批次6第2步, 勿手改) ===== */
  // P5-1: 导出双挂（window.__WC 命名空间 + window[n] 别名桥），保留 getter/setter 闭包语义
  var __WC_NS__ = window.__WC || (window.__WC = {});
  Object.defineProperty(window, '__WC', { value: __WC_NS__, writable: false, enumerable: false, configurable: false });
  var __wcE = function (n, g, s, e, c) {
    Object.defineProperty(__WC_NS__, n, { configurable: c, enumerable: e, get: g, set: s });
    Object.defineProperty(window, n, { configurable: c, enumerable: e, get: function () { return __WC_NS__[n]; }, set: function (v) { __WC_NS__[n] = v; } });
  };
  var __wcD = function (n, v) {
    Object.defineProperty(__WC_NS__, n, { value: v, writable: false, enumerable: false, configurable: true });
    Object.defineProperty(window, n, { value: v, writable: false, enumerable: false, configurable: true });
  };

  __wcD('DEF_CONST', DEF_CONST);
  __wcE('floorGameDamage', function () { return floorGameDamage; }, function (v) { floorGameDamage = v; }, true, true);
  __wcE('calcResistanceMultiplier', function () { return calcResistanceMultiplier; }, function (v) { calcResistanceMultiplier = v; }, true, true);
  __wcD('EXECUTION_BASE', EXECUTION_BASE);
  __wcD('EFFECT_BASE', EFFECT_BASE);
  __wcD('EFFECT_TYPE_LIST', EFFECT_TYPE_LIST);
  __wcD('EFFECT_TYPE_ELEMENT', EFFECT_TYPE_ELEMENT);
  __wcD('EFFECT_LAYER_MIN', EFFECT_LAYER_MIN);
  __wcD('EFFECT_LAYER_MAX', EFFECT_LAYER_MAX);
  __wcD('EFFECT_BURST_LAYER_MIN', EFFECT_BURST_LAYER_MIN);
  __wcD('EFFECT_LAYER_DEFAULT', EFFECT_LAYER_DEFAULT);
  __wcD('EFFECT_LAYER_MULTS', EFFECT_LAYER_MULTS);
  __wcD('EFFECT_ELECTRO_BURST_LAYER_MULTS', EFFECT_ELECTRO_BURST_LAYER_MULTS);
  __wcD('ELECTRO_LAYER_MULT_DATA', ELECTRO_LAYER_MULT_DATA);
  __wcE('isElectroEffectItem', function () { return isElectroEffectItem; }, function (v) { isElectroEffectItem = v; }, true, true);
  __wcD('SPECIAL_SKILL_KINDS', SPECIAL_SKILL_KINDS);
  __wcD('DAMAGE_TYPES', DAMAGE_TYPES);
  __wcD('PALETTE_TYPE_ORDER', PALETTE_TYPE_ORDER);
  __wcD('OFFICIAL_SKILL_TYPES', OFFICIAL_SKILL_TYPES);
  __wcD('PALETTE_SKILL_TYPE_ORDER', PALETTE_SKILL_TYPE_ORDER);
  __wcD('SKILL_GROUP_MODE_DAMAGE', SKILL_GROUP_MODE_DAMAGE);
  __wcD('SKILL_GROUP_MODE_OFFICIAL', SKILL_GROUP_MODE_OFFICIAL);
  __wcD('COORD_ATTACK_DAMAGE_TYPE', COORD_ATTACK_DAMAGE_TYPE);
  __wcD('CHAR_SKILL_DB_URL', CHAR_SKILL_DB_URL);
  __wcD('CHAR_SKILL_DB_CACHE_KEY', CHAR_SKILL_DB_CACHE_KEY);
  __wcD('ROVER_MALE_TO_FEMALE_ID', ROVER_MALE_TO_FEMALE_ID);
  __wcD('ROVER_HIDDEN_MALE_IDS', ROVER_HIDDEN_MALE_IDS);
  __wcD('CHAR_SKILL_CORRECTIONS', CHAR_SKILL_CORRECTIONS);
  __wcD('CONCERTO_ENERGY_UTILITY_NAME_RE', CONCERTO_ENERGY_UTILITY_NAME_RE);
  __wcD('CHAR_BUFF_TEMPLATE_DB_URL', CHAR_BUFF_TEMPLATE_DB_URL);
  __wcD('CHAR_BUFF_TEMPLATE_DB_CACHE_KEY', CHAR_BUFF_TEMPLATE_DB_CACHE_KEY);
  __wcD('CHAR_BUFF_TEMPLATE_LOCAL_KEY', CHAR_BUFF_TEMPLATE_LOCAL_KEY);
  __wcD('CHAR_BUFF_TEMPLATE_SOURCE_TAG', CHAR_BUFF_TEMPLATE_SOURCE_TAG);
  __wcD('AUGUSTA_CHAR_ID', AUGUSTA_CHAR_ID);
  __wcD('AUGUSTA_SPECIAL_STACK_KEY', AUGUSTA_SPECIAL_STACK_KEY);
  __wcD('AUGUSTA_SPECIAL_MECH_KIND', AUGUSTA_SPECIAL_MECH_KIND);
  __wcD('AUGUSTA_OUTRO_GENERAL_DEEP_KEY', AUGUSTA_OUTRO_GENERAL_DEEP_KEY);
  __wcD('AUGUSTA_OUTRO_GENERAL_DEEP_PCT', AUGUSTA_OUTRO_GENERAL_DEEP_PCT);
  __wcD('AUGUSTA_CROWN_ELECTRO_PER_STACK', AUGUSTA_CROWN_ELECTRO_PER_STACK);
  __wcD('AUGUSTA_CROWN_CRIT_DMG_PER_STACK', AUGUSTA_CROWN_CRIT_DMG_PER_STACK);
  __wcD('AUGUSTA_CROWN_CRIT_DMG_MIN_RESONANCE', AUGUSTA_CROWN_CRIT_DMG_MIN_RESONANCE);
  __wcD('AUGUSTA_CROWN_CRIT_RATE_MIN_RESONANCE', AUGUSTA_CROWN_CRIT_RATE_MIN_RESONANCE);
  __wcD('AUGUSTA_C3_MULT_BOOST_KEY', AUGUSTA_C3_MULT_BOOST_KEY);
  __wcD('AUGUSTA_C3_MULT_BOOST_PCT', AUGUSTA_C3_MULT_BOOST_PCT);
  __wcD('AUGUSTA_C3_SKILLS', AUGUSTA_C3_SKILLS);
  __wcD('AUGUSTA_C4_TEAM_ATK_KEY', AUGUSTA_C4_TEAM_ATK_KEY);
  __wcD('AUGUSTA_C4_TEAM_ATK_PCT', AUGUSTA_C4_TEAM_ATK_PCT);
  __wcD('AUGUSTA_C6_NUTING_SKILL_KEY', AUGUSTA_C6_NUTING_SKILL_KEY);
  __wcD('AUGUSTA_C6_NUTING_BASE_MULT', AUGUSTA_C6_NUTING_BASE_MULT);
  __wcD('BRANT_CHAR_ID', BRANT_CHAR_ID);
  __wcD('BRANT_SPECIAL_MECH_KIND', BRANT_SPECIAL_MECH_KIND);
  __wcD('BRANT_LIFE_PLAY', BRANT_LIFE_PLAY);
  __wcD('BRANT_LIFE_MY', BRANT_LIFE_MY);
  __wcD('BRANT_OUTRO_KEY', BRANT_OUTRO_KEY);
  __wcD('LUPA_CHAR_ID', LUPA_CHAR_ID);
  __wcD('LUPA_RONGGUANG_KEY', LUPA_RONGGUANG_KEY);
  __wcD('LUPA_ZHUILIE_KEY', LUPA_ZHUILIE_KEY);
  __wcD('LUPA_OUTRO_KEY', LUPA_OUTRO_KEY);
  __wcD('LUPA_C6_DEF_KEY', LUPA_C6_DEF_KEY);
  __wcD('LUPA_C6_DEF_LEGACY_KEY', LUPA_C6_DEF_LEGACY_KEY);
  __wcD('LUPA_C6_DEF_NAME', LUPA_C6_DEF_NAME);
  __wcD('TEAM_FUSION_STACK_SYNC', TEAM_FUSION_STACK_SYNC);
  __wcD('LUPA_C3_FULL_STACK_UNLOCK', LUPA_C3_FULL_STACK_UNLOCK);
  __wcD('LUPA_LEGACY_FRAGMENT_TEAM_KEYS', LUPA_LEGACY_FRAGMENT_TEAM_KEYS);
  __wcD('BRANT_LEGACY_LUPA_TEAM_KEYS', BRANT_LEGACY_LUPA_TEAM_KEYS);
  __wcD('WEAPONS_DB_URL', WEAPONS_DB_URL);
  __wcD('WEAPONS_DB_CACHE_KEY', WEAPONS_DB_CACHE_KEY);
  __wcD('WEAPON_BUFF_ID_PREFIX', WEAPON_BUFF_ID_PREFIX);
  __wcD('WEAPON_TEAM_BUFF_ID_PREFIX', WEAPON_TEAM_BUFF_ID_PREFIX);
  __wcD('WEAPON_IGNORE_DEF_AS_PEN_IDS', WEAPON_IGNORE_DEF_AS_PEN_IDS);
  __wcD('WEAPON_CHAR_SOURCE_PREFIX', WEAPON_CHAR_SOURCE_PREFIX);
  __wcD('CHAR_DEF_HARMONY_BREAK_AMP_SOURCE_ID', CHAR_DEF_HARMONY_BREAK_AMP_SOURCE_ID);
  __wcD('CHAR_INNATE_HARMONY_SOURCE_TAG', CHAR_INNATE_HARMONY_SOURCE_TAG);
  __wcD('CONVERGENCE_MODE_SOURCE_TAG', CONVERGENCE_MODE_SOURCE_TAG);
  __wcD('AMIS_MODE_BUFF_SOURCE_TAG', AMIS_MODE_BUFF_SOURCE_TAG);
  __wcD('AMIS_INNATE2_CRIT_KEY', AMIS_INNATE2_CRIT_KEY);
  __wcD('AMIS_INNATE2_DEEP_KEY', AMIS_INNATE2_DEEP_KEY);
  __wcD('CHAR_KIT_PANEL_PREFIX', CHAR_KIT_PANEL_PREFIX);
  __wcD('BRANT_FLAT_ATK_SOURCE_ID', BRANT_FLAT_ATK_SOURCE_ID);
  __wcD('DANIA_CHAR_ID', DANIA_CHAR_ID);
  __wcD('DANIA_OUTRO_KEY', DANIA_OUTRO_KEY);
  __wcD('DANIA_OUTRO_BASE_DEEP_PCT', DANIA_OUTRO_BASE_DEEP_PCT);
  __wcD('DANIA_OUTRO_PRIVILEGED_DEEP_PCT', DANIA_OUTRO_PRIVILEGED_DEEP_PCT);
  __wcD('DANIA_OUTRO_EXTRA_DEEP_PCT', DANIA_OUTRO_EXTRA_DEEP_PCT);
  __wcD('DANIA_OUTRO_EXTRA_EFFECT_KEY', DANIA_OUTRO_EXTRA_EFFECT_KEY);
  __wcD('DANIA_OUTRO_CONV_DEEP_PCT', DANIA_OUTRO_CONV_DEEP_PCT);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_KEY', DANIA_INNATE_OFFSET_HARMONY_AMP_KEY);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY', DANIA_INNATE_OFFSET_HARMONY_AMP_LEGACY_KEY);
  __wcD('DANIA_INNATE_BASE_HARMONY_AMP_KEY', DANIA_INNATE_BASE_HARMONY_AMP_KEY);
  __wcD('DANIA_INNATE_BASE_HARMONY_AMP', DANIA_INNATE_BASE_HARMONY_AMP);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_THRESHOLD', DANIA_INNATE_OFFSET_HARMONY_AMP_THRESHOLD);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_PER_CHUNK', DANIA_INNATE_OFFSET_HARMONY_AMP_PER_CHUNK);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_CHUNK_PCT', DANIA_INNATE_OFFSET_HARMONY_AMP_CHUNK_PCT);
  __wcD('DANIA_INNATE_OFFSET_HARMONY_AMP_CAP', DANIA_INNATE_OFFSET_HARMONY_AMP_CAP);
  __wcD('ENCORE_CHAR_ID', ENCORE_CHAR_ID);
  __wcD('MORTEFI_CHAR_ID', MORTEFI_CHAR_ID);
  __wcD('MORTEFI_OUTRO_HEAVY_DEEP_KEY', MORTEFI_OUTRO_HEAVY_DEEP_KEY);
  __wcD('YUNO_CHAR_ID', YUNO_CHAR_ID);
  __wcD('YUNO_OUTRO_HEAVY_DEEP_KEY', YUNO_OUTRO_HEAVY_DEEP_KEY);
  __wcD('YUNO_BLESSING_KEY', YUNO_BLESSING_KEY);
  __wcD('YUNO_BLESSING_STACK_DEEP_EFFECT_KEY', YUNO_BLESSING_STACK_DEEP_EFFECT_KEY);
  __wcD('YUNO_BLESSING_C2_DEEP_EFFECT_KEY', YUNO_BLESSING_C2_DEEP_EFFECT_KEY);
  __wcD('YUNO_BLESSING_MAX_STACKS', YUNO_BLESSING_MAX_STACKS);
  __wcD('YUNO_BLESSING_DEEP_PER_STACK', YUNO_BLESSING_DEEP_PER_STACK);
  __wcD('YUNO_BLESSING_C2_EXTRA_DEEP', YUNO_BLESSING_C2_EXTRA_DEEP);
  __wcD('YUNO_BLESSING_C2_MIN_STACKS', YUNO_BLESSING_C2_MIN_STACKS);
  __wcD('YUNO_BLESSING_C2_MIN_RESONANCE', YUNO_BLESSING_C2_MIN_RESONANCE);
  __wcD('YUNO_BLESSING_AUTO_EFFECT_KEYS', YUNO_BLESSING_AUTO_EFFECT_KEYS);
  __wcD('SANHUA_CHAR_ID', SANHUA_CHAR_ID);
  __wcD('SANHUA_OUTRO_NORMAL_DEEP_KEY', SANHUA_OUTRO_NORMAL_DEEP_KEY);
  __wcD('JIANXIN_CHAR_ID', JIANXIN_CHAR_ID);
  __wcD('JIANXIN_OUTRO_LIBERATION_DEEP_KEY', JIANXIN_OUTRO_LIBERATION_DEEP_KEY);
  __wcD('CHOUYUAN_CHAR_ID', CHOUYUAN_CHAR_ID);
  __wcD('CHOUYUAN_OUTRO_ECHO_DEEP_KEY', CHOUYUAN_OUTRO_ECHO_DEEP_KEY);
  __wcD('CHOUYUAN_LIBERATION_CRIT_DMG_KEY', CHOUYUAN_LIBERATION_CRIT_DMG_KEY);
  __wcD('CHOUYUAN_LIBERATION_CRIT_THRESHOLD', CHOUYUAN_LIBERATION_CRIT_THRESHOLD);
  __wcD('CHOUYUAN_LIBERATION_CRIT_DMG_PER_PCT', CHOUYUAN_LIBERATION_CRIT_DMG_PER_PCT);
  __wcD('CHOUYUAN_LIBERATION_CRIT_DMG_CAP', CHOUYUAN_LIBERATION_CRIT_DMG_CAP);
  __wcD('CHOUYUAN_C6_HESUO_CRIT_DMG_KEY', CHOUYUAN_C6_HESUO_CRIT_DMG_KEY);
  __wcD('CHOUYUAN_C6_HESUO_SKILLS', CHOUYUAN_C6_HESUO_SKILLS);
  __wcD('CHOUYUAN_C1_CRIT_RATE_SOURCE_ID', CHOUYUAN_C1_CRIT_RATE_SOURCE_ID);
  __wcD('CHOUYUAN_C1_CRIT_RATE_PCT', CHOUYUAN_C1_CRIT_RATE_PCT);
  __wcD('BAIZHI_CHAR_ID', BAIZHI_CHAR_ID);
  __wcD('BAIZHI_C3_HP_KEY', BAIZHI_C3_HP_KEY);
  __wcD('ZHEZHI_CHAR_ID', ZHEZHI_CHAR_ID);
  __wcD('ZHEZHI_OUTRO_KEY', ZHEZHI_OUTRO_KEY);
  __wcD('YINLIN_CHAR_ID', YINLIN_CHAR_ID);
  __wcD('YINLIN_OUTRO_KEY', YINLIN_OUTRO_KEY);
  __wcD('FLORO_CHAR_ID', FLORO_CHAR_ID);
  __wcD('FLORO_OUTRO_KEY', FLORO_OUTRO_KEY);
  __wcD('FLORO_OUTRO_HAVOC_DEEP_PCT', FLORO_OUTRO_HAVOC_DEEP_PCT);
  __wcD('FLORO_OUTRO_HEAVY_DEEP_PCT', FLORO_OUTRO_HEAVY_DEEP_PCT);
  __wcD('CANTARELLA_CHAR_ID', CANTARELLA_CHAR_ID);
  __wcD('CANTARELLA_OUTRO_KEY', CANTARELLA_OUTRO_KEY);
  __wcD('CANTARELLA_OUTRO_NAME', CANTARELLA_OUTRO_NAME);
  __wcD('CANTARELLA_OUTRO_HAVOC_DEEP_PCT', CANTARELLA_OUTRO_HAVOC_DEEP_PCT);
  __wcD('CANTARELLA_OUTRO_SKILL_DEEP_PCT', CANTARELLA_OUTRO_SKILL_DEEP_PCT);
  __wcD('CANTARELLA_OUTRO_LEGACY_KEYS', CANTARELLA_OUTRO_LEGACY_KEYS);
  __wcD('CANTARELLA_LEGACY_TALENT_KEYS', CANTARELLA_LEGACY_TALENT_KEYS);
  __wcD('ROCOCO_CHAR_ID', ROCOCO_CHAR_ID);
  __wcD('ROCOCO_OUTRO_KEY', ROCOCO_OUTRO_KEY);
  __wcD('ROCOCO_OUTRO_NAME', ROCOCO_OUTRO_NAME);
  __wcD('ROCOCO_OUTRO_HAVOC_DEEP_PCT', ROCOCO_OUTRO_HAVOC_DEEP_PCT);
  __wcD('ROCOCO_OUTRO_NORMAL_DEEP_PCT', ROCOCO_OUTRO_NORMAL_DEEP_PCT);
  __wcD('ROCOCO_OUTRO_LEGACY_KEYS', ROCOCO_OUTRO_LEGACY_KEYS);
  __wcD('ROCOCO_LEGACY_TALENT_KEYS', ROCOCO_LEGACY_TALENT_KEYS);
  __wcD('TAOQI_CHAR_ID', TAOQI_CHAR_ID);
  __wcD('TAOQI_LEGACY_TALENT_KEYS', TAOQI_LEGACY_TALENT_KEYS);
  __wcD('ROCOCO_FLAT_ATK_KEY', ROCOCO_FLAT_ATK_KEY);
  __wcD('ROCOCO_FLAT_ATK_NAME', ROCOCO_FLAT_ATK_NAME);
  __wcD('ROCOCO_FLAT_ATK_PANEL_SOURCE_ID', ROCOCO_FLAT_ATK_PANEL_SOURCE_ID);
  __wcD('ROCOCO_FLAT_ATK_CRIT_THRESHOLD', ROCOCO_FLAT_ATK_CRIT_THRESHOLD);
  __wcD('ROCOCO_FLAT_ATK_CRIT_CHUNK', ROCOCO_FLAT_ATK_CRIT_CHUNK);
  __wcD('ROCOCO_FLAT_ATK_PER_CHUNK', ROCOCO_FLAT_ATK_PER_CHUNK);
  __wcD('ROCOCO_FLAT_ATK_CAP', ROCOCO_FLAT_ATK_CAP);
  __wcD('YOUHU_CHAR_ID', YOUHU_CHAR_ID);
  __wcD('YOUHU_OUTRO_COORD_DEEP_KEY', YOUHU_OUTRO_COORD_DEEP_KEY);
  __wcD('YOUHU_SHIZHONGWU_DUIOU_KEY', YOUHU_SHIZHONGWU_DUIOU_KEY);
  __wcD('YOUHU_SHIZHONGWU_LIANZHU_KEY', YOUHU_SHIZHONGWU_LIANZHU_KEY);
  __wcD('YOUHU_SHIZHONGWU_DUIOU_NAME', YOUHU_SHIZHONGWU_DUIOU_NAME);
  __wcD('YOUHU_SHIZHONGWU_LIANZHU_NAME', YOUHU_SHIZHONGWU_LIANZHU_NAME);
  __wcD('CARTETHYIA_CHAR_ID', CARTETHYIA_CHAR_ID);
  __wcD('CARTETHYIA_OUTRO_AERO_DEEP_KEY', CARTETHYIA_OUTRO_AERO_DEEP_KEY);
  __wcD('CARTETHYIA_XIANHUA_SHENQUAN_KEY', CARTETHYIA_XIANHUA_SHENQUAN_KEY);
  __wcD('CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEY', CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEY);
  __wcD('CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEYS', CARTETHYIA_XIANHUA_SHENQUAN_LEGACY_KEYS);
  __wcD('CARTETHYIA_XIANHUA_SHENQUAN_PCT', CARTETHYIA_XIANHUA_SHENQUAN_PCT);
  __wcD('XIAKONG_CHAR_ID', XIAKONG_CHAR_ID);
  __wcD('XIAKONG_OUTRO_WIND_EROSION_KEY', XIAKONG_OUTRO_WIND_EROSION_KEY);
  __wcD('XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEY', XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEY);
  __wcD('XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEYS', XIAKONG_OUTRO_WIND_EROSION_LEGACY_KEYS);
  __wcD('XIAKONG_OUTRO_WIND_EROSION_PCT', XIAKONG_OUTRO_WIND_EROSION_PCT);
  __wcD('CARTETHYIA_ULT_BOOST_KEY', CARTETHYIA_ULT_BOOST_KEY);
  __wcD('CARTETHYIA_ULT_BOOST_LEGACY_KEY', CARTETHYIA_ULT_BOOST_LEGACY_KEY);
  __wcD('CARTETHYIA_ULT_BOOST_NAME', CARTETHYIA_ULT_BOOST_NAME);
  __wcD('CARTETHYIA_C1_KEY', CARTETHYIA_C1_KEY);
  __wcD('CARTETHYIA_C1_LEGACY_KEY', CARTETHYIA_C1_LEGACY_KEY);
  __wcD('CARTETHYIA_C1_NAME', CARTETHYIA_C1_NAME);
  __wcD('QIUSHUI_CHAR_ID', QIUSHUI_CHAR_ID);
  __wcD('QIUSHUI_OUTRO_AERO_DEEP_KEY', QIUSHUI_OUTRO_AERO_DEEP_KEY);
  __wcD('LUMI_CHAR_ID', LUMI_CHAR_ID);
  __wcD('LUMI_OUTRO_SKILL_DEEP_KEY', LUMI_OUTRO_SKILL_DEEP_KEY);
  __wcD('ROVER_ELECTRO_CHAR_ID', ROVER_ELECTRO_CHAR_ID);
  __wcD('ROVER_ELECTRO_OUTRO_GENERAL_DEEP_KEY', ROVER_ELECTRO_OUTRO_GENERAL_DEEP_KEY);
  __wcD('ROVER_SPECTRO_CHAR_ID', ROVER_SPECTRO_CHAR_ID);
  __wcD('ROVER_SPECTRO_LEGACY_TALENT_KEYS', ROVER_SPECTRO_LEGACY_TALENT_KEYS);
  __wcD('ZANNI_CHAR_ID', ZANNI_CHAR_ID);
  __wcD('ZANNI_OUTRO_DIFFRACTION_DEEP_KEY', ZANNI_OUTRO_DIFFRACTION_DEEP_KEY);
  __wcD('ZANNI_OUTRO_DIFFRACTION_DEEP_PCT', ZANNI_OUTRO_DIFFRACTION_DEEP_PCT);
  __wcD('LINNEI_CHAR_ID', LINNEI_CHAR_ID);
  __wcD('LINNEI_OUTRO_KEY', LINNEI_OUTRO_KEY);
  __wcD('LINNEI_OUTRO_GENERAL_DEEP_PCT', LINNEI_OUTRO_GENERAL_DEEP_PCT);
  __wcD('LINNEI_OUTRO_C3_GENERAL_DEEP_PCT', LINNEI_OUTRO_C3_GENERAL_DEEP_PCT);
  __wcD('LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP', LINNEI_OUTRO_C3_EXTRA_GENERAL_DEEP);
  __wcD('LINNEI_OUTRO_C3_MIN_RESONANCE', LINNEI_OUTRO_C3_MIN_RESONANCE);
  __wcD('LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY', LINNEI_OUTRO_C3_GENERAL_DEEP_EFFECT_KEY);
  __wcD('LINNEI_OUTRO_AUTO_EFFECT_KEYS', LINNEI_OUTRO_AUTO_EFFECT_KEYS);
  __wcD('LUCY_CHAR_ID', LUCY_CHAR_ID);
  __wcD('BULING_CHAR_ID', BULING_CHAR_ID);
  __wcD('BULING_SANCAI_KEY', BULING_SANCAI_KEY);
  __wcD('BULING_SANCAI_SKILL_BONUS_BASE', BULING_SANCAI_SKILL_BONUS_BASE);
  __wcD('BULING_SANCAI_C6_TOTAL', BULING_SANCAI_C6_TOTAL);
  __wcD('BULING_SANCAI_C6_EXTRA', BULING_SANCAI_C6_EXTRA);
  __wcD('BULING_SANCAI_C6_MIN_RESONANCE', BULING_SANCAI_C6_MIN_RESONANCE);
  __wcD('BULING_SANCAI_BASE_EFFECT_KEY', BULING_SANCAI_BASE_EFFECT_KEY);
  __wcD('BULING_SANCAI_C6_EFFECT_KEY', BULING_SANCAI_C6_EFFECT_KEY);
  __wcD('BULING_SANCAI_AUTO_EFFECT_KEYS', BULING_SANCAI_AUTO_EFFECT_KEYS);
  __wcD('REBECCA_CHAR_ID', REBECCA_CHAR_ID);
  __wcD('ADAM_HAMMER_SPECIMEN_ID', ADAM_HAMMER_SPECIMEN_ID);
  __wcD('REBECCA_OUTRO_KEY', REBECCA_OUTRO_KEY);
  __wcD('REBECCA_OUTRO_HEAVY_DEEP_PER_STACK', REBECCA_OUTRO_HEAVY_DEEP_PER_STACK);
  __wcD('REBECCA_OUTRO_HEAVY_DEEP_CAP_PCT', REBECCA_OUTRO_HEAVY_DEEP_CAP_PCT);
  __wcD('REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS', REBECCA_OUTRO_HEAVY_DEEP_MAX_STACKS);
  __wcD('REBECCA_OUTRO_GENERAL_DEEP_PCT', REBECCA_OUTRO_GENERAL_DEEP_PCT);
  __wcD('REBECCA_HUNTER_MODE_KEY', REBECCA_HUNTER_MODE_KEY);
  __wcD('REBECCA_IRON_MODE_KEY', REBECCA_IRON_MODE_KEY);
  __wcD('REBECCA_HUNTER_CRIT_DMG_BASE', REBECCA_HUNTER_CRIT_DMG_BASE);
  __wcD('REBECCA_IRON_DEF_IGNORE_BASE', REBECCA_IRON_DEF_IGNORE_BASE);
  __wcD('REBECCA_MODE_C4_MULT', REBECCA_MODE_C4_MULT);
  __wcD('REBECCA_MODE_C4_MIN_RESONANCE', REBECCA_MODE_C4_MIN_RESONANCE);
  __wcD('REBECCA_HUNTER_CRIT_DMG_C4_EXTRA', REBECCA_HUNTER_CRIT_DMG_C4_EXTRA);
  __wcD('REBECCA_IRON_DEF_IGNORE_C4_EXTRA', REBECCA_IRON_DEF_IGNORE_C4_EXTRA);
  __wcD('REBECCA_HUNTER_BASE_EFFECT_KEY', REBECCA_HUNTER_BASE_EFFECT_KEY);
  __wcD('REBECCA_HUNTER_C4_EFFECT_KEY', REBECCA_HUNTER_C4_EFFECT_KEY);
  __wcD('REBECCA_IRON_BASE_EFFECT_KEY', REBECCA_IRON_BASE_EFFECT_KEY);
  __wcD('REBECCA_IRON_C4_EFFECT_KEY', REBECCA_IRON_C4_EFFECT_KEY);
  __wcD('REBECCA_MODE_AUTO_EFFECT_KEYS', REBECCA_MODE_AUTO_EFFECT_KEYS);
  __wcD('REBECCA_C6_NORMAL_ATK_BONUS_SCALE', REBECCA_C6_NORMAL_ATK_BONUS_SCALE);
  __wcD('REBECCA_C6_MIN_RESONANCE', REBECCA_C6_MIN_RESONANCE);
  __wcD('LUCY_HOUMEN_KEY', LUCY_HOUMEN_KEY);
  __wcD('LUCY_HOUMEN_MULT_EFFECT_KEY', LUCY_HOUMEN_MULT_EFFECT_KEY);
  __wcD('LUCY_HOUMEN_DEEP_EFFECT_KEY', LUCY_HOUMEN_DEEP_EFFECT_KEY);
  __wcD('LUCY_HOUMEN_MAX_STACKS', LUCY_HOUMEN_MAX_STACKS);
  __wcD('LUCY_HOUMEN_STACK1_MULT_BOOST', LUCY_HOUMEN_STACK1_MULT_BOOST);
  __wcD('LUCY_HOUMEN_STACK2_MULT_BOOST', LUCY_HOUMEN_STACK2_MULT_BOOST);
  __wcD('LUCY_HOUMEN_STACK1_DEEP_PCT', LUCY_HOUMEN_STACK1_DEEP_PCT);
  __wcD('LUCY_HOUMEN_STACK2_DEEP_PCT', LUCY_HOUMEN_STACK2_DEEP_PCT);
  __wcD('LUCY_HOUMEN_TARGET_SKILLS', LUCY_HOUMEN_TARGET_SKILLS);
  __wcD('LUCY_HOUMEN_AUTO_EFFECT_KEYS', LUCY_HOUMEN_AUTO_EFFECT_KEYS);
  __wcD('LUCY_OUTRO_KEY', LUCY_OUTRO_KEY);
  __wcD('LUCY_OUTRO_NORMAL_DEEP_PCT', LUCY_OUTRO_NORMAL_DEEP_PCT);
  __wcD('LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT', LUCY_OUTRO_REBECCA_GENERAL_DEEP_PCT);
  __wcD('LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY', LUCY_OUTRO_REBECCA_DEEP_EFFECT_KEY);
  __wcD('LUCY_OUTRO_AUTO_EFFECT_KEYS', LUCY_OUTRO_AUTO_EFFECT_KEYS);
  __wcD('LUCY_MULTITHREAD_SQL_KEY', LUCY_MULTITHREAD_SQL_KEY);
  __wcD('LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY', LUCY_MULTITHREAD_SQL_BASE_EFFECT_KEY);
  __wcD('LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY', LUCY_MULTITHREAD_SQL_C2_EFFECT_KEY);
  __wcD('LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST', LUCY_MULTITHREAD_SQL_BASE_MULT_BOOST);
  __wcD('LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST', LUCY_MULTITHREAD_SQL_C2_TOTAL_MULT_BOOST);
  __wcD('LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST', LUCY_MULTITHREAD_SQL_C2_EXTRA_MULT_BOOST);
  __wcD('LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE', LUCY_MULTITHREAD_SQL_C2_MIN_RESONANCE);
  __wcD('LUCY_MULTITHREAD_SQL_AUTO_EFFECT_KEYS', LUCY_MULTITHREAD_SQL_AUTO_EFFECT_KEYS);
  __wcD('LUCY_SPECIAL_EXEC_SKILLS', LUCY_SPECIAL_EXEC_SKILLS);
  __wcD('LUCY_SPECIAL_C3_BASE_MULT_BOOST', LUCY_SPECIAL_C3_BASE_MULT_BOOST);
  __wcD('LUCY_C6_EXEC_VULN_KEY', LUCY_C6_EXEC_VULN_KEY);
  __wcD('LUCY_C6_EXEC_VULN_EFFECT_KEY', LUCY_C6_EXEC_VULN_EFFECT_KEY);
  __wcD('LUCY_C6_EXEC_VULN_PCT', LUCY_C6_EXEC_VULN_PCT);
  __wcD('LUCY_C6_EXEC_VULN_MIN_RESONANCE', LUCY_C6_EXEC_VULN_MIN_RESONANCE);
  __wcD('LUCY_C6_EXEC_VULN_AUTO_EFFECT_KEYS', LUCY_C6_EXEC_VULN_AUTO_EFFECT_KEYS);
  __wcD('LUCY_TEAM_GENERAL_VULN_KEY', LUCY_TEAM_GENERAL_VULN_KEY);
  __wcD('LUCY_TEAM_GENERAL_PEN_KEY', LUCY_TEAM_GENERAL_PEN_KEY);
  __wcD('ZANNI_YANGUANG_C3_MULT_EFFECT_KEY', ZANNI_YANGUANG_C3_MULT_EFFECT_KEY);
  __wcD('ZANNI_YANGUANG_C3_MULT_PER_STACK', ZANNI_YANGUANG_C3_MULT_PER_STACK);
  __wcD('ZANNI_YANGUANG_C3_MIN_RESONANCE', ZANNI_YANGUANG_C3_MIN_RESONANCE);
  __wcD('ZANNI_YANGUANG_C3_SKILLS', ZANNI_YANGUANG_C3_SKILLS);
  __wcD('ZANNI_YANGUANG_AUTO_EFFECT_KEYS', ZANNI_YANGUANG_AUTO_EFFECT_KEYS);
  __wcD('CARLOTTA_LEGACY_C3_OUTRO_MULT_KEY', CARLOTTA_LEGACY_C3_OUTRO_MULT_KEY);
  __wcD('LINGYANG_CHAR_ID', LINGYANG_CHAR_ID);
  __wcD('LINGYANG_C5_BUFF_KEY', LINGYANG_C5_BUFF_KEY);
  __wcD('LINGYANG_C5_BUFF_NAME', LINGYANG_C5_BUFF_NAME);
  __wcD('VERINA_CHAR_ID', VERINA_CHAR_ID);
  __wcD('VERINA_C6_BUFF_KEY', VERINA_C6_BUFF_KEY);
  __wcD('VERINA_C6_BUFF_NAME', VERINA_C6_BUFF_NAME);
  __wcD('CHUN_CHAR_ID', CHUN_CHAR_ID);
  __wcD('CHUN_C6_BUFF_KEY', CHUN_C6_BUFF_KEY);
  __wcD('CHUN_C6_BUFF_NAME', CHUN_C6_BUFF_NAME);
  __wcD('CHUN_LEGACY_TALENT_KEYS', CHUN_LEGACY_TALENT_KEYS);
  __wcD('FEIXUE_CHAR_ID', FEIXUE_CHAR_ID);
  __wcD('LOSERA_CHAR_ID', LOSERA_CHAR_ID);
  __wcD('LOSERA_ECHO_BIANJIAO_KEY', LOSERA_ECHO_BIANJIAO_KEY);
  __wcD('LOSERA_ECHO_BIANJIAO_NAME', LOSERA_ECHO_BIANJIAO_NAME);
  __wcD('LOSERA_TEAM_RES_REDUCE_KEY', LOSERA_TEAM_RES_REDUCE_KEY);
  __wcD('LOSERA_TEAM_RES_REDUCE_PCT', LOSERA_TEAM_RES_REDUCE_PCT);
  __wcD('FEIXUE_XUEXIU_KEY', FEIXUE_XUEXIU_KEY);
  __wcD('FEIXUE_XUEXIU_TEAM_KEY', FEIXUE_XUEXIU_TEAM_KEY);
  __wcD('FEIXUE_OUTRO_ELEMENT_DEEP_KEY', FEIXUE_OUTRO_ELEMENT_DEEP_KEY);
  __wcD('FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS', FEIXUE_XUEXIU_LEGACY_SPLIT_KEYS);
  __wcD('FEIXUE_XUEXIU_STACK_SYNC', FEIXUE_XUEXIU_STACK_SYNC);
  __wcD('FEIXUE_XUEXIU_MAX_STACKS', FEIXUE_XUEXIU_MAX_STACKS);
  __wcD('FEIXUE_C1_YUQIU_MULT_KEY', FEIXUE_C1_YUQIU_MULT_KEY);
  __wcD('FEIXUE_C2_JUHE_MULT_KEY', FEIXUE_C2_JUHE_MULT_KEY);
  __wcD('FEIXUE_C3_HEAVY_MULT_KEY', FEIXUE_C3_HEAVY_MULT_KEY);
  __wcD('FEIXUE_C4_TEAM_BONUS_KEY', FEIXUE_C4_TEAM_BONUS_KEY);
  __wcD('FEIXUE_C5_SKILL_MULT_KEY', FEIXUE_C5_SKILL_MULT_KEY);
  __wcD('FEIXUE_C6_JIANXIN_CRIT_KEY', FEIXUE_C6_JIANXIN_CRIT_KEY);
  __wcD('FEIXUE_C1_YUQIU_SKILLS', FEIXUE_C1_YUQIU_SKILLS);
  __wcD('FEIXUE_C2_JUHE_SKILLS', FEIXUE_C2_JUHE_SKILLS);
  __wcD('FEIXUE_C3_HEAVY_SKILLS', FEIXUE_C3_HEAVY_SKILLS);
  __wcD('FEIXUE_C5_SKILL_SKILLS', FEIXUE_C5_SKILL_SKILLS);
  __wcD('FEIXUE_C6_JIANXIN_SKILLS', FEIXUE_C6_JIANXIN_SKILLS);
  __wcD('SUISUI_CHAR_ID', SUISUI_CHAR_ID);
  __wcD('FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS', FEIXUE_XUEXIU_TEAM_ONLY_CHAR_IDS);
  __wcD('SUISUI_CONSUME_XUYAN_KEY', SUISUI_CONSUME_XUYAN_KEY);
  __wcD('SUISUI_OUTRO2_ER_BONUS_KEY', SUISUI_OUTRO2_ER_BONUS_KEY);
  __wcD('SUISUI_OUTRO2_LEGACY_KEYS', SUISUI_OUTRO2_LEGACY_KEYS);
  __wcD('SUISUI_OUTRO2_ER_THRESHOLD', SUISUI_OUTRO2_ER_THRESHOLD);
  __wcD('SUISUI_OUTRO2_BONUS_PER_PCT', SUISUI_OUTRO2_BONUS_PER_PCT);
  __wcD('SUISUI_OUTRO2_BONUS_CAP', SUISUI_OUTRO2_BONUS_CAP);
  __wcD('SUISUI_OUTRO3_ER_ATK_KEY', SUISUI_OUTRO3_ER_ATK_KEY);
  __wcD('SUISUI_OUTRO3_LEGACY_KEYS', SUISUI_OUTRO3_LEGACY_KEYS);
  __wcD('SUISUI_OUTRO3_ER_THRESHOLD', SUISUI_OUTRO3_ER_THRESHOLD);
  __wcD('SUISUI_OUTRO3_ER_PER_CHUNK', SUISUI_OUTRO3_ER_PER_CHUNK);
  __wcD('SUISUI_OUTRO3_ATK_PER_CHUNK', SUISUI_OUTRO3_ATK_PER_CHUNK);
  __wcD('SUISUI_OUTRO3_ATK_CAP', SUISUI_OUTRO3_ATK_CAP);
  __wcD('SHOREKEEPER_CHAR_ID', SHOREKEEPER_CHAR_ID);
  __wcD('SPECIAL_CHAR_IDS', SPECIAL_CHAR_IDS);
  __wcD('SHOREKEEPER_STAR_PURPLE_KEY', SHOREKEEPER_STAR_PURPLE_KEY);
  __wcD('SHOREKEEPER_STAR_PURPLE_LEGACY_KEYS', SHOREKEEPER_STAR_PURPLE_LEGACY_KEYS);
  __wcD('SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK', SHOREKEEPER_STAR_PURPLE_ER_PER_CHUNK);
  __wcD('SHOREKEEPER_STAR_PURPLE_CRIT_PER_CHUNK', SHOREKEEPER_STAR_PURPLE_CRIT_PER_CHUNK);
  __wcD('SHOREKEEPER_STAR_PURPLE_CRIT_CAP', SHOREKEEPER_STAR_PURPLE_CRIT_CAP);
  __wcD('SHOREKEEPER_STAR_GOLD_KEY', SHOREKEEPER_STAR_GOLD_KEY);
  __wcD('SHOREKEEPER_STAR_GOLD_LEGACY_KEYS', SHOREKEEPER_STAR_GOLD_LEGACY_KEYS);
  __wcD('SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK', SHOREKEEPER_STAR_GOLD_ER_PER_CHUNK);
  __wcD('SHOREKEEPER_STAR_GOLD_CRIT_DMG_PER_CHUNK', SHOREKEEPER_STAR_GOLD_CRIT_DMG_PER_CHUNK);
  __wcD('SHOREKEEPER_STAR_GOLD_CRIT_DMG_CAP', SHOREKEEPER_STAR_GOLD_CRIT_DMG_CAP);
  __wcD('SHOREKEEPER_INNATE2_ER_KEY', SHOREKEEPER_INNATE2_ER_KEY);
  __wcD('SHOREKEEPER_INNATE2_ER_PCT', SHOREKEEPER_INNATE2_ER_PCT);
  __wcD('SHOREKEEPER_INNATE2_ER_PANEL_SOURCE_ID', SHOREKEEPER_INNATE2_ER_PANEL_SOURCE_ID);
  __wcD('SHOREKEEPER_INNATE2_ROVER_IDS', SHOREKEEPER_INNATE2_ROVER_IDS);
  __wcD('YANGYANG_XUANLING_CHAR_ID', YANGYANG_XUANLING_CHAR_ID);
  __wcD('YANGYANG_XUANLING_OUTRO_DEEP_KEY', YANGYANG_XUANLING_OUTRO_DEEP_KEY);
  __wcD('YANGYANG_XUANLING_C6_ZHI_SKILL_KEY', YANGYANG_XUANLING_C6_ZHI_SKILL_KEY);
  __wcD('YANGYANG_XUANLING_C6_ZHI_CRIT_KEY', YANGYANG_XUANLING_C6_ZHI_CRIT_KEY);
  __wcD('YANGYANG_XUANLING_C6_ZHI_SKILLS', YANGYANG_XUANLING_C6_ZHI_SKILLS);
  __wcD('YANGYANG_XUANLING_C6_ZHI_BASE_MULT', YANGYANG_XUANLING_C6_ZHI_BASE_MULT);
  __wcD('SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS', SUISUI_CONSUME_XUYAN_ONLY_CHAR_IDS);
  __wcD('LUHESI_CHAR_ID', LUHESI_CHAR_ID);
  __wcD('QINGXIAO_CHAR_ID', QINGXIAO_CHAR_ID);
  __wcD('DANIA_OUTRO_PRIVILEGED_CHAR_IDS', DANIA_OUTRO_PRIVILEGED_CHAR_IDS);
  __wcD('LUHESI_INNATE2_DEEP_KEY', LUHESI_INNATE2_DEEP_KEY);
  __wcD('LUHESI_INNATE2_AMP_PER_CHUNK', LUHESI_INNATE2_AMP_PER_CHUNK);
  __wcD('LUHESI_INNATE2_DEEP_PER_CHUNK', LUHESI_INNATE2_DEEP_PER_CHUNK);
  __wcD('LUHESI_INNATE2_DEEP_CAP', LUHESI_INNATE2_DEEP_CAP);
  __wcD('LUHESI_INNATE2_C2_DEEP_PER_CHUNK', LUHESI_INNATE2_C2_DEEP_PER_CHUNK);
  __wcD('LUHESI_INNATE2_C2_DEEP_CAP', LUHESI_INNATE2_C2_DEEP_CAP);
  __wcD('SIGRIKA_CHAR_ID', SIGRIKA_CHAR_ID);
  __wcD('SIGRIKA_INNATE2_ECHO_BONUS_KEY', SIGRIKA_INNATE2_ECHO_BONUS_KEY);
  __wcD('SIGRIKA_INNATE2_ER_THRESHOLD', SIGRIKA_INNATE2_ER_THRESHOLD);
  __wcD('SIGRIKA_INNATE2_BONUS_PER_PCT', SIGRIKA_INNATE2_BONUS_PER_PCT);
  __wcD('SIGRIKA_INNATE2_BONUS_CAP', SIGRIKA_INNATE2_BONUS_CAP);
  __wcD('SIGRIKA_INNATE2_DEEP_PCT', SIGRIKA_INNATE2_DEEP_PCT);
  __wcD('SIGRIKA_INNATE2_ER_ECHO_EFFECT_KEY', SIGRIKA_INNATE2_ER_ECHO_EFFECT_KEY);
  __wcD('SIGRIKA_INNATE2_ER_PANEL_SOURCE_ID', SIGRIKA_INNATE2_ER_PANEL_SOURCE_ID);
  __wcD('SIGRIKA_TALENT_KEY', SIGRIKA_TALENT_KEY);
  __wcD('SIGRIKA_TALENT_STACKS_BASE', SIGRIKA_TALENT_STACKS_BASE);
  __wcD('SIGRIKA_TALENT_STACKS_AT_C3', SIGRIKA_TALENT_STACKS_AT_C3);
  __wcD('SIGRIKA_TALENT_C3_UNLOCK', SIGRIKA_TALENT_C3_UNLOCK);
  __wcD('SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY', SIGRIKA_TALENT_C6_DEEP_EFFECT_KEY);
  __wcD('SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY', SIGRIKA_TALENT_C6_DEF_IGNORE_EFFECT_KEY);
  __wcD('SIGRIKA_TALENT_C6_DEEP_PER_STACK', SIGRIKA_TALENT_C6_DEEP_PER_STACK);
  __wcD('SIGRIKA_TALENT_C6_DEF_IGNORE_PER_STACK', SIGRIKA_TALENT_C6_DEF_IGNORE_PER_STACK);
  __wcD('SIGRIKA_TALENT_AUTO_EFFECT_KEYS', SIGRIKA_TALENT_AUTO_EFFECT_KEYS);
  __wcD('SIGRIKA_C4_TEAM_ATK_KEY', SIGRIKA_C4_TEAM_ATK_KEY);
  __wcD('SIGRIKA_C4_TEAM_ATK_LEGACY_KEY', SIGRIKA_C4_TEAM_ATK_LEGACY_KEY);
  __wcD('SIGRIKA_C4_TEAM_ATK_NAME', SIGRIKA_C4_TEAM_ATK_NAME);
  __wcD('SIGRIKA_C4_TEAM_ATK_PCT', SIGRIKA_C4_TEAM_ATK_PCT);
  __wcD('LUHESI_C2_YONGDONG_MULT_KEY', LUHESI_C2_YONGDONG_MULT_KEY);
  __wcD('LUHESI_YONGDONG_SKILLS', LUHESI_YONGDONG_SKILLS);
  __wcD('LUHESI_C3_MULT_KEY', LUHESI_C3_MULT_KEY);
  __wcD('LUHESI_C3_MULT_SKILLS', LUHESI_C3_MULT_SKILLS);
  __wcD('SPECIAL_BUFF_SOURCE_TEAM', SPECIAL_BUFF_SOURCE_TEAM);
  __wcD('CHANGLI_CHAR_ID', CHANGLI_CHAR_ID);
  __wcD('CHANGLI_INNATE1_LIHUO_KEY', CHANGLI_INNATE1_LIHUO_KEY);
  __wcD('CHANGLI_INNATE2_KEY', CHANGLI_INNATE2_KEY);
  __wcD('CHANGLI_INNATE2_ATTACK_KEY', CHANGLI_INNATE2_ATTACK_KEY);
  __wcD('CHANGLI_OUTRO_KEY', CHANGLI_OUTRO_KEY);
  __wcD('CHANGLI_OUTRO_LEGACY_KEYS', CHANGLI_OUTRO_LEGACY_KEYS);
  __wcD('CHANGLI_C1_SKILL_TYPE_BONUS_KEY', CHANGLI_C1_SKILL_TYPE_BONUS_KEY);
  __wcD('CHANGLI_C2_CRIT_RATE_KEY', CHANGLI_C2_CRIT_RATE_KEY);
  __wcD('CHANGLI_C3_LIHUO_BONUS_KEY', CHANGLI_C3_LIHUO_BONUS_KEY);
  __wcD('CHANGLI_C4_TEAM_ATK_KEY', CHANGLI_C4_TEAM_ATK_KEY);
  __wcD('CHANGLI_C5_FENSHEN_KEY', CHANGLI_C5_FENSHEN_KEY);
  __wcD('CHANGLI_C6_DEFENSE_PEN_KEY', CHANGLI_C6_DEFENSE_PEN_KEY);
  __wcD('CHANGLI_LIHUO_SKILLS', CHANGLI_LIHUO_SKILLS);
  __wcD('CHANGLI_FENSHEN_SKILLS', CHANGLI_FENSHEN_SKILLS);
  __wcD('CHIXIA_CHAR_ID', CHIXIA_CHAR_ID);
  __wcD('CHIXIA_C1_HONGHONG_CRIT_KEY', CHIXIA_C1_HONGHONG_CRIT_KEY);
  __wcD('CHIXIA_HONGHONG_SKILLS', CHIXIA_HONGHONG_SKILLS);
  __wcD('MONING_CHAR_ID', MONING_CHAR_ID);
  __wcD('MONING_FIELD_DEF_KEY', MONING_FIELD_DEF_KEY);
  __wcD('MONING_C5_RESPONSE_BOOST_KEY', MONING_C5_RESPONSE_BOOST_KEY);
  __wcD('MONING_C5_RESPONSE_BOOST_SOURCE_TAG', MONING_C5_RESPONSE_BOOST_SOURCE_TAG);
  __wcD('MONING_RESPONSE_SHOCK_SKILLS', MONING_RESPONSE_SHOCK_SKILLS);
  __wcD('MONING_RESPONSE_SHOCK_LIB_KEY', MONING_RESPONSE_SHOCK_LIB_KEY);
  __wcD('MONING_C5_RESPONSE_BOOST_PCT', MONING_C5_RESPONSE_BOOST_PCT);
  __wcD('MONING_CRITICAL_PROTOCOL_ER_KEY', MONING_CRITICAL_PROTOCOL_ER_KEY);
  __wcD('MONING_CRITICAL_PROTOCOL_SKILLS', MONING_CRITICAL_PROTOCOL_SKILLS);
  __wcD('MONING_CRITICAL_PROTOCOL_ER_THRESHOLD', MONING_CRITICAL_PROTOCOL_ER_THRESHOLD);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_RATE_PER_PCT', MONING_CRITICAL_PROTOCOL_CRIT_RATE_PER_PCT);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_RATE_CAP', MONING_CRITICAL_PROTOCOL_CRIT_RATE_CAP);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_DMG_PER_PCT', MONING_CRITICAL_PROTOCOL_CRIT_DMG_PER_PCT);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_DMG_CAP', MONING_CRITICAL_PROTOCOL_CRIT_DMG_CAP);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_RATE_EFFECT_KEY', MONING_CRITICAL_PROTOCOL_CRIT_RATE_EFFECT_KEY);
  __wcD('MONING_CRITICAL_PROTOCOL_CRIT_DMG_EFFECT_KEY', MONING_CRITICAL_PROTOCOL_CRIT_DMG_EFFECT_KEY);
  __wcD('MONING_C2_ER_CRIT_DMG_KEY', MONING_C2_ER_CRIT_DMG_KEY);
  __wcD('MONING_C2_ER_THRESHOLD', MONING_C2_ER_THRESHOLD);
  __wcD('MONING_C2_CRIT_DMG_PER_PCT', MONING_C2_CRIT_DMG_PER_PCT);
  __wcD('MONING_C2_CRIT_DMG_CAP', MONING_C2_CRIT_DMG_CAP);
  __wcD('MONING_C2_LEGACY_CRIT_DMG_KEYS', MONING_C2_LEGACY_CRIT_DMG_KEYS);
  __wcD('MONING_OFFSET_HARMONY_EFF_KEY', MONING_OFFSET_HARMONY_EFF_KEY);
  __wcD('MONING_OFFSET_HARMONY_EFF_PCT', MONING_OFFSET_HARMONY_EFF_PCT);
  __wcD('MONING_C2_OFFSET_HARMONY_EFF_KEY', MONING_C2_OFFSET_HARMONY_EFF_KEY);
  __wcD('MONING_C2_OFFSET_HARMONY_EFF_PCT', MONING_C2_OFFSET_HARMONY_EFF_PCT);
  __wcD('MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS', MONING_LEGACY_OFFSET_HARMONY_EFF_KEYS);
  __wcD('MONING_OFFSET_HARMONY_PANEL_SOURCE_ID', MONING_OFFSET_HARMONY_PANEL_SOURCE_ID);
  __wcD('MONING_C2_OFFSET_HARMONY_PANEL_SOURCE_ID', MONING_C2_OFFSET_HARMONY_PANEL_SOURCE_ID);
  __wcD('JIABEILINA_CHAR_ID', JIABEILINA_CHAR_ID);
  __wcD('JIABEILINA_C3_ULT_MULT_KEY', JIABEILINA_C3_ULT_MULT_KEY);
  __wcD('JIABEILINA_C3_ULT_MULT_LEGACY_KEY', JIABEILINA_C3_ULT_MULT_LEGACY_KEY);
  __wcD('JIABEILINA_C3_ULT_MULT_NAME', JIABEILINA_C3_ULT_MULT_NAME);
  __wcD('JIABEILINA_NEIRANSHAO_ATK_KEY', JIABEILINA_NEIRANSHAO_ATK_KEY);
  __wcD('JIABEILINA_NEIRANSHAO_ATK_PCT', JIABEILINA_NEIRANSHAO_ATK_PCT);
  __wcD('JIABEILINA_NEIRANSHAO_C2_EXTRA_PCT', JIABEILINA_NEIRANSHAO_C2_EXTRA_PCT);
  __wcD('JIABEILINA_NEIRANSHAO_C2_KEY', JIABEILINA_NEIRANSHAO_C2_KEY);
  __wcD('JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY', JIABEILINA_YUHUO_C1_CRIT_EFFECT_KEY);
  __wcD('JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY', JIABEILINA_YUHUO_C6_DEEP_EFFECT_KEY);
  __wcD('JIABEILINA_YUHUO_AUTO_EFFECT_KEYS', JIABEILINA_YUHUO_AUTO_EFFECT_KEYS);
  __wcD('CHAR_BRANCH_PANEL_BY_ID', CHAR_BRANCH_PANEL_BY_ID);
  __wcD('JINGRAN_CHAR_ID', JINGRAN_CHAR_ID);
  __wcD('TEST_SERVER_CHARACTER_IDS', TEST_SERVER_CHARACTER_IDS);
  __wcD('IS_PUBLIC_SITE', IS_PUBLIC_SITE);
  __wcE('isPublicSiteHiddenCharId', function () { return isPublicSiteHiddenCharId; }, function (v) { isPublicSiteHiddenCharId = v; }, true, true);
  __wcD('CSF_QUERY_KEY', CSF_QUERY_KEY);
  __wcD('CSF_QUERY_TOKEN', CSF_QUERY_TOKEN);
  __wcD('CSF_MODE', CSF_MODE);
  __wcD('CSF_CHARACTER_IDS', CSF_CHARACTER_IDS);
  __wcE('csfManifest', function () { return csfManifest; }, function (v) { csfManifest = v; }, false, true);
  __wcE('csfSkillsMerged', function () { return csfSkillsMerged; }, function (v) { csfSkillsMerged = v; }, false, true);
  __wcE('csfTemplatesMerged', function () { return csfTemplatesMerged; }, function (v) { csfTemplatesMerged = v; }, false, true);
  __wcE('csfOverlayPromise', function () { return csfOverlayPromise; }, function (v) { csfOverlayPromise = v; }, false, true);
  __wcE('isCsfCharacter', function () { return isCsfCharacter; }, function (v) { isCsfCharacter = v; }, true, true);
  __wcE('loadCsfManifest', function () { return loadCsfManifest; }, function (v) { loadCsfManifest = v; }, true, true);
  __wcE('loadCsfSkillOverlay', function () { return loadCsfSkillOverlay; }, function (v) { loadCsfSkillOverlay = v; }, true, true);
  __wcE('loadCsfTemplateOverlay', function () { return loadCsfTemplateOverlay; }, function (v) { loadCsfTemplateOverlay = v; }, true, true);
  __wcE('csfWeaponsMerged', function () { return csfWeaponsMerged; }, function (v) { csfWeaponsMerged = v; }, false, true);
  __wcE('csfEchoMerged', function () { return csfEchoMerged; }, function (v) { csfEchoMerged = v; }, false, true);
  __wcE('loadCsfWeaponOverlay', function () { return loadCsfWeaponOverlay; }, function (v) { loadCsfWeaponOverlay = v; }, true, true);
  __wcE('loadCsfEchoOverlay', function () { return loadCsfEchoOverlay; }, function (v) { loadCsfEchoOverlay = v; }, true, true);
  __wcE('ensureCsfOverlay', function () { return ensureCsfOverlay; }, function (v) { ensureCsfOverlay = v; }, true, true);
  __wcD('JINGRAN_HP_FLAT_ATK_SOURCE_ID', JINGRAN_HP_FLAT_ATK_SOURCE_ID);
  __wcD('JINGRAN_HP_FLAT_ATK_PER_CHUNK', JINGRAN_HP_FLAT_ATK_PER_CHUNK);
  __wcD('JINGRAN_HP_FLAT_ATK_HP_CHUNK', JINGRAN_HP_FLAT_ATK_HP_CHUNK);
  __wcD('JINGRAN_HP_FLAT_ATK_CAP', JINGRAN_HP_FLAT_ATK_CAP);
  __wcD('JINGRAN_YINYANG_XIANGSHENG_PER_CHUNK', JINGRAN_YINYANG_XIANGSHENG_PER_CHUNK);
  __wcD('JINGRAN_YINYANG_XIANGSHENG_CAP', JINGRAN_YINYANG_XIANGSHENG_CAP);
  __wcD('JINGRAN_MINGHUO_KEY', JINGRAN_MINGHUO_KEY);
  __wcD('JINGRAN_MINGHUO_HP_THRESHOLD', JINGRAN_MINGHUO_HP_THRESHOLD);
  __wcD('JINGRAN_MINGHUO_HP_CAP', JINGRAN_MINGHUO_HP_CAP);
  __wcD('JINGRAN_MINGHUO_MAX_CHUNKS', JINGRAN_MINGHUO_MAX_CHUNKS);
  __wcD('JINGRAN_MINGHUO_JIEPO_PER_CHUNK', JINGRAN_MINGHUO_JIEPO_PER_CHUNK);
  __wcD('JINGRAN_MINGHUO_TAGANG_PER_CHUNK', JINGRAN_MINGHUO_TAGANG_PER_CHUNK);
  __wcD('JINGRAN_MINGHUO_JIEPO_EFFECT_KEY', JINGRAN_MINGHUO_JIEPO_EFFECT_KEY);
  __wcD('JINGRAN_MINGHUO_TAGANG_EFFECT_KEY', JINGRAN_MINGHUO_TAGANG_EFFECT_KEY);
  __wcD('JINGRAN_JIEPO_SKILLS', JINGRAN_JIEPO_SKILLS);
  __wcD('JINGRAN_TAGANG_SKILLS', JINGRAN_TAGANG_SKILLS);
  __wcD('JINGRAN_HUOXI_FUXI_KEY', JINGRAN_HUOXI_FUXI_KEY);
  __wcD('JINGRAN_HUOXI_FUXI_MAX_STACKS', JINGRAN_HUOXI_FUXI_MAX_STACKS);
  __wcD('JINGRAN_HUOXI_FUXI_PER_CHUNK', JINGRAN_HUOXI_FUXI_PER_CHUNK);
  __wcD('JINGRAN_HUOXI_FUXI_PER_STACK_CAP', JINGRAN_HUOXI_FUXI_PER_STACK_CAP);
  __wcD('JINGRAN_YOUFU_FUMING_KEY', JINGRAN_YOUFU_FUMING_KEY);
  __wcD('JINGRAN_YOUFU_FUMING_PER_CHUNK', JINGRAN_YOUFU_FUMING_PER_CHUNK);
  __wcD('JINGRAN_YOUFU_FUMING_CAP', JINGRAN_YOUFU_FUMING_CAP);
  __wcD('JINGRAN_YOUFU_FUMING_EFFECT_KEY', JINGRAN_YOUFU_FUMING_EFFECT_KEY);
  __wcD('COMBAT_MODE_DEFS', COMBAT_MODE_DEFS);
  __wcD('CHAR_COMBAT_MODE_CONFIG', CHAR_COMBAT_MODE_CONFIG);
  __wcD('PHOEBE_CHAR_ID', PHOEBE_CHAR_ID);
  __wcD('PHOEBE_HYBRID_COMBAT_MODES', PHOEBE_HYBRID_COMBAT_MODES);
  __wcD('PHOEBE_INNATE2_ELEMENT_KEY', PHOEBE_INNATE2_ELEMENT_KEY);
  __wcD('PHOEBE_INNATE2_ELEMENT_PCT', PHOEBE_INNATE2_ELEMENT_PCT);
  __wcD('PHOEBE_ABSOLUTION_KIT_KEY', PHOEBE_ABSOLUTION_KIT_KEY);
  __wcD('PHOEBE_STARLIGHT_HEAVY_DEEP_PCT', PHOEBE_STARLIGHT_HEAVY_DEEP_PCT);
  __wcD('PHOEBE_DAWN_OATH_MULT_BOOST_PCT', PHOEBE_DAWN_OATH_MULT_BOOST_PCT);
  __wcD('PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL', PHOEBE_DAWN_OATH_C1_ABSOLUTION_TOTAL);
  __wcD('PHOEBE_DAWN_OATH_C1_ABSOLUTION_EXTRA', PHOEBE_DAWN_OATH_C1_ABSOLUTION_EXTRA);
  __wcD('PHOEBE_C1_CONFESSION_DAWN_KEY', PHOEBE_C1_CONFESSION_DAWN_KEY);
  __wcD('PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT', PHOEBE_DAWN_OATH_C1_CONFESSION_MULT_PCT);
  __wcD('PHOEBE_LISTEN_HEART_MULT_BOOST_PCT', PHOEBE_LISTEN_HEART_MULT_BOOST_PCT);
  __wcD('PHOEBE_C2_ABSOLUTION_LISTEN_DEEP_KEY', PHOEBE_C2_ABSOLUTION_LISTEN_DEEP_KEY);
  __wcD('PHOEBE_LISTEN_HEART_C2_DEEP_PCT', PHOEBE_LISTEN_HEART_C2_DEEP_PCT);
  __wcD('PHOEBE_STARLIGHT_HEAVY_SKILLS', PHOEBE_STARLIGHT_HEAVY_SKILLS);
  __wcD('PHOEBE_DAWN_OATH_SKILLS', PHOEBE_DAWN_OATH_SKILLS);
  __wcD('PHOEBE_LISTEN_HEART_SKILLS', PHOEBE_LISTEN_HEART_SKILLS);
  __wcD('PHOEBE_OUTRO_KEY', PHOEBE_OUTRO_KEY);
  __wcD('PHOEBE_OUTRO_RES_REDUCE_PCT', PHOEBE_OUTRO_RES_REDUCE_PCT);
  __wcD('PHOEBE_OUTRO_GUANGZAO_DEEP_PCT', PHOEBE_OUTRO_GUANGZAO_DEEP_PCT);
  __wcD('PHOEBE_OUTRO_GUANGZAO_C2_EXTRA_PCT', PHOEBE_OUTRO_GUANGZAO_C2_EXTRA_PCT);
  __wcD('PHOEBE_OUTRO_GUANGZAO_C2_TOTAL', PHOEBE_OUTRO_GUANGZAO_C2_TOTAL);
  __wcD('PHOEBE_C3_ABSOLUTION_STARLIGHT_KEY', PHOEBE_C3_ABSOLUTION_STARLIGHT_KEY);
  __wcD('PHOEBE_C3_CONFESSION_STARLIGHT_KEY', PHOEBE_C3_CONFESSION_STARLIGHT_KEY);
  __wcD('PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT', PHOEBE_STARLIGHT_C3_ABSOLUTION_MULT_PCT);
  __wcD('PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT', PHOEBE_STARLIGHT_C3_CONFESSION_MULT_PCT);
  __wcD('PHOEBE_C4_TEAM_RES_KEY', PHOEBE_C4_TEAM_RES_KEY);
  __wcD('PHOEBE_C4_TEAM_RES_REDUCE_PCT', PHOEBE_C4_TEAM_RES_REDUCE_PCT);
  __wcD('PHOEBE_C4_PERSONAL_ELEMENT_KEY', PHOEBE_C4_PERSONAL_ELEMENT_KEY);
  __wcD('PHOEBE_C4_PERSONAL_ELEMENT_PCT', PHOEBE_C4_PERSONAL_ELEMENT_PCT);
  __wcD('PHOEBE_C6_PERSONAL_ATK_KEY', PHOEBE_C6_PERSONAL_ATK_KEY);
  __wcD('PHOEBE_C6_PERSONAL_ATK_PCT', PHOEBE_C6_PERSONAL_ATK_PCT);
  __wcD('QIANXIAO_CHAR_ID', QIANXIAO_CHAR_ID);
  __wcD('QIANXIAO_C1_EXTRA_SKILL_KEY', QIANXIAO_C1_EXTRA_SKILL_KEY);
  __wcD('QIANXIAO_C1_EXTRA_SKILL_NAME', QIANXIAO_C1_EXTRA_SKILL_NAME);
  __wcD('QIANXIAO_C1_EXTRA_FIXED_DMG', QIANXIAO_C1_EXTRA_FIXED_DMG);
  __wcD('QIANXIAO_HUIZHONG_KEY', QIANXIAO_HUIZHONG_KEY);
  __wcD('QIANXIAO_HUIZHONG_MULT_PCT', QIANXIAO_HUIZHONG_MULT_PCT);
  __wcD('QIANXIAO_HUIZHONG_C2_MIN_RESONANCE', QIANXIAO_HUIZHONG_C2_MIN_RESONANCE);
  __wcD('QIANXIAO_HUIZHONG_BASE_EFFECT_KEY', QIANXIAO_HUIZHONG_BASE_EFFECT_KEY);
  __wcD('QIANXIAO_HUIZHONG_C2_EFFECT_KEY', QIANXIAO_HUIZHONG_C2_EFFECT_KEY);
  __wcD('QIANXIAO_HUIZHONG_GAME_TEXT', QIANXIAO_HUIZHONG_GAME_TEXT);
  __wcD('QIANXIAO_XUWUWENHEN_KEY', QIANXIAO_XUWUWENHEN_KEY);
  __wcD('QIANXIAO_XUWUWENHEN_NAME', QIANXIAO_XUWUWENHEN_NAME);
  __wcD('QIANXIAO_XUWUWENHEN_IGNORE_PCT', QIANXIAO_XUWUWENHEN_IGNORE_PCT);
  __wcD('QIANXIAO_ANYINGXIAO_KEY', QIANXIAO_ANYINGXIAO_KEY);
  __wcD('QIANXIAO_ANYINGXIAO_NAME', QIANXIAO_ANYINGXIAO_NAME);
  __wcD('QIANXIAO_ANYINGXIAO_PEN_PER_STACK', QIANXIAO_ANYINGXIAO_PEN_PER_STACK);
  __wcD('QIANXIAO_ANYINGXIAO_MAX_STACKS', QIANXIAO_ANYINGXIAO_MAX_STACKS);
  __wcD('QIANXIAO_HUIZHONG_SKILLS', QIANXIAO_HUIZHONG_SKILLS);
  __wcD('AMIS_CHAR_ID', AMIS_CHAR_ID);
  __wcD('SPECIAL_SKILL_LIB_SOURCE_TAG', SPECIAL_SKILL_LIB_SOURCE_TAG);
  __wcD('AMIS_CHAIN6_CRIT_RATE', AMIS_CHAIN6_CRIT_RATE);
  __wcD('AMIS_CHAIN6_CRIT_DMG', AMIS_CHAIN6_CRIT_DMG);
  __wcD('AMIS_BURST_WING_STACK_TABLE', AMIS_BURST_WING_STACK_TABLE);
  __wcD('AMIS_BURST_WING_STACK_OPTIONS', AMIS_BURST_WING_STACK_OPTIONS);
  __wcD('SPECIAL_SKILL_LIBRARIES', SPECIAL_SKILL_LIBRARIES);
  __wcD('SPECIAL_SKILL_LIB_KEY_MIGRATE', SPECIAL_SKILL_LIB_KEY_MIGRATE);
  __wcD('WEAPON_REFINEMENT_OPTIONS', WEAPON_REFINEMENT_OPTIONS);
  __wcD('WEAPON_TYPE_LABELS', WEAPON_TYPE_LABELS);
  __wcD('ELEMENT_TYPES', ELEMENT_TYPES);
  __wcD('CHAR_ELEMENT_COLORS', CHAR_ELEMENT_COLORS);
  __wcD('NANOKA_ASSET_BASE', NANOKA_ASSET_BASE);
  __wcD('ELEMENT_ICON_FILES', ELEMENT_ICON_FILES);
  __wcD('WEAPON_ICON_FILES', WEAPON_ICON_FILES);
  __wcD('NANOKA_ELEMENT_ICON_PATHS', NANOKA_ELEMENT_ICON_PATHS);
  __wcD('NANOKA_WEAPON_ICON_PATHS', NANOKA_WEAPON_ICON_PATHS);
  __wcD('PANEL_STAT_ICON_FILES', PANEL_STAT_ICON_FILES);
  __wcD('NANOKA_PANEL_STAT_ICON_PATHS', NANOKA_PANEL_STAT_ICON_PATHS);
  __wcD('PANEL_ATTR_BONUS_ICON_BY_ELEMENT', PANEL_ATTR_BONUS_ICON_BY_ELEMENT);
  __wcD('PANEL_TYPE_DMG_ICON_TYPES', PANEL_TYPE_DMG_ICON_TYPES);
  __wcD('PANEL_TYPE_DMG_ICON_BY_TYPE', PANEL_TYPE_DMG_ICON_BY_TYPE);
  __wcE('getPrimaryTypeDmgBonusType', function () { return getPrimaryTypeDmgBonusType; }, function (v) { getPrimaryTypeDmgBonusType = v; }, true, true);
  __wcE('getPanelStatIconInfo', function () { return getPanelStatIconInfo; }, function (v) { getPanelStatIconInfo = v; }, true, true);
  __wcD('ECHO_COST_CAP', ECHO_COST_CAP);
  __wcD('ECHO_SOURCE_ID', ECHO_SOURCE_ID);
  __wcD('ECHO_SOURCE_NAME', ECHO_SOURCE_NAME);
  __wcD('ECHO_DMG_SOURCE_PREFIX', ECHO_DMG_SOURCE_PREFIX);
  __wcD('ECHO_ATTR_SOURCE_PREFIX', ECHO_ATTR_SOURCE_PREFIX);
  __wcD('ECHO_TYPE_DMG_SOURCE_PREFIX', ECHO_TYPE_DMG_SOURCE_PREFIX);
  __wcE('isEchoAttrPanelSource', function () { return isEchoAttrPanelSource; }, function (v) { isEchoAttrPanelSource = v; }, true, true);
  __wcE('isEchoTypeDmgPanelSource', function () { return isEchoTypeDmgPanelSource; }, function (v) { isEchoTypeDmgPanelSource = v; }, true, true);
  __wcE('isEchoDmgPanelSource', function () { return isEchoDmgPanelSource; }, function (v) { isEchoDmgPanelSource = v; }, true, true);
  __wcE('isEchoAggTotalSource', function () { return isEchoAggTotalSource; }, function (v) { isEchoAggTotalSource = v; }, true, true);
  __wcE('isEchoPanelSource', function () { return isEchoPanelSource; }, function (v) { isEchoPanelSource = v; }, true, true);
  __wcD('ECHO_SET_BONUS_TIERS', ECHO_SET_BONUS_TIERS);
  __wcE('getEchoSetActiveTiers', function () { return getEchoSetActiveTiers; }, function (v) { getEchoSetActiveTiers = v; }, true, true);
  __wcD('ECHO_SET_PANEL_PREFIX', ECHO_SET_PANEL_PREFIX);
  __wcD('ECHO_MAIN_PANEL_ATTR_PREFIX', ECHO_MAIN_PANEL_ATTR_PREFIX);
  __wcD('ECHO_MAIN_PANEL_TYPE_PREFIX', ECHO_MAIN_PANEL_TYPE_PREFIX);
  __wcD('ECHO_MAIN_PANEL_STAT_PREFIX', ECHO_MAIN_PANEL_STAT_PREFIX);
  __wcD('ECHO_MAIN_BUFF_PREFIX', ECHO_MAIN_BUFF_PREFIX);
  __wcD('ECHO_SET_BUFF_PREFIX', ECHO_SET_BUFF_PREFIX);
  __wcD('ECHO_SET_TEAM_BUFF_PREFIX', ECHO_SET_TEAM_BUFF_PREFIX);
  __wcD('ECHO_SET_SKILL_PREFIX', ECHO_SET_SKILL_PREFIX);
  __wcD('ECHO_MAIN_TEAM_BUFF_PREFIX', ECHO_MAIN_TEAM_BUFF_PREFIX);
  __wcD('ECHO_SKILL_PALETTE_ID', ECHO_SKILL_PALETTE_ID);
  __wcD('ECHO_MAIN_SKILL_PREFIX', ECHO_MAIN_SKILL_PREFIX);
  __wcD('ECHO_SET_NIGUANG_YUECAI_ID', ECHO_SET_NIGUANG_YUECAI_ID);
  __wcD('ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC', ECHO_NIGUANG_HARMONY_ATK_STACK_SYNC);
  __wcD('ECHO_NIGUANG_ATK_BASE', ECHO_NIGUANG_ATK_BASE);
  __wcD('ECHO_NIGUANG_ATK_PER_POINT', ECHO_NIGUANG_ATK_PER_POINT);
  __wcD('ECHO_NIGUANG_ATK_EXTRA_CAP', ECHO_NIGUANG_ATK_EXTRA_CAP);
  __wcD('ECHO_SETS_DB_URL', ECHO_SETS_DB_URL);
  __wcD('ECHO_SPECIMENS_DB_URL', ECHO_SPECIMENS_DB_URL);
  __wcD('ECHO_SET_MAIN_MAP_URL', ECHO_SET_MAIN_MAP_URL);
  __wcD('ECHO_SETS_DB_CACHE_KEY', ECHO_SETS_DB_CACHE_KEY);
  __wcD('ECHO_SPECIMENS_DB_CACHE_KEY', ECHO_SPECIMENS_DB_CACHE_KEY);
  __wcD('ECHO_SET_MAIN_MAP_CACHE_KEY', ECHO_SET_MAIN_MAP_CACHE_KEY);
  __wcD('ECHO_SET_MAIN_MAP_MIN_SETS', ECHO_SET_MAIN_MAP_MIN_SETS);
  __wcD('ECHO_SPECIMENS_MIN_COUNT', ECHO_SPECIMENS_MIN_COUNT);
  __wcE('isEchoSetPanelSource', function () { return isEchoSetPanelSource; }, function (v) { isEchoSetPanelSource = v; }, true, true);
  __wcE('isEchoMainTypePanelSource', function () { return isEchoMainTypePanelSource; }, function (v) { isEchoMainTypePanelSource = v; }, true, true);
  __wcE('isEchoSetGeneratedBuff', function () { return isEchoSetGeneratedBuff; }, function (v) { isEchoSetGeneratedBuff = v; }, true, true);
  __wcE('isEchoSetTeamBuff', function () { return isEchoSetTeamBuff; }, function (v) { isEchoSetTeamBuff = v; }, true, true);
  __wcE('isEchoMainTeamBuff', function () { return isEchoMainTeamBuff; }, function (v) { isEchoMainTeamBuff = v; }, true, true);
  __wcE('isEchoMainPanelSource', function () { return isEchoMainPanelSource; }, function (v) { isEchoMainPanelSource = v; }, true, true);
  __wcE('parseAttrSourceElement', function () { return parseAttrSourceElement; }, function (v) { parseAttrSourceElement = v; }, true, true);
  __wcE('parseTypeSourceDamageType', function () { return parseTypeSourceDamageType; }, function (v) { parseTypeSourceDamageType = v; }, true, true);
  __wcE('getManualAttrBonusForElement', function () { return getManualAttrBonusForElement; }, function (v) { getManualAttrBonusForElement = v; }, true, true);
  __wcE('getManualTypeDmgBonusForType', function () { return getManualTypeDmgBonusForType; }, function (v) { getManualTypeDmgBonusForType = v; }, true, true);
  __wcE('getRebeccaC6NormalAtkBonusScale', function () { return getRebeccaC6NormalAtkBonusScale; }, function (v) { getRebeccaC6NormalAtkBonusScale = v; }, true, true);
  __wcE('getEchoMainAttrBonusPct', function () { return getEchoMainAttrBonusPct; }, function (v) { getEchoMainAttrBonusPct = v; }, true, true);
  __wcE('getEchoMainTypeDmgBonusPct', function () { return getEchoMainTypeDmgBonusPct; }, function (v) { getEchoMainTypeDmgBonusPct = v; }, true, true);
  __wcD('ECHO_LAYOUTS', ECHO_LAYOUTS);
  __wcD('ECHO_ELEMENTS', ECHO_ELEMENTS);
  __wcD('BUFF_ELEMENT_GENERAL', BUFF_ELEMENT_GENERAL);
  __wcD('BUFF_EFFECT_TYPE_GENERAL', BUFF_EFFECT_TYPE_GENERAL);
  __wcD('ECHO_MAIN1_OPTIONS', ECHO_MAIN1_OPTIONS);
  __wcD('ECHO_MAIN2_FIXED', ECHO_MAIN2_FIXED);
  __wcD('ECHO_SUB_TYPE_DAMAGE_TYPES', ECHO_SUB_TYPE_DAMAGE_TYPES);
  __wcD('ECHO_SUB_TYPE_DMG_LEGACY', ECHO_SUB_TYPE_DMG_LEGACY);
  __wcD('ECHO_SUB_ROLLS_ATK_HP_TYPE', ECHO_SUB_ROLLS_ATK_HP_TYPE);
  __wcD('ECHO_SUB_AFFIXES', ECHO_SUB_AFFIXES);
  __wcE('echoSubRollEquals', function () { return echoSubRollEquals; }, function (v) { echoSubRollEquals = v; }, true, true);
  __wcE('getEchoSubRolls', function () { return getEchoSubRolls; }, function (v) { getEchoSubRolls = v; }, true, true);
  __wcE('isEchoSubOfficialRoll', function () { return isEchoSubOfficialRoll; }, function (v) { isEchoSubOfficialRoll = v; }, true, true);
  __wcE('snapEchoSubValueToRolls', function () { return snapEchoSubValueToRolls; }, function (v) { snapEchoSubValueToRolls = v; }, true, true);
  __wcE('formatEchoSubRollOption', function () { return formatEchoSubRollOption; }, function (v) { formatEchoSubRollOption = v; }, true, true);
  __wcD('ECHO_SUB_TEMPLATES', ECHO_SUB_TEMPLATES);
  __wcD('ECHO_SUB_SPECIAL_TEMPLATES', ECHO_SUB_SPECIAL_TEMPLATES);
  __wcE('isEchoSubTemplateForMember', function () { return isEchoSubTemplateForMember; }, function (v) { isEchoSubTemplateForMember = v; }, true, true);
  __wcE('getEchoSubTemplatesForMember', function () { return getEchoSubTemplatesForMember; }, function (v) { getEchoSubTemplatesForMember = v; }, true, true);
  __wcE('resolveEchoSubTemplate', function () { return resolveEchoSubTemplate; }, function (v) { resolveEchoSubTemplate = v; }, true, true);
  __wcE('defaultEchoMain1ForCost', function () { return defaultEchoMain1ForCost; }, function (v) { defaultEchoMain1ForCost = v; }, true, true);
  __wcE('createEchoSlot', function () { return createEchoSlot; }, function (v) { createEchoSlot = v; }, true, true);
  __wcE('getDefaultMainSlotIndex', function () { return getDefaultMainSlotIndex; }, function (v) { getDefaultMainSlotIndex = v; }, true, true);
  __wcD('ECHO_SET_LOADOUT_MAX', ECHO_SET_LOADOUT_MAX);
  __wcE('defaultEchoSetLoadout', function () { return defaultEchoSetLoadout; }, function (v) { defaultEchoSetLoadout = v; }, true, true);
  __wcE('padEchoSetLoadout', function () { return padEchoSetLoadout; }, function (v) { padEchoSetLoadout = v; }, true, true);
  __wcE('normalizeEchoSetLoadoutEntry', function () { return normalizeEchoSetLoadoutEntry; }, function (v) { normalizeEchoSetLoadoutEntry = v; }, true, true);
  __wcE('deriveSetLoadoutFromSlots', function () { return deriveSetLoadoutFromSlots; }, function (v) { deriveSetLoadoutFromSlots = v; }, true, true);
  __wcE('clampEchoSetLoadoutCounts', function () { return clampEchoSetLoadoutCounts; }, function (v) { clampEchoSetLoadoutCounts = v; }, true, true);
  __wcE('resolveMainEchoPrimarySetId', function () { return resolveMainEchoPrimarySetId; }, function (v) { resolveMainEchoPrimarySetId = v; }, true, true);
  __wcE('getMainEchoFromLoadout', function () { return getMainEchoFromLoadout; }, function (v) { getMainEchoFromLoadout = v; }, true, true);
  __wcE('syncSetLoadoutToSlots', function () { return syncSetLoadoutToSlots; }, function (v) { syncSetLoadoutToSlots = v; }, true, true);
  __wcE('defaultEchoConfig', function () { return defaultEchoConfig; }, function (v) { defaultEchoConfig = v; }, true, true);
  __wcE('normalizeEchoSub', function () { return normalizeEchoSub; }, function (v) { normalizeEchoSub = v; }, true, true);
  __wcE('normalizeEchoSlot', function () { return normalizeEchoSlot; }, function (v) { normalizeEchoSlot = v; }, true, true);
  __wcE('normalizeEchoConfig', function () { return normalizeEchoConfig; }, function (v) { normalizeEchoConfig = v; }, true, true);
  __wcE('ensureEchoConfig', function () { return ensureEchoConfig; }, function (v) { ensureEchoConfig = v; }, true, true);
  __wcE('getEchoCostTotal', function () { return getEchoCostTotal; }, function (v) { getEchoCostTotal = v; }, true, true);
  __wcE('getEchoMain1Option', function () { return getEchoMain1Option; }, function (v) { getEchoMain1Option = v; }, true, true);
  __wcE('resolveEchoMain1Display', function () { return resolveEchoMain1Display; }, function (v) { resolveEchoMain1Display = v; }, true, true);
  __wcE('accumulateEchoStat', function () { return accumulateEchoStat; }, function (v) { accumulateEchoStat = v; }, true, true);
  __wcE('aggregateEchoStats', function () { return aggregateEchoStats; }, function (v) { aggregateEchoStats = v; }, true, true);
  __wcE('getMemberElementLabel', function () { return getMemberElementLabel; }, function (v) { getMemberElementLabel = v; }, true, true);
  __wcE('getEchoAttrBonusPct', function () { return getEchoAttrBonusPct; }, function (v) { getEchoAttrBonusPct = v; }, true, true);
  __wcE('inferEchoSkillElement', function () { return inferEchoSkillElement; }, function (v) { inferEchoSkillElement = v; }, true, true);
  __wcE('getUnitDamageElement', function () { return getUnitDamageElement; }, function (v) { getUnitDamageElement = v; }, true, true);
  __wcE('getEchoTypeDmgBonusPct', function () { return getEchoTypeDmgBonusPct; }, function (v) { getEchoTypeDmgBonusPct = v; }, true, true);
  __wcE('getCharFlatHpTotal', function () { return getCharFlatHpTotal; }, function (v) { getCharFlatHpTotal = v; }, true, true);
  __wcE('getCharFlatDefTotal', function () { return getCharFlatDefTotal; }, function (v) { getCharFlatDefTotal = v; }, true, true);
  __wcE('getMemberActiveHpPctBuff', function () { return getMemberActiveHpPctBuff; }, function (v) { getMemberActiveHpPctBuff = v; }, true, true);
  __wcE('getFinalHp', function () { return getFinalHp; }, function (v) { getFinalHp = v; }, true, true);
  __wcE('getFinalAtk', function () { return getFinalAtk; }, function (v) { getFinalAtk = v; }, true, true);
  __wcE('getFinalDef', function () { return getFinalDef; }, function (v) { getFinalDef = v; }, true, true);
  __wcE('getCharFlatAtkTotal', function () { return getCharFlatAtkTotal; }, function (v) { getCharFlatAtkTotal = v; }, true, true);
  __wcE('getBrantSpecialMechanicsForMember', function () { return getBrantSpecialMechanicsForMember; }, function (v) { getBrantSpecialMechanicsForMember = v; }, true, true);
  __wcE('normalizeBrantLifeMode', function () { return normalizeBrantLifeMode; }, function (v) { normalizeBrantLifeMode = v; }, true, true);
  __wcE('resolveBrantLifeMode', function () { return resolveBrantLifeMode; }, function (v) { resolveBrantLifeMode = v; }, true, true);
  __wcE('getBrantLifeVariant', function () { return getBrantLifeVariant; }, function (v) { getBrantLifeVariant = v; }, true, true);
  __wcE('getBrantLifeModeLabel', function () { return getBrantLifeModeLabel; }, function (v) { getBrantLifeModeLabel = v; }, true, true);
  __wcE('computeBrantErFlatAtk', function () { return computeBrantErFlatAtk; }, function (v) { computeBrantErFlatAtk = v; }, true, true);
  __wcE('describeBrantErFlatAtk', function () { return describeBrantErFlatAtk; }, function (v) { describeBrantErFlatAtk = v; }, true, true);
  __wcE('syncBrantErFlatAtkPanelPreview', function () { return syncBrantErFlatAtkPanelPreview; }, function (v) { syncBrantErFlatAtkPanelPreview = v; }, true, true);
  __wcE('isJingranYinyangXiangsheng', function () { return isJingranYinyangXiangsheng; }, function (v) { isJingranYinyangXiangsheng = v; }, true, true);
  __wcE('getJingranHpFlatAtkParams', function () { return getJingranHpFlatAtkParams; }, function (v) { getJingranHpFlatAtkParams = v; }, true, true);
  __wcE('computeJingranHpFlatAtk', function () { return computeJingranHpFlatAtk; }, function (v) { computeJingranHpFlatAtk = v; }, true, true);
  __wcE('describeJingranHpFlatAtk', function () { return describeJingranHpFlatAtk; }, function (v) { describeJingranHpFlatAtk = v; }, true, true);
  __wcE('syncJingranHpFlatAtkPanel', function () { return syncJingranHpFlatAtkPanel; }, function (v) { syncJingranHpFlatAtkPanel = v; }, true, true);
  __wcE('getJingranMinghuoChunks', function () { return getJingranMinghuoChunks; }, function (v) { getJingranMinghuoChunks = v; }, true, true);
  __wcE('computeJingranMinghuoBonus', function () { return computeJingranMinghuoBonus; }, function (v) { computeJingranMinghuoBonus = v; }, true, true);
  __wcE('isJingranMinghuoBuff', function () { return isJingranMinghuoBuff; }, function (v) { isJingranMinghuoBuff = v; }, true, true);
  __wcE('createJingranMinghuoBuffEntry', function () { return createJingranMinghuoBuffEntry; }, function (v) { createJingranMinghuoBuffEntry = v; }, true, true);
  __wcE('upsertJingranMinghuoEffect', function () { return upsertJingranMinghuoEffect; }, function (v) { upsertJingranMinghuoEffect = v; }, true, true);
  __wcE('syncJingranMinghuoMult', function () { return syncJingranMinghuoMult; }, function (v) { syncJingranMinghuoMult = v; }, true, true);
  __wcE('computeJingranHuoxiFuxiPerStack', function () { return computeJingranHuoxiFuxiPerStack; }, function (v) { computeJingranHuoxiFuxiPerStack = v; }, true, true);
  __wcE('isJingranHuoxiFuxiBuff', function () { return isJingranHuoxiFuxiBuff; }, function (v) { isJingranHuoxiFuxiBuff = v; }, true, true);
  __wcE('createJingranHuoxiFuxiBuffEntry', function () { return createJingranHuoxiFuxiBuffEntry; }, function (v) { createJingranHuoxiFuxiBuffEntry = v; }, true, true);
  __wcE('syncJingranHuoxiFuxiBonus', function () { return syncJingranHuoxiFuxiBonus; }, function (v) { syncJingranHuoxiFuxiBonus = v; }, true, true);
  __wcE('computeJingranYoufuFumingBonus', function () { return computeJingranYoufuFumingBonus; }, function (v) { computeJingranYoufuFumingBonus = v; }, true, true);
  __wcE('isJingranYoufuFumingBuff', function () { return isJingranYoufuFumingBuff; }, function (v) { isJingranYoufuFumingBuff = v; }, true, true);
  __wcE('createJingranYoufuFumingBuffEntry', function () { return createJingranYoufuFumingBuffEntry; }, function (v) { createJingranYoufuFumingBuffEntry = v; }, true, true);
  __wcE('syncJingranYoufuFumingBonus', function () { return syncJingranYoufuFumingBonus; }, function (v) { syncJingranYoufuFumingBonus = v; }, true, true);
  __wcE('upsertEchoCharSource', function () { return upsertEchoCharSource; }, function (v) { upsertEchoCharSource = v; }, true, true);
  __wcE('syncEchoAttrBonusSources', function () { return syncEchoAttrBonusSources; }, function (v) { syncEchoAttrBonusSources = v; }, true, true);
  __wcE('syncEchoTypeDmgBonusSources', function () { return syncEchoTypeDmgBonusSources; }, function (v) { syncEchoTypeDmgBonusSources = v; }, true, true);
  __wcE('sanitizeOrphanManagedPanelSources', function () { return sanitizeOrphanManagedPanelSources; }, function (v) { sanitizeOrphanManagedPanelSources = v; }, true, true);
  __wcE('syncEchoToCharacterPanel', function () { return syncEchoToCharacterPanel; }, function (v) { syncEchoToCharacterPanel = v; }, true, true);
  __wcE('backfillAxisEchoEnergy', function () { return backfillAxisEchoEnergy; }, function (v) { backfillAxisEchoEnergy = v; }, true, true);
  __wcE('resolveEchoEnergyForMult', function () { return resolveEchoEnergyForMult; }, function (v) { resolveEchoEnergyForMult = v; }, true, true);
  __wcE('echoSetsDb', function () { return echoSetsDb; }, function (v) { echoSetsDb = v; }, false, true);
  __wcE('echoSetsDbPromise', function () { return echoSetsDbPromise; }, function (v) { echoSetsDbPromise = v; }, false, true);
  __wcE('echoSpecimensDb', function () { return echoSpecimensDb; }, function (v) { echoSpecimensDb = v; }, false, true);
  __wcE('echoSpecimensDbPromise', function () { return echoSpecimensDbPromise; }, function (v) { echoSpecimensDbPromise = v; }, false, true);
  __wcE('echoSetMainMapDb', function () { return echoSetMainMapDb; }, function (v) { echoSetMainMapDb = v; }, false, true);
  __wcE('echoSetMainMapPromise', function () { return echoSetMainMapPromise; }, function (v) { echoSetMainMapPromise = v; }, false, true);
  __wcE('echoSetDefIndex', function () { return echoSetDefIndex; }, function (v) { echoSetDefIndex = v; }, false, true);
  __wcE('echoSpecimenIndex', function () { return echoSpecimenIndex; }, function (v) { echoSpecimenIndex = v; }, false, true);
  __wcE('normalizeEchoSetMainMap', function () { return normalizeEchoSetMainMap; }, function (v) { normalizeEchoSetMainMap = v; }, true, true);
  __wcE('isEchoSetMainMapReady', function () { return isEchoSetMainMapReady; }, function (v) { isEchoSetMainMapReady = v; }, true, true);
  __wcE('rebuildSpecimenMainSetIdsFromMap', function () { return rebuildSpecimenMainSetIdsFromMap; }, function (v) { rebuildSpecimenMainSetIdsFromMap = v; }, true, true);
  __wcE('loadEchoSetMainMapFromCache', function () { return loadEchoSetMainMapFromCache; }, function (v) { loadEchoSetMainMapFromCache = v; }, true, true);
  __wcE('setEchoSetMainMapDb', function () { return setEchoSetMainMapDb; }, function (v) { setEchoSetMainMapDb = v; }, true, true);
  __wcE('ensureEchoSetMainMapDb', function () { return ensureEchoSetMainMapDb; }, function (v) { ensureEchoSetMainMapDb = v; }, true, true);
  __wcE('getEchoSetMainEchoIds', function () { return getEchoSetMainEchoIds; }, function (v) { getEchoSetMainEchoIds = v; }, true, true);
  __wcE('loadEchoSetsDbFromCache', function () { return loadEchoSetsDbFromCache; }, function (v) { loadEchoSetsDbFromCache = v; }, true, true);
  __wcE('loadEchoSpecimensDbFromCache', function () { return loadEchoSpecimensDbFromCache; }, function (v) { loadEchoSpecimensDbFromCache = v; }, true, true);
  __wcE('setEchoSetsDb', function () { return setEchoSetsDb; }, function (v) { setEchoSetsDb = v; }, true, true);
  __wcE('normalizeMainEffects', function () { return normalizeMainEffects; }, function (v) { normalizeMainEffects = v; }, true, true);
  __wcE('echoEffectIsHarmonyDrivenAttack', function () { return echoEffectIsHarmonyDrivenAttack; }, function (v) { echoEffectIsHarmonyDrivenAttack = v; }, true, true);
  __wcE('setEchoSpecimensDb', function () { return setEchoSpecimensDb; }, function (v) { setEchoSpecimensDb = v; }, true, true);
  __wcE('ensureEchoSetsDb', function () { return ensureEchoSetsDb; }, function (v) { ensureEchoSetsDb = v; }, true, true);
  __wcE('ensureEchoSpecimensDb', function () { return ensureEchoSpecimensDb; }, function (v) { ensureEchoSpecimensDb = v; }, true, true);
  __wcE('findEchoSetDef', function () { return findEchoSetDef; }, function (v) { findEchoSetDef = v; }, true, true);
  __wcE('findEchoSpecimen', function () { return findEchoSpecimen; }, function (v) { findEchoSpecimen = v; }, true, true);
  __wcD('ECHO_GAME_TEXT_LOCAL_KEY', ECHO_GAME_TEXT_LOCAL_KEY);
  __wcE('loadEchoGameTextLocal', function () { return loadEchoGameTextLocal; }, function (v) { loadEchoGameTextLocal = v; }, true, true);
  __wcE('saveEchoGameTextLocal', function () { return saveEchoGameTextLocal; }, function (v) { saveEchoGameTextLocal = v; }, true, true);
  __wcE('getEchoSetDefaultGameText', function () { return getEchoSetDefaultGameText; }, function (v) { getEchoSetDefaultGameText = v; }, true, true);
  __wcE('getEchoSpecimenDefaultGameText', function () { return getEchoSpecimenDefaultGameText; }, function (v) { getEchoSpecimenDefaultGameText = v; }, true, true);
  __wcE('getEchoSetGameText', function () { return getEchoSetGameText; }, function (v) { getEchoSetGameText = v; }, true, true);
  __wcE('getEchoSpecimenGameText', function () { return getEchoSpecimenGameText; }, function (v) { getEchoSpecimenGameText = v; }, true, true);
  __wcE('resolveEchoGameTextSource', function () { return resolveEchoGameTextSource; }, function (v) { resolveEchoGameTextSource = v; }, true, true);
  __wcE('getEchoGameTextForSource', function () { return getEchoGameTextForSource; }, function (v) { getEchoGameTextForSource = v; }, true, true);
  __wcE('syncEchoGameTextToRuntime', function () { return syncEchoGameTextToRuntime; }, function (v) { syncEchoGameTextToRuntime = v; }, true, true);
  __wcE('patchEchoBuffGameText', function () { return patchEchoBuffGameText; }, function (v) { patchEchoBuffGameText = v; }, true, true);
  __wcE('getEchoSetsSorted', function () { return getEchoSetsSorted; }, function (v) { getEchoSetsSorted = v; }, true, true);
  __wcE('isMainEchoValidForSet', function () { return isMainEchoValidForSet; }, function (v) { isMainEchoValidForSet = v; }, true, true);
  __wcE('refreshSetupBuildInPlace', function () { return refreshSetupBuildInPlace; }, function (v) { refreshSetupBuildInPlace = v; }, true, true);
  __wcE('refreshEchoUiPanels', function () { return refreshEchoUiPanels; }, function (v) { refreshEchoUiPanels = v; }, true, true);
  __wcE('refreshEchoUiAfterChange', function () { return refreshEchoUiAfterChange; }, function (v) { refreshEchoUiAfterChange = v; }, true, true);
  __wcE('getSpecimensForEchoSlot', function () { return getSpecimensForEchoSlot; }, function (v) { getSpecimensForEchoSlot = v; }, true, true);
  __wcE('countEchoSetPieces', function () { return countEchoSetPieces; }, function (v) { countEchoSetPieces = v; }, true, true);
  __wcE('getEchoSetLoadoutTotal', function () { return getEchoSetLoadoutTotal; }, function (v) { getEchoSetLoadoutTotal = v; }, true, true);
  __wcE('getEchoSetIconUrl', function () { return getEchoSetIconUrl; }, function (v) { getEchoSetIconUrl = v; }, true, true);
  __wcE('getSpecimensForSetEntry', function () { return getSpecimensForSetEntry; }, function (v) { getSpecimensForSetEntry = v; }, true, true);
  __wcE('renderEchoSetIconHtml', function () { return renderEchoSetIconHtml; }, function (v) { renderEchoSetIconHtml = v; }, true, true);
  __wcE('upsertEchoSetPanelSource', function () { return upsertEchoSetPanelSource; }, function (v) { upsertEchoSetPanelSource = v; }, true, true);
  __wcE('clearEchoSetPanelSources', function () { return clearEchoSetPanelSources; }, function (v) { clearEchoSetPanelSources = v; }, true, true);
  __wcE('isEchoSetGeneratedSkill', function () { return isEchoSetGeneratedSkill; }, function (v) { isEchoSetGeneratedSkill = v; }, true, true);
  __wcE('removeEchoSetGeneratedSkills', function () { return removeEchoSetGeneratedSkills; }, function (v) { removeEchoSetGeneratedSkills = v; }, true, true);
  __wcE('removeEchoSetGeneratedBuffs', function () { return removeEchoSetGeneratedBuffs; }, function (v) { removeEchoSetGeneratedBuffs = v; }, true, true);
  __wcE('applyParsedSetEffect', function () { return applyParsedSetEffect; }, function (v) { applyParsedSetEffect = v; }, true, true);
  __wcE('buildEchoSetTeamBuffKey', function () { return buildEchoSetTeamBuffKey; }, function (v) { buildEchoSetTeamBuffKey = v; }, true, true);
  __wcE('isNiguangCombinedAtkEffect', function () { return isNiguangCombinedAtkEffect; }, function (v) { isNiguangCombinedAtkEffect = v; }, true, true);
  __wcE('buildEchoSetTeamBuffPayload', function () { return buildEchoSetTeamBuffPayload; }, function (v) { buildEchoSetTeamBuffPayload = v; }, true, true);
  __wcE('isEchoSetHarmonyAmpAtkBuff', function () { return isEchoSetHarmonyAmpAtkBuff; }, function (v) { isEchoSetHarmonyAmpAtkBuff = v; }, true, true);
  __wcE('syncEchoSetHarmonyAmpAtkStacks', function () { return syncEchoSetHarmonyAmpAtkStacks; }, function (v) { syncEchoSetHarmonyAmpAtkStacks = v; }, true, true);
  __wcE('syncEchoSetTeamBuffs', function () { return syncEchoSetTeamBuffs; }, function (v) { syncEchoSetTeamBuffs = v; }, true, true);
  __wcE('isEchoMainGeneratedBuff', function () { return isEchoMainGeneratedBuff; }, function (v) { isEchoMainGeneratedBuff = v; }, true, true);
  __wcE('removeEchoMainGeneratedBuffs', function () { return removeEchoMainGeneratedBuffs; }, function (v) { removeEchoMainGeneratedBuffs = v; }, true, true);
  __wcE('buildEchoMainSlotLabel', function () { return buildEchoMainSlotLabel; }, function (v) { buildEchoMainSlotLabel = v; }, true, true);
  __wcE('buildEchoMainTeamBuffKey', function () { return buildEchoMainTeamBuffKey; }, function (v) { buildEchoMainTeamBuffKey = v; }, true, true);
  __wcE('resolveEchoSkillScaleStat', function () { return resolveEchoSkillScaleStat; }, function (v) { resolveEchoSkillScaleStat = v; }, true, true);
  __wcE('resolveMainEchoSkillPaletteId', function () { return resolveMainEchoSkillPaletteId; }, function (v) { resolveMainEchoSkillPaletteId = v; }, true, true);
  __wcE('isEchoMainGeneratedSkill', function () { return isEchoMainGeneratedSkill; }, function (v) { isEchoMainGeneratedSkill = v; }, true, true);
  __wcE('removeEchoMainGeneratedSkills', function () { return removeEchoMainGeneratedSkills; }, function (v) { removeEchoMainGeneratedSkills = v; }, true, true);
  __wcE('syncEchoPaletteSkillToAxis', function () { return syncEchoPaletteSkillToAxis; }, function (v) { syncEchoPaletteSkillToAxis = v; }, true, true);
  __wcE('mainEchoEffectAllowedForMember', function () { return mainEchoEffectAllowedForMember; }, function (v) { mainEchoEffectAllowedForMember = v; }, true, true);
  __wcE('applyMainEchoEffect', function () { return applyMainEchoEffect; }, function (v) { applyMainEchoEffect = v; }, true, true);
  __wcE('syncEchoMainTeamBuffs', function () { return syncEchoMainTeamBuffs; }, function (v) { syncEchoMainTeamBuffs = v; }, true, true);
  __wcE('ensureEchoRuntimeDbsFromCache', function () { return ensureEchoRuntimeDbsFromCache; }, function (v) { ensureEchoRuntimeDbsFromCache = v; }, true, true);
  __wcE('syncEchoSetToMember', function () { return syncEchoSetToMember; }, function (v) { syncEchoSetToMember = v; }, true, true);
  __wcE('syncEchoLoadout', function () { return syncEchoLoadout; }, function (v) { syncEchoLoadout = v; }, true, true);
  __wcE('describeEchoEffectRouting', function () { return describeEchoEffectRouting; }, function (v) { describeEchoEffectRouting = v; }, true, true);
  __wcE('getActiveEchoSetTierDetails', function () { return getActiveEchoSetTierDetails; }, function (v) { getActiveEchoSetTierDetails = v; }, true, true);
  __wcE('getActiveEchoMainEffectSummary', function () { return getActiveEchoMainEffectSummary; }, function (v) { getActiveEchoMainEffectSummary = v; }, true, true);
  __wcE('renderEchoActiveEffectLines', function () { return renderEchoActiveEffectLines; }, function (v) { renderEchoActiveEffectLines = v; }, true, true);
  __wcE('getActiveEchoSetSummary', function () { return getActiveEchoSetSummary; }, function (v) { getActiveEchoSetSummary = v; }, true, true);
  __wcE('ensureEchoActiveSlot', function () { return ensureEchoActiveSlot; }, function (v) { ensureEchoActiveSlot = v; }, true, true);
  __wcE('applyEchoLayout', function () { return applyEchoLayout; }, function (v) { applyEchoLayout = v; }, true, true);
  __wcE('renderEchoSubAffixOptions', function () { return renderEchoSubAffixOptions; }, function (v) { renderEchoSubAffixOptions = v; }, true, true);
  __wcE('renderEchoSubValueOptions', function () { return renderEchoSubValueOptions; }, function (v) { renderEchoSubValueOptions = v; }, true, true);
  __wcE('renderEchoSubDamageTypeOptions', function () { return renderEchoSubDamageTypeOptions; }, function (v) { renderEchoSubDamageTypeOptions = v; }, true, true);
  __wcE('renderEchoSubTemplateOptions', function () { return renderEchoSubTemplateOptions; }, function (v) { renderEchoSubTemplateOptions = v; }, true, true);
  __wcE('renderEchoSubTemplateButtons', function () { return renderEchoSubTemplateButtons; }, function (v) { renderEchoSubTemplateButtons = v; }, true, true);
  __wcE('applyEchoSubTemplateMain1', function () { return applyEchoSubTemplateMain1; }, function (v) { applyEchoSubTemplateMain1 = v; }, true, true);
  __wcE('applyEchoSubTemplateMainByCost', function () { return applyEchoSubTemplateMainByCost; }, function (v) { applyEchoSubTemplateMainByCost = v; }, true, true);
  __wcE('applyEchoSubTemplateMainBySlotIndex', function () { return applyEchoSubTemplateMainBySlotIndex; }, function (v) { applyEchoSubTemplateMainBySlotIndex = v; }, true, true);
  __wcE('applyEchoSubTemplate', function () { return applyEchoSubTemplate; }, function (v) { applyEchoSubTemplate = v; }, true, true);
  __wcE('renderEchoMain1Options', function () { return renderEchoMain1Options; }, function (v) { renderEchoMain1Options = v; }, true, true);
  __wcE('renderEchoElementOptions', function () { return renderEchoElementOptions; }, function (v) { renderEchoElementOptions = v; }, true, true);
  __wcE('formatEchoSummaryLine', function () { return formatEchoSummaryLine; }, function (v) { formatEchoSummaryLine = v; }, true, true);
  __wcE('formatEchoMainValue', function () { return formatEchoMainValue; }, function (v) { formatEchoMainValue = v; }, true, true);
  __wcE('renderEchoSlotCard', function () { return renderEchoSlotCard; }, function (v) { renderEchoSlotCard = v; }, true, true);
  __wcE('renderEchoSlotTabs', function () { return renderEchoSlotTabs; }, function (v) { renderEchoSlotTabs = v; }, true, true);
  __wcE('renderEchoSetEntrySpecimenOptions', function () { return renderEchoSetEntrySpecimenOptions; }, function (v) { renderEchoSetEntrySpecimenOptions = v; }, true, true);
  __wcE('renderEchoSetTierHints', function () { return renderEchoSetTierHints; }, function (v) { renderEchoSetTierHints = v; }, true, true);
  __wcE('renderEchoSetLoadoutEntry', function () { return renderEchoSetLoadoutEntry; }, function (v) { renderEchoSetLoadoutEntry = v; }, true, true);
  __wcE('renderEchoSetLoadoutPanel', function () { return renderEchoSetLoadoutPanel; }, function (v) { renderEchoSetLoadoutPanel = v; }, true, true);
  __wcE('applyBuildMainEcho', function () { return applyBuildMainEcho; }, function (v) { applyBuildMainEcho = v; }, true, true);
  __wcE('getBuildLayoutKey', function () { return getBuildLayoutKey; }, function (v) { getBuildLayoutKey = v; }, true, true);
  __wcE('getBuildSlotColumnIndices', function () { return getBuildSlotColumnIndices; }, function (v) { getBuildSlotColumnIndices = v; }, true, true);
  __wcE('renderBuildSlotCard', function () { return renderBuildSlotCard; }, function (v) { renderBuildSlotCard = v; }, true, true);
  __wcE('renderBuildSetRows', function () { return renderBuildSetRows; }, function (v) { renderBuildSetRows = v; }, true, true);
  __wcE('renderBuildMainEchoPicker', function () { return renderBuildMainEchoPicker; }, function (v) { renderBuildMainEchoPicker = v; }, true, true);
  __wcE('getEchoSetCardSummary', function () { return getEchoSetCardSummary; }, function (v) { getEchoSetCardSummary = v; }, true, true);
  __wcE('renderBuildSetPicker', function () { return renderBuildSetPicker; }, function (v) { renderBuildSetPicker = v; }, true, true);
  __wcE('renderBuildModal', function () { return renderBuildModal; }, function (v) { renderBuildModal = v; }, true, true);
  __wcE('renderBuffCategorySelectOptions', function () { return renderBuffCategorySelectOptions; }, function (v) { renderBuffCategorySelectOptions = v; }, true, true);
  __wcE('formatTplBuffSummary', function () { return formatTplBuffSummary; }, function (v) { formatTplBuffSummary = v; }, true, true);
  __wcE('renderCharBuffTplBuffList', function () { return renderCharBuffTplBuffList; }, function (v) { renderCharBuffTplBuffList = v; }, true, true);
  __wcE('renderTplCompositeEffectCard', function () { return renderTplCompositeEffectCard; }, function (v) { renderTplCompositeEffectCard = v; }, true, true);
  __wcE('renderCharBuffTplForm', function () { return renderCharBuffTplForm; }, function (v) { renderCharBuffTplForm = v; }, true, true);
  __wcE('formToTemplateBuffEntry', function () { return formToTemplateBuffEntry; }, function (v) { formToTemplateBuffEntry = v; }, true, true);
  __wcE('buffEntryToForm', function () { return buffEntryToForm; }, function (v) { buffEntryToForm = v; }, true, true);
  __wcE('renderCharBuffTemplateEditor', function () { return renderCharBuffTemplateEditor; }, function (v) { renderCharBuffTemplateEditor = v; }, true, true);
  __wcE('getTemplatePageTabLabel', function () { return getTemplatePageTabLabel; }, function (v) { getTemplatePageTabLabel = v; }, true, true);
  __wcE('buildTemplateCharacterPalette', function () { return buildTemplateCharacterPalette; }, function (v) { buildTemplateCharacterPalette = v; }, true, true);
  __wcE('renderCompositePaletteChip', function () { return renderCompositePaletteChip; }, function (v) { renderCompositePaletteChip = v; }, true, true);
  __wcE('renderTemplateAxisSkillLibrary', function () { return renderTemplateAxisSkillLibrary; }, function (v) { renderTemplateAxisSkillLibrary = v; }, true, true);
  __wcE('renderTemplatePageSidebar', function () { return renderTemplatePageSidebar; }, function (v) { renderTemplatePageSidebar = v; }, true, true);
  __wcE('renderTemplateExtraSkillsEditor', function () { return renderTemplateExtraSkillsEditor; }, function (v) { renderTemplateExtraSkillsEditor = v; }, true, true);
  __wcE('renderAugustaSpecialMechanicsEditor', function () { return renderAugustaSpecialMechanicsEditor; }, function (v) { renderAugustaSpecialMechanicsEditor = v; }, true, true);
  __wcE('renderBrantSpecialMechanicsEditor', function () { return renderBrantSpecialMechanicsEditor; }, function (v) { renderBrantSpecialMechanicsEditor = v; }, true, true);
  __wcE('renderTemplatePageMain', function () { return renderTemplatePageMain; }, function (v) { renderTemplatePageMain = v; }, true, true);
  __wcE('formatResonanceRelative', function () { return formatResonanceRelative; }, function (v) { formatResonanceRelative = v; }, true, true);
  __wcE('formatWeaponRefRelative', function () { return formatWeaponRefRelative; }, function (v) { formatWeaponRefRelative = v; }, true, true);
  __wcE('cloneAxisCatalogItem', function () { return cloneAxisCatalogItem; }, function (v) { cloneAxisCatalogItem = v; }, true, true);
  __wcE('cloneAxisCatalog', function () { return cloneAxisCatalog; }, function (v) { cloneAxisCatalog = v; }, true, true);
  __wcE('cloneAxisPhases', function () { return cloneAxisPhases; }, function (v) { cloneAxisPhases = v; }, true, true);
  __wcE('catalogAxisKey', function () { return catalogAxisKey; }, function (v) { catalogAxisKey = v; }, true, true);
  __wcE('phaseAxisKey', function () { return phaseAxisKey; }, function (v) { phaseAxisKey = v; }, true, true);
  __wcE('phaseSkillAxisKey', function () { return phaseSkillAxisKey; }, function (v) { phaseSkillAxisKey = v; }, true, true);
  __wcE('catalogAxisFields', function () { return catalogAxisFields; }, function (v) { catalogAxisFields = v; }, true, true);
  __wcE('phaseSkillAxisFields', function () { return phaseSkillAxisFields; }, function (v) { phaseSkillAxisFields = v; }, true, true);
  __wcE('axisFieldsEqual', function () { return axisFieldsEqual; }, function (v) { axisFieldsEqual = v; }, true, true);
  __wcE('createEmptyResonanceAxis', function () { return createEmptyResonanceAxis; }, function (v) { createEmptyResonanceAxis = v; }, true, true);
  __wcE('normalizeResonanceAxis', function () { return normalizeResonanceAxis; }, function (v) { normalizeResonanceAxis = v; }, true, true);
  __wcE('cloneResonanceAxis', function () { return cloneResonanceAxis; }, function (v) { cloneResonanceAxis = v; }, true, true);
  __wcE('getResonanceAxisHolder', function () { return getResonanceAxisHolder; }, function (v) { getResonanceAxisHolder = v; }, true, true);
  __wcE('getResonanceAxisState', function () { return getResonanceAxisState; }, function (v) { getResonanceAxisState = v; }, true, true);
  __wcE('pickNonEmptyAxisList', function () { return pickNonEmptyAxisList; }, function (v) { pickNonEmptyAxisList = v; }, true, true);
  __wcE('ensureResonanceAxis', function () { return ensureResonanceAxis; }, function (v) { ensureResonanceAxis = v; }, true, true);
  __wcE('diffAxisCatalog', function () { return diffAxisCatalog; }, function (v) { diffAxisCatalog = v; }, true, true);
  __wcE('diffAxisPhases', function () { return diffAxisPhases; }, function (v) { diffAxisPhases = v; }, true, true);
  __wcE('diffAxis', function () { return diffAxis; }, function (v) { diffAxis = v; }, true, true);
  __wcE('findPhaseByAxisKey', function () { return findPhaseByAxisKey; }, function (v) { findPhaseByAxisKey = v; }, true, true);
  __wcE('applyAxisOps', function () { return applyAxisOps; }, function (v) { applyAxisOps = v; }, true, true);
  __wcE('buildResonanceAxisView', function () { return buildResonanceAxisView; }, function (v) { buildResonanceAxisView = v; }, true, true);
  __wcE('materializeResonanceAxis', function () { return materializeResonanceAxis; }, function (v) { materializeResonanceAxis = v; }, true, true);
  __wcE('commitResonanceAxisEdit', function () { return commitResonanceAxisEdit; }, function (v) { commitResonanceAxisEdit = v; }, true, true);
  __wcE('setResonanceAxisEditTarget', function () { return setResonanceAxisEditTarget; }, function (v) { setResonanceAxisEditTarget = v; }, true, true);
  __wcE('getResonanceUnlockedFromAxisPatches', function () { return getResonanceUnlockedFromAxisPatches; }, function (v) { getResonanceUnlockedFromAxisPatches = v; }, true, true);
  __wcE('syncResonanceAxisPatchesFromUnlocked', function () { return syncResonanceAxisPatchesFromUnlocked; }, function (v) { syncResonanceAxisPatchesFromUnlocked = v; }, true, true);
  __wcE('syncResonanceUnlockedFromAxisPatches', function () { return syncResonanceUnlockedFromAxisPatches; }, function (v) { syncResonanceUnlockedFromAxisPatches = v; }, true, true);
  __wcE('setResonanceAxisPatchEnabled', function () { return setResonanceAxisPatchEnabled; }, function (v) { setResonanceAxisPatchEnabled = v; }, true, true);
  __wcE('saveResonanceChainDamageSnapshot', function () { return saveResonanceChainDamageSnapshot; }, function (v) { saveResonanceChainDamageSnapshot = v; }, true, true);
  __wcE('resonanceAxisPatchHasOps', function () { return resonanceAxisPatchHasOps; }, function (v) { resonanceAxisPatchHasOps = v; }, true, true);
  __wcE('withResonanceAxisDamageView', function () { return withResonanceAxisDamageView; }, function (v) { withResonanceAxisDamageView = v; }, true, true);
  __wcE('renderResonanceAxisPatchBoard', function () { return renderResonanceAxisPatchBoard; }, function (v) { renderResonanceAxisPatchBoard = v; }, true, true);
  __wcE('renderResonanceChainBoard', function () { return renderResonanceChainBoard; }, function (v) { renderResonanceChainBoard = v; }, true, true);
  __wcE('renderWeaponRefDmgBoard', function () { return renderWeaponRefDmgBoard; }, function (v) { renderWeaponRefDmgBoard = v; }, true, true);
  __wcE('getCharCombatModeConfig', function () { return getCharCombatModeConfig; }, function (v) { getCharCombatModeConfig = v; }, true, true);
  __wcE('getCombatModeLabel', function () { return getCombatModeLabel; }, function (v) { getCombatModeLabel = v; }, true, true);
  __wcE('isConvergenceLikeCombatMode', function () { return isConvergenceLikeCombatMode; }, function (v) { isConvergenceLikeCombatMode = v; }, true, true);
  __wcE('normalizeCombatModeId', function () { return normalizeCombatModeId; }, function (v) { normalizeCombatModeId = v; }, true, true);
  __wcE('syncMemberCombatModeState', function () { return syncMemberCombatModeState; }, function (v) { syncMemberCombatModeState = v; }, true, true);
  __wcE('setMemberCombatMode', function () { return setMemberCombatMode; }, function (v) { setMemberCombatMode = v; }, true, true);
  __wcE('renderCombatModeControls', function () { return renderCombatModeControls; }, function (v) { renderCombatModeControls = v; }, true, true);
  __wcE('supportsPhoebeHybridCombatMode', function () { return supportsPhoebeHybridCombatMode; }, function (v) { supportsPhoebeHybridCombatMode = v; }, true, true);
  __wcE('normalizePhoebeOverrideCombatMode', function () { return normalizePhoebeOverrideCombatMode; }, function (v) { normalizePhoebeOverrideCombatMode = v; }, true, true);
  __wcE('findPhaseForTimelineUnit', function () { return findPhaseForTimelineUnit; }, function (v) { findPhaseForTimelineUnit = v; }, true, true);
  __wcE('resolvePhoebeCombatMode', function () { return resolvePhoebeCombatMode; }, function (v) { resolvePhoebeCombatMode = v; }, true, true);
  __wcE('getPhoebeDefaultCombatModeLabel', function () { return getPhoebeDefaultCombatModeLabel; }, function (v) { getPhoebeDefaultCombatModeLabel = v; }, true, true);
  __wcE('renderPhasePhoebeCombatModeSelect', function () { return renderPhasePhoebeCombatModeSelect; }, function (v) { renderPhasePhoebeCombatModeSelect = v; }, true, true);
  __wcE('renderSkillPhoebeCombatModeSelect', function () { return renderSkillPhoebeCombatModeSelect; }, function (v) { renderSkillPhoebeCombatModeSelect = v; }, true, true);
  __wcE('buffMatchesResolvedCombatMode', function () { return buffMatchesResolvedCombatMode; }, function (v) { buffMatchesResolvedCombatMode = v; }, true, true);
  __wcE('renderSetupSecTitle', function () { return renderSetupSecTitle; }, function (v) { renderSetupSecTitle = v; }, true, true);
  __wcE('renderBuildHeroChar', function () { return renderBuildHeroChar; }, function (v) { renderBuildHeroChar = v; }, true, true);
  __wcE('renderBrantLifeModeControls', function () { return renderBrantLifeModeControls; }, function (v) { renderBrantLifeModeControls = v; }, true, true);
  __wcE('renderSkillBrantLifeSelect', function () { return renderSkillBrantLifeSelect; }, function (v) { renderSkillBrantLifeSelect = v; }, true, true);
  __wcE('renderBuildHeroWeapon', function () { return renderBuildHeroWeapon; }, function (v) { renderBuildHeroWeapon = v; }, true, true);
  __wcE('renderBuildHeroMid', function () { return renderBuildHeroMid; }, function (v) { renderBuildHeroMid = v; }, true, true);
  __wcE('renderBuildEchoSection', function () { return renderBuildEchoSection; }, function (v) { renderBuildEchoSection = v; }, true, true);
  __wcE('renderBuildPanel', function () { return renderBuildPanel; }, function (v) { renderBuildPanel = v; }, true, true);
  __wcE('renderEchoSetOptions', function () { return renderEchoSetOptions; }, function (v) { renderEchoSetOptions = v; }, true, true);
  __wcE('renderEchoSpecimenOptions', function () { return renderEchoSpecimenOptions; }, function (v) { renderEchoSpecimenOptions = v; }, true, true);
  __wcE('renderEchoSlotSetPanel', function () { return renderEchoSlotSetPanel; }, function (v) { renderEchoSlotSetPanel = v; }, true, true);
  __wcE('renderEchoActiveSetsSummary', function () { return renderEchoActiveSetsSummary; }, function (v) { renderEchoActiveSetsSummary = v; }, true, true);
  __wcE('renderEchoActiveSlotHtml', function () { return renderEchoActiveSlotHtml; }, function (v) { renderEchoActiveSlotHtml = v; }, true, true);
  __wcE('captureEchoPanelScrollState', function () { return captureEchoPanelScrollState; }, function (v) { captureEchoPanelScrollState = v; }, true, true);
  __wcE('restoreEchoPanelScrollState', function () { return restoreEchoPanelScrollState; }, function (v) { restoreEchoPanelScrollState = v; }, true, true);
  __wcE('refreshEchoPanelInPlace', function () { return refreshEchoPanelInPlace; }, function (v) { refreshEchoPanelInPlace = v; }, true, true);
  __wcE('renderEchoPanel', function () { return renderEchoPanel; }, function (v) { renderEchoPanel = v; }, true, true);
  __wcE('refreshEchoSummaryPanel', function () { return refreshEchoSummaryPanel; }, function (v) { refreshEchoSummaryPanel = v; }, true, true);
  __wcE('refreshBuildPanelSummary', function () { return refreshBuildPanelSummary; }, function (v) { refreshBuildPanelSummary = v; }, true, true);
  __wcE('refreshEchoPanelCharDisplays', function () { return refreshEchoPanelCharDisplays; }, function (v) { refreshEchoPanelCharDisplays = v; }, true, true);
  __wcE('syncEchoStatsQuiet', function () { return syncEchoStatsQuiet; }, function (v) { syncEchoStatsQuiet = v; }, true, true);
  __wcE('handleEchoFieldChange', function () { return handleEchoFieldChange; }, function (v) { handleEchoFieldChange = v; }, true, true);
  __wcE('applyEchoSetLoadoutSet', function () { return applyEchoSetLoadoutSet; }, function (v) { applyEchoSetLoadoutSet = v; }, true, true);
  __wcE('applyEchoSetLoadoutCount', function () { return applyEchoSetLoadoutCount; }, function (v) { applyEchoSetLoadoutCount = v; }, true, true);
  __wcE('applyEchoSetLoadoutEcho', function () { return applyEchoSetLoadoutEcho; }, function (v) { applyEchoSetLoadoutEcho = v; }, true, true);
  __wcE('toggleEchoSetEntryExpand', function () { return toggleEchoSetEntryExpand; }, function (v) { toggleEchoSetEntryExpand = v; }, true, true);
  __wcE('applyEchoActiveSet', function () { return applyEchoActiveSet; }, function (v) { applyEchoActiveSet = v; }, true, true);
  __wcE('applyEchoSpecimen', function () { return applyEchoSpecimen; }, function (v) { applyEchoSpecimen = v; }, true, true);
  __wcE('applyEchoMainSlot', function () { return applyEchoMainSlot; }, function (v) { applyEchoMainSlot = v; }, true, true);
  __wcE('charSkillDb', function () { return charSkillDb; }, function (v) { charSkillDb = v; }, false, true);
  __wcE('charSkillDbPromise', function () { return charSkillDbPromise; }, function (v) { charSkillDbPromise = v; }, false, true);
  __wcE('charSkillDbError', function () { return charSkillDbError; }, function (v) { charSkillDbError = v; }, false, true);
  __wcE('charSkillDbSource', function () { return charSkillDbSource; }, function (v) { charSkillDbSource = v; }, false, true);
  __wcE('charSkillDbReloading', function () { return charSkillDbReloading; }, function (v) { charSkillDbReloading = v; }, false, true);
  __wcE('loadCharSkillDbFromCache', function () { return loadCharSkillDbFromCache; }, function (v) { loadCharSkillDbFromCache = v; }, true, true);
  __wcE('saveCharSkillDbToCache', function () { return saveCharSkillDbToCache; }, function (v) { saveCharSkillDbToCache = v; }, true, true);
  __wcE('setCharSkillDb', function () { return setCharSkillDb; }, function (v) { setCharSkillDb = v; }, true, true);
  __wcE('loadCharSkillDbFromFile', function () { return loadCharSkillDbFromFile; }, function (v) { loadCharSkillDbFromFile = v; }, true, true);
  __wcE('triggerCharSkillDbFilePick', function () { return triggerCharSkillDbFilePick; }, function (v) { triggerCharSkillDbFilePick = v; }, true, true);
  __wcE('ensureCharSkillDb', function () { return ensureCharSkillDb; }, function (v) { ensureCharSkillDb = v; }, true, true);
  __wcE('charBuffTemplateDb', function () { return charBuffTemplateDb; }, function (v) { charBuffTemplateDb = v; }, false, true);
  __wcE('charBuffTemplateDbPromise', function () { return charBuffTemplateDbPromise; }, function (v) { charBuffTemplateDbPromise = v; }, false, true);
  __wcE('charBuffTemplateLocal', function () { return charBuffTemplateLocal; }, function (v) { charBuffTemplateLocal = v; }, false, true);
  __wcE('charBuffTemplateLocalRev', function () { return charBuffTemplateLocalRev; }, function (v) { charBuffTemplateLocalRev = v; }, false, true);
  __wcE('mergedTemplateMapCache', function () { return mergedTemplateMapCache; }, function (v) { mergedTemplateMapCache = v; }, false, true);
  __wcE('mergedTemplateMapRev', function () { return mergedTemplateMapRev; }, function (v) { mergedTemplateMapRev = v; }, false, true);
  __wcE('mergedTemplateDbRef', function () { return mergedTemplateDbRef; }, function (v) { mergedTemplateDbRef = v; }, false, true);
  __wcE('templateBuffKeyIndexByChar', function () { return templateBuffKeyIndexByChar; }, function (v) { templateBuffKeyIndexByChar = v; }, false, true);
  __wcE('templateBuffNameIndexByChar', function () { return templateBuffNameIndexByChar; }, function (v) { templateBuffNameIndexByChar = v; }, false, true);
  __wcE('bundledTemplateByChar', function () { return bundledTemplateByChar; }, function (v) { bundledTemplateByChar = v; }, false, true);
  __wcE('bundledEntryByChar', function () { return bundledEntryByChar; }, function (v) { bundledEntryByChar = v; }, false, true);
  __wcE('normalizedTemplateCache', function () { return normalizedTemplateCache; }, function (v) { normalizedTemplateCache = v; }, false, true);
  __wcE('mergedTemplateRefByChar', function () { return mergedTemplateRefByChar; }, function (v) { mergedTemplateRefByChar = v; }, false, true);
  __wcE('invalidateMergedTemplateMap', function () { return invalidateMergedTemplateMap; }, function (v) { invalidateMergedTemplateMap = v; }, true, true);
  __wcE('emptyResonanceChains', function () { return emptyResonanceChains; }, function (v) { emptyResonanceChains = v; }, true, true);
  __wcE('emptyCombatModeBlock', function () { return emptyCombatModeBlock; }, function (v) { emptyCombatModeBlock = v; }, true, true);
  __wcE('normalizeCombatModeBlock', function () { return normalizeCombatModeBlock; }, function (v) { normalizeCombatModeBlock = v; }, true, true);
  __wcE('normalizeTemplateCombatModes', function () { return normalizeTemplateCombatModes; }, function (v) { normalizeTemplateCombatModes = v; }, true, true);
  __wcE('ensureTemplateCombatModes', function () { return ensureTemplateCombatModes; }, function (v) { ensureTemplateCombatModes = v; }, true, true);
  __wcE('syncTplUiCombatMode', function () { return syncTplUiCombatMode; }, function (v) { syncTplUiCombatMode = v; }, true, true);
  __wcE('getTemplateCombatModeBlock', function () { return getTemplateCombatModeBlock; }, function (v) { getTemplateCombatModeBlock = v; }, true, true);
  __wcE('getChainCombatModeBlock', function () { return getChainCombatModeBlock; }, function (v) { getChainCombatModeBlock = v; }, true, true);
  __wcE('resolveTplEditBuffList', function () { return resolveTplEditBuffList; }, function (v) { resolveTplEditBuffList = v; }, true, true);
  __wcE('resolveTplEditExtraSkillList', function () { return resolveTplEditExtraSkillList; }, function (v) { resolveTplEditExtraSkillList = v; }, true, true);
  __wcE('defaultAugustaSpecialMechanics', function () { return defaultAugustaSpecialMechanics; }, function (v) { defaultAugustaSpecialMechanics = v; }, true, true);
  __wcE('normalizeAugustaConvertRule', function () { return normalizeAugustaConvertRule; }, function (v) { normalizeAugustaConvertRule = v; }, true, true);
  __wcE('normalizeAugustaSpecialMechanics', function () { return normalizeAugustaSpecialMechanics; }, function (v) { normalizeAugustaSpecialMechanics = v; }, true, true);
  __wcE('defaultBrantSpecialMechanics', function () { return defaultBrantSpecialMechanics; }, function (v) { defaultBrantSpecialMechanics = v; }, true, true);
  __wcE('normalizeBrantLifeVariant', function () { return normalizeBrantLifeVariant; }, function (v) { normalizeBrantLifeVariant = v; }, true, true);
  __wcE('normalizeBrantSpecialMechanics', function () { return normalizeBrantSpecialMechanics; }, function (v) { normalizeBrantSpecialMechanics = v; }, true, true);
  __wcE('createBrantOutroBuffEntry', function () { return createBrantOutroBuffEntry; }, function (v) { createBrantOutroBuffEntry = v; }, true, true);
  __wcE('ensureBrantTemplateShape', function () { return ensureBrantTemplateShape; }, function (v) { ensureBrantTemplateShape = v; }, true, true);
  __wcE('ensureJingranTemplateShape', function () { return ensureJingranTemplateShape; }, function (v) { ensureJingranTemplateShape = v; }, true, true);
  __wcE('createLupaRongguangBuffEntry', function () { return createLupaRongguangBuffEntry; }, function (v) { createLupaRongguangBuffEntry = v; }, true, true);
  __wcE('createLupaZhuilieBuffEntry', function () { return createLupaZhuilieBuffEntry; }, function (v) { createLupaZhuilieBuffEntry = v; }, true, true);
  __wcE('createLupaOutroBuffEntry', function () { return createLupaOutroBuffEntry; }, function (v) { createLupaOutroBuffEntry = v; }, true, true);
  __wcE('ensureLupaTemplateShape', function () { return ensureLupaTemplateShape; }, function (v) { ensureLupaTemplateShape = v; }, true, true);
  __wcE('isLupaC6DefBuff', function () { return isLupaC6DefBuff; }, function (v) { isLupaC6DefBuff = v; }, true, true);
  __wcE('renameLupaC6DefBuff', function () { return renameLupaC6DefBuff; }, function (v) { renameLupaC6DefBuff = v; }, true, true);
  __wcE('syncLupaC6DefBuffNames', function () { return syncLupaC6DefBuffNames; }, function (v) { syncLupaC6DefBuffNames = v; }, true, true);
  __wcE('countTeamFusionCharacters', function () { return countTeamFusionCharacters; }, function (v) { countTeamFusionCharacters = v; }, true, true);
  __wcE('isTeamFusionStackSyncBuff', function () { return isTeamFusionStackSyncBuff; }, function (v) { isTeamFusionStackSyncBuff = v; }, true, true);
  __wcE('isLupaStackDefaultInitBuff', function () { return isLupaStackDefaultInitBuff; }, function (v) { isLupaStackDefaultInitBuff = v; }, true, true);
  __wcE('isLupaZhuilieBuff', function () { return isLupaZhuilieBuff; }, function (v) { isLupaZhuilieBuff = v; }, true, true);
  __wcE('isLupaC3FullStackUnlocked', function () { return isLupaC3FullStackUnlocked; }, function (v) { isLupaC3FullStackUnlocked = v; }, true, true);
  __wcE('purgeLupaLegacyTeamBuffFragments', function () { return purgeLupaLegacyTeamBuffFragments; }, function (v) { purgeLupaLegacyTeamBuffFragments = v; }, true, true);
  __wcE('dedupeLupaTeamBuffKeys', function () { return dedupeLupaTeamBuffKeys; }, function (v) { dedupeLupaTeamBuffKeys = v; }, true, true);
  __wcE('isLupaTeamBuffSource', function () { return isLupaTeamBuffSource; }, function (v) { isLupaTeamBuffSource = v; }, true, true);
  __wcE('lupaRongguangEffectsLookCorrect', function () { return lupaRongguangEffectsLookCorrect; }, function (v) { lupaRongguangEffectsLookCorrect = v; }, true, true);
  __wcE('consolidateLupaNamedTeamBuffs', function () { return consolidateLupaNamedTeamBuffs; }, function (v) { consolidateLupaNamedTeamBuffs = v; }, true, true);
  __wcE('syncTeamFusionLinkedBuffs', function () { return syncTeamFusionLinkedBuffs; }, function (v) { syncTeamFusionLinkedBuffs = v; }, true, true);
  __wcE('isFeixueXuexiuStackSyncBuff', function () { return isFeixueXuexiuStackSyncBuff; }, function (v) { isFeixueXuexiuStackSyncBuff = v; }, true, true);
  __wcE('isStackSyncUiAuthority', function () { return isStackSyncUiAuthority; }, function (v) { isStackSyncUiAuthority = v; }, true, true);
  __wcE('listStackBuffsForStackUi', function () { return listStackBuffsForStackUi; }, function (v) { listStackBuffsForStackUi = v; }, true, true);
  __wcE('compositeStackBuffIsNamedSkillsOnly', function () { return compositeStackBuffIsNamedSkillsOnly; }, function (v) { compositeStackBuffIsNamedSkillsOnly = v; }, true, true);
  __wcE('stackBuffVisibleOnCatalogItem', function () { return stackBuffVisibleOnCatalogItem; }, function (v) { stackBuffVisibleOnCatalogItem = v; }, true, true);
  __wcE('getStackSyncSiblingBuffs', function () { return getStackSyncSiblingBuffs; }, function (v) { getStackSyncSiblingBuffs = v; }, true, true);
  __wcE('writeStackMapForSyncGroup', function () { return writeStackMapForSyncGroup; }, function (v) { writeStackMapForSyncGroup = v; }, true, true);
  __wcE('getMemberFeixueXuexiuStacks', function () { return getMemberFeixueXuexiuStacks; }, function (v) { getMemberFeixueXuexiuStacks = v; }, true, true);
  __wcE('syncFeixueXuexiuLinkedBuffs', function () { return syncFeixueXuexiuLinkedBuffs; }, function (v) { syncFeixueXuexiuLinkedBuffs = v; }, true, true);
  __wcE('createAugustaSpecialStackBuffEntry', function () { return createAugustaSpecialStackBuffEntry; }, function (v) { createAugustaSpecialStackBuffEntry = v; }, true, true);
  __wcE('createAugustaC3MultBoostBuffEntry', function () { return createAugustaC3MultBoostBuffEntry; }, function (v) { createAugustaC3MultBoostBuffEntry = v; }, true, true);
  __wcE('createAugustaC4TeamAtkBuffEntry', function () { return createAugustaC4TeamAtkBuffEntry; }, function (v) { createAugustaC4TeamAtkBuffEntry = v; }, true, true);
  __wcE('createAugustaC6NutingExtraSkillEntry', function () { return createAugustaC6NutingExtraSkillEntry; }, function (v) { createAugustaC6NutingExtraSkillEntry = v; }, true, true);
  __wcD('AMIS_C1_HEAVY_CRIT_KEY', AMIS_C1_HEAVY_CRIT_KEY);
  __wcD('AMIS_INNATE_HEAVY_DEEP_KEY', AMIS_INNATE_HEAVY_DEEP_KEY);
  __wcD('AMIS_OUTRO_KEY', AMIS_OUTRO_KEY);
  __wcD('AMIS_OUTRO_EXTRA_EFFECT_KEY', AMIS_OUTRO_EXTRA_EFFECT_KEY);
  __wcD('AMIS_OUTRO_LEGACY_KEYS', AMIS_OUTRO_LEGACY_KEYS);
  __wcD('AMIS_C2_WING_MULT_KEY', AMIS_C2_WING_MULT_KEY);
  __wcD('AMIS_C3_STAR_MULT_KEY', AMIS_C3_STAR_MULT_KEY);
  __wcD('AMIS_C4_TEAM_BONUS_KEY', AMIS_C4_TEAM_BONUS_KEY);
  __wcD('AMIS_C6_LIB_VULN_KEY', AMIS_C6_LIB_VULN_KEY);
  __wcD('AMIS_C1_HEAVY_SKILLS', AMIS_C1_HEAVY_SKILLS);
  __wcD('AMIS_C2_WING_SKILLS', AMIS_C2_WING_SKILLS);
  __wcD('AMIS_C3_STAR_FINALE_SKILLS', AMIS_C3_STAR_FINALE_SKILLS);
  __wcD('AMIS_C3_STAR_OVERLOAD_SKILLS', AMIS_C3_STAR_OVERLOAD_SKILLS);
  __wcD('DANIA_SKILL_EXILE_S2_MULT_KEY', DANIA_SKILL_EXILE_S2_MULT_KEY);
  __wcD('DANIA_SKILL_ILLUSION_FORM_MULT_KEY', DANIA_SKILL_ILLUSION_FORM_MULT_KEY);
  __wcD('DANIA_C2_EXILE_MULT_KEY', DANIA_C2_EXILE_MULT_KEY);
  __wcD('DANIA_BURST_EFFECT_DEEP_KEY', DANIA_BURST_EFFECT_DEEP_KEY);
  __wcD('DANIA_EXILE_S1_SKILLS', DANIA_EXILE_S1_SKILLS);
  __wcD('DANIA_EXILE_S2_SKILLS', DANIA_EXILE_S2_SKILLS);
  __wcD('DANIA_ILLUSION_FORM_SKILLS', DANIA_ILLUSION_FORM_SKILLS);
  __wcE('patchTemplateBuffMetaFromFresh', function () { return patchTemplateBuffMetaFromFresh; }, function (v) { patchTemplateBuffMetaFromFresh = v; }, true, true);
  __wcE('mergeTemplateBuffKeepGameText', function () { return mergeTemplateBuffKeepGameText; }, function (v) { mergeTemplateBuffKeepGameText = v; }, true, true);
  __wcE('setTemplateNotesIfEmpty', function () { return setTemplateNotesIfEmpty; }, function (v) { setTemplateNotesIfEmpty = v; }, true, true);
  __wcE('ensureTemplateListBuff', function () { return ensureTemplateListBuff; }, function (v) { ensureTemplateListBuff = v; }, true, true);
  __wcE('upsertAmisBodyPersonalBuff', function () { return upsertAmisBodyPersonalBuff; }, function (v) { upsertAmisBodyPersonalBuff = v; }, true, true);
  __wcE('upsertAmisBodyTeamBuff', function () { return upsertAmisBodyTeamBuff; }, function (v) { upsertAmisBodyTeamBuff = v; }, true, true);
  __wcE('upsertAmisBodyCombatModeTeamBuff', function () { return upsertAmisBodyCombatModeTeamBuff; }, function (v) { upsertAmisBodyCombatModeTeamBuff = v; }, true, true);
  __wcE('upsertAmisBodyCombatModePersonalBuff', function () { return upsertAmisBodyCombatModePersonalBuff; }, function (v) { upsertAmisBodyCombatModePersonalBuff = v; }, true, true);
  __wcE('upsertAmisChainBuff', function () { return upsertAmisChainBuff; }, function (v) { upsertAmisChainBuff = v; }, true, true);
  __wcE('upsertAmisChainPersonalBuff', function () { return upsertAmisChainPersonalBuff; }, function (v) { upsertAmisChainPersonalBuff = v; }, true, true);
  __wcE('upsertAmisChainTeamBuff', function () { return upsertAmisChainTeamBuff; }, function (v) { upsertAmisChainTeamBuff = v; }, true, true);
  __wcE('createAmisInnateHeavyDeepBuffEntry', function () { return createAmisInnateHeavyDeepBuffEntry; }, function (v) { createAmisInnateHeavyDeepBuffEntry = v; }, true, true);
  __wcE('createAmisChain1HeavyCritBuffEntry', function () { return createAmisChain1HeavyCritBuffEntry; }, function (v) { createAmisChain1HeavyCritBuffEntry = v; }, true, true);
  __wcE('createAmisChain2WingMultBuffEntry', function () { return createAmisChain2WingMultBuffEntry; }, function (v) { createAmisChain2WingMultBuffEntry = v; }, true, true);
  __wcE('createAmisChain3StarMultBuffEntry', function () { return createAmisChain3StarMultBuffEntry; }, function (v) { createAmisChain3StarMultBuffEntry = v; }, true, true);
  __wcE('createAmisOutroBuffEntry', function () { return createAmisOutroBuffEntry; }, function (v) { createAmisOutroBuffEntry = v; }, true, true);
  __wcE('isAmisOutroBuff', function () { return isAmisOutroBuff; }, function (v) { isAmisOutroBuff = v; }, true, true);
  __wcE('ensureAmisOutroEffects', function () { return ensureAmisOutroEffects; }, function (v) { ensureAmisOutroEffects = v; }, true, true);
  __wcE('migrateAmisOutroSharedBuffs', function () { return migrateAmisOutroSharedBuffs; }, function (v) { migrateAmisOutroSharedBuffs = v; }, true, true);
  __wcE('createAmisChain4TeamBonusBuffEntry', function () { return createAmisChain4TeamBonusBuffEntry; }, function (v) { createAmisChain4TeamBonusBuffEntry = v; }, true, true);
  __wcE('createAmisChain6LibVulnBuffEntry', function () { return createAmisChain6LibVulnBuffEntry; }, function (v) { createAmisChain6LibVulnBuffEntry = v; }, true, true);
  __wcE('isAmisInnate2TemplateKey', function () { return isAmisInnate2TemplateKey; }, function (v) { isAmisInnate2TemplateKey = v; }, true, true);
  __wcE('createAmisInnate2CritBuffEntry', function () { return createAmisInnate2CritBuffEntry; }, function (v) { createAmisInnate2CritBuffEntry = v; }, true, true);
  __wcE('createAmisInnate2FinaleDeepBuffEntry', function () { return createAmisInnate2FinaleDeepBuffEntry; }, function (v) { createAmisInnate2FinaleDeepBuffEntry = v; }, true, true);
  __wcE('ensureAmisTemplateShape', function () { return ensureAmisTemplateShape; }, function (v) { ensureAmisTemplateShape = v; }, true, true);
  __wcE('createDaniaSkillExileS2MultBuffEntry', function () { return createDaniaSkillExileS2MultBuffEntry; }, function (v) { createDaniaSkillExileS2MultBuffEntry = v; }, true, true);
  __wcE('createDaniaSkillIllusionFormMultBuffEntry', function () { return createDaniaSkillIllusionFormMultBuffEntry; }, function (v) { createDaniaSkillIllusionFormMultBuffEntry = v; }, true, true);
  __wcE('createDaniaChain2ExileMultBuffEntry', function () { return createDaniaChain2ExileMultBuffEntry; }, function (v) { createDaniaChain2ExileMultBuffEntry = v; }, true, true);
  __wcE('createDaniaBurstEffectDeepBuffEntry', function () { return createDaniaBurstEffectDeepBuffEntry; }, function (v) { createDaniaBurstEffectDeepBuffEntry = v; }, true, true);
  __wcE('isDaniaOutroBuff', function () { return isDaniaOutroBuff; }, function (v) { isDaniaOutroBuff = v; }, true, true);
  __wcE('createDaniaOutroBuffEntry', function () { return createDaniaOutroBuffEntry; }, function (v) { createDaniaOutroBuffEntry = v; }, true, true);
  __wcE('ensureDaniaOutroEffects', function () { return ensureDaniaOutroEffects; }, function (v) { ensureDaniaOutroEffects = v; }, true, true);
  __wcE('patchDaniaOutroBuff', function () { return patchDaniaOutroBuff; }, function (v) { patchDaniaOutroBuff = v; }, true, true);
  __wcE('syncAllDaniaOutroDeep', function () { return syncAllDaniaOutroDeep; }, function (v) { syncAllDaniaOutroDeep = v; }, true, true);
  __wcD('MECH_SYNC_STEPS', MECH_SYNC_STEPS);
  __wcE('refreshRuntimeConvertedTeamBuffs', function () { return refreshRuntimeConvertedTeamBuffs; }, function (v) { refreshRuntimeConvertedTeamBuffs = v; }, true, true);
  __wcE('syncTargetTeamMirrorStacksFromShared', function () { return syncTargetTeamMirrorStacksFromShared; }, function (v) { syncTargetTeamMirrorStacksFromShared = v; }, true, true);
  __wcE('computeDaniaOffsetHarmonyAmp', function () { return computeDaniaOffsetHarmonyAmp; }, function (v) { computeDaniaOffsetHarmonyAmp = v; }, true, true);
  __wcE('getMemberOffsetHarmonyEffPct', function () { return getMemberOffsetHarmonyEffPct; }, function (v) { getMemberOffsetHarmonyEffPct = v; }, true, true);
  __wcE('isDaniaInnateOffsetHarmonyAmpBuff', function () { return isDaniaInnateOffsetHarmonyAmpBuff; }, function (v) { isDaniaInnateOffsetHarmonyAmpBuff = v; }, true, true);
  __wcE('createDaniaInnateOffsetHarmonyAmpBuffEntry', function () { return createDaniaInnateOffsetHarmonyAmpBuffEntry; }, function (v) { createDaniaInnateOffsetHarmonyAmpBuffEntry = v; }, true, true);
  __wcE('patchDaniaInnateOffsetHarmonyAmpBuff', function () { return patchDaniaInnateOffsetHarmonyAmpBuff; }, function (v) { patchDaniaInnateOffsetHarmonyAmpBuff = v; }, true, true);
  __wcE('syncDaniaInnateOffsetHarmonyAmp', function () { return syncDaniaInnateOffsetHarmonyAmp; }, function (v) { syncDaniaInnateOffsetHarmonyAmp = v; }, true, true);
  __wcE('syncAllDaniaInnateOffsetHarmonyAmp', function () { return syncAllDaniaInnateOffsetHarmonyAmp; }, function (v) { syncAllDaniaInnateOffsetHarmonyAmp = v; }, true, true);
  __wcE('dedupeDaniaInnateOffsetHarmonyAmpShared', function () { return dedupeDaniaInnateOffsetHarmonyAmpShared; }, function (v) { dedupeDaniaInnateOffsetHarmonyAmpShared = v; }, true, true);
  __wcE('ensureDaniaTemplateShape', function () { return ensureDaniaTemplateShape; }, function (v) { ensureDaniaTemplateShape = v; }, true, true);
  __wcE('ensureEncoreTemplateShape', function () { return ensureEncoreTemplateShape; }, function (v) { ensureEncoreTemplateShape = v; }, true, true);
  __wcE('createMortefiOutroHeavyDeepBuffEntry', function () { return createMortefiOutroHeavyDeepBuffEntry; }, function (v) { createMortefiOutroHeavyDeepBuffEntry = v; }, true, true);
  __wcE('ensureMortefiTemplateShape', function () { return ensureMortefiTemplateShape; }, function (v) { ensureMortefiTemplateShape = v; }, true, true);
  __wcE('createYunoOutroHeavyDeepBuffEntry', function () { return createYunoOutroHeavyDeepBuffEntry; }, function (v) { createYunoOutroHeavyDeepBuffEntry = v; }, true, true);
  __wcE('isYunoBlessingBuff', function () { return isYunoBlessingBuff; }, function (v) { isYunoBlessingBuff = v; }, true, true);
  __wcE('upsertYunoBlessingAutoEffect', function () { return upsertYunoBlessingAutoEffect; }, function (v) { upsertYunoBlessingAutoEffect = v; }, true, true);
  __wcE('ensureYunoBlessingEffects', function () { return ensureYunoBlessingEffects; }, function (v) { ensureYunoBlessingEffects = v; }, true, true);
  __wcE('createYunoBlessingTeamBuffEntry', function () { return createYunoBlessingTeamBuffEntry; }, function (v) { createYunoBlessingTeamBuffEntry = v; }, true, true);
  __wcE('ensureYunoTemplateShape', function () { return ensureYunoTemplateShape; }, function (v) { ensureYunoTemplateShape = v; }, true, true);
  __wcE('createSanhuaOutroNormalDeepBuffEntry', function () { return createSanhuaOutroNormalDeepBuffEntry; }, function (v) { createSanhuaOutroNormalDeepBuffEntry = v; }, true, true);
  __wcE('ensureSanhuaTemplateShape', function () { return ensureSanhuaTemplateShape; }, function (v) { ensureSanhuaTemplateShape = v; }, true, true);
  __wcE('createJianxinOutroLiberationDeepBuffEntry', function () { return createJianxinOutroLiberationDeepBuffEntry; }, function (v) { createJianxinOutroLiberationDeepBuffEntry = v; }, true, true);
  __wcE('ensureJianxinTemplateShape', function () { return ensureJianxinTemplateShape; }, function (v) { ensureJianxinTemplateShape = v; }, true, true);
  __wcE('createChouyuanOutroEchoDeepBuffEntry', function () { return createChouyuanOutroEchoDeepBuffEntry; }, function (v) { createChouyuanOutroEchoDeepBuffEntry = v; }, true, true);
  __wcE('createChouyuanLiberationCritDmgBuffEntry', function () { return createChouyuanLiberationCritDmgBuffEntry; }, function (v) { createChouyuanLiberationCritDmgBuffEntry = v; }, true, true);
  __wcE('isChouyuanLiberationCritDmgBuff', function () { return isChouyuanLiberationCritDmgBuff; }, function (v) { isChouyuanLiberationCritDmgBuff = v; }, true, true);
  __wcE('computeChouyuanLiberationCritDmgPct', function () { return computeChouyuanLiberationCritDmgPct; }, function (v) { computeChouyuanLiberationCritDmgPct = v; }, true, true);
  __wcE('syncChouyuanLiberationCritDmg', function () { return syncChouyuanLiberationCritDmg; }, function (v) { syncChouyuanLiberationCritDmg = v; }, true, true);
  __wcE('createChouyuanC6HesuoCritDmgBuffEntry', function () { return createChouyuanC6HesuoCritDmgBuffEntry; }, function (v) { createChouyuanC6HesuoCritDmgBuffEntry = v; }, true, true);
  __wcE('ensureChouyuanTemplateShape', function () { return ensureChouyuanTemplateShape; }, function (v) { ensureChouyuanTemplateShape = v; }, true, true);
  __wcE('createBaizhiChain3HpBuffEntry', function () { return createBaizhiChain3HpBuffEntry; }, function (v) { createBaizhiChain3HpBuffEntry = v; }, true, true);
  __wcE('ensureBaizhiTemplateShape', function () { return ensureBaizhiTemplateShape; }, function (v) { ensureBaizhiTemplateShape = v; }, true, true);
  __wcE('createZhezhiOutroBuffEntry', function () { return createZhezhiOutroBuffEntry; }, function (v) { createZhezhiOutroBuffEntry = v; }, true, true);
  __wcE('ensureZhezhiTemplateShape', function () { return ensureZhezhiTemplateShape; }, function (v) { ensureZhezhiTemplateShape = v; }, true, true);
  __wcE('createYinlinOutroBuffEntry', function () { return createYinlinOutroBuffEntry; }, function (v) { createYinlinOutroBuffEntry = v; }, true, true);
  __wcE('ensureYinlinTemplateShape', function () { return ensureYinlinTemplateShape; }, function (v) { ensureYinlinTemplateShape = v; }, true, true);
  __wcE('createFloroOutroBuffEntry', function () { return createFloroOutroBuffEntry; }, function (v) { createFloroOutroBuffEntry = v; }, true, true);
  __wcE('ensureFloroTemplateShape', function () { return ensureFloroTemplateShape; }, function (v) { ensureFloroTemplateShape = v; }, true, true);
  __wcE('createCantarellaOutroBuffEntry', function () { return createCantarellaOutroBuffEntry; }, function (v) { createCantarellaOutroBuffEntry = v; }, true, true);
  __wcE('ensureCantarellaTemplateShape', function () { return ensureCantarellaTemplateShape; }, function (v) { ensureCantarellaTemplateShape = v; }, true, true);
  __wcE('ensureTaoqiTemplateShape', function () { return ensureTaoqiTemplateShape; }, function (v) { ensureTaoqiTemplateShape = v; }, true, true);
  __wcE('createRococoOutroBuffEntry', function () { return createRococoOutroBuffEntry; }, function (v) { createRococoOutroBuffEntry = v; }, true, true);
  __wcE('ensureRococoTemplateShape', function () { return ensureRococoTemplateShape; }, function (v) { ensureRococoTemplateShape = v; }, true, true);
  __wcE('createRococoFlatAtkBuffEntry', function () { return createRococoFlatAtkBuffEntry; }, function (v) { createRococoFlatAtkBuffEntry = v; }, true, true);
  __wcE('isRococoFlatAtkBuff', function () { return isRococoFlatAtkBuff; }, function (v) { isRococoFlatAtkBuff = v; }, true, true);
  __wcE('computeRococoCritFlatAtk', function () { return computeRococoCritFlatAtk; }, function (v) { computeRococoCritFlatAtk = v; }, true, true);
  __wcE('getMemberFinalCritRatePct', function () { return getMemberFinalCritRatePct; }, function (v) { getMemberFinalCritRatePct = v; }, true, true);
  __wcE('ensureTeamCritRateConversionsSynced', function () { return ensureTeamCritRateConversionsSynced; }, function (v) { ensureTeamCritRateConversionsSynced = v; }, true, true);
  __wcE('isRococoPersonalFlatAtkActive', function () { return isRococoPersonalFlatAtkActive; }, function (v) { isRococoPersonalFlatAtkActive = v; }, true, true);
  __wcE('isRococoFlatAtkCoveredOnMember', function () { return isRococoFlatAtkCoveredOnMember; }, function (v) { isRococoFlatAtkCoveredOnMember = v; }, true, true);
  __wcE('syncRococoCritFlatAtk', function () { return syncRococoCritFlatAtk; }, function (v) { syncRococoCritFlatAtk = v; }, true, true);
  __wcE('syncRococoFlatAtkToAllPanels', function () { return syncRococoFlatAtkToAllPanels; }, function (v) { syncRococoFlatAtkToAllPanels = v; }, true, true);
  __wcE('createRebeccaOutroBuffEntry', function () { return createRebeccaOutroBuffEntry; }, function (v) { createRebeccaOutroBuffEntry = v; }, true, true);
  __wcE('isRebeccaHunterModeBuff', function () { return isRebeccaHunterModeBuff; }, function (v) { isRebeccaHunterModeBuff = v; }, true, true);
  __wcE('isRebeccaIronModeBuff', function () { return isRebeccaIronModeBuff; }, function (v) { isRebeccaIronModeBuff = v; }, true, true);
  __wcE('upsertRebeccaModeAutoEffect', function () { return upsertRebeccaModeAutoEffect; }, function (v) { upsertRebeccaModeAutoEffect = v; }, true, true);
  __wcE('ensureRebeccaHunterModeEffects', function () { return ensureRebeccaHunterModeEffects; }, function (v) { ensureRebeccaHunterModeEffects = v; }, true, true);
  __wcE('ensureRebeccaIronModeEffects', function () { return ensureRebeccaIronModeEffects; }, function (v) { ensureRebeccaIronModeEffects = v; }, true, true);
  __wcE('createRebeccaHunterModeBuffEntry', function () { return createRebeccaHunterModeBuffEntry; }, function (v) { createRebeccaHunterModeBuffEntry = v; }, true, true);
  __wcE('createRebeccaIronModeBuffEntry', function () { return createRebeccaIronModeBuffEntry; }, function (v) { createRebeccaIronModeBuffEntry = v; }, true, true);
  __wcE('upsertRebeccaBodyModeBuff', function () { return upsertRebeccaBodyModeBuff; }, function (v) { upsertRebeccaBodyModeBuff = v; }, true, true);
  __wcE('ensureRebeccaTemplateShape', function () { return ensureRebeccaTemplateShape; }, function (v) { ensureRebeccaTemplateShape = v; }, true, true);
  __wcE('isBulingSancaiBuff', function () { return isBulingSancaiBuff; }, function (v) { isBulingSancaiBuff = v; }, true, true);
  __wcE('upsertBulingSancaiAutoEffect', function () { return upsertBulingSancaiAutoEffect; }, function (v) { upsertBulingSancaiAutoEffect = v; }, true, true);
  __wcE('ensureBulingSancaiEffects', function () { return ensureBulingSancaiEffects; }, function (v) { ensureBulingSancaiEffects = v; }, true, true);
  __wcE('createBulingSancaiBuffEntry', function () { return createBulingSancaiBuffEntry; }, function (v) { createBulingSancaiBuffEntry = v; }, true, true);
  __wcE('upsertBulingBodyTeamSancai', function () { return upsertBulingBodyTeamSancai; }, function (v) { upsertBulingBodyTeamSancai = v; }, true, true);
  __wcE('ensureBulingTemplateShape', function () { return ensureBulingTemplateShape; }, function (v) { ensureBulingTemplateShape = v; }, true, true);
  __wcE('createYouhuOutroCoordDeepBuffEntry', function () { return createYouhuOutroCoordDeepBuffEntry; }, function (v) { createYouhuOutroCoordDeepBuffEntry = v; }, true, true);
  __wcE('ensureYouhuTemplateShape', function () { return ensureYouhuTemplateShape; }, function (v) { ensureYouhuTemplateShape = v; }, true, true);
  __wcE('syncYouhuShizhongwuBuffNames', function () { return syncYouhuShizhongwuBuffNames; }, function (v) { syncYouhuShizhongwuBuffNames = v; }, true, true);
  __wcE('createCartethyiaOutroAeroDeepBuffEntry', function () { return createCartethyiaOutroAeroDeepBuffEntry; }, function (v) { createCartethyiaOutroAeroDeepBuffEntry = v; }, true, true);
  __wcE('createCartethyiaXianhuaShenquanBuffEntry', function () { return createCartethyiaXianhuaShenquanBuffEntry; }, function (v) { createCartethyiaXianhuaShenquanBuffEntry = v; }, true, true);
  __wcE('isCartethyiaXianhuaShenquanBuff', function () { return isCartethyiaXianhuaShenquanBuff; }, function (v) { isCartethyiaXianhuaShenquanBuff = v; }, true, true);
  __wcE('ensureCartethyiaTemplateShape', function () { return ensureCartethyiaTemplateShape; }, function (v) { ensureCartethyiaTemplateShape = v; }, true, true);
  __wcE('isCartethyiaUltBoostBuff', function () { return isCartethyiaUltBoostBuff; }, function (v) { isCartethyiaUltBoostBuff = v; }, true, true);
  __wcE('renameCartethyiaUltBoostBuff', function () { return renameCartethyiaUltBoostBuff; }, function (v) { renameCartethyiaUltBoostBuff = v; }, true, true);
  __wcE('syncCartethyiaUltBoostBuffNames', function () { return syncCartethyiaUltBoostBuffNames; }, function (v) { syncCartethyiaUltBoostBuffNames = v; }, true, true);
  __wcE('isCartethyiaC1Buff', function () { return isCartethyiaC1Buff; }, function (v) { isCartethyiaC1Buff = v; }, true, true);
  __wcE('renameCartethyiaC1Buff', function () { return renameCartethyiaC1Buff; }, function (v) { renameCartethyiaC1Buff = v; }, true, true);
  __wcE('createXiakongOutroWindErosionBuffEntry', function () { return createXiakongOutroWindErosionBuffEntry; }, function (v) { createXiakongOutroWindErosionBuffEntry = v; }, true, true);
  __wcE('isXiakongOutroWindErosionBuff', function () { return isXiakongOutroWindErosionBuff; }, function (v) { isXiakongOutroWindErosionBuff = v; }, true, true);
  __wcE('ensureXiakongTemplateShape', function () { return ensureXiakongTemplateShape; }, function (v) { ensureXiakongTemplateShape = v; }, true, true);
  __wcE('createQiushuiOutroAeroDeepBuffEntry', function () { return createQiushuiOutroAeroDeepBuffEntry; }, function (v) { createQiushuiOutroAeroDeepBuffEntry = v; }, true, true);
  __wcE('ensureQiushuiTemplateShape', function () { return ensureQiushuiTemplateShape; }, function (v) { ensureQiushuiTemplateShape = v; }, true, true);
  __wcE('createLumiOutroSkillDeepBuffEntry', function () { return createLumiOutroSkillDeepBuffEntry; }, function (v) { createLumiOutroSkillDeepBuffEntry = v; }, true, true);
  __wcE('ensureLumiTemplateShape', function () { return ensureLumiTemplateShape; }, function (v) { ensureLumiTemplateShape = v; }, true, true);
  __wcE('createRoverElectroOutroGeneralDeepBuffEntry', function () { return createRoverElectroOutroGeneralDeepBuffEntry; }, function (v) { createRoverElectroOutroGeneralDeepBuffEntry = v; }, true, true);
  __wcE('ensureRoverElectroTemplateShape', function () { return ensureRoverElectroTemplateShape; }, function (v) { ensureRoverElectroTemplateShape = v; }, true, true);
  __wcE('ensureRoverSpectroTemplateShape', function () { return ensureRoverSpectroTemplateShape; }, function (v) { ensureRoverSpectroTemplateShape = v; }, true, true);
  __wcE('createZanniOutroDiffractionDeepBuffEntry', function () { return createZanniOutroDiffractionDeepBuffEntry; }, function (v) { createZanniOutroDiffractionDeepBuffEntry = v; }, true, true);
  __wcE('createLinneiOutroBuffEntry', function () { return createLinneiOutroBuffEntry; }, function (v) { createLinneiOutroBuffEntry = v; }, true, true);
  __wcE('isLinneiOutroBuff', function () { return isLinneiOutroBuff; }, function (v) { isLinneiOutroBuff = v; }, true, true);
  __wcE('upsertLinneiOutroAutoEffect', function () { return upsertLinneiOutroAutoEffect; }, function (v) { upsertLinneiOutroAutoEffect = v; }, true, true);
  __wcE('ensureLinneiOutroEffects', function () { return ensureLinneiOutroEffects; }, function (v) { ensureLinneiOutroEffects = v; }, true, true);
  __wcE('ensureLinneiTemplateShape', function () { return ensureLinneiTemplateShape; }, function (v) { ensureLinneiTemplateShape = v; }, true, true);
  __wcE('isLucyHoumenBuff', function () { return isLucyHoumenBuff; }, function (v) { isLucyHoumenBuff = v; }, true, true);
  __wcE('createLucyHoumenBuffEntry', function () { return createLucyHoumenBuffEntry; }, function (v) { createLucyHoumenBuffEntry = v; }, true, true);
  __wcE('upsertLucyHoumenAutoEffect', function () { return upsertLucyHoumenAutoEffect; }, function (v) { upsertLucyHoumenAutoEffect = v; }, true, true);
  __wcE('ensureLucyHoumenEffects', function () { return ensureLucyHoumenEffects; }, function (v) { ensureLucyHoumenEffects = v; }, true, true);
  __wcE('isLucyMultithreadSqlBuff', function () { return isLucyMultithreadSqlBuff; }, function (v) { isLucyMultithreadSqlBuff = v; }, true, true);
  __wcE('ensureLucyMultithreadSqlAsComposite', function () { return ensureLucyMultithreadSqlAsComposite; }, function (v) { ensureLucyMultithreadSqlAsComposite = v; }, true, true);
  __wcE('createLucyMultithreadSqlBuffEntry', function () { return createLucyMultithreadSqlBuffEntry; }, function (v) { createLucyMultithreadSqlBuffEntry = v; }, true, true);
  __wcE('upsertLucyMultithreadSqlAutoEffect', function () { return upsertLucyMultithreadSqlAutoEffect; }, function (v) { upsertLucyMultithreadSqlAutoEffect = v; }, true, true);
  __wcE('ensureLucyMultithreadSqlEffects', function () { return ensureLucyMultithreadSqlEffects; }, function (v) { ensureLucyMultithreadSqlEffects = v; }, true, true);
  __wcE('isLucyC6ExecVulnBuff', function () { return isLucyC6ExecVulnBuff; }, function (v) { isLucyC6ExecVulnBuff = v; }, true, true);
  __wcE('createLucyC6ExecVulnBuffEntry', function () { return createLucyC6ExecVulnBuffEntry; }, function (v) { createLucyC6ExecVulnBuffEntry = v; }, true, true);
  __wcE('upsertLucyC6ExecVulnAutoEffect', function () { return upsertLucyC6ExecVulnAutoEffect; }, function (v) { upsertLucyC6ExecVulnAutoEffect = v; }, true, true);
  __wcE('ensureLucyC6ExecVulnEffects', function () { return ensureLucyC6ExecVulnEffects; }, function (v) { ensureLucyC6ExecVulnEffects = v; }, true, true);
  __wcE('ensureLucyTemplateShape', function () { return ensureLucyTemplateShape; }, function (v) { ensureLucyTemplateShape = v; }, true, true);
  __wcE('isLucyOutroBuff', function () { return isLucyOutroBuff; }, function (v) { isLucyOutroBuff = v; }, true, true);
  __wcE('createLucyOutroBuffEntry', function () { return createLucyOutroBuffEntry; }, function (v) { createLucyOutroBuffEntry = v; }, true, true);
  __wcE('upsertLucyOutroAutoEffect', function () { return upsertLucyOutroAutoEffect; }, function (v) { upsertLucyOutroAutoEffect = v; }, true, true);
  __wcE('ensureLucyOutroEffects', function () { return ensureLucyOutroEffects; }, function (v) { ensureLucyOutroEffects = v; }, true, true);
  __wcE('ensureZanniTemplateShape', function () { return ensureZanniTemplateShape; }, function (v) { ensureZanniTemplateShape = v; }, true, true);
  __wcE('isZanniYanguangBuff', function () { return isZanniYanguangBuff; }, function (v) { isZanniYanguangBuff = v; }, true, true);
  __wcE('ensureZanniYanguangAsComposite', function () { return ensureZanniYanguangAsComposite; }, function (v) { ensureZanniYanguangAsComposite = v; }, true, true);
  __wcE('upsertZanniYanguangAutoEffect', function () { return upsertZanniYanguangAutoEffect; }, function (v) { upsertZanniYanguangAutoEffect = v; }, true, true);
  __wcE('ensureZanniYanguangEffects', function () { return ensureZanniYanguangEffects; }, function (v) { ensureZanniYanguangEffects = v; }, true, true);
  __wcE('createSuisuiConsumeXuyanBuffEntry', function () { return createSuisuiConsumeXuyanBuffEntry; }, function (v) { createSuisuiConsumeXuyanBuffEntry = v; }, true, true);
  __wcE('createPhoebeInnate2ElementBuffEntry', function () { return createPhoebeInnate2ElementBuffEntry; }, function (v) { createPhoebeInnate2ElementBuffEntry = v; }, true, true);
  __wcE('createPhoebeAbsolutionKitBuffEntry', function () { return createPhoebeAbsolutionKitBuffEntry; }, function (v) { createPhoebeAbsolutionKitBuffEntry = v; }, true, true);
  __wcE('createPhoebeC1ConfessionDawnMultBuffEntry', function () { return createPhoebeC1ConfessionDawnMultBuffEntry; }, function (v) { createPhoebeC1ConfessionDawnMultBuffEntry = v; }, true, true);
  __wcE('createPhoebeOutroBuffEntry', function () { return createPhoebeOutroBuffEntry; }, function (v) { createPhoebeOutroBuffEntry = v; }, true, true);
  __wcE('createPhoebeC2AbsolutionListenDeepBuffEntry', function () { return createPhoebeC2AbsolutionListenDeepBuffEntry; }, function (v) { createPhoebeC2AbsolutionListenDeepBuffEntry = v; }, true, true);
  __wcE('createPhoebeC4TeamResReduceBuffEntry', function () { return createPhoebeC4TeamResReduceBuffEntry; }, function (v) { createPhoebeC4TeamResReduceBuffEntry = v; }, true, true);
  __wcE('createPhoebeC4PersonalElementBuffEntry', function () { return createPhoebeC4PersonalElementBuffEntry; }, function (v) { createPhoebeC4PersonalElementBuffEntry = v; }, true, true);
  __wcE('createPhoebeC6PersonalAtkBuffEntry', function () { return createPhoebeC6PersonalAtkBuffEntry; }, function (v) { createPhoebeC6PersonalAtkBuffEntry = v; }, true, true);
  __wcE('createPhoebeC3StarlightMultBuffEntry', function () { return createPhoebeC3StarlightMultBuffEntry; }, function (v) { createPhoebeC3StarlightMultBuffEntry = v; }, true, true);
  __wcE('ensurePhoebeTemplateShape', function () { return ensurePhoebeTemplateShape; }, function (v) { ensurePhoebeTemplateShape = v; }, true, true);
  __wcE('createSuisuiOutro2ErBonusBuffEntry', function () { return createSuisuiOutro2ErBonusBuffEntry; }, function (v) { createSuisuiOutro2ErBonusBuffEntry = v; }, true, true);
  __wcE('createSuisuiOutro3ErAtkBuffEntry', function () { return createSuisuiOutro3ErAtkBuffEntry; }, function (v) { createSuisuiOutro3ErAtkBuffEntry = v; }, true, true);
  __wcE('computeSuisuiOutro2ErBonusPct', function () { return computeSuisuiOutro2ErBonusPct; }, function (v) { computeSuisuiOutro2ErBonusPct = v; }, true, true);
  __wcE('computeSuisuiOutro3ErAtkPct', function () { return computeSuisuiOutro3ErAtkPct; }, function (v) { computeSuisuiOutro3ErAtkPct = v; }, true, true);
  __wcE('isSuisuiOutro2ErBonusBuff', function () { return isSuisuiOutro2ErBonusBuff; }, function (v) { isSuisuiOutro2ErBonusBuff = v; }, true, true);
  __wcE('isSuisuiOutro3ErAtkBuff', function () { return isSuisuiOutro3ErAtkBuff; }, function (v) { isSuisuiOutro3ErAtkBuff = v; }, true, true);
  __wcE('upsertForcedTeamBuffEntry', function () { return upsertForcedTeamBuffEntry; }, function (v) { upsertForcedTeamBuffEntry = v; }, true, true);
  __wcE('syncSuisuiOutroErConvert', function () { return syncSuisuiOutroErConvert; }, function (v) { syncSuisuiOutroErConvert = v; }, true, true);
  __wcE('ensureSuisuiTemplateShape', function () { return ensureSuisuiTemplateShape; }, function (v) { ensureSuisuiTemplateShape = v; }, true, true);
  __wcE('createShorekeeperStarPurpleBuffEntry', function () { return createShorekeeperStarPurpleBuffEntry; }, function (v) { createShorekeeperStarPurpleBuffEntry = v; }, true, true);
  __wcE('createShorekeeperStarGoldBuffEntry', function () { return createShorekeeperStarGoldBuffEntry; }, function (v) { createShorekeeperStarGoldBuffEntry = v; }, true, true);
  __wcE('computeShorekeeperStarPurpleCritPct', function () { return computeShorekeeperStarPurpleCritPct; }, function (v) { computeShorekeeperStarPurpleCritPct = v; }, true, true);
  __wcE('computeShorekeeperStarGoldCritDmgPct', function () { return computeShorekeeperStarGoldCritDmgPct; }, function (v) { computeShorekeeperStarGoldCritDmgPct = v; }, true, true);
  __wcE('isShorekeeperStarPurpleBuff', function () { return isShorekeeperStarPurpleBuff; }, function (v) { isShorekeeperStarPurpleBuff = v; }, true, true);
  __wcE('isShorekeeperStarGoldBuff', function () { return isShorekeeperStarGoldBuff; }, function (v) { isShorekeeperStarGoldBuff = v; }, true, true);
  __wcE('isShorekeeperInnate2ErBuff', function () { return isShorekeeperInnate2ErBuff; }, function (v) { isShorekeeperInnate2ErBuff = v; }, true, true);
  __wcE('isShorekeeperInnate2ErBuffActive', function () { return isShorekeeperInnate2ErBuffActive; }, function (v) { isShorekeeperInnate2ErBuffActive = v; }, true, true);
  __wcE('syncShorekeeperInnate2ErPanels', function () { return syncShorekeeperInnate2ErPanels; }, function (v) { syncShorekeeperInnate2ErPanels = v; }, true, true);
  __wcE('syncShorekeeperStarErConvert', function () { return syncShorekeeperStarErConvert; }, function (v) { syncShorekeeperStarErConvert = v; }, true, true);
  __wcE('createShorekeeperInnate2ErBuffEntry', function () { return createShorekeeperInnate2ErBuffEntry; }, function (v) { createShorekeeperInnate2ErBuffEntry = v; }, true, true);
  __wcE('ensureShorekeeperTemplateShape', function () { return ensureShorekeeperTemplateShape; }, function (v) { ensureShorekeeperTemplateShape = v; }, true, true);
  __wcE('createYangyangXuanlingOutroDeepBuffEntry', function () { return createYangyangXuanlingOutroDeepBuffEntry; }, function (v) { createYangyangXuanlingOutroDeepBuffEntry = v; }, true, true);
  __wcE('ensureYangyangXuanlingTemplateShape', function () { return ensureYangyangXuanlingTemplateShape; }, function (v) { ensureYangyangXuanlingTemplateShape = v; }, true, true);
  __wcE('createYangyangXuanlingC6ZhiExtraSkillEntry', function () { return createYangyangXuanlingC6ZhiExtraSkillEntry; }, function (v) { createYangyangXuanlingC6ZhiExtraSkillEntry = v; }, true, true);
  __wcE('createQianxiaoC1ExtraSkillEntry', function () { return createQianxiaoC1ExtraSkillEntry; }, function (v) { createQianxiaoC1ExtraSkillEntry = v; }, true, true);
  __wcE('isQianxiaoHuizhongBuff', function () { return isQianxiaoHuizhongBuff; }, function (v) { isQianxiaoHuizhongBuff = v; }, true, true);
  __wcE('createQianxiaoHuizhongMultEffect', function () { return createQianxiaoHuizhongMultEffect; }, function (v) { createQianxiaoHuizhongMultEffect = v; }, true, true);
  __wcE('createQianxiaoHuizhongBuffEntry', function () { return createQianxiaoHuizhongBuffEntry; }, function (v) { createQianxiaoHuizhongBuffEntry = v; }, true, true);
  __wcE('ensureQianxiaoHuizhongEffects', function () { return ensureQianxiaoHuizhongEffects; }, function (v) { ensureQianxiaoHuizhongEffects = v; }, true, true);
  __wcE('qianxiaoBuffBareName', function () { return qianxiaoBuffBareName; }, function (v) { qianxiaoBuffBareName = v; }, true, true);
  __wcE('isQianxiaoXuwuwenhenBuff', function () { return isQianxiaoXuwuwenhenBuff; }, function (v) { isQianxiaoXuwuwenhenBuff = v; }, true, true);
  __wcE('isQianxiaoAnyingxiaoBuff', function () { return isQianxiaoAnyingxiaoBuff; }, function (v) { isQianxiaoAnyingxiaoBuff = v; }, true, true);
  __wcE('createQianxiaoXuwuwenhenBuffEntry', function () { return createQianxiaoXuwuwenhenBuffEntry; }, function (v) { createQianxiaoXuwuwenhenBuffEntry = v; }, true, true);
  __wcE('createQianxiaoAnyingxiaoBuffEntry', function () { return createQianxiaoAnyingxiaoBuffEntry; }, function (v) { createQianxiaoAnyingxiaoBuffEntry = v; }, true, true);
  __wcE('promoteQianxiaoPersonalDefBuffToTeam', function () { return promoteQianxiaoPersonalDefBuffToTeam; }, function (v) { promoteQianxiaoPersonalDefBuffToTeam = v; }, true, true);
  __wcE('ensureQianxiaoTemplateShape', function () { return ensureQianxiaoTemplateShape; }, function (v) { ensureQianxiaoTemplateShape = v; }, true, true);
  __wcE('createYangyangXuanlingC6ZhiCritBuffEntry', function () { return createYangyangXuanlingC6ZhiCritBuffEntry; }, function (v) { createYangyangXuanlingC6ZhiCritBuffEntry = v; }, true, true);
  __wcE('getLuhesiInnate2DeepParams', function () { return getLuhesiInnate2DeepParams; }, function (v) { getLuhesiInnate2DeepParams = v; }, true, true);
  __wcE('computeLuhesiInnate2DeepPct', function () { return computeLuhesiInnate2DeepPct; }, function (v) { computeLuhesiInnate2DeepPct = v; }, true, true);
  __wcE('createLuhesiInnate2DeepBuffEntry', function () { return createLuhesiInnate2DeepBuffEntry; }, function (v) { createLuhesiInnate2DeepBuffEntry = v; }, true, true);
  __wcE('ensureLuhesiTemplateShape', function () { return ensureLuhesiTemplateShape; }, function (v) { ensureLuhesiTemplateShape = v; }, true, true);
  __wcE('createLuhesiChain2YongdongMultBuffEntry', function () { return createLuhesiChain2YongdongMultBuffEntry; }, function (v) { createLuhesiChain2YongdongMultBuffEntry = v; }, true, true);
  __wcE('createLuhesiChain3MultBuffEntry', function () { return createLuhesiChain3MultBuffEntry; }, function (v) { createLuhesiChain3MultBuffEntry = v; }, true, true);
  __wcE('isLuhesiInnate2DeepBuff', function () { return isLuhesiInnate2DeepBuff; }, function (v) { isLuhesiInnate2DeepBuff = v; }, true, true);
  __wcE('syncLuhesiInnate2HarmonyDeep', function () { return syncLuhesiInnate2HarmonyDeep; }, function (v) { syncLuhesiInnate2HarmonyDeep = v; }, true, true);
  __wcE('computeSigrikaInnate2EchoBonusPct', function () { return computeSigrikaInnate2EchoBonusPct; }, function (v) { computeSigrikaInnate2EchoBonusPct = v; }, true, true);
  __wcE('createSigrikaInnate2EchoBonusBuffEntry', function () { return createSigrikaInnate2EchoBonusBuffEntry; }, function (v) { createSigrikaInnate2EchoBonusBuffEntry = v; }, true, true);
  __wcE('isSigrikaTalentBuff', function () { return isSigrikaTalentBuff; }, function (v) { isSigrikaTalentBuff = v; }, true, true);
  __wcE('getSigrikaTalentDefaultStacks', function () { return getSigrikaTalentDefaultStacks; }, function (v) { getSigrikaTalentDefaultStacks = v; }, true, true);
  __wcE('collectSigrikaTalentBaseSkillTargets', function () { return collectSigrikaTalentBaseSkillTargets; }, function (v) { collectSigrikaTalentBaseSkillTargets = v; }, true, true);
  __wcE('upsertSigrikaTalentAutoEffect', function () { return upsertSigrikaTalentAutoEffect; }, function (v) { upsertSigrikaTalentAutoEffect = v; }, true, true);
  __wcE('ensureSigrikaTalentEffects', function () { return ensureSigrikaTalentEffects; }, function (v) { ensureSigrikaTalentEffects = v; }, true, true);
  __wcE('applySigrikaTalentStackValue', function () { return applySigrikaTalentStackValue; }, function (v) { applySigrikaTalentStackValue = v; }, true, true);
  __wcE('syncSigrikaTalentDefaultStacks', function () { return syncSigrikaTalentDefaultStacks; }, function (v) { syncSigrikaTalentDefaultStacks = v; }, true, true);
  __wcE('ensureSigrikaTemplateShape', function () { return ensureSigrikaTemplateShape; }, function (v) { ensureSigrikaTemplateShape = v; }, true, true);
  __wcE('isSigrikaC4TeamAtkBuff', function () { return isSigrikaC4TeamAtkBuff; }, function (v) { isSigrikaC4TeamAtkBuff = v; }, true, true);
  __wcE('renameSigrikaC4TeamAtkBuff', function () { return renameSigrikaC4TeamAtkBuff; }, function (v) { renameSigrikaC4TeamAtkBuff = v; }, true, true);
  __wcE('syncSigrikaC4TeamAtkBuffNames', function () { return syncSigrikaC4TeamAtkBuffNames; }, function (v) { syncSigrikaC4TeamAtkBuffNames = v; }, true, true);
  __wcE('isSigrikaInnate2EchoBonusBuff', function () { return isSigrikaInnate2EchoBonusBuff; }, function (v) { isSigrikaInnate2EchoBonusBuff = v; }, true, true);
  __wcE('syncSigrikaInnate2EchoBonus', function () { return syncSigrikaInnate2EchoBonus; }, function (v) { syncSigrikaInnate2EchoBonus = v; }, true, true);
  __wcE('createFeixueXuexiuBuffEntry', function () { return createFeixueXuexiuBuffEntry; }, function (v) { createFeixueXuexiuBuffEntry = v; }, true, true);
  __wcE('isFeixueXuexiuTeamRecipientCharId', function () { return isFeixueXuexiuTeamRecipientCharId; }, function (v) { isFeixueXuexiuTeamRecipientCharId = v; }, true, true);
  __wcE('createFeixueXuexiuTeamBuffEntry', function () { return createFeixueXuexiuTeamBuffEntry; }, function (v) { createFeixueXuexiuTeamBuffEntry = v; }, true, true);
  __wcE('createFeixueOutroElementDeepBuffEntry', function () { return createFeixueOutroElementDeepBuffEntry; }, function (v) { createFeixueOutroElementDeepBuffEntry = v; }, true, true);
  __wcE('createFeixueChainMultBuffEntry', function () { return createFeixueChainMultBuffEntry; }, function (v) { createFeixueChainMultBuffEntry = v; }, true, true);
  __wcE('createFeixueC1YuqiuMultBuffEntry', function () { return createFeixueC1YuqiuMultBuffEntry; }, function (v) { createFeixueC1YuqiuMultBuffEntry = v; }, true, true);
  __wcE('createFeixueC2JuheMultBuffEntry', function () { return createFeixueC2JuheMultBuffEntry; }, function (v) { createFeixueC2JuheMultBuffEntry = v; }, true, true);
  __wcE('createFeixueC3HeavyMultBuffEntry', function () { return createFeixueC3HeavyMultBuffEntry; }, function (v) { createFeixueC3HeavyMultBuffEntry = v; }, true, true);
  __wcE('createFeixueC4TeamBonusBuffEntry', function () { return createFeixueC4TeamBonusBuffEntry; }, function (v) { createFeixueC4TeamBonusBuffEntry = v; }, true, true);
  __wcE('createFeixueC5SkillMultBuffEntry', function () { return createFeixueC5SkillMultBuffEntry; }, function (v) { createFeixueC5SkillMultBuffEntry = v; }, true, true);
  __wcE('createFeixueC6JianxinCritBuffEntry', function () { return createFeixueC6JianxinCritBuffEntry; }, function (v) { createFeixueC6JianxinCritBuffEntry = v; }, true, true);
  __wcE('rewriteAllTemplateBuffLists', function () { return rewriteAllTemplateBuffLists; }, function (v) { rewriteAllTemplateBuffLists = v; }, true, true);
  __wcE('stripFeixueLegacyXuexiuSplitBuffs', function () { return stripFeixueLegacyXuexiuSplitBuffs; }, function (v) { stripFeixueLegacyXuexiuSplitBuffs = v; }, true, true);
  __wcE('ensureFeixueTemplateShape', function () { return ensureFeixueTemplateShape; }, function (v) { ensureFeixueTemplateShape = v; }, true, true);
  __wcE('isLingyangC5BuffEntry', function () { return isLingyangC5BuffEntry; }, function (v) { isLingyangC5BuffEntry = v; }, true, true);
  __wcE('ensureLingyangTemplateShape', function () { return ensureLingyangTemplateShape; }, function (v) { ensureLingyangTemplateShape = v; }, true, true);
  __wcE('syncLingyangC5BuffNames', function () { return syncLingyangC5BuffNames; }, function (v) { syncLingyangC5BuffNames = v; }, true, true);
  __wcE('isVerinaC6BuffEntry', function () { return isVerinaC6BuffEntry; }, function (v) { isVerinaC6BuffEntry = v; }, true, true);
  __wcE('renameVerinaC6Buff', function () { return renameVerinaC6Buff; }, function (v) { renameVerinaC6Buff = v; }, true, true);
  __wcE('ensureVerinaTemplateShape', function () { return ensureVerinaTemplateShape; }, function (v) { ensureVerinaTemplateShape = v; }, true, true);
  __wcE('syncVerinaC6BuffNames', function () { return syncVerinaC6BuffNames; }, function (v) { syncVerinaC6BuffNames = v; }, true, true);
  __wcE('isChunC6BuffEntry', function () { return isChunC6BuffEntry; }, function (v) { isChunC6BuffEntry = v; }, true, true);
  __wcE('renameChunC6Buff', function () { return renameChunC6Buff; }, function (v) { renameChunC6Buff = v; }, true, true);
  __wcE('ensureChunTemplateShape', function () { return ensureChunTemplateShape; }, function (v) { ensureChunTemplateShape = v; }, true, true);
  __wcE('syncChunC6BuffNames', function () { return syncChunC6BuffNames; }, function (v) { syncChunC6BuffNames = v; }, true, true);
  __wcE('isLoseraEchoBianjiaoBuff', function () { return isLoseraEchoBianjiaoBuff; }, function (v) { isLoseraEchoBianjiaoBuff = v; }, true, true);
  __wcE('createLoseraTeamResReduceBuffEntry', function () { return createLoseraTeamResReduceBuffEntry; }, function (v) { createLoseraTeamResReduceBuffEntry = v; }, true, true);
  __wcE('ensureLoseraTemplateShape', function () { return ensureLoseraTemplateShape; }, function (v) { ensureLoseraTemplateShape = v; }, true, true);
  __wcE('syncLoseraEchoBianjiaoNames', function () { return syncLoseraEchoBianjiaoNames; }, function (v) { syncLoseraEchoBianjiaoNames = v; }, true, true);
  __wcE('stripCarlottaLegacyC3OutroMult', function () { return stripCarlottaLegacyC3OutroMult; }, function (v) { stripCarlottaLegacyC3OutroMult = v; }, true, true);
  __wcD('XIANGALIYAO_CHAR_ID', XIANGALIYAO_CHAR_ID);
  __wcD('YUANWU_CHAR_ID', YUANWU_CHAR_ID);
  __wcD('BRANCH_PANEL_DUP_TALENT_KEYS', BRANCH_PANEL_DUP_TALENT_KEYS);
  __wcE('bareManagedBuffName', function () { return bareManagedBuffName; }, function (v) { bareManagedBuffName = v; }, true, true);
  __wcE('isBranchPanelDuplicateTalentBuff', function () { return isBranchPanelDuplicateTalentBuff; }, function (v) { isBranchPanelDuplicateTalentBuff = v; }, true, true);
  __wcE('stripBranchPanelDuplicateTalents', function () { return stripBranchPanelDuplicateTalents; }, function (v) { stripBranchPanelDuplicateTalents = v; }, true, true);
  __wcE('purgeBranchPanelDuplicateTalentBuffs', function () { return purgeBranchPanelDuplicateTalentBuffs; }, function (v) { purgeBranchPanelDuplicateTalentBuffs = v; }, true, true);
  __wcE('stripXiangliYaoLegacyDuplicateTalents', function () { return stripXiangliYaoLegacyDuplicateTalents; }, function (v) { stripXiangliYaoLegacyDuplicateTalents = v; }, true, true);
  __wcE('purgeXiangliYaoLegacyDuplicateTalentBuffs', function () { return purgeXiangliYaoLegacyDuplicateTalentBuffs; }, function (v) { purgeXiangliYaoLegacyDuplicateTalentBuffs = v; }, true, true);
  __wcE('createChangliInnate1LihuoBuffEntry', function () { return createChangliInnate1LihuoBuffEntry; }, function (v) { createChangliInnate1LihuoBuffEntry = v; }, true, true);
  __wcE('createChangliInnate2BuffEntry', function () { return createChangliInnate2BuffEntry; }, function (v) { createChangliInnate2BuffEntry = v; }, true, true);
  __wcE('createChangliInnate2AttackBuffEntry', function () { return createChangliInnate2AttackBuffEntry; }, function (v) { createChangliInnate2AttackBuffEntry = v; }, true, true);
  __wcE('ensureChangliInnate2Split', function () { return ensureChangliInnate2Split; }, function (v) { ensureChangliInnate2Split = v; }, true, true);
  __wcE('createChangliOutroBuffEntry', function () { return createChangliOutroBuffEntry; }, function (v) { createChangliOutroBuffEntry = v; }, true, true);
  __wcE('isChangliOutroBuff', function () { return isChangliOutroBuff; }, function (v) { isChangliOutroBuff = v; }, true, true);
  __wcE('migrateChangliOutroSharedBuffs', function () { return migrateChangliOutroSharedBuffs; }, function (v) { migrateChangliOutroSharedBuffs = v; }, true, true);
  __wcE('createChangliChain1SkillTypeBonusBuffEntry', function () { return createChangliChain1SkillTypeBonusBuffEntry; }, function (v) { createChangliChain1SkillTypeBonusBuffEntry = v; }, true, true);
  __wcE('createChangliChain2CritRateBuffEntry', function () { return createChangliChain2CritRateBuffEntry; }, function (v) { createChangliChain2CritRateBuffEntry = v; }, true, true);
  __wcE('createChangliChain3LihuoBonusBuffEntry', function () { return createChangliChain3LihuoBonusBuffEntry; }, function (v) { createChangliChain3LihuoBonusBuffEntry = v; }, true, true);
  __wcE('createChangliChain4TeamAtkBuffEntry', function () { return createChangliChain4TeamAtkBuffEntry; }, function (v) { createChangliChain4TeamAtkBuffEntry = v; }, true, true);
  __wcE('createChangliChain5FenshenBuffEntry', function () { return createChangliChain5FenshenBuffEntry; }, function (v) { createChangliChain5FenshenBuffEntry = v; }, true, true);
  __wcE('createChangliChain6DefensePenBuffEntry', function () { return createChangliChain6DefensePenBuffEntry; }, function (v) { createChangliChain6DefensePenBuffEntry = v; }, true, true);
  __wcE('ensureChangliTemplateShape', function () { return ensureChangliTemplateShape; }, function (v) { ensureChangliTemplateShape = v; }, true, true);
  __wcE('createChixiaChain1HonghongCritBuffEntry', function () { return createChixiaChain1HonghongCritBuffEntry; }, function (v) { createChixiaChain1HonghongCritBuffEntry = v; }, true, true);
  __wcE('ensureChixiaTemplateShape', function () { return ensureChixiaTemplateShape; }, function (v) { ensureChixiaTemplateShape = v; }, true, true);
  __wcE('createMoningFieldDefBuffEntry', function () { return createMoningFieldDefBuffEntry; }, function (v) { createMoningFieldDefBuffEntry = v; }, true, true);
  __wcE('createMoningOffsetHarmonyEffBuffEntry', function () { return createMoningOffsetHarmonyEffBuffEntry; }, function (v) { createMoningOffsetHarmonyEffBuffEntry = v; }, true, true);
  __wcE('createMoningC2OffsetHarmonyEffBuffEntry', function () { return createMoningC2OffsetHarmonyEffBuffEntry; }, function (v) { createMoningC2OffsetHarmonyEffBuffEntry = v; }, true, true);
  __wcE('isMoningOffsetHarmonyEffBuff', function () { return isMoningOffsetHarmonyEffBuff; }, function (v) { isMoningOffsetHarmonyEffBuff = v; }, true, true);
  __wcE('isTeamBuffTemplateCoveredOnMember', function () { return isTeamBuffTemplateCoveredOnMember; }, function (v) { isTeamBuffTemplateCoveredOnMember = v; }, true, true);
  __wcE('stripMoningLegacyOffsetHarmonyEffFromList', function () { return stripMoningLegacyOffsetHarmonyEffFromList; }, function (v) { stripMoningLegacyOffsetHarmonyEffFromList = v; }, true, true);
  __wcE('dedupeMoningOffsetHarmonyEffShared', function () { return dedupeMoningOffsetHarmonyEffShared; }, function (v) { dedupeMoningOffsetHarmonyEffShared = v; }, true, true);
  __wcE('syncMoningOffsetHarmonyEffToAllPanels', function () { return syncMoningOffsetHarmonyEffToAllPanels; }, function (v) { syncMoningOffsetHarmonyEffToAllPanels = v; }, true, true);
  __wcE('computeMoningCriticalProtocolErBonus', function () { return computeMoningCriticalProtocolErBonus; }, function (v) { computeMoningCriticalProtocolErBonus = v; }, true, true);
  __wcE('isMoningCriticalProtocolErBuff', function () { return isMoningCriticalProtocolErBuff; }, function (v) { isMoningCriticalProtocolErBuff = v; }, true, true);
  __wcE('createMoningCriticalProtocolErBuffEntry', function () { return createMoningCriticalProtocolErBuffEntry; }, function (v) { createMoningCriticalProtocolErBuffEntry = v; }, true, true);
  __wcE('upsertMoningCriticalProtocolErEffect', function () { return upsertMoningCriticalProtocolErEffect; }, function (v) { upsertMoningCriticalProtocolErEffect = v; }, true, true);
  __wcE('syncMoningCriticalProtocolErConvert', function () { return syncMoningCriticalProtocolErConvert; }, function (v) { syncMoningCriticalProtocolErConvert = v; }, true, true);
  __wcE('computeMoningC2ErCritDmgPct', function () { return computeMoningC2ErCritDmgPct; }, function (v) { computeMoningC2ErCritDmgPct = v; }, true, true);
  __wcE('isMoningC2ErCritDmgBuff', function () { return isMoningC2ErCritDmgBuff; }, function (v) { isMoningC2ErCritDmgBuff = v; }, true, true);
  __wcE('createMoningC2ErCritDmgBuffEntry', function () { return createMoningC2ErCritDmgBuffEntry; }, function (v) { createMoningC2ErCritDmgBuffEntry = v; }, true, true);
  __wcE('syncMoningC2ErCritDmg', function () { return syncMoningC2ErCritDmg; }, function (v) { syncMoningC2ErCritDmg = v; }, true, true);
  __wcE('ensureMoningTemplateShape', function () { return ensureMoningTemplateShape; }, function (v) { ensureMoningTemplateShape = v; }, true, true);
  __wcE('isJiabeilinaYuhuoBuff', function () { return isJiabeilinaYuhuoBuff; }, function (v) { isJiabeilinaYuhuoBuff = v; }, true, true);
  __wcE('collectJiabeilinaYuhuoBaseSkillTargets', function () { return collectJiabeilinaYuhuoBaseSkillTargets; }, function (v) { collectJiabeilinaYuhuoBaseSkillTargets = v; }, true, true);
  __wcE('upsertJiabeilinaYuhuoAutoEffect', function () { return upsertJiabeilinaYuhuoAutoEffect; }, function (v) { upsertJiabeilinaYuhuoAutoEffect = v; }, true, true);
  __wcE('ensureJiabeilinaYuhuoC1Effect', function () { return ensureJiabeilinaYuhuoC1Effect; }, function (v) { ensureJiabeilinaYuhuoC1Effect = v; }, true, true);
  __wcE('isJiabeilinaC3UltMultBuff', function () { return isJiabeilinaC3UltMultBuff; }, function (v) { isJiabeilinaC3UltMultBuff = v; }, true, true);
  __wcE('renameJiabeilinaC3UltMultBuff', function () { return renameJiabeilinaC3UltMultBuff; }, function (v) { renameJiabeilinaC3UltMultBuff = v; }, true, true);
  __wcE('createJiabeilinaNeiranshaoAtkBuffEntry', function () { return createJiabeilinaNeiranshaoAtkBuffEntry; }, function (v) { createJiabeilinaNeiranshaoAtkBuffEntry = v; }, true, true);
  __wcE('ensureJiabeilinaTemplateShape', function () { return ensureJiabeilinaTemplateShape; }, function (v) { ensureJiabeilinaTemplateShape = v; }, true, true);
  __wcE('syncJiabeilinaC3UltMultBuffNames', function () { return syncJiabeilinaC3UltMultBuffNames; }, function (v) { syncJiabeilinaC3UltMultBuffNames = v; }, true, true);
  __wcE('isAmisModeBuff', function () { return isAmisModeBuff; }, function (v) { isAmisModeBuff = v; }, true, true);
  __wcE('isCharKitPanelSource', function () { return isCharKitPanelSource; }, function (v) { isCharKitPanelSource = v; }, true, true);
  __wcE('upsertCharKitPanelSource', function () { return upsertCharKitPanelSource; }, function (v) { upsertCharKitPanelSource = v; }, true, true);
  __wcE('clearCharKitPanelSources', function () { return clearCharKitPanelSources; }, function (v) { clearCharKitPanelSources = v; }, true, true);
  __wcE('resolveCharBranchPanelDef', function () { return resolveCharBranchPanelDef; }, function (v) { resolveCharBranchPanelDef = v; }, true, true);
  __wcE('syncChouyuanC1CritPanel', function () { return syncChouyuanC1CritPanel; }, function (v) { syncChouyuanC1CritPanel = v; }, true, true);
  __wcE('syncCharBranchPanelSources', function () { return syncCharBranchPanelSources; }, function (v) { syncCharBranchPanelSources = v; }, true, true);
  __wcE('clearAmisModeBuffs', function () { return clearAmisModeBuffs; }, function (v) { clearAmisModeBuffs = v; }, true, true);
  __wcE('upsertAmisModeBuff', function () { return upsertAmisModeBuff; }, function (v) { upsertAmisModeBuff = v; }, true, true);
  __wcE('createAmisInnate2CritBuff', function () { return createAmisInnate2CritBuff; }, function (v) { createAmisInnate2CritBuff = v; }, true, true);
  __wcE('createAmisInnate2FinaleDeepBuff', function () { return createAmisInnate2FinaleDeepBuff; }, function (v) { createAmisInnate2FinaleDeepBuff = v; }, true, true);
  __wcE('syncAmisCombatModeKit', function () { return syncAmisCombatModeKit; }, function (v) { syncAmisCombatModeKit = v; }, true, true);
  __wcE('createAugustaOutroGeneralDeepBuffEntry', function () { return createAugustaOutroGeneralDeepBuffEntry; }, function (v) { createAugustaOutroGeneralDeepBuffEntry = v; }, true, true);
  __wcE('ensureAugustaTemplateShape', function () { return ensureAugustaTemplateShape; }, function (v) { ensureAugustaTemplateShape = v; }, true, true);
  __wcE('getAugustaSpecialMechanicsForMember', function () { return getAugustaSpecialMechanicsForMember; }, function (v) { getAugustaSpecialMechanicsForMember = v; }, true, true);
  __wcE('specialHandlers', function () { return SPECIAL_HANDLERS; }, function (v) { SPECIAL_HANDLERS = v; }, true, true);
  __wcE('getSpecialMechanicsForMember', function () { return getSpecialMechanicsForMember; }, function (v) { getSpecialMechanicsForMember = v; }, true, true);
  __wcE('ensureSpecialHandlerRegistered', function () { return ensureSpecialHandlerRegistered; }, function (v) { ensureSpecialHandlerRegistered = v; }, true, true);
  __wcE('getAugustaStackCap', function () { return getAugustaStackCap; }, function (v) { getAugustaStackCap = v; }, true, true);
  __wcE('computeAugustaCritConversion', function () { return computeAugustaCritConversion; }, function (v) { computeAugustaCritConversion = v; }, true, true);
  __wcE('syncAugustaSpecialStackOnMember', function () { return syncAugustaSpecialStackOnMember; }, function (v) { syncAugustaSpecialStackOnMember = v; }, true, true);
  __wcE('createEmptyCharacterBuffTemplate', function () { return createEmptyCharacterBuffTemplate; }, function (v) { createEmptyCharacterBuffTemplate = v; }, true, true);
  __wcE('makeTemplateKey', function () { return makeTemplateKey; }, function (v) { makeTemplateKey = v; }, true, true);
  __wcE('stripRuntimeBuffFields', function () { return stripRuntimeBuffFields; }, function (v) { stripRuntimeBuffFields = v; }, true, true);
  __wcE('normalizeTemplateBuffEntry', function () { return normalizeTemplateBuffEntry; }, function (v) { normalizeTemplateBuffEntry = v; }, true, true);
  __wcE('normalizeBuffGameText', function () { return normalizeBuffGameText; }, function (v) { normalizeBuffGameText = v; }, true, true);
  __wcE('normalizeTemplateExtraSkillEntry', function () { return normalizeTemplateExtraSkillEntry; }, function (v) { normalizeTemplateExtraSkillEntry = v; }, true, true);
  __wcE('normalizeChainBlock', function () { return normalizeChainBlock; }, function (v) { normalizeChainBlock = v; }, true, true);
  __wcE('normalizeCharacterBuffTemplate', function () { return normalizeCharacterBuffTemplate; }, function (v) { normalizeCharacterBuffTemplate = v; }, true, true);
  __wcE('normalizeTemplateLibrary', function () { return normalizeTemplateLibrary; }, function (v) { normalizeTemplateLibrary = v; }, true, true);
  __wcE('loadCharBuffTemplateLocal', function () { return loadCharBuffTemplateLocal; }, function (v) { loadCharBuffTemplateLocal = v; }, true, true);
  __wcE('saveCharBuffTemplateLocal', function () { return saveCharBuffTemplateLocal; }, function (v) { saveCharBuffTemplateLocal = v; }, true, true);
  __wcE('setCharBuffTemplateDb', function () { return setCharBuffTemplateDb; }, function (v) { setCharBuffTemplateDb = v; }, true, true);
  __wcE('ensureCharBuffTemplateDb', function () { return ensureCharBuffTemplateDb; }, function (v) { ensureCharBuffTemplateDb = v; }, true, true);
  __wcE('fillMissingTemplateGameTexts', function () { return fillMissingTemplateGameTexts; }, function (v) { fillMissingTemplateGameTexts = v; }, true, true);
  __wcE('getMergedTemplateMap', function () { return getMergedTemplateMap; }, function (v) { getMergedTemplateMap = v; }, true, true);
  __wcE('rebuildTemplateBuffIndexes', function () { return rebuildTemplateBuffIndexes; }, function (v) { rebuildTemplateBuffIndexes = v; }, true, true);
  __wcE('getCharacterBuffTemplate', function () { return getCharacterBuffTemplate; }, function (v) { getCharacterBuffTemplate = v; }, true, true);
  __wcE('listCharacterBuffTemplates', function () { return listCharacterBuffTemplates; }, function (v) { listCharacterBuffTemplates = v; }, true, true);
  __wcE('upsertLocalCharacterBuffTemplate', function () { return upsertLocalCharacterBuffTemplate; }, function (v) { upsertLocalCharacterBuffTemplate = v; }, true, true);
  __wcE('forEachTemplateBuffEntry', function () { return forEachTemplateBuffEntry; }, function (v) { forEachTemplateBuffEntry = v; }, true, true);
  __wcE('findTemplateBuffEntryByKey', function () { return findTemplateBuffEntryByKey; }, function (v) { findTemplateBuffEntryByKey = v; }, true, true);
  __wcE('findTemplateBuffEntryByName', function () { return findTemplateBuffEntryByName; }, function (v) { findTemplateBuffEntryByName = v; }, true, true);
  __wcE('describeTemplateBuffGameTextSource', function () { return describeTemplateBuffGameTextSource; }, function (v) { describeTemplateBuffGameTextSource = v; }, true, true);
  __wcE('resolveBuffSourceCharacterId', function () { return resolveBuffSourceCharacterId; }, function (v) { resolveBuffSourceCharacterId = v; }, true, true);
  __wcE('lookupTemplateBuffGameText', function () { return lookupTemplateBuffGameText; }, function (v) { lookupTemplateBuffGameText = v; }, true, true);
  __wcE('getBuffGameTextInfo', function () { return getBuffGameTextInfo; }, function (v) { getBuffGameTextInfo = v; }, true, true);
  __wcE('syncGameTextToRuntimeBuffs', function () { return syncGameTextToRuntimeBuffs; }, function (v) { syncGameTextToRuntimeBuffs = v; }, true, true);
  __wcE('patchTemplateBuffGameText', function () { return patchTemplateBuffGameText; }, function (v) { patchTemplateBuffGameText = v; }, true, true);
  __wcD('CHAIN_MARKER_REGS', CHAIN_MARKER_REGS);
  __wcE('buffNameHasChainMarker', function () { return buffNameHasChainMarker; }, function (v) { buffNameHasChainMarker = v; }, true, true);
  __wcE('parseChainNumberFromBuffName', function () { return parseChainNumberFromBuffName; }, function (v) { parseChainNumberFromBuffName = v; }, true, true);
  __wcE('templateBuffBelongsToChain', function () { return templateBuffBelongsToChain; }, function (v) { templateBuffBelongsToChain = v; }, true, true);
  __wcE('resolveTemplateBuffChainNumber', function () { return resolveTemplateBuffChainNumber; }, function (v) { resolveTemplateBuffChainNumber = v; }, true, true);
  __wcE('backfillChainEntryGameTextsFromBlocks', function () { return backfillChainEntryGameTextsFromBlocks; }, function (v) { backfillChainEntryGameTextsFromBlocks = v; }, true, true);
  __wcE('persistEnsuredCharacterTemplate', function () { return persistEnsuredCharacterTemplate; }, function (v) { persistEnsuredCharacterTemplate = v; }, true, true);
  __wcE('getBundledCharacterBuffTemplate', function () { return getBundledCharacterBuffTemplate; }, function (v) { getBundledCharacterBuffTemplate = v; }, true, true);
  __wcE('getExistingChainGameTextFromTemplate', function () { return getExistingChainGameTextFromTemplate; }, function (v) { getExistingChainGameTextFromTemplate = v; }, true, true);
  __wcE('patchCharacterChainGameTexts', function () { return patchCharacterChainGameTexts; }, function (v) { patchCharacterChainGameTexts = v; }, true, true);
  __wcE('mergeImportedCharacterBuffTemplates', function () { return mergeImportedCharacterBuffTemplates; }, function (v) { mergeImportedCharacterBuffTemplates = v; }, true, true);
  __wcE('buildCharacterBuffTemplatePack', function () { return buildCharacterBuffTemplatePack; }, function (v) { buildCharacterBuffTemplatePack = v; }, true, true);
  __wcE('buildCharacterBuffTemplatesPack', function () { return buildCharacterBuffTemplatesPack; }, function (v) { buildCharacterBuffTemplatesPack = v; }, true, true);
  __wcE('parseCharacterBuffTemplateImport', function () { return parseCharacterBuffTemplateImport; }, function (v) { parseCharacterBuffTemplateImport = v; }, true, true);
  __wcE('downloadCharacterBuffTemplatePack', function () { return downloadCharacterBuffTemplatePack; }, function (v) { downloadCharacterBuffTemplatePack = v; }, true, true);
  __wcE('isCharacterTemplateBuff', function () { return isCharacterTemplateBuff; }, function (v) { isCharacterTemplateBuff = v; }, true, true);
  __wcE('normalizeResonanceUnlocked', function () { return normalizeResonanceUnlocked; }, function (v) { normalizeResonanceUnlocked = v; }, true, true);
  __wcE('sanitizeBuffIdToken', function () { return sanitizeBuffIdToken; }, function (v) { sanitizeBuffIdToken = v; }, true, true);
  __wcE('makeTemplateBuffStableId', function () { return makeTemplateBuffStableId; }, function (v) { makeTemplateBuffStableId = v; }, true, true);
  __wcE('materializeTemplateBuff', function () { return materializeTemplateBuff; }, function (v) { materializeTemplateBuff = v; }, true, true);
  __wcE('clearCharacterTemplateBuffsForSlot', function () { return clearCharacterTemplateBuffsForSlot; }, function (v) { clearCharacterTemplateBuffsForSlot = v; }, true, true);
  __wcE('remapTemplateBuffAxisIds', function () { return remapTemplateBuffAxisIds; }, function (v) { remapTemplateBuffAxisIds = v; }, true, true);
  __wcE('migrateTeamTemplateBuffExcludedIds', function () { return migrateTeamTemplateBuffExcludedIds; }, function (v) { migrateTeamTemplateBuffExcludedIds = v; }, true, true);
  __wcE('remapTeamTemplateBuffAxisIds', function () { return remapTeamTemplateBuffAxisIds; }, function (v) { remapTeamTemplateBuffAxisIds = v; }, true, true);
  __wcE('templateBuffSnapIdentity', function () { return templateBuffSnapIdentity; }, function (v) { templateBuffSnapIdentity = v; }, true, true);
  __wcE('tagTemplateBuffEntries', function () { return tagTemplateBuffEntries; }, function (v) { tagTemplateBuffEntries = v; }, true, true);
  __wcE('collectTemplateBuffLists', function () { return collectTemplateBuffLists; }, function (v) { collectTemplateBuffLists = v; }, true, true);
  __wcE('snapshotTemplateBuffStateByKey', function () { return snapshotTemplateBuffStateByKey; }, function (v) { snapshotTemplateBuffStateByKey = v; }, true, true);
  __wcE('lookupTemplateBuffSnapValue', function () { return lookupTemplateBuffSnapValue; }, function (v) { lookupTemplateBuffSnapValue = v; }, true, true);
  __wcE('applyCharacterBuffTemplate', function () { return applyCharacterBuffTemplate; }, function (v) { applyCharacterBuffTemplate = v; }, true, true);
  __wcE('syncAllMembersCharacterBuffTemplates', function () { return syncAllMembersCharacterBuffTemplates; }, function (v) { syncAllMembersCharacterBuffTemplates = v; }, true, true);
  __wcE('collectTemplateExtraSkills', function () { return collectTemplateExtraSkills; }, function (v) { collectTemplateExtraSkills = v; }, true, true);
  __wcE('getEchoSetConvertedAttackValue', function () { return getEchoSetConvertedAttackValue; }, function (v) { getEchoSetConvertedAttackValue = v; }, true, true);
  /* ===== __WC_IIFE_EXPORT_TABLE__ end ===== */
})();
