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
import { collectPanelBuffs } from "./panel.ts"
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
    // 倍率**追加**：「每层/每点增加倍率 N%」——把倍率数值本身加上去。
    // 工具箱 `extraRatio` 正是这个语义（`compute.ts`：`effectiveRatio = ratio + extraRatio/100`）。
    multAdd: "extraRatio",
    // 倍率**提升**：「××伤害倍率提升 N%」——把这段伤害乘 (1 + N%)。
    // 两者不是一回事：追加是往倍率数值上加（技能倍率越高越吃亏），提升是乘在整段伤害上。
    // 工具箱里「倍率提升」对应**特殊终伤(1)**（`compute.ts`：`customMult = 1 + specialFinal1/100`，
    // 同乘区加算、再乘进总伤害），这也是工具箱自己的命名口径
    // （`ai/generate/prompts.config.ts`：普通相加语义的终伤/倍率用 specialFinal1）。
    multBoost: "specialFinal1",
    // 同上（数据里尚未出现，按「提升」语义兜住，别让它被静默丢掉）
    multBoostExtra: "specialFinal1",
    // 偏谐
    offsetHarmonyEff: "offTuneBuildupRate",
    // 按伤害类型的双暴（「召鬼呼星·承天」的重击暴击率）→ 带上类型条件
    typeCritRate: "critRate",
    typeCritDmg: "critDmg",
    // 谐度破坏增幅 / 共鸣效率 / 最终伤害（单乘区 buff 的 category 也会落到这里）
    harmonyBreakAmp: "tuneBreakBoost",
    energyRegenPct: "recharge",
    extraVulnerability: "finalDmg",
}

/** 椰果乘区 id → 中文名，拆分 buff 时用来给变体起名（取工具箱 `ZONE_DEFS` 的叫法，略作精简） */
const ZONE_LABELS: Record<string, string> = {
    atkPct: "攻击",
    hpPct: "生命",
    defPct: "防御",
    critRate: "暴击率",
    critDmg: "暴击伤害",
    bonusDmg: "增伤",
    deepenDmg: "加深",
    dmgTakenInc: "易伤",
    finalDmg: "最终伤害",
    resDown: "减抗",
    defPen: "穿防",
    extraRatio: "额外倍率",
    specialFinal1: "特殊终伤(1)",
    offTuneBuildupRate: "偏谐累积",
    tuneBreakBoost: "谐度破坏增幅",
    recharge: "共鸣效率",
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
    typeCritRate: "damageType",
    typeCritDmg: "damageType",
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

/** 上游 `damageType` 对应的工具箱伤害类型全名；没给或认不出来时返回 `null` */
const upstreamDamageType = (entry: CoconutDamageEntry): string | null =>
    DAMAGE_TYPE_LABELS[optionalString(entry.damageType) ?? ""] ?? null

/**
 * 条目最终生效的伤害类型（工具箱 `resolveDamageTypes()` 的口径）。
 *
 * **上游写了 `damageType` 就以它为准**：工具箱的显式配置优先于一切推断，
 * 而推断规则靠技能名与角色文案，鸣算屋的技能名（技能库全名，如
 * `济善伐恶·普攻·苍剑式第一段`）对不上 `普攻·` 这类前缀，常态攻击里的重击招式
 * 也会被推成普攻 —— 类型一旦错，带类型条件的乘区就整体失效。
 * 上游没写时才退回复刻的工具箱规则 1 / 3 / 4（规则 2 依赖角色文案，复刻不了）。
 */
export const inferEntryDamageTypes = (entry: CoconutDamageEntry): string[] => {
    const upstream = upstreamDamageType(entry)
    if (upstream) return [upstream]
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
 */
const excludedTeamBuffLookup = (
    members: WuwaCalcMember[],
): (memberIndex: number, buffId: string) => boolean => {
    const byMember = members.map((member) => {
        const set = new Set<string>()
        for (
            const list of [
                member?.excludedTeamBuffIds,
                member?.manuallyExcludedTeamBuffIds,
            ]
        ) {
            for (const raw of list ?? []) {
                const id = optionalString(raw)
                if (id) set.add(id)
            }
        }
        return set
    })
    return (memberIndex, buffId) => {
        const set = byMember[memberIndex]
        if (!set?.size) return false
        // 两种 id 形态都试：上游有时写原始 id，有时写成员副本的 `tm_` id
        return stateKeysOf(buffId).some((key) => set.has(key))
    }
}

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

/**
 * 第 n 层的每层值：取第一条覆盖 n 的 segment 的 `perStack`。
 *
 * `segments` 是**分段**的每层值，`upTo` 是该段的层数上限：
 * 例「每拥有1层暴击伤害 +2.5%（至多24层），溢出后每层 +1%（至多100层）」
 * = `[{upTo:24, perStack:2.5}, {upTo:124, perStack:1}]`。
 *
 * 超出最后一段 `upTo` 的层数**不再提供每层值**（返回 0）——不能沿用最后一段，
 * 否则「每层余响使倍率额外增加（至多24层）」这类效果会一直涨到满层：
 * 余响 124 层时会被算成 `124 × 82.55`，正确值是 `24 × 82.55`。
 */
const perStackAt = (
    segments: UpstreamSegment[] | null | undefined,
    n: number,
): number => {
    const list = (segments ?? []).filter((s) =>
        Number.isFinite(Number(s?.perStack))
    )
    if (!list.length) return 0
    const hit = list.find((seg) =>
        seg.upTo === null || seg.upTo === undefined || n <= Number(seg.upTo)
    )
    if (!hit) return 0
    return Number(hit?.perStack) || 0
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
}

/**
 * 该效果在 `layer` 层上的**累计**贡献。
 *
 * 上游自己的口径就是累计（`docs` 1.3）：`value = Σ_{s=1..stacks} perStackOf(s)`。
 * 椰果一条 buff 只能写一个数，「祸兮福兮 50层」要的就是 50 层的累计值（2.5 × 50 = 125）。
 */
const cumulativeAt = (effect: UpstreamEffect, layer: number): number => {
    if (layer < toInt(effect.minStacks, 0)) return 0
    if (effect.valueMode === "fixed") return Number(effect.value) || 0
    let total = 0
    for (let n = 1; n <= layer; n++) total += perStackAt(effect.segments, n)
    return total
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

    // 共鸣链没到就不计入（静态门槛，先筛掉）
    const effects = rawEffects.filter((effect) =>
        resonance >= toInt(effect.minResonance, 0)
    )

    // 集谐模态只有 convergenceVuln 一个数值，单独成一条易伤乘区
    if (buff.category === "convergence") {
        const value = Number(buff.convergenceVuln) * 100
        if (value) {
            effects.push({
                zone: "convergence",
                valueMode: "fixed",
                value,
                skillScope: "all",
            })
        }
    }

    interface ZoneGroup {
        zoneId: string
        zoneKey: string
        condition?: CoconutBuffCondition
        skillNames: string[]
        effects: UpstreamEffect[]
    }

    /** 同乘区 + 同条件 + 同技能限定 → 一条椰果 buff */
    const groups: ZoneGroup[] = []
    for (const effect of effects) {
        const zoneKey = optionalString(effect.zone) ?? ""
        const zoneId = ZONE_MAP[zoneKey]
        if (!zoneId) continue
        const condition = conditionOf(effect)
        const skillNames = skillNamesOf(effect).sort()
        const hit = groups.find((group) =>
            group.zoneId === zoneId &&
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
    const scope: "all" | number[] = narrowed.length === TEAM_SIZE
        ? "all"
        : narrowed
    // 归属门：参考本体 / 参考武器 / 参考某人的共鸣链，工具箱据此归档
    const ownerGate = ownerGateOf(buff, id, ownerIndex, rawEffects)
    const variants: BuffVariant[] = []

    groups.forEach((group, index) => {
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
                    scope,
                    source: "builtin",
                    ...(ownerGate ? { condition: ownerGate } : {}),
                },
                sourceId: id,
                layer,
                minStacks,
                skillNames: group.skillNames,
                ...(placeholder ? { placeholder: true } : {}),
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
            const minStacks = toInt(effect.minStacks, 0)
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
): CalculationResult => {
    const members = payload?.members ?? []
    const resonances = members.map((m) => toInt(m?.resonanceUnlocked, 0))

    // 当前选中态：是否生效。层数不走这里 —— 逐技能的层数由排轴阶段解析好，
    // 落在 `entryState[].stacks` 上（上游 `getCatalogResolvedStacks` 的口径）。
    const activeById = new Map<string, boolean>()
    const shared = payload?.team?.sharedBuffs as
        | { globalBuffActive?: Record<string, boolean> }
        | undefined
    for (const [id, value] of Object.entries(shared?.globalBuffActive ?? {})) {
        activeById.set(id, !!value)
    }
    for (const member of members) {
        for (
            const [id, value] of Object.entries(member.globalBuffActive ?? {})
        ) {
            if (!activeById.has(id)) activeById.set(id, !!value)
        }
    }

    const buffs: CoconutBuffInstance[] = []
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

    for (const { buff, ownerIndex } of collectBuffs(payload)) {
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
        )
        if (!variants.length) continue
        if (id) buffIds.add(id)
        for (const variant of variants) buffs.push(variant.instance)

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

                if (variant.skillNames.length > 0) {
                    // 条目显示名是**短名**（`谱曲终末·2段`），上游 buff 里写的是技能库全名
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
    for (const panel of collectPanelBuffs(members)) {
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

    // 伤害类型：**上游给了就显式落下来**。工具箱的 `resolveDamageTypes()` 是先看这张表、
    // 再看自己推断，而它推断不出鸣算屋的技能名；不写就等于把上游的类型信息丢掉，
    // 拉表页的类型列会空/错，带类型条件的乘区也跟着失效。
    // 上游没给类型的条目**不写**：留给工具箱按规则 1~4 自己推断（含依赖角色文案的规则 2），
    // 我们硬写一个「其它类型伤害」反而会把它挡掉。
    const damageEntryDamageTypes: Record<string, string[]> = {}
    for (const entry of entries) {
        const type = upstreamDamageType(entry)
        if (type) damageEntryDamageTypes[entry.id] = [type]
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
