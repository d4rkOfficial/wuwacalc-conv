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

// ── 乘区对照 ──────────────────────────────────────────────────────────────────

/** 上游 zone / category → 椰果 `ZoneId`（`docs` 1.2 草表） */
const ZONE_MAP: Record<string, string> = {
    // 基本面板
    generalAttack: "atkPct",
    generalDefPct: "defPct",
    // 双暴
    generalCritRate: "critRate",
    critRateSet: "critRate",
    generalCritDmg: "critDmg",
    // 增伤区
    generalBonus: "bonusDmg",
    elementBonus: "bonusDmg",
    typeBonus: "bonusDmg",
    // 加深区
    generalDeep: "deepenDmg",
    elementDeep: "deepenDmg",
    typeDeep: "deepenDmg",
    // 易伤区（集谐共用现有易伤计算）
    generalVulnerability: "dmgTakenInc",
    typeVulnerability: "dmgTakenInc",
    convergence: "dmgTakenInc",
    // 减抗
    elementResReduce: "resDown",
    // 无视防御（实测样例都带 defenseKind: 'ignore'）
    generalDefense: "defPen",
    elementDefense: "defPen",
    typeDefense: "defPen",
    // 倍率追加 / 提升
    multAdd: "extraRatio",
    multBoost: "extraRatio",
    multBoostExtra: "extraRatio",
    // 偏谐
    offsetHarmonyEff: "offTuneBuildupRate",
}

/** 需要按元素 / 伤害类型挂条件的乘区 */
const CONDITIONAL_ZONES: Record<string, "element" | "damageType"> = {
    elementBonus: "element",
    elementDeep: "element",
    elementResReduce: "element",
    elementDefense: "element",
    typeBonus: "damageType",
    typeDeep: "damageType",
    typeVulnerability: "damageType",
    typeDefense: "damageType",
}

/**
 * 鸣算屋 `damageType` → 椰果伤害类型**全名**。
 *
 * 工具箱的 `evaluateCondition` 拿条件里的 `damageTypes` 去比对
 * `inferDamageTypes()` 的返回值，而那些值是 `普攻伤害` / `效应伤害` 这种**带「伤害」后缀的全名**；
 * 直接塞短名（`普攻`）会永远匹配不上，条件乘区会被静默判定为不生效。
 */
const DAMAGE_TYPE_LABELS: Record<string, string> = {
    普攻: "普攻伤害",
    重击: "重击伤害",
    共鸣技能: "共鸣技能伤害",
    共鸣解放: "共鸣解放伤害",
    声骸: "声骸技能伤害",
    变奏: "变奏技能伤害",
    延奏: "延奏技能伤害",
    协同: "协同攻击伤害",
    效应: "效应伤害",
    其它: "其它类型伤害",
}

/** 复刻工具箱 `NAME_PREFIX_TYPES`（`skill-infer.ts`），顺序敏感，取第一个命中的 */
const NAME_PREFIX_TYPES: [string, string][] = [
    ["普攻·", "普攻伤害"],
    ["重击·", "重击伤害"],
    ["空中攻击", "普攻伤害"],
    ["闪避反击", "普攻伤害"],
    ["共鸣技能·", "共鸣技能伤害"],
    ["共鸣解放·", "共鸣解放伤害"],
    ["变奏技能·", "变奏技能伤害"],
    ["延奏技能·", "延奏技能伤害"],
]

/**
 * 复刻工具箱 `inferDamageTypes()` 的规则 1 / 3 / 4，用来判断带伤害类型条件的乘区是否命中该条目。
 *
 * 规则 2（角色技能富文本里的「视为 XX 伤害」）依赖上游角色文案，这里复刻不了 ——
 * 那条规则只会让类型更精确，不影响「条件明显不匹配时不勾选」这个判断。
 */
export const inferEntryDamageTypes = (entry: CoconutDamageEntry): string[] => {
    if (entry.isEffect) return ["效应伤害"]
    for (const [prefix, type] of NAME_PREFIX_TYPES) {
        if (entry.hitName.includes(prefix)) return [type]
    }
    switch (entry.skillType) {
        case "常态攻击":
            return entry.hitName.includes("重击") ? ["重击伤害"] : ["普攻伤害"]
        case "共鸣技能":
            return ["共鸣技能伤害"]
        case "共鸣解放":
            return ["共鸣解放伤害"]
        case "声骸技能":
            return ["声骸技能伤害"]
        case "变奏技能":
            return ["变奏技能伤害"]
        case "延奏技能":
            return ["延奏技能伤害"]
        default:
            return ["其它类型伤害"]
    }
}

// ── 上游结构（仅本模块用到） ──────────────────────────────────────────────────

interface UpstreamSegment {
    upTo?: number | null
    perStack?: number
}

interface UpstreamEffect {
    zone?: string
    valueMode?: string
    value?: number
    perStack?: number
    segments?: UpstreamSegment[] | null
    element?: string
    damageType?: string
    defenseKind?: string
    minStacks?: number
    minResonance?: number
    maxStacks?: number
    skillScope?: string
    skillNames?: string[] | null
    librarySkillNames?: string[] | null
}

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

// ── 主流程 ────────────────────────────────────────────────────────────────────

/**
 * 上游队伍级 buff 的两个 id 形态：`team.sharedBuffs.buffs` 里是**原始 id**
 * （`globalBuffActive` / `globalBuffStacks` 也用原始 id），而成员 `buffs` 里的副本
 * 带 `tm_` 前缀（排轴上的逐技能状态用的就是这个前缀）。查状态时两种都要试。
 */
const TEAM_COPY_PREFIX = "tm_"
const stateKeysOf = (id: string): string[] =>
    id.startsWith(TEAM_COPY_PREFIX)
        ? [id, id.slice(TEAM_COPY_PREFIX.length)]
        : [id, TEAM_COPY_PREFIX + id]

const collectBuffs = (
    payload: WuwaCalcProjectPayload | null | undefined,
): { buff: UpstreamBuff; ownerIndex: number | null }[] => {
    const members = payload?.members ?? []
    const result: { buff: UpstreamBuff; ownerIndex: number | null }[] = []

    const shared = payload?.team?.sharedBuffs as
        | { buffs?: UpstreamBuff[] }
        | undefined
    const sharedBuffs = shared?.buffs ?? []
    for (const buff of sharedBuffs) {
        result.push({ buff, ownerIndex: null })
    }

    // 成员列表里的 `tm_<原 id>` 是队伍级 buff 的**接收方副本**，和 `sharedBuffs` 里的
    // 原始条目描述的是同一批生效对象（原始条目还多带 `excludeSource` / `sourceMemberIndex`）。
    // 两边都收会**重复计入**（例如「苍白死光的祝颂」的固定段被算两次），
    // 所以以原始条目为准，丢掉成员副本；`sharedBuffs` 缺席时才退回用副本。
    const sharedIds = new Set(sharedBuffs.map((buff) => buff.id))

    members.slice(0, TEAM_SIZE).forEach((member: WuwaCalcMember, index) => {
        for (const buff of (member.buffs ?? []) as UpstreamBuff[]) {
            const id = buff.id
            if (
                typeof id === "string" && id.startsWith(TEAM_COPY_PREFIX) &&
                sharedIds.has(id.slice(TEAM_COPY_PREFIX.length))
            ) {
                continue
            }
            result.push({ buff, ownerIndex: index })
        }
    })
    return result
}

/** 一条拆层后的 buff：椰子没有叠层，叠层 buff 会拆成「一层一条」 */
interface BuffLayer {
    instance: CoconutBuffInstance
    /** 上游 buff id，用来查逐技能的选中态 */
    sourceId: string
    /** 层号，从 1 开始；`0` 表示固定效果（不拆层、不设层数门槛） */
    layer: number
    /** 总层数；0 表示固定效果，1 表示不拆层 */
    layerCount: number
}

/** 第 n 层的每层值：取第一条覆盖 n 的 segment 的 perStack */
const perStackAt = (
    segments: UpstreamSegment[] | null | undefined,
    n: number,
): number => {
    const list = (segments ?? []).filter((s) =>
        Number.isFinite(Number(s?.perStack))
    )
    if (!list.length) return 0
    const hit =
        list.find((seg) =>
            seg.upTo === null || seg.upTo === undefined || n <= Number(seg.upTo)
        ) ?? list[list.length - 1]
    return Number(hit?.perStack) || 0
}

/**
 * 把一条上游 buff 转成椰果实例。
 *
 * **叠层 buff 拆成「一层一条」**：椰果没有叠层模型，`zones[].value` 就是最终值。
 * 真实工程（工坊 `2CDs8kRG`）的作法是每条写「每层」的值（`暴击1层`/`暴击2层`…），
 * 再按该层在轴上的生效区间逐条勾选 —— 这样层数沿轴往上叠的语义就能表达出来。
 */
const toBuffLayers = (
    buff: UpstreamBuff,
    ownerIndex: number | null,
    resonances: number[],
    /**
     * 该 buff 在轴上**实际达到过的最大层数**（逐技能优先，回落到全局）。
     * 这是拆层数的**唯一依据**：`maxStacks` 只是上限，「祸兮福兮」上限 50 层但轴上 0 层，
     * 按上限拆会凭空多出 50 条空 buff。轴上完全没记录时兜底为 1 条。
     */
    observedStacks = 0,
): BuffLayer[] => {
    const id = optionalString(buff.id)
    if (!id) return []

    const resonance = ownerIndex === null ? 6 : resonances[ownerIndex] ?? 0

    // 单乘区 buff 视作只有一条效果
    const effects: UpstreamEffect[] = buff.category === "composite"
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

    // 只有存在叠层效果才拆层；纯固定值 buff 的 `maxStacks` 只是上限，不是层数。
    // 层数取**轴上实际达到过的最大层数**（真实工程也只写用到的那几层），
    // 而不是 `maxStacks` —— 否则「祸兮福兮」上限 50 层会凭空多出 50 条空 buff。
    const stackEffects = effects.filter((effect) =>
        effect.valueMode !== "fixed"
    )
    // 固定值部分单独成一条（`layer: 0`）：它和层数无关，只要 buff 生效就一直贡献；
    // 塞进「第 1 层」里的话，第 1 层的勾选条件会把它一起关掉
    const fixedEffects = effects.filter((effect) =>
        effect.valueMode === "fixed"
    )
    const stackLayerCount = stackEffects.length
        ? Math.max(1, observedStacks)
        : 0

    const baseName = optionalString(buff.name) ?? id
    const scope = applyExcludeSource(scopeOf(ownerIndex), buff)
    const layers: BuffLayer[] = []

    /** 取一批效果在某一层上的乘区；`layer: 0` 表示固定效果，不设层数门槛 */
    const zonesAt = (
        pool: UpstreamEffect[],
        layer: number,
    ): CoconutBuffZone[] => {
        const zones: CoconutBuffZone[] = []
        for (const effect of pool) {
            if (resonance < toInt(effect.minResonance, 0)) continue
            // 上游的 `minStacks` 语义是「≥N 层才计入」，未达标的层直接跳过
            if (layer > 0 && layer < toInt(effect.minStacks, 0)) continue

            const zoneId = ZONE_MAP[optionalString(effect.zone) ?? ""]
            if (!zoneId) continue
            const value = layer > 0
                ? perStackAt(effect.segments, layer)
                : Number(effect.value) || 0
            // 折算后为 0 也要保留：叠层 buff 当前 0 层时就是 0 贡献，
            // 但条目本身必须留在列表里，否则整条 buff 会凭空消失
            const zone: CoconutBuffZone = { zoneId, value: roundValue(value) }
            const condition = conditionOf(effect)
            if (condition) zone.condition = condition
            zones.push(zone)
        }
        return zones
    }

    const fixedZones = zonesAt(fixedEffects, 0)
    // 集谐模态只有 convergenceVuln 一个数值，不参与拆层，跟着固定部分走
    if (buff.category === "convergence") {
        const value = roundValue(Number(buff.convergenceVuln) * 100)
        if (value) fixedZones.push({ zoneId: "dmgTakenInc", value })
    }
    if (fixedZones.length) {
        layers.push({
            instance: {
                id,
                name: baseName,
                zones: fixedZones,
                scope,
                source: "builtin",
            },
            sourceId: id,
            layer: 0,
            layerCount: 0,
        })
    }

    // 叠层效果一层一条：第 n 层只绑到「该时点层数 ≥ n」的条目上
    // 有固定段兄弟时也带层号后缀，免得两条同名条目在列表里分不清
    const nameLayers = stackLayerCount > 1 || fixedZones.length > 0
    for (let layer = 1; layer <= stackLayerCount; layer++) {
        const zones = zonesAt(stackEffects, layer)
        if (!zones.length) continue
        layers.push({
            instance: {
                id: `${id}#L${layer}`,
                name: nameLayers ? `${baseName} ${layer}层` : baseName,
                zones,
                scope,
                source: "builtin",
            },
            sourceId: id,
            layer,
            layerCount: stackLayerCount,
        })
    }

    return layers
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
): CalculationResult => {
    const members = payload?.members ?? []
    const resonances = members.map((m) => toInt(m?.resonanceUnlocked, 0))

    // 当前选中态：叠层数 / 是否生效
    const stacksById = new Map<string, number>()
    const activeById = new Map<string, boolean>()
    const shared = payload?.team?.sharedBuffs as
        | {
            globalBuffActive?: Record<string, boolean>
            globalBuffStacks?: Record<string, number>
        }
        | undefined
    for (const [id, value] of Object.entries(shared?.globalBuffStacks ?? {})) {
        stacksById.set(id, toInt(value, 0))
    }
    for (const [id, value] of Object.entries(shared?.globalBuffActive ?? {})) {
        activeById.set(id, !!value)
    }
    for (const member of members) {
        for (
            const [id, value] of Object.entries(member.globalBuffStacks ?? {})
        ) {
            if (!stacksById.has(id)) stacksById.set(id, toInt(value, 0))
        }
        for (
            const [id, value] of Object.entries(member.globalBuffActive ?? {})
        ) {
            if (!activeById.has(id)) activeById.set(id, !!value)
        }
    }

    const buffs: CoconutBuffInstance[] = []
    const damageEntryBuffSetIds: Record<string, string[]> = {}
    const buffIds = new Set<string>()

    /** 该 buff 在轴上（逐技能）达到过的最大层数 */
    const maxObservedStacks = (id: string): number => {
        let max = 0
        const keys = stateKeysOf(id)
        for (const key of keys) max = Math.max(max, stacksById.get(key) ?? 0)
        for (const state of entryState.values()) {
            for (const key of keys) {
                const n = state.stacks[key]
                if (n !== undefined && n > max) max = n
            }
        }
        return max
    }

    /**
     * 沿轴逐条目的「该 buff 当前层数」。
     *
     * 上游只在**会改变层数**的技能上写 `buffStacks`，真正吃效果的技能常常只写
     * `buffActive: true`、层数留空（例如「锯环·终结」只被标记生效，52 层记在它前面的
     * 几段疾攻上）。这种条目如果按 0 层处理，整条 buff 一条都绑不上。
     * 所以：条目自己记了层数就用它，没记就用**轴上此前出现过的最大层数**兜底。
     */
    const stackCurve = (id: string): Map<string, number> => {
        const keys = stateKeysOf(id)
        const curve = new Map<string, number>()
        let running =
            keys.map((key) => stacksById.get(key)).find((v) =>
                v !== undefined
            ) ?? 0
        for (const entry of entries) {
            const state = entryState.get(entry.id)
            const own = keys.map((key) => state?.stacks[key]).find((v) =>
                v !== undefined
            )
            if (own !== undefined && own > running) running = own
            curve.set(entry.id, own ?? running)
        }
        return curve
    }

    for (const { buff, ownerIndex } of collectBuffs(payload)) {
        const id = optionalString(buff.id)
        // 上游把队伍级 buff 复制进了每个角色的 buff 列表（`tm_` 前缀），必须按 id 去重，
        // 否则产物里会出现重复 id，工具箱的 buff 弹窗按 id 做 key 会直接崩（each_key_duplicate）
        if (id && buffIds.has(id)) continue

        const observedStacks = id ? maxObservedStacks(id) : 0
        const layers = toBuffLayers(
            buff,
            ownerIndex,
            resonances,
            observedStacks,
        )
        if (!layers.length) continue
        if (id) buffIds.add(id)
        for (const layer of layers) buffs.push(layer.instance)

        // 技能限定：只绑名称匹配的伤害条目；其余按「范围 + 选中态 + 条件」判断
        const effects: UpstreamEffect[] = buff.category === "composite"
            ? buff.effects ?? []
            : []
        const limitedNames = new Set(effects.flatMap(skillNamesOf))
        const curve = id ? stackCurve(id) : new Map<string, number>()

        for (const layer of layers) {
            const targets = entries.filter((entry) => {
                // 逐技能的选中态优先（`skill.buffActive` / `skill.buffStacks`），
                // 该技能没记录时回落到角色 / 队伍级；两级都要两种 id 形态都试
                const state = entryState.get(entry.id)
                const keys = stateKeysOf(layer.sourceId)
                // 先逐技能、后全局；每一级里两种 id 形态都试
                const pick = <T>(
                    perSkill: (key: string) => T | undefined,
                    global: (key: string) => T | undefined,
                ): T | undefined =>
                    keys.map(perSkill).find((v) => v !== undefined) ??
                        keys.map(global).find((v) => v !== undefined)
                const active = pick(
                    (key) => state?.active[key],
                    (key) => activeById.get(key),
                )
                if (active === false) return false

                // 叠层实例：该条目在这个时点的层数必须达到本层；`layer: 0` 是固定效果，不设门槛
                if (layer.layer > 0) {
                    const stacks = curve.get(entry.id) ?? observedStacks
                    if (stacks < layer.layer) return false
                }

                if (limitedNames.size > 0) {
                    return (
                        limitedNames.has(entry.hitName) ||
                        limitedNames.has(entry.displayName)
                    )
                }
                if (!scopeCovers(layer.instance.scope, entry, members)) {
                    return false
                }
                return buffApplies(layer.instance, entry)
            })
            for (const entry of targets) {
                damageEntryBuffSetIds[entry.id] = [
                    ...(damageEntryBuffSetIds[entry.id] ?? []),
                    layer.instance.id,
                ]
            }
        }
    }

    if (!buffs.length && !Object.keys(damageEntryBuffSetIds).length) {
        return { phase: { locked: true, data: EMPTY_CALC }, buffs: [] }
    }

    return {
        phase: {
            locked: true,
            data: {
                buffSets: buffs,
                damageEntryBuffSetIds,
                damageEntryDamageTypes: {},
            },
        },
        buffs,
    }
}
