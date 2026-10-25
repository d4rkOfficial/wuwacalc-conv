/** 从工具箱 `src/lib/data/char-info.svelte.ts` 抽出的纯查询桩。 */
export type EchoSkillTextIndex = Record<string, string>;

let index: EchoSkillTextIndex = {};

export const setEchoSkillTextIndex = (next: EchoSkillTextIndex): void => {
    index = next;
};

/** 原实现读活动工程的声骸图鉴；离线引擎不加载图鉴时返回空表。 */
export const getEchoSkillText = (): EchoSkillTextIndex => index;
