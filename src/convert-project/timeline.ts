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
    collectMultAddEffects,
    EXTRA_RATIO_PLACEHOLDER,
    EXTRA_RATIO_SUFFIX,
    globalBuffActiveOf,
    type MultAddEffect,
    resolveSkillMultAdds,
} from "./extra-ratio.ts"
import { EMPTY_TABLES, type ProjectTables } from "./tables.ts"
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
import {
    ACTION_SKILL_TYPES,
    EFFECT_ELEMENTS,
    NON_DIRECT_NAMES,
    SCALE_SUFFIX,
    SKILL_TYPE_BY_DAMAGE_TYPE,
} from "./data/game.ts"

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

/**
 * 上游 `damageType` → 椰果 `skillType`。
 *
 * 工具箱的 `声骸技能` **不是**「造成声骸技能伤害」，而是**装备声骸的技能**；
 * 名字里点明了招式类别的按招式类别落，名字里看不出招式的才是装备声骸技能。
 */
const skillTypeOf = (damageType: string, names: string[]): string => {
    if (damageType === "声骸") {
        for (const name of names) {
            for (const [keyword, skillType] of ACTION_SKILL_TYPES) {
                if (name.includes(keyword)) return skillType
            }
        }
    }
    return SKILL_TYPE_BY_DAMAGE_TYPE[damageType] ?? ""
}

// ── 小工具 ────────────────────────────────────────────────────────────────────

/** 收敛浮点噪声：上游倍率常带 1e-14 级尾巴（如 `413.55000000000007`） */
const roundNumber = (value: number): number => Math.round(value * 100) / 100

/**
 * 倍率 → 椰果的 ratio 字符串：**直接用上游的原始复合倍率 `baseMult`**。
 *
 * 上游多段技能的 `baseMult` 就是「总倍率」（`Σ rate × count`，如
 * `37.88%×4 + 117.83%×3 → 505.01%`），`multComponents` 只是给「倍率拆分」用的构成。
 * 既然不再拆段，就把这条原始数值原样写成一条 ratio（`505.01%`），
 * 工具箱 `ratioValue = Σ(rate × mult) × hits` 得到的仍是同一个总伤害。
 *
 * 生命 / 防御缩放的技能必须带后缀（`15.86%生命`），否则工具箱会按「攻击」缩放，
 * 既有伤害算错，伤害条目 id 也会落到 `#攻击` 上。
 *
 * 只有 `baseMult` 缺失 / 为 0（老格式）时才退回 `multComponents` 求和。
 * **追加倍率**（`multAdd`）不在这里，另开「（额外）」条目，见 `extra-ratio.ts`。
 */
const toRatio = (
    components: WuwaCalcMultComponent[] | null | undefined,
    baseMult: unknown,
    scaleStat: unknown,
    fixedDamage = false,
): string => {
    const suffix = SCALE_SUFFIX[optionalString(scaleStat) ?? ""] ?? ""
    const single = Number(baseMult)
    if (Number.isFinite(single) && single !== 0) {
        // 固定伤害（上游 `fixedDamage: true`）不能写成百分比：工具箱会按
        // 「倍率 × 面板」算，666 会变成 666% × 攻击；不带 % 才是固定值 666。
        return fixedDamage
            ? `${roundNumber(single)}`
            : `${roundNumber(single)}%${suffix}`
    }

    // 老格式没有 `baseMult`：按分段构成自己求和
    const total = (components ?? []).reduce((sum, c) => {
        const rate = Number(c?.rate)
        if (!Number.isFinite(rate)) return sum
        return sum + rate * Math.max(1, toInt(c?.count, 1))
    }, 0)
    return total !== 0 ? `${roundNumber(total)}%${suffix}` : ""
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
     * 同组标记：**同一个技能的倍率条目与它的「（额外）」条目**共用一条参考线。
     * 技能本体落线，「（额外）」贴在它上面 —— 同一瞬间的同一招不该占两条线。
     */
    groupKey?: string
    /**
     * 「（额外）」条目要承载的追加倍率（上游 `multAdd`）：buff id + 层数（固定段为 `null`）
     * + 技能名键（同一条 buff 可以有多条点名不同技能的效果，命火就是劫魄 / 踏罡两条）。
     * 拉表阶段据此把 `extraRatio` 变体绑到它上面。
     */
    extraRatioKeys?: {
        buffId: string
        layer: number | null
        skillNamesKey: string
    }[]
    /**
     * 该条目**认**的名字：技能库全名 / 轴上短名 / 目录名。
     *
     * 显示名被缩成短名后，上游 buff 的 `librarySkillNames`（全名）就对不上了，
     * 所以拉表阶段拿这份名单做名称匹配（见 `docs` 2.3.4）。
     */
    names?: string[]
    /** 产生这条的技能选中态（叠层 / 生效），供拉表按层绑定 */
    state?: SkillState
    /** 特殊技能条目的上游 id（同一份团队特殊技能会在每个成员里各复制一份，用它去重） */
    specialKey?: string
}

const toSkillHit = (
    entry: WuwaCalcRotationEntry,
    hitName: string,
    names: string[],
    character: string,
    element: string,
    librarySkillType?: string,
): CoconutSkillHit => {
    const damageType = optionalString(entry.damageType) ?? ""
    return {
        hitName,
        // 技能库的 skillType 是权威口径（damageType 只表示「算哪种伤害」）；
        // 查不到时才退回 damageType/名字推断。
        skillType: librarySkillType || skillTypeOf(damageType, names),
        // 倍率由调用方填（`toRatio`），段数放在 `hits` 上
        ratio: "",
        element: optionalString(entry.damageElement) || element,
        character,
        hits: 1,
        // 上游的伤害类型原样带走，拉表要用它落 `damageEntryDamageTypes`
        ...(damageType ? { damageType } : {}),
        // 同时视为某种效应（如卡提希娅部分普攻同时算风蚀）：
        // 拉表阶段会把它追加成第二伤害类型，Buff 条件按「类型数组任一命中」生效
        ...(optionalString(entry.alsoAsEffect)
            ? { alsoAsEffect: optionalString(entry.alsoAsEffect) }
            : {}),
    }
}

/**
 * 用户看到的倍率名（工具箱 `hitName`）。
 *
 * - **装备声骸技能**（`skillType === '声骸技能'`）用工具箱**自己的**叫法 `伤害N`：
 *   这类条目显示时工具箱会自动拼上「装备声骸名·」前缀（`echoes[0].name·`），
 *   行名再用声骸名就成了 `梦魇·赫卡忒·梦魇·赫卡忒`；而工具箱原生工程里，
 *   声骸技能的命中名本来就是 `伤害1` / `伤害2`（`nanoka/utils.ts` 的
 *   `makeEchoSkillValues()` 逐个 damage 条目命名），所以这里跟它对齐。
 *   序号 = **倍率分量的序号**：实测上游分量与椰果声骸库的 `伤害N` 一一对应
 *   （`梦魇·赫卡忒` 一段 152.38% ↔ `伤害1`；没有分量的「（短按）」条目
 *   `baseMult` 就是 `伤害1`，如 `无归的谬误（短按）` 15.85% / `迷胧幻蛾（短按）` 405%）。
 * - 其余技能用**鸣算屋轴上的短名**（`skills[].name`：`亡与死的乐章` / `普攻·赫卡忒第二段` /
 *   `蛰幻第一段`），不用技能库全名（`新世界狂想曲·亡与死的乐章`）—— 排轴与拉表里显示的就是
 *   这个名字，全名太长，把真正要看的招式名挤没了；
 * - **一个技能只落一条**，所以不需要段号。名字里自带的「第N段」是**招式本身**的第几段
 *   （`广域观测模式第三段`），照原样保留；
 * - **id 的唯一性不靠这个名字**（每个技能各占一个伤害块，`blockId` 已经区分），
 *   所以重名不会撞 id；需要按名称匹配 Buff 时走 `CoconutDamageEntry.skillNames`。
 */
const displayNameOf = (
    candidates: (string | undefined)[],
    skillType: string,
): string => {
    if (skillType === "声骸技能") return "伤害1"
    return candidates.find((name) => name) ?? ""
}


const normalizeNonDirect = (
    item: WuwaCalcSpecialSkillItem,
): {
    name: string
    category: "处决" | "响应" | "效应"
    baseMult?: number
    element?: string
} | null => {
    if (item.kind === "effect") {
        const effectType = optionalString(item.effectType)
        if (!effectType) return null
        const rawName = optionalString(item.name)
        // 「效应」是通用名，落规范名（聚爆效应）；具名效应（聚爆·普通光翼）保留原名，
        // 否则会被当成同一条 13 层聚爆，倍率与条目数都会错。
        const generic = !rawName || rawName === "效应" ||
            rawName === `${effectType}效应`
        // 上游 `baseMult` 是百分比数值（1397.26 = 1397.26%），引擎内部按倍率用，要 /100
        const rawBase = Number(item.baseMult ?? item.libraryBaseMult)
        const baseMult = Number.isFinite(rawBase) ? rawBase / 100 : NaN
        const element = optionalString(item.element) ||
            EFFECT_ELEMENTS[effectType] || ""
        return {
            name: generic ? `${effectType}效应` : rawName,
            category: "效应",
            ...(Number.isFinite(baseMult) ? { baseMult } : {}),
            ...(element ? { element } : {}),
        }
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
 * @param multAdds 全工程的追加倍率效果（用来补「（额外）」条目，见 `extra-ratio.ts`）
 * @param activeById 全局 buff 开关（`globalBuffActive`）
 */
const collectMemberItems = (
    member: WuwaCalcMember,
    trackIndex: number,
    roster: Map<string, string>,
    source: MemberRoundSource,
    secondsBase: number,
    placement: (index: number, count: number) => number,
    multAdds: MultAddEffect[],
    activeById: Map<string, boolean>,
    tables: ProjectTables,
    hasAmisC6Burst = false,
): AxisItem[] => {
    const character = optionalString(member.name) ?? ""
    const characterId = optionalString(member.characterId) ?? ""
    // 角色元素必须来自角色本身（技能库），不能用主位声骸的元素：
    // 洛瑟菈主位是湮灭声骸，但她本人是冷凝，按主位落会把 12% 湮灭伤错算到她头上。
    const element = tables.characterElements.get(characterId) ||
        characterElement(member)
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
    /** 同组标记的自增号（每个技能段一个组，组内是它和「（额外）」条目） */
    let groupSeq = 0

    // 1) 直伤：按阶段顺序拼接，catalogId 指回目录。
    //    **一个技能只落一条倍率**：直接用上游的原始复合倍率 `baseMult`（Σ rate × count），
    //    只有追加倍率（`multAdd`）另开一条「（额外）」条目，见 `extra-ratio.ts`。
    for (const [index, skill] of source.skills.entries()) {
        const catalogId = optionalString(skill.catalogId)
        const entry = catalogId ? catalog.get(catalogId) : undefined
        const resolved = resolveStacks(source, catalogId ?? "", entry)
        // 技能自己的叠层（上游 `unit.buffStacks`）优先级最高：6 链「铭记」这类
        // 只在某一招上打满 3 层的 buff，目录/阶段层数里都是 0，漏了会把整招伤害算低。
        if (skill.buffMode === "custom") {
            for (const [id, value] of Object.entries(skill.buffStacks ?? {})) {
                const n = Number(value)
                if (!Number.isFinite(n)) continue
                // 同一层数要写进两种 id 形态：队伍 buff 在成员列表里是 `tm_*`，
                // 而 sharedBuffs / 全局层数用的是原始 id；只写一种会让查层数时
                // 先命中旧的全队层数（例：追猎全局 3 层盖掉技能自己的 1 层）。
                resolved[id] = n
                if (id.startsWith("tm_")) resolved[id.slice(3)] = n
                else resolved["tm_" + id] = n
            }
        }
        // 集谐系统 Buff：模态开启时引擎按「模态层数」统一结算，逐技能层数没记时
        // 用该轮出现过的最大值补上（清宵 4 层 -> 所有技能都吃 4×14.4%）。
        for (const [id, n] of Object.entries(source.convergenceStacks)) {
            if (!resolved[id] && n > 0) resolved[id] = n
        }
        const seconds = secondsOf(entry, placement(index, source.skills.length))
        let state = skillStateOf(skill, resolved, source.phaseActive)
        if (source.convergenceIds.length) {
            state ??= { active: {}, stacks: { ...resolved } }
            for (const id of source.convergenceIds) state.active[id] = true
        }
        const shortName = optionalString(skill.name)
        const libraryName = optionalString(entry?.librarySkillName)
        /** 这条技能认的名字（短名 / 目录名 / 技能库全名，去重） */
        const nameCandidates = [
            ...new Set(
                [shortName, optionalString(entry?.name), libraryName].filter(
                    (name): name is string => !!name,
                ),
            ),
        ]
        const librarySkill = characterId && libraryName
            ? tables.skills.get(`${characterId}|${libraryName}`)
            : undefined
        // `alsoAsEffect` 在**技能段**上，不在目录条目上；目录条目存在时也要合并，
        // 否则卡提希娅部分普攻会丢掉「同时视为风蚀」这层第二类型。
        const alsoAsEffect = optionalString(entry?.alsoAsEffect) ||
            optionalString(skill.alsoAsEffect)
        const catalogEntry = entry
            ? { ...entry, alsoAsEffect }
            : {
                baseMult: skill.baseMult,
                multCount: skill.multCount,
                damageType: skill.damageType,
                alsoAsEffect,
            }
        const base = toSkillHit(
            catalogEntry,
            "",
            nameCandidates,
            character,
            element,
            librarySkill?.skillType,
        )
        const groupKey = `sk${trackIndex}_${groupSeq++}`
        items.push({
            seconds,
            trackIndex,
            character,
            kind: "direct",
            hit: {
                ...base,
                hitName: displayNameOf(nameCandidates, base.skillType),
                ratio: toRatio(
                    entry?.multComponents,
                    entry?.baseMult ?? skill.baseMult,
                    entry?.scaleStat ?? skill.scaleStat,
                    entry?.fixedDamage ?? skill.fixedDamage ?? false,
                ),
                // ratio 就是上游的原始复合倍率 `baseMult`（= Σ rate × count），
                // 这里只再乘技能自己的 `multCount`
                hits: toInt(entry?.multCount ?? skill.multCount, 1),
            },
            // 名称匹配用的名字集（显示名之外的都在这，见 `displayNameOf`）
            names: nameCandidates,
            // 技能本体落线；「（额外）」条目同组共用这条线
            ownLine: true,
            groupKey,
            state,
        })

        // **（额外）条目**：追加倍率（上游 `multAdd`）是技能级的一次性追加，
        // 但工具箱的 `extraRatio` 是逐命中加算的 —— 绑到技能本体上会被乘
        // `hits` 倍（景燃的劫魄：命火 527.5% 被算成近 5 倍）。所以给它单开一条
        // 倍率≈0、`hits = 1` 的条目，追加倍率类 buff 只挂这里（见 `extra-ratio.ts`）。
        const extraKeys = resolveSkillMultAdds({
            effects: multAdds,
            memberIndex: trackIndex,
            names: nameCandidates,
            stacks: resolved,
            active: skill.buffActive,
            globalActive: activeById,
            member,
        })
        if (extraKeys.length) {
            // 缩放词条后缀跟技能本体一致（追加的倍率按同一个面板属性缩放）
            const suffix = SCALE_SUFFIX[
                optionalString(entry?.scaleStat ?? skill.scaleStat) ?? ""
            ] ??
                ""
            items.push({
                seconds,
                trackIndex,
                character,
                kind: "direct",
                hit: {
                    ...base,
                    hitName: `${
                        displayNameOf(nameCandidates, base.skillType)
                    }${EXTRA_RATIO_SUFFIX}`,
                    ratio: `${EXTRA_RATIO_PLACEHOLDER}${suffix}`,
                    hits: 1,
                },
                names: nameCandidates,
                // 与技能本体同组：共用同一条参考线，轴不会因此变长
                ownLine: false,
                groupKey,
                state,
                extraRatioKeys: extraKeys,
            })
        }
    }

    // 2) 非直伤：specialSkills 里属于本站位的条目
    for (const item of source.specialSkills) {
        if (toInt(item?.sourceRosterSlot, -1) !== trackIndex) continue
        // 非直伤只在**当前轮**的目录里查得到位置，多层轴时归到该轮起点之后
        const linkedCatalogId = optionalString(item.linkedCatalogId) ?? ""
        // 高难循环轴里的处决/效应常常没有 `linkedCatalogId`（不在技能目录里），
        // 不能因此丢掉：放到该轮起点，伤害与位置无关，但条目必须存在。
        const linkedEntry = linkedCatalogId
            ? catalog.get(linkedCatalogId)
            : undefined
        const px = linkedEntry ? secondsOf(linkedEntry, 0) : secondsBase
        const normalized = normalizeNonDirect(item)
        if (!normalized) {
            // 认不出来的特殊技能（如「欺骗程式·运动失能」）按直伤落，别丢伤害
            const name = optionalString(item.libraryKey) ??
                optionalString(item.name) ?? ""
            items.push({
                seconds: px,
                trackIndex,
                character,
                kind: "direct",
                hit: {
                    hitName: name,
                    skillType: optionalString(item.skillType) ?? "",
                    ratio: toRatio(null, item.baseMult, undefined),
                    element,
                    character,
                    hits: toInt(item.multCount, 1),
                },
                names: name ? [name] : [],
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
            // 效应伤害由某个角色施加，Buff 作用域要按该角色算；显示层仍走「无角色」
            entry.character =
                roster.get(optionalString(item.characterId) ?? "") ??
                    character
            if (normalized.baseMult !== undefined) {
                entry.baseMult = normalized.baseMult
            }
            if (normalized.element) entry.element = normalized.element
            // 爱弥斯 6 链（聚爆模态）：全队聚爆效应固定双暴 80% / 275%
            if (hasAmisC6Burst && item.effectType === "聚爆") {
                entry.critRate = 80
                entry.critDmg = 275
            }
        } else {
            const responder =
                roster.get(optionalString(item.characterId) ?? "") ?? character
            entry.responders = responder ? [responder] : []
        }
        // 特殊技能自己的逐项开关/层数（`custom`）不能丢：效应伤害吃哪条加深、
        // 暴击覆盖，全看 item.buffActive / buffStacks。
        const itemStacks: Record<string, number> = { ...source.defaultStacks }
        if (item.buffMode === "custom") {
            for (const [id, value] of Object.entries(item.buffStacks ?? {})) {
                const n = Number(value)
                if (!Number.isFinite(n)) continue
                itemStacks[id] = n
                if (id.startsWith("tm_")) itemStacks[id.slice(3)] = n
                else itemStacks["tm_" + id] = n
            }
        }
        let state = skillStateOf(
            {
                buffMode: item.buffMode,
                buffActive: item.buffActive,
            } as WuwaCalcAxisSkill,
            itemStacks,
            source.phaseActive,
        )
        if (source.convergenceIds.length) {
            state ??= { active: {}, stacks: { ...itemStacks } }
            for (const id of source.convergenceIds) state.active[id] = true
        }
        items.push({
            seconds: px,
            trackIndex,
            character: entry.character ?? character,
            kind: "nonDirect",
            nonDirect: entry,
            ownLine: isEffect,
            state,
            specialKey: [
                optionalString(item.id) ?? "",
                entry.category,
                entry.name,
                entry.layers,
                entry.hits ?? 1,
                entry.baseMult ?? "",
                optionalString(item.characterId) ?? "",
            ].join("|"),
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
    /** 该阶段合并后的勾选态：技能没显式写的键回落到它 */
    phaseActive: Record<string, boolean> = {},
): SkillState | undefined => {
    // inherit 技能不吃自己的 buffActive（上游 resolveBuffActive 同义）；
    // custom 技能在自己的开关之上回落阶段开关。
    const active: Record<string, boolean> = { ...phaseActive }
    if (skill.buffMode === "custom") {
        for (const [id, value] of Object.entries(skill.buffActive ?? {})) {
            if (typeof value === "boolean") active[id] = value
        }
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
    /** 同一层数写进两种 id 形态（`tb_x` / `tm_tb_x`），查层数时不会先命中旧键 */
    const put = (
        target: Record<string, number>,
        id: string,
        value: unknown,
    ) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return
        target[id] = n
        if (id.startsWith("tm_")) target[id.slice(3)] = n
        else target["tm_" + id] = n
    }
    const catalogLayers: Record<string, number> = {}
    // 单轮模式：层数挂在目录条目自己的 `stackLayers` 上
    for (const [id, value] of Object.entries(entry?.stackLayers ?? {})) {
        put(catalogLayers, id, value)
    }
    // 多轮模式：层数在该轮的 `catalogStacks[catalogId]` 上
    for (
        const [id, value] of Object.entries(
            (catalogId ? source.catalogStacks[catalogId] : undefined) ?? {},
        )
    ) {
        put(catalogLayers, id, value)
    }

    const stacks: Record<string, number> = {}
    for (const [id, value] of Object.entries(source.defaultStacks)) {
        put(stacks, id, value)
    }
    // 上游 `resolveCycleStepStacksForRound` 的顺序：全局 → 阶段 → 目录条目。
    // 阶段层数**不能因为目录存在就跳过**：例如却邪武器叠层写在 phase.buffStacks
    // （5 层 = 112% 气动增伤），目录里没有它，跳过就会整轮少 112% 增伤。
    for (const [id, value] of Object.entries(source.phaseStacks)) {
        put(stacks, id, value)
    }
    for (const [id, value] of Object.entries(catalogLayers)) {
        put(stacks, id, value)
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
    /** 该轮各阶段的勾选态合并结果（`phases[].buffMode/buffActive`，后者覆盖前者） */
    phaseActive: Record<string, boolean>
    /** 集谐系统 Buff 的 id（模态开启时这些 Buff 无视逐技能开关，强制生效） */
    convergenceIds: string[]
    /** 集谐系统 Buff 的层数：取该轮所有技能/目录里出现过的最大值（引擎按模态层数统一） */
    convergenceStacks: Record<string, number>
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

    /** 阶段勾选态：custom 阶段自己的开关覆盖前一阶段；inherit 阶段继承 */
    const phaseActiveOf = (phases: WuwaCalcAxisPhase[] | null | undefined) => {
        const result: Record<string, boolean> = {}
        for (const phase of phases ?? []) {
            if (phase?.buffMode !== "custom") continue
            for (const [id, value] of Object.entries(phase.buffActive ?? {})) {
                if (typeof value === "boolean") result[id] = value
            }
        }
        return result
    }

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

    /**
     * 集谐系统 Buff：模态开启时 W 引擎强制生效，且层数是**模态层数**而不是技能层数。
     * 工程里这份层数常常只记在某个技能的 `catalogStacks` 上（例如只记一次 4 层），
     * 但结算时全轮所有技能都按 4 层算；这里取该轮所有出现过的最大值。
     */
    const convergenceInfoOf = (
        member: WuwaCalcMember,
        defaultStacks: Record<string, number>,
        phaseStacks: Record<string, number>,
        skills: WuwaCalcAxisSkill[],
        catalogStacks: Record<string, Record<string, number>>,
    ): { ids: string[]; stacks: Record<string, number> } => {
        const ids = ((member.buffs ?? []) as {
            category?: string
            id?: string
        }[])
            .filter((buff) => buff?.category === "convergence" && buff.id)
            .map((buff) => String(buff.id))
        const stacks: Record<string, number> = {}
        for (const id of ids) stacks[id] = 0
        const consider = (id: string, value: unknown) => {
            if (stacks[id] === undefined) return
            const n = Number(value)
            if (Number.isFinite(n) && n > stacks[id]) stacks[id] = n
        }
        for (const id of ids) {
            consider(id, defaultStacks[id])
            consider(id, phaseStacks[id])
        }
        for (const skill of skills) {
            for (const [id, value] of Object.entries(skill.buffStacks ?? {})) {
                consider(id, value)
            }
        }
        for (const layerMap of Object.values(catalogStacks)) {
            for (const [id, value] of Object.entries(layerMap)) {
                consider(id, value)
            }
        }
        return { ids, stacks }
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
                    const skills = skillsOfRound(member, roundIndex)
                    const defaultStacks = mergeStacks(
                        member.globalBuffStacks,
                        round?.globalBuffStacks,
                    )
                    const phaseStacks = phaseStacksOf(round?.phases)
                    const convergence = convergenceInfoOf(
                        member,
                        defaultStacks,
                        phaseStacks,
                        skills,
                        catalogStacks,
                    )
                    return {
                        skills,
                        catalog,
                        // 优先顶层 specialSkills：轮内 items 往往是同一份团队列表的副本，
                        // 按成员/轮各收一次会重复计入（SCJ322 的 2 条效应被算成 15 条）。
                        // 多轮：每轮有自己的特殊技能快照，W 的 specialTotal 是逐轮求和
                        specialSkills: round?.specialSkills?.items ??
                            payload?.specialSkills?.items ?? [],
                        defaultStacks,
                        phaseStacks,
                        phaseActive: phaseActiveOf(round?.phases),
                        convergenceIds: convergence.ids,
                        convergenceStacks: convergence.stacks,
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
            // 单轮模式没有 `catalogStacks`，层数在目录条目的 `stackLayers` 上
            const catalogStacks: Record<string, Record<string, number>> = {}
            const skills = skillsOfPhases(member.phases)
            const defaultStacks = mergeStacks(
                member.globalBuffStacks,
                payload?.team?.sharedBuffs?.globalBuffStacks,
            )
            const phaseStacks = phaseStacksOf(member.phases)
            const convergence = convergenceInfoOf(
                member,
                defaultStacks,
                phaseStacks,
                skills,
                catalogStacks,
            )
            return {
                skills,
                catalog,
                specialSkills: payload?.specialSkills?.items ?? [],
                defaultStacks,
                phaseStacks,
                phaseActive: phaseActiveOf(member.phases),
                convergenceIds: convergence.ids,
                convergenceStacks: convergence.stacks,
                catalogStacks,
                hasCatalogLayers: hasEntryStackLayers(catalog),
            }
        }),
    }]
}

export const convertTimelinePhase = (
    payload: WuwaCalcProjectPayload | null | undefined,
    tables: ProjectTables = EMPTY_TABLES,
): TimelineResult => {
    const members = (payload?.members ?? []).slice(0, TEAM_SIZE)
    const roster = rosterNames(payload)
    const rounds = resolveRounds(payload)
    const hasAmisC6Burst = members.some((member) =>
        (optionalString(member.name) ?? "").includes("爱弥斯") &&
        toInt(member.resonanceUnlocked, 0) >= 6 &&
        (optionalString(member.combatMode) === "burst" ||
            (optionalString(member.combatMode) ?? "").includes("聚爆"))
    )
    // 追加倍率（`multAdd`）与全局 buff 开关：用来给技能补「（额外）」条目
    const multAdds = collectMultAddEffects(payload)
    const activeById = globalBuffActiveOf(payload)

    // 每轮：本条轴上的结束下标，用来把轮次边界参考线放准
    const roundBounds: { duration: number; endIndex: number }[] = []
    let items: AxisItem[] = []

    for (const round of rounds) {
        // **按站位分组**：1 号位的倍率排完再排 2 号位、3 号位，最后补该轮的轴长参考线。
        // 不跨站位按时间混排 —— 同一条轴上是同一时间点的三个人，混排会让人完全分不清谁是谁的段。
        let roundItems = members.flatMap((member, index) =>
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
                multAdds,
                activeById,
                tables,
                hasAmisC6Burst,
            )
        )
        // 特殊技能列表是团队级的，payload 会把它复制到每个成员里；**每轮内**按上游 id 去重，
        // 但不同轮的同一条要保留（W 的 specialTotal 是逐轮求和）。
        const seenSpecialKeys = new Set<string>()
        roundItems = roundItems.filter((item) => {
            if (!item.specialKey) return true
            if (seenSpecialKeys.has(item.specialKey)) return false
            seenSpecialKeys.add(item.specialKey)
            return true
        })
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
     * - 同一技能的倍率条目与「（额外）」条目（`groupKey` 相同）：同一瞬间的同一招，共用一条线；
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
                    // 显示名是短名，名称匹配靠这份名单（含技能库全名）
                    ...(item.names?.length ? { skillNames: item.names } : {}),
                    // 「（额外）」条目：追加倍率（`extraRatio`）只绑它
                    ...(item.extraRatioKeys
                        ? { extraRatioKeys: item.extraRatioKeys }
                        : {}),
                    ...(item.hit!.damageType
                        ? { damageType: item.hit!.damageType }
                        : {}),
                    ...(item.hit!.alsoAsEffect
                        ? { alsoAsEffect: item.hit!.alsoAsEffect }
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
                ...(category === "效应"
                    ? {
                        ratioValue: item.nonDirect.layers,
                        ...(item.nonDirect.baseMult !== undefined
                            ? { effectBaseMult: item.nonDirect.baseMult }
                            : {}),
                        ...(item.nonDirect.critRate !== undefined
                            ? { effectCritRate: item.nonDirect.critRate }
                            : {}),
                        ...(item.nonDirect.critDmg !== undefined
                            ? { effectCritDmg: item.nonDirect.critDmg }
                            : {}),
                    }
                    : {}),
            }
            if (category === "响应") {
                // 响应按 responders 一人一条：`${blockId}-nd|${name}#${responder}`
                for (const responder of responders) {
                    const id =
                        `${blockId}-nd|${item.nonDirect.name}#${responder}`
                    entries.push({
                        ...common,
                        id,
                        character: responder,
                        damageBaseType: "偏谐系数",
                    })
                    if (item.state) entryState.set(id, item.state)
                }
            } else {
                const id = `${blockId}-nd|${item.nonDirect.name}`
                entries.push({
                    ...common,
                    id,
                    character: item.character,
                    damageBaseType: category === "处决"
                        ? "偏谐系数"
                        : "效应系数",
                })
                if (item.state) entryState.set(id, item.state)
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
