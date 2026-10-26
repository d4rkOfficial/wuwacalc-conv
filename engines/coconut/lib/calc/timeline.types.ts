export interface RefLine {
    id: string
    time: string
    pos: number
}

export interface OpBlock {
    id: string
    trackIndex: number
    pos: number
    key: string
    desc: string
    intro: boolean
    switchback: boolean
}

export interface SkillHit {
    hitName: string
    skillType: string
    ratio: string
    element: string
    character: string
    hits?: number
    damageType?: string
    alsoAsEffect?: string
    catalogId?: string
}

export interface SkillPickerGroup {
    type: string
    hits: { name: string; ratio: string; element: string }[]
}

export interface NonDirectEntry {
    name: string
    category: "处决" | "响应" | "效应"
    layers: number
    hits?: number
    responders?: string[]
    /** 效应伤害的归属角色（决定它吃谁的 Buff） */
    character?: string
    /** 具名效应的每段倍率（上游 baseMult / 100） */
    baseMult?: number
    /** 效应伤害元素 */
    element?: string
    /** 效应双暴覆盖 */
    critRate?: number
    critDmg?: number
}

export interface DamageBlock {
    id: string
    trackIndex: number
    sourceType: "op" | "ref"
    sourceId: string
    skillHits: SkillHit[]
    nonDirectEntries: NonDirectEntry[]
}

export interface CustomHit {
    id: string
    name: string
    flatValue: number
    pctValue: number
    pctUnit: string
    element: string
    /** @desc 段数（从多段倍率取段时写入；绑定到操作块时作为默认 ×N） */
    hits?: number
}

export interface TimelineData {
    refLines: RefLine[]
    opBlocks: OpBlock[]
    damageBlocks: DamageBlock[]
}
