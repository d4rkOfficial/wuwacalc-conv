# 排轴 / 拉表 转换规则

> 状态：**四个阶段全部已实现**（`src/convert-project/`）。阶段一 `team.ts`、阶段二 `timeline.ts`、
> 阶段三 `calculation.ts`、阶段四 `config.ts`，汇总在 `index.ts`。
>
> 依据：
> - 椰果侧：`wuwa-afyg-tool` 的 `calculation.consts.ts`（`ZONE_DEFS`）、`calculation.types.ts`、`timeline.types.ts`、`timeline.store.svelte.ts`
> - 鸣算屋侧：`wuwacalc.cn/js/core.js` 的乘区字面量 + `GET /api/schemes/{code}` 实测数据

---

## 一、拉表 · 乘区对照（已确认）

### 1.1 上游乘区词表

鸣算屋的乘区分两层：顶层 `category`（单乘区 buff 直接用它，`composite` 表示一条 buff 含多个乘区），以及 `composite` 里 `effects[].zone` 自己的乘区。

从 `core.js` 枚举到的全部 zone 字面量（19 个）：

```
critRateSet  elementBonus  elementDeep  elementDefense  elementResReduce
generalAttack  generalBonus  generalCritDmg  generalCritRate  generalDeep
generalDefense  generalVulnerability  multAdd  multBoost  multBoostExtra
typeBonus  typeDeep  typeDefense  typeVulnerability
```

只在 `category` 出现的：`composite`、`convergence`、`generalDefPct`、`offsetHarmonyEff`。

### 1.2 对照表

| 上游 `category` / `effects[].zone` | 实测语义（样例） | 椰果 `ZoneId` | 附带条件 |
| --- | --- | --- | --- |
| `generalAttack` | 攻击提升（`[武器] 光殉·攻击` 24%） | `atkPct` | — |
| `generalDefPct` | 防御提升（`强谐振场` 20%） | `defPct` | — |
| `generalCritRate` / `critRateSet` | 暴击率（`雪落无声之愿` 25%） | `critRate` | — |
| `generalCritDmg` | 暴击伤害（`雪锈` 40%） | `critDmg` | — |
| `generalBonus` | 通用加成（`干涉标记` 40%） | `bonusDmg` | — |
| `elementBonus` | 属性增伤（`雪落无声之愿` 冷凝 25%） | `bonusDmg` | `elements:[element]` |
| `typeBonus` | 类型增伤（`追忆状态` 普攻 30%） | `bonusDmg` | `damageTypes:[damageType]` |
| `generalDeep` | 通用加深（`延奏·莫宁` 25%） | `deepenDmg` | — |
| `elementDeep` | 属性加深（`绯雪·延奏` 冷凝 20%） | `deepenDmg` | `elements:[element]` |
| `typeDeep` | 类型加深（`洛瑟拉·延奏` 效应 60%） | `deepenDmg` | `damageTypes:[damageType]` |
| `generalVulnerability` / `typeVulnerability` / `convergence` | 易伤（`雪锈` 霜渐 25%；集谐 `convergenceVuln` 12%） | `dmgTakenInc` | 类型易伤带 `damageTypes` |
| `elementResReduce` | 属性减抗（`洛瑟菈·全队·霜渐` 冷凝 8%） | `resDown` | `elements:[element]` |
| `generalDefense` / `elementDefense` / `typeDefense` | 无视防御（`荣光` 30% / `穗穗` 湮灭 6% / `再无我·共鸣解放` 10%） | `defPen` | 按各自 element / damageType |
| `offsetHarmonyEff` | 偏谐值累积效率（`莫宁` 50%） | `offTuneBuildupRate` | — |
| `multAdd` | **倍率追加**：「每层/每点/每超过X**增加**倍率 N%」（`命火` 劫魄 527.5 / 踏罡 541.25、`锯环残响` 每点 2.59%、`余响` 每层 82.55%） | `extraRatio` | — |
| `multBoost` / `multBoostExtra` | **倍率提升**：「××伤害倍率**提升** N%」（`坎特蕾拉·一链` 50%、`弗洛洛·1链` 80%、`景燃·2链` 46%、`卡提希娅·3链` 100%） | `specialFinal1` | — |

- 三个 `*Defense` **一律落 `defPen`**（实测样例都带 `defenseKind: 'ignore'`，即穿防）。
- ⚠️ **两个倍率类不是一回事**（原先都落 `extraRatio`，是错的）：
  - **追加**（`multAdd`）是往**倍率数值**上加 —— 工具箱 `extraRatio` 正是这个语义：
    `compute.ts` 里 `effectiveRatio = ratio + extraRatio / 100 × hits`；
  - **提升**（`multBoost`）是把**整段伤害**乘 `(1 + N%)` —— 工具箱里对应「特殊终伤(1)」：
    `compute.ts` 里 `customMult = 1 + specialFinal1 / 100`（同乘区加算，再乘进总伤害），
    这也是工具箱自己的命名口径（`ai/generate/prompts.config.ts`：普通相加语义的终伤/**倍率**用 `specialFinal1`）。
  - 差别在技能倍率越高越明显：「伤害倍率提升 50%」在 100% 倍率的招式上恰好等于「追加 50」，
    在 500% 倍率的招式上应是 ×1.5，而追加只会变成 550%（×1.1）——把提升当追加会**越算越少**。
  - 上游自己的文案就把这件事写明了：景燃 2 链（`multBoost` 46）
    「……伤害倍率提升46%；荧惑状态下【命火】对……的倍率增加效果提升46%
    （**即最终倍率=基础+命火，整体×1.46**）」—— 命火那条是 `multAdd`，这回过头印证了两者的分工：
    先追加（`extraRatio`）再整体乘（`specialFinal1`）。
  - 两者都**不挂 `damageType` 条件**：上游 `multBoost` 的 `damageType` 只是**概要**
    （卡提希娅 2 链「普攻、重击、闪避反击、变奏技能倍率提升50%」的 `dt` 写的是「普攻」），
    当成条件会把重击/变奏那几条挡掉；定位一律靠 `skillNames` → 条目名。
- `convergence` 落易伤区，依据 `core.js` 注释「集谐与陆·赫斯/达妮娅共用现有易伤计算」，且该 buff 只有 `convergenceVuln` 一个数值字段。

⚠️ **`damageTypes` 条件必须写全名**：工具箱的 `evaluateCondition` 拿它去比对
`inferDamageTypes()` 的返回值，而后者返回的是 `普攻伤害` / `效应伤害` 这种**带「伤害」后缀的全名**。
塞短名（`效应`）会永远匹配不上，条件乘区被静默判为不生效：

| 上游 `damageType` | 椰果 `condition.damageTypes` |
| --- | --- |
| `普攻` / `重击` / `共鸣技能` / `共鸣解放` | `普攻伤害` / `重击伤害` / `共鸣技能伤害` / `共鸣解放伤害` |
| `声骸` / `变奏` / `延奏` / `协同` | `声骸技能伤害` / `变奏技能伤害` / `延奏技能伤害` / `协同攻击伤害` |
| `效应` / `其它` | `效应伤害` / `其它类型伤害` |

### 1.3 数值折算（折算成最终数值写进 `zones[].value`）

一条 `effects[]` 的最终值：

```
if (stacks < fx.minStacks) 不计入              // UI 提示「≥N 层才计入」
if (member.resonanceUnlocked < fx.minResonance) 不计入   // 「共鸣链达到该值才计入」
if (valueMode === 'fixed') value = fx.value
else  // 'stack'
  stacks = skill.buffStacks[buffId] ?? globalBuffStacks[buffId] ?? 0   // 逐技能优先，回落到全局
  value = Σ_{s=1..stacks} perStackOf(s)
```

`perStackOf(s)`：取第一条满足 `upTo === null || s <= upTo` 的 `segments[].perStack`；
**超出最后一段 `upTo` 的层数不再提供每层值（0）**。
依据：露西那条 `segments:[{upTo:1,perStack:X},{upTo:MAX,perStack:Y}]` 配注释「1层+10%，2层再+5%，合计15%」。

⚠️ 最后那条「封顶」不能漏：`segments` 是**分段**曲线，`upTo` 是该段的层数上限。
`余响` 的 `multAdd` 是 `[{upTo:24, perStack:82.55}]`（「每层余响使本次伤害倍率额外增加」，
至多 24 层），而同一个 buff 的暴击伤害那段的 `upTo` 是 124 —— 余响在轴上记到 124 层时，
追加倍率应当停在 `24 × 82.55 = 1981.2`。若沿用「取最后一段」的旧写法，会一路涨到
`124 × 82.55 = 10236.2`，凭空多出 4 倍倍率。
（各层仍**逐层**落在产物里，只是 `≥25` 层的值都等于封顶值 —— 层数信息不能丢。）

一条 buff 的 `zones[]` = 它所有**计入**的效果条目；顶层单乘区 buff 视作只有一条效果。

⚠️ 椰果**没有叠层模型**（`BuffInstance` 上没有任何层数字段），`zones[].value` 就是最终值。
所以叠层 buff 按**一层一条**落（见 1.5），这里的「折算成最终数值」在产物里是**每层的值**。

### 1.4 作用范围与技能限定（已确认）

椰果 `BuffInstance.scope: 'all' | number[]`（站位索引；空数组 = 仅效应伤害）**没有「按技能限定」能力**，因此技能限定改由**绑定关系**表达：

| 上游 | 椰果 |
| --- | --- |
| 队伍级 `team.sharedBuffs.buffs[]` | `scope: 'all'` |
| 角色级 `members[i].buffs[]` | `scope: [i]` |
| `excludeSource: true`（延奏类，本人不吃） | `scope` 去掉 `sourceMemberIndex` 对应站位 |
| **`members[i].excludedTeamBuffIds[]`（「分配覆盖」取消勾选）** | `scope` 去掉该站位 |
| `effects[].skillScope === 'names'` | buff 本体照常写进 `zones`，但**只绑到**名称匹配的 `damageEntry`（`damageEntryBuffSetIds`） |
| `skillScope === 'all'` | 绑到 `scope` 覆盖**且条件命中**的全部伤害条目 |
| `onlyCharacterIds` / `onlyCombatModes` | 转换后为静态结果，直接体现在 `scope` 上 |

⚠️ **「提供的全队 Buff」面板里右侧头像下的勾选必须读**（上游 UI 叫「分配覆盖」，
玩家用它把「全程吃不到这条全队 buff」的角色取消掉）。数据落在
`members[i].excludedTeamBuffIds`（手动的那部分另存 `manuallyExcludedTeamBuffIds`），
读的时候两种 id 形态（原 id / `tm_` 副本 id）都要试。

漏读的后果实测过：`MC-JXUQZU` 里「弗洛洛·延奏」只勾了莫宁，产物却给 `scope: [1,2]`
（坎特蕾拉跟着吃了一份）；「坎特蕾拉·延奏」同理被莫宁白吃。
三条规则**叠加**：`excludeSource` → 去掉来源；`excludedTeamBuffIds` → 去掉取消勾选的；
**一个人都不剩时整条不落表**（椰果的 `scope: []` 是「仅效应伤害」，不能拿来表达空集）。

⚠️ **勾选要按条件判定，不能无脑全勾**。`damageEntryBuffSetIds` 就是拉表页每个格子的勾选状态，
所以只绑「真的对该条目生效」的组合 —— 复刻工具箱 `evaluateCondition` 的口径：
乘区只要有**任意一条**条件命中即算生效（属性条件比 `entry.damageElement`，类型条件比
`inferEntryDamageTypes(entry)`）。否则带属性/类型条件的 buff 会被勾到所有条目上，
看起来像「无条件全勾」，而实际只有命中的那几条会贡献数值。

⚠️ **队伍级 buff 的成员副本不能重复计入**。鸣算屋把队伍级 buff 复制进了成员列表
（`tm_<原 id>`），和 `team.sharedBuffs.buffs[]` 里的原始条目描述的是**同一批生效对象**：

| 形态 | 谁在用 | 带的信息 |
| --- | --- | --- |
| `sharedBuffs.buffs[].id`（原始 id） | `globalBuffActive` / `globalBuffStacks` | 多带 `excludeSource` / `sourceMemberIndex` |
| 成员列表里的 `tm_<原 id>` | 排轴逐技能态 `skill.buffActive` / `skill.buffStacks` | 副本内容与原条目一致 |

实测「尤诺·延奏」：原始条目 `excludeSource: true` + `sourceMemberIndex: 1` → 生效站位 `[0,2]`，
而副本恰好只出现在成员 0 和 2 的列表里 —— 两边等价。所以**以原始条目为准、丢掉 `tm_` 副本**，
查状态时两种 id 形态都试；两边都收会让固定段被算两次（工具箱的 buff 弹窗也会因为
`{#each}` 的 key 重复而抛 `each_key_duplicate` 直接崩）。

### 1.5 叠层 buff：用到的层数各一条，值是该层的累计值

椰果没有叠层模型（`BuffInstance` 上没有任何层数字段），`zones[].value` 就是一个最终值。
所以上游一层层叠上去的东西，只能**把轴上用到的每个层数各编译成一条 buff**：

```
祸兮福兮（每层 2.5%，上限 50 层），轴上用到 50 层
  → 祸兮福兮 50层    value = 125        # 2.5 × 50，该层的累计值
  → 绑到「该时点层数为 50」的伤害条目

苍白死光的祝颂（每层 4% 加深；2 链时满 10 层再 +40%），轴上用到 4/5/7/8/10 层
  → 4层 = 16、5层 = 20、7层 = 28、8层 = 32、10层 = 40+40 = 80
```

| 部分 | 落法 |
| --- | --- |
| 叠层段（`valueMode === 'stack'`） | 轴上**用到过**的层数各一条：`id = ${id}#L${n}`、`name = ${name} ${n}层`，`value` = 第 1..n 层的**累计值**（`Σ perStackOf(s)`，不是单层值） |
| 固定段（`valueMode === 'fixed'`） | 不拆层，一条；`minStacks` 当**绑定门槛**（`≥N 层`才生效） |
| 集谐模态 `convergenceVuln` | 单独一条易伤乘区 |

- 层数只取**轴上用到过的**：`maxStacks` 只是上限（祸兮福兮上限 50，但每条轴不一定用满），
  铺 `1..N` 更会凭空多出一堆空 buff。
- 绑定按「**恰好**等于该层」：值是这一层的累计值，所以只该给层数正好是它的条目吃；
  用 `≥` 会让 45 层的条目连 50 层那条一起吃掉。
- 层数达不成的条目（0 层）不吃任何一条；**一条都没用到的 buff** 仍然留一条
  `value: 0` 的占位条目在列表里（不然它在工具箱里会凭空消失），但**不勾选**。
- 该层未达 `minStacks` 的效果贡献 0（上游语义：≥N 层才计入）。
- `skill.buffStacks` / `phases[].buffStacks` 都不算数：上游多轮模式下会清空前者，
  层数的权威来源见 §2.3.2。

### 1.6 伤害类型（`damageEntryDamageTypes`）

拉表页每条伤害的「伤害类型」由工具箱 `resolveDamageTypes()` 决定：**先在
`damageEntryDamageTypes` 里查显式配置，查不到才自己推断**。推断规则靠技能名前缀与角色文案，
而鸣算屋带过来的技能名（`济善伐恶·普攻·苍剑式第一段`，现在是缩成短名之后的 `苍剑式第一段`）
对不上 `普攻·` 这类前缀；常态攻击里的重击招式也会被推成普攻。实测两个真实方案，
**78 / 251** 与 **15 / 251** 条条目的类型与上游不一致 —— 类型一错，所有带类型条件的乘区整体失效。

所以：**上游给了 `damageType` 就显式写下来**。

| 上游 | 椰果 |
| --- | --- |
| `普攻` / `重击` | `普攻伤害` / `重击伤害` |
| `共鸣技能` / `共鸣解放` | `共鸣技能伤害` / `共鸣解放伤害` |
| `声骸` / `变奏` / `延奏` | `声骸技能伤害` / `变奏技能伤害` / `延奏技能伤害` |
| `协同` / `效应` / `其它` | `协同攻击伤害` / `效应伤害` / `其它类型伤害` |

- 键是**排轴派生出的伤害条目 id**（§2.3.1 的公式），与 `damageEntryBuffSetIds` 同一套；
- **上游没给类型的条目不写**：留给工具箱按自己的规则推断（含依赖角色文案的规则 2），
  硬写一个「其它类型伤害」反而会把它挡掉；
- 拉表侧的绑定判定用同一份口径（`inferEntryDamageTypes()`）：有上游类型就用上游的，
  否则复刻工具箱的规则 1 / 3 / 4，保证「勾选状态」与「工具箱实际算的类型」一致；
- 非直伤（处决 / 响应 / 效应）不在这张表里：它们的 id 由工具箱自己派生，
  效应条目靠 `isEffect` 自动得到「效应伤害」。

### 1.7 一条 buff 只带一种乘区（拆分 + 重命名）

上游一条 buff 内部可以有**多个乘区**（`composite` 的 `effects[]` 各自带 `zone`），
椰果这边统一拆成「**一个变体一种乘区**」，好在拉表里单独勾选 / 单独改数值：

| 上游 | 椰果 |
| --- | --- |
| 同乘区 + 同条件 + 同技能限定的多条 `effects[]` | **合并**成一条（值相加） |
| 不同乘区（哪怕同一条 buff） | **各成一条**：`id = ${id}·${zoneId}`、`name = ${name}·${乘区中文名}` |
| 同乘区但技能限定不同（「命火」的劫魄 / 踏罡） | 各成一条，名字再带技能名消歧：`命火·额外倍率·劫魄` |

- **乘区后缀一律加**（不是只在拆分时加）：上游常有「同名的两条不同乘区 buff」——
  例如「冥途夜行之灯」的暴击率与热熔增伤 —— 不把乘区写进名字，拉表里两行同名条目根本分不清谁是谁；
- 拆出来的变体各自带自己那份 `condition`（元素 / 伤害类型）与技能限定；
- 顺带补齐了几个原本会被**整条丢掉**的乘区：`typeCritRate` / `typeCritDmg`（按类型的双暴）、
  `harmonyBreakAmp`（谐度破坏增幅）、`energyRegenPct`（共鸣效率）、
  `extraVulnerability`（最终伤害）。

例：`[武器] 召鬼呼星·承天` 拆成「·暴击伤害」（叠层，1/5/6 层）与「·暴击率」（固定 12%，
`minStacks: 6` + 重击条件）；`命火` 是两条 `multAdd`（劫魄 527.5 / 踏罡 541.25，技能名不同），
拆成「命火·额外倍率·劫魄」「命火·额外倍率·踏罡」。

### 1.8 面板加成也 buff 化（一切皆 Buff）

椰果工具箱只认三处数值来源：**角色基础面板 + 配置阶段的声骸主副词条 + 敌怪**。
其余一切都得由 Buff 贡献 —— 所以上游面板里工具箱算不出来的部分要编译成 Buff，
否则导入后凭空少一截数值。

| 上游来源（`members[].char.*Sources[]`，按 `id` 判） | 处理 |
| --- | --- |
| `*_base`（基础属性） | 跳过：工具箱按角色数据自己算 |
| `echo_agg_total` / `echo_panel_*` | 跳过：声骸主副词条 → 配置阶段（`config.ts`） |
| `echo_main_panel_*`（**主位声骸的专属被动**，`主位·冷凝伤` / `主位·共鸣解放伤加成` / `主位·共鸣效率`） | **buff 化**：工具箱的声骸数据只有主副词条，没有这条被动 |
| `weapon_panel_sub`（武器副词条） | 跳过：工具箱按武器数据自己算 |
| `char_kit_panel_*`（角色固有 / 共鸣链分支，如**阳变阴合 +1800 攻击固定**） | **buff 化** |
| `echo_set_panel_*`（声骸套装面板部分，如「冥途夜行之灯 2 件 生命 +10%」） | **buff 化** |
| `weapon_panel_*_passive`（武器被动） | **buff 化** |
| `char_def_harmony_break_amp`（本体属性·谐度破坏增幅，恒为 10） | **跳过**：特殊规则，见下 |
| 其它未知来源 | **buff 化**（宁可多一条，也别悄悄少数值） |
| 值为 0 的来源（上游的「来源1」空行） | 跳过 |

⚠️ **`echo_main_panel_*` 不是「声骸主词条」**（这条曾经被当成主词条跳过，症状就是
「绯雪的『主位·冷凝伤』转换后不见了」）。扫过 30 个工程共 13 种 id，全部是**主位声骸的专属被动**
—— 即声骸说明里那句「**在首位装配该声骸技能时，自身XX伤害加成提升N%**」：

| id | 名字 | 值 |
| --- | --- | --- |
| `echo_main_panel_attr_冷凝` | 主位·冷凝伤 | 12（绯雪 / 洛瑟菈） |
| `echo_main_panel_attr_气动` / `…_气动_bonus` | 主位·气动伤 / （专属） | 10 + 10（卡提希娅） |
| `echo_main_panel_type_声骸` | 主位·声骸伤加成 | 20（弗洛洛） |
| `echo_main_panel_type_共鸣技能` | 主位·共鸣技能伤加成 | 16（今汐） |
| `echo_main_panel_stat_energyRegenPct` | 主位·共鸣效率 | 10（莫宁 / 坎特蕾拉） |

它们与配置阶段写进去的主词条**值域完全对不上**（暴伤 44 / 属性伤 30 / 共鸣效率 32 / 攻击% 18…），
莫宁甚至同时有「共鸣效率主词条 32×2」与「主位·共鸣效率 10」两条；
主副词条的合计另由 `echo_agg_total` / `echo_panel_*` 表达 —— **那两条才是走配置阶段的**。
映射沿用同一套：`attr_<元素>` → `bonusDmg + elements`，`type_<类型>` → `bonusDmg + damageTypes`，
`stat_*` 按它所在的 `*Sources` 键落对应乘区（`energyRegenPctSources` → `recharge`）。

- 产物 id 形如 `panel_${站位}_${来源id}`（带站位，两个角色戴同一套装也不会撞 id）；
- 名字形如 `阳变阴合·攻击固定值`、`生命提升10%·生命百分比`；
- `scope` 是**该站位自己**（面板加成只作用于这个角色打出的伤害）；
- 元素 / 伤害类型类的增伤来源会把条件写进乘区（`重击伤害加成 → bonusDmg + 重击伤害`）。

对照椰果工坊的 Buff 库（`GET {工坊}/api/buff-sets`）可以印证这条路线：工坊自己也是把
「套装 2 件」「套装 5 件每层」「角色固有」统统做成 Buff（如「冥途2 10生命」「冥途5 叠盾 暴击1层」）。

#### 1.8.1 特殊规则：例外由 `special-rules.ts` 单独管

默认口径是「除了声骸主副词条和敌怪，一切都 buff 化」，但上游把少数**角色固有基数**
也当面板来源列了出来 —— 照默认口径 buff 化会和工具箱自己的基数**算两遍**。
这类例外集中写在 `src/convert-project/special-rules.ts`，每条一个 `SpecialRule`
（`id` + `reason` + `match`），`panel.ts` 在落表前调 `shouldSkipPanelSource(source, kind)`。

| 规则 id | 命中 | 为什么丢 |
| --- | --- | --- |
| `char-def-harmony-break-amp` | `harmonyBreakAmpSources` 里的 `char_def_harmony_break_amp`（`<角色>·本体属性·谐度破坏增幅`，值 10、`locked: true`） | 工具箱角色数据自带：`nanoka/utils.ts` 里 `baseStats.tuneBreakBoost = hasTune ? 10 : 0`，`compute.ts` 直接读 `lv90BaseStats.tuneBreakBoost` —— 再 buff 化就是同一份 +10 算两遍 |

- 命中判据取 `id`（上游稳定标识），并在同键下用「`char_def_` 前缀 + 名字含`谐度破坏增幅`」兜住换 id 的形态；
  只有 `harmonyBreakAmpSources` 这一键参与兜底，不会误伤别的 `char_def_*`；
- **只挡面板来源**：`echo_set_team_fx_*` 之类真正的 Buff（哪怕乘区也是 `harmonyBreakAmp`）不走这条规则，照常 buff 化；
- 真面板加成照旧保留：莫宁 `char_kit_panel_moning_offset_harmony_eff`（偏谐累积效率 +50）、
  `char_kit_panel_moning_innate_er`（共鸣效率 +10）、`*_branch_*` 等都在产物里。

### 1.9 归属门：参考本体 / 参考武器 / 参考某人的共鸣链

工具箱左侧 Buff 列表的**二级目录**是按 buff 的链/阶硬性条件分的（`buff-tree.ts`）：

| 门 | 目录 |
| --- | --- |
| `condition.chains: [{ charIdx, min: 0 }]` | `角色名本体` |
| `condition.chains: [{ charIdx, min: N }]` | `角色名N链` |
| `condition.refinements: [{ charIdx, min }]` | `角色名的武器名`（按角色 + 武器分，不按阶数） |

所以每条产物 buff 都要把「它是谁的、哪一档」写进门里：

| 上游 | 门 |
| --- | --- |
| `pk_…` / `tb_…` / `sourceTag: 'characterTemplate'`（角色本体） | `chains: [{ charIdx: 站位, min: 链档 }]` |
| `weapon_fx_…` / `weapon_team_fx_…` / 带 `weaponId`（武器） | `refinements: [{ charIdx: 站位, min: 0 }]` |
| 声骸 / 套装（`echo_…`） | 不加门（工具箱按名字数字归并） |

- 站位：成员级 buff 用 `ownerIndex`；队伍级用 `sourceMemberIndex`，再退到 id 前缀
  （`pk_0_` / `tb_1_` / `weapon_team_fx_2_`）；
- **链档不写在 `minResonance` 上**：实测「【本体】4链·清宵」「`pk_0_qingxiao_c3_wanwu_mult`」
  的 `minResonance` 都是 0，档位藏在 `templateKey`（`qingxiao_c4_team_atk`）、id 与名字（`4链`）里
  —— 三者都扫一遍，取 `max(名字里的档, 效果上最小的 minResonance)`；
- 取**最小** `minResonance`：只要有一段不受链约束，这条就是「本体」
  （尤诺「苍白死光的祝颂」里那段 `minResonance: 2` 只是本体 buff 的一部分）；
- `min: 0` 也是工具箱自己的口径（`condition.ts` 的 `withOwnerBodyGate`）：链 = 角色共鸣链，
  0 链即本体，`≥0 链` 恒成立，不会把效果挡掉。

---

## 二、排轴 · 转换规则（已确认）

### 2.1 数据源

| 内容 | 来源 |
| --- | --- |
| 轴上的技能清单（直伤） | `members[i].phases[].skills[]`（数组顺序即轴顺序），每条 `catalogId` 指向 `rotationCatalog` |
| 时间（像素偏移） | `rotationCatalog[].axisOffsetPx` |
| 非直伤（处决 / 响应 / 效应） | `specialSkills.items[]`（按 `sourceRosterSlot` 归站位、`linkedCatalogId` 定位置，见 2.4） |
| 多段倍率构成 | `rotationCatalog[].multComponents[]`（`{ rate, count }`，见 2.3.3） |
| 技能库名 | `rotationCatalog[].librarySkillName` |

实测 `MC-KJ8VZL`：member0 的 `skills[]` 15 条 + 未被引用的 3 条（`处决` px=349、`绯雪·额外效应` px=875、`绯雪·额外效应6c` px=998）= `rotationCatalog` 18 条。

### 2.2 时间换算

```
秒 = axisOffsetPx / 40
```

实测 member0 最大 `axisOffsetPx = 998` → `998 / 40 = 24.95s ≈ team.axisDuration = 25s`。
每个角色都有自己的 `rotationCatalog`，即各自的轨道。

**椰果的 `pos` 不代表真实时间**（工具箱早期遗留），因此 `pos` 只用来表达**先后顺序**；`RefLine.time` 写**相对上一参考线的增量**，形如 `+25s`。

### 2.3 映射规则

| 目标 | 规则 |
| --- | --- |
| 轴条目集合 | `skills[] ∪ 未被引用的 rotationCatalog 条目`；**每轮都铺出来**（见 2.5） |
| **条目顺序** | **按站位分组**：1 号位的倍率全部排完，再排 2 号位、3 号位，最后补该轮的轴长参考线。站位内部按各自 `axisOffsetPx` 升序（直伤与非直伤混在同一条轴顺序里） |
| `refLines` | **骨架用参考线**（不是 `opBlocks`）：**每个技能一条 + 每轮边界一条 + 末尾「结束」一条**；技能本体与它的「（额外）」条目共用一条线；只有轮边界（`+Ns` 轴长）与收尾（`结束`）带标签 |
| `opBlocks` | **不生成**：鸣算屋的轴没有按键信息，凭空造 op 只会给出错误的手序 |
| `damageBlocks` | 一条伤害一块（**一个技能一块**，原始复合倍率 `baseMult` 写进同一条 `ratio`，见 2.3.3）；`sourceType: 'ref'`，`sourceId` = 该条所在**轮次**的参考线 id |
| `damageBlocks[].trackIndex` | **固定为 `getTRACKS().length - 1`（末轨「伤害绑定」）**。工具箱只渲染末轨的伤害块，挂到角色轨上等于不可见（`timeline-damage-overlay.svelte`）；角色归属由 `skillHits[].character` 表达 |
| 直伤 | `skillHits: [{ hitName, skillType, ratio, element, character, hits }]`（每块一条，ratio 写**整个技能**的倍率） |
| 处决 / 响应 / 效应 | `nonDirectEntries: [{ name, category: '处决'\|'响应'\|'效应', layers, hits }]`，**不进 `skillHits`** |
| `ratio` 名称 | **鸣算屋轴上的短名**（`skills[].name`），不补段号（见 2.3.4） |
| `hits` | 技能自己的 `multCount`（`ratio` 已是 `baseMult` 总倍率） |

⚠️ **不跨站位按时间混排**。同一条轴上同一时间点站着三个人，按秒数混排会让人完全分不清
哪一段是谁的；按站位分组后，读轴就是「这个人打完了轮到下一个人」。轮次之间的顺序不变
（仍然是轮 1 → 轮 2 → …），每轮末尾就是该轮的轴长参考线。

### 2.3.1 `ratio` 字符串与伤害条目 id（关键）

工具箱在 `buildDamageEntriesFromTimeline()` 里**按规则重算**伤害条目：

```
直伤:   `${damageBlock.id}-${skillType}|${hitName}#${baseType}`   每个 baseType 一条；纯数值分段落 `#固定`
响应:   `${damageBlock.id}-nd|${name}#${responder}`               responders 一人一条
处决/效应: `${damageBlock.id}-nd|${name}`
```

`baseType` 由 `ratio` 字符串推导（`parse-value-string.ts`）：

- 无后缀 → `攻击`（`SUFFIX_MAP['']`）；
- `%生命` / `%防御` → 取后缀 —— 所以**生命 / 防御缩放的技能必须在 ratio 上带后缀**
  （`15.85%生命`），否则既算错伤害，id 也会落到 `#攻击` 上；
- 纯数值分段 → `固定`。

`damageEntryBuffSetIds` 的键必须与上式**逐字符一致**，否则拉表页的 buff 绑定全部对不上（表现为「buff 不勾选、结果页无 buff」）。本仓库有 `ratioBaseTypes()` 复刻该判定，并用真实工程交叉验证过（38 / 52 条条目 100% 命中）。

`hitName` 的取法见 2.3.4（**短名**），它同时决定条目 id，所以与显示无关地，**id 也跟着短名走**。

### 2.3.2 逐技能层数从哪来（关键）

层数的权威来源是**技能目录条目上的层数**，口径复刻上游 `getCatalogResolvedStacks()`：

```
resolved = { ...globalBuffStacks（缺省 0）, ...该技能目录条目的层数 }
```

| 模式 | 层数存哪 |
| --- | --- |
| 多轮（`cycleConfig.enabled`） | `cycleConfig.rounds[r].catalogStacks[catalogId][buffId]`（**每轮各一份**，同一 buff 在不同轮可以是不同层数，如 72 / 92） |
| 单轮 | `rotationCatalog[].stackLayers[buffId]`（上游关掉多轮时会把前者搬到这里） |

⚠️ **`skill.buffStacks` / `phases[].buffStacks` 不是主源**。上游在切到多轮时会清空它们
（源码注释：「多轮：层数走轮次 catalog layers，时间线技能不存叠层快照」），
残留的旧值会让「祸兮福兮 50 层」读成 0 层、「锯环·终结 72 层」读成 52 层。
所以：**工程里有 catalog 层数时就只认那一份**，完全没有（老格式）才退回阶段 / 技能级快照。

`buffActive` 仍是逐技能的开关（`skill.buffActive[buffId]`，缺失回落到全局），
和层数各管各的：层数记着但 `buffActive: false` 的技能不会被勾选。

### 2.3.3 一个技能一条原始复合倍率（关键）

上游一个技能段的倍率是**分段**构成的（`rotationCatalog[].multComponents`），
而 `baseMult` 就是上游算好的**原始复合倍率 / 总倍率**（`= Σ rate × count`）：

```
新世界狂想曲·亡与死的乐章   37.88% × 4 段 + 117.83% × 3 段      baseMult 505.01
生与死的乐章·谱曲终末      33.01% × 2 + 12.38% × 8 + 495.1% × 1  baseMult 660.16
```

**不拆段，直接把 `baseMult` 原样写成一条 `ratio`**（不自己重排分量）：

| | 上游 | 产物 |
| --- | --- | --- |
| `damageBlocks` | — | 1 块 / 技能 |
| `skillHits[].ratio` | `baseMult = 660.16`（构成 `33.01%×2 + 12.38%×8 + 495.1%×1`） | `660.16%` |
| `skillHits[].hits` | `multCount` | `multCount` |

- 工具箱 `ratioValue = Σ(rate × mult) × hits`，所以**总伤害与拆开逐段时一致**
  （都是 `baseMult × multCount`）；写成 `33.01%*2+12.38%*8+495.1%` 也是一样，
  但用户看到的就是上游那一个复合倍率 `660.16%`，不会多出一堆同名行；
- 只有 `baseMult` 缺失 / 为 0（老格式）时才退回 `multComponents` 求和；
- **只有追加倍率（上游 `multAdd`）另开「（额外）」条目**：它的倍率是技能级的一次性追加，
  不能跟技能本体一起被乘 `hits` —— 见 2.3.6；
- 技能本体与「（额外）」条目**共用同一条参考线**（`AxisItem.groupKey`）：
  同一瞬间的同一招，各占一条线会凭空造出「这一招打了三次、间隔还不一样」的假时间；
- 技能本体带着原始技能名（`CoconutDamageEntry.skillNames`），所以按技能名限定的 buff
  会照常绑上。

### 2.3.6 追加倍率单开「（额外）」条目（关键）

上游的 `multAdd` 是**技能级**的一次性追加（命火 527.5%、余响每层 82.55% 至多 24 层 =
1981.2%、锯环残响每点 2.59%），而工具箱的 `extraRatio` 是**逐命中**加算：

```
effectiveRatio = ratio + extraRatio / 100 × hits      // compute.ts
```

**技能本体也不行**：它虽然只有一条，`hits` 仍是技能自己的命中数（`multCount`），
追加倍率跟着它走就会被乘 `hits` 倍 —— 算出来是 `base + extra/100 × hits`，
而不是 `base + extra/100`。余响每层 +82.55%（至多 24 层 = 1981.2%）按每命中算，
谱曲终末 11 段就是 `1981.2 × 11 ≈ 21793%`，显然不对。

**做法**：给每个带追加倍率的技能补一条 **`（额外）` 条目**：

| 字段 | 值 |
| --- | --- |
| `hitName` | `<技能短名>（额外）`（如 `Z劫魄（额外）`、`谱曲终末（额外）`） |
| `ratio` | `0.0000000000001%`（≈0；**不能写 0**，否则 `parseValueString()` 直接返回空数组，条目会消失），带与技能一致的缩放后缀 |
| `hits` | `1` |
| 参考线 | 与技能本体**同组共用**（`groupKey`），轴不会因此变长 |

追加倍率类 buff **只挂到它上面**（`CoconutDamageEntry.extraRatioKeys` 记 `buffId` + 层数 +
效果点名的技能键，拉表阶段据此匹配），于是「每条目加一次 × `hits` 恒为 1」正好等于
「每个技能加一次」。其余乘区不受影响：增伤 / 加深 / 暴击 / 穿防照旧绑到技能本体，
按技能名限定的 buff 也照样绑到 `（额外）` 条（它的 `skillNames` 里带着原技能名）——
追加的倍率属于这个技能的伤害，该吃的增伤一分不少。

三个易错点（都有单测）：

- **同一条 buff 可以有多条 `multAdd` 效果**：命火就是 `重击·劫魄 527.5%` +
  `重击·踏罡 541.25%`，收集时一条都不能漏，且匹配键要带上「效果点名的技能」，
  否则两个技能会互相抢对方的条目（实测会出现 劫魄/踏罡 双双绑到同一行的双算）；
- 效果点名的名字与轴上短名可能对不上（`劫魄` vs `Z劫魄`），匹配用条目的
  `skillNames`（短名 + 目录名 + 技能库全名）；
- 「分配覆盖」（`excludedTeamBuffIds`）与逐技能开关（`buffActive`）在排轴阶段也要看，
  否则会为「其实不吃这条 buff」的技能建出空行。

### 2.3.4 倍率名：短名（用户看到的就是它）

工具箱的排轴/拉表显示的名字**由 `hitName` 现算**（`displayName = hitName + '(' + skillType + ')'`），
所以想让用户看到的名字变短变清楚，只能改 `hitName` 本身：

| 规则 | 例子 |
| --- | --- |
| 用**鸣算屋轴上的短名**（`skills[].name`），不用技能库全名 | `亡与死的乐章`（不是 `新世界狂想曲·亡与死的乐章`） |
| 一个技能只落一条，**不补段号** | `谱曲终末`、`广域观测模式第三段` |
| **装备声骸技能**改用工具箱自己的叫法 `伤害N` | `梦魇·赫卡忒·伤害1(声骸技能)`（不是 `梦魇·赫卡忒·梦魇·赫卡忒`） |
| 短名缺失时依次退回目录名 → 技能库全名 | |

- 名字里自带的「第N段」是**招式本身**的第几段（`广域观测模式第三段` = 这套普攻的第 3 击），
  原样保留，不做倍率段号；
- **id 的唯一性不靠名字**：每个技能各占一个伤害块（`blockId` 不同），
  所以两个技能同名也不会撞 id（实测 440 条条目 id 全唯一）；
- 代价是**名称匹配**：上游 buff 用 `librarySkillNames`（全名）限定技能，短名比不中。
  于是在派生条目上多带一份 `skillNames`（短名 + 目录名 + 技能库全名），
  拉表阶段用 `variant.skillNames ∩ entry.skillNames` 匹配（`calculation.ts`）。
  这份名单只在转换器内部用，**不进产物**（工具箱只按 id 查 `damageEntryBuffSetIds`）。

### 2.3.5 `skillType`：`声骸技能` = **装备声骸的技能**，不是「声骸技能伤害」

工具箱的 `声骸技能`（`SKILL_TYPE_ECHO`）是**技能归属**，不是伤害类型：
技能选择器单独给它一个「装备声骸技能」分组（`appendEchoSkillToCache()` 按 `team[i].echoes[0].name` 取），
伤害类型规则 2 只对 `skillType === '声骸技能'` 的条目去查首位声骸的文案（`skill-infer.ts`），
显示时也**只有**这类条目会被自动拼上 `echoes[0].name·` 前缀。

上游把「谁打出的」和「算哪种伤害」混在一个 `damageType` 里：弗洛洛的
`普攻·赫卡忒第一段` / `强化攻击·彩乐·赫卡忒` 也标 `声骸`（这些伤害**确实**是声骸技能伤害），
但招式是她自己的。一律落 `声骸技能`，工具箱就会给它们统统加上装备声骸（`梦魇·赫卡忒`）的前缀 ——
看着像声骸的技能，其实不是（实测弗洛洛一个角色就有 4 类、几十条这样的行）。

所以 `damageType: '声骸'` 时先看**名字里有没有招式类别**：

| 名字 | `skillType` | 显示 |
| --- | --- | --- |
| `声骸·梦魇·赫卡忒`（上游给装备声骸技能的固定前缀）、轴上的 `Q` | `声骸技能` | `梦魇·赫卡忒·伤害1(声骸技能)` |
| `往日深渊的圆舞曲·普攻·赫卡忒第一段` | `常态攻击` | `普攻·赫卡忒第一段(常态攻击)` |
| `…·强化攻击·彩乐·赫卡忒` | `常态攻击` | `强化攻击·彩乐·赫卡忒(常态攻击)` |

装备声骸技能的行名走 2.3.4 的 `伤害N` —— 工具箱显示时会拼「装备声骸名·」，
行名再用声骸名就变成 `梦魇·赫卡忒·梦魇·赫卡忒`；而工具箱原生工程里声骸技能的命中名
本来就是 `伤害1` / `伤害2`（`nanoka/utils.ts` 的 `makeEchoSkillValues()` 逐个 damage 条目命名）。
序号取**倍率分量的序号**，实测与椰果声骸库一一对应：

| 上游 | 椰果声骸库（`GET {工具箱}/api/v1/info/echo/{声骸名}`） | 产物行名 |
| --- | --- | --- |
| `声骸·梦魇·赫卡忒` 一段 `152.38%×3` | `[["伤害1","152.38%","湮灭"]]` | `伤害1`（`hits=3`） |
| `声骸·绝息魄` 一段 `91.18%×3` | `[["伤害1","91.18%","导电"]]` | `伤害1` |
| `声骸·无归的谬误（短按）`（无分量，`baseMult=15.85`） | `伤害1 15.85%生命 / 伤害2 1.58% / 伤害3 19.82%` | `伤害1` |
| `声骸·迷胧幻蛾（短按）`（无分量，`baseMult=405`） | `伤害1 405% / 伤害2 49.33%` | `伤害1` |

招式词表见 `ACTION_SKILL_TYPES`（强化重击 / 强化攻击 / 闪避反击 / 空中攻击 / 共鸣技能 /
共鸣回路 / 共鸣解放 / 延奏 / 变奏 / 重击 / 普攻，长的先匹配）。
**伤害类型不受影响**：`声骸技能伤害` 由拉表阶段的 `damageEntryDamageTypes` 显式落
（上游给了 `damageType` 就一定写），与 `skillType` 各管各的。
实测扫过 6 个工程：所有 `damageType: '声骸'` 的技能只有两类 —— 装备声骸技能（`Q` / `声骸·…`）
与弗洛洛的赫卡忒招式，这条规则不会误伤。

### 2.4 非直伤（处决 / 响应 / 效应）映射

**数据源**：`payload.data.specialSkills.items[]`（不是 `rotationCatalog`），通过 `linkedCatalogId` 关联回轴上的位置。

用「露丽莫」（露西/丽贝卡/莫宁）与「爱达千」（爱弥斯/达妮娅/千咲）两侧真实工程交叉比对得出：

| 上游字段 | 椰果字段 | 说明 |
| --- | --- | --- |
| `kind: 'execution'` + `name: '处决'` | `{name:'谐度破坏', category:'处决'}` | 椰果处决只有这一个规范名 |
| `kind: 'execution'` + `name: '骇破响应·xxx'` | `{name:'骇破响应', category:'响应'}` | 名称前缀归一 |
| `kind: 'effect'` + `effectType: '聚爆'` | `{name:'聚爆效应', category:'效应'}` | `${effectType}效应` |
| `effectLayers` | `layers` | 效应有效；处决/响应恒 `0` |
| `effectCount` | `hits` | |
| `characterId` → `specialSkills.characters[].name` | `responders: [角色名]` | 仅处决/响应带 |
| `sourceRosterSlot` / `linkedCatalogId → axisOffsetPx` | 决定落在哪条参考线上 | |

椰果侧的规范词表（`NON_DIRECT_CONFIGS`，共 9 个名字）：

```
处决: 谐度破坏
响应: 震谐响应、骇破响应
效应: 光噪效应、风蚀效应、霜渐效应、聚爆效应、电磁效应、虚湮效应
```

- 处决 / 响应 `max: 0` → **`layers` 恒为 0**；效应有层数上限（19 / 12 / 9），`layers` 才有效。
- 实测样例：露丽莫 `{name:"谐度破坏",category:"处决",layers:0,responders:["露西"]}`、`{name:"骇破响应",category:"响应",layers:0,responders:["露西","丽贝卡"]}`；爱达千 `{name:"聚爆效应",category:"效应",layers:13,hits:5}`。

### 2.5 多轮（`cycleConfig.rounds`）—— 有多少轮转多少轮

上游一个方案可能排了多轮循环（`cycleConfig.rounds[]`，每轮有自己的 `duration` 与轴条目），
但**只有 `activeRound` 那一轮的轴数据是完整的**（`members[].phases` 只存当前轮）。

转换口径：**不丢信息** —— `rounds` 有几轮就铺几轮，按轮次顺序首尾相接：

- 每轮开头插一条参考线，`time` 标签是该轮轴长（`+23s` / `+25s` …），
  这样在排轴页一眼能看出轮边界与各轮长度；
- 轮内条目按各自 `axisOffsetPx` 排序后追加，**每轮内部各自排序**再拼接
  （不能全局排序：上游 px 是轮内坐标，跨轮同 px 会把不同轮的条目掺在一起）；
- **每轮必须用它自己的 `rotationCatalog`**：`phases[].skills[].catalogId` 只在轮内自洽，
  拿顶层 `members[].rotationCatalog`（那是 `activeRound` 的目录）去查其它轮会**全部落空**，
  于是技能退化成轴上的短别名（`苍A1`）、技能库名 / 多段倍率 / `axisOffsetPx` 一起丢
  —— 拉表里按技能名限定的 buff 也就一条都绑不上。非直伤同理，用该轮的 `specialSkills`。
- 轮边界按**条目序号**切分（`endIndex`），不按秒数 —— 秒数换算是近似值，
  累积误差会把边界落到错误的条目上；
- 只有轮边界与末尾「结束」线带标签，轮内不再生成参考线。

### 2.5.1 参考线位置（pos 与 time）

- `pos` **不代表真实时间**（工具箱早期遗留），只作排序键与视觉间距；
- **参考线等距**排布，固定步长 `REF_LINE_STEP = 120`；条数多时等比收窄，
  保证整轴落在工具箱 `MAX_POS`（`SIDE_PAD + MAX_TIME * PPS` = 10848）内：

```
step  = min(120, floor(MAX_POS / (条数 + 2)))
pos_i = i × step
```

- 轮边界线写**该轮轴长**（`+23s` / `+25s` …，来自 `cycleConfig.rounds[].duration`），
  末尾「结束」线写 `结束`；轮内不再生成参考线，所以这些标签就是布局里唯一的刻度；
- **末尾追加一条「结束」参考线**（`{ id: 'end', time: '结束' }`，与工具箱默认的 `right` 线同款）把轴收口。

### 2.6 参考线时间的来源

轴条目按 `axisOffsetPx / 40` 得到真实秒数，只用来排序（以及换算轮长标签），不参与 `pos` 计算。
`40px/s` 是实测近似值（不同方案略有出入），所以它**不能**用来切轮边界 —— 切分按条目序号做。

### 2.7 环境配置：100 级 Boss

上游 `team` 只给 `monsterLevel` / `monsterRes`（实测社区工程都是 **100 级 / 20 抗**），
**不给怪物类型**。而工具箱的 `enemy.type` 是会改数值的：处决 / 响应 / 效应走系数基类公式，
偏谐系数按类型取（`compute.ts` 的 `TUNE_COEFF_MAP`：**BOSS 10027** / 精英怪 2149 / 小怪 716.2）。
鸣算屋那边的处决口径按 Boss 算，所以转换时固定落 **`BOSS`**（不是工具箱默认的「精英怪」），
等级缺省同样是 100 级；防御按工坊同款公式 `792 + 8 × level`（100 级 → 1592），抗性按元素均摊。

---

## 三、下载接口的可靠性（502 / 504）

上游详情接口 `GET /api/schemes/{code}` 单条 ~1MB、实测 **27~66s**、且偶发 502/504，
并且**上游自己不缓存**（同一 code 连打两次，第二次反而更慢）。所以三层保护都在我们这侧：

| 层 | 机制 | 效果 |
| --- | --- | --- |
| ① 边缘缓存 | 转换后的工程文件（约几 KB）按分享码缓存到 `caches.default`，新鲜期 10 分钟 | 重复下载从 **42s → 1ms** |
| ② 快速失败重试 | 总尝试 2 次；**单次耗时超过 15s 就不再重试**（慢失败重试只会让等待翻倍） | 连接重置这类秒级故障可自愈 |
| ③ 兜底旧副本 | 缓存保留 24 小时；上游最终还是失败时返回旧副本，响应带 `x-project-cache: stale` | 把 502/504 变成一次可用下载 |

注意点：

- 缓存键**必须拼在 Worker 自己的 origin 上**（`caches.default.put()` 按 zone 生效，用外部域名会被拒），
  所以路由把 `url.origin` 传给了处理器；
- 缓存存的是**转换产物**而不是上游原始 1MB 响应——体积小、命中即用、且不受上游改版影响；
- 运行时不提供 Cache API 时（Deno 单测）后端降级为 no-op，可用 `setProjectCache()` 注入内存实现。

### 3.1 名称表（武器 / 套装 / 声骸）拉不到时的降级

队伍配置里的**武器名**与**触发套装名**只能靠运行时名称表（`weapons.json` / `echo-sets.json` /
`echo-catalog.json`）从上游给的 **id** 反查（上游 payload 里只有 id）。表拉不到时按「名称缺失」降级，
产物本身仍可导入 —— 但用户看到的正是「队伍配置页上武器 / 触发套装两格空白」，
所以这块必须**别让一次抖动固化下来**：

| 措施 | 原因 |
| --- | --- |
| 每张表失败**重试一次**（间隔 300ms） | 三张静态小文件被同时抖掉的概率不低，重试成本几乎为零 |
| 三张表**全空**时**不写缓存**，响应带 `x-project-tables: empty` | 否则这份「没有武器名」的产物会被缓存 24 小时，期间怎么下都是空的 |
| 缓存条目带 `degraded` 标记，命中时**不算新鲜**（重新转换） | 放过已经被写进去的降级产物（历史版本写过） |

单测覆盖两条路径：表全挂时不写缓存且下次恢复正常；缓存里是降级产物时重新拉上游。

**无法解决的部分**：首次冷启动仍然要等上游那几十秒。那一段是鸣算屋服务端按需重算快照的耗时，
我们只能缓存、重试、兜底，改不了它的速度。

## 四、覆盖度

椰果 25 个乘区里，**上游有对应来源**的 13 个：

```
atkPct defPct critRate critDmg bonusDmg deepenDmg
dmgTakenInc resDown defPen extraRatio specialFinal1 offTuneBuildupRate
```

**上游没有来源**的（转换后必然为空，不是漏转）：

| 椰果乘区 | 说明 |
| --- | --- |
| `atkFlat` `hpFlat` `defFlat` | 固定值类，鸣算屋把白值放在 `char.*Sources` 面板而不是 buff |
| `hpPct` `recharge` | 无对应 `category`（共鸣效率只出现在面板来源里） |
| `tuneBreakBoost` | 谐度破坏增幅：只以面板来源 `<角色>·本体属性·谐度破坏增幅` 出现，且按 §1.8.1 特殊规则跳过（工具箱自带基数） |
| `finalDmg` `specialFinal2` | 终伤 / 特殊终伤(2)（连乘语义，上游没有「与其它效果相乘」的写法） |
| `resPen` `dmgRedPen` | 穿抗、穿免 |
| `tuneStrainLayer` `unisonBoonLayer` | 层数类独立终伤 |

注：上表说的是**上游 buff 的 `category`** 有没有对应来源。其中 `atkFlat` / `hpFlat` / `defFlat` /
`hpPct` / `recharge` 虽然在 buff 里没有来源，却会从**面板来源**补上（§1.8 的 `panel_*`）；
`tuneBreakBoost` 的面板来源则被 §1.8.1 的特殊规则挡掉，产物里应当为空。
`specialFinal1` 来自 `multBoost`（倍率提升，§1.2）。
