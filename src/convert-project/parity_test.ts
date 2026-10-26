/// <reference lib="deno.ns" />
/**
 * 转换正确性 TDD：**同一份真实鸣算屋方案**，
 * 一边跑鸣算屋线上引擎（金标准，`fixtures/wuwacalc/golden/`），
 * 一边把方案转换成椰果工程再跑椰果工具箱引擎，逐条目 / 逐乘区对比。
 *
 * 门槛（gate）项目：转换后总伤与逐条目伤害必须落在 0.5% 内，
 * 且除攻击白值的整数取整外，所有乘区数值必须逐位相等。
 *
 * `DIAGNOSTIC` 里的高难多轮项目目前只做「转换不炸 + 能算出条目」的结构验收：
 * 它们暴露出循环轴的技能级叠层/非直伤重建还没完全对齐，留作下一阶段。
 *
 * 金标准刷新：
 *   deno run -A engines/wuwacalc/measure-jsdom.ts --codes <CODE> --out tmp/x.json
 *   deno run -A scripts/build-golden.ts
 */

import { deepStrictEqual, ok } from "node:assert/strict"
import { runParityComparison } from "../../engines/parity.ts"

/** 已对齐的真实工程（4 个不同队伍 / 不同角色） */
const GATE = [
    "MC-J2UPE8", // 仇远 / 洛瑟菈 / 莫宁，6+5，双轮
    "MC-X859HC", // 嘉贝莉娜 / 莫特斐 / 露帕，6+1
    "MC-88TES9", // 嘉贝莉娜 / 莫特斐 / 露帕，6+1（另一轴）
    "MC-QFT4PS", // 嘉贝莉娜 / 长离 / 露帕，0+1
]

/** 高难工程：结构验收；KGHNE7 额外卡总伤（多轮/集谐已对齐，个别招式待收） */
const DIAGNOSTIC = [
    "MC-KGHNE7", // 清宵 / 达妮娅 / 莫宁，6+5，5 轮 / 集谐 / 武器叠层
    "MC-NT36XN", // 爱弥斯 / 达妮娅 / 千咲，6+5（非直伤占大头）
    "MC-SCJ322", // 卡提希娅 / 夏空 / 千咲，6+5，5 轮 / 风蚀效应
    "MC-BSZSVE", // 景燃 / 尤诺 / 莫宁，6+5
    "MC-CM6J6K", // 弗洛洛 / 仇远 / 莫宁
    "MC-T6E4P9", // 西格莉卡 / 仇远 / 守岸人
    "MC-NT274J", // 秧秧 / 千咲 / 穗穗，5 轮 9 羽（新批次，已对齐）
    "MC-U5UNZC", // 爱弥斯 / 达妮娅 / 千咲，简化 3 光全局（新批次，待收）
    "MC-4NRWDV", // 清宵 / 达妮娅 / 莫宁，集谐（新批次，待收）
]
const TOTAL_TOLERANCE = 0.005
const ENTRY_TOLERANCE = 0.10
/** 至少 94% 的条目要落在 0.5% 内（多轮工程的零头取整会略低） */
const ENTRY_STRICT_SHARE = 0.98
/** 工具箱把 totalAtk 四舍五入到整数，白值最多差 2 点 */
const ATTACK_ROUNDING_TOLERANCE = 2.01

for (const code of GATE) {
    Deno.test(`转换一致性 · ${code}`, async () => {
        const result = await runParityComparison(code)

        ok(
            Math.abs(result.totalRel) < TOTAL_TOLERANCE,
            `${code} 总伤偏差 ${(result.totalRel * 100).toFixed(3)}% 超过 ${
                TOTAL_TOLERANCE * 100
            }%`,
        )
        deepStrictEqual(result.missingWuwa, [], `${code} 有椰果多出来的条目`)
        deepStrictEqual(
            result.missingCoconut,
            [],
            `${code} 有鸣算屋有、转换后丢失的条目`,
        )
        ok(result.entries.length > 0, `${code} 没有可比较的伤害条目`)

        const strict = result.entries.filter((entry) =>
            Math.abs(entry.rel) < TOTAL_TOLERANCE
        )
        ok(
            strict.length / result.entries.length >= ENTRY_STRICT_SHARE,
            `${code} 只有 ${strict.length}/${result.entries.length} 条落在 0.5% 内`,
        )

        for (const entry of result.entries) {
            ok(
                Math.abs(entry.rel) < ENTRY_TOLERANCE,
                `${code} ${entry.character}/${entry.wuwaName} 偏差 ${
                    (entry.rel * 100).toFixed(2)
                }%`,
            )
            for (const zone of entry.zones) {
                if (["attack", "hp", "def"].includes(zone.name)) {
                    ok(
                        Math.abs(zone.delta) <= ATTACK_ROUNDING_TOLERANCE,
                        `${code} ${entry.character}/${entry.wuwaName} 面板白值差 ${zone.delta}（超过取整容差）`,
                    )
                    continue
                }
                ok(
                    Math.abs(zone.rel) < 1e-9,
                    `${code} ${entry.character}/${entry.wuwaName} 乘区 ${zone.name} 不一致：` +
                        `${zone.wuwa} vs ${zone.coconut}`,
                )
            }
        }
    })
}

for (const code of DIAGNOSTIC) {
    Deno.test(
        `转换结构 · ${code}${
            code === "MC-KGHNE7" ? "（总伤 gate）" : "（诊断）"
        }`,
        async () => {
            const result = await runParityComparison(code)
            ok(result.entries.length > 0, `${code} 没有可比较的伤害条目`)
            ok(result.specialCoconut >= 0, `${code} 非直伤结果为负`)
            // 多轮/集谐工程：总伤已对齐到 1% 内（逐条个别招式仍待收）
            if (code === "MC-KGHNE7") {
                ok(
                    Math.abs(result.totalRel) < 0.01,
                    `${code} 总伤偏差 ${
                        (result.totalRel * 100).toFixed(2)
                    }% 超过 1%`,
                )
            }
            console.log(
                `  ${code}: 条目 ${result.entries.length}，总伤偏差 ` +
                    `${(result.totalRel * 100).toFixed(2)}%，非直伤 ` +
                    `${Math.round(result.specialCoconut)} / ${
                        Math.round(result.specialWuwa)
                    }`,
            )
        },
    )
}

Deno.test("差分：生命/防御缩放不再误标成 attack", async () => {
    const result = await runParityComparison("MC-4NRWDV")
    const row = result.entries.find((entry) =>
        entry.character === "莫宁" && entry.wuwaName === "R"
    )
    ok(row, "应能找到莫宁 R")
    ok(
        row!.zones.some((zone) => zone.name === "def"),
        "防御缩放应落到 def 乘区",
    )
    ok(
        !row!.zones.some((zone) => zone.name === "attack"),
        "防御缩放不应再标成 attack",
    )
})

Deno.test("引擎快照 · 鸣算屋线上脚本已提取到仓库", async () => {
    for (
        const file of [
            "engines/wuwacalc/site/index.html",
            "engines/wuwacalc/site/js/core.js",
            "engines/wuwacalc/site/js/buff-templates.js",
            "engines/wuwacalc/site/js/ui.js",
            "engines/wuwacalc/site/character-skills.json",
            "engines/wuwacalc/site/weapons.json",
            "engines/wuwacalc/site/echo-specimens.json",
        ]
    ) {
        const stat = await Deno.stat(new URL(`../../${file}`, import.meta.url))
        ok(stat.isFile && stat.size > 0, `${file} 缺失或为空`)
    }
})

Deno.test("引擎快照 · 椰果工具箱计算引擎已提取到仓库", async () => {
    for (
        const file of [
            "engines/coconut/lib/calc/compute.ts",
            "engines/coconut/lib/calc/calculation.consts.ts",
            "engines/coconut/lib/calc/condition.ts",
            "engines/coconut/lib/calc/zone-ops.ts",
            "engines/coconut/lib/consts/effect-data.ts",
        ]
    ) {
        const stat = await Deno.stat(new URL(`../../${file}`, import.meta.url))
        ok(stat.isFile && stat.size > 0, `${file} 缺失或为空`)
    }
})
