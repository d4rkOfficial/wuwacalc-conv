/**
 * 两个工坊端点的共享 HTTP 层：CORS / JSON 响应 / 上游抓取。
 *
 * 端点实现见 `convert-project-list.ts` 与 `convert-project-download.ts`，路由见 `mod.ts`。
 */

/** 鸣算屋接口基址，可用 `WUWACALC_API_BASE` 变量覆盖 */
export const DEFAULT_API_BASE = "https://wuwacalc.cn"

/**
 * 上游单次请求超时（毫秒）。
 *
 * 两个接口量级差很远，必须分开：
 * - **列表**轻量（一页 30 条），超时按 504 返回，避免拖死工具箱的逐页扫描；
 * - **详情**单条可达 MB 级且服务端按需重算快照，实测 27~66s 才返回（重复请求也不会变快），
 *   给足余量，否则下载接口会被自己的超时掐死。
 */
export const LIST_TIMEOUT_MS = 15_000
export const DETAIL_TIMEOUT_MS = 90_000

export type Bindings = Env & { WUWACALC_API_BASE?: string }

export const CORS_HEADERS: Record<string, string> = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
}

export const json = (
    data: unknown,
    status = 200,
    headers: Record<string, string> = {},
) => new Response(JSON.stringify(data), {
    status,
    headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS_HEADERS,
        ...headers,
    },
})

export const errorResponse = (status: number, error: string) =>
    json({ error }, status)

/** 读取上游错误体里的 `error` 文案，拿不到时给一个通用文案 */
export const upstreamErrorMessage = async (res: Response): Promise<string> => {
    try {
        const body = await res.json() as { error?: unknown }
        if (typeof body?.error === "string" && body.error) return body.error
    } catch {
        // 上游不是 JSON，忽略
    }
    return `上游返回 ${res.status}`
}

/** 请求被 `AbortSignal.timeout()` 打断（或运行时给的等价错误） */
export const isAbortError = (err: unknown): boolean =>
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")

export type UpstreamResult =
    | { ok: true; res: Response }
    | { ok: false; response: Response }

/**
 * 请求鸣算屋接口：统一处理超时、网络错误与非 2xx。
 *
 * 失败时直接产出工坊口径的错误响应（`{ error }` + CORS），调用方只需 `if (!r.ok) return r.response`。
 * 注意这里只覆盖到「拿到响应头」；读 body 阶段仍可能被同一个 signal 打断，
 * 需要调用方用 {@link isAbortError} 自行区分超时与解析失败。
 */
export const fetchUpstream = async (
    env: Bindings,
    path: string,
    timeoutMs: number,
): Promise<UpstreamResult> => {
    const apiBase = (env.WUWACALC_API_BASE || DEFAULT_API_BASE).replace(
        /\/+$/,
        "",
    )

    let res: Response
    try {
        res = await fetch(`${apiBase}${path}`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
        })
    } catch (err) {
        const timedOut = isAbortError(err)
        return {
            ok: false,
            response: errorResponse(
                timedOut ? 504 : 502,
                timedOut ? "上游请求超时" : "上游访问失败",
            ),
        }
    }

    if (!res.ok) {
        return {
            ok: false,
            response: errorResponse(
                res.status,
                await upstreamErrorMessage(res),
            ),
        }
    }
    return { ok: true, res }
}

/**
 * 读取上游响应体并解析 JSON。
 *
 * 大响应（详情单条 ~1MB）常见的是**读 body 阶段**才超时，不能笼统算成「内容不是 JSON」。
 */
export const readUpstreamJson = async <T>(
    res: Response,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> => {
    let text: string
    try {
        text = await res.text()
    } catch (err) {
        const timedOut = isAbortError(err)
        return {
            ok: false,
            response: errorResponse(
                timedOut ? 504 : 502,
                timedOut ? "上游响应超时" : "上游响应读取失败",
            ),
        }
    }

    try {
        return { ok: true, data: JSON.parse(text) as T }
    } catch {
        return {
            ok: false,
            response: errorResponse(502, "上游返回内容不是合法 JSON"),
        }
    }
}
