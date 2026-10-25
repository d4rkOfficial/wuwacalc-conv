# 真实鸣算屋方案样本

| 目录 / 文件 | 说明 |
| --- | --- |
| `MC-XXXX.json` | `GET https://wuwacalc.cn/api/schemes/{code}` 的原始响应（含 `payload.data`） |
| `golden/MC-XXXX.json` | 用 `engines/wuwacalc/measure-jsdom.ts` 跑出的逐技能 / 逐乘区金标准 |
| `manifest.json` | 已抓取方案清单（标题、摘要、成员） |

当前样本：

| 分享码 | 队伍 | 用途 |
| --- | --- | --- |
| `MC-J2UPE8` | 仇远 / 洛瑟菈 / 莫宁 | gate |
| `MC-X859HC` | 嘉贝莉娜 / 莫特斐 / 露帕 | gate |
| `MC-88TES9` | 嘉贝莉娜 / 莫特斐 / 露帕 | gate（另一轴） |
| `MC-AAG7TK` | 同上 | 重复样本 |
| `MC-QFT4PS` | 嘉贝莉娜 / 长离 / 露帕 | gate |
| `MC-KGHNE7` | 清宵 / 达妮娅 / 莫宁 | 诊断（5 轮；总伤 +0.04%） |
| `MC-NT36XN` | 爱弥斯 / 达妮娅 / 千咲 | 诊断（+0.4%，非直伤一致） |
| `MC-SCJ322` | 卡提希娅 / 夏空 / 千咲 | 诊断（+1.2%，非直伤 +8.1%） |
| `MC-BSZSVE` | 景燃 / 尤诺 / 莫宁 | 诊断（-0.8%） |
| `MC-CM6J6K` | 弗洛洛 / 仇远 / 莫宁 | 诊断（-0.00%，非直伤 +0.01%） |
| `MC-T6E4P9` | 西格莉卡 / 仇远 / 守岸人 | 诊断（+2.4%） |

## 刷新

```sh
# 1) 重新抓线上前端 + 列表里的方案
deno run -A scripts/sync-upstream.ts --pages 1 --limit 6

# 2) 用鸣算屋引擎跑金标准（逐条保存）
deno run -A engines/wuwacalc/measure-jsdom.ts --codes MC-J2UPE8 --out tmp/detail-MC-J2UPE8.json

# 3) 归档到 golden/
deno run -A scripts/build-golden.ts
```

> `measure-jsdom.ts` 一次跑多个方案时，如果某个方案在站点导入阶段卡死，
> 整个进程会一直等。建议一次只跑一个 `--codes`，确认后再合并。
