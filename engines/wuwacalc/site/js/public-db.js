/**
 * 公开数据库独立页
 * - 专区：全部 / 全0+1 / 主C 2、3、6链 / 全员6+5；轴类型位于独立检索弹窗
 * - 同配检索（按站位：位1=主C，三人链精默认 0+1·0+1·0+1）
 * - 角色检索可选追加；难度 / 性能、排序、分页
 * - 匿名可浏览/导入；上传入口在数据导出页
 */
(function () {
  'use strict';

  const DEFAULT_CONFIG = '0+1';
  const PAGE_SIZE = 15;

  /** 与导出页选项一致；筛选按标签类别匹配别名（旧文案「进阶」「极限」等） */
  const DIFFICULTY_FILTER_OPTIONS = [
    { value: '', label: '全部' },
    { value: '最简单', label: '最简单' },
    { value: '基础', label: '基础' },
    { value: '进阶适中', label: '进阶适中' },
    { value: '吃手法', label: '吃手法' },
    { value: '椰果轴', label: '椰果轴' },
  ];
  const PERFORMANCE_FILTER_OPTIONS = [
    { value: '', label: '全部' },
    { value: '适应强', label: '适应强' },
    { value: '较为通解', label: '较为通解' },
    { value: '适中看操作', label: '适中看操作' },
    { value: '较挑环境', label: '较挑环境' },
    { value: '坐牢打桩', label: '坐牢打桩' },
  ];

  const CONFIG_MATCH_OPTIONS = [
    { value: 'eq', label: '同配 =' },
    { value: 'gte', label: '不低于 ≥' },
    { value: 'lte', label: '不高于 ≤' },
  ];

  const uiState = {
    axisKind: 'all',
    zone: 'all',
    configAll: true,
    searchQ: '',
    sort: 'time',
    /** 三人链精同配（不依赖角色）；默认全员 0+1 */
    teamSlotConfigs: [DEFAULT_CONFIG, DEFAULT_CONFIG, DEFAULT_CONFIG],
    difficulty: '',
    performance: '',
    /** eq=同配 | gte | lte —— 按站位（1=主C）一一比较 */
    configMatch: 'eq',
    selectedCharIds: [],
    /** 打开的属性面板：'' | 'all' | '1'..'6' */
    charElementPanel: '',
    page: 1,
    items: [],
    remoteTotal: null,
    pendingListChange: false,
    listNotice: '',
    likedSchemeIds: new Set(),
    loading: false,
    error: '',
    partialError: false,
    detailCode: '',
    detailItem: null,
    detailImportOpts: { axis: true, build: true, buff: true },
    detailClosing: false,
    usingMock: false,
  };

  const CONFIG_ZONES = [
    { key: 'all', label: '全部' },
    { key: 'zero', label: '全0+1专区' },
    { key: 'c2', label: '2链专区' },
    { key: 'c3', label: '3链专区' },
    { key: 'c6', label: '6链专区' },
    { key: 'max', label: '顶配专区' },
    { key: 'template', label: '数据模板' },
  ];
  const FILTER_FIELDS = ['zone', 'axisKind', 'configAll', 'searchQ', 'teamSlotConfigs', 'difficulty', 'performance', 'configMatch', 'selectedCharIds', 'charElementPanel'];
  let filterDraft = null;

  function filterValues() { return filterDraft || uiState; }

  function matchesConfigZone(slots) {
    const zone = uiState.zone;
    if (!zone || zone === 'all') return true;
    const keys = [0, 1, 2].map((i) => parseConfigKey(slots?.[i]?.key));
    if (zone === 'zero') {
      return keys.every((k, i) => {
        if (!k) return false;
        const slot = slots[i];
        const rank = Number(findCharDef(slot.characterId)?.rank);
        const rarity = Number(window.__WC?.findWeaponDef?.(slot.weaponId)?.rarity);
        // 星级未知时沿用严格匹配，不能把缺失数据当作低星放行。
        return ((rank > 0 && rank < 5) || k.chain === 0) &&
          ((rarity > 0 && rarity < 5) || k.refinement === 1);
      });
    }
    if (zone === 'max') return keys.every((k) => k && k.chain === 6 && k.refinement === 5);
    return !!keys[0] && keys[0].chain === Number(zone.slice(1));
  }

  function configSlotsMatch(slots) {
    const need = getNeedConfigKeys();
    return matchesConfigZone(slots) && (!need.length || matchesNeedKeys(slots, need, uiState.configMatch || 'eq'));
  }

  function renderCompactBar() {
    const count = filterSummaryParts().length;
    const activeZone = uiState.axisKind === 'template' ? 'template' : uiState.zone;
    return `<div class="pdb-compact-bar">
      <nav class="pdb-zone-nav" aria-label="配置专区">${CONFIG_ZONES.map((z) => `<button type="button" class="pdb-zone-btn${activeZone === z.key ? ' is-on' : ''}" aria-pressed="${activeZone === z.key}" data-pdb-zone="${z.key}">${z.label}</button>`).join('')}</nav>
      <div class="pdb-compact-actions"><select class="pdb-select" data-pdb-sort aria-label="排序"><option value="time"${uiState.sort === 'time' ? ' selected' : ''}>时间（最新）</option><option value="dps"${uiState.sort === 'dps' ? ' selected' : ''}>DPS（高→低）</option><option value="total"${uiState.sort === 'total' ? ' selected' : ''}>总伤（高→低）</option></select>
        <button type="button" class="pdb-btn pdb-btn-primary" data-pdb-filter-open>检索 / 筛选${count ? `（${count}）` : ''}</button>
        <button type="button" class="pdb-icon-btn" data-pdb-refresh aria-label="刷新公开库"><i data-lucide="refresh-cw"></i></button>
      </div></div>${count ? `<div class="pdb-filter-summary" aria-live="polite"><span>当前筛选：${filterSummaryParts().map(esc).join(' · ')}</span><button type="button" class="pdb-btn" data-pdb-filter-clear>清除筛选</button></div>` : ''}`;
  }

  function filterSummaryParts() {
    const parts = [];
    const kinds = { global: '全局轴', loop: '循环轴', template: '标准模板' };
    if (kinds[uiState.axisKind]) parts.push(kinds[uiState.axisKind]);
    if (uiState.searchQ) parts.push('搜索：' + uiState.searchQ);
    if (uiState.difficulty) parts.push('难度：' + uiState.difficulty);
    if (uiState.performance) parts.push('性能：' + uiState.performance);
    if (uiState.selectedCharIds.length) parts.push('角色：' + uiState.selectedCharIds.map((id) => findCharDef(id)?.name || id).join('、'));
    if (!uiState.configAll) parts.push((CONFIG_MATCH_OPTIONS.find((o) => o.value === uiState.configMatch)?.label || '同配') + ' ' + uiState.teamSlotConfigs.join(' / '));
    return parts;
  }

  function renderFilterDialog() {
    if (!filterDraft) return;
    let dialog = document.querySelector('[data-pdb-filter-dialog]');
    const oldFocus = dialog?.contains(document.activeElement) ? document.activeElement : null;
    const focusAttr = oldFocus && Array.from(oldFocus.attributes).find((a) => a.name.startsWith('data-pdb-'));
    const focusSlot = oldFocus?.getAttribute('data-pdb-team-slot-i');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'pdb-filter-dialog';
      dialog.setAttribute('data-pdb-filter-dialog', '');
      dialog.setAttribute('aria-labelledby', 'pdb-filter-title');
      document.getElementById('publicDbPage').appendChild(dialog);
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeFilterDialog(false); });
    }
    const f = filterDraft;
    dialog.innerHTML = `<header class="pdb-filter-dialog-head"><h2 id="pdb-filter-title">检索公开数据库</h2><button type="button" class="pdb-icon-btn" data-pdb-filter-cancel aria-label="关闭检索">×</button></header>
      <div class="pdb-filter-dialog-body pdb-toolbar">
        <label class="pdb-filter-field"><span class="pdb-filter-label">标题 / 分享码</span><input type="search" class="pdb-search-input" data-pdb-search value="${esc(f.searchQ)}" placeholder="输入标题或 MC-XXXXXX" /></label>
        <div class="pdb-filter-kind"><span class="pdb-filter-label">内容类型</span><div class="pdb-kind-choices">${[['all','全部类型'],['global','全局轴'],['loop','循环轴']].map(([k,label]) => `<button type="button" class="pdb-chip-btn${f.axisKind === k ? ' is-active' : ''}" data-pdb-kind="${k}" aria-pressed="${f.axisKind === k}">${label}</button>`).join('')}<button type="button" class="pdb-chip-btn${f.axisKind === 'template' ? ' is-active' : ''}" data-pdb-kind="template" aria-pressed="${f.axisKind === 'template'}">标准模板</button></div></div>
        <div class="pdb-filter-pair"><label class="pdb-filter-field"><span class="pdb-filter-label">难度</span>${renderFilterSelect('data-pdb-difficulty','轴难度筛选',DIFFICULTY_FILTER_OPTIONS,f.difficulty)}</label><label class="pdb-filter-field"><span class="pdb-filter-label">性能</span>${renderFilterSelect('data-pdb-performance','轴性能筛选',PERFORMANCE_FILTER_OPTIONS,f.performance)}</label></div>
        ${renderCharSearch()}
        <details class="pdb-exact-config"${!f.configAll ? ' open' : ''}><summary>精确同配 · 按站位设置链数与精炼</summary>${renderTeamConfigFilters()}<p class="pdb-cr-hint">应用精确同配会切回「全部」专区。主C链数专区不限制武器精炼及队友配置。</p></details>
      </div><footer class="pdb-filter-dialog-foot"><button type="button" class="pdb-btn" data-pdb-filter-reset>重置条件</button><span></span><button type="button" class="pdb-btn" data-pdb-filter-cancel>取消</button><button type="button" class="pdb-btn pdb-btn-primary" data-pdb-search-go>应用筛选</button></footer>`;
    refreshIcons(dialog);
    if (!dialog.open) { dialog.showModal(); dialog.querySelector('[data-pdb-search]').focus(); }
    else if (focusAttr) {
      const target = Array.from(dialog.querySelectorAll('[' + focusAttr.name + ']')).find((el) => el.getAttribute(focusAttr.name) === focusAttr.value && (focusSlot == null || el.getAttribute('data-pdb-team-slot-i') === focusSlot));
      (target || dialog.querySelector('[data-pdb-search]')).focus();
    }
  }

  function openFilterDialog() {
    filterDraft = Object.fromEntries(FILTER_FIELDS.map((key) => [key, Array.isArray(uiState[key]) ? uiState[key].slice() : uiState[key]]));
    filterDraft.charElementPanel = '';
    renderFilterDialog();
  }

  function closeFilterDialog(apply) {
    if (!filterDraft) return;

    if (apply) {
      const input = document.querySelector('[data-pdb-search]');
      if (input) filterDraft.searchQ = input.value.trim();
      FILTER_FIELDS.forEach((key) => { uiState[key] = filterDraft[key]; });
      uiState.charElementPanel = '';
      uiState.page = 1;
    }
    document.querySelector('[data-pdb-filter-dialog]')?.close();
    document.querySelector('[data-pdb-filter-dialog]')?.remove();
    filterDraft = null;
    if (apply) void loadItems();
    document.querySelector('[data-pdb-filter-open]')?.focus();
  }

  function resetFilterValues(target) {
    Object.assign(target, { axisKind: 'all', configAll: true, searchQ: '', teamSlotConfigs: [DEFAULT_CONFIG,DEFAULT_CONFIG,DEFAULT_CONFIG], difficulty: '', performance: '', configMatch: 'eq', selectedCharIds: [], charElementPanel: '' });
  }

  /** 公开库属性色（固定，不跟随主题） */
  /** 公开库属性色（固定，互不撞色） */
  const PDB_ELEMENT_COLORS = {
    1: '#6ec8f0', /* 冷凝 · 冰蓝 */
    2: '#e87040', /* 热熔 · 橙红 */
    3: '#b07cff', /* 导电 · 亮紫 */
    4: '#4ecf8a', /* 气动 · 青绿 */
    5: '#e8c547', /* 衍射 · 金黄 */
    6: '#e06090', /* 湮灭 · 玫红（与导电紫区分） */
    all: '#a8b0bc', /* 全部 · 中性银灰（与衍射金区分） */
  };

  const PDB_ELEMENT_ORDER = [1, 2, 3, 4, 5, 6];

  function isLocalHost() {
    try {
      const h = String(location.hostname || '');
      return h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:';
    } catch (_) {
      return true;
    }
  }

  /** 本地开发默认走 mock；网页正式环境走 API。可在控制台设 localStorage wavecalc-public-db-force-api=1 强制 API */
  function shouldUseLocalMock() {
    try {
      if (localStorage.getItem('wavecalc-public-db-force-api') === '1') return false;
      if (localStorage.getItem('wavecalc-public-db-force-mock') === '1') return true;
    } catch (_) {}
    return isLocalHost();
  }

  function esc(text) {
    if (typeof window.escapeHtml === 'function') return escapeHtml(text);
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    if (typeof window.fmt === 'function') return fmt(n);
    const x = Number(n) || 0;
    return Math.round(x).toLocaleString('en-US');
  }

  function fmtDpsCompact(n) {
    const x = Number(n);
    if (Number.isFinite(x) && x >= 10000) return `${(x / 10000).toFixed(2)}w`;
    return fmtNum(n);
  }
  function fmtDate(s) {
    if (!s) return '';
    try {
      return new Date(s).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
    } catch (_) {
      return String(s);
    }
  }

  function normalizeKind(v) {
    if (typeof window.normalizeAxisKind === 'function') return normalizeAxisKind(v);
    const x = String(v || '').toLowerCase();
    if (x === 'global' || x === '全局' || x === '全局轴') return 'global';
    if (x === 'loop' || x === 'cycle' || x === '循环' || x === '循环轴') return 'loop';
    return '';
  }

  function scoreConfig(key) {
    if (typeof window.configKeyScore === 'function') return configKeyScore(key);
    const m = String(key || '').match(/^(\d+)\+(\d+)$/);
    return m ? Number(m[1]) * 10 + Number(m[2]) : -1;
  }

  function clampChain(n) {
    if (typeof window.normalizeResonanceUnlocked === 'function') return normalizeResonanceUnlocked(n);
    return Math.max(0, Math.min(6, Math.round(Number(n) || 0)));
  }

  function clampRefine(n) {
    if (typeof window.normalizeWeaponRefinement === 'function') return normalizeWeaponRefinement(n);
    return Math.max(1, Math.min(5, Math.round(Number(n) || 1)));
  }

  function parseConfigKey(key) {
    const m = String(key || '').match(/^(\d+)\+(\d+)$/);
    if (!m) return null;
    return { chain: clampChain(m[1]), refinement: clampRefine(m[2]) };
  }

  function formatSlotKey(chain, refinement) {
    if (chain == null || refinement == null) return '';
    if (typeof window.formatChainRefineShort === 'function') {
      return formatChainRefineShort(chain, refinement);
    }
    return `${clampChain(chain)}+${clampRefine(refinement)}`;
  }

  function deriveTeamConfig(summary, payload) {
    const s = summary || {};
    if (s.teamConfig && /^\d+\+\d+$/.test(String(s.teamConfig))) return String(s.teamConfig);
    if (Array.isArray(s.memberConfigs) && s.memberConfigs.length) {
      let best = DEFAULT_CONFIG;
      let bestScore = scoreConfig(best);
      s.memberConfigs.forEach((k) => {
        const sc = scoreConfig(k);
        if (sc > bestScore) {
          bestScore = sc;
          best = String(k);
        }
      });
      return best;
    }
    const members = payload?.data?.members || payload?.members || s.members || [];
    if (typeof window.getTeamConfigKey === 'function' && members.length) {
      return getTeamConfigKey(members);
    }
    return DEFAULT_CONFIG;
  }

  /** 每人链/精槽位（最多 3）；无标注时 key 为空 */
  function deriveMemberSlots(summary, payload) {
    const s = summary || {};
    const payloadMembers = payload?.data?.members || payload?.members || [];
    const summaryMembers = Array.isArray(s.members) ? s.members : [];
    const ids = deriveCharacterIds(summary, payload);
    const names = Array.isArray(s.memberNames)
      ? s.memberNames
      : Array.isArray(s.members)
        ? s.members.map((m) => m?.name || '')
        : [];
    const configs = Array.isArray(s.memberConfigs) ? s.memberConfigs : [];
    const len = Math.max(ids.length, summaryMembers.length, payloadMembers.length, configs.length, 0);
    const slots = [];
    for (let i = 0; i < Math.min(3, Math.max(len, 3)); i++) {
      const sm = summaryMembers[i];
      const pm = payloadMembers[i];
      const id = String(sm?.characterId || pm?.characterId || ids[i] || '');
      const name = String(sm?.name || pm?.name || names[i] || '');
      let chain = null;
      let refinement = null;
      const hasSummaryStats =
        sm &&
        (sm.resonanceUnlocked != null ||
          sm.chain != null ||
          sm.refinement != null);
      if (hasSummaryStats) {
        chain = clampChain(sm.resonanceUnlocked ?? sm.chain);
        refinement = clampRefine(sm.refinement != null ? sm.refinement : 1);
      } else if (pm && (pm.resonanceUnlocked != null || pm.weaponSelection || pm.refinement != null)) {
        chain = clampChain(pm.resonanceUnlocked ?? pm.chain);
        refinement = clampRefine(pm.weaponSelection?.refinement ?? pm.refinement);
      } else {
        const parsed = parseConfigKey(configs[i]);
        if (parsed) {
          chain = parsed.chain;
          refinement = parsed.refinement;
        }
      }
      slots.push({
        characterId: id,
        name,
        chain,
        refinement,
        weaponId: String(
          pm?.weaponSelection?.id || sm?.weaponSelection?.id || sm?.weaponId || (Array.isArray(s.memberWeaponIds) ? s.memberWeaponIds[i] : '') || ''
        ).trim(),
        key: chain != null && refinement != null ? formatSlotKey(chain, refinement) : '',
      });
    }
    return slots;
  }

  function memberConfigLabel(it) {
    const keys = (it._memberSlots || []).map((s) => s.key).filter(Boolean);
    if (keys.length) return keys.join(' · ');
    return it._teamConfig || '';
  }

  function normalizeFilterConfigKey(raw) {
    const parsed = parseConfigKey(raw);
    if (!parsed) return '';
    return formatSlotKey(parsed.chain, parsed.refinement);
  }

  function ensureTeamSlotConfigs(filters = uiState) {
    if (!Array.isArray(filters.teamSlotConfigs) || filters.teamSlotConfigs.length !== 3) {
      filters.teamSlotConfigs = [DEFAULT_CONFIG, DEFAULT_CONFIG, DEFAULT_CONFIG];
    }
    filters.teamSlotConfigs = filters.teamSlotConfigs.map(
      (k) => normalizeFilterConfigKey(k) || DEFAULT_CONFIG
    );
    return filters.teamSlotConfigs;
  }

  function getNeedConfigKeys() {
    // 固定三位，与站位一一对应（位1=主C）
    if (uiState.configAll) return [];
    return ensureTeamSlotConfigs().map((k) => normalizeFilterConfigKey(k) || DEFAULT_CONFIG);
  }

  function getGotConfigKeys(it) {
    const slots = Array.isArray(it._memberSlots) ? it._memberSlots : [];
    const keys = [0, 1, 2].map((i) => normalizeFilterConfigKey(slots[i]?.key) || '');
    if (keys.some(Boolean)) return keys;
    // 仅有整队摘要时：无法按站位拆分，视为不匹配（需每人链精）
    return ['', '', ''];
  }

  function normalizeConfigVariants(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v) => v && Array.isArray(v.memberConfigs))
      .map((v) => ({
        key: String(v.key || (v.memberConfigs || []).join('|')),
        label: String(v.label || (v.memberConfigs || []).join(' · ')),
        memberConfigs: (v.memberConfigs || []).map((k) => String(k || '')),
        teamConfig: String(v.teamConfig || ''),
        teamDps: Number(v.teamDps) || 0,
        teamTotal: Number(v.teamTotal) || 0,
        axisDuration: Number(v.axisDuration) || 0,
      }));
  }

  function slotsFromConfigKeys(keys, memberSlots) {
    return (keys || []).map((k, i) => ({ ...memberSlots?.[i], key: String(k || '') }));
  }

  function matchesNeedKeys(slots, need, mode) {
    const got = [0, 1, 2].map((i) => normalizeFilterConfigKey(slots?.[i]?.key) || '');
    if (!got.some(Boolean)) return false;
    return need.every((k, i) => compareConfigInvestment(got[i], k, mode));
  }

  function compareConfigInvestment(gotKey, needKey, mode) {
    const got = normalizeFilterConfigKey(gotKey);
    const need = normalizeFilterConfigKey(needKey);
    if (!got || !need) return false;
    const gs = scoreConfig(got);
    const ns = scoreConfig(need);
    if (gs < 0 || ns < 0) return false;
    if (mode === 'eq') return got === need;
    if (mode === 'lte') return gs <= ns;
    return gs >= ns;
  }

  /** 按站位匹配：位1=主C，位2/位3 一一对应（同配 / 不低于 / 不高于） */
  function itemMatchesTeamSlotConfigs(it) {
    if (configSlotsMatch(it._memberSlots)) return true;
    return (it._configVariants || []).some((v) => configSlotsMatch(slotsFromConfigKeys(v.memberConfigs, it._memberSlots)));
  }

  /** 当前筛选下应展示的配置变体（无匹配/无筛选时返回主配置） */
  function pickDisplayVariant(it) {
    if (uiState.zone === 'all' && uiState.configAll) return null;
    return (it._configVariants || []).find((v) => configSlotsMatch(slotsFromConfigKeys(v.memberConfigs, it._memberSlots))) || null;
  }

  /** 默认展示档位：取全队总伤最低的配置变体（无变体时返回 null，回退主配置） */
  function pickLowestVariant(it) {
    const variants = it._configVariants || [];
    if (!variants.length) return null;
    let best = variants[0];
    let bestTotal = Number(best.teamTotal) || 0;
    for (let i = 1; i < variants.length; i++) {
      const total = Number(variants[i].teamTotal) || 0;
      if (total < bestTotal) {
        best = variants[i];
        bestTotal = total;
      }
    }
    return bestTotal > 0 ? best : null;
  }

  function deriveAxisKind(item) {
    const s = item.summary || {};
    let kind = normalizeKind(s.axisKind);
    if (kind) return kind;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const t of tags) {
      kind = normalizeKind(t);
      if (kind) return kind;
    }
    return '';
  }

  function deriveCharacterIds(summary, payload) {
    const s = summary || {};
    if (Array.isArray(s.characterIds) && s.characterIds.length) {
      return s.characterIds.map(String).filter(Boolean);
    }
    const members = payload?.data?.members || payload?.members || s.members || [];
    return members.map((m) => String(m?.characterId || '')).filter(Boolean);
  }

  function findCharDef(id) {
    const chars = (typeof charSkillDb !== 'undefined' && charSkillDb?.characters) || [];
    return chars.find((c) => String(c.id) === String(id)) || null;
  }

  function charPortraitHtml(charId, nameHint, sizeClass) {
    const def = findCharDef(charId);
    const name = (def && def.name) || nameHint || '角色';
    const short = esc(String(name).trim().slice(0, 1) || '?');
    let url = '';
    let remote = '';
    if (def && typeof window.getCharPortraitUrl === 'function') {
      url = getCharPortraitUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    if (def && typeof window.getCharPortraitRemoteUrl === 'function') {
      remote = getCharPortraitRemoteUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
    }
    const remoteAttr =
      remote && remote !== url ? ` data-remote="${esc(remote)}"` : '';
    const img = url
      ? `<img src="${esc(url)}" alt="" loading="lazy"${remoteAttr} onerror="typeof handlePortraitImgError==='function'&&handlePortraitImgError(this)" />`
      : '';
    return `<span class="pdb-avatar ${sizeClass || ''}" title="${esc(name)}">${img}<span class="pdb-avatar-fb"${url ? '' : ' style="display:flex"'}>${short}</span></span>`;
  }

  function enrichItem(raw, opts) {
    const keepPayload = !opts || opts.keepPayload !== false;
    const summary = raw.summary || {};
    const names = Array.isArray(summary.memberNames)
      ? summary.memberNames
      : Array.isArray(summary.members)
        ? summary.members.map((m) => m.name || '')
        : [];
    const charIds = deriveCharacterIds(summary, raw.payload);
    const memberSlots = deriveMemberSlots(summary, raw.payload);
    const item = {
      ...raw,
      _axisKind: deriveAxisKind(raw),
      _teamConfig: deriveTeamConfig(summary, raw.payload),
      _characterIds: charIds,
      _memberSlots: memberSlots,
      _configVariants: normalizeConfigVariants(summary.configVariants),
      _teamTotal: Number(summary.teamTotal) || 0,
      _teamDps: Number(summary.teamDps) || 0,
      _axisDuration: Number(summary.axisDuration) || Number(summary.axisLength) || 0,
      _difficulty: String(summary.difficulty || '').trim(),
      _performance: String(summary.performance || summary.stability || '').trim(),
      _axisName: String(summary.axisName || raw.title || '未命名轴').trim(),
      _names: names,
      _avgScore: Number(raw.avg_score) || 0,
      _reviewCount: Number(raw.review_count) || 0,
      _time: new Date(raw.updated_at || raw.approved_at || 0).getTime(),
    };
    // 列表卡片只用 _memberSlots 预提取字段，可丢弃 payload；详情(openDetailModal keepPayload:true)/mock 保留
    if (!keepPayload) delete item.payload;
    return item;
  }

  function listCharacters() {
    const chars = (typeof charSkillDb !== 'undefined' && charSkillDb?.characters) || [];
    return chars
      .map((c) => ({
        id: String(c.id),
        name: String(c.name || c.id),
        element: Number(c.element) || 0,
        rank: Number(c.rank) || 0,
      }))
      .filter((c) => c.id)
      .sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name, 'zh-CN'));
  }

  function elementGroupMeta(elKey) {
    const key = elKey === 'all' ? 'all' : String(elKey);
    if (key === 'all') {
      return { key: 'all', label: '全部', color: PDB_ELEMENT_COLORS.all, icon: '全' };
    }
    const types = typeof ELEMENT_TYPES !== 'undefined' ? ELEMENT_TYPES : null;
    if (types && types[elKey]) {
      return {
        key: String(elKey),
        label: types[elKey].label,
        color: PDB_ELEMENT_COLORS[elKey] || types[elKey].color || '#8b9cb3',
        icon: types[elKey].icon || '',
      };
    }
    return { key: '0', label: '其他', color: '#8b9cb3', icon: '?' };
  }

  function elementIconHtml(elKey) {
    let url = '';
    if (typeof window.getElementIconUrl === 'function' && elKey !== 'all') {
      url = getElementIconUrl(elKey) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    const meta = elementGroupMeta(elKey);
    if (url) {
      return `<img class="pdb-el-icon" src="${esc(url)}" alt="" loading="lazy" onerror="this.style.display='none'" />`;
    }
    return `<span class="pdb-el-fallback" style="background:${esc(meta.color)}">${esc(meta.icon || meta.label.slice(0, 1))}</span>`;
  }

  function groupCharactersByElement(chars) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const buckets = new Map(order.map((k) => [k, []]));
    chars.forEach((c) => {
      const key = order.includes(c.element) ? c.element : 0;
      buckets.get(key).push(c);
    });
    return order
      .map((key) => ({ key, chars: buckets.get(key) || [] }))
      .filter((g) => g.chars.length);
  }

  function countByElement(chars) {
    const map = { all: chars.length };
    PDB_ELEMENT_ORDER.forEach((k) => {
      map[k] = 0;
    });
    chars.forEach((c) => {
      if (map[c.element] != null) map[c.element] += 1;
    });
    return map;
  }

  function charsForPanel(panelKey, chars) {
    if (panelKey === 'all') return chars;
    const el = Number(panelKey);
    return chars.filter((c) => c.element === el);
  }

  function renderCharCard(c, selected, selectedSize) {
    const on = selected.has(c.id);
    const disabled = !on && selectedSize >= 3;
    return `<button type="button" class="pdb-char-card${on ? ' is-on' : ''}" data-pdb-char-toggle="${esc(
      c.id
    )}" ${disabled ? 'disabled' : ''} title="${esc(c.name)}">
      <span class="pdb-char-card-avatar">${charPortraitHtml(c.id, c.name, 'is-md')}
        ${on ? '<span class="pdb-char-card-check" aria-hidden="true">✓</span>' : ''}
      </span>
      <span class="pdb-char-card-name">${esc(c.name)}</span>
    </button>`;
  }

  function renderSelectedStrip() {
    const selected = filterValues().selectedCharIds;
    const slots = [];
    for (let i = 0; i < 3; i++) {
      const id = selected[i];
      if (id) {
        const def = findCharDef(id);
        const name = (def && def.name) || id;
        slots.push(`<div class="pdb-sel-slot-box has-char">
          ${charPortraitHtml(id, name, 'is-sm')}
          <span class="pdb-sel-chip-name">${esc(name)}</span>
          <button type="button" class="pdb-sel-chip-x" data-pdb-char-remove="${esc(id)}" aria-label="移除 ${esc(name)}">×</button>
        </div>`);
      } else {
        slots.push(`<div class="pdb-sel-slot-box is-empty">
          <span class="pdb-sel-slot-label">空位</span>
        </div>`);
      }
    }
    const hint =
      selected.length === 0
        ? `<p class="pdb-sel-hint">可选：限定含这些角色的队伍（非必须）</p>`
        : '';
    return `<div class="pdb-sel-strip" data-pdb-sel-strip>
      <div class="pdb-sel-slots">${slots.join('')}</div>
      ${hint}
    </div>`;
  }

  function renderElementTiles(chars) {
    const counts = countByElement(chars);
    const active = String(filterValues().charElementPanel || '');
    const tiles = [
      ...PDB_ELEMENT_ORDER.map((k) => ({ key: String(k), ...elementGroupMeta(k), count: counts[k] || 0 })),
    ];
    return `<div class="pdb-el-tiles" data-pdb-el-tiles>
      ${tiles
        .map((t) => {
          const isOn = active === t.key;
          const iconKey = t.key === 'all' ? 'all' : Number(t.key) || t.key;
          return `<button type="button" class="pdb-el-tile${isOn ? ' is-on' : ''}" data-pdb-el-tile="${esc(
            t.key
          )}" style="--pdb-el:${esc(t.color)}" title="${esc(t.label)}">
            ${elementIconHtml(iconKey)}
            <span class="pdb-el-tile-name">${esc(t.label)}</span>
            <span class="pdb-el-tile-count">${t.count}人</span>
          </button>`;
        })
        .join('')}
    </div>`;
  }

  function renderElementPanel(chars) {
    const panelKey = String(filterValues().charElementPanel || '');
    if (!panelKey) return '';
    const selected = new Set(filterValues().selectedCharIds);
    const selectedSize = selected.size;
    const meta = elementGroupMeta(panelKey === 'all' ? 'all' : Number(panelKey) || panelKey);

    let body = '';
    if (panelKey === 'all') {
      const groups = groupCharactersByElement(chars);
      if (!groups.length) {
        body = `<p class="pdb-muted">角色库未加载，无法检索。</p>`;
      } else {
        body = groups
          .map((g) => {
            const gm = elementGroupMeta(g.key);
            return `<section class="pdb-panel-group">
              <div class="pdb-panel-group-head">
                <span class="pdb-panel-group-dot" style="background:${esc(gm.color)}"></span>
                <span>${esc(gm.label)}</span>
                <span class="pdb-muted">${g.chars.length}</span>
              </div>
              <div class="pdb-char-cards">${g.chars.map((c) => renderCharCard(c, selected, selectedSize)).join('')}</div>
            </section>`;
          })
          .join('');
      }
    } else {
      const list = charsForPanel(panelKey, chars);
      body = list.length
        ? `<div class="pdb-char-cards">${list.map((c) => renderCharCard(c, selected, selectedSize)).join('')}</div>`
        : `<p class="pdb-muted">该属性暂无角色</p>`;
    }

    const count =
      panelKey === 'all' ? chars.length : charsForPanel(panelKey, chars).length;

    return `<div class="pdb-el-panel" data-pdb-el-panel data-panel-key="${esc(panelKey)}">
      <div class="pdb-el-panel-head">
        <strong style="--pdb-el:${esc(meta.color)}">${esc(meta.label)} · ${count}人</strong>
        <button type="button" class="pdb-icon-btn" data-pdb-el-panel-close aria-label="关闭">✕</button>
      </div>
      <div class="pdb-el-panel-body">${body}</div>
    </div>`;
  }

  function renderCharSearch() {
    const chars = listCharacters();
    const selectedCount = filterValues().selectedCharIds.length;
    return `<section class="pdb-char-search pdb-toolbar-block" data-pdb-char-search>
      <div class="pdb-char-search-head">
        <strong class="pdb-block-title is-secondary">角色检索（可选）</strong>
        <span class="pdb-char-search-count">已选 ${selectedCount}/3</span>
      </div>
      ${renderSelectedStrip()}
      <div class="pdb-char-search-body">
        ${renderElementTiles(chars)}
        ${renderElementPanel(chars)}
      </div>
    </section>`;
  }

  function parseSlotParts(key) {
    const parsed = parseConfigKey(key || DEFAULT_CONFIG);
    if (!parsed) return { chain: 0, refine: 1 };
    return { chain: parsed.chain, refine: parsed.refinement };
  }

function setTeamSlotParts(idx, nextChain, nextRefine) {
    filterValues().configAll = false;
    filterValues().zone = 'all';
    ensureTeamSlotConfigs(filterValues());
    const cur = parseSlotParts(filterValues().teamSlotConfigs[idx]);
    const chain = nextChain != null ? clampChain(nextChain) : cur.chain;
    const refine = nextRefine != null ? clampRefine(nextRefine) : cur.refine;
    filterValues().teamSlotConfigs[idx] = formatSlotKey(chain, refine);
  }

function renderTeamSlotBoard(idx, key, configAll) {
    const { chain, refine } = parseSlotParts(key);
    const summary = configAll ? '全部' : formatSlotKey(chain, refine);
    const dis = configAll ? ' disabled' : '';
    const chainOpts = [0, 1, 2, 3, 4, 5, 6]
      .map(
        (n) =>
          `<option value="${n}"${chain === n ? ' selected' : ''}>共鸣链 · ${n === 0 ? '0链' : `${n}链`}</option>`
      )
      .join('');
    const refineOpts = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<option value="${n}"${refine === n ? ' selected' : ''}>精炼 · R${n}</option>`
      )
      .join('');
    return `<div class="pdb-team-cfg-slot" data-pdb-team-slot-card="${idx}">
      <div class="pdb-team-cfg-slot-head">
        <span class="pdb-team-cfg-slot-label">${idx === 0 ? '位1·主C' : `位${idx + 1}`}</span>
        <strong class="pdb-team-cfg-slot-summary">${esc(summary)}</strong>
      </div>
      <select class="pdb-select pdb-slot-select" data-pdb-team-chain-select data-pdb-team-slot-i="${idx}" aria-label="位${idx + 1} 共鸣链"${dis}>
        ${chainOpts}
      </select>
      <select class="pdb-select pdb-slot-select" data-pdb-team-refine-select data-pdb-team-slot-i="${idx}" aria-label="位${idx + 1} 精炼"${dis}>
        ${refineOpts}
      </select>
    </div>`;
  }

  function teamPresetActiveKey() {
    return ensureTeamSlotConfigs(filterValues()).join('|');
  }

  function renderTeamConfigFilters() {
    const slots = ensureTeamSlotConfigs(filterValues());
    const configAll = !!filterValues().configAll;
    const slotHtml = [0, 1, 2]
      .map((i) => renderTeamSlotBoard(i, configAll ? '' : slots[i], configAll))
      .join('');
    const activePreset = configAll ? '' : teamPresetActiveKey();
    const presets = [
      { key: '0+1|0+1|0+1', label: '全员 0+1' },
      { key: '2+1|0+1|0+1', label: '主C 2+1 + 双0+1' },
      { key: '3+1|0+1|0+1', label: '主C 3+1 + 双0+1' },
      { key: '6+5|0+1|0+1', label: '主C 6+5 + 双0+1' },
      { key: '6+5|6+5|6+5', label: '全员 6+5' },
    ];
    return `<section class="pdb-team-cfg pdb-toolbar-block" data-pdb-team-cfg>
      <div class="pdb-team-cfg-head">
        <strong class="pdb-block-title">同配检索</strong>
        <label class="pdb-match-tag">
          <span class="pdb-match-tag-label">匹配模式</span>
          <select class="pdb-select pdb-match-select" data-pdb-cr-mode aria-label="配置匹配方式" ${configAll ? 'disabled' : ''}>
            ${CONFIG_MATCH_OPTIONS.map(
              (o) =>
                `<option value="${esc(o.value)}"${filterValues().configMatch === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
            ).join('')}
          </select>
        </label>
      </div>
      <div class="pdb-team-cfg-slots">${slotHtml}</div>
      <div class="pdb-team-cfg-actions">
        <button type="button" class="pdb-chip-btn${configAll ? ' is-active' : ''}" data-pdb-team-all-config title="不按链精筛选，显示所有配置的方案">全部配置</button>
        ${presets
          .map(
            (p) =>
              `<button type="button" class="pdb-chip-btn${activePreset === p.key ? ' is-active' : ''}" data-pdb-team-preset="${esc(
                p.key
              )}">${esc(p.label)}</button>`
          )
          .join('')}
      </div>
      <p class="pdb-cr-hint">位1 默认主C。快捷预设按站位匹配（如主C 2+1 + 双0+1 = 位1 为 2+1、位2/3 为 0+1）。角色检索仅作可选追加。</p>
    </section>`;
  }

  function syncTeamConfigFilterPanel() {
    const existing = document.querySelector('[data-pdb-team-cfg]');
    const html = renderTeamConfigFilters();
    if (existing) {
      existing.outerHTML = html;
      return;
    }
    const row = document.querySelector('.pdb-search-row');
    if (row) {
      row.insertAdjacentHTML('afterbegin', html);
      return;
    }
    const toolbar = document.querySelector('.pdb-toolbar');
    if (toolbar) toolbar.insertAdjacentHTML('afterbegin', html);
  }

  function syncCharSearchSelection() {
    const root = document.querySelector('[data-pdb-char-search]');
    if (!root) {
      renderShell();
      return;
    }
    const strip = root.querySelector('[data-pdb-sel-strip]');
    if (strip) strip.outerHTML = renderSelectedStrip();
    const countEl = root.querySelector('.pdb-char-search-count');
    if (countEl) countEl.textContent = `已选 ${filterValues().selectedCharIds.length}/3`;

    const selected = new Set(filterValues().selectedCharIds);
    const size = selected.size;
    root.querySelectorAll('[data-pdb-char-toggle]').forEach((btn) => {
      const id = btn.dataset.pdbCharToggle;
      const on = selected.has(id);
      btn.classList.toggle('is-on', on);
      btn.disabled = !on && size >= 3;
      const avatar = btn.querySelector('.pdb-char-card-avatar');
      if (avatar) {
        let check = avatar.querySelector('.pdb-char-card-check');
        if (on && !check) {
          check = document.createElement('span');
          check.className = 'pdb-char-card-check';
          check.setAttribute('aria-hidden', 'true');
          check.textContent = '✓';
          avatar.appendChild(check);
        } else if (!on && check) {
          check.remove();
        }
      }
    });
  }

  function difficultyTagClass(label) {
    const s = String(label || '').trim();
    if (!s) return '';
    if (/^最简单$|^入门$/.test(s)) return 'tag-easiest';
    if (/^基础$/.test(s)) return 'tag-basic';
    if (/^进阶适中$|^进阶$|中等/.test(s)) return 'tag-advanced';
    if (/^吃手法$|手法依赖|挑操作/.test(s)) return 'tag-technique';
    if (/椰果|^极限$|困难|高难/.test(s)) return 'tag-extreme';
    return '';
  }

  function performanceTagClass(label) {
    const s = String(label || '').trim();
    if (!s) return '';
    if (/^适应强$|适应力优秀|^优秀$/.test(s)) return 'tag-adapt';
    if (/^较为通解$|通解|^稳定$/.test(s)) return 'tag-stable';
    if (/^适中看操作$|适中|吃手法|手法|挑操作/.test(s)) return 'tag-technique';
    if (/^较挑环境$|挑环境|挑剔环境/.test(s)) return 'tag-picky';
    if (/坐牢|打桩|理论极限|^理论$/.test(s)) return 'tag-theory';
    return '';
  }

  /** 归一到筛选选项值，兼容别名文案 */
  function normalizeDifficultyFilterKey(label) {
    const cls = difficultyTagClass(label);
    if (cls === 'tag-easiest') return '最简单';
    if (cls === 'tag-basic') return '基础';
    if (cls === 'tag-advanced') return '进阶适中';
    if (cls === 'tag-technique') return '吃手法';
    if (cls === 'tag-extreme') return '椰果轴';
    return String(label || '').trim();
  }

  function normalizePerformanceFilterKey(label) {
    const cls = performanceTagClass(label);
    if (cls === 'tag-adapt') return '适应强';
    if (cls === 'tag-stable') return '较为通解';
    if (cls === 'tag-technique') return '适中看操作';
    if (cls === 'tag-picky') return '较挑环境';
    if (cls === 'tag-theory') return '坐牢打桩';
    return String(label || '').trim();
  }

  function openPublisherHome(profile, shareCode) {
    const info = profile || {};
    const id = String(info.id || '');
    if (window.WaveCalcProfile && typeof WaveCalcProfile.openAuthor === 'function') {
      setOpen(false);
      WaveCalcProfile.openAuthor(info);
      return;
    }
    const me =
      window.Cloud && typeof Cloud.getUser === 'function' ? Cloud.getUser() : null;
    const myId = me && (me.id || (me.user && me.user.id));
    if (id && myId && String(myId) === id) {
      setOpen(false);
      if (window.WaveCalcProfile && typeof WaveCalcProfile.open === 'function') {
        WaveCalcProfile.open();
      }
      return;
    }
    // 他人公开主页尚未上线：先打开方案详情
    if (shareCode) {
      openDetailModal(shareCode);
    }
  }

  function teamAvatarGroupHtml(it, slotOverrides) {
    const ids = Array.isArray(it._characterIds) ? it._characterIds : [];
    const names = Array.isArray(it._names) ? it._names : [];
    const slotsData = Array.isArray(it._memberSlots) ? it._memberSlots : [];
    const hasAny = ids.some(Boolean) || names.some(Boolean);
    const weaponImg = (weaponId) => {
      if (!weaponId) return { url: '', remote: '' };
      let wdef = null;
      if (typeof window.findWeaponDef === 'function') {
        try { wdef = findWeaponDef(String(weaponId)); } catch (e) { wdef = null; }
      }
      let url = wdef && wdef.avatar ? String(wdef.avatar) : '';
      if (url && typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
      let remote = '';
      if (wdef && typeof window.getWeaponDefIconUrl === 'function') {
        try { remote = getWeaponDefIconUrl(wdef) || ''; } catch (e) { remote = ''; }
        if (remote && typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
      }
      return { url, remote };
    };
    const slots = [0, 1, 2].map((i) => {
      const id = ids[i] ? String(ids[i]) : '';
      const nameHint = names[i] || '';
      const slot = slotsData[i] || {};
      if (!hasAny) {
        return `<span class="pdb-team-slot" aria-hidden="true"><span class="avatar is-empty"><span class="avatar-fallback">?</span></span></span>`;
      }
      if (!id && !nameHint) {
        return `<span class="pdb-team-slot" aria-hidden="true"><span class="avatar is-empty"><span class="avatar-fallback">?</span></span></span>`;
      }
      const def = id ? findCharDef(id) : null;
      const name = (def && def.name) || nameHint || '角色';
      const el = Number(def && def.element) || 0;
      const elColor = PDB_ELEMENT_COLORS[el] || '#8b9cb3';
      let url = '';
      let remote = '';
      if (def && typeof window.getCharPortraitUrl === 'function') {
        url = getCharPortraitUrl(def) || '';
        if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
      }
      if (def && typeof window.getCharPortraitRemoteUrl === 'function') {
        remote = getCharPortraitRemoteUrl(def) || '';
        if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
      }
      const remoteAttr =
        remote && remote !== url ? ` data-remote="${esc(remote)}"` : '';
      const img = url
        ? `<img src="${esc(url)}" alt="" loading="lazy"${remoteAttr} onerror="typeof handlePortraitImgError==='function'&&handlePortraitImgError(this)" />`
        : '';
      const fb = `<span class="avatar-fallback" style="display:${url ? 'none' : 'flex'}">${esc(String(name).trim().slice(0, 1) || '?')}</span>`;
      const dot = el
        ? `<span class="element-dot" style="background:${esc(elColor)}"></span>`
        : '';
      const ov = Array.isArray(slotOverrides) ? slotOverrides[i] : null;
      const chain = ov && Number.isInteger(ov.chain) ? ov.chain : Number.isInteger(slot.chain) ? slot.chain : 0;
      const refine = ov && Number.isInteger(ov.refinement) ? ov.refinement : Number.isInteger(slot.refinement) ? slot.refinement : 1;
      const wIcon = weaponImg(slot.weaponId);
      const wUrl = wIcon.url;
      const wRemote = wIcon.remote;
      const weaponHtml = slot.weaponId
        ? `<span class="slot-weapon-wrap">` +
            (wUrl
              ? `<img class="slot-weapon" src="${esc(wUrl)}" alt="" loading="lazy"${wRemote && wRemote !== wUrl ? ` data-remote="${esc(wRemote)}"` : ''} onerror="var i=this;if(i.dataset.remote&&!i.dataset.remoteTried){i.dataset.remoteTried='1';i.src=i.dataset.remote;}else{i.style.display='none';}" />`
              : wRemote
                ? `<img class="slot-weapon" src="${esc(wRemote)}" alt="" loading="lazy" />`
                : `<span class="slot-weapon-fb">武</span>`) +
            `<span class="slot-badge slot-badge-refine">R${refine}</span>` +
          `</span>`
        : `<span class="slot-weapon-wrap is-empty"></span>`;
      return `<span class="pdb-team-slot" title="${esc(name)}"${id ? ` data-pdb-char="${esc(id)}"` : ''}>` +
        `<span class="slot-avatar-wrap">` +
          `<span class="avatar"${id ? ` data-pdb-char="${esc(id)}"` : ''}>${img}${fb}${dot}</span>` +
          `<span class="slot-badge slot-badge-chain">${chain}链</span>` +
        `</span>` +
        weaponHtml +
      `</span>`;
    });
    return `<div class="avatar-group" aria-label="队伍角色">${slots.join('')}</div>`;
  }
  const availableCardWallpapers = new Set(["丹瑾","丽贝卡","仇远","今汐","凌阳","千咲","卡卡罗","卡提希娅","吟霖","夏空","奥古斯塔","守岸人","安可","尤诺","布兰特","弗洛洛","忌炎","折枝","散华","景燃","桃祈","椿","洛可可","清宵","漂泊者","爱弥斯","相里要","秧秧","秧秧·气动","秧秧·湮灭","秧秧·玄翎","穗穗","绯雪","维里奈","莫宁","西格莉卡","赞妮","达妮娅","达尼娅","釉瑚","长离","陆·赫斯","陆赫斯","露帕","露西"]);
  function cardWallpaperUrl(it) {
    const ids = Array.isArray(it?._characterIds) ? it._characterIds : [];
    const def = ids.length ? findCharDef(ids[0]) : null;
    const name = String((def && def.name) || (Array.isArray(it?._names) ? it._names[0] : '') || '').trim();
    return name && availableCardWallpapers.has(name) ? `assets/character-bg-enhanced/${encodeURIComponent(name)}.webp` : '';
  }
  function renderCard(it) {
    const profile = it.profiles || {};
    const author = profile.display_name || '匿名';
    const authorId = profile.id || it.author_id || '';
    const time = fmtDate(it.updated_at || it.approved_at);
    const variant = pickDisplayVariant(it) || (uiState.zone === 'all' && uiState.configAll ? pickLowestVariant(it) : null);
    const showDps = variant ? variant.teamDps : it._teamDps;
    const showTotal = variant ? variant.teamTotal : it._teamTotal;
    const showDuration = variant ? variant.axisDuration : it._axisDuration;
    const variantSlots =
      variant && Array.isArray(variant.memberConfigs)
        ? variant.memberConfigs.slice(0, 3).map((cfg) => {
            const m = String(cfg || '').match(/^(\d+)\+(\d+)$/);
            return m ? { chain: clampChain(Number(m[1])), refinement: clampRefine(Number(m[2])) } : null;
          })
        : null;
    const entryType = String(it.summary?.entryType || '').trim() || (it._mock ? '表级14词条' : '');
    const entryTone = entryType === '其他表级词条' ? ' tag-entry-other' : entryType === '自定义词条' ? ' tag-entry-custom' : '';
    const tags = entryType
      ? `<span class="tag tag-entry${entryTone}"><span class="tag-value">${esc(entryType)}</span></span>`
      : '';
    const authorAttrs = `data-pdb-author${authorId ? `="${esc(authorId)}"` : ''} data-pdb-share="${esc(it.share_code || '')}" title="查看发布者"`;
    const title = String(it._axisName || it.title || '未命名轴').replace(/\s*·\s*[^·]+?\d+\s*$/, '').trim() || '未命名轴';
    const durationText = showDuration ? `${Math.round(showDuration)}s` : '—';
    const wallpaper = cardWallpaperUrl(it);
    const wallpaperHtml = wallpaper
      ? `<span class="pdb-card-wallpaper" style="background-image:url('${esc(wallpaper)}')" aria-hidden="true"></span>`
      : '';

    const kindClass = it._axisKind === 'global' ? 'pdb-kind-global' : it._axisKind === 'loop' ? 'pdb-kind-loop' : '';
    const videoBadge = extractRefVideoUrl(it)
      ? '<span class="pdb-video-badge" title="该方案包含参考视频链接">有视频出处</span>'
      : '';

    return `<article class="data-card pdb-card ${kindClass}" data-axis-kind="${esc(it._axisKind || '')}" data-share="${esc(it.share_code)}">${wallpaperHtml}
      <div class="card-heading">
        <div class="card-heading-copy">
          <h2 class="card-name">${esc(title)}</h2>
        </div>
        <div class="card-heading-tools">
          <div class="card-heading-actions">
            <button type="button" class="pdb-card-btn is-outline" data-pdb-review-open="${esc(it.share_code)}" title="查看与撰写数据评价">评价${it._reviewCount > 0 ? `<em class="review-count">${it._reviewCount}</em>` : ''}</button>
            <button type="button" class="pdb-card-btn is-primary" data-pdb-detail="${esc(it.share_code)}" title="查看轴详情">查看详情</button>
            <button type="button" class="pdb-card-btn is-ghost" data-pdb-report="${esc(it.share_code)}" title="举报该轴数据">举报</button>
            <button type="button" class="pdb-card-btn is-primary" data-pdb-export-card="${esc(it.share_code)}" title="用此方案快速出图（方案自带声骸 + 你的账号信息）">出图</button>
          </div>
        </div>
      </div>
      <div class="card-main">
        <div class="card-left">
          <div class="team" aria-label="队伍角色">${teamAvatarGroupHtml(it, variantSlots)}</div>
           <div class="card-tag-row">
             <div class="card-tags team-tags" aria-label="词条类型">${tags}${videoBadge}</div>
             <div class="card-signal-actions">
               <button type="button" class="pdb-card-btn pdb-pulse-heart is-outline like" data-pdb-like="${esc(it.share_code)}" data-count="${Math.max(0, Number(it.like_count) || 0)}" aria-pressed="${uiState.likedSchemeIds.has(it.id)}" data-liked="${uiState.likedSchemeIds.has(it.id)}" aria-label="点赞" title="点赞此方案"><span class="pdb-pulse-heart__pill"><span class="pdb-pulse-heart__heart" aria-hidden="true"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0 7.78Z" vector-effect="non-scaling-stroke"></path></svg></span><span class="pdb-pulse-heart__count" aria-hidden="true">${Math.max(0, Number(it.like_count) || 0)}</span></span></button>
               ${Number.isFinite(Number(it.fork_count)) ? `<span class="card-use-count" title="公开库方案被导入的次数">应用次数：<strong>${Number(it.fork_count)}</strong></span>` : ''}
             </div>
           </div>
           <div class="card-left-foot">
             <div class="card-footer-stats">
               <div class="card-metrics">
                 <span class="card-metric"><small>总伤</small><strong>${fmtNum(showTotal)}</strong></span>
                 <span class="card-metric dps"><small>DPS</small><strong>${fmtDpsCompact(showDps)}</strong></span>
                 <span class="card-metric"><small>轴长</small><strong>${durationText}</strong></span>
               </div>
               ${time ? `<small class="publish-date">发布于 ${esc(time)}</small>` : ''}
             </div>
             <span class="pdb-card-user author" ${authorAttrs}>
               ${profileAvatarHtml(profile)}
               <span class="author-info"><b>${esc(author)}</b></span>
             </span>
           </div>
      </div>
    </article>`;
  }
  function profileAvatarHtml(profile) {
    const p = profile || {};
    const name = String(p.display_name || '匿名');
    const url = p.avatar_data_url ? String(p.avatar_data_url) : '';
    const short = esc(String(name).trim().slice(0, 1) || '?');
    const img = url
      ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='flex'" />`
      : '';
    const fbStyle = url ? '' : ' style="display:flex"';
    return `<span class="pdb-author-avatar">${img}<span class="pdb-author-avatar-fb"${fbStyle}>${short}</span></span>`;
  }

  const filterSortCache = {
    itemsRef: null,
    axisKind: null,
    zone: null,
    sort: null,
    difficulty: null,
    performance: null,
    selectedCharIdsKey: '',
    teamSlotConfigsKey: '',
    configMatch: null,
    configAll: null,
    result: null,
  };

  function filteredItems() {
    const selectedKey = uiState.selectedCharIds.slice().sort().join(',');
    const slotsKey = (Array.isArray(uiState.teamSlotConfigs) ? uiState.teamSlotConfigs : []).join(',');
    if (
      filterSortCache.itemsRef === uiState.items &&
      filterSortCache.axisKind === uiState.axisKind &&
      filterSortCache.zone === uiState.zone &&
      filterSortCache.sort === uiState.sort &&
      filterSortCache.difficulty === uiState.difficulty &&
      filterSortCache.performance === uiState.performance &&
      filterSortCache.selectedCharIdsKey === selectedKey &&
      filterSortCache.teamSlotConfigsKey === slotsKey &&
      filterSortCache.configMatch === uiState.configMatch &&
      filterSortCache.configAll === uiState.configAll &&
      filterSortCache.result
    ) {
      return filterSortCache.result;
    }

    let list;
    if (uiState.axisKind === 'all') list = uiState.items.slice();
    else if (uiState.axisKind === 'template') {
      list = uiState.items.filter((it) => it.summary && it.summary.standardTemplate === true);
    } else {
      list = uiState.items.filter((it) => it._axisKind === uiState.axisKind);
    }
    list = list.filter((it) => itemMatchesTeamSlotConfigs(it));
    if (uiState.difficulty) {
      list = list.filter(
        (it) => normalizeDifficultyFilterKey(it._difficulty) === uiState.difficulty
      );
    }
    if (uiState.performance) {
      list = list.filter(
        (it) => normalizePerformanceFilterKey(it._performance) === uiState.performance
      );
    }
    const selected = uiState.selectedCharIds;
    if (selected.length) {
      list = list.filter((it) => selected.every((id) => it._characterIds.includes(id)));
    }
    const sort = uiState.sort;
    list = list.slice().sort((a, b) => {
      if (sort === 'dps') return b._teamDps - a._teamDps;
      if (sort === 'total') return b._teamTotal - a._teamTotal;
      return b._time - a._time;
    });

    filterSortCache.itemsRef = uiState.items;
    filterSortCache.axisKind = uiState.axisKind;
    filterSortCache.zone = uiState.zone;
    filterSortCache.sort = uiState.sort;
    filterSortCache.difficulty = uiState.difficulty;
    filterSortCache.performance = uiState.performance;
    filterSortCache.selectedCharIdsKey = selectedKey;
    filterSortCache.teamSlotConfigsKey = (Array.isArray(uiState.teamSlotConfigs) ? uiState.teamSlotConfigs : []).join(',');
    filterSortCache.configMatch = uiState.configMatch;
    filterSortCache.configAll = uiState.configAll;
    filterSortCache.result = list;
    return list;
  }

  function renderFilterSelect(attr, ariaLabel, options, current) {
    return `<select class="pdb-select" ${attr} aria-label="${esc(ariaLabel)}">
      ${options
        .map(
          (o) =>
            `<option value="${esc(o.value)}"${current === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
        )
        .join('')}
    </select>`;
  }

  function pagedItems() {
    if (!uiState.usingMock && uiState.remoteTotal !== null) {
      return {list:uiState.items,total:uiState.remoteTotal,pages:Math.max(1,Math.ceil(uiState.remoteTotal/PAGE_SIZE))};
    }
    const list = filteredItems();
    const total = list.length;
    const pageSize = effectivePageSize();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (uiState.page > pages) uiState.page = pages;
    if (uiState.page < 1) uiState.page = 1;
    const start = (uiState.page - 1) * pageSize;
    return { list: list.slice(start, start + pageSize), total, pages };
  }

  function effectivePageSize() {
    return PAGE_SIZE;
  }

  function isOpen() {
    return document.body.classList.contains('public-db-open');
  }

  function setOpen(open) {
    // 翻转侦查（移动端公开库 2s 自动跳走问题）：记录每次 setOpen 调用方堆栈到错误陷阱日志
    try {
      var stack = new Error('pdb-setOpen').stack || '';
      var caller = String(stack).split('\n').slice(1, 5).join(' | ');
      if (window.__wcTrapLog) window.__wcTrapLog('pdb-' + (open ? 'open' : 'CLOSE'), caller.slice(0, 400));
    } catch (e0) { /* ignore */ }
    if (!open && filterDraft) closeFilterDialog(false);
    document.body.classList.toggle('public-db-open', !!open);
    const page = document.getElementById('publicDbPage');
    if (page) page.hidden = !open;
    if (open) {
      if (window.Matrix && typeof Matrix.close === 'function') Matrix.close();
      if (window.WaveCalcProfile && typeof WaveCalcProfile.close === 'function') {
        WaveCalcProfile.close();
      }
      uiState.charElementPanel = '';
      uiState.detailCode = '';
      renderShell();
      void loadItems();
      void refreshLikedSchemes();
    } else {
      uiState.charElementPanel = '';
      uiState.detailCode = '';
    }
  }

  function renderList() {
    if (uiState.loading && (!uiState.items.length || uiState.pendingListChange)) {
      return `<div class="pdb-skeleton-list">${Array.from({ length: 6 })
        .map(() => '<div class="pdb-skeleton-card"></div>')
        .join('')}</div>`;
    }
    if (uiState.error) {
      return `<div class="pdb-empty pdb-error">
        <div class="pdb-empty-icon" aria-hidden="true"><i data-lucide="wifi-off"></i></div>
        <p class="pdb-empty-title">加载失败</p>
        <p class="pdb-empty-text">${esc(uiState.error)}</p>
        <button type="button" class="pdb-btn pdb-btn-primary" data-pdb-retry>重试</button>
      </div>`;
    }
    const { list, total } = pagedItems();

    if (!list.length) {
      if (!uiState.items.length && uiState.remoteTotal !== null) {
        return '<div class="pdb-empty"><p class="pdb-empty-title">未找到匹配的轴数据</p><p class="pdb-empty-text">试试放宽筛选条件，或检查标题与分享码</p></div>';
      }
      if (!uiState.items.length) {
        return `<div class="pdb-empty">
          <div class="pdb-empty-icon" aria-hidden="true"><i data-lucide="database"></i></div>
          <p class="pdb-empty-title">暂无数据</p>
          <p class="pdb-empty-text">可前往数据导出页上传</p>
          <button type="button" class="pdb-btn pdb-btn-primary" data-pdb-goto-export>前往数据导出页</button>
        </div>`;
      }
      const kindCount =
        uiState.axisKind === 'template'
          ? uiState.items.filter((it) => it.summary && it.summary.standardTemplate === true).length
          : uiState.items.filter((it) => it._axisKind === uiState.axisKind).length;
      if (uiState.axisKind !== 'all' && kindCount === 0) {
        return `<div class="pdb-empty">
          <div class="pdb-empty-icon" aria-hidden="true"><i data-lucide="inbox"></i></div>
          <p class="pdb-empty-title">暂无${axisKindLabel(uiState.axisKind)}数据</p>
          <p class="pdb-empty-text">可前往数据导出页上传</p>
        </div>`;
      }
      return `<div class="pdb-empty">
        <div class="pdb-empty-icon" aria-hidden="true"><i data-lucide="search-x"></i></div>
        <p class="pdb-empty-title">未找到匹配的轴数据</p>
        <p class="pdb-empty-text">${
          uiState.searchQ
            ? `未找到与「${esc(uiState.searchQ)}」匹配的轴，请检查分享码或标题`
            : '试试放宽同配链精或角色条件'
        }</p>
      </div>`;
    }

    return `<div class="pdb-list">${list.map(renderCard).join('')}</div>
      ${renderPager(total)}`;
  }

  function renderPager(total) {
    const pageSize = effectivePageSize();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1 && total <= pageSize) {
      return `<div class="pdb-pager"><span class="pdb-pager-count">共 ${total} 条数据</span></div>`;
    }
    const cur = uiState.page;
    const buttons = [];
    const windowSize = 5;
    let start = Math.max(1, cur - Math.floor(windowSize / 2));
    let end = Math.min(pages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i++) {
      buttons.push(
        `<button type="button" class="pdb-page-btn${i === cur ? ' is-on' : ''}" data-pdb-page="${i}">${i}</button>`
      );
    }
    return `<div class="pdb-pager">
      <button type="button" class="pdb-page-btn" data-pdb-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>上一页</button>
      ${buttons.join('')}
      <button type="button" class="pdb-page-btn" data-pdb-page="${cur + 1}" ${cur >= pages ? 'disabled' : ''}>下一页</button>
      <span class="pdb-pager-count">共 ${total} 条数据</span>
    </div>`;
  }

  function axisKindLabel(kind) {
    if (kind === 'loop') return '循环轴';
    if (kind === 'global') return '全局轴';
    if (kind === 'template') return '标准模板';
    if (kind === 'all') return '全部';
    return '—';
  }

  function extractRefVideoUrl(it) {
    const payload = it?.payload && typeof it.payload === 'object' ? it.payload : null;
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const summary = it?.summary && typeof it.summary === 'object' ? it.summary : null;
    const candidates = [
      data?.refVideoUrl,
      data?.videoUrl,
      data?.video_url,
      payload?.meta?.refVideoUrl,
      it?.refVideoUrl,
      it?.refVideoMetaUrl,
      it?.videoUrl,
      it?.video_url,
      summary?.refVideoUrl,
      summary?.videoUrl,
      summary?.video_url,
    ];
    return candidates
      .map((value) => String(value || '').trim())
      .find((value) => /^https?:\/\//i.test(value)) || '';
  }

  function resetDetailImportOpts() {
    uiState.detailImportOpts = { axis: true, build: true, buff: true };
  }

  async function openDetailModal(code) {
    uiState.detailCode = String(code || '');
    uiState.detailClosing = false;
    uiState.detailItem = null;
    resetDetailImportOpts();
    renderShell();
    void loadReviewsForDetail(String(code || ''));
    // 列表数据不含 payload，详情需单独拉取完整方案（含参考视频等）
    try {
      const d = await Cloud.api('/schemes/' + encodeURIComponent(String(code || '')));
      if (d && d.share_code && uiState.detailCode === d.share_code) {
        uiState.detailItem = enrichItem(d);
        patchDetailDialogInPlace();
      }
    } catch (_) {
      /* 拉取失败时回退到列表项 */
    }
  }

  async function loadReviewsForDetail(code, root) {
    root = root || document.querySelector('.pdb-detail-reviews');
    if (!root || String(root.dataset.pdbReviewsCode || root._shareCode || '') !== String(code)) return;
    const listEl = root.querySelector('[data-pdb-reviews-list]');
    if (!listEl) return;
    const countEl = root.querySelector('[data-pdb-review-count]');
    try {
      const data = await Cloud.api('/schemes/' + encodeURIComponent(code) + '/reviews');
      if (!listEl.isConnected) return;
      const items = data.items || [];
      const count = Number(data.review_count) || 0;
      if (countEl) countEl.textContent = count > 0 ? `${count}条` : '0条';
      if (!items.length) {
        listEl.innerHTML = '<div class="pdb-review-empty">暂无评价</div>';
      } else {
        listEl.innerHTML = items
          .map((r) => {
            const reviewer = (r.profiles && r.profiles.display_name) || '匿名';
            const statusLabel = r.status === 'fixed' ? '已纠正' : r.status === 'rejected' ? '已驳回' : '待处理';
            const tags = Array.isArray(r.tags) ? r.tags : [];
            const tagHtml = tags.length
              ? `<div class="pdb-review-tags-line">${tags.map((t) => `<span class="pdb-review-tag-sm">${esc(t)}</span>`).join('')}</div>`
              : '';
            const replyHtml =
              r.status === 'fixed' && r.fix_note
                ? `作者已纠正：${esc(r.fix_note)}`
                : r.status === 'rejected' && r.reject_reason
                  ? `作者已驳回：${esc(r.reject_reason)}`
                  : r.fix_note
                    ? `作者回复：${esc(r.fix_note)}`
                    : '';
            const profile = r.profiles || {};
            const avatar = profile.avatar_data_url || '';
            const avatarHtml = avatar
              ? `<span class="pdb-review-avatar"><img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="pdb-review-avatar-fb" style="display:none">${esc(String(reviewer).trim().slice(0, 1) || '?')}</span></span>`
              : `<span class="pdb-review-avatar"><span class="pdb-review-avatar-fb">${esc(String(reviewer).trim().slice(0, 1) || '?')}</span></span>`;
            return `<div class="pdb-review-item">
              <div class="pdb-review-head">
                ${avatarHtml}
                <span class="pdb-review-author">${esc(reviewer)}</span>
                ${r.status && r.status !== 'pending' ? `<span class="pdb-review-status is-${esc(r.status)}">${esc(statusLabel)}</span>` : ''}
                <span class="pdb-review-time">${esc(fmtDate(r.created_at))}</span>
              </div>
              <div class="pdb-review-content">${esc(r.content)}</div>
              ${tagHtml}
              ${replyHtml ? `<div class="pdb-review-fixnote">${replyHtml}</div>` : ''}
              <button type="button" class="pdb-review-report" data-pdb-review-report="${esc(r.id)}" data-pdb-review-scheme="${esc(code)}" data-pdb-review-preview="${esc(String(r.content || '').slice(0, 40))}">举报</button>
            </div>`;
          })
          .join('');
      }
      const summaryEl = root.querySelector('[data-pdb-review-summary]');
      if (summaryEl) {
        summaryEl.textContent = count > 0 ? `${count}条评价` : '暂无评价';
      }
    } catch (e) {
      if (!listEl.isConnected) return;
      listEl.innerHTML = '<div class="pdb-review-empty">评价加载失败</div>';
      if (countEl) countEl.textContent = '0条';
    }
  }

  function closeDetailModal(animated) {
    if (!uiState.detailCode) return;
    if (!animated) {
      uiState.detailCode = '';
      uiState.detailItem = null;
      uiState.detailClosing = false;
      renderShell();
      return;
    }
    const overlay = document.querySelector('[data-pdb-detail-overlay]');
    if (!overlay) {
      uiState.detailCode = '';
      uiState.detailItem = null;
      renderShell();
      return;
    }
    uiState.detailClosing = true;
    overlay.classList.add('is-leaving');
    window.setTimeout(() => {
      if (!uiState.detailClosing) return;
      uiState.detailCode = '';
      uiState.detailClosing = false;
      renderShell();
    }, 220);
  }

  // ---------- 举报 ----------
  let reportOverlayEl = null;

  const REPORT_REASONS = [
    ['数据错误', '数值/配置与游戏不符'],
    ['数值异常', '疑似虚假或异常偏高'],
    ['恶意内容', '违规 / 广告 / 引战'],
    ['重复发布', '与已有方案重复'],
    ['其他', '其他问题'],
  ];

  function closeReportModal() {
    if (reportOverlayEl) {
      reportOverlayEl.remove();
      reportOverlayEl = null;
    }
  }

  async function openReportModal(shareCode, opts) {
    const isReviewReport = !!(opts && opts.targetType === 'review');
    const it = uiState.items.find((x) => x.share_code === shareCode);
    if (!it && !isReviewReport) return;
    if (!window.Cloud || typeof Cloud.getUser !== 'function' || !Cloud.getUser()) {
      if (await DialogKit.confirm({ message: '举报需要先登录，现在去登录吗？' })) {
        if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      }
      return;
    }
    closeReportModal();
    const overlay = document.createElement('div');
    overlay.className = 'pdb-report-overlay';
    overlay.setAttribute('data-pdb-report-overlay', '');
    overlay.innerHTML = `
      <div class="pdb-report-dialog" role="dialog" aria-modal="true" aria-labelledby="pdbReportTitle">
        <div class="pdb-report-head">
          <strong id="pdbReportTitle">${isReviewReport ? '举报评价' : '举报轴数据'}</strong>
          <button type="button" class="pdb-report-close" data-pdb-report-close aria-label="关闭">✕</button>
        </div>
        <div class="pdb-report-target">${isReviewReport ? `评价内容：${esc((opts && opts.title) || '')}` : `《${esc(it.title || '未命名轴')}》`}</div>
        <div class="pdb-report-reasons">
          ${REPORT_REASONS.map(
            ([val, hint], i) =>
              `<label class="pdb-report-reason">
                <input type="radio" name="pdb-report-reason" value="${esc(val)}"${i === 0 ? ' checked' : ''} />
                <span class="pdb-report-reason-name">${esc(val)}</span>
                <span class="pdb-report-reason-hint">${esc(hint)}</span>
              </label>`
          ).join('')}
        </div>
        <textarea class="pdb-report-detail" data-pdb-report-detail placeholder="补充说明（选填，500 字以内）" maxlength="500"></textarea>
        <div class="pdb-report-actions">
          <button type="button" class="pdb-report-btn" data-pdb-report-cancel>取消</button>
          <button type="button" class="pdb-report-btn is-primary" data-pdb-report-submit>提交举报</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay._shareCode = shareCode;
    overlay._targetType = isReviewReport ? 'review' : 'scheme';
    overlay._targetId = (opts && opts.targetId) || '';
    reportOverlayEl = overlay;
  }

  async function submitReport() {
    if (!reportOverlayEl) return;
    const reasonEl = reportOverlayEl.querySelector('input[name="pdb-report-reason"]:checked');
    const detailEl = reportOverlayEl.querySelector('[data-pdb-report-detail]');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    const detail = detailEl ? detailEl.value.trim() : '';
    const reportBtn = reportOverlayEl.querySelector('[data-pdb-report-submit]');
    const it = uiState.items.find(
      (x) => x.share_code === (reportOverlayEl._shareCode || '')
    );
    if (!it) {
      closeReportModal();
      return;
    }
    if (reportBtn) {
      reportBtn.disabled = true;
      reportBtn.textContent = '提交中…';
    }
    try {
      const targetType = reportOverlayEl._targetType || 'scheme';
      const body =
        targetType === 'review'
          ? { targetType: 'review', targetId: reportOverlayEl._targetId || '', reason, detail }
          : { schemeId: it.id, reason, detail };
      await Cloud.api('/reports', {
        method: 'POST',
        auth: true,
        body,
      });
      closeReportModal();
      window.alert('举报已提交，管理员会尽快核实处理，感谢反馈！');
    } catch (e) {
      if (reportBtn) {
        reportBtn.disabled = false;
        reportBtn.textContent = '提交举报';
      }
      window.alert('举报提交失败：' + (e.message || '未知错误'));
    }
  }

  // ---------- 数据评价 ----------
  const REVIEW_QUICK_TAGS = ['数据错误', '配置有误', '计算逻辑问题', '缺少信息', '数据正确', '实用'];
  const REVIEW_MAX_LEN = 500;
  let reviewModalEl = null;

  function reviewDraftKey(code) {
    return 'wavecalc-review-draft-' + String(code || '');
  }

  function loadReviewDraft(code) {
    try {
      const raw = localStorage.getItem(reviewDraftKey(code));
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && typeof d === 'object' ? d : null;
    } catch (_) {
      return null;
    }
  }

  function saveReviewDraft(code, content, tags) {
    try {
      localStorage.setItem(
        reviewDraftKey(code),
        JSON.stringify({ content: String(content || ''), tags: tags || [], t: Date.now() })
      );
    } catch (_) {}
  }

  function clearReviewDraft(code) {
    try {
      localStorage.removeItem(reviewDraftKey(code));
    } catch (_) {}
  }

  function showReviewToast(msg, tone) {
    let toast = document.querySelector('.pdb-review-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'pdb-review-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'pdb-review-toast is-show' + (tone === 'error' ? ' is-error' : '');
    clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      toast.classList.remove('is-show');
    }, 2400);
  }

  function closeReviewModal() {
    if (reviewModalEl) {
      reviewModalEl.remove();
      reviewModalEl = null;
    }
  }

  function openReviewModal(code) {
    const it = uiState.items.find((x) => x.share_code === code);
    if (!it) return;
    closeReviewModal();
    const loggedIn = !!(window.Cloud && typeof Cloud.getUser === 'function' && Cloud.getUser());
    const overlay = document.createElement('div');
    overlay.className = 'pdb-report-overlay';
    overlay.setAttribute('data-pdb-review-overlay', '');
    overlay._shareCode = code;
    const draft = loadReviewDraft(code) || { content: '', tags: [] };
    const draftTags = Array.isArray(draft.tags) ? draft.tags : [];
    overlay.innerHTML = `
      <div class="pdb-review-dialog">
        <div class="pdb-review-dialog-head">
          <div class="pdb-review-dialog-head-row">
            <strong>数据评价</strong>
            <button type="button" class="pdb-report-close" data-pdb-review-close aria-label="关闭">×</button>
          </div>
          <div class="pdb-review-dialog-target">《${esc(it._axisName || it.title || '未命名轴')}》</div>
        </div>
        <div class="pdb-review-body">
          <div class="pdb-review-guide">评价请聚焦<strong>数据准确性</strong>：先审查该方案的计算与配置，发现确实不对的地方，再给出客观评价与纠正建议。</div>
          <div class="pdb-review-composer">
            <div class="pdb-review-section-title">评价内容</div>
            <div class="pdb-review-textarea-wrap">
              <textarea data-pdb-review-content maxlength="${REVIEW_MAX_LEN}" placeholder="请描述你发现的数据问题或准确性评价...">${esc(draft.content || '')}</textarea>
              <span class="pdb-review-count">${String(draft.content || '').length}/${REVIEW_MAX_LEN}</span>
            </div>
            <div class="pdb-review-tags-title">快速标签（可选）</div>
            <div class="pdb-review-tags">
              ${REVIEW_QUICK_TAGS.map((t) => `<button type="button" class="pdb-review-tag${draftTags.includes(t) ? ' is-on' : ''}" data-review-tag="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
          </div>
          <div class="pdb-review-list-head">
            <span>全部评价</span>
            <span class="pdb-review-list-count" data-pdb-review-count>0条</span>
          </div>
          <div class="pdb-review-list" data-pdb-reviews-list><div class="ui-loading is-compact" aria-label="加载中"><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div></div>
        </div>
        <div class="pdb-review-actions">
          <span class="pdb-review-draft-hint">${draft.content ? '草稿已自动保存' : ''}</span>
          <div class="pdb-review-actions-right">
            <button type="button" class="pdb-review-btn-ghost" data-pdb-review-cancel>取消</button>
            <button type="button" class="pdb-review-btn-primary" data-pdb-review-submit${loggedIn ? '' : ' disabled'}>提交评价</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    reviewModalEl = overlay;

    const contentEl = overlay.querySelector('[data-pdb-review-content]');
    const submitBtn = overlay.querySelector('[data-pdb-review-submit]');
    const countEl = overlay.querySelector('.pdb-review-count');
    const draftHintEl = overlay.querySelector('.pdb-review-draft-hint');

    function syncDraftHint() {
      if (draftHintEl) draftHintEl.textContent = contentEl && contentEl.value.trim() ? '草稿已自动保存' : '';
    }
    function syncSubmit() {
      if (submitBtn) submitBtn.disabled = !loggedIn || !(contentEl && contentEl.value.trim());
    }
    function saveDraft() {
      const tags = Array.from(overlay.querySelectorAll('.pdb-review-tag.is-on')).map((b) => b.getAttribute('data-review-tag'));
      saveReviewDraft(code, contentEl ? contentEl.value : '', tags);
      syncDraftHint();
    }
    if (contentEl) {
      contentEl.addEventListener('input', () => {
        if (countEl) countEl.textContent = `${contentEl.value.length}/${REVIEW_MAX_LEN}`;
        saveDraft();
        syncSubmit();
      });
    }
    overlay.querySelectorAll('.pdb-review-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!loggedIn) return;
        btn.classList.toggle('is-on');
        saveDraft();
      });
    });

    if (!loggedIn) {
      const lock = document.createElement('div');
      lock.className = 'pdb-review-lock';
      lock.innerHTML =
        '<svg class="pdb-review-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' +
        '<div class="pdb-review-lock-text">登录后可撰写评价</div>' +
        '<div class="pdb-review-lock-btns">' +
          '<button type="button" class="pdb-review-lock-login" data-pdb-review-login>登录</button>' +
          '<button type="button" class="pdb-review-lock-register" data-pdb-review-register>注册</button>' +
        '</div>';
      overlay.querySelector('.pdb-review-composer').appendChild(lock);
      lock.querySelector('[data-pdb-review-login]').addEventListener('click', () => {
        if (window.WaveCalcAuth && typeof WaveCalcAuth.open === 'function') WaveCalcAuth.open({ origin: 'cloud' });
      });
      lock.querySelector('[data-pdb-review-register]').addEventListener('click', () => {
        if (window.WaveCalcAuth && typeof WaveCalcAuth.open === 'function') WaveCalcAuth.open({ origin: 'cloud' });
      });
    } else {
      syncSubmit();
    }
    void loadReviewsForDetail(code, overlay);
  }

  async function submitReview() {
    if (!reviewModalEl) return;
    const contentEl = reviewModalEl.querySelector('[data-pdb-review-content]');
    const content = contentEl ? contentEl.value.trim() : '';
    if (!content) {
      showReviewToast('请填写评价内容', 'error');
      return;
    }
    const tags = Array.from(reviewModalEl.querySelectorAll('.pdb-review-tag.is-on')).map((b) => b.getAttribute('data-review-tag'));
    const btn = reviewModalEl.querySelector('[data-pdb-review-submit]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '提交中…';
    }
    try {
      await Cloud.api('/schemes/' + encodeURIComponent(reviewModalEl._shareCode) + '/reviews', {
        method: 'POST',
        auth: true,
        body: { content, tags },
      });
      const code = reviewModalEl._shareCode;
      clearReviewDraft(code);
      if (contentEl) contentEl.value = '';
      reviewModalEl.querySelectorAll('.pdb-review-tag.is-on').forEach((b) => b.classList.remove('is-on'));
      const countEl = reviewModalEl.querySelector('.pdb-review-count');
      if (countEl) countEl.textContent = `0/${REVIEW_MAX_LEN}`;
      const draftHintEl = reviewModalEl.querySelector('.pdb-review-draft-hint');
      if (draftHintEl) draftHintEl.textContent = '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = '提交评价';
      }
      showReviewToast('评价已提交');
      // 刷新卡片评价计数与详情页列表（若打开）
      void loadReviewsForDetail(code, reviewModalEl);
      if (uiState.detailCode === code) void loadReviewsForDetail(code);
      if (typeof refreshReviewCounts === 'function') refreshReviewCounts();
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '提交评价';
      }
      showReviewToast('评价提交失败：' + (e.message || '未知错误'), 'error');
    }
  }

  /** 提交评价后轻量刷新公开库卡片上的评价计数（不重载整个列表） */
  function refreshReviewCounts() {
    if (!uiState.items || !uiState.items.length) return;
    uiState.items.forEach((it) => {
      const code = it.share_code;
      const card = document.querySelector(`.pdb-card[data-share="${CSS.escape(code)}"]`);
      if (!card) return;
      const countEl = card.querySelector('.pdb-card-btn.is-outline .review-count');
      if (countEl) {
        const n = (parseInt(countEl.textContent, 10) || 0) + 1;
        countEl.textContent = String(n);
        it._reviewCount = n;
      } else {
        it._reviewCount = (it._reviewCount || 0) + 1;
        const btn = card.querySelector('.pdb-card-btn.is-outline');
        if (btn) {
          const em = document.createElement('em');
          em.className = 'review-count';
          em.textContent = String(it._reviewCount);
          btn.appendChild(em);
        }
      }
    });
  }

  async function submitInlineReview() {
    const contentEl = document.querySelector('[data-pdb-review-content]');
    const content = contentEl ? contentEl.value.trim() : '';
    if (!window.Cloud || typeof Cloud.getUser !== 'function' || !Cloud.getUser()) {
      if (await DialogKit.confirm({ message: '写评价需要先登录，现在去登录吗？' })) {
        if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      }
      return;
    }
    if (!content) {
      window.alert('请填写评价内容');
      return;
    }
    const sendBtn = document.querySelector('[data-pdb-review-send]');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = '发送中…';
    }
    try {
      await Cloud.api('/schemes/' + encodeURIComponent(uiState.detailCode) + '/reviews', {
        method: 'POST',
        auth: true,
        body: { content },
      });
      if (contentEl) contentEl.value = '';
      window.alert('评价已提交，作者将收到通知');
      void loadReviewsForDetail(uiState.detailCode);
    } catch (e) {
      window.alert('评价提交失败：' + (e.message || '未知错误'));
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
      }
    }
  }

  function teamRosterDetailHtml(it) {
    const ids = Array.isArray(it._characterIds) ? it._characterIds : [];
    const names = Array.isArray(it._names) ? it._names : [];
    const avatars = [];
    const nameParts = [];
    for (let i = 0; i < 3; i++) {
      const id = ids[i] ? String(ids[i]) : '';
      const nameHint = names[i] || '';
      const def = id ? findCharDef(id) : null;
      const name = (def && def.name) || nameHint || `角色${i + 1}`;
      nameParts.push(name);
      let url = '';
      let remote = '';
      if (def && typeof window.getCharPortraitUrl === 'function') {
        url = getCharPortraitUrl(def) || '';
        if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
      }
      if (def && typeof window.getCharPortraitRemoteUrl === 'function') {
        remote = getCharPortraitRemoteUrl(def) || '';
        if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
      }
      const remoteAttr = remote && remote !== url ? ` data-remote="${esc(remote)}"` : '';
      const img = url
        ? `<img src="${esc(url)}" alt="" loading="lazy"${remoteAttr} onerror="typeof handlePortraitImgError==='function'&&handlePortraitImgError(this)" />`
        : '';
      const fb = `<span class="pdb-detail-avatar-fb"${url ? ' hidden' : ''}>${esc(String(name).trim().slice(0, 1) || '?')}</span>`;
      avatars.push(
        `<span class="pdb-detail-avatar" style="z-index:${i + 1}" title="${esc(name)}">${img}${fb}</span>`
      );
    }
    return `<div class="pdb-detail-roster">
      <div class="pdb-detail-avatars">${avatars.join('')}</div>
      <div class="pdb-detail-names">${esc(nameParts.join(' · '))}</div>
    </div>`;
  }

  function infoTagHtml(label, cls) {
    if (!label) return '<span class="pdb-detail-value">—</span>';
    if (cls) return `<span class="tag ${cls}">${esc(label)}</span>`;
    return `<span class="pdb-detail-value">${esc(label)}</span>`;
  }

  function renderDetailDialogHtml() {
    if (!uiState.detailCode) return '';
    const it = uiState.detailItem || uiState.items.find((x) => x.share_code === uiState.detailCode);
    if (!it) return '';
    const profile = it.profiles || {};
    const author = profile.display_name || '匿名';
    const authorId = profile.id || it.author_id || '';
    const authorAttrs = `data-pdb-author${authorId ? `="${esc(authorId)}"` : ''} data-pdb-share="${esc(it.share_code || '')}" title="查看发布者"`;
    const publishedAt = fmtDate(it.updated_at || it.approved_at || it.submitted_at);
    const axisKind = axisKindLabel(it._axisKind);
    const diff = it._difficulty;
    const perf = it._performance;
    const config = it._teamConfig || '—';
    const variant = pickDisplayVariant(it);
    const refUrl = extractRefVideoUrl(it);
    const safeRef = (() => {
      if (!refUrl) return '';
      if (typeof window.safeHttpUrl === 'function') return safeHttpUrl(refUrl) || '';
      try {
        const u = new URL(refUrl);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
      } catch (_) {
        return '';
      }
    })();
    const opts = uiState.detailImportOpts || { axis: true, build: true, buff: true };
    const variants = it._configVariants || [];
    const activeKey = variant ? variant.key : '';
    const showTotal = variant ? variant.teamTotal : it._teamTotal;
    const showDps = variant ? variant.teamDps : it._teamDps;
    const showDur = variant ? variant.axisDuration : it._axisDuration;
    const diffTag = infoTagHtml(diff, difficultyTagClass(diff));
    const perfTag = infoTagHtml(perf, performanceTagClass(perf));
    const shareCodeHtml = `<span class="pdb-detail-share"><code>${esc(it.share_code || '')}</code><button type="button" class="pdb-detail-copy" data-pdb-copy="${esc(it.share_code || '')}" title="复制分享码">复制</button></span>`;
    const refHtml = safeRef
      ? `<a class="pdb-detail-link" href="${esc(safeRef)}" target="_blank" rel="noopener noreferrer">打开参考视频</a>`
      : '<span class="pdb-detail-muted">未填写</span>';

    return `
        <header class="pdb-detail-head">
          <strong id="pdbDetailTitle" class="pdb-detail-title">轴详情</strong>
          <button type="button" class="pdb-detail-close" data-pdb-detail-close aria-label="关闭">×</button>
        </header>
        <div class="pdb-detail-scroll">
          <section class="pdb-overview">
            <div class="pdb-overview-stat">
              <strong class="pdb-overview-value">${fmtNum(showTotal)}</strong>
              <span class="pdb-overview-label">全队总伤</span>
            </div>
            <div class="pdb-overview-divider" aria-hidden="true"></div>
            <div class="pdb-overview-stat">
              <strong class="pdb-overview-value">${fmtDpsCompact(showDps)}</strong>
              <span class="pdb-overview-label">全队DPS</span>
            </div>
            <div class="pdb-overview-divider" aria-hidden="true"></div>
            <div class="pdb-overview-stat">
              <strong class="pdb-overview-value">${showDur ? esc(String(showDur)) + 's' : '—'}</strong>
              <span class="pdb-overview-label">轴时长</span>
            </div>
          </section>

          <section class="pdb-detail-cols">
            <div class="pdb-detail-info-col">
              <h4 class="pdb-detail-section-title">轴信息</h4>
              <div class="pdb-detail-kv">
                ${detailRowHtml('轴名称', esc(it._axisName || it.title || '未命名轴'))}
                ${it.description ? detailRowHtml('简介', `<div class="pdb-detail-desc">${esc(it.description)}</div>`) : ''}
                ${detailRowHtml('轴类型', esc(axisKind))}
                ${detailRowHtml('配置', esc(memberConfigLabel(it) || config))}
                ${detailRowHtml('轴难度', diffTag)}
                ${detailRowHtml('轴性能', perfTag)}
                ${String(it.summary?.entryType || '').trim() ? detailRowHtml('词条类型', `<span class="tag tag-entry">${esc(String(it.summary.entryType).trim())}</span>`) : ''}
                ${detailRowHtml('作者', `<button type="button" class="pdb-detail-author" ${authorAttrs}>${esc(author)}</button>`)}
                ${detailRowHtml('发布时间', esc(publishedAt || '—'))}
                ${detailRowHtml('分享码', shareCodeHtml)}
                ${detailRowHtml('参考视频', refHtml)}
              </div>
            </div>
            <div class="pdb-detail-team-col">
              <h4 class="pdb-detail-section-title">队伍配置</h4>
              ${renderTeamSlotsHtml(it, variant)}
            </div>
          </section>

          <section class="pdb-detail-variants">
            <div class="pdb-detail-variants-head">
              <h4 class="pdb-detail-section-title">配置变体</h4>
              <span class="pdb-detail-variants-count">共${variants.length}种配置</span>
            </div>
            <div class="pdb-variant-list">
              ${
                variants.length
                  ? variants
                      .map((v) => variantRowHtml(v, activeKey, it.share_code, diffTag, perfTag))
                      .join('')
                  : '<p class="pdb-detail-muted">暂无配置变体</p>'
              }
            </div>
          </section>

          <section class="pdb-detail-reviews" data-pdb-reviews-code="${esc(it.share_code)}">
            <div class="pdb-detail-reviews-head">
              <h4 class="pdb-detail-section-title">评价</h4>
              <span class="pdb-review-summary" data-pdb-review-summary>暂无评价</span>
            </div>
            <div class="pdb-review-composer">
              <input type="text" class="pdb-review-input" data-pdb-review-content placeholder="写下你的评价..." maxlength="500" />
              <button type="button" class="pdb-review-send" data-pdb-review-send>发送</button>
            </div>
            <div class="pdb-review-list" data-pdb-reviews-list>
              <div class="ui-loading is-compact" aria-label="加载中"><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>
            </div>
          </section>
        </div>
        <footer class="pdb-detail-actions">
          <button type="button" class="pdb-detail-btn primary" data-pdb-import="${esc(it.share_code)}">导入此方案</button>
          <button type="button" class="pdb-detail-btn ghost" data-pdb-detail-close>关闭</button>
        </footer>`;
  }

  function renderDetailModal() {
    if (!uiState.detailCode) return '';
    const body = renderDetailDialogHtml();
    if (!body) return '';
    const leaving = uiState.detailClosing ? ' is-leaving' : '';
    return `<div class="pdb-detail-overlay${leaving}" data-pdb-detail-overlay>
      <div class="pdb-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="pdbDetailTitle">${body}</div>
    </div>`;
  }

  // 详情数据到位后仅原地更新弹窗内容，避免整页重建导致的闪烁
  function patchDetailDialogInPlace() {
    const dialog = document.querySelector('.pdb-detail-dialog');
    if (!dialog) return;
    const reviews = dialog.querySelector('.pdb-detail-reviews');
    const html = renderDetailDialogHtml();
    if (html) {
      dialog.innerHTML = html;
      restoreDetailReviews(dialog, reviews);
    }
  }

  function detailRowHtml(label, valueHtml) {
    return `<div class="pdb-detail-row"><span class="pdb-detail-k">${esc(label)}</span><span class="pdb-detail-v">${valueHtml}</span></div>`;
  }

  function configKeyToChainLabel(key) {
    const m = String(key || '').match(/^(\d+)\+(\d+)$/);
    if (!m) return String(key || '—');
    return `${m[1]}链 · R${m[2]}`;
  }

  /** 副词条数值总和：按词条聚合各声骸副词条（类型增伤按伤害类型拆分） */
  function buildMemberSubstatSumText(member) {
    const config = (member && (member.config || member.echoConfig)) || null;
    if (!config || !Array.isArray(config.slots)) return '';
    const SUB_CAT_ORDER = [
      'sub_crit_rate',
      'sub_crit_dmg',
      'sub_atk_percent',
      'sub_flat_atk',
      'sub_type_dmg',
      'sub_energy_regen',
      'sub_hp_percent',
      'sub_flat_hp',
      'sub_def_percent',
      'sub_flat_def',
    ];
    const sums = {};
    const order = [];
    const seen = {};
    (config.slots || []).forEach((slot) => {
      (slot.subs || []).forEach((sub) => {
        const id = String(sub.id || '');
        const key = id === 'sub_type_dmg' ? 'type:' + String(sub.damageType || '') : id;
        if (!seen[key]) {
          seen[key] = true;
          order.push(key);
          sums[key] = { id, damageType: sub.damageType || '', total: 0 };
        }
        sums[key].total += Number(sub.value) || 0;
      });
    });
    const sorted = SUB_CAT_ORDER.filter((k) => seen[k]).concat(order.filter((k) => SUB_CAT_ORDER.indexOf(k) < 0));
    if (!sorted.length) return '';
    const parts = sorted.map((key) => {
      const s = sums[key];
      const def =
        typeof ECHO_SUB_AFFIXES !== 'undefined' && ECHO_SUB_AFFIXES[s.id]
          ? ECHO_SUB_AFFIXES[s.id]
          : null;
      const label =
        s.id === 'sub_type_dmg'
          ? (s.damageType || '类型') + '增伤'
          : def
            ? def.label
            : s.id;
      const isPct = !def || def.unit === 'percent';
      const val = Math.round((Number(s.total) || 0) * 10) / 10;
      return `${label} ${isPct ? val + '%' : val}`;
    });
    return parts.join(' · ');
  }

  function renderTeamSlotsHtml(it, variant) {
    const names = it._names || [];
    const ids = it._characterIds || [];
    const cfgKeys = variant
      ? variant.memberConfigs
      : (it._memberSlots || []).map((s) => s.key);
    const payloadMembers =
      (it.payload && (it.payload.data || it.payload).members) || [];
    return `<div class="pdb-team-slots">${[0, 1, 2]
      .map((i) => {
        const id = ids[i] ? String(ids[i]) : '';
        const name = names[i] || `角色${i + 1}`;
        const def = id ? findCharDef(id) : null;
        const cname = (def && def.name) || name;
        const cfg = configKeyToChainLabel(cfgKeys[i]);
        const { chain, refine } = parseSlotParts(cfgKeys[i]);
        let url = '';
        if (def && typeof window.getCharPortraitUrl === 'function') {
          url = getCharPortraitUrl(def) || '';
          if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
        }
        const img = url
          ? `<img src="${esc(url)}" alt="" loading="lazy" />`
          : `<span class="pdb-slot-fb">${esc(String(cname).trim().slice(0, 1) || '?')}</span>`;
        // 武器图：从方案数据取该角色使用的武器
        const pm = payloadMembers[i] || {};
        const weaponId = (pm.weaponSelection && pm.weaponSelection.id) || '';
        let wUrl = '';
        let wName = '';
        if (weaponId && typeof window.findWeaponDef === 'function') {
          const wdef = findWeaponDef(weaponId);
          if (wdef) {
            wName = wdef.name || '';
            if (typeof window.getWeaponDefIconUrl === 'function') {
              wUrl = getWeaponDefIconUrl(wdef);
            }
            if (typeof window.safeAssetUrl === 'function') wUrl = safeAssetUrl(wUrl);
          }
        }
        const weaponHtml = wUrl
          ? `<img src="${esc(wUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />`
          : `<span class="pdb-slot-fb">${esc(
              String(wName || (def && def.weapon) || '武')
                .trim()
                .slice(0, 1) || '武'
            )}</span>`;
        return `<div class="pdb-team-slot">
          <div class="pdb-slot-avatar-wrap" style="position:relative;display:inline-block;">
            <div class="pdb-slot-avatar">${img}</div>
            <span class="pdb-slot-badge" style="position:absolute;top:-4px;left:-4px;background:rgba(80,140,220,0.92);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;line-height:1.3;z-index:5;">${chain}链</span>
          </div>
          <div class="pdb-slot-weapon-wrap" style="position:relative;display:inline-block;margin-top:4px;">
            <div class="pdb-slot-weapon" style="width:40px;height:40px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;">${weaponHtml}</div>
            <span class="pdb-slot-badge" style="position:absolute;top:-4px;left:-4px;background:rgba(0,0,0,0.72);color:#8fd0ff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;line-height:1.3;z-index:5;">R${refine}</span>
          </div>
          <div class="pdb-slot-name">${esc(cname)}</div>
          <div class="pdb-slot-cfg">${esc(cfg)}</div>
          ${(() => {
            const subSum = buildMemberSubstatSumText(pm);
            return subSum ? `<div class="pdb-slot-subs">${esc(subSum)}</div>` : '';
          })()}
        </div>`;
      })
      .join('')}</div>`;
  }

  function variantRowHtml(v, activeKey, shareCode, diffTag, perfTag) {
    return `<div class="pdb-variant-row${activeKey && v.key === activeKey ? ' is-active' : ''}">
      <div class="pdb-variant-main">
        <div class="pdb-variant-top">
          <span class="pdb-variant-label">${esc(v.label || '配置')}</span>
          <span class="pdb-variant-cfg">${esc(v.memberConfigs.join(' · '))}</span>
        </div>
        <div class="pdb-variant-meta">${diffTag}${perfTag}</div>
      </div>
      <div class="pdb-variant-side">
        <span class="pdb-variant-dps">${fmtDpsCompact(v.teamDps)} <em>DPS</em></span>
        <button type="button" class="pdb-variant-import" data-pdb-import="${esc(shareCode)}" data-pdb-import-variant="${esc(v.key || '')}">导入</button>
      </div>
    </div>`;
  }

  function refreshIcons(root) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') return;
    try {
      lucide.createIcons({
        root: root || document.getElementById('publicDbPage') || document.body,
        attrs: { 'stroke-width': 1.75 },
      });
    } catch (_) {}
  }

  // 详情数据和列表分页都会重绘；保留同一方案的评价节点及进行中的请求。
  function restoreDetailReviews(host, reviews) {
    const next = host.querySelector('.pdb-detail-reviews');
    if (reviews && next && reviews.dataset.pdbReviewsCode === next.dataset.pdbReviewsCode) next.replaceWith(reviews);
  }

  function renderShell() {
    const page = document.getElementById('publicDbPage');
    if (!page) return;
    const reviews = page.querySelector('.pdb-detail-reviews');
    page.innerHTML = `
      <div class="pdb-shell">
        <header class="pdb-head">
          <div class="pdb-head-text">
            <h1 class="pdb-title">公开数据库</h1>
            <p class="pdb-lead">匿名可浏览/导入；上传需登录，审核通过后公开。</p>
          </div>
          <button type="button" class="pdb-back" data-pdb-back>← 返回计算器</button>
        </header>
        ${
          uiState.usingMock
            ? `<div class="pdb-mock-banner">本地测试模式 · 当前为模拟数据，无需后端 API。网页正式环境将自动连接真实公开库。</div>`
            : ''
        }
        ${
          (uiState.listNotice || uiState.loading)
            ? `<div class="pdb-mock-banner" role="status">${esc(uiState.listNotice || '正在加载公开库…')}${uiState.partialError ? '<button type="button" class="pdb-btn" data-pdb-refresh>重试加载</button>' : ''}</div>`
            : ''
        }

        ${renderCompactBar()}

        <section class="pdb-results" data-pdb-results>${renderList()}</section>
        ${renderDetailModal()}
      </div>`;
    restoreDetailReviews(page, reviews);
    refreshIcons(page);
    if (filterDraft) renderFilterDialog();
  }

  function refreshResultsOnly() {
    if (filterDraft) return;
    if (!shouldUseLocalMock()) { void loadItems(); return; }
    const host = document.querySelector('[data-pdb-results]');
    if (host) {
      host.innerHTML = renderList();
      refreshIcons(host);
    }
  }

  function buildMockPayload(entry) {
    const ids = entry.characterIds || [];
    const names = entry.names || [];
    const MOCK_WEAPON_IDS = ['21040056', '21030084', '21020044'];
    const members = [0, 1, 2].map((i) => {
      const base =
        typeof window.createMemberWithDefaults === 'function'
          ? createMemberWithDefaults(i)
          : { id: 'm' + i, name: names[i] || '角色' + (i + 1), characterId: null };
      const cid = ids[i] || null;
      const def = cid ? findCharDef(cid) : null;
      base.characterId = cid;
      base.name = (def && def.name) || names[i] || base.name;
      if (entry.memberConfigs && entry.memberConfigs[i]) {
        const m = String(entry.memberConfigs[i]).match(/^(\d+)\+(\d+)$/);
        if (m) {
          base.resonanceUnlocked = Number(m[1]) || 0;
          if (!base.weaponSelection) {
            base.weaponSelection = {
              id: MOCK_WEAPON_IDS[i % MOCK_WEAPON_IDS.length],
              refinement: 1,
            };
          }
          base.weaponSelection.id = MOCK_WEAPON_IDS[i % MOCK_WEAPON_IDS.length];
          base.weaponSelection.refinement = Number(m[2]) || 1;
        }
      }
      base.results = {
        total: Math.round((entry.teamTotal || 0) / Math.max(1, ids.length || 3)),
        phases: {},
        energyRegen: 0,
        dps: 0,
      };
      return base;
    });
    return {
      meta: {
        name: entry.axisName,
        author: entry.author || '本地测试',
        summary: {
          teamTotal: entry.teamTotal,
          teamDps: entry.teamDps,
          axisDuration: entry.axisDuration,
          axisKind: entry.axisKind,
          difficulty: entry.difficulty,
          performance: entry.performance,
          teamConfig: entry.teamConfig,
          memberConfigs: entry.memberConfigs,
          memberNames: names,
          characterIds: ids,
          axisName: entry.axisName,
        },
      },
      data: {
        version: 2,
        team: {
          axisDuration: entry.axisDuration || 20,
          monsterRes: 20,
          monsterLevel: 100,
          activeIndex: 0,
          viewMode: 'member',
        },
        members,
        exportCardDraft: {
          axisName: entry.axisName,
          axisLength: entry.axisDuration || 20,
          difficulty: entry.difficulty || '',
          performance: entry.performance || '',
          axisKind: entry.axisKind || 'global',
          shareCode: entry.share_code,
        },
        schemeDraft: { name: entry.axisName, author: entry.author || '本地测试' },
        refVideoUrl: entry.refVideoUrl || 'https://www.bilibili.com/',
      },
    };
  }

  function buildMockCatalog() {
    const chars = listCharacters();
    const pick = (n) => {
      if (!chars.length) return { ids: [], names: [] };
      const ids = [];
      const names = [];
      for (let i = 0; i < 3; i++) {
        const c = chars[(n + i * 5) % chars.length];
        ids.push(c.id);
        names.push(c.name);
      }
      return { ids, names };
    };

    const difficulties = ['最简单', '基础', '进阶适中', '吃手法', '椰果轴'];
    const performances = ['适应强', '较为通解', '适中看操作', '较挑环境', '坐牢打桩'];
    const configSets = [
      ['0+1', '0+1', '0+1'],
      ['0+1', '0+1', '0+1'],
      ['0+1', '0+1', '0+1'],
      ['2+1', '0+1', '0+1'],
      ['2+1', '0+1', '0+1'],
      ['6+5', '0+1', '0+1'],
      ['6+5', '0+1', '0+1'],
      ['3+1', '1+1', '0+1'],
      ['6+5', '6+5', '6+5'],
      ['4+1', '0+1', '0+1'],
    ];
    const authors = ['本地测试', '轴作者甲', '轴作者乙', '鸣潮玩家', '配队研究'];
    const list = [];

    for (let i = 0; i < 26; i++) {
      const team = pick(i);
      const axisKind = i % 3 === 0 ? 'loop' : 'global';
      const memberConfigs = configSets[i % configSets.length].slice();
      const teamConfig = memberConfigs.reduce((best, key) =>
        scoreConfig(key) > scoreConfig(best) ? key : best
      , '0+1');
      const teamTotal = 1800000 + i * 137000 + (axisKind === 'loop' ? 220000 : 0);
      const axisDuration = axisKind === 'loop' ? 12 + (i % 5) : 18 + (i % 8);
      const teamDps = Math.round(teamTotal / axisDuration);
      const axisName =
        (axisKind === 'loop' ? '循环轴样例' : '全局轴样例') +
        ' · ' +
        (team.names[0] || '角色') +
        (i + 1);
      const entry = {
        share_code: 'MOCK' + String(1000 + i),
        title: axisName,
        axisName,
        description: '本地测试数据，仅用于前端功能验证。',
        author: authors[i % authors.length],
        authorId: 'mock-author-' + (i % authors.length),
        axisKind,
        difficulty: difficulties[i % difficulties.length],
        performance: performances[i % performances.length],
        teamConfig,
        memberConfigs,
        characterIds: team.ids,
        names: team.names,
        teamTotal,
        teamDps,
        axisDuration,
        updated_at: new Date(Date.now() - i * 3600 * 1000 * 5).toISOString(),
        approved_at: new Date(Date.now() - i * 3600 * 1000 * 5).toISOString(),
      };
      const pkg = buildMockPayload(entry);
      list.push({
        id: 'mock-' + i,
        share_code: entry.share_code,
        title: entry.axisName,
        description: entry.description,
        tags: [entry.axisKind === 'loop' ? '循环轴' : '全局轴'],
        summary: pkg.meta.summary,
        payload: pkg,
        version: 1,
        fork_count: i % 4,
        updated_at: entry.updated_at,
        approved_at: entry.approved_at,
        author_id: entry.authorId,
        profiles: {
          id: entry.authorId,
          display_name: entry.author,
          avatar_data_url: '',
        },
        _mock: true,
      });
    }
    return list;
  }

  function loadMockItems() {
    uiState.usingMock = true;
    uiState.error = '';
    uiState.items = buildMockCatalog().map(enrichItem);
    uiState.page = 1;
  }

  const searchCacheMap = new Map(); // Full query -> { data, ts }, bounded to 30 pages
  let loadItemsGeneration = 0;

  function invalidateSearchCache() {
    searchCacheMap.clear();
  }



  let listController = null;
  let lastListView = null;
  const LIST_VIEW_FIELDS = [...FILTER_FIELDS, 'sort', 'page'];
  function listView() {
    return Object.fromEntries(LIST_VIEW_FIELDS.map(key => [key, Array.isArray(uiState[key]) ? uiState[key].slice() : uiState[key]]));
  }
  function listQuery(view) {
    return new URLSearchParams({page:view.page,pageSize:PAGE_SIZE,q:view.searchQ,zone:view.zone,kind:view.axisKind,sort:view.sort,configAll:view.configAll,configs:view.teamSlotConfigs.join(','),match:view.configMatch,characters:view.selectedCharIds.join(','),difficulty:view.difficulty,performance:view.performance}).toString();
  }
  async function fetchList(query, signal) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal.addEventListener('abort', cancel, {once:true});
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
      let status = 0;
      try {
        const response = await fetch('/api/public-schemes?' + query, {signal:controller.signal,cache:'no-store',credentials:'omit'});
        status = response.status;
        if (!response.ok) throw new Error('HTTP ' + status);
        // Timer covers both headers and the complete JSON body.
        const data = await response.json();
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.page) || data.page < 1 || data.pageSize !== PAGE_SIZE || data.items.length > PAGE_SIZE) {
          throw new Error('INVALID_RESPONSE');
        }
        return data;
      } catch (error) {
        if (signal.aborted) throw error;
        const retryable = timedOut || !status || error instanceof TypeError || [408,502,503,504].includes(status);
        if (attempt === 0 && retryable) {
          await new Promise(resolve => setTimeout(resolve, 400));
          continue;
        }
        const message = timedOut ? '公开库响应超时，请稍后重试' : status === 429 ? '访问较频繁，请稍后再试' : status >= 500 ? '公开库服务暂时繁忙，请稍后重试' : !status ? '网络连接中断，请检查网络后重试' : status >= 400 ? '公开库请求失败（' + status + '），请刷新页面后重试' : '公开库数据接收不完整，请重试';
        throw new Error(message);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      }
    }
  }

  async function loadItems(opts) {
    const generation = ++loadItemsGeneration;
    listController?.abort();
    listController = new AbortController();
    const signal = listController.signal;
    const view = listView();
    const query = listQuery(view);
    uiState.loading = true;
    uiState.error = '';
    uiState.partialError = false;
    uiState.listNotice = '';
    uiState.pendingListChange = !lastListView || query !== listQuery(lastListView);
    if (isOpen()) renderShell();
    if (shouldUseLocalMock()) {
      loadMockItems();
      uiState.remoteTotal = null;
      uiState.loading = false;
      uiState.pendingListChange = false;
      if (isOpen()) renderShell();
      return;
    }
    try {
      const cached = searchCacheMap.get(query);
      const data = !opts?.force && cached && Date.now()-cached.ts < 30000
        ? cached.data : await fetchList(query, signal);
      if (generation !== loadItemsGeneration) return;
      uiState.items = data.items.map(it => enrichItem(it, {keepPayload:false}));
      uiState.remoteTotal = data.total;
      uiState.page = data.page;
      uiState.usingMock = false;
      lastListView = {...view,page:data.page};
      if (data.stale) uiState.listNotice = '正在更新公开库，当前显示最近成功加载的数据。';
      // A stale server snapshot must be rechecked on the next visit.
      if (!data.stale) {
        searchCacheMap.set(query, {data,ts:Date.now()});
        if (searchCacheMap.size > 30) searchCacheMap.delete(searchCacheMap.keys().next().value);
      }
    } catch (error) {
      if (generation !== loadItemsGeneration) return;
      if (lastListView) {
        Object.assign(uiState, lastListView);
        uiState.partialError = true;
        uiState.listNotice = error.message + '；已保留上次结果，并恢复对应筛选条件。';
      } else uiState.error = error.message || '无法连接公开库';
    } finally {
      if (generation === loadItemsGeneration) {
        uiState.loading = false;
        uiState.pendingListChange = false;
        if (isOpen()) renderShell();
      }
    }
  }


  async function refreshLikedSchemes() {
    const user = window.Cloud && typeof Cloud.getUser === 'function' && Cloud.getUser();
    if (!user) {
      uiState.likedSchemeIds = new Set();
      return;
    }
    try {
      const result = await Cloud.api('/scheme-likes/me', { auth: true });
      uiState.likedSchemeIds = new Set(result.scheme_ids || []);
      if (isOpen()) renderShell();
    } catch (error) {
      console.warn('读取点赞状态失败：', error);
    }
  }

  async function toggleSchemeLike(button) {
    const user = window.Cloud && typeof Cloud.getUser === 'function' && Cloud.getUser();
    if (!user) {
      if (await DialogKit.confirm({ message: '点赞需要先登录，现在去登录吗？' })) {
        if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      }
      return;
    }
    if (button.disabled) return;
    const code = button.dataset.pdbLike;
    const item = uiState.items.find((x) => x.share_code === code);
    if (!item) return;
    const liked = uiState.likedSchemeIds.has(item.id);
    button.disabled = true;
    try {
      const result = await Cloud.api('/schemes/' + encodeURIComponent(code) + '/like', {
        method: liked ? 'DELETE' : 'POST', auth: true,
      });
      if (result.liked) uiState.likedSchemeIds.add(item.id);
      else uiState.likedSchemeIds.delete(item.id);
      const count = result.like_count == null
        ? Math.max(0, (Number(item.like_count) || 0) + (result.liked ? 1 : -1))
        : Math.max(0, Number(result.like_count) || 0);
      item.like_count = count;
      button.dataset.count = String(count);
      button.dataset.liked = String(!!result.liked);
      button.setAttribute('aria-pressed', String(!!result.liked));
      const countEl = button.querySelector('.pdb-pulse-heart__count');
      if (countEl) countEl.textContent = new Intl.NumberFormat().format(count);
      if (result.liked) {
        button.dataset.running = '';
        clearTimeout(button._pdbPulseTimer);
        button._pdbPulseTimer = window.setTimeout(() => {
          delete button.dataset.running;
        }, 560);
      }
      invalidateSearchCache();
    } catch (error) {
      showReviewToast('点赞未保存：' + (error?.message || '请稍后重试'));
    } finally {
      button.disabled = false;
    }
  }

  async function importShare(code, variantKey) {
    const W = window.__WC;
    const importGeneration = W.configWorkspaceOperation.generation;
    if (typeof window.parseSchemeImport !== 'function' || typeof window.importWorkspaceFromData !== 'function') {
      alert('导入函数未就绪');
      return;
    }
    const opts = uiState.detailImportOpts || { axis: true, build: true, buff: true };
    if (!opts.axis && !opts.build && !opts.buff) {
      alert('请至少勾选一项导入内容');
      return;
    }
    try {
      let detail = null;
      const local = uiState.items.find((x) => x.share_code === code);
      if (uiState.usingMock || (local && local._mock)) {
        if (!local || !local.payload) throw new Error('本地测试方案数据缺失');
        detail = {
          title: local.title,
          description: local.description,
          payload: local.payload,
        };
      } else {
        if (!window.Cloud || typeof Cloud.api !== 'function') {
          throw new Error('云端接口未就绪');
        }
        detail = await Cloud.api('/schemes/' + encodeURIComponent(code));
      }
      const payload = detail.payload;
      if (!payload) throw new Error('方案无数据');
      const parsed = parseSchemeImport(payload);
      if (parsed.type !== 'scheme') throw new Error('该方案不是完整工作区格式');
      // 变体行导入：先按所选档位改写 payload 里的链/精（memberConfigs 形如 ["0+1","0+1","0+1"]），
      // 再走统一导入，让链 Buff 重建/技能状态都按正常导入流程处理，避免「导入后再扫档」丢状态
      let variantLabel = '';
      if (variantKey && parsed.data && Array.isArray(parsed.data.members)) {
        const variants = Array.isArray(detail.summary && detail.summary.configVariants)
          ? detail.summary.configVariants
          : [];
        const v = variants.find((x) => String(x.key || '') === String(variantKey));
        if (v && Array.isArray(v.memberConfigs)) {
          variantLabel = v.label || v.key || '';
          (v.memberConfigs || []).slice(0, parsed.data.members.length).forEach((cfg, mi) => {
            const member = parsed.data.members[mi];
            if (!member) return;
            const mm = String(cfg || '').match(/^(\d+)\+(\d+)$/);
            if (!mm) return;
            member.resonanceUnlocked = Math.max(0, Math.min(6, Number(mm[1]) || 0));
            if (!member.weaponSelection) member.weaponSelection = {};
            member.weaponSelection.refinement = Math.max(1, Math.min(5, Number(mm[2]) || 1));
          });
        }
      }
      W.configWorkspaceOperation.assertGeneration(importGeneration);
      const me = Cloud.getUser?.();
      const authorId = detail?.profiles?.id;
      const importedShareCode = me && authorId && String(me.id) === String(authorId) ? String(code || '') : '';
      const imported = await W.importWorkspaceFromData(parsed.data,
        Object.assign({ name: detail.title, shareCode: importedShareCode }, detail.description ? { description: detail.description } : {}),
        { axis: !!opts.axis, build: !!opts.build, buff: !!opts.buff });
      if (imported?.ok === false) throw new Error(imported.message || '工作台正在切换，请重试导入');
      const importedIdentity = W.workspaceSchemeIdentity.capture();
      if (Array.isArray(state.exportConfigSnapshots)) {
        state.exportConfigSnapshots.forEach(row => { if (row && typeof row === 'object') row._staleImported = true; });
        W.scheduleSave();
      }
      // 仅在导入真正完成后计数；计数失败不回滚已成功导入的工作区。
      let countSyncFailed = false;
      if (!uiState.usingMock) {
        try {
          const counted = await Cloud.api('/schemes/' + encodeURIComponent(code) + '/apply', {
            method: 'POST',
          });
          const item = uiState.items.find((x) => x.share_code === code);
          if (item && counted.fork_count != null && Number.isFinite(Number(counted.fork_count))) {
            item.fork_count = Number(counted.fork_count);
          }
          invalidateSearchCache();
        } catch (countError) {
          countSyncFailed = true;
          console.warn('应用次数登记失败：', countError);
        }
      }
      W.workspaceSchemeIdentity.assertCurrent(importedIdentity);
      uiState.detailCode = '';
      uiState.detailClosing = false;
      setOpen(false);
      // render 已由 importWorkspaceFromData.finally 完成，此处不再抢跑
      alert(
        (uiState.usingMock ? '【本地测试】' : '') +
          '已导入「' +
          (detail.title || code) +
          '」' +
          (variantLabel ? '（' + variantLabel + '）' : '') +
          '到工作区' +
          (countSyncFailed ? '（应用次数登记失败，方案导入已完成）' : '')
      );
    } catch (err) {
      if (err?.code === 'CFG_OPERATION_CANCELLED' || err?.code === 'SCHEME_IDENTITY_CHANGED') return;
      alert('导入失败：' + (err?.message || '未知错误'));
    }
  }

  /** ③ 出图：临时装载方案 → 词条Δ/贡献 + 评分250 重算 → 渲染卡面 → 导出PNG → 干净还原工作区（不污染） */
  /** ③ 出图：装载方案 → 打开卡面制作弹层（立绘上传/裁剪 + 实时预览 + 导出PNG）→ 关闭时干净还原工作区（不污染） */
  /** 多数据方案：出图前让用户选定一档。resolve(variant) 选中；resolve(undefined) 取消。 */
  function chooseExportVariant(variants, heading, explanation) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'pdb-export-variant-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#15181d;border:1px solid #2a2f38;border-radius:14px;padding:22px 26px;width:min(520px,calc(100vw - 32px));box-sizing:border-box;box-shadow:0 8px 30px rgba(0,0,0,.5);';
      const title = document.createElement('div');
      title.textContent = heading || '该方案有多份数据，选择要出图的一档';
      title.style.cssText = 'color:#e8e9ea;font-weight:700;font-size:15px;margin-bottom:14px;';
      box.appendChild(title);
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto;';
      variants.forEach((v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const label = (v.label || v.key || ('档' + (i + 1)));
        // 不显示存储的 teamDps（那是方案存档快照，可能与出图时引擎重算有偏差，展示会误导）。
        b.textContent = label;
        b.style.cssText = 'background:#1d2229;border:1px solid #2a2f38;color:#f5f6f7;padding:9px 12px;border-radius:9px;text-align:left;cursor:pointer;font-size:13px;';
        b.onmouseenter = () => { b.style.border = '1px solid #f5c600'; };
        b.onmouseleave = () => { b.style.border = '1px solid #2a2f38'; };
        b.onclick = () => { ov.remove(); resolve(v); };
        list.appendChild(b);
      });
      box.appendChild(list);
      const hint = document.createElement('div');
      hint.textContent = explanation || 'DPS 以出图后引擎真实结算为准（选档标签不显示存档值）。';
      hint.style.cssText = 'color:#8a919a;font-size:12px;margin-top:10px;';
      box.appendChild(hint);
      const foot = document.createElement('div');
      foot.style.cssText = 'margin-top:14px;text-align:right;';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = '取消';
      cancel.style.cssText = 'background:transparent;border:1px solid #444b55;color:#aab1b8;padding:7px 14px;border-radius:9px;cursor:pointer;';
      cancel.onclick = () => { ov.remove(); resolve(undefined); };
      foot.appendChild(cancel);
      box.appendChild(foot);
      ov.appendChild(box);
      ov.addEventListener('click', (e) => { if (e.target === ov) { ov.remove(); resolve(undefined); } });
      document.body.appendChild(ov);
    });
  }

  function openSingleCardPreparation() {
    const W = window.__WC;
    if (!W.CharacterCard || !W.openPersonalEchoProfilePicker) throw new Error('单角色卡片接口未就绪，请刷新后重试');
    const overlay = document.createElement('div');
    overlay.id = 'exportCardMakerOverlay';
    overlay.className = 'export-card-maker-overlay';
    overlay.innerHTML = '<div class="export-card-maker-dialog" role="dialog" aria-modal="true" aria-label="单角色卡片制作" style="max-width:720px"><div class="export-card-maker-head"><h3>制作单角色卡片</h3><button type="button" class="btn" data-single-close>关闭</button></div><div class="export-card-maker-body"><p>默认使用所选配置自带的声骸。也可点击对应角色，复用已保存声骸方案或库街区导入。</p><div class="export-card-maker-echobar" data-single-echo-options></div><p role="status" data-single-status>准备就绪；进入卡片页面后选择角色并开始计算。</p></div><div class="export-card-maker-foot"><button type="button" class="btn export-btn-primary" data-single-create>使用当前声骸制作单角色卡片 ↗</button></div></div>';
    const status = overlay.querySelector('[data-single-status]');
    const options = overlay.querySelector('[data-single-echo-options]');
    options.style.cssText = 'display:grid;gap:12px;padding:14px';
    W.state.members.forEach((member, index) => {
      if (!member.characterId) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn sm'; button.dataset.singleEchoMember = String(index);
      button.textContent = member.name + ' · 导入我的声骸';
      button.addEventListener('click', () => W.openPersonalEchoProfilePicker(member, () => {
        W.CardIdentity?.usePersonal();
        if (overlay.isConnected) status.textContent = '已应用「' + member.name + '」的声骸；进入卡片页面后重新计算。';
      }));
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
      button.style.cssText = 'min-height:40px;font-size:13px';
      row.appendChild(button);
      const kuro = document.createElement('button');
      kuro.type = 'button'; kuro.className = 'btn sm'; kuro.textContent = member.name + ' · 库街区';
      kuro.addEventListener('click', () => W.EchoImport.open({
        title: '导入「' + member.name + '」的声骸', autoMatchCharacterId: member.characterId,
        onApply: config => {
          if (!overlay.isConnected || !W.state.members.includes(member)) return;
          if (W.applyPersonalEchoProfile(member, {id:'kuro',chars:[{echoConfig:config}]})) {
            W.CardIdentity?.usePersonal();
            W.handleEchoFieldChange(member);
            status.textContent = '已应用「' + member.name + '」的库街区声骸。';
          }
        }
      }));
      kuro.style.cssText = 'min-height:40px;font-size:13px';
      row.appendChild(kuro);options.appendChild(row);
    });
    let child = null, timer = null, closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      if (child && !child.closed) child.close();
      W.CharacterCard.cancel();
      status.textContent = '正在结束计算并还原原工作区…';
      overlay.querySelectorAll('button').forEach(button => { button.disabled = true; });
      while (W.CharacterCard.isBusy()) await new Promise(resolve => setTimeout(resolve, 100));
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.up2-picker-overlay') && !document.querySelector('[data-eki-root]')) void close(); };
    overlay.querySelector('[data-single-close]').addEventListener('click', () => { void close(); });
    overlay.querySelector('[data-single-create]').addEventListener('click', () => {
      if (child && !child.closed) { child.focus(); return; }
      child = window.open('character-card.html', '_blank');
      if (!child) { status.textContent = '浏览器拦截了新窗口，请允许弹出窗口后重试。'; return; }
      options.querySelectorAll('button').forEach(button => { button.disabled = true; });
      status.textContent = '单角色卡片已打开。关闭卡片后会自动还原原工作区。';
      timer = setInterval(() => { if (child.closed) void close(); }, 400);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  async function exportSchemeCard(code, btn) {
    if (!code) return;
    if (typeof window.parseSchemeImport !== 'function' || typeof window.importWorkspaceFromData !== 'function') {
      alert('出图功能未就绪（解析/装载函数缺失）');
      return;
    }
    if (typeof window.openExportCardMakerModal !== 'function') {
      alert('出图功能未就绪（卡面制作弹层缺失）');
      return;
    }
    if (!window.Cloud || typeof Cloud.api !== 'function') {
      alert('云端接口未就绪');
      return;
    }

    // 按钮反馈（装载完成后弹层接管，恢复按钮）
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }

    // 工作区快照（还原用）+ 卡面美术快照（方案不带上传立绘，弹层里可上传/裁剪）
    const attributionSnap = window.__WC.cardExportAttribution;
    const artSnap = Array.isArray(state.exportCardMakerArt) ? state.exportCardMakerArt.slice() : null;
    let snap = null;
    try { if (typeof window.captureWorkspaceData === 'function') snap = captureWorkspaceData(); } catch (e) { snap = null; }

    // 干净还原：还原工作区 + 清方案留下的词条/评分内存缓存 + 还原美术
    const restore = () => {
      setTimeout(() => {
        window.__WC.cardExportAttribution = attributionSnap;
        if (snap) {
          try {
            const snapName = (snap.schemeDraft && snap.schemeDraft.name) || '工作区';
            void importWorkspaceFromData(snap, { name: snapName }, { axis: true, build: true, buff: true });
          } catch (e) { console.error('还原工作区失败：', e); }
        }
        try { state.exportEchoAffixGainCache = new Map(); } catch (e) { /* noop */ }
        try { state.fullBaselineCache = new Map(); } catch (e) { /* noop */ }
        if (artSnap) { try { state.exportCardMakerArt = artSnap; } catch (e) { /* noop */ } }
        state._exportCalcAborted = false;
        if (btn) { btn.disabled = false; btn.textContent = prevBtnText; }
      }, 200); // 稍等词条/评分影子结算（弹层关闭时 set _exportCalcAborted）彻底让出，避免与还原抢 state
    };

    try {
      // 1) 拉方案数据
      const detail = await Cloud.api('/schemes/' + encodeURIComponent(code));
      const payload = detail && detail.payload;
      if (!payload) throw new Error('方案无数据');
      const parsed = parseSchemeImport(payload);
      if (parsed.type !== 'scheme' || !parsed.data) throw new Error('该方案不是完整工作区格式');

      // 2.5) 多数据方案：出图前先让用户选定要出图哪一档（configVariants 含 0+1..5+1 等档位）
      let configVariants = [];
      try {
        configVariants = (payload.meta && payload.meta.summary && payload.meta.summary.configVariants)
          || (detail.summary && detail.summary.configVariants)
          || [];
      } catch (e) { configVariants = []; }
      if (configVariants && configVariants.length > 1) {
        const picked = await chooseExportVariant(configVariants);
        if (picked === undefined) { restore(); return; }   // 用户取消
        if (picked && parsed.data && Array.isArray(parsed.data.members)) {
          // 复用方案导入的改档逻辑：memberConfigs "C+R" → 链 + 武器精炼
          (picked.memberConfigs || []).slice(0, parsed.data.members.length).forEach((cfg, mi) => {
            const member = parsed.data.members[mi];
            if (!member) return;
            const mm = String(cfg || '').match(/^(\d+)\+(\d+)$/);
            if (!mm) return;
            member.resonanceUnlocked = Math.max(0, Math.min(6, Number(mm[1]) || 0));
            if (!member.weaponSelection) member.weaponSelection = {};
            member.weaponSelection.refinement = Math.max(1, Math.min(5, Number(mm[2]) || 1));
          });
        }
      }

      const cardType = await chooseExportVariant(
        [{key:'team',label:'全队卡片'},{key:'single',label:'单角色卡片 · 新功能'}],
        '选择出图类型', '两种卡片都可使用默认声骸，或通过现有入口导入自己的声骸。'
      );
      if (!cardType) { if (btn) { btn.disabled = false; btn.textContent = prevBtnText; } return; }

      // 2) 装载方案到工作区（shareCode: code 让制作弹层门禁通过 + 卡片顶部显示方案码）
      await importWorkspaceFromData(
        parsed.data,
        Object.assign(
          { name: detail.title || code, shareCode: code },
          detail.description ? { description: detail.description } : {}
        ),
        { axis: true, build: true, buff: true }
      );

      // 3) 方案不带上传立绘 → 先清为占位；门禁兜底：强制分享码为方案码，确保制作弹层能打开
      state.exportCardMakerArt = ['', '', ''];
      if (!state.exportCardDraft) state.exportCardDraft = {};
      state.exportCardDraft.shareCode = code;
      const listed = uiState.items.find(item => item.share_code === code);
      const summary = Object.assign({}, listed?.summary || {}, payload.meta?.summary || {}, detail.summary || {});
      const draft = parsed.data.exportCardDraft || {};
      state.exportCardDraft.axisName = summary.axisName || draft.axisName || detail.title || parsed.data.schemeDraft?.name || code;
      state.exportCardDraft.axisKind = deriveAxisKind({summary, tags:detail.tags || listed?.tags}) || normalizeKind(draft.axisKind) || '';
      const author = detail.profiles || listed?.profiles || {};
      window.__WC.cardExportAttribution = { personal:false, author:{
        name:author.display_name || author.nickname || author.name || String(detail.author_id || listed?.author_id || '原作者未署名'),
        avatar:author.avatar_data_url || author.avatar_url || '', uid:author.game_uid || author.kuro_uid || ''
      }};


      // 4) 打开卡面制作弹层（内部自会后台预热词条Δ/评分 + 上传裁剪立绘 + 导出PNG）
      if (cardType.key === 'single') openSingleCardPreparation();
      else openExportCardMakerModal();
      if (btn) { btn.disabled = false; btn.textContent = prevBtnText; }

      // 5) 监听弹层关闭（导出后点关闭 / 中途关闭）→ 还原工作区，避免污染
      if (document.getElementById('exportCardMakerOverlay')) {
        const obs = new MutationObserver(() => {
          if (!document.getElementById('exportCardMakerOverlay')) {
            obs.disconnect();
            restore();
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        restore(); // 弹层未打开（如门禁失败），立即还原
      }
    } catch (err) {
      console.error('公开库出图失败：', err);
      alert('出图失败：' + (err?.message || '未知错误'));
      restore();
    }
  }

  function copyShare(code) {
    const text = String(code || '');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => alert('已复制分享码：' + text),
          () => alert(text)
        );
      } else {
        alert(text);
      }
    } catch (_) {
      alert(text);
    }
  }

  function toggleChar(id) {
    const cid = String(id || '');
    if (!cid) return;
    const idx = filterValues().selectedCharIds.indexOf(cid);
    if (idx >= 0) filterValues().selectedCharIds.splice(idx, 1);
    else if (filterValues().selectedCharIds.length < 3) filterValues().selectedCharIds.push(cid);
    else return;
    filterValues().page = 1;
    syncCharSearchSelection();
    refreshResultsOnly();
  }

  function clearTeamSlotConfigs() {
    filterValues().configAll = false;
    filterValues().zone = 'all';
    filterValues().teamSlotConfigs = [DEFAULT_CONFIG, DEFAULT_CONFIG, DEFAULT_CONFIG];
    filterValues().page = 1;
    syncTeamConfigFilterPanel();
    refreshResultsOnly();
  }

  function applyTeamPreset(raw) {
    filterValues().configAll = false;
    filterValues().zone = 'all';
    const parts = String(raw || '')
      .split('|')
      .map((k) => normalizeFilterConfigKey(k) || DEFAULT_CONFIG);
    while (parts.length < 3) parts.push(DEFAULT_CONFIG);
    filterValues().teamSlotConfigs = parts.slice(0, 3);
    filterValues().configMatch = 'eq';
    filterValues().page = 1;
    syncTeamConfigFilterPanel();
    refreshResultsOnly();
  }

  function setCharElementPanel(key) {
    const next = String(key || '');
    filterValues().charElementPanel = filterValues().charElementPanel === next ? '' : next;
    renderFilterDialog();
  }

  function gotoExport() {
    setOpen(false);
    if (typeof window.setWorkspacePhase === 'function') setWorkspacePhase('export');
  }

  function runSearch() {
    if (filterDraft) { closeFilterDialog(true); return; }
    const input = document.querySelector('[data-pdb-search]');
    const q = input ? input.value.trim() : '';
    uiState.searchQ = q;
    uiState.page = 1;
    console.log('[pdb-search] runSearch q=' + q);
    void loadItems();
  }

  function bind() {
    document.addEventListener('input', (e) => {
      if (filterDraft && e.target.matches('[data-pdb-search]')) filterDraft.searchQ = e.target.value;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-pdb-search]')) {
        runSearch();
        return;
      }
      if (e.key !== 'Escape') return;
      if (filterDraft) { e.preventDefault(); closeFilterDialog(false); return; }
      if (uiState.detailCode) {
        e.preventDefault();
        closeDetailModal(true);
        return;
      }
      if (reportOverlayEl) {
        e.preventDefault();
        closeReportModal();
      }
    });

    document.body.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav-public-db]');
      if (nav) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        return;
      }

      if (e.target.closest('[data-pdb-detail-overlay]') && e.target.hasAttribute('data-pdb-detail-overlay')) {
        closeDetailModal(true);
        return;
      }
      if (e.target.closest('[data-pdb-detail-close]')) {
        closeDetailModal(true);
        return;
      }
      if (reportOverlayEl) {
        if (e.target.hasAttribute('data-pdb-report-overlay')) {
          closeReportModal();
          return;
        }
        if (e.target.closest('[data-pdb-report-close]') || e.target.closest('[data-pdb-report-cancel]')) {
          closeReportModal();
          return;
        }
        const reportSubmit = e.target.closest('[data-pdb-report-submit]');
        if (reportSubmit) {
          void submitReport();
          return;
        }
      }
      if (reviewModalEl) {
        if (e.target.hasAttribute('data-pdb-review-overlay')) {
          closeReviewModal();
          return;
        }
        if (e.target.closest('[data-pdb-review-close]') || e.target.closest('[data-pdb-review-cancel]')) {
          closeReviewModal();
          return;
        }
        const reviewSubmit = e.target.closest('[data-pdb-review-submit]');
        if (reviewSubmit) {
          void submitReview();
          return;
        }
      }

      if (!isOpen()) return;

      if (e.target.closest('[data-pdb-back]')) {
        setOpen(false);
        return;
      }
      if (e.target.closest('[data-pdb-filter-open]')) { openFilterDialog(); return; }
      if (e.target.closest('[data-pdb-filter-cancel]')) { closeFilterDialog(false); return; }
      if (e.target.closest('[data-pdb-filter-reset]')) { resetFilterValues(filterDraft); renderFilterDialog(); return; }
      if (e.target.closest('[data-pdb-filter-clear]')) {
        resetFilterValues(uiState); uiState.page = 1;
        void loadItems(); return;
      }
      const zoneBtn = e.target.closest('[data-pdb-zone]');
      if (zoneBtn) {
        const zone = zoneBtn.dataset.pdbZone;
        if (!CONFIG_ZONES.some((z) => z.key === zone)) return;
        if (zone === 'template') {
          uiState.axisKind = 'template';
          uiState.zone = 'all';
        } else {
          if (uiState.axisKind === 'template') uiState.axisKind = 'all';
          uiState.zone = zone;
        }
        uiState.configAll = true; uiState.page = 1;
        void loadItems(); document.querySelector('[data-pdb-zone="' + zone + '"]')?.focus(); return;
      }
      const kindBtn = e.target.closest('[data-pdb-kind]');
      if (kindBtn) {
        const k = kindBtn.dataset.pdbKind;
        filterValues().axisKind = k === 'loop' || k === 'global' || k === 'all' || k === 'template' ? k : 'all';
        if (k === 'template') { filterValues().zone = 'all'; filterValues().configAll = true; }
        filterValues().page = 1;
        renderFilterDialog();
        return;
      }
      const searchGo = e.target.closest('[data-pdb-search-go]');
      if (searchGo) {
        runSearch();
        return;
      }
      const searchClear = e.target.closest('[data-pdb-search-clear]');
      if (searchClear) {
        filterValues().searchQ = '';
        filterValues().page = 1;
        const input = document.querySelector('[data-pdb-search]');
        if (input) input.value = '';
        void loadItems();
        return;
      }
      if (e.target.closest('[data-pdb-el-tile]')) {
        const tile = e.target.closest('[data-pdb-el-tile]');
        setCharElementPanel(tile.dataset.pdbElTile);
        return;
      }
      if (e.target.closest('[data-pdb-el-panel-close]')) {
        filterValues().charElementPanel = '';
        renderFilterDialog();
        return;
      }
      const toggleCharBtn = e.target.closest('[data-pdb-char-toggle]');
      if (toggleCharBtn && !toggleCharBtn.disabled) {
        toggleChar(toggleCharBtn.dataset.pdbCharToggle);
        return;
      }
      const removeChar = e.target.closest('[data-pdb-char-remove]');
      if (removeChar) {
        toggleChar(removeChar.dataset.pdbCharRemove);
        return;
      }
      if (e.target.closest('[data-pdb-refresh]') || e.target.closest('[data-pdb-retry]')) {
        invalidateSearchCache();
        void loadItems({ force: true });
        return;
      }
      const presetBtn = e.target.closest('[data-pdb-team-preset]');
      if (presetBtn) {
        applyTeamPreset(presetBtn.getAttribute('data-pdb-team-preset') || '');
        return;
      }
      if (e.target.closest('[data-pdb-team-all-config]')) {
        filterValues().configAll = true;
        filterValues().page = 1;
        syncTeamConfigFilterPanel();
        refreshResultsOnly();
        return;
      }
      if (e.target.closest('[data-pdb-cr-clear]')) {
        clearTeamSlotConfigs();
        return;
      }
      if (e.target.closest('[data-pdb-goto-export]')) {
        gotoExport();
        return;
      }
      const pageBtn = e.target.closest('[data-pdb-page]');
      if (pageBtn && !pageBtn.disabled) {
        const p = Number(pageBtn.dataset.pdbPage) || 1;
        uiState.page = p;
        refreshResultsOnly();
        return;
      }
      const likeBtn = e.target.closest('[data-pdb-like]');
      if (likeBtn) {
        void toggleSchemeLike(likeBtn);
        return;
      }
      const exportCardBtn = e.target.closest('[data-pdb-export-card]');
      if (exportCardBtn) {
        void exportSchemeCard(exportCardBtn.dataset.pdbExportCard || '', exportCardBtn);
        return;
      }
      const detailBtn = e.target.closest('[data-pdb-detail]');
      if (detailBtn) {
        openDetailModal(detailBtn.dataset.pdbDetail || '');
        return;
      }
      const reviewOpenBtn = e.target.closest('[data-pdb-review-open]');
      if (reviewOpenBtn) {
        openReviewModal(reviewOpenBtn.dataset.pdbReviewOpen || '');
        return;
      }
      const reviewSend = e.target.closest('[data-pdb-review-send]');
      if (reviewSend) {
        void submitInlineReview();
        return;
      }
      const reportBtn = e.target.closest('[data-pdb-report]');
      if (reportBtn) {
        openReportModal(reportBtn.dataset.pdbReport || '');
        return;
      }
      const reviewReport = e.target.closest('[data-pdb-review-report]');
      if (reviewReport) {
        openReportModal(reviewReport.dataset.pdbReviewScheme || '', {
          targetType: 'review',
          targetId: reviewReport.dataset.pdbReviewReport,
          title: reviewReport.dataset.pdbReviewPreview || '',
        });
        return;
      }
      const writeReviewBtn = e.target.closest('[data-pdb-write-review]');
      if (writeReviewBtn) {
        openReviewModal(uiState.detailCode || '');
        return;
      }
      const authorEl = e.target.closest('[data-pdb-author]');
      if (authorEl) {
        e.preventDefault();
        const share = authorEl.getAttribute('data-pdb-share') || '';
        const authorId = authorEl.getAttribute('data-pdb-author') || '';
        const it = uiState.items.find((x) => x.share_code === share);
        const profile = Object.assign({}, (it && it.profiles) || {}, authorId ? { id: authorId } : {});
        if (!profile.display_name && it && it.profiles) {
          profile.display_name = it.profiles.display_name;
        }
        openPublisherHome(profile, share);
        return;
      }
      const importBtn = e.target.closest('[data-pdb-import]');
      if (importBtn) {
        void importShare(importBtn.dataset.pdbImport, importBtn.dataset.pdbImportVariant || '');
        return;
      }
      const copyBtn = e.target.closest('[data-pdb-copy]');
      if (copyBtn) {
        copyShare(copyBtn.dataset.pdbCopy);
        return;
      }
      // 点击面板外部关闭属性角色面板（保留已选）
      if (
        filterValues().charElementPanel &&
        !e.target.closest('[data-pdb-el-panel]') &&
        !e.target.closest('[data-pdb-el-tile]')
      ) {
        filterValues().charElementPanel = '';
        renderFilterDialog();
      }
    });

    document.body.addEventListener('change', (e) => {
      if (!isOpen()) return;
      const chainSel = e.target.closest('[data-pdb-team-chain-select]');
      if (chainSel) {
        const idx = Number(chainSel.getAttribute('data-pdb-team-slot-i'));
        const n = Number(chainSel.value);
        if (idx >= 0 && idx <= 2 && Number.isFinite(n)) {
          setTeamSlotParts(idx, n, null);
          filterValues().page = 1;
          syncTeamConfigFilterPanel();
          refreshResultsOnly();
        }
        return;
      }
      const refineSel = e.target.closest('[data-pdb-team-refine-select]');
      if (refineSel) {
        const idx = Number(refineSel.getAttribute('data-pdb-team-slot-i'));
        const n = Number(refineSel.value);
        if (idx >= 0 && idx <= 2 && Number.isFinite(n)) {
          setTeamSlotParts(idx, null, n);
          filterValues().page = 1;
          syncTeamConfigFilterPanel();
          refreshResultsOnly();
        }
        return;
      }
      const crMode = e.target.closest('[data-pdb-cr-mode]');
      if (crMode) {
        const v = crMode.value;
        filterValues().configAll = false;
        filterValues().zone = 'all';
        filterValues().configMatch = v === 'lte' || v === 'gte' ? v : 'eq';
        filterValues().page = 1;
        refreshResultsOnly();
        return;
      }
      const difficulty = e.target.closest('[data-pdb-difficulty]');
      if (difficulty) {
        filterValues().difficulty = difficulty.value || '';
        filterValues().page = 1;
        refreshResultsOnly();
        return;
      }
      const performance = e.target.closest('[data-pdb-performance]');
      if (performance) {
        filterValues().performance = performance.value || '';
        filterValues().page = 1;
        refreshResultsOnly();
        return;
      }
      const sort = e.target.closest('[data-pdb-sort]');
      if (sort) {
        uiState.sort = sort.value || 'time';
        uiState.page = 1;
        refreshResultsOnly();
        return;
      }
      const importOpt = e.target.closest('[data-pdb-import-opt]');
      if (importOpt) {
        const key = importOpt.dataset.pdbImportOpt;
        if (key === 'axis' || key === 'build' || key === 'buff') {
          if (!uiState.detailImportOpts) resetDetailImportOpts();
          uiState.detailImportOpts[key] = !!importOpt.checked;
        }
      }
    });
  }

  bind();

  window.PublicDb = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    openDetail: (code) => {
      setOpen(true);
      openDetailModal(String(code || ''));
    },
    refresh: () => {
      invalidateSearchCache();
      if (isOpen()) void loadItems({ force: true });
    },
    invalidateCache: invalidateSearchCache,
    isOpen,
  };
})();

