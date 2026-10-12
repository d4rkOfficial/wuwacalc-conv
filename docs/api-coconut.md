# 工坊 API

本页说明椰果工坊对外提供的 HTTP API，以及**椰果工具箱接入工坊时所依赖的接口**。

所有接口均为公开只读（少数业务接口除外），响应带 CORS 头，工具箱等前端可直接跨域调用。

## 分层总览

| 层级 | 接口 | 说明 |
| ---- | ---- | ---- |
| **最小集（接入工具箱必须实现）** | `GET /api/public/projects`<br>`GET /share/{code}/download` | 列出工程 + 下载工程。任何自建工坊只要实现这两个接口，椰果工具箱即可完成「工程广场 + 一键导入」全流程 |
| **扩展集（工具箱可选对接）** | `GET /api/buff-sets`<br>`GET /api/substat-sets` | Buff 集、标准词条集。实现后可被工具箱「从工坊同步」一键拉取；未实现时工具箱使用本地数据与自动生成方案，不影响其它功能 |
| **可选业务 API（工坊自身业务）** | `POST /api/public/projects`<br>`GET /api/buff-sets/export`<br>`GET /api/char-elements`<br>`POST /api/ai/stream` | 匿名上传、Buff 集 SQL 导出、角色元素速查、AI 流式代理。工具箱**不依赖**这些接口 |

> 结论：想让工具箱连上你的自建工坊，**最少只需实现最小集的两个接口**。

## 最小集

### 1. 列出工程

```
GET /api/public/projects?page=1&perPage=12&sort=newest&q=&excludeAnon=1
```

| 参数 | 必填 | 说明 |
| ---- | ---- | ---- |
| `page` | 否 | 页码，默认 `1` |
| `perPage` | 否 | 每页条数，默认 `12`，上限 `50` |
| `sort` | 否 | 排序：`newest`（最新）/ `hot`（最热），默认 `newest` |
| `q` | 否 | 关键词，匹配标题与作者名 |
| `excludeAnon` | 否 | `1` 时排除匿名工程 |

响应：

```json
{
  "projects": [
    {
      "id": "uuid",
      "code": "分享码",
      "title": "工程标题",
      "authorName": "作者",
      "tags": ["标签"],
      "gameVersion": "游戏版本",
      "teamPreview": { "…": "配队预览元数据" },
      "downloads": 12,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "perPage": 12
}
```

已过期（含宽限期）的工程不会出现在列表中。

### 2. 下载工程

```
GET /share/{code}/download
```

按分享码返回工程 JSON 文件（`Content-Disposition: attachment`）。文件格式与椰果工具箱「导出工程」完全一致，可直接被工具箱导入。

工具箱侧两种用法：

- 工程广场列表 → 「下载并导入」
- 分享直链 `工具箱地址#import_project=<工坊地址>/share/{code}/download` → 打开工具箱即自动导入

## 扩展集

### Buff 集

```
GET /api/buff-sets?entity_type=character&entity_name=散华&q=攻击
```

| 参数 | 必填 | 说明 |
| ---- | ---- | ---- |
| `entity_type` | 否 | `character` / `weapon` / `echo` / `1set`~`5set` |
| `entity_name` | 否 | 实体名精确匹配 |
| `q` | 否 | 模糊搜索实体名或 Buff 名 |

响应（`buff_set` 为乘区数值数组，字段与工具箱 Buff 库一致）：

```json
{
  "buffSets": [
    {
      "entity_type": "character",
      "entity_name": "散华",
      "buff_name": "散 第5段普攻时 暴击率",
      "scope": "self",
      "exclusive": false,
      "condition": { "chain": 6 },
      "buff_set": [{ "zoneId": "critRate", "value": 15 }]
    }
  ]
}
```

工具箱用法：「主页 → Buff 集 → 从工坊同步」。同步语义为**按实体整份覆盖**——工坊侧存在的实体会覆盖工具箱内同实体的「工坊来源」数据，工具箱本地自定义的实体不受影响；工坊已下线的实体在工具箱内一并移除。

### 标准词条集

```
GET /api/substat-sets?character_name=布兰特&q=布
```

| 参数 | 必填 | 说明 |
| ---- | ---- | ---- |
| `character_name` | 否 | 角色名精确匹配 |
| `q` | 否 | 角色名模糊搜索 |

响应：

```json
{
  "substatSets": [
    {
      "character_name": "布兰特",
      "plan": {
        "slots": [
          {
            "cost": 4,
            "mainStat": { "type": "暴击率", "value": 22, "unit": "%" },
            "secondMainStat": { "type": "攻击", "value": 150, "unit": "" },
            "substats": [
              { "type": "暴击率", "value": 8.1, "unit": "%" },
              { "type": "暴击伤害", "value": 16.2, "unit": "%" }
            ]
          }
        ]
      },
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

约定：

- `slots` 恰好 5 项，与工具箱的声骸配置结构逐一对应（槽位顺序即工具箱 5 个声骸槽位）。
- **cost 组合不限**（不强制 43311）：每个槽位 `cost` ∈ `{1, 3, 4}`，5 个槽位合计 ≤ `12`。
- 每槽副词条 1-5 条且同槽不重复；**5 槽合计必须恰好 14 条副词条**（即「标准 14 词条」）。
- 数值由工坊统一归一化，写入方无需自行计算：
  - **主词条**：只认 `type`（必须属于该 cost 的池子），数值一律取**满级上限**（如 4cost 暴击率 = 22），单位固定 `%`；
  - **副主词条**：**按 cost 自动推导**（4 → 攻击 150 / 3 → 攻击 100 / 1 → 生命 2280），请求里的取值会被忽略；
  - **副词条**：只认 `type`，数值会**吸附到最近的合法档位**（档位表与工具箱 `SUBSTAT_TIERS` 一致），单位按词条类型自动。
- 词条白名单与工具箱一致：副词条 13 项、主词条 12 项（6 种属性伤害加成 + 暴击率/暴击伤害/攻击%/生命%/防御%/共鸣效率；游戏内没有「物理伤害加成」主词条）。
- 工坊**只收录特殊角色的整份方案**；一般角色的标准 14 词条由工具箱按角色数据本地生成，无需在工坊录入。
- `note` 为内部备注，不对外返回。
- 工具箱用法：配装页「词条方案 → 工坊同步」，以及首次进入工具箱时的「同步工坊数据」弹窗（与 Buff 集合并询问）。

管理入口：`/admin/substat-sets`（管理员），提供 5 槽位编辑器与 JSON 导入/导出；编辑页里主词条数值与副主词条均自动（只读），副词条数值为档位下拉选择。

## 可选业务 API

| 接口 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/api/public/projects` | `POST` | 匿名上传工程（返回 `{ code, url }`，短有效期） |
| `/api/buff-sets/export` | `GET` | Buff 集全量 SQL 导出（优先导出最新快照状态） |
| `/api/char-elements` | `GET` | 角色 → 元素速查表（含数据版本，`no-store`） |
| `/api/ai/stream` | `POST` | AI 流式对话代理（供站点内 AI 协作使用） |

以上接口与工具箱无耦合，可按需实现或省略。

## 兼容性

- 最小集的两个接口是**稳定契约**：工具箱仅依赖它们完成广场与导入，扩展字段可自由追加。
- 扩展集为可选项：接口不可用时工具箱会静默降级（Buff 集用本地数据、标准词条集用本地自动生成方案）。
- 所有响应错误统一为 `{ "error": "…" }`；未配置 Supabase 时返回 `503`。
