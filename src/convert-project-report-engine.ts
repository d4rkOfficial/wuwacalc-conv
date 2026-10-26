/**
 * 报告里的「双引擎」对比：鸣算屋快照里保存的结算结果 vs 转换后在服务端重跑的椰果引擎。
 *
 * 这一层只做对齐和展示，不参与转换。对齐键与差分测试保持一致：
 * 目录 id + 出现序号；椰果同一个伤害块的「本体 +（额外）+ 多 Hit」合并成一条。
 */

import {
    type AlignedEntry,
    compareParity,
    type ZoneDiff,
} from "../engines/compare.ts"
import type { CoconutMeasureResult } from "../engines/coconut/measure.ts"
import type { WuwaCalcProjectPayload } from "./convert-project/types.ts"

export type ComparisonStatus = "match" | "warn" | "bad"

export interface ReportEngineZone {
    name: string
    wuwa: number
    coconut: number
    delta: number
    rel: number
    status: ComparisonStatus
}

export interface ReportEngineSkill {
    character: string
    wuwaName: string
    coconutName: string
    wuwaDamage: number
    coconutDamage: number
    delta: number
    rel: number
    status: ComparisonStatus
    fixed: boolean
    /** 该技能对应的椰果时间线块；报告条目按它挂对比 */
    blockId: string
    zones: ReportEngineZone[]
}

export interface ReportEngineMember {
    character: string
    wuwa: number
    coconut: number
    delta: number
    rel: number
    status: ComparisonStatus
}

export interface ReportEngineComparison {
    available: boolean
    detailed: boolean
    note: string
    total: { wuwa: number; coconut: number; delta: number; rel: number }
    direct: { wuwa: number; coconut: number; delta: number; rel: number }
    special: { wuwa: number; coconut: number; delta: number; rel: number }
    members: ReportEngineMember[]
    skills: ReportEngineSkill[]
    /** 转换后多出来的伤害块 / 鸣算屋有但转换后找不到的技能 */
    missingWuwa: string[]
    missingCoconut: string[]
    /** 时间线块 id → 技能对比，供逐条目展示 */
    byBlock: Record<string, ReportEngineSkill>
}

interface WuwaSkillRow {
    name: string
    catalogId: string | null
    damage: number
    breakdown: Record<string, number>
    scaleStat?: string
    damageType?: string
}

const num = (value: unknown): number => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

const relOf = (wuwa: number, coconut: number): number =>
    wuwa ? (coconut - wuwa) / Math.abs(wuwa) : (coconut ? Infinity : 0)

const statusOf = (rel: number): ComparisonStatus => {
    if (!Number.isFinite(rel)) return "bad"
    const abs = Math.abs(rel)
    if (abs < 0.001) return "match"
    if (abs < 0.01) return "warn"
    return "bad"
}

const zoneStatusOf = (zone: ZoneDiff): ComparisonStatus => {
    // 工具箱把攻击白值四舍五入到整数，允许 2 点误差；其余乘区仍要求逐位一致。
    if (zone.name === "attack" && Math.abs(zone.delta) <= 2.01) return "match"
    return Math.abs(zone.rel) < 1e-9 ? "match" : statusOf(zone.rel)
}

const toZone = (zone: ZoneDiff): ReportEngineZone => ({
    ...zone,
    status: zoneStatusOf(zone),
})

const flattenWuwaSkills = (member: any): WuwaSkillRow[] => {
    const results = member?.results
    const rows: WuwaSkillRow[] = []
    const push = (skill: any) => {
        const damage = num(skill?._damage ?? skill?.damage)
        if (!(damage > 0)) return
        rows.push({
            name: String(
                skill?.librarySkillName || skill?.name || skill?.displayName ||
                    "",
            ),
            catalogId: skill?.catalogId ? String(skill.catalogId) : null,
            damage,
            breakdown: (skill?._breakdown ?? skill?.breakdown ?? {}) as Record<
                string,
                number
            >,
            ...(skill?.scaleStat ? { scaleStat: String(skill.scaleStat) } : {}),
            ...(skill?.damageType
                ? { damageType: String(skill.damageType) }
                : {}),
        })
    }
    if (Array.isArray(results?.cycles) && results.cycles.length) {
        for (const cycle of results.cycles) {
            for (const step of cycle?.steps ?? cycle?.items ?? []) push(step)
        }
        return rows
    }
    for (const phase of results?.damagePhases ?? []) {
        for (const skill of phase?.skills ?? []) push(skill)
    }
    return rows
}

const wuwaTotals = (
    payload: WuwaCalcProjectPayload,
    meta: Record<string, any> | undefined,
): {
    total: number
    direct: number
    special: number
    members: { character: string; total: number }[]
} => {
    const data = payload as any
    const members = (payload.members ?? []).map((member: any) => ({
        character: String(member?.name ?? ""),
        total: num(member?.results?.total),
    }))
    const special = num(data.specialSkills?.results?.total)
    const memberSum = members.reduce((sum, member) => sum + member.total, 0)
    const total = num(data.teamResults?.total) ||
        num(meta?.summary?.teamTotal) ||
        memberSum + special
    return {
        total,
        direct: Math.max(0, total - special),
        special,
        members,
    }
}

const zoneRows = (entry: AlignedEntry): ReportEngineZone[] =>
    entry.zones.map(toZone)

/**
 * @param payload 转换用的 payload（含鸣算屋保存的 results）
 * @param meta    分享详情 meta（旧快照的 teamTotal 可能只在这里）
 * @param coconut 转换产物跑椰果引擎的结果
 */
export const buildReportEngineComparison = (
    payload: WuwaCalcProjectPayload,
    meta: Record<string, any> | undefined,
    coconut: CoconutMeasureResult,
): ReportEngineComparison => {
    const wuwa = wuwaTotals(payload, meta)
    const coconutSpecial = coconut.entries
        .filter((entry) => entry.id.includes("-nd|"))
        .reduce((sum, entry) => sum + entry.totalDamage, 0)
    const coconutDirect = coconut.total - coconutSpecial
    const totalRel = relOf(wuwa.total, coconut.total)
    const specialRel = relOf(wuwa.special, coconutSpecial)
    const directRel = relOf(wuwa.direct, coconutDirect)

    const coconutByCharacter = new Map<string, number>()
    for (const entry of coconut.entries) {
        if (entry.id.includes("-nd|")) continue
        coconutByCharacter.set(
            entry.character,
            (coconutByCharacter.get(entry.character) ?? 0) + entry.totalDamage,
        )
    }
    // 有些旧快照只有队总、没有逐角色结算（MC-BSZSVE）：把 0 当成真实伤害
    // 会得到「∞%」，比不展示更误导。只比较快照里确实有数的角色。
    const knownMembers = wuwa.members.filter((member) => member.total > 0)
    const names = new Set([
        ...knownMembers.map((member) => member.character),
        ...coconutByCharacter.keys(),
    ])
    const members: ReportEngineMember[] = [...names].map((character) => {
        const w = knownMembers.find((member) =>
            member.character === character
        )?.total ?? 0
        const c = coconutByCharacter.get(character) ?? 0
        const rel = relOf(w, c)
        return {
            character,
            wuwa: w,
            coconut: c,
            delta: c - w,
            rel,
            status: statusOf(rel),
        }
    }).filter((member) => member.wuwa > 0)

    const skills: ReportEngineSkill[] = []
    let missingWuwa: string[] = []
    let missingCoconut: string[] = []
    const detailedRows = (payload.members ?? []).map((member: any) => ({
        name: String(member?.name ?? ""),
        rows: flattenWuwaSkills(member),
    }))
    const detailed = detailedRows.some((member) => member.rows.length > 0)

    if (detailed) {
        const golden = {
            members: detailedRows.map((member) => ({
                name: member.name,
                skills: member.rows.map((row) => ({
                    name: row.name,
                    catalogId: row.catalogId,
                    damage: row.damage,
                    breakdown: row.breakdown,
                    scaleStat: row.scaleStat,
                    damageType: row.damageType,
                })),
            })),
            teamTotal: wuwa.total,
            specialTotal: wuwa.special,
        }
        const comparison = compareParity("report", coconut, golden as any)
        missingWuwa = comparison.missingWuwa
        missingCoconut = comparison.missingCoconut
        for (const entry of comparison.entries) {
            const rel = relOf(entry.wuwaDamage, entry.coconutDamage)
            const blockId = entry.coconutEntries[0]?.sourceTimelineBlockId ?? ""
            skills.push({
                character: entry.character,
                wuwaName: entry.wuwaName,
                coconutName: entry.coconutName,
                wuwaDamage: entry.wuwaDamage,
                coconutDamage: entry.coconutDamage,
                delta: entry.coconutDamage - entry.wuwaDamage,
                rel,
                status: statusOf(rel),
                fixed: entry.fixed,
                blockId,
                zones: zoneRows(entry),
            })
        }
    }

    const byBlock: Record<string, ReportEngineSkill> = {}
    for (const skill of skills) {
        if (skill.blockId && !byBlock[skill.blockId]) {
            byBlock[skill.blockId] = skill
        }
    }

    const notes: string[] = []
    if (!detailed) {
        notes.push(
            "该工程的鸣算屋分享快照只保存了角色合计，没有保存逐技能结算（members[].results 缺少 damagePhases / cycles / _breakdown）。因此只能核对总伤和角色合计，无法逐条对比；这是上游保存分享时没有写入逐技能数据，不是转换器漏算。浏览器本地重算鸣算屋引擎的方案暂缓。",
        )
    }
    if (missingWuwa.length || missingCoconut.length) {
        notes.push(
            `对齐缺项：转换后多出 ${missingWuwa.length} 条，鸣算屋有但转换后找不到 ${missingCoconut.length} 条。`,
        )
    }
    if (wuwa.members.some((member) => member.total <= 0)) {
        notes.push(
            "分享快照里部分角色没有逐角色结算，角色合计只展示快照中有数的成员。",
        )
    }

    return {
        available: wuwa.total > 0,
        detailed,
        note: notes.join(" "),
        total: {
            wuwa: wuwa.total,
            coconut: coconut.total,
            delta: coconut.total - wuwa.total,
            rel: totalRel,
        },
        direct: {
            wuwa: wuwa.direct,
            coconut: coconutDirect,
            delta: coconutDirect - wuwa.direct,
            rel: directRel,
        },
        special: {
            wuwa: wuwa.special,
            coconut: coconutSpecial,
            delta: coconutSpecial - wuwa.special,
            rel: specialRel,
        },
        members,
        skills,
        missingWuwa,
        missingCoconut,
        byBlock,
    }
}
