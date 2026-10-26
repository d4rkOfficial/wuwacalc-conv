/**
 * 逐条目对齐与乘区比较：把鸣算屋引擎的逐技能结果与转换后椰果工程的逐条目结果放一起。
 *
 * 对齐口径：
 * - 椰果一个技能可能拆成「本体 + （额外）」两条，按 `sourceTimelineBlockId` 分组，
 *   名称以 `（额外）` 结尾的并入上一条；
 * - 鸣算屋一个技能一条（多轮项目按轮内 `cycles[].steps` 摊平）；
 * - 两个列表按角色内顺序一一对应（转换器保持上游技能顺序）。
 */

import type {
    CoconutEntryResult,
    CoconutMeasureResult,
} from "./coconut/measure.ts"
import type {
    WuwaMeasureResult,
    WuwaSkillResult,
} from "./wuwacalc/measure-jsdom.ts"

export interface ZoneDiff {
    name: string
    wuwa: number
    coconut: number
    delta: number
    rel: number
}

export interface AlignedEntry {
    character: string
    wuwaName: string
    coconutName: string
    wuwaDamage: number
    coconutDamage: number
    delta: number
    rel: number
    fixed: boolean
    zones: ZoneDiff[]
    /** 椰果分组里的原始条目（本体 + 额外） */
    coconutEntries: CoconutEntryResult[]
}

export interface ParityComparison {
    code: string
    totalWuwa: number
    totalCoconut: number
    totalDelta: number
    totalRel: number
    entries: AlignedEntry[]
    /** 非直伤（处决/响应/效应）单独比，避免和技能顺序混在一起 */
    specialWuwa: number
    specialCoconut: number
    specialRel: number
    missingWuwa: string[]
    missingCoconut: string[]
}

const cleanDisplayName = (name: string): string =>
    name.replace("（额外）", "").replace(/\([^)]*\)$/, "")

interface CoconutGroup {
    key: string
    name: string
    catalogId?: string
    roundIndex?: number
    entries: CoconutEntryResult[]
    total: number
}

const groupCoconutEntries = (
    result: CoconutMeasureResult,
): Map<string, CoconutGroup[]> => {
    const byCharacter = new Map<string, CoconutGroup[]>()
    for (const entry of result.entries) {
        if (entry.id.includes("-nd|")) continue
        const list = byCharacter.get(entry.character) ?? []
        const key = entry.sourceTimelineBlockId
        // 同一参考线上的条目属于同一招：本体 + （额外）+ 多个 Hit 都要合并，
        // 否则 split 技能在椰果侧会变成多组，和上游一条聚合结果对不上。
        if (list.length === 0 || list[list.length - 1].key !== key) {
            list.push({
                key,
                name: cleanDisplayName(entry.displayName),
                ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
                ...(entry.roundIndex !== undefined
                    ? { roundIndex: entry.roundIndex }
                    : {}),
                entries: [],
                total: 0,
            })
        }
        const group = list[list.length - 1]
        group.entries.push(entry)
        group.total += entry.totalDamage
        byCharacter.set(entry.character, list)
    }
    return byCharacter
}

interface WuwaSkillRow {
    skill: WuwaSkillResult
    roundIndex?: number
}

const flattenWuwaSkills = (member: any): WuwaSkillRow[] => {
    if (member && Array.isArray(member.cycles) && member.cycles.length) {
        return member.cycles.flatMap((cycle: any, cycleIndex: number) =>
            (cycle.steps ?? []).map((skill: WuwaSkillResult) => ({
                skill,
                roundIndex: Number.isFinite(cycle.index)
                    ? Number(cycle.index)
                    : cycleIndex,
            }))
        )
    }
    return (member?.skills ?? []).map((skill: WuwaSkillResult) => ({ skill }))
}

const zone = (
    name: string,
    wuwa: unknown,
    coconut: unknown,
): ZoneDiff | null => {
    if (typeof wuwa !== "number" || typeof coconut !== "number") return null
    if (!Number.isFinite(wuwa) || !Number.isFinite(coconut)) return null
    const delta = coconut - wuwa
    const rel = wuwa === 0
        ? (coconut === 0 ? 0 : Infinity)
        : delta / Math.abs(wuwa)
    return { name, wuwa, coconut, delta, rel }
}

const zonesOf = (
    skill: WuwaSkillResult,
    group: CoconutGroup,
): ZoneDiff[] => {
    const base = group.entries[0]
    const bd = skill.breakdown ?? {}
    const fixed = base.baseUnit === "固定"
    const out: ZoneDiff[] = []
    const add = (name: string, wuwa: unknown, coconut: unknown) => {
        const diff = zone(name, wuwa, coconut)
        if (diff && Math.abs(diff.delta) > 1e-9) out.push(diff)
    }
    if (fixed) return out
    // 倍率本身也要比：只比乘区会漏掉「某一段只算了 1/10」这类整段缺失
    // （MC-U5UNZC 千咲 A2/A3 的 multComponents count 就是这种情况）。
    add(
        "baseMult",
        bd.baseMult,
        group.entries.reduce((sum, e) => sum + e.ratioNum * e.hits, 0),
    )
    add("dmgBonus", bd.dmgBonus, 1 + base.dmgBonus)
    add("deepen", bd.deepening, 1 + base.deepen)
    add("vulnerability", bd.vulnerability, 1 + base.vulnerability)
    add("resistance", bd.resistance, base.resMulti)
    add("defense", bd.defense, base.defMulti)
    add("critRate", bd.critRatePct, base.critRate * 100)
    add("critDmg", bd.critDmgPct, base.critDmg * 100)
    add("critExpect", bd.critExpect, 1 + base.critRate * (base.critDmg - 1))
    add("multBoost", bd.multBoost, base.customMult)
    add(
        "multAdd",
        bd.multAddPct,
        group.entries.reduce((sum, e) => sum + (e.extraRatio || 0), 0),
    )
    if (skill.scaleStat === "atk" || !skill.scaleStat) {
        add("attack", bd.attack, base.totalAtk)
    }
    return out
}

export const compareParity = (
    code: string,
    coconut: CoconutMeasureResult,
    golden: WuwaMeasureResult,
): ParityComparison => {
    const grouped = groupCoconutEntries(coconut)
    const entries: AlignedEntry[] = []
    const missingWuwa: string[] = []
    const missingCoconut: string[] = []

    for (const member of golden.members ?? []) {
        const skills = flattenWuwaSkills(member).filter(({ skill }) =>
            skill.damage > 0
        )
        const groups = grouped.get(member.name) ?? []
        // 对齐键：目录 id 优先，重复出现（多轮）按出现序号区分；没有目录 id 才退回名字。
        // 不能按数组顺序对齐——本体/额外、别名、轮次都会让顺序错位。
        const groupQueues = new Map<string, CoconutGroup[]>()
        const groupOccurrence = new Map<string, number>()
        for (const group of groups) {
            const base = group.catalogId
                ? "c:" + group.catalogId
                : "n:" + group.name
            const n = groupOccurrence.get(base) ?? 0
            groupOccurrence.set(base, n + 1)
            const key = base + "#" + n
            const queue = groupQueues.get(key) ?? []
            queue.push(group)
            groupQueues.set(key, queue)
        }
        const skillOccurrence = new Map<string, number>()
        const usedGroups = new Set<CoconutGroup>()
        for (const { skill, roundIndex } of skills) {
            const base = skill.catalogId
                ? "c:" + skill.catalogId
                : "n:" + skill.name
            const n = skillOccurrence.get(base) ?? 0
            skillOccurrence.set(base, n + 1)
            const key = base + "#" + n
            const group = groupQueues.get(key)?.shift() ??
                groups.find((candidate) => !usedGroups.has(candidate))
            if (!group) {
                missingCoconut.push(member.name + "/" + skill.name)
                continue
            }
            usedGroups.add(group)
            const delta = group.total - skill.damage
            entries.push({
                character: member.name,
                wuwaName: skill.name,
                coconutName: group.name,
                wuwaDamage: skill.damage,
                coconutDamage: group.total,
                delta,
                rel: skill.damage ? delta / skill.damage : 0,
                fixed: group.entries[0]?.baseUnit === "固定",
                zones: zonesOf(skill, group),
                coconutEntries: group.entries,
            })
        }
        for (const group of groups) {
            if (!usedGroups.has(group)) {
                missingWuwa.push(member.name + "/" + group.name)
            }
        }
    }

    const specialCoconut = coconut.entries
        .filter((entry) => entry.id.includes("-nd|"))
        .reduce((sum, entry) => sum + entry.totalDamage, 0)
    const totalWuwa = golden.teamTotal ?? 0
    const totalCoconut = coconut.total
    return {
        code,
        totalWuwa,
        totalCoconut,
        totalDelta: totalCoconut - totalWuwa,
        totalRel: totalWuwa ? (totalCoconut - totalWuwa) / totalWuwa : 0,
        entries,
        specialWuwa: golden.specialTotal ?? 0,
        specialCoconut,
        specialRel: (golden.specialTotal ?? 0)
            ? (specialCoconut - (golden.specialTotal ?? 0)) /
                (golden.specialTotal ?? 1)
            : 0,
        missingWuwa,
        missingCoconut,
    }
}
