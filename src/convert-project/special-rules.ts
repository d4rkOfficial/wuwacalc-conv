/**
 * **特殊规则**：上游面板来源里，有几类不该被映射成椰果 Buff。
 *
 * 与 `panel.ts` 的默认口径（「除了声骸主副词条和敌怪，一切都 buff 化」）相反 ——
 * 这里放的是**例外**：上游把某些「角色固有基数」也当面板来源列出来了，
 * 而椰果工具箱的角色数据自己就带这个基数，照着 buff 化会把同一份数值算两遍。
 *
 * 每条规则带 `id` / `reason`，方便在产物与文档里说清「为什么这条没进来」。
 * 新增规则时：写成一条 `SpecialRule`，配一条单测（`special-rules_test.ts`）。
 */

/** 一个上游面板来源（`members[i].char.*Sources[]` 里的一项）的最小形态 */
export interface PanelSourceLike {
    id?: unknown
    name?: unknown
    value?: unknown
}

/** 上游 `*Sources` 数组的键（`harmonyBreakAmpSources` 等），规则可以据此判类别 */
export type PanelSourceKind = string

export interface SpecialRule {
    /** 规则标识（产物里报「被哪条规则挡下」时用） */
    id: string
    /** 为什么挡：写给后来人看的一句话 */
    reason: string
    /** 命中即丢弃这条来源 */
    match: (source: PanelSourceLike, kind: PanelSourceKind) => boolean
}

/** 取来源的名字（规则里做字符串判断用） */
const nameOf = (source: PanelSourceLike): string =>
    typeof source?.name === "string" ? source.name : ""

const idOf = (source: PanelSourceLike): string =>
    typeof source?.id === "string" ? source.id : ""

/**
 * 规则 1：**角色本体属性的谐度破坏增幅**（`char_def_harmony_break_amp`，恒为 10）丢弃。
 *
 * 实测（莫宁 / 琳奈 / 达妮娅 / 爱弥斯 / 陆·赫斯 / 清宵 共 16 个工程、30 次出现）：
 * 每个带偏谐机制的角色在 `harmonyBreakAmpSources` 里都有一条
 * `{"id":"char_def_harmony_break_amp","name":"<角色>·本体属性·谐度破坏增幅","value":10,"locked":true}`
 * —— `locked: true` 且 id 是 `char_def_`（definition = 角色定义值），
 * 和 `crit_rate_base` / `energy_regen_base` 是同一类「固有基数」。
 *
 * 椰果工具箱那边角色数据自带这个基数：
 * `api/provider/nanoka/utils.ts` 里 `baseStats.tuneBreakBoost = hasTune ? 10 : 0`，
 * 计算时由 `compute.ts` 的 `baseTuneBreakBoost` 直接读 `lv90BaseStats.tuneBreakBoost`。
 * 所以再 buff 化一次就是**同一份 +10 算两遍**。
 */
const CHAR_DEF_HARMONY_BREAK_AMP: SpecialRule = {
    id: "char-def-harmony-break-amp",
    reason:
        "角色本体属性的谐度破坏增幅（固定 10）是工具箱角色数据自带的基数，再 buff 化会重复计入",
    match: (source, kind) => {
        const id = idOf(source)
        // 工具箱自带的那个基数：按 id 精确挡，避免误伤别的 `char_def_*`
        if (id === "char_def_harmony_break_amp") return true
        // 同一条规则换 id 出现时，按「本体属性 + 谐度破坏增幅」的名字兜住
        return kind === "harmonyBreakAmpSources" &&
            id.startsWith("char_def_") &&
            nameOf(source).includes("谐度破坏增幅")
    },
}

/** 全部特殊规则（按顺序匹配，命中即丢） */
export const SPECIAL_PANEL_RULES: readonly SpecialRule[] = [
    CHAR_DEF_HARMONY_BREAK_AMP,
]

/** 命中哪条特殊规则（没命中返回 `null`） */
export const specialRuleOf = (
    source: PanelSourceLike,
    kind: PanelSourceKind,
): SpecialRule | null =>
    SPECIAL_PANEL_RULES.find((rule) => rule.match(source, kind)) ?? null

/** 这条上游面板来源是否该被丢掉（不映射成 Buff） */
export const shouldSkipPanelSource = (
    source: PanelSourceLike,
    kind: PanelSourceKind,
): boolean => specialRuleOf(source, kind) !== null
