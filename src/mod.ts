/**
 * Worker 入口：只做路由，端点实现在各自的文件里。
 *
 * | 方法 | 路径 | 实现 |
 * | --- | --- | --- |
 * | `GET` | `/` | `home.ts`（工程广场展示页，HTML） |
 * | `GET` | `/assets/usage-{dark\|light}.jpg` | `home.ts`（使用方法附图） |
 * | `GET` | `/api/public/projects` | `convert-project-list.ts` |
 * | `GET` | `/share/{code}/download` | `convert-project-download.ts` |
 * | `GET` | `/share/{code}/report` | `convert-project-report-endpoint.ts`（HTML） |
 * | `GET` | `/api/convert/{code}/report` | `convert-project-report-endpoint.ts`（JSON） |
 */

import {
    handleDownloadProject,
    SHARE_DOWNLOAD_PATTERN,
} from "./convert-project-download.ts"
import { handleListProjects } from "./convert-project-list.ts"
import {
    handleProjectReport,
    REPORT_HTML_PATTERN,
    REPORT_JSON_PATTERN,
} from "./convert-project-report-endpoint.ts"
import { handleHome, handleUsageImage, USAGE_IMAGE_ROUTE } from "./home.ts"
import { CORS_HEADERS, errorResponse } from "./http.ts"
import type { Bindings } from "./http.ts"

export default {
    async fetch(req, env) {
        const url = new URL(req.url)

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS })
        }
        if (req.method !== "GET") return errorResponse(405, "仅支持 GET 请求")

        if (url.pathname === "/") return await handleHome(url, env)

        const usage = USAGE_IMAGE_ROUTE.exec(url.pathname)
        if (usage) return handleUsageImage(usage[1] as "dark" | "light")

        if (url.pathname === "/api/public/projects") {
            return await handleListProjects(url, env)
        }

        const reportJson = REPORT_JSON_PATTERN.exec(url.pathname)
        if (reportJson) {
            try {
                return await handleProjectReport(
                    decodeURIComponent(reportJson[1]),
                    env,
                    "json",
                )
            } catch {
                return errorResponse(400, "分享码格式不合法")
            }
        }

        const reportHtml = REPORT_HTML_PATTERN.exec(url.pathname)
        if (reportHtml) {
            try {
                return await handleProjectReport(
                    decodeURIComponent(reportHtml[1]),
                    env,
                    "html",
                )
            } catch {
                return errorResponse(400, "分享码格式不合法")
            }
        }

        const share = SHARE_DOWNLOAD_PATTERN.exec(url.pathname)
        if (share) {
            let code: string
            try {
                code = decodeURIComponent(share[1])
            } catch {
                return errorResponse(400, "分享码格式不合法")
            }
            return await handleDownloadProject(code, env, url.origin)
        }

        return errorResponse(404, "接口不存在")
    },
} satisfies ExportedHandler<Bindings>
