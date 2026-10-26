/**
 * 从 toolbox 的排轴时间线推导拉表伤害条目。
 *
 * 逐行等价搬自 `wuwa-afyg-tool/src/lib/calc/calculation.store.svelte.ts` 的
 * `buildDamageEntriesFromTimeline`（只把 Svelte store 里的全局 `getSkillCache()` /
 * `getCharElementMap()` 改成入参，逻辑未改）。
 */

import {
    getEffectBurstMultiplier,
    getEffectMultiplier,
} from "./lib/consts/effect-data.ts"
import { NON_DIRECT_ELEMENT } from "./lib/consts/game-terms.ts"
import type { DamageEntry } from "./lib/calc/calculation.types.ts"
import type { TimelineData } from "./lib/calc/timeline.types.ts"
import type { CharSlot } from "./lib/types/project.ts"
import { parseValueString } from "./lib/utils/parse-value-string.ts"

export interface SkillCacheHit {
    name: string
    ratio: string
    element?: string
}

export interface SkillCacheGroup {
    hits: SkillCacheHit[]
}

export const buildDamageEntriesFromTimeline = (
    tl: TimelineData,
    team: [CharSlot, CharSlot, CharSlot] | CharSlot[],
    elementOf: (character: string) => string = () => "",
    skillCache: Record<string, SkillCacheGroup[]> = {},
    displayNames: Record<string, string> = {},
): DamageEntry[] => {
    const temp: Array<{ item: DamageEntry; pos: number; order: number }> = []
    let order = 0

    for (const db of tl.damageBlocks) {
        let pos = 0
        if (db.sourceType === "op") {
            pos = tl.opBlocks.find((o) => o.id === db.sourceId)?.pos ?? 0
        } else {
            pos = tl.refLines.find((r) => r.id === db.sourceId)?.pos ?? 0
        }

        for (const hit of db.skillHits) {
            const comps = parseValueString(hit.ratio)

            let contextBaseType = "攻击"
            for (let i = comps.length - 1; i >= 0; i--) {
                const c = comps[i]
                if (c.flatValue !== undefined) continue
                if (!c.implicitSuffix) {
                    contextBaseType = c.baseType
                    break
                }
            }

            const pctMap = new Map<string, number>()
            const partsByType = new Map<
                string,
                { ratioNum: number; baseType: string; mult?: number }[]
            >()
            const flatParts: {
                ratioNum: number
                flatValue?: number
                baseType: string
            }[] = []
            let flatTotal = 0
            for (const c of comps) {
                if (c.flatValue !== undefined) {
                    flatTotal += c.flatValue
                    flatParts.push({
                        ratioNum: 0,
                        flatValue: c.flatValue,
                        baseType: "固定",
                    })
                } else {
                    const resolvedType = c.implicitSuffix
                        ? contextBaseType
                        : c.baseType
                    const weighted = c.ratioNum * (c.mult ?? 1)
                    pctMap.set(
                        resolvedType,
                        (pctMap.get(resolvedType) ?? 0) + weighted,
                    )
                    const part = {
                        ratioNum: c.ratioNum,
                        baseType: resolvedType,
                        ...(c.mult ? { mult: c.mult } : {}),
                    }
                    partsByType.set(resolvedType, [
                        ...(partsByType.get(resolvedType) ?? []),
                        part,
                    ])
                }
            }

            const echoName = hit.skillType === "声骸技能"
                ? (team.find((s) => s?.character === hit.character)?.echoes?.[0]
                    ?.name ?? null)
                : null
            const displayName = hit.skillType === "声骸技能" && echoName
                ? echoName + "·" + hit.hitName.replace("伤害", "") + "(" +
                    hit.skillType + ")"
                : hit.hitName.replace("伤害", "") + "(" + hit.skillType + ")"
            for (const [baseType, ratioSum] of pctMap) {
                const id =
                    `${db.id}-${hit.skillType}|${hit.hitName}#${baseType}`
                temp.push({
                    item: {
                        id,
                        character: hit.character,
                        skillType: hit.skillType,
                        hitName: hit.hitName,
                        displayName,
                        isEffect: false,
                        isTuneBreak: false,
                        isTuneResponse: false,
                        ratioValue: ratioSum * (hit.hits ?? 1),
                        ratioUnit: "%",
                        damageBaseType: baseType,
                        damageElement: hit.element ||
                            elementOf(hit.character) || "",
                        sourceTimelineBlockId: db.sourceId,
                        hits: hit.hits ?? 1,
                        ratioParts: partsByType.get(baseType) ?? [],
                    },
                    pos,
                    order: order++,
                })
            }

            if (flatTotal > 0) {
                const id = `${db.id}-${hit.skillType}|${hit.hitName}#固定`
                temp.push({
                    item: {
                        id,
                        character: hit.character,
                        skillType: hit.skillType,
                        hitName: hit.hitName,
                        displayName,
                        isEffect: false,
                        isTuneBreak: false,
                        isTuneResponse: false,
                        ratioValue: flatTotal * (hit.hits ?? 1),
                        ratioUnit: "fixed",
                        damageBaseType: "固定",
                        damageElement: hit.element ||
                            elementOf(hit.character) || "",
                        sourceTimelineBlockId: db.sourceId,
                        hits: hit.hits ?? 1,
                        ratioParts: flatParts,
                    },
                    pos,
                    order: order++,
                })
            }
        }

        for (const nd of db.nonDirectEntries) {
            if (nd.category === "响应") {
                for (const responder of nd.responders ?? []) {
                    let ratio = 0
                    let element = ""
                    const groups = skillCache[responder]
                    if (groups) {
                        for (const group of groups) {
                            const match = group.hits.find((h) =>
                                h.name.includes("震谐") ||
                                h.name.includes("骇破")
                            )
                            if (match) {
                                const comps = parseValueString(match.ratio)
                                const total = comps.reduce((sum, c) => {
                                    if (c.flatValue !== undefined) {
                                        return sum + c.flatValue
                                    }
                                    return sum + c.ratioNum * (c.mult ?? 1)
                                }, 0)
                                if (ratio === 0) ratio = total
                                if (match.element && !element) {
                                    element = match.element
                                }
                            }
                        }
                    }
                    if (!element) element = elementOf(responder) ?? ""
                    const id = `${db.id}-nd|${nd.name}#${responder}`
                    temp.push({
                        item: {
                            id,
                            character: responder,
                            skillType: "偏谐响应",
                            hitName: nd.name,
                            displayName: nd.name,
                            isEffect: false,
                            isTuneBreak: false,
                            isTuneResponse: true,
                            ratioValue: ratio,
                            ratioUnit: "%",
                            damageBaseType: "偏谐系数",
                            damageElement: element,
                            sourceTimelineBlockId: db.sourceId,
                            hits: 1,
                        },
                        pos,
                        order: order++,
                    })
                }
            } else if (nd.category === "处决") {
                const char = nd.responders?.[0] ?? ""
                const id = `${db.id}-nd|${nd.name}`
                temp.push({
                    item: {
                        id,
                        character: char,
                        skillType: "谐度破坏",
                        hitName: "谐度破坏",
                        displayName: "谐度破坏",
                        isEffect: false,
                        isTuneBreak: true,
                        isTuneResponse: false,
                        ratioValue: 1600,
                        ratioUnit: "%",
                        damageBaseType: "偏谐系数",
                        damageElement: "物理",
                        sourceTimelineBlockId: db.sourceId,
                        hits: 1,
                    },
                    pos,
                    order: order++,
                })
            } else if (nd.category === "效应") {
                if (nd.name === "电磁爆发") continue
                const isDianci = nd.name === "电磁效应"
                const burstLayers = isDianci
                    ? (db.nonDirectEntries.find((n) =>
                        n.name === "电磁爆发" && n.category === "效应"
                    )?.layers ?? 0)
                    : 0
                const id = `${db.id}-nd|${nd.name}`
                temp.push({
                    item: {
                        id,
                        character: nd.character,
                        skillType: "效应结算",
                        hitName: nd.name,
                        displayName: isDianci && burstLayers > 0
                            ? nd.name + nd.layers + "层+爆发" + burstLayers +
                                "层"
                            : nd.name + nd.layers + "层",
                        isEffect: true,
                        isTuneBreak: false,
                        isTuneResponse: false,
                        ratioValue: nd.layers,
                        ratioUnit: "%",
                        damageBaseType: "效应系数",
                        damageElement: nd.element ||
                            (NON_DIRECT_ELEMENT[nd.name] ?? ""),
                        sourceTimelineBlockId: db.sourceId,
                        burstLayers: isDianci ? burstLayers : 0,
                        hits: nd.hits ?? 1,
                    },
                    pos,
                    order: order++,
                })
            }
        }
    }

    temp.sort((a, b) => a.pos - b.pos || a.order - b.order)
    return temp.map((
        t,
    ) => (displayNames[t.item.id]
        ? { ...t.item, displayName: displayNames[t.item.id] }
        : t.item)
    )
}

export { getEffectBurstMultiplier, getEffectMultiplier }
