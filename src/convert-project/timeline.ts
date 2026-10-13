/**
 * 阶段二 · **排轴** → `phases.timeline`（工具箱 `TimelineData`）。
 *
 * 规则见 `docs/convert-phase-mapping.md` 第二节，要点：
 * - 轴条目 = `members[i].phases[].skills[]`（直伤）∪ `rotationCatalog` 里未被引用的条目
 *   ∪ `specialSkills.items[]`（非直伤），统一按时间排序；
 * - **时间**来自 `rotationCatalog[].axisOffsetPx`，实测 `40px = 1 秒`；
 * - **不生成 `opBlocks`**；每个伤害/效应各占一条参考线，**处决与响应共用同一条参考线**；
 * - `refLines[].pos` 不代表真实时间，只按真实秒数等比铺开表达先后与间距；
 * - `refLines[].time` 写相对上一参考线的增量，形如 `+25s`。
 */

import { optionalString, toInt } from "../utils.ts"
import {
    type CoconutDamageBlock,
    type CoconutDamageEntry,
    type CoconutNonDirectEntry,
    type CoconutPhaseState,
    type CoconutRefLine,
    type CoconutSkillHit,
    type CoconutTimelineData,
    TEAM_SIZE,
    type WuwaCalcAxisPhase,
    type WuwaCalcAxisSkill,
    type WuwaCalcMember,
    type WuwaCalcMultComponent,
    type WuwaCalcProjectPayload,
    type WuwaCalcRotationEntry,
    type WuwaCalcSpecialSkillItem,
} from "./types.ts"

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 上游轴的像素密度：实测 member0 最大 998px ↔ `axisDuration` 25s */
export const UPSTREAM_PX_PER_SECOND = 40

/**
 * 参考线**等距**排布，间距固定。
 *
 * 工具箱的 `pos` 不代表真实时间（早期遗留），所以不按真实秒数铺开；
 * 但整轴必须落在工具箱的 `MAX_POS`（`SIDE_PAD + MAX_TIME * PPS` = 10848）内，
 * 条数多时会等比收窄，保证一个工程内部仍然等距。
 */
export const REF_LINE_STEP = 120

/** 工具箱 `MAX_POS = SIDE_PAD + MAX_TIME * PPS` = 48 + 180 × 60 */
export const MAX_POS = 10848

/** 末尾追加的收尾参考线文案（与工具箱默认的 `right` 线一致） */
export const END_REF_LINE_LABEL = "结束"

/** 收尾参考线的固定 id */
export const END_REF_LINE_ID = "end"

/**
 * 伤害块固定挂在**最后一轨「伤害绑定」**上。
 *
 * 工具箱里 `getTRACKS() = [...角色名, '伤害绑定']`，而排轴的伤害叠层只渲染
 * `trackIndex === getTRACKS().length - 1` 的块（`timeline-damage-overlay.svelte`）——
 * 挂到角色轨上等于不可见。角色归属由 `skillHits[].character` 表达，与轨道无关。
 */
export const DAMAGE_TRACK_INDEX = TEAM_SIZE

/** 未识别为规范非直伤名的 `kind: 'execution'` 条目，按直伤处理 */
const NON_DIRECT_NAMES = {
    谐度破坏: "处决",
    震谐响应: "响应",
    骇破响应: "响应",
} as const

/** 鸣算屋 `damageType` → 椰果 `SKILL_TYPES` */
const SKILL_TYPE_BY_DAMAGE_TYPE: Record<string, string> = {
    普攻: "常态攻击",
    重击: "常态攻击",
    共鸣技能: "共鸣技能",
    共鸣回路: "共鸣回路",
    共鸣解放: "共鸣解放",
    变奏: "变奏技能",
    延奏: "延奏技能",
    声骸: "声骸技能",
}

/** 上游 `scaleStat` → 椰果倍率的词条后缀（缺省即「攻击」，不写后缀） */
const SCALE_SUFFIX: Record<string, string> = {
    hp: "生命",
    def: "防御",
}

// ── 小工具 ────────────────────────────────────────────────────────────────────

/** 收敛浮点噪声：上游倍率常带 1e-14 级尾巴（如 `413.55000000000007`） */
const roundNumber = (value: number): number => Math.round(value * 100) / 100

/**
 * 倍率分量 → 椰果的 ratio 字符串：`13.92%*4`，多条用 `+` 连接。
 *
 * 生命 / 防御缩放的技能必须带后缀（`15.86%生命`），否则工具箱会按「攻击」缩放，
 * 既有伤害算错，伤害条目 id 也会落到 `#攻击` 上。
 *
 * ⚠️ 只在**上游没给 `multComponents`**（拿不到分段构成）时才用它，
 * 正常路径走 {@link toRatioSegments}：多段要拆开，加总会把段信息吃掉。
 */
const toRatio = (
    components: WuwaCalcMultComponent[] | null | undefined,
    baseMult: unknown,
    scaleStat: unknown,
): string => {
    const suffix = SCALE_SUFFIX[optionalString(scaleStat) ?? ""] ?? ""
    const parts = (components ?? [])
        .map((c) => ({
            rate: Number(c?.rate),
            count: Math.max(1, toInt(c?.count, 1)),
        }))
        .filter((c) => Number.isFinite(c.rate))
        .map((c) => {
            const rate = roundNumber(c.rate)
            return c.count > 1
                ? `${rate}%*${c.count}${suffix}`
                : `${rate}%${suffix}`
        })

    if (parts.length) return parts.join("+")
    const single = Number(baseMult)
    return Number.isFinite(single) ? `${roundNumber(single)}%${suffix}` : ""
}

/** 拆出来的一段倍率：该段自己的 ratio 字符串 + 该段的段数 */
export interface RatioSegment {
    ratio: string
    hits: number
}

/**
 * 多段倍率 → **一段一条**。
 *
 * 上游 `multComponents` 是技能伤害的**分段**构成（`baseMult = Σ rate × count`）：
 *
 * ```
 * 新世界狂想曲·亡与死的乐章   37.88% × 4 段 + 117.83% × 3 段   （baseMult 505.01）
 * 生与死的乐章·谱曲终末      33.01% × 2 + 12.38% × 8 + 495.1% × 1（baseMult 660.16）
 * ```
 *
 * 椰果侧一条 `skillHits` 会被 `parseValueString` 按基础类型**加总**成一个倍率
 * （`pctMap` 累加），段信息就此消失：排轴上只剩「505.01%」一行，
 * 拉表里也没法只看某一段。所以这里**每段拆成一条**，由调用方各挂一个伤害块
 * （同一技能的各段共用同一条参考线，见 {@link TimelineResult} 的装配）。
 *
 * 段数落在 `hits` 上（`count × multCount`）：工具箱的
 * `ratioValue = Σ(rate × mult) × hits`，所以拆段前后总伤害不变
 * （都是 `Σ rate × count × multCount`）——拆开只是为了看清构成，不改数值。
 */
export const toRatioSegments = (
    components: WuwaCalcMultComponent[] | null | undefined,
    baseMult: unknown,
    scaleStat: unknown,
    multCount: number,
): RatioSegment[] => {
    const suffix = SCALE_SUFFIX[optionalString(scaleStat) ?? ""] ?? ""
    const segments = (components ?? [])
        .map((c) => ({
            rate: Number(c?.rate),
            count: Math.max(1, toInt(c?.count, 1)),
        }))
        .filter((c) => Number.isFinite(c.rate) && c.rate !== 0)
        .map((c) => ({
            ratio: `${roundNumber(c.rate)}%${suffix}`,
            hits: c.count * multCount,
        }))
    if (segments.length) return segments

    // 没有分段构成（老格式）：退回单段，`baseMult` 就是整段的倍率
    const single = Number(baseMult)
    return [{
        ratio: Number.isFinite(single)
            ? `${roundNumber(single)}%${suffix}`
            : "",
        hits: multCount,
    }]
}

/**
 * 复刻工具箱 `parseValueString` 的 `baseType` 判定，用来拼伤害条目 id。
 *
 * 条目 id 形如 `${blockId}-${skillType}|${hitName}#${baseType}`，
 * 其中 `baseType` 由 ratio 字符串推导：无后缀按「攻击」，`%生命` / `%防御` 取后缀，
 * 纯数值分段落 `固定`。详见 `docs/convert-phase-mapping.md`。
 */
export const ratioBaseTypes = (
    ratio: string,
): { pct: string[]; hasFlat: boolean } => {
    interface Comp {
        baseType: string
        implicit: boolean
        flat: boolean
    }
    const comps: Comp[] = []
    for (const part of ratio.split("+").map((s) => s.trim()).filter(Boolean)) {
        const pctIndex = part.indexOf("%")
        if (pctIndex === -1) {
            const flat = Number.parseFloat(part)
            if (Number.isFinite(flat) && flat !== 0) {
                comps.push({ baseType: "固定", implicit: false, flat: true })
            }
            continue
        }
        let suffix = part.slice(pctIndex + 1)
        // `%*4生命` 里的 `*N` 先剥掉，剩下的才是词条后缀
        while (/^\*\d+/.test(suffix)) suffix = suffix.replace(/^\*\d+/, "")
        comps.push({
            baseType: suffix === "" ? "攻击" : suffix,
            implicit: suffix === "",
            flat: false,
        })
    }

    // contextBaseType：最后一个「非固定且非隐式」的分量，全隐式时回落「攻击」
    let context = "攻击"
    for (let i = comps.length - 1; i >= 0; i--) {
        if (comps[i].flat) continue
        if (!comps[i].implicit) {
            context = comps[i].baseType
            break
        }
    }

    const pct = new Set<string>()
    let hasFlat = false
    for (const comp of comps) {
        if (comp.flat) hasFlat = true
        else pct.add(comp.implicit ? context : comp.baseType)
    }
    return { pct: [...pct], hasFlat }
}

/**
 * 角色元素：上游 payload 没有直接字段。
 *
 * 用面板来源里**属性增伤**那条反推 —— 它的 id 形如 `..._attr_{元素}`，
 * 实测至少有三种写法，**中缀不固定**，所以不能用 `^echo_panel_attr_` 这种死前缀：
 *
 * ```
 * echo_panel_attr_热熔           （爱达千）
 * echo_main_panel_attr_热熔      （景燃，中缀多了 main_）
 * echo_set_panel_27_2_热熔       （套装件数触发，没有 attr_）
 * ```
 *
 * 技能自带 `damageElement`（声骸技能）时优先用它，见 {@link toSkillHit}。
 *
 * TODO(角色元素表): 若后续能拿到权威的角色→元素表，替换掉这个推断。
 */
const characterElement = (member: WuwaCalcMember): string => {
    for (const source of member.char?.attrBonusSources ?? []) {
        const matched = /(?:^|_)attr_([\p{Script=Han}]+)$/u.exec(
            optionalString(source?.id) ?? "",
        )
        if (matched) return matched[1]
    }
    return ""
}

/** `specialSkills` 的站位花名册：`id → 角色名` */
const rosterNames = (payload: WuwaCalcProjectPayload | null | undefined) => {
    const map = new Map<string, string>()
    for (const entry of payload?.specialSkills?.characters ?? []) {
        const id = optionalString(entry?.id)
        const name = optionalString(entry?.name)
        if (id && name) map.set(id, name)
    }
    return map
}

// ── 轴条目 ────────────────────────────────────────────────────────────────────

/** 一个技能段上的 buff 选中态（鸣算屋是**逐技能**存的，不是全局一份） */
export interface SkillState {
    /** buffId → 该技能时点是否生效 */
    active: Record<string, boolean>
    /** buffId → 该技能时点的叠层数 */
    stacks: Record<string, number>
}

/** 轴上的一条：直伤、效应，或处决/响应 */
interface AxisItem {
    /** 秒（由 axisOffsetPx 换算，已加上轮次起点） */
    seconds: number
    trackIndex: number
    character: string
    kind: "direct" | "nonDirect"
    /** 直伤 */
    hit?: CoconutSkillHit
    /** 非直伤 */
    nonDirect?: CoconutNonDirectEntry
    /** 非直伤是否有自己独立的参考线（效应为 true；处决/响应为 false，跟同组共用） */
    ownLine: boolean
    /**
     * 同组标记：**同一个技能拆出来的各段倍率**共用一条参考线。
     * 只有第一条段落线，其余段贴在同一条线上（段是同一瞬间的同一招，不该各占一条）。
     */
    groupKey?: string
    /** 产生这条的技能选中态（叠层 / 生效），供拉表按层绑定 */
    state?: SkillState
}

const toSkillHit = (
    entry: WuwaCalcRotationEntry,
    fallbackName: string,
    character: string,
    element: string,
): CoconutSkillHit => {
    const damageType = optionalString(entry.damageType) ?? ""
    return {
        // 有技能库名称就用库名，否则用实际名称（视作自定义）
        hitName: optionalString(entry.librarySkillName) ?? fallbackName,
        skillType: SKILL_TYPE_BY_DAMAGE_TYPE[damageType] ?? "",
        // 倍率与段数由调用方按段填（`toRatioSegments`）
        ratio: "",
        element: optionalString(entry.damageElement) || element,
        character,
        hits: 1,
        // 上游的伤害类型原样带走，拉表要用它落 `damageEntryDamageTypes`
        ...(damageType ? { damageType } : {}),
    }
}

/** 非直伤规范化：归一到椰果的 9 个规范名之一，认不出来就返回 null */
const normalizeNonDirect = (
    item: WuwaCalcSpecialSkillItem,
): { name: string; category: "处决" | "响应" | "效应" } | null => {
    if (item.kind === "effect") {
        const effectType = optionalString(item.effectType)
        return effectType
            ? { name: `${effectType}效应`, category: "效应" }
            : null
    }

    const name = optionalString(item.name) ?? ""
    for (const [canonical, category] of Object.entries(NON_DIRECT_NAMES)) {
        if (name.includes(canonical)) return { name: canonical, category }
    }
    // 上游把处决统一叫「处决」
    if (name === "处决") return { name: "谐度破坏", category: "处决" }
    return null
}

/**
 * 收集一个角色在**某一轮**里的轴条目。
 *
 * @param source 该轮该角色的技能段、技能目录与非直伤条目
 * @param secondsBase 该轮的起始秒，用来把各轮串成一条时间轴
 * @param placement 找不到 `axisOffsetPx` 时的兜底时间（按数组顺序在轮内均分）
 */
const collectMemberItems = (
    member: WuwaCalcMember,
    trackIndex: number,
    roster: Map<string, string>,
    source: MemberRoundSource,
    secondsBase: number,
    placement: (index: number, count: number) => number,
): AxisItem[] => {
    const character = optionalString(member.name) ?? ""
    const element = characterElement(member)
    const catalog = new Map<string, WuwaCalcRotationEntry>()
    for (const entry of source.catalog) {
        const id = optionalString(entry?.id)
        if (id) catalog.set(id, entry)
    }
    const secondsOf = (
        entry: WuwaCalcRotationEntry | undefined,
        fallback: number,
    ): number => {
        const px = Number(entry?.axisOffsetPx)
        return secondsBase +
            (Number.isFinite(px) ? px / UPSTREAM_PX_PER_SECOND : fallback)
    }

    const items: AxisItem[] = []
    /** 同组标记的自增号（每个技能段一个组，组内是它的各段倍率） */
    let groupSeq = 0

    // 1) 直伤：按阶段顺序拼接，catalogId 指回目录。
    //    **多段倍率按段拆开**：一个技能拆成几条，各挂一个伤害块、共用同一条参考线，
    //    这样排轴/拉表里都能逐段看到，而不是被 `parseValueString` 加总成一个数。
    for (const [index, skill] of source.skills.entries()) {
        const catalogId = optionalString(skill.catalogId)
        const entry = catalogId ? catalog.get(catalogId) : undefined
        const resolved = resolveStacks(source, catalogId ?? "", entry)
        const seconds = secondsOf(entry, placement(index, source.skills.length))
        const state = skillStateOf(skill, resolved)
        const base = toSkillHit(
            entry ?? {
                baseMult: skill.baseMult,
                multCount: skill.multCount,
                damageType: skill.damageType,
            },
            optionalString(skill.name) ?? "",
            character,
            element,
        )
        const segments = toRatioSegments(
            entry?.multComponents,
            entry?.baseMult ?? skill.baseMult,
            entry?.scaleStat ?? skill.scaleStat,
            toInt(entry?.multCount ?? skill.multCount, 1),
        )
        const groupKey = `sk${trackIndex}_${groupSeq++}`
        for (const [segmentIndex, segment] of segments.entries()) {
            items.push({
                seconds,
                trackIndex,
                character,
                kind: "direct",
                hit: { ...base, ratio: segment.ratio, hits: segment.hits },
                // 第一段落线，其余段共用它的参考线
                ownLine: segmentIndex === 0,
                groupKey,
                state,
            })
        }
    }

    // 2) 非直伤：specialSkills 里属于本站位的条目
    for (const item of source.specialSkills) {
        if (toInt(item?.sourceRosterSlot, -1) !== trackIndex) continue
        // 非直伤只在**当前轮**的目录里查得到位置，多层轴时归到该轮起点之后
        const linkedCatalogId = optionalString(item.linkedCatalogId) ?? ""
        if (!catalog.has(linkedCatalogId)) continue
        const px = secondsOf(catalog.get(linkedCatalogId), 0)
        const normalized = normalizeNonDirect(item)
        if (!normalized) {
            // 认不出来的特殊技能（如「欺骗程式·运动失能」）按直伤落，别丢伤害
            items.push({
                seconds: px,
                trackIndex,
                character,
                kind: "direct",
                hit: {
                    hitName: optionalString(item.libraryKey) ??
                        optionalString(item.name) ?? "",
                    skillType: optionalString(item.skillType) ?? "",
                    ratio: toRatio(null, item.baseMult, undefined),
                    element,
                    character,
                    hits: toInt(item.multCount, 1),
                },
                ownLine: true,
            })
            continue
        }

        const isEffect = normalized.category === "效应"
        const entry: CoconutNonDirectEntry = {
            name: normalized.name,
            category: normalized.category,
            // 处决/响应在椰果侧 layers 恒为 0（NON_DIRECT_CONFIGS max: 0）
            layers: isEffect ? toInt(item.effectLayers, 0) : 0,
        }
        if (isEffect) {
            entry.hits = toInt(item.effectCount, 1)
        } else {
            const responder =
                roster.get(optionalString(item.characterId) ?? "") ?? character
            entry.responders = responder ? [responder] : []
        }
        items.push({
            seconds: px,
            trackIndex,
            character,
            kind: "nonDirect",
            nonDirect: entry,
            ownLine: isEffect,
        })
    }

    // 该站位自己的轴顺序（直伤 + 非直伤按各自 px 排在一起）；站位之间不再混排
    items.sort((a, b) => a.seconds - b.seconds)
    return items
}

/** 抽出技能段上的 buff 选中态（只留有效的键，避免产物里塞满空对象） */
const skillStateOf = (
    skill: WuwaCalcAxisSkill,
    /** 该技能解析出来的叠层数（见 {@link resolveStacks}） */
    resolvedStacks: Record<string, number> = {},
): SkillState | undefined => {
    const active: Record<string, boolean> = {}
    for (const [id, value] of Object.entries(skill.buffActive ?? {})) {
        if (typeof value === "boolean") active[id] = value
    }
    const stacks: Record<string, number> = { ...resolvedStacks }
    return Object.keys(active).length || Object.keys(stacks).length
        ? { active, stacks }
        : undefined
}

/**
 * 解析某个技能时点上各 buff 的层数。
 *
 * 口径复刻上游 `getCatalogResolvedStacks()`（`buff-templates.js`）：
 * 默认取 `globalBuffStacks`（缺省 0），再被**该技能目录条目的层数**覆盖；
 * 多轮模式下那份层数在 `cycleConfig.rounds[r].catalogStacks[catalogId]`，
 * 单轮模式在 `rotationCatalog[].stackLayers`（上游关掉多轮时会把前者搬到后者）。
 *
 * ⚠️ `skill.buffStacks` / `phases[].buffStacks` **不是主源**：多轮模式下上游会清空前者
 * （「多轮：层数走轮次 catalog layers，时间线技能不存叠层快照」），
 * 残留的旧值会把「祸兮福兮 50 层」读成 0 层、「终结 72 层」读成 52 层，
 * 于是凭空多出几条谁也用不到的层。**工程里有 catalog 层数时就只认那一份**，
 * 完全没有（老格式）时才拿它们兜底。
 */
const resolveStacks = (
    source: MemberRoundSource,
    catalogId: string,
    entry: WuwaCalcRotationEntry | undefined,
): Record<string, number> => {
    const catalogLayers: Record<string, number> = {}
    // 单轮模式：层数挂在目录条目自己的 `stackLayers` 上
    for (const [id, value] of Object.entries(entry?.stackLayers ?? {})) {
        const n = Number(value)
        if (Number.isFinite(n)) catalogLayers[id] = n
    }
    // 多轮模式：层数在该轮的 `catalogStacks[catalogId]` 上
    for (
        const [id, value] of Object.entries(
            (catalogId ? source.catalogStacks[catalogId] : undefined) ?? {},
        )
    ) {
        const n = Number(value)
        if (Number.isFinite(n)) catalogLayers[id] = n
    }

    const stacks: Record<string, number> = { ...source.defaultStacks }
    if (source.hasCatalogLayers) {
        // 有 catalog 数据：catalog 没提到这个 buff 就是 0 层，不再拿旧快照补
        return { ...stacks, ...catalogLayers }
    }
    for (const [id, value] of Object.entries(source.phaseStacks)) {
        const n = Number(value)
        if (Number.isFinite(n)) stacks[id] = n
    }
    return stacks
}

// ── 组装 ──────────────────────────────────────────────────────────────────────

export interface TimelineResult {
    phase: CoconutPhaseState<CoconutTimelineData>
    /** 派生出的伤害条目，供拉表阶段做 Buff 绑定 */
    entries: CoconutDamageEntry[]
    /** 条目 id → 该时点的 buff 选中态（叠层数 / 是否生效） */
    entryState: Map<string, SkillState>
}

const EMPTY_TIMELINE: CoconutTimelineData = {
    refLines: [],
    opBlocks: [],
    damageBlocks: [],
}

/** 一个角色在某一轮里的输入：技能段 + 该轮自己的目录 + 该轮的非直伤 */
interface MemberRoundSource {
    skills: WuwaCalcAxisSkill[]
    catalog: WuwaCalcRotationEntry[]
    specialSkills: WuwaCalcSpecialSkillItem[]
    /** 该轮的默认层数（角色级 / 轮次级 `globalBuffStacks`） */
    defaultStacks: Record<string, number>
    /** 该轮各阶段上的层数（`phases[].buffStacks`） */
    phaseStacks: Record<string, number>
    /** 多轮模式：`catalogId → buffId → 层数` */
    catalogStacks: Record<string, Record<string, number>>
    /** 这份数据里到底有没有 catalog 层数（决定要不要退回阶段 / 技能级旧快照） */
    hasCatalogLayers: boolean
}

/** 一轮的轴数据 */
interface RoundPlan {
    /** 该轮轴长（秒），用来给轮次边界参考线命名 */
    duration: number
    /** 该轮起点的绝对秒 */
    startSeconds: number
    /** 每个角色在该轮的输入 */
    sources: MemberRoundSource[]
}

/**
 * 拆出「轮次」。
 *
 * 鸣算屋的循环轴是 `cycleConfig.rounds[]`，每轮有自己的 `duration`、`rotationCatalog`
 * 与 `phases[].skills[]`（顶层 `members[].phases` 只是 `activeRound` 那一轮）。
 * 工具箱没有自动重复轮次的机制，所以**有多少轮就铺多少轮**，并用带轴长的参考线切分。
 */
const resolveRounds = (
    payload: WuwaCalcProjectPayload | null | undefined,
): RoundPlan[] => {
    const members = (payload?.members ?? []).slice(0, TEAM_SIZE)
    const enabled = members.some((m) => m.cycleConfig?.enabled)
    const roundCount = enabled
        ? Math.max(0, ...members.map((m) => m.cycleConfig?.rounds?.length ?? 0))
        : 0

    const skillsOfPhases = (phases: WuwaCalcAxisPhase[] | null | undefined) =>
        (phases ?? []).flatMap((phase) =>
            (phase?.skills ?? []) as WuwaCalcAxisSkill[]
        )

    const skillsOfRound = (member: WuwaCalcMember, roundIndex: number) =>
        skillsOfPhases(
            member.cycleConfig?.rounds?.[roundIndex]?.phases,
        )

    /** 把若干层数表合并成一份（后写的覆盖先写的） */
    const mergeStacks = (
        ...maps: (Record<string, number> | null | undefined)[]
    ): Record<string, number> => {
        const result: Record<string, number> = {}
        for (const map of maps) {
            for (const [id, value] of Object.entries(map ?? {})) {
                const n = Number(value)
                if (Number.isFinite(n)) result[id] = n
            }
        }
        return result
    }

    /** 若干阶段上的层数合成一份 */
    const phaseStacksOf = (phases: WuwaCalcAxisPhase[] | null | undefined) =>
        mergeStacks(
            ...(phases ?? []).map((phase) =>
                phase?.buffStacks as Record<string, number> | undefined
            ),
        )

    const asLayerMap = (
        raw: unknown,
    ): Record<string, Record<string, number>> => {
        const result: Record<string, Record<string, number>> = {}
        for (
            const [catalogId, layers] of Object.entries(
                (raw ?? {}) as Record<string, unknown>,
            )
        ) {
            if (!layers || typeof layers !== "object") continue
            const normalized: Record<string, number> = {}
            for (const [buffId, value] of Object.entries(layers)) {
                const n = Number(value)
                if (Number.isFinite(n)) normalized[buffId] = n
            }
            if (Object.keys(normalized).length) result[catalogId] = normalized
        }
        return result
    }

    /** catalog 条目上有没有单轮模式的 `stackLayers` */
    const hasEntryStackLayers = (catalog: WuwaCalcRotationEntry[]) =>
        catalog.some((entry) =>
            Object.keys(entry?.stackLayers ?? {}).length > 0
        )

    if (roundCount > 1) {
        let cursor = 0
        return Array.from({ length: roundCount }, (_, roundIndex) => {
            const duration = toInt(
                members[0]?.cycleConfig?.rounds?.[roundIndex]?.duration,
                0,
            )
            const plan: RoundPlan = {
                duration,
                startSeconds: cursor,
                sources: members.map((member) => {
                    const round = member.cycleConfig?.rounds?.[roundIndex]
                    // 该轮自己的目录；轮内没有目录时才退回顶层（`activeRound`）的
                    const catalog = (round?.rotationCatalog ??
                        member.rotationCatalog ??
                        []) as WuwaCalcRotationEntry[]
                    const catalogStacks = asLayerMap(round?.catalogStacks)
                    return {
                        skills: skillsOfRound(member, roundIndex),
                        catalog,
                        specialSkills: round?.specialSkills?.items ??
                            payload?.specialSkills?.items ?? [],
                        defaultStacks: mergeStacks(
                            member.globalBuffStacks,
                            round?.globalBuffStacks,
                        ),
                        phaseStacks: phaseStacksOf(round?.phases),
                        catalogStacks,
                        hasCatalogLayers:
                            Object.keys(catalogStacks).length > 0 ||
                            hasEntryStackLayers(catalog),
                    }
                }),
            }
            cursor += duration
            return plan
        })
    }

    // 单轮：用顶层 phases
    return [{
        duration: toInt(payload?.team?.axisDuration, 0),
        startSeconds: 0,
        sources: members.map((member) => {
            const catalog =
                (member.rotationCatalog ?? []) as WuwaCalcRotationEntry[]
            return {
                skills: skillsOfPhases(member.phases),
                catalog,
                specialSkills: payload?.specialSkills?.items ?? [],
                defaultStacks: mergeStacks(
                    member.globalBuffStacks,
                    payload?.team?.sharedBuffs?.globalBuffStacks,
                ),
                phaseStacks: phaseStacksOf(member.phases),
                // 单轮模式没有 `catalogStacks`，层数在目录条目的 `stackLayers` 上
                catalogStacks: {},
                hasCatalogLayers: hasEntryStackLayers(catalog),
            }
        }),
    }]
}

export const convertTimelinePhase = (
    payload: WuwaCalcProjectPayload | null | undefined,
): TimelineResult => {
    const members = (payload?.members ?? []).slice(0, TEAM_SIZE)
    const roster = rosterNames(payload)
    const rounds = resolveRounds(payload)

    // 每轮：本条轴上的结束下标，用来把轮次边界参考线放准
    const roundBounds: { duration: number; endIndex: number }[] = []
    const items: AxisItem[] = []

    for (const round of rounds) {
        // **按站位分组**：1 号位的倍率排完再排 2 号位、3 号位，最后补该轮的轴长参考线。
        // 不跨站位按时间混排 —— 同一条轴上是同一时间点的三个人，混排会让人完全分不清谁是谁的段。
        const roundItems = members.flatMap((member, index) =>
            collectMemberItems(
                member,
                index,
                roster,
                round.sources[index],
                round.startSeconds,
                // 拿不到 px 时（非当前轮的目录里没有该技能）按数组顺序在轮内均分
                (i, count) =>
                    round.duration > 0 && count > 0
                        ? round.startSeconds + (i * round.duration) / count
                        : round.startSeconds,
            )
        )
        items.push(...roundItems)
        roundBounds.push({
            duration: round.duration,
            endIndex: items.length,
        })
    }

    if (!items.length) {
        return {
            phase: { locked: true, data: EMPTY_TIMELINE },
            entries: [],
            entryState: new Map(),
        }
    }

    const refLines: CoconutRefLine[] = []
    const damageBlocks: CoconutDamageBlock[] = []
    const entries: CoconutDamageEntry[] = []
    const entryState = new Map<string, SkillState>()

    /**
     * 该条目是否与**上一条**共用参考线。
     *
     * - 同一技能拆出来的各段倍率（`groupKey` 相同）：同一瞬间的同一招，共用一条线；
     * - 处决 / 响应（`ownLine === false`）：跟前一条非直伤同组，共用一条线。
     */
    const sharesLineWith = (
        item: AxisItem,
        prev: AxisItem | undefined,
    ): boolean => {
        if (item.groupKey !== undefined) return prev?.groupKey === item.groupKey
        return item.ownLine === false && prev?.kind === "nonDirect" &&
            prev.nonDirect?.category !== "效应"
    }
    const shared = items.map((item, index) =>
        sharesLineWith(item, items[index - 1])
    )

    // 参考线等距：条数多时等比收窄，保证整轴落在工具箱 MAX_POS 内
    // （真正落线的条目各一条 + 每轮一条轮次边界 + 末尾「结束」）
    const lineCount = shared.filter((isShared) => !isShared).length +
        roundBounds.length
    const step = Math.max(
        1,
        Math.min(REF_LINE_STEP, Math.floor(MAX_POS / (lineCount + 2))),
    )

    const pushRefLine = (id: string, time: string) => {
        refLines.push({ id, time, pos: refLines.length * step })
    }

    /** 该轮最后一条（含）之前是否已经收过尾 */
    let nextRoundBoundary = 0

    /** 补上「到第 index 条为止」已经走完的轮次边界线 */
    const flushRoundBoundaries = (processed: number) => {
        while (
            nextRoundBoundary < roundBounds.length &&
            processed >= roundBounds[nextRoundBoundary].endIndex
        ) {
            const round = roundBounds[nextRoundBoundary++]
            pushRefLine(
                `round${nextRoundBoundary}`,
                `+${Math.round(round.duration)}s`,
            )
        }
    }

    for (const [index, item] of items.entries()) {
        const shareLine = shared[index]

        const refLineId = shareLine
            ? refLines[refLines.length - 1].id
            : `r${refLines.length}`

        // `time` 只在轮次边界与收尾上写，普通伤害节点留空
        if (!shareLine) pushRefLine(refLineId, "")

        const blockId = `d${index}`
        const block: CoconutDamageBlock = {
            id: blockId,
            // 一律挂「伤害绑定」轨，否则排轴页不渲染（角色归属看 skillHits[].character）
            trackIndex: DAMAGE_TRACK_INDEX,
            // 一律绑参考线，不绑操作块
            sourceType: "ref",
            sourceId: refLineId,
            skillHits: [],
            nonDirectEntries: [],
        }

        if (item.hit) {
            block.skillHits.push(item.hit)

            // 条目 id 必须与工具箱 `buildDamageEntriesFromTimeline` 的算法一致，
            // 否则拉表页的 buff 绑定对不上（`damageEntryBuffSetIds` 是按键查的）
            const { pct, hasFlat } = ratioBaseTypes(item.hit.ratio)
            const entryId = (baseType: string) =>
                `${blockId}-${item.hit!.skillType}|${
                    item.hit!.hitName
                }#${baseType}`
            const pushDirect = (baseType: string, unit: "%" | "fixed") => {
                const id = entryId(baseType)
                entries.push({
                    id,
                    character: item.hit!.character,
                    skillType: item.hit!.skillType,
                    hitName: item.hit!.hitName,
                    displayName: item.hit!.hitName,
                    isEffect: false,
                    isTuneBreak: false,
                    isTuneResponse: false,
                    damageBaseType: baseType,
                    damageElement: item.hit!.element,
                    sourceTimelineBlockId: refLineId,
                    hits: item.hit!.hits ?? 1,
                    ratioUnit: unit,
                    ...(item.hit!.damageType
                        ? { damageType: item.hit!.damageType }
                        : {}),
                })
                if (item.state) entryState.set(id, item.state)
            }
            for (const baseType of pct) pushDirect(baseType, "%")
            if (hasFlat) pushDirect("固定", "fixed")
        }

        if (item.nonDirect) {
            // 同一条参考线上同名同类的条目合并，responders 取并集
            const existing = damageBlocks
                .filter((candidate) => candidate.sourceId === refLineId)
                .flatMap((candidate) => candidate.nonDirectEntries)
                .find((entry) =>
                    entry.name === item.nonDirect!.name &&
                    entry.category === item.nonDirect!.category
                )
            const responders = item.nonDirect.responders ?? []
            if (existing) {
                const merged = new Set([
                    ...(existing.responders ?? []),
                    ...responders,
                ])
                if (merged.size) existing.responders = [...merged]
            } else {
                block.nonDirectEntries.push(item.nonDirect)
            }

            const category = item.nonDirect.category
            const common = {
                skillType: category === "响应"
                    ? "偏谐响应"
                    : category === "处决"
                    ? "谐度破坏"
                    : "效应结算",
                hitName: item.nonDirect.name,
                displayName: item.nonDirect.name,
                isEffect: category === "效应",
                isTuneBreak: category === "处决",
                isTuneResponse: category === "响应",
                damageElement: "",
                sourceTimelineBlockId: refLineId,
                hits: item.nonDirect.hits ?? item.nonDirect.layers ?? 1,
            }
            if (category === "响应") {
                // 响应按 responders 一人一条：`${blockId}-nd|${name}#${responder}`
                for (const responder of responders) {
                    entries.push({
                        ...common,
                        id: `${blockId}-nd|${item.nonDirect.name}#${responder}`,
                        character: responder,
                        damageBaseType: "偏谐系数",
                    })
                }
            } else {
                entries.push({
                    ...common,
                    id: `${blockId}-nd|${item.nonDirect.name}`,
                    character: item.character,
                    damageBaseType: category === "处决"
                        ? "偏谐系数"
                        : "效应系数",
                })
            }
        }

        damageBlocks.push(block)
        flushRoundBoundaries(index + 1)
    }

    // 剩余轮次的边界线（最后一轮的收尾紧接在结束线之前）
    flushRoundBoundaries(items.length)

    // 末尾补一条「结束」参考线（与工具箱默认的 right 线同款），把轴收口
    pushRefLine(END_REF_LINE_ID, END_REF_LINE_LABEL)

    return {
        phase: {
            locked: true,
            data: { refLines, opBlocks: [], damageBlocks },
        },
        entries,
        entryState,
    }
}
