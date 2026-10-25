/*!
 * wavecalc-overlay.js — 鸣算屋独立补丁层
 * 作用：右键加入/移出特殊技能计算、加强音协同攻击、特殊技能效应属性减抗等逻辑，
 * 不受 UI 同步覆盖 ui.js/buff-templates.js 影响（由 nginx 注入页面加载）。
 * 幂等：若基础文件已含对应补丁，则自动跳过或安全叠加。
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function apply() {
    var w = window;
    if (!w || typeof w.document === 'undefined') return;
    // 应用内部全局为块级 const（state/ui/EFFECT_TYPE_ELEMENT 等），需用裸标识符访问
    var S = function () {
      try { return typeof state !== 'undefined' ? state : null; } catch (e) { return null; }
    };
    var UI = function () {
      try { return typeof ui !== 'undefined' ? ui : null; } catch (e) { return null; }
    };
    var E2E = function () {
      try { return typeof EFFECT_TYPE_ELEMENT !== 'undefined' ? EFFECT_TYPE_ELEMENT : null; } catch (e) { return null; }
    };
    var REG_KEY = 'wc_manual_special_adds_v1';
    var loadReg = function () {
      try {
        var raw = localStorage.getItem(REG_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    };
    var saveReg = function (arr) {
      try { localStorage.setItem(REG_KEY, JSON.stringify(arr)); } catch (e) {}
    };
    var RES_CATS = ['generalResReduce', 'typeResReduce', 'elementResReduce'];
    var DEF_CATS = ['generalDefense', 'elementDefense', 'typeDefense'];

    // ---------- 1. 右键菜单（全局捕获 + 鼠标右键兜底，双保险） ----------
    if (!w.__wcBuffMenuInstalled) {
      var OVERLAY_VER = 'v12';
      w.__wcOverlayVersion = OVERLAY_VER;

      w.closeBuffStatContextMenu = function () {
        var list = document.querySelectorAll('.buff-stat-context-menu[data-buff-stat-menu]');
        for (var i = 0; i < list.length; i++) list[i].remove();
      };

      w.onBuffStatContextMenuClick = function (e) {
        var addBtn = e.target.closest('[data-buff-special-add]');
        if (addBtn) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          var mi = parseInt(addBtn.dataset.buffSpecialMember, 10);
          var id = addBtn.dataset.buffSpecialAdd;
          w.closeBuffStatContextMenu();
          var ok =
            typeof w.addPersonalBuffToSpecialSkill === 'function'
              ? w.addPersonalBuffToSpecialSkill(mi, id)
              : false;
          if (typeof w.render === 'function') w.render();
          var uiObj = UI();
          if (uiObj) uiObj.message = ok ? '已加入特殊技能计算，可在「特殊技能」页勾选使用' : '加入失败：未找到该 Buff';
          return;
        }
        var rmBtn = e.target.closest('[data-buff-special-remove]');
        if (rmBtn) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          var mi2 = parseInt(rmBtn.dataset.buffSpecialMember, 10);
          var id2 = rmBtn.dataset.buffSpecialRemove;
          w.closeBuffStatContextMenu();
          var ok2 =
            typeof w.removePersonalBuffFromSpecialSkill === 'function'
              ? w.removePersonalBuffFromSpecialSkill(mi2, id2)
              : false;
          if (typeof w.render === 'function') w.render();
          var uiObj2 = UI();
          if (uiObj2) uiObj2.message = ok2 ? '已从特殊技能计算移除' : '未找到可移除的条目';
        }
      };

      w.onBuffStatContextMenu = function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          // 计算页/对照表（阶段卡、批量选中、叠层）区域：不拦截右键，
          // 避免「加入特殊技能计算」菜单与「批量叠层」等菜单重叠
          if (
            t.closest(
              '.phase[data-phase], [data-phase-batch-panel], .phase-batch-matrix, .phase-batch-buff-panel'
            )
          )
            return;
          // 任何 Buff 相关区域内的右键都拦截：具体 Buff 元素 → 精确菜单；区域内其它位置 → 提示菜单
          var item = t.closest(
            '.stat-item[data-buff-chip-id], [data-buff-game-text-id], [data-buff-id], .buff-chip, .buff-grid__buff-head, ' +
            '.setup-panel-buff-stats, .setup-panel-buff, .buff-check-member-col, .scrollable-buff-area, .buff-grid, ' +
            '.stat-card, .buff-check-team, .team-buff-assign, .calc-check-page, .buff-check-page'
          );
          if (!item) return;
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          w.closeBuffStatContextMenu();
          var st = S();
          var memberIndex = -1;
          var buffId =
            item.getAttribute('data-buff-chip-id') ||
            item.getAttribute('data-buff-game-text-id') ||
            item.getAttribute('data-buff-id') ||
            '';
          var source = null;
          var isPersonal = false;
          var memberEl = item.closest('[data-setup-member]');
          if (memberEl) memberIndex = parseInt(memberEl.dataset.setupMember, 10);
          if (buffId && st && st.members) {
            var scanStart = memberIndex >= 0 && memberIndex < st.members.length ? memberIndex : 0;
            for (var k = 0; k < st.members.length; k++) {
              var mi = (scanStart + k) % st.members.length;
              var mb = st.members[mi].buffs || [];
              for (var q = 0; q < mb.length; q++) {
                if (mb[q].id === buffId) { source = mb[q]; memberIndex = mi; isPersonal = true; break; }
              }
              if (source) break;
            }
          }
          if (!source && buffId && typeof w.findBuffByIdAnywhere === 'function') {
            source = w.findBuffByIdAnywhere(buffId);
          }
          var displayName = source
            ? (typeof w.formatBuffDisplayName === 'function' ? w.formatBuffDisplayName(source) : (source.name || 'Buff'))
            : (item.getAttribute('data-buff-name') || (item.textContent || '').trim().slice(0, 24) || 'Buff');
          var menu = document.createElement('div');
          menu.className = 'context-menu buff-stat-context-menu';
          menu.setAttribute('data-buff-stat-menu', '1');
          var body;
          if (!source) {
            body =
              '<div class="context-menu-item is-disabled" disabled aria-disabled="true" role="menuitem"><span class="context-menu-icon" aria-hidden="true">ℹ</span><span>请在具体 Buff 条目上右键（如「泛用增伤 +60%」那行）</span></div>' +
              '<div class="context-menu-item is-disabled" disabled aria-disabled="true" role="menuitem"><span class="context-menu-icon" aria-hidden="true">✚</span><span>也可以到「特殊技能」页手动添加 Buff</span></div>';
          } else if (!isPersonal) {
            body = '<button type="button" class="context-menu-item is-disabled" disabled aria-disabled="true" role="menuitem"><span class="context-menu-icon" aria-hidden="true">✓</span><span>全队 Buff（已自动生效，无需手动添加）</span></button>';
          } else {
            var specialState =
              typeof w.getPersonalBuffSpecialState === 'function'
                ? w.getPersonalBuffSpecialState(memberIndex, buffId)
                : null;
            if (specialState === 'manual') {
              body = '<button type="button" class="context-menu-item danger" data-buff-special-remove="' + esc(buffId) + '" data-buff-special-member="' + memberIndex + '" role="menuitem"><span class="context-menu-icon" aria-hidden="true">✖</span><span>移出特殊技能计算</span></button>';
            } else if (specialState === 'auto') {
              body = '<button type="button" class="context-menu-item is-disabled" disabled aria-disabled="true" role="menuitem"><span class="context-menu-icon" aria-hidden="true">✓</span><span>已在特殊技能计算（自动同步）</span></button>';
            } else {
              body = '<button type="button" class="context-menu-item" data-buff-special-add="' + esc(buffId) + '" data-buff-special-member="' + memberIndex + '" role="menuitem"><span class="context-menu-icon" aria-hidden="true">＋</span><span>加入特殊技能计算</span></button>';
            }
          }
          menu.innerHTML = '<div class="context-menu-title">' + esc(displayName) + '</div>' + body;
          // 内联兜底样式：即使注入样式表被 CSP/主题拦截，菜单依然可见
          menu.style.cssText =
            'position:fixed;z-index:2147483000;min-width:230px;max-width:330px;background:#181410;' +
            'border:1px solid #c9a84c;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.65);' +
            'padding:6px;color:#f0e8d8;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
            'box-sizing:border-box;display:block;visibility:visible;opacity:1;';
          document.body.appendChild(menu);
          menu.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8)) + 'px';
          menu.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8)) + 'px';
        } catch (err) {
          if (window.console && console.error) console.error('[overlay] onBuffStatContextMenu error:', err);
        }
      };

      // 注入样式：菜单最高层级，永不被浮层挡住
      try {
        var styleEl = document.createElement('style');
        styleEl.textContent =
          '.buff-stat-context-menu{' +
          'z-index:2147483000 !important;position:fixed;min-width:230px;max-width:330px;' +
          'background:#181410 !important;border:1px solid #c9a84c !important;border-radius:10px !important;' +
          'box-shadow:0 8px 32px rgba(0,0,0,.65) !important;padding:6px !important;margin:0 !important;' +
          'font-family:system-ui,-apple-system,"Segoe UI",sans-serif !important;color:#f0e8d8 !important;' +
          'box-sizing:border-box !important;display:block !important;visibility:visible !important;opacity:1 !important;' +
          '}' +
          '.buff-stat-context-menu .context-menu-title{' +
          'display:block;font-size:12px;font-weight:600;color:#c9a84c;padding:5px 9px 7px;' +
          'border-bottom:1px solid rgba(201,168,76,.28);margin:0 0 4px;word-break:break-all;line-height:1.4;' +
          '}' +
          '.buff-stat-context-menu .context-menu-item{' +
          'display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;' +
          'border-radius:6px;padding:7px 9px;margin:1px 0;font-size:13px;color:#f0e8d8;cursor:pointer;' +
          'line-height:1.4;box-sizing:border-box;' +
          '}' +
          '.buff-stat-context-menu .context-menu-item:hover:not(.is-disabled){background:rgba(201,168,76,.16);color:#fff;}' +
          '.buff-stat-context-menu .context-menu-item.is-disabled{opacity:.62;cursor:default;}' +
          '.buff-stat-context-menu .context-menu-icon{width:18px;text-align:center;flex:none;display:inline-block;}';
        document.head.appendChild(styleEl);
      } catch (err) {
        if (window.console && console.error) console.error('[overlay] style inject error:', err);
      }

      // 先绑定监听，最后才置 installed 标志（保证标志为 true 时监听一定已就绪）
      window.addEventListener('contextmenu', w.onBuffStatContextMenu, true);
      // 与编辑轴页右键菜单完全相同的绑定方式（document.body 冒泡）双保险
      document.body.addEventListener('contextmenu', w.onBuffStatContextMenu);
      window.addEventListener('mousedown', function (e) {
        if (e.button === 2) w.onBuffStatContextMenu(e);
      }, true);
      document.addEventListener('click', w.onBuffStatContextMenuClick);
      document.addEventListener(
        'pointerdown',
        function (e) {
          if (!e.target.closest('.buff-stat-context-menu')) w.closeBuffStatContextMenu();
        },
        true
      );
      w.__wcBuffMenuInstalled = true;
    }

    // ---------- 2. 手动加入/移出函数（仅当基础文件缺失时定义） ----------
    if (typeof w.getPersonalBuffSpecialState !== 'function') {
      w.getPersonalBuffSpecialState = function (memberIndex, buffId) {
        var st = S();
        var target =
          st && st.specialSkills && st.specialSkills.characters
            ? st.specialSkills.characters[memberIndex]
            : null;
        if (!target || !Array.isArray(target.buffs)) return null;
        var id = String(buffId || '');
        for (var i = 0; i < target.buffs.length; i++) {
          if (String(target.buffs[i].personalSourceId || '') === id) {
            return target.buffs[i].manualSpecialAdd ? 'manual' : 'auto';
          }
        }
        return null;
      };

      w.addPersonalBuffToSpecialSkill = function (memberIndex, buffId) {
        if (!Number.isInteger(memberIndex) || memberIndex < 0) return false;
        if (typeof w.ensureSpecialSkillsState === 'function') w.ensureSpecialSkillsState();
        var st = S();
        if (!st || !st.members) return false;
        var member = st.members[memberIndex];
        var target =
          st.specialSkills && st.specialSkills.characters
            ? st.specialSkills.characters[memberIndex]
            : null;
        if (!member || !target) return false;
        var source = null;
        var buffs = member.buffs || [];
        for (var i = 0; i < buffs.length; i++) {
          if (buffs[i].id === buffId) { source = buffs[i]; break; }
        }
        if (!source) return false;
        if (w.getPersonalBuffSpecialState(memberIndex, buffId) === 'manual') return true;
        if (!Array.isArray(target.buffs)) target.buffs = [];
        if (!target.globalBuffActive) target.globalBuffActive = {};
        if (!target.globalBuffStacks) target.globalBuffStacks = {};
        var payload =
          typeof w.mirrorPersonalBuffPayload === 'function'
            ? w.mirrorPersonalBuffPayload(source)
            : Object.assign({}, source);
        var entry = Object.assign(
          { id: typeof w.genId === 'function' ? w.genId() : 'manual_' + Date.now() },
          payload,
          { personalSourceId: String(source.id), manualSpecialAdd: true }
        );
        if (!entry.name) entry.name = source.name || 'Buff';
        target.buffs.push(entry);
        target.globalBuffActive[entry.id] = true;
        if (typeof w.isStackBuff === 'function' && w.isStackBuff(source)) {
          var norm = typeof w.normalizeStackInput === 'function' ? w.normalizeStackInput : function (x) { return Number(x) || 0; };
          target.globalBuffStacks[entry.id] = norm(
            (member.globalBuffStacks && member.globalBuffStacks[source.id]) || 0
          );
        }
        var reg = loadReg();
        var exists = reg.some(function (e) { return Number(e.mi) === Number(memberIndex) && String(e.srcId) === String(source.id); });
        if (!exists) {
          reg.push({ mi: memberIndex, srcId: String(source.id) });
          saveReg(reg);
        }
        if (typeof w.normalizeMemberBuffKeys === 'function') w.normalizeMemberBuffKeys(target);
        if (typeof w.scheduleSave === 'function') w.scheduleSave();
        return true;
      };

      w.removePersonalBuffFromSpecialSkill = function (memberIndex, buffId) {
        if (!Number.isInteger(memberIndex) || memberIndex < 0) return false;
        if (typeof w.ensureSpecialSkillsState === 'function') w.ensureSpecialSkillsState();
        var st = S();
        var target = st && st.specialSkills && st.specialSkills.characters ? st.specialSkills.characters[memberIndex] : null;
        if (!target || !Array.isArray(target.buffs)) return false;
        var id = String(buffId || '');
        var matches = [];
        for (var i = 0; i < target.buffs.length; i++) {
          var b = target.buffs[i];
          if (b.manualSpecialAdd && String(b.personalSourceId || '') === id) {
            matches.push(b);
          }
        }
        if (!matches.length) return false;
        matches.forEach(function (b) {
          if (typeof w.purgeMemberBuffReferences === 'function') w.purgeMemberBuffReferences(target, b.id);
          if (typeof w.purgeSpecialSkillItemBuffReferences === 'function') {
            w.purgeSpecialSkillItemBuffReferences(b.id, memberIndex);
          }
        });
        // purge 内部可能重建特殊角色状态，需重新读取最新 target 再过滤
        var st2 = S();
        var t2 = st2 && st2.specialSkills && st2.specialSkills.characters ? st2.specialSkills.characters[memberIndex] : null;
        if (!t2) return true;
        var dropIds = matches.map(function (b) { return b.id; });
        t2.buffs = (t2.buffs || []).filter(function (b) { return dropIds.indexOf(b.id) === -1; });
        saveReg(
          loadReg().filter(function (e) {
            return !(Number(e.mi) === Number(memberIndex) && String(e.srcId) === String(buffId));
          })
        );
        if (typeof w.normalizeMemberBuffKeys === 'function') w.normalizeMemberBuffKeys(t2);
        if (typeof w.scheduleSave === 'function') w.scheduleSave();
        return true;
      };
    }

    // ---------- 3. isSpecialAllowedBuff：放行手动加入条目 ----------
    if (typeof w.isSpecialAllowedBuff === 'function') {
      var origAllowed = w.isSpecialAllowedBuff;
      if (!origAllowed.__overlayWrapped) {
        w.isSpecialAllowedBuff = function (buff) {
          if (buff && buff.manualSpecialAdd) return true;
          return origAllowed.apply(this, arguments);
        };
        w.isSpecialAllowedBuff.__overlayWrapped = true;
      }
    }

    // ---------- 3b. 减抗/防御：默认同步进特殊技能（对应 buff-templates.js 补丁） ----------
    if (typeof w.isSpecialEffectBuffSource === 'function') {
      var origSES = w.isSpecialEffectBuffSource;
      if (!origSES.__overlayWrapped) {
        w.isSpecialEffectBuffSource = function (buff) {
          if (buff) {
            if (RES_CATS.indexOf(buff.category) !== -1) return true;
            if (DEF_CATS.indexOf(buff.category) !== -1) return true;
            if (Array.isArray(buff.effects)) {
              for (var i = 0; i < buff.effects.length; i++) {
                var fx = buff.effects[i];
                if (fx && (RES_CATS.indexOf(fx.zone) !== -1 || DEF_CATS.indexOf(fx.zone) !== -1)) return true;
              }
            }
          }
          return origSES.apply(this, arguments);
        };
        w.isSpecialEffectBuffSource.__overlayWrapped = true;
      }
    }

    // ---------- 3c. 同步后补回手动加入条目（registry 持久化） ----------
    if (typeof w.syncPersonalEffectBuffsToSpecialChar === 'function') {
      var origSync = w.syncPersonalEffectBuffsToSpecialChar;
      if (!origSync.__overlayWrapped) {
        w.syncPersonalEffectBuffsToSpecialChar = function (memberIndex) {
          var r = origSync.apply(this, arguments);
          try {
            var reg = loadReg();
            for (var i = 0; i < reg.length; i++) {
              var e = reg[i];
              if (Number(e.mi) !== Number(memberIndex)) continue;
              var st = S();
              var member = st && st.members ? st.members[memberIndex] : null;
              if (!member) continue;
              var src = null;
              for (var j = 0; j < (member.buffs || []).length; j++) {
                if (String(member.buffs[j].id) === String(e.srcId)) { src = member.buffs[j]; break; }
              }
              if (src && typeof w.addPersonalBuffToSpecialSkill === 'function') {
                w.addPersonalBuffToSpecialSkill(memberIndex, e.srcId);
              }
            }
          } catch (err) {
            /* 忽略 */
          }
          return r;
        };
        w.syncPersonalEffectBuffsToSpecialChar.__overlayWrapped = true;
      }
    }

    // ---------- 4. 加强音：同时视为协同攻击 ----------
    if (typeof w.skillNameCountsAsCoordAttack === 'function') {
      var origCoord = w.skillNameCountsAsCoordAttack;
      if (!origCoord.__overlayWrapped) {
        w.skillNameCountsAsCoordAttack = function (name) {
          var n = String(name || '').trim();
          if (n.indexOf('加强音') !== -1) return true;
          return origCoord.apply(this, arguments);
        };
        w.skillNameCountsAsCoordAttack.__overlayWrapped = true;
      }
    }

    // ---------- 5. 特殊技能效应按属性匹配减抗 ----------
    if (
      typeof w.calcSpecialFactorZones === 'function' &&
      E2E() &&
      typeof w.sumActiveResReduce === 'function'
    ) {
      var origZones = w.calcSpecialFactorZones;
      if (!origZones.__overlayWrapped) {
        w.calcSpecialFactorZones = function (active, buffs, stacks, opts) {
          var zones = origZones.apply(this, arguments);
          try {
            if (opts && opts.kind === 'effect' && opts.effectType) {
              var el = E2E()[opts.effectType];
              if (el) {
                var base = Number(zones.resReducePct) || 0;
                var withEl = w.sumActiveResReduce(active, '效应', buffs, stacks, {
                  damageElement: el,
                  effectType: opts.effectType,
                  member: opts.member,
                  parentSkill: opts.parentSkill,
                  unit: opts.unit,
                });
                if (withEl > base) {
                  zones.resReducePct = withEl;
                  var st2 = S();
                  if (typeof w.calcResistanceMultiplier === 'function' && st2 && st2.team) {
                    zones.resistance = w.calcResistanceMultiplier(st2.team.monsterRes, withEl);
                  }
                }
              }
            }
          } catch (err) {
            /* 补丁失败不影响原逻辑 */
          }
          return zones;
        };
        w.calcSpecialFactorZones.__overlayWrapped = true;
      }
    }

    // ---------- 6. 梦魇亚当·重锤：按装配角色替换声骸技能倍率 ----------
    if (typeof w.applyMainEchoEffect === 'function') {
      var origAME = w.applyMainEchoEffect;
      if (!origAME.__overlayWrapped) {
        w.applyMainEchoEffect = function (member, effect, specimen) {
          var r = origAME.apply(this, arguments);
          try {
            if (
              specimen &&
              String(specimen.id) === '6000201' &&
              effect &&
              effect.kind === 'skillMult' &&
              member
            ) {
              var charId = String(member.characterId || '');
              var item = null;
              var palette = member.skillPalette || [];
              for (var i = 0; i < palette.length; i++) {
                if (String(palette[i].id) === 'echo_main_skill_palette') { item = palette[i]; break; }
              }
              if (item) {
                if (charId === '1511') { // 露西
                  item.baseMult = 273.6;
                  item.damageElement = '衍射';
                  item.multComponents = [{ rate: 273.6, count: 1 }];
                } else if (charId === '1308') { // 丽贝卡
                  item.baseMult = 273.6;
                  item.damageElement = '导电';
                  item.multComponents = [{ rate: 17.1, count: 16 }];
                }
                if (typeof w.syncEchoPaletteSkillToAxis === 'function') {
                  w.syncEchoPaletteSkillToAxis(member, item);
                }
              }
            }
          } catch (err) {
            /* 忽略 */
          }
          return r;
        };
        w.applyMainEchoEffect.__overlayWrapped = true;
      }
    }
  }

  ready(apply);
  setTimeout(apply, 0);
})();
