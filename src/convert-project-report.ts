/**
 * 人类可读的转换报告。
 *
 * 纯函数：输入转换四阶段的结果（可选地再传入双引擎对比），输出
 * 每个伤害条目绑定了哪些 Buff、每个乘区汇总成多少，以及鸣算屋 / 椰果工具箱两边
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
    CoconutSkillSnapshot,
    ReportEngineComparison,
    ReportEngineSkill,
} from "./convert-project-report-engine.ts"
import { renderLocalRecomputeHtml } from "./convert-project-report-client.ts"

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
    /** 全局 Buff 列表里的锚点 */
    anchor?: string
}

export interface ReportBuffEntryLink {
    id: string
    name: string
    character: string
    anchor: string
}

export interface ReportBuffItem extends ReportBuff {
    /** 来源：角色本体 / 武器 / 声骸 / 套装 / 集谐 */
    source: string
    /** 这条 Buff 实际附加到的伤害条目 */
    entries: ReportBuffEntryLink[]
}

export interface ReportEntry {
    id: string
    /** 报告内锚点，供 Buff 列表跳转 */
    anchor: string
    character: string
    name: string
    skillType: string
    element: string
    damageTypes: string[]
    ratio: string
    hits: number
    kind: "direct" | "effect" | "tuneBreak" | "tuneResponse"
    /** 该条目所属时间线块的「鸣算屋 vs 椰果工具箱」技能合计对比 */
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
    /** 全局 Buff 提取列表 */
    buffs?: ReportBuffItem[]
    engine?: ReportEngineComparison
    /** 分享快照没有逐技能时，交给浏览器本地重算的数据 */
    localRecompute?: {
        code: string
        coconutMs?: number
        coconutSkills: CoconutSkillSnapshot[]
    }
    timings?: {
        coconutMs?: number
        wuwaMs?: number | null
        wuwaMode?: "snapshot" | "local"
    }
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

const ENGINE_ZONE_LABELS: Record<string, string> = {
    attack: "攻击",
    hp: "生命",
    def: "防御",
    baseMult: "倍率",
    dmgBonus: "增伤",
    deepen: "加深",
    vulnerability: "易伤",
    resistance: "抗性",
    defense: "防御乘区",
    critRate: "暴击率",
    critDmg: "暴击伤害",
    critExpect: "双暴期望",
    multBoost: "倍率提升",
    multAdd: "倍率追加",
}

const engineZoneLabel = (name: string): string =>
    ENGINE_ZONE_LABELS[name] ?? name

const ENGINE_PERCENT_POINTS = new Set(["critRate", "critDmg", "multAdd"])
const ENGINE_FLAT_ZONES = new Set(["attack", "hp", "def"])

const engineZoneValue = (name: string, value: number): string => {
    if (ENGINE_FLAT_ZONES.has(name)) return value.toFixed(2)
    if (ENGINE_PERCENT_POINTS.has(name)) return `${value.toFixed(2)}%`
    return value.toFixed(4)
}

const engineZoneDelta = (name: string, value: number): string => {
    if (!Number.isFinite(value)) return "∞"
    if (ENGINE_FLAT_ZONES.has(name)) {
        return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`
    }
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
        lines.push("## 引擎对比（鸣算屋快照 vs 椰果工具箱）")
        lines.push("")
        lines.push("| 范围 | 鸣算屋 | 椰果工具箱 | 偏差 |")
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
        lines.push("| 角色 | 鸣算屋 | 椰果工具箱 | 偏差 | 状态 |")
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
                "| 角色 | 技能 | 鸣算屋 | 椰果工具箱 | 偏差 | 状态 | 差异乘区 |",
            )
            lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |")
            for (
                const skill of [...engine.skills].sort((a, b) =>
                    Math.abs(b.rel) - Math.abs(a.rel)
                )
            ) {
                const zones = skill.zones
                    .map((zone) =>
                        `${engineZoneLabel(zone.name)} ${
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
    const buffOrder: string[] = []
    const seenBuffIds = new Set<string>()
    for (const entry of parts.timeline.entries) {
        for (const id of bindings[entry.id] ?? []) {
            if (!buffsById.has(id) || seenBuffIds.has(id)) continue
            seenBuffIds.add(id)
            buffOrder.push(id)
        }
    }
    const buffAnchors = new Map(
        buffOrder.map((id, index) => [id, `buff-${index + 1}`]),
    )
    const entries: ReportEntry[] = parts.timeline.entries.map(
        (entry, index) => {
            const damageTypes = calcTypes[entry.id] ??
                inferEntryDamageTypes(entry)
            const blockId = /^(d\d+)/.exec(entry.id)?.[1] ?? ""
            const hit = hitByBlock.get(blockId)
            const ratio = hit?.ratio ??
                (entry.ratioValue !== undefined
                    ? `${entry.ratioValue}${
                        entry.ratioUnit === "fixed" ? "" : "%"
                    }`
                    : "-")
            const buffs = (bindings[entry.id] ?? [])
                .map((id) => buffsById.get(id))
                .filter((buff): buff is CoconutBuffInstance => !!buff)
                .map((buff) => toReportBuff(buff, buffAnchors.get(buff.id)))
            return {
                id: entry.id,
                anchor: `entry-${index + 1}`,
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
        },
    )
    const buffUsage = new Map<string, ReportBuffEntryLink[]>()
    for (const entry of entries) {
        for (const id of bindings[entry.id] ?? []) {
            const list = buffUsage.get(id) ?? []
            list.push({
                id: entry.id,
                name: entry.name,
                character: entry.character,
                anchor: entry.anchor,
            })
            buffUsage.set(id, list)
        }
    }
    const buffs: ReportBuffItem[] = buffOrder
        .map((id) => {
            const buff = buffsById.get(id)
            if (!buff) return null
            return {
                ...toReportBuff(buff, buffAnchors.get(id)),
                source: buffSourceOf(id),
                entries: buffUsage.get(id) ?? [],
            }
        })
        .filter((buff): buff is ReportBuffItem => buff !== null)
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
        buffs,
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

const buffSourceOf = (id: string): string => {
    const key = id.toLowerCase()
    const slot = /^(?:tm_)?(?:pk|tb|weapon_team_fx|weapon_fx)_(\d+)_/.exec(
        key,
    )?.[1]
    const at = slot !== undefined ? ` · 站位${Number(slot) + 1}` : ""
    if (key.includes("echo_set")) return "声骸套装" + at
    if (key.includes("echo")) return "声骸" + at
    if (key.includes("weapon")) return "武器" + at
    if (key.includes("convergence")) return "集谐" + at
    if (/^(tm_)?(pk|tb)_/.test(key) || key.includes("tpl_")) {
        return "角色本体" + at
    }
    return "其它"
}

const conditionText = (condition?: CoconutBuffCondition): string => {
    if (!condition) return "—"
    const parts: string[] = []
    for (const chain of condition.chains ?? []) {
        parts.push(`站位${chain.charIdx + 1} ≥ ${chain.min} 链`)
    }
    for (const refinement of condition.refinements ?? []) {
        parts.push(`站位${refinement.charIdx + 1} ≥ ${refinement.min} 精炼`)
    }
    if (condition.elements?.length) {
        parts.push(`属性：${condition.elements.join(" / ")}`)
    }
    if (condition.damageTypes?.length) {
        parts.push(`类型：${condition.damageTypes.join(" / ")}`)
    }
    return parts.join(" · ") || "—"
}

const scopeText = (scope: "all" | number[]): string =>
    scope === "all"
        ? "全队"
        : scope.length
        ? scope.map((index) => `站位${index + 1}`).join("、")
        : "仅效应伤害"

const toReportBuff = (
    buff: CoconutBuffInstance,
    anchor?: string,
): ReportBuff => ({
    id: buff.id,
    name: buff.name,
    scope: buff.scope,
    ...(buff.condition ? { condition: buff.condition } : {}),
    ...(anchor ? { anchor } : {}),
    zones: buff.zones.map((zone) => ({
        zoneId: zone.zoneId,
        label: zoneLabel(zone.zoneId),
        value: zone.value,
        override: !!zone.override,
        ...(zone.condition ? { condition: zone.condition } : {}),
    })),
})

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
    const timing = report.timings
    const coconutMs = timing?.coconutMs !== undefined
        ? String(Math.round(timing.coconutMs))
        : "—"
    const wuwaMode = timing?.wuwaMode === "snapshot" ? "snapshot" : "local"
    const wuwaMs = wuwaMode === "snapshot" ? "—" : "…"
    const wuwaUnit = wuwaMode === "snapshot" ? "分享快照，未重算" : "ms"
    const skillTimingHtml = engine?.available
        ? '<div class="engine-times">' +
            '<div class="engine-time engine-time-coconut"><span>椰果工具箱引擎计算用时</span><div><b id="coconut-time">' +
            coconutMs + "</b><small>ms</small></div></div>" +
            '<div class="engine-time engine-time-wuwa"><span>鸣算屋引擎计算用时</span><div><b id="wuwa-time">' +
            wuwaMs + '</b><small id="wuwa-unit">' + wuwaUnit +
            "</small></div></div></div>"
        : ""
    const statCard = (
        label: string,
        value: string,
        note: string,
        status = "",
    ) => '<div class="stat' + (status ? " " + status : "") +
        '"><span class="label">' + label + '</span><span class="value">' +
        value + '</span><span class="note">' + note + "</span></div>"
    const engineCards = engine?.available
        ? [
            statCard(
                "鸣算屋快照总伤",
                numberText(engine.total.wuwa),
                "分享时保存的结算",
            ),
            statCard(
                "椰果工具箱总伤",
                numberText(engine.total.coconut),
                "服务端重跑结果",
            ),
            statCard(
                "总伤偏差",
                pctOf(engine.total.rel),
                "相差 " + (engine.total.delta >= 0 ? "+" : "") +
                    numberText(engine.total.delta),
                statusClass(comparisonStatus(engine.total.rel)),
            ),
            statCard(
                "转换条目",
                String(report.entries.length),
                report.stages.buffs + " 条 Buff",
            ),
        ]
        : [
            statCard("伤害条目", String(report.stages.entries), "转换后条目"),
            statCard("Buff", String(report.stages.buffs), "拉表阶段实例"),
            statCard(
                "已绑定",
                String(report.stages.boundEntries),
                "有 Buff 的条目",
            ),
            statCard("参考线", String(report.stages.refLines), "排轴时间线"),
        ]
    const engineSummaryRows = engine?.available
        ? ([
            ["总伤", engine.total],
            ["直伤", engine.direct],
            ["非直伤", engine.special],
        ] as const).map(([label, item]) =>
            "<tr><td>" + label + '</td><td class="num">' +
            numberText(item.wuwa) + '</td><td class="num">' +
            numberText(item.coconut) + '</td><td class="num ' +
            statusClass(comparisonStatus(item.rel)) + '"><b>' +
            (item.delta >= 0 ? "+" : "") + numberText(item.delta) +
            '</b><small class="pct">' + pctOf(item.rel) +
            "</small></td></tr>"
        ).join("")
        : ""
    const memberRows = engine?.available
        ? engine.members.map((member) =>
            "<tr><td>" + escapeHtml(member.character) +
            '</td><td class="num">' + numberText(member.wuwa) +
            '</td><td class="num">' + numberText(member.coconut) +
            '</td><td class="num ' + statusClass(member.status) + '"><b>' +
            (member.delta >= 0 ? "+" : "") + numberText(member.delta) +
            '</b><small class="pct">' + pctOf(member.rel) +
            '</small></td><td class="' +
            statusClass(member.status) + '">' +
            engineStatusLabel(member.status) + "</td></tr>"
        ).join("")
        : ""
    const skillRows = engine?.detailed
        ? [...engine.skills].sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))
            .map((skill) => {
                const zones = skill.zones.length
                    ? '<div class="zone-grid">' + skill.zones.map((zone) =>
                        '<span class="zone-chip ' + statusClass(zone.status) +
                        '"><b>' + escapeHtml(engineZoneLabel(zone.name)) +
                        '</b><span class="zone-values"><em>鸣 ' +
                        engineZoneValue(zone.name, zone.wuwa) +
                        "</em><em>椰 " +
                        engineZoneValue(zone.name, zone.coconut) +
                        "</em></span><small>" +
                        engineZoneDelta(zone.name, zone.delta) + " / " +
                        pctOf(zone.rel) + "</small></span>"
                    ).join("") + "</div>"
                    : '<span class="good">—</span>'
                return '<tr><td class="skill-cell"><strong>' +
                    escapeHtml(skill.wuwaName) + "</strong><small>" +
                    escapeHtml(skill.character) + "</small></td>" +
                    '<td class="num">' + numberText(skill.wuwaDamage) +
                    '</td><td class="num">' + numberText(skill.coconutDamage) +
                    '</td><td class="num"><b class="' +
                    statusClass(skill.status) + '">' +
                    (skill.delta >= 0 ? "+" : "") + numberText(skill.delta) +
                    '</b><small class="pct">' + pctOf(skill.rel) +
                    '</small></td><td class="' +
                    statusClass(skill.status) + '">' +
                    engineStatusLabel(skill.status) +
                    '</td><td class="zone-cell">' + zones + "</td></tr>"
            }).join("")
        : ""
    const localPanelHtml = report.localRecompute
        ? [
            '<div class="recompute" id="recompute-panel">',
            '<div class="recompute-copy"><span class="kicker">LOCAL RECOMPUTE</span>',
            "<h3>重算控制</h3>",
            '<p class="recompute-status" id="recompute-status" aria-live="polite">准备加载鸣算屋引擎…</p></div>',
            '<button class="button" id="recompute-button" type="button">开始重算</button>',
            "</div>",
            '<div class="progress" role="progressbar" aria-label="重算进度" aria-valuemin="0" aria-valuemax="100"><i id="recompute-bar"></i></div>',
        ].join("")
        : ""
    const engineHtml = engine?.available
        ? [
            '<table class="summary-table"><thead><tr><th>范围</th><th class="num">鸣算屋</th><th class="num">椰果工具箱</th><th class="num">偏差</th></tr></thead><tbody>' +
            engineSummaryRows + "</tbody></table>",
            "<h3>角色合计</h3>",
            '<table class="member-table"><thead><tr><th>角色</th><th class="num">鸣算屋</th><th class="num">椰果工具箱</th><th class="num">偏差</th><th>状态</th></tr></thead><tbody>' +
            memberRows + "</tbody></table>",
            ...(engine.detailed
                ? [
                    "<h3>逐技能</h3>",
                    skillTimingHtml,
                    '<p class="muted">乘区值：增伤 / 加深 / 易伤 / 抗性 / 防御为倍率，暴击 / 暴伤 / 倍率加成为百分点，攻击 / 生命 / 防御为面板值。</p>',
                    '<table class="skills-table"><thead><tr><th>技能</th><th class="num">鸣算屋</th><th class="num">椰果工具箱</th><th class="num">偏差</th><th>状态</th><th>乘区差异</th></tr></thead><tbody>' +
                    skillRows + "</tbody></table>",
                ]
                : [
                    "<h3>逐技能</h3>",
                    skillTimingHtml,
                    localPanelHtml,
                    '<div id="local-engine"><p class="muted">正在加载鸣算屋引擎并重算…</p></div>',
                ]),
        ]
        : []
    const buffRows = (report.buffs ?? []).map((buff) => {
        const effects = buff.zones.map((zone) =>
            '<span class="effect-item">' + escapeHtml(zone.label) + " " +
            zone.value + zoneUnit(zone.zoneId) +
            (zone.override ? "（覆盖）" : "") +
            (zone.condition
                ? "<small>" + escapeHtml(conditionText(zone.condition)) +
                    "</small>"
                : "") +
            "</span>"
        ).join("")
        const linkOf = (entry: ReportBuffEntryLink) =>
            '<a class="entry-link" href="#' + entry.anchor + '">' +
            escapeHtml(entry.character) + " · " + escapeHtml(entry.name) +
            "</a>"
        const hasMore = buff.entries.length > 3
        const visible = hasMore ? buff.entries.slice(0, 2) : buff.entries
        const links = visible.map(linkOf).join("")
        const more = hasMore
            ? '<button class="more-link" type="button" data-buff-modal="' +
                buff.anchor + '" data-buff-title="' + escapeHtml(buff.name) +
                '">查看更多…</button><template id="buff-links-' +
                buff.anchor + '">' + buff.entries.map(linkOf).join("") +
                "</template>"
            : ""
        return '<tr id="' + buff.anchor + '"><td><span class="buff-source">' +
            escapeHtml(buff.source) + '</span><strong class="buff-name">' +
            escapeHtml(buff.name) + "</strong><code>" + escapeHtml(buff.id) +
            "</code></td><td>" + escapeHtml(conditionText(buff.condition)) +
            '<small class="buff-scope">' + escapeHtml(scopeText(buff.scope)) +
            '</small><div class="effect-list">' + effects +
            '</div></td><td><div class="link-list">' + (links || "—") +
            more + "</div></td></tr>"
    }).join("")
    const entryHtml = report.entries.map((entry) => {
        const zoneRows = entry.zones.length
            ? '<div class="table-scroll"><table class="zone-horizontal"><thead><tr><th>乘区</th>' +
                entry.zones.map((zone) =>
                    "<th>" + escapeHtml(zone.label) +
                    "</th>"
                ).join("") +
                "</tr></thead><tbody><tr><td>汇总</td>" +
                entry.zones.map((zone) =>
                    '<td class="num">' + zone.value +
                    zoneUnit(zone.zoneId) +
                    (zone.override ? "（覆盖）" : "") + "</td>"
                ).join("") +
                "</tr><tr><td>来源</td>" +
                entry.zones.map((zone) =>
                    '<td class="muted">' +
                    escapeHtml(zone.detail) + "</td>"
                ).join("") +
                "</tr></tbody></table></div>"
            : '<p class="muted">没有生效乘区</p>'
        const buffRows = entry.buffs.map((buff) => {
            const conditions = [
                conditionText(buff.condition),
                scopeText(buff.scope),
            ].filter((value) => value && value !== "—").join(" · ")
            const zones = buff.zones.map((zone) =>
                '<span class="effect-item">' + escapeHtml(zone.label) + " " +
                zone.value + zoneUnit(zone.zoneId) +
                (zone.override ? "（覆盖）" : "") +
                (zone.condition
                    ? "<small>" + escapeHtml(conditionText(zone.condition)) +
                        "</small>"
                    : "") +
                "</span>"
            ).join("")
            const href = buff.anchor ? "#" + buff.anchor : "#"
            return '<tr><td><a href="' + href + '">' +
                escapeHtml(buff.name) + "</a><code>" + escapeHtml(buff.id) +
                "</code></td><td>" + escapeHtml(conditions || "—") +
                '</td><td><div class="effect-list">' + zones +
                "</div></td></tr>"
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
                            escapeHtml(engineZoneLabel(zone.name)) + " " +
                            engineZoneDelta(zone.name, zone.delta)
                        ).join(" · ")
                    : "") +
                "</p>"
            : ""
        return '<details class="entry" id="' + entry.anchor +
            '"><summary><strong>' +
            escapeHtml(entry.character) + " · " + escapeHtml(entry.name) +
            '</strong><span class="meta">' +
            escapeHtml(entry.damageTypes.join(" / ") || "-") +
            " · " + escapeHtml(entry.ratio) + " × " + entry.hits +
            '</span></summary><p class="muted"><code>' +
            escapeHtml(entry.id) + "</code></p>" + engineLine +
            "<h4>乘区汇总</h4>" + zoneRows +
            "<h4>绑定 Buff（" + entry.buffs.length +
            '）</h4><table class="entry-buff-table"><thead><tr><th>Buff</th><th>条件</th><th>效果</th></tr></thead><tbody>' +
            (buffRows ||
                '<tr><td colspan="3" class="muted">没有绑定 Buff</td></tr>') +
            "</tbody></table></details>"
    }).join("")
    const title = escapeHtml(report.title || report.code)
    const css = String.raw`
:root {
  color-scheme: light dark;
  --paper: #f4f0e7;
  --paper-2: #ebe3d5;
  --wash: #fbf8f1;
  --ink: #1c1d1f;
  --muted: #6f685c;
  --rule: #d5cbbb;
  --accent: #0d5a61;
  --accent-2: #9c432b;
  --good: #1f7249;
  --warn: #8a5d10;
  --bad: #9e332b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #111315;
    --paper-2: #181b1e;
    --wash: #15181b;
    --ink: #eee7d9;
    --muted: #a69c8d;
    --rule: #34383d;
    --accent: #8fd0d7;
    --accent-2: #e6a184;
    --good: #7ccf9a;
    --warn: #e0b25c;
    --bad: #f08a80;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--paper); }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.7 "Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif SC", Georgia, serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid currentColor; }
.page { max-width: 1180px; margin: 0 auto; padding: 30px 24px 84px; }
.masthead {
  border-top: 5px solid var(--ink);
  padding-top: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  animation: rise .55s ease both;
}
.kicker, .sans {
  font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  margin: 14px 0 10px;
  font-size: clamp(38px, 6vw, 74px);
  line-height: .98;
  letter-spacing: -.035em;
  font-weight: 500;
}
.deck { max-width: 760px; margin: 0; color: var(--muted); font-size: 18px; }
.meta {
  margin: 18px 0 0;
  font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
  font-size: 12px;
  color: var(--muted);
  display: flex;
  gap: 8px 18px;
  flex-wrap: wrap;
}
.meta code { color: var(--ink); background: var(--paper-2); padding: 1px 6px; }
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--rule);
  background: var(--wash);
  margin: 38px 0 0;
  animation: rise .6s .06s ease both;
}
.stat { padding: 16px 18px 18px; border-right: 1px solid var(--rule); }
.stat:last-child { border-right: 0; }
.stat .label { font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.stat .value { display: block; margin-top: 6px; font-size: 28px; line-height: 1.05; font-variant-numeric: tabular-nums; }
.stat .note { display: block; margin-top: 5px; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; color: var(--muted); }
.stat.good .value { color: var(--good); }
.stat.warn .value { color: var(--warn); }
.stat.bad .value { color: var(--bad); }
.section { margin-top: 54px; animation: rise .65s ease both; }
.section:nth-of-type(2) { animation-delay: .08s; }
.section:nth-of-type(3) { animation-delay: .14s; }
.section-head {
  display: grid;
  grid-template-columns: 46px 1fr auto;
  align-items: baseline;
  gap: 12px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 8px;
}
.section-no { font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; letter-spacing: .12em; color: var(--accent); }
h2 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 500; letter-spacing: -.02em; }
h3 { margin: 30px 0 10px; font-size: 20px; font-weight: 600; }
h4 { margin: 22px 0 8px; font-size: 15px; font-weight: 650; }
p { margin: 10px 0; }
.muted { color: var(--muted); }
.engine-times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 16px 0 18px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  background: var(--wash);
}
.engine-time { padding: 16px 18px; border-right: 1px solid var(--rule); }
.engine-time:last-child { border-right: 0; }
.engine-time > span { display: block; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.engine-time > div { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
.engine-time b { font-size: clamp(36px, 5vw, 54px); line-height: 1; font-variant-numeric: tabular-nums; font-weight: 500; color: transparent; -webkit-background-clip: text; background-clip: text; }
.engine-time-coconut b { background-image: linear-gradient(135deg, var(--accent), var(--good)); }
.engine-time-wuwa b { background-image: linear-gradient(135deg, var(--accent-2), var(--warn)); }
.engine-time small { font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; color: var(--muted); }
.notice {
  margin: 16px 0;
  padding: 14px 16px;
  border-left: 4px solid var(--warn);
  background: color-mix(in srgb, var(--warn) 9%, var(--wash));
  color: var(--ink);
}
.recompute {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin: 20px 0 8px;
  padding: 16px 18px;
  border: 1px solid var(--rule);
  background: var(--wash);
  animation: rise .35s ease both;
}
.recompute h3 { margin: 4px 0 2px; }
.recompute-status { margin: 0; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 12px; color: var(--muted); }
.button {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  padding: 10px 16px;
  font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .04em;
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, color .18s ease;
  white-space: nowrap;
}
.button:hover { transform: translateY(-1px); background: var(--accent); border-color: var(--accent); color: var(--paper); }
.button:disabled { opacity: .55; cursor: wait; transform: none; }
.progress { height: 6px; background: var(--rule); margin: 0 0 6px; overflow: hidden; }
.progress i { display: block; width: 0; height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width .38s cubic-bezier(.2,.8,.2,1); }
table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 14px; table-layout: fixed; }
.summary-table th:nth-child(1) { width: 40%; }
.member-table th:nth-child(1) { width: 24%; }
.skills-table th:nth-child(1) { width: 26%; }
.skills-table th:nth-child(2), .skills-table th:nth-child(3) { width: 13%; }
.skills-table th:nth-child(4) { width: 14%; }
.skills-table th:nth-child(5) { width: 9%; }
.skills-table th:nth-child(6) { width: 25%; }
.zone-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; min-width: 0; }
.zone-chip { min-width: 0; padding: 5px 6px; border: 1px solid var(--rule); background: var(--paper-2); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; overflow-wrap: anywhere; }
.zone-chip > b { display: block; margin-bottom: 3px; font-size: 11px; font-weight: 650; }
.zone-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; color: var(--muted); }
.zone-values em { font-style: normal; overflow-wrap: anywhere; }
.zone-chip > small { display: block; margin-top: 3px; text-align: right; font-variant-numeric: tabular-nums; }
.buff-table { table-layout: fixed; }
.buff-table th:nth-child(1) { width: 30%; }
.buff-table th:nth-child(2) { width: 45%; }
.buff-table th:nth-child(3) { width: 25%; }
.buff-table td { vertical-align: top; }
.buff-source { display: inline-block; margin-bottom: 4px; padding: 1px 5px; border: 1px solid var(--rule); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 10px; color: var(--muted); }
.buff-name { display: block; font-weight: 600; }
.buff-table code, .entry-buff-table code { display: block; margin-top: 3px; word-break: break-all; }
.buff-scope { display: block; margin-top: 4px; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; color: var(--muted); }
.effect-list { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
.effect-item { font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 12px; }
.effect-item small { display: block; color: var(--muted); font-size: 10px; }
.link-list { display: flex; flex-direction: column; gap: 4px; }
.entry-link { font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 12px; line-height: 1.35; border-bottom: none; }
.entry-link:hover { border-bottom: 1px solid currentColor; }
.table-scroll { overflow-x: auto; margin: 8px 0 18px; }
.zone-horizontal { table-layout: auto; margin: 0; font-size: 12px; min-width: 720px; }
.zone-horizontal th, .zone-horizontal td { padding: 6px 8px; }
.zone-horizontal th:first-child, .zone-horizontal td:first-child { width: 72px; white-space: nowrap; }
.entry-buff-table { table-layout: fixed; }
.entry-buff-table th:nth-child(1) { width: 27%; }
.entry-buff-table th:nth-child(2) { width: 30%; }
.entry-buff-table th:nth-child(3) { width: 43%; }
th {
  padding: 9px 8px;
  border-bottom: 2px solid var(--ink);
  text-align: left;
  font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
td { padding: 11px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
tbody tr { transition: background .16s ease; }
tbody tr:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.skill-cell strong { display: block; font-weight: 600; }
.skill-cell small { display: block; margin-top: 2px; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; color: var(--muted); }
.pct { display: block; margin-top: 2px; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; font-variant-numeric: tabular-nums; }
.zone-cell { overflow: visible; }
.good { color: var(--good); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }
code { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 11px; color: var(--muted); }
.entry {
  margin: 12px 0;
  padding: 14px 16px;
  border: 1px solid var(--rule);
  background: var(--wash);
  animation: rise .45s ease both;
}
.entry summary { display: flex; justify-content: space-between; gap: 16px; cursor: pointer; list-style: none; }
.entry summary::-webkit-details-marker { display: none; }
.entry summary strong { font-weight: 600; }
.entry .meta { float: none; margin: 0; text-align: right; }
.entry[open] { border-color: var(--ink); }
.engine-line { margin: 10px 0 2px; padding: 8px 10px; border-left: 3px solid currentColor; background: var(--paper-2); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 12px; }
details.zones > summary { cursor: pointer; color: var(--muted); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; }
.more-link { display: inline-block; margin-top: 2px; padding: 0; border: 0; background: none; color: var(--accent); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; cursor: pointer; text-align: left; }
.more-link:hover { border-bottom: 1px solid currentColor; }
.buff-modal { width: min(560px, calc(100vw - 32px)); max-height: 80vh; margin: auto; padding: 0; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); box-shadow: 0 24px 80px rgba(0, 0, 0, .32); }
.buff-modal::backdrop { background: rgba(0, 0, 0, .46); backdrop-filter: blur(2px); }
.buff-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--rule); }
.buff-modal-head strong { font-weight: 600; }
.modal-close { border: 0; background: none; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; }
.modal-close:hover { color: var(--ink); }
.buff-modal-links { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; padding: 16px; overflow: auto; }
.bookmarks { position: fixed; z-index: 30; top: 88px; right: 18px; display: flex; flex-direction: column; gap: 1px; padding: 5px; border: 1px solid var(--rule); background: color-mix(in srgb, var(--wash) 92%, transparent); box-shadow: 0 8px 28px rgba(0, 0, 0, .12); backdrop-filter: blur(10px); animation: rise .45s .2s ease both; }
.bookmark { display: flex; align-items: center; gap: 9px; padding: 6px 10px; border: 0; border-right: 2px solid transparent; font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; color: var(--muted); transition: background .18s ease, color .18s ease, transform .18s ease, border-color .18s ease; }
.bookmark b { min-width: 20px; font-size: 10px; font-weight: 650; letter-spacing: .08em; color: var(--accent); }
.bookmark:hover, .bookmark.active { background: var(--paper-2); border-right-color: var(--accent); color: var(--ink); transform: translateX(-2px); }
.footer { margin-top: 64px; padding-top: 14px; border-top: 1px solid var(--rule); color: var(--muted); font-family: ui-sans-serif, "Microsoft YaHei", sans-serif; font-size: 11px; display: flex; justify-content: space-between; gap: 16px; }
@keyframes rise { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 1440px) {
  .bookmarks { position: static; flex-direction: row; margin: 18px 0 0; overflow-x: auto; }
  .bookmark { border-right: 0; border-bottom: 2px solid transparent; white-space: nowrap; }
  .bookmark:hover, .bookmark.active { transform: none; border-bottom-color: var(--accent); }
}
@media (max-width: 820px) {
  .masthead { grid-template-columns: 1fr; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .stat:nth-child(2) { border-right: 0; }
  .stat:nth-child(-n+2) { border-bottom: 1px solid var(--rule); }
  .recompute { align-items: flex-start; flex-direction: column; }
  .zone-grid { grid-template-columns: 1fr; }
  .bookmarks { position: static; flex-direction: row; margin: 18px 0 0; overflow-x: auto; }
  .bookmark { border-right: 0; border-bottom: 2px solid transparent; white-space: nowrap; }
  .bookmark:hover, .bookmark.active { transform: none; border-bottom-color: var(--accent); }
  table { font-size: 13px; }
  th, td { padding-left: 5px; padding-right: 5px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *:before, *:after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`
    const bookmarkItems = [
        { no: "00", label: "队伍", href: "#section-team" },
        ...(engine?.available
            ? [{ no: "01", label: "引擎", href: "#section-engine" }]
            : []),
        { no: "02", label: "Buff", href: "#section-buffs" },
        { no: "03", label: "映射", href: "#section-map" },
    ]
    const bookmarks = '<nav class="bookmarks" aria-label="页面书签">' +
        bookmarkItems.map((item) =>
            '<a class="bookmark" href="' + item.href + '"><b>' + item.no +
            "</b><span>" + item.label + "</span></a>"
        ).join("") + "</nav>"
    const buffModalHtml = [
        '<dialog class="buff-modal" id="buff-modal">',
        '<div class="buff-modal-head"><strong id="buff-modal-title"></strong>',
        '<button class="modal-close" type="button" data-close-modal aria-label="关闭">×</button></div>',
        '<div class="buff-modal-links" id="buff-modal-links"></div>',
        "</dialog>",
    ].join("")
    const engineSection = engine?.available
        ? [
            '<section class="section" id="section-engine">',
            '<div class="section-head"><span class="section-no">01</span>',
            '<h2>引擎审计</h2><span class="sans">SHARED SNAPSHOT / LOCAL ENGINE</span></div>',
            ...engineHtml,
            "</section>",
        ].join("")
        : ""
    return [
        '<!doctype html><html lang="zh-CN"><head>',
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>" + title + " · 转换报告</title>",
        "<style>" + css + '</style></head><body><div class="page">',
        '<header class="masthead"><div>',
        '<span class="kicker">WUWACALC → COCONUT TOOLBOX / TRANSLATION AUDIT</span>',
        "<h1>" + title + "</h1>",
        '<p class="deck">同一份鸣算屋方案，逐技能、逐乘区对照椰果工具箱的服务端结算与浏览器本地重算。</p>',
        '</div><div class="meta"><span>分享码 <code>' +
        escapeHtml(report.code) + "</code></span><span>" +
        escapeHtml(report.generatedAt) + '</span><span><a href="/share/' +
        encodeURIComponent(report.code) +
        '/download">下载工程文件</a></span></div></header>',
        bookmarks,
        '<div class="stat-grid">' + engineCards.join("") + "</div>",
        '<section class="section" id="section-team"><div class="section-head">',
        '<span class="section-no">00</span><h2>队伍编制</h2>',
        '<span class="sans">TEAM &amp; LOADOUT</span></div>',
        "<table><thead><tr><th>站位</th><th>角色</th><th>武器</th><th>链</th><th>精炼</th><th>套装</th></tr></thead><tbody>" +
        teamRows + "</tbody></table></section>",
        engineSection,
        '<section class="section" id="section-buffs"><div class="section-head">',
        '<span class="section-no">02</span><h2>Buff 提取列表</h2>',
        '<span class="sans">EXTRACTED BUFFS</span></div>',
        '<p class="deck">每条 Buff 的来源、鸣算屋原始命名、映射到椰果工具箱后的条件与效果，以及它实际附加到的全部伤害倍率。</p>',
        '<table class="buff-table"><thead><tr><th>Buff / 来源与命名</th><th>椰果工具箱条件与效果</th><th>附加伤害倍率</th></tr></thead><tbody>' +
        (buffRows ||
            '<tr><td colspan="3" class="muted">没有提取到 Buff</td></tr>') +
        "</tbody></table></section>",
        '<section class="section" id="section-map"><div class="section-head">',
        '<span class="section-no">03</span><h2>转换映射</h2>',
        '<span class="sans">BUFF BINDING / ZONE SUMMARY</span></div>',
        '<p class="deck">每条显示转换后绑定的 Buff 与乘区汇总（相加 / 覆盖），用于解释引擎结果的来源；最终结算以上面的引擎审计为准。</p>',
        entryHtml,
        "</section>",
        renderLocalRecomputeHtml(report),
        buffModalHtml,
        '<footer class="footer"><span>鸣算屋 → 椰果工具箱 · 转换审计报告</span><span>' +
        escapeHtml(report.code) + "</span></footer>",
        '<script>document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest(\'a[href^="#entry-"]\');if(!a)return;var el=document.querySelector(a.getAttribute("href"));if(el&&el.tagName==="DETAILS")el.open=true;});</script>',
        '<script>(function(){var links=[].slice.call(document.querySelectorAll(".bookmark"));var sections=links.map(function(a){return document.querySelector(a.getAttribute("href"));});if(!("IntersectionObserver" in window))return;var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;links.forEach(function(a,i){a.classList.toggle("active",sections[i]===entry.target);});});},{rootMargin:"-20% 0px -70% 0px",threshold:0});sections.forEach(function(section){if(section)io.observe(section);});})();</script>',
        '<script>(function(){var modal=document.getElementById("buff-modal");if(!modal)return;var title=document.getElementById("buff-modal-title");var body=document.getElementById("buff-modal-links");document.addEventListener("click",function(e){var more=e.target.closest&&e.target.closest("[data-buff-modal]");if(more){var id=more.getAttribute("data-buff-modal");var tpl=document.getElementById("buff-links-"+id);if(!tpl)return;title.textContent=more.getAttribute("data-buff-title")||"";body.replaceChildren(tpl.content.cloneNode(true));if(modal.showModal)modal.showModal();else modal.setAttribute("open","");return;}if(e.target.closest&&e.target.closest("[data-close-modal]")){if(modal.close)modal.close();else modal.removeAttribute("open");return;}if(e.target===modal){if(modal.close)modal.close();else modal.removeAttribute("open");return;}if(e.target.closest&&e.target.closest(".buff-modal-links a")){if(modal.close)modal.close();else modal.removeAttribute("open");}});})();</script>',
        "</div></body></html>",
    ].join("\n")
}
