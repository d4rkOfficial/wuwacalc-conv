/// <reference lib="deno.ns" />
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1"
import { convertWuwaCalcProjectParts } from "./convert-project/index.ts"
import {
    buildProjectReport,
    renderProjectReportHtml,
} from "./convert-project-report.ts"

Deno.test("转换报告：双引擎对比能逐技能定位乘区差异", async () => {
    const { loadFixture, loadSiteTables } = await import("../engines/parity.ts")
    const { buildCoconutProjectFile } = await import(
        "./convert-project/index.ts"
    )
    const { gameDataOfProjectTables } = await import(
        "./convert-project/game-data.ts"
    )
    const { measureCoconut } = await import("../engines/coconut/measure.ts")
    const { buildReportEngineComparison } = await import(
        "./convert-project-report-engine.ts"
    )
    const fixture = await loadFixture("MC-U5UNZC")
    const tables = await loadSiteTables()
    const detail = {
        id: fixture.detail.id,
        title: fixture.detail.title,
        share_code: fixture.code,
        approved_at: fixture.detail.approved_at,
        updated_at: fixture.detail.updated_at,
        summary: undefined,
        payload: { data: fixture.data, meta: fixture.meta },
    }
    const parts = convertWuwaCalcProjectParts(detail as never, tables)
    const game = gameDataOfProjectTables(tables)
    assert(game !== null, "站点表应能拼出完整 GameData")
    const file = buildCoconutProjectFile(parts, detail as never, {
        projectId: fixture.code,
        exportedAt: 0,
    })
    const coconut = measureCoconut(file, game)
    const engine = buildReportEngineComparison(
        parts.payload,
        detail.payload.meta,
        coconut,
    )

    assert(engine.available, "应能对比两边总伤")
    assert(engine.detailed, "U5UNZC 的分享快照带逐技能结果")
    assert(
        Math.abs(engine.total.rel) < 0.001,
        `U5UNZC 总伤偏差 ${(engine.total.rel * 100).toFixed(3)}% 应小于 0.1%`,
    )
    // 千咲 A2 的 multComponents 是 10.64% × 10，转换必须落成 106.4%，
    // 而不是只算第一段。baseMult 出现在差异里就说明又退化了。
    const a2 = engine.skills.find((skill) =>
        skill.character === "千咲" && skill.wuwaName.includes("A2·长按")
    )
    assert(!!a2, "应能对齐千咲 A2")
    assert(
        !a2!.zones.some((zone) => zone.name === "baseMult"),
        "千咲 A2 的倍率不应有差异",
    )
    // 爱弥斯延奏的额外 10% 只给 达妮娅 / 千咲（onlyCharacterIds），
    // 千咲（1508）不该吃；否则 deepen 会从 1.1 变成 1.2。
    const e2 = engine.skills.find((skill) =>
        skill.character === "千咲" && skill.wuwaName === "E2"
    )
    assert(!!e2, "应能对齐千咲 E2")
    assert(
        !e2!.zones.some((zone) => zone.name === "deepen"),
        "千咲 E2 不应多出 10% 加深",
    )

    const report = buildProjectReport("MC-U5UNZC", "爱达千", parts, engine)
    assert(
        report.entries.filter((entry) => entry.engine).length > 10,
        "逐条目应挂上技能合计对比",
    )
    assertStringIncludes(report.markdown, "## 引擎对比（鸣算屋快照 vs 椰果）")
    assertStringIncludes(report.markdown, "### 逐技能")
    const html = renderProjectReportHtml(report)
    assertStringIncludes(html, "引擎对比（鸣算屋快照 vs 椰果）")
    assertStringIncludes(html, "逐技能")
})

Deno.test("转换报告：逐条目 Buff 与乘区汇总", () => {
    const detail = {
        id: "x",
        title: "测试方案",
        share_code: "MC-TEST",
        payload: {
            data: {
                members: [{
                    name: "甲",
                    characterId: "c1",
                    resonanceUnlocked: 0,
                    weaponSelection: { id: "w1", refinement: 1 },
                    phases: [{
                        name: "阶段",
                        skills: [{ name: "普攻", catalogId: "k1" }],
                        buffActive: { b: true },
                    }],
                    rotationCatalog: [{
                        id: "k1",
                        name: "普攻",
                        damageType: "普攻",
                        axisOffsetPx: 80,
                        multCount: 1,
                        baseMult: 100,
                        librarySkillName: "测试·普攻",
                    }],
                }],
                team: {
                    sharedBuffs: {
                        globalBuffActive: { b: true },
                        buffs: [{
                            id: "b",
                            name: "测试增伤",
                            category: "generalBonus",
                            mode: "fixed",
                            value: 10,
                        }],
                    },
                },
            },
            meta: {},
        },
    }
    const parts = convertWuwaCalcProjectParts(detail as never)
    const report = buildProjectReport("MC-TEST", "测试方案", parts)
    assertEquals(report.entries.length, 1)
    const entry = report.entries[0]!
    assertEquals(entry.character, "甲")
    assertEquals(entry.damageTypes, ["普攻伤害"])
    assertEquals(entry.buffs.map((b) => b.name), ["测试增伤·增伤"])
    assertEquals(entry.zones, [{
        zoneId: "bonusDmg",
        label: "增伤",
        value: 10,
        count: 1,
        override: false,
        detail: "1 条相加",
    }])
    assertEquals(report.stages.buffs, 1)
    assertStringIncludes(report.markdown, "测试增伤")
    assertStringIncludes(report.markdown, "增伤")
    const html = renderProjectReportHtml(report)
    assertStringIncludes(html, "测试方案")
    assertStringIncludes(html, "测试增伤")
    assert(html.includes("MC-TEST"))
})
