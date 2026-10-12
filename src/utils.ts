/** 转换层共用的小工具（纯函数，无副作用） */

/** 宽松取整：数字或可解析字符串，失败回落 `fallback` */
export const toInt = (value: unknown, fallback: number): number => {
    const n = typeof value === "number"
        ? value
        : Number.parseInt(String(value ?? ""), 10)
    return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max)

/** 取非空字符串（自动 trim），否则 `undefined` */
export const optionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
}

/** 时间统一成毫秒时间戳；上游给的是 ISO 字符串 */
export const toEpochMillis = (value: unknown, fallback = 0): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value)
    }
    if (typeof value === "string" && value) {
        const ms = Date.parse(value)
        if (!Number.isNaN(ms)) return ms
    }
    return fallback
}
