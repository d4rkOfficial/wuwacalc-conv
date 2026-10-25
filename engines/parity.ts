/// <reference lib="deno.ns" />
/**
 * 差分验收：同一份鸣算屋方案，
 *   A = 鸣算屋线上引擎（engines/wuwacalc）
 *   B = 转换后的工程 + 椰果工具箱引擎（engines/coconut）
 * 对比总伤、逐条目伤害、逐乘区数值。
 */

import { convertWuwaCalcProjectToCoconutProjectFile } from "../src/convert-project/index.ts"
import { type ProjectTables } from "../src/convert-project/tables.ts"
import { type GameData, measureCoconut } from "./coconut/measure.ts"
import { compareParity, type ParityComparison } from "./compare.ts"

const ROOT = new URL("../", import.meta.url)
const SITE = new URL("engines/wuwacalc/site/", ROOT)
const FIXTURES = new URL("fixtures/wuwacalc/", ROOT)

export interface ParityFixture {
    code: string
    detail: any
    data: any
    meta: any
}

export const loadFixture = async (code: string): Promise<ParityFixture> => {
    const detail = JSON.parse(
        await Deno.readTextFile(new URL(code + ".json", FIXTURES)),
    )
    const data = detail?.payload?.data ?? detail?.data
    const meta = detail?.payload?.meta ?? detail?.meta ?? {}
    return { code, detail, data, meta }
}

export const loadSiteGameData = async (): Promise<GameData> => {
    const chars = JSON.parse(
        await Deno.readTextFile(new URL("character-skills.json", SITE)),
    )
    const weapons = JSON.parse(
        await Deno.readTextFile(new URL("weapons.json", SITE)),
    )
    const elements: Record<string, string> = {}
    const elementMap: Record<number, string> = {
        1: "冷凝",
        2: "热熔",
        3: "导电",
        4: "气动",
        5: "衍射",
        6: "湮灭",
    }
    const charsByName: Record<string, any> = {}
    for (const row of chars.characters ?? []) {
        charsByName[row.name] = row
        elements[row.name] = elementMap[row.element] ?? ""
    }
    const weaponsByName: Record<string, any> = {}
    for (const row of weapons.weapons ?? []) weaponsByName[row.name] = row
    return { characters: charsByName, weapons: weaponsByName, elements }
}

export const loadSiteTables = async (): Promise<ProjectTables> => {
    const weapons = JSON.parse(
        await Deno.readTextFile(new URL("weapons.json", SITE)),
    )
    const sets = JSON.parse(
        await Deno.readTextFile(new URL("echo-sets.json", SITE)),
    )
    const echoCatalog = JSON.parse(
        await Deno.readTextFile(new URL("echo-catalog.json", SITE)),
    )
    const skillDb = JSON.parse(
        await Deno.readTextFile(new URL("character-skills.json", SITE)),
    )
    const weaponMap = new Map<string, string>()
    for (const row of weapons.weapons ?? []) {
        if (row.id && row.name) weaponMap.set(String(row.id), row.name)
    }
    const setMap = new Map<string, { name: string; bonusTiers: number[] }>()
    for (const row of sets.sets ?? []) {
        if (!row.id || !row.name) continue
        const tiers = Object.keys(row.bonuses ?? {}).map(Number).filter((n) =>
            n > 0
        ).sort((a, b) => b - a)
        setMap.set(String(row.id), { name: row.name, bonusTiers: tiers })
    }
    const echoMap = new Map<string, { name: string; cost: number }>()
    for (const row of echoCatalog.echoes ?? []) {
        if (row.id && row.name) {
            echoMap.set(String(row.id), {
                name: row.name,
                cost: Number(row.cost) || 0,
            })
        }
    }
    const skillMap = new Map<
        string,
        {
            name: string
            skillType: string
            damageType: string
            baseMult: number
        }
    >()
    const characterElements = new Map<string, string>()
    const elementLabels: Record<number, string> = {
        1: "冷凝",
        2: "热熔",
        3: "导电",
        4: "气动",
        5: "衍射",
        6: "湮灭",
    }
    for (const character of skillDb.characters ?? []) {
        const characterId = String(character.id ?? "")
        if (!characterId) continue
        const element = elementLabels[Number(character.element)]
        if (element) characterElements.set(characterId, element)
        for (const skill of character.skills ?? []) {
            if (!skill.name) continue
            skillMap.set(characterId + "|" + skill.name, {
                name: skill.name,
                skillType: String(skill.skillType ?? ""),
                damageType: String(skill.damageType ?? ""),
                baseMult: Number(skill.baseMult) || 0,
            })
        }
    }
    const specimensDb = JSON.parse(
        await Deno.readTextFile(new URL("echo-specimens.json", SITE)),
    )
    const specimenMap = new Map<
        string,
        { id: string; name: string; mainEffects: any[] }
    >()
    for (const row of specimensDb.specimens ?? []) {
        if (!row.id) continue
        specimenMap.set(String(row.id), {
            id: String(row.id),
            name: String(row.name ?? ""),
            mainEffects: row.mainEffects ?? [],
        })
    }
    return {
        weapons: weaponMap,
        echoSets: setMap,
        echoes: echoMap,
        skills: skillMap,
        characterElements,
        echoSpecimens: specimenMap,
    }
}

export const convertFixture = (
    fixture: ParityFixture,
    tables: ProjectTables,
) => {
    const detail = {
        id: fixture.detail.id,
        title: fixture.detail.title,
        share_code: fixture.detail.share_code,
        approved_at: fixture.detail.approved_at,
        updated_at: fixture.detail.updated_at,
        // 对照原始配置：不使用 0+1 变体（与 wuwacalc 直接导入 payload 一致）
        summary: undefined,
        payload: { data: fixture.data, meta: fixture.meta },
    }
    return convertWuwaCalcProjectToCoconutProjectFile(detail, tables, {
        exportedAt: 0,
        projectId: fixture.code,
    })
}

export interface ParityDiff {
    totalWuwa: number
    totalCoconut: number
    totalDelta: number
    totalRel: number
    entryCountWuwa: number
    entryCountCoconut: number
    entries: unknown[]
}

export const runParity = async (code: string) => {
    const fixture = await loadFixture(code)
    const tables = await loadSiteTables()
    const game = await loadSiteGameData()
    const file = convertFixture(fixture, tables)
    const coconut = measureCoconut(file, game)
    return { fixture, file, coconut }
}

/** 跑一份 fixture 的完整差分：读金标准 → 转换 → 椰果引擎 → 逐条目比较 */
export const runParityComparison = async (
    code: string,
): Promise<ParityComparison> => {
    const { coconut } = await runParity(code)
    const golden = JSON.parse(
        await Deno.readTextFile(new URL(`golden/${code}.json`, FIXTURES)),
    )
    return compareParity(code, coconut, golden)
}
