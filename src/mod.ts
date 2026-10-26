/**
 * Worker 入口：只做路由，端点实现在各自的文件里。
 *
 * | 方法 | 路径 | 实现 |
 * | --- | --- | --- |
 * | `GET` | `/` | `home.ts`（工程广场展示页，HTML） |
 * | `GET` | `/assets/usage-{dark\|light}.jpg` | `home.ts`（使用方法附图） |
 * | `GET` | `/api/public/projects` | `convert-project-list.ts` |
 * | `GET` | `/share/{code}/download` | `convert-project-download.ts` |
 * | `GET` | `/share/{code}` | `convert-project-report-endpoint.ts`（HTML 报告） |
 */

import {
    handleDownloadProject,
    SHARE_DOWNLOAD_PATTERN,
} from "./convert-project-download.ts"
import { handleListProjects } from "./convert-project-list.ts"
import {
    handleProjectReport,
    REPORT_HTML_PATTERN,
} from "./convert-project-report-endpoint.ts"
import { handleHome, handleUsageImage, USAGE_IMAGE_ROUTE } from "./home.ts"
import { CORS_HEADERS, errorResponse } from "./http.ts"
import {
    handleCsfRequest,
    handleSchemeRequest,
    handleWuwacalcAsset,
    isCsfRequest,
    isSchemeRequest,
    isWuwacalcAsset,
} from "./wuwacalc-proxy.ts"
import type { Bindings } from "./http.ts"

export default {
    async fetch(req, env) {
        const url = new URL(req.url)

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS })
        }
        if (req.method !== "GET") return errorResponse(405, "仅支持 GET 请求")

        if (url.pathname === "/") return await handleHome(url, env)

        // 报告页里的本地重算 iframe：同源代理鸣算屋站点与 CSF 数据
        if (isWuwacalcAsset(url.pathname)) {
            try {
                return await handleWuwacalcAsset(url)
            } catch {
                return errorResponse(502, "鸣算屋引擎资源加载失败")
            }
        }
        if (isCsfRequest(url.pathname)) {
            try {
                return await handleCsfRequest(url)
            } catch {
                return errorResponse(502, "鸣算屋数据加载失败")
            }
        }
        if (isSchemeRequest(url.pathname)) {
            try {
                return await handleSchemeRequest(url)
            } catch {
                return errorResponse(502, "鸣算屋方案数据加载失败")
            }
        }

        const usage = USAGE_IMAGE_ROUTE.exec(url.pathname)
        if (usage) return handleUsageImage(usage[1] as "dark" | "light")

        if (url.pathname === "/api/public/projects") {
            return await handleListProjects(url, env)
        }

        const reportHtml = REPORT_HTML_PATTERN.exec(url.pathname)
        if (reportHtml) {
            try {
                return await handleProjectReport(
                    decodeURIComponent(reportHtml[1]),
                    env,
                    url.origin,
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
