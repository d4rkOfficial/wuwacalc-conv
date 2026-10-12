/**
 * 阶段一 · **队伍配置** → `project.team`（不走 `phases.team.data`）。
 *
 * 源：`payload.data.members[]`
 *
 * | 目标 `CharSlot` | 源 | 状态 |
 * | --- | --- | --- |
 * | `character` | `members[i].name` | ✅ |
 * | `chain` | `members[i].resonanceUnlocked` | ✅ |
 * | `refinement` | `members[i].weaponSelection.refinement` | ✅ |
 * | `echoes[].name` / `.cost` | `members[i].echoConfig.slots[].name` / `.cost` | ✅ |
 * | `weapon` | `members[i].weaponSelection.id` → `weapons.json` 名称表 | ✅（表拉不到时留空） |
 * | `triggerSets` | `members[i].echoConfig.setLoadout[].{setId,count}` → 套装名 + 该套装生效档位 | ✅（表拉不到时留空） |
 *
 * 另产出 `lockedTeamKey` / `lockedTeamNames` / `conditionProfile`，口径与工具箱
 * `getTeamKeyFromTeam()` 一致（只统计「角色 + 武器」都齐的站位）。
 */

import { optionalString, toInt } from "../utils.ts"
import type { ProjectTables } from "./tables.ts"
import {
    type CoconutCharSlot,
    type CoconutEchoSlot,
    type CoconutSelectedSet,
    type CoconutTeamPhaseResult,
    TEAM_SIZE,
    type WuwaCalcEchoConfig,
    type WuwaCalcEchoSetLoadoutEntry,
    type WuwaCalcMember,
    type WuwaCalcProjectPayload,
} from "./types.ts"

/**
 * 声骸槽位：**只落首位声骸**（长度 1）。
 *
 * 椰果工具箱的 `CharSlot.echoes` 虽然声明成 5 元组，但实际只读 `echoes[0]`
 * —— `team-config.svelte` 与 `ai/tools/team.ts` 全程只写 `[0]`，`migration.ts` 里那 5 个空槽
 * 是历史遗留。因此这里给长度 1 的数组，既表达「只有首位声骸有意义」，也保证 `echoes[0]`
 * 一定存在（工具箱多处直接 `slot.echoes[0].name`，空数组会抛错）。
 *
 * 槽位取 `echoConfig.mainSlotIndex`（缺省 0）。
 * 上游**经常只给 `echoId` 不给名称**：实测「景燃」5 槽都有名字，但「尤诺」「守岸人」
 * 的槽位 `name` 全是空串、只有 `echoId`，所以名称要用 `echo-catalog.json` 兜底。
 */
const toEchoSlots = (
    config: WuwaCalcEchoConfig | null | undefined,
    tables: ProjectTables,
): CoconutEchoSlot[] => {
    const slots = config?.slots ?? []
    const main = slots[toInt(config?.mainSlotIndex, 0)] ?? slots[0]
    const echoId = optionalString(main?.echoId)
    const known = echoId ? tables.echoes.get(echoId) : undefined
    return [{
        name: optionalString(main?.name) ?? known?.name ?? null,
        cost: toInt(main?.cost, known?.cost ?? 0),
    }]
}

/**
 * 触发套装：件数达到该套装**自身存在**的档位才算触发。
 *
 * 档位来自上游 `echo-sets.json` 的 `bonuses` 键（如 `{2,5}`），降序输出，
 * 与工具箱 `fivePieceSelection()` 的 `[{5},{2}]` 同序同形。
 */
const toTriggerSets = (
    loadout: WuwaCalcEchoSetLoadoutEntry[] | null | undefined,
    tables: ProjectTables,
): CoconutSelectedSet[] => {
    const result: CoconutSelectedSet[] = []
    for (const entry of loadout ?? []) {
        const count = toInt(entry?.count, 0)
        const info = tables.echoSets.get(optionalString(entry?.setId) ?? "")
        if (!info || count <= 0) continue
        for (const tier of info.bonusTiers) {
            if (tier <= count) result.push({ name: info.name, pieces: tier })
        }
    }
    return result
}

const toCharSlot = (
    member: WuwaCalcMember | undefined,
    tables: ProjectTables,
): CoconutCharSlot => {
    const weaponId = optionalString(member?.weaponSelection?.id)
    return {
        character: optionalString(member?.name) ?? null,
        weapon: weaponId ? tables.weapons.get(weaponId) ?? null : null,
        triggerSets: toTriggerSets(member?.echoConfig?.setLoadout, tables),
        echoes: toEchoSlots(member?.echoConfig, tables),
        chain: toInt(member?.resonanceUnlocked, 0),
        refinement: toInt(member?.weaponSelection?.refinement, 0),
    }
}

/** 与工具箱 `getTeamKeyFromTeam()` 同口径：角色 + 武器都齐才计入 */
const isCompleteSlot = (slot: CoconutCharSlot): boolean =>
    slot.character !== null && slot.weapon !== null

export const convertTeamPhase = (
    payload: WuwaCalcProjectPayload | null | undefined,
    tables: ProjectTables,
): CoconutTeamPhaseResult => {
    const members = payload?.members ?? []
    const slots = Array.from(
        { length: TEAM_SIZE },
        (_, index) => toCharSlot(members[index], tables),
    )
    const complete = slots.filter(isCompleteSlot).map((s) =>
        s.character as string
    )

    return {
        slots,
        lockedTeamKey: [...complete].sort().join(","),
        lockedTeamNames: complete,
        conditionProfile: {
            chains: slots.map((s) => s.chain ?? 0),
            refinements: slots.map((s) => s.refinement ?? 0),
        },
    }
}
