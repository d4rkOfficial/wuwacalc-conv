/// <reference lib="deno.ns" />
/** 把 tmp 下已经跑出的鸣算屋引擎结果按分享码归档为 parity 金标准。 */
const OUT = new URL("../fixtures/wuwacalc/golden/", import.meta.url)
await Deno.mkdir(OUT, { recursive: true })
const sources = [
    "tmp/measure-jsdom-one.json",
    "tmp/measure-two.json",
    "tmp/measure-MC-88TES9.json",
    "tmp/measure-MC-AAG7TK.json",
    "tmp/measure-MC-QFT4PS.json",
    "tmp/detail-MC-KGHNE7.json",
    "tmp/detail-MC-NT36XN.json",
    "tmp/detail-MC-SCJ322.json",
    "tmp/detail-MC-BSZSVE.json",
    "tmp/detail-MC-T6E4P9.json",
    "tmp/detail-MC-CM6J6K.json",
]
const seen = new Set<string>()
for (const file of sources) {
    let rows: any[]
    try {
        rows = JSON.parse(await Deno.readTextFile(file))
    } catch {
        continue
    }
    for (const row of rows) {
        if (!row?.ok || seen.has(row.code)) continue
        seen.add(row.code)
        await Deno.writeTextFile(
            new URL(row.code + ".json", OUT),
            JSON.stringify(row, null, 2),
        )
        console.log("golden", row.code, Math.round(row.teamTotal))
    }
}
