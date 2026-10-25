/// <reference lib="deno.ns" />
/** 把 Svelte 风格的无扩展名 import 补成 Deno 能直接解析的 .ts。 */
const ROOT = new URL("../engines/coconut/", import.meta.url)
const LIB = new URL("lib/", ROOT)
const files: URL[] = []
for await (const e of Deno.readDir(LIB)) {
    if (e.isFile && e.name.endsWith(".ts")) files.push(new URL(e.name, LIB))
}
for await (const dir of ["calc", "consts", "api", "utils", "types", "data"]) {
    try {
        for await (const e of Deno.readDir(new URL(dir + "/", LIB))) {
            if (e.isFile && e.name.endsWith(".ts")) {
                files.push(new URL(dir + "/" + e.name, LIB))
            }
        }
    } catch { /* ignore */ }
}
files.push(new URL("damage-entries.ts", ROOT), new URL("measure.ts", ROOT))

const exists = async (url: URL): Promise<boolean> => {
    try {
        return (await Deno.stat(url)).isFile
    } catch {
        return false
    }
}

let changed = 0
for (const file of files) {
    let text = await Deno.readTextFile(file)
    const dir = new URL(".", file).href
    const re = /from\s+["']([^"']+)["']/g
    const replacements: [string, string][] = []
    for (const m of text.matchAll(re)) {
        const spec = m[1]
        if (/\.(ts|tsx|js|mjs|json)$/.test(spec)) continue
        let target: URL | null = null
        if (spec.startsWith("$lib/")) {
            target = new URL("lib/" + spec.slice(5) + ".ts", ROOT)
        } else if (spec.startsWith("./") || spec.startsWith("../")) {
            target = new URL(spec + ".ts", dir)
        }
        if (target && await exists(target)) {
            const next = spec + ".ts"
            replacements.push([`from "${spec}"`, `from "${next}"`])
            replacements.push([`from '${spec}'`, `from '${next}'`])
        }
    }
    for (const [from, to] of replacements) text = text.split(from).join(to)
    if (replacements.length) {
        await Deno.writeTextFile(file, text)
        changed++
        console.log(
            "fixed",
            file.pathname.replace(ROOT.pathname, ""),
            replacements.length / 2,
        )
    }
}
console.log("files changed", changed)
