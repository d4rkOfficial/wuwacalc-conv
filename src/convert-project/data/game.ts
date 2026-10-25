/**
 * 鸣算屋 / 鸣潮的**固定词表与游戏数据**。
 *
 * 这里只放「上游写死的名字、枚举、关键字」，不放任何转换流程：
 * 转换核心（`timeline.ts` / `calculation.ts` / `panel.ts`）只负责通用逻辑，
 * 新增角色 / 技能 / 套装时优先改这些表，而不是在核心代码里加 `if (name === "…")`。
 */

/** 工坊元素枚举（顺序与 W / 工具箱一致） */
export const ELEMENTS = [
    "物理",
    "冷凝",
    "热熔",
    "导电",
    "气动",
    "衍射",
    "湮灭",
] as const

/** 椰果元素增伤主词条（cost 3）：物理没有增伤主词条 */
export const ELEMENT_BONUS_ELEMENTS = [
    "冷凝",
    "热熔",
    "导电",
    "气动",
    "衍射",
    "湮灭",
] as const

/** 上游 `character.element` 数字枚举 → 元素名 */
export const ELEMENT_BY_ID: Record<number, string> = {
    1: "冷凝",
    2: "热熔",
    3: "导电",
    4: "气动",
    5: "衍射",
    6: "湮灭",
}

/** 上游效应类型 → 属性（用于具名效应的元素归属） */
export const EFFECT_ELEMENTS: Record<string, string> = {
    聚爆: "热熔",
    风蚀: "气动",
    光噪: "衍射",
    霜渐: "冷凝",
    电磁: "导电",
    虚湮: "湮灭",
}

/** 未识别为规范非直伤名的 `kind: 'execution'` 条目，按直伤处理 */
export const NON_DIRECT_NAMES = {
    谐度破坏: "处决",
    震谐响应: "响应",
    骇破响应: "响应",
} as const

/** 鸣算屋 `damageType` → 椰果 `SKILL_TYPES` */
export const SKILL_TYPE_BY_DAMAGE_TYPE: Record<string, string> = {
    普攻: "常态攻击",
    重击: "常态攻击",
    共鸣技能: "共鸣技能",
    共鸣回路: "共鸣回路",
    共鸣解放: "共鸣解放",
    变奏: "变奏技能",
    延奏: "延奏技能",
    声骸: "声骸技能",
}

/**
 * 技能名里的**招式类别** → 椰果 `skillType`（长的先匹配，`强化重击` 别被 `重击` 抢走）。
 * 只在 `damageType: '声骸'` 时用，见 `timeline.ts` 的 `skillTypeOf`。
 */
export const ACTION_SKILL_TYPES: [string, string][] = [
    ["强化重击", "常态攻击"],
    ["强化攻击", "常态攻击"],
    ["闪避反击", "常态攻击"],
    ["空中攻击", "常态攻击"],
    ["共鸣技能", "共鸣技能"],
    ["共鸣回路", "共鸣回路"],
    ["共鸣解放", "共鸣解放"],
    ["延奏", "延奏技能"],
    ["变奏", "变奏技能"],
    ["重击", "常态攻击"],
    ["普攻", "常态攻击"],
]

/** 上游 `scaleStat` → 椰果倍率的词条后缀（缺省即「攻击」，不写后缀） */
export const SCALE_SUFFIX: Record<string, string> = {
    hp: "生命",
    def: "防御",
}

/**
 * 鸣算屋 `damageType` → 椰果伤害类型**全名**。
 *
 * 工具箱的 `evaluateCondition` 拿条件里的 `damageTypes` 去比对
 * `inferDamageTypes()` 的返回值，而那些值是 `普攻伤害` / `效应伤害` 这种**带「伤害」后缀的全名**；
 * 直接塞短名（`普攻`）会永远匹配不上，条件乘区会被静默判定为不生效。
 */
export const DAMAGE_TYPE_LABELS: Record<string, string> = {
    普攻: "普攻伤害",
    重击: "重击伤害",
    共鸣技能: "共鸣技能伤害",
    共鸣解放: "共鸣解放伤害",
    声骸: "声骸技能伤害",
    变奏: "变奏技能伤害",
    延奏: "延奏技能伤害",
    协同: "协同攻击伤害",
    协同攻击: "协同攻击伤害",
    效应: "效应伤害",
    其它: "其它类型伤害",
}

/** 复刻工具箱 `NAME_PREFIX_TYPES`（`skill-infer.ts`），顺序敏感，取第一个命中的 */
export const NAME_PREFIX_TYPES: [string, string][] = [
    ["普攻·", "普攻伤害"],
    ["重击·", "重击伤害"],
    ["空中攻击", "普攻伤害"],
    ["闪避反击", "普攻伤害"],
    ["共鸣技能·", "共鸣技能伤害"],
    ["共鸣解放·", "共鸣解放伤害"],
    ["变奏技能·", "变奏技能伤害"],
    ["延奏技能·", "延奏技能伤害"],
]

/**
 * 名字里出现这些关键字的招式，同时视为**协同攻击**。
 *
 * 解包数据常不给「协同攻击」类型标签，只能按角色 / 招式名认人。
 * 新增角色时只加这一张表，不要把判断写回 `calculation.ts`。
 */
export const COORD_ATTACK_KEYWORDS = [
    "协同攻击",
    "墨鹤",
    "审判之雷",
    "加强音",
    "飞阙",
    "凄雨瘴雷",
]
