/**
 * 阶段三 · **拉表** → `phases.calculation`（工具箱 `CalcState`）+ `project.buffs`。
 *
 * 规则见 `docs/convert-phase-mapping.md` 第一节，要点：
 * - 上游乘区词表 → 椰果 `ZoneId`（`docs` 1.2 的对照表）；
 * - 数值**折算成最终值**写进 `zones[].value`（`valueMode` / `segments` / `minStacks` / `minResonance`）；
 * - 作用范围 `scope`：队伍级 → `'all'`，角色级 → `[i]`，`excludeSource` 把来源站位剔掉；
 * - 技能限定（`skillScope: 'names'`）不落进 `condition`，而是**只绑到名称匹配的伤害条目**。
 */

import { optionalString, toInt } from "../utils.ts"
import { EMPTY_TABLES, type ProjectTables } from "./tables.ts"
import {
    EXTRA_RATIO_ZONE_ID,
    globalBuffActiveOf,
    isTeamBuffExcludedFor,
    skillNamesKey,
    TEAM_COPY_PREFIX,
} from "./extra-ratio.ts"
import { getEffectMultiplier } from "../../engines/coconut/lib/consts/effect-data.ts"
import { collectPanelBuffs } from "./panel.ts"
import { cumulativeAt, type UpstreamEffect } from "./stacks.ts"
import type { SkillState } from "./timeline.ts"
import {
    type CoconutBuffCondition,
    type CoconutBuffInstance,
    type CoconutBuffZone,
    type CoconutCalcState,
    type CoconutDamageEntry,
    type CoconutPhaseState,
    TEAM_SIZE,
    type WuwaCalcMember,
    type WuwaCalcProjectPayload,
} from "./types.ts"

import {
    COORD_ATTACK_KEYWORDS,
    DAMAGE_TYPE_LABELS,
    NAME_PREFIX_TYPES,
} from "./data/game.ts"
import {
    CONDITIONAL_ZONES,
    DEFENSE_ZONE_KEYS,
    ZONE_LABELS,
    ZONE_MAP,
} from "./data/zones.ts"

/** 上游 `damageType` 对应的工具箱伤害类型全名；没给或认不出来时返回 `null` */
const upstreamDamageType = (entry: CoconutDamageEntry): string | null =>
    DAMAGE_TYPE_LABELS[optionalString(entry.damageType) ?? ""] ?? null

const alsoDamageTypesOf = (entry: CoconutDamageEntry): string[] => {
    const types: string[] = []
    const names = [
        entry.hitName,
        entry.displayName,
        ...(entry.skillNames ?? []),
    ]
        .filter(Boolean)
        .join(" ")
    if (
        names &&
        COORD_ATTACK_KEYWORDS.some((keyword) => names.includes(keyword))
    ) {
        types.push("协同攻击伤害")
    }
    // 上游 `alsoAsEffect`（如卡提希娅的普攻同时视为风蚀）是**第二伤害类型**：
    // 椰果的条件内部是「或」，所以同一条目可以同时挂「普攻伤害」和「效应伤害」，
    // 效应专属 Buff 不会再漏掉这条直伤。
    if (optionalString(entry.alsoAsEffect)) types.push("效应伤害")
    return [...new Set(types)]
}

export const inferEntryDamageTypes = (entry: CoconutDamageEntry): string[] => {
    const also = alsoDamageTypesOf(entry)
    const upstream = upstreamDamageType(entry)
    if (upstream) return [upstream, ...also.filter((type) => type !== upstream)]
    if (entry.isEffect) return ["效应伤害"]
    const withAlso = (types: string[]) => [
        ...types,
        ...also.filter((type) => !types.includes(type)),
    ]
    for (const [prefix, type] of NAME_PREFIX_TYPES) {
        if (entry.hitName.includes(prefix)) return withAlso([type])
    }
    switch (entry.skillType) {
        case "常态攻击":
            return withAlso(
                entry.hitName.includes("重击") ? ["重击伤害"] : ["普攻伤害"],
            )
        case "共鸣技能":
            return withAlso(["共鸣技能伤害"])
        case "共鸣解放":
            return withAlso(["共鸣解放伤害"])
        case "声骸技能":
            return withAlso(["声骸技能伤害"])
        case "变奏技能":
            return withAlso(["变奏技能伤害"])
        case "延奏技能":
            return withAlso(["延奏技能伤害"])
        default:
            return withAlso(["其它类型伤害"])
    }
}

// ── 上游结构（仅本模块用到） ──────────────────────────────────────────────────

interface UpstreamBuff {
    id?: string
    name?: string
    category?: string
    mode?: string
    value?: number
    perStack?: number
    maxStacks?: number
    element?: string
    damageType?: string
    defenseKind?: string
    effects?: UpstreamEffect[] | null
    excludeSource?: boolean
    sourceMemberIndex?: number
    sourceTag?: string
    convergenceVuln?: number
    /** 武器 Buff 自带（`weapon_fx_*` / `weapon_team_fx_*`） */
    weaponId?: string
    /** 角色模板键，里面常带共鸣链档位（`qingxiao_c4_team_atk`） */
    templateKey?: string
}

// ── 归属门（参考武器 / 参考本体 / 参考某人的共鸣链）────────────────────────────

/** `pk_0_…` / `tb_1_…` / `weapon_team_fx_2_…` 里的站位号 */
const SOURCE_SLOT_PATTERN = /^(?:tm_)?(?:pk|tb|weapon_team_fx)_(\d+)_/

/** 这条 buff 的来源是角色本体还是武器（声骸/套装的留空，工具箱按名字归档） */
const sourceKindOf = (
    buff: UpstreamBuff,
    id: string,
): "character" | "weapon" | null => {
    if (optionalString(buff.weaponId)) return "weapon"
    if (/^(?:tm_)?weapon_/.test(id)) return "weapon"
    if (buff.sourceTag === "characterTemplate") return "character"
    if (/^(?:tm_)?(?:pk|tb)_/.test(id)) return "character"
    return null
}

/** 该 buff 挂在哪个站位上：成员级看 ownerIndex，队伍级看 `sourceMemberIndex` 或 id 前缀 */
const ownerSlotOf = (
    buff: UpstreamBuff,
    id: string,
    ownerIndex: number | null,
): number => {
    if (ownerIndex !== null) return ownerIndex
    const declared = toInt(buff.sourceMemberIndex, -1)
    if (declared >= 0 && declared < TEAM_SIZE) return declared
    const matched = SOURCE_SLOT_PATTERN.exec(id)
    if (matched) {
        const slot = Number(matched[1])
        if (slot >= 0 && slot < TEAM_SIZE) return slot
    }
    return -1
}

/**
 * 这条 buff 是哪一档共鸣链的：上游**不在 `minResonance` 上写**这件事
 * （实测 `【本体】4链·清宵` / `pk_0_qingxiao_c3_wanwu_mult` 的 `minResonance` 都是 0），
 * 档位藏在 `templateKey`（`qingxiao_c4_team_atk`）、id 与名字（`【本体】3链`）里。
 */
const chainLevelOf = (buff: UpstreamBuff, id: string): number => {
    const sources = [
        optionalString(buff.templateKey) ?? "",
        id,
        optionalString(buff.name) ?? "",
    ]
    for (const text of sources) {
        const token = /(?:^|_)c([1-6])(?:_|$)/i.exec(text)
        if (token) return Number(token[1])
        const label = /([1-6])\s*链/.exec(text)
        if (label) return Number(label[1])
    }
    return 0
}

/**
 * 给 buff 补一道**归属门**，让工具箱的左侧列表把它归档到正确目录
 * （`buff-tree.ts` 的二级目录就是按链/阶条件分的）：
 *
 * | 归属 | 门 | 归档到 |
 * | --- | --- | --- |
 * | 角色本体 / 共鸣链（`pk_` / `tb_` / `characterTemplate`） | `chains: [{ charIdx, min }]` | `角色名本体`（`min = 0`）或 `角色名X链` |
 * | 武器（`weapon_fx_` / `weapon_team_fx_` / 带 `weaponId`） | `refinements: [{ charIdx, min: 0 }]` | `角色名的武器名` |
 *
 * 「本体」用 0 链表达是工具箱自己的口径（`condition.ts` 的 `withOwnerBodyGate`）：
 * 链 = 角色共鸣链，0 链即本体，且 `≥0 链` 恒成立，不会把效果挡掉。
 */
const ownerGateOf = (
    buff: UpstreamBuff,
    id: string,
    ownerIndex: number | null,
    effects: UpstreamEffect[],
): CoconutBuffCondition | undefined => {
    const kind = sourceKindOf(buff, id)
    if (!kind) return undefined
    const owner = ownerSlotOf(buff, id, ownerIndex)
    if (owner < 0) return undefined

    if (kind === "weapon") return { refinements: [{ charIdx: owner, min: 0 }] }

    // 档位 = max(名字/templateKey 里写的链档, 效果上写的 minResonance 门槛)。
    // `minResonance` 取**所有效果里最小**的那个：只要有一段不受链约束，
    // 这条 buff 本身就算「本体」（那几段 `minResonance: 2` 只是本体 buff 的一部分）。
    const gates = effects.map((effect) => toInt(effect.minResonance, 0))
    const effectGate = gates.length ? Math.min(...gates) : 0
    const min = Math.max(0, chainLevelOf(buff, id), effectGate)
    return { chains: [{ charIdx: owner, min }] }
}

// ── 数值折算 ──────────────────────────────────────────────────────────────────

/** 收敛浮点噪声：上游不少值带 1e-14 级尾巴（叠加累加也会引入） */
const roundValue = (value: number): number => Math.round(value * 100) / 100

// ── 乘区与条件的组装 ──────────────────────────────────────────────────────────

const conditionOf = (
    effect: UpstreamEffect,
): CoconutBuffCondition | undefined => {
    const kind = CONDITIONAL_ZONES[optionalString(effect.zone) ?? ""]
    if (!kind) return undefined

    if (kind === "element") {
        const element = optionalString(effect.element)
        return element ? { elements: [element] } : undefined
    }
    // 伤害类型条件必须写成全名（`普攻伤害`），否则工具箱永远匹配不上
    const label = DAMAGE_TYPE_LABELS[optionalString(effect.damageType) ?? ""]
    return label ? { damageTypes: [label] } : undefined
}

/** 技能限定名（`skillScope: 'names'` 时用来挑伤害条目） */
const skillNamesOf = (effect: UpstreamEffect): string[] => {
    if (effect.skillScope !== "names") return []
    return [...(effect.librarySkillNames ?? []), ...(effect.skillNames ?? [])]
        .map((name) => optionalString(name))
        .filter((name): name is string => !!name)
}

// ── 作用范围 ──────────────────────────────────────────────────────────────────

/** 队伍级 buff → `'all'`；角色级 → 该站位 */
const scopeOf = (ownerIndex: number | null): "all" | number[] =>
    ownerIndex === null ? "all" : [ownerIndex]

/** `excludeSource: true`（延奏类）→ 来源站位不吃 */
const applyExcludeSource = (
    scope: "all" | number[],
    buff: UpstreamBuff,
): "all" | number[] => {
    if (!buff.excludeSource) return scope
    const source = toInt(buff.sourceMemberIndex, -1)
    if (source < 0) return scope
    if (scope === "all") {
        return Array.from({ length: TEAM_SIZE }, (_, i) => i).filter((i) =>
            i !== source
        )
    }
    return scope.filter((i) => i !== source)
}

/**
 * 「分配覆盖」：上游「提供的全队 Buff」面板里，每个角色头像下可以取消勾选，
 * 表示**这个角色全程吃不到这条全队 buff**（数据落在 `members[i].excludedTeamBuffIds`）。
 *
 * 漏读它的后果就是「只该给一个人的延奏落到全队头上」：实测 `MC-JXUQZU` 里
 * 「弗洛洛·延奏」只勾了莫宁，但产物给的是 `[1,2]`（坎特蕾拉也吃了）。
 *
 * 判定与「（额外）追加倍率条目」共用一份口径（`extra-ratio.ts`），免得两边不一致。
 */
const excludedTeamBuffLookup = (
    members: WuwaCalcMember[],
): (memberIndex: number, buffId: string) => boolean =>
(memberIndex, buffId) => isTeamBuffExcludedFor(members[memberIndex], buffId)

/** 按“不吃的人”收窄作用范围；一个人都不剩时返回空（调用方丢弃这条 buff） */
const narrowScope = (
    scope: "all" | number[],
    buffId: string,
    excludedBy: (memberIndex: number, buffId: string) => boolean,
): number[] => {
    const indices = scope === "all"
        ? Array.from({ length: TEAM_SIZE }, (_, i) => i)
        : scope
    return indices.filter((index) => !excludedBy(index, buffId))
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

/**
 * 上游队伍级 buff 的两个 id 形态：`team.sharedBuffs.buffs` 里是**原始 id**
 * （`globalBuffActive` / `globalBuffStacks` 也用原始 id），而成员 `buffs` 里的副本
 * 带 `tm_` 前缀（排轴上的逐技能状态用的就是这个前缀）。查状态时两种都要试。
 */
const stateKeysOf = (id: string): string[] =>
    id.startsWith(TEAM_COPY_PREFIX)
        ? [id, id.slice(TEAM_COPY_PREFIX.length)]
        : [id, TEAM_COPY_PREFIX + id]

const collectBuffs = (
    payload: WuwaCalcProjectPayload | null | undefined,
    tables: ProjectTables = EMPTY_TABLES,
): { buff: UpstreamBuff; ownerIndex: number | null }[] => {
    const members = payload?.members ?? []
    const result: { buff: UpstreamBuff; ownerIndex: number | null }[] = []

    // 成员列表里的 `tm_` 副本可能带**动态换算后的数值**（如达妮娅固有：
    // shared 原始值 10，成员副本按偏谐效率换算成 50）。共享条目负责作用域/归属，
    // 数值应以成员副本为准，否则会少 40 点谐度破坏增幅。
    const copiesById = new Map<string, UpstreamBuff[]>()
    for (const member of members.slice(0, TEAM_SIZE)) {
        for (const raw of (member.buffs ?? []) as UpstreamBuff[]) {
            const id = optionalString(raw?.id)
            if (!id || !id.startsWith(TEAM_COPY_PREFIX)) continue
            const baseId = id.slice(TEAM_COPY_PREFIX.length)
            const list = copiesById.get(baseId) ?? []
            list.push(raw)
            copiesById.set(baseId, list)
        }
    }
    const shared = payload?.team?.sharedBuffs as
        | { buffs?: UpstreamBuff[] }
        | undefined
    const sharedBuffs = shared?.buffs ?? []
    const sharedIds = new Set(sharedBuffs.map((buff) => buff.id))
    for (const buff of sharedBuffs) {
        const copy = copiesById.get(optionalString(buff.id) ?? "")?.[0]
        const value = Number(copy?.value)
        const merged = copy && Number.isFinite(value)
            ? {
                ...buff,
                value,
                perStack: Number(copy.perStack) || value,
            }
            : buff
        result.push({ buff: merged, ownerIndex: null })
    }
    members.slice(0, TEAM_SIZE).forEach((member: WuwaCalcMember, index) => {
        for (const buff of (member.buffs ?? []) as UpstreamBuff[]) {
            const id = buff.id
            if (
                typeof id === "string" && id.startsWith(TEAM_COPY_PREFIX) &&
                sharedIds.has(id.slice(TEAM_COPY_PREFIX.length))
            ) {
                continue
            }
            // 首位声骸效果由站点按图鉴重建。原始 payload 里的 `echo_main_buff_*`
            // 是旧快照，类目可能已经过时（赫卡忒 40% 是「协同攻击 typeBonus」，
            // payload 却写成 `generalBonus`，会让全伤害都吃 40%）；按图鉴重建才准。
            if (typeof id === "string" && id.startsWith("echo_main_buff_")) {
                continue
            }
            result.push({ buff, ownerIndex: index })
        }

        // 按图鉴重建首位声骸效果（只取 panelBonus；技能倍率由排轴/技能库负责）
        const slots = member.echoConfig?.slots ?? []
        const main = slots[toInt(member.echoConfig?.mainSlotIndex, 0)] ??
            slots[0]
        const echoId = optionalString(main?.echoId)
        const specimen = echoId ? tables.echoSpecimens.get(echoId) : undefined
        if (specimen) {
            const effects: UpstreamEffect[] = specimen.mainEffects
                .filter((effect) =>
                    effect.kind === "panelBonus" &&
                    optionalString(effect.category) &&
                    Number.isFinite(Number(effect.value)) &&
                    Number(effect.value) !== 0
                )
                .map((effect, effectIndex) => ({
                    id: `${specimen.id}_${effectIndex}`,
                    zone: optionalString(effect.category) ?? "",
                    valueMode: "fixed",
                    value: Number(effect.value) || 0,
                    segments: [{ upTo: null, perStack: 0 }],
                    skillScope: "all",
                    element: optionalString(effect.element) ?? "",
                    damageType: optionalString(effect.damageType) ?? "",
                    minStacks: 0,
                    minResonance: 0,
                    onlyCharacterIds: [],
                    onlyCombatModes: [],
                    effectKey: optionalString(effect.sourceKey) ?? "",
                }))
            if (effects.length) {
                result.push({
                    buff: {
                        id: `echo_main_buff_${specimen.id}_rebuilt`,
                        name: `【声骸】${specimen.name} · 首位`,
                        category: "composite",
                        effects,
                    },
                    ownerIndex: index,
                })
            }
        }
    })
    return result
}

/**
 * 一条拆出来的椰果 buff 变体。
 *
 * 一个上游 buff 会拆成若干个变体，拆分维度有两个：
 * - **乘区**：一个变体只带一种乘区（同乘区、同条件、同技能限定的效果并成一条），
 *   拆出来的变体在命名上加乘区后缀；
 * - **层数**：椰果没有叠层模型，于是「轴上用到过的每个层数」各出一条，
 *   `zones[].value` 写**该层数下的累计值**（第 1..n 层之和）。
 */
interface BuffVariant {
    instance: CoconutBuffInstance
    /** 上游 buff id，用来查逐技能的层数 */
    sourceId: string
    /** 该变体的椰果乘区 id（`extraRatio` 要按「（额外）」条目特殊绑定） */
    zoneId: string
    /** 该变体对应的层数；`null` = 不按层绑（纯固定段） */
    layer: number | null
    /** 纯固定段的 `minStacks` 门槛（按层绑的变体恒为 0） */
    minStacks: number
    /** 技能限定名（`skillScope: 'names'`）；非空时只绑名称命中的条目 */
    skillNames: string[]
    /**
     * 占位条目：轴上没用到任何层，这条只为「别让 buff 从列表里消失」而存在，
     * 值为 0 且不参与勾选。
     */
    placeholder?: boolean
    /** 集谐·最终伤害：值需要按受益角色的谐度破坏增幅缩放 */
    convergence?: boolean
}

/** 同乘区重复出现时的消歧：优先用技能名，其次用序号 */
const discriminatorOf = (names: string[], index: number): string => {
    const first = names[0]?.split("·").pop()?.trim()
    return first || `#${index + 1}`
}

/**
 * 把一条上游 buff 拆成椰果实例。
 *
 * | 维度 | 规则 |
 * | --- | --- |
 * | 乘区 | 同乘区 + 同条件 + 同技能限定的效果并成一条；一个变体只带**一种**乘区 |
 * | 层数 | 轴上**用到过的层数**各一条（`祸兮福兮 50层`），值取该层的累计值 |
 * | 固定段 | 不拆层：`minStacks` 当绑定门槛（`≥N 层`才生效） |
 *
 * 层数只取轴上真正用到的：`maxStacks` 是上限（祸兮福兮 50 层的上限不代表每条轴都用满），
 * `1..N` 全铺更是会凭空多出一堆空 buff。
 */
const toBuffVariants = (
    buff: UpstreamBuff,
    ownerIndex: number | null,
    resonances: number[],
    /** 该 buff 在轴上用到过的层数（升序，均 > 0） */
    usedLayers: number[],
    /** 该成员是否**不吃**这条全队 buff（「分配覆盖」的勾选） */
    excludedBy: (memberIndex: number, buffId: string) => boolean,
    /** 队伍成员：把效果上的 `onlyCharacterIds` 落到站位 */
    members: WuwaCalcMember[],
): BuffVariant[] => {
    const id = optionalString(buff.id)
    if (!id) return []

    const resonance = ownerIndex === null ? 6 : resonances[ownerIndex] ?? 0

    // 单乘区 buff 视作只有一条效果
    const rawEffects: UpstreamEffect[] = buff.category === "composite"
        ? buff.effects ?? []
        : [{
            zone: buff.category,
            valueMode: buff.mode === "stack" ? "stack" : "fixed",
            value: buff.value,
            // 上游自己的归一化是 `perStack || value`（见 core.js）：perStack 缺席时拿 value 当每层值，
            // 否则「value=15 / perStack 缺省」这类叠层 buff 会被算成 0
            perStack: Number(buff.perStack) || Number(buff.value) || 0,
            segments: [{
                upTo: null,
                perStack: Number(buff.perStack) || Number(buff.value) || 0,
            }],
            maxStacks: buff.maxStacks,
            element: buff.element,
            damageType: buff.damageType,
            defenseKind: buff.defenseKind,
            skillScope: "all",
        }]

    // 链阶门槛**不再提前过滤**：转成 Buff 上的 `condition.chains`，
    // 这样同一份工程换到别的链档导入时，链专属效果能自动开/关。
    const effects = rawEffects

    // 集谐模态只有 convergenceVuln 一个数值，单独成一条易伤乘区。
    // ⚠️ 它是**每层值**（buff.mode === "stack" 时），必须按叠层累计：
    // 4 层 × 14.4% = 57.6%，不能写成固定 14.4%。
    if (buff.category === "convergence") {
        const perStack = Number(buff.convergenceVuln) * 100
        if (perStack) {
            const replacement = {
                zone: "convergence",
                valueMode: buff.mode === "stack" ? "stack" : "fixed",
                value: perStack,
                perStack,
                segments: [{
                    upTo: buff.maxStacks ?? null,
                    perStack,
                }],
                maxStacks: buff.maxStacks,
                skillScope: "all",
            }
            const placeholder = effects.findIndex((effect) =>
                effect.zone === "convergence"
            )
            if (placeholder >= 0) effects[placeholder] = replacement
            else effects.push(replacement)
        }
    }

    interface ZoneGroup {
        zoneId: string
        zoneKey: string
        condition?: CoconutBuffCondition
        skillNames: string[]
        /** 这一组效果要求的共鸣链门槛（效果上的 `minResonance`） */
        minResonance: number
        /** 效果限定的站位；`null` 表示不按角色收窄 */
        allowedSlots: number[] | null
        effects: UpstreamEffect[]
    }

    /**
     * 上游某些团队效果只对指定角色 ID 生效（爱弥斯延奏的额外 10% 只给
     * 达妮娅 / 千咲）。椰果没有「按角色 ID」条件，只能把这条效果**收窄到对应站位**；
     * 否则同一个乘区的 10% 基础 + 10% 额外会被合并成 20% 发给全队。
     */
    const slotsOf = (effect: UpstreamEffect): number[] | null => {
        const ids = (effect.onlyCharacterIds ?? []).filter(Boolean)
        if (!ids.length) return null
        const slots: number[] = []
        members.forEach((member, index) => {
            if (ids.includes(optionalString(member.characterId) ?? "")) {
                slots.push(index)
            }
        })
        return slots
    }

    /** 同乘区 + 同条件 + 同技能限定 + 同链阶门槛 → 一条椰果 buff */
    const groups: ZoneGroup[] = []
    for (const effect of effects) {
        const zoneKey = optionalString(effect.zone) ?? ""
        // 上游把「穿防（pen）」和「无视防御（ignore）」分成两个独立乘算因子：
        // `(1 - pen) × (1 - ignore)`。工具箱的 `defPen` 是穿防、`defDown` 是减防，
        // 二者在 `computeDefMulti()` 里也是独立乘算；若把 ignore 也加进 defPen，
        // 就会变成 `1 - pen - ignore`，把 18% 无视放大成额外收益（实测 +9.7%）。
        const zoneId = zoneKey in DEFENSE_ZONE_KEYS &&
                effect.defenseKind === "ignore"
            ? "defDown"
            : ZONE_MAP[zoneKey]
        if (!zoneId) continue
        const condition = conditionOf(effect)
        const skillNames = skillNamesOf(effect).sort()
        const minResonance = toInt(effect.minResonance, 0)
        const allowedSlots = slotsOf(effect)
        if (allowedSlots && allowedSlots.length === 0) continue
        const slotKey = allowedSlots ? allowedSlots.join(",") : ""
        const hit = groups.find((group) =>
            group.zoneId === zoneId &&
            group.minResonance === minResonance &&
            (group.allowedSlots ? group.allowedSlots.join(",") : "") ===
                slotKey &&
            JSON.stringify(group.condition ?? null) ===
                JSON.stringify(condition ?? null) &&
            group.skillNames.join("\u0000") === skillNames.join("\u0000")
        )
        if (hit) hit.effects.push(effect)
        else {
            groups.push({
                zoneId,
                zoneKey,
                condition,
                skillNames,
                minResonance,
                allowedSlots,
                effects: [effect],
            })
        }
    }
    if (!groups.length) return []

    // 同乘区出现多次（如「命火」的劫魄 / 踏罡两段）时给后来者加消歧后缀
    const zoneUseCount = new Map<string, number>()
    for (const group of groups) {
        zoneUseCount.set(
            group.zoneId,
            (zoneUseCount.get(group.zoneId) ?? 0) + 1,
        )
    }
    const seenZone = new Map<string, number>()
    const discriminators = groups.map((group) => {
        const nth = seenZone.get(group.zoneId) ?? 0
        seenZone.set(group.zoneId, nth + 1)
        if ((zoneUseCount.get(group.zoneId) ?? 0) <= 1) return ""
        return discriminatorOf(group.skillNames, nth)
    })

    const baseName = optionalString(buff.name) ?? id
    // 作用范围 = 队伍级/角色级 − 来源站位（excludeSource）− 各成员自己取消的勾选
    const narrowed = narrowScope(
        applyExcludeSource(scopeOf(ownerIndex), buff),
        id,
        excludedBy,
    )
    // 三个人都吃不到就别落表了（`scope: []` 在椰果里是「仅效应伤害」，不能拿来表达空集）
    if (!narrowed.length) return []
    // 归属门：参考本体 / 参考武器 / 参考某人的共鸣链，工具箱据此归档
    const ownerGate = ownerGateOf(buff, id, ownerIndex, rawEffects)
    /**
     * 每组的链阶门：效果自己的 `minResonance` 与 buff 名的链档取最大。
     * 工具箱的链条件只能挂 Buff 实例级，所以不同链档的效果要拆成不同实例
     * （同乘区、同条件、不同 minResonance 各自一条）。
     */
    const gateForGroup = (
        minResonance: number,
    ): CoconutBuffCondition | undefined => {
        if (ownerGate && "refinements" in ownerGate) return ownerGate
        const existing = ownerGate?.chains?.[0]
        const owner = existing?.charIdx ?? ownerIndex ?? 0
        const required = Math.max(
            0,
            minResonance,
            existing?.min ?? 0,
            chainLevelOf(buff, id),
        )
        if (required <= 0 && !existing) return undefined
        return { chains: [{ charIdx: owner, min: required }] }
    }
    const variants: BuffVariant[] = []

    groups.forEach((group, index) => {
        const slots = group.allowedSlots
            ? narrowed.filter((slot) => group.allowedSlots!.includes(slot))
            : narrowed
        if (!slots.length) return
        const groupScope: "all" | number[] = slots.length === TEAM_SIZE
            ? "all"
            : slots
        const groupGate = gateForGroup(group.minResonance)
        const label = ZONE_LABELS[group.zoneId] ?? group.zoneId
        const discriminator = discriminators[index]
        // **一律带乘区后缀**：一条 buff 只带一种乘区，名字里就得看得出是哪一种。
        // 上游常见「同名的两条不同乘区 buff」（如「冥途夜行之灯」的暴击率与热熔增伤），
        // 光看名字根本分不清谁是谁 —— 把乘区写进名字，拉表里一眼就能对上。
        const nameSuffix = `·${label}${
            discriminator ? `·${discriminator}` : ""
        }`
        const idSuffix = `·${group.zoneId}${
            discriminator ? `·${discriminator}` : ""
        }`

        const emit = (
            name: string,
            variantId: string,
            value: number,
            layer: number | null,
            minStacks: number,
            placeholder = false,
        ) => {
            const zone: CoconutBuffZone = {
                zoneId: group.zoneId,
                value: roundValue(value),
            }
            if (group.condition) zone.condition = group.condition
            variants.push({
                instance: {
                    id: variantId,
                    name,
                    zones: [zone],
                    scope: groupScope,
                    source: "builtin",
                    ...(groupGate ? { condition: groupGate } : {}),
                },
                sourceId: id,
                zoneId: group.zoneId,
                layer,
                minStacks,
                skillNames: group.skillNames,
                ...(placeholder ? { placeholder: true } : {}),
                ...(group.zoneKey === "convergence"
                    ? { convergence: true }
                    : {}),
            })
        }

        const hasStack = group.effects.some((effect) =>
            effect.valueMode !== "fixed"
        )
        let emitted = 0

        if (hasStack) {
            // 叠层段：轴上用到过的每个层数各一条，值 = 该层的累计值
            for (const layer of usedLayers) {
                const value = group.effects.reduce(
                    (sum, effect) => sum + cumulativeAt(effect, layer),
                    0,
                )
                if (!value) continue
                emit(
                    `${baseName}${nameSuffix} ${layer}层`,
                    `${id}${idSuffix}#L${layer}`,
                    value,
                    layer,
                    0,
                )
                emitted++
            }
            // 轴上完全没叠到层：保住这条 buff（按 0 层算），不参与勾选
            if (!emitted) {
                const value = group.effects.reduce(
                    (sum, effect) => sum + cumulativeAt(effect, 0),
                    0,
                )
                emit(
                    `${baseName}${nameSuffix}`,
                    `${id}${idSuffix}`,
                    value,
                    null,
                    0,
                    true,
                )
            }
            return
        }

        // 纯固定段：不拆层，`minStacks` 不同的分开发（各自有各自的生效门槛）。
        // 只有真的分了多个门槛才在名字上标出来，免得给普通 buff 加没用的后缀。
        const byMinStacks = new Map<number, number>()
        for (const effect of group.effects) {
            // 叠层 Buff 的「纯固定」效果也要求至少 1 层：W 的
            // `getCompositeEffectValue()` 在 stacks <= 0 时一律返回 0。
            // 忽略它会把这个技能上明确 0 层的固定效果照样算进去（露帕追猎）。
            const minStacks = Math.max(
                toInt(effect.minStacks, 0),
                buff.mode === "stack" ? 1 : 0,
            )
            byMinStacks.set(
                minStacks,
                (byMinStacks.get(minStacks) ?? 0) + (Number(effect.value) || 0),
            )
        }
        const gated = byMinStacks.size > 1
        for (const [minStacks, value] of byMinStacks) {
            const gate = gated && minStacks > 0 ? ` ≥${minStacks}层` : ""
            emit(
                `${baseName}${nameSuffix}${gate}`,
                `${id}${idSuffix}${
                    gated && minStacks > 0 ? `#S${minStacks}` : ""
                }`,
                value,
                null,
                minStacks,
            )
        }
    })

    return variants
}

export interface CalculationResult {
    phase: CoconutPhaseState<CoconutCalcState>
    /** 拉表页 Buff 实例列表，落在 `project.buffs` 上 */
    buffs: CoconutBuffInstance[]
}

/** 该 buff 的作用范围是否覆盖这条伤害的角色 */
const scopeCovers = (
    scope: "all" | number[],
    entry: CoconutDamageEntry,
    members: WuwaCalcMember[],
): boolean => {
    if (scope === "all") return true
    const slot = members.findIndex((m) =>
        optionalString(m?.name) === entry.character
    )
    return slot >= 0 && scope.includes(slot)
}

/**
 * 该 buff 对这条伤害是否**真的生效**（决定拉表页那一格勾不勾）。
 *
 * 复刻工具箱 `evaluateCondition` 的口径：乘区只要有**任意一条**的条件命中就算生效。
 * 不这么做的话，带属性/类型条件的 buff 会被勾到所有条目上，看起来「无条件全勾」，
 * 但实际只有命中的那几条会贡献数值。
 */
const buffApplies = (
    instance: CoconutBuffInstance,
    entry: CoconutDamageEntry,
): boolean => {
    if (!instance.zones.length) return false
    const damageTypes = inferEntryDamageTypes(entry)
    return instance.zones.some((zone) => {
        const cond = zone.condition
        if (!cond) return true
        if (cond.elements?.length) {
            // 元素推不出来时**从宽勾上**：工具箱会用它自己的角色元素表补 `element`，
            // 条件很可能成立；漏勾会让这条 buff 静默失效（数值算少），比多勾危险得多
            if (!entry.damageElement) return true
            if (!cond.elements.includes(entry.damageElement)) return false
        }
        if (
            cond.damageTypes?.length &&
            !cond.damageTypes.some((type) => damageTypes.includes(type))
        ) {
            return false
        }
        return true
    })
}

const EMPTY_CALC: CoconutCalcState = {
    buffSets: [],
    damageEntryBuffSetIds: {},
    damageEntryDamageTypes: {},
}

export const convertCalculationPhase = (
    payload: WuwaCalcProjectPayload | null | undefined,
    entries: CoconutDamageEntry[] = [],
    entryState: Map<string, SkillState> = new Map(),
    tables: ProjectTables = EMPTY_TABLES,
): CalculationResult => {
    const members = payload?.members ?? []
    const resonances = members.map((m) => toInt(m?.resonanceUnlocked, 0))

    // 当前选中态：是否生效。层数不走这里 —— 逐技能的层数由排轴阶段解析好，
    // 落在 `entryState[].stacks` 上（上游 `getCatalogResolvedStacks` 的口径）。
    const activeById = globalBuffActiveOf(payload)

    const buffs: CoconutBuffInstance[] = []
    const convergenceVariants: BuffVariant[] = []
    const damageEntryBuffSetIds: Record<string, string[]> = {}
    const buffIds = new Set<string>()

    /** 逐条目的解析层数：上游 `getCatalogResolvedStacks` 的口径，缺省 0 */
    const layerOf = (state: SkillState | undefined, id: string): number => {
        for (const key of stateKeysOf(id)) {
            const n = state?.stacks[key]
            if (n !== undefined) return toInt(n, 0)
        }
        return 0
    }

    /** 该 buff 在轴上**用到过**的层数（升序、只留 > 0） */
    const usedLayersOf = (id: string): number[] => {
        const values = new Set<number>()
        for (const state of entryState.values()) {
            const n = layerOf(state, id)
            if (n > 0) values.add(n)
        }
        return [...values].sort((a, b) => a - b)
    }

    // 「分配覆盖」：每个角色可以取消勾选某条全队 buff
    const excludedBy = excludedTeamBuffLookup(members)

    for (const { buff, ownerIndex } of collectBuffs(payload, tables)) {
        const id = optionalString(buff.id)
        // 上游把队伍级 buff 复制进了每个角色的 buff 列表（`tm_` 前缀），必须按 id 去重，
        // 否则产物里会出现重复 id，工具箱的 buff 弹窗按 id 做 key 会直接崩（each_key_duplicate）
        if (id && buffIds.has(id)) continue

        const usedLayers = id ? usedLayersOf(id) : []
        const variants = toBuffVariants(
            buff,
            ownerIndex,
            resonances,
            usedLayers,
            excludedBy,
            members,
        )
        if (!variants.length) continue
        if (id) buffIds.add(id)
        for (const variant of variants) {
            buffs.push(variant.instance)
            if (variant.convergence) convergenceVariants.push(variant)
        }

        for (const variant of variants) {
            // 占位条目只为了留在 buff 列表里，不参与勾选
            if (variant.placeholder) continue
            const targets = entries.filter((entry) => {
                // 逐技能的选中态优先（`skill.buffActive`），该技能没记录时回落到角色 / 队伍级；
                // 两级都要两种 id 形态都试
                const state = entryState.get(entry.id)
                const keys = stateKeysOf(variant.sourceId)
                const active = keys.map((key) =>
                    state?.active[key]
                ).find((v) => v !== undefined) ?? keys.map((key) =>
                    activeById.get(key)
                ).find((v) =>
                    v !== undefined
                )
                if (active === false) return false

                // 层数门槛：按层绑的变体要求**恰好**该层（值就是这一层的累计值）；
                // 纯固定段按 `minStacks`（≥N 层才生效）
                const layer = layerOf(state, variant.sourceId)
                if (
                    variant.layer !== null && layer !== variant.layer
                ) return false
                if (variant.minStacks > 0 && layer < variant.minStacks) {
                    return false
                }

                // 追加倍率（上游 `multAdd`）是**技能级**的一次性追加，而工具箱按
                // `extraRatio / 100 × hits` 逐命中加算 —— 绑到技能本体上就会被
                // 乘 `hits` 倍。所以只认排轴阶段为它建的「（额外）」条目：
                // 那个条目 `hits = 1` 且倍率≈0，正好「每个技能加一次」。
                // 同一条 buff 可能有多条效果（命火：劫魄 / 踏罡），用技能名键区分。
                if (variant.zoneId === EXTRA_RATIO_ZONE_ID) {
                    const wanted = skillNamesKey(variant.skillNames)
                    return (entry.extraRatioKeys ?? []).some((key) =>
                        key.buffId === variant.sourceId &&
                        key.layer === variant.layer &&
                        key.skillNamesKey === wanted
                    )
                }

                if (variant.skillNames.length > 0) {
                    // 条目显示名是**短名**（`谱曲终末`），上游 buff 里写的是技能库全名
                    // （`生与死的乐章·谱曲终末`），所以拿条目认的**全部名字**去比
                    const accepted = new Set([
                        entry.hitName,
                        entry.displayName,
                        ...(entry.skillNames ?? []),
                    ])
                    return variant.skillNames.some((name) => accepted.has(name))
                }
                if (!scopeCovers(variant.instance.scope, entry, members)) {
                    return false
                }
                // 鸣算屋的特殊技能（效应）有**独立的 Buff 同步口径**：只有明确标成
                // 「效应」的加深才会进特殊技能，全伤害加深不会。工具箱的效应伤害却和直伤
                // 共用 `deepenDmg` 乘区，所以这里把「没有效应限定」的加深 Buff 从效应条目上摘掉，
                // 避免把角色的全伤害加深错算进效应（详见 docs/convert-phase-mapping.md）。
                if (
                    entry.isEffect &&
                    variant.instance.zones.every((zone) =>
                        zone.zoneId === "deepenDmg"
                    ) &&
                    !variant.instance.zones.some((zone) =>
                        zone.condition?.damageTypes?.includes("效应伤害")
                    )
                ) {
                    return false
                }
                // 特殊技能（效应）只同步「穿防(pen)」，不会同步「无视防御(ignore)」；
                // 工具箱的 ignore 落成 defDown，若不摘掉会给效应多算 18% 穿防（SCJ322 +8%）。
                if (
                    entry.isEffect &&
                    variant.instance.zones.every((zone) =>
                        zone.zoneId === "defDown"
                    )
                ) {
                    return false
                }
                return buffApplies(variant.instance, entry)
            })
            for (const entry of targets) {
                damageEntryBuffSetIds[entry.id] = [
                    ...(damageEntryBuffSetIds[entry.id] ?? []),
                    variant.instance.id,
                ]
            }
        }
    }

    // 面板加成也 buff 化：工具箱只算「角色基础 + 配置阶段的声骸主副词条 + 敌怪」，
    // 角色固有（阳变阴合）、共鸣链分支、声骸套装 2 件这些它算不出来，只能由 Buff 贡献。
    for (const panel of collectPanelBuffs(members, tables.characterElements)) {
        const instance: CoconutBuffInstance = {
            id: panel.id,
            name: panel.name,
            zones: [{
                zoneId: panel.zoneId,
                value: roundValue(panel.value),
                ...(panel.condition ? { condition: panel.condition } : {}),
            }],
            // 面板加成只作用于该角色自己的伤害
            scope: [panel.memberIndex],
            source: "builtin",
        }
        buffs.push(instance)
        for (const entry of entries) {
            if (!scopeCovers(instance.scope, entry, members)) continue
            if (!buffApplies(instance, entry)) continue
            damageEntryBuffSetIds[entry.id] = [
                ...(damageEntryBuffSetIds[entry.id] ?? []),
                instance.id,
            ]
        }
    }

    // 集谐·最终伤害 = stacks × convergenceVuln × 受益角色谐度破坏增幅（W 的口径）。
    // 按受益角色拆成独立 Buff；增幅 = 面板本体属性 + 该角色吃到的谐度破坏增幅 Buff。
    if (convergenceVariants.length) {
        const ampByMember = members.slice(0, TEAM_SIZE).map((member) => {
            let amp = 0
            const sources = (member?.char as {
                harmonyBreakAmpSources?: { value?: unknown }[]
            } | undefined)?.harmonyBreakAmpSources ?? []
            for (const source of sources) {
                const value = Number(source?.value)
                if (Number.isFinite(value)) amp += value
            }
            return amp
        })
        for (const buff of buffs) {
            const tune = buff.zones
                .filter((zone) => zone.zoneId === "tuneBreakBoost")
                .reduce((sum, zone) => sum + zone.value, 0)
            if (!tune) continue
            for (let i = 0; i < ampByMember.length; i++) {
                if (buff.scope === "all" || buff.scope.includes(i)) {
                    ampByMember[i] += tune
                }
            }
        }
        const convergenceIds = new Set(
            convergenceVariants.map((variant) => variant.instance.id),
        )
        const boundEntries = new Map<string, string[]>()
        for (const [entryId, ids] of Object.entries(damageEntryBuffSetIds)) {
            for (const id of ids) {
                if (!convergenceIds.has(id)) continue
                const list = boundEntries.get(id) ?? []
                list.push(entryId)
                boundEntries.set(id, list)
            }
        }
        for (const entryId of Object.keys(damageEntryBuffSetIds)) {
            damageEntryBuffSetIds[entryId] = damageEntryBuffSetIds[entryId]
                .filter((id) => !convergenceIds.has(id))
        }
        const kept = buffs.filter((buff) => !convergenceIds.has(buff.id))
        buffs.length = 0
        buffs.push(...kept)
        for (const variant of convergenceVariants) {
            const base = variant.instance
            const zone = base.zones[0]
            if (!zone) continue
            const entryIds = boundEntries.get(base.id) ?? []
            for (let i = 0; i < ampByMember.length; i++) {
                const memberName = optionalString(members[i]?.name) ?? ""
                const memberEntryIds = entryIds.filter((entryId) =>
                    entries.some((entry) =>
                        entry.id === entryId && entry.character === memberName
                    )
                )
                if (!ampByMember[i] || !memberEntryIds.length) continue
                const clone: CoconutBuffInstance = {
                    ...base,
                    id: `${base.id}·m${i}`,
                    name: `${base.name}·${memberName}`,
                    scope: [i],
                    zones: [{
                        ...zone,
                        value: roundValue(zone.value * ampByMember[i] / 100),
                    }],
                }
                buffs.push(clone)
                for (const entryId of memberEntryIds) {
                    damageEntryBuffSetIds[entryId] = [
                        ...(damageEntryBuffSetIds[entryId] ?? []),
                        clone.id,
                    ]
                }
            }
        }
    }

    // 效应「覆盖倍率 / 双暴」按工具箱架构用 Buff 表达：
    // - 倍率：通用表值 T，目标 B，则额外倍率 Buff 写 (B - T) × 100，
    //   引擎 baseValue = 3674 × (T + extraRatio/100) × hits；
    // - 双暴：覆盖型 critRate / critDmg Buff（系数基类只认覆盖）。
    for (const entry of entries) {
        if (!entry.isEffect) continue
        const slot = members.findIndex((member) =>
            optionalString(member?.name) === entry.character
        )
        const scope: "all" | number[] = slot >= 0 ? [slot] : "all"
        const delta = entry.effectBaseMult !== undefined
            ? (entry.effectBaseMult -
                getEffectMultiplier(entry.hitName, entry.ratioValue ?? 0)) * 100
            : 0
        if (Number.isFinite(delta) && Math.abs(delta) > 1e-9) {
            const buff: CoconutBuffInstance = {
                id: `effect_base:${entry.id}`,
                name: `${entry.displayName}·效应倍率覆盖`,
                zones: [{ zoneId: "extraRatio", value: roundValue(delta) }],
                scope,
                source: "builtin",
            }
            buffs.push(buff)
            damageEntryBuffSetIds[entry.id] = [
                ...(damageEntryBuffSetIds[entry.id] ?? []),
                buff.id,
            ]
        }
        if (
            entry.effectCritRate !== undefined ||
            entry.effectCritDmg !== undefined
        ) {
            const buff: CoconutBuffInstance = {
                id: `effect_crit:${entry.id}`,
                name: `${entry.displayName}·效应双暴覆盖`,
                zones: [
                    {
                        zoneId: "critRate",
                        value: roundValue(entry.effectCritRate ?? 0),
                        override: true,
                    },
                    {
                        zoneId: "critDmg",
                        value: roundValue(entry.effectCritDmg ?? 0),
                        override: true,
                    },
                ],
                scope,
                source: "builtin",
            }
            buffs.push(buff)
            damageEntryBuffSetIds[entry.id] = [
                ...(damageEntryBuffSetIds[entry.id] ?? []),
                buff.id,
            ]
        }
    }

    // 伤害类型：**上游给了就显式落下来**。工具箱的 `resolveDamageTypes()` 是先看这张表、
    // 再看自己推断，而它推断不出鸣算屋的技能名；不写就等于把上游的类型信息丢掉，
    // 拉表页的类型列会空/错，带类型条件的乘区也跟着失效。
    // 上游没给类型的条目**不写**：留给工具箱按规则 1~4 自己推断（含依赖角色文案的规则 2），
    // 我们硬写一个「其它类型伤害」反而会把它挡掉。
    const damageEntryDamageTypes: Record<string, string[]> = {}
    for (const entry of entries) {
        const type = upstreamDamageType(entry)
        const also = alsoDamageTypesOf(entry)
        if (type) {
            damageEntryDamageTypes[entry.id] = [
                type,
                ...also.filter((item) => item !== type),
            ]
        } else if (also.length) {
            damageEntryDamageTypes[entry.id] = also
        }
    }

    if (
        !buffs.length && !Object.keys(damageEntryBuffSetIds).length &&
        !Object.keys(damageEntryDamageTypes).length
    ) {
        return { phase: { locked: true, data: EMPTY_CALC }, buffs: [] }
    }

    return {
        phase: {
            locked: true,
            data: {
                buffSets: buffs,
                damageEntryBuffSetIds,
                damageEntryDamageTypes,
            },
        },
        buffs,
    }
}
