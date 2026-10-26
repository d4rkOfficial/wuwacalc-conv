/**
 * 人类可读的转换报告。
 *
 * 纯函数：输入转换四阶段的结果（可选地再传入双引擎对比），输出
 * 每个伤害条目绑定了哪些 Buff、每个乘区汇总成多少，以及鸣算屋 / 椰果两边
 * 逐技能、逐乘区的差异。报告本身不跑计算引擎，也不改变工程。
 */

import { inferEntryDamageTypes } from "./convert-project/calculation.ts"
import { ZONE_LABELS } from "./convert-project/data/zones.ts"
import type { ConvertedProjectParts } from "./convert-project/index.ts"
import type {
    CoconutBuffCondition,
    CoconutBuffInstance,
    CoconutBuffZone,
} from "./convert-project/types.ts"
import type {
    ReportEngineComparison,
    ReportEngineSkill,
} from "./convert-project-report-engine.ts"

export interface ReportZone {
    zoneId: string
    label: string
    value: number
    count: number
    override: boolean
    detail: string
}

export interface ReportBuffZone {
    zoneId: string
    label: string
    value: number
    override: boolean
    condition?: CoconutBuffCondition
}

export interface ReportBuff {
    id: string
    name: string
    scope: "all" | number[]
    condition?: CoconutBuffCondition
    zones: ReportBuffZone[]
}

export interface ReportEntry {
    id: string
    character: string
    name: string
    skillType: string
    element: string
    damageTypes: string[]
    ratio: string
    hits: number
    kind: "direct" | "effect" | "tuneBreak" | "tuneResponse"
    /** 该条目所属时间线块的「鸣算屋 vs 椰果」技能合计对比 */
    engine?: ReportEngineSkill
    buffs: ReportBuff[]
    zones: ReportZone[]
}

export interface ProjectReport {
    code: string
    title: string
    generatedAt: string
    team: {
        slot: number
        character: string
        weapon: string
        chain: number
        refinement: number
        triggerSets: { name: string; pieces: number }[]
    }[]
    stages: {
        refLines: number
        damageBlocks: number
        entries: number
        buffs: number
        boundEntries: number
    }
    entries: ReportEntry[]
    engine?: ReportEngineComparison
    markdown: string
}

const NON_PERCENT_ZONES = new Set([
    "atkFlat",
    "hpFlat",
    "defFlat",
    "tuneBreakBoost",
    "tuneStrainLayer",
    "unisonBoonLayer",
])

const zoneLabel = (zoneId: string): string => ZONE_LABELS[zoneId] ?? zoneId

const zoneUnit = (zoneId: string): string =>
    NON_PERCENT_ZONES.has(zoneId) ? "点" : "%"

const pctOf = (value: number): string =>
    Number.isFinite(value)
        ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(3)}%`
        : "∞"

const numberText = (value: number): string =>
    Number.isFinite(value) ? value.toFixed(2) : "∞"

const engineStatusLabel = (status: string): string =>
    status === "match" ? "一致" : status === "warn" ? "小偏差" : "异常"

const ENGINE_PERCENT_POINTS = new Set(["critRate", "critDmg", "multAdd"])

const engineZoneValue = (name: string, value: number): string => {
    if (name === "attack") return value.toFixed(2)
    if (ENGINE_PERCENT_POINTS.has(name)) return `${value.toFixed(2)}%`
    return value.toFixed(4)
}

const engineZoneDelta = (name: string, value: number): string => {
    if (!Number.isFinite(value)) return "∞"
    if (name === "attack") return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`
    if (ENGINE_PERCENT_POINTS.has(name)) {
        return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
    }
    return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`
}

const matchesZone = (
    zone: CoconutBuffZone,
    element: string,
    damageTypes: string[],
): boolean => {
    const cond = zone.condition
    if (!cond) return true
    if (cond.elements?.length) {
        // 条目没元素时从宽保留，让人能看到「条件存在但无法判定」
        if (element && !cond.elements.includes(element)) return false
    }
    if (
        cond.damageTypes?.length &&
        !cond.damageTypes.some((type) => damageTypes.includes(type))
    ) {
        return false
    }
    return true
}

const aggregateZones = (
    entry: ConvertedProjectParts["timeline"]["entries"][number],
    buffs: CoconutBuffInstance[],
    damageTypes: string[],
): ReportZone[] => {
    const sums = new Map<string, number>()
    const overrides = new Map<string, number>()
    const counts = new Map<string, number>()
    const products = new Map<string, number>()
    for (const buff of buffs) {
        for (const zone of buff.zones) {
            if (!matchesZone(zone, entry.damageElement, damageTypes)) continue
            const id = zone.zoneId
            counts.set(id, (counts.get(id) ?? 0) + 1)
            if (id === "specialFinal2") {
                products.set(
                    id,
                    (products.get(id) ?? 1) * (1 + zone.value / 100),
                )
                continue
            }
            if (zone.override) {
                overrides.set(id, zone.value)
                continue
            }
            sums.set(id, (sums.get(id) ?? 0) + zone.value)
        }
    }
    const ids = new Set([
        ...sums.keys(),
        ...overrides.keys(),
        ...products.keys(),
    ])
    return [...ids].map((zoneId) => {
        const override = overrides.has(zoneId)
        const product = products.get(zoneId)
        const value = override
            ? overrides.get(zoneId)!
            : product !== undefined
            ? (product - 1) * 100
            : sums.get(zoneId) ?? 0
        return {
            zoneId,
            label: zoneLabel(zoneId),
            value: Math.round(value * 10000) / 10000,
            count: counts.get(zoneId) ?? 0,
            override,
            detail: override
                ? `覆盖为 ${value}${zoneUnit(zoneId)}`
                : product !== undefined
                ? `连乘 ×${product.toFixed(4)}（折合 +${value.toFixed(2)}%）`
                : `${(counts.get(zoneId) ?? 0)} 条相加`,
        }
    })
}

const markdownOf = (report: Omit<ProjectReport, "markdown">): string => {
    const lines: string[] = []
    lines.push(`# ${report.title || report.code} · 转换映射`)
    lines.push("")
    lines.push(`分享码：\`${report.code}\``)
    lines.push("")
    lines.push("## 队伍")
    lines.push("")
    lines.push("| 站位 | 角色 | 武器 | 链 | 精炼 | 套装 |")
    lines.push("| --- | --- | --- | --- | --- | --- |")
    report.team.forEach((slot) => {
        lines.push(
            `| ${slot.slot + 1} | ${slot.character || "-"} | ${
                slot.weapon || "-"
            } | ${slot.chain} | ${slot.refinement} | ${
                slot.triggerSets.map((set) => `${set.name}(${set.pieces})`)
                    .join(" / ") ||
                "-"
            } |`,
        )
    })
    lines.push("")
    const engine = report.engine
    if (engine?.available) {
        lines.push("## 引擎对比（鸣算屋快照 vs 椰果）")
        lines.push("")
        lines.push("| 口径 | 鸣算屋 | 椰果 | 偏差 |")
        lines.push("| --- | ---: | ---: | ---: |")
        const totalRow = (
            label: string,
            item: { wuwa: number; coconut: number; rel: number },
        ) => {
            lines.push(
                `| ${label} | ${numberText(item.wuwa)} | ${
                    numberText(item.coconut)
                } | ${pctOf(item.rel)} |`,
            )
        }
        totalRow("总伤", engine.total)
        totalRow("直伤", engine.direct)
        totalRow("非直伤", engine.special)
        lines.push("")
        lines.push("### 角色合计")
        lines.push("")
        lines.push("| 角色 | 鸣算屋 | 椰果 | 偏差 | 状态 |")
        lines.push("| --- | ---: | ---: | ---: | --- |")
        for (const member of engine.members) {
            lines.push(
                `| ${member.character} | ${numberText(member.wuwa)} | ${
                    numberText(member.coconut)
                } | ${pctOf(member.rel)} | ${
                    engineStatusLabel(member.status)
                } |`,
            )
        }
        lines.push("")
        if (engine.detailed) {
            lines.push("### 逐技能")
            lines.push("")
            lines.push(
                "| 角色 | 技能 | 鸣算屋 | 椰果 | 偏差 | 状态 | 差异乘区 |",
            )
            lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |")
            for (
                const skill of [...engine.skills].sort((a, b) =>
                    Math.abs(b.rel) - Math.abs(a.rel)
                )
            ) {
                const zones = skill.zones
                    .map((zone) =>
                        `${zone.name} ${
                            engineZoneValue(zone.name, zone.wuwa)
                        } → ${engineZoneValue(zone.name, zone.coconut)} (${
                            engineZoneDelta(zone.name, zone.delta)
                        })`
                    )
                    .join("<br>") || "-"
                lines.push(
                    `| ${skill.character} | ${skill.wuwaName} | ${
                        numberText(skill.wuwaDamage)
                    } | ${numberText(skill.coconutDamage)} | ${
                        pctOf(skill.rel)
                    } | ${engineStatusLabel(skill.status)} | ${zones} |`,
                )
            }
            lines.push("")
        }
        if (engine.note) {
            lines.push(`> ${engine.note}`)
            lines.push("")
        }
    }
    lines.push("## 伤害条目")
    lines.push("")
    for (const entry of report.entries) {
        lines.push(
            `### ${entry.character} · ${entry.name}`,
        )
        lines.push("")
        lines.push(
            `- id：\`${entry.id}\`\n- 类型：${
                entry.damageTypes.join(" / ") || "-"
            }\n- 倍率：${entry.ratio} × ${entry.hits}\n- 元素：${
                entry.element || "-"
            }`,
        )
        if (entry.engine) {
            lines.push(
                `- 引擎：${numberText(entry.engine.wuwaDamage)} → ${
                    numberText(entry.engine.coconutDamage)
                }（${pctOf(entry.engine.rel)}，${
                    engineStatusLabel(entry.engine.status)
                }）`,
            )
        }
        lines.push("")
        lines.push("| 乘区 | 汇总 | 来源 |")
        lines.push("| --- | --- | --- |")
        if (!entry.zones.length) lines.push("| - | - | - |")
        for (const zone of entry.zones) {
            lines.push(
                `| ${zone.label} | ${zone.value}${
                    zoneUnit(zone.zoneId)
                } | ${zone.detail} |`,
            )
        }
        lines.push("")
        lines.push(
            "<details><summary>绑定的 Buff（" + entry.buffs.length +
                "）</summary>",
        )
        lines.push("")
        lines.push("| Buff | 作用域 | 乘区 |")
        lines.push("| --- | --- | --- |")
        for (const buff of entry.buffs) {
            const scope = buff.scope === "all"
                ? "全队"
                : buff.scope.length
                ? buff.scope.map((i) => `站位${i + 1}`).join("、")
                : "仅效应"
            const zones = buff.zones
                .map((zone) =>
                    `${zone.label} ${zone.value}${zoneUnit(zone.zoneId)}${
                        zone.override ? "（覆盖）" : ""
                    }`
                )
                .join("<br>")
            lines.push(`| ${buff.name} | ${scope} | ${zones} |`)
        }
        lines.push("")
        lines.push("</details>")
        lines.push("")
    }
    return lines.join("\n")
}

export const buildProjectReport = (
    code: string,
    detailTitle: string,
    parts: ConvertedProjectParts,
    engine?: ReportEngineComparison,
): ProjectReport => {
    const calc = parts.calculation.phase.data
    const bindings = calc?.damageEntryBuffSetIds ?? {}
    const calcTypes = calc?.damageEntryDamageTypes ?? {}
    const buffsById = new Map(
        (calc?.buffSets ?? parts.calculation.buffs).map((
            buff,
        ) => [buff.id, buff]),
    )
    const hitByBlock = new Map(
        (parts.timeline.phase.data?.damageBlocks ?? []).map((block) => [
            block.id,
            block.skillHits[0],
        ]),
    )
    const entries: ReportEntry[] = parts.timeline.entries.map((entry) => {
        const damageTypes = calcTypes[entry.id] ?? inferEntryDamageTypes(entry)
        const blockId = /^(d\d+)/.exec(entry.id)?.[1] ?? ""
        const hit = hitByBlock.get(blockId)
        const ratio = hit?.ratio ??
            (entry.ratioValue !== undefined
                ? `${entry.ratioValue}${entry.ratioUnit === "fixed" ? "" : "%"}`
                : "-")
        const buffs = (bindings[entry.id] ?? [])
            .map((id) => buffsById.get(id))
            .filter((buff): buff is CoconutBuffInstance => !!buff)
            .map((buff) => ({
                id: buff.id,
                name: buff.name,
                scope: buff.scope,
                ...(buff.condition ? { condition: buff.condition } : {}),
                zones: buff.zones.map((zone) => ({
                    zoneId: zone.zoneId,
                    label: zoneLabel(zone.zoneId),
                    value: zone.value,
                    override: !!zone.override,
                    ...(zone.condition ? { condition: zone.condition } : {}),
                })),
            }))
        return {
            id: entry.id,
            character: entry.character,
            name: entry.displayName || entry.hitName,
            skillType: entry.skillType,
            element: entry.damageElement,
            damageTypes,
            ratio,
            hits: entry.hits,
            kind: entry.isEffect
                ? "effect"
                : entry.isTuneBreak
                ? "tuneBreak"
                : entry.isTuneResponse
                ? "tuneResponse"
                : "direct",
            ...(engine?.byBlock[entry.sourceTimelineBlockId]
                ? { engine: engine.byBlock[entry.sourceTimelineBlockId] }
                : {}),
            buffs,
            zones: aggregateZones(entry, buffs, damageTypes),
        }
    })
    const report = {
        code,
        title: detailTitle,
        generatedAt: new Date().toISOString(),
        team: parts.team.slots.map((slot, index) => ({
            slot: index,
            character: slot.character ?? "",
            weapon: slot.weapon ?? "",
            chain: slot.chain ?? 0,
            refinement: slot.refinement ?? 0,
            triggerSets: slot.triggerSets,
        })),
        stages: {
            refLines: parts.timeline.phase.data?.refLines.length ?? 0,
            damageBlocks: parts.timeline.phase.data?.damageBlocks.length ?? 0,
            entries: parts.timeline.entries.length,
            buffs: (calc?.buffSets ?? parts.calculation.buffs).length,
            boundEntries: Object.keys(bindings).length,
        },
        entries,
        ...(engine ? { engine } : {}),
    }
    return { ...report, markdown: markdownOf(report) }
}

const comparisonStatus = (rel: number): string => {
    if (!Number.isFinite(rel)) return "bad"
    const abs = Math.abs(rel)
    return abs < 0.001 ? "match" : abs < 0.01 ? "warn" : "bad"
}

const statusClass = (status: string): string =>
    status === "match" ? "good" : status === "warn" ? "warn" : "bad"

const escapeHtml = (value: unknown): string =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char] ?? char,
    )

export const renderProjectReportHtml = (report: ProjectReport): string => {
    const teamRows = report.team.map((slot) =>
        "<tr><td>" + (slot.slot + 1) + "</td><td>" +
        escapeHtml(slot.character || "-") + "</td><td>" +
        escapeHtml(slot.weapon || "-") + "</td><td>" + slot.chain +
        "</td><td>" + slot.refinement + "</td><td>" +
        escapeHtml(
            slot.triggerSets.map((set) => set.name + "(" + set.pieces + ")")
                .join(" / ") || "-",
        ) + "</td></tr>"
    ).join("")
    const engine = report.engine
    const engineCards = engine?.available
        ? [
            '<div class="card">鸣算屋快照总伤<b>' +
            numberText(engine.total.wuwa) +
            "</b></div>",
            '<div class="card">椰果工具箱总伤<b>' +
            numberText(engine.total.coconut) +
            "</b></div>",
            '<div class="card ' +
            statusClass(comparisonStatus(engine.total.rel)) +
            '">总伤偏差<b>' + pctOf(engine.total.rel) + "</b></div>",
        ]
        : []
    const engineSummaryRows = engine?.available
        ? ([
            ["总伤", engine.total],
            ["直伤", engine.direct],
            ["非直伤", engine.special],
        ] as const).map(([label, item]) =>
            "<tr><td>" + label + '</td><td class="num">' +
            numberText(item.wuwa) + '</td><td class="num">' +
            numberText(item.coconut) + '</td><td class="num ' +
            statusClass(comparisonStatus(item.rel)) + '">' + pctOf(item.rel) +
            "</td></tr>"
        ).join("")
        : ""
    const memberRows = engine?.available
        ? engine.members.map((member) =>
            "<tr><td>" + escapeHtml(member.character) +
            '</td><td class="num">' + numberText(member.wuwa) +
            '</td><td class="num">' + numberText(member.coconut) +
            '</td><td class="num ' + statusClass(member.status) + '">' +
            pctOf(member.rel) + '</td><td class="' +
            statusClass(member.status) + '">' +
            engineStatusLabel(member.status) + "</td></tr>"
        ).join("")
        : ""
    const skillRows = engine?.detailed
        ? [...engine.skills].sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))
            .map((skill) => {
                const zones = skill.zones.length
                    ? "<table><thead><tr><th>乘区</th><th>鸣算屋</th><th>椰果</th><th>偏差</th></tr></thead><tbody>" +
                        skill.zones.map((zone) =>
                            "<tr><td>" + escapeHtml(zone.name) +
                            '</td><td class="num">' +
                            engineZoneValue(zone.name, zone.wuwa) +
                            '</td><td class="num">' +
                            engineZoneValue(zone.name, zone.coconut) +
                            '</td><td class="num ' + statusClass(zone.status) +
                            '">' + engineZoneDelta(zone.name, zone.delta) +
                            "</td></tr>"
                        ).join("") + "</tbody></table>"
                    : '<span class="good">无乘区差异</span>'
                return "<tr><td>" + escapeHtml(skill.character) +
                    "</td><td>" + escapeHtml(skill.wuwaName) +
                    '</td><td class="num">' + numberText(skill.wuwaDamage) +
                    '</td><td class="num">' + numberText(skill.coconutDamage) +
                    '</td><td class="num ' + statusClass(skill.status) + '">' +
                    pctOf(skill.rel) + '</td><td class="' +
                    statusClass(skill.status) + '">' +
                    engineStatusLabel(skill.status) +
                    "</td><td><details><summary>" +
                    (skill.zones.length
                        ? skill.zones.length + " 个差异"
                        : "一致") +
                    "</summary>" + zones + "</details></td></tr>"
            }).join("")
        : ""
    const engineHtml = engine?.available
        ? [
            "<h2>引擎对比（鸣算屋快照 vs 椰果）</h2>",
            '<p class="muted">左边是鸣算屋分享快照里保存的结算（分享时的值，不保证等于当前线上引擎重算）；右边是转换后在服务端重跑的椰果工具箱引擎。偏差按「椰果 − 鸣算屋快照」计算。</p>',
            "<table><thead><tr><th>口径</th><th>鸣算屋</th><th>椰果</th><th>偏差</th></tr></thead><tbody>" +
            engineSummaryRows + "</tbody></table>",
            "<h3>角色合计</h3>",
            "<table><thead><tr><th>角色</th><th>鸣算屋</th><th>椰果</th><th>偏差</th><th>状态</th></tr></thead><tbody>" +
            memberRows + "</tbody></table>",
            ...(engine.detailed
                ? [
                    "<h3>逐技能</h3>",
                    '<p class="muted">点开最后一列看具体乘区差。乘区值：增伤/加深/易伤/抗性/防御为倍率，暴击/暴伤/倍率加成为百分点，攻击为面板值。</p>',
                    "<table><thead><tr><th>角色</th><th>技能</th><th>鸣算屋</th><th>椰果</th><th>偏差</th><th>状态</th><th>乘区</th></tr></thead><tbody>" +
                    skillRows + "</tbody></table>",
                ]
                : []),
            engine.note
                ? '<p class="muted">' + escapeHtml(engine.note) + "</p>"
                : "",
        ]
        : []
    const entryHtml = report.entries.map((entry) => {
        const zoneRows = entry.zones.length
            ? entry.zones.map((zone) =>
                "<tr><td>" + escapeHtml(zone.label) + '</td><td class="num">' +
                zone.value + (zone.override ? "（覆盖）" : "") +
                "</td><td>" + escapeHtml(zone.detail) + "</td></tr>"
            ).join("")
            : '<tr><td colspan="3" class="muted">没有生效乘区</td></tr>'
        const buffRows = entry.buffs.map((buff) => {
            const scope = buff.scope === "all"
                ? "全队"
                : buff.scope.length
                ? buff.scope.map((i) => "站位" + (i + 1)).join("、")
                : "仅效应"
            const zones = buff.zones.map((zone) =>
                escapeHtml(zone.label) + " " + zone.value +
                (zone.override ? "（覆盖）" : "")
            ).join("<br>")
            return "<tr><td>" + escapeHtml(buff.name) + "<br><code>" +
                escapeHtml(buff.id) + "</code></td><td>" + escapeHtml(scope) +
                "</td><td>" + zones + "</td></tr>"
        }).join("")
        const engineLine = entry.engine
            ? '<p class="engine-line ' + statusClass(entry.engine.status) +
                '">引擎合计：' + numberText(entry.engine.wuwaDamage) +
                " → " + numberText(entry.engine.coconutDamage) + "（" +
                pctOf(entry.engine.rel) + "，" +
                engineStatusLabel(entry.engine.status) + "）" +
                (entry.engine.zones.length
                    ? "<br>差异：" +
                        entry.engine.zones.map((zone) =>
                            escapeHtml(zone.name) + " " +
                            engineZoneDelta(zone.name, zone.delta)
                        ).join(" · ")
                    : "") +
                "</p>"
            : ""
        return '<details class="entry"><summary><strong>' +
            escapeHtml(entry.character) + " · " + escapeHtml(entry.name) +
            '</strong><span class="meta">' +
            escapeHtml(entry.damageTypes.join(" / ") || "-") +
            " · " + escapeHtml(entry.ratio) + " × " + entry.hits +
            '</span></summary><p class="muted"><code>' +
            escapeHtml(entry.id) + "</code></p>" + engineLine +
            "<h4>乘区汇总</h4><table><thead><tr><th>乘区</th><th>汇总</th><th>来源</th></tr></thead><tbody>" +
            zoneRows + "</tbody></table><h4>绑定 Buff（" +
            entry.buffs.length +
            "）</h4><table><thead><tr><th>Buff</th><th>作用域</th><th>乘区</th></tr></thead><tbody>" +
            (buffRows ||
                '<tr><td colspan="3" class="muted">没有绑定 Buff</td></tr>') +
            "</tbody></table></details>"
    }).join("")
    const title = escapeHtml(report.title || report.code)
    return [
        '<!doctype html><html lang="zh-CN"><head>',
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>" + title + " · 转换映射</title>",
        "<style>",
        ":root{color-scheme:dark;--bg:#111418;--panel:#1b2028;--line:#2c3440;--text:#e7edf5;--muted:#93a1b3;--accent:#7cc7ff}",
        '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif}',
        "main{max-width:1120px;margin:0 auto;padding:28px 18px 64px}h1{font-size:24px;margin:0 0 6px}",
        "h2{font-size:18px;margin:28px 0 10px}h3{font-size:16px;margin:18px 0 8px}h4{font-size:14px;margin:16px 0 6px}",
        ".muted{color:var(--muted)}.meta{float:right;color:var(--muted);font-weight:400}",
        "table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);margin:8px 0 14px}",
        "th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}",
        "code{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#b8d7ff}",
        ".num{text-align:right;white-space:nowrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}",
        ".card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.card b{display:block;font-size:20px}",
        ".entry{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:10px 0}",
        ".entry summary{cursor:pointer;list-style:none}.entry summary::-webkit-details-marker{display:none}",
        '.entry summary:before{content:"▸";color:var(--accent);display:inline-block;margin-right:8px;transition:transform .15s}',
        ".entry[open] summary:before{transform:rotate(90deg)}a{color:var(--accent)}",
        ".good{color:#7ee787}.warn{color:#e3b341}.bad{color:#ff7b72}",
        ".engine-line{margin:6px 0 10px;padding:6px 8px;border-left:3px solid currentColor;background:#151a21}",
        ".card.good,.card.warn,.card.bad{border-color:currentColor}",
        "</style></head><body><main>",
        "<h1>" + title + "</h1>",
        '<p class="muted">分享码 <code>' + escapeHtml(report.code) +
        "</code> · " + escapeHtml(report.generatedAt) +
        ' · <a href="/api/convert/' + encodeURIComponent(report.code) +
        '/report">JSON</a></p>',
        '<div class="cards">',
        ...engineCards,
        '<div class="card">条目<b>' + report.stages.entries + "</b></div>",
        '<div class="card">Buff<b>' + report.stages.buffs + "</b></div>",
        '<div class="card">已绑定条目<b>' + report.stages.boundEntries +
        "</b></div>",
        '<div class="card">参考线<b>' + report.stages.refLines + "</b></div>",
        "</div>",
        "<h2>队伍</h2><table><thead><tr><th>站位</th><th>角色</th><th>武器</th><th>链</th><th>精炼</th><th>套装</th></tr></thead><tbody>" +
        teamRows + "</tbody></table>",
        ...engineHtml,
        "<h2>转换映射</h2>",
        '<p class="muted">每条显示转换后绑定的 Buff 与乘区汇总（相加/覆盖），用于解释引擎结果的来源；最终结算以上面的双引擎对比为准。</p>',
        entryHtml,
        "</main></body></html>",
    ].join("\n")
}
