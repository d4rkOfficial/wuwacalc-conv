/**
 * **追加倍率**（上游 `multAdd` → 椰果 `extraRatio`）的归属处理。
 *
 * ## 为什么要单独管
 *
 * 工具箱的 `extraRatio` 是**逐命中**加算的（`compute.ts`）：
 *
 * ```
 * effectiveRatio = ratio + extraRatio / 100 × hits
 * ```
 *
 * 而上游的 `multAdd` 是**技能级的一次性追加**：命火 527.5%、余响每层 +82.55%
 * （至多 24 层）。它的倍率追加在总量上，不该跟着技能自己的命中数再乘一遍 ——
 * 余响若按每命中算，谱曲终末 11 段就是 `1981.2 × 11 ≈ 21793%`，显然不对。
 *
 * 排轴现在**一个技能只落一条**倍率条目（直接用上游的原始复合倍率 `baseMult`），
 * 但这条的 `hits` 仍是技能自己的命中数（`multCount`），把追加倍率绑上去照样会被乘。
 *
 * ## 对策
 *
 * 给每个带追加倍率的技能补一条 **`（额外）` 条目**：倍率写
 * {@link EXTRA_RATIO_PLACEHOLDER}（≈0，只为让工具箱保留这条伤害行）、`hits = 1`，
 * 追加倍率类 buff **只挂到它上面** —— 每条目只加一次、`hits` 恒为 1，
 * 正好还原「每个技能加一次」。它和技能本体共用同一条参考线，所以轴不会变长。
 *
 * 其余乘区不受影响（增伤 / 加深 / 暴击 / 穿防本来就是逐命中结算的），
 * 名称限定的 buff 也照旧能绑到 `（额外）` 条目上（它的 `skillNames` 里带着原技能名）。
 */

import { optionalString } from "../utils.ts"
import { cumulativeAt, type UpstreamEffect } from "./stacks.ts"
import {
    TEAM_SIZE,
    type WuwaCalcMember,
    type WuwaCalcProjectPayload,
} from "./types.ts"

/** 队伍级 buff 被复制进成员列表时的 id 前缀（`tm_<原 id>`） */
export const TEAM_COPY_PREFIX = "tm_"

/** 上游映射到椰果 `extraRatio` 的 zone（`calculation.ts` 的 `ZONE_MAP` 里只有它） */
export const MULT_ADD_ZONE = "multAdd"

/** 椰果侧乘区 id */
export const EXTRA_RATIO_ZONE_ID = "extraRatio"

/**
 * 「（额外）」条目的倍率占位。
 *
 * 不能写 `0`：工具箱的 `parseValueString()` 对 `0` 直接返回空数组，条目会消失
 * （连带着追加倍率也没地方挂）。取一个非零但小到不影响结果的值。
 */
export const EXTRA_RATIO_PLACEHOLDER = "0.0000000000001%"

/** 「（额外）」条目名后缀 */
export const EXTRA_RATIO_SUFFIX = "（额外）"

/** 一条追加倍率效果及其归属 */
export interface MultAddEffect {
    buffId: string
    effect: UpstreamEffect
    /** 成员级 buff 的站位；队伍级为 `null` */
    ownerIndex: number | null
}

/** 「（额外）」条目要承载的某一层追加倍率（固定段层数为 `null`） */
export interface MultAddKey {
    buffId: string
    layer: number | null
    /**
     * 该效果限定的技能名（排序后拼起来）。
     *
     * 同一条 buff 里可以有多条追加倍率效果，各自点名不同技能 —— 命火就是一条 buff
     * 带 `重击·劫魄 527.5%` 与 `重击·踏罡 541.25%`。只按 `buffId` 认的话，
     * 两个技能会互相抢对方的条目，所以连名字一起带上（与拉表阶段变体的
     * `skillNames` 同源同序）。
     */
    skillNamesKey: string
}

/** 技能限定名的比较键：去重 + 排序后拼接（拉表阶段的变体用同一份名字） */
export const skillNamesKey = (names: string[]): string =>
    [...new Set(names)].sort().join("\u0000")

/** 某条效果点名了哪些技能（比较键） */
export const skillNamesKeyOf = (effect: UpstreamEffect): string =>
    skillNamesKey([
        ...(effect.librarySkillNames ?? []),
        ...(effect.skillNames ?? []),
    ])

/**
 * 收集全工程的追加倍率效果（队伍级 + 成员级，按 id 去重）。
 *
 * 去重口径与 `calculation.ts` 的 `collectBuffs()` 一致：`tm_<原 id>` 是队伍级 buff 的
 * 接收方副本，以 `sharedBuffs` 里的原始条目为准，避免同一条效果被算两遍。
 */
export const collectMultAddEffects = (
    payload: WuwaCalcProjectPayload | null | undefined,
): MultAddEffect[] => {
    /** 上游 buff 里本模块用到的两个字段（`buffs[]` 在类型上是 `unknown[]`） */
    interface BuffLike {
        id?: unknown
        effects?: UpstreamEffect[] | null
    }
    const shared = payload?.team?.sharedBuffs as
        | { buffs?: BuffLike[] | null }
        | undefined
    const sharedBuffs = shared?.buffs ?? []
    const sharedIds = new Set(
        sharedBuffs.map((buff) => optionalString(buff?.id)).filter(Boolean),
    )
    const seen = new Set<string>()
    const result: MultAddEffect[] = []

    const push = (buff: BuffLike | undefined, ownerIndex: number | null) => {
        const id = optionalString(buff?.id)
        if (!id || seen.has(id)) return
        seen.add(id)
        // 一条 buff 可以有多条追加倍率效果，各自点名不同技能
        // （命火：`重击·劫魄 527.5%` + `重击·踏罡 541.25%`），一条都不能漏
        for (const effect of buff?.effects ?? []) {
            if (optionalString(effect?.zone) !== MULT_ADD_ZONE) continue
            result.push({ buffId: id, effect, ownerIndex })
        }
    }

    for (const buff of sharedBuffs) push(buff, null)
    const members = (payload?.members ?? []).slice(0, TEAM_SIZE)
    members.forEach((member, memberIndex) => {
        for (const buff of (member.buffs ?? []) as BuffLike[]) {
            const id = optionalString(buff?.id) ?? ""
            // 队伍级 buff 的成员副本：以原始条目为准
            if (
                id.startsWith(TEAM_COPY_PREFIX) &&
                sharedIds.has(id.slice(TEAM_COPY_PREFIX.length))
            ) {
                continue
            }
            push(buff, memberIndex)
        }
    })
    return result
}

/** 上游 id 的两种形态（原 id / `tm_` 副本 id）都试一遍 */
const sameId = (a: string, b: string): boolean =>
    a === b || `${TEAM_COPY_PREFIX}${a}` === b ||
    `${TEAM_COPY_PREFIX}${b}` === a

/**
 * 全工程的 buff 开关：队伍级 `sharedBuffs.globalBuffActive` 打底，成员自己的覆盖上去。
 *
 * 「逐技能的开关」另有一份（`skill.buffActive`，优先级更高）；排轴与拉表两个阶段
 * 都要判断某条 buff 在某处是否生效，所以这份口径共用。
 */
export const globalBuffActiveOf = (
    payload: WuwaCalcProjectPayload | null | undefined,
): Map<string, boolean> => {
    const map = new Map<string, boolean>()
    const shared = payload?.team?.sharedBuffs as
        | { globalBuffActive?: Record<string, boolean> }
        | undefined
    for (const [id, value] of Object.entries(shared?.globalBuffActive ?? {})) {
        map.set(id, !!value)
    }
    for (const member of (payload?.members ?? []).slice(0, TEAM_SIZE)) {
        for (
            const [id, value] of Object.entries(
                (member as WuwaCalcMember).globalBuffActive ?? {},
            )
        ) {
            if (!map.has(id)) map.set(id, !!value)
        }
    }
    return map
}

/**
 * 「分配覆盖」：上游「提供的全队 Buff」里，某个站位可以取消勾选某条全队 buff
 * （`members[i].excludedTeamBuffIds` / `manuallyExcludedTeamBuffIds`）。
 * 拉表阶段收窄 `scope` 与排轴阶段决定要不要建「（额外）」条目都用这一份口径。
 */
export const isTeamBuffExcludedFor = (
    member: WuwaCalcMember | null | undefined,
    buffId: string,
): boolean => {
    for (
        const list of [
            member?.excludedTeamBuffIds,
            member?.manuallyExcludedTeamBuffIds,
        ]
    ) {
        for (const raw of list ?? []) {
            const id = optionalString(raw)
            if (id && sameId(id, buffId)) return true
        }
    }
    return false
}

/** 该效果是否点到这个技能上（`skillScope: 'names'` 之外的效果对所有技能生效） */
export const multAddMatchesSkill = (
    effect: UpstreamEffect,
    names: string[],
): boolean => {
    if (effect.skillScope !== "names") return true
    const wanted = [
        ...(effect.librarySkillNames ?? []),
        ...(effect.skillNames ?? []),
    ]
        .map((name) => optionalString(name))
        .filter((name): name is string => !!name)
    if (!wanted.length) return true
    return wanted.some((name) => names.includes(name))
}

/** 逐技能的 buff 开关：技能级优先，缺失回落到全局 */
const isActiveFor = (
    buffId: string,
    active: Record<string, boolean> | null | undefined,
    globalActive: Map<string, boolean>,
): boolean => {
    for (const key of [buffId, `${TEAM_COPY_PREFIX}${buffId}`]) {
        const value = active?.[key]
        if (typeof value === "boolean") return value
    }
    for (const key of [buffId, `${TEAM_COPY_PREFIX}${buffId}`]) {
        const value = globalActive.get(key)
        if (typeof value === "boolean") return value
    }
    return true
}

/**
 * 该技能上要挂哪些「（额外）」追加倍率。
 *
 * @param options.effects {@link collectMultAddEffects} 的结果
 * @param options.memberIndex 当前技能所属站位
 * @param options.names 该技能认的名字（短名 / 目录名 / 技能库全名）
 * @param options.stacks 该技能的层数快照（`resolveStacks()` 的结果）
 * @param options.active 该技能的 buff 开关（`skill.buffActive`）
 * @param options.globalActive 全局 buff 开关（`globalBuffActive`）
 * @param options.member 站位数据（查「分配覆盖」）
 */
export const resolveSkillMultAdds = (options: {
    effects: MultAddEffect[]
    memberIndex: number
    names: string[]
    stacks: Record<string, number>
    active?: Record<string, boolean> | null
    globalActive: Map<string, boolean>
    member?: WuwaCalcMember | null
}): MultAddKey[] => {
    const keys: MultAddKey[] = []
    for (const { buffId, effect, ownerIndex } of options.effects) {
        // 成员级追加倍率只作用于自己的技能
        if (ownerIndex !== null && ownerIndex !== options.memberIndex) continue
        if (!multAddMatchesSkill(effect, options.names)) continue
        if (isTeamBuffExcludedFor(options.member, buffId)) continue
        if (!isActiveFor(buffId, options.active, options.globalActive)) continue
        const layer = Math.trunc(Number(options.stacks[buffId]) || 0)
        if (!cumulativeAt(effect, layer)) continue
        keys.push({
            buffId,
            // 固定段不按层绑（与拉表阶段 `toBuffVariants()` 的 `layer` 口径一致）
            layer: effect.valueMode === "fixed" ? null : layer,
            skillNamesKey: skillNamesKeyOf(effect),
        })
    }
    return keys
}
