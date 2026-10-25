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
 * | `echo_agg_total` / `echo_panel_*` | 跳过：声骸主副词条走配置阶段（`config.ts`） |
 * | `echo_main_panel_*`（**主位声骸的专属被动**，名如 `主位·冷凝伤` / `主位·共鸣解放伤加成`） | **buff 化**：工具箱的声骸数据只有主副词条，没有这条被动，跳过就丢数值（绯雪的 12% 冷凝伤） |
 * | `weapon_panel_sub`（武器副词条） | 跳过：工具箱按武器数据自己算 |
 * | `char_kit_panel_*`（角色固有 / 分支） | **buff 化** |
 * | `echo_set_panel_*`（声骸套装面板部分） | **buff 化** |
 * | 其它未知来源 | **buff 化**（宁可多一条，也别悄悄少数值） |
 *
 * ⚠️ `echo_main_panel_*` **不是**「声骸主词条」。实测（绯雪 / 洛瑟菈 / 莫宁 / 陆·赫斯 /
 * 卡提希娅 / 景燃 / 弗洛洛 / 坎特蕾拉）它的值都是 **10 / 12 / 20** 这种「主位专属被动」的
 * 量级（`echo_main_panel_attr_冷凝` = `主位·冷凝伤` 12、`echo_main_panel_type_声骸` = 20），
 * 与配置阶段写进去的主词条（暴伤 44 / 属性伤 30 / 共鸣效率 32…）完全对不上；
 * 莫宁甚至同时有「共鸣效率主词条 32×2」和「主位·共鸣效率 10」两条。
 * 主副词条的合计另由 `echo_agg_total` / `echo_panel_*` 表达（那两条才是走配置阶段的）。
 */

import { optionalString } from "../utils.ts"
import { shouldSkipPanelSource } from "./special-rules.ts"
import type { CoconutBuffCondition, WuwaCalcMember } from "./types.ts"

import { ELEMENTS } from "./data/game.ts"
import {
    PANEL_TYPE_IN_NAME,
    PANEL_ZONE_LABELS,
    PANEL_ZONES,
    SKIP_SOURCE_PATTERNS,
} from "./data/panel.ts"

/** 从来源名字里认出元素 / 伤害类型条件 */
const conditionFromName = (
    name: string,
    zoneId: string,
    fallbackElement = "",
): CoconutBuffCondition | undefined => {
    if (zoneId !== "bonusDmg") return undefined
    const element = ELEMENTS.find((el) => name.includes(el))
    if (element) return { elements: [element] }
    for (const [key, label] of PANEL_TYPE_IN_NAME) {
        if (name.includes(key)) return { damageTypes: [label] }
    }
    // 角色分支/固有里的「增伤」没写元素，但它只作用于角色自身元素
    // （莫特斐的 12% 分支增伤只给热熔，不能加到湮灭声骸技能上）。
    if (fallbackElement) return { elements: [fallbackElement] }
    return undefined
}

const TYPE_LABELS = new Map(PANEL_TYPE_IN_NAME)

/**
 * 面板来源自带的 `damageType` / `element` 字段优先于名字推断。
 *
 * 例：西格莉卡固有2「共鸣效率」放在 `typeDmgBonusSources` 里，名字里完全不提
 * 「声骸」，只有 `damageType: "声骸"`。若只看名字，这条 50% 增伤会变成无条件的
 * 全伤害增伤（实测多算 3%）。
 */
const conditionFromSource = (
    source: { damageType?: unknown; element?: unknown },
    name: string,
    zoneId: string,
    fallbackElement: string,
): CoconutBuffCondition | undefined => {
    if (zoneId !== "bonusDmg") return conditionFromName(name, zoneId)
    const element = optionalString(source?.element)
    const damageType = optionalString(source?.damageType)
    const label = damageType
        ? TYPE_LABELS.get(damageType) ??
            (damageType.endsWith("伤害") ? damageType : "")
        : ""
    if (element && label) return { elements: [element], damageTypes: [label] }
    if (element) return { elements: [element] }
    if (label) return { damageTypes: [label] }
    return conditionFromName(name, zoneId, fallbackElement)
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
    characterElement = "",
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
            const label = PANEL_ZONE_LABELS[zoneId] ?? zoneId
            const condition = conditionFromSource(
                source as { damageType?: unknown; element?: unknown },
                name,
                zoneId,
                key === "attrBonusSources" && id.includes("_attr")
                    ? characterElement
                    : "",
            )
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

/** 收集全队的面板 Buff（站位顺序） */
export const collectPanelBuffs = (
    members: (WuwaCalcMember | null | undefined)[],
    characterElements: Map<string, string> = new Map(),
): PanelBuff[] =>
    members.flatMap((member, index) =>
        collectMemberPanelBuffs(
            member,
            index,
            member?.characterId
                ? characterElements.get(member.characterId) ?? ""
                : "",
        )
    )
