# 鸣算屋·WaveCalc — 公开数据库 API 文档

> 站点：https://wuwacalc.cn（鸣潮配装计算器）
> 抓取时间：2026-10-12，已通过实际请求验证
> 后端：Node/Express + Supabase（`https://vsakryexviiwcqvjyexe.supabase.co` 用于鉴权/存储/头像）

## 0. 请求规范

- 所有接口为同源路径，基址 `https://wuwacalc.cn`，实际请求 `fetch('/api' + path)`。
- 数据格式：`Content-Type: application/json`。
- 鉴权：多数「公开库」接口**无需登录**（前端 `credentials:'omit'`）；仅点赞、写评论、查我的点赞等需要 `Authorization: Bearer <access_token>`。
- 大体积 POST 请求体（>64KB）会 gzip 压缩并携带 `Content-Encoding: gzip` 上传。
- 列表接口前端有 30s 缓存；详情类 GET 完整 payload 较重（服务端注释 20~60s），超时被放宽。

---

## 1. 公开数据库列表 API

### `GET /api/public-schemes`

获取公开库（公开配装方案）的分页列表，支持搜索与多条件筛选。

**Query 参数**

| 参数 | 类型 | 说明 | 取值示例 |
|---|---|---|---|
| `page` | int | 页码，默认 1 | `1` |
| `pageSize` | int | 每页条数，默认/前端使用 15（超限会报 400） | `15` |
| `q` | string | 全文搜索（匹配标题/描述/标签） | `居` |
| `zone` | string | 配置专区筛选 | `all` `zero` `c2` `c3` `c6` `max` `template` |
| `kind`(axisKind) | string | 轴类型 | `all`、全局轴等 |
| `sort` | string | 排序 | `time`（最新）`dps`（DPS 高→低）`total`（总伤高→低） |
| `configAll` | bool | 是否全员同配 | `true` |
| `configs` | string | 队伍各站位配置（逗号分隔） | `0+1|0+1|0+1` |
| `match` | string | 配置比较方式 | `eq`（同配）`gte`（不低于）`lte`（不高于） |
| `characters` | string | 角色 ID（逗号分隔） | `1108` |
| `difficulty` | string | 难度 | 如 `进阶适中` |
| `performance` | string | 表现类型 | 如 `适中看操作` |

**请求示例**
```
GET https://wuwacalc.cn/api/public-schemes?page=1&pageSize=15&sort=dps&zone=zero&characters=1108
```

**成功响应 `200 OK`**
```json
{
  "items": [ ...方案对象 ],
  "total": 87,
  "page": 1,
  "pageSize": 15,
  "stale": false,
  "updatedAt": "2026-10-12T01:00:00.000Z"
}
```

**`items[]` 中单个方案对象字段**

| 字段 | 说明 |
|---|---|
| `id` | 方案 UUID |
| `share_code` | 分享码，形如 `MC-B837DU` |
| `title` / `description` | 标题 / 描述 |
| `tags[]` | 标签数组（如 `全局轴`） |
| `summary` | 摘要对象：`teamDps` 队伍DPS、`teamTotal` 总伤、`axisKind` 轴类型、`entryType` 词条表、`difficulty` 难度、`monsterRes`、`teamConfig`、`memberNames[]` 角色名、`performance`、`axisDuration` 秒、`characterIds[]`、`monsterLevel`、`memberConfigs[]`、`configVariants[]`、`snapshotsFresh`、`memberWeaponIds[]` |
| `version` | 方案版本号 |
| `fork_count` | 被应用/下载次数 |
| `like_count` | 点赞数 |
| `refVideoUrl` / `refVideoMetaUrl` | 参考视频链接 |
| `updated_at` / `approved_at` | 更新/审核时间（ISO） |
| `avg_score` / `review_count` | 平均评分 / 评论数 |
| `profiles` | 作者信息：`id` `display_name` `avatar_data_url` |

**错误响应**
```
400 {"error":"无效页码"}        # 非法 page / pageSize 超出上限
```

---

## 2. 下载 API（方案完整数据）

### `GET /api/schemes/{share_code}`

按分享码获取单个方案的**完整数据**（包含可直接导入的全部配置快照，即「下载」内容）。实测单条响应约 3 MB。

**请求示例**
```
GET https://wuwacalc.cn/api/schemes/MC-B837DU
```

**成功响应 `200 OK`** —— 在列表项字段基础上额外返回：
- `status`：`"approved"`（已审核）
- `payload.data.team`：完整队伍配置快照（Buff、角色、武器、声骸、词条、轴等全部可导入数据，为「下载」的真正内容）

**错误响应**
```
404 {"error":"方案不存在或未通过审核"}   # 分享码无效或方案未过审
```

---

## 3. 应用/下载次数登记 API

### `POST /api/schemes/{share_code}/apply`

无需请求体；在前端将方案导入本地配装后调用，登记一次「应用/下载」，返回最新 `fork_count`（有副作用，会 +1）。

**请求示例**
```
POST https://wuwacalc.cn/api/schemes/MC-B837DU/apply
```
**响应**
```json
{"ok": true, "fork_count": 3}
```

---

## 4. 公开库生态相关接口（同模块）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/schemes/{code}/reviews` | 否 | 获取方案评论列表 |
| `POST` | `/api/schemes/{code}/reviews` | 需登录 | 发表评论，body `{content, tags}` |
| `POST` | `/api/schemes/{code}/like` | 需登录 | 点赞，返回 `{liked, like_count}` |
| `DELETE` | `/api/schemes/{code}/like` | 需登录 | 取消点赞 |
| `GET` | `/api/scheme-likes/me` | 需登录 | 我点赞过的方案列表 |
| `GET`/`POST` | `/api/my/builds` | 需登录 | 我的云端配装（workspace-builds.js） |

> 注：`/api/my/builds`、`/api/rotation-templates`、`/api/build-library/config`、`/api/csf/manifest`、`/api/csf/data` 属同一站点其它模块，非「公开数据库」核心接口，此处仅列出供参考。

---

## 5. 关键字段口径与注意事项

- **列表缓存**：同一查询串前端缓存 30s；`pageSize` 前端固定为 15，且校验 `data.pageSize !== PAGE_SIZE` 会判无效（建议调用保持 `pageSize=15`）。
- **详情接口较重**：完整 payload 含快照，数据量大（秒级~数十秒），服务端对详情 GET 放宽超时。
- **下载语义**：`GET /api/schemes/{code}` 返回的 `payload` 即完整可导入数据；`POST .../apply` 仅作下载计数登记。
- **限流**：429 时前端提示「访问较频繁」；上游 5xx / 超时会自动重试一次（间隔 400ms）。
- 列表项 `summary.snapshotsFresh` 标记快照是否新鲜；`_serverComputed` 为服务端计算标记，客户端不依赖。

## 6. 抓取方式说明（可复现）

前端入口：`<script src="js/public-db.js?v=...">`，其中 `fetch('/api/public-schemes?...')` 与 `Cloud.api('/schemes/...')`（内部拼接 `/api`）定义了全部端点。`js/cloud-suite.js` 定义了 `Cloud.api()` 与 Supabase 基址。以上文档中的参数与响应均经 curl 实测验证。
