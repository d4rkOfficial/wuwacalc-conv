/**
 * 生成 `src/usage-images.ts`：把两张「使用方法」截图内联成 base64，
 * 同时把原图复制到 `assets/` 供 README 引用。
 *
 * ```sh
 * deno run -A scripts/build-usage-images.ts <暗色截图> <亮色截图>
 * ```
 *
 * 建议输入是 **1200px 宽、JPEG q86 左右**（单张约 70KB）：
 * 上图位置就是 1152px 的内容栏，再大只是徒增体积。
 *
 * 为什么内联而不是放静态目录：Worker 运行时没有文件系统，内联之后
 * Cloudflare 与 Deno 都能直接出图，也不必在 `wrangler.json` 里加 `assets` 配置。
 * `assets/` 那份只给 README 用（GitHub 只认仓库里的文件），两边由本脚本一起更新。
 */

const OUTPUT = "src/usage-images.ts"
/** README 引用的原图目录 */
const ASSET_DIR = "assets"

/** 单张图的安全上限：超过就该重新压一遍，别把 worker 包撑肥 */
const MAX_BYTES = 200 * 1024

const THEMES = [
    { key: "dark", label: "黑夜模式" },
    { key: "light", label: "白天模式" },
] as const

const [darkPath, lightPath] = Deno.args
if (!darkPath || !lightPath) {
    console.error(
        "用法：deno run -A scripts/build-usage-images.ts <暗色截图> <亮色截图>",
    )
    Deno.exit(1)
}

const sources = { dark: darkPath, light: lightPath } as const

await Deno.mkdir(ASSET_DIR, { recursive: true })

const entries: string[] = []
for (const { key, label } of THEMES) {
    const bytes = await Deno.readFile(sources[key])
    if (bytes.length > MAX_BYTES) {
        console.error(
            `✗ ${sources[key]} 有 ${(bytes.length / 1024).toFixed(0)}KB，` +
                `超过 ${MAX_BYTES / 1024}KB；先压到 1200px 宽的 JPEG 再来`,
        )
        Deno.exit(1)
    }
    await Deno.writeFile(`${ASSET_DIR}/usage-${key}.jpg`, bytes)
    // btoa 只吃 latin1，逐字节转字符串
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const base64 = btoa(binary)
    console.log(
        `${label}：${(bytes.length / 1024).toFixed(0)}KB → base64 ${
            (base64.length / 1024).toFixed(0)
        }KB，已写 ${ASSET_DIR}/usage-${key}.jpg`,
    )
    entries.push(
        `    ${key}: {\n` +
            `        contentType: "image/jpeg",\n` +
            `        /** 原图 ${label} */\n` +
            `        base64:\n` +
            `            "${base64}",\n` +
            `    },`,
    )
}

const file = `/**
 * 「使用方法」的两张附图（椰果工具箱「设置 → 连接配置」截图）。
 *
 * ⚠️ 本文件由 \`scripts/build-usage-images.ts\` 生成，不要手改。
 * 换图：先把新截图压成 1200px 宽的 JPEG（约 70KB），再跑
 * \`deno run -A scripts/build-usage-images.ts <暗色截图> <亮色截图>\`。
 *
 * 内联成 base64 是刻意的：Worker 没有文件系统，内联后 Cloudflare 与 Deno
 * 都能直接出图（见 \`home.ts\` 的 \`/assets/usage-*.jpg\` 路由）；
 * 同一份原图也会落在仓库的 \`assets/\` 下给 README 用。
 */

export type UsageTheme = "dark" | "light"

export interface UsageImage {
    contentType: string
    base64: string
}

export const USAGE_IMAGES: Record<UsageTheme, UsageImage> = {
${entries.join("\n")}
}

/** 图片的公开路径；主页与路由共用这一份，避免两边写岔 */
export const USAGE_IMAGE_PATHS: Record<UsageTheme, string> = {
    dark: "/assets/usage-dark.jpg",
    light: "/assets/usage-light.jpg",
}
`

await Deno.writeTextFile(OUTPUT, file)
console.log(`✓ 已写入 ${OUTPUT}`)
