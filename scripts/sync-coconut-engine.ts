/// <reference lib="deno.ns" />
/**
 * 抽取椰果工具箱（E:\D4rK6\Projects\wuwa-afyg-tool）的计算引擎到本仓库。
 *
 * 只复制引擎真正依赖的文件，保留原目录结构；`$lib/` 由 deno.json 的 import map 指到
 * `engines/coconut/lib/`，因此复制过来的源码**一行不用改**（除了一处 Svelte 数据模块的桩）。
 */

const SRC = Deno.env.get("COCONUT_TOOLBOX") ??
    "E:\\D4rK6\\Projects\\wuwa-afyg-tool"
const ROOT = new URL("../", import.meta.url)
const OUT = new URL("engines/coconut/lib/", ROOT)

const FILES = [
    "src/lib/calc/compute.ts",
    "src/lib/calc/calculation.consts.ts",
    "src/lib/calc/calculation.types.ts",
    "src/lib/calc/condition.ts",
    "src/lib/calc/config.types.ts",
    "src/lib/calc/result.types.ts",
    "src/lib/calc/skill-infer.ts",
    "src/lib/calc/timeline.types.ts",
    "src/lib/calc/utils.ts",
    "src/lib/calc/zone-ops.ts",
    "src/lib/consts/effect-data.ts",
    "src/lib/consts/game-terms.ts",
    "src/lib/consts/stat-data.ts",
    "src/lib/api/types.ts",
    "src/lib/utils/rich-text.ts",
    "src/lib/types/project.ts",
    "src/lib/types/game-data.ts",
]

for (const rel of FILES) {
    const target = new URL(rel.replace(/^src\/lib\//, ""), OUT)
    await Deno.mkdir(new URL(".", target), { recursive: true })
    await Deno.copyFile(
        new URL(rel, "file:///" + SRC.replace(/\\/g, "/") + "/"),
        target,
    )
    console.log("copied", rel)
}

// `compute.ts` 只用到这个 Svelte 模块里的纯函数；用等价桩替换，避免把 Svelte 运行时拖进来。
const stub = new URL("data/char-info.svelte.ts", OUT)
await Deno.mkdir(new URL(".", stub), { recursive: true })
await Deno.writeTextFile(
    stub,
    `/** 从工具箱 \`src/lib/data/char-info.svelte.ts\` 抽出的纯查询桩。 */
export interface EchoSkillTextIndex { [echoName: string]: { desc?: string; values?: unknown[] } }

let index: EchoSkillTextIndex = {};

export const setEchoSkillTextIndex = (next: EchoSkillTextIndex): void => {
    index = next;
};

/** 原实现读活动工程的声骸图鉴；离线引擎不加载图鉴时返回空串。 */
export const getEchoSkillText = (): EchoSkillTextIndex => index;
`,
)
console.log("wrote stub data/char-info.svelte.ts")
