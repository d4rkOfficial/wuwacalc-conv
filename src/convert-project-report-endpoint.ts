/**
 * 端点：`GET /share/{code}`（HTML）。
 *
 * 输入鸣算屋分享码，输出：
 * - 鸣算屋快照 vs 椰果引擎的总伤 / 逐角色 / 逐技能 / 逐乘区对比；
 * - 转换后的逐条目 Buff 绑定与乘区汇总。
 */

import {
    buildCoconutProjectFile,
    convertWuwaCalcProjectParts,
} from "./convert-project/index.ts"
import {
    fetchProjectDetail,
    SHARE_CODE_PATTERN,
} from "./convert-project-download.ts"
import {
    buildProjectReport,
    type ProjectReport,
    renderProjectReportHtml,
} from "./convert-project-report.ts"
import { buildReportEngineComparison } from "./convert-project-report-engine.ts"
import { gameDataOfProjectTables } from "./convert-project/game-data.ts"
import { measureCoconut } from "../engines/coconut/measure.ts"
import { loadProjectTables } from "./convert-project/tables.ts"
import { errorResponse } from "./http.ts"
import type { Bindings } from "./http.ts"

/** 报告页与下载接口共用 /share/{code} 空间，这里只匹配不带 /download 的精确路径 */
export const REPORT_HTML_PATTERN = /^\/share\/([^/]+)$/

export const handleProjectReport = async (
    code: string,
    env: Bindings,
): Promise<Response> => {
    if (!SHARE_CODE_PATTERN.test(code)) {
        return errorResponse(400, "分享码格式不合法")
    }
    const detail = await fetchProjectDetail(code, env)
    if (!detail.ok) return detail.response
    const tables = await loadProjectTables(env)
    const parts = convertWuwaCalcProjectParts(detail.detail, tables)
    const game = gameDataOfProjectTables(tables)
    let engine = undefined
    if (game) {
        try {
            const file = buildCoconutProjectFile(parts, detail.detail, {
                projectId: code,
            })
            const coconut = measureCoconut(file, game)
            engine = buildReportEngineComparison(
                parts.payload,
                detail.detail.payload?.meta ?? undefined,
                coconut,
            )
        } catch (error) {
            // 报告本身仍要能打开：引擎跑不动时退化为「只有转换映射」，不返回 500。
            console.warn("report engine comparison failed", error)
        }
    }
    const report = buildProjectReport(
        code,
        detail.detail?.title ?? "",
        parts,
        engine,
    )
    return new Response(renderProjectReportHtml(report), {
        status: 200,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
        },
    })
}

export type { ProjectReport }
