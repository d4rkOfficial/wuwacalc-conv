/// <reference lib="deno.ns" />
/**
 * 同步鸣算屋（wuwacalc.cn）当前线上前端与真实方案样本。
 *
 * 只读公开资源：
 *   - GET /            首页（拿到带版本号的脚本清单）
 *   - GET /js/*.js     计算引擎与界面脚本（原样落到 engines/wuwacalc/site/）
 *   - GET /api/public-schemes?page=1&pageSize=15&sort=time   公开方案列表
 *   - GET /api/schemes/{code}                                 单个方案完整快照
 *
 * 用法：
 *   deno run -A scripts/sync-upstream.ts [--codes MC-XXXX,MC-YYYY] [--pages 2] [--limit 8]
 */

const BASE = Deno.env.get("WUWACALC_BASE") ?? "https://wuwacalc.cn"
const ROOT = new URL("../", import.meta.url)
const SITE_DIR = new URL("engines/wuwacalc/site/", ROOT)
const FIXTURE_DIR = new URL("fixtures/wuwacalc/", ROOT)

const args = Deno.args
const getArg = (name: string, fallback: string): string => {
    const at = args.indexOf(name)
    return at >= 0 ? (args[at + 1] ?? fallback) : fallback
}
const codesArg = getArg("--codes", "")
const pages = Number(getArg("--pages", "2"))
const limit = Number(getArg("--limit", "8"))
const explicitCodes = codesArg.split(",").map((s) => s.trim()).filter(Boolean)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const fetchOk = async (url: string, tries = 3): Promise<Response> => {
    let last: unknown
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "user-agent":
                        "wuwacalc-conv/parity (+https://github.com/d4rkOfficial/wuwacalc-conv)",
                },
                signal: AbortSignal.timeout(120_000),
            })
            if (res.ok) return res
            last = new Error("HTTP " + res.status + " " + url)
            if (res.status < 500 && res.status !== 429) break
        } catch (error) {
            last = error
        }
        await sleep(800 * (i + 1))
    }
    throw last instanceof Error ? last : new Error(String(last))
}

const write = async (path: URL, data: Uint8Array | string) => {
    await Deno.mkdir(new URL(".", path), { recursive: true })
    if (typeof data === "string") await Deno.writeTextFile(path, data)
    else await Deno.writeFile(path, data)
    console.log("  saved", path.pathname.replace(ROOT.pathname, ""))
}

const html = await (await fetchOk(BASE + "/")).text()
await write(new URL("index.html", SITE_DIR), html)

const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((src) => !/^https?:/.test(src))
console.log("scripts:", scripts.length)
for (const src of scripts) {
    const path = src.split("?")[0].replace(/^\/+/, "")
    const res = await fetchOk(new URL(path, BASE + "/").href)
    const body = new Uint8Array(await res.arrayBuffer())
    await write(new URL(path, SITE_DIR), body)
    await sleep(30)
}

// 站点根目录的静态数据表（引擎启动时按需 fetch；拿不到就跳过）
for (
    const name of [
        "character-skills.json",
        "character-buff-templates.json",
        "weapons.json",
        "echo-sets.json",
        "echo-catalog.json",
        "echo-specimens.json",
        "echo-set-main-map.json",
    ]
) {
    try {
        const res = await fetchOk(new URL(name, BASE + "/").href, 1)
        await write(
            new URL(name, SITE_DIR),
            new Uint8Array(await res.arrayBuffer()),
        )
    } catch {
        console.log("  skip", name)
    }
}

// ── 方案列表 + 详情 ──────────────────────────────────────────────────────────
interface SchemeItem {
    share_code?: string
    title?: string
    summary?: Record<string, unknown>
    updated_at?: string
}
const items: SchemeItem[] = []
for (let page = 1; page <= pages; page++) {
    const res = await fetchOk(
        `${BASE}/api/public-schemes?page=${page}&pageSize=15&sort=time`,
    )
    const json = await res.json() as { items?: SchemeItem[] }
    items.push(...(json.items ?? []))
    await sleep(200)
}
const byCode = new Map(
    items.filter((i) => i.share_code).map((i) => [i.share_code!, i]),
)
const chosen: string[] = explicitCodes.length
    ? explicitCodes
    : [...byCode.keys()].slice(0, limit)

const manifest: Record<string, unknown>[] = []
for (const code of chosen) {
    const res = await fetchOk(`${BASE}/api/schemes/${encodeURIComponent(code)}`)
    const detail = await res.json()
    await write(
        new URL(`${code}.json`, FIXTURE_DIR),
        JSON.stringify(detail, null, 2),
    )
    const item = byCode.get(code)
    manifest.push({
        code,
        title: detail?.title ?? item?.title ?? "",
        updatedAt: detail?.updated_at ?? item?.updated_at ?? "",
        summary: detail?.summary ?? item?.summary ?? null,
        file: `${code}.json`,
    })
    await sleep(300)
}
await write(
    new URL("manifest.json", FIXTURE_DIR),
    JSON.stringify(
        { fetchedAt: new Date().toISOString(), base: BASE, items: manifest },
        null,
        2,
    ),
)
console.log(`fixtures: ${manifest.length}`)
