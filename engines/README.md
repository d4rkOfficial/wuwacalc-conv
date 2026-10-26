# 计算引擎与差分验收

这个目录放的是**两个真实计算引擎的抽取快照**，以及用它们做「转换是否正确」的依据。
转换器在 `src/convert-project/`，它只负责把鸣算屋方案翻译成椰果工程；
最终数值由下面两个引擎各自算一遍，再逐条目、逐乘区对照。

## 1. 鸣算屋引擎 · `wuwacalc/`

`wuwacalc/site/` 是 `https://wuwacalc.cn` **当前线上前端**的快照（带版本号的原文件）：

| 文件 | 作用 |
| --- | --- |
| `site/js/core.js` | 角色 / 武器 / 声骸 / 乘区常量与面板来源 |
| `site/js/buff-templates.js` | Buff 模板、叠层、导入归一化 |
| `site/js/ui.js` | `calcUnitBreakdown` / `computeAll` / 特殊技能结算 |
| `site/character-skills.json` | 技能库（技能名、`skillType`、伤害类型、角色元素、基础三维） |
| `site/weapons.json` | 武器基础攻击 / 副词条 |
| `site/echo-specimens.json` | 声骸图鉴的首位效果（`mainEffects`） |
| `site/echo-sets.json` / `echo-catalog.json` | 套装 / 声骸名称与档位 |

### 跑法

```sh
# 用线上引擎跑真实方案，导出逐技能 / 逐乘区结果（金标准）
deno run -A engines/wuwacalc/measure-jsdom.ts --codes MC-J2UPE8 --out tmp/measure.json

# 重新抓取线上快照（脚本清单 + 静态表 + 方案样本）
deno run -A scripts/sync-upstream.ts --pages 1 --limit 6
```

### 为什么用 jsdom 而不是 headless 浏览器

Windows 沙箱会拒绝 Chromium 的命名管道（`mojo platform_channel`），headless Edge
起不来。jsdom 能提供站点需要的 DOM / localStorage / fetch，并且完全在本进程内；
站点里 `document.write` 注入字体、IndexedDB 缺失等差异都在
`measure-jsdom.ts` 里用最小桩处理。

站点 `ui.js` 线上引用了一个未定义的 `getMatrixTargetResistancePct`
（矩阵目标抗性路径），离线跑时补了「原样返回基础抗性」的兜底；其余全部走站点实现。

## 2. 椰果工具箱引擎 · `coconut/`

`coconut/lib/` 是从本地工具箱源码 `E:\D4rK6\Projects\wuwa-afyg-tool`
**原样复制**的计算模块：

| 文件 | 作用 |
| --- | --- |
| `lib/calc/compute.ts` | 主计算（直伤 / 处决 / 响应 / 效应 / 引用转模） |
| `lib/calc/condition.ts` / `zone-ops.ts` / `calculation.consts.ts` | 条件、乘区累加、乘区定义 |
| `lib/calc/skill-infer.ts` / `utils.ts` | 伤害类型推断、声骸技能文案 |
| `lib/consts/effect-data.ts` / `game-terms.ts` / `stat-data.ts` | 效应表、词条表、常量 |
| `damage-entries.ts` | 从排轴时间线派生伤害条目（搬自 `calculation.store`） |
| `measure.ts` | 把转换后的工程喂给 `computeAll`，导出逐条目结果 |

`deno.json` 的 import map 把 `$lib/` 指到 `engines/coconut/lib/`，
复制过来的源码只补了 `.ts` 扩展名，逻辑未改。

### 重新同步工具箱引擎

```sh
deno run -A scripts/sync-coconut-engine.ts
deno run -A scripts/fix-coconut-imports.ts
```

## 3. 差分验收 · `fixtures/wuwacalc/`

| 文件 | 内容 |
| --- | --- |
| `fixtures/wuwacalc/MC-XXXX.json` | 真实方案详情（`GET /api/schemes/{code}` 原样） |
| `fixtures/wuwacalc/golden/MC-XXXX.json` | 鸣算屋引擎跑出的金标准（逐技能 `breakdown`） |
| `engines/parity.ts` | 读 fixture → 转换 → 椰果引擎 → 比较 |
| `engines/compare.ts` | 条目对齐 + 乘区对比 |
| `src/convert-project/parity_test.ts` | TDD：总伤 / 逐条目 / 逐乘区 |

### 门槛与已知差距

**Gate（4 个真实工程，总伤 < 0.5%，逐乘区逐位相等）**

- `MC-J2UPE8` 仇远 / 洛瑟菈 / 莫宁，6+5
- `MC-X859HC` 嘉贝莉娜 / 莫特斐 / 露帕，6+1
- `MC-88TES9` 嘉贝莉娜 / 莫特斐 / 露帕，6+1（另一轴）
- `MC-QFT4PS` 嘉贝莉娜 / 长离 / 露帕，0+1

**Diagnostic（结构验收；KGHNE7 额外卡总伤 < 1%）**

- `MC-KGHNE7` 清宵 / 达妮娅 / 莫宁，6+5，5 轮 / 集谐 / 武器叠层 —— 总伤 **+0.50%**，非直伤 **1,003,008 / 1,003,008**
- `MC-NT36XN` 爱弥斯 / 达妮娅 / 千咲，6+5 —— 总伤 **+0.13%**，非直伤一致
- `MC-SCJ322` 卡提希娅 / 夏空 / 千咲，6+5，风蚀效应 —— 总伤 **+0.01%**，非直伤 **8,023,947 / 8,023,909**
- `MC-BSZSVE` 景燃 / 尤诺 / 莫宁，6+5 —— 总伤 **-0.01%**，非直伤一致
- `MC-CM6J6K` 弗洛洛 / 仇远 / 莫宁 —— 总伤 **-0.00%**，非直伤 **+0.01%**
- `MC-T6E4P9` 西格莉卡 / 仇远 / 守岸人 —— 总伤 **+1.6%**，非直伤一致
- `MC-NT274J` 秧秧 / 千咲 / 穗穗，5 轮 9 羽 —— 总伤 **+0.05%**，非直伤一致
- `MC-U5UNZC` 爱弥斯 / 达妮娅 / 千咲，简化 3 光全局 —— 总伤 **+3.1%**（诊断）
- `MC-4NRWDV` 清宵 / 达妮娅 / 莫宁，集谐 —— 总伤 **+0.03%**，非直伤一致

KGHNE7 的 8 条处决已逐条对齐（每条 125,376，合计 1,003,008）：成员副本动态值
（达妮娅固有 10→50）补齐了 40 点谐度破坏增幅；同一参考线上的多次处决不再被
「同名同类」合并掉。SCJ322 的特殊技能也不再吃「无视防御(ignore)」，非直伤已对齐。
NT36XN 已从 -5.9% 收敛到 +0.13%：补上 `typeResReduce`（逐星 30% 热熔减抗）
并把 `defenseKind:'ignore'` 落成独立的 `defDown`（不再并进 `defPen`）后，
6 条聚爆非直伤 4,865,288 / 4,865,278 也已逐条对齐。

**已知单条差值**

- 无。露帕「强化变奏」已由通用规则解决：叠层 Buff 的「纯固定」效果在 0 层时
  也必须视为不生效（复刻 `getCompositeEffectValue()` 的 `stacks <= 0 → 0`），
  不再需要招式白名单。

### 链阶条件

现在链专属 Buff **不会**在转换时按当前链档删掉，而是保留数值并挂 `condition.chains`：

- 同一条 Buff 里不同 `minResonance` 的效果会**拆成多个 Buff 实例**（工具箱链条件只能
  挂实例级），每个实例带自己的 `chains: [{ charIdx, min }]`；
- 链专属**伤害**（`multAdd` / `multBoost`）走「挂载点 + 条件 Buff」：
  排轴为技能建「（额外）」条目，拉表把带链条件的额外倍率 Buff 绑上去；
- 因此同一份工程换到 0 链 / 2 链 / 6 链导入时，链专属效果会自动开/关，
  不需要重新转换。

回归用例见 `src/convert-project/chain-condition_test.ts`。

### 取整差异

椰果引擎的 `totalAtk` / `totalHp` / `totalDef` 是整数（`Math.round`），
鸣算屋保留小数。因此**攻击白值**会差 0~2 点，进而让单条伤害有约 0.02%~0.1% 的差异；
除攻击白值外，所有乘区（增伤 / 加深 / 易伤 / 抗性 / 防御 / 双暴 / 倍率）都逐位相等。
测试对攻击白值给 2 点绝对容差，对其它乘区用 `1e-9` 相对容差。
