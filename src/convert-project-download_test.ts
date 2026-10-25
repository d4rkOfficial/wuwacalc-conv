/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import {
    DOWNLOAD_ATTEMPTS,
    handleDownloadProject,
    SHARE_DOWNLOAD_PATTERN,
} from "./convert-project-download.ts"
import type { CoconutProjectFile } from "./convert-project/types.ts"
import { resetProjectTablesCache } from "./convert-project/tables.ts"
import {
    type CachedProject,
    type ProjectCache,
    resetProjectCache,
    setProjectCache,
} from "./project-cache.ts"

const assertEquals = (actual: unknown, expected: unknown, message?: string) =>
    deepStrictEqual(actual, expected, message)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

const realFetch = globalThis.fetch
let calls: string[] = []

/** 内存版缓存后端：单测里观察命中 / 写入行为 */
const memoryCache = (): ProjectCache & {
    store: Map<string, CachedProject>
} => {
    const store = new Map<string, CachedProject>()
    return {
        store,
        get: (code) => Promise.resolve(store.get(code) ?? null),
        put: (code, _base, entry) => {
            store.set(code, entry)
            return Promise.resolve()
        },
    }
}

const stubUpstream = (impl: (url: string) => Response | Promise<Response>) => {
    calls = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        return Promise.resolve(impl(url))
    }) as typeof fetch
    // 名称表是按模块级缓存复用的，逐个用例清掉才能稳定观察请求次数
    resetProjectTablesCache()
}

/** 详情请求本身（区别于同一次下载里顺带拉的名称表） */
const detailCalls = () => calls.filter((url) => url.includes("/api/schemes/"))

/** 测试用 env：`cf-typegen` 后 `WUWACALC_API_BASE` 是必填的字面量类型 */
const testEnv = { WUWACALC_API_BASE: "https://wuwacalc.cn" } as const

/** 直接驱动下载处理器：方法与路由由 `mod.ts` 把关，见 `mod_test.ts` */
const call = (code: string) =>
    handleDownloadProject(code, testEnv, "https://bridge.example") as Promise<
        Response
    >

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    })

const readDisposition = (res: Response) =>
    res.headers.get("content-disposition") ?? ""

/** 运行时名称表：与真实 weapons.json / echo-sets.json 同形 */
const tablesResponse = (url: string) => {
    if (url.includes("weapons.json")) {
        return jsonResponse({
            weapons: [
                { id: "21020086", name: "灼霜" },
                { id: "21050086", name: "存帧" },
                { id: "21010024", name: "异响空灵" },
            ],
        })
    }
    return jsonResponse({
        sets: [{
            id: "30",
            name: "雪落无声之愿",
            bonuses: { "2": {}, "5": {} },
        }],
    })
}

/** 与上游真实详情同形状的样本（payload 已裁剪到够用） */
const detailFixture = {
    id: "5d1e7bfb-61f2-41d6-a9ae-8a6bf45b6c77",
    share_code: "MC-KJ8VZL",
    title: "绯洛宁标准5居合",
    status: "approved",
    approved_at: "2026-10-07T14:24:34.354+00:00",
    payload: {
        data: {
            team: { monsterLevel: 100, monsterRes: 20, axisDuration: 25 },
            members: [
                {
                    name: "绯雪",
                    resonanceUnlocked: 3,
                    weaponSelection: { id: "21020086", refinement: 1 },
                    echoConfig: {
                        slots: [{
                            cost: 4,
                            name: "共鸣回响·鸣式·虚造神型",
                            main1: "main_crit_dmg",
                            subs: [{
                                id: "sub_crit_dmg",
                                value: 15,
                                damageType: "",
                            }],
                        }],
                        setLoadout: [{ count: 5, setId: "30" }],
                    },
                },
                {
                    name: "洛瑟菈",
                    resonanceUnlocked: 0,
                    weaponSelection: { id: "21050086", refinement: 1 },
                },
                {
                    name: "莫宁",
                    resonanceUnlocked: 0,
                    weaponSelection: { id: "21010024", refinement: 5 },
                },
            ],
        },
        meta: { name: "绯洛宁标准5居合" },
    },
}

Deno.test("下载：命中上游详情并回工程文件信封", async () => {
    try {
        stubUpstream((url) =>
            url.includes("/api/schemes/")
                ? jsonResponse(detailFixture)
                : tablesResponse(url)
        )
        const res = await call("MC-KJ8VZL")

        assertEquals(res.status, 200)
        assertEquals(detailCalls(), [
            "https://wuwacalc.cn/api/schemes/MC-KJ8VZL",
        ])
        // 名称表随之被拉取
        assert(
            calls.some((u) => u.includes("weapons.json")) &&
                calls.some((u) => u.includes("echo-sets.json")),
            `应当拉取名称表: ${calls.join(", ")}`,
        )

        const file = await res.json() as CoconutProjectFile
        assertEquals(file.version, 4)
        assertEquals(file.project.id, "5d1e7bfb-61f2-41d6-a9ae-8a6bf45b6c77")
        assertEquals(file.project.name, "绯洛宁标准5居合")
        assertEquals(file.project.version, 4)
        assertEquals(
            file.project.createdAt,
            Date.parse("2026-10-07T14:24:34.354+00:00"),
        )
        assertEquals(file.project.team.length, 3)
        assertEquals(file.project.team[0].character, "绯雪")
        // 武器 / 套装名与词条都经名称表与词条表补齐
        assertEquals(file.project.team[0].weapon, "灼霜")
        assertEquals(file.project.team[0].triggerSets, [
            { name: "雪落无声之愿", pieces: 5 },
            { name: "雪落无声之愿", pieces: 2 },
        ])
        assertEquals(file.project.team[0].echoes[0], {
            name: "共鸣回响·鸣式·虚造神型",
            cost: 4,
        })
        const config = file.project.phases.config.data as {
            characters: { echoes: { mainStat: unknown; substats: unknown }[] }[]
        }
        assertEquals(config.characters[0].echoes[0].mainStat, {
            type: "暴击伤害",
            value: 44,
            unit: "%",
        })
        assertEquals(config.characters[0].echoes[0].substats, [
            { type: "暴击伤害", value: 15, unit: "%" },
        ])
        assert(typeof file.exportedAt === "number", "信封应带 exportedAt")
        // 转换产物不能夹带上游原始快照（工具箱导入上限 1MB）
        assert(!("payload" in file.project), "不应把上游 payload 原样带出")
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("下载：响应头对齐工坊附件契约", async () => {
    try {
        stubUpstream(() => jsonResponse(detailFixture))
        const res = await call("MC-KJ8VZL")
        const disposition = readDisposition(res)

        assert(
            disposition.startsWith(
                `attachment; filename="MC-KJ8VZL.json"; filename*=UTF-8''`,
            ),
            `content-disposition=${disposition}`,
        )
        assert(
            disposition.includes(encodeURIComponent("绯洛宁标准5居合.json")),
            `content-disposition=${disposition}`,
        )
        assertEquals(
            res.headers.get("content-type"),
            "application/json; charset=utf-8",
        )
        assertEquals(res.headers.get("cache-control"), "no-store")
        assertEquals(res.headers.get("access-control-allow-origin"), "*")
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("下载：标题含 RFC 5987 保留字符时正确转义", async () => {
    try {
        stubUpstream(() =>
            jsonResponse({ ...detailFixture, title: "顶配(秧)千穗*测试'" })
        )
        const res = await call("MC-KJ8VZL")
        const disposition = readDisposition(res)
        const encoded = disposition.slice(disposition.indexOf("UTF-8''") + 7)

        // `*` 是 Windows 非法文件名字符，先被清理成 `_`；`'()*` 再由 RFC 5987 补转义
        assertEquals(decodeURIComponent(encoded), "顶配(秧)千穗_测试'.json")
        assert(encoded.includes("%28"), `encoded=${encoded}`) // (
        assert(encoded.includes("%29"), `encoded=${encoded}`) // )
        assert(encoded.includes("%27"), `encoded=${encoded}`) // '
        assert(!encoded.includes("*"), `encoded=${encoded}`)
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("下载：文件名里的路径字符被清理，标题缺失时回落分享码", async () => {
    try {
        stubUpstream(() =>
            jsonResponse({ ...detailFixture, title: "a/b:c*d?" })
        )
        const withTitle = readDisposition(await call("MC-KJ8VZL"))
        assert(
            withTitle.includes(encodeURIComponent("a_b_c_d_.json")),
            `content-disposition=${withTitle}`,
        )

        stubUpstream(() => jsonResponse({ ...detailFixture, title: "" }))
        const noTitle = readDisposition(await call("MC-KJ8VZL"))
        assert(
            noTitle.includes(encodeURIComponent("MC-KJ8VZL.json")),
            `content-disposition=${noTitle}`,
        )
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("下载：非法分享码 400，且不访问上游", async () => {
    try {
        stubUpstream(() => jsonResponse(detailFixture))
        for (
            const code of [
                "..%2F..%2Fetc%2Fpasswd",
                "a/b",
                "MC-KJ8VZL ",
                "x".repeat(65),
            ]
        ) {
            const res = await call(code)
            assertEquals(res.status, 400)
            assertEquals(await res.json(), { error: "分享码格式不合法" })
        }
        assertEquals(calls, [])
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("下载：上游 404 透传文案", async () => {
    try {
        stubUpstream(() =>
            jsonResponse({ error: "方案不存在或未通过审核" }, 404)
        )
        const res = await call("MC-NOPE01")

        assertEquals(res.status, 404)
        assertEquals(await res.json(), { error: "方案不存在或未通过审核" })
        assertEquals(res.headers.get("access-control-allow-origin"), "*")
    } finally {
        globalThis.fetch = realFetch
    }
})

/** 头部正常但 body 读一半炸掉的响应（模拟大响应读到一半被打断） */
const failingBodyResponse = (err: Error) =>
    new Response(
        new ReadableStream({
            start(controller) {
                controller.error(err)
            },
        }),
        { status: 200 },
    )

Deno.test("下载：上游网络错误 502、超时 504、非 JSON 502", async () => {
    try {
        stubUpstream(() => {
            throw new TypeError("network down")
        })
        assertEquals((await call("MC-KJ8VZL")).status, 502)

        stubUpstream(() => {
            const err = new Error("timed out")
            err.name = "TimeoutError"
            throw err
        })
        assertEquals((await call("MC-KJ8VZL")).status, 504)

        stubUpstream(() => new Response("<html>502</html>", { status: 200 }))
        const res = await call("MC-KJ8VZL")
        assertEquals(res.status, 502)
        assertEquals(await res.json(), { error: "上游返回内容不是合法 JSON" })
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("下载：读 body 阶段超时算 504，不误报成格式错误", async () => {
    try {
        // 上游 27~66s 才吐完 ~1MB，超时几乎总是发生在读 body 时
        stubUpstream(() => {
            const err = new Error("timed out")
            err.name = "TimeoutError"
            return failingBodyResponse(err)
        })
        const timedOut = await call("MC-KJ8VZL")
        assertEquals(timedOut.status, 504)
        assertEquals(await timedOut.json(), { error: "上游响应超时" })

        stubUpstream(() => failingBodyResponse(new TypeError("reset by peer")))
        const broken = await call("MC-KJ8VZL")
        assertEquals(broken.status, 502)
        assertEquals(await broken.json(), { error: "上游响应读取失败" })
    } finally {
        globalThis.fetch = realFetch
    }
})

// ── 缓存 / 重试 / 兜底 ────────────────────────────────────────────────────────

const okDetailRoute = (url: string) =>
    url.includes("/api/schemes/")
        ? jsonResponse(detailFixture)
        : tablesResponse(url)

const withCache = async (
    fn: (cache: ReturnType<typeof memoryCache>) => Promise<void>,
) => {
    const cache = memoryCache()
    setProjectCache(cache)
    try {
        await fn(cache)
    } finally {
        globalThis.fetch = realFetch
        resetProjectCache()
        resetProjectTablesCache()
    }
}

Deno.test("缓存：名称表拉不到时不写缓存，产物标 x-project-tables: empty", async () => {
    await withCache(async (cache) => {
        // 详情正常、三张名称表全挂 —— 产物里武器名 / 套装名会是空的
        stubUpstream((url) =>
            url.includes("/api/schemes/")
                ? jsonResponse(detailFixture)
                : new Response("boom", { status: 503 })
        )
        const res = await call("MC-KJ8VZL")

        assertEquals(res.status, 200)
        assertEquals(res.headers.get("x-project-tables"), "empty")
        assertEquals(cache.store.size, 0, "降级产物不该进缓存")
        const file = await res.json() as CoconutProjectFile
        // 角色与声骸名来自 payload，仍在；武器名/套装名只能来自名称表，缺失
        assertEquals(file.project.team[0].character, "绯雪")
        assertEquals(file.project.team[0].weapon, null)
        assertEquals(file.project.team[0].triggerSets, [])

        // 表恢复后重下一次：这次带上了名字，并且写进缓存
        stubUpstream(okDetailRoute)
        const again = await call("MC-KJ8VZL")
        assertEquals(again.headers.get("x-project-tables"), null)
        assertEquals(cache.store.size, 1)
        const fixed = await again.json() as CoconutProjectFile
        assertEquals(fixed.project.team[0].weapon, "灼霜")
    })
})

Deno.test("缓存：缓存里是降级产物时不算新鲜，重新转换", async () => {
    await withCache(async (cache) => {
        // 手工塞一份「没有名称表」的旧缓存
        stubUpstream(okDetailRoute)
        const good = await call("MC-KJ8VZL")
        const file = await good.json() as CoconutProjectFile
        for (const entry of cache.store.values()) {
            entry.degraded = true
            entry.file = {
                ...file,
                project: {
                    ...file.project,
                    team: file.project.team.map((slot) => ({
                        ...slot,
                        weapon: null,
                        triggerSets: [],
                    })),
                },
            }
        }

        const upstreamCalls = detailCalls().length
        const res = await call("MC-KJ8VZL")
        assertEquals(res.headers.get("x-project-cache"), "refresh")
        assertEquals(
            detailCalls().length,
            upstreamCalls + 1,
            "降级缓存不命中，要重新拉上游",
        )
        const fixed = await res.json() as CoconutProjectFile
        assertEquals(fixed.project.team[0].weapon, "灼霜")
    })
})

Deno.test("缓存：新鲜期内直接命中，不访问上游", async () => {
    await withCache(async (cache) => {
        stubUpstream(okDetailRoute)
        // 先正常下载一次把缓存写进去
        const first = await call("MC-KJ8VZL")
        assertEquals(first.status, 200)
        assertEquals(first.headers.get("x-project-cache"), "miss")
        assertEquals(cache.store.size, 1)
        const upstreamCalls = detailCalls().length

        // 再下第二次：应命中缓存，不再打上游
        const second = await call("MC-KJ8VZL")
        assertEquals(second.status, 200)
        assertEquals(second.headers.get("x-project-cache"), "hit")
        assertEquals(
            detailCalls().length,
            upstreamCalls,
            "命中缓存后不应再请求详情",
        )
        assertEquals(await second.json(), await first.json())
    })
})

Deno.test("缓存：过期后重新拉取并刷新", async () => {
    await withCache(async (cache) => {
        stubUpstream(okDetailRoute)
        await call("MC-KJ8VZL")
        // 把缓存做旧，越过新鲜期
        const entry = cache.store.get("MC-KJ8VZL")!
        cache.store.set("MC-KJ8VZL", { ...entry, convertedAt: 0 })

        const res = await call("MC-KJ8VZL")
        assertEquals(res.headers.get("x-project-cache"), "refresh")
        assertEquals(detailCalls().length, 2)
        assert(cache.store.get("MC-KJ8VZL")!.convertedAt > 0, "应刷新时间戳")
    })
})

Deno.test("缓存：上游失败时用旧副本兜底，把 502/504 变成可用下载", async () => {
    await withCache(async (cache) => {
        stubUpstream(okDetailRoute)
        const fresh = await call("MC-KJ8VZL")
        const freshBody = await fresh.json()
        cache.store.set("MC-KJ8VZL", {
            ...cache.store.get("MC-KJ8VZL")!,
            convertedAt: 0,
        })

        // 上游彻底挂掉
        stubUpstream(() => {
            throw new TypeError("network down")
        })
        const stale = await call("MC-KJ8VZL")
        assertEquals(stale.status, 200, "有旧副本时不应回 502")
        assertEquals(stale.headers.get("x-project-cache"), "stale")
        assert(
            stale.headers.get("x-project-stale-since") !== null,
            "应标出旧副本的产出时间",
        )
        assertEquals(await stale.json(), freshBody)
        // 仍是附件响应
        assert(
            (stale.headers.get("content-disposition") ?? "").startsWith(
                "attachment",
            ),
            "兜底响应也要带附件头",
        )
    })
})

Deno.test("缓存：没有旧副本时失败照旧透传", async () => {
    await withCache(async () => {
        stubUpstream(() => {
            throw new TypeError("network down")
        })
        const res = await call("MC-KJ8VZL")
        assertEquals(res.status, 502)
        assertEquals(await res.json(), { error: "上游访问失败" })
    })
})

Deno.test("重试：快速失败会重试一次并成功", async () => {
    await withCache(async () => {
        let attempt = 0
        stubUpstream((url) => {
            if (!url.includes("/api/schemes/")) return tablesResponse(url)
            attempt++
            if (attempt === 1) throw new TypeError("connect reset")
            return jsonResponse(detailFixture)
        })

        const res = await call("MC-KJ8VZL")
        assertEquals(res.status, 200)
        assertEquals(attempt, 2, "第一次快速失败后应重试")
        assertEquals(res.headers.get("x-project-cache"), "miss")
    })
})

Deno.test("重试：慢失败不重试，避免等待翻倍", async () => {
    await withCache(async () => {
        const realNow = Date.now
        let clock = 0
        // 每次取时间都前进 20s → 单次尝试「耗时」超过重试预算
        Date.now = () => (clock += 20_000)
        try {
            stubUpstream(() => {
                throw new TypeError("network down")
            })
            const res = await call("MC-KJ8VZL")
            assertEquals(res.status, 502)
            assertEquals(
                detailCalls().length,
                1,
                `慢失败只应尝试一次（上限 ${DOWNLOAD_ATTEMPTS}）`,
            )
        } finally {
            Date.now = realNow
        }
    })
})

Deno.test("下载：路由正则只认 /share/{code}/download", () => {
    const match = (path: string) => SHARE_DOWNLOAD_PATTERN.exec(path)?.[1]

    assertEquals(match("/share/MC-KJ8VZL/download"), "MC-KJ8VZL")
    assertEquals(match("/share/acdgi78A/download"), "acdgi78A")
    assertEquals(match("/share/a/b/download"), undefined)
    assertEquals(match("/share/MC-KJ8VZL/Download"), undefined)
    assertEquals(match("/share/MC-KJ8VZL/download/extra"), undefined)
})
