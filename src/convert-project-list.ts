/**
 * 端点：`GET /api/public/projects` —— 工坊「工程广场」列表。
 *
 * 上游：鸣算屋 `GET /api/public-schemes?page&pageSize&sort&q…`
 *
 * | 上游 | 下游 |
 * | --- | --- |
 * | `GET /api/public-schemes?page&pageSize&sort&q…` | `GET /api/public/projects?page&perPage&sort&q…` |
 *
 * ## 字段对齐说明
 *
 * 下游（椰果工具箱 / 工坊）实际消费的列表字段只有：
 * `id` `code` `title` `authorName` `tags` `gameVersion` `downloads` `teamPreview.names` `createdAt`。
 * 其中 `teamPreview.names` 是社区工程卡片渲染角色角标与头像的唯一来源。
 *
 * `teamPreview.slots` 是工坊列表响应里的附加预览，两侧口径如下：
 *
 * | 字段 | 列表接口可得性 |
 * | --- | --- |
 * | `character` | ✅ `summary.memberNames` |
 * | `chain` / `refinement` | ✅ `summary.memberConfigs`（`"3+1"`） |
 * | `weapon` | ⚠️ 仅 `summary.members[].weaponName`（服务端重算过轴伤的条目才有）；其余条目只有 `memberWeaponIds` 纯 ID |
 * | `echoes` | ❌ 列表接口完全没有，需方案详情接口 `payload.data.members[].echoConfig.slots[].name` |
 * | `triggerSets` | ❌ 同上，需 `echoConfig.setLoadout[].setId` 再配合套装 ID→名称表 |
 */

import { errorResponse, fetchUpstream, json, LIST_TIMEOUT_MS } from "./http.ts"
import type { Bindings } from "./http.ts"
import type {
    CoconutProject,
    CoconutProjectListResponse,
    CoconutTeamPreviewSlot,
    WuwaCalcListQuery,
    WuwaCalcSchemeListItem,
    WuwaCalcSchemeListResponse,
    WuwaCalcSchemeSummary,
} from "./types.ts"
import { clamp, optionalString, toInt } from "./utils.ts"

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 工坊列表默认每页条数（工具箱前端固定 12） */
export const COCONUT_LIST_DEFAULT_PER_PAGE = 12
/** 工坊列表每页条数上限（工坊服务端实测超过 50 也只返回 50） */
export const COCONUT_LIST_MAX_PER_PAGE = 50
/** 鸣算屋列表 `pageSize` 上限：实测 30 可用、31 起返回 400「无效页码」 */
export const WUWACALC_LIST_MAX_PAGE_SIZE = 30

/** 列表结果的浏览器/CDN 缓存时长（秒），与工坊前端 30s 缓存对齐 */
const LIST_CACHE_SECONDS = 30

/** 工坊排序 → 鸣算屋排序（`heat`/`hot` 无对应口径，取 DPS 降序近似） */
const SORT_MAP: Record<string, "time" | "dps" | "total"> = {
    newest: "time",
    time: "time",
    hot: "dps",
    heat: "dps",
    dps: "dps",
    total: "total",
}

/** 仅鸣算屋支持的筛选条件，原样透传（工坊自身参数不在此列） */
const PASS_THROUGH_KEYS = [
    "zone",
    "kind",
    "characters",
    "difficulty",
    "performance",
    "configs",
    "configAll",
    "match",
] as const

// ── 查询串转换 ────────────────────────────────────────────────────────────────

/**
 * 把工坊 `/api/public/projects` 的查询串归一化为鸣算屋 `/api/public-schemes` 的查询串。
 *
 * - `perPage` 夹在 `1..50`，再按上游上限换算成 `pageSize`；
 * - `sort`：`newest`→`time`、`hot`/`heat`→`dps`，其余回落 `time`；
 * - `excludeAnon` 在本上游没有对应概念，直接忽略。
 */
export const buildWuwaCalcListQuery = (
    params: URLSearchParams,
): WuwaCalcListQuery => {
    const page = Math.max(1, toInt(params.get("page"), 1))
    const perPage = clamp(
        toInt(params.get("perPage"), COCONUT_LIST_DEFAULT_PER_PAGE),
        1,
        COCONUT_LIST_MAX_PER_PAGE,
    )
    const pageSize = Math.min(perPage, WUWACALC_LIST_MAX_PAGE_SIZE)

    const search = new URLSearchParams()
    search.set("page", String(page))
    search.set("pageSize", String(pageSize))
    search.set(
        "sort",
        SORT_MAP[optionalString(params.get("sort"))?.toLowerCase() ?? ""] ??
            "time",
    )

    const q = optionalString(params.get("q"))
    if (q) search.set("q", q)
    for (const key of PASS_THROUGH_KEYS) {
        const value = optionalString(params.get(key))
        if (value) search.set(key, value)
    }

    return { page, perPage, pageSize, search }
}

// ── 响应体转换 ────────────────────────────────────────────────────────────────

/** 解析 `3+1` 形式的站位配置（共鸣链 + 武器精炼），无法解析时归零 */
const parseMemberConfig = (
    raw: unknown,
): { chain: number; refinement: number } => {
    const matched = /^(\d+)\s*\+\s*(\d+)$/.exec(String(raw ?? "").trim())
    if (!matched) return { chain: 0, refinement: 0 }
    return { chain: Number(matched[1]), refinement: Number(matched[2]) }
}

/** 上游时间统一成 ISO 字符串；缺失或非法时回落到纪元起点（下游要求必填字符串） */
const toIsoString = (value: unknown): string => {
    if (typeof value === "string" && value) {
        const date = new Date(value)
        if (!Number.isNaN(date.getTime())) return date.toISOString()
        return value
    }
    return new Date(0).toISOString()
}

/** 工坊列表预览里每个站位固定 3 个声骸槽（与工坊响应一致） */
const buildEmptyEchoSlots = () =>
    Array.from({ length: 3 }, () => ({ name: null, cost: 0 }))

/**
 * 构造 `teamPreview.slots`。
 *
 * 三路取数：
 * - `character` / `chain` / `refinement` 来自 `memberNames` / `memberConfigs`，**所有**条目都有；
 * - `weapon` 只有服务端重算过轴伤的条目才有（`summary.members[].weaponName`），
 *   其余条目列表接口只给 `memberWeaponIds`（纯 ID），没有 ID→名称映射，只能置空；
 * - 声骸名与套装名**列表接口完全没有**（`members[]` 里也没有），只有方案详情接口的
 *   `payload.data.members[].echoConfig` 才有，故保持空值（详见文件头说明）。
 */
const buildTeamPreviewSlots = (
    summary: WuwaCalcSchemeSummary,
): CoconutTeamPreviewSlot[] => {
    const names = summary.memberNames ?? []
    const configs = summary.memberConfigs ?? []

    // members 自带 index，按 index 对齐而不是数组下标
    const weaponNameByIndex = new Map<number, string>()
    for (const [position, member] of (summary.members ?? []).entries()) {
        const weaponName = optionalString(member?.weaponName)
        if (weaponName) {
            weaponNameByIndex.set(toInt(member?.index, position), weaponName)
        }
    }

    return names.map((name, index) => {
        const { chain, refinement } = parseMemberConfig(configs[index])
        return {
            character: optionalString(name) ?? null,
            weapon: weaponNameByIndex.get(index) ?? null,
            triggerSets: [],
            echoes: buildEmptyEchoSlots(),
            chain,
            refinement,
        }
    })
}

/** 转换单个方案列表项 */
export const convertWuwaCalcProjectToCoconutProject = (
    item: WuwaCalcSchemeListItem,
): CoconutProject => {
    const code = optionalString(item.share_code) ??
        optionalString(item.shareCode) ?? ""
    const summary = item.summary ?? {}
    const names = (summary.memberNames ?? []).filter((name): name is string =>
        !!optionalString(name)
    )

    return {
        id: optionalString(item.id) ?? code,
        code,
        title: optionalString(item.title) ?? "",
        authorName: optionalString(item.profiles?.display_name) ?? "匿名",
        tags: (item.tags ?? []).filter((tag): tag is string =>
            typeof tag === "string" && !!tag.trim()
        ),
        // 鸣算屋不下发游戏版本号
        gameVersion: null,
        teamPreview: {
            names,
            slots: buildTeamPreviewSlots(summary),
            // 社区方案对导入方是只读快照，四个阶段一律锁定
            locked: {
                team: true,
                config: true,
                timeline: true,
                calculation: true,
            },
            // 工坊预览结构版本，转换产物没有对应版本号
            version: null,
        },
        downloads: Math.max(0, toInt(item.fork_count, 0)),
        createdAt: toIsoString(item.approved_at ?? item.updated_at),
    }
}

/**
 * 把鸣算屋 `/api/public-schemes` 的响应体转换成工坊 `/api/public/projects` 的响应体。
 *
 * @param body 上游响应体（`items` / `total` / `page` / `pageSize`）
 * @param options 客户端实际请求的 `page` / `perPage`；分页拼装时可能一页对应上游多页，
 *                此时用它覆盖回上游的 `page` / `pageSize`
 */
export const convertWuwaCalcProjectListToCoconutProjectList = (
    body: WuwaCalcSchemeListResponse | null | undefined,
    options: {
        page?: number
        perPage?: number
        items?: WuwaCalcSchemeListItem[]
    } = {},
): CoconutProjectListResponse => {
    const items = options.items ??
        (Array.isArray(body?.items) ? body.items! : [])
    const projects = items.map(convertWuwaCalcProjectToCoconutProject)

    return {
        projects,
        total: Math.max(0, toInt(body?.total, projects.length)),
        page: Math.max(1, options.page ?? toInt(body?.page, 1)),
        perPage: Math.max(
            1,
            options.perPage ??
                toInt(
                    body?.pageSize,
                    projects.length || COCONUT_LIST_DEFAULT_PER_PAGE,
                ),
        ),
    }
}

// ── 端点 ──────────────────────────────────────────────────────────────────────

/**
 * 转发到鸣算屋 `/api/public-schemes` 并转换响应体。
 *
 * 工坊单页最多 50 条，而鸣算屋 `pageSize` 上限为 30，因此这里按需拉取上游多页再拼接切片，
 * 保证「客户端第 N 页」的语义正确。
 */
export const handleListProjects = async (
    url: URL,
    env: Bindings,
): Promise<Response> => {
    const { page, perPage, pageSize, search } = buildWuwaCalcListQuery(
        url.searchParams,
    )

    // 客户端要的区间 [start, start + perPage) 落在上游第几页、需要几页
    const start = (page - 1) * perPage
    const firstUpstreamPage = Math.floor(start / pageSize) + 1
    const offsetInFirstPage = start % pageSize
    const pagesNeeded = Math.ceil((offsetInFirstPage + perPage) / pageSize)

    const collected: WuwaCalcSchemeListItem[] = []
    let total = 0
    let upstreamBody: WuwaCalcSchemeListResponse = {}

    for (let i = 0; i < pagesNeeded; i++) {
        const params = new URLSearchParams(search)
        params.set("page", String(firstUpstreamPage + i))

        const upstream = await fetchUpstream(
            env,
            `/api/public-schemes?${params}`,
            LIST_TIMEOUT_MS,
        )
        if (!upstream.ok) return upstream.response

        let body: WuwaCalcSchemeListResponse
        try {
            body = await upstream.res.json() as WuwaCalcSchemeListResponse
        } catch {
            return errorResponse(502, "上游返回内容不是合法 JSON")
        }

        if (i === 0) {
            upstreamBody = body
            total = Math.max(0, Number(body?.total) || 0)
        }

        const items = Array.isArray(body?.items) ? body.items : []
        collected.push(...items)
        // 不满一页说明上游已经到底，不必再翻
        if (items.length < pageSize) break
    }

    const pageItems = collected.slice(
        offsetInFirstPage,
        offsetInFirstPage + perPage,
    )

    return json(
        convertWuwaCalcProjectListToCoconutProjectList(
            { ...upstreamBody, total },
            { page, perPage, items: pageItems },
        ),
        200,
        { "cache-control": `public, max-age=${LIST_CACHE_SECONDS}` },
    )
}
