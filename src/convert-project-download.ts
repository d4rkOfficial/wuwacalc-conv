/**
 * 端点：`GET /share/{code}/download` —— 工坊「下载并导入」。
 *
 * 上游：鸣算屋 `GET /api/schemes/{share_code}`（单条可达 MB 级、实测 27~66s，且偶发 502/504）。
 *
 * 契约对齐（见 `docs/api-coconut.md` 最小集 & 工具箱 `share.svelte.ts`）：
 * 工具箱直接 `fetch(`${工坊地址}/share/${code}/download`)`，无查询参数，
 * 取 `res.text()` 交给 `parseProjectFile()` 导入；因此这里必须回**工程 JSON 附件**。
 *
 * 上游不稳，所以整条链路有三层保护：
 * 1. **命中缓存**（{@link PROJECT_CACHE_FRESH_MS} 内）直接返回，不碰上游；
 * 2. **快速失败重试**：只重试「秒级失败」，已经耗掉大半预算时不再重试（免得等待翻倍）；
 * 3. **兜底旧数据**：上游最终还是失败时，若缓存里有旧副本就返回它，把 502/504 变成一次可用下载。
 *
 * 结构转换本身全部委托给 `convert-project/index.ts`，本文件只管路由、抓取、缓存与响应头。
 */

import type { WuwaCalcSchemeDetail } from "./types.ts"
import { convertWuwaCalcProjectToCoconutProjectFile } from "./convert-project/index.ts"
import {
    isProjectTablesEmpty,
    loadProjectTables,
} from "./convert-project/tables.ts"
import type { CoconutProjectFile } from "./convert-project/types.ts"
import {
    DETAIL_TIMEOUT_MS,
    errorResponse,
    fetchUpstream,
    json,
    readUpstreamJson,
} from "./http.ts"
import type { Bindings } from "./http.ts"
import { PROJECT_CACHE_FRESH_MS, projectCache } from "./project-cache.ts"

/** 分享码白名单：只放行 URL 安全字符，防止拼进上游路径时越界 */
export const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** 工坊下载路由：`/share/{code}/download` */
export const SHARE_DOWNLOAD_PATTERN = /^\/share\/([^/]+)\/download$/

/** 总尝试次数（首次 + 一次重试） */
export const DOWNLOAD_ATTEMPTS = 2

/** 单次尝试超过这个时长就不再重试，避免把等待时间翻倍 */
export const RETRY_WITHIN_MS = 15_000

/** 重试前的间隔，与鸣算屋前端的 400ms 对齐 */
const RETRY_DELAY_MS = 400

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 文件名里不允许出现的字符（含 Unicode 控制字符），统一替换成下划线 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu

/** 下载文件名：优先用方案标题，标题缺失时回落到分享码 */
export const downloadFilename = (title: unknown, code: string): string => {
    const raw = typeof title === "string" ? title.trim() : ""
    const base = (raw || code).replace(UNSAFE_FILENAME_CHARS, "_").slice(0, 80)
    return `${base}.json`
}

/** RFC 5987 ext-value 编码：`encodeURIComponent` 不会转义 `'()*`，需补上 */
const encodeFilenameValue = (value: string): string =>
    encodeURIComponent(value).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    )

/** 附件响应：ASCII 回退名 + RFC 5987 的 UTF-8 名 */
const attachmentResponse = (
    body: unknown,
    code: string,
    title: unknown,
    extraHeaders: Record<string, string> = {},
) => json(body, 200, {
    "content-disposition":
        `attachment; filename="${code}.json"; filename*=UTF-8''${
            encodeFilenameValue(downloadFilename(title, code))
        }`,
    "cache-control": "no-store",
    ...extraHeaders,
})

/** 抓一次上游并转换；成功返回工程文件，失败返回可透传的错误响应 */
const fetchAndConvert = async (
    code: string,
    env: Bindings,
): Promise<
    | {
        ok: true
        file: CoconutProjectFile
        title: string
        /** 名称表没拉到（武器 / 套装名会缺），这类产物不进缓存 */
        degraded: boolean
    }
    | {
        ok: false
        response: Response
    }
> => {
    const upstream = await fetchUpstream(
        env,
        `/api/schemes/${encodeURIComponent(code)}`,
        DETAIL_TIMEOUT_MS,
    )
    if (!upstream.ok) return { ok: false, response: upstream.response }

    const parsed = await readUpstreamJson<WuwaCalcSchemeDetail>(upstream.res)
    if (!parsed.ok) return { ok: false, response: parsed.response }

    // 名称表（武器 / 套装 / 声骸）运行时拉取并缓存；拉不到按「名称缺失」降级
    const tables = await loadProjectTables(env)
    return {
        ok: true,
        file: convertWuwaCalcProjectToCoconutProjectFile(parsed.data, tables),
        title: parsed.data?.title ?? "",
        degraded: isProjectTablesEmpty(tables),
    }
}

export const handleDownloadProject = async (
    code: string,
    env: Bindings,
    /** 当前请求的 origin；缓存键必须拼在它上面（Cache API 按 zone 生效） */
    baseUrl: string,
): Promise<Response> => {
    if (!SHARE_CODE_PATTERN.test(code)) {
        return errorResponse(400, "分享码格式不合法")
    }

    const cache = projectCache()
    const cached = await cache.get(code, baseUrl)
    // 降级产物（没有名称表）不算新鲜：这次请求重新转一遍，别把「武器名缺了」钉住
    if (
        cached && !cached.degraded &&
        Date.now() - cached.convertedAt < PROJECT_CACHE_FRESH_MS
    ) {
        return attachmentResponse(cached.file, code, cached.title, {
            "x-project-cache": "hit",
        })
    }

    let lastError: Response | null = null
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
        const startedAt = Date.now()
        const result = await fetchAndConvert(code, env)
        if (result.ok) {
            // 名称表缺失时**不写缓存**：产物本身可用，但这次抖动不该被固化
            if (!result.degraded) {
                await cache.put(code, baseUrl, {
                    file: result.file,
                    title: result.title,
                    convertedAt: Date.now(),
                })
            }
            return attachmentResponse(result.file, code, result.title, {
                "x-project-cache": cached ? "refresh" : "miss",
                ...(result.degraded ? { "x-project-tables": "empty" } : {}),
            })
        }
        lastError = result.response

        // 慢失败（超时/大响应读断）重试只会让等待翻倍，直接放弃重试
        if (Date.now() - startedAt > RETRY_WITHIN_MS) break
        if (attempt < DOWNLOAD_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }

    // 上游最终还是失败：有旧副本就兜底，把 502/504 变成一次可用下载
    if (cached) {
        return attachmentResponse(cached.file, code, cached.title, {
            "x-project-cache": "stale",
            "x-project-stale-since": new Date(cached.convertedAt).toISOString(),
        })
    }

    return lastError ?? errorResponse(502, "上游访问失败")
}
