/**
 * 用**椰果工具箱自己的计算引擎**（`compute.ts` 原样抽取）跑一份转换后的工程。
 *
 * 输入是转换器产物 `{ version, exportedAt, project }`；这里只做「把四阶段数据喂给引擎」，
 * 不重写任何公式。
 */

import { computeAll, type ConditionProfile } from "./lib/calc/compute.ts"
import type { BuffInstance, DamageEntry } from "./lib/calc/calculation.types.ts"
import type { ConfigState } from "./lib/calc/config.types.ts"
import type { ResultEntry } from "./lib/calc/result.types.ts"
import type { CharSlot } from "./lib/types/project.ts"
import type { CharacterInfo, WeaponInfo } from "./lib/api/types.ts"
import {
    buildDamageEntriesFromTimeline,
    type SkillCacheGroup,
} from "./damage-entries.ts"

const ELEMENT_MAP: Record<number, string> = {
    1: "冷凝",
    2: "热熔",
    3: "导电",
    4: "气动",
    5: "衍射",
    6: "湮灭",
}

export interface CoconutProjectLike {
    project: {
        team: any[]
        conditionProfile?: { chains: number[]; refinements: number[] }
        phases: {
            timeline: { data: any }
            calculation: { data: any }
            config: { data: any }
        }
    }
}

export interface TemplateCharacter {
    id: string
    name: string
    element: number
    rank?: number
    weapon?: number
    baseAtk: number
    baseHp: number
    baseDef: number
    harmonyBreakAmp?: number
    skills?: {
        name: string
        damageType?: string
        skillType?: string
        baseMult?: number
    }[]
}

export interface TemplateWeapon {
    id: string
    name: string
    rarity?: number
    type?: number
    baseAtk90: number
    subStat?: { name: string; value: number; isPercent?: boolean }
    effectName?: string
    effect?: string
}

export interface GameData {
    characters: Record<string, TemplateCharacter>
    weapons: Record<string, TemplateWeapon>
    /** 角色名 → 元素（工具箱的 getCharElementMap） */
    elements?: Record<string, string>
    /** 角色名 → 技能缓存（非直伤响应倍率用；缺省不影响直伤） */
    skillCache?: Record<string, SkillCacheGroup[]>
}

export interface CoconutEntryResult {
    id: string
    sourceTimelineBlockId: string
    /** 上游技能目录 id（差分对齐用；本体/额外条目共用） */
    catalogId?: string
    /** 多轮工程的轮次下标（差分按轮对齐） */
    roundIndex?: number
    character: string
    displayName: string
    hitName: string
    skillType: string
    element: string
    baseValue: number
    baseUnit: string
    ratioNum: number
    hits: number
    totalDamage: number
    totalDamageRaw: number
    expectedPerHit: number
    nonCritPerHit: number
    critPerHit: number
    baseAtk: number
    totalAtk: number
    atkPctSum: number
    atkFlatSum: number
    baseHp: number
    totalHp: number
    hpPctSum: number
    hpFlatSum: number
    baseDef: number
    totalDef: number
    defPctSum: number
    defFlatSum: number
    totalTuneBreakBoost: number
    dmgBonus: number
    deepen: number
    critRate: number
    critDmg: number
    defMulti: number
    resMulti: number
    dmgRedMulti: number
    finalDmg: number
    finalTuneStrainMulti: number
    finalUnisonMulti: number
    customMult: number
    extraRatio: number
    vulnerability: number
    totalMultiplier: number
    damageTypes: string[]
    elBonus?: number
    typeBonus?: number
}

export interface CoconutMeasureResult {
    total: number
    entries: CoconutEntryResult[]
    entryCount: number
}

const toCharInfo = (
    name: string,
    row: TemplateCharacter | undefined,
): CharacterInfo | undefined => {
    if (!row) return undefined
    return {
        rarity: row.rank === 4 ? 4 : 5,
        element:
            (ELEMENT_MAP[row.element] ?? "冷凝") as CharacterInfo["element"],
        weaponType: "长刃",
        tags: [],
        lv90BaseStats: {
            hp: row.baseHp,
            atk: row.baseAtk,
            def: row.baseDef,
            tuneBreakBoost: row.harmonyBreakAmp ?? 0,
        },
        skills: (row.skills ?? []).map((s) => ({
            name: s.name,
            type: (s.skillType ?? "常态攻击") as any,
            desc: "",
            values: [],
        })),
        statNodes: [],
        chains: [],
    }
}

const toWeaponInfo = (
    row: TemplateWeapon | undefined,
): WeaponInfo | undefined => {
    if (!row) return undefined
    return {
        rarity: row.rarity === 4
            ? 4
            : row.rarity === 3
            ? 3
            : row.rarity === 2
            ? 2
            : row.rarity === 1
            ? 1
            : 5,
        type: "长刃",
        lv90BaseAtk: row.baseAtk90,
        substat: {
            name: row.subStat?.name ?? "",
            value: row.subStat ? String(row.subStat.value) : "0",
        },
        effect: { name: row.effectName ?? "", desc: row.effect ?? "" },
    }
}

const pickEntry = (
    result: ResultEntry,
    catalogId?: string,
    roundIndex?: number,
): CoconutEntryResult => ({
    id: result.id,
    sourceTimelineBlockId: result.sourceTimelineBlockId,
    ...(catalogId ? { catalogId } : {}),
    ...(roundIndex !== undefined ? { roundIndex } : {}),
    character: result.character,
    displayName: result.displayName,
    hitName: result.hitName,
    skillType: result.skillType,
    element: result.element,
    baseValue: result.baseValue,
    baseUnit: result.baseUnit,
    ratioNum: result.ratioNum,
    hits: result.hits,
    totalDamage: result.totalDamage,
    totalDamageRaw: result.totalDamageRaw,
    expectedPerHit: result.expectedPerHit,
    nonCritPerHit: result.nonCritPerHit,
    critPerHit: result.critPerHit,
    baseAtk: result.baseAtk,
    totalAtk: result.totalAtk,
    atkPctSum: result.atkPctSum,
    atkFlatSum: result.atkFlatSum,
    baseHp: result.baseHp,
    totalHp: result.totalHp,
    hpPctSum: result.hpPctSum,
    hpFlatSum: result.hpFlatSum,
    baseDef: result.baseDef,
    totalDef: result.totalDef,
    defPctSum: result.defPctSum,
    defFlatSum: result.defFlatSum,
    totalTuneBreakBoost: result.totalTuneBreakBoost,
    dmgBonus: result.dmgBonus,
    deepen: result.deepen,
    critRate: result.critRate,
    critDmg: result.critDmg,
    defMulti: result.defMulti,
    resMulti: result.resMulti,
    dmgRedMulti: result.dmgRedMulti,
    finalDmg: result.finalDmg,
    finalTuneStrainMulti: result.finalTuneStrainMulti,
    finalUnisonMulti: result.finalUnisonMulti,
    customMult: result.customMult,
    extraRatio: result.extraRatio,
    vulnerability: result.vulnerability,
    totalMultiplier: result.totalMultiplier,
    damageTypes: result.damageTypes,
    elBonus: result.elBonus,
    typeBonus: result.typeBonus,
})

export const measureCoconut = (
    file: CoconutProjectLike,
    data: GameData,
    options: { skillCache?: Record<string, SkillCacheGroup[]> } = {},
): CoconutMeasureResult => {
    const project = file.project
    const timeline = project.phases.timeline.data
    const calc = project.phases.calculation.data
    const config = project.phases.config.data as ConfigState
    const team = project.team as [CharSlot, CharSlot, CharSlot]

    const charInfoMap: Record<string, CharacterInfo> = {}
    const weaponInfoMap: Record<string, WeaponInfo> = {}
    for (const row of Object.values(data.characters)) {
        const info = toCharInfo(row.name, row)
        if (info) charInfoMap[row.name] = info
    }
    for (const row of Object.values(data.weapons)) {
        const info = toWeaponInfo(row)
        if (info) weaponInfoMap[row.name] = info
    }
    // 队伍里出现、但模板表没有的，按转换文件里的配置兜底
    for (const slot of team) {
        if (slot.character && !charInfoMap[slot.character]) {
            charInfoMap[slot.character] = {
                rarity: 5,
                element: "冷凝",
                weaponType: "长刃",
                tags: [],
                lv90BaseStats: { hp: 1, atk: 1, def: 1, tuneBreakBoost: 0 },
                skills: [],
                statNodes: [],
                chains: [],
            }
        }
        if (slot.weapon && !weaponInfoMap[slot.weapon]) {
            weaponInfoMap[slot.weapon] = {
                rarity: 5,
                type: "长刃",
                lv90BaseAtk: 0,
                substat: { name: "", value: "0" },
                effect: { name: "", desc: "" },
            }
        }
    }

    const damageEntries: DamageEntry[] = buildDamageEntriesFromTimeline(
        timeline,
        team,
        (name) => data.elements?.[name] ?? "",
        options.skillCache ?? data.skillCache ?? {},
    )
    const buffSets = (calc?.buffSets ?? []) as BuffInstance[]
    const bindings = (calc?.damageEntryBuffSetIds ?? {}) as Record<
        string,
        string[]
    >
    const damageTypes = (calc?.damageEntryDamageTypes ?? {}) as Record<
        string,
        string[]
    >
    const profile: ConditionProfile = {
        chains: project.conditionProfile?.chains ??
            team.map((s) => Number(s.chain) || 0),
        refinements: project.conditionProfile?.refinements ??
            team.map((s) => Number(s.refinement) || 1),
    }

    const results = computeAll(
        damageEntries,
        buffSets,
        bindings,
        damageTypes,
        config,
        team,
        charInfoMap,
        weaponInfoMap,
        profile,
    )

    // 时间线里一个伤害块对应一个技能目录条目；差分对齐用它而不是按数组顺序。
    const catalogByBlock = new Map<
        string,
        { catalogId?: string; roundIndex?: number }
    >()
    for (const block of timeline.damageBlocks ?? []) {
        const catalogId = block.skillHits?.find((hit: any) => hit.catalogId)
            ?.catalogId
        catalogByBlock.set(block.id, {
            ...(catalogId ? { catalogId: String(catalogId) } : {}),
            ...(block.roundIndex !== undefined
                ? { roundIndex: block.roundIndex }
                : {}),
        })
    }
    const entries = results.map((result) => {
        const meta = catalogByBlock.get(
            /^(d\d+)/.exec(result.id)?.[1] ?? "",
        )
        return pickEntry(result, meta?.catalogId, meta?.roundIndex)
    })
    return {
        total: entries.reduce((sum, e) => sum + e.totalDamage, 0),
        entries,
        entryCount: entries.length,
    }
}
