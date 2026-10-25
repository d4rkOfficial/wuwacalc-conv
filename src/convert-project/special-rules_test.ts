/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import {
    SPECIAL_PANEL_RULES,
    shouldSkipPanelSource,
    specialRuleOf,
} from "./special-rules.ts"

const assertEquals = (actual: unknown, expected: unknown) =>
    deepStrictEqual(actual, expected)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

Deno.test("特殊规则：本体属性·谐度破坏增幅 被挡下", () => {
    // 实测 16 个工程、30 次出现，id 与值都固定
    const source = {
        id: "char_def_harmony_break_amp",
        name: "莫宁·本体属性·谐度破坏增幅",
        value: 10,
    }
    assert(shouldSkipPanelSource(source, "harmonyBreakAmpSources"), "应当被挡下")
    assertEquals(specialRuleOf(source, "harmonyBreakAmpSources")?.id, "char-def-harmony-break-amp")
})

Deno.test("特殊规则：换 id 但同为「本体属性·谐度破坏增幅」也挡", () => {
    assert(
        shouldSkipPanelSource(
            { id: "char_def_harmony_break_amp_v2", name: "清宵·本体属性·谐度破坏增幅", value: 10 },
            "harmonyBreakAmpSources",
        ),
        "同类来源换 id 也应当挡下",
    )
    // 名字对不上就不是同一回事，放过（宁可多一条，也别悄悄少数值）
    assertEquals(
        shouldSkipPanelSource(
            { id: "char_kit_panel_foo", name: "清宵·固有", value: 10 },
            "harmonyBreakAmpSources",
        ),
        false,
    )
})

Deno.test("特殊规则：只挡本体属性，真正的固有 / 分支 / 谐振场照常 buff 化", () => {
    for (
        const source of [
            {
                id: "char_kit_panel_moning_offset_harmony_eff",
                name: "莫宁",
                value: 50,
            },
            {
                id: "char_kit_panel_moning_c2_offset_harmony_eff",
                name: "莫宁·2链",
                value: 20,
            },
            {
                id: "char_kit_panel_jingran_yangbian_yinhe",
                name: "阳变阴合",
                value: 1800,
            },
            { id: "char_def_harmony_break_amp", name: "莫宁·本体属性·谐度破坏增幅", value: 10 },
        ]
    ) {
        const kind = source.id.includes("offset_harmony_eff")
            ? "offsetHarmonyEffPctSources"
            : "flatAtkSources"
        // 只有最后一条（谐度破坏增幅）该被挡；它在别的类别里也照挡
        const skipped = shouldSkipPanelSource(source, kind)
        assertEquals(skipped, source.id === "char_def_harmony_break_amp")
    }
})

Deno.test("特殊规则：规则表自带 id 与理由", () => {
    assert(SPECIAL_PANEL_RULES.length >= 1, "至少有一条规则")
    for (const rule of SPECIAL_PANEL_RULES) {
        assert(!!rule.id, "规则要有 id")
        assert(rule.reason.length > 10, "规则要写清理由")
    }
})
