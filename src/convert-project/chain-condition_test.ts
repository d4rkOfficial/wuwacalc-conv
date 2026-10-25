/// <reference lib="deno.ns" />
/**
 * 链阶条件：鸣算屋的「X 链专属」效果转成椰果 Buff 后，必须带 `condition.chains`，
 * 而不是在转换时按当前链档直接删掉。这样同一份工程换到 0 链/2 链/6 链导入，
 * 链专属 Buff 会自动开/关。
 *
 * 链专属**伤害**（倍率追加/提升）走「挂载点 + 条件 Buff」：
 * 排轴为技能建「（额外）」条目，拉表把条件额外倍率 Buff 绑到它上面。
 */

import { deepStrictEqual, ok } from "node:assert/strict"
import { convertCalculationPhase } from "./calculation.ts"
import { convertTimelinePhase } from "./timeline.ts"

const makePayload = (chain: number) =>
    ({
        members: [
            {
                name: "测试角色",
                characterId: "9999",
                resonanceUnlocked: chain,
                char: { attrBonusSources: [{ id: "echo_panel_attr_热熔" }] },
                globalBuffActive: {
                    pk_0_test_c6_skill_mult: true,
                    pk_0_test_c2_bonus: true,
                },
                phases: [{ skills: [{ name: "测试技能", catalogId: "c1" }] }],
                rotationCatalog: [
                    {
                        id: "c1",
                        name: "测试技能",
                        librarySkillName: "测试·技能",
                        damageType: "重击",
                        axisOffsetPx: 40,
                        multCount: 1,
                        baseMult: 100,
                        multComponents: [{ rate: 100, count: 1 }],
                    },
                ],
                buffs: [
                    {
                        id: "pk_0_test_c6_skill_mult",
                        name: "【本体】6链·测试技能倍率追加",
                        category: "composite",
                        mode: "fixed",
                        effects: [
                            {
                                zone: "multAdd",
                                valueMode: "fixed",
                                value: 100,
                                minResonance: 6,
                                skillScope: "names",
                                librarySkillNames: ["测试·技能"],
                            },
                        ],
                    },
                    {
                        id: "pk_0_test_c2_bonus",
                        name: "【本体】2链·增伤",
                        category: "composite",
                        mode: "fixed",
                        effects: [
                            {
                                zone: "generalBonus",
                                valueMode: "fixed",
                                value: 20,
                                minResonance: 2,
                            },
                        ],
                    },
                ],
            },
        ],
    }) as never

const convertAt = (chain: number) => {
    const payload = makePayload(chain)
    const timeline = convertTimelinePhase(payload)
    const calculation = convertCalculationPhase(
        payload,
        timeline.entries,
        timeline.entryState,
    )
    return { payload, timeline, calculation }
}

Deno.test("链阶：6 链专属倍率追加落成带链条件的额外倍率 Buff", () => {
    const { timeline, calculation } = convertAt(6)
    const blocks = timeline.phase.data!.damageBlocks
    ok(blocks.some((block) => block.skillHits[0].hitName.includes("（额外）")))

    const extra = calculation.buffs.find((buff) =>
        buff.id.includes("c6_skill_mult·extraRatio")
    )
    ok(extra, "6 链额外倍率 Buff 没有生成")
    deepStrictEqual(extra.condition, { chains: [{ charIdx: 0, min: 6 }] })
    deepStrictEqual(extra.zones, [{ zoneId: "extraRatio", value: 100 }])

    const extraId = timeline.phase.data!.damageBlocks
        .find((block) => block.skillHits[0].hitName.includes("（额外）"))!
        .id + "-常态攻击|测试技能（额外）#攻击"
    const bound = calculation.phase.data!.damageEntryBuffSetIds[extraId] ?? []
    ok(
        bound.includes(extra.id),
        "6 链额外倍率没有绑到「（额外）」挂载点",
    )
})

Deno.test("链阶：2 链专属增伤带 2 链条件", () => {
    const { calculation } = convertAt(6)
    const bonus = calculation.buffs.find((buff) =>
        buff.id.includes("c2_bonus·bonusDmg")
    )
    ok(bonus, "2 链增伤 Buff 没有生成")
    deepStrictEqual(bonus.condition, { chains: [{ charIdx: 0, min: 2 }] })
    deepStrictEqual(bonus.zones, [{ zoneId: "bonusDmg", value: 20 }])
})

Deno.test("链阶：0 链导入时链专属 Buff 仍保留，只靠条件关闭", () => {
    const { calculation } = convertAt(0)
    const extra = calculation.buffs.find((buff) =>
        buff.id.includes("c6_skill_mult·extraRatio")
    )
    const bonus = calculation.buffs.find((buff) =>
        buff.id.includes("c2_bonus·bonusDmg")
    )
    ok(extra, "0 链导入时 6 链 Buff 被提前删掉了")
    ok(bonus, "0 链导入时 2 链 Buff 被提前删掉了")
    deepStrictEqual(extra.condition, { chains: [{ charIdx: 0, min: 6 }] })
    deepStrictEqual(bonus.condition, { chains: [{ charIdx: 0, min: 2 }] })
    // 数值不能因为当前链档低就被清成 0 —— 切到 6 链/2 链后要能直接生效
    deepStrictEqual(extra.zones, [{ zoneId: "extraRatio", value: 100 }])
    deepStrictEqual(bonus.zones, [{ zoneId: "bonusDmg", value: 20 }])
})
