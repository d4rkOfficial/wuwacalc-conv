/**
 * 词条（主词条 / 副词条）的 ID → 椰果口径映射表。
 *
 * 上游只给 `main_crit_dmg`、`sub_crit_rate` 这类 **ID**，椰果工程要的是
 * `{ type: '暴击伤害', value: 44, unit: '%' }`。这里的表是**游戏数据**（稳定），
 * 直接内联，不走运行时拉取。
 *
 * 口径与来源（对照工具箱 `$lib/consts/stat-data.ts`）：
 * - `MAIN_STAT_POOL` / `SUBSTAT_TIERS` 的**数值与单位**以工具箱为准，不采信上游给的数值，
 *   这样产物里的词条一定落在椰果自己的合法档位上；
 * - 上游数值若不等于任一档位，按**最近档位吸附**（与工坊「标准词条集」接口同一口径）。
 */

import { optionalString } from "../utils.ts"
import { ELEMENT_BONUS_ELEMENTS } from "./data/game.ts"
import type { CoconutEchoStat } from "./types.ts"

// ── 主词条 ────────────────────────────────────────────────────────────────────

/** 上游主词条 ID → 椰果主词条名（`main_element_dmg` 单独按元素拼名） */
const MAIN_STAT_LABELS: Record<string, string> = {
    main_crit_rate: "暴击率",
    main_crit_dmg: "暴击伤害",
    main_atk_percent: "攻击%",
    main_hp_percent: "生命%",
    main_def_percent: "防御%",
    main_energy_regen: "共鸣效率",
    // 上游叫「治疗效果加成」，椰果叫「治疗加成」
    main_healing_bonus: "治疗加成",
}

/** 椰果主词条池：cost → 词条名 → 满级数值（`MAIN_STAT_POOL`，单位一律 `%`） */
const MAIN_STAT_POOL: Record<number, Record<string, number>> = {
    4: {
        暴击率: 22,
        暴击伤害: 44,
        "攻击%": 33,
        "生命%": 33,
        "防御%": 41.8,
        治疗加成: 26.4,
    },
    3: {
        "攻击%": 30,
        "生命%": 30,
        "防御%": 38,
        共鸣效率: 32,
        ...Object.fromEntries(
            ELEMENT_BONUS_ELEMENTS.map((element) => [`${element}伤害加成`, 30]),
        ),
    },
    1: {
        "攻击%": 18,
        "生命%": 22.8,
        "防御%": 18,
    },
}

// ── 副词条 ────────────────────────────────────────────────────────────────────

/** 上游副词条 ID → 椰果副词条名（`sub_type_dmg` 单独按伤害类型拼名） */
const SUBSTAT_LABELS: Record<string, string> = {
    sub_crit_rate: "暴击率",
    sub_crit_dmg: "暴击伤害",
    sub_atk_percent: "攻击%",
    sub_flat_atk: "攻击",
    sub_hp_percent: "生命%",
    sub_flat_hp: "生命",
    sub_def_percent: "防御%",
    sub_flat_def: "防御",
    sub_energy_regen: "共鸣效率",
}

/** 旧版按伤害类型拆开的副词条 ID → 伤害类型 */
const LEGACY_TYPE_SUBSTATS: Record<string, string> = {
    sub_basic_dmg: "普攻",
    sub_heavy_dmg: "重击",
    sub_skill_dmg: "共鸣技能",
    sub_liberation_dmg: "共鸣解放",
}

/** 伤害类型 → 椰果增伤词条名 */
const DAMAGE_BONUS_LABELS: Record<string, string> = {
    普攻: "普攻伤害加成",
    重击: "重击伤害加成",
    共鸣技能: "共鸣技能伤害加成",
    共鸣解放: "共鸣解放伤害加成",
}

/** 椰果副词条档位与单位（`SUBSTAT_TIERS`，档位从低到高） */
const SUBSTAT_TIERS: Record<string, { tiers: number[]; unit: string }> = {
    生命: { tiers: [320, 360, 390, 430, 470, 510, 540, 580], unit: "" },
    攻击: { tiers: [30, 40, 50, 60], unit: "" },
    防御: { tiers: [40, 50, 60, 70], unit: "" },
    "生命%": { tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6], unit: "%" },
    "攻击%": { tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6], unit: "%" },
    "防御%": {
        tiers: [8.1, 9.0, 10.0, 10.9, 11.8, 12.8, 13.8, 14.7],
        unit: "%",
    },
    暴击率: { tiers: [6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5], unit: "%" },
    暴击伤害: {
        tiers: [12.6, 13.8, 15.0, 16.2, 17.4, 18.6, 19.8, 21.0],
        unit: "%",
    },
    共鸣效率: {
        tiers: [6.8, 7.6, 8.4, 9.2, 10.0, 10.8, 11.6, 12.4],
        unit: "%",
    },
    普攻伤害加成: {
        tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
        unit: "%",
    },
    重击伤害加成: {
        tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
        unit: "%",
    },
    共鸣技能伤害加成: {
        tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
        unit: "%",
    },
    共鸣解放伤害加成: {
        tiers: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
        unit: "%",
    },
}

/** 吸附到最近的合法档位（落在档位上就原样返回） */
const snapToTier = (tiers: number[], value: number): number =>
    tiers.reduce(
        (best, tier) =>
            Math.abs(tier - value) < Math.abs(best - value) ? tier : best,
        tiers[0],
    )

// ── 转换入口 ──────────────────────────────────────────────────────────────────

/**
 * 上游主词条 → 椰果 `mainStat`。
 *
 * 数值一律取**椰果该 cost 的满级上限**（上游给的也是满级值，但以工具箱表为准），
 * 所以 `main1` 只贡献「是哪条词条」。
 *
 * @param id `slots[].main1`，如 `main_crit_dmg`
 * @param cost 槽位 cost，决定词条池
 * @param element `slots[].main1Element`，仅 `main_element_dmg` 用得到
 */
export const convertMainStat = (
    id: unknown,
    cost: number,
    element: unknown,
): CoconutEchoStat | null => {
    const key = optionalString(id)
    if (!key) return null

    let label: string | undefined
    if (key === "main_element_dmg") {
        const el = optionalString(element)
        label = el ? `${el}伤害加成` : undefined
    } else {
        label = MAIN_STAT_LABELS[key]
    }
    if (!label) return null

    const value = MAIN_STAT_POOL[cost]?.[label]
    if (value === undefined) return null
    return { type: label, value, unit: "%" }
}

/**
 * 上游副词条 → 椰果 `substats[]` 的一项。
 *
 * @param id `subs[].id`，如 `sub_crit_dmg`；也兼容旧版 `sub_basic_dmg` 等
 * @param rawValue `subs[].value`
 * @param damageType `subs[].damageType`，仅伤害类型词条用得到
 */
export const convertSubstat = (
    id: unknown,
    rawValue: unknown,
    damageType: unknown,
): CoconutEchoStat | null => {
    const key = optionalString(id)
    if (!key) return null

    let label: string | undefined
    if (key === "sub_type_dmg") {
        label = DAMAGE_BONUS_LABELS[optionalString(damageType) ?? ""]
    } else {
        label = SUBSTAT_LABELS[key] ??
            DAMAGE_BONUS_LABELS[LEGACY_TYPE_SUBSTATS[key] ?? ""]
    }
    if (!label) return null

    const tier = SUBSTAT_TIERS[label]
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue)
    if (!tier || !Number.isFinite(value)) return null

    return {
        type: label,
        value: snapToTier(tier.tiers, value),
        unit: tier.unit,
    }
}
