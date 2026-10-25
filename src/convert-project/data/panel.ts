/**
 * 面板来源（`members[].char.*Sources[]`）的固定对照表。
 *
 * 这些是「上游字段名 / 中文名 → 乘区」的游戏口径，放在这里是为了让
 * `panel.ts` 只保留收集与条件判断的通用逻辑。
 */

/** 上游 `char.*Sources` 的键 → 椰果乘区 */
export const PANEL_ZONES: Record<string, string> = {
    flatAtkSources: "atkFlat",
    flatHpSources: "hpFlat",
    flatDefSources: "defFlat",
    atkPercentSources: "atkPct",
    hpPercentSources: "hpPct",
    defPercentSources: "defPct",
    critRateSources: "critRate",
    critDmgSources: "critDmg",
    energyRegenPctSources: "recharge",
    harmonyBreakAmpSources: "tuneBreakBoost",
    offsetHarmonyEffPctSources: "offTuneBuildupRate",
    // 增伤类：名字里带什么就挂什么条件
    attrBonusSources: "bonusDmg",
    typeDmgBonusSources: "bonusDmg",
    dmgBonusSources: "bonusDmg",
}

/** 不走 buff 的来源（工具箱自己会算 / 走配置阶段） */
export const SKIP_SOURCE_PATTERNS = [
    /_base$/, // 基础属性
    /^echo_agg_total$/, // 声骸主副词条合计
    /^echo_panel_/, // 声骸副词条（注意不匹配 echo_set_panel_ / echo_main_panel_）
    /^weapon_panel_sub$/, // 武器副词条
]

/** 增伤来源名字里出现的伤害类型 → 椰果伤害类型全名（条件用全名才匹配得上） */
export const PANEL_TYPE_IN_NAME: [string, string][] = [
    ["普攻", "普攻伤害"],
    ["重击", "重击伤害"],
    ["共鸣解放", "共鸣解放伤害"],
    ["共鸣技能", "共鸣技能伤害"],
    ["变奏", "变奏技能伤害"],
    ["延奏", "延奏技能伤害"],
    ["声骸", "声骸技能伤害"],
    ["协同", "协同攻击伤害"],
    ["效应", "效应伤害"],
]

/** 面板乘区的中文名（与 `calculation.ts` 里拆乘区用的叫法保持一致） */
export const PANEL_ZONE_LABELS: Record<string, string> = {
    atkFlat: "攻击固定值",
    hpFlat: "生命固定值",
    defFlat: "防御固定值",
    atkPct: "攻击百分比",
    hpPct: "生命百分比",
    defPct: "防御百分比",
    critRate: "暴击率",
    critDmg: "暴击伤害",
    recharge: "共鸣效率",
    tuneBreakBoost: "谐度破坏增幅",
    offTuneBuildupRate: "偏谐累积效率",
    bonusDmg: "增伤",
}
