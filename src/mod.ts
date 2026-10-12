/**
 * Worker 入口：只做路由，端点实现在各自的文件里。
 *
 * | 方法 | 路径 | 实现 |
 * | --- | --- | --- |
 * | `GET` | `/` | `home.ts`（工程广场展示页，HTML） |
 * | `GET` | `/api/public/projects` | `convert-project-list.ts` |
 * | `GET` | `/share/{code}/download` | `convert-project-download.ts` |
 */

import {
    handleDownloadProject,
    SHARE_DOWNLOAD_PATTERN,
} from "./convert-project-download.ts"
import { handleListProjects } from "./convert-project-list.ts"
import { handleHome } from "./home.ts"
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

        if (url.pathname === "/api/public/projects") {
            return await handleListProjects(url, env)
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
