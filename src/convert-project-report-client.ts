/**
 * 报告页的浏览器本地重算。
 *
 * 分享快照没带逐技能时，页面会加载同源的鸣算屋站点 iframe，在用户浏览器里
 * 调 `__WC.importWorkspaceFromData()` + `computeAll()` 重算 W 侧结果；
 * 再把结果与本页服务端算好的椰果工具箱逐技能快照对齐，填进「逐技能」表。
 */

import type { ProjectReport } from "./convert-project-report.ts"

const SCRIPT = String.raw`
(() => {
  const dataEl = document.getElementById("local-recompute-data");
  const host = document.getElementById("local-engine");
  const statusEl = document.getElementById("recompute-status");
  const bar = document.getElementById("recompute-bar");
  const button = document.getElementById("recompute-button");
  const wuwaTime = document.getElementById("wuwa-time");
  const frame = document.getElementById("wuwa-engine");
  if (!dataEl || !host || !frame) return;
  const setProgress = (value, message) => {
    const pctValue = Math.max(0, Math.min(100, value));
    if (bar) {
      bar.style.width = pctValue + "%";
      if (bar.parentElement) bar.parentElement.setAttribute("aria-valuenow", String(Math.round(pctValue)));
    }
    if (statusEl && message) statusEl.textContent = message;
  };
  let data;
  try {
    data = JSON.parse(dataEl.textContent || "{}");
  } catch (error) {
    host.innerHTML = '<p class="bad">本地重算数据解析失败。</p>';
    return;
  }

  const labels = {
    attack: "攻击", hp: "生命", def: "防御",
    baseMult: "倍率", dmgBonus: "增伤", deepen: "加深",
    vulnerability: "易伤", resistance: "抗性", defense: "防御乘区",
    critRate: "暴击率", critDmg: "暴击伤害", critExpect: "双暴期望",
    multBoost: "倍率提升", multAdd: "倍率追加",
  };
  const percentPoints = new Set(["critRate", "critDmg", "multAdd"]);
  const flatZones = new Set(["attack", "hp", "def"]);
  const esc = (value) => String(value == null ? "" : value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char,
  );
  const label = (name) => labels[name] || name;
  const num = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
  const zoneValue = (name, value) => flatZones.has(name)
    ? num(value)
    : percentPoints.has(name)
    ? num(value) + "%"
    : Number(value).toFixed(4);
  const deltaValue = (name, value) => {
    const sign = value >= 0 ? "+" : "";
    if (flatZones.has(name)) return sign + num(value);
    if (percentPoints.has(name)) return sign + num(value) + "%";
    return sign + Number(value).toFixed(4);
  };
  const pct = (value) => Number.isFinite(value)
    ? (value >= 0 ? "+" : "") + (value * 100).toFixed(3) + "%"
    : "∞";
  const statusOf = (rel) => {
    if (!Number.isFinite(rel)) return "bad";
    const abs = Math.abs(rel);
    return abs < 0.001 ? "match" : abs < 0.01 ? "warn" : "bad";
  };
  const statusClass = (status) => status === "match" ? "good" : status === "warn" ? "warn" : status === "unknown" ? "muted" : "bad";
  const statusLabel = (status) => status === "match" ? "一致" : status === "warn" ? "小偏差" : status === "unknown" ? "仅椰果工具箱" : "异常";
  const cleanName = (name) => String(name || "").replace("（额外）", "").replace(/\([^)]*\)$/, "");
  const wuwaZones = (bd) => {
    const zones = {
      baseMult: bd.baseMult,
      dmgBonus: bd.dmgBonus,
      deepen: bd.deepening,
      vulnerability: bd.vulnerability,
      resistance: bd.resistance,
      defense: bd.defense,
      critRate: bd.critRatePct,
      critDmg: bd.critDmgPct,
      critExpect: bd.critExpect,
      multBoost: bd.multBoost,
      multAdd: bd.multAddPct,
    };
    const scale = String(bd.scaleStat || "atk");
    zones[scale === "hp" ? "hp" : scale === "def" ? "def" : "attack"] = bd.attack;
    return zones;
  };
  const collect = (state) => {
    const members = [];
    for (const member of state.members || []) {
      const results = member.results || {};
      const rows = [];
      const push = (skill) => {
        const damage = Number(skill && (skill._damage != null ? skill._damage : skill.damage));
        if (!(damage > 0)) return;
        rows.push({
          name: String(skill.librarySkillName || skill.name || ""),
          catalogId: skill.catalogId ? String(skill.catalogId) : null,
          damage,
          breakdown: skill._breakdown || skill.breakdown || {},
        });
      };
      if (Array.isArray(results.cycles) && results.cycles.length) {
        for (const cycle of results.cycles) {
          for (const step of cycle.steps || cycle.items || []) push(step);
        }
      } else {
        for (const phase of results.damagePhases || []) {
          for (const skill of phase.skills || []) push(skill);
        }
      }
      members.push({
        character: String(member.name || ""),
        total: Number(results.total) || 0,
        rows,
      });
    }
    return members;
  };
  const waitForEngine = () => new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      try {
        const wc = frame.contentWindow && frame.contentWindow.__WC;
        if (wc && typeof wc.importWorkspaceFromData === "function" && typeof wc.computeAll === "function") {
          resolve(wc);
          return;
        }
      } catch (error) { /* iframe 还没同源就绪 */ }
      if (performance.now() - started > 30000) {
        reject(new Error("鸣算屋引擎加载超时"));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });

  const runRecompute = async () => {
    if (button && button.disabled) return;
    if (button) {
      button.disabled = true;
      button.textContent = "重算中…";
    }
    host.innerHTML = '<p class="muted">正在加载鸣算屋引擎…</p>';
    setProgress(8, "正在加载鸣算屋引擎…");
    if (wuwaTime) wuwaTime.textContent = "重算中…";
    try {
      const wc = await waitForEngine();
      setProgress(26, "正在获取分享详情…");
      const detailResponse = await fetch("/api/schemes/" + encodeURIComponent(data.code), { cache: "no-store" });
      if (!detailResponse.ok) throw new Error("分享详情加载失败（" + detailResponse.status + "）");
      const detail = await detailResponse.json();
      const payload = detail.payload && detail.payload.data ? detail.payload.data : detail.data;
      const meta = detail.payload && detail.payload.meta ? detail.payload.meta : (detail.meta || {});
      setProgress(46, "正在导入工程…");
      // 导入阶段会拉 Buff 模板等网络资源；在 iframe 内临时包一层 fetch，
      // 把网络耗时从“引擎计算”里扣掉，避免把网络等待误算成计算时间。
      const win = frame.contentWindow;
      const originalFetch = win && win.fetch;
      let networkMs = 0;
      if (win && typeof originalFetch === "function") {
        win.fetch = function (...args) {
          const requestStarted = performance.now();
          return originalFetch.apply(this, args).finally(() => {
            networkMs += performance.now() - requestStarted;
          });
        };
      }
      const importStarted = performance.now();
      try {
        await wc.importWorkspaceFromData(payload, meta);
      } finally {
        if (win && originalFetch) win.fetch = originalFetch;
      }
      const importMs = performance.now() - importStarted;
      setProgress(70, "正在重算鸣算屋逐技能…");
      const computeStarted = performance.now();
      wc.computeAll();
      const computeMs = performance.now() - computeStarted;
      const elapsed = Math.max(0, importMs - networkMs) + computeMs;
      setProgress(88, "正在对齐差异…");
      const wuwa = collect(wc.state);
      const queues = {};
      for (const skill of data.coconutSkills || []) {
        const base = skill.catalogId ? "c:" + skill.catalogId : "n:" + cleanName(skill.name);
        (queues[base] || (queues[base] = [])).push(skill);
      }
      const rows = [];
      for (const member of wuwa) {
        for (const row of member.rows) {
          const base = row.catalogId ? "c:" + row.catalogId : "n:" + cleanName(row.name);
          const coconut = (queues[base] && queues[base].length) ? queues[base].shift() : null;
          if (!coconut) continue;
          const rel = row.damage ? (coconut.damage - row.damage) / Math.abs(row.damage) : 0;
          const wz = wuwaZones(row.breakdown);
          const zones = [];
          for (const name of Object.keys(coconut.zones || {})) {
            if (!(name in wz)) continue;
            const wv = Number(wz[name]);
            const cv = Number(coconut.zones[name]);
            if (!Number.isFinite(wv) || !Number.isFinite(cv)) continue;
            const delta = cv - wv;
            if (Math.abs(delta) <= 1e-9) continue;
            const zoneRel = wv ? delta / Math.abs(wv) : 0;
            zones.push({
              name,
              wuwa: wv,
              coconut: cv,
              delta,
              status: flatZones.has(name) && Math.abs(delta) <= 2.01 ? "match" : statusOf(zoneRel),
            });
          }
          rows.push({
            character: member.character,
            name: cleanName(row.name),
            wuwaDamage: row.damage,
            coconutDamage: coconut.damage,
            rel,
            status: statusOf(rel),
            zones,
          });
        }
      }
      rows.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel));
      const total = wuwa.reduce((sum, member) => sum + member.total, 0) +
        Number(wc.state.specialSkills && wc.state.specialSkills.results && wc.state.specialSkills.results.total || 0);
      let html = '<div class="recompute-result"><span class="kicker">RESULT</span>' +
        '<p class="muted">浏览器本地重算总伤 <b>' + num(total) + "</b>，共 " +
        rows.length + " 条逐技能。和上面的分享快照合计可能不同。</p></div>";
      html += '<table class="skills-table"><thead><tr><th>技能</th><th class="num">鸣算屋</th><th class="num">椰果工具箱</th><th class="num">偏差</th><th>状态</th><th>乘区差异</th></tr></thead><tbody>';
      for (const row of rows) {
        const zoneHtml = row.zones.length
          ? '<div class="zone-grid">' + row.zones.map((zone) =>
            '<span class="zone-chip ' + statusClass(zone.status) + '"><b>' +
            esc(label(zone.name)) + '</b><span class="zone-values"><em>鸣 ' +
            zoneValue(zone.name, zone.wuwa) + '</em><em>椰 ' +
            zoneValue(zone.name, zone.coconut) + '</em></span><small>' +
            deltaValue(zone.name, zone.delta) + " / " +
            pct(zone.wuwa ? zone.delta / Math.abs(zone.wuwa) : 0) +
            "</small></span>"
          ).join("") + "</div>"
          : '<span class="good">—</span>';
        html += '<tr><td class="skill-cell"><strong>' + esc(row.name) +
          "</strong><small>" + esc(row.character) + "</small></td>" +
          '<td class="num">' + num(row.wuwaDamage) +
          '</td><td class="num">' + num(row.coconutDamage) +
          '</td><td class="num ' + statusClass(row.status) + '"><b>' +
          (row.coconutDamage - row.wuwaDamage >= 0 ? "+" : "") +
          num(row.coconutDamage - row.wuwaDamage) + '</b><small class="pct">' +
          pct(row.rel) + '</small></td><td class="' + statusClass(row.status) +
          '">' + statusLabel(row.status) + '</td><td class="zone-cell">' +
          zoneHtml + "</td></tr>";
      }
      html += "</tbody></table>";
      host.innerHTML = html;
      setProgress(100, "重算完成");
      if (wuwaTime) wuwaTime.textContent = elapsed.toFixed(0);
      const wuwaUnit = document.getElementById("wuwa-unit");
      if (wuwaUnit) wuwaUnit.textContent = "ms";
      if (button) {
        button.disabled = false;
        button.textContent = "重新计算";
      }
    } catch (error) {
      host.innerHTML = '<p class="bad">本地重算失败：' + esc(error && error.message || error) + "</p>";
      setProgress(100, "重算失败");
      if (wuwaTime) wuwaTime.textContent = "—";
      const wuwaUnit = document.getElementById("wuwa-unit");
      if (wuwaUnit) wuwaUnit.textContent = "失败";
      if (button) {
        button.disabled = false;
        button.textContent = "重试";
      }
    }
  };
  if (button) button.addEventListener("click", runRecompute);
  runRecompute();
})();
`

export const renderLocalRecomputeHtml = (report: ProjectReport): string => {
    const data = report.localRecompute
    if (!data) return ""
    const json = JSON.stringify(data).replaceAll("<", "\\u003c")
    return [
        '<iframe id="wuwa-engine" src="/wuwacalc/index.html" title="鸣算屋引擎" aria-hidden="true" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0"></iframe>',
        '<script type="application/json" id="local-recompute-data">' +
        json + "</script>",
        "<script>" + SCRIPT + "</script>",
    ].join("\n")
}
