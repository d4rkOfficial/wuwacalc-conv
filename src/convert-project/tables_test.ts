/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import {
    EMPTY_TABLES,
    isProjectTablesEmpty,
    loadProjectTables,
    resetProjectTablesCache,
    TABLE_ATTEMPTS,
} from "./tables.ts"
import type { ProjectTables } from "./tables.ts"

const assertEquals = (actual: unknown, expected: unknown, message?: string) =>
    deepStrictEqual(actual, expected, message)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

/** 测试用 env：`cf-typegen` 后 `WUWACALC_API_BASE` 是必填的字面量类型 */
const testEnv = { WUWACALC_API_BASE: "https://wuwacalc.cn" } as const

const realFetch = globalThis.fetch
let calls: string[] = []

const stubUpstream = (impl: (url: string) => Response | Promise<Response>) => {
    calls = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        return Promise.resolve(impl(url))
    }) as typeof fetch
}

const WEAPONS = {
    weapons: [
        {
            id: "21020086",
            name: "灼霜",
            rarity: 5,
            type: 1,
            baseAtk90: 587.5,
            subStat: { name: "暴击", value: 24.3, isPercent: true },
            effectName: "测试武器",
            effect: "攻击提升12%",
        },
        { id: "21050086", name: "存帧" },
        { id: "", name: "缺 id" },
    ],
}

const ECHO_SETS = {
    sets: [
        { id: "30", name: "雪落无声之愿", bonuses: { "2": {}, "5": {} } },
        { id: "25", name: "星构寻辉之环", bonuses: { "2": {}, "5": {} } },
        { id: "36", name: "衔梦照世之心", bonuses: { "1": {}, "3": {} } },
    ],
}

const ECHO_CATALOG = {
    echoes: [
        { id: "6000052", name: "无常凶鹭", cost: 4 },
        { id: "6000060", name: "无归的谬误", cost: 4 },
        { id: "6000221", name: "天傀劫煞", cost: 4 },
    ],
}

const ECHO_SPECIMENS = {
    specimens: [
        {
            id: "6000052",
            name: "无常凶鹭",
            mainEffects: [
                {
                    kind: "panelBonus",
                    category: "typeBonus",
                    value: 40,
                    damageType: "协同攻击",
                },
            ],
        },
    ],
}

const CHARACTER_SKILLS = {
    characters: [
        {
            id: "1108",
            name: "测试角色",
            element: 1,
            rank: 5,
            baseAtk: 425,
            baseHp: 11025,
            baseDef: 1148.9,
            harmonyBreakAmp: 10,
            skills: [
                {
                    name: "普攻·第一段",
                    skillType: "常态攻击",
                    damageType: "普攻",
                    baseMult: 50,
                },
            ],
        },
    ],
}

const okJson = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    })

/** 按文件路由的假上游 */
const routeTables = (url: string) => {
    if (url.includes("weapons.json")) return okJson(WEAPONS)
    if (url.includes("echo-sets.json")) return okJson(ECHO_SETS)
    if (url.includes("echo-catalog.json")) return okJson(ECHO_CATALOG)
    if (url.includes("echo-specimens.json")) return okJson(ECHO_SPECIMENS)
    if (url.includes("character-skills.json")) return okJson(CHARACTER_SKILLS)
    return new Response("not found", { status: 404 })
}

/** 本轮会拉的表文件数（武器 / 套装 / 声骸 / 声骸图鉴 / 技能库） */
const TABLE_COUNT = 5

Deno.test("名称表：拉到武器 / 套装 / 声骸并转成 Map", async () => {
    try {
        resetProjectTablesCache()
        stubUpstream(routeTables)
        const tables = await loadProjectTables(testEnv)

        assertEquals(tables.weapons.get("21020086"), "灼霜")
        assertEquals(tables.weapons.has(""), false)
        assertEquals(tables.echoSets.get("30"), {
            name: "雪落无声之愿",
            bonusTiers: [5, 2],
        })
        // 档位降序，1/3 件套也照收
        assertEquals(tables.echoSets.get("36")?.bonusTiers, [3, 1])
        // 声骸：上游常常只给 echoId，靠这张表补名称
        assertEquals(tables.echoes.get("6000052"), {
            name: "无常凶鹭",
            cost: 4,
        })
        assertEquals(tables.echoSpecimens.get("6000052")?.mainEffects.length, 1)
        assertEquals(tables.characterElements.get("1108"), "冷凝")
        assertEquals(
            tables.skills.get("1108|普攻·第一段")?.skillType,
            "常态攻击",
        )
        assertEquals(tables.characterStats?.get("1108"), {
            id: "1108",
            name: "测试角色",
            element: 1,
            rank: 5,
            baseAtk: 425,
            baseHp: 11025,
            baseDef: 1148.9,
            harmonyBreakAmp: 10,
            skills: [{
                name: "普攻·第一段",
                skillType: "常态攻击",
                damageType: "普攻",
                baseMult: 50,
            }],
        })
        assertEquals(tables.weaponStats?.get("21020086"), {
            id: "21020086",
            name: "灼霜",
            rarity: 5,
            type: 1,
            baseAtk90: 587.5,
            subStat: { name: "暴击", value: 24.3, isPercent: true },
            effectName: "测试武器",
            effect: "攻击提升12%",
        })
        assertEquals(calls.length, TABLE_COUNT)
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("名称表：命中原站内缓存后不再请求上游", async () => {
    try {
        resetProjectTablesCache()
        stubUpstream(routeTables)
        await loadProjectTables(testEnv)
        assertEquals(calls.length, TABLE_COUNT)

        await loadProjectTables(testEnv)
        assertEquals(calls.length, TABLE_COUNT)
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("名称表：并发调用只发一轮请求（单飞）", async () => {
    try {
        resetProjectTablesCache()
        stubUpstream(routeTables)
        await Promise.all([
            loadProjectTables(testEnv),
            loadProjectTables(testEnv),
            loadProjectTables(testEnv),
        ])
        assertEquals(calls.length, TABLE_COUNT)
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("名称表：拉取失败返回空表且不抛错，下次请求会重试", async () => {
    try {
        resetProjectTablesCache()
        stubUpstream(() => {
            throw new TypeError("network down")
        })
        const failed = await loadProjectTables(testEnv)
        assertEquals(failed.weapons.size, 0)
        assertEquals(failed.echoSets.size, 0)
        assertEquals(failed.echoes.size, 0)
        // 每张表都重试过一次（静态小文件，抖动比真挂更常见）
        assert(
            calls.length === TABLE_COUNT * TABLE_ATTEMPTS,
            `每张表各尝试 ${TABLE_ATTEMPTS} 次，实际 ${calls.length}`,
        )
        assert(isProjectTablesEmpty(failed), "三张表全空 = 降级产物")

        // 失败不写缓存 → 下一次仍会去拉
        calls = []
        stubUpstream(routeTables)
        const ok = await loadProjectTables(testEnv)
        assertEquals(ok.weapons.get("21020086"), "灼霜")
        assertEquals(calls.length, TABLE_COUNT)
        assert(!isProjectTablesEmpty(ok), "拉到了就不算降级")
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("名称表：上游返回非 2xx / 结构不符时也降级为空表", async () => {
    try {
        resetProjectTablesCache()
        stubUpstream((url) =>
            url.includes("weapons.json")
                ? new Response("boom", { status: 500 })
                : okJson({ sets: "不是数组" })
        )
        const tables: ProjectTables = await loadProjectTables(testEnv)
        assertEquals(tables.weapons.size, 0)
        assertEquals(tables.echoSets.size, 0)
        assertEquals(tables.echoes.size, 0)
    } finally {
        globalThis.fetch = realFetch
        resetProjectTablesCache()
    }
})

Deno.test("空表常量不会被写入", () => {
    assertEquals(EMPTY_TABLES.weapons.size, 0)
    assertEquals(EMPTY_TABLES.echoSets.size, 0)
    assertEquals(EMPTY_TABLES.echoes.size, 0)
})
