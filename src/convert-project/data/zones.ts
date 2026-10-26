/**
 * 上游乘区词表 → 椰果 `ZoneId` 的固定对照表。
 *
 * 这是「写死的游戏口径」，不是转换流程；核心代码只按表查，不再内联判断。
 */

/** 防御类 category：需要按 defenseKind 区分「穿防 / 无视防御」 */
export const DEFENSE_ZONE_KEYS: Record<string, true> = {
    generalDefense: true,
    elementDefense: true,
    typeDefense: true,
}

/** 上游 zone / category → 椰果 `ZoneId`（`docs` 1.2 草表） */
export const ZONE_MAP: Record<string, string> = {
    // 基本面板
    generalAttack: "atkPct",
    generalDefPct: "defPct",
    // 双暴
    generalCritRate: "critRate",
    critRateSet: "critRate",
    generalCritDmg: "critDmg",
    // 增伤区
    generalBonus: "bonusDmg",
    elementBonus: "bonusDmg",
    typeBonus: "bonusDmg",
    // 加深区
    generalDeep: "deepenDmg",
    elementDeep: "deepenDmg",
    typeDeep: "deepenDmg",
    // 易伤区
    generalVulnerability: "dmgTakenInc",
    typeVulnerability: "dmgTakenInc",
    // 集谐·最终伤害是**独立乘区**，不能并进易伤（易伤是区内加算）：
    // W 的 vuln=1.4 与 convergence=1.576 是相乘关系；并进易伤会变成 1+0.4+0.576。
    // 工具箱里「终伤区」同样是独立乘算，正好承载。
    convergence: "finalDmg",
    // 减抗：泛用 / 类型 / 属性三种在 W 里是同一类，统一落工具箱的减抗乘区
    generalResReduce: "resDown",
    typeResReduce: "resDown",
    elementResReduce: "resDown",
    // 无视防御（实测样例都带 defenseKind: 'ignore'）
    generalDefense: "defPen",
    elementDefense: "defPen",
    typeDefense: "defPen",
    // 倍率**追加**：「每层/每点增加倍率 N%」——把倍率数值本身加上去。
    // 工具箱 `extraRatio` 正是这个语义（`compute.ts`：`effectiveRatio = ratio + extraRatio/100`）。
    multAdd: "extraRatio",
    // 倍率**提升**：「××伤害倍率提升 N%」——把这段伤害乘 (1 + N%)。
    // 两者不是一回事：追加是往倍率数值上加（技能倍率越高越吃亏），提升是乘在整段伤害上。
    // 工具箱里「倍率提升」对应**特殊终伤(1)**（`compute.ts`：`customMult = 1 + specialFinal1/100`，
    // 同乘区加算、再乘进总伤害），这也是工具箱自己的命名口径
    // （`ai/generate/prompts.config.ts`：普通相加语义的终伤/倍率用 specialFinal1）。
    multBoost: "specialFinal1",
    // 上游 `multBoostExtra` 是**连乘**：W 的
    // `(1 + Σ multBoost) × (1 + Σ multBoostExtra)`；
    // 工具箱的「特殊终伤(2)」也是每个来源独立乘算，正好对应。
    multBoostExtra: "specialFinal2",
    // 偏谐
    offsetHarmonyEff: "offTuneBuildupRate",
    // 按伤害类型的双暴（「召鬼呼星·承天」的重击暴击率）→ 带上类型条件
    typeCritRate: "critRate",
    typeCritDmg: "critDmg",
    // 谐度破坏增幅 / 共鸣效率 / 最终伤害（单乘区 buff 的 category 也会落到这里）
    harmonyBreakAmp: "tuneBreakBoost",
    energyRegenPct: "recharge",
    extraVulnerability: "finalDmg",
}

/** 椰果乘区 id → 中文名，拆分 buff 时用来给变体起名（取工具箱 `ZONE_DEFS` 的叫法，略作精简） */
export const ZONE_LABELS: Record<string, string> = {
    atkPct: "攻击",
    hpPct: "生命",
    defPct: "防御",
    critRate: "暴击率",
    critDmg: "暴击伤害",
    bonusDmg: "增伤",
    deepenDmg: "加深",
    dmgTakenInc: "易伤",
    finalDmg: "最终伤害",
    resDown: "减抗",
    defPen: "穿防",
    extraRatio: "额外倍率",
    specialFinal1: "特殊终伤(1)",
    specialFinal2: "特殊终伤(2)",
    offTuneBuildupRate: "偏谐累积",
    tuneBreakBoost: "谐度破坏增幅",
    tuneStrainLayer: "集谐层数",
    unisonBoonLayer: "同奏层数",
    recharge: "共鸣效率",
    atkFlat: "攻击固定值",
    hpFlat: "生命固定值",
    defFlat: "防御固定值",
    defDown: "减防",
    dmgRedPen: "穿免",
}

/** 需要按元素 / 伤害类型挂条件的乘区 */
export const CONDITIONAL_ZONES: Record<string, "element" | "damageType"> = {
    elementBonus: "element",
    elementDeep: "element",
    elementResReduce: "element",
    elementDefense: "element",
    typeBonus: "damageType",
    typeDeep: "damageType",
    typeResReduce: "damageType",
    typeVulnerability: "damageType",
    typeDefense: "damageType",
    typeCritRate: "damageType",
    typeCritDmg: "damageType",
}
