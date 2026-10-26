/**
 * 运行时拉取并缓存的上游数据表。
 *
 * 这两张表是**同站静态资源**（与 API 同源），随游戏版本更新，所以不内联进代码：
 *
 * | 文件 | 用途 | 规模 |
 * | --- | --- | --- |
 * | `weapons.json` | 武器 `id → 名称`（`members[].weaponSelection.id` 只有 ID） | 93 条 / ~48KB |
 * | `echo-sets.json` | 套装 `id → { 名称, 生效档位 }`（`setLoadout[].setId` 只有 ID） | 38 条 / ~45KB |
 *
 * 口径与约定：
 * - **缓存**：模块级内存缓存 + TTL（{@link TABLE_TTL_MS}）+ 单飞（同一时刻只发一轮请求）；
 * - **降级**：任一表拉取失败都不影响转换——拿不到名称的字段留空，绝不让下载接口因此失败；
 * - 两张表**全部**失败时不写缓存，避免把一次抖动固化 6 小时。
 */

import { DEFAULT_API_BASE } from "../http.ts"
import type { Bindings } from "../http.ts"
import { optionalString, toInt } from "../utils.ts"
import { ELEMENT_BY_ID } from "./data/game.ts"

/** 表数据缓存时长：上游随游戏版本更新，6 小时足够新鲜，也避免每次请求都拉一遍 */
export const TABLE_TTL_MS = 6 * 60 * 60 * 1000

/** 表文件本身只有几十 KB，但上游站点响应波动大，超时给宽一点 */
const TABLE_TIMEOUT_MS = 20_000

/**
 * 每张表的尝试次数与重试间隔。
 *
 * 实测下载端会「三张表同时被上游抖掉」→ 产物里武器名/套装名全空（上游只给 id），
 * 用户看到的就是队伍配置页上「武器 / 触发套装」两格空白。表是静态小文件，
 * 多试一次成本极低，能把这类抖动挡掉大半。
 */
export const TABLE_ATTEMPTS = 2
const TABLE_RETRY_DELAY_MS = 300

/** 套装信息：名称 + 该套装实际存在的档位（来自上游 `bonuses` 的键，降序） */
export interface EchoSetInfo {
    name: string
    bonusTiers: number[]
}

/** 声骸信息：名称 + cost（上游常常只给 `echoId` 不给名称） */
export interface EchoInfo {
    name: string
    cost: number
}

/**
 * 技能库条目（上游 `character-skills.json`）。
 *
 * 转换**不能只看 `damageType`**：鸣算屋的 `damageType` 是「算哪种伤害」，
 * 而椰果的 `skillType` 是「谁打出的这一招」。例如洛瑟菈的 `强化A4-断舍离`
 * 上游 `damageType='声骸'`，技能库 `skillType='共鸣解放'`；按 damageType 落
 * `声骸技能` 会被工具箱加上装备声骸前缀，并且技能名被改写成 `伤害1`，
 * 连带按技能名限定的 Buff 全绑不上。
 */
export interface SkillInfo {
    name: string
    skillType: string
    damageType: string
    baseMult: number
}

/** 声骸图鉴的首位效果（上游 `echo-specimens.json` 的 `mainEffects`） */
export interface EchoSpecimenInfo {
    id: string
    name: string
    mainEffects: {
        kind?: string
        category?: string
        name?: string
        value?: number
        element?: string
        damageType?: string
        sourceKey?: string
    }[]
}

/** 角色面板基础值：计算引擎需要，名称表本身不需要 */
export interface ProjectCharacterInfo {
    id: string
    name: string
    element: number
    rank: number
    baseAtk: number
    baseHp: number
    baseDef: number
    harmonyBreakAmp: number
    skills: SkillInfo[]
}

/** 武器面板基础值：计算引擎需要，名称表本身不需要 */
export interface ProjectWeaponInfo {
    id: string
    name: string
    rarity: number
    type: number
    baseAtk90: number
    subStat: { name: string; value: number; isPercent: boolean } | null
    effectName: string
    effect: string
}

/** 转换期需要的名称表集合 */
export interface ProjectTables {
    /** 武器 id → 名称 */
    weapons: Map<string, string>
    /** 套装 id → 名称 + 生效档位 */
    echoSets: Map<string, EchoSetInfo>
    /** 声骸 id → 名称 + cost */
    echoes: Map<string, EchoInfo>
    /** `角色 id + 技能库全名` → 技能库条目 */
    skills: Map<string, SkillInfo>
    /** 角色 id → 角色自身元素（不是主位声骸的元素） */
    characterElements: Map<string, string>
    /** 声骸 id → 首位效果（`echo-specimens.json`） */
    echoSpecimens: Map<string, EchoSpecimenInfo>
    /** 角色 id → 面板基础值（来自 `character-skills.json`） */
    characterStats?: Map<string, ProjectCharacterInfo>
    /** 武器 id → 面板基础值（来自 `weapons.json`） */
    weaponStats?: Map<string, ProjectWeaponInfo>
}

/** 空表：拉取失败或单测里不关心名称时使用 */
export const EMPTY_TABLES: ProjectTables = {
    weapons: new Map(),
    echoSets: new Map(),
    echoes: new Map(),
    skills: new Map(),
    characterElements: new Map(),
    echoSpecimens: new Map(),
    characterStats: new Map(),
    weaponStats: new Map(),
}

/**
 * 三张表**一张都没拉到**（降级转换）。
 *
 * 这种产物里武器名 / 套装名是空的（上游只给 id），属于「能导入但缺信息」。
 * 下载端据此**不写缓存**：否则一次上游抖动会把「没有武器名」固化一整个缓存周期。
 */
export const isProjectTablesEmpty = (tables: ProjectTables): boolean =>
    tables.weapons.size === 0 && tables.echoSets.size === 0 &&
    tables.echoes.size === 0

// ── 缓存 ──────────────────────────────────────────────────────────────────────

let cached: { at: number; tables: ProjectTables } | null = null
let inflight: Promise<ProjectTables> | null = null

/** 仅测试用：清掉内存缓存，避免用例之间互相影响 */
export const resetProjectTablesCache = (): void => {
    cached = null
    inflight = null
}

const apiBaseOf = (env: Bindings): string =>
    (env.WUWACALC_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "")

/** 拉一个表文件；失败重试一次（几十 KB 的静态资源，抖动比真挂更常见），仍失败返回 `null` */
const fetchTable = async <T>(
    env: Bindings,
    file: string,
): Promise<T | null> => {
    for (let attempt = 1; attempt <= TABLE_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(`${apiBaseOf(env)}/${file}`, {
                headers: { accept: "application/json" },
                signal: AbortSignal.timeout(TABLE_TIMEOUT_MS),
            })
            if (res.ok) return await res.json() as T
        } catch {
            // 落到下一次尝试（或返回 null）
        }
        if (attempt < TABLE_ATTEMPTS) {
            await new Promise((resolve) =>
                setTimeout(resolve, TABLE_RETRY_DELAY_MS)
            )
        }
    }
    return null
}

const toNameMap = (
    rows: { id?: string; name?: string }[] | undefined,
): Map<string, string> => {
    const map = new Map<string, string>()
    for (const row of rows ?? []) {
        const id = optionalString(row?.id)
        const name = optionalString(row?.name)
        if (id && name) map.set(id, name)
    }
    return map
}

const toEchoSetMap = (
    rows:
        | { id?: string; name?: string; bonuses?: Record<string, unknown> }[]
        | undefined,
): Map<string, EchoSetInfo> => {
    const map = new Map<string, EchoSetInfo>()
    for (const row of rows ?? []) {
        const id = optionalString(row?.id)
        const name = optionalString(row?.name)
        if (!id || !name) continue
        const bonusTiers = Object.keys(row?.bonuses ?? {})
            .map((tier) => Number.parseInt(tier, 10))
            .filter((tier) => Number.isFinite(tier) && tier > 0)
            .sort((a, b) => b - a)
        map.set(id, { name, bonusTiers })
    }
    return map
}

const toSkillsMap = (
    characters:
        | {
            id?: string
            name?: string
            skills?: {
                name?: string
                skillType?: string
                damageType?: string
                baseMult?: number
            }[]
        }[]
        | undefined,
): Map<string, SkillInfo> => {
    const map = new Map<string, SkillInfo>()
    for (const character of characters ?? []) {
        const characterId = optionalString(character?.id)
        if (!characterId) continue
        for (const skill of character?.skills ?? []) {
            const name = optionalString(skill?.name)
            if (!name) continue
            map.set(`${characterId}|${name}`, {
                name,
                skillType: optionalString(skill?.skillType) ?? "",
                damageType: optionalString(skill?.damageType) ?? "",
                baseMult: Number(skill?.baseMult) || 0,
            })
        }
    }
    return map
}

export const toCharacterStats = (
    characters:
        | {
            id?: string
            name?: string
            element?: number
            rank?: number
            baseAtk?: number
            baseHp?: number
            baseDef?: number
            harmonyBreakAmp?: number
            skills?: {
                name?: string
                skillType?: string
                damageType?: string
                baseMult?: number
            }[]
        }[]
        | undefined,
): Map<string, ProjectCharacterInfo> => {
    const map = new Map<string, ProjectCharacterInfo>()
    for (const character of characters ?? []) {
        const id = optionalString(character?.id)
        const name = optionalString(character?.name)
        if (!id || !name) continue
        map.set(id, {
            id,
            name,
            element: toInt(character?.element, 0),
            rank: toInt(character?.rank, 5),
            baseAtk: Number(character?.baseAtk) || 0,
            baseHp: Number(character?.baseHp) || 0,
            baseDef: Number(character?.baseDef) || 0,
            harmonyBreakAmp: Number(character?.harmonyBreakAmp) || 0,
            skills: (character?.skills ?? [])
                .map((skill) => {
                    const skillName = optionalString(skill?.name)
                    if (!skillName) return null
                    return {
                        name: skillName,
                        skillType: optionalString(skill?.skillType) ?? "",
                        damageType: optionalString(skill?.damageType) ?? "",
                        baseMult: Number(skill?.baseMult) || 0,
                    }
                })
                .filter((skill): skill is SkillInfo => skill !== null),
        })
    }
    return map
}

export const toWeaponStats = (
    rows:
        | {
            id?: string
            name?: string
            rarity?: number
            type?: number
            baseAtk90?: number
            subStat?: { name?: string; value?: number; isPercent?: boolean }
            effectName?: string
            effect?: string
        }[]
        | undefined,
): Map<string, ProjectWeaponInfo> => {
    const map = new Map<string, ProjectWeaponInfo>()
    for (const row of rows ?? []) {
        const id = optionalString(row?.id)
        const name = optionalString(row?.name)
        if (!id || !name) continue
        map.set(id, {
            id,
            name,
            rarity: toInt(row?.rarity, 5),
            type: toInt(row?.type, 0),
            baseAtk90: Number(row?.baseAtk90) || 0,
            subStat: row?.subStat
                ? {
                    name: optionalString(row.subStat.name) ?? "",
                    value: Number(row.subStat.value) || 0,
                    isPercent: !!row.subStat.isPercent,
                }
                : null,
            effectName: optionalString(row?.effectName) ?? "",
            effect: optionalString(row?.effect) ?? "",
        })
    }
    return map
}

const toEchoSpecimens = (
    specimens:
        | {
            id?: string
            name?: string
            mainEffects?: {
                kind?: string
                category?: string
                name?: string
                value?: number
                element?: string
                damageType?: string
                sourceKey?: string
            }[]
        }[]
        | undefined,
): Map<string, EchoSpecimenInfo> => {
    const map = new Map<string, EchoSpecimenInfo>()
    for (const specimen of specimens ?? []) {
        const id = optionalString(specimen?.id)
        if (!id) continue
        map.set(id, {
            id,
            name: optionalString(specimen?.name) ?? "",
            mainEffects: specimen?.mainEffects ?? [],
        })
    }
    return map
}

const toCharacterElements = (
    characters: { id?: string; element?: number }[] | undefined,
): Map<string, string> => {
    const map = new Map<string, string>()
    for (const character of characters ?? []) {
        const id = optionalString(character?.id)
        const element = ELEMENT_BY_ID[Number(character?.element)]
        if (id && element) map.set(id, element)
    }
    return map
}

const toEchoMap = (
    rows: { id?: string; name?: string; cost?: number }[] | undefined,
): Map<string, EchoInfo> => {
    const map = new Map<string, EchoInfo>()
    for (const row of rows ?? []) {
        const id = optionalString(row?.id)
        const name = optionalString(row?.name)
        if (!id || !name) continue
        map.set(id, { name, cost: toInt(row?.cost, 0) })
    }
    return map
}

/**
 * 取名称表（带缓存）。**永不抛错**：拉不到就返回空表，让转换按「名称缺失」降级。
 */
export const loadProjectTables = async (
    env: Bindings,
): Promise<ProjectTables> => {
    if (cached && Date.now() - cached.at < TABLE_TTL_MS) return cached.tables
    if (inflight) return await inflight

    inflight = (async (): Promise<ProjectTables> => {
        const [weapons, echoSets, echoes, echoSpecimens, skills] = await Promise
            .all([
                fetchTable<{
                    weapons?: {
                        id?: string
                        name?: string
                        rarity?: number
                        type?: number
                        baseAtk90?: number
                        subStat?: {
                            name?: string
                            value?: number
                            isPercent?: boolean
                        }
                        effectName?: string
                        effect?: string
                    }[]
                }>(env, "weapons.json"),
                fetchTable<
                    {
                        sets?: {
                            id?: string
                            name?: string
                            bonuses?: Record<string, unknown>
                        }[]
                    }
                >(env, "echo-sets.json"),
                fetchTable<
                    { echoes?: { id?: string; name?: string; cost?: number }[] }
                >(env, "echo-catalog.json"),
                fetchTable<
                    {
                        specimens?: {
                            id?: string
                            name?: string
                            mainEffects?: {
                                kind?: string
                                category?: string
                                name?: string
                                value?: number
                                element?: string
                                damageType?: string
                                sourceKey?: string
                            }[]
                        }[]
                    }
                >(env, "echo-specimens.json"),
                fetchTable<
                    {
                        characters?: {
                            id?: string
                            name?: string
                            element?: number
                            rank?: number
                            baseAtk?: number
                            baseHp?: number
                            baseDef?: number
                            harmonyBreakAmp?: number
                            skills?: {
                                name?: string
                                skillType?: string
                                damageType?: string
                                baseMult?: number
                            }[]
                        }[]
                    }
                >(env, "character-skills.json"),
            ])

        const tables: ProjectTables = {
            weapons: toNameMap(weapons?.weapons),
            echoSets: toEchoSetMap(echoSets?.sets),
            echoes: toEchoMap(echoes?.echoes),
            skills: toSkillsMap(skills?.characters),
            characterElements: toCharacterElements(skills?.characters),
            echoSpecimens: toEchoSpecimens(echoSpecimens?.specimens),
            characterStats: toCharacterStats(skills?.characters),
            weaponStats: toWeaponStats(weapons?.weapons),
        }
        // 三张表全没拉到 → 不写缓存，下一次请求重试
        if (
            tables.weapons.size > 0 || tables.echoSets.size > 0 ||
            tables.echoes.size > 0
        ) {
            cached = { at: Date.now(), tables }
        }
        return tables
    })()

    try {
        return await inflight
    } finally {
        inflight = null
    }
}
