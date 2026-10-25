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
    /** 效应归属角色（Buff 作用域用；显示仍按效应） */
    character?: string
    /** 上游效应/处决的每段倍率（百分比数值） */
    baseMult?: number
    /** 效应元素（具名效应也能匹配正确抗性） */
    element?: string
    /** 效应双暴覆盖（%） */
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
