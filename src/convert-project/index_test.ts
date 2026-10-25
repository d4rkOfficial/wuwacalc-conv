/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import { convertWuwaCalcProjectToCoconutProjectFile } from "./index.ts"
import type { ConvertProjectInput } from "./index.ts"
import { convertTeamPhase } from "./team.ts"
import { convertConfigPhase } from "./config.ts"
import {
    convertCalculationPhase,
    inferEntryDamageTypes,
} from "./calculation.ts"
import { EXTRA_RATIO_PLACEHOLDER } from "./extra-ratio.ts"
import { convertTimelinePhase, MAX_POS, ratioBaseTypes } from "./timeline.ts"
import { convertMainStat, convertSubstat } from "./stat-tables.ts"
import { EMPTY_TABLES } from "./tables.ts"
import type { ProjectTables } from "./tables.ts"

const assertEquals = (actual: unknown, expected: unknown, message?: string) =>
    deepStrictEqual(actual, expected, message)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

/** 运行时名称表（真实条目：weapons.json / echo-sets.json / echo-catalog.json 摘录） */
const tables: ProjectTables = {
    weapons: new Map([
        ["21020086", "灼霜"],
        ["21050086", "存帧"],
        ["21010024", "异响空灵"],
    ]),
    echoSets: new Map([
        ["30", { name: "雪落无声之愿", bonusTiers: [5, 2] }],
        ["25", { name: "星构寻辉之环", bonusTiers: [5, 2] }],
    ]),
    echoes: new Map([
        ["6000199", { name: "共鸣回响·鸣式·虚造神型", cost: 4 }],
    ]),
    skills: new Map(),
    characterElements: new Map(),
    echoSpecimens: new Map(),
}

/** 真实详情摘录（MC-KJ8VZL，仅保留工程转换关心的字段） */
const detail: ConvertProjectInput = {
    id: "5d1e7bfb-61f2-41d6-a9ae-8a6bf45b6c77",
    share_code: "MC-KJ8VZL",
    title: "绯洛宁标准5居合",
    approved_at: "2026-10-07T14:24:34.354+00:00",
    payload: {
        meta: { name: "绯洛宁标准5居合" },
        data: {
            team: { monsterLevel: 100, monsterRes: 20, axisDuration: 25 },
            members: [
                {
                    name: "绯雪",
                    characterId: "1108",
                    resonanceUnlocked: 3,
                    weaponSelection: { id: "21020086", refinement: 1 },
                    echoConfig: {
                        layout: "43311",
                        slots: [
                            {
                                cost: 4,
                                name: "共鸣回响·鸣式·虚造神型",
                                main1: "main_crit_dmg",
                                main1Element: "湮灭",
                                subs: [
                                    {
                                        id: "sub_crit_dmg",
                                        value: 15,
                                        damageType: "",
                                    },
                                    {
                                        id: "sub_atk_percent",
                                        value: 8.6,
                                        damageType: "",
                                    },
                                    {
                                        id: "sub_energy_regen",
                                        value: 10,
                                        damageType: "",
                                    },
                                    {
                                        id: "sub_crit_rate",
                                        value: 9.3,
                                        damageType: "",
                                    },
                                    {
                                        id: "sub_type_dmg",
                                        value: 8.6,
                                        damageType: "共鸣解放",
                                    },
                                ],
                            },
                            {
                                cost: 3,
                                name: "格洛犸图",
                                main1: "main_element_dmg",
                                main1Element: "冷凝",
                            },
                            {
                                cost: 3,
                                name: "霜鳞蜃甲",
                                main1: "main_element_dmg",
                                main1Element: "冷凝",
                            },
                            {
                                cost: 1,
                                name: "颤栗战士",
                                main1: "main_atk_percent",
                            },
                            {
                                cost: 1,
                                name: "冰盈舞者",
                                main1: "main_atk_percent",
                            },
                        ],
                        setLoadout: [
                            { count: 5, setId: "30", echoId: "6000199" },
                            { count: 0, setId: null, echoId: null },
                            { count: 0, setId: null, echoId: null },
                        ],
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
                    echoConfig: {
                        slots: [
                            {
                                cost: 4,
                                name: "炉芯机骸",
                                main1: "main_def_percent",
                            },
                        ],
                        setLoadout: [{
                            count: 5,
                            setId: "25",
                            echoId: "6000190",
                        }],
                    },
                },
            ],
        },
    },
}

Deno.test("汇总：信封与工程元信息", () => {
    const file = convertWuwaCalcProjectToCoconutProjectFile(detail, tables, {
        exportedAt: 1_700_000_000_000,
    })

    assertEquals(file.version, 4)
    assertEquals(file.exportedAt, 1_700_000_000_000)
    assertEquals(file.project.id, "5d1e7bfb-61f2-41d6-a9ae-8a6bf45b6c77")
    assertEquals(file.project.name, "绯洛宁标准5居合")
    assertEquals(file.project.version, 4)
    assertEquals(
        file.project.createdAt,
        Date.parse("2026-10-07T14:24:34.354+00:00"),
    )
})

Deno.test("汇总：四阶段齐全，队伍配置落在 project.team 上", () => {
    const { project } = convertWuwaCalcProjectToCoconutProjectFile(
        detail,
        tables,
    )

    assertEquals(Object.keys(project.phases), [
        "team",
        "timeline",
        "calculation",
        "config",
    ])
    // 队伍配置走 project.team，phases.team 只带锁定态
    assertEquals(project.phases.team, { locked: true, data: null })
    assertEquals(project.team.length, 3)
    assertEquals(project.team[0].character, "绯雪")
    assertEquals(project.team[0].chain, 3)
    assertEquals(project.team[0].refinement, 1)
    // 只落首位声骸（工具箱只读 echoes[0]）
    assertEquals(project.team[0].echoes, [
        { name: "共鸣回响·鸣式·虚造神型", cost: 4 },
    ])
    assertEquals(project.conditionProfile, {
        chains: [3, 0, 0],
        refinements: [1, 1, 5],
    })
})

Deno.test("汇总：详情有全队 0+1 变体时下载成该档工程", () => {
    const zeroOne: ConvertProjectInput = {
        ...detail,
        summary: {
            configVariants: [
                { memberConfigs: ["3+1", "0+1", "5+1"] },
                { memberConfigs: ["0+1", "0+1", "0+1"] },
            ],
        },
    }

    const { project } = convertWuwaCalcProjectToCoconutProjectFile(
        zeroOne,
        tables,
    )

    // 链 / 精全部改写成 0+1，队伍键与条件门也跟着走
    assertEquals(
        project.team.map((slot) => [slot.chain, slot.refinement]),
        [
            [0, 1],
            [0, 1],
            [0, 1],
        ],
    )
    assertEquals(project.conditionProfile, {
        chains: [0, 0, 0],
        refinements: [1, 1, 1],
    })
    // 只改转换用的副本，不污染详情快照（下载缓存会复用 detail）
    assertEquals(detail.payload!.data!.members![0].resonanceUnlocked, 3)
    assertEquals(
        detail.payload!.data!.members![2].weaponSelection!.refinement,
        5,
    )
})

Deno.test("汇总：没有全队 0+1 变体时保持主配置", () => {
    const other: ConvertProjectInput = {
        ...detail,
        summary: {
            configVariants: [
                { memberConfigs: ["3+1", "0+1", "5+1"] },
                { memberConfigs: ["2+1", "0+1", "0+1"] },
            ],
        },
    }

    const { project } = convertWuwaCalcProjectToCoconutProjectFile(
        other,
        tables,
    )

    assertEquals(
        project.team.map((slot) => [slot.chain, slot.refinement]),
        [
            [3, 1],
            [0, 1],
            [0, 5],
        ],
    )
    assertEquals(project.conditionProfile, {
        chains: [3, 0, 0],
        refinements: [1, 1, 5],
    })
})

Deno.test("汇总：排轴与拉表已落地，无轴数据时给空结构而不是 null", () => {
    const { project } = convertWuwaCalcProjectToCoconutProjectFile(
        detail,
        tables,
    )

    // 夹具里没有 phases / specialSkills，所以轴是空的，但结构必须在
    assertEquals(project.phases.timeline.locked, true)
    assertEquals(project.phases.timeline.data, {
        refLines: [],
        opBlocks: [],
        damageBlocks: [],
    })
    assertEquals(project.phases.calculation.locked, true)
    assert(project.phases.calculation.data !== null, "calculation 应有数据")
    // 词条/环境对导入方开放编辑
    assertEquals(project.phases.config.locked, false)
    assert(project.phases.config.data !== null, "config 阶段应带数据")
})

Deno.test("汇总：队伍不足 3 人时补空位而不是缺项", () => {
    const { project } = convertWuwaCalcProjectToCoconutProjectFile({
        id: "x",
        payload: { data: { members: [{ name: "单人" }] } },
    }, tables)

    assertEquals(project.team.length, 3)
    assertEquals(project.team[0].character, "单人")
    assertEquals(project.team[1].character, null)
    // 声骸也补一个空的首位，保证 echoes[0] 一定存在
    assertEquals(project.team[1].echoes, [{ name: null, cost: 0 }])
    assertEquals(project.team[2].chain, 0)
})

Deno.test("汇总：空/畸形 payload 不抛错", () => {
    for (
        const input of [
            {},
            { payload: null },
            { payload: { data: null } },
            { payload: { data: { members: null, team: null } } },
        ] as ConvertProjectInput[]
    ) {
        const { project } = convertWuwaCalcProjectToCoconutProjectFile(
            input,
            tables,
        )
        assertEquals(project.team.length, 3)
        assertEquals(project.team[0].character, null)
        assertEquals(project.name, "")
        assertEquals(project.createdAt, 0)
    }
})

// ── 队伍配置 ──────────────────────────────────────────────────────────────────

Deno.test("队伍配置：武器与触发套装来自运行时名称表", () => {
    const { slots, lockedTeamKey, lockedTeamNames } = convertTeamPhase(
        detail.payload!.data,
        tables,
    )

    assertEquals(slots[0].weapon, "灼霜")
    assertEquals(slots[1].weapon, "存帧")
    assertEquals(slots[2].weapon, "异响空灵")
    // 5 件套同时触发 5 档与 2 档，形状与工具箱 fivePieceSelection() 一致
    assertEquals(slots[0].triggerSets, [
        { name: "雪落无声之愿", pieces: 5 },
        { name: "雪落无声之愿", pieces: 2 },
    ])
    assertEquals(slots[2].triggerSets, [
        { name: "星构寻辉之环", pieces: 5 },
        { name: "星构寻辉之环", pieces: 2 },
    ])
    // 武器名补齐后，工坊口径的「完整站位」判定才成立
    assertEquals(lockedTeamNames, ["绯雪", "洛瑟菈", "莫宁"])
    assertEquals(
        new Set(lockedTeamKey.split(",")),
        new Set(["绯雪", "洛瑟菈", "莫宁"]),
    )
})

Deno.test("队伍配置：名称表为空时相关字段留空、队伍键落空", () => {
    const { slots, lockedTeamKey, lockedTeamNames } = convertTeamPhase(
        detail.payload!.data,
        EMPTY_TABLES,
    )

    assertEquals(slots[0].weapon, null)
    assertEquals(slots[0].triggerSets, [])
    assertEquals(lockedTeamKey, "")
    assertEquals(lockedTeamNames, [])
    // 与名称表无关的字段照常带出
    assertEquals(slots[0].chain, 3)
    assertEquals(slots[0].echoes[0].name, "共鸣回响·鸣式·虚造神型")
})

Deno.test("队伍配置：件数不够档位时不触发套装", () => {
    const { slots } = convertTeamPhase(
        {
            members: [
                {
                    name: "只带 2 件",
                    weaponSelection: { id: "21020086", refinement: 1 },
                    echoConfig: { setLoadout: [{ count: 2, setId: "30" }] },
                },
            ],
        },
        tables,
    )

    assertEquals(slots[0].triggerSets, [{ name: "雪落无声之愿", pieces: 2 }])
})

// ── 环境 / 词条 ───────────────────────────────────────────────────────────────

Deno.test("环境配置：100 级 Boss，等级/防御/抗性按工坊口径推导", () => {
    const { data, locked } = convertConfigPhase(detail.payload!.data)
    const enemy = data!.enemy

    assertEquals(locked, false)
    // 上游不给怪物类型；工具箱会按类型取偏谐系数（BOSS 10027 / 精英怪 2149），
    // 鸣算屋的处决口径按 Boss 算，所以固定落 BOSS 而不是工具箱默认的「精英怪」
    assertEquals(enemy.type, "BOSS")
    assertEquals(enemy.level, 100)
    assertEquals(enemy.defense, 792 + 8 * 100)
    assertEquals(enemy.dmgReduction, 0)
    assertEquals(Object.keys(enemy.resistances).length, 7)
    assertEquals(new Set(Object.values(enemy.resistances)), new Set([20]))
})

Deno.test("环境配置：上游没给等级时缺省 100 级 Boss", () => {
    const { data } = convertConfigPhase({} as never)
    const enemy = data!.enemy

    assertEquals(enemy.type, "BOSS")
    assertEquals(enemy.level, 100)
    assertEquals(enemy.defense, 792 + 8 * 100)
})

Deno.test("环境配置：主词条按椰果满级上限落，元素增伤按 main1Element 拼名", () => {
    const { data } = convertConfigPhase(detail.payload!.data)
    const echoes = data!.characters[0].echoes

    assertEquals(echoes.length, 5)
    assertEquals(echoes.map((e) => e.cost), [4, 3, 3, 1, 1])
    assertEquals(echoes[0].mainStat, { type: "暴击伤害", value: 44, unit: "%" })
    assertEquals(echoes[1].mainStat, {
        type: "冷凝伤害加成",
        value: 30,
        unit: "%",
    })
    assertEquals(echoes[3].mainStat, { type: "攻击%", value: 18, unit: "%" })
    assertEquals(echoes[0].secondMainStat, {
        type: "攻击",
        value: 150,
        unit: "",
    })
    assertEquals(echoes[3].secondMainStat, {
        type: "生命",
        value: 2280,
        unit: "",
    })
    assertEquals(data!.characters.length, 3)
})

Deno.test("环境配置：副词条映射并保留伤害类型词条", () => {
    const { data } = convertConfigPhase(detail.payload!.data)

    assertEquals(data!.characters[0].echoes[0].substats, [
        { type: "暴击伤害", value: 15, unit: "%" },
        { type: "攻击%", value: 8.6, unit: "%" },
        { type: "共鸣效率", value: 10, unit: "%" },
        { type: "暴击率", value: 9.3, unit: "%" },
        { type: "共鸣解放伤害加成", value: 8.6, unit: "%" },
    ])
})

Deno.test("词条映射：主词条池按 cost 生效", () => {
    assertEquals(convertMainStat("main_crit_rate", 4, ""), {
        type: "暴击率",
        value: 22,
        unit: "%",
    })
    assertEquals(convertMainStat("main_atk_percent", 3, ""), {
        type: "攻击%",
        value: 30,
        unit: "%",
    })
    assertEquals(convertMainStat("main_healing_bonus", 4, ""), {
        type: "治疗加成",
        value: 26.4,
        unit: "%",
    })
    assertEquals(convertMainStat("main_energy_regen", 3, ""), {
        type: "共鸣效率",
        value: 32,
        unit: "%",
    })
    // 物理没有增伤主词条
    assertEquals(convertMainStat("main_element_dmg", 3, "物理"), null)
    // 词条不在该 cost 池子里
    assertEquals(convertMainStat("main_energy_regen", 4, ""), null)
    assertEquals(convertMainStat(null, 4, ""), null)
})

Deno.test("词条映射：副词条吸附到最近档位，并兼容旧版拆开的类型词条", () => {
    assertEquals(convertSubstat("sub_crit_dmg", 15, ""), {
        type: "暴击伤害",
        value: 15,
        unit: "%",
    })
    // 8.55 不在档位上 → 吸附到最近的 8.6
    assertEquals(convertSubstat("sub_atk_percent", 8.55, ""), {
        type: "攻击%",
        value: 8.6,
        unit: "%",
    })
    assertEquals(convertSubstat("sub_flat_hp", 390, ""), {
        type: "生命",
        value: 390,
        unit: "",
    })
    assertEquals(convertSubstat("sub_type_dmg", 8.6, "共鸣技能"), {
        type: "共鸣技能伤害加成",
        value: 8.6,
        unit: "%",
    })
    // 旧版按伤害类型拆开的 ID
    assertEquals(convertSubstat("sub_basic_dmg", 6.4, ""), {
        type: "普攻伤害加成",
        value: 6.4,
        unit: "%",
    })
    assertEquals(convertSubstat("sub_type_dmg", 8.6, ""), null)
    assertEquals(convertSubstat("sub_unknown", 8.6, ""), null)
})

// ── 排轴 ──────────────────────────────────────────────────────────────────────

/** 真实轴的摘录（MC-83S38T「爱达千」：阶段 + 目录 + 特殊技能） */
const axisPayload = {
    team: { axisDuration: 25 },
    members: [
        {
            name: "爱弥斯",
            char: { attrBonusSources: [{ id: "echo_panel_attr_热熔" }] },
            phases: [
                { name: "暖机阶段", skills: [] },
                {
                    name: "爆发阶段",
                    skills: [
                        { name: "机兵A1234", catalogId: "c1" },
                        { name: "E2", catalogId: "c2" },
                    ],
                },
            ],
            rotationCatalog: [
                {
                    id: "c1",
                    name: "机兵A1234",
                    damageType: "普攻",
                    axisOffsetPx: 8,
                    multCount: 1,
                    baseMult: 413.55,
                    multComponents: [],
                    librarySkillName: "共赴长航·普攻·机兵第一段",
                },
                {
                    id: "c2",
                    name: "E2",
                    damageType: "共鸣技能",
                    axisOffsetPx: 109,
                    multCount: 1,
                    baseMult: 163.27,
                    multComponents: [
                        { rate: 16.33, count: 3 },
                        { rate: 114.28, count: 1 },
                    ],
                    librarySkillName: "共赴长航·合击·突刺·启明之音",
                },
            ],
        },
    ],
    specialSkills: {
        characters: [
            { id: "id_159666", name: "爱弥斯" },
            { id: "id_160061", name: "达妮娅" },
        ],
        items: [
            {
                id: "s1",
                kind: "effect",
                name: "聚爆·普通光翼",
                effectType: "聚爆",
                effectLayers: 13,
                effectCount: 5,
                characterId: "id_159666",
                sourceRosterSlot: 0,
                linkedCatalogId: "c1",
            },
            {
                id: "s2",
                kind: "execution",
                name: "处决",
                characterId: "id_160061",
                sourceRosterSlot: 0,
                effectLayers: 0,
                linkedCatalogId: "c2",
            },
            {
                id: "s3",
                kind: "execution",
                name: "骇破响应·数据崩解",
                characterId: "id_160061",
                sourceRosterSlot: 0,
                effectLayers: 0,
                linkedCatalogId: "c2",
            },
        ],
    },
} as never

Deno.test("排轴：直伤落到参考线，一个技能只落一条倍率", () => {
    const { phase } = convertTimelinePhase(axisPayload)
    const data = phase.data!

    assertEquals(data.opBlocks, [])
    // 直伤 1 条 + 效应 1 条 + 处决/响应同线 1 条 + 技能各占 1 条 = 4 条伤害线，
    // 再加 1 条轮次边界 + 1 条「结束」
    assertEquals(data.refLines.length, 6)
    // 伤害块：两个直伤技能各一块 + 效应 + 处决 + 响应
    assertEquals(data.damageBlocks.length, 5)

    const first = data.damageBlocks[0]
    assertEquals(first.sourceType, "ref")
    // 一律挂「伤害绑定」轨（工具箱只渲染最后一轨的伤害块）
    assertEquals(first.trackIndex, 3)
    assertEquals(
        data.damageBlocks.every((b) => b.trackIndex === 3),
        true,
    )
    assertEquals(first.skillHits[0], {
        // 显示用**鸣算屋短名**（不是技能库全名「共赴长航·普攻·机兵第一段」）
        hitName: "机兵A1234",
        skillType: "常态攻击",
        ratio: "413.55%",
        element: "热熔",
        character: "爱弥斯",
        hits: 1,
        // 上游的伤害类型原样带到轴上，拉表用它落 `damageEntryDamageTypes`
        damageType: "普攻",
    })

    // 多段倍率 `16.33%×3 + 114.28%×1`：**一个技能一条**，分量写进同一条 ratio
    const skill = data.damageBlocks.filter((b) =>
        b.skillHits[0]?.hitName === "E2"
    )
    assertEquals(skill.length, 1)
    // 直接用上游的原始复合倍率 `baseMult`（16.33×3 + 114.28 = 163.27）
    assertEquals(skill[0].skillHits[0].ratio, "163.27%")
    assertEquals(skill[0].skillHits[0].hits, 1)
    // 合计仍是 163.27%（不拆段不改数值）
    assertEquals(
        Math.round(
            (16.33 * 3 + 114.28) * skill[0].skillHits[0].hits! * 100,
        ) / 100,
        163.27,
    )
})

Deno.test("排轴：参考线等距，末尾补「结束」线，time 是相对增量", () => {
    const { phase } = convertTimelinePhase(axisPayload)
    const refLines = phase.data!.refLines

    // 普通伤害节点**不带**时间标签（只有轮次边界与收尾带）
    assertEquals(
        refLines.filter((line) => line.time !== "").map((line) => line.time),
        ["+25s", "结束"],
    )

    // `pos` 等距（第 n 条 = n × step）
    const step = refLines[1].pos - refLines[0].pos
    assert(step > 0, "步长应为正")
    refLines.forEach((line, index) => {
        assertEquals(line.pos, index * step, `第 ${index} 条应等距`)
    })

    // 倒数第二条是轮次边界，末尾是「结束」线
    const last = refLines[refLines.length - 1]
    assertEquals(last.id, "end")
    assertEquals(last.time, "结束")
})

Deno.test("排轴：按站位分组铺开，1 号位排完再排 2、3 号位", () => {
    // 同一条轴上是同一时间点的三个人，跨站位按时间混排会分不清谁是谁的段；
    // 现在按「1 号位全部 → 2 号位全部 → 3 号位全部 → 该轮轴长参考线」铺
    const member = (name: string, tag: string) => ({
        name,
        char: { attrBonusSources: [{ id: "echo_main_panel_attr_热熔" }] },
        phases: [{
            skills: [{ name: `${tag}1`, catalogId: `${tag}1` }, {
                name: `${tag}2`,
                catalogId: `${tag}2`,
            }],
        }],
        rotationCatalog: [
            {
                id: `${tag}1`,
                name: `${tag}1`,
                damageType: "共鸣解放",
                // 故意让 2 号位的技能时间更早：分组后不该被插到 1 号位前面
                axisOffsetPx: 400,
                multCount: 1,
                baseMult: 100,
            },
            {
                id: `${tag}2`,
                name: `${tag}2`,
                damageType: "共鸣解放",
                axisOffsetPx: 800,
                multCount: 1,
                baseMult: 200,
            },
        ],
    })
    const payload = {
        team: { axisDuration: 25 },
        members: [member("甲", "a"), member("乙", "b"), member("丙", "c")],
    } as never

    const { phase } = convertTimelinePhase(payload)
    const blocks = phase.data!.damageBlocks

    const who = (index: number) => blocks[index].skillHits[0]?.character
    const hitName = (index: number) => blocks[index].skillHits[0]?.hitName
    // 前两块是甲的，接着乙、丙；各自内部按自己的轴顺序
    assertEquals([who(0), hitName(0)], ["甲", "a1"])
    assertEquals([who(1), hitName(1)], ["甲", "a2"])
    assertEquals([who(2), hitName(2)], ["乙", "b1"])
    assertEquals([who(3), hitName(3)], ["乙", "b2"])
    assertEquals([who(4), hitName(4)], ["丙", "c1"])
    assertEquals([who(5), hitName(5)], ["丙", "c2"])
    // 参考线间距收窄到 120：6 条伤害线 + 1 条轮次边界 + 1 条收尾
    assertEquals(phase.data!.refLines.map((line) => line.pos), [
        0,
        120,
        240,
        360,
        480,
        600,
        720,
        840,
    ])
})

Deno.test("排轴：多层轴按轮次铺开，每轮边界带轴长标签", () => {
    const payload = {
        team: { axisDuration: 25 },
        members: [
            {
                name: "甲",
                char: {
                    attrBonusSources: [{ id: "echo_main_panel_attr_热熔" }],
                },
                // 顶层 phases 只是 activeRound 那一轮
                phases: [{ skills: [{ name: "R2", catalogId: "c2" }] }],
                rotationCatalog: [
                    {
                        id: "c1",
                        name: "R1",
                        damageType: "共鸣解放",
                        axisOffsetPx: 8,
                        multCount: 1,
                        baseMult: 100,
                    },
                    {
                        id: "c2",
                        name: "R2",
                        damageType: "共鸣解放",
                        axisOffsetPx: 8,
                        multCount: 1,
                        baseMult: 200,
                    },
                ],
                cycleConfig: {
                    enabled: true,
                    count: 2,
                    activeRound: 1,
                    rounds: [
                        {
                            duration: 22,
                            phases: [{
                                skills: [{ name: "R1", catalogId: "c1" }],
                            }],
                        },
                        {
                            duration: 25,
                            phases: [{
                                skills: [{ name: "R2", catalogId: "c2" }],
                            }],
                        },
                    ],
                },
            },
        ],
    } as never

    const { phase, entries } = convertTimelinePhase(payload)
    const data = phase.data!

    // 两轮的伤害都进来了（不再只转 activeRound）
    assertEquals(entries.length, 2)
    assertEquals(entries.map((e) => e.hitName), ["R1", "R2"])
    // 轮次边界标签 = 各轮轴长
    assertEquals(
        data.refLines.filter((l) => l.time !== "").map((l) => l.time),
        ["+22s", "+25s", "结束"],
    )
    assertEquals(data.damageBlocks.length, 2)
})

Deno.test("排轴：参考线条数多时等比收窄，仍落在工具箱 MAX_POS 内", () => {
    const skills = Array.from({ length: 200 }, (_, i) => ({
        name: `S${i}`,
        catalogId: `c${i}`,
    }))
    const catalog = Array.from({ length: 200 }, (_, i) => ({
        id: `c${i}`,
        name: `S${i}`,
        damageType: "普攻",
        axisOffsetPx: i * 10,
        multCount: 1,
        multComponents: [{ rate: 100, count: 1 }],
    }))
    const { phase } = convertTimelinePhase({
        members: [{
            name: "甲",
            phases: [{ skills }],
            rotationCatalog: catalog,
        }],
    } as never)

    const refLines = phase.data!.refLines
    assert(refLines.length > 200, "应生成 200+ 条参考线")
    assert(
        refLines[refLines.length - 1].pos <= MAX_POS,
        `末条 pos=${refLines[refLines.length - 1].pos} 不应超过 ${MAX_POS}`,
    )
})

Deno.test("排轴：效应独立占线，处决与响应共用同一条线", () => {
    const { phase } = convertTimelinePhase(axisPayload)
    const blocks = phase.data!.damageBlocks

    const effect = blocks.find((b) =>
        b.nonDirectEntries[0]?.category === "效应"
    )!
    assertEquals(effect.nonDirectEntries[0], {
        name: "聚爆·普通光翼",
        category: "效应",
        layers: 13,
        hits: 5,
        character: "爱弥斯",
        element: "热熔",
    })

    // 处决 + 响应：两条 block 挂同一条参考线
    const execution = blocks.find((b) =>
        b.nonDirectEntries[0]?.category === "处决"
    )!
    const response = blocks.find((b) =>
        b.nonDirectEntries[0]?.category === "响应"
    )!
    assertEquals(execution.sourceId, response.sourceId)
    assertEquals(execution.nonDirectEntries[0], {
        name: "谐度破坏",
        category: "处决",
        layers: 0,
        responders: ["达妮娅"],
    })
    assertEquals(response.nonDirectEntries[0], {
        name: "骇破响应",
        category: "响应",
        layers: 0,
        responders: ["达妮娅"],
    })
})

Deno.test("排轴：派生出可被拉表绑定的伤害条目", () => {
    const { entries } = convertTimelinePhase(axisPayload)

    // 直伤 2 条（一个技能一条）+ 效应 1 条 + 处决 1 条 + 响应 1 条
    assertEquals(entries.length, 5)
    assertEquals(entries[0].character, "爱弥斯")
    // 条目 id 必须与工具箱 buildDamageEntriesFromTimeline 一致（用**显示名**拼）
    assertEquals(entries[0].id, "d0-常态攻击|机兵A1234#攻击")
    // 但条目认的名字里带着技能库全名，按 `librarySkillNames` 限定的 buff 才匹配得上
    assertEquals(entries[0].skillNames, [
        "机兵A1234",
        "共赴长航·普攻·机兵第一段",
    ])
    // sourceTimelineBlockId 存的是参考线 id（工具箱同款）
    assertEquals(entries[0].sourceTimelineBlockId, "r0")
    // 多段倍率不再拆段：一个技能只有一条伤害条目
    const skill = entries.filter((e) => e.hitName === "E2" && !e.isEffect)
    assertEquals(skill.map((e) => e.id), ["d2-共鸣技能|E2#攻击"])
    assertEquals(new Set(entries.map((e) => e.id)).size, entries.length)
    const tuneBreak = entries.find((e) => e.isTuneBreak)!
    assertEquals(tuneBreak.hitName, "谐度破坏")
    assertEquals(tuneBreak.id.startsWith("-nd|"), false)
    assertEquals(tuneBreak.id.endsWith("-nd|谐度破坏"), true)
    const effect = entries.find((e) => e.isEffect)!
    assertEquals(effect.hitName, "聚爆·普通光翼")
    assertEquals(effect.id.endsWith("-nd|聚爆·普通光翼"), true)
    // 响应按 responders 一人一条：`${blockId}-nd|${name}#${responder}`
    const response = entries.find((e) => e.isTuneResponse)!
    assertEquals(response.id.endsWith("-nd|骇破响应#达妮娅"), true)
    assertEquals(response.character, "达妮娅")
})

Deno.test("排轴：无轴数据时返回空结构而非 null", () => {
    const { phase, entries } = convertTimelinePhase({})
    assertEquals(phase, {
        locked: true,
        data: { refLines: [], opBlocks: [], damageBlocks: [] },
    })
    assertEquals(entries, [])
})

Deno.test("排轴：ratio 的词条后缀决定伤害条目 id 的 baseType", () => {
    // 无后缀 → 工具箱按「攻击」缩放（parse-value-string 的 SUFFIX_MAP['']）
    assertEquals(ratioBaseTypes("413.55%"), { pct: ["攻击"], hasFlat: false })
    assertEquals(ratioBaseTypes("9.31%*4+33.09%*2"), {
        pct: ["攻击"],
        hasFlat: false,
    })
    // 生命 / 防御缩放必须带后缀，否则算错且 id 落到 #攻击
    assertEquals(ratioBaseTypes("15.85%生命"), {
        pct: ["生命"],
        hasFlat: false,
    })
    assertEquals(ratioBaseTypes("10.2%生命+0.37%*19生命"), {
        pct: ["生命"],
        hasFlat: false,
    })
    // 纯数值分段落「固定」
    assertEquals(ratioBaseTypes("50"), { pct: [], hasFlat: true })
    assertEquals(ratioBaseTypes("100%+50"), { pct: ["攻击"], hasFlat: true })
})

Deno.test("排轴：生命缩放技能的 ratio 带「生命」后缀", () => {
    const payload = {
        members: [
            {
                name: "甲",
                char: { attrBonusSources: [{ id: "echo_panel_attr_湮灭" }] },
                phases: [{ skills: [{ name: "生命技能", catalogId: "h1" }] }],
                rotationCatalog: [
                    {
                        id: "h1",
                        name: "生命技能",
                        damageType: "共鸣解放",
                        scaleStat: "hp",
                        axisOffsetPx: 8,
                        multCount: 1,
                        baseMult: 58.92,
                        multComponents: [{ rate: 19.64, count: 3 }],
                        librarySkillName: "某·生命缩放技能",
                    },
                ],
            },
        ],
    } as never

    const { phase, entries } = convertTimelinePhase(payload)
    // 生命缩放的分量带「生命」后缀（否则工具箱按攻击缩放，id 也落到 #攻击）
    assertEquals(
        phase.data!.damageBlocks[0].skillHits[0].ratio,
        "58.92%生命",
    )
    assertEquals(phase.data!.damageBlocks[0].skillHits[0].hits, 1)
    // 显示名用轴上短名「生命技能」，认的名字里保留技能库全名，供 buff 名称匹配
    assertEquals(entries[0].id, "d0-共鸣解放|生命技能#生命")
    assertEquals(entries[0].skillNames, ["生命技能", "某·生命缩放技能"])
    assertEquals(entries[0].character, "甲")
})

Deno.test("排轴：倍率名用短名，一个技能一条，装备声骸技能用工具箱的「伤害N」", () => {
    const payload = {
        members: [
            {
                name: "甲",
                char: { attrBonusSources: [{ id: "echo_panel_attr_湮灭" }] },
                phases: [{
                    skills: [
                        { name: "蛰幻第一段", catalogId: "a" },
                        { name: "声骸·梦魇·赫卡忒", catalogId: "b" },
                        { name: "广域观测模式第三段", catalogId: "c" },
                    ],
                }],
                rotationCatalog: [
                    {
                        id: "a",
                        damageType: "共鸣技能",
                        axisOffsetPx: 8,
                        multCount: 1,
                        multComponents: [{ rate: 35.33, count: 3 }],
                        librarySkillName: "虚实之间·蛰幻第一段",
                    },
                    {
                        id: "b",
                        damageType: "声骸",
                        axisOffsetPx: 16,
                        multCount: 1,
                        multComponents: [{ rate: 152.38, count: 3 }],
                        librarySkillName: "声骸·梦魇·赫卡忒",
                    },
                    {
                        id: "c",
                        damageType: "普攻",
                        axisOffsetPx: 24,
                        multCount: 1,
                        multComponents: [
                            { rate: 9.31, count: 4 },
                            { rate: 33.09, count: 2 },
                        ],
                        librarySkillName: "基态校准·普攻·广域观测模式第三段",
                    },
                ],
            },
        ],
    } as never

    const { phase } = convertTimelinePhase(payload)
    assertEquals(
        phase.data!.damageBlocks.map((b) => b.skillHits[0].hitName),
        [
            // 短名（不是 `虚实之间·蛰幻第一段`）
            "蛰幻第一段",
            // 装备声骸技能：工具箱显示时会拼「装备声骸名·」，行名跟它自己的叫法「伤害N」
            "伤害1",
            // 多段倍率不再拆段：招式名里的「第三段」原样保留
            "广域观测模式第三段",
        ],
    )
})

Deno.test("排轴：声骸伤害按招式类别落 skillType，只有装备声骸才叫「声骸技能」", () => {
    const payload = {
        members: [
            {
                name: "弗洛洛",
                char: { attrBonusSources: [{ id: "echo_panel_attr_湮灭" }] },
                phases: [{
                    skills: [
                        { name: "声骸·梦魇·赫卡忒", catalogId: "echo" },
                        { name: "Q", catalogId: "q" },
                        { name: "普攻·赫卡忒第一段", catalogId: "na" },
                        { name: "强化攻击·彩乐·赫卡忒", catalogId: "ca" },
                    ],
                }],
                rotationCatalog: [
                    {
                        id: "echo",
                        damageType: "声骸",
                        axisOffsetPx: 8,
                        multCount: 1,
                        multComponents: [{ rate: 152.38, count: 3 }],
                    },
                    {
                        id: "q",
                        name: "Q",
                        damageType: "声骸",
                        axisOffsetPx: 16,
                        multCount: 1,
                        multComponents: [{ rate: 39.77, count: 4 }],
                    },
                    {
                        id: "na",
                        damageType: "声骸",
                        axisOffsetPx: 24,
                        multCount: 1,
                        multComponents: [{ rate: 27.84, count: 1 }],
                        librarySkillName: "往日深渊的圆舞曲·普攻·赫卡忒第一段",
                    },
                    {
                        id: "ca",
                        damageType: "声骸",
                        axisOffsetPx: 32,
                        multCount: 1,
                        multComponents: [{ rate: 104.38, count: 1 }],
                        librarySkillName:
                            "往日深渊的圆舞曲·强化攻击·彩乐·赫卡忒",
                    },
                ],
            },
        ],
    } as never

    const { entries } = convertTimelinePhase(payload)

    // 装备声骸技能：名字里看不出招式（`声骸·梦魇·赫卡忒`、轴上的 `Q`）→ 声骸技能。
    // 行名用工具箱自己的「伤害N」，这样显示成「梦魇·赫卡忒·伤害1(声骸技能)」而不是
    // 「梦魇·赫卡忒·梦魇·赫卡忒(声骸技能)」
    assertEquals(entries[0].skillType, "声骸技能")
    assertEquals(entries[0].hitName, "伤害1")
    assertEquals(entries[1].skillType, "声骸技能")
    assertEquals(entries[1].hitName, "伤害1")
    // 弗洛洛自己的赫卡忒招式：名字写了招式类别就按招式类别落，
    // 否则工具箱会给它们加上装备声骸（梦魇·赫卡忒）的前缀
    assertEquals(entries[2].skillType, "常态攻击")
    assertEquals(entries[2].id, "d2-常态攻击|普攻·赫卡忒第一段#攻击")
    assertEquals(entries[3].skillType, "常态攻击")
    assertEquals(entries[3].id, "d3-常态攻击|强化攻击·彩乐·赫卡忒#攻击")

    // **伤害类型不受影响**：仍然是声骸技能伤害（上游给了 damageType 就显式落）
    const { phase } = convertCalculationPhase(payload, entries, new Map())
    assertEquals(
        phase.data!.damageEntryDamageTypes[
            "d2-常态攻击|普攻·赫卡忒第一段#攻击"
        ],
        ["声骸技能伤害"],
    )
})

Deno.test("排轴+拉表：追加倍率单开「（额外）」条目，只加一次", () => {
    // 景燃「Z劫魄」那类：技能由多段倍率组成（16.40%×2 + 21.09%×3），
    // 同时又吃一条技能级追加倍率（命火 527.5%）。工具箱的 `extraRatio` 是逐命中
    // 加算，绑到技能本体上会被乘 hits —— 所以排轴为它单开一条倍率≈0、
    // `hits = 1` 的「（额外）」条目，追加倍率只挂它。
    const payload = {
        members: [
            {
                name: "景燃",
                resonanceUnlocked: 0,
                globalBuffActive: { pk_0_jingran_minghuo: true },
                char: { attrBonusSources: [{ id: "echo_panel_attr_热熔" }] },
                phases: [{ skills: [{ name: "Z劫魄", catalogId: "c1" }] }],
                rotationCatalog: [
                    {
                        id: "c1",
                        name: "Z劫魄",
                        damageType: "重击",
                        axisOffsetPx: 40,
                        multCount: 1,
                        baseMult: 96.07,
                        multComponents: [
                            { rate: 16.40, count: 2 },
                            { rate: 21.09, count: 3 },
                        ],
                        librarySkillName: "荧惑·重击·劫魄",
                    },
                ],
                buffs: [
                    {
                        id: "pk_0_jingran_minghuo",
                        name: "命火",
                        category: "composite",
                        mode: "fixed",
                        effects: [
                            {
                                zone: "multAdd",
                                valueMode: "fixed",
                                value: 527.5,
                                skillScope: "names",
                                librarySkillNames: ["荧惑·重击·劫魄"],
                            },
                        ],
                    },
                ],
            },
        ],
        team: {
            sharedBuffs: {
                buffs: [{
                    id: "zhongji",
                    name: "重击增伤",
                    category: "composite",
                    mode: "fixed",
                    effects: [
                        {
                            zone: "typeBonus",
                            valueMode: "fixed",
                            value: 30,
                            damageType: "重击",
                        },
                    ],
                }],
                globalBuffActive: { zhongji: true },
            },
        },
    } as never

    const { phase, entries, entryState } = convertTimelinePhase(payload)
    const blocks = phase.data!.damageBlocks

    // 技能本体 + 一条（额外）
    assertEquals(blocks.length, 2)
    assertEquals(blocks.map((b) => b.skillHits[0].hitName), [
        "Z劫魄",
        "Z劫魄（额外）",
    ])
    assertEquals(blocks.map((b) => b.skillHits[0].ratio), [
        // 原始复合倍率：16.4×2 + 21.09×3 = 96.07
        "96.07%",
        EXTRA_RATIO_PLACEHOLDER,
    ])
    assertEquals(blocks.map((b) => b.skillHits[0].hits), [1, 1])
    // 两条共用同一条参考线：轴不会因为多一条「（额外）」而变长
    assertEquals(new Set(blocks.map((b) => b.sourceId)).size, 1)
    // 占位倍率不是为了打伤害，只为了让工具箱保留这条行
    assertEquals(ratioBaseTypes(EXTRA_RATIO_PLACEHOLDER).pct, ["攻击"])

    const { phase: calc } = convertCalculationPhase(
        payload,
        entries,
        entryState,
    )
    const bound = Object.entries(calc.data!.damageEntryBuffSetIds)
        .filter(([, ids]) => ids.includes("pk_0_jingran_minghuo·extraRatio"))
        .map(([id]) => id)
    // 命火只绑「（额外）」那一条
    assertEquals(bound, ["d1-常态攻击|Z劫魄（额外）#攻击"])
    // 重击增伤（按类型条件的增伤）照旧绑到每一条上，包括（额外）—— 追加的倍率
    // 属于这个技能的伤害，该吃的增伤一分不少
    assertEquals(
        Object.entries(calc.data!.damageEntryBuffSetIds)
            .filter(([, ids]) => ids.includes("zhongji·bonusDmg"))
            .map(([id]) => id),
        [
            "d0-常态攻击|Z劫魄#攻击",
            "d1-常态攻击|Z劫魄（额外）#攻击",
        ],
    )
})

Deno.test("拉表：显示名缩成短名后，按技能库全名限定的 buff 仍绑得上", () => {
    const payload = {
        team: {
            sharedBuffs: {
                buffs: [{
                    id: "b",
                    name: "启明之音倍率提升",
                    category: "composite",
                    mode: "fixed",
                    effects: [{
                        zone: "multBoost",
                        valueMode: "fixed",
                        value: 50,
                        skillScope: "names",
                        librarySkillNames: ["共赴长航·合击·突刺·启明之音"],
                    }],
                }],
                globalBuffActive: { b: true },
            },
        },
        members: (axisPayload as never as { members: unknown }).members,
        specialSkills:
            (axisPayload as never as { specialSkills: unknown }).specialSkills,
    } as never

    const { entries, entryState } = convertTimelinePhase(payload)
    const { phase, buffs } = convertCalculationPhase(
        payload,
        entries,
        entryState,
    )

    // 轴上显示的是短名（`E2`），而 buff 里写的是技能库全名 —— 靠 `entry.skillNames` 对上
    assertEquals(buffs.map((b) => b.id), ["b·specialFinal1"])
    assertEquals(
        Object.entries(phase.data!.damageEntryBuffSetIds)
            .filter(([, ids]) => ids.includes("b·specialFinal1"))
            .map(([id]) => id),
        ["d2-共鸣技能|E2#攻击"],
    )
})

// ── 拉表 ──────────────────────────────────────────────────────────────────────

Deno.test("拉表：乘区对照与数值折算", () => {
    const { phase } = convertCalculationPhase({
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "b1",
                        name: "光殉·攻击",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 24,
                    },
                    {
                        id: "b2",
                        name: "雪落无声之愿",
                        category: "elementBonus",
                        mode: "fixed",
                        value: 25,
                        element: "冷凝",
                    },
                    {
                        id: "b3",
                        name: "雪锈",
                        category: "composite",
                        mode: "stack",
                        effects: [
                            {
                                zone: "typeDeep",
                                valueMode: "fixed",
                                value: 30,
                                damageType: "效应",
                                minStacks: 1,
                            },
                        ],
                    },
                ],
                globalBuffActive: { b1: true, b2: true, b3: true },
                globalBuffStacks: { b3: 3 },
            },
        },
    } as never)

    const buffs = phase.data!.buffSets
    // 一条 buff 只带一种乘区，名字/id 都带乘区后缀
    assertEquals(buffs.find((b) => b.id === "b1·atkPct")!.zones, [
        { zoneId: "atkPct", value: 24 },
    ])
    assertEquals(
        buffs.find((b) => b.id === "b1·atkPct")!.name,
        "光殉·攻击·攻击",
    )
    // 元素增伤带属性条件
    assertEquals(buffs.find((b) => b.id === "b2·bonusDmg")!.zones, [
        { zoneId: "bonusDmg", value: 25, condition: { elements: ["冷凝"] } },
    ])
    // 类型加深带伤害类型条件
    assertEquals(buffs.find((b) => b.id === "b3·deepenDmg")!.zones, [
        {
            zoneId: "deepenDmg",
            value: 30,
            // 伤害类型条件必须是全名（工具箱比对的是 inferDamageTypes 的返回值）
            condition: { damageTypes: ["效应伤害"] },
        },
    ])
})

Deno.test("拉表：叠层取轴上用到的层数，值是该层的累计值", () => {
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "s1",
                        name: "分档叠层",
                        category: "composite",
                        mode: "stack",
                        effects: [
                            {
                                zone: "generalAttack",
                                valueMode: "stack",
                                segments: [
                                    { upTo: 1, perStack: 10 },
                                    { upTo: null, perStack: 5 },
                                ],
                                minStacks: 0,
                            },
                        ],
                    },
                    {
                        id: "s2",
                        name: "门槛叠层",
                        category: "composite",
                        mode: "stack",
                        effects: [
                            {
                                zone: "generalAttack",
                                valueMode: "stack",
                                segments: [{ upTo: null, perStack: 4 }],
                                minStacks: 5,
                            },
                        ],
                    },
                ],
                globalBuffActive: { s1: true, s2: true },
            },
        },
    } as never

    const entries = [
        {
            id: "d0",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r0",
            hits: 1,
        },
        {
            id: "d1",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻2",
            displayName: "普攻2",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r1",
            hits: 1,
        },
    ] as never
    // 轴上用到 1 层与 3 层两个档位（层数由排轴阶段解析好）
    const entryState = new Map([
        ["d0", { active: { s1: true, s2: true }, stacks: { s1: 1, s2: 1 } }],
        ["d1", { active: { s1: true, s2: true }, stacks: { s1: 3, s2: 3 } }],
    ])

    const { buffs, phase } = convertCalculationPhase(
        payload,
        entries,
        entryState as never,
    )

    // 只给**用到过**的层数各出一条，值是该层的累计值：1 层 10、3 层 10+5+5=20
    assertEquals(
        buffs.filter((b) => b.id.startsWith("s1")).map((b) => ({
            id: b.id,
            name: b.name,
            zones: b.zones,
        })),
        [
            {
                id: "s1·atkPct#L1",
                name: "分档叠层·攻击 1层",
                zones: [{ zoneId: "atkPct", value: 10 }],
            },
            {
                id: "s1·atkPct#L3",
                name: "分档叠层·攻击 3层",
                zones: [{ zoneId: "atkPct", value: 20 }],
            },
        ],
    )
    // 每条只绑到**恰好**那一层的条目
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: ["s1·atkPct#L1"],
        d1: ["s1·atkPct#L3"],
    })
    // s2 只用到 3 层 < minStacks 5 → 哪一层都不计入；条目留在列表里（值 0）但不勾选
    assertEquals(
        buffs.filter((b) => b.id === "s2·atkPct").map((b) => ({
            id: b.id,
            value: b.zones[0].value,
        })),
        [{ id: "s2·atkPct", value: 0 }],
    )
    assertEquals(
        Object.values(phase.data!.damageEntryBuffSetIds).some((ids) =>
            ids.includes("s2·atkPct")
        ),
        false,
    )
})

Deno.test("拉表：叠层按各技能用到的层数逐层勾选", () => {
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "st",
                        name: "祸兮福兮",
                        category: "elementBonus",
                        element: "热熔",
                        mode: "stack",
                        perStack: 2.5,
                        maxStacks: 50,
                    },
                ],
                globalBuffActive: { st: true },
            },
        },
    } as never

    const entries = [0, 1, 2, 3].map((n) => ({
        id: `d${n}`,
        character: "甲",
        skillType: "常态攻击",
        hitName: `普攻${n}`,
        displayName: `普攻${n}`,
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "热熔",
        sourceTimelineBlockId: `r${n}`,
        hits: 1,
    }))
    // 轴上各时点用到的层数：0 / 45 / 50 / 50
    const entryState = new Map(
        entries.map((e, i) => [e.id, {
            active: { st: true },
            stacks: { st: i === 0 ? 0 : i === 1 ? 45 : 50 },
        }]),
    )

    const { buffs, phase } = convertCalculationPhase(
        payload,
        entries as never,
        entryState as never,
    )
    const bind = phase.data!.damageEntryBuffSetIds

    // 用到的 45 / 50 层各一条，名字带层号，值是那一层的累计值
    assertEquals(
        buffs.map((b) => ({ id: b.id, name: b.name, value: b.zones[0].value })),
        [
            { id: "st·bonusDmg#L45", name: "祸兮福兮·增伤 45层", value: 112.5 },
            { id: "st·bonusDmg#L50", name: "祸兮福兮·增伤 50层", value: 125 },
        ],
    )
    // 0 层不吃；45 / 50 层各自吃自己那一条
    assertEquals(bind.d0, undefined)
    assertEquals(bind.d1, ["st·bonusDmg#L45"])
    assertEquals(bind.d2, ["st·bonusDmg#L50"])
    assertEquals(bind.d3, ["st·bonusDmg#L50"])
})

Deno.test("拉表：未生效的 buff 跳过，excludeSource 剔除来源站位", () => {
    const payload = {
        members: [
            { name: "甲", resonanceUnlocked: 0 },
            { name: "乙", resonanceUnlocked: 0 },
            { name: "丙", resonanceUnlocked: 0 },
        ],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "off",
                        name: "没开",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 10,
                    },
                    {
                        id: "outro",
                        name: "延奏",
                        category: "elementDeep",
                        mode: "fixed",
                        value: 20,
                        element: "冷凝",
                        excludeSource: true,
                        sourceMemberIndex: 0,
                    },
                ],
                globalBuffActive: { off: false, outro: true },
            },
        },
    } as never

    const { buffs, phase } = convertCalculationPhase(payload)
    // 未生效的 buff 仍留在列表里（可在工具箱里勾回来），但不参与勾选
    assert(
        buffs.some((b) => b.id === "off·atkPct"),
        "未生效的 buff 不应从列表中消失",
    )
    assertEquals(
        Object.values(phase.data!.damageEntryBuffSetIds).some((ids) =>
            ids.includes("off·atkPct")
        ),
        false,
        "未生效的 buff 不应被勾选",
    )
    // 队伍级 → all，但来源站位 0 被剔除
    assertEquals(buffs.find((b) => b.id === "outro·deepenDmg")!.scope, [1, 2])
})

Deno.test("拉表：技能限定只绑名称匹配的伤害条目", () => {
    const payload = {
        members: [
            {
                name: "甲",
                resonanceUnlocked: 0,
                globalBuffActive: { sk: true },
                buffs: [
                    {
                        id: "sk",
                        name: "指定技能倍率提升",
                        category: "composite",
                        mode: "fixed",
                        effects: [
                            {
                                zone: "multBoost",
                                valueMode: "fixed",
                                value: 120,
                                skillScope: "names",
                                librarySkillNames: ["普攻·居合"],
                            },
                        ],
                    },
                ],
            },
        ],
    } as never

    const entries = [
        {
            id: "d0",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻·居合",
            displayName: "普攻·居合",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "",
            damageElement: "",
            sourceTimelineBlockId: "d0",
            hits: 1,
        },
        {
            id: "d1",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻·其它",
            displayName: "普攻·其它",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "",
            damageElement: "",
            sourceTimelineBlockId: "d1",
            hits: 1,
        },
    ]

    const { phase, buffs } = convertCalculationPhase(payload, entries)

    // 「倍率提升」是乘在整段伤害上的 → 工具箱的特殊终伤(1)
    assertEquals(buffs[0].zones, [{ zoneId: "specialFinal1", value: 120 }])
    // 只绑到名字对上的那条
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: ["sk·specialFinal1"],
    })
})

Deno.test("拉表：倍率提升落特殊终伤(1)，倍率追加才落额外倍率", () => {
    const payload = {
        members: [
            {
                name: "甲",
                resonanceUnlocked: 0,
                buffs: [
                    {
                        id: "boost",
                        name: "一链",
                        category: "composite",
                        mode: "fixed",
                        effects: [{
                            zone: "multBoost",
                            valueMode: "fixed",
                            value: 50,
                            damageType: "共鸣技能",
                        }],
                    },
                    {
                        id: "add",
                        name: "余响",
                        category: "composite",
                        mode: "stack",
                        maxStacks: 124,
                        perStack: 82.55,
                        effects: [{
                            zone: "multAdd",
                            valueMode: "stack",
                            value: 0,
                            segments: [{ upTo: 24, perStack: 82.55 }],
                            damageType: "共鸣技能",
                        }],
                    },
                ],
            },
        ],
    } as never

    // 轴上出现过的层数各一条：24（封顶那层）、100、124（封顶之后）
    const entries = [24, 100, 124].map((_, i) => ({
        id: `d${i}`,
        character: "甲",
        skillType: "共鸣技能",
        hitName: "谱曲终末",
        displayName: "谱曲终末",
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "湮灭",
        sourceTimelineBlockId: `d${i}`,
        hits: 1,
    }))

    const state = new Map(
        [24, 100, 124].map((n, i) => [
            `d${i}`,
            { stacks: { add: n }, active: {} },
        ]),
    ) as never

    const { buffs } = convertCalculationPhase(payload, entries as never, state)

    const byName = new Map(buffs.map((b) => [b.name, b.zones[0]]))
    // 「伤害倍率提升50%」：×1.5 的最终乘区。
    // 不挂 `damageType` 条件：上游 `multBoost` 的 `damageType` 只是**概要**
    // （卡提希娅2链「普攻、重击、闪避反击、变奏技能倍率提升50%」的 dt 写的是「普攻」），
    // 当成条件会把重击/变奏那几条挡掉，定位始终靠 `skillNames` → 条目名。
    assertEquals(byName.get("一链·特殊终伤(1)"), {
        zoneId: "specialFinal1",
        value: 50,
    })
    // 「每层倍率额外增加82.55%（至多24层）」：加到倍率数值上，且**到 24 层封顶**
    assertEquals(byName.get("余响·额外倍率 24层"), {
        zoneId: "extraRatio",
        value: 1981.2,
    })
    assertEquals(byName.get("余响·额外倍率 124层"), {
        zoneId: "extraRatio",
        value: 1981.2,
    })
    // 25..124 层都是封顶值，不会一路涨到 124 × 82.55
    assertEquals(byName.get("余响·额外倍率 100层"), {
        zoneId: "extraRatio",
        value: 1981.2,
    })
})

Deno.test("拉表：固定段与叠层段拆成两条，固定段不受层数门槛约束", () => {
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "mix",
                        name: "固定加叠层",
                        category: "composite",
                        mode: "stack",
                        maxStacks: 5,
                        effects: [
                            {
                                zone: "generalAttack",
                                valueMode: "fixed",
                                value: 12,
                            },
                            {
                                zone: "generalDeep",
                                valueMode: "stack",
                                segments: [{ upTo: null, perStack: 6 }],
                                minStacks: 0,
                            },
                        ],
                    },
                ],
                globalBuffActive: { mix: true },
            },
        },
    } as never

    const entries = [0, 1].map((n) => ({
        id: `d${n}`,
        character: "甲",
        skillType: "常态攻击",
        hitName: `普攻${n}`,
        displayName: `普攻${n}`,
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "",
        sourceTimelineBlockId: `r${n}`,
        hits: 1,
    }))
    // 轴上只叠到 2 层：固定段不设门槛，叠层段到第 2 层为止
    const entryState = new Map([
        ["d0", { active: { mix: true }, stacks: { mix: 2 } }],
        ["d1", { active: { mix: true }, stacks: { mix: 1 } }],
    ])

    const { buffs, phase } = convertCalculationPhase(
        payload,
        entries as never,
        entryState as never,
    )

    assertEquals(
        buffs.map((b) => ({ id: b.id, name: b.name, zones: b.zones })),
        [
            {
                id: "mix·atkPct",
                name: "固定加叠层·攻击",
                zones: [{ zoneId: "atkPct", value: 12 }],
            },
            {
                id: "mix·deepenDmg#L1",
                name: "固定加叠层·加深 1层",
                zones: [{ zoneId: "deepenDmg", value: 6 }],
            },
            {
                id: "mix·deepenDmg#L2",
                name: "固定加叠层·加深 2层",
                // 累计值：第 1、2 层各 6 → 12
                zones: [{ zoneId: "deepenDmg", value: 12 }],
            },
        ],
    )
    // 固定段两条都吃；叠层段按各自用到的层数吃
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: ["mix·atkPct", "mix·deepenDmg#L2"],
        d1: ["mix·atkPct", "mix·deepenDmg#L1"],
    })
})

Deno.test("拉表：层数取轴上到过的层数，`maxStacks` 只是上限", () => {
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "huoxi",
                        name: "祸兮福兮",
                        category: "elementBonus",
                        element: "热熔",
                        mode: "stack",
                        perStack: 2.5,
                        maxStacks: 50,
                    },
                ],
                globalBuffActive: { huoxi: true },
                globalBuffStacks: { huoxi: 0 },
            },
        },
    } as never

    const { buffs, phase } = convertCalculationPhase(
        payload,
        [{
            id: "d0",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "热熔",
            sourceTimelineBlockId: "r0",
            hits: 1,
        } as never],
        new Map([["d0", {
            active: { huoxi: true },
            stacks: { huoxi: 0 },
        }]]) as never,
    )

    // 轴上没叠到层 → 只出一条占位（不能按 `maxStacks` 铺 50 条），值为 0
    assertEquals(
        buffs.map((b) => ({ id: b.id, name: b.name, value: b.zones[0].value })),
        [
            { id: "huoxi·bonusDmg", name: "祸兮福兮·增伤", value: 0 },
        ],
    )
    // 该条目 0 层 → 不勾选（条目仍留在列表里可手动勾回）
    assertEquals(phase.data!.damageEntryBuffSetIds, {})
})

Deno.test("拉表：队伍级 buff 的成员 `tm_` 副本不重复计入，层数读副本上的逐技能状态", () => {
    const stackCopy = (owner: number) => ({
        id: "tm_team_aura",
        name: "队伍光环",
        category: "composite",
        mode: "stack",
        maxStacks: 10,
        effects: [{
            zone: "generalDeep",
            valueMode: "stack",
            segments: [{ upTo: null, perStack: 4 }],
            minStacks: 0,
        }],
        owner,
    })
    const payload = {
        members: [
            { name: "甲", resonanceUnlocked: 0, buffs: [stackCopy(0)] },
            { name: "乙", resonanceUnlocked: 0, buffs: [stackCopy(1)] },
        ],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "team_aura",
                        name: "队伍光环",
                        category: "composite",
                        mode: "stack",
                        maxStacks: 10,
                        effects: [{
                            zone: "generalDeep",
                            valueMode: "stack",
                            segments: [{ upTo: null, perStack: 4 }],
                            minStacks: 0,
                        }],
                    },
                ],
                globalBuffActive: { team_aura: true },
                globalBuffStacks: { team_aura: 0 },
            },
        },
    } as never

    const entries = [
        {
            id: "d0",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r0",
            hits: 1,
        },
    ]
    // 轴上逐技能状态用的是 `tm_` 前缀的 id
    const entryState = new Map([
        ["d0", { active: { tm_team_aura: true }, stacks: { tm_team_aura: 2 } }],
    ])

    const { buffs, phase } = convertCalculationPhase(
        payload,
        entries as never,
        entryState as never,
    )

    // 只有原始条目那一条族，没有 `tm_` 前缀的重复族；层数按用到的层数各一条
    assertEquals(
        buffs.map((b) => ({ id: b.id, name: b.name, value: b.zones[0].value })),
        [{ id: "team_aura·deepenDmg#L2", name: "队伍光环·加深 2层", value: 8 }],
    )
    // 层数从 `tm_` 形态的逐技能状态读到
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: ["team_aura·deepenDmg#L2"],
    })
})

Deno.test("拉表：层数记在吃效果的技能上（终结），追加倍率只绑「（额外）」条目", () => {
    // 上游把逐技能层数写在 `round.catalogStacks[catalogId]` 上（排轴阶段解析进 entryState），
    // 所以「锯环·终结」自己那一格就带着 72 层，不需要拿前面疾攻段的层数去兜。
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "fin",
                        name: "万缕·汇终",
                        category: "composite",
                        mode: "stack",
                        maxStacks: 100,
                        effects: [
                            {
                                zone: "multAdd",
                                valueMode: "stack",
                                segments: [{ upTo: null, perStack: 2.59 }],
                                minStacks: 0,
                                skillScope: "names",
                                librarySkillNames: ["锯环·终结"],
                            },
                        ],
                    },
                ],
                globalBuffActive: { fin: true },
            },
        },
    } as never

    const entry = (n: number, name: string) => ({
        id: `d${n}`,
        character: "甲",
        skillType: "常态攻击",
        hitName: name,
        displayName: name,
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "",
        sourceTimelineBlockId: `r${n}`,
        hits: 1,
    })
    const entries = [
        entry(0, "疾攻"),
        // 技能段本身**不带**额外倍率（绑到本体上会被乘 hits）
        entry(1, "锯环·终结"),
        // 排轴为追加倍率单开的「（额外）」条目
        {
            ...entry(2, "锯环·终结（额外）"),
            extraRatioKeys: [{
                buffId: "fin",
                layer: 72,
                skillNamesKey: "锯环·终结",
            }],
        },
    ]
    const entryState = new Map([
        // 疾攻不生效（buffActive=false）；终结生效且自己带 72 层
        ["d0", { active: { fin: false }, stacks: { fin: 0 } }],
        ["d1", { active: { fin: true }, stacks: { fin: 72 } }],
        ["d2", { active: { fin: true }, stacks: { fin: 72 } }],
    ])

    const { buffs, phase } = convertCalculationPhase(
        payload,
        entries as never,
        entryState as never,
    )

    // 只出「72层」那一条，值是 72 层的累计值（2.59 × 72 = 186.48）；
    // 只有一个乘区，所以名字不带乘区后缀
    assertEquals(
        buffs.map((b) => ({ id: b.id, name: b.name, value: b.zones[0].value })),
        [{
            id: "fin·extraRatio#L72",
            name: "万缕·汇终·额外倍率 72层",
            value: 186.48,
        }],
    )
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d2: ["fin·extraRatio#L72"],
    })
})

Deno.test("拉表：上游的伤害类型显式落到 damageEntryDamageTypes", () => {
    const entry = (
        n: number,
        damageType: string | undefined,
        hitName: string,
        skillType = "常态攻击",
    ) => ({
        id: `d${n}`,
        character: "甲",
        skillType,
        hitName,
        displayName: hitName,
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "",
        sourceTimelineBlockId: `r${n}`,
        hits: 1,
        ...(damageType ? { damageType } : {}),
    })

    const { phase } = convertCalculationPhase({} as never, [
        // 库名里没有「重击」二字，靠推断只会得到普攻伤害 —— 这正是要修的那类
        entry(0, "重击", "万声浮道·苍剑式"),
        entry(1, "普攻", "济善伐恶·普攻·苍剑式第一段"),
        entry(2, "共鸣解放", "即刻·归无·技能", "共鸣解放"),
        // 上游没给类型 → 不写，留给工具箱按自己的规则推断（含依赖角色文案的规则 2）
        entry(3, undefined, "自定义招式"),
    ])

    assertEquals(phase.data!.damageEntryDamageTypes, {
        d0: ["重击伤害"],
        d1: ["普攻伤害"],
        d2: ["共鸣解放伤害"],
    })
})

Deno.test("拉表：伤害类型条件按上游类型判定，不受技能名影响", () => {
    const payload = {
        members: [{ name: "甲", resonanceUnlocked: 0 }],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "heavy",
                        name: "重击加深",
                        category: "typeDeep",
                        damageType: "重击",
                        mode: "fixed",
                        value: 30,
                    },
                ],
                globalBuffActive: { heavy: true },
            },
        },
    } as never

    const entries = [
        {
            id: "d0",
            character: "甲",
            skillType: "常态攻击",
            // 名字里没有「重击」，但上游说了它是重击
            hitName: "万声浮道·苍剑式",
            displayName: "万声浮道·苍剑式",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r0",
            hits: 1,
            damageType: "重击",
        },
        {
            id: "d1",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻·苍剑式第一段",
            displayName: "普攻·苍剑式第一段",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r1",
            hits: 1,
            damageType: "普攻",
        },
    ] as never

    const { phase } = convertCalculationPhase(payload, entries)

    // 类型条件命中的那条才勾上；同时类型表也要跟着落下来
    assertEquals(phase.data!.damageEntryBuffSetIds, { d0: ["heavy·deepenDmg"] })
    assertEquals(phase.data!.damageEntryDamageTypes, {
        d0: ["重击伤害"],
        d1: ["普攻伤害"],
    })
})

Deno.test("拉表：buff 带上「参考本体 / 参考武器 / 参考某人共鸣链」的归属门", () => {
    // 工具箱左侧列表的二级目录就是按链/阶条件分的：
    // `chains[{min:0}]` → 角色名本体、`chains[{min:N}]` → 角色名N链、
    // `refinements` → 角色名的武器名
    const payload = {
        members: [
            {
                name: "清宵",
                resonanceUnlocked: 6,
                buffs: [
                    {
                        id: "pk_0_qingxiao_minghuo",
                        name: "【本体】命火",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 20,
                    },
                    {
                        id: "pk_0_qingxiao_c3_wanwu_mult",
                        name: "【本体】3链·万物和鸣",
                        templateKey: "qingxiao_c3_wanwu_mult",
                        category: "multAdd",
                        mode: "fixed",
                        value: 30,
                    },
                    {
                        id: "pk_0_qingxiao_c4_team_atk",
                        name: "【本体】4链·清宵",
                        // 上游不在 minResonance 上写链档，档位只在 templateKey / 名字里
                        templateKey: "qingxiao_c4_team_atk",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 20,
                    },
                    {
                        id: "weapon_fx_21050076_2_0",
                        name: "[武器] 寂刃·攻击",
                        weaponId: "21050076",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 14,
                    },
                ],
            },
            { name: "达妮娅", resonanceUnlocked: 0, buffs: [] },
        ],
        team: { sharedBuffs: { buffs: [] } },
    } as never

    const { buffs } = convertCalculationPhase(payload, [] as never)

    const gateOf = (id: string) =>
        buffs.find((b) => b.id.startsWith(id))?.condition
    // 角色本体 → 0 链门
    assertEquals(gateOf("pk_0_qingxiao_minghuo·"), {
        chains: [{ charIdx: 0, min: 0 }],
    })
    // 「3链」「4链」按 templateKey / 名字里的档位走
    assertEquals(gateOf("pk_0_qingxiao_c3_wanwu_mult·"), {
        chains: [{ charIdx: 0, min: 3 }],
    })
    assertEquals(gateOf("pk_0_qingxiao_c4_team_atk·"), {
        chains: [{ charIdx: 0, min: 4 }],
    })
    // 武器 → 精炼门（落「角色名的武器名」目录）
    assertEquals(gateOf("weapon_fx_21050076_2_0·"), {
        refinements: [{ charIdx: 0, min: 0 }],
    })
})

Deno.test("拉表：分配覆盖里取消勾选的角色不吃这条全队 buff", () => {
    // 上游「提供的全队 Buff」面板右侧头像下的勾选存在 members[i].excludedTeamBuffIds：
    // 实测 MC-JXUQZU 的「弗洛洛·延奏」只勾了莫宁，漏读这个会让坎特蕾拉也吃到
    const payload = {
        members: [
            {
                name: "弗洛洛",
                resonanceUnlocked: 0,
                // 自己提供的延奏自己不吃（excludeSource 已覆盖），上游这里也写了一遍
                excludedTeamBuffIds: ["outro", "nobody"],
                buffs: [],
            },
            {
                name: "坎特蕾拉",
                resonanceUnlocked: 0,
                // 手动取消勾选
                excludedTeamBuffIds: ["outro", "nobody"],
                manuallyExcludedTeamBuffIds: ["outro"],
                buffs: [],
            },
            {
                name: "莫宁",
                resonanceUnlocked: 0,
                // 声骸 buff 也用成员副本的 `tm_` 形态记了一份
                excludedTeamBuffIds: ["tm_set_atk", "nobody"],
                buffs: [],
            },
        ],
        team: {
            sharedBuffs: {
                buffs: [
                    {
                        id: "outro",
                        name: "弗洛洛·延奏",
                        category: "generalDeep",
                        mode: "fixed",
                        value: 20,
                        excludeSource: true,
                        sourceMemberIndex: 0,
                    },
                    {
                        id: "set_atk",
                        name: "全队攻击",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 15,
                    },
                    {
                        id: "nobody",
                        name: "谁都不吃",
                        category: "generalAttack",
                        mode: "fixed",
                        value: 10,
                    },
                ],
                globalBuffActive: { outro: true, set_atk: true, nobody: true },
            },
        },
    } as never

    const entries = ["弗洛洛", "坎特蕾拉", "莫宁"].map((name, i) => ({
        id: `d${i}`,
        character: name,
        skillType: "常态攻击",
        hitName: "普攻",
        displayName: "普攻",
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "",
        sourceTimelineBlockId: `r${i}`,
        hits: 1,
    })) as never

    const { buffs, phase } = convertCalculationPhase(payload, entries)

    const scopeOf = (id: string) =>
        buffs.find((b) => b.id.startsWith(id))?.scope
    // 延奏：来源不吃 + 坎特蕾拉取消 → 只剩莫宁
    assertEquals(scopeOf("outro·"), [2])
    // 声骸全队攻击：莫宁用 `tm_` 形态取消 → 前两人
    assertEquals(scopeOf("set_atk·"), [0, 1])
    // 谁都不吃 → 整条不落表（`scope: []` 在椰果里是「仅效应伤害」，不能拿来表达空集）
    assertEquals(buffs.find((b) => b.id.startsWith("nobody")), undefined)
    // 勾选状态跟着 scope 走
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: ["set_atk·atkPct"],
        d1: ["set_atk·atkPct"],
        d2: ["outro·deepenDmg"],
    })
})

Deno.test("拉表：主位声骸的专属被动也 buff 化（绯雪的「主位·冷凝伤」）", () => {
    // `echo_main_panel_*` 不是声骸主词条，而是**主位声骸的专属被动**
    // （「在首位装配该声骸时，自身冷凝伤害加成提升12%」）。工具箱的声骸数据
    // 只有主副词条，没有这条被动，所以必须由 Buff 贡献 —— 曾经被当成主词条跳过。
    const payload = {
        members: [
            {
                name: "绯雪",
                resonanceUnlocked: 3,
                char: {
                    attrBonusSources: [
                        // 主副词条合计：走配置阶段，跳过
                        {
                            id: "echo_panel_attr_冷凝",
                            name: "冷凝属性伤害加成",
                            value: 60,
                        },
                        {
                            id: "echo_set_panel_30_2_冷凝",
                            name: "冷凝伤害提升10%",
                            value: 10,
                        },
                        // 主位声骸被动：buff 化
                        {
                            id: "echo_main_panel_attr_冷凝",
                            name: "主位·冷凝伤",
                            value: 12,
                        },
                    ],
                    typeDmgBonusSources: [
                        {
                            id: "echo_main_panel_type_共鸣解放",
                            name: "主位·共鸣解放伤加成",
                            value: 12,
                        },
                    ],
                    energyRegenPctSources: [
                        { id: "energy_regen_base", name: "基础", value: 100 },
                        {
                            id: "echo_main_panel_stat_energyRegenPct",
                            name: "主位·共鸣效率",
                            value: 10,
                        },
                    ],
                },
                buffs: [],
            },
        ],
    } as never

    const { buffs } = convertCalculationPhase(payload, [])

    assertEquals(
        buffs.map((b) => ({
            id: b.id,
            name: b.name,
            zones: b.zones,
            scope: b.scope,
        })),
        [
            {
                id: "panel_0_echo_main_panel_stat_energyRegenPct",
                name: "主位·共鸣效率·共鸣效率",
                zones: [{ zoneId: "recharge", value: 10 }],
                scope: [0],
            },
            {
                id: "panel_0_echo_set_panel_30_2_冷凝",
                name: "冷凝伤害提升10%·增伤",
                zones: [{
                    zoneId: "bonusDmg",
                    value: 10,
                    condition: { elements: ["冷凝"] },
                }],
                scope: [0],
            },
            {
                id: "panel_0_echo_main_panel_attr_冷凝",
                name: "主位·冷凝伤·增伤",
                zones: [{
                    zoneId: "bonusDmg",
                    value: 12,
                    condition: { elements: ["冷凝"] },
                }],
                scope: [0],
            },
            {
                id: "panel_0_echo_main_panel_type_共鸣解放",
                name: "主位·共鸣解放伤加成·增伤",
                zones: [{
                    zoneId: "bonusDmg",
                    value: 12,
                    condition: { damageTypes: ["共鸣解放伤害"] },
                }],
                scope: [0],
            },
        ],
    )
})

Deno.test("拉表：面板加成也 buff 化，声骸主副词条与基础属性不落表", () => {
    // 椰果工具箱只算「角色基础 + 配置阶段的声骸主副词条 + 敌怪」，
    // 角色固有（阳变阴合）、共鸣链分支、声骸套装 2 件这些它算不出来，必须由 Buff 贡献
    const payload = {
        members: [
            {
                name: "景燃",
                resonanceUnlocked: 0,
                char: {
                    flatAtkSources: [
                        {
                            id: "echo_agg_total",
                            name: "声骸（合计）",
                            value: 300,
                        },
                        {
                            id: "char_kit_panel_jingran_yangbian_yinhe",
                            name: "阳变阴合",
                            value: 1800,
                        },
                    ],
                    critRateSources: [
                        {
                            id: "crit_rate_base",
                            name: "基础",
                            value: 5,
                            locked: true,
                        },
                        {
                            id: "char_kit_panel_jingran_branch_crit_rate",
                            name: "分支",
                            value: 8,
                            locked: true,
                        },
                    ],
                    hpPercentSources: [
                        { id: "id_534570", name: "来源1", value: 0 },
                        {
                            id: "weapon_panel_sub",
                            name: "[武器副词条] 生命",
                            value: 72.23,
                        },
                        {
                            id: "echo_set_panel_35_2_hpPercent",
                            name: "生命提升10%",
                            value: 10,
                        },
                    ],
                    typeDmgBonusSources: [
                        {
                            id: "echo_panel_type_重击",
                            name: "重击伤害加成",
                            value: 15.8,
                        },
                        {
                            id: "char_kit_panel_jingran_zhongji",
                            name: "重击伤害加成",
                            value: 20,
                        },
                    ],
                    harmonyBreakAmpSources: [
                        // 角色本体属性的谐度破坏增幅：工具箱角色数据自带，走特殊规则丢掉
                        {
                            id: "char_def_harmony_break_amp",
                            name: "莫宁·本体属性·谐度破坏增幅",
                            value: 10,
                            locked: true,
                        },
                        // 同名但换 id 的形态，也按「char_def_ + 谐度破坏增幅」兜住
                        {
                            id: "char_def_harmony_break_amp_v2",
                            name: "琳奈·本体属性·谐度破坏增幅",
                            value: 10,
                        },
                        // 真正的面板加成（固有 / 偏谐累积）要留下
                    ],
                    offsetHarmonyEffPctSources: [
                        {
                            id: "char_kit_panel_moning_offset_harmony_eff",
                            name: "莫宁·偏谐累积效率",
                            value: 50,
                        },
                    ],
                },
                buffs: [],
            },
            {
                name: "尤诺",
                resonanceUnlocked: 0,
                char: { flatAtkSources: [] },
            },
        ],
        team: { sharedBuffs: { buffs: [] } },
    } as never

    const entries = [
        {
            id: "d0",
            character: "景燃",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "热熔",
            sourceTimelineBlockId: "r0",
            hits: 1,
        },
        {
            id: "d1",
            character: "尤诺",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "",
            sourceTimelineBlockId: "r1",
            hits: 1,
        },
    ] as never

    const { buffs, phase } = convertCalculationPhase(payload, entries)

    assertEquals(
        buffs.map((b) => ({
            id: b.id,
            name: b.name,
            zones: b.zones,
            scope: b.scope,
        })),
        [
            {
                id: "panel_0_char_kit_panel_jingran_yangbian_yinhe",
                name: "阳变阴合·攻击固定值",
                zones: [{ zoneId: "atkFlat", value: 1800 }],
                scope: [0],
            },
            {
                id: "panel_0_echo_set_panel_35_2_hpPercent",
                name: "生命提升10%·生命百分比",
                zones: [{ zoneId: "hpPct", value: 10 }],
                scope: [0],
            },
            {
                id: "panel_0_char_kit_panel_jingran_branch_crit_rate",
                name: "分支·暴击率",
                zones: [{ zoneId: "critRate", value: 8 }],
                scope: [0],
            },
            {
                id: "panel_0_char_kit_panel_moning_offset_harmony_eff",
                name: "莫宁·偏谐累积效率·偏谐累积效率",
                zones: [{ zoneId: "offTuneBuildupRate", value: 50 }],
                scope: [0],
            },
            {
                id: "panel_0_char_kit_panel_jingran_zhongji",
                name: "重击伤害加成·增伤",
                zones: [
                    {
                        zoneId: "bonusDmg",
                        value: 20,
                        condition: { damageTypes: ["重击伤害"] },
                    },
                ],
                scope: [0],
            },
        ],
    )
    // 面板加成只勾到本角色的伤害条目上
    // 面板加成只勾到本角色的伤害条目上；
    // 带重击条件的「重击伤害加成」不该勾到这条普攻条目（条件不命中）
    assertEquals(phase.data!.damageEntryBuffSetIds, {
        d0: [
            "panel_0_char_kit_panel_jingran_yangbian_yinhe",
            "panel_0_echo_set_panel_35_2_hpPercent",
            "panel_0_char_kit_panel_jingran_branch_crit_rate",
            "panel_0_char_kit_panel_moning_offset_harmony_eff",
        ],
    })
})


Deno.test("拉表：协同攻击关键字表独立于转换核心", () => {
    const entry = (name: string) => ({
        hitName: name,
        displayName: name,
        skillNames: [],
        skillType: "共鸣技能",
        isEffect: false,
    }) as never

    // 关键字来自 data/game.ts，核心只按表命中；命中后同时保留原伤害类型
    assertEquals(inferEntryDamageTypes(entry("墨鹤")), [
        "共鸣技能伤害",
        "协同攻击伤害",
    ])
    assertEquals(inferEntryDamageTypes(entry("审判之雷")), [
        "共鸣技能伤害",
        "协同攻击伤害",
    ])
    assertEquals(inferEntryDamageTypes(entry("普通招式")), ["共鸣技能伤害"])
})

Deno.test("拉表：alsoAsEffect 作为第二伤害类型参与 Buff 条件", () => {
    const payload = {
        members: [{
            name: "甲",
            resonanceUnlocked: 0,
            globalBuffActive: { ed: true },
        }],
        team: {
            sharedBuffs: {
                globalBuffActive: { ed: true },
                buffs: [{
                    id: "ed",
                    name: "风蚀加深",
                    category: "typeDeep",
                    mode: "fixed",
                    value: 100,
                    damageType: "效应",
                }],
            },
        },
    } as never
    const base = {
        character: "甲",
        skillType: "常态攻击",
        displayName: "普攻",
        hitName: "普攻",
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "气动",
        damageType: "普攻",
        sourceTimelineBlockId: "r0",
        hits: 1,
    }
    const entries = [
        { ...base, id: "normal" },
        { ...base, id: "dual", alsoAsEffect: "风蚀" },
    ] as never

    assertEquals(inferEntryDamageTypes((entries as any)[0]), ["普攻伤害"])
    assertEquals(inferEntryDamageTypes((entries as any)[1]), [
        "普攻伤害",
        "效应伤害",
    ])

    const { phase } = convertCalculationPhase(payload, entries)
    const bind = phase.data!.damageEntryBuffSetIds
    // 椰果条件内部是「或」：同一条直伤挂了两种类型，效应加深也能命中
    assertEquals(bind["dual"], ["ed·deepenDmg"])
    assertEquals(bind["normal"], undefined)
})
Deno.test("拉表：类型减抗与无视防御落成独立乘区", () => {
    const payload = {
        members: [{
            name: "甲",
            resonanceUnlocked: 0,
            globalBuffActive: { gr: true, tr: true, ig: true, pen: true },
        }],
        team: {
            sharedBuffs: {
                globalBuffActive: { gr: true, tr: true, ig: true, pen: true },
                buffs: [
                    {
                        id: "gr",
                        name: "泛用减抗",
                        category: "generalResReduce",
                        mode: "fixed",
                        value: 10,
                    },
                    {
                        id: "tr",
                        name: "热熔减抗",
                        category: "typeResReduce",
                        mode: "fixed",
                        value: 30,
                        element: "热熔",
                        damageType: "共鸣解放",
                    },
                    {
                        id: "ig",
                        name: "无视防御",
                        category: "generalDefense",
                        defenseKind: "ignore",
                        mode: "fixed",
                        value: 18,
                    },
                    {
                        id: "pen",
                        name: "穿防",
                        category: "generalDefense",
                        defenseKind: "pen",
                        mode: "fixed",
                        value: 16,
                    },
                ],
            },
        },
    } as never
    const entries = [{
        id: "d0-共鸣解放|R#攻击",
        character: "甲",
        skillType: "共鸣解放",
        hitName: "R",
        displayName: "R",
        isEffect: false,
        isTuneBreak: false,
        isTuneResponse: false,
        damageBaseType: "攻击",
        damageElement: "热熔",
        damageType: "共鸣解放",
        sourceTimelineBlockId: "r0",
        hits: 1,
    }] as never

    const { buffs } = convertCalculationPhase(payload, entries)
    const zones = (id: string) =>
        buffs.find((b) => b.id === id)?.zones

    // 泛用 / 类型减抗都落 resDown；类型减抗带伤害类型条件
    assertEquals(zones("gr·resDown"), [{ zoneId: "resDown", value: 10 }])
    assertEquals(zones("tr·resDown"), [{
        zoneId: "resDown",
        value: 30,
        condition: { damageTypes: ["共鸣解放伤害"] },
    }])
    // 无视防御是独立乘算的 defDown，不能并进 defPen
    assertEquals(zones("ig·defDown"), [{ zoneId: "defDown", value: 18 }])
    assertEquals(zones("pen·defPen"), [{ zoneId: "defPen", value: 16 }])
})
Deno.test("拉表：效应覆盖倍率与双暴落成 Buff，全伤害加深不进效应", () => {
    const payload = {
        members: [{
            name: "甲",
            resonanceUnlocked: 0,
            globalBuffActive: { gd: true },
        }],
        team: {
            sharedBuffs: {
                globalBuffActive: { gd: true },
                buffs: [{
                    id: "gd",
                    name: "全伤害加深",
                    category: "generalDeep",
                    mode: "fixed",
                    value: 25,
                }],
            },
        },
    } as never
    const entries = [
        {
            id: "d0-nd|聚爆效应",
            character: "甲",
            skillType: "效应结算",
            hitName: "聚爆效应",
            displayName: "聚爆效应",
            isEffect: true,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "效应系数",
            damageElement: "热熔",
            sourceTimelineBlockId: "r0",
            hits: 1,
            ratioValue: 13,
            effectBaseMult: 15,
            effectCritRate: 80,
            effectCritDmg: 275,
        },
        {
            id: "d1-常态攻击|普攻#攻击",
            character: "甲",
            skillType: "常态攻击",
            hitName: "普攻",
            displayName: "普攻",
            isEffect: false,
            isTuneBreak: false,
            isTuneResponse: false,
            damageBaseType: "攻击",
            damageElement: "热熔",
            sourceTimelineBlockId: "r1",
            hits: 1,
        },
    ] as never

    const { buffs, phase } = convertCalculationPhase(payload, entries)
    const bind = phase.data!.damageEntryBuffSetIds

    const base = buffs.find((b) => b.id === "effect_base:d0-nd|聚爆效应")!
    assertEquals(base.zones, [{
        zoneId: "extraRatio",
        // 通用表 13 层聚爆 = 13.9726；目标 15 → 追加 (15 - 13.9726) × 100
        value: 102.74,
    }])
    assertEquals(base.scope, [0])

    const crit = buffs.find((b) => b.id === "effect_crit:d0-nd|聚爆效应")!
    assertEquals(crit.zones, [
        { zoneId: "critRate", value: 80, override: true },
        { zoneId: "critDmg", value: 275, override: true },
    ])
    assertEquals(crit.scope, [0])

    // 效应条目只吃覆盖 Buff；全伤害加深只挂在直伤条目上
    assertEquals(bind["d0-nd|聚爆效应"], [
        "effect_base:d0-nd|聚爆效应",
        "effect_crit:d0-nd|聚爆效应",
    ])
    assertEquals(bind["d1-常态攻击|普攻#攻击"], ["gd·deepenDmg"])
})
