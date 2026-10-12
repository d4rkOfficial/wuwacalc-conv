/**
 * 主路由 `GET /` —— 鸣算屋工程广场的展示页。
 *
 * 服务端直接渲染 HTML：没有前端框架、没有外部字体/CDN 请求，整页自包含，
 * 既是给人看的「工程广场」，也是这个转接器到底在转什么的说明书。
 *
 * 数据走的是**本项目自己的列表接口**（`convert-project-list.ts`）：
 * 页面上的每张卡片就是 `/api/public/projects` 会返回的那条数据，转出来什么样、这里就长什么样。
 */

import {
    buildWuwaCalcListQuery,
    convertWuwaCalcProjectListToCoconutProjectList,
} from "./convert-project-list.ts"
import { fetchUpstream, LIST_TIMEOUT_MS, readUpstreamJson } from "./http.ts"
import type { Bindings } from "./http.ts"
import { USAGE_IMAGE_PATHS, USAGE_IMAGES } from "./usage-images.ts"
import type { UsageTheme } from "./usage-images.ts"
import type {
    WuwaCalcSchemeListItem,
    WuwaCalcSchemeListResponse,
} from "./types.ts"

/**
 * 展示页一屏放多少张卡。
 *
 * 就 11 条：上游列表接口很慢（详情更慢），展示页没必要为了多铺几张卡去逼近
 * `LIST_TIMEOUT_MS`；想看全量走列表接口翻页。
 */
const HOME_PAGE_SIZE = 11
/** 展示页的浏览器缓存时长（秒） */
const HOME_CACHE_SECONDS = 60

/** 三处外部主站 */
const WUWACALC_URL = "https://wuwacalc.cn"
const WORKSHOP_URL = "https://wuwa-afyg-share.200503.xyz"
const TOOLBOX_URL = "https://wuwa-afyg-tool.200503.xyz"

/** 本转接器自己的部署地址：使用方法里让用户填进工具箱的「工坊 / 分享源」 */
const BRIDGE_URL = "https://wuwacalc-conv.200503.xyz"

/** 工坊收录总数是页面上的一句装饰，不值得为它等太久 */
const WORKSHOP_TOTAL_TIMEOUT_MS = 8_000

/**
 * 工坊侧的收录总数。
 *
 * 工坊 `GET /api/public/projects` 与本项目列表接口同形（`{ projects, total, … }`），
 * 只要 `perPage=1` 拿 `total` 就够了。拿不到返回 `null`：页面上显示占位符，
 * 不影响方案列表本身。
 */
const fetchWorkshopTotal = async (): Promise<number | null> => {
    try {
        const res = await fetch(
            `${WORKSHOP_URL}/api/public/projects?page=1&perPage=1`,
            {
                headers: { accept: "application/json" },
                signal: AbortSignal.timeout(WORKSHOP_TOTAL_TIMEOUT_MS),
            },
        )
        if (!res.ok) return null
        const body = await res.json() as { total?: unknown }
        const total = Number(body?.total)
        return Number.isFinite(total) && total >= 0 ? total : null
    } catch {
        return null
    }
}

// ── 格式化 ────────────────────────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}

/** 所有插入模板的文本都要过这里：标题/作者/标签全是上游来的自由文本 */
export const escapeHtml = (value: unknown): string =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])

const decimal = new Intl.NumberFormat("zh-CN")
const oneDecimal = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
})

/** 大数字压缩成「万 / 亿」，杂志式统计栏里比一串零好读 */
export const formatCompact = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return "—"
    if (value >= 100_000_000) {
        return `${oneDecimal.format(value / 100_000_000)} 亿`
    }
    if (value >= 10_000) return `${oneDecimal.format(value / 10_000)} 万`
    return decimal.format(Math.round(value))
}

/** `2026-10-08T11:26:11.661+00:00` → `2026-10-08`；非法时间退回占位符 */
export const formatDate = (iso: string): string => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "—"
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${
        pad(date.getUTCDate())
    }`
}

// ── 视图模型 ──────────────────────────────────────────────────────────────────

interface HomeProject {
    /** 杂志式序号（01、02…） */
    order: string
    title: string
    author: string
    code: string
    names: string[]
    tags: string[]
    downloads: number
    createdAt: string
    /** 上游服务端算出的队伍 DPS（列表接口不一定有） */
    dps: number
    /** 轴长（秒） */
    duration: number
    level: number
    res: number
    config: string
    description: string
}

const toHomeProject = (
    item: WuwaCalcSchemeListItem,
    index: number,
): HomeProject => {
    const [project] = convertWuwaCalcProjectListToCoconutProjectList({
        items: [item],
    }).projects
    const summary = item.summary ?? {}
    const number = (value: unknown): number => {
        const n = Number(value)
        return Number.isFinite(n) && n > 0 ? n : 0
    }

    return {
        order: String(index + 1).padStart(2, "0"),
        title: project.title || "（未命名方案）",
        author: project.authorName,
        code: project.code,
        names: project.teamPreview?.names ?? [],
        tags: project.tags,
        downloads: project.downloads,
        createdAt: project.createdAt,
        dps: number(summary.teamDps),
        duration: number(summary.axisDuration),
        level: number(summary.monsterLevel),
        res: Number(summary.monsterRes) || 0,
        config: typeof summary.teamConfig === "string"
            ? summary.teamConfig
            : "",
        description: typeof item.description === "string"
            ? item.description
            : "",
    }
}

// ── 片段 ──────────────────────────────────────────────────────────────────────

const renderChips = (values: string[], className: string): string =>
    values.length
        ? `<ul class="${className}">${
            values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")
        }</ul>`
        : ""

const renderCard = (project: HomeProject): string => {
    const stats = [
        project.dps
            ? `<div class="stat"><span class="stat-label">DPS</span><span class="stat-value">${
                formatCompact(project.dps)
            }</span></div>`
            : "",
        project.duration
            ? `<div class="stat"><span class="stat-label">轴长</span><span class="stat-value">${
                decimal.format(project.duration)
            }<i>s</i></span></div>`
            : "",
        project.level
            ? `<div class="stat"><span class="stat-label">目标</span><span class="stat-value">Lv${
                decimal.format(project.level)
            }<i>·${project.res}%</i></span></div>`
            : "",
    ].filter(Boolean).join("")

    return `<article class="card pop">
  <header class="card-head">
    <span class="card-order">${escapeHtml(project.order)}</span>
    <span class="card-date">${escapeHtml(formatDate(project.createdAt))}</span>
  </header>
  <h3 class="card-title">${escapeHtml(project.title)}</h3>
  ${
        project.description
            ? `<p class="card-desc">${escapeHtml(project.description)}</p>`
            : ""
    }
  ${renderChips(project.names, "card-team")}
  ${renderChips(project.tags, "card-tags")}
  ${stats ? `<div class="card-stats">${stats}</div>` : ""}
  <footer class="card-foot">
    <span class="card-author">${escapeHtml(project.author)}${
        project.config ? ` · ${escapeHtml(project.config)}` : ""
    }</span>
  </footer>
</article>`
}

/** 页面骨架：所有可变内容都已经过 `escapeHtml` */
const layout = (title: string, body: string): string =>
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="椰果工坊 · 鸣算屋转接器：把鸣算屋的方案列表/下载API与完整工程翻译成椰果工具箱认得的格式。">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body id="top">
${body}
</body>
</html>`

// ── 页面 ──────────────────────────────────────────────────────────────────────

/**
 * 渲染首页。
 *
 * 上游失败不抛 5xx JSON，而是在页面上显示一条提示 —— 这是一个给人看的页面，
 * 拿不到列表时仍然应该把「这是什么、接口在哪」讲清楚。
 */
export const renderHomePage = (input: {
    projects: HomeProject[]
    /** 鸣算屋收录总数；上游没拿到时给 `null` */
    total: number | null
    /** 椰果工坊收录总数；没拿到时给 `null` */
    workshopTotal?: number | null
    error?: string
}): string => {
    const { projects, total, workshopTotal = null, error } = input

    const hero = `<header class="nav">
  <a class="brand" href="/">
    <span class="brand-mark" aria-hidden="true"></span>
    鸣算屋转接器
  </a>
  <!-- 顶栏是 fixed 的，锚点挂在 body 上（fixed 元素算不出滚动目标） -->
  <a class="nav-top" href="#top" aria-label="返回顶部">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
    <span>返回顶部</span>
  </a>
</header>

<section class="hero">
  <p class="hero-eyebrow pop-hero">WuwaCalc ⇄ Coconut Workshop</p>
  <h1 class="pop-hero">椰果工坊<span class="dot">·</span><span class="accent">鸣算屋转接器</span></h1>
  <p class="hero-tagline pop-hero">
    把鸣算屋的方案列表/下载API与完整工程翻译成椰果工具箱认得的格式
  </p>
  <div class="hero-actions">
    <a class="btn btn-toolbox pop-hero" href="${TOOLBOX_URL}" target="_blank" rel="noopener">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      椰果工具箱
    </a>
    <a class="btn btn-wuwacalc pop-hero" href="${WUWACALC_URL}" target="_blank" rel="noopener">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      鸣算屋
    </a>
    <a class="btn btn-usage pop-hero" href="#usage">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6" />
        <path d="M12 17.2h.01" />
      </svg>
      使用方法
    </a>
  </div>
</section>`

    // 两侧都拿到了才算得出合计；缺任何一侧就都显示占位符，不要编数字
    const count = (value: number | null) =>
        value === null ? "—" : decimal.format(value)
    const sum = total === null || workshopTotal === null
        ? "—"
        : decimal.format(total + workshopTotal)

    const ledger = `<section class="ledger pop">
  <div class="ledger-inner">
    <div class="ledger-item"><span class="ledger-label">鸣算屋收录方案</span><span class="ledger-value">${
        count(total)
    }</span></div>
    <div class="ledger-item"><span class="ledger-label">椰果工坊收录方案</span><span class="ledger-value">${
        count(workshopTotal)
    }</span></div>
    <div class="ledger-item"><span class="ledger-label">合计收录方案</span><span class="ledger-value">${sum}</span></div>
  </div>
</section>`

    const notice = error
        ? `<p class="notice pop"><strong>上游暂时不可用</strong>${
            escapeHtml(error)
        }
           —— 页面结构仍然可用，稍后刷新即可。</p>`
        : ""

    const list = projects.length
        ? `<div class="grid">${projects.map(renderCard).join("\n")}</div>`
        : `<p class="empty">${
            error ? "上游没有返回可展示的方案。" : "这一页没有方案。"
        }</p>`

    const body = `${hero}
<main class="page">
${ledger}
<section class="section" id="projects">
  <div class="section-head"><div class="section-head-inner pop">
    <h2>最新方案</h2>
    <span class="section-label">Latest</span>
  </div></div>
  ${notice}
  ${list}
</section>

<section class="section" id="endpoints">
  <div class="section-head"><div class="section-head-inner pop">
    <h2>两个端点</h2>
    <span class="section-label">Endpoints</span>
  </div></div>
  <div class="endpoint-grid">
    <article class="endpoint-card pop">
      <h3 class="endpoint-name"><span class="endpoint-method">GET</span>/api/public/projects</h3>
      <p>工坊「最新方案」列表口径。<code>page</code> / <code>perPage</code> / <code>sort</code> / <code>q</code>
         归一化后转发到鸣算屋 <code>/api/public-schemes</code>，并把响应体转成工坊的字段。</p>
    </article>
    <article class="endpoint-card pop">
      <h3 class="endpoint-name"><span class="endpoint-method">GET</span>/share/{code}/download</h3>
      <p>按分享码取方案详情，把队伍配置、排轴、拉表、词条环境四个阶段分别转换后合成
         椰果工程文件（<code>{ version, exportedAt, project }</code>），直接当附件下载。</p>
    </article>
  </div>
</section>

<section class="section" id="usage">
  <div class="section-head"><div class="section-head-inner pop">
    <h2>使用方法</h2>
    <span class="section-label">Usage</span>
  </div></div>
  <!-- 图文双列：图 3 : 文 1，教程文本在图片右侧 -->
  <div class="usage-layout">
    <figure class="usage-figure is-dark pop">
      <img src="${USAGE_IMAGE_PATHS.dark}" width="1200" height="675" loading="lazy"
           alt="椰果工具箱「设置 → 连接配置」：已在工坊 / 分享源新建鸣算屋转接器配置（黑夜模式）">
    </figure>
    <figure class="usage-figure is-light pop">
      <img src="${USAGE_IMAGE_PATHS.light}" width="1200" height="675" loading="lazy"
           alt="椰果工具箱「设置 → 连接配置」：已在工坊 / 分享源新建鸣算屋转接器配置（白天模式）">
    </figure>
    <div class="usage-text pop">
      <ol class="usage-steps">
        <li>在椰果工具箱主页点击 <b>设置 - 连接配置</b></li>
        <li>在 <b>工坊 / 分享源</b> 输入 <code>${BRIDGE_URL}</code> 新建配置</li>
        <li>切换到新建的配置</li>
        <li>此时「从工坊导入」便会展示鸣算屋的方案列表并可供下载</li>
      </ol>
    </div>
  </div>
</section>
</main>

<footer class="foot">
  <span>椰果工坊 · 鸣算屋转接器</span>
  <span>数据来自 <a href="${WUWACALC_URL}" target="_blank" rel="noopener">鸣算屋</a>，仅供学习交流</span>
</footer>`

    return layout("椰果工坊 · 鸣算屋转接器", body)
}

// ── 附图 ──────────────────────────────────────────────────────────────────────

/** 附图路由：`/assets/usage-dark.jpg` / `/assets/usage-light.jpg` */
export const USAGE_IMAGE_ROUTE = /^\/assets\/usage-(dark|light)\.jpg$/

/** 解码一次就留着：图片是常量，没必要每个请求都解一遍 base64 */
const decodedUsageImages = new Map<UsageTheme, Uint8Array>()

const decodeBase64 = (base64: string): Uint8Array => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

/** 出图：内容不会变，给一年缓存 + `immutable`，换图记得顺手改文件名 */
export const handleUsageImage = (theme: UsageTheme): Response => {
    let bytes = decodedUsageImages.get(theme)
    if (!bytes) {
        bytes = decodeBase64(USAGE_IMAGES[theme].base64)
        decodedUsageImages.set(theme, bytes)
    }
    return new Response(bytes, {
        status: 200,
        headers: {
            "content-type": USAGE_IMAGES[theme].contentType,
            "cache-control": "public, max-age=31536000, immutable",
        },
    })
}

/**
 * 首页端点：拉第一页方案并渲染。
 *
 * 只取一页、不翻上游多页 —— 这是个展示页，不是分页浏览器；
 * 支持 `?q=` / `?sort=` 透传，方便按关键词筛一屏看看。
 */
export const handleHome = async (
    url: URL,
    env: Bindings,
): Promise<Response> => {
    const params = new URLSearchParams(url.searchParams)
    params.set("page", "1")
    params.set("perPage", String(HOME_PAGE_SIZE))
    const { pageSize, search } = buildWuwaCalcListQuery(params)

    const html = (body: string) =>
        new Response(body, {
            status: 200,
            headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": `public, max-age=${HOME_CACHE_SECONDS}`,
            },
        })

    /** 把 `{ error }` 错误体读成一句人话；读不出来就用状态码 */
    const reasonOf = async (response: Response): Promise<string> => {
        try {
            const body = await response.json() as { error?: unknown }
            if (typeof body?.error === "string" && body.error) return body.error
        } catch {
            // 不是 JSON，用状态码文案
        }
        return `上游返回 ${response.status}`
    }

    const failed = (reason: string, workshopTotal: number | null) =>
        html(
            renderHomePage({
                projects: [],
                total: null,
                workshopTotal,
                error: reason,
            }),
        )

    // 两侧的收录总数一起等：工坊那次只是页面上的一个数字，失败也不影响方案列表
    const [upstream, workshopTotal] = await Promise.all([
        fetchUpstream(env, `/api/public-schemes?${search}`, LIST_TIMEOUT_MS),
        fetchWorkshopTotal(),
    ])
    if (!upstream.ok) {
        return failed(await reasonOf(upstream.response), workshopTotal)
    }

    // 统一走 `readUpstreamJson`：读 body 阶段超时和「内容不是 JSON」要分开报
    const parsed = await readUpstreamJson<WuwaCalcSchemeListResponse>(
        upstream.res,
    )
    if (!parsed.ok) {
        return failed(await reasonOf(parsed.response), workshopTotal)
    }

    const items = (Array.isArray(parsed.data?.items) ? parsed.data.items : [])
        .slice(0, pageSize)
    const total = Number(parsed.data?.total)
    return html(
        renderHomePage({
            projects: items.map(toHomeProject),
            total: Number.isFinite(total) && total >= 0 ? total : items.length,
            workshopTotal,
        }),
    )
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

/**
 * 杂志衬线 + VitePress 版式：窄栏居中、发丝分隔线、小字号大写字距的栏目标签。
 * 不引外部字体，只依赖系统里的衬线族（中文优先思源宋体 / 宋体）。
 */
const STYLES = `
:root {
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia,
    "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --paper: #fbf9f4;
  --paper-2: #ffffff;
  --ink: #1c1917;
  --ink-2: #57534e;
  --ink-3: #8b827c;
  --rule: #e4ded3;
  --accent: #0f766e;
  --accent-strong: #0b5f59;
  --accent-2: #b45309;
  /* 主色底上的文字色：浅色模式的 accent 很深，得用浅字 */
  --on-accent: #fdfcf9;
  --nav-h: 56px;
  --shadow: 0 1px 2px rgba(28, 25, 23, .04), 0 12px 32px -18px rgba(28, 25, 23, .28);
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #131315;
    --paper-2: #1a1a1d;
    --ink: #ece9e4;
    --ink-2: #b3aea7;
    --ink-3: #857f78;
    --rule: #2c2c31;
    --accent: #5eead4;
    --accent-strong: #2dd4bf;
    --accent-2: #fbbf24;
    /* 暗色模式的 accent 很浅，主色底上得用深字 */
    --on-accent: #06231f;
    --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 16px 40px -22px rgba(0, 0, 0, .8);
  }
}
* { box-sizing: border-box; }
/* 页面里的图标一律手绘内联 SVG：描边跟随文字颜色 */
.icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
html {
  scroll-behavior: smooth;
  /* 页面不显示滚动条（滚动本身照旧：滚轮 / 触控 / 键盘都还能翻） */
  scrollbar-width: none;      /* Firefox */
  -ms-overflow-style: none;   /* 旧 Edge / IE */
}
html::-webkit-scrollbar { width: 0; height: 0; display: none; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
code {
  font-family: var(--mono);
  font-size: .86em;
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  padding: .1em .38em;
  border-radius: 4px;
}

/* 顶栏：开屏（大部分内容还在首屏）时藏起来，滚下去再出现 */
.nav {
  position: fixed;
  inset: 0 0 auto;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  height: var(--nav-h);
  padding: 0 clamp(20px, 6vw, 64px);
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--rule);
}
/*
 * 顶栏的显隐只用滚动时间线**切一下状态**（steps(1)，没有滑动/淡入的动作），
 * 滚过 80px 就出现。不支持的浏览器整段跳过，顶栏保持常显。
 */
@supports (animation-timeline: scroll()) {
  .nav {
    animation: nav-flip 1ms steps(1, end) both;
    animation-timeline: scroll(root block);
    animation-range: 0 80px;
  }
}
@keyframes nav-flip {
  from {
    opacity: 0;
    pointer-events: none;
  }
  to {
    opacity: 1;
    pointer-events: auto;
  }
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  letter-spacing: .04em;
  font-weight: 600;
}
.brand-mark {
  width: 10px; height: 10px;
  background: var(--accent);
  transform: rotate(45deg);
}
/* 右上角只留「返回顶部」 */
.nav-top {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px 7px 11px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-2);
  transition: .18s ease;
}
.nav-top .icon { width: 15px; height: 15px; }
.nav-top:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--rule));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  transform: translateY(-1px);
}
@media (max-width: 560px) { .nav-top span { display: none; } }

/* 首屏 */
.hero {
  max-width: 1152px;
  margin: 0 auto;
  padding: clamp(56px, 10vw, 104px) 24px clamp(40px, 6vw, 64px);
  text-align: center;
}
.hero-eyebrow {
  margin: 0 0 18px;
  font-family: var(--sans);
  font-size: 12px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.hero h1 {
  margin: 0;
  font-size: clamp(38px, 7.2vw, 76px);
  line-height: 1.08;
  letter-spacing: -.02em;
  font-weight: 600;
}
.hero h1 .dot { color: var(--ink-3); margin: 0 .06em; }
.hero h1 .accent {
  background: linear-gradient(120deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-tagline {
  max-width: 640px;
  margin: 26px auto 0;
  font-size: clamp(16px, 1.6vw, 19px);
  color: var(--ink-2);
}
.hero-actions { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-top: 36px; }

/* 按钮：三个都带底色，hover 各自加深一档 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 11px 24px 11px 20px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: var(--sans);
  font-size: 14px;
  letter-spacing: .02em;
  transition: background .18s ease, border-color .18s ease, color .18s ease,
    box-shadow .18s ease, transform .18s ease;
}
.btn .icon {
  width: 17px;
  height: 17px;
  flex: none;
}
.btn:hover { transform: translateY(-2px); }
.btn-toolbox {
  color: var(--on-accent);
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border-color: transparent;
  box-shadow: 0 6px 18px -10px color-mix(in srgb, var(--accent) 80%, transparent);
}
.btn-toolbox:hover {
  background: linear-gradient(135deg, var(--accent-strong), var(--accent-2));
  box-shadow: 0 12px 26px -12px color-mix(in srgb, var(--accent) 90%, transparent);
}
.btn-wuwacalc {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 7%, var(--paper-2));
  border-color: color-mix(in srgb, var(--ink) 14%, transparent);
}
.btn-wuwacalc:hover {
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 14%, var(--paper-2));
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.btn-usage {
  color: var(--ink-2);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  border-color: var(--rule);
}
.btn-usage:hover {
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

/*
 * 唯一的动画：主内容区入场时「弹」一下。
 *
 * - 首屏那几件（主副标题 / 三个按钮）用**定时**动画，进页面就依次弹出来；
 * - 其余内容（统计区 / 卡片 / 图片 / 栏目标题 / 提示）用 view() 滚动时间线，
 *   滚进画面才弹（animation-range: entry）—— 元素一旦已在视口里，进度就超出区间，
 *   直接是终态，不会出现「先空一片再弹」。
 * - 动画只挂在内容元素上，不挂 .section / .section-head：带 transform 的祖先
 *   会成为 sticky 的包含块，贴顶就废了。
 * - 不支持 view() 时间线的浏览器整段跳过；系统偏好减少动效时也一律关掉。
 */
.pop {
  animation: pop-in .5s cubic-bezier(.22, 1, .36, 1) both;
}
.pop-hero {
  animation: pop-in .55s cubic-bezier(.22, 1, .36, 1) both;
}
/* 首屏：进页面依次弹出（主标题 → 副标题 → 三个按钮） */
.hero .pop-hero:nth-child(1) { animation-delay: .04s; }
.hero .pop-hero:nth-child(2) { animation-delay: .12s; }
.hero .pop-hero:nth-child(3) { animation-delay: .2s; }
.hero-actions .pop-hero:nth-child(1) { animation-delay: .28s; }
.hero-actions .pop-hero:nth-child(2) { animation-delay: .35s; }
.hero-actions .pop-hero:nth-child(3) { animation-delay: .42s; }
@supports (animation-timeline: view()) {
  .pop {
    animation-duration: auto;
    animation-timeline: view();
    animation-range: entry 0% entry 45%;
  }
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pop, .pop-hero { animation: none; }
}

/* 正文栏 */
.page { max-width: 1152px; margin: 0 auto; padding: 0 24px 96px; }

/* 收录总数：普通横条，跟着内容滚走（贴顶的是下面的栏目标题） */
.ledger {
  margin-bottom: clamp(48px, 7vw, 80px);
}
.ledger-inner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  padding: 0 18px;
  border-block: 1px solid var(--rule);
}
.ledger-item { padding: 16px 4px; }
.ledger-item + .ledger-item { border-left: 1px solid var(--rule); padding-left: 22px; }
.ledger-label {
  display: block;
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.ledger-value { display: block; margin-top: 4px; font-size: 23px; font-variant-numeric: tabular-nums; }

.section { margin-bottom: clamp(56px, 8vw, 88px); }

/*
 * 栏目标题（最新方案 / 两个端点 / 使用方法）：随内容往上滚，滚到顶栏下面就贴住。
 * 贴住之后用 **CSS 滚动状态容器查询**（container-type: scroll-state +
 * @container scroll-state(stuck: top)）换一套外观 —— 这是 2025 年的新特性；
 * 不支持的浏览器只是少了那点高亮，贴顶行为照旧。
 */
.section-head {
  position: sticky;
  top: var(--nav-h);
  z-index: 15;
  margin-bottom: 28px;
  container-type: scroll-state;
}
.section-head-inner {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px 11px;
  background: color-mix(in srgb, var(--paper) 94%, transparent);
  backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid var(--ink);
  transition: background .2s ease, border-color .2s ease;
}
.section-head h2 { margin: 0; font-size: clamp(24px, 3vw, 32px); font-weight: 600; letter-spacing: -.01em; }
.section-label {
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--ink-3);
  transition: color .2s ease;
}
@container scroll-state(stuck: top) {
  .section-head-inner {
    background: color-mix(in srgb, var(--paper) 86%, transparent);
    border-color: color-mix(in srgb, var(--accent) 60%, var(--rule));
  }
  .section-head h2 { color: var(--accent-strong); }
  .section-label { color: var(--accent-strong); }
}

.notice {
  margin: 0 0 24px;
  padding: 14px 18px;
  border-left: 3px solid var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 8%, transparent);
  font-size: 15px;
  color: var(--ink-2);
}
.notice strong { color: var(--ink); margin-right: .5em; }
.empty { color: var(--ink-3); text-align: center; padding: 48px 0; }

/* 卡片 */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 22px; }
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 24px 20px;
  background: var(--paper-2);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow);
  transition: .2s ease;
}
.card:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--rule)); transform: translateY(-2px); }
@media (min-width: 920px) { .card:first-child { grid-column: span 2; } }
.card-head { display: flex; align-items: baseline; justify-content: space-between; }
.card-order { font-size: 26px; color: var(--accent); font-variant-numeric: tabular-nums; }
.card-date { font-family: var(--sans); font-size: 12px; letter-spacing: .1em; color: var(--ink-3); }
.card-title { margin: 0; font-size: 21px; line-height: 1.35; font-weight: 600; }
.card:first-child .card-title { font-size: 27px; }
.card-desc { margin: 0; font-size: 14px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-team, .card-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.card-team li { font-size: 15px; }
.card-team li + li::before { content: "·"; color: var(--ink-3); margin-right: 8px; }
.card-tags li {
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: .08em;
  color: var(--ink-2);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 2px 10px;
}
.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px dashed var(--rule);
}
.stat-label {
  display: block;
  font-family: var(--sans);
  font-size: 10px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.stat-value { font-size: 20px; font-variant-numeric: tabular-nums; }
.stat-value i { font-style: normal; font-size: 12px; color: var(--ink-3); margin-left: 2px; }
.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-3);
}

/* 端点卡片：两张横排，端点名着色加粗 */
.endpoint-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 22px;
}
.endpoint-card {
  padding: 24px 24px 22px;
  background: var(--paper-2);
  border: 1px solid var(--rule);
  border-top: 3px solid var(--accent);
  box-shadow: var(--shadow);
}
.endpoint-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 12px;
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.01em;
  color: var(--accent);
  word-break: break-all;
}
.endpoint-method {
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
  color: var(--paper-2);
  background: var(--accent);
  border-radius: 4px;
  padding: 2px 6px;
}
.endpoint-card p { margin: 0; color: var(--ink-2); font-size: 15px; }

/* 使用方法：图文双列（图 3 : 文 1），文字在图片右侧 */
.usage-layout {
  display: grid;
  grid-template-columns: 3fr 1fr;
  gap: clamp(20px, 2.5vw, 32px);
  align-items: start;
}
.usage-figure { margin: 0; }
.usage-figure img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  box-shadow: var(--shadow);
}
.usage-text { font-size: 15px; color: var(--ink-2); }
.usage-steps {
  margin: 0;
  padding-left: 1.35em;
  display: grid;
  gap: 10px;
}
.usage-steps li { padding-left: 2px; }
.usage-steps li::marker { color: var(--accent); font-family: var(--sans); }
.usage-text b { color: var(--ink); }
.usage-text code {
  color: var(--ink);
  overflow-wrap: anywhere;
}
/* 窄屏堆叠：图在上、文在下 */
@media (max-width: 860px) {
  .usage-layout { grid-template-columns: 1fr; }
}
/* 暗色截图只在暗色配色下出现，反之亦然 */
.usage-figure.is-dark { display: none; }
@media (prefers-color-scheme: dark) {
  .usage-figure.is-dark { display: block; }
  .usage-figure.is-light { display: none; }
}

/* 页脚 */
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  max-width: 1152px;
  margin: 0 auto;
  padding: 28px 24px 48px;
  border-top: 1px solid var(--rule);
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-3);
}
.foot a { border-bottom: 1px solid var(--rule); }
`
