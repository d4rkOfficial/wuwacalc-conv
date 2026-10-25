/// <reference lib="deno.ns" />
/**
 * 本地伺服鸣算屋线上前端（快照在 ./site/），未命中时回源到 wuwacalc.cn。
 *
 * 只多出几个测试端点：
 *   - GET /__ping                 存活
 *   - GET /__fixtures             fixtures/wuwacalc/manifest.json
 *   - GET /__fixture/{code}.json  方案详情（原样返回 API 响应）
 *
 * 不写任何站点状态；方案导入与计算都由站点自己的脚本在 jsdom 里完成。
 */

const BASE = Deno.env.get("WUWACALC_BASE") ?? "https://wuwacalc.cn"
const ROOT = new URL("../../", import.meta.url)
const SITE = new URL("./site/", import.meta.url)
const FIXTURES = new URL("../../fixtures/wuwacalc/", ROOT)

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".avif": "image/avif",
}

const contentTypeOf = (path: string): string =>
    MIME[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream"

const readLocal = async (
    root: URL,
    rel: string,
): Promise<Uint8Array | null> => {
    const target = new URL(rel, root)
    if (!target.href.startsWith(root.href)) return null
    try {
        return await Deno.readFile(target)
    } catch {
        return null
    }
}

const proxy = async (path: string): Promise<Uint8Array | null> => {
    try {
        const res = await fetch(BASE + path, {
            signal: AbortSignal.timeout(60_000),
            headers: { "user-agent": "wuwacalc-conv/parity" },
        })
        if (!res.ok) return null
        return new Uint8Array(await res.arrayBuffer())
    } catch {
        return null
    }
}

export interface LocalSite {
    url: string
    close: () => Promise<void>
}

export const startLocalSite = (port = 0): LocalSite => {
    const server = Deno.serve({
        port,
        hostname: "127.0.0.1",
        onListen: ({ port: p }) =>
            console.log("local site on http://127.0.0.1:" + p),
    }, async (req) => {
        const url = new URL(req.url)
        if (url.pathname === "/__ping") return new Response("pong")
        if (url.pathname === "/__fixtures") {
            try {
                return new Response(
                    await Deno.readTextFile(new URL("manifest.json", FIXTURES)),
                    {
                        headers: {
                            "content-type": "application/json; charset=utf-8",
                        },
                    },
                )
            } catch {
                return new Response("[]", { status: 404 })
            }
        }
        if (url.pathname.startsWith("/__fixture/")) {
            const code = decodeURIComponent(
                url.pathname.slice("/__fixture/".length),
            ).replace(/\.json$/, "")
            if (!/^[\w-]+$/.test(code)) {
                return new Response("bad code", { status: 400 })
            }
            const body = await readLocal(FIXTURES, code + ".json")
            return body
                ? new Response(body, {
                    headers: {
                        "content-type": "application/json; charset=utf-8",
                    },
                })
                : new Response("not found", { status: 404 })
        }

        const rel = url.pathname === "/"
            ? "index.html"
            : url.pathname.replace(/^\/+/, "")
        let body = await readLocal(SITE, rel)
        if (!body) body = await proxy(url.pathname + url.search)
        if (!body) return new Response("not found", { status: 404 })
        return new Response(body, {
            headers: {
                "content-type": contentTypeOf(rel),
                "cache-control": "no-store",
            },
        })
    })
    const address = server.addr as Deno.NetAddr
    return {
        url: "http://127.0.0.1:" + address.port,
        close: () => server.shutdown(),
    }
}
