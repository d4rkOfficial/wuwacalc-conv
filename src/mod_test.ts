/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import handler from "./mod.ts"

const assertEquals = (actual: unknown, expected: unknown) =>
    deepStrictEqual(actual, expected)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

/** 测试用 env：`cf-typegen` 后 `WUWACALC_API_BASE` 是必填的字面量类型 */
const testEnv = { WUWACALC_API_BASE: "https://wuwacalc.cn" } as const

const realFetch = globalThis.fetch

const call = (path: string, method = "GET") =>
    handler.fetch(
        new Request("https://bridge.example" + path, { method }),
        testEnv,
    )

Deno.test("路由：非 GET 一律 405", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const res = await call("/api/public/projects", method)
        assertEquals(res.status, 405)
        assertEquals(await res.json(), { error: "仅支持 GET 请求" })
    }
})

Deno.test("路由：OPTIONS 预检 204 且带 CORS", async () => {
    const res = await call("/api/public/projects", "OPTIONS")
    assertEquals(res.status, 204)
    assertEquals(res.headers.get("access-control-allow-origin"), "*")
    assertEquals(
        res.headers.get("access-control-allow-methods"),
        "GET, OPTIONS",
    )
})

Deno.test("路由：根路径返回工程广场页面（HTML）", async () => {
    globalThis.fetch = (() =>
        Promise.resolve(
            new Response(JSON.stringify({ items: [], total: 0 }), {
                headers: { "content-type": "application/json" },
            }),
        )) as typeof fetch
    try {
        const res = await call("/")
        assertEquals(res.status, 200)
        assert(
            (res.headers.get("content-type") ?? "").includes("text/html"),
            "首页应当是 HTML",
        )
        const html = await res.text()
        assert(html.includes("椰果工坊"), "首页标题应含「椰果工坊」")
        assert(html.includes("鸣算屋转接器"), "首页标题应含「鸣算屋转接器」")
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("路由：使用方法附图直接出图", async () => {
    for (const theme of ["dark", "light"]) {
        const res = await call(`/assets/usage-${theme}.jpg`)
        assertEquals(res.status, 200)
        assertEquals(res.headers.get("content-type"), "image/jpeg")
        assert(
            (await res.arrayBuffer()).byteLength > 1000,
            "附图不应该是空响应",
        )
    }
})

Deno.test("路由：未知路径 404", async () => {
    for (
        const path of [
            "/api/unknown",
            "/assets/usage-mid.jpg",
            "/assets/usage-dark.png",
            "/share/MC-KJ8VZL/report",
            "/api/convert/MC-KJ8VZL/report",
            "/share/MC-KJ8VZL/Download",
            "/share/a/b/download",
        ]
    ) {
        const res = await call(path)
        assertEquals(res.status, 404)
        assertEquals(await res.json(), { error: "接口不存在" })
    }
})
