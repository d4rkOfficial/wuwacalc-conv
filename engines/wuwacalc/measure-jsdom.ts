/// <reference lib="deno.ns" />
// @ts-nocheck —— 站点脚本/浏览器 API 的桩代码，类型检查只会制造噪音
/**
 * 在 jsdom 里跑鸣算屋线上引擎（无浏览器 / 无命名管道）。
 *
 * 站点脚本来自 ./site/（scripts/sync-upstream.ts 同步的线上快照）。
 * 站点 ui.js 引用了线上未定义的 `getMatrixTargetResistancePct`（仅矩阵目标抗性用），
 * 这里补一个「原样返回基础抗性」的兜底；其余全部走站点自己的实现。
 */

import { JSDOM } from "npm:jsdom@30.1.3"
import { startLocalSite } from "./server.ts"

const ROOT = new URL("../../", import.meta.url)
const SITE = new URL("./site/", import.meta.url)
const FIXTURE_DIR = new URL("fixtures/wuwacalc/", ROOT)

export interface MeasureOptions {
    codes?: string[]
    verbose?: boolean
    bootWaitMs?: number
}

export interface WuwaBreakdown {
    [key: string]: number | string | boolean | null | undefined
}

export interface WuwaSkillResult {
    name: string
    catalogId: string | null
    damageType?: string
    scaleStat?: string
    baseMult?: number
    multCount?: number
    damage: number
    breakdown: WuwaBreakdown
    activeIds?: string[]
    stacks?: Record<string, number>
}

export interface WuwaMeasureResult {
    code: string
    ok: boolean
    error?: string
    meta?: Record<string, unknown>
    teamTotal?: number
    dps?: number
    axisDuration?: number
    members?: {
        name: string
        characterId: string
        chain: number
        total: number
        cycleMode: boolean
        skills: WuwaSkillResult[]
        cycles?: { index: number; total: number; steps: WuwaSkillResult[] }[]
        buffs?: any[]
        globalStacks?: Record<string, number>
    }[]
    specialSkills?: {
        name: string
        kind: string
        effectType?: string
        layers?: number
        count?: number
        damage: number
        breakdown: WuwaBreakdown
    }[]
    specialTotal?: number
}

const pickBreakdown = (bd: unknown): WuwaBreakdown => {
    const out: WuwaBreakdown = {}
    if (!bd || typeof bd !== "object") return out
    for (const [k, v] of Object.entries(bd as Record<string, unknown>)) {
        if (
            typeof v === "number" || typeof v === "string" ||
            typeof v === "boolean"
        ) out[k] = v
    }
    return out
}

const installSiteShims = (w: Record<string, unknown>, siteUrl: string) => {
    const dom = w as unknown as Record<string, any>
    const g = globalThis as unknown as Record<string, unknown>
    w.fetch =
        ((input: string | URL | Request, init?: RequestInit) =>
            fetch(new URL(String(input), siteUrl + "/"), init)) as typeof fetch
    w.scrollTo = () => {}
    w.alert = () => {} // 站点在解析期用 document.write 注入字体 <link>；手工 eval 时文档已关闭，
     // 原生 document.write 会 document.open() 清空 body，这里改成追加到 head。
    ;(w.document as Document).write = (...html: string[]) => {
        const head = (w.document as Document).head
        if (!head) return
        for (const chunk of html) {
            const template = (w.document as Document).createElement("template")
            template.innerHTML = chunk
            head.appendChild(template.content.cloneNode(true))
        }
    }
    w.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
    })
    w.requestAnimationFrame = (cb: FrameRequestCallback) =>
        setTimeout(() => cb(Date.now()), 0) as unknown as number
    w.cancelAnimationFrame = (id: number) => clearTimeout(id)
    w.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    w.IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    const canvasProto = dom.HTMLCanvasElement?.prototype
    if (canvasProto) {
        canvasProto.getContext = () => ({
            measureText: () => ({ width: 0 }),
            fillText() {},
            clearRect() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            fill() {},
            save() {},
            restore() {},
            setTransform() {},
            scale() {},
            createLinearGradient: () => ({ addColorStop() {} }),
        })
    }
    for (
        const key of [
            "window",
            "document",
            "navigator",
            "location",
            "localStorage",
            "HTMLElement",
            "Node",
            "Event",
            "CustomEvent",
            "MutationObserver",
            "getComputedStyle",
            "screen",
            "history",
        ]
    ) {
        g[key] = dom[key]
    }
    g.window = w
    dom.addEventListener?.(
        "unhandledrejection",
        (event: Event) => event.preventDefault(),
    )
    try {
        ;(globalThis as unknown as {
            addEventListener: (n: string, f: (e: Event) => void) => void
        })
            .addEventListener(
                "unhandledrejection",
                (event: Event) => event.preventDefault(),
            )
    } catch { /* ignore */ }
}

const bootSite = async (siteUrl: string, html: string) => {
    const dom = new JSDOM(html, {
        url: siteUrl + "/index.html",
        runScripts: "outside-only",
        pretendToBeVisual: true,
    })
    const w = dom.window as unknown as Record<string, unknown>
    installSiteShims(w, siteUrl)

    const tags = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    let inline = 0
    for (const [, attrs, body] of tags) {
        if (/type=["']application\/ld\+json/.test(attrs)) continue
        const src = /src=["']([^"']+)["']/.exec(attrs)?.[1]
        if (src && /^https?:/.test(src)) continue
        try {
            if (src) {
                const path = src.replace(/&amp;/g, "&").split("?")[0].replace(
                    /^\/+/,
                    "",
                )
                const code = await Deno.readTextFile(new URL(path, SITE))
                ;(w as unknown as { eval: (code: string) => void }).eval(
                    code + "\n//# sourceURL=" + path,
                )
            } else if (body.trim()) {
                ;(w as unknown as { eval: (code: string) => void }).eval(
                    body + "\n//# sourceURL=inline-" + (++inline),
                )
            }
        } catch {
            // 站点部分可选模块在 jsdom 下没有 DOM 依赖，失败不影响计算
        }
    }
    return dom
}

export const measure = async (
    options: MeasureOptions = {},
): Promise<WuwaMeasureResult[]> => {
    const site = startLocalSite()
    const html = await Deno.readTextFile(new URL("index.html", SITE))
    const dom = await bootSite(site.url, html)
    const w = dom.window as unknown as Record<string, any>
    await new Promise((r) => setTimeout(r, options.bootWaitMs ?? 3000))

    if (options.verbose) {
        console.log(
            "dom",
            JSON.stringify({
                sidebar: !!w.document.getElementById("sidebar"),
                main: !!w.document.getElementById("main"),
                bodyChildren: w.document.body?.children?.length,
                wc: !!w.__WC,
            }),
        )
    }
    const wc = w.__WC
    if (!wc || typeof wc.importWorkspaceFromData !== "function") {
        throw new Error(
            "站点未启动：window.__WC.importWorkspaceFromData 不可用",
        )
    }
    if (typeof wc.getMatrixTargetResistancePct !== "function") {
        wc.getMatrixTargetResistancePct = (base: number) => base
    }
    if (typeof wc.sumMatrixFinalPct !== "function") {
        wc.sumMatrixFinalPct = () => 0
    }

    const codes = options.codes ?? await (async () => {
        const manifest = JSON.parse(
            await Deno.readTextFile(new URL("manifest.json", FIXTURE_DIR)),
        ) as {
            items: { code: string }[]
        }
        return manifest.items.map((i) => i.code)
    })()

    const results: WuwaMeasureResult[] = []
    for (const code of codes) {
        const started = performance.now()
        try {
            const pkg = JSON.parse(
                await Deno.readTextFile(new URL(code + ".json", FIXTURE_DIR)),
            )
            const data = pkg?.payload?.data ?? pkg?.data
            const meta = pkg?.payload?.meta ?? pkg?.meta ?? {}
            if (!data) throw new Error("fixture 没有 payload.data")
            await wc.importWorkspaceFromData(data, meta)
            await new Promise((r) => setTimeout(r, 800))
            wc.computeAll()
            const st = wc.state
            const num = (
                v: unknown,

            ) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

            const skillRow = (
                unit: any,
                bd: any,
                catalogId?: string,
                activeIds?: string[],
                stacks?: Record<string, number>,
            ): WuwaSkillResult => ({
                name: unit.name,
                catalogId: catalogId ?? unit.catalogId ?? null,
                damageType: unit.damageType || "",
                scaleStat: unit.scaleStat || "",
                baseMult: num(unit.baseMult),
                multCount: num(unit.multCount),
                damage: Number(bd?.total) || 0,
                breakdown: pickBreakdown(bd),
                activeIds,
                stacks,
            })
            const members = (st.members || []).map((m: any) => {
                const cycleMode = !!m.results?.cycleMode
                const cycles = cycleMode && Array.isArray(m.results.cycles)
                    ? m.results.cycles.map((c: any) => ({
                        index: c.index,
                        total: c.total,
                        steps: (c.steps || []).map((s: any) => ({
                            name: s.name,
                            catalogId: s.catalogId ?? null,
                            damage: Number(s.damage) || 0,
                            breakdown: pickBreakdown(s.breakdown),
                        })),
                    }))
                    : undefined
                const globalActive: Record<string, boolean> = {
                    ...(m.globalBuffActive || {}),
                }
                for (const buff of m.buffs || []) {
                    if (globalActive[buff.id] === undefined) {
                        globalActive[buff.id] = false
                    }
                }
                const globalStacks: Record<string, number> = {
                    ...(m.globalBuffStacks || {}),
                }
                const mergeActive = (
                    mode: string,
                    custom: any,
                    parent: Record<string, boolean>,
                ) => {
                    if (mode === "inherit") return { ...parent }
                    const out = { ...parent }
                    for (const [id, value] of Object.entries(custom || {})) {
                        if (typeof value === "boolean") out[id] = value
                    }
                    return out
                }
                const skills: WuwaSkillResult[] = []
                for (const phase of m.phases || []) {
                    const phaseActive = mergeActive(
                        phase.buffMode,
                        phase.buffActive,
                        globalActive,
                    )
                    const phaseStacks = {
                        ...globalStacks,
                        ...(phase.buffStacks || {}),
                    }
                    for (const skill of phase.skills || []) {
                        const active = mergeActive(
                            skill.buffMode,
                            skill.buffActive,
                            phaseActive,
                        )
                        const stacks = {
                            ...phaseStacks,
                            ...(skill.buffMode === "custom"
                                ? skill.buffStacks || {}
                                : {}),
                        }
                        const activeIds = Object.keys(active).filter((id) =>
                            active[id]
                        )
                        if (skill.split && Array.isArray(skill.hits)) {
                            for (const hit of skill.hits) {
                                const hitActive = mergeActive(
                                    hit.buffMode,
                                    hit.buffActive,
                                    active,
                                )
                                skills.push(
                                    skillRow(
                                        hit,
                                        hit._breakdown,
                                        hit.catalogId ?? skill.catalogId,
                                        Object.keys(hitActive).filter((id) =>
                                            hitActive[id]
                                        ),
                                        stacks,
                                    ),
                                )
                            }
                        } else {
                            skills.push(
                                skillRow(
                                    skill,
                                    skill._breakdown,
                                    skill.catalogId,
                                    activeIds,
                                    stacks,
                                ),
                            )
                        }
                    }
                }
                return {
                    name: m.name,
                    characterId: String(m.characterId || ""),
                    chain: Number(m.resonanceUnlocked) || 0,
                    total: Number(m.results?.total) || 0,
                    cycleMode,
                    skills,
                    cycles,
                    buffs: (m.buffs || []).map((b: any) => ({
                        id: b.id,
                        name: b.name,
                        category: b.category,
                        mode: b.mode,
                        value: b.value,
                        perStack: b.perStack,
                        maxStacks: b.maxStacks,
                        scope: b.scope,
                        effects: b.effects,
                    })),
                    globalStacks,
                }
            })
            const specialSkills = (st.specialSkills?.items || []).map((
                item: any,
            ) => ({
                name: item.name,
                kind: item.kind,
                effectType: item.effectType || "",
                layers: num(item.effectLayers),
                count: num(item.effectCount),
                damage: Number(item._damage) || 0,
                breakdown: pickBreakdown(item._breakdown),
            }))
            results.push({
                code,
                ok: true,
                teamTotal: Number(st.teamResults?.total) || 0,
                dps: Number(st.teamResults?.dps) || 0,
                axisDuration: Number(st.team?.axisDuration) || 0,
                members,
                specialSkills,
                specialTotal: Number(st.specialSkills?.results?.total) || 0,
            })
            if (options.verbose) {
                console.log(
                    code,
                    "total",
                    Math.round(Number(st.teamResults?.total) || 0),
                    (Math.round(performance.now() - started)) + "ms",
                )
            }
        } catch (error) {
            results.push({
                code,
                ok: false,
                error: String((error as Error)?.stack ?? error),
            })
            if (options.verbose) {
                console.log(
                    code,
                    "FAIL",
                    String((error as Error)?.stack ?? error).slice(0, 1200),
                )
            }
        }
    }
    site.close()
    return results
}

if (import.meta.main) {
    const args = Deno.args
    const getArg = (name: string): string | undefined => {
        const at = args.indexOf(name)
        return at >= 0 ? args[at + 1] : undefined
    }
    const codes = getArg("--codes")?.split(",").map((s) => s.trim()).filter(
        Boolean,
    )
    const out = getArg("--out") ?? "tmp/wuwacalc-measure-jsdom.json"
    const results = await measure({ codes, verbose: true })
    await Deno.writeTextFile(out, JSON.stringify(results, null, 2))
    console.log("written " + out)
}
