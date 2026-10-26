/**
 * 浏览器本地重算所需的鸣算屋站点代理。
 *
 * 报告页在隐藏 iframe 里加载一份同源的鸣算屋站点，再调用它的
 * `__WC.importWorkspaceFromData()` / `computeAll()`，这样分享快照里没保存
 * 逐技能结果时也能在用户浏览器本地重算。
 *
 * Worker 不打包 10MB 站点资源，只按请求代理：
 * | 路径 | 上游 |
 * | --- | --- |
 * | `/wuwacalc/*` | `https://wuwacalc.cn/*` |
 * | `/api/csf/*` | `https://wuwacalc.cn/api/csf/*` |
 */

const UPSTREAM = "https://wuwacalc.cn"
export const WUWACALC_PREFIX = "/wuwacalc/"
export const CSF_PREFIX = "/api/csf/"

const proxy = async (target: URL): Promise<Response> => {
    const response = await fetch(target, {
        headers: {
            accept: "*/*",
            "user-agent": "wuwacalc-conv local recompute",
        },
        signal: AbortSignal.timeout(30_000),
    })
    const headers = new Headers()
    for (
        const name of [
            "content-type",
            "content-length",
            "cache-control",
            "etag",
        ]
    ) {
        const value = response.headers.get(name)
        if (value) headers.set(name, value)
    }
    headers.set("cache-control", "public, max-age=3600")
    return new Response(response.body, { status: response.status, headers })
}

export const isWuwacalcAsset = (pathname: string): boolean =>
    pathname.startsWith(WUWACALC_PREFIX)

/**
 * 报告只需要鸣算屋的计算脚本和 buff 数据；字体、角色立绘、装饰图、Service Worker
 * 都是站点 UI 的资源。隐藏 iframe 里照样会请求，但没必要回源等 300~1500ms。
 */
const isUiOnlyAsset = (pathname: string): boolean =>
    pathname.startsWith("/wuwacalc/assets/") ||
    pathname === "/wuwacalc/sw.js" ||
    pathname === "/wuwacalc/favicon.ico"

export const handleWuwacalcAsset = (url: URL): Promise<Response> => {
    if (isUiOnlyAsset(url.pathname)) {
        return Promise.resolve(
            new Response(null, {
                status: 204,
                headers: { "cache-control": "public, max-age=86400" },
            }),
        )
    }
    return proxy(
        new URL(url.pathname.slice("/wuwacalc".length) + url.search, UPSTREAM),
    )
}

export const isCsfRequest = (pathname: string): boolean =>
    pathname.startsWith(CSF_PREFIX)

export const handleCsfRequest = (url: URL): Promise<Response> =>
    proxy(new URL(url.pathname + url.search, UPSTREAM))

/** 浏览器本地重算要重新取一份分享详情（不能把几 MB 的 payload 塞进 HTML） */
export const isSchemeRequest = (pathname: string): boolean =>
    pathname.startsWith("/api/schemes/")

export const handleSchemeRequest = (url: URL): Promise<Response> =>
    proxy(new URL(url.pathname + url.search, UPSTREAM))
