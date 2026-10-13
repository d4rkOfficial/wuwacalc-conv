/**
 * 工程转换的**输入 / 输出数据结构**。
 *
 * - 输入：鸣算屋方案详情 `payload.data`（四阶段各自的原始切片）；
 * - 输出：椰果工程文件 `{ version, exportedAt, project }`，
 *   目标结构以工具箱 `src/lib/types/project.ts` + `src/lib/calc/*.types.ts` 为准。
 *
 * 本文件只有类型与常量，不含逻辑。
 */

// ── 输出（椰果工程）常量 ──────────────────────────────────────────────────────

/** 工程结构版本，对应工具箱 `PROJECT_VERSION` */
export const COCONUT_PROJECT_VERSION = 4
/** 工程文件信封版本，工具箱导出时同样写 `PROJECT_VERSION` */
export const COCONUT_PROJECT_FILE_VERSION = 4
/** 队伍站位数 */
export const TEAM_SIZE = 3
/** 每个角色的声骸槽位数 */
export const ECHO_SLOT_COUNT = 5

// ── 输入：鸣算屋 `payload.data` ───────────────────────────────────────────────

/** 鸣算屋的敌人/环境口径（合并进队伍快照） */
export interface WuwaCalcTeamSnapshot {
    viewMode?: string
    /** 怪物抗性（单一数值，非分元素） */
    monsterRes?: number
    monsterLevel?: number
    axisDuration?: number
    activeIndex?: number
    /** 队伍级 Buff 列表与全局选中态；结构见 `calculation.ts` 的 `collectBuffs` */
    sharedBuffs?: {
        buffs?: unknown[] | null
        globalBuffActive?: Record<string, boolean> | null
        globalBuffStacks?: Record<string, number> | null
    } | null
}

export interface WuwaCalcWeaponSelection {
    id?: string
    refinement?: number
}

/** 声骸副词条（只有 ID + 数值 + 伤害类型） */
export interface WuwaCalcEchoSub {
    id?: string
    value?: number
    damageType?: string
}

/** 声骸槽位：主词条 / 副词条都只有 `main_*`、`sub_*` 形式的 ID */
export interface WuwaCalcEchoSlot {
    cost?: number
    name?: string
    subs?: WuwaCalcEchoSub[] | null
    main1?: string
    main2?: string
    echoId?: string | null
    noMain2?: boolean
    activeSetId?: string | null
    main1Element?: string
}

/** 套装装配：同样只有 `setId` */
export interface WuwaCalcEchoSetLoadoutEntry {
    count?: number
    setId?: string | null
    echoId?: string | null
}

export interface WuwaCalcEchoConfig {
    slots?: WuwaCalcEchoSlot[] | null
    layout?: string
    setLoadout?: WuwaCalcEchoSetLoadoutEntry[] | null
    mainSlotIndex?: number
}

export interface WuwaCalcMember {
    id?: string
    name?: string
    characterId?: string
    /** 共鸣链档位（0-6） */
    resonanceUnlocked?: number
    weaponSelection?: WuwaCalcWeaponSelection | null
    echoConfig?: WuwaCalcEchoConfig | null
    /** 角色自身 Buff（拉表阶段的输入） */
    buffs?: unknown[] | null
    skillPalette?: unknown[] | null
    rotationCatalog?: unknown[] | null
    results?: unknown
    /** 排轴阶段的输入：角色 → 阶段 → 技能段 */
    phases?: WuwaCalcAxisPhase[] | null
    /** 循环轴的轮次（顶层 `phases` 只是 `activeRound` 那一轮） */
    cycleConfig?: WuwaCalcCycleConfig | null
    /** 面板来源，用来反推角色元素 */
    char?: WuwaCalcCharPanel | null
    /** 拉表选中态：该 Buff 当前是否生效 / 叠了几层 */
    globalBuffActive?: Record<string, boolean> | null
    globalBuffStacks?: Record<string, number> | null
    /**
     * **该角色不吃哪些全队 buff**（上游「提供的全队 Buff」面板里右侧头像下的勾选，
     * UI 上叫「分配覆盖」）。漏读它，「弗洛洛·延奏」这种只该给一个人的 buff 会落到全队头上 ——
     * 那些勾选在数据里就存在这一对数组里。
     */
    excludedTeamBuffIds?: string[] | null
    /** 同上的手动子集（用户手动取消的那些），保留以防老方案只存了这一份 */
    manuallyExcludedTeamBuffIds?: string[] | null
}

// ── 输入：排轴 / 拉表 ─────────────────────────────────────────────────────────

/** 轴上的一个技能段（`members[].phases[].skills[]`），`catalogId` 指向 `rotationCatalog` */
export interface WuwaCalcAxisSkill {
    id?: string
    name?: string
    catalogId?: string
    baseMult?: number
    multCount?: number
    damageType?: string
    energyRegen?: number
    fixedDamage?: boolean
    scaleStat?: string
    /** 该技能时点各 buff 是否生效（**逐技能**存，不是全局一份） */
    buffActive?: Record<string, boolean> | null
    /** 该技能时点各 buff 的叠层数 */
    buffStacks?: Record<string, number> | null
}

/** 循环轴的一轮：有自己的轴长、技能段与**自己的技能目录** */
export interface WuwaCalcCycleRound {
    /** 该轮轴长（秒） */
    duration?: number
    phases?: WuwaCalcAxisPhase[] | null
    /**
     * 该轮的技能目录。**必须用轮内这一份**：`catalogId` 只在轮内自洽，
     * 拿顶层 `members[].rotationCatalog`（`activeRound` 的目录）查其它轮全会落空 ——
     * 落空就退化成轴上的短别名（`苍A1`），技能库名、多段倍率、`axisOffsetPx` 一起丢。
     */
    rotationCatalog?: WuwaCalcRotationEntry[] | null
    /** 该轮的非直伤条目（处决 / 响应 / 效应） */
    specialSkills?: WuwaCalcSpecialSkills | null
    /**
     * **该轮的逐技能层数**：`catalogId → buffId → 层数`。
     * 多轮模式下层数的权威来源（上游 `getCatalogResolvedStacks()` 读的就是它）。
     */
    catalogStacks?: Record<string, Record<string, number>> | null
    /** 该轮的默认层数（`globalBuffStacks` 的轮内快照） */
    globalBuffStacks?: Record<string, number> | null
    buffStacks?: Record<string, number> | null
}

export interface WuwaCalcCycleConfig {
    count?: number
    enabled?: boolean
    activeRound?: number
    rounds?: WuwaCalcCycleRound[] | null
}

/** 轴上的一个阶段（`members[].phases[]`），一个角色可以有多个阶段 */
export interface WuwaCalcAxisPhase {
    id?: string
    name?: string
    skills?: WuwaCalcAxisSkill[] | null
    locked?: boolean
    /** 阶段级默认层数（优先级低于技能目录条目上的层数） */
    buffStacks?: Record<string, number> | null
}

/** 轴技能目录条目（`members[].rotationCatalog[]`）：技能段的时间与倍率都在这 */
export interface WuwaCalcRotationEntry {
    id?: string
    name?: string
    baseMult?: number
    multCount?: number
    scaleStat?: string
    damageType?: string
    energyRegen?: number
    fixedDamage?: boolean
    stackLayers?: Record<string, unknown>
    /** 轴上的像素偏移；实测 40px = 1 秒（`maxPx / axisDuration ≈ 40`） */
    axisOffsetPx?: number
    multComponents?: WuwaCalcMultComponent[] | null
    librarySkillName?: string
    linkedSpecialSkillId?: string
    damageElement?: string
}

/** 多段倍率的分量：`baseMult = Σ rate × count` */
export interface WuwaCalcMultComponent {
    rate?: number
    count?: number
}

/** 特殊技能条目（处决 / 响应 / 效应），来源 `payload.data.specialSkills.items[]` */
export interface WuwaCalcSpecialSkillItem {
    id?: string
    /** `execution`（处决 / 响应等）或 `effect`（效应） */
    kind?: string
    name?: string
    baseMult?: number
    multCount?: number
    skillType?: string
    sourceTag?: string
    damageType?: string
    /** 效应类型，如 `聚爆` / `霜渐` / `虚湮` */
    effectType?: string
    characterId?: string
    /** 段数 → 椰果 `nonDirectEntries[].hits` */
    effectCount?: number
    /** 层数 → 椰果 `nonDirectEntries[].layers` */
    effectLayers?: number
    effectBurstLayers?: number
    trackLayers?: number
    libStackLayers?: number
    effectMultMode?: string
    libraryKey?: string
    libraryBaseMult?: number
    /** 关联回轴上的 `rotationCatalog[].id` */
    linkedCatalogId?: string
    /** 角色站位索引 */
    sourceRosterSlot?: number
}

/** `payload.data.specialSkills`：非直伤的权威来源 */
export interface WuwaCalcSpecialSkills {
    items?: WuwaCalcSpecialSkillItem[] | null
    /** 站位花名册：`{ id: 'id_1210', name: '露西' }` */
    characters?: { id?: string; name?: string }[] | null
    activeCharacterIndex?: number
}

/** 角色面板（只取转换用得到的部分） */
export interface WuwaCalcCharPanel {
    /** 面板加成来源；`id` 形如 `echo_panel_attr_热熔`，用来反推角色元素 */
    attrBonusSources?: { id?: string; name?: string; value?: number }[] | null
}

/** 鸣算屋方案快照 `payload.data`：工程转换的总输入 */
export interface WuwaCalcProjectPayload {
    team?: WuwaCalcTeamSnapshot | null
    members?: WuwaCalcMember[] | null
    version?: number
    exportConfigSnapshots?: unknown[] | null
    /** 非直伤（处决 / 响应 / 效应） */
    specialSkills?: WuwaCalcSpecialSkills | null
}

/** 鸣算屋方案快照 `payload.meta`：工程元信息 */
export interface WuwaCalcProjectMeta {
    name?: string
    author?: string
    summary?: unknown
    refVideoUrl?: string
}

/** 鸣算屋方案详情里的 `payload` */
export interface WuwaCalcProjectSnapshot {
    data?: WuwaCalcProjectPayload | null
    meta?: WuwaCalcProjectMeta | null
}

// ── 输出：椰果四阶段的锁定/数据容器 ────────────────────────────────────────────

/** 对应工具箱 `PhaseStateV2<T>` */
export interface CoconutPhaseState<T = unknown> {
    locked: boolean
    data: T | null
}

/** 对应工具箱 `CharSlot`（队伍配置的一格） */
export interface CoconutEchoSlot {
    name: string | null
    cost: number
}

export interface CoconutSelectedSet {
    name: string
    pieces: number
}

export interface CoconutCharSlot {
    character: string | null
    weapon: string | null
    triggerSets: CoconutSelectedSet[]
    /** 恰好 {@link ECHO_SLOT_COUNT} 项 */
    echoes: CoconutEchoSlot[]
    chain?: number
    refinement?: number
}

/** 队伍配置阶段的产物：落在 `project.team` 上，不走 `phases.team.data` */
export interface CoconutTeamPhaseResult {
    slots: CoconutCharSlot[]
    lockedTeamKey: string
    lockedTeamNames: string[]
    conditionProfile: { chains: number[]; refinements: number[] }
}

/** 对应工具箱 `$lib/types/game-data.ts` 的 `EchoStat` */
export interface CoconutEchoStat {
    type: string
    value: number
    unit: string
}

/** 对应工具箱 `EchoSlotConfig` */
export interface CoconutEchoSlotConfig {
    cost: number
    mainStat: CoconutEchoStat | null
    secondMainStat: CoconutEchoStat | null
    substats: CoconutEchoStat[]
}

/** 对应工具箱 `CharEchoConfig` */
export interface CoconutCharEchoConfig {
    /** 恰好 {@link ECHO_SLOT_COUNT} 项 */
    echoes: CoconutEchoSlotConfig[]
}

/** 对应工具箱 `EnemyConfig` */
export interface CoconutEnemyConfig {
    type: "BOSS" | "精英怪" | "小怪"
    level: number
    defense: number
    defenseLocked?: boolean
    resistances: Record<string, number>
    dmgReduction: number
}

/** 对应工具箱 `ConfigState`（词条/环境配置阶段） */
export interface CoconutConfigState {
    characters: CoconutCharEchoConfig[]
    enemy: CoconutEnemyConfig
}

// ── 输出：排轴阶段（工具箱 `timeline.types.ts`）─────────────────────────────────

/** 时间参考线；`time` 是标签（本转换写相对增量，如 `+25s`），`pos` 只表达先后与间距 */
export interface CoconutRefLine {
    id: string
    time: string
    pos: number
}

/** 一次直伤命中 */
export interface CoconutSkillHit {
    hitName: string
    skillType: string
    /** 形如 `202.79%` / `13.92%*4` / `9.31%*4+33.09%*2` */
    ratio: string
    element: string
    character: string
    hits?: number
    /**
     * 上游技能的 `damageType`（`普攻` / `重击` / `共鸣技能` / …），原样带过来。
     *
     * 工具箱的 `resolveDamageTypes()` 会先看显式配置、再自己推断；推断靠技能名与角色文案，
     * 鸣算屋的技能名（技能库全名）多半对不上，所以这里把上游的权威类型带进条目。
     */
    damageType?: string
}

/** 非直伤条目：处决 / 响应带 `responders`，效应带 `layers` 与 `hits` */
export interface CoconutNonDirectEntry {
    name: string
    category: "处决" | "响应" | "效应"
    layers: number
    hits?: number
    responders?: string[]
}

export interface CoconutDamageBlock {
    id: string
    trackIndex: number
    sourceType: "op" | "ref"
    sourceId: string
    skillHits: CoconutSkillHit[]
    nonDirectEntries: CoconutNonDirectEntry[]
}

/** 对应工具箱 `TimelineData`；本转换不生成 `opBlocks` */
export interface CoconutTimelineData {
    refLines: CoconutRefLine[]
    opBlocks: unknown[]
    damageBlocks: CoconutDamageBlock[]
}

// ── 输出：拉表阶段（工具箱 `calculation.types.ts`）──────────────────────────────

/** 乘区级生效条件（椰果只允许类型 / 属性条件挂在乘区上） */
export interface CoconutBuffCondition {
    elements?: string[]
    damageTypes?: string[]
    /** 链条件（Buff 实例级） */
    chains?: { charIdx: number; min: number }[]
    /** 精炼条件（Buff 实例级） */
    refinements?: { charIdx: number; min: number }[]
}

/** 乘区贡献条目 */
export interface CoconutBuffZone {
    zoneId: string
    value: number
    override?: boolean
    condition?: CoconutBuffCondition
}

/** 对应工具箱 `BuffInstance` */
export interface CoconutBuffInstance {
    id: string
    name: string
    zones: CoconutBuffZone[]
    /** `'all'` = 全队；数字数组 = 站位索引；空数组 = 仅效应伤害 */
    scope: "all" | number[]
    condition?: CoconutBuffCondition
    source?: "user" | "builtin"
    origin?: { entity?: string; kind?: string }
}

/** 由排轴结果派生出的伤害条目（拉表的绑定对象；id 算法必须与工具箱一致） */
export interface CoconutDamageEntry {
    id: string
    character: string
    skillType: string
    hitName: string
    displayName: string
    isEffect: boolean
    isTuneBreak: boolean
    isTuneResponse: boolean
    damageBaseType: string
    damageElement: string
    sourceTimelineBlockId: string
    hits: number
    /**
     * 该条目**认**的名字：显示用的短名之外，还带技能库全名 / 目录名。
     *
     * 轴上显示名被缩成鸣算屋短名（`谱曲终末·2段`）后，上游 buff 的
     * `librarySkillNames`（`生与死的乐章·谱曲终末`）就与 `hitName` 对不上了，
     * 拉表阶段用这份名单做名称匹配。
     */
    skillNames?: string[]
    ratioUnit?: "%" | "fixed"
    burstLayers?: number
    /** 上游 `damageType`（`普攻` / `重击` / …）；拿来落 `damageEntryDamageTypes` */
    damageType?: string
}

/** 对应工具箱 `CalcState` */
export interface CoconutCalcState {
    buffSets: CoconutBuffInstance[]
    damageEntryBuffSetIds: Record<string, string[]>
    damageEntryDamageTypes: Record<string, string[]>
}

// ── 输出：椰果工程文件 ────────────────────────────────────────────────────────

/** 对应工具箱 `Project` 导出时写入的字段（四阶段载体为 `phases`，**不写** `encounter`） */
export interface CoconutProjectData {
    id: string
    name: string
    createdAt: number
    version: number
    team: CoconutCharSlot[]
    lockedTeamKey?: string
    lockedTeamNames?: string[]
    conditionProfile?: { chains: number[]; refinements: number[] }
    customSkillHits: Record<string, unknown[]>
    /** 拉表页 Buff 实例列表（随 calculation 阶段导出） */
    buffs: unknown[]
    phases: {
        team: CoconutPhaseState
        timeline: CoconutPhaseState
        calculation: CoconutPhaseState
        config: CoconutPhaseState
    }
    analysis?: unknown
    comparison?: unknown
}

/**
 * 工程文件信封：`GET /share/{code}/download` 的响应体。
 *
 * 注意工具箱导入侧有 **1MB** 上限（`safeJsonParse`），转换产物不能夹带上游原始快照。
 */
export interface CoconutProjectFile {
    version: number
    exportedAt: number
    project: CoconutProjectData
}
