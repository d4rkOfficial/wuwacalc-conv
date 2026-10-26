/**
 * 用运行时名称表拼出椰果引擎需要的 `GameData`。
 *
 * 报告不能只给「转换映射」：要回答「哪里算错了」，必须在服务端把同一个转换产物
 * 真的喂给椰果引擎。引擎需要角色/武器的基础面板，这些字段就在已经拉取的
 * `character-skills.json` / `weapons.json` 里，不需要再发请求。
 *
 * 表没拉全时返回 `null`：宁可报告里明确写「无法运行引擎」，也不要用 1 点攻击的
 * 假角色跑出一份看似有数据、实际全错的对比。
 */

import type {
    GameData,
    TemplateCharacter,
    TemplateWeapon,
} from "../../engines/coconut/measure.ts"
import { ELEMENT_BY_ID } from "./data/game.ts"
import type { ProjectTables } from "./tables.ts"

export const gameDataOfProjectTables = (
    tables: ProjectTables,
): GameData | null => {
    const characters: Record<string, TemplateCharacter> = {}
    const elements: Record<string, string> = {}

    for (const row of tables.characterStats?.values() ?? []) {
        if (!row.name) continue
        characters[row.name] = {
            id: row.id,
            name: row.name,
            element: row.element,
            rank: row.rank,
            baseAtk: row.baseAtk,
            baseHp: row.baseHp,
            baseDef: row.baseDef,
            harmonyBreakAmp: row.harmonyBreakAmp,
            skills: row.skills.map((skill) => ({
                name: skill.name,
                damageType: skill.damageType,
                skillType: skill.skillType,
                baseMult: skill.baseMult,
            })),
        }
        elements[row.name] = ELEMENT_BY_ID[row.element] ?? ""
    }

    const weapons: Record<string, TemplateWeapon> = {}
    for (const row of tables.weaponStats?.values() ?? []) {
        if (!row.name) continue
        weapons[row.name] = {
            id: row.id,
            name: row.name,
            rarity: row.rarity,
            type: row.type,
            baseAtk90: row.baseAtk90,
            ...(row.subStat
                ? {
                    subStat: {
                        name: row.subStat.name,
                        value: row.subStat.value,
                        isPercent: row.subStat.isPercent,
                    },
                }
                : {}),
            effectName: row.effectName,
            effect: row.effect,
        }
    }

    return Object.keys(characters).length && Object.keys(weapons).length
        ? { characters, weapons, elements }
        : null
}
