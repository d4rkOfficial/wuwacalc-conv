/// <reference lib="deno.ns" />
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import {
    escapeHtml,
    formatCompact,
    formatDate,
    handleHome,
    handleUsageImage,
    renderHomePage,
    toHomeProject,
} from "./home.ts"
import { USAGE_IMAGES, USAGE_IMAGE_PATHS } from "./usage-images.ts"

const assertEquals = (actual: unknown, expected: unknown) =>
    deepStrictEqual(actual, expected)
const assert = (ok: boolean, message: string) => strictEqual(ok, true, message)

const realFetch = globalThis.fetch
let calls: string[] = []

const stubUpstream = (impl: (url: string) => Response | Promise<Response>) => {
    calls = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        return Promise.resolve(impl(url))
    }) as typeof fetch
}

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    })

/** 测试用 env：`cf-typegen` 后 `WUWACALC_API_BASE` 是必填的字面量类型 */
const testEnv = { WUWACALC_API_BASE: "https://wuwacalc.cn" } as const

/** 真实响应摘录（鸣算屋 `/api/public-schemes`） */
const upstreamItem = {
    id: "0c733702-4efc-4cac-9729-3a21b5c0c44b",
    share_code: "MC-HYWBJ2",
    title: "顶配秧千穗·椰果最高的山",
    description: "椰果界最高的山属于是。",
    tags: ["全局轴"],
    summary: {
        teamDps: 608072.87,
        axisDuration: 120,
        monsterLevel: 100,
        monsterRes: 20,
        teamConfig: "6+5",
        memberNames: ["秧秧·玄翎", "穗穗", "莫特斐"],
        memberConfigs: ["6+5", "0+1", "3+1"],
    },
    fork_count: 46,
    approved_at: "2026-10-08T11:26:11.661+00:00",
    updated_at: "2026-10-08T11:26:11.661+00:00",
    profiles: { display_name: "南边" },
}

// ── 格式化 ────────────────────────────────────────────────────────────────────

Deno.test("首页：HTML 转义覆盖五个危险字符", () => {
    assertEquals(
        escapeHtml(`<script>"x"&'y'</script>`),
        "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    )
})

Deno.test("首页：大数字压缩成万 / 亿，非法值给占位符", () => {
    assertEquals(formatCompact(608_072.87), "60.8 万")
    assertEquals(formatCompact(72_968_744), "7,296.9 万")
    assertEquals(formatCompact(123_456_789), "1.2 亿")
    assertEquals(formatCompact(842), "842")
    assertEquals(formatCompact(0), "—")
    assertEquals(formatCompact(Number.NaN), "—")
})

Deno.test("首页：时间只取日期，非法时间给占位符", () => {
    assertEquals(formatDate("2026-10-08T11:26:11.661+00:00"), "2026-10-08")
    assertEquals(formatDate("not-a-date"), "—")
    assertEquals(formatDate(new Date(0).toISOString()), "—")
})

Deno.test("首页：卡片显示全队链阶，并优先用全队 0+1 变体的 DPS", () => {
    // 真实响应摘录（MC-VH56VG）：主配置 6+5，另有全队 0+1 变体
    const item = {
        share_code: "MC-VH56VG",
        title: "景月守4盾20Z全局",
        summary: {
            teamDps: 451_567.66795833333,
            teamTotal: 54_188_120.155,
            axisDuration: 120,
            teamConfig: "6+5",
            memberNames: ["景燃", "尤诺", "守岸人"],
            memberConfigs: ["6+5", "6+5", "6+5"],
            configVariants: [
                {
                    key: "6+5|6+5|6+5",
                    memberConfigs: ["6+5", "6+5", "6+5"],
                    teamDps: 451_567.66795833333,
                    teamTotal: 54_188_120.155,
                    axisDuration: 120,
                },
                {
                    key: "0+1|0+1|0+1",
                    memberConfigs: ["0+1", "0+1", "0+1"],
                    teamDps: 106_207.19416666667,
                    teamTotal: 12_744_863.3,
                    axisDuration: 120,
                },
            ],
        },
        profiles: { display_name: "南边" },
    } as never

    const project = toHomeProject(item, 1)

    // 全队三人链阶，而不是主 C 单人的 teamConfig
    assertEquals(project.config, "0+1 / 0+1 / 0+1")
    // DPS 跟着所选档位走（0+1 变体），不能挂 6+5 的数字
    assertEquals(project.dps, 106_207.19416666667)
    assertEquals(project.duration, 120)
})

Deno.test("首页：没有全队 0+1 变体时显示主配置的全队链阶", () => {
    const item = {
        share_code: "MC-X",
        summary: {
            teamConfig: "6+5",
            memberNames: ["A", "B", "C"],
            memberConfigs: ["6+5", "0+1", "2+1"],
        },
    } as never

    const project = toHomeProject(item, 1)

    assertEquals(project.config, "6+5 / 0+1 / 2+1")
})

// ── 渲染 ──────────────────────────────────────────────────────────────────────

Deno.test("首页：卡片渲染标题 / 队伍 / 统计，且不带下载按钮", () => {
    const html = renderHomePage({
        total: 128,
        projects: [{
            order: "01",
            title: "顶配秧千穗",
            author: "南边",
            code: "MC-HYWBJ2",
            names: ["秧秧·玄翎", "穗穗", "莫特斐"],
            tags: ["全局轴"],
            downloads: 46,
            createdAt: "2026-10-08T11:26:11.661+00:00",
            dps: 608_072.87,
            duration: 120,
            level: 100,
            res: 20,
            config: "6+5",
            description: "椰果界最高的山属于是。",
        }],
    })

    assert(html.includes("椰果工坊"), "应当有主标题")
    assert(html.includes("鸣算屋转接器"), "应当有主标题")
    assert(html.includes("顶配秧千穗"), "应当有方案标题")
    assert(html.includes("秧秧·玄翎"), "应当有队伍角色")
    assert(html.includes("60.8 万"), "应当有压缩后的 DPS")
    assert(html.includes("Lv100"), "应当有怪物等级")
    assert(html.includes("2026-10-08"), "应当有日期")
    assert(html.includes("128"), "应当有收录总数")
    // 卡片上不再给下载入口（端点说明里提到 `/share/{code}/download` 属于文案，不算链接）
    assert(!html.includes("下载工程"), "卡片里不应再有下载按钮")
    assert(!html.includes('class="card-action"'), "卡片里不应再有操作链接")
    assert(!/href="\/share\//.test(html), "页面里不应有指向下载端点的链接")
})

Deno.test("首页：上游文本一律转义，不给注入留口子", () => {
    const html = renderHomePage({
        total: 1,
        projects: [{
            order: "01",
            title: `<img src=x onerror="alert(1)">`,
            author: "<b>作者</b>",
            code: "MC-A",
            names: ["<i>角色</i>"],
            tags: ["</style>"],
            downloads: 0,
            createdAt: "2026-10-08T00:00:00.000Z",
            dps: 0,
            duration: 0,
            level: 0,
            res: 0,
            config: "",
            description: "</p><script>alert(2)</script>",
        }],
    })

    assert(!html.includes("<img src=x"), "标题里的标签必须被转义")
    assert(!html.includes("<b>作者</b>"), "作者里的标签必须被转义")
    assert(!html.includes("<i>角色</i>"), "角色名里的标签必须被转义")
    assert(!html.includes("<script>alert(2)"), "描述里的脚本必须被转义")
})

Deno.test("首页：无方案时给空态，卡片一律不带下载按钮", () => {
    const empty = renderHomePage({ total: 0, projects: [] })
    assert(empty.includes("这一页没有方案"), "应当有空态文案")

    const minimal = renderHomePage({
        total: 1,
        projects: [{
            order: "01",
            title: "无码方案",
            author: "匿名",
            code: "",
            names: [],
            tags: [],
            downloads: 0,
            createdAt: "",
            dps: 0,
            duration: 0,
            level: 0,
            res: 0,
            config: "",
            description: "",
        }],
    })
    assert(minimal.includes("无码方案"), "应当渲染标题")
    assert(minimal.includes("匿名"), "应当渲染作者")
    assert(!minimal.includes("下载工程"), "卡片里不应再有下载按钮")
    assert(!minimal.includes('class="card-action"'), "卡片里不应再有操作链接")
})

Deno.test("首页：上游失败时仍然出页面，并显示提示", () => {
    const html = renderHomePage({
        projects: [],
        total: 0,
        error: "上游请求超时",
    })
    assert(html.includes("上游暂时不可用"), "应当有失败提示")
    assert(html.includes("上游请求超时"), "应当带上失败原因")
    assert(html.includes("椰果工坊"), "失败时页面结构仍在")
})

Deno.test("首页：右上角是「返回顶部」，三个按钮各带图标", () => {
    const html = renderHomePage({ total: 0, projects: [] })

    const nav = /<header class="nav"[\s\S]*?<\/header>/.exec(html)?.[0] ?? ""
    // 顶栏是 fixed 的，滚动锚点只能挂在 body 上
    assert(html.includes('<body id="top">'), "body 应当带 top 锚点")
    assert(nav.includes('href="#top"'), "右上角应当是返回顶部")
    assert(nav.includes("返回顶部"), "右上角文案应当是返回顶部")
    assert(
        nav.includes("<svg") && nav.includes("M5 12l7-7 7 7"),
        "返回顶部应当有上箭头图标",
    )
    assertEquals(
        (nav.match(/<a /g) ?? []).length,
        2,
    )
    // 三处主站链接挪到了大按钮上
    assert(!nav.includes("wuwacalc.cn"), "顶栏不该再挂主站跳转")

    const actions = /<div class="hero-actions">([\s\S]*?)<\/div>/.exec(html)?.[1] ??
        ""
    assertEquals(
        (actions.match(/<a /g) ?? []).length,
        3,
    )
    assert(
        actions.includes('href="https://wuwa-afyg-tool.200503.xyz"'),
        "应当跳椰果工具箱",
    )
    assert(
        actions.includes('href="https://wuwacalc.cn"'),
        "应当跳鸣算屋",
    )
    // 每个按钮一个内联 SVG：两个链接图标 + 一个问号
    assertEquals(
        (actions.match(/<svg /g) ?? []).length,
        3,
    )
    assertEquals(
        (actions.match(/class="icon"/g) ?? []).length,
        3,
    )
    assertEquals(
        (
            actions.match(
                /<path d="M14 11a5 5 0 0 0-7\.07 0l-3 3a5 5 0 0 0 7\.07 7\.07l1\.71-1\.71" \/>/g,
            ) ?? []
        ).length,
        2,
    )
    assert(actions.includes('cx="12" cy="12" r="9"'), "使用方法应当是问号图标")
})

Deno.test("首页：栏目叫「最新方案」，端点做成两张卡片且名字着色加粗", () => {
    const html = renderHomePage({ total: 0, projects: [] })

    assert(html.includes("<h2>最新方案</h2>"), "列表栏目应当叫「最新方案」")
    assert(!html.includes("工程广场</h2>"), "旧的「工程广场」标题应当去掉")

    const cards = [...html.matchAll(/<article class="endpoint-card pop">/g)]
    assertEquals(cards.length, 2)
    assert(
        html.includes('<h3 class="endpoint-name">'),
        "端点名应当是独立元素",
    )
    assert(html.includes("/api/public/projects</h3>"), "应当有列表端点名")
    assert(
        html.includes("/share/{code}/download</h3>"),
        "应当有下载端点名",
    )
    // 着色加粗写在 `.endpoint-name` 上
    const rule = /\.endpoint-name \{[\s\S]*?\}/.exec(html)?.[0] ?? ""
    assert(rule.includes("color: var(--accent)"), "端点名应当着色")
    assert(rule.includes("font-weight: 700"), "端点名应当加粗")
})

Deno.test("首页：标语就是那句话", () => {
    const html = renderHomePage({ total: 0, projects: [] })
    assert(
        html.includes("把鸣算屋的方案列表/下载API与完整工程翻译成椰果工具箱认得的格式"),
        "标语应当是新文案",
    )
})

Deno.test("首页：标题区下面是三格收录总数，合计为两侧之和", () => {
    const ledger = (html: string) =>
        /<section class="ledger pop">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? ""

    const both = ledger(renderHomePage({
        total: 128,
        workshopTotal: 85,
        projects: [],
    }))
    assert(both.includes("鸣算屋收录方案"), "应当有鸣算屋收录方案")
    assert(both.includes("椰果工坊收录方案"), "应当有椰果工坊收录方案")
    assert(both.includes("合计收录方案"), "应当有合计收录方案")
    assert(both.includes("128"), "应当渲染鸣算屋总数")
    assert(both.includes("85"), "应当渲染工坊总数")
    assert(both.includes("213"), "合计应当是 128 + 85")
    assertEquals(
        (both.match(/<div class="ledger-item">/g) ?? []).length,
        3,
    )

    // 任何一侧缺失都不编数字
    const noWorkshop = ledger(renderHomePage({ total: 128, projects: [] }))
    assert(noWorkshop.includes("128"), "鸣算屋总数照常渲染")
    assertEquals((noWorkshop.match(/—/g) ?? []).length, 2)

    const neither = ledger(renderHomePage({ total: null, projects: [] }))
    assertEquals((neither.match(/—/g) ?? []).length, 3)
})

Deno.test("首页：页面不显示滚动条", () => {
    const html = renderHomePage({ total: 0, projects: [] })
    assert(html.includes("scrollbar-width: none"), "Firefox 下不显示滚动条")
    assert(
        html.includes("html::-webkit-scrollbar"),
        "WebKit 下也要处理",
    )
    assert(
        /html::-webkit-scrollbar \{[^}]*display: none/.test(html),
        "WebKit 滚动条应当隐藏",
    )
})

Deno.test("首页：主内容区统一用入场弹入，且只在滚进画面时弹", () => {
    const html = renderHomePage({
        total: 0,
        projects: [{
            order: "01",
            title: "顶配秧千穗",
            author: "南边",
            code: "MC-HYWBJ2",
            names: ["秧秧·玄翎"],
            tags: [],
            downloads: 0,
            createdAt: "2026-10-08T00:00:00.000Z",
            dps: 0,
            duration: 0,
            level: 0,
            res: 0,
            config: "",
            description: "",
        }],
    })

    assert(html.includes("@keyframes pop-in"), "有弹出关键帧")
    assert(html.includes("@supports (animation-timeline: view())"), "带特性兜底")
    assert(
        html.includes("animation-range: entry 0% entry 45%"),
        "进入视口时才弹",
    )
    // 文字 / 卡片 / 图片 / 主副标题 / 统计区 / 按钮，全都要有
    for (
        const cls of [
            '<p class="hero-eyebrow pop-hero">',
            '<h1 class="pop-hero">',
            '<p class="hero-tagline pop-hero">',
            'class="btn btn-toolbox pop-hero"',
            'class="btn btn-wuwacalc pop-hero"',
            'class="btn btn-usage pop-hero"',
            '<section class="ledger pop">',
            '<article class="card pop">',
            '<article class="endpoint-card pop">',
            '<div class="section-head-inner pop">',
            '<div class="usage-text pop">',
            '<figure class="usage-figure is-light pop">',
        ]
    ) {
        assert(html.includes(cls), `缺少入场动画：${cls}`)
    }
    // 首屏三件用定时动画（进页面就弹），其余交给 view() 时间线
    assert(
        html.includes(".hero .pop-hero:nth-child(1)"),
        "主副标题按顺序错帧",
    )
    assert(
        html.includes(".hero-actions .pop-hero:nth-child(3)"),
        "三个按钮按顺序错帧",
    )
    // 贴顶的 .section-head 本身不能挂动画（transform 会成为 sticky 的包含块）
    assert(
        !/<div class="section-head pop/.test(html),
        "贴顶元素不能带弹出动画",
    )
    // 打字 / 光标那套已删掉
    assert(!html.includes("type-ch"), "打字动画应当移除")
    assert(!html.includes("@keyframes caret-blink"), "光标动画应当移除")
    assert(html.includes("prefers-reduced-motion"), "尊重系统的减少动效偏好")
})

Deno.test("首页：栏目标题滚动贴顶，顶栏在开屏时藏起来", () => {
    const html = renderHomePage({ total: 0, projects: [] })

    // 贴顶的是栏目标题（最新方案 / 两个端点 / 使用方法），不是收录总数
    const head = /\.section-head \{[\s\S]*?\}/.exec(html)?.[0] ?? ""
    assert(head.includes("position: sticky"), "栏目标题应当 sticky")
    assert(head.includes("top: var(--nav-h)"), "贴顶位置应当在顶栏下面")
    assert(
        head.includes("container-type: scroll-state"),
        "应当用 scroll-state 容器查询（2025 新特性）",
    )
    const ledger = /\.ledger \{[\s\S]*?\}/.exec(html)?.[0] ?? ""
    assert(!ledger.includes("sticky"), "收录总数不该再贴顶")
    assertEquals(
        [...html.matchAll(/<div class="section-head">/g)].length,
        3,
    )
    assertEquals(
        [...html.matchAll(/<div class="section-head-inner pop">/g)].length,
        3,
    )
    assert(
        /@container scroll-state\(stuck: top\) \{[^}]*\.section-head-inner/.test(
            html,
        ),
        "贴顶时才切换标题外观",
    )

    // 顶栏：只用滚动时间线切状态，没有滑动/淡入的动作
    assert(html.includes("animation-timeline: scroll(root block)"), "用滚动时间线")
    assert(html.includes("@keyframes nav-flip"), "顶栏只切显隐状态")
    assert(html.includes("steps(1, end)"), "状态是瞬间切换的，不做动画")
    assert(
        html.includes("@supports (animation-timeline: scroll())"),
        "不支持滚动时间线时顶栏保持常显",
    )
    assert(
        html.includes("animation-range: 0 80px"),
        "滚过开屏区域后才出现",
    )
    assert(!html.includes("@keyframes nav-reveal"), "顶栏滑入动画应当移除")
})

Deno.test("首页：标题下的「使用方法」按钮跳到页面底部的同名栏目", () => {
    const html = renderHomePage({ total: 0, projects: [] })

    const actions = /<div class="hero-actions">([\s\S]*?)<\/div>/.exec(html)?.[1] ??
        ""
    assert(
        actions.includes('<a class="btn btn-usage pop-hero" href="#usage">'),
        "标题下应当有跳转「使用方法」的按钮",
    )
    assert(html.includes('<section class="section" id="usage">'), "底部应当有锚点")
    assert(html.includes("<h2>使用方法</h2>"), "底部栏目应当叫「使用方法」")
    // 按钮在栏目之前，锚点指向页尾那一段
    assert(
        html.indexOf('href="#usage"') < html.indexOf('id="usage"'),
        "按钮应当排在栏目之前",
    )
})

Deno.test("首页：使用方法图文双列 3:1，文字在图片右侧且没有图注", () => {
    const html = renderHomePage({ total: 0, projects: [] })

    const layout = /\.usage-layout \{[\s\S]*?\}/.exec(html)?.[0] ?? ""
    assert(
        layout.includes("grid-template-columns: 3fr 1fr"),
        "图 3 : 文 1",
    )
    // 图片在前、文字在后 → 文字落在右列
    const figureAt = html.indexOf('class="usage-figure is-light pop"')
    const textAt = html.indexOf('class="usage-text pop"')
    assert(figureAt > 0 && textAt > figureAt, "教程文本应当在图片右侧")
    assert(
        html.includes("@media (max-width: 860px)"),
        "窄屏应当堆叠成一列",
    )
    assertEquals(
        [...html.matchAll(/<figcaption>/g)].length,
        0,
    )

    assert(
        html.includes("在椰果工具箱主页点击 <b>设置 - 连接配置</b>"),
        "应当有使用步骤",
    )
    assert(html.includes("<b>工坊 / 分享源</b>"), "应当点明填在哪一栏")
    assert(
        html.includes("https://wuwacalc-conv.200503.xyz"),
        "应当给出本转接器的部署地址",
    )
    assert(
        html.includes("「从工坊导入」便会展示鸣算屋的方案列表并可供下载"),
        "应当说明最终效果",
    )

    assert(html.includes(USAGE_IMAGE_PATHS.dark), "应当引用暗色附图")
    assert(html.includes(USAGE_IMAGE_PATHS.light), "应当引用亮色附图")
    // 暗色图默认隐藏、暗色配色下才显示
    assert(
        /\.usage-figure\.is-dark \{ display: none; \}/.test(html),
        "亮色配色下应当藏起暗色截图",
    )
    assert(
        /@media \(prefers-color-scheme: dark\) \{\s*\.usage-figure\.is-dark \{ display: block; \}/.test(
            html,
        ),
        "暗色配色下应当换成暗色截图",
    )
})

// ── 附图 ──────────────────────────────────────────────────────────────────────

Deno.test("附图：两张图都能出，且是带长缓存的 JPEG", async () => {
    for (const theme of ["dark", "light"] as const) {
        const res = handleUsageImage(theme)
        assertEquals(res.status, 200)
        assertEquals(res.headers.get("content-type"), "image/jpeg")
        assert(
            (res.headers.get("cache-control") ?? "").includes("immutable"),
            "附图应当可以长缓存",
        )

        const bytes = new Uint8Array(await res.arrayBuffer())
        // JPEG 魔数
        assertEquals([...bytes.slice(0, 3)], [0xff, 0xd8, 0xff])
        // base64 长度 × 3/4 ≈ 原始字节数（留一点 padding 余量）
        const expected = Math.floor(USAGE_IMAGES[theme].base64.length * 3 / 4)
        assert(
            Math.abs(bytes.length - expected) <= 2,
            `字节数应当与 base64 对得上（${bytes.length} vs ${expected}）`,
        )
    }
})

// ── 端点 ──────────────────────────────────────────────────────────────────────

Deno.test("首页端点：取第一页并转成 HTML，同时带上两侧收录总数", async () => {
    stubUpstream((url) =>
        url.includes("wuwa-afyg-share.200503.xyz")
            ? jsonResponse({ projects: [], total: 85, page: 1, perPage: 1 })
            : jsonResponse({
                items: [upstreamItem],
                total: 128,
                page: 1,
                pageSize: 11,
            })
    )
    try {
        const res = await handleHome(
            new URL("https://bridge.example/"),
            testEnv,
        )
        assertEquals(res.status, 200)
        assert(
            (res.headers.get("content-type") ?? "").includes("text/html"),
            "应当是 HTML",
        )
        assert(
            (res.headers.get("cache-control") ?? "").includes("max-age=60"),
            "应当带上缓存头",
        )
        const html = await res.text()
        assert(html.includes("顶配秧千穗·椰果最高的山"), "应当渲染方案标题")
        assert(html.includes("南边"), "应当渲染作者")
        assert(html.includes("鸣算屋收录方案"), "应当有鸣算屋收录总数")
        assert(html.includes("椰果工坊收录方案"), "应当有工坊收录总数")
        assert(html.includes("128"), "应当渲染鸣算屋总数")
        assert(html.includes("85"), "应当渲染工坊总数")
        assert(html.includes("213"), "合计应当是两侧之和")

        // 两次外部请求：鸣算屋列表 + 工坊总数
        assertEquals(calls.length, 2)
        const wuwa = calls.find((url) => url.includes("wuwacalc.cn")) ?? ""
        const workshop =
            calls.find((url) => url.includes("wuwa-afyg-share.200503.xyz")) ??
                ""
        assert(wuwa.includes("/api/public-schemes?"), "应当打到鸣算屋列表接口")
        assert(wuwa.includes("page=1"), "应当只取第一页")
        assert(wuwa.includes("pageSize=11"), "展示页固定取 11 条")
        assert(
            workshop.includes("/api/public/projects?"),
            "应当打到工坊列表接口",
        )
        assert(workshop.includes("perPage=1"), "工坊那边只要 1 条就够算总数")
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("首页端点：工坊总数拿不到时给占位符，不影响方案列表", async () => {
    stubUpstream((url) =>
        url.includes("wuwa-afyg-share.200503.xyz")
            ? jsonResponse({ error: "工坊挂了" }, 500)
            : jsonResponse({ items: [upstreamItem], total: 128 })
    )
    try {
        const res = await handleHome(
            new URL("https://bridge.example/"),
            testEnv,
        )
        assertEquals(res.status, 200)
        const html = await res.text()
        assert(html.includes("顶配秧千穗·椰果最高的山"), "方案列表照常渲染")
        assert(html.includes("128"), "鸣算屋总数照常渲染")
        assert(!html.includes("<strong>上游暂时不可用</strong>"), "不应报成整体失败")
        const ledger = /<section class="ledger pop">([\s\S]*?)<\/section>/.exec(
            html,
        )?.[1] ?? ""
        assertEquals(
            (ledger.match(/—/g) ?? []).length,
            2,
        )
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("首页端点：上游 502 也返回 200 的提示页", async () => {
    stubUpstream(() => jsonResponse({ error: "上游访问失败" }, 502))
    try {
        const res = await handleHome(
            new URL("https://bridge.example/"),
            testEnv,
        )
        assertEquals(res.status, 200)
        const html = await res.text()
        assert(html.includes("上游暂时不可用"), "应当有失败提示")
        assert(html.includes("上游访问失败"), "应当带上上游文案")
    } finally {
        globalThis.fetch = realFetch
    }
})

Deno.test("首页端点：上游不是 JSON 时不抛错", async () => {
    stubUpstream(() =>
        new Response("<html>oops</html>", {
            headers: { "content-type": "text/html" },
        })
    )
    try {
        const res = await handleHome(
            new URL("https://bridge.example/"),
            testEnv,
        )
        assertEquals(res.status, 200)
        const html = await res.text()
        assert(html.includes("不是合法 JSON"), "应当提示内容不合法")
    } finally {
        globalThis.fetch = realFetch
    }
})
