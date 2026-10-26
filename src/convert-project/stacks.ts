/**
 * 上游「叠层 → 值」的折算：`valueMode` / `segments` 分段曲线 / `minStacks` 门槛。
 *
 * 拉表阶段（算每个变体的值）与排轴阶段（决定「（额外）」条目要不要建）都要用，
 * 所以从 `calculation.ts` 拎出来单独成模块，避免两边各写一份口径。
 */

/** `effects[].segments[]` 的一段：`perStack` 在 `upTo` 层以内生效 */
export interface UpstreamSegment {
    upTo?: number | null
    perStack?: number
}

/** 上游 `effects[]` 里的一项（本转换只关心这些字段） */
export interface UpstreamEffect {
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
    /** 只对这些角色 ID 生效（团队效果里的定向加成） */
    onlyCharacterIds?: string[] | null
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
export const perStackAt = (
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
 * 该效果在 `layer` 层上的**累计**贡献。
 *
 * 上游自己的口径就是累计（`docs` 1.3）：`value = Σ_{s=1..stacks} perStackOf(s)`。
 * 椰果一条 buff 只能写一个数，「祸兮福兮 50层」要的就是 50 层的累计值（2.5 × 50 = 125）。
 */
export const cumulativeAt = (
    effect: UpstreamEffect,
    layer: number,
): number => {
    if (layer < Math.trunc(Number(effect.minStacks) || 0)) return 0
    if (effect.valueMode === "fixed") return Number(effect.value) || 0
    // `maxStacks` 是效果上限：轴上可能出现更大的层数（例如心识 25 层），
    // 但「万物和鸣」这类效果最多 15 层，25 层时不能算成 25×3%。
    const maxStacks = Number(effect.maxStacks)
    const capped = Number.isFinite(maxStacks) && maxStacks > 0
        ? Math.min(layer, maxStacks)
        : layer
    let total = 0
    for (let n = 1; n <= capped; n++) total += perStackAt(effect.segments, n)
    return total
}
