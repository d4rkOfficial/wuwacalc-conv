/* 矩阵数据：工作区内页面（数据统计 / 我的上传）+ 上传数据弹窗 */
(function () {
  'use strict';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '-';
    return String(Math.round(v));
  }

  function fmtTime(s) {
    if (!s) return '';
    try {
      return new Date(s).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return String(s);
    }
  }

  function isOpen() {
    return document.body.classList.contains('matrix-open');
  }

  var echoProfiles = [];
  var charPickerState = {
    slots: ['', '', ''],
    elementPanel: '',
  };
  var echoConfigs = {};
  var memberWeapons = {};
  var filterState = {
    teamSlots: ['', '', ''],
    charSlots: ['', '', ''],
    elementPanel: '',
    buffType: '',
  };

  var MATRIX_ELEMENT_COLORS = {
    1: '#6ec8f0',
    2: '#e87040',
    3: '#b07cff',
    4: '#4ecf8a',
    5: '#e8c547',
    6: '#e06090',
    all: '#a8b0bc',
  };
  var MATRIX_ELEMENT_ORDER = [1, 2, 3, 4, 5, 6];

  var MATRIX_BOSSES = [
    '矩阵集群',
    '哀声鸷',
    '芙露德莉斯',
    '炉芯机骸',
    '矩阵奇藏',
  ];

  var MATRIX_BOSS_IMAGES = {
    '矩阵集群': 'assets/matrix/boss/boss-juzhenjiqun.webp',
    '哀声鸷': 'assets/matrix/boss/boss-aishengzhi.webp',
    '芙露德莉斯': 'assets/matrix/boss/boss-fuludelisi.webp',
    '炉芯机骸': 'assets/matrix/boss/boss-luxinjihe.webp',
    '矩阵奇藏': 'assets/matrix/boss/boss-juzhenqicang.webp',
  };

  var MATRIX_BUFF_TYPES = ['通用强化', '异常效应强化', '声骸技能强化', '谐度破坏强化'];
  var MATRIX_BUFF_META = {
    '通用强化': {
      icon: 'assets/icons/buff/buff-general.png',
      desc: '敌人受到伤害最终提升20%，敌人受到共鸣技能伤害最终提升20%',
    },
    '异常效应强化': {
      icon: 'assets/icons/buff/buff-abnormal.png',
      desc: '角色附加异常效应时，使目标受到伤害最终提升25%，持续30秒。角色附加虚湮效应时，自身造成伤害最终提升30%，持续15秒。',
    },
    '声骸技能强化': {
      icon: 'assets/icons/buff/buff-harmony.png',
      desc: '我方声骸技能伤害最终提升30%，热熔伤害最终提升20%，重击伤害最终提升20%',
    },
    '谐度破坏强化': {
      icon: 'assets/icons/buff/buff-echo.png',
      desc: '角色震谐伤害最终提升150%。角色附加谐度·偏移状态时，伤害最终提升25%，持续30秒。',
    },
  };
  var uploadBuffType = '';
  var matrixItems = [];
  var matrixRawItems = []; // 服务端原始结果（客户端字段只在其上本地重滤）

  function characterOptions() {
    var chars =
      typeof charSkillDb !== 'undefined' && charSkillDb && Array.isArray(charSkillDb.characters)
        ? charSkillDb.characters
        : [];
    if (!chars.length) {
      return '<option value="">角色数据加载中…</option>';
    }
    return (
      '<option value="">选择角色</option>' +
      chars
        .map(function (c) {
          return '<option value="' + esc(c.name || c.id || '') + '">' + esc(c.name || c.id || '') + '</option>';
        })
        .join('')
    );
  }

  var charListCache = null; // listCharacters 的 memo
  var charListCacheRef = null; // 惰性引用比较：charSkillDb.characters 引用变化即失效
  var charNameMap = null; // id -> name Map

  function listCharacters() {
    var chars =
      typeof charSkillDb !== 'undefined' && charSkillDb && Array.isArray(charSkillDb.characters)
        ? charSkillDb.characters
        : [];
    // 惰性引用比较：charSkillDb 被 setCharSkillDb / reloadCharSkillDb 重载时 characters 引用变化 → 自动失效重建
    if (charListCache && charListCacheRef === chars) return charListCache;
    charListCache = chars
      .map(function (c) {
        return {
          id: String(c.id || ''),
          name: String(c.name || c.id || ''),
          element: Number(c.element) || 0,
          rank: Number(c.rank) || 0,
        };
      })
      .filter(function (c) {
        return c.id && c.name;
      })
      .sort(function (a, b) {
        return b.rank - a.rank || a.name.localeCompare(b.name, 'zh-CN');
      });
    charListCacheRef = chars;
    charNameMap = new Map();
    charListCache.forEach(function (c) {
      charNameMap.set(c.id, c.name);
    });
    return charListCache;
  }

  function elementMeta(key) {
    var types = typeof ELEMENT_TYPES !== 'undefined' ? ELEMENT_TYPES : null;
    var numKey = key === 'all' ? 'all' : Number(key);
    if (numKey === 'all') {
      return { key: 'all', label: '全部', color: MATRIX_ELEMENT_COLORS.all, icon: '全' };
    }
    if (types && types[numKey]) {
      return {
        key: String(numKey),
        label: types[numKey].label || '属性',
        color: MATRIX_ELEMENT_COLORS[numKey] || types[numKey].color || '#8b9cb3',
        icon: types[numKey].icon || '',
      };
    }
    return { key: '0', label: '其他', color: '#8b9cb3', icon: '?' };
  }

  function elementIconHtml(elKey) {
    var url = '';
    if (typeof window.getElementIconUrl === 'function' && elKey !== 'all') {
      url = getElementIconUrl(elKey) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    var meta = elementMeta(elKey);
    if (url) {
      return '<img class="mx-el-icon" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />';
    }
    return '<span class="mx-el-fallback" style="background:' + esc(meta.color) + '">' + esc(meta.icon || meta.label.slice(0, 1)) + '</span>';
  }

  function groupByElement(chars) {
    var order = MATRIX_ELEMENT_ORDER.concat([0]);
    var buckets = {};
    order.forEach(function (k) {
      buckets[k] = [];
    });
    chars.forEach(function (c) {
      var key = order.indexOf(c.element) >= 0 ? c.element : 0;
      buckets[key].push(c);
    });
    return order
      .map(function (key) {
        return { key: key, chars: buckets[key] || [] };
      })
      .filter(function (g) {
        return g.chars.length;
      });
  }

  function charsForPanel(panelKey, chars) {
    if (panelKey === 'all') return chars;
    var el = Number(panelKey);
    return chars.filter(function (c) {
      return c.element === el;
    });
  }

  function countByElement(chars) {
    var map = { all: chars.length };
    MATRIX_ELEMENT_ORDER.forEach(function (k) {
      map[k] = 0;
    });
    chars.forEach(function (c) {
      if (map[c.element] != null) map[c.element] += 1;
    });
    return map;
  }

  function charNameById(id) {
    listCharacters(); // 确保索引已建（惰性失效/重建）
    var name = charNameMap ? charNameMap.get(String(id)) : '';
    return name || '';
  }

  function findCharDefById(id) {
    var chars =
      typeof charSkillDb !== 'undefined' && charSkillDb && Array.isArray(charSkillDb.characters)
        ? charSkillDb.characters
        : [];
    return chars.find(function (c) {
      return String(c.id) === String(id);
    }) || null;
  }

  function echoConfigSummary(cfg) {
    if (!cfg) return '未配置';
    var layout = cfg.layout || '43311';
    var sets = (cfg.setLoadout || [])
      .filter(function (e) {
        return e.setId && e.count > 0;
      })
      .map(function (e) {
        var def = typeof window.findEchoSetDef === 'function' ? findEchoSetDef(e.setId) : null;
        return (def && def.name) || e.setId;
      });
    return layout + (sets.length ? ' · ' + sets.join('+') : '');
  }

  function weaponLabelForSlot(i) {
    var w = memberWeapons[i];
    if (!w || !w.id) return '武器选取';
    var def = typeof window.findWeaponDef === 'function' ? findWeaponDef(w.id) : null;
    return (def && def.name) || w.id;
  }

  function weaponTypeLabel(typeId) {
    var labels = typeof WEAPON_TYPE_LABELS !== 'undefined' ? WEAPON_TYPE_LABELS : {};
    return labels[typeId] || '';
  }

  function openWeaponPicker(slotIndex) {
    var charId = charPickerState.slots[Number(slotIndex)];
    var charDef = charId ? findCharDefById(charId) : null;
    var weaponType = charDef && charDef.weapon ? Number(charDef.weapon) : 0;
    var pool = (typeof weaponsDb !== 'undefined' && weaponsDb && Array.isArray(weaponsDb.weapons))
      ? weaponsDb.weapons
      : [];
    if (weaponType) {
      var typed = pool.filter(function (w) { return Number(w.type) === weaponType; });
      if (typed.length) pool = typed;
    }
    pool = pool.filter(function (w) { return String(w.id || '').indexOf('80080') !== 0; });
    if (!pool.length) {
      alert('武器库未加载或该角色暂无武器，请稍后重试');
      return;
    }
    var current = memberWeapons[slotIndex] || { id: '', refine: 1 };
    var overlay = document.createElement('div');
    overlay.className = 'ecm-overlay mx-weapon-picker-overlay';
    overlay.innerHTML =
      '<div class="mx-weapon-picker">' +
      '<header class="ecm-head">' +
      '<strong>' + esc((charDef && charDef.name) || '角色') + ' · 选择武器</strong>' +
      '<button type="button" class="ecm-close" data-mx-weapon-close aria-label="关闭">✕</button>' +
      '</header>' +
      '<div class="mx-weapon-picker-body">' +
      (weaponType ? '<p class="mx-muted">武器类型：' + esc(weaponTypeLabel(weaponType) || '') + '</p>' : '') +
      '<div class="mx-weapon-grid">' +
      pool
        .map(function (w) {
          var on = String(w.id) === String(current.id);
          var wName = w.name || w.id;
          var short = esc(String(wName).slice(0, 1) || '?');
          var icon = '';
          var iconRemote = '';
          if (typeof window.getWeaponDefIconUrl === 'function') {
            icon = getWeaponDefIconUrl(w) || '';
            if (typeof window.safeAssetUrl === 'function') icon = safeAssetUrl(icon);
          }
          if (typeof window.getWeaponDefIconRemoteUrl === 'function') {
            iconRemote = getWeaponDefIconRemoteUrl(w) || '';
            if (typeof window.safeAssetUrl === 'function') iconRemote = safeAssetUrl(iconRemote);
          }
          var remoteAttr = iconRemote && iconRemote !== icon ? ' data-remote="' + esc(iconRemote) + '"' : '';
          return (
            '<button type="button" class="mx-weapon-card' + (on ? ' is-on' : '') + '" data-mx-weapon-card="' + esc(w.id) + '">' +
            '<span class="mx-weapon-icon">' +
            (icon ? '<img src="' + esc(icon) + '" alt="" loading="lazy"' + remoteAttr + ' onerror="typeof handleWeaponIconError===\'function\'&&handleWeaponIconError(this)" />' : '') +
            '<span class="mx-weapon-icon-fb"' + (icon ? ' style="display:none"' : ' style="display:flex"') + '>' + short + '</span>' +
            '</span>' +
            '<span class="mx-weapon-card-name">' + esc(wName) + '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>' +
      '<footer class="ecm-foot">' +
      '<span class="ecm-muted">精数</span>' +
      '<div class="mx-weapon-refine-row">' +
      [1, 2, 3, 4, 5].map(function (r) {
        return (
          '<button type="button" class="mx-chip-btn' + (Number(current.refine) === r ? ' is-active' : '') + '" data-mx-weapon-refine="' + r + '">R' + r + '</button>'
        );
      }).join('') +
      '</div>' +
      '<button type="button" class="ecm-save" data-mx-weapon-confirm>确认</button>' +
      '</footer>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-mx-weapon-close]') || e.target.hasAttribute('data-mx-weapon-picker-overlay')) {
        overlay.remove();
        return;
      }
      var card = e.target.closest('[data-mx-weapon-card]');
      if (card) {
        current.id = card.dataset.mxWeaponCard;
        overlay.querySelectorAll('[data-mx-weapon-card]').forEach(function (c) {
          c.classList.toggle('is-on', c === card);
        });
        return;
      }
      var refBtn = e.target.closest('[data-mx-weapon-refine]');
      if (refBtn) {
        current.refine = Number(refBtn.dataset.mxWeaponRefine);
        overlay.querySelectorAll('[data-mx-weapon-refine]').forEach(function (b) {
          b.classList.toggle('is-active', b === refBtn);
        });
        return;
      }
      if (e.target.closest('[data-mx-weapon-confirm]')) {
        if (!current.id) {
          alert('请先选择武器');
          return;
        }
        memberWeapons[slotIndex] = { id: current.id, refine: current.refine || 1 };
        overlay.remove();
        renderPickerInModal();
      }
    });
  }

  function echoSubCount(cfg) {
    var n = 0;
    var slots = cfg && Array.isArray(cfg.slots) ? cfg.slots : [];
    slots.forEach(function (s) {
      if (Array.isArray(s && s.subs)) n += s.subs.filter(Boolean).length;
    });
    return n;
  }

  function parseFilterSlotKey(key) {
    if (!key) return null;
    var parts = String(key).split('+');
    return {
      chain: Number(parts[0]) || 0,
      refine: Number(parts[1]) || 1,
    };
  }

  function filterChainOptions(selected) {
    var out = '<option value="">全部</option>';
    for (var c = 0; c <= 6; c++) {
      var sel = selected === c ? ' selected' : '';
      out += '<option value="' + c + '"' + sel + '>' + (c === 0 ? '0链' : c + '链') + '</option>';
    }
    return out;
  }

  function filterRefineOptions(selected) {
    var out = '<option value="">全部</option>';
    for (var r = 1; r <= 5; r++) {
      var sel = selected === r ? ' selected' : '';
      out += '<option value="' + r + '"' + sel + '>R' + r + '</option>';
    }
    return out;
  }

  function renderTeamCfgFilter() {
    var slots = [0, 1, 2]
      .map(function (i) {
        var parsed = parseFilterSlotKey(filterState.teamSlots[i]);
        var chain = parsed ? parsed.chain : '';
        var refine = parsed ? parsed.refine : '';
        return (
          '<div class="mx-team-slot" data-mx-team-slot="' + i + '">' +
          '<div class="mx-team-slot-label">' + (i === 0 ? '位1·主C' : '位' + (i + 1)) + '</div>' +
          '<select class="mx-select" data-mx-filter-chain="' + i + '">' + filterChainOptions(chain) + '</select>' +
          '<select class="mx-select" data-mx-filter-refine="' + i + '">' + filterRefineOptions(refine) + '</select>' +
          '</div>'
        );
      })
      .join('');
    var presets = [
      { key: '0+1|0+1|0+1', label: '全员 0+1' },
      { key: '2+1|0+1|0+1', label: '主C 2+1 + 双0+1' },
      { key: '3+1|0+1|0+1', label: '主C 3+1 + 双0+1' },
      { key: '6+5|0+1|0+1', label: '主C 6+5 + 双0+1' },
      { key: '6+5|6+5|6+5', label: '全员 6+5' },
    ];
    var activePreset = filterState.teamSlots.join('|');
    return (
      '<div class="mx-filter-block" data-mx-team-cfg>' +
      '<div class="mx-filter-block-title">同配检索</div>' +
      '<div class="mx-team-slots">' + slots + '</div>' +
      '<div class="mx-team-presets">' +
      presets
        .map(function (p) {
          return (
            '<button type="button" class="mx-chip-btn' + (activePreset === p.key ? ' is-active' : '') + '" data-mx-filter-preset="' + esc(p.key) + '">' +
            esc(p.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>'
    );
  }

  function renderFilterCharPicker() {
    var chars = listCharacters();
    var selected = filterState.charSlots;
    var panelKey = filterState.elementPanel;
    var tilesHtml = MATRIX_ELEMENT_ORDER.map(function (k) {
        var m = elementMeta(k);
        var on = String(k) === panelKey;
        return (
          '<button type="button" class="mx-el-tile' + (on ? ' is-on' : '') + '" data-mx-filter-el-tile="' + k + '" style="--mx-el:' + m.color + '">' +
          elementIconHtml(k) +
          '<span class="mx-el-tile-name">' + esc(m.label) + '</span>' +
          '<span class="mx-el-tile-count">' + (countByElement(chars)[k] || 0) + '人</span></button>'
        );
      })
      .join('');
    var slotsHtml = selected
      .map(function (id, i) {
        if (!id) {
          return '<button type="button" class="mx-char-slot is-empty" data-mx-filter-slot-open="' + i + '"><span class="mx-char-slot-label">角色 ' + (i + 1) + '</span><span class="mx-char-slot-empty">点击选择</span></button>';
        }
        var name = charNameById(id);
        return (
          '<div class="mx-char-slot has-char">' +
          '<div class="mx-char-slot-head"><span class="mx-char-slot-name">' + esc(name) + '</span>' +
          '<button type="button" class="mx-char-slot-x" data-mx-filter-char-remove="' + esc(id) + '" aria-label="移除 ' + esc(name) + '">×</button></div>' +
          '</div>'
        );
      })
      .join('');
    var panelHtml = '';
    if (panelKey) {
      var meta = elementMeta(panelKey);
      var list = charsForPanel(panelKey, chars);
      var body = '';
      if (!list.length) {
        body = '<p class="mx-muted">该属性暂无角色</p>';
      } else if (panelKey === 'all') {
        var groups = groupByElement(chars);
        body = groups
          .map(function (g) {
            var gm = elementMeta(g.key);
            return (
              '<div class="mx-panel-group">' +
              '<div class="mx-panel-group-head"><span class="mx-panel-group-dot" style="background:' + gm.color + '"></span><span>' + esc(gm.label) + '</span><span class="mx-muted">' + g.chars.length + '</span></div>' +
              '<div class="mx-char-cards">' + g.chars.map(function (c) { return renderFilterCharCard(c, selected); }).join('') + '</div>' +
              '</div>'
            );
          })
          .join('');
      } else {
        body = '<div class="mx-char-cards">' + list.map(function (c) { return renderFilterCharCard(c, selected); }).join('') + '</div>';
      }
      panelHtml =
        '<div class="mx-el-panel" data-mx-el-panel>' +
        '<div class="mx-el-panel-head"><strong style="--mx-el:' + meta.color + '">' + esc(meta.label) + ' · ' + list.length + '人</strong>' +
        '<button type="button" class="mx-panel-close" data-mx-filter-panel-close aria-label="关闭">✕</button></div>' +
        '<div class="mx-el-panel-body">' + body + '</div></div>';
    }
    return (
      '<div class="mx-filter-block" data-mx-filter-char>' +
      '<div class="mx-char-picker-head">' +
      '<span class="mx-char-picker-title">角色检索（可选）</span>' +
      '<span class="mx-char-picker-count">已选 ' + selected.filter(Boolean).length + '/3</span>' +
      '</div>' +
      '<div class="mx-char-slots">' + slotsHtml + '</div>' +
      '<div class="mx-el-tiles" data-mx-el-tiles>' + tilesHtml + '</div>' +
      panelHtml +
      '</div>'
    );
  }

  function renderFilterPanels() {
    return renderTeamCfgFilter() + renderFilterCharPicker();
  }

  function refreshFilterPanels() {
    var teamHost = $('[data-mx-team-cfg]');
    if (teamHost) teamHost.outerHTML = renderTeamCfgFilter();
    var charHost = $('[data-mx-filter-char]');
    if (charHost) charHost.outerHTML = renderFilterCharPicker();
  }

  function applyClientFilters() {
    var items = matrixRawItems;
    var teamFilters = filterState.teamSlots.map(parseFilterSlotKey);
    var charFilters = filterState.charSlots.filter(Boolean);
    if (teamFilters.some(function (v) { return v !== null; }) || charFilters.length) {
      items = items.filter(function (it) {
        var members = Array.isArray(it.members) ? it.members : [];
        var teamOk = teamFilters.every(function (want, i) {
          if (!want) return true;
          var m = members[i];
          return !!m && Number(m.chain) === want.chain && Number(m.refine) === want.refine;
        });
        if (!teamOk) return false;
        if (!charFilters.length) return true;
        var memberNames = members.map(function (m) { return m && m.name; }).filter(Boolean);
        return charFilters.every(function (cid) {
          var name = charNameById(cid);
          return !!name && memberNames.indexOf(name) >= 0;
        });
      });
    }
    matrixItems = items;
    renderPublicList(items);
  }

  function renderPublicList(items) {
    var listEl = $('[data-matrix-public-list]');
    if (!listEl) return;
    listEl.innerHTML = items.length
      ? items.map(renderCard).join('')
      : '<div class="ui-empty"><span class="ui-empty-icon">▦</span><div class="ui-empty-title">还没有数据</div><div class="ui-empty-desc">来上传第一条矩阵数据吧。</div></div>';
  }

  // 客户端字段（团队/角色）变化：仅本地重滤，不重拉服务端
  function applyClientFilterChange() {
    refreshFilterPanels();
    if (isOpen()) applyClientFilters();
  }

  var publicLoadToken = 0;
  var publicLoadTimer = null;

  // 服务端字段（season/stage/round/flow/buffType/sort）变化：300ms 防抖 + 请求取消
  function schedulePublicLoad() {
    publicLoadToken++; // 立即作废在途请求
    if (publicLoadTimer) clearTimeout(publicLoadTimer);
    publicLoadTimer = setTimeout(function () {
      publicLoadTimer = null;
      if (isOpen()) void loadPublic();
    }, 300);
  }

  function renderCharPicker() {
    var chars = listCharacters();
    var selected = charPickerState.slots;
    var panelKey = charPickerState.elementPanel;
    var tilesHtml = MATRIX_ELEMENT_ORDER.map(function (k) {
        var m = elementMeta(k);
        var on = String(k) === panelKey;
        return (
          '<button type="button" class="mx-el-tile' + (on ? ' is-on' : '') + '" data-mx-el-tile="' + k + '" style="--mx-el:' + m.color + '">' +
          elementIconHtml(k) +
          '<span class="mx-el-tile-name">' + esc(m.label) + '</span>' +
          '<span class="mx-el-tile-count">' + (countByElement(chars)[k] || 0) + '人</span></button>'
        );
      })
      .join('');

    var slotsHtml = selected
      .map(function (id, i) {
        if (!id) {
        return '<button type="button" class="mx-char-slot is-empty" data-mx-slot-open="' + i + '"><span class="mx-char-slot-label">角色 ' + (i + 1) + '</span><span class="mx-char-slot-empty">点击选择</span></button>';
        }
        var name = charNameById(id);
        return (
          '<div class="mx-char-slot has-char">' +
          '<div class="mx-char-slot-head"><span class="mx-char-slot-name">' + esc(name) + '</span>' +
          '<button type="button" class="mx-char-slot-x" data-mx-char-remove="' + esc(id) + '" aria-label="移除 ' + esc(name) + '">×</button></div>' +
          '<div class="mx-char-slot-opts">' +
          '<select data-member-chain="' + i + '" title="链">' + chainOptions() + '</select>' +
          '</div>' +
          '<button type="button" class="mx-weapon-btn" data-mx-weapon-pick="' + i + '" title="选择武器">' +
          esc(weaponLabelForSlot(i)) + ' · R' + (memberWeapons[i] && memberWeapons[i].refine ? memberWeapons[i].refine : 1) +
          '</button>' +
          '<select class="mx-echo-profile-select" data-echo-profile-select="' + i + '" title="选择已保存的声骸配置方案">' +
          '<option value="">声骸方案 · ' + esc(echoConfigSummary(echoConfigs[i])) + '</option>' +
          '</select>' +
          '<div class="mx-echo-icons" data-echo-icons="' + i + '">' + echoSlotsIconStrip(echoConfigs[i]) + '</div>' +
          '<div class="mx-echo-fold" data-echo-fold="' + i + '">' +
          '<button type="button" class="mx-echo-toggle" data-echo-toggle="' + i + '">声骸词条 <span data-echo-caret="' + i + '">▸</span></button>' +
          '<div class="mx-echo-body" data-echo-body="' + i + '" hidden>' +
          '<input type="number" data-member-echo="' + i + '" min="0" max="999" placeholder="有效词条" />' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    var panelHtml = '';
    if (panelKey) {
      var meta = elementMeta(panelKey);
      var list = charsForPanel(panelKey, chars);
      var body = '';
      if (!list.length) {
        body = '<p class="mx-muted">该属性暂无角色</p>';
      } else if (panelKey === 'all') {
        var groups = groupByElement(chars);
        body = groups
          .map(function (g) {
            var gm = elementMeta(g.key);
            return (
              '<div class="mx-panel-group">' +
              '<div class="mx-panel-group-head"><span class="mx-panel-group-dot" style="background:' + gm.color + '"></span><span>' + esc(gm.label) + '</span><span class="mx-muted">' + g.chars.length + '</span></div>' +
              '<div class="mx-char-cards">' + g.chars.map(function (c) { return renderFilterCharCard(c, selected, 'data-mx-char-pick'); }).join('') + '</div>' +
              '</div>'
            );
          })
          .join('');
      } else {
        body = '<div class="mx-char-cards">' + list.map(function (c) { return renderFilterCharCard(c, selected, 'data-mx-char-pick'); }).join('') + '</div>';
      }
      panelHtml =
        '<div class="mx-el-panel" data-mx-el-panel>' +
        '<div class="mx-el-panel-head"><strong style="--mx-el:' + meta.color + '">' + esc(meta.label) + ' · ' + list.length + '人</strong>' +
        '<button type="button" class="mx-panel-close" data-mx-panel-close aria-label="关闭">✕</button></div>' +
        '<div class="mx-el-panel-body">' + body + '</div></div>';
    }

    return (
      '<div class="mx-char-picker" data-mx-char-picker>' +
      '<div class="mx-char-picker-head"><span class="mx-char-picker-title">队伍角色</span>' +
      '<span class="mx-char-picker-count">已选 ' + selected.filter(Boolean).length + '/3</span></div>' +
      '<div class="mx-char-slots">' + slotsHtml + '</div>' +
      '<div class="mx-el-tiles" data-mx-el-tiles>' + tilesHtml + '</div>' +
      panelHtml +
      '</div>'
    );
  }

  function renderCharCard(c, selected, pickAttr) {
    pickAttr = pickAttr || 'data-mx-char-pick';
    var on = selected.indexOf(c.id) >= 0;
    var filled = selected.filter(Boolean).length;
    var disabled = !on && filled >= 3;
    return (
      '<button type="button" class="mx-char-card' + (on ? ' is-on' : '') + '" ' + pickAttr + '="' + esc(c.id) + '" ' + (disabled ? 'disabled' : '') + ' title="' + esc(c.name) + '">' +
      '<span class="mx-char-card-avatar"><span class="mx-char-avatar-fb">' + esc(c.name.slice(0, 1)) + '</span>' +
      (on ? '<span class="mx-char-card-check">✓</span>' : '') + '</span>' +
      '<span class="mx-char-card-name">' + esc(c.name) + '</span></button>'
    );
  }

  function renderFilterCharCard(c, selected, pickAttr) {
    pickAttr = pickAttr || 'data-mx-filter-char-pick';
    var on = selected.indexOf(c.id) >= 0;
    var filled = selected.filter(Boolean).length;
    var disabled = !on && filled >= 3;
    var name = c.name || c.id || '角色';
    var short = esc(String(name).trim().slice(0, 1) || '?');
    var fullDef = findCharDefById(c.id);
    var url = '';
    var remote = '';
    if (typeof window.getCharPortraitUrl === 'function' && fullDef) {
      url = getCharPortraitUrl(fullDef) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    if (typeof window.getCharPortraitRemoteUrl === 'function' && fullDef) {
      remote = getCharPortraitRemoteUrl(fullDef) || '';
      if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
    }
    var remoteAttr = remote && remote !== url ? ' data-remote="' + esc(remote) + '"' : '';
    var img = url
      ? '<img src="' + esc(url) + '" alt="" loading="lazy"' + remoteAttr + ' onerror="typeof handlePortraitImgError===\'function\'&&handlePortraitImgError(this)" />'
      : '';
    return (
      '<button type="button" class="mx-char-card' + (on ? ' is-on' : '') + '" ' + pickAttr + '="' + esc(c.id) + '" ' + (disabled ? 'disabled' : '') + ' title="' + esc(name) + '">' +
      '<span class="mx-char-card-avatar">' + img + '<span class="mx-char-avatar-fb"' + (url ? ' style="display:none"' : ' style="display:flex"') + '>' + short + '</span>' +
      (on ? '<span class="mx-char-card-check">✓</span>' : '') + '</span>' +
      '<span class="mx-char-card-name">' + esc(name) + '</span></button>'
    );
  }

  function renderPickerInModal() {
    var host = $('[data-mx-char-picker]');
    if (!host) return;
    var saved = [0, 1, 2].map(function (i) {
      var chain = $('[data-member-chain="' + i + '"]');
      var echo = $('[data-member-echo="' + i + '"]');
      return {
        chain: chain ? chain.value : '0',
        echo: echo ? echo.value : '',
      };
    });
    host.outerHTML = renderCharPicker();
    var next = $('[data-mx-char-picker]');
    if (!next) return;
    [0, 1, 2].forEach(function (i) {
      var chain = next.querySelector('[data-member-chain="' + i + '"]');
      var echo = next.querySelector('[data-member-echo="' + i + '"]');
      if (chain && saved[i]) chain.value = saved[i].chain;
      if (echo && saved[i]) echo.value = saved[i].echo;
    });
    if (echoProfiles.length) fillEchoProfileSelects();
  }

  function fillEchoProfileSelects() {
    var selects = $$('[data-echo-profile-select]');
    if (!selects.length) return;
    var opts =
      '<option value="">选择已保存的方案…</option>' +
      echoProfiles
        .map(function (p) {
          var charName = (p.chars && p.chars[0] && p.chars[0].name) || '';
          return '<option value="' + esc(p.id) + '">' + esc(p.name) + (charName ? ' · ' + esc(charName) : '') + '</option>';
        })
        .join('');
    selects.forEach(function (sel) {
      var slot = Number(sel.dataset.echoProfileSelect);
      var current = '';
      var curCfg = echoConfigs[slot];
      if (curCfg) {
        var match = echoProfiles.find(function (p) {
          return p.chars && p.chars[0] && p.chars[0].echoConfig && JSON.stringify(p.chars[0].echoConfig) === JSON.stringify(curCfg);
        });
        if (match) current = String(match.id);
      }
      sel.innerHTML = opts;
      sel.value = current || '';
    });
  }

  function resolveMatrixEchoId(slot) {
    if (!slot) return '';
    var echoId = slot.echoId ? String(slot.echoId) : '';
    if (!echoId && slot.name && typeof window.ECHO_ECHO_BY_NAME !== 'undefined') {
      try {
        var hit = window.ECHO_ECHO_BY_NAME[String(slot.name).replace(/\s+/g, '').toLowerCase()];
        if (hit) echoId = String(hit.id);
      } catch (e) {
        /* ignore */
      }
    }
    return echoId;
  }

  function echoSlotsIconStrip(cfg) {
    if (!cfg || !Array.isArray(cfg.slots) || !cfg.slots.length) return '';
    var mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
    var html = cfg.slots
      .map(function (slot, i) {
        var echoId = resolveMatrixEchoId(slot);
        var isMain = i === mainIdx;
        var title = (slot && slot.name) || (isMain ? '主位' : '声骸');
        if (echoId) {
          return (
            '<span class="mx-echo-mini' + (isMain ? ' is-main' : '') + '" title="' + esc(title) + '">' +
            '<img src="assets/echoes-thumb/' + encodeURIComponent(echoId) + '.png" alt="" loading="lazy" decoding="async" ' +
            'onerror="this.onerror=null;this.src=\'assets/echoes/' + encodeURIComponent(echoId) + '.png\'" />' +
            '</span>'
          );
        }
        return (
          '<span class="mx-echo-mini is-empty' + (isMain ? ' is-main' : '') + '" title="' + esc(title) + '">' +
          esc((slot && slot.name ? slot.name.slice(0, 1) : '?')) +
          '</span>'
        );
      })
      .join('');
    return '<div class="mx-echo-strip">' + html + '</div>';
  }

  function chainOptions() {
    var out = '';
    for (var i = 0; i <= 6; i++) {
      out += '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + i + ' 链</option>';
    }
    return out;
  }

  function bossOptions() {
    return (
      '<option value="">选择 Boss</option>' +
      MATRIX_BOSSES.map(function (b) {
        return '<option value="' + esc(b) + '">' + esc(b) + '</option>';
      }).join('')
    );
  }

  function roundOptions() {
    var out = '';
    for (var r = 1; r <= 9; r++) {
      out += '<option value="' + r + '">R' + r + '</option>';
    }
    return out;
  }

  function buffIconHtml(key, sizeCls) {
    var meta = key && MATRIX_BUFF_META[key];
    if (!meta) {
      return '<span class="mx-buff-icon ' + (sizeCls || '') + ' is-grid">▦</span>';
    }
    var isSvg = typeof meta.icon === 'string' && meta.icon.indexOf('<svg') === 0;
    if (isSvg) {
      return '<span class="mx-buff-icon ' + (sizeCls || '') + ' is-svg">' + meta.icon + '</span>';
    }
    if (typeof meta.icon === 'string' && meta.icon.indexOf('.png') >= 0) {
      return '<span class="mx-buff-icon ' + (sizeCls || '') + ' is-img"><img src="' + esc(meta.icon) + '" alt="" loading="lazy" /></span>';
    }
    return (
      '<span class="mx-buff-icon ' + (sizeCls || '') + '">' +
      esc(meta.icon) +
      '</span>'
    );
  }

  function renderBuffTypePicker(value, kind) {
    var current = value || '';
    var currentMeta = current && MATRIX_BUFF_META[current];
    var pickerAttr = kind === 'filter' ? 'data-buff-filter-picker' : 'data-buff-picker';
    var triggerAttr = kind === 'filter' ? 'data-buff-filter-trigger' : 'data-buff-trigger';
    var optAttr = kind === 'filter' ? 'data-buff-filter-opt' : 'data-buff-opt';
    var options = [''].concat(MATRIX_BUFF_TYPES);
    var panel = options
      .map(function (key) {
        var isAll = key === '';
        var meta = isAll ? null : MATRIX_BUFF_META[key];
        var name = isAll ? '全部' : key;
        return (
          '<button type="button" class="mx-buff-option' + (String(current) === String(key) ? ' is-on' : '') + '" ' + optAttr + '="' + esc(key) + '">' +
          '<span class="mx-buff-option-icon">' + buffIconHtml(isAll ? '' : key, 'is-sm') + '</span>' +
          '<span class="mx-buff-option-main">' +
          '<span class="mx-buff-option-name">' + esc(name) + '</span>' +
          (meta && meta.desc ? '<span class="mx-buff-option-desc">' + esc(meta.desc) + '</span>' : '') +
          '</span>' +
          (meta && meta.desc
            ? '<span class="mx-buff-tip" role="tooltip">' +
              '<span class="mx-buff-tip-title">' + esc(name) + '</span>' +
              '<span class="mx-buff-tip-desc">' + esc(meta.desc) + '</span>' +
              '</span>'
            : '') +
          '</button>'
        );
      })
      .join('');
    return (
      '<div class="mx-buff-picker" ' + pickerAttr + '>' +
      '<button type="button" class="mx-buff-trigger" ' + triggerAttr + '>' +
      '<span class="mx-buff-trigger-main">' +
      (current ? buffIconHtml(current, 'is-sm') : '') +
      '<span class="mx-buff-trigger-name">' + esc(current ? current : '全部') + '</span>' +
      '</span>' +
      '<span class="mx-buff-arrow">▾</span>' +
      '</button>' +
      '<div class="mx-buff-panel" hidden>' + panel + '</div>' +
      '</div>'
    );
  }

  function renderModalForm() {
    return `
      <div class="matrix-modal-overlay" data-matrix-modal-overlay>
        <div class="matrix-modal matrix-modal-wide" role="dialog" aria-modal="true" aria-labelledby="matrixModalTitle" data-matrix-modal>
          <header class="matrix-modal-head">
            <strong id="matrixModalTitle">上传矩阵数据</strong>
            <button type="button" class="matrix-modal-close" data-matrix-modal-close aria-label="关闭">✕</button>
          </header>

          <div class="matrix-modal-body">
            <div class="matrix-self-toggle" data-matrix-self-toggle>
              <button type="button" class="matrix-self-tab is-active" data-matrix-self-tab="self">用户本人</button>
              <button type="button" class="matrix-self-tab" data-matrix-self-tab="proxy">代为上传</button>
            </div>

            <div class="matrix-row-field">
              <label>账号 UID *</label>
              <input type="text" data-matrix-uid placeholder="例如 100123456" />
            </div>
            <div class="matrix-row-field" data-matrix-name-wrap>
              <label>玩家名<span class="matrix-req" data-matrix-name-req hidden>*</span></label>
              <input type="text" data-matrix-name placeholder="本人（无需填写）" disabled />
            </div>
            <div class="matrix-row-field">
              <label>矩阵分数 *</label>
              <input type="number" data-matrix-score placeholder="例如 24000" min="0" />
            </div>
            <div class="matrix-row-field">
              <label>赛季 + 阶段</label>
              <input type="text" value="S2 · 第一阶段" disabled data-matrix-season-stage />
            </div>
            <div class="matrix-row-field">
              <label>当期增益 *</label>
              ${renderBuffTypePicker(uploadBuffType)}
            </div>
            <div class="matrix-row-field">
              <label>轮次</label>
              <select data-matrix-round>${roundOptions()}</select>
            </div>
            <div class="matrix-row-field">
              <label>开局 Boss *</label>
              <select data-matrix-boss>${bossOptions()}</select>
            </div>
            <div class="matrix-row-field">
              <label>流程</label>
              <select data-matrix-flow>
                <option value="正常循环">正常循环</option>
                <option value="全局特化">全局特化</option>
              </select>
            </div>
            <div class="matrix-row-field">
              <label>视频链接 *</label>
              <input type="text" data-matrix-video placeholder="https://..." />
            </div>
            <div class="matrix-modal-divider"></div>

            ${renderCharPicker()}
          </div>

          <footer class="matrix-modal-foot">
            <span class="matrix-modal-hint"><span class="matrix-status" data-matrix-status></span>草稿自动保存</span>
            <div class="matrix-modal-actions">
              <button type="button" class="matrix-modal-cancel" data-matrix-modal-close>取消</button>
              <button type="button" class="matrix-modal-submit" data-matrix-submit>提交数据</button>
            </div>
          </footer>
        </div>
      </div>`;
  }

  function openUploadModal() {
    if (!window.Cloud || !Cloud.getUser || !Cloud.getUser()) {
      setStatus('请先登录后上传', true);
      if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      return;
    }
    if ($('[data-matrix-modal-overlay]')) return;
    var host = document.getElementById('matrixPage');
    if (!host) return;
    charPickerState.slots = ['', '', ''];
    charPickerState.elementPanel = '';
    echoConfigs = {};
    memberWeapons = {};
    uploadBuffType = '';
    var div = document.createElement('div');
    div.innerHTML = renderModalForm();
    var overlay = div.firstElementChild;
    host.appendChild(overlay);
    document.body.classList.add('matrix-modal-open');
    void loadEchoProfiles();
  }

  function closeUploadModal() {
    var overlay = $('[data-matrix-modal-overlay]');
    if (overlay) overlay.remove();
    document.body.classList.remove('matrix-modal-open');
  }

  function setOpen(open) {
    document.body.classList.toggle('matrix-open', !!open);
    var page = document.getElementById('matrixPage');
    if (page) page.hidden = !open;
    if (!open) closeUploadModal();
    if (open) {
      if (window.PublicDb && typeof PublicDb.close === 'function') PublicDb.close();
      if (window.WaveCalcProfile && typeof WaveCalcProfile.close === 'function') {
        WaveCalcProfile.close();
      }
      renderShell();
      void loadPublic();
      void loadEchoProfiles();
    }
  }

  function setStatus(msg, isError) {
    var el = $('[data-matrix-status]') || $('.matrix-modal .matrix-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-ok', !!msg && !isError);
  }

  function renderCard(it, idx) {
    var members = Array.isArray(it.members) ? it.members : [];
    var seasonStage = (it.season ? 'S' + it.season : '') + (it.stage ? '·第' + it.stage + '阶段' : '');
    var uidTime = [
      it.record_code ? '编码 ' + esc(it.record_code) : '',
      it.player_uid ? 'UID: ' + esc(it.player_uid) : '',
      esc(fmtTime(it.created_at)),
    ]
      .filter(Boolean)
      .join(' · ');
    var videoHtml = it.video_url
      ? '<a class="mc-video-link" href="' + esc(it.video_url) + '" target="_blank" rel="noopener noreferrer">▶ 查看视频</a>'
      : '';
    var authorName =
      (it.profiles && it.profiles.display_name) || it.player_name || '用户';
    // 本人上传保留头像+名称排版；代传仅显示「操作者：名称」
    var authorHtml;
    if (it.is_self) {
      var authorAvatar = uploaderAvatarHtml(
        it.profiles || { display_name: authorName, avatar_data_url: '' }
      );
      authorHtml =
        '<span class="mc-author">' +
        authorAvatar +
        '<span class="mc-author-name">' + esc(authorName) + '</span>' +
        '<span class="mc-author-label">本人提供</span>' +
        '</span>';
    } else {
      authorHtml =
        '<span class="mc-author">' +
        '<span class="mc-author-name">操作者：' + esc(authorName) + '</span>' +
        '</span>';
    }
    var buffType = it.buffType || it.buff_type || '';
    var buffMeta = buffType ? MATRIX_BUFF_META[buffType] : null;
    var buffIconHtml =
      buffMeta && buffMeta.icon
        ? '<span class="mc-buff-icon" title="当期增益：' + esc(buffType) + '">' +
          '<img src="' + esc(buffMeta.icon) + '" alt="' + esc(buffType) + '" loading="lazy" onerror="this.style.display=\'none\'" />' +
          '</span>'
        : '';
    var bossImg = it.boss ? MATRIX_BOSS_IMAGES[it.boss] || '' : '';
    var actionsHtml =
      '<div class="mc-actions-col">' +
      '<span class="mc-action-tag">' + (it.is_self ? '本人' : '代传') + '</span>' +
      '<button type="button" class="matrix-detail-btn" data-matrix-detail="' + idx + '">详细</button>' +
      '<button type="button" class="matrix-detail-btn" data-matrix-report="' + idx + '">举报</button>' +
      '</div>';
    var bossHtml =
      '<div class="matrix-card-right">' +
      actionsHtml +
      '<div class="mc-boss-area">' +
      (bossImg
        ? '<img src="' + esc(bossImg) + '" alt="' + esc(it.boss || '') + '" loading="lazy" ' +
          'onerror="var f=this.nextElementSibling;if(f)f.style.display=\'flex\';this.style.display=\'none\'" />'
        : '') +
      '<span class="mc-boss-fallback"' + (bossImg ? ' style="display:none"' : '') + '>' +
      '<span class="mc-boss-fallback-name">' + esc(it.boss || 'Boss') + '</span>' +
      '<span class="mc-boss-fallback-hint">暂无图片</span>' +
      '</span>' +
      (it.boss ? '<span class="mc-boss-name">' + esc(it.boss) + '</span>' : '') +
      '</div>' +
      '</div>';
    var centerHtml = members.length
      ? members
          .map(function (m) {
            return (
              '<div class="mc-role">' +
              matrixCardAvatarHtml(m) +
              '<div class="mc-role-name">' + esc(m.name || '角色') + '</div>' +
              '</div>'
            );
          })
          .join('')
      : '<div class="mc-role-empty">无队伍信息</div>';
    var leftTags = [seasonStage, it.round_no ? '第' + it.round_no + '轮' : '']
      .filter(Boolean)
      .join(' · ');
    var flow = it.flow_type || '正常循环';
    var flowTag =
      '<span class="mc-flow-tag is-' + (flow === '全局特化' ? 'special' : 'loop') + '">' +
      esc(flow) +
      '</span>';
    return (
      '<div class="matrix-card">' +
      '<div class="matrix-card-body">' +
      '<div class="matrix-card-left">' +
      '<div class="matrix-score-row">' +
      '<div class="matrix-score">' + fmtNum(it.matrix_score) + '</div>' +
      flowTag +
      '</div>' +
      (leftTags ? '<div class="mc-tag-row">' + esc(leftTags) + '</div>' : '') +
      (it.boss ? '<div class="mc-boss">Boss:' + esc(it.boss) + '</div>' : '') +
      (uidTime ? '<div class="mc-uid-row">' + uidTime + '</div>' : '') +
      videoHtml +
      '</div>' +
      '<div class="matrix-card-center">' +
      '<div class="mc-author-wrap">' + authorHtml + buffIconHtml + '</div>' +
      '<div class="mc-roles">' + centerHtml + '</div>' +
      '</div>' +
      bossHtml +
      '</div>' +
      '</div>'
    );
  }

  function weaponNameById(weaponId) {
    if (!weaponId) return '';
    var def = typeof window.findWeaponDef === 'function' ? findWeaponDef(weaponId) : null;
    return def ? def.name : weaponId;
  }

  function renderEchoConfigDetail(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      return '<div class="mdj-echo-empty">未填写</div>';
    }
    var parts = [];
    var sets = (cfg.setLoadout || [])
      .filter(function (e) { return e.setId && Number(e.count) > 0; })
      .map(function (e) {
        var def = typeof window.findEchoSetDef === 'function' ? findEchoSetDef(e.setId) : null;
        return (def ? def.name : e.setId) + '×' + e.count;
      });
    var mainOptions = typeof ECHO_MAIN1_OPTIONS !== 'undefined' ? ECHO_MAIN1_OPTIONS : {};
    var mainIdx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
    var mainSlot = (cfg.slots || [])[mainIdx];
    var mainName = '';
    if (mainSlot && mainSlot.echoId && typeof window.findEchoSpecimen === 'function') {
      var sp = findEchoSpecimen(mainSlot.echoId);
      if (sp) mainName = sp.name;
    }
    var mainLines = (cfg.slots || []).map(function (slot) {
      var cost = slot.cost ? String(slot.cost) + 'C' : '声骸';
      var mid = slot.main1 || '';
      var label = '未填写';
      var def = (mainOptions[slot.cost] || []).find(function (o) { return o.id === mid; });
      if (def) {
        label = mid === 'main_element_dmg' ? (slot.main1Element ? slot.main1Element + '增伤' : '属性伤害加成') : def.label;
      } else if (mid) {
        label = mid;
      }
      return '<span class="mdj-main-cost">' + esc(cost) + '</span><span class="mdj-main-name">' + esc(label) + '</span>';
    });
    parts.push('<div class="mdj-main-grid">' + mainLines.join('') + '</div>');
    parts.push('<div class="mdj-echo-row"><span>套装</span><b>' + esc(sets.join('、') || '未填写') + '</b></div>');
    parts.push('<div class="mdj-echo-row"><span>主位</span><b>' + esc(mainName || '未填写') + '</b></div>');
    var subAgg = {};
    var affixes = typeof ECHO_SUB_AFFIXES !== 'undefined' ? ECHO_SUB_AFFIXES : {};
    (cfg.slots || []).forEach(function (slot) {
      (slot.subs || []).forEach(function (sub) {
        var def = affixes[sub.id];
        var key = sub.id === 'sub_type_dmg' ? 'type:' + (sub.damageType || '') : String(sub.id);
        if (!subAgg[key]) {
          var label = def ? def.label : sub.id;
          if (sub.id === 'sub_type_dmg') label = (sub.damageType || '类型') + '增伤';
          subAgg[key] = {
            label: label,
            value: 0,
            unit: def && def.unit === 'flat' ? '' : '%',
          };
        }
        subAgg[key].value += Number(sub.value) || 0;
      });
    });
    var subsList = Object.keys(subAgg).map(function (key) {
      var agg = subAgg[key];
      var val = Number(agg.value) || 0;
      var rounded = val.toFixed(1);
      return '<div class="mdj-sub-row"><span>' + esc(agg.label) + '</span><b>' + esc(rounded + agg.unit) + '</b></div>';
    });
    parts.push(
      '<div class="mdj-subs">' + (subsList.join('') || '<div class="mdj-sub-row"><span>未填写</span></div>') + '</div>'
    );
    return '<div class="mdj-echo">' + parts.join('') + '</div>';
  }

  function memberCharId(m) {
    if (m && m.charId) return String(m.charId);
    if (m && m.name) {
      var hit = listCharacters().find(function (c) {
        return c.name === m.name;
      });
      if (hit) return String(hit.id);
    }
    return '';
  }

  function memberAvatarHtml(m) {
    var def = m ? findCharDefById(memberCharId(m)) : null;
    var name = (m && m.name) || '角色';
    var url = '';
    var remote = '';
    if (def && typeof window.getCharPortraitUrl === 'function') {
      url = getCharPortraitUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    if (def && typeof window.getCharPortraitRemoteUrl === 'function') {
      remote = getCharPortraitRemoteUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
    }
    var color = '#8b94a8';
    if (def) {
      color = MATRIX_ELEMENT_COLORS[Number(def.element) || 0] || MATRIX_ELEMENT_COLORS.all || color;
    }
    var remoteAttr = remote && remote !== url ? ' data-remote="' + esc(remote) + '"' : '';
    var img = url
      ? '<img src="' + esc(url) + '" alt="" loading="lazy"' + remoteAttr +
        ' onerror="typeof handlePortraitImgError===\'function\'&&handlePortraitImgError(this)" />'
      : '';
    var short = esc(String(name).trim().slice(0, 1) || '?');
    return (
      '<div class="mdj-avatar">' +
      img +
      '<span class="mdj-avatar-fb" style="background:' + esc(color) + '">' + short + '</span>' +
      '</div>'
    );
  }

  function matrixCardAvatarHtml(m) {
    var def = m ? findCharDefById(memberCharId(m)) : null;
    var name = (m && m.name) || '角色';
    var url = '';
    var remote = '';
    if (def && typeof window.getCharPortraitUrl === 'function') {
      url = getCharPortraitUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    if (def && typeof window.getCharPortraitRemoteUrl === 'function') {
      remote = getCharPortraitRemoteUrl(def) || '';
      if (typeof window.safeAssetUrl === 'function') remote = safeAssetUrl(remote);
    }
    var color = '#8b94a8';
    if (def) {
      color = MATRIX_ELEMENT_COLORS[Number(def.element) || 0] || MATRIX_ELEMENT_COLORS.all || color;
    }
    var remoteAttr = remote && remote !== url ? ' data-remote="' + esc(remote) + '"' : '';
    var img = url
      ? '<img src="' + esc(url) + '" alt="" loading="lazy"' + remoteAttr +
        ' onerror="typeof handlePortraitImgError===\'function\'&&handlePortraitImgError(this)" />'
      : '';
    var short = esc(String(name).trim().slice(0, 1) || '?');
    var chain = m && m.chain != null ? m.chain : 0;
    var refine = m && m.refine != null ? m.refine : 1;
    return (
      '<span class="avatar-wrap" title="' + esc(name) + '">' +
      '<span class="mc-avatar">' +
      img +
      '<span class="mc-avatar-fb" style="background:' + esc(color) + '">' + short + '</span>' +
      '</span>' +
      '<span class="avatar-badge-chain">' + esc(chain + '链') + '</span>' +
      '<span class="avatar-badge-refine">R' + esc(refine) + '</span>' +
      '</span>'
    );
  }

  function uploaderAvatarHtml(profile) {
    var p = profile || {};
    var name = String(p.display_name || '用户');
    var img = p.avatar_data_url
      ? '<img src="' + esc(p.avatar_data_url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
      : '';
    var short = esc(String(name).trim().slice(0, 1) || '?');
    return (
      '<span class="mdj-author-avatar">' +
      img +
      '<span class="mdj-author-avatar-fb">' + short + '</span>' +
      '</span>'
    );
  }

  function weaponIconHtml(wDef) {
    var type = wDef && wDef.type;
    var url = '';
    if (type && typeof window.getWeaponTypeIconUrl === 'function') {
      url = getWeaponTypeIconUrl(type) || '';
      if (typeof window.safeAssetUrl === 'function') url = safeAssetUrl(url);
    }
    if (url) {
      return '<img class="mdj-weapon-icon" src="' + esc(url) + '" alt="" onerror="this.style.display=\'none\'" />';
    }
    return '<span class="mdj-weapon-icon is-fallback">⚔</span>';
  }

  function openMatrixDetail(idx) {
    var it = matrixItems[Number(idx)];
    if (!it) return;
    var members = Array.isArray(it.members) ? it.members : [];
    var memberHtml = members.length
      ? members
          .map(function (m, i) {
            var wName = weaponNameById(m.weaponId);
            var wDef = typeof window.findWeaponDef === 'function' ? findWeaponDef(m.weaponId) : null;
            var cfg = it.echo_configs ? it.echo_configs[String(i)] : null;
            return (
              '<div class="mdj-member">' +
              '<span class="mdj-chain-badge">' + esc((m.chain != null ? m.chain : 0) + '链') + '</span>' +
              memberAvatarHtml(m) +
              '<div class="mdj-member-name">' + esc(m.name || ('角色' + (i + 1))) + '</div>' +
              '<div class="mdj-member-line"></div>' +
              '<div class="mdj-member-weapon">' +
              '<span class="mdj-weapon-prefix">武器</span>' +
              weaponIconHtml(wDef) +
              '<span class="mdj-weapon-name">' + esc(wName || '未填写') + (wName ? ' · R' + (m.refine || 1) : '') + '</span>' +
              '</div>' +
              renderEchoConfigDetail(cfg) +
              '</div>'
            );
          })
          .join('')
      : '<p class="mx-muted">无队伍信息</p>';
    var authorHtml =
      it.is_self && it.profiles
        ? '<span class="mdj-author-row">' +
          uploaderAvatarHtml(it.profiles) +
          '<span class="mdj-author-name">' + esc(it.profiles.display_name || '用户') + '</span>' +
          '</span>'
        : '';
    var overlay = document.createElement('div');
    overlay.className = 'ecm-overlay matrix-detail-overlay';
    overlay.innerHTML =
      '<div class="mdj-wrap">' +
      '<button type="button" class="mdj-close" data-matrix-detail-close aria-label="关闭">×</button>' +
      '<div class="matrix-detail md-jade" role="dialog" aria-label="矩阵数据详情">' +
      '<span class="mdj-corner is-tl"></span>' +
      '<span class="mdj-corner is-tr"></span>' +
      '<span class="mdj-corner is-bl"></span>' +
      '<span class="mdj-corner is-br"></span>' +
      '<div class="mdj-body">' +
      '<div class="mdj-top">' +
      '<div class="mdj-brand">' +
      '<span class="mdj-brand-cn">鳴算屋</span>' +
      '<span class="mdj-brand-en">WAVECALC</span>' +
      '<span class="mdj-seal"><span class="mdj-seal-char">鳴</span></span>' +
      '</div>' +
      '<div class="mdj-stats">' +
      '<div class="mdj-stat"><b class="mdj-score">' + fmtNum(it.matrix_score) + '</b><span>矩阵分数</span></div>' +
      '<i class="mdj-dot"></i>' +
      '<div class="mdj-stat"><b>' + (it.season ? 'S' + esc(it.season) : '-') + '</b><span>赛季</span></div>' +
      '<i class="mdj-dot"></i>' +
      '<div class="mdj-stat"><b>' + (it.stage ? '第' + esc(it.stage) + '阶段' : '-') + '</b><span>阶段</span></div>' +
      '<i class="mdj-dot"></i>' +
      '<div class="mdj-stat"><b>' + (it.round_no ? '第' + esc(it.round_no) + '轮' : '-') + '</b><span>轮次</span></div>' +
      '</div>' +
      '<div class="mdj-meta">' +
      authorHtml +
      (it.boss ? '<span class="mdj-boss">' + esc(it.boss) + '</span>' : '') +
      (it.record_code ? '<span class="mdj-muted">编码 ' + esc(it.record_code) + '</span>' : '') +
      '<span class="mdj-muted">UID: ' + esc(it.player_uid) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="mdj-divider"></div>' +
      '<div class="mdj-members">' + memberHtml + '</div>' +
      '<div class="mdj-divider"></div>' +
      '<div class="mdj-foot">' +
      '<span class="mdj-time">' + esc(fmtTime(it.created_at)) + '</span>' +
      '<span class="mdj-watermark">鳴算屋</span>' +
      '<span class="mdj-domain">wavcalc.cn</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-matrix-detail-close]') || e.target.hasAttribute('data-matrix-detail-overlay')) {
        overlay.remove();
      }
    });
  }

  var MATRIX_REPORT_REASONS = [
    ['分数虚报', '实际成绩与所填分数不符'],
    ['配置虚假', '角色/武器/声骸配置与实际情况不符'],
    ['其他', '其他问题'],
  ];
  var matrixReportOverlay = null;

  function closeMatrixReport() {
    if (matrixReportOverlay) {
      matrixReportOverlay.remove();
      matrixReportOverlay = null;
    }
  }

  async function openMatrixReport(idx) {
    var it = matrixItems[Number(idx)];
    if (!it) return;
    if (!window.Cloud || typeof Cloud.getUser !== 'function' || !Cloud.getUser()) {
      if (await DialogKit.confirm({ message: '举报需要先登录，现在去登录吗？' })) {
        if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      }
      return;
    }
    closeMatrixReport();
    var overlay = document.createElement('div');
    overlay.className = 'pdb-report-overlay';
    overlay.setAttribute('data-matrix-report-overlay', '');
    overlay.innerHTML =
      '<div class="pdb-report-dialog" role="dialog" aria-modal="true" aria-labelledby="matrixReportTitle">' +
      '<div class="pdb-report-head">' +
      '<strong id="matrixReportTitle">举报矩阵数据</strong>' +
      '<button type="button" class="pdb-report-close" data-matrix-report-close aria-label="关闭">✕</button>' +
      '</div>' +
      '<div class="pdb-report-target">《矩阵数据 · ' + fmtNum(it.matrix_score) + ' 分' + (it.boss ? ' · ' + esc(it.boss) : '') + '》</div>' +
      '<div class="pdb-report-reasons">' +
      MATRIX_REPORT_REASONS.map(function (r, i) {
        return (
          '<label class="pdb-report-reason">' +
          '<input type="radio" name="matrix-report-reason" value="' + esc(r[0]) + '"' + (i === 0 ? ' checked' : '') + ' />' +
          '<span class="pdb-report-reason-name">' + esc(r[0]) + '</span>' +
          '<span class="pdb-report-reason-hint">' + esc(r[1]) + '</span>' +
          '</label>'
        );
      }).join('') +
      '</div>' +
      '<textarea class="pdb-report-detail" data-matrix-report-detail placeholder="补充说明（选填，500 字以内）" maxlength="500"></textarea>' +
      '<div class="pdb-report-actions">' +
      '<button type="button" class="pdb-report-btn" data-matrix-report-cancel>取消</button>' +
      '<button type="button" class="pdb-report-btn is-primary" data-matrix-report-submit>提交举报</button>' +
      '</div>' +
      '</div>';
    overlay._matrixId = it.id;
    document.body.appendChild(overlay);
    matrixReportOverlay = overlay;
  }

  async function submitMatrixReport() {
    if (!matrixReportOverlay) return;
    var reasonEl = matrixReportOverlay.querySelector('input[name="matrix-report-reason"]:checked');
    var detailEl = matrixReportOverlay.querySelector('[data-matrix-report-detail]');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    var detail = detailEl ? detailEl.value.trim() : '';
    var btn = matrixReportOverlay.querySelector('[data-matrix-report-submit]');
    if (!reason) {
      window.alert('请选择举报原因');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = '提交中…';
    }
    try {
      await Cloud.api('/reports', {
        method: 'POST',
        auth: true,
        body: { targetType: 'matrix', targetId: matrixReportOverlay._matrixId, reason: reason, detail: detail },
      });
      closeMatrixReport();
      window.alert('举报已提交，管理员会尽快核实处理，感谢反馈！');
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '提交举报';
      }
      window.alert('举报提交失败：' + (e.message || '未知错误'));
    }
  }

  function renderShell() {
    var page = document.getElementById('matrixPage');
    if (!page) return;
    page.innerHTML = `
      <div class="matrix-shell">
        <header class="matrix-head">
          <div>
            <h1 class="matrix-title">矩阵数据</h1>
            <p class="matrix-sub">上传与浏览矩阵数据 · 支持本人/代传</p>
          </div>
          <button type="button" class="matrix-back" data-matrix-back>← 返回计算器</button>
        </header>

        <div class="matrix-tabs">
          <button type="button" class="matrix-tab is-active" data-matrix-tab="public">数据统计</button>
          <button type="button" class="matrix-tab" data-matrix-tab="mine">我的上传</button>
          <button type="button" class="matrix-upload-btn" data-matrix-open-upload>上传数据</button>
        </div>

        <section class="matrix-section">
          <h2 class="matrix-section-title">数据统计</h2>
          <div class="matrix-toolbar">
            <div class="matrix-search-row">
              ${renderTeamCfgFilter()}
              ${renderFilterCharPicker()}
            </div>
            <div class="matrix-filter-block">
              <div class="matrix-filter-grid">
                <label class="matrix-filter-field">
                  <span>赛季</span>
                  <select data-matrix-filter-phase-season>
                    <option value="2" selected>S2</option>
                  </select>
                </label>
                <label class="matrix-filter-field">
                  <span>阶段</span>
                  <select data-matrix-filter-stage>
                    <option value="">全部</option>
                    <option value="1">第一阶段</option>
                    <option value="2">第二阶段</option>
                    <option value="3">第三阶段</option>
                  </select>
                </label>
                <label class="matrix-filter-field">
                  <span>当期增益</span>
                  ${renderBuffTypePicker(filterState.buffType, 'filter')}
                </label>
                <label class="matrix-filter-field">
                  <span>轮次</span>
                  <select data-matrix-filter-round>
                    <option value="">全部</option>
                    <option value="1">R1</option>
                    <option value="2">R2</option>
                    <option value="3">R3</option>
                    <option value="4">R4</option>
                    <option value="5">R5</option>
                    <option value="6">R6</option>
                    <option value="7">R7</option>
                    <option value="8">R8</option>
                    <option value="9">R9</option>
                  </select>
                </label>
                <label class="matrix-filter-field">
                  <span>流程</span>
                  <select data-matrix-filter-flow>
                    <option value="">全部</option>
                    <option value="全局特化">全局特化</option>
                    <option value="正常循环">正常循环</option>
                  </select>
                </label>
                <label class="matrix-filter-field">
                  <span>排序</span>
                  <select data-matrix-filter-sort>
                    <option value="time">时间（最新）</option>
                    <option value="score">分数（高→低）</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div class="matrix-list" data-matrix-public-list><div class="ui-loading" aria-label="加载中"><span class="ui-loading-bar"></span><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div></div>
        </section>

        <section class="matrix-section" data-matrix-mine-section hidden>
          <h2 class="matrix-section-title">我的上传</h2>
          <div class="matrix-list" data-matrix-mine-list></div>
        </section>
      </div>`;
  }

  async function loadPublic() {
    var listEl = $('[data-matrix-public-list]');
    if (!listEl) return;
    var token = ++publicLoadToken;
    try {
      var roundSel = $('[data-matrix-filter-round]');
      var flowSel = $('[data-matrix-filter-flow]');
      var phaseSeasonSel = $('[data-matrix-filter-phase-season]');
      var stageSel = $('[data-matrix-filter-stage]');
      var sortSel = $('[data-matrix-filter-sort]');
      var round = roundSel ? roundSel.value : '';
      var flow = flowSel ? flowSel.value : '';
      var phaseSeason = phaseSeasonSel ? phaseSeasonSel.value : '';
      var stage = stageSel ? stageSel.value : '';
      var sort = sortSel ? sortSel.value : 'time';
      var buffType = filterState.buffType || '';
      var qs = 'limit=100';
      if (sort === 'score') qs += '&sort=score';
      if (phaseSeason) {
        qs += '&season=' + encodeURIComponent(phaseSeason);
      }
      if (round) qs += '&round=' + encodeURIComponent(round);
      if (flow) qs += '&flowType=' + encodeURIComponent(flow);
      if (stage) qs += '&stage=' + encodeURIComponent(stage);
      if (buffType) qs += '&buffType=' + encodeURIComponent(buffType);
      var data = await Cloud.api('/matrix-scores?' + qs);
      if (token !== publicLoadToken) return; // 已被更新请求取代，丢弃本次结果
      matrixRawItems = data.items || [];
      applyClientFilters();
    } catch (e) {
      if (token !== publicLoadToken) return;
      listEl.innerHTML = '<div class="ui-empty"><span class="ui-empty-icon">⚠</span><div class="ui-empty-title">加载失败</div><div class="ui-empty-desc">' + esc(e.message) + '</div></div>';
    }
  }

  async function loadMine() {
    var listEl = $('[data-matrix-mine-list]');
    if (!listEl) return;
    if (!window.Cloud || !Cloud.getUser || !Cloud.getUser()) {
      listEl.innerHTML = '<div class="ui-empty"><span class="ui-empty-icon">◌</span><div class="ui-empty-title">登录后查看你的上传</div></div>';
      return;
    }
    try {
      var data = await Cloud.api('/my/matrix-scores', { auth: true });
      var items = data.items || [];
      listEl.innerHTML = items.length
        ? items.map(renderCard).join('')
        : '<div class="ui-empty"><span class="ui-empty-icon">◫</span><div class="ui-empty-title">你还没有上传过数据</div><div class="ui-empty-desc">上传后的矩阵数据会显示在这里。</div></div>';
      matrixItems = items;
    } catch (e) {
      listEl.innerHTML = '<div class="ui-empty"><span class="ui-empty-icon">⚠</span><div class="ui-empty-title">加载失败</div><div class="ui-empty-desc">' + esc(e.message) + '</div></div>';
    }
  }

  async function loadEchoProfiles() {
    if (!window.Cloud || !Cloud.getUser || !Cloud.getUser()) {
      echoProfiles = [];
      fillEchoProfileSelects();
      return;
    }
    try {
      var data = await Cloud.api('/my/echo-profiles', { auth: true });
      echoProfiles = data.items || [];
      fillEchoProfileSelects();
    } catch (e) {
      echoProfiles = [];
      fillEchoProfileSelects();
    }
  }

  function applyEchoProfile(slotIndex, id) {
    var p = echoProfiles.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var counts = p.echo_counts || {};
    var chars = Array.isArray(p.chars) ? p.chars : [];
    var c = chars[0];
    var idx = Number(slotIndex);
    if (c && c.echoConfig) {
      echoConfigs[idx] = c.echoConfig;
    }
    var echoInput = $('[data-member-echo="' + idx + '"]');
    if (echoInput) {
      var n = 0;
      if (c && c.name && counts[c.name] != null) n = counts[c.name];
      else if (counts[''] != null) n = counts[''];
      else n = echoSubCount(c && c.echoConfig);
      echoInput.value = n || '';
    }
    renderPickerInModal();
  }

  function collectForm() {
    var activeTab = $('[data-matrix-self-tab].is-active');
    var isSelf = !activeTab || activeTab.dataset.matrixSelfTab !== 'proxy';
    var uid = $('[data-matrix-uid]').value.trim();
    var score = Number($('[data-matrix-score]').value);
    var season = 2;
    var stage = 1;
    var buffType = uploadBuffType;
    var round = Number($('[data-matrix-round]').value) || 1;
    var boss = $('[data-matrix-boss]').value.trim();
    var flow = $('[data-matrix-flow]') ? $('[data-matrix-flow]').value : '';
    var video = $('[data-matrix-video]').value.trim();
    var name = $('[data-matrix-name]').value.trim();
    var members = [0, 1, 2]
      .map(function (i) {
        var id = charPickerState.slots[i];
        var w = memberWeapons[i] || {};
        var chainEl = $('[data-member-chain="' + i + '"]');
        return {
          name: id ? charNameById(id) : '',
          charId: id ? String(id) : '',
          chain: chainEl ? Number(chainEl.value) || 0 : 0,
          refine: Number(w.refine) || 1,
          weaponId: w.id ? String(w.id) : '',
        };
      })
      .filter(function (m) {
        return m.name;
      });
    var echoQuality = {};
    [0, 1, 2].forEach(function (i) {
      var id = charPickerState.slots[i];
      var memberName = id ? charNameById(id) : '';
      if (memberName) {
        var echoEl = $('[data-member-echo="' + i + '"]');
        var c = echoEl ? Number(echoEl.value) : 0;
        if (Number.isFinite(c) && c > 0) echoQuality[memberName] = { count: c };
      }
    });
    return { isSelf: isSelf, uid: uid, name: name, score: score, season: season, stage: stage, buffType: buffType, round: round, boss: boss, flow: flow, video: video, members: members, echoQuality: echoQuality };
  }

  async function submit() {
    if (!window.Cloud || !Cloud.getUser || !Cloud.getUser()) {
      setStatus('请先登录后上传', true);
      if (window.Cloud && typeof Cloud.open === 'function') Cloud.open('auth');
      return;
    }
    var f = collectForm();
    if (!f.uid) {
      setStatus('请填写账号 UID', true);
      return;
    }
    if (!Number.isFinite(f.score) || f.score < 0) {
      setStatus('请填写有效的矩阵分数', true);
      return;
    }
    if (!f.buffType) {
      setStatus('请选择当期增益', true);
      return;
    }
    if (!f.boss) {
      setStatus('请选择开局 Boss', true);
      return;
    }
    if (!f.video) {
      setStatus('请填写视频链接', true);
      return;
    }
    if (!/^https?:\/\//i.test(f.video)) {
      setStatus('视频链接需以 http(s):// 开头', true);
      return;
    }
    if (!f.isSelf && !f.name) {
      setStatus('代为上传请填写玩家名', true);
      return;
    }
    if (!f.members.length) {
      setStatus('请先选择队伍角色', true);
      return;
    }
    var btn = $('[data-matrix-submit]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '提交中…';
    }
    try {
      await Cloud.api('/matrix-scores', {
        method: 'POST',
        auth: true,
        body: {
          isSelf: f.isSelf,
          playerUid: f.uid,
          playerName: f.name,
          matrixScore: f.score,
          season: f.season,
          stage: f.stage,
          buffType: f.buffType,
          roundNo: f.round,
          boss: f.boss,
          members: f.members,
          echoQuality: f.echoQuality,
          echoConfigs: echoConfigs,
          videoUrl: f.video,
        },
      });
      setStatus('数据已发布', false);
      closeUploadModal();
      void loadPublic();
      void loadMine();
      if (window.WaveCalcProfile && typeof WaveCalcProfile.refreshMatrix === 'function') {
        WaveCalcProfile.refreshMatrix();
      }
    } catch (e) {
      setStatus('提交失败：' + (e.message || '未知错误'), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '提交数据';
      }
    }
  }

  function bind() {
    document.body.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav-matrix]');
      if (nav) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        return;
      }
      if (e.target.closest('[data-matrix-back]')) {
        setOpen(false);
        return;
      }
      if (!isOpen()) return;
      var tab = e.target.closest('[data-matrix-tab]');
      if (tab) {
        var which = tab.dataset.matrixTab;
        $$('[data-matrix-tab]').forEach(function (t) {
          t.classList.toggle('is-active', t === tab);
        });
        var pub = $('[data-matrix-public-list]');
        var mine = $('[data-matrix-mine-list]');
        var mineSection = $('[data-matrix-mine-section]');
        if (pub) pub.closest('.matrix-section').hidden = which !== 'public';
        if (mineSection) mineSection.hidden = which !== 'mine';
        if (which === 'mine') void loadMine();
        return;
      }
      if (e.target.closest('[data-matrix-open-upload]')) {
        openUploadModal();
        return;
      }
      var matrixDetail = e.target.closest('[data-matrix-detail]');
      if (matrixDetail) {
        openMatrixDetail(Number(matrixDetail.dataset.matrixDetail));
        return;
      }
      var matrixReportBtn = e.target.closest('[data-matrix-report]');
      if (matrixReportBtn) {
        openMatrixReport(Number(matrixReportBtn.dataset.matrixReport));
        return;
      }
      if (e.target.closest('[data-matrix-report-submit]')) {
        void submitMatrixReport();
        return;
      }
      if (e.target.closest('[data-matrix-report-cancel]') || e.target.closest('[data-matrix-report-close]')) {
        closeMatrixReport();
        return;
      }
      if (e.target.hasAttribute('data-matrix-report-overlay')) {
        closeMatrixReport();
        return;
      }
      if (e.target.closest('[data-matrix-modal-close]')) {
        closeUploadModal();
        return;
      }
      if (
        e.target.closest('[data-matrix-modal-overlay]') &&
        e.target.hasAttribute('data-matrix-modal-overlay')
      ) {
        closeUploadModal();
        return;
      }
      var buffTrigger = e.target.closest('[data-buff-trigger], [data-buff-filter-trigger]');
      if (buffTrigger) {
        var buffPicker = buffTrigger.closest('[data-buff-picker], [data-buff-filter-picker]');
        if (buffPicker) {
          var panel = buffPicker.querySelector('.mx-buff-panel');
          if (panel) panel.hidden = !panel.hidden;
          $$('.mx-buff-panel').forEach(function (p) {
            if (p !== panel) p.hidden = true;
          });
        }
        return;
      }
      var buffOpt = e.target.closest('[data-buff-opt], [data-buff-filter-opt]');
      if (buffOpt) {
        var isFilter = !!e.target.closest('[data-buff-filter-opt]');
        var val = buffOpt.dataset.buffOpt != null ? buffOpt.dataset.buffOpt : buffOpt.dataset.buffFilterOpt;
        var picker2 = buffOpt.closest('[data-buff-picker], [data-buff-filter-picker]');
        var panel2 = picker2 ? picker2.querySelector('.mx-buff-panel') : null;
        if (panel2) panel2.hidden = true;
        if (isFilter) {
          filterState.buffType = val || '';
          schedulePublicLoad();
        } else {
          uploadBuffType = val || '';
          var uploadPicker = $('[data-buff-picker]');
          if (uploadPicker) uploadPicker.outerHTML = renderBuffTypePicker(uploadBuffType);
        }
        return;
      }
      if (!e.target.closest('[data-buff-picker], [data-buff-filter-picker]')) {
        $$('.mx-buff-panel').forEach(function (p) {
          p.hidden = true;
        });
      }
      var echoToggle = e.target.closest('[data-echo-toggle]');
      if (echoToggle) {
        var idx = echoToggle.dataset.echoToggle;
        var picker = echoToggle.closest('[data-mx-char-picker]');
        var body = picker ? picker.querySelector('[data-echo-body="' + idx + '"]') : $('[data-echo-body="' + idx + '"]');
        var caret = picker ? picker.querySelector('[data-echo-caret="' + idx + '"]') : $('[data-echo-caret="' + idx + '"]');
        if (body) {
          var open = body.hidden;
          body.hidden = !open;
          if (caret) caret.textContent = open ? '▾' : '▸';
        }
        return;
      }
      var weaponPick = e.target.closest('[data-mx-weapon-pick]');
      if (weaponPick) {
        openWeaponPicker(Number(weaponPick.dataset.mxWeaponPick));
        return;
      }
      var charPick = e.target.closest('[data-mx-char-pick]');
      if (charPick) {
        var cid = charPick.dataset.mxCharPick;
        var idx2 = charPickerState.slots.indexOf(cid);
        if (idx2 >= 0) {
          charPickerState.slots[idx2] = '';
        } else {
          var emptyIdx = charPickerState.slots.indexOf('');
          if (emptyIdx >= 0) charPickerState.slots[emptyIdx] = cid;
        }
        renderPickerInModal();
        return;
      }
      var charRemove = e.target.closest('[data-mx-char-remove]');
      if (charRemove) {
        var rid = charRemove.dataset.mxCharRemove;
        var ri = charPickerState.slots.indexOf(rid);
        if (ri >= 0) charPickerState.slots[ri] = '';
        renderPickerInModal();
        return;
      }
      var elTile = e.target.closest('[data-mx-el-tile]');
      if (elTile) {
        var key = elTile.dataset.mxElTile;
        charPickerState.elementPanel = charPickerState.elementPanel === key ? '' : key;
        renderPickerInModal();
        return;
      }
      var slotOpen = e.target.closest('[data-mx-slot-open]');
      if (slotOpen) {
        charPickerState.elementPanel = 'all';
        renderPickerInModal();
        return;
      }
      if (e.target.closest('[data-mx-panel-close]')) {
        charPickerState.elementPanel = '';
        renderPickerInModal();
        return;
      }
      var filterPreset = e.target.closest('[data-mx-filter-preset]');
      if (filterPreset) {
        filterState.teamSlots = String(filterPreset.dataset.mxFilterPreset || '').split('|');
        while (filterState.teamSlots.length < 3) filterState.teamSlots.push('');
        applyClientFilterChange();
        return;
      }
      var filterSlotOpen = e.target.closest('[data-mx-filter-slot-open]');
      if (filterSlotOpen) {
        filterState.elementPanel = 'all';
        refreshFilterPanels();
        return;
      }
      var filterCharPick = e.target.closest('[data-mx-filter-char-pick]');
      if (filterCharPick) {
        var fcid = filterCharPick.dataset.mxFilterCharPick;
        var fIdx = filterState.charSlots.indexOf(fcid);
        if (fIdx >= 0) {
          filterState.charSlots[fIdx] = '';
        } else {
          var fEmpty = filterState.charSlots.indexOf('');
          if (fEmpty >= 0) filterState.charSlots[fEmpty] = fcid;
        }
        applyClientFilterChange();
        return;
      }
      var filterCharRemove = e.target.closest('[data-mx-filter-char-remove]');
      if (filterCharRemove) {
        var frId = filterCharRemove.dataset.mxFilterCharRemove;
        var frIdx = filterState.charSlots.indexOf(frId);
        if (frIdx >= 0) filterState.charSlots[frIdx] = '';
        applyClientFilterChange();
        return;
      }
      var filterElTile = e.target.closest('[data-mx-filter-el-tile]');
      if (filterElTile) {
        var fKey = filterElTile.dataset.mxFilterElTile;
        filterState.elementPanel = filterState.elementPanel === fKey ? '' : fKey;
        refreshFilterPanels();
        return;
      }
      if (e.target.closest('[data-mx-filter-panel-close]')) {
        filterState.elementPanel = '';
        refreshFilterPanels();
        return;
      }
      var selfTab = e.target.closest('[data-matrix-self-tab]');
      if (selfTab) {
        var isProxy = selfTab.dataset.matrixSelfTab === 'proxy';
        $$('[data-matrix-self-tab]').forEach(function (t) {
          t.classList.toggle('is-active', t === selfTab);
        });
        var nameInput = $('[data-matrix-name]');
        if (nameInput) {
          nameInput.disabled = !isProxy;
          nameInput.placeholder = isProxy ? '填写被代传的玩家名（必填）' : '本人（无需填写）';
          if (!isProxy) nameInput.value = '';
        }
        var req = $('[data-matrix-name-req]');
        if (req) req.hidden = !isProxy;
        return;
      }
      if (e.target.closest('[data-matrix-submit]')) {
        void submit();
        return;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('[data-matrix-modal-overlay]')) {
        closeUploadModal();
      }
    });
    document.body.addEventListener('change', function (e) {
      var sel = e.target.closest('[data-echo-profile-select]');
      if (sel && sel.value) {
        applyEchoProfile(sel.dataset.echoProfileSelect, sel.value);
        return;
      }
      if (
        e.target.closest('[data-matrix-filter-phase-season]') ||
        e.target.closest('[data-matrix-filter-stage]') ||
        e.target.closest('[data-matrix-filter-round]') ||
        e.target.closest('[data-matrix-filter-flow]') ||
        e.target.closest('[data-matrix-filter-sort]')
      ) {
        if (isOpen()) schedulePublicLoad();
        return;
      }
      var fChain = e.target.closest('[data-mx-filter-chain]');
      var fRefine = e.target.closest('[data-mx-filter-refine]');
      if (fChain || fRefine) {
        var slotIdx = Number(fChain ? fChain.dataset.mxFilterChain : fRefine.dataset.mxFilterRefine);
        var cur = parseFilterSlotKey(filterState.teamSlots[slotIdx]) || { chain: '', refine: '' };
        var chain = fChain ? fChain.value : cur.chain;
        var refine = fRefine ? fRefine.value : cur.refine;
        if (chain === '' && refine === '') {
          filterState.teamSlots[slotIdx] = '';
        } else {
          filterState.teamSlots[slotIdx] = (chain === '' ? 0 : chain) + '+' + (refine === '' ? 1 : refine);
        }
        applyClientFilterChange();
      }
    });
  }

  function boot() {
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.Matrix = {
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    isOpen: isOpen,
    refresh: function () {
      if (isOpen()) void loadPublic();
      if (window.WaveCalcProfile && typeof WaveCalcProfile.refreshMatrix === 'function') {
        WaveCalcProfile.refreshMatrix();
      }
    },
  };
})();
