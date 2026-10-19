/**
 * 鸣算屋（wuwacalc.cn）↔ 椰果工坊（wuwa-afyg-share）的接口数据结构。
 *
 * 本模块只有类型声明，不含任何逻辑；列表端点见 `convert-project-list.ts`，
 * 下载端点见 `convert-project-download.ts`。
 */

import type { WuwaCalcProjectSnapshot } from "./convert-project/types.ts"

// ── 上游（鸣算屋）────────────────────────────────────────────────────────────

/**
 * 鸣算屋服务端算出的**单个站位**摘要。
 *
 * @desc 只有 `summary._serverComputed === true` 且服务端重算过轴伤的方案才带 `summary.members`
 * （实测约 1/5 的条目），它是列表接口里唯一带武器**名称**的地方；
 * 其余条目只有 `memberWeaponIds`（纯 ID）。注意它**不含**声骸名与套装名。
 */
export interface WuwaCalcSchemeMemberSummary {
    name?: string
    /** 站位序号，与 `memberNames` / `memberConfigs` 对齐（用它而非数组下标） */
    index?: number
    total?: number
    characterId?: string
    weaponId?: string
    /** 武器名，如 `灼霜` */
    weaponName?: string
    refinement?: number
    /** 共鸣链档位，与 `memberConfigs` 的 `n+m` 前半段一致 */
    resonanceUnlocked?: number
    hasTeamImpact?: boolean
    damageTypeSum?: number
    damageTypes?: { type: string; total: number; sharePct: number }[]
}

/** 鸣算屋方案的多档配置变体（`summary.configVariants[]`） */
export interface WuwaCalcSchemeConfigVariant {
    /** 形如 `0+1|0+1|0+1`（各站位链+精炼用 `|` 连接） */
    key?: string
    /** 展示名，形如 `0+1 · 0+1 · 0+1` */
    label?: string
    teamConfig?: string
    teamDps?: number
    teamTotal?: number
    axisDuration?: number
    /** 各站位的链+精炼，与 `memberNames` 同序 */
    memberConfigs?: string[]
}

/** 鸣算屋方案摘要（列表接口 `summary` 字段） */
export interface WuwaCalcSchemeSummary {
    teamDps?: number
    teamTotal?: number
    axisKind?: string
    entryType?: string
    difficulty?: string
    performance?: string
    monsterRes?: number
    monsterLevel?: number
    teamConfig?: string
    axisDuration?: number
    /** 队伍各站位的角色名，与下游 `teamPreview.names` 对应 */
    memberNames?: string[]
    /** 队伍各站位的配置，形如 `3+1`（共鸣链+武器精炼） */
    memberConfigs?: string[]
    characterIds?: string[]
    /** 队伍各站位的武器 ID，与 `memberNames` 同序；列表接口**只有 ID**，没有名称 */
    memberWeaponIds?: string[]
    /** 服务端重算过轴伤时才有的逐站位摘要，是列表接口里唯一的武器名称来源 */
    members?: WuwaCalcSchemeMemberSummary[] | null
    snapshotsFresh?: boolean
    configVariants?: WuwaCalcSchemeConfigVariant[] | null
}

/** 鸣算屋方案作者信息 */
export interface WuwaCalcSchemeProfile {
    id?: string
    display_name?: string | null
    avatar_data_url?: string | null
}

/** 鸣算屋公开方案列表项 */
export interface WuwaCalcSchemeListItem {
    id?: string | null
    share_code?: string | null
    /** @desc 同 `share_code` 的另一种拼写，兼容早期抓取结果 */
    shareCode?: string | null
    title?: string | null
    description?: string | null
    tags?: string[] | null
    summary?: WuwaCalcSchemeSummary | null
    version?: number | null
    fork_count?: number | null
    like_count?: number | null
    refVideoUrl?: string | null
    refVideoMetaUrl?: string | null
    updated_at?: string | null
    approved_at?: string | null
    avg_score?: number | null
    review_count?: number | null
    profiles?: WuwaCalcSchemeProfile | null
}

/** 鸣算屋公开方案列表响应体（`GET /api/public-schemes`） */
export interface WuwaCalcSchemeListResponse {
    items?: WuwaCalcSchemeListItem[] | null
    total?: number | null
    page?: number | null
    pageSize?: number | null
    stale?: boolean
    updatedAt?: number | string
}

/**
 * 鸣算屋方案详情（`GET /api/schemes/{share_code}`）：列表项字段 + 审核状态 + 完整快照。
 *
 * `payload.data` 就是「下载」的真正内容（单条实测可达 MB 级），是工程转换的总输入；
 * 四阶段分别怎么映射见 `convert-project/`。
 */
export interface WuwaCalcSchemeDetail extends WuwaCalcSchemeListItem {
    /** 审核状态，公开库为 `"approved"` */
    status?: string | null
    payload?: WuwaCalcProjectSnapshot | null
}

// ── 下游（椰果工坊）──────────────────────────────────────────────────────────

/** 队伍预览中的单个站位 */
export interface CoconutTeamPreviewSlot {
    character: string | null
    weapon: string | null
    triggerSets: { name: string; pieces: number }[]
    echoes: { name: string | null; cost: number }[]
    chain: number
    refinement: number
}

/** 队伍预览（工坊列表响应中的 `teamPreview`） */
export interface CoconutTeamPreview {
    names: string[]
    slots: CoconutTeamPreviewSlot[]
    locked: {
        team: boolean
        config: boolean
        timeline: boolean
        calculation: boolean
    }
    version: string | null
}

/** 工坊公开工程列表项 */
export interface CoconutProject {
    id: string
    code: string
    title: string
    authorName: string
    tags: string[]
    gameVersion: string | null
    teamPreview: CoconutTeamPreview | null
    downloads: number
    createdAt: string
}

/** 工坊公开工程列表响应体（`GET /api/public/projects`） */
export interface CoconutProjectListResponse {
    projects: CoconutProject[]
    total: number
    page: number
    perPage: number
}

// ── 转换层的中间结构 ─────────────────────────────────────────────────────────

/** 查询串归一化的结果：客户端口径 + 实际发给鸣算屋的查询串 */
export interface WuwaCalcListQuery {
    /** 客户端请求的页码（≥1） */
    page: number
    /** 客户端请求的每页条数（1..50） */
    perPage: number
    /** 实际发给鸣算屋的 `pageSize`（受上游上限约束，见 `WUWACALC_LIST_MAX_PAGE_SIZE`） */
    pageSize: number
    /** 发给鸣算屋的查询串 */
    search: URLSearchParams
}
