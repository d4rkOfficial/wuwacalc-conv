/**
 * 阶段四 · **词条 / 环境配置** → `phases.config`（工具箱 `ConfigState`）。
 *
 * 目标结构（`src/lib/calc/config.types.ts`）：
 * ```
 * enemy:      { type, level, defense, defenseLocked, resistances, dmgReduction }
 * characters: [{ echoes: [{ cost, mainStat, secondMainStat, substats }] } × 3]
 * ```
 *
 * | 目标 | 源 | 说明 |
 * | --- | --- | --- |
 * | `enemy.level` | `team.monsterLevel` | 缺省 90 |
 * | `enemy.defense` | 由 level 推导 | 工坊同款公式 `792 + 8 × level` |
 * | `enemy.resistances` | `team.monsterRes` | 上游只有一个全局值，按元素均摊 |
 * | `enemy.type` | 上游不区分怪物类型 | 取工坊默认 `精英怪` |
 * | `echoes[].cost` | `members[i].echoConfig.slots[].cost` | |
 * | `echoes[].mainStat` | `slots[].main1` + `main1Element` | 数值取椰果满级上限（见 `stat-tables.ts`） |
 * | `echoes[].substats` | `slots[].subs[]` | 数值吸附到椰果合法档位 |
 * | `echoes[].secondMainStat` | 由 cost 查表 | 4→攻击150 / 3→攻击100 / 1→生命2280 |
 *
 * 本阶段在社区工程里是**可编辑**的（`locked: false`），与工坊样例一致。
 */

import { toInt } from "../utils.ts"
import { convertMainStat, convertSubstat } from "./stat-tables.ts"
import {
    type CoconutCharEchoConfig,
    type CoconutConfigState,
    type CoconutEchoSlotConfig,
    type CoconutEchoStat,
    type CoconutEnemyConfig,
    type CoconutPhaseState,
    ECHO_SLOT_COUNT,
    TEAM_SIZE,
    type WuwaCalcEchoConfig,
    type WuwaCalcEchoSlot,
    type WuwaCalcProjectPayload,
    type WuwaCalcTeamSnapshot,
} from "./types.ts"

/** 工坊的元素枚举（`ELEMENTS`），抗性按元素逐项给出 */
const ELEMENTS = [
    "物理",
    "冷凝",
    "热熔",
    "导电",
    "气动",
    "衍射",
    "湮灭",
] as const

/** 工坊默认等级与防御公式（`defaultEnemy()` / `792 + 8 × level`） */
const DEFAULT_LEVEL = 90
const DEFAULT_ENEMY_TYPE = "精英怪"
const defenseForLevel = (level: number): number => 792 + 8 * level

/** 副主词条由 cost 决定（`SECOND_MAIN_STAT`），与上游填了什么无关 */
const SECOND_MAIN_STAT: Record<
    number,
    { label: string; value: number; unit: string }
> = {
    4: { label: "攻击", value: 150, unit: "" },
    3: { label: "攻击", value: 100, unit: "" },
    1: { label: "生命", value: 2280, unit: "" },
}

const convertEnemy = (
    team: WuwaCalcTeamSnapshot | null | undefined,
): CoconutEnemyConfig => {
    const level = toInt(team?.monsterLevel, DEFAULT_LEVEL)
    // 上游只有一个全局 monsterRes，工坊是分元素抗性：按「对所有元素同值」落，
    // 与上游「不区分元素」的口径一致。
    const res = toInt(team?.monsterRes, 0)

    return {
        type: DEFAULT_ENEMY_TYPE,
        level,
        defense: defenseForLevel(level),
        defenseLocked: false,
        resistances: Object.fromEntries(
            ELEMENTS.map((element) => [element, res]),
        ),
        dmgReduction: 0,
    }
}

const toEchoSlotConfig = (
    slot: WuwaCalcEchoSlot | undefined,
): CoconutEchoSlotConfig => {
    const cost = toInt(slot?.cost, 1)
    const second = SECOND_MAIN_STAT[cost]
    return {
        cost,
        mainStat: convertMainStat(slot?.main1, cost, slot?.main1Element),
        secondMainStat: second
            ? { type: second.label, value: second.value, unit: second.unit }
            : null,
        substats: (slot?.subs ?? [])
            .map((sub) => convertSubstat(sub?.id, sub?.value, sub?.damageType))
            .filter((stat): stat is CoconutEchoStat => stat !== null),
    }
}

const toCharEchoConfig = (
    echoConfig: WuwaCalcEchoConfig | null | undefined,
): CoconutCharEchoConfig => {
    const slots: WuwaCalcEchoSlot[] = echoConfig?.slots ?? []
    return {
        echoes: Array.from(
            { length: ECHO_SLOT_COUNT },
            (_, index) => toEchoSlotConfig(slots[index]),
        ),
    }
}

export const convertConfigPhase = (
    payload: WuwaCalcProjectPayload | null | undefined,
): CoconutPhaseState<CoconutConfigState> => {
    const members = payload?.members ?? []
    const characters = Array.from(
        { length: TEAM_SIZE },
        (_, index) => toCharEchoConfig(members[index]?.echoConfig),
    )

    return {
        // 社区工程的词条/环境对导入方开放编辑，与工坊样例一致
        locked: false,
        data: { characters, enemy: convertEnemy(payload?.team) },
    }
}
