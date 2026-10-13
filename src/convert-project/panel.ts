/**
 * 面板加成 → Buff：**除了声骸主副词条与敌怪，鸣算屋的一切都 buff 化**。
 *
 * 椰果工具箱的架构是「一切皆 Buff」：角色/武器/声骸/套装的数值都得由 Buff 实例贡献，
 * 它自己只算「角色基础面板 + 配置阶段里填的声骸主副词条 + 敌怪」。所以上游面板里
 * 那些**工具箱无从得知**的来源（角色固有、共鸣链分支、声骸套装 2 件/5 件的固定部分…）
 * 必须编译成 Buff，否则导入后会凭空少一截数值。
 *
 * 上游 `members[].char.*Sources[]` 每项形如：
 *
 * ```json
 * { "id": "char_kit_panel_jingran_yangbian_yinhe", "name": "阳变阴合", "value": 1800 }
 * ```
 *
 * 按 `id` 决定去留（`id` 是上游的稳定标识，比名字可靠）：
 *
 * | 来源 id | 处理 |
 * | --- | --- |
 * | `*_base`（基础属性） | 跳过：工具箱按角色数据自己算 |
 * | `echo_agg_total` / `echo_main_panel_*` / `echo_panel_*` | 跳过：声骸主副词条走配置阶段（`config.ts`） |
 * | `weapon_panel_sub`（武器副词条） | 跳过：工具箱按武器数据自己算 |
 * | `char_kit_panel_*`（角色固有 / 分支） | **buff 化** |
 * | `echo_set_panel_*`（声骸套装面板部分） | **buff 化** |
 * | 其它未知来源 | **buff 化**（宁可多一条，也别悄悄少数值） |
 */

import { optionalString } from "../utils.ts"
import { shouldSkipPanelSource } from "./special-rules.ts"
import type { CoconutBuffCondition, WuwaCalcMember } from "./types.ts"

/** 上游 `char.*Sources` 的键 → 椰果乘区 */
const PANEL_ZONES: Record<string, string> = {
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
const SKIP_SOURCE_PATTERNS = [
    /_base$/, // 基础属性
    /^echo_agg_total$/, // 声骸主副词条合计
    /^echo_main_panel_/, // 声骸主词条
    /^echo_panel_/, // 声骸副词条（注意不匹配 echo_set_panel_）
    /^weapon_panel_sub$/, // 武器副词条
]

const ELEMENTS = [
    "物理",
    "冷凝",
    "热熔",
    "导电",
    "气动",
    "衍射",
    "湮灭",
] as const

/** 增伤来源名字里出现的伤害类型 → 椰果伤害类型全名（条件用全名才匹配得上） */
const TYPE_IN_NAME: [string, string][] = [
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

/** 从来源名字里认出元素 / 伤害类型条件 */
const conditionFromName = (
    name: string,
    zoneId: string,
): CoconutBuffCondition | undefined => {
    if (zoneId !== "bonusDmg") return undefined
    const element = ELEMENTS.find((el) => name.includes(el))
    if (element) return { elements: [element] }
    for (const [key, label] of TYPE_IN_NAME) {
        if (name.includes(key)) return { damageTypes: [label] }
    }
    return undefined
}

export interface PanelBuff {
    /** 稳定的产物 id（带站位，避免两个角色戴同一套装时撞 id） */
    id: string
    name: string
    zoneId: string
    value: number
    /** 归属站位（面板加成只作用于该角色自己的伤害） */
    memberIndex: number
    condition?: CoconutBuffCondition
}

/**
 * 把一个角色面板里「工具箱算不出来」的来源收成 Buff。
 *
 * @param member `payload.members[i]`
 * @param memberIndex 站位下标（决定 Buff 的 `scope`）
 */
export const collectMemberPanelBuffs = (
    member: WuwaCalcMember | null | undefined,
    memberIndex: number,
): PanelBuff[] => {
    const panel = member?.char as Record<string, unknown> | null | undefined
    if (!panel) return []

    const result: PanelBuff[] = []
    for (const [key, zoneId] of Object.entries(PANEL_ZONES)) {
        const sources = panel[key]
        if (!Array.isArray(sources)) continue
        for (const raw of sources) {
            const source = raw as {
                id?: unknown
                name?: unknown
                value?: unknown
            }
            const id = optionalString(source?.id)
            const value = Number(source?.value)
            // 0 值（上游的「来源1」空行等）不落表
            if (!id || !Number.isFinite(value) || value === 0) continue
            if (SKIP_SOURCE_PATTERNS.some((pattern) => pattern.test(id))) {
                continue
            }
            // 特殊规则：比如「本体属性·谐度破坏增幅」是工具箱角色数据自带的基数
            if (shouldSkipPanelSource(source, key)) continue

            const name = optionalString(source?.name) ?? id
            const label = ZONE_LABELS[zoneId] ?? zoneId
            const condition = conditionFromName(name, zoneId)
            result.push({
                id: `panel_${memberIndex}_${id}`,
                name: `${name}·${label}`,
                zoneId,
                value,
                memberIndex,
                ...(condition ? { condition } : {}),
            })
        }
    }
    return result
}

/** 面板乘区的中文名（与 `calculation.ts` 里拆乘区用的叫法保持一致） */
const ZONE_LABELS: Record<string, string> = {
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

/** 收集全队的面板 Buff（站位顺序） */
export const collectPanelBuffs = (
    members: (WuwaCalcMember | null | undefined)[],
): PanelBuff[] =>
    members.flatMap((member, index) => collectMemberPanelBuffs(member, index))
