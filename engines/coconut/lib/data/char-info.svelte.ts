/** 从工具箱 `src/lib/data/char-info.svelte.ts` 抽出的纯查询桩。 */
let index: Record<string, string> = {};

export const setEchoSkillTextIndex = (next: Record<string, string>): void => {
    index = next;
};

/** 原实现读活动工程的声骸图鉴；离线引擎不加载图鉴时返回空映射。 */
export const getEchoSkillText = (): Record<string, string> => index;
