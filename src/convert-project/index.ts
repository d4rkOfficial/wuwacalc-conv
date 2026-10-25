/**
 * 工程转换汇总器：把四个阶段分别转换后合成椰果工程文件
 * `{ version, exportedAt, project }`。
 *
 * 四个阶段各自独立（见同目录 `team.ts` / `timeline.ts` / `calculation.ts` / `config.ts`），
 * 本文件只负责编排与拼装，不含任何字段级映射规则。
 *
 * | 阶段 | 产物落点 |
 * | --- | --- |
 * | 队伍配置 | `project.team` + `lockedTeamKey` / `lockedTeamNames` / `conditionProfile`（`phases.team.data` 恒为 `null`） |
 * | 排轴 | `phases.timeline` |
 * | 拉表 | `phases.calculation` + `project.buffs` |
 * | 词条/环境配置 | `phases.config` |
 *
 * 注意：工具箱导入侧有 **1MB** 上限（`safeJsonParse`），因此这里只落转换结果，
 * 不夹带鸣算屋的原始快照。
 */

import { clamp, optionalString, toEpochMillis } from "../utils.ts"
import { convertCalculationPhase } from "./calculation.ts"
import { convertConfigPhase } from "./config.ts"
import { convertTeamPhase } from "./team.ts"
import { convertTimelinePhase } from "./timeline.ts"
import { EMPTY_TABLES, type ProjectTables } from "./tables.ts"
import {
    COCONUT_PROJECT_FILE_VERSION,
    COCONUT_PROJECT_VERSION,
    type CoconutProjectFile,
    type WuwaCalcProjectPayload,
    type WuwaCalcProjectSnapshot,
} from "./types.ts"

/** 详情摘要里的单档配置（只关心各站位的链 + 武器精炼） */
export interface ConvertProjectConfigVariant {
    memberConfigs?: string[] | null
}

/** 汇总器的输入：鸣算屋方案详情里跟工程转换相关的部分 */
export interface ConvertProjectInput {
    id?: string | null
    title?: string | null
    share_code?: string | null
    approved_at?: string | null
    updated_at?: string | null
    /** 列表 / 详情摘要：下载时据此挑「全队 0+1」变体 */
    summary?: {
        configVariants?: ConvertProjectConfigVariant[] | null
    } | null
    payload?: WuwaCalcProjectSnapshot | null
}

export interface ConvertProjectOptions {
    /** 信封产出时间（毫秒）；缺省取当前时间 */
    exportedAt?: number
    /** 工程 id；缺省沿用鸣算屋方案 id，再退到分享码 */
    projectId?: string
}

/** 解析 `0+1` 形式的站位配置（共鸣链 + 武器精炼） */
const parseMemberConfig = (
    raw: unknown,
): { chain: number; refinement: number } | null => {
    const matched = /^(\d+)\s*\+\s*(\d+)$/.exec(String(raw ?? "").trim())
    if (!matched) return null
    return { chain: Number(matched[1]), refinement: Number(matched[2]) }
}

/**
 * 下载时优先转成「全队 0+1」那一档工程。
 *
 * 上游详情里的 `payload.data.members[]` 是**当前主配置**（例如全员 6+5），
 * 而摘要的 `summary.configVariants[]` 才列出同一方案的其他档位。
 * 上游自己按变体导入时也是先改写每个成员的 `resonanceUnlocked` 与
 * `weaponSelection.refinement`，再走正常导入流程（`public-db.js` 的 `importShare()`）——
 * 这里做同样的事：链 Buff 会按新链档重新过滤，武器 / 套装面板仍按 payload 走。
 *
 * 只改副本，不动传入的详情（下载缓存会复用 detail）。
 */
const applyZeroOneConfigVariant = (
    payload: WuwaCalcProjectPayload,
    summary: ConvertProjectInput["summary"],
): WuwaCalcProjectPayload => {
    const members = payload.members ?? []
    if (!members.length) return payload

    const variant = (summary?.configVariants ?? []).find((candidate) => {
        const configs = candidate?.memberConfigs
        if (!Array.isArray(configs) || configs.length < members.length) {
            return false
        }
        return configs.slice(0, members.length).every((raw) => {
            const parsed = parseMemberConfig(raw)
            return parsed?.chain === 0 && parsed.refinement === 1
        })
    })
    const configs = variant?.memberConfigs
    if (!variant || !configs) return payload

    return {
        ...payload,
        members: members.map((member, index) => {
            const parsed = parseMemberConfig(configs[index])
            if (!parsed) return member
            return {
                ...member,
                resonanceUnlocked: clamp(parsed.chain, 0, 6),
                weaponSelection: {
                    ...member.weaponSelection,
                    refinement: clamp(parsed.refinement, 1, 5),
                },
            }
        }),
    }
}

/**
 * 把鸣算屋方案详情合成椰果工程文件。
 *
 * 四个阶段各自独立转换，编排顺序上**排轴先于拉表**：
 * 拉表的技能限定要靠排轴派生出的伤害条目来做绑定（`damageEntryBuffSetIds`）。
 *
 * @param detail 鸣算屋方案详情（至少要带 `payload.data`）
 * @param tables 运行时名称表（武器 / 套装）；缺省用空表，此时相关字段留空
 * @param options 信封产出时间与工程 id
 */
export const convertWuwaCalcProjectToCoconutProjectFile = (
    detail: ConvertProjectInput,
    tables: ProjectTables = EMPTY_TABLES,
    options: ConvertProjectOptions = {},
): CoconutProjectFile => {
    const payload = applyZeroOneConfigVariant(
        detail.payload?.data ?? {},
        detail.summary,
    )

    const team = convertTeamPhase(payload, tables)
    const timeline = convertTimelinePhase(payload, tables)
    const calculation = convertCalculationPhase(
        payload,
        timeline.entries,
        timeline.entryState,
        tables,
    )
    const config = convertConfigPhase(payload)

    return {
        version: COCONUT_PROJECT_FILE_VERSION,
        exportedAt: options.exportedAt ?? Date.now(),
        project: {
            id: options.projectId ??
                optionalString(detail.id) ??
                optionalString(detail.share_code) ??
                "",
            name: optionalString(detail.title) ??
                optionalString(detail.payload?.meta?.name) ??
                "",
            createdAt: toEpochMillis(detail.approved_at ?? detail.updated_at),
            version: COCONUT_PROJECT_VERSION,
            team: team.slots,
            lockedTeamKey: team.lockedTeamKey,
            lockedTeamNames: team.lockedTeamNames,
            conditionProfile: team.conditionProfile,
            customSkillHits: {},
            buffs: calculation.buffs,
            phases: {
                // 队伍配置走 project.team，phases.team 只带锁定态（与工具箱 buildExportFile 一致）
                team: { locked: true, data: null },
                timeline: timeline.phase,
                calculation: calculation.phase,
                config,
            },
            analysis: { timings: [] },
        },
    }
}
