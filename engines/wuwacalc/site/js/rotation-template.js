/* ============================================================
 * rotation-template.js · 队伍轴模板（深度排轴 / 导出 / 分享 / 导入）
 * 依据：handoff-dsh-v2（阶段 B/C）+ design-deep-completion-v4
 * - 深度排轴弹窗：全队 3 轨道时间轴，10px=1s 固定比例，块最小宽 64px，
 *   自动填充（axisOffsetPx/10，未匹配按窗口等分），拖块改起始、拖右缘改时长，
 *   滚轮缩放至 1ms 网格，Ctrl+←/→ 1ms 微调，可选键位标注模式（三层预填规则）。
 * - 时间标注为附加字段（rotationCatalog 条目 timeSec/durSec/key），不改计算语义；可撤销。
 * - 导出：仅取技能库标准名（librarySkillName），跳过手填/特殊/自定义内容；无 CSF。
 * - 上传：POST /api/rotation-templates（登录），返回 RT-XXXXXX。
 * 红线：测试服内容（1212/9xxx/21010076）严禁进模板；清宵 1413/云琅 21020106 已批准勿拦。
 * 全局仅新增 window.RotationTemplate（其余符号沿用既有 window 全局）。
 * ============================================================ */
(() => {
  'use strict';

  // ---------- 常量 ----------
  const SCALE_PX_PER_S = 10; // 固定比例 10px = 1s（自动填充换算用，与缩放无关）
  const MIN_BLOCK_W = 64;
  const MIN_PX_PER_S = 2;
  const MAX_PX_PER_S = 60;
  const ROUND_MS = 3; // t/dur 保留 3 位小数（毫秒）
  const RT_MAX_CHARS = 3;
  const RT_MAX_SKILLS_PER_CHAR = 80;
  const RT_MAX_TOTAL_SKILLS = 240;
  const RT_MAX_KEY_LEN = 32;

  const KEY_OPTIONS = [
    { value: 'E', label: 'E（共鸣技能）' },
    { value: 'Q', label: 'Q（声骸技能）' },
    { value: 'R', label: 'R（共鸣解放）' },
    { value: 'F', label: 'F（处决·谐度破坏）' },
    { value: 'LMB', label: '左键（普攻）' },
    { value: 'LMB-HOLD', label: '长按左键（重击）' },
    { value: 'RMB', label: '右键（闪避）' },
    { value: 'SPACE+LMB', label: '空格+左键（空中）' },
    { value: '变奏', label: '变奏（无键位）' },
    { value: '延奏', label: '延奏（自动）' },
    { value: '', label: '（无）' },
  ];
  // 角色机制层关键词（design v4 §5：纯规则判不准 → 标「待确认」，不预填）
  const MECHANISM_KEYWORDS = ['昙体仙身', '光翼共奏', '构型', '形态切换', '集谐', '回路'];
// 自动生成：机制层键位映射（角色基础数据 gameText 提取，勿手改；重新生成见 localtest/gen-mechanism-map.js）
const RT_MECHANISM_KEY_MAP = {"1102":{"无明心音·爆裂":"LMB-HOLD"},"1104":{"形神合一·飞身式·翻山越涧":"E"},"1105":{"妙笔丹青·重击·构形":"LMB-HOLD","妙笔丹青·神来之笔":"E","妙笔丹青·极意·神来之笔":"E"},"1108":{"万世霜天·普攻·居合":"LMB"},"1109":{"记忆宫殿·遗忘":"LMB"},"1110":{"穗摇金·普攻·濯雨时第一段":"LMB","穗摇金·普攻·濯雨时第二段":"LMB","穗摇金·普攻·濯雨时第三段":"LMB","穗摇金·普攻·濯雨时第四段":"LMB","穗摇金·重击·濯雨时":"LMB-HOLD"},"1202":{"英魂炽火流·热压弹":"E","英魂炽火流·轰轰":"E"},"1203":{"黑白羊咩·白咩·失控之炎":"LMB-HOLD"},"1206":{"海中戏剧·火焰归亡曲":"SPACE+LMB"},"1208":{"超阈限·普攻·炽天猎杀第一段":"LMB","超阈限·普攻·炽天猎杀第二段":"LMB","超阈限·普攻·炽天猎杀第三段":"LMB","超阈限·普攻·炽天猎杀第四段":"LMB","超阈限·普攻·炽天猎杀第五段":"LMB","超阈限·重击·炼羽裁决第一段":"LMB-HOLD","超阈限·重击·炼羽裁决第二段":"LMB-HOLD","超阈限·重击·炼羽裁决第三段":"LMB-HOLD","超阈限·闪避反击·罪业当涤":"RMB","超阈限·空中攻击·火狱暴雨下落攻击":"SPACE+LMB","超阈限·空中攻击·火狱暴雨持续扫射":"SPACE+LMB","超阈限·共鸣技能·掠袭":"E"},"1209":{"质能等价·谐振场":"R","质能等价·重击·位势转换":"LMB-HOLD","质能等价·重击·反演":"LMB-HOLD"},"1302":{"千面魅影·审判之雷":"LMB"},"1303":{"沉雷藏锋·掀雷":"E","沉雷藏锋·雷厉风行普攻第一段":"LMB","沉雷藏锋·雷厉风行普攻第二段":"LMB","沉雷藏锋·雷厉风行普攻第三段":"LMB","沉雷藏锋·雷厉风行普攻第四段":"LMB","沉雷藏锋·雷厉风行普攻第五段":"LMB","沉雷藏锋·雷厉风行重击":"LMB-HOLD","沉雷藏锋·雷厉风行闪避反击":"RMB"},"1304":{"万物一心·凌霄·普攻第一段":"LMB","万物一心·凌霄·普攻第二段":"LMB","万物一心·凌霄·普攻第三段":"LMB","万物一心·凌霄·普攻第四段":"LMB","万物一心·凌霄·重击":"LMB-HOLD","万物一心·凌霄·闪避反击":"RMB"},"1306":{"曜阳如我·共鸣技能·不败恒阳·迅击":"E","曜阳如我·共鸣技能·不败恒阳·跃空":"E","曜阳如我·共鸣技能·不败恒阳·落袭":"E","曜阳如我·空中闪避反击·不败恒阳·迅击":"SPACE+LMB"},"1307":{"雷炁化生·飞雷诀·归一":"R"},"1309":{"天机万象·千声翻涌·衍射第一段":"E","天机万象·千声翻涌·衍射第二段":"E","天机万象·千声翻涌·衍射第三段":"E","天机万象·千声翻涌·湮灭第一段":"E","天机万象·千声翻涌·湮灭第二段":"E","天机万象·千声翻涌·湮灭第三段":"E","天机万象·千声翻涌·剑止万律":"E","天机万象·千声翻涌·气动":"E","天机万象·千声翻涌·湮灭空中攻击第一段":"SPACE+LMB","天机万象·千声翻涌·湮灭空中攻击第二段":"SPACE+LMB","天机万象·千声翻涌·湮灭空中攻击第三段":"SPACE+LMB","天机万象·千声翻涌·气动空中攻击第一段":"SPACE+LMB","天机万象·千声翻涌·气动空中攻击第二段":"SPACE+LMB","天机万象·千声翻涌·气动下落攻击":"SPACE+LMB","天机万象·雷陨":"E"},"1403":{"雾色掩护·雾化子弹":"E"},"1407":{"风与诗乐的交响·四拍重奏":"LMB-HOLD"},"1409":{"暴风雨·普攻第一段·大卡":"LMB","暴风雨·普攻第二段·大卡":"LMB","暴风雨·普攻第三段·大卡":"LMB","暴风雨·普攻第四段·大卡":"LMB","暴风雨·普攻第五段·大卡":"LMB","暴风雨·闪避反击·大卡":"RMB","暴风雨·上挑攻击·大卡":"LMB","暴风雨·重击·大卡":"LMB-HOLD","暴风雨·强化重击·大卡":"LMB-HOLD","暴风雨·空中攻击第一段·大卡":"SPACE+LMB","暴风雨·空中攻击第二段·大卡":"SPACE+LMB","暴风雨·空中攻击第三段·大卡":"SPACE+LMB","暴风雨·共鸣技能·此剑为潮浪之意·大卡":"E","暴风雨·共鸣技能·凭风斩浪破敌·大卡":"E"},"1410":{"于盈亏间涨落·月弓·普攻第一段强化":"LMB","于盈亏间涨落·月弓·普攻第二段强化":"LMB","于盈亏间涨落·月弓·普攻第三段强化":"LMB","于盈亏间涨落·月弓·闪避反击强化":"RMB"},"1411":{"裁竹为锋·答剑·质黑相青第一段":"LMB-HOLD","裁竹为锋·答剑·质黑相青第二段":"LMB-HOLD","裁竹为锋·答剑·质黑相青第三段":"LMB-HOLD","裁竹为锋·答剑·质黑相青第四段":"LMB-HOLD","裁竹为锋·答剑·弦歌不辍":"LMB-HOLD","裁竹为锋·答剑·割股之心":"LMB-HOLD","裁竹为锋·答剑·忠烈死节":"LMB-HOLD"},"1412":{"在那浩瀚中·重击·符语本源":"LMB-HOLD","在那浩瀚中·符语爆破":"LMB","在那浩瀚中·符语链刃":"LMB","在那浩瀚中·符语日灵":"LMB","在那浩瀚中·共鸣回路·我即语义":"LMB"},"1501":{"万物微尘·浮声千斩·旋音":"E","万物微尘·浮声千斩·旋音飞轮":"E","万物微尘·浮声千斩·回声一段":"E","万物微尘·浮声千斩·回声二段":"E"},"1503":{"星星花绽放·重击·星星花绽放":"LMB-HOLD","星星花绽放·空中攻击·星星花绽放第一段":"SPACE+LMB","星星花绽放·空中攻击·星星花绽放第二段":"SPACE+LMB","星星花绽放·空中攻击·星星花绽放第三段":"SPACE+LMB"},"1504":{"信号闪耀·强光":"LMB","信号闪耀·红灯聚光·普攻一段":"LMB","信号闪耀·红灯聚光·普攻二段":"LMB","信号闪耀·红灯聚光·普攻三段":"LMB","信号闪耀·红灯聚光·重击":"LMB-HOLD"},"1506":{"交错星辉的祝祷·重击·星辉":"LMB-HOLD"},"1507":{"黯夜将明·重斩·破晓":"LMB","黯夜将明·重斩·将明":"LMB","黯夜将明·重斩·终夜":"LMB","黯夜将明·重斩·闪裂":"LMB"},"1508":{"解弦视界·万理归尘·锯环·疾攻第一段":"RMB","解弦视界·万理归尘·锯环·疾攻第二段":"RMB","解弦视界·万理归尘·锯环·疾攻第二段长按":"LMB-HOLD","解弦视界·万理归尘·锯环·疾攻第二段·折鸣":"RMB","解弦视界·万理归尘·锯环·疾攻第三段":"RMB","解弦视界·万理归尘·锯环·疾攻第三段长按":"LMB-HOLD","解弦视界·万理归尘·锯环·疾攻第三段·坠响":"RMB","解弦视界·万理归尘·电锯模式·闪避反击":"RMB","解弦视界·万理归尘·电锯模式·闪避反击长按":"LMB-HOLD","解弦视界·万理归尘·锯环·终结":"RMB"},"1509":{"色光混合律·普攻·虹彩飞溅":"LMB","色光混合律·普攻·视觉冲击":"LMB","色光混合律·普攻·幻光折跃·第1段":"LMB","色光混合律·普攻·幻光折跃·第2段":"LMB","色光混合律·普攻·幻光折跃·第3段":"LMB"},"1601":{"攻防转换·御反之隙第一段":"LMB","攻防转换·御反之隙第二段":"LMB","攻防转换·御反之隙第三段":"LMB"},"1602":{"丹心昭瑾·缭乱":"LMB-HOLD","丹心昭瑾·纷落":"LMB-HOLD"},"1604":{"永夜开明·暗流·普攻第一段":"LMB","永夜开明·暗流·普攻第二段":"LMB","永夜开明·暗流·普攻第三段":"LMB","永夜开明·暗流·普攻第四段":"LMB","永夜开明·暗流·普攻第五段":"LMB","永夜开明·暗流·重击":"LMB-HOLD","永夜开明·暗流·下落攻击":"SPACE+LMB","永夜开明·暗流·闪避反击":"RMB"},"1607":{"虚实之间·感知汲取":"E"},"1608":{"新世界狂想曲·亡与死的乐章":"LMB","新世界狂想曲·永不消逝的梦呓":"LMB"},"1610":{"万声浮道·共鸣技能·剑式流转·苍":"E","万声浮道·共鸣技能·剑式流转·羽":"E","万声浮道·重击·苍剑式":"LMB-HOLD","万声浮道·重击·羽剑式":"LMB-HOLD","万声浮道·空中攻击·释羽风落":"SPACE+LMB","万声浮道·普攻·湮象风华第一段":"LMB","万声浮道·普攻·湮象风华第二段":"LMB","万声浮道·普攻·湮象风华第三段":"LMB","万声浮道·闪避反击·湮象风华第一段":"RMB","万声浮道·闪避反击·湮象风华第二段":"RMB","万声浮道·闪避反击·湮象风华第三段":"RMB"}};


  const rt = {
    ui: null, // 弹窗 DOM 容器
    state: null, // 编辑态：{ pxPerSec, keyMode, members: [{memberIndex, entries:[{id,name,librarySkillName,t,dur,phase,key,auto}]}], selectedId, teamDur }
  };

  // ---------- 工具 ----------
  const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
  const esc = (s) =>
    typeof escapeHtml === 'function'
      ? escapeHtml(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getMembers() {
    return Array.isArray(state?.members) ? state.members : [];
  }

  /** 当前编辑轮 rotationCatalog（cycle 开启时取激活轮；否则取成员级） */
  function getRoundCatalog(member) {
    if (!member) return [];
    const cfg = member.cycleConfig;
    if (cfg && cfg.enabled) {
      const idx =
        typeof readActiveCycleRoundIndex === 'function' ? readActiveCycleRoundIndex(member) : 0;
      const round = cfg.rounds?.[idx];
      if (round && Array.isArray(round.rotationCatalog)) return round.rotationCatalog;
    }
    return Array.isArray(member.rotationCatalog) ? member.rotationCatalog : [];
  }

  /** 当前轮时长（秒）：cycle 轮 duration > 轴长兜底 > 20 */
  function getMemberRoundDuration(member) {
    const cfg = member?.cycleConfig;
    if (cfg && cfg.enabled) {
      const idx =
        typeof readActiveCycleRoundIndex === 'function' ? readActiveCycleRoundIndex(member) : 0;
      const d = Number(cfg.rounds?.[idx]?.duration);
      if (Number.isFinite(d) && d > 0) return d;
    }
    const axis = Number(state?.team?.axisDuration);
    return Number.isFinite(axis) && axis > 0 ? axis : 20;
  }

  /** 全队时间轴总时长（队轮总长）：取各成员当前轮时长最大值 */
  function getTeamCycleDuration() {
    const durs = getMembers().map((m) => getMemberRoundDuration(m)).filter((d) => d > 0);
    return durs.length ? Math.max(...durs) : 20;
  }

  /** 是否为可导出技能：有库名（librarySkillName）且非特殊/手填/自定义 */
  function isExportableEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (typeof isAxisLinkedSpecialCatalogEntry === 'function' && isAxisLinkedSpecialCatalogEntry(entry)) return false;
    const lib = String(entry.librarySkillName || entry.libraryName || '').trim();
    if (!lib) return false;
    if (/^(自定义|手填)/.test(lib) || /^技能\d+$/.test(String(entry.name || ''))) return false;
    return true;
  }

  // ---------- 键位预填（design v4 §5 三层规则：类型层→关键词层→机制层待确认） ----------
  function guessKey(name) {
    const n = String(name || '');
    if (n.includes('共鸣技能')) return 'E';
    if (n.includes('共鸣解放')) return 'R';
    if (n.startsWith('声骸·')) return 'Q';
    if (n.includes('处决') || n.includes('谐度破坏')) return 'F';
    if (n.includes('变奏')) return '变奏';
    if (n.includes('延奏')) return '延奏';
    if (n.includes('空中')) return 'SPACE+LMB';
    if (n.includes('重击')) return 'LMB-HOLD';
    if (n.includes('闪避')) return 'RMB';
    if (n.includes('普攻')) return 'LMB';
    if (n.includes('固有') || n.includes('被动')) return '';
    return '';
  }

  /** 名称自带操作词（最可靠，与生成器同规则） */
  function nameOpKey(name) {
    const n = String(name || '');
    if (n.includes('空中') || n.includes('下落')) return 'SPACE+LMB';
    if (n.includes('长按') || n.includes('按住')) return 'LMB-HOLD';
    if (n.includes('闪避')) return 'RMB';
    if (n.includes('重击')) return 'LMB-HOLD';
    if (n.includes('变奏')) return '变奏';
    if (n.includes('延奏')) return '延奏';
    if (n.includes('处决') || n.includes('谐度破坏')) return 'F';
    if (n.includes('共鸣技能')) return 'E';
    if (n.includes('共鸣解放')) return 'R';
    if (n.includes('普攻') || n.includes('上挑')) return 'LMB';
    return '';
  }

  /** 三层预填（按条目）：名称词 → 机制映射表（文案提取）→ 类型/关键词层 → 待确认 */
  function guessKeyForEntry(e) {
    const name = String((e && e.name) || '');
    const st = String((e && e.skillType) || '');
    const charId = String((e && e.charId) || '');
    // 机制层：共鸣回路类 / 形态机制关键词（先名称词，再文案映射表，最后待确认）
    if (st === '共鸣回路' || MECHANISM_KEYWORDS.some((k) => name.includes(k))) {
      const nop = nameOpKey(name);
      if (nop) return { key: nop, pendingConfirm: false };
      const mapped = RT_MECHANISM_KEY_MAP[charId] && RT_MECHANISM_KEY_MAP[charId][name];
      if (mapped) return { key: mapped, pendingConfirm: false };
      return { key: '', pendingConfirm: true };
    }
    // 类型层（100% 可靠）
    if (st === '共鸣技能') return { key: 'E', pendingConfirm: false };
    if (st === '共鸣解放') return { key: 'R', pendingConfirm: false };
    if (st === '变奏技能') return { key: '变奏', pendingConfirm: false };
    if (st === '延奏技能') return { key: '延奏', pendingConfirm: false };
    // 关键词层补充
    if (name.startsWith('声骸·')) return { key: 'Q', pendingConfirm: false };
    if (name.includes('处决') || name.includes('谐度破坏')) return { key: 'F', pendingConfirm: false };
    if (st === '常态攻击' || !st) {
      if (name.includes('空中')) return { key: 'SPACE+LMB', pendingConfirm: false };
      if (name.includes('重击')) return { key: 'LMB-HOLD', pendingConfirm: false };
      if (name.includes('闪避')) return { key: 'RMB', pendingConfirm: false };
      return { key: 'LMB', pendingConfirm: false };
    }
    return { key: '', pendingConfirm: false };
  }

  // ---------- 自动填充（design v4 §1：已自定义的 t/dur 保留，只填未定义的） ----------
  function autoFillMember(entries, teamDur) {
    const filled = entries.map((e) => ({ ...e, auto: true }));
    const customized = filled.filter((e) => Number.isFinite(e.t));
    const toAuto = filled.filter((e) => !Number.isFinite(e.t));
    if (toAuto.length) {
      const withOffset = toAuto.filter((e) => e.axisOffsetPx != null && Number.isFinite(Number(e.axisOffsetPx)));
      const matched = withOffset.map((e) => ({ e, t: r3(Number(e.axisOffsetPx) / SCALE_PX_PER_S) }));
      matched.sort((a, b) => a.t - b.t);
      const matchedSet = new Set(matched.map((x) => x.e.id));
      const unmatched = toAuto.filter((e) => !matchedSet.has(e.id));

      if (!matched.length) {
        const n = unmatched.length;
        unmatched.forEach((e, i) => {
          e.t = r3(((i + 1) * teamDur) / (n + 1));
          e.dur = 1;
        });
      } else {
        const windows = [];
        if (matched[0].t > 0) windows.push({ start: 0, end: matched[0].t });
        for (let i = 0; i < matched.length - 1; i++) {
          const gap = matched[i + 1].t - matched[i].t;
          if (gap > 0.0001) windows.push({ start: matched[i].t, end: matched[i + 1].t });
        }
        const last = matched[matched.length - 1].t;
        if (teamDur - last > 0.0001) windows.push({ start: last, end: teamDur });
        let count = 0;
        const winCount = windows.length;
        unmatched.forEach((e) => {
          const win = windows.length ? windows[Math.floor(count % winCount)] : { start: 0, end: teamDur };
          e.t = r3(win.start + ((count + 1) * (win.end - win.start)) / (Math.floor(count / winCount) + 2));
          e.dur = 1;
          count++;
        });
      }
      matched.forEach((x) => {
        x.e.t = x.t;
        x.e.dur = 1;
      });
    }
    // 缺省 dur=1、phase=0、key='' 兜底（customized 只补缺省，不覆盖已设值）
    filled.forEach((e) => {
      if (!Number.isFinite(e.t) || e.t == null) e.t = 0;
      if (!Number.isFinite(e.dur) || e.dur == null || e.dur <= 0) e.dur = 1;
      if (!Number.isInteger(e.phase) || e.phase < 0) e.phase = 0;
      if (e.key == null) e.key = '';
    });
    return filled;
  }

  // ---------- 构建编辑态 ----------
function buildEditState() {
    const teamDur = getTeamCycleDuration();
    const members = getMembers();
    const mstates = [];
    members.forEach((member, memberIndex) => {
      // 空槽位（未上阵角色）不渲染轨道：修复 1~2 人队伍出现「角色2/角色3」空轨道
      if (!member || !String(member.characterId || '').trim()) return;
      const entries = getRoundCatalog(member)
        .map((item) => ({
          id: item.id,
          name: item.name || '',
          charId: String(member.characterId || ''),
          librarySkillName: String(item.librarySkillName || item.libraryName || item.name || ''),
          skillType: item.skillType ? String(item.skillType) : '',
          axisOffsetPx: item.axisOffsetPx != null ? Number(item.axisOffsetPx) : null,
          t: item.timeSec != null ? Number(item.timeSec) : null,
          dur: item.durSec != null ? Number(item.durSec) : null,
          phase: Number.isInteger(item.phase) ? item.phase : 0,
          key: item.key != null ? String(item.key) : '',
          customName: item.customName ? String(item.customName).trim() : '',
          exportable: isExportableEntry(item),
        }))
        .filter((e) => e.exportable);
      mstates.push({ memberIndex, memberName: member.name || `角色${memberIndex + 1}`, entries: autoFillMember(entries, teamDur), selectedId: null });
    });
    rt.state = { pxPerSec: SCALE_PX_PER_S, keyMode: false, keyFilter: '', teamDur, members: mstates, drag: null, conflicts: 0 };
    return rt.state;
  }

  // ---------- 保存回写（附加字段，不改计算语义；可撤销） ----------
  function saveDeepCompletion() {
    if (!rt.state) return false;
    const members = getMembers();
    rt.state.members.forEach((ms) => {
      const member = members[ms.memberIndex];
      if (!member) return;
      if (typeof pushEditUndo === 'function') pushEditUndo(member, '深度排轴时间标注');
      const edits = new Map(ms.entries.map((e) => [e.id, e]));
      const target = getRoundCatalog(member);
      target.forEach((item) => {
        const e = edits.get(item.id);
        if (!e) return;
        item.timeSec = r3(e.t);
        item.durSec = r3(e.dur);
        item.phase = Number.isInteger(e.phase) && e.phase >= 0 ? e.phase : 0;
        if (e.key) item.key = String(e.key); else delete item.key;
      });
      if (target !== member.rotationCatalog && Array.isArray(member.rotationCatalog)) {
        member.rotationCatalog.forEach((item) => {
          const e = edits.get(item.id);
          if (!e) return;
          item.timeSec = r3(e.t);
          item.durSec = r3(e.dur);
          item.phase = Number.isInteger(e.phase) && e.phase >= 0 ? e.phase : 0;
          if (e.key) item.key = String(e.key); else delete item.key;
        });
      }
      if (typeof persistCycleEditingIfEnabled === 'function') {
        try { persistCycleEditingIfEnabled(member); } catch (_) { /* ignore */ }
      }
    });
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof render === 'function') render();
    return true;
  }

  // ---------- 模板导出（阶段 B2；含命名：条目手动改名 + 命名模板覆盖） ----------
  function buildTemplate() {
    buildEditState();
    const chars = [];
    const seenSkillCount = { total: 0 };
    rt.state.members.forEach((ms) => {
      const member = getMembers()[ms.memberIndex];
      if (!member) return;
      const namingTpl =
        typeof getMemberNamingTemplate === 'function' ? getMemberNamingTemplate(ms.memberIndex) : null;
      const skills = ms.entries
        .filter((e) => e.exportable)
        .map((e) => {
          const lib = e.librarySkillName || e.name;
          const o = { name: lib, t: r3(e.t), dur: r3(e.dur), phase: Number.isInteger(e.phase) && e.phase >= 0 ? e.phase : 0 };
          // 键位功能隐藏期间不导出 key（schema/服务端能力保留，后续恢复键位标注时再放开）
          // 命名：条目手动改名优先，其次当前命名模板覆盖；仅当与库名不同才携带
          let rename = e.customName ? String(e.customName).trim() : '';
          if (!rename && namingTpl && typeof getNamingTemplateOverride === 'function') {
            rename = String(getNamingTemplateOverride(namingTpl, lib) || '').trim();
          }
          if (rename && rename !== lib) o.rename = rename;
          return o;
        });
      if (!skills.length) return;
      seenSkillCount.total += skills.length;
      chars.push({
        charId: String(member.characterId || ''),
        refinementHint: `${Math.max(0, Math.min(6, Math.round(Number(member.resonanceUnlocked) || 0)))}+${Math.max(1, Math.min(5, Math.round(Number(member.weaponSelection?.refinement) || 1)))}`,
        skills,
      });
    });
    if (!chars.length || chars.length > RT_MAX_CHARS) return null;
    if (seenSkillCount.total > RT_MAX_TOTAL_SKILLS) return null;
    return { kind: 'rotation-template', version: 4, timeBase: 'teamCycle', chars };
  }

  // ---------- 上传分享（阶段 B3） ----------
  async function shareTemplate() {
    const template = buildTemplate();
    if (!template) return { ok: false, message: '没有可导出的技能（需为技能库标准技能；特殊/手填/自定义内容不进模板）' };
    if (typeof Cloud === 'undefined' || typeof Cloud.getUser !== 'function' || !Cloud.getUser()) {
      return { ok: false, message: '分享模板需要登录' };
    }
    try {
      const res = await Cloud.api('/rotation-templates', {
        method: 'POST',
        auth: true,
        body: { title: await promptTitle(), description: '', tags: ['队伍', '全局轴'], template },
      });
      return { ok: true, share_code: res && res.share_code };
    } catch (e) {
      return { ok: false, message: (e && e.message) || '上传失败' };
    }
  }

  async function promptTitle() {
    const def = '队伍轴模板';
    const v = (typeof DialogKit !== 'undefined' && DialogKit.prompt)
      ? await DialogKit.prompt({ title: '模板标题', placeholder: '模板标题（公开可见）', initial: def, max: 60 })
      : window.prompt('模板标题（公开可见）', def);
    return (v && String(v).trim()) || def;
  }

  // ============================================================
  // 弹窗 UI
  // ============================================================
  function openDeepCompletion() {
    if (rt.ui) return;
    buildEditState();
    const host = document.createElement('div');
    host.className = 'rt-modal-backdrop';
    host.innerHTML = modalHtml();
    document.body.appendChild(host);
    rt.ui = host;
    bindEvents(host);
    renderTracks();
  }

  function closeDeepCompletion() {
    if (rt.ui) {
      rt.ui.remove();
      rt.ui = null;
      rt.state = null;
    }
  }

  function toolbarHtml() {
    return `
        <div class="rt-modal-toolbar">
          <button type="button" class="toolbar-btn" data-rt-autofill>重新自动填充</button>
          <button type="button" class="toolbar-btn" data-rt-zoom-out>－</button>
          <span class="rt-zoom-label">${rt.state.pxPerSec}px/s</span>
          <button type="button" class="toolbar-btn" data-rt-zoom-in>＋</button>
          <span class="rt-undo-note">(保存前可用编辑轴页「←撤回」)</span>
        </div>`;
  }

  function modalHtml() {
    const members = rt.state.members
      .map((m) => `<div class="rt-member-chip" data-rt-member="${m.memberIndex}">${esc(m.memberName)}</div>`)
      .join('');
    return `
      <div class="rt-modal">
        <div class="rt-modal-head">
          <strong>深度排轴 · 全队时间轴</strong>
          <span class="hint rt-modal-hint">10px=1s · 拖块改起始 · 拖右缘改时长 · 滚轮缩放 · Ctrl+←/→ 1ms 微调</span>
          <button type="button" class="btn sm" data-rt-close>×</button>
        </div>
        ${toolbarHtml()}
        <div class="rt-conflict-banner" data-rt-conflict hidden></div>
        <div class="rt-tracks" data-rt-tracks></div>
        <div class="rt-modal-foot">
          <button type="button" class="btn" data-rt-cancel>取消</button>
          <button type="button" class="btn" data-rt-save>保存时间标注</button>
          <button type="button" class="btn primary" data-rt-share>导出并分享模板</button>
        </div>
      </div>`;
  }

  function bindEvents(host) {
    host.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-rt-close]');
      if (closeBtn) return closeDeepCompletion();
      const cancel = e.target.closest('[data-rt-cancel]');
      if (cancel) return closeDeepCompletion();
      if (e.target.closest('[data-rt-autofill]')) {
        buildEditState();
        renderTracks();
        return;
      }
      if (e.target.closest('[data-rt-keymode]')) {
        rt.state.keyMode = !rt.state.keyMode;
        // 开启键位模式时自动预填未标注技能（三层规则；机制层标待确认不填）
        if (rt.state.keyMode) {
          rt.state.members.forEach((ms) => {
            ms.entries.forEach((en) => {
              if (en.key) return;
              const g = guessKeyForEntry(en);
              if (g.key && !g.pendingConfirm) en.key = g.key;
            });
          });
        }
        // 重渲染工具栏（键位筛选下拉随开关出现/消失）
        const tb = host.querySelector('.rt-modal-toolbar');
        if (tb) tb.outerHTML = toolbarHtml();
        renderTracks();
        return;
      }
      if (e.target.closest('[data-rt-keyfilter]')) {
        const sel = host.querySelector('[data-rt-keyfilter]');
        rt.state.keyFilter = sel ? sel.value : '';
        renderTracks();
        return;
      }
      if (e.target.closest('[data-rt-zoom-in]')) return zoomBy(1.25);
      if (e.target.closest('[data-rt-zoom-out]')) return zoomBy(0.8);
      if (e.target.closest('[data-rt-save]')) {
        saveDeepCompletion();
        closeDeepCompletion();
        return;
      }
      if (e.target.closest('[data-rt-share]')) {
        void (async () => {
          const btn = host.querySelector('[data-rt-share]');
          if (btn) btn.disabled = true;
          const res = await shareTemplate();
          if (res.ok) {
            saveDeepCompletion();
            closeDeepCompletion();
            window.alert(`模板已发布：${res.share_code}\n可在分享专区浏览/复制。`);
          } else {
            window.alert(res.message);
            if (btn) btn.disabled = false;
          }
        })();
        return;
      }
      // 选中块
      const block = e.target.closest('[data-rt-block]');
      if (block) {
        selectBlock(block.dataset.member, block.dataset.id);
        return;
      }
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDeepCompletion(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') { nudgeSelected(-0.001); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { nudgeSelected(0.001); e.preventDefault(); }
    });
    host.addEventListener('wheel', (e) => {
      if (e.target.closest('.rt-tracks')) {
        zoomBy(e.deltaY < 0 ? 1.2 : 0.8333);
        e.preventDefault();
      }
    }, { passive: false });
    host.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-rt-resize]');
      const block = e.target.closest('[data-rt-block]');
      if (handle) { startDrag(e, 'resize', handle.dataset.member, handle.dataset.id); return; }
      if (block && !e.target.closest('.rt-block-inputs')) { startDrag(e, 'move', block.dataset.member, block.dataset.id); return; }
    });
  }

  function zoomBy(factor) {
    if (!rt.state) return;
    const next = Math.min(MAX_PX_PER_S, Math.max(MIN_PX_PER_S, Math.round(rt.state.pxPerSec * factor)));
    if (next === rt.state.pxPerSec) return;
    rt.state.pxPerSec = next;
    const label = rt.ui && rt.ui.querySelector('.rt-zoom-label');
    if (label) label.textContent = next + 'px/s';
    renderTracks();
  }

  function selectBlock(memberIndex, id) {
    const ms = rt.state.members[Number(memberIndex)];
    if (!ms) return;
    ms.selectedId = ms.selectedId === id ? null : id;
    renderTracks();
  }

  function nudgeSelected(dt) {
    rt.state.members.forEach((ms) => {
      const e = ms.entries.find((x) => x.id === ms.selectedId);
      if (e) e.t = Math.max(0, r3(e.t + dt));
    });
    renderTracks();
  }

  function startDrag(e, mode, memberIndex, id) {
    e.preventDefault();
    const ms = rt.state.members[Number(memberIndex)];
    const entry = ms && ms.entries.find((x) => x.id === id);
    if (!entry) return;
    const px = rt.state.pxPerSec;
    const startX = e.clientX;
    const startT = entry.t;
    const startDur = entry.dur;
    rt.state.drag = { memberIndex: Number(memberIndex), id, mode };
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (mode === 'move') entry.t = Math.max(0, r3(startT + dx / px));
      else entry.dur = Math.max(0.1, r3(startDur + dx / px));
      rt.state.drag.t = entry.t;
      rt.state.drag.dur = entry.dur;
      renderTracks();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      rt.state.drag = null;
      renderTracks();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------- 渲染 ----------
  function detectTrackConflicts() {
    let total = 0;
    rt.state.members.forEach((ms) => {
      const sorted = [...ms.entries].sort((a, b) => a.t - b.t);
      ms.entries.forEach((e) => { e._conflict = false; });
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          if (a.t < b.t + b.dur - 0.0001 && b.t < a.t + a.dur - 0.0001) {
            a._conflict = true;
            b._conflict = true;
            total++;
          } else break;
        }
      }
    });
    rt.state.conflicts = total;
    return total;
  }

  function renderTracks() {
    if (!rt.ui || !rt.state) return;
    const container = rt.ui.querySelector('[data-rt-tracks]');
    if (!container) return;
    const px = rt.state.pxPerSec;
    const teamDur = rt.state.teamDur;
    const totalW = Math.max(800, Math.ceil(teamDur * px) + 80);
    detectTrackConflicts();
    // 冲突提示条
    const banner = rt.ui.querySelector('[data-rt-conflict]');
    if (banner) {
      banner.hidden = rt.state.conflicts === 0;
      banner.textContent = rt.state.conflicts > 0 ? `⚠ ${rt.state.conflicts} 处技能时间重叠（允许，建议调整）` : '';
    }
    const gridPx = Math.max(20, rulerStep(teamDur, px) * px);
    container.innerHTML =
      `<div class="rt-ruler" style="width:${totalW}px">${rulerHtml(teamDur, px)}</div>` +
      rt.state.members.map((ms) => trackHtml(ms, px, totalW, gridPx)).join('') +
      dragGuideHtml(px);
  }

  function rulerStep(teamDur, px) {
    const steps = [60, 30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
    for (const s of steps) {
      if (s <= teamDur && s * px >= 55) return s;
    }
    return Math.max(0.01, Math.round((teamDur / 8) * 100) / 100);
  }

  function rulerHtml(teamDur, px) {
    const step = rulerStep(teamDur, px);
    const dec = step < 1 ? Math.min(3, Math.max(0, Math.round(-Math.log10(step)))) : 0;
    let marks = '';
    for (let t = 0; t <= teamDur + 0.0001; t += step) {
      const label = dec ? t.toFixed(dec) : `${t}s`;
      marks += `<span class="rt-ruler-mark" style="left:${Math.round(t * px)}px">${label}</span>`;
    }
    return `<div class="rt-ruler-inner">${marks}</div>`;
  }

  function dragGuideHtml(px) {
    if (!rt.state.drag) return '';
    const ms = rt.state.members[Number(rt.state.drag.memberIndex)];
    const entry = ms && ms.entries.find((x) => x.id === rt.state.drag.id);
    if (!entry) return '';
    const left = Math.round(entry.t * px);
    const hint = `t = ${entry.t.toFixed(3)}s · dur = ${entry.dur.toFixed(3)}s`;
    return `<div class="rt-drag-guide" style="left:${left}px"><span class="rt-drag-hint">${hint}</span></div>`;
  }

  function trackHtml(ms, px, totalW, gridPx) {
    const keyFilter = rt.state.keyFilter;
    const blocks = ms.entries
      .map((e) => {
        const left = Math.round(e.t * px);
        const w = Math.max(MIN_BLOCK_W, Math.round(e.dur * px));
        const sel = ms.selectedId === e.id;
        const guess = rt.state.keyMode ? guessKeyForEntry(e) : null;
        const pending = rt.state.keyMode && !e.key && guess && guess.pendingConfirm;
        const keyBadge = rt.state.keyMode
          ? pending
            ? '<span class="rt-key-badge rt-key-pending">待确认</span>'
            : e.key ? `<span class="rt-key-badge">[${esc(e.key)}]</span>` : ''
          : '';
        const dim = rt.state.keyMode && keyFilter && !matchesKeyFilter(e, keyFilter) ? ' rt-dim' : '';
        return `
          <div class="rt-block${sel ? ' is-selected' : ''}${e._conflict ? ' rt-conflict' : ''}${rt.state.keyMode ? ' rt-keymode' : ''}${dim}"
               data-rt-block data-member="${ms.memberIndex}" data-id="${esc(e.id)}"
               style="left:${left}px;width:${w}px"
               title="${esc(e.name)} · t=${e.t}s · dur=${e.dur}s${e.key ? ' · 键 ' + esc(e.key) : ''}">
            <span class="rt-block-name">${keyBadge}${esc(e.name)}</span>
            <span class="rt-block-time">${e.t}s</span>
            <span class="rt-block-resize" data-rt-resize data-member="${ms.memberIndex}" data-id="${esc(e.id)}"></span>
            ${sel ? blockInputsHtml(ms, e) : ''}
          </div>`;
      })
      .join('');
    return `
      <div class="rt-track">
        <div class="rt-track-label">${esc(ms.memberName)}</div>
        <div class="rt-track-body" style="width:${totalW}px;--rt-grid:${gridPx}px">${blocks}</div>
      </div>`;
  }

  function matchesKeyFilter(e, filter) {
    if (filter === '__none__') return !e.key;
    return e.key === filter;
  }

  function blockInputsHtml(ms, e) {
    return `
      <div class="rt-block-inputs" data-rt-inputs>
        <label>t <input type="number" step="0.001" min="0" value="${e.t}" data-rt-in-t data-id="${esc(e.id)}" /></label>
        <label>dur <input type="number" step="0.001" min="0.1" value="${e.dur}" data-rt-in-dur data-id="${esc(e.id)}" /></label>
      </div>`;
  }

  // 输入事件委托（change 后写回）
  document.addEventListener('change', (e) => {
    if (!rt.ui) return;
    const tIn = e.target.closest('[data-rt-in-t]');
    const durIn = e.target.closest('[data-rt-in-dur]');
    const keyIn = e.target.closest('[data-rt-in-key]');
    const id = (tIn || durIn || keyIn)?.dataset.id;
    if (!id) return;
    rt.state.members.forEach((ms) => {
      const entry = ms.entries.find((x) => x.id === id);
      if (!entry) return;
      if (tIn) entry.t = Math.max(0, r3(Number(tIn.value)));
      if (durIn) entry.dur = Math.max(0.1, r3(Number(durIn.value)));
      if (keyIn) entry.key = String(keyIn.value);
    });
    renderTracks();
  });

  // ---------- 模板内容自校验（阶段 F 矩阵模板模式用：不比对当前队伍，仅结构/库/CSF） ----------
  function validateTemplateContent(template) {
    const fail = (reason) => ({ ok: false, reason });
    if (!template || typeof template !== 'object') return fail('模板缺失');
    if (template.kind !== 'rotation-template') return fail('不是队伍轴模板');
    const chars = Array.isArray(template.chars) ? template.chars : [];
    if (!chars.length || chars.length > RT_MAX_CHARS) return fail(`模板角色数须为 1~${RT_MAX_CHARS}`);
    const { byChar, echoNames } = clientSkillNameSets();
    for (const c of chars) {
      const charId = String(c.charId || '');
      if (!charId) return fail('角色缺少 charId');
      if (String(charId) === '1212' || /^9\d{3}$/.test(charId)) return fail(`测试服（CSF）角色不可进模板：${charId}`);
      const nameSet = byChar.get(charId);
      if (!nameSet) return fail(`角色不在正式角色库：${charId}`);
      const skills = Array.isArray(c.skills) ? c.skills : [];
      if (!skills.length) return fail(`角色 ${charId} 无技能`);
      for (const s of skills) {
        const name = String(s?.name || '').trim();
        if (!name) return fail(`角色 ${charId} 有技能缺少 name`);
        if (!nameSet.has(name) && !echoNames.has(name)) return fail(`技能不在当前技能库：${name}`);
        const t = Number(s.t);
        if (!Number.isFinite(t) || t < 0) return fail(`技能 ${name} 的 t 非法`);
        const dur = s.dur == null ? 1 : Number(s.dur);
        if (!Number.isFinite(dur) || dur <= 0) return fail(`技能 ${name} 的 dur 非法`);
      }
    }
    return { ok: true };
  }

  // ---------- 客户端技能名全集（严格匹配用） ----------
  function clientSkillNameSets() {
    const charDb = (typeof charSkillDb !== 'undefined' && charSkillDb) || null;
    const echoDb = (typeof echoSpecimensDb !== 'undefined' && echoSpecimensDb) || null;
    const byChar = new Map();
    (charDb?.characters || []).forEach((c) => {
      if (!c) return;
      byChar.set(String(c.id), new Set((c.skills || []).map((s) => String(s.name || ''))));
    });
    const echoNames = new Set();
    if (echoDb) {
      const list = Array.isArray(echoDb) ? echoDb : (echoDb.specimens || []);
      list.forEach((sp) => {
        if (!sp || !sp.name) return;
        const base = `声骸·${sp.name}`;
        echoNames.add(base);
        (Array.isArray(sp.mainEffects) ? sp.mainEffects : []).forEach((fx) => {
          if (fx && fx.note) echoNames.add(`${base}（${fx.note}）`);
        });
      });
    }
    return { byChar, echoNames };
  }

  // ---------- 导入校验链（C2：严格全匹配，任一不满足整单拒绝） ----------
  function validateImportTemplate(template) {
    const fail = (reason) => ({ ok: false, reason });
    if (!template || typeof template !== 'object') return fail('模板缺失');
    if (template.kind !== 'rotation-template') return fail('不是队伍轴模板（kind 必须为 rotation-template）');
    const chars = Array.isArray(template.chars) ? template.chars : [];
    if (!chars.length || chars.length > RT_MAX_CHARS) return fail(`模板角色数须为 1~${RT_MAX_CHARS}`);
    const members = getMembers();
    if (!members.length) return fail('当前队伍为空，无法导入');
    const teamIds = members.map((m) => String(m.characterId || '')).filter(Boolean);
    const tplIds = chars.map((c) => String(c.charId || '')).filter(Boolean);
    const teamSet = new Set(teamIds);
    // 子集匹配：模板每个角色必须在队伍内（按 charId，与位置无关）；
    // 队伍多出的角色不参与导入、保持原样（不再要求集合完全一致）。
    const missing = tplIds.filter((id) => !teamSet.has(id));
    if (missing.length) {
      return fail(`模板包含队伍中没有的角色：[${missing.join(', ')}]；请先上阵这些角色（队伍多出的角色不影响导入）`);
    }
    const { byChar, echoNames } = clientSkillNameSets();
    const resolved = [];
    for (const c of chars) {
      const charId = String(c.charId || '');
      const member = members.find((m) => String(m.characterId || '') === charId);
      const nameSet = byChar.get(charId) || new Set();
      const skills = Array.isArray(c.skills) ? c.skills : [];
      if (!skills.length) return fail(`角色 ${charId} 无技能`);
      const outSkills = [];
      for (const s of skills) {
        const name = String(s?.name || '').trim();
        if (!name) return fail(`角色 ${charId} 有技能缺少 name`);
        if (!nameSet.has(name) && !echoNames.has(name)) {
          return fail(`技能不在当前技能库：${name}（角色 ${charId}）；模板可能来自较旧版本，请提示作者更新`);
        }
        const t = Number(s.t);
        if (!Number.isFinite(t) || t < 0) return fail(`技能 ${name} 的 t 非法`);
        const dur = s.dur == null ? 1 : Number(s.dur);
        if (!Number.isFinite(dur) || dur <= 0) return fail(`技能 ${name} 的 dur 非法`);
        const phase = s.phase == null ? 0 : Number(s.phase);
        if (!Number.isInteger(phase) || phase < 0) return fail(`技能 ${name} 的 phase 非法`);
        const rename = s.rename == null ? '' : String(s.rename).trim();
        if (rename.length > 24) return fail(`技能 ${name} 的 rename 过长`);
        outSkills.push({
          name, t: r3(t), dur: r3(dur), phase,
          key: s.key != null ? String(s.key).slice(0, RT_MAX_KEY_LEN) : '',
          rename,
          member,
        });
      }
      resolved.push({ charId, skills: outSkills, member });
    }
    return { ok: true, resolved };
  }

  /** 替换当前编辑轮轴 + 时间标注（直接写条目→refreshMemberSkillPaletteFromDb 按库补全倍率/回能并重建 phases，非空壳；多轮只改当前轮；可撤销） */
  async function applyImportTemplate(template) {
    const verdict = validateImportTemplate(template);
    if (!verdict.ok) return verdict;
    const totalSkills = verdict.resolved.reduce((a, r) => a + r.skills.length, 0);
    if (totalSkills > RT_MAX_TOTAL_SKILLS) return { ok: false, reason: '模板技能总数超限' };
    verdict.resolved.forEach((r) => {
      const member = r.member;
      if (!member) return;
      if (typeof pushEditUndo === 'function') pushEditUndo(member, '导入队伍轴模板');
      // 1) 模板条目写入当前编辑轮（含时间/键位元数据；统计字段不写死，交给 refresh 按库补全，
      //    否则 baseMult:0 会被视为「用户自定义过」导致刷新跳过填充）
      const entries = r.skills.map((s) => {
        const e = {
          id: genId(),
          name: s.name,
          librarySkillName: s.name,
          libraryName: s.name,
          stackLayers: {},
          timeSec: s.t,
          durSec: s.dur,
          phase: s.phase,
          imported: true,
        };
        if (s.key) e.key = s.key;
        return e;
      });
      const target = getRoundCatalog(member);
      target.splice(0, target.length, ...entries.map((x) => ({ ...x })));
      if (target !== member.rotationCatalog && Array.isArray(member.rotationCatalog)) {
        member.rotationCatalog.splice(0, member.rotationCatalog.length, ...entries.map((x) => ({ ...x })));
      }
      // 2) 按库补全条目统计（倍率/回能/类型/元素）
      if (typeof refreshMemberSkillPaletteFromDb === 'function') {
        try { refreshMemberSkillPaletteFromDb(member, { forceSyncStats: false }); } catch (_) { /* ignore */ }
      }
      // 3) 物化时间线：清空 phases → 逐条 createSkillFromCatalogItem（技能数据非空壳）
      if (typeof clearMemberTimeline === 'function') {
        try { clearMemberTimeline(member); } catch (_) { /* ignore */ }
      }
      if (typeof resolvePhaseForCatalogAdd === 'function' && typeof createSkillFromCatalogItem === 'function') {
        try {
          const { phase } = resolvePhaseForCatalogAdd(member);
          (member.rotationCatalog || []).forEach((item) => {
            if (typeof isAxisLinkedSpecialCatalogEntry === 'function' && isAxisLinkedSpecialCatalogEntry(item)) return;
            const skill = createSkillFromCatalogItem(item);
            phase.skills.push(skill);
            if (typeof syncCatalogStacksToTimeline === 'function') {
              try { syncCatalogStacksToTimeline(item.id); } catch (_) { /* ignore */ }
            }
          });
        } catch (_) { /* ignore */ }
      }
      // 4) 命名随模板导入（写入命名模板 + 落轴显示名）
      const renames = r.skills.filter((s) => s.rename && s.rename !== s.name);
      if (renames.length) {
        const mi = getMembers().indexOf(member);
        renames.forEach((s) => {
          if (typeof upsertMemberNamingTemplateOverride === 'function') {
            try { upsertMemberNamingTemplateOverride(mi, s.name, s.rename); } catch (_) { /* ignore */ }
          }
        });
        if (typeof applyMemberNamingTemplateToAxis === 'function') {
          try { applyMemberNamingTemplateToAxis(mi); } catch (_) { /* ignore */ }
        }
      }
      // 4) 与「重新铺开」同口径：按模板顺序紧凑排列画布位置（不重叠）
      if (typeof layoutAxisOffsetsPacked === 'function') {
        try { layoutAxisOffsetsPacked(member); } catch (_) { /* ignore */ }
      }
      if (typeof commitAxisVisualOrder === 'function') {
        try { commitAxisVisualOrder(member, { syncTimeline: false }); } catch (_) { /* ignore */ }
      }
      if (typeof persistCycleEditingIfEnabled === 'function') {
        try { persistCycleEditingIfEnabled(member); } catch (_) { /* ignore */ }
      }
    });
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof render === 'function') render();
    return { ok: true };
  }

  /** 导入入口：支持 RT- 码（联网取详情）或粘贴模板 JSON（统一 DialogKit 暗色弹窗风格） */
  async function importTemplateUI() {
    const input = (typeof DialogKit !== 'undefined' && DialogKit.prompt)
      ? await DialogKit.prompt({
          title: '导入队伍轴模板',
          placeholder: '粘贴 RT-XXXXXX 分享码或模板 JSON…\n（角色集合必须与当前队伍完全一致，任一不匹配将整单拒绝）',
          max: 20000,
        })
      : window.prompt('粘贴队伍轴模板分享码（RT-XXXXXX）或模板 JSON：\n（角色集合必须与当前队伍完全一致，任一不匹配将整单拒绝）', '');
    if (!input || !String(input).trim()) return;
    const text = String(input).trim();
    let template = null;
    const codeMatch = text.match(/^RT-[A-Z0-9]{6}$/i);
    if (codeMatch) {
      if (typeof Cloud === 'undefined' || typeof Cloud.api !== 'function') {
        window.alert('云端接口未就绪');
        return;
      }
      try {
        const det = await Cloud.api('/rotation-templates/' + codeMatch[0].toUpperCase());
        template = det && det.payload;
        if (!template) { window.alert('模板不存在或未通过审核'); return; }
      } catch (e) {
        window.alert('获取模板失败：' + ((e && e.message) || '未知错误'));
        return;
      }
    } else {
      try {
        template = JSON.parse(text);
      } catch (_) {
        window.alert('无法识别：请输入 RT-XXXXXX 分享码或合法模板 JSON');
        return;
      }
    }
    const verdict = validateImportTemplate(template);
    if (!verdict.ok) {
      window.alert('导入被拒绝：' + verdict.reason);
      return;
    }
    const charNames = verdict.resolved.map((r) => {
      const m = r.member;
      return `${m ? m.name || '' : r.charId}(${r.skills.length} 技能)`;
    }).join('、');
    const ok = (typeof DialogKit !== 'undefined' && DialogKit.confirm)
      ? await DialogKit.confirm({
          title: '确认导入模板',
          message: `将替换全队各角色当前编辑轮的轴内容与时间标注（可撤回）：\n${charNames}`,
          okText: '确定导入',
          danger: true,
        })
      : window.confirm(`将替换全队各角色当前编辑轮的轴内容与时间标注（可撤回）：\n${charNames}\n\n确定导入？`);
    if (!ok) return;
    const applied = await applyImportTemplate(template);
    if (applied.ok) window.alert('导入成功（已替换当前编辑轮，可「←撤回」恢复）');
    else window.alert('导入失败：' + applied.reason);
  }

  /** 按 RT 码直接导入（专区卡片点击调用）：拉详情 → 校验（子集匹配）→ 二次确认 → 应用 */
  async function importTemplateByCode(code) {
    const text = String(code || '').trim();
    if (!/^RT-[A-Z0-9]{6}$/i.test(text)) { window.alert('分享码格式不正确'); return; }
    if (typeof Cloud === 'undefined' || typeof Cloud.api !== 'function') { window.alert('云端接口未就绪'); return; }
    let template = null;
    try {
      const det = await Cloud.api('/rotation-templates/' + text.toUpperCase());
      template = det && det.payload;
      if (!template) { window.alert('模板不存在或未通过审核'); return; }
    } catch (e) {
      window.alert('获取模板失败：' + ((e && e.message) || '未知错误'));
      return;
    }
    const verdict = validateImportTemplate(template);
    if (!verdict.ok) { window.alert('导入被拒绝：' + verdict.reason); return; }
    const charNames = verdict.resolved.map((r) => {
      const m = r.member;
      return `${m ? m.name || '' : r.charId}(${r.skills.length} 技能)`;
    }).join('、');
    const ok = (typeof DialogKit !== 'undefined' && DialogKit.confirm)
      ? await DialogKit.confirm({
          title: '确认导入模板 ' + text.toUpperCase(),
          message: `将替换以下角色当前编辑轮的轴内容与时间标注（可撤回）：\n${charNames}\n\n（队伍中模板未包含的角色保持原样）`,
          okText: '确定导入',
          danger: true,
        })
      : window.confirm(`将替换以下角色当前编辑轮的轴内容与时间标注（可撤回）：\n${charNames}\n\n确定导入？`);
    if (!ok) return;
    const applied = await applyImportTemplate(template);
    if (applied.ok) window.alert('导入成功（已替换，可「←撤回」恢复）');
    else window.alert('导入失败：' + applied.reason);
  }

  // ---------- 轴页入口注入（MutationObserver 保证重渲染后按钮仍在） ----------
  function ensureAxisButtons() {
    const toolbar = document.querySelector('.team-axis-board .axis-board-toolbar .toolbar-left');
    if (!toolbar) return;
    if (!toolbar.querySelector('[data-rt-deep]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toolbar-btn';
      btn.dataset.rtDeep = '';
      btn.title = '深度排轴：全队技能时间匹配（自动填充+局部自定义+可选键位），可导出队伍轴模板';
      btn.textContent = '深度排轴';
      toolbar.appendChild(btn);
    }
    if (!toolbar.querySelector('[data-rt-zone]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toolbar-btn';
      btn.dataset.rtZone = '';
      btn.title = '队伍轴模板分享专区（浏览/搜索/复制 RT 码；点击模板卡片可直接导入）';
      btn.textContent = '模板专区';
      toolbar.appendChild(btn);
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rt-deep]')) {
      openDeepCompletion();
      return;
    }
    if (e.target.closest('[data-rt-zone]')) {
      openTemplateZone();
      return;
    }
  });

  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(() => ensureAxisButtons());
    mo.observe(document.body, { childList: true, subtree: true });
  }
  // 立即尝试一次（轴页可能已渲染）
  ensureAxisButtons();

  // ============================================================
  // 阶段 D：模板分享专区（自包含全屏页，纯新增）
  // ============================================================
  const zone = { ui: null, offset: 0, q: '', items: [], matchOnly: false, teamIds: [] };

  /** 当前队伍角色集合（自动检测，用于专区匹配标记/筛选） */
  function currentTeamCharIds() {
    return getMembers().map((m) => String(m.characterId || '')).filter(Boolean);
  }

  function teamMatchesTemplate(item) {
    const tplIds = Array.isArray(item && item.summary && item.summary.charIds) ? item.summary.charIds.map(String) : [];
    if (!zone.teamIds.length || !tplIds.length) return false;
    if (zone.teamIds.length !== tplIds.length) return false;
    const set = new Set(tplIds);
    return zone.teamIds.every((id) => set.has(id));
  }

  async function loadTemplates(q, offset) {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (offset) params.set('offset', String(offset));
    if (q) params.set('q', String(q));
    if (typeof Cloud === 'undefined' || typeof Cloud.api !== 'function') return { items: [], error: '云端接口未就绪' };
    try {
      const res = await Cloud.api('/rotation-templates?' + params.toString());
      return { items: Array.isArray(res && res.items) ? res.items : [], error: null };
    } catch (e) {
      return { items: [], error: (e && e.message) || '加载失败' };
    }
  }

  function openTemplateZone() {
    if (zone.ui) return;
    zone.teamIds = currentTeamCharIds();
    const host = document.createElement('div');
    host.className = 'rt-zone-backdrop';
    host.innerHTML = `
      <div class="rt-zone">
        <div class="rt-zone-head">
          <strong>队伍轴模板专区</strong>
          <span class="hint">游客可浏览/复制 · 模板=角色轴+时间匹配（t/dur/键位） · 自动匹配当前队伍角色</span>
          <button type="button" class="btn sm" data-rt-zone-close>×</button>
        </div>
        <div class="rt-zone-toolbar">
          ${window.__WC.NamingTemplates?.enabled ? '<button type="button" class="toolbar-btn" data-naming-community>命名模板专区</button>' : ''}
          <input class="rt-zone-search" type="search" placeholder="搜索 RT 码 / 标题 / 角色名" data-rt-zone-q />
          <button type="button" class="toolbar-btn" data-rt-zone-search>搜索</button>
          <button type="button" class="toolbar-btn${zone.matchOnly ? ' is-on' : ''}" data-rt-zone-match title="只显示与当前队伍角色完全一致的模板">只看匹配当前队伍</button>
        </div>
        <div class="rt-zone-list" data-rt-zone-list></div>
        <div class="rt-zone-foot">
          <button type="button" class="toolbar-btn" data-rt-zone-prev>上一页</button>
          <span class="rt-zone-page" data-rt-zone-page>第 1 页</span>
          <button type="button" class="toolbar-btn" data-rt-zone-next>下一页</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    zone.ui = host;
    bindZoneEvents(host);
    void renderZoneList();
  }

  function closeTemplateZone() {
    if (zone.ui) { zone.ui.remove(); zone.ui = null; }
  }

  function bindZoneEvents(host) {
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-rt-zone-close]')) return closeTemplateZone();
      if (e.target.closest('[data-rt-zone-search]')) {
        const inp = host.querySelector('[data-rt-zone-q]');
        zone.q = (inp && inp.value || '').trim();
        zone.offset = 0;
        void renderZoneList();
        return;
      }
      if (e.target.closest('[data-rt-zone-match]')) {
        zone.matchOnly = !zone.matchOnly;
        zone.offset = 0;
        const btn = host.querySelector('[data-rt-zone-match]');
        if (btn) btn.classList.toggle('is-on', zone.matchOnly);
        void renderZoneList();
        return;
      }
      if (e.target.closest('[data-rt-zone-prev]')) {
        zone.offset = Math.max(0, zone.offset - 20);
        void renderZoneList();
        return;
      }
      if (e.target.closest('[data-rt-zone-next]')) {
        zone.offset += 20;
        void renderZoneList();
        return;
      }
      const copyBtn = e.target.closest('[data-rt-zone-copy]');
      if (copyBtn) {
        const code = copyBtn.dataset.rtCode || '';
        copyCode(code);
        return;
      }
      const detailBtn = e.target.closest('[data-rt-zone-detail]');
      if (detailBtn) {
        const code = detailBtn.dataset.rtCode || '';
        void openZoneDetail(code);
        return;
      }
      const card = e.target.closest('[data-rt-zone-card]');
      if (card) {
        const code = card.dataset.rtCode || '';
        void importTemplateByCode(code);
      }
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const inp = host.querySelector('[data-rt-zone-q]');
        if (inp && e.target === inp) {
          zone.q = inp.value.trim();
          zone.offset = 0;
          void renderZoneList();
        }
      }
      if (e.key === 'Escape') closeTemplateZone();
    });
  }

  function copyCode(code) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        () => window.alert('已复制 ' + code),
        () => window.alert(code)
      );
    } else {
      window.alert(code);
    }
  }

  function zoneCardHtml(item, matched) {
    const chars = (item.summary && Array.isArray(item.summary.chars) ? item.summary.chars : [])
      .map((c) => `${esc(c.charName)}·${c.skillCount}技`)
      .join(' / ');
    const author = (item.profiles && (item.profiles.display_name || item.profiles.id)) || '';
    const tags = (Array.isArray(item.tags) ? item.tags : []).map((t) => `<span class="rt-tag">${esc(t)}</span>`).join('');
    const matchBadge = matched ? '<span class="rt-tag rt-tag-match">匹配当前队伍</span>' : '';
    return `
      <div class="rt-zone-card${matched ? ' is-matched' : ''}" data-rt-zone-card data-rt-code="${esc(item.share_code)}">
        <div class="rt-zone-card-top">
          <strong>${esc(item.title)}</strong>
          <span class="rt-code">${esc(item.share_code)}</span>
          <button type="button" class="toolbar-btn" data-rt-zone-detail data-rt-code="${esc(item.share_code)}">详情</button>
          <button type="button" class="toolbar-btn" data-rt-zone-copy data-rt-code="${esc(item.share_code)}">复制</button>
        </div>
        <div class="rt-zone-card-chars">${esc(chars)}</div>
        <div class="rt-zone-card-desc">${esc(item.description || '')}</div>
        <div class="rt-zone-card-meta">${matchBadge}${tags}<span class="rt-author">${esc(author)}</span></div>
      </div>`;
  }

  async function renderZoneList() {
    if (!zone.ui) return;
    const list = zone.ui.querySelector('[data-rt-zone-list]');
    const page = zone.ui.querySelector('[data-rt-zone-page]');
    const { items, error } = await loadTemplates(zone.q, zone.offset);
    zone.items = items;
    if (error) {
      list.innerHTML = `<div class="rt-zone-empty">${esc(error)}</div>`;
    } else if (!items.length) {
      list.innerHTML = `<div class="rt-zone-empty">暂无模板${zone.q ? '（搜索无结果）' : ''}</div>`;
    } else {
      // 自动匹配当前队伍：匹配的排前 + 徽标；「只看匹配」时过滤
      const ranked = [...items].sort((a, b) => (teamMatchesTemplate(b) ? 1 : 0) - (teamMatchesTemplate(a) ? 1 : 0));
      const shown = zone.matchOnly ? ranked.filter((it) => teamMatchesTemplate(it)) : ranked;
      if (!shown.length) {
        list.innerHTML = `<div class="rt-zone-empty">没有与当前队伍匹配的模板</div>`;
      } else {
        list.innerHTML = shown.map((it) => zoneCardHtml(it, teamMatchesTemplate(it))).join('');
      }
    }
    if (page) page.textContent = `第 ${Math.floor(zone.offset / 20) + 1} 页`;
  }

  async function openZoneDetail(code) {
    if (typeof Cloud === 'undefined' || typeof Cloud.api !== 'function') return;
    let det = null;
    try {
      det = await Cloud.api('/rotation-templates/' + encodeURIComponent(code));
    } catch (e) {
      window.alert('获取模板详情失败：' + ((e && e.message) || '未知错误'));
      return;
    }
    const tpl = det && det.payload;
    if (!tpl) { window.alert('模板不存在或未通过审核'); return; }
    const rows = (Array.isArray(tpl.chars) ? tpl.chars : []).map((c) => {
      const skills = (Array.isArray(c.skills) ? c.skills : []).map((s) => {
        const key = s.key ? ` <span class="rt-key-badge">[${esc(s.key)}]</span>` : '';
        return `<div class="rt-detail-skill"><span class="rt-detail-t">${s.t}s</span>${key}${esc(s.name)}<span class="rt-detail-dur">${s.dur}s</span></div>`;
      }).join('');
      return `<div class="rt-detail-char"><div class="rt-detail-char-name">${esc(c.charName || c.charId)}${c.refinementHint ? '（' + esc(c.refinementHint) + '）' : ''}</div>${skills}</div>`;
    }).join('');
    const box = document.createElement('div');
    box.className = 'rt-zone-detail';
    box.innerHTML = `
      <div class="rt-zone-detail-inner">
        <div class="rt-zone-head">
          <strong>${esc(det.title)}</strong>
          <span class="rt-code">${esc(code)}</span>
          <button type="button" class="btn sm" data-rt-detail-close>×</button>
        </div>
        <div class="rt-zone-detail-body">${rows}</div>
        <div class="rt-zone-detail-foot">
          <button type="button" class="toolbar-btn" data-rt-detail-copy>复制分享码</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-rt-detail-close]')) { box.remove(); return; }
      if (e.target.closest('[data-rt-detail-copy]')) { copyCode(code); return; }
      if (e.target === box) box.remove();
    });
  }

  // ---------- 对外导出 ----------
  window.RotationTemplate = {
    openDeepCompletion,
    closeDeepCompletion,
    buildTemplate,
    shareTemplate,
    buildEditState,
    autoFillMember,
    guessKey,
    guessKeyForEntry,
    getRoundCatalog,
    getTeamCycleDuration,
    validateImportTemplate,
    applyImportTemplate,
    importTemplateUI,
    importTemplateByCode,
    clientSkillNameSets,
    openTemplateZone,
    closeTemplateZone,
    loadTemplates,
    zoneCardHtml,
    openZoneDetail,
    validateTemplateContent,
  };
})();
