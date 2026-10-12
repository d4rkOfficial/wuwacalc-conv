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
| `multAdd` / `multBoost` / `multBoostExtra` | 倍率追加 / 倍率提升（`锻雪·归刃`、`绯雪·1链` 120%、`达妮娅·2链·放逐` 40%） | `extraRatio` | — |

- 三个 `*Defense` **一律落 `defPen`**（实测样例都带 `defenseKind: 'ignore'`，即穿防）。
- 三个倍率类 **一律落 `extraRatio`**（`core.js` 注释「与其它倍率提升叠加」）。
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

`perStackOf(s)`：取第一条满足 `upTo === null || s <= upTo` 的 `segments[].perStack`。
依据：露西那条 `segments:[{upTo:1,perStack:X},{upTo:MAX,perStack:Y}]` 配注释「1层+10%，2层再+5%，合计15%」。

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
| `effects[].skillScope === 'names'` | buff 本体照常写进 `zones`，但**只绑到**名称匹配的 `damageEntry`（`damageEntryBuffSetIds`） |
| `skillScope === 'all'` | 绑到 `scope` 覆盖**且条件命中**的全部伤害条目 |
| `onlyCharacterIds` / `onlyCombatModes` | 转换后为静态结果，直接体现在 `scope` 上 |

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

### 1.5 叠层 buff：一层一条

真实工程（工坊 `2CDs8kRG`）就是这么存的：同一族 buff 每条写「每层」的值
（`暴击1层` / `暴击2层` …），再按该层在轴上的生效区间逐条勾选。

| 部分 | 落法 |
| --- | --- |
| 叠层段（`valueMode === 'stack'`） | 拆成 `#L1`、`#L2` …，`id = ${id}#L${n}`、`name = ${name} ${n}层`，`zones[].value` = **第 n 层**的值（`perStackOf(n)`，不是前缀和） |
| 固定段（`valueMode === 'fixed'`） | **单独一条**（`id` 不加后缀、`layer: 0`），不受层数门槛约束 |
| 集谐模态 `convergenceVuln` | 跟着固定段那条走，不参与拆层 |

- **层数取轴上实际到过的最大层数**（`skill.buffStacks` / `globalBuffStacks` 的最大值），
  **不是 `maxStacks`** —— 「祸兮福兮」上限 50 层但轴上 0 层，按 `maxStacks` 铺会凭空多出 50 条空 buff；
  轴上没记录到层数时兜底为 1 条。
- 第 n 层只绑到「该时点层数 ≥ n」的伤害条目上（`damageEntryBuffSetIds`），
  这样层数沿轴往上叠的语义就表达出来了；`layer: 0` 的固定段不设这个门槛。
- **逐条目的层数**：条目自己记了 `skill.buffStacks` 就用它；没记就沿轴取**此前出现过的最大层数**。
  上游只在「会改变层数」的技能上写 `buffStacks`，真正吃效果的技能常常只写
  `buffActive: true`（「锯环·终结」就是这样：52 层记在它前面的几段疾攻上，它本身层数留空），
  按 0 层处理会让整条 buff 一条都绑不上。
- 该层未达 `minStacks` 的叠层段不写进 `zones`（上游语义：≥N 层才计入）。
- 折算后为 0 的乘区**也要保留**：叠层 buff 当前 0 层时就是 0 贡献，
  但条目本身必须留在列表里，否则整条 buff 会凭空消失。

---

## 二、排轴 · 转换规则（已确认）

### 2.1 数据源

| 内容 | 来源 |
| --- | --- |
| 轴上的技能清单（直伤） | `members[i].phases[].skills[]`（数组顺序即轴顺序），每条 `catalogId` 指向 `rotationCatalog` |
| 时间（像素偏移） | `rotationCatalog[].axisOffsetPx` |
| 非直伤（处决 / 响应 / 效应） | `rotationCatalog` 里**未被任何 `skills[].catalogId` 引用**的条目 |
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
| 轴条目集合 | `skills[] ∪ 未被引用的 rotationCatalog 条目`，按 `axisOffsetPx` 升序；**每轮都铺出来**（见 2.5） |
| `refLines` | **骨架用参考线**（不是 `opBlocks`），**每轮边界一条 + 末尾「结束」一条**；`time` = 边界标签（`+Ns` 轴长）或 `结束` |
| `opBlocks` | **不生成**：鸣算屋的轴没有按键信息，凭空造 op 只会给出错误的手序 |
| `damageBlocks` | 一条伤害一块；`sourceType: 'ref'`，`sourceId` = 该条所在**轮次**的参考线 id |
| `damageBlocks[].trackIndex` | **固定为 `getTRACKS().length - 1`（末轨「伤害绑定」）**。工具箱只渲染末轨的伤害块，挂到角色轨上等于不可见（`timeline-damage-overlay.svelte`）；角色归属由 `skillHits[].character` 表达 |
| 直伤 | `skillHits: [{ hitName, skillType, ratio, element, character, hits }]` |
| 处决 / 响应 / 效应 | `nonDirectEntries: [{ name, category: '处决'\|'响应'\|'效应', layers, hits }]`，**不进 `skillHits`** |
| `ratio` 名称 | 有 `librarySkillName` 用技能库名，否则用实际 `name`（视作自定义） |
| `hits` | 取 `multCount` |

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
  （`15.85%生命`、`19.64%*3生命`），否则既算错伤害，id 也会落到 `#攻击` 上；
- 纯数值分段 → `固定`。

`damageEntryBuffSetIds` 的键必须与上式**逐字符一致**，否则拉表页的 buff 绑定全部对不上（表现为「buff 不勾选、结果页无 buff」）。本仓库有 `ratioBaseTypes()` 复刻该判定，并用真实工程交叉验证过（38 / 52 条条目 100% 命中）。

`hitName` 取**技能库名**（`rotationCatalog[].librarySkillName`，来自该技能段的 `catalogId`），
查不到才退回轴上的短别名。这不只是显示问题：拉表里 `skillScope: 'names'` 的 buff 用
`librarySkillNames` 限定技能，拿短别名（`苍A1`）去比会一条都匹配不上。

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
- **参考线等距**排布，固定步长 `REF_LINE_STEP = 150`；条数多时等比收窄，
  保证整轴落在工具箱 `MAX_POS`（`SIDE_PAD + MAX_TIME * PPS` = 10848）内：

```
step  = min(150, floor(MAX_POS / (条数 + 2)))
pos_i = i × step
```

- 轮边界线写**该轮轴长**（`+23s` / `+25s` …，来自 `cycleConfig.rounds[].duration`），
  末尾「结束」线写 `结束`；轮内不再生成参考线，所以这些标签就是布局里唯一的刻度；
- **末尾追加一条「结束」参考线**（`{ id: 'end', time: '结束' }`，与工具箱默认的 `right` 线同款）把轴收口。

### 2.6 参考线时间的来源

轴条目按 `axisOffsetPx / 40` 得到真实秒数，只用来排序（以及换算轮长标签），不参与 `pos` 计算。
`40px/s` 是实测近似值（不同方案略有出入），所以它**不能**用来切轮边界 —— 切分按条目序号做。

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

**无法解决的部分**：首次冷启动仍然要等上游那几十秒。那一段是鸣算屋服务端按需重算快照的耗时，
我们只能缓存、重试、兜底，改不了它的速度。

## 四、覆盖度

椰果 25 个乘区里，**上游有对应来源**的 12 个：

```
atkPct defPct critRate critDmg bonusDmg deepenDmg
dmgTakenInc resDown defPen extraRatio offTuneBuildupRate
```

**上游没有来源**的（转换后必然为空，不是漏转）：

| 椰果乘区 | 说明 |
| --- | --- |
| `atkFlat` `hpFlat` `defFlat` | 固定值类，鸣算屋把白值放在 `char.*Sources` 面板而不是 buff |
| `hpPct` `recharge` | 无对应 `category`（共鸣效率只出现在面板来源里） |
| `tuneBreakBoost` | 谐度破坏增幅 |
| `finalDmg` `specialFinal1` `specialFinal2` | 终伤 / 特殊终伤 |
| `resPen` `dmgRedPen` | 穿抗、穿免 |
| `tuneStrainLayer` `unisonBoonLayer` | 层数类独立终伤 |
