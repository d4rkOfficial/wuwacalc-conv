/// <reference lib="deno.ns" />
import { deepStrictEqual } from "node:assert/strict"
import {
    buildWuwaCalcListQuery,
    convertWuwaCalcProjectListToCoconutProjectList,
    convertWuwaCalcProjectToCoconutProject,
} from "./convert-project-list.ts"
import type {
    WuwaCalcSchemeListItem,
    WuwaCalcSchemeListResponse,
} from "./types.ts"

const assertEquals = (actual: unknown, expected: unknown) =>
    deepStrictEqual(actual, expected)

/** 真实响应摘录（鸣算屋 `/api/public-schemes`，2026-10 实测结构） */
const realItem: WuwaCalcSchemeListItem = {
    id: "0c733702-4efc-4cac-9729-3a21b5c0c44b",
    share_code: "MC-HYWBJ2",
    title: "顶配秧千穗·椰果最高的山",
    description: "椰果界最高的山属于是。",
    tags: ["全局轴"],
    summary: {
        teamDps: 608072.8704083334,
        axisKind: "global",
        entryType: "表级14词条",
        teamTotal: 72968744.449,
        difficulty: "吃手法",
        monsterRes: 20,
        teamConfig: "6+5",
        memberNames: ["秧秧·玄翎", "穗穗", "莫特斐"],
        performance: "坐牢打桩",
        axisDuration: 120,
        characterIds: ["1610", "1110", "1204"],
        monsterLevel: 100,
        memberConfigs: ["6+5", "0+1", "3+1"],
        snapshotsFresh: true,
        _serverComputed: false,
        memberWeaponIds: ["21020096", "21050096", "21010024"],
    } as WuwaCalcSchemeListItem["summary"],
    version: 4,
    fork_count: 46,
    like_count: 1,
    refVideoUrl: "https://www.bilibili.com/video/BV195eM6eEVy/",
    updated_at: "2026-10-08T11:26:11.661+00:00",
    approved_at: "2026-10-08T11:26:11.661+00:00",
    avg_score: 0,
    review_count: 0,
    profiles: {
        id: "f10c1cc5-9401-4286-931c-8e87704f8720",
        display_name: "南边",
        avatar_data_url: "https://example.com/avatar.jpg",
    },
}

Deno.test("单个方案：字段按工坊列表口径映射", () => {
    const project = convertWuwaCalcProjectToCoconutProject(realItem)

    assertEquals(project.id, "0c733702-4efc-4cac-9729-3a21b5c0c44b")
    assertEquals(project.code, "MC-HYWBJ2")
    assertEquals(project.title, "顶配秧千穗·椰果最高的山")
    assertEquals(project.authorName, "南边")
    assertEquals(project.tags, ["全局轴"])
    assertEquals(project.gameVersion, null)
    assertEquals(project.downloads, 46)
    assertEquals(project.createdAt, "2026-10-08T11:26:11.661Z")
})

Deno.test("单个方案：teamPreview 角色名与站位档位", () => {
    const { teamPreview } = convertWuwaCalcProjectToCoconutProject(realItem)

    assertEquals(teamPreview?.names, ["秧秧·玄翎", "穗穗", "莫特斐"])
    assertEquals(teamPreview?.version, null)
    assertEquals(teamPreview?.locked, {
        team: true,
        config: true,
        timeline: true,
        calculation: true,
    })
    assertEquals(teamPreview?.slots.length, 3)
    assertEquals(teamPreview?.slots[0].character, "秧秧·玄翎")
    assertEquals(teamPreview?.slots[0].chain, 6)
    assertEquals(teamPreview?.slots[0].refinement, 5)
    assertEquals(teamPreview?.slots[1].chain, 0)
    assertEquals(teamPreview?.slots[1].refinement, 1)
    assertEquals(teamPreview?.slots[2].chain, 3)
    assertEquals(teamPreview?.slots[2].refinement, 1)
    // 声骸/套装名列表接口不提供，保持空值（武器见下一条用例）
    assertEquals(teamPreview?.slots[0].echoes, [
        { name: null, cost: 0 },
        { name: null, cost: 0 },
        { name: null, cost: 0 },
    ])
    assertEquals(teamPreview?.slots[0].triggerSets, [])
    assertEquals(teamPreview?.slots[0].weapon, null)
})

Deno.test("单个方案：有全队 0+1 变体时优先取该档配置", () => {
    // 真实响应摘录（MC-VH56VG，summary.configVariants 除主配置 6+5 外还有全队 0+1）
    const item = {
        share_code: "MC-VH56VG",
        summary: {
            memberNames: ["景燃", "月", "守岸人"],
            memberConfigs: ["6+5", "6+5", "6+5"],
            configVariants: [
                {
                    key: "6+5|6+5|6+5",
                    label: "6+5 · 6+5 · 6+5",
                    memberConfigs: ["6+5", "6+5", "6+5"],
                },
                {
                    key: "0+1|0+1|0+1",
                    label: "0+1 · 0+1 · 0+1",
                    memberConfigs: ["0+1", "0+1", "0+1"],
                },
                {
                    key: "2+1|0+1|0+1",
                    label: "2+1 · 0+1 · 0+1",
                    memberConfigs: ["2+1", "0+1", "0+1"],
                },
            ],
        },
    } as WuwaCalcSchemeListItem

    const slots =
        convertWuwaCalcProjectToCoconutProject(item).teamPreview?.slots ?? []

    // 列表卡片展示全队 0+1，而不是主配置 6+5
    assertEquals(
        slots.map((s) => [s.chain, s.refinement]),
        [
            [0, 1],
            [0, 1],
            [0, 1],
        ],
    )
})

Deno.test("单个方案：没有全队 0+1 变体时回退主配置", () => {
    const item = {
        share_code: "MC-X",
        summary: {
            memberNames: ["A", "B", "C"],
            memberConfigs: ["6+5", "0+1", "2+1"],
            configVariants: [
                {
                    key: "6+5|0+1|2+1",
                    memberConfigs: ["6+5", "0+1", "2+1"],
                },
                {
                    key: "6+5|0+1|0+1",
                    label: "6+5 · 0+1 · 0+1",
                    memberConfigs: ["6+5", "0+1", "0+1"],
                },
            ],
        },
    } as WuwaCalcSchemeListItem

    const slots =
        convertWuwaCalcProjectToCoconutProject(item).teamPreview?.slots ?? []

    // 只有「主 C 6+5 + 双 0+1」不算全队 0+1 → 回退 summary.memberConfigs
    assertEquals(
        slots.map((s) => [s.chain, s.refinement]),
        [
            [6, 5],
            [0, 1],
            [2, 1],
        ],
    )
})

Deno.test("单个方案：服务端重算的 members 带出武器名", () => {
    // 真实响应摘录（MC-HD8362，summary._serverComputed === true 才有 members）
    const item: WuwaCalcSchemeListItem = {
        share_code: "MC-HD8362",
        summary: {
            memberNames: ["绯雪", "琳奈", "穗穗"],
            memberConfigs: ["0+1", "0+1", "0+1"],
            members: [
                {
                    index: 0,
                    name: "绯雪",
                    weaponId: "21020086",
                    weaponName: "灼霜",
                    refinement: 1,
                    resonanceUnlocked: 0,
                },
                {
                    index: 1,
                    name: "琳奈",
                    weaponId: "21030015",
                    weaponName: "停驻之烟",
                    refinement: 1,
                    resonanceUnlocked: 0,
                },
                {
                    index: 2,
                    name: "穗穗",
                    weaponId: "21050024",
                    weaponName: "奇幻变奏",
                    refinement: 1,
                    resonanceUnlocked: 0,
                },
            ],
        },
    }

    const slots =
        convertWuwaCalcProjectToCoconutProject(item).teamPreview?.slots ?? []

    assertEquals(slots.map((s) => s.weapon), ["灼霜", "停驻之烟", "奇幻变奏"])
    assertEquals(slots.map((s) => s.chain), [0, 0, 0])
    assertEquals(slots.map((s) => s.character), ["绯雪", "琳奈", "穗穗"])
})

Deno.test("单个方案：members 乱序时按 index 对齐武器", () => {
    const item = {
        share_code: "MC-X",
        summary: {
            memberNames: ["A", "B"],
            memberConfigs: ["1+1", "2+2"],
            members: [
                { index: 1, weaponName: "武器B" },
                { index: 0, weaponName: "武器A" },
                { index: 5, weaponName: "越界" },
            ],
        },
    } as WuwaCalcSchemeListItem

    const slots =
        convertWuwaCalcProjectToCoconutProject(item).teamPreview?.slots ?? []

    assertEquals(slots.map((s) => s.weapon), ["武器A", "武器B"])
    assertEquals(slots.map((s) => s.chain), [1, 2])
})

Deno.test("单个方案：缺字段与脏数据不抛错", () => {
    const project = convertWuwaCalcProjectToCoconutProject({
        shareCode: "MC-FALLBACK",
        title: "   ",
        fork_count: -3,
        memberNames: [],
    } as unknown as WuwaCalcSchemeListItem)

    assertEquals(project.id, "MC-FALLBACK")
    assertEquals(project.code, "MC-FALLBACK")
    assertEquals(project.title, "")
    assertEquals(project.authorName, "匿名")
    assertEquals(project.downloads, 0)
    assertEquals(project.createdAt, new Date(0).toISOString())
    assertEquals(project.teamPreview?.names, [])
    assertEquals(project.teamPreview?.slots, [])
})

Deno.test("单个方案：无法解析的 memberConfigs 归零", () => {
    const project = convertWuwaCalcProjectToCoconutProject({
        share_code: "MC-X",
        summary: { memberNames: ["A", "B"], memberConfigs: ["", "弄坏了"] },
    })

    assertEquals(
        project.teamPreview?.slots.map((s) => [s.chain, s.refinement]),
        [
            [0, 0],
            [0, 0],
        ],
    )
})

Deno.test("列表：透传 total 并回填客户端请求的分页参数", () => {
    const body: WuwaCalcSchemeListResponse = {
        items: [realItem],
        total: 84,
        page: 2,
        pageSize: 12,
    }

    const result = convertWuwaCalcProjectListToCoconutProjectList(body, {
        page: 2,
        perPage: 12,
    })

    assertEquals(result.total, 84)
    assertEquals(result.page, 2)
    assertEquals(result.perPage, 12)
    assertEquals(result.projects.length, 1)
    assertEquals(result.projects[0].code, "MC-HYWBJ2")
})

Deno.test("列表：空响应得到空列表而不是异常", () => {
    assertEquals(convertWuwaCalcProjectListToCoconutProjectList(null), {
        projects: [],
        total: 0,
        page: 1,
        perPage: 12,
    })
})

Deno.test("查询串：sort 映射到鸣算屋口径", () => {
    const sortOf = (sort: string) =>
        buildWuwaCalcListQuery(new URLSearchParams({ sort })).search.get("sort")

    assertEquals(sortOf("newest"), "time")
    assertEquals(sortOf("hot"), "dps")
    assertEquals(sortOf("heat"), "dps")
    assertEquals(sortOf("total"), "total")
    assertEquals(sortOf("莫名其妙的排序"), "time")
})

Deno.test("查询串：perPage 夹取并按上游上限换算 pageSize", () => {
    const wide = buildWuwaCalcListQuery(new URLSearchParams({ perPage: "50" }))
    assertEquals([wide.page, wide.perPage, wide.pageSize], [1, 50, 30])
    assertEquals(wide.search.get("pageSize"), "30")
    assertEquals(wide.search.get("page"), "1")

    const over = buildWuwaCalcListQuery(new URLSearchParams({ perPage: "999" }))
    assertEquals([over.perPage, over.pageSize], [50, 30])

    const tiny = buildWuwaCalcListQuery(
        new URLSearchParams({ perPage: "5", page: "3" }),
    )
    assertEquals([tiny.page, tiny.perPage, tiny.pageSize], [3, 5, 5])

    const fallback = buildWuwaCalcListQuery(new URLSearchParams())
    assertEquals([fallback.page, fallback.perPage, fallback.pageSize], [
        1,
        12,
        12,
    ])
})

Deno.test("查询串：关键词与鸣算屋专有筛选透传，工坊参数不外泄", () => {
    const { search } = buildWuwaCalcListQuery(
        new URLSearchParams({
            q: "  秧秧  ",
            excludeAnon: "1",
            characters: "1108",
            zone: "zero",
            kind: "all",
        }),
    )

    assertEquals(search.get("q"), "秧秧")
    assertEquals(search.get("characters"), "1108")
    assertEquals(search.get("zone"), "zero")
    assertEquals(search.get("kind"), "all")
    assertEquals(search.get("excludeAnon"), null)
})
