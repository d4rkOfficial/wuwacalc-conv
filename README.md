# WuwaCalc-Conv · 椰果工坊 · 鸣算屋转接器

把 [鸣算屋](https://wuwacalc.cn) 的方案数据翻译成**椰果工坊 / 椰果工具箱**认得的格式，让工具箱能直接浏览、导入鸣算屋的工程。

- **列表接口**：`/api/public/projects` 转发到鸣算屋 `/api/public-schemes`，响应体按工坊「工程广场」的字段口径转换。
- **下载接口**：`/share/{code}/download` 取方案详情，把**队伍配置、排轴、拉表、词条/环境配置**四个阶段分别转换后合成椰果工程文件（`{ version, exportedAt, project }`），当附件下载。
- **主页**：`GET /` 是鸣算屋工程广场的展示页（服务端渲染，无前端框架、无外部资源）。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 工程广场展示页（HTML） |
| `GET` | `/api/public/projects` | 工坊列表口径：`page` / `perPage` / `sort` / `q` |
| `GET` | `/share/{code}/download` | 下载转换后的椰果工程文件 |

## 开发

```sh
deno task dev     # 本地起 wrangler dev
deno task test    # 单元测试
deno fmt src && deno lint src && deno check src/
```

## 文档

字段级映射规则（乘区对照、`ratio` 与伤害条目 id、轮次与参考线、叠层拆条）见
[`docs/convert-phase-mapping.md`](docs/convert-phase-mapping.md)。

## 说明

- 数据来自鸣算屋公开接口，仅供学习交流；转换结果可能有偏差，请以鸣算屋原站为准。
