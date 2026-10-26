/**
 * 端点：`GET /share/{code}`（HTML）。
 *
 * 输入鸣算屋分享码，输出：
 * - 转换后的逐条目 Buff 绑定与乘区汇总；
 * - 浏览器本地复核所需的转换工程：页面用鸣算屋 iframe + 线上椰果工具箱
 *   fast-calc iframe 现场重算，不在服务端预算结果。
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
import { loadProjectTables } from "./convert-project/tables.ts"
import { errorResponse } from "./http.ts"
import { FAST_CALC_URL } from "./toolbox.ts"
import type { Bindings } from "./http.ts"

/** 报告页与下载接口共用 /share/{code} 空间，这里只匹配不带 /download 的精确路径 */
export const REPORT_HTML_PATTERN = /^\/share\/([^/]+)$/

export const handleProjectReport = async (
    code: string,
    env: Bindings,
    origin = "",
    configIndex?: number | null,
): Promise<Response> => {
    if (!SHARE_CODE_PATTERN.test(code)) {
        return errorResponse(400, "分享码格式不合法")
    }
    const detail = await fetchProjectDetail(code, env)
    if (!detail.ok) return detail.response
    const tables = await loadProjectTables(env)
    const variants = detail.detail.summary?.configVariants ?? []
    const requestedVariant = configIndex !== undefined && configIndex !== null
        ? variants[configIndex]
        : undefined
    const parts = convertWuwaCalcProjectParts(detail.detail, tables, {
        configVariant: requestedVariant,
    })
    const report = buildProjectReport(
        code,
        detail.detail?.title ?? "",
        parts,
    )
    const profile = parts.team.conditionProfile
    const matchedIndex = variants.findIndex((variant) => {
        const configs = variant.memberConfigs
        if (!Array.isArray(configs) || configs.length < profile.chains.length) {
            return false
        }
        return configs.slice(0, profile.chains.length).every((raw, index) => {
            const matched = /^(\d+)\s*\+\s*(\d+)$/.exec(String(raw ?? ""))
            return !!matched &&
                Number(matched[1]) === profile.chains[index] &&
                Number(matched[2]) === profile.refinements[index]
        })
    })
    const selectedConfigIndex = requestedVariant
        ? configIndex!
        : matchedIndex
    if (variants.length) {
        report.configVariants = variants.map((variant, index) => ({
            index,
            label: variant.label ||
                (variant.memberConfigs ?? []).join(" · ") ||
                "档位 " + (index + 1),
            memberConfigs: variant.memberConfigs ?? [],
        }))
        report.selectedConfigIndex = selectedConfigIndex
    }
    const file = buildCoconutProjectFile(parts, detail.detail, {
        projectId: code,
    })
    report.localRecompute = {
        code,
        project: file.project,
        projectUrl: origin + "/share/" + encodeURIComponent(code) +
            "/download" +
            (selectedConfigIndex >= 0
                ? "?config=" + selectedConfigIndex
                : ""),
        toolboxUrl: env.TOOLBOX_FAST_CALC_URL || FAST_CALC_URL,
        ...(selectedConfigIndex >= 0
            ? {
                memberConfigs: variants[selectedConfigIndex].memberConfigs ?? [],
            }
            : {}),
    }
    return new Response(renderProjectReportHtml(report), {
        status: 200,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
        },
    })
}

export type { ProjectReport }
