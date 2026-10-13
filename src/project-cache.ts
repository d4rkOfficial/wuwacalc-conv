/**
 * 下载产物的边缘缓存。
 *
 * 上游详情接口单条 ~1MB、实测 27~66s 且偶发 502/504，**每次下载都现拉既慢又容易失败**。
 * 这里把**转换后的工程文件**（约几 KB）按分享码缓存，解决两件事：
 *
 * 1. **新鲜期内直接命中** —— 不碰上游，下载从「几十秒」变成「几十毫秒」；
 * 2. **过期后仍保留，作为上游失败时的兜底** —— 把 502/504 变成「给一份稍旧的」，
 *    响应带 `x-project-cache: stale` 便于排查。
 *
 * 后端默认用 Cloudflare Cache API（`caches.default`，零配置）；
 * 运行时没有该 API（如 Deno 单测）时降级为 no-op，可用 {@link setProjectCache} 注入假实现。
 */

import type { CoconutProjectFile } from "./convert-project/types.ts"

export interface CachedProject {
    file: CoconutProjectFile
    title: string
    /** 转换完成时刻（毫秒），用来判断新鲜度 */
    convertedAt: number
    /**
     * 这次转换**没拿到名称表**（武器 / 套装名缺失，见 `tables.ts` 的
     * `isProjectTablesEmpty`）。降级产物不算「新鲜」：下次请求要重新转一遍，
     * 免得一次上游抖动把「没有武器名」钉死一整个缓存周期。
     * 老缓存条目没有这个字段，按 `undefined`（= 正常）处理。
     */
    degraded?: boolean
}

export interface ProjectCache {
    /** @param base 用来拼缓存键的**同源**地址（Cloudflare Cache API 按 zone 作用） */
    get(code: string, base: string): Promise<CachedProject | null>
    put(code: string, base: string, entry: CachedProject): Promise<void>
}

/** 新鲜期：这段时间内直接命中，不去上游 */
export const PROJECT_CACHE_FRESH_MS = 10 * 60 * 1000

/** 保留期：过期后仍留着，只在上游失败时兜底 */
export const PROJECT_CACHE_KEEP_MS = 24 * 60 * 60 * 1000

/**
 * 缓存键路径。**必须拼在 Worker 自己的 origin 上**：
 * Cloudflare 的 Cache API 只在同一 zone 内生效，拿外部域名当键 `put()` 会被拒。
 */
const CACHE_KEY_PATH = "/__wuwacalc-conv/project/"

const cacheKeyOf = (code: string, base: string): string =>
    new URL(CACHE_KEY_PATH + encodeURIComponent(code), base).toString()

const hasCacheApi = (): boolean =>
    typeof caches !== "undefined" &&
    typeof caches.default?.match === "function"

/** 默认后端：Cloudflare Cache API */
const edgeCache: ProjectCache = {
    async get(code, base) {
        if (!hasCacheApi()) return null
        try {
            const hit = await caches.default.match(cacheKeyOf(code, base))
            if (!hit) return null
            return await hit.json() as CachedProject
        } catch {
            return null
        }
    },
    async put(code, base, entry) {
        if (!hasCacheApi()) return
        try {
            await caches.default.put(
                cacheKeyOf(code, base),
                new Response(JSON.stringify(entry), {
                    headers: {
                        "content-type": "application/json; charset=utf-8",
                        "cache-control": `max-age=${
                            Math.floor(PROJECT_CACHE_KEEP_MS / 1000)
                        }`,
                    },
                }),
            )
        } catch {
            // 缓存写失败不影响下载
        }
    },
}

let backend: ProjectCache = edgeCache

export const projectCache = (): ProjectCache => backend

/** 仅测试用：替换缓存后端 */
export const setProjectCache = (next: ProjectCache): void => {
    backend = next
}

/** 仅测试用：恢复默认的 Cloudflare Cache API 后端 */
export const resetProjectCache = (): void => {
    backend = edgeCache
}
