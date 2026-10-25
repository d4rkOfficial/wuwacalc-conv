/* 库街区声骸导入（一期）——绑定令牌 → 角色列表 → 选角色 → 拉声骸 → 预览 → 一键填入
 * 依赖：window.Cloud.api（鉴权/请求封装）、window.EchoOCR.mapMain1/mapSub（词条映射）、
 *       window.normalizeEchoConfig（声骸配置归一化，core.js 全局）。
 * 说明：本文件不添加 'use strict'（避免项目跨文件裸标识符读取风险）；一律显式 window 引用。
 */
(function () {
  var NS = 'eki-';

  // ---------- 样式（自包含，注入一次） ----------
  if (!document.getElementById('eki-style')) {
    var style = document.createElement('style');
    style.id = 'eki-style';
    style.textContent = `
.${NS}overlay{position:fixed;inset:0;z-index:320000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(6,8,13,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.${NS}modal{width:780px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;border-radius:18px;border:1px solid rgba(255,255,255,.07);background:radial-gradient(120% 90% at 18% 0%,var(--eki-accent-glow,rgba(94,184,232,.08)),transparent 60%),linear-gradient(180deg,rgba(8,13,22,.5),rgba(6,10,18,.66)),url("assets/eki-landing/login-bg.webp") center 28%/cover no-repeat;color:#e9edf6;box-shadow:0 30px 90px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.04);overflow:hidden;font-family:var(--font-body,"PingFang SC","Microsoft YaHei UI",sans-serif)}
.${NS}head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;border-bottom:1px solid #1d2434}
.${NS}head{background:rgba(6,10,18,.35);border-bottom:1px solid rgba(255,255,255,.05)}
.${NS}head strong{font-size:15px;font-weight:700;letter-spacing:.02em}
.${NS}close{width:30px;height:30px;border:none;border-radius:9px;background:transparent;color:rgba(255,255,255,.35);font-size:16px;line-height:1;cursor:pointer;transition:color .15s ease,background .15s ease}
.${NS}close:hover{color:#fff;background:rgba(255,255,255,.06)}
.${NS}body{overflow:auto;flex:1}
.${NS}foot{padding:11px 20px;border-top:1px solid rgba(255,255,255,.05);color:#667085;font-size:11px}
.${NS}step{padding:20px}
.${NS}login{display:grid;grid-template-columns:270px 1fr;padding:0;min-height:430px}
.${NS}login-side{position:relative;overflow:hidden;padding:22px 20px 18px;display:flex;flex-direction:column;gap:14px;background:#0b1120;border-right:1px solid #1d2434}
.${NS}login-bg{position:absolute;inset:0;background:url("assets/eki-landing/login-bg.webp") center 16%/cover no-repeat}
.${NS}login-side-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,11,19,.72),transparent 32%),linear-gradient(0deg,rgba(7,11,19,.86),transparent 46%)}
.${NS}ring{width:92px;height:92px;border-radius:50%;position:relative;display:flex;align-items:center;justify-content:center;border:1px solid var(--eki-accent,#5eb8e8);background:radial-gradient(circle at 50% 32%,var(--eki-accent-soft,rgba(94,184,232,.18)),transparent 70%)}
.${NS}ring::before{content:"";position:absolute;inset:-10px;border-radius:50%;border:1px dashed var(--eki-accent-soft,rgba(94,184,232,.28));animation:${NS}spin 26s linear infinite}
.${NS}ring::after{content:"";position:absolute;inset:8px;border-radius:50%;border:1px solid rgba(255,255,255,.06)}
.${NS}ring-glyph{font-size:30px;color:#bde7ff;font-family:"Noto Serif SC","Songti SC",serif;font-weight:700}
@keyframes ${NS}spin{to{transform:rotate(360deg)}}
.${NS}brand-title{position:relative;z-index:1;font-size:20px;font-weight:800;letter-spacing:.05em;color:#f4f7fb;text-shadow:0 2px 10px rgba(0,0,0,.55)}
.${NS}brand-desc{color:#97a0b5;font-size:12.5px;line-height:1.6;margin:0}
.${NS}trust{list-style:none;margin:auto 0 0;padding:0;display:flex;flex-direction:column;gap:8px;position:relative;z-index:1}
.${NS}trust li{display:flex;gap:8px;color:#dbe6f5;font-size:12px;line-height:1.5;text-shadow:0 1px 6px rgba(0,0,0,.7)}
.${NS}trust li::before{content:"✓";color:var(--eki-accent,#5eb8e8);flex-shrink:0;font-weight:700}
.${NS}saved{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.${NS}saved-chip{padding:4px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:var(--eki-accent-soft,rgba(94,184,232,.08));color:#e6f1fa;font-size:11px;cursor:pointer;transition:background .15s ease;white-space:nowrap}
.${NS}saved-chip:hover{background:var(--eki-accent-soft,rgba(94,184,232,.16))}
.${NS}login-form{padding:26px 24px;display:flex;flex-direction:column;gap:10px;background:radial-gradient(120% 85% at 18% 0%,var(--eki-accent-glow,rgba(94,184,232,.12)),transparent 60%),rgba(8,13,22,.28);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);border-left:1px solid rgba(255,255,255,.04);box-shadow:inset 1px 0 0 rgba(255,255,255,.02)}
.${NS}form-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
.${NS}form-title{font-size:16px;font-weight:700}
.${NS}label{display:block;color:#aab4c8;font-size:12px;margin:8px 0 6px}
.${NS}input{width:100%;box-sizing:border-box;padding:11px 13px;background:rgba(6,10,18,.42);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#e9edf6;font-size:14px;outline:none;transition:border-color .18s ease,box-shadow .18s ease}
.${NS}input:focus{border-color:var(--eki-accent,#5eb8e8);box-shadow:0 0 0 3px var(--eki-accent-soft,rgba(94,184,232,.14))}
.${NS}code-row{display:flex;gap:8px;align-items:center}
.${NS}code-row .eki-input{flex:1}
.${NS}send-btn{height:42px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:var(--eki-accent-soft,rgba(94,184,232,.08));color:var(--eki-accent,#bde7ff);font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s ease}
.${NS}send-btn:hover{background:var(--eki-accent-soft,rgba(94,184,232,.16))}
.${NS}send-btn:disabled{opacity:.55;cursor:default}
.${NS}btn{padding:.55rem 1rem;border-radius:9px;border:1px solid #2f3a52;background:#182034;color:#d5dbe7;cursor:pointer;font-size:13px;font-family:inherit;transition:background .15s ease,border-color .15s ease}
.${NS}btn:hover{background:#1d2740;border-color:#3b4a6b}
.${NS}btn.eki-primary{height:44px;border:none;border-radius:10px;background:linear-gradient(180deg,var(--eki-accent,#5eb8e8),var(--eki-accent-dark,#3e9fd8));color:#06131c;font-size:14px;font-weight:700}
.${NS}btn.eki-primary:hover{filter:brightness(1.06)}
.${NS}btn.eki-block{width:100%}
.${NS}btn:disabled{opacity:.55;cursor:default}
.${NS}app-alt{margin-top:4px;color:#8b94a8;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.${NS}alt-help{margin-top:10px;padding:11px 13px;background:#151b2a;border:1px solid #232c42;border-radius:10px;color:#aab4c8;font-size:12px;line-height:1.6}
.${NS}advanced{margin-top:6px;border-top:1px dashed #232c42;padding-top:12px}
.${NS}advanced summary{color:#8b94a8;cursor:pointer;font-size:12px}
.${NS}err{color:#ff8080;font-size:12px;min-height:18px;margin-top:2px}
.${NS}hint{color:#aab4c8;font-size:12.5px;line-height:1.6;margin:0 0 12px}
.${NS}hint-warn{color:var(--eki-accent,#9fd8f5)}
.${NS}muted{color:#667085;font-weight:400}
.${NS}row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.${NS}list{display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow:auto}
.${NS}opt{display:flex;align-items:center;gap:10px;padding:11px 13px;background:#131926;border:1px solid #232c42;border-radius:11px;color:#dfe5f0;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.${NS}opt:hover{border-color:#35415e;background:#161d2e}
.${NS}opt input[type="radio"]{accent-color:#c9a84c}
.${NS}char-grid{display:flex;flex-wrap:wrap;gap:10px;max-height:46vh;overflow:auto;padding:2px}
.${NS}char-card{position:relative;width:104px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(9,14,24,.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;transition:border-color .15s ease,background .15s ease}
.${NS}char-card:hover{border-color:rgba(94,184,232,.5)}
.${NS}char-card:has(input:checked){border-color:var(--eki-accent,#5eb8e8);background:var(--eki-accent-soft,rgba(94,184,232,.1))}
.${NS}char-card input{position:absolute;opacity:0;pointer-events:none}
.${NS}char-avatar{position:relative;width:56px;height:56px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center}
.${NS}char-avatar img{width:100%;height:100%;object-fit:cover}
.${NS}char-fb{display:none;font-size:20px;font-weight:700;color:#8b93a5}
.${NS}char-name{font-size:12px;font-weight:600;color:#e9edf6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px}
.${NS}char-meta{font-size:11px;color:#8b93a5}
.${NS}slots{display:flex;flex-direction:column;gap:8px}
.${NS}slot{display:flex;gap:12px;align-items:flex-start;background:#131926;border:1px solid #232c42;border-radius:12px;padding:12px 14px}
.${NS}icon{width:48px;height:48px;border-radius:10px;object-fit:cover;background:#0d1220;border:1px solid rgba(255,255,255,.06)}
.${NS}icon-empty{display:flex;align-items:center;justify-content:center;background:#0d1220;color:#5b6477}
.${NS}slot-name{color:#e9edf6;font-size:14px;font-weight:600}
.${NS}slot-sub{color:#8b93a5;font-size:12px;margin-top:4px;line-height:1.5}
.${NS}warn{background:#2a2117;border:1px solid #4a3a1e;color:#e2b86b;border-radius:9px;padding:10px 12px;font-size:12px;margin-top:12px}
@media (max-width:700px){
  .${NS}login{grid-template-columns:1fr}
  .${NS}login-side{border-right:none;border-bottom:1px solid #1d2434}
}
`;
    document.head.appendChild(style);
  }

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function make(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') e.className = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- 壁纸主题色提取：左侧立绘配色 → 右侧面板 ----------
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    function to(v) { return Math.round((v + m) * 255).toString(16).padStart(2, '0'); }
    return '#' + to(r) + to(g) + to(b);
  }
  function hexToRgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function extractWallpaperTheme(img) {
    var canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 48, 48);
    var data = ctx.getImageData(0, 0, 48, 48).data;
    var buckets = [];
    for (var bi = 0; bi < 24; bi++) buckets.push({ h: bi * 15 + 7.5, sat: 0, bri: 0, count: 0 });
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var l = (max + min) / 2;
      if (l < 0.2 || l > 0.92) continue; // 跳过近黑/近白
      var d = max - min;
      if (d < 0.04) continue; // 跳过灰
      var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (s < 0.1) continue; // 跳过低饱和（壁纸大面积浅蓝绿，阈值放低）
      var h = 0;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      var idx = Math.floor(h / 15) % 24;
      buckets[idx].count++;
      buckets[idx].sat += s;
      buckets[idx].bri += l;
    }
    var best = null, bestScore = 0;
    buckets.forEach(function (bk) {
      if (!bk.count) return;
      var avgSat = bk.sat / bk.count;
      var avgBri = bk.bri / bk.count;
      // 主题色 = 面积占比优先（壁纸大面积的蓝绿色调），避免被高饱和的小面积点缀（红花）带偏
      var score = bk.count * (0.3 + avgBri);
      if (score > bestScore) {
        bestScore = score;
        best = { h: bk.h, s: avgSat, l: avgBri };
      }
    });
    if (!best) return null;
    var accent = hslToHex(best.h, Math.min(0.85, best.s + 0.08), Math.min(0.72, Math.max(0.42, best.l)));
    var dark = hslToHex(best.h, Math.min(0.8, best.s), Math.max(0.28, best.l * 0.6));
    return { accent: accent, dark: dark };
  }
  var wallpaperThemePromise = null;
  function applyWallpaperTheme(rootEl) {
    if (wallpaperThemePromise) return wallpaperThemePromise;
    wallpaperThemePromise = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var t = extractWallpaperTheme(img);
          if (t && rootEl && rootEl.style) {
            rootEl.style.setProperty('--eki-accent', t.accent);
            rootEl.style.setProperty('--eki-accent-dark', t.dark);
            rootEl.style.setProperty('--eki-accent-soft', hexToRgba(t.accent, 0.14));
            rootEl.style.setProperty('--eki-accent-glow', hexToRgba(t.accent, 0.1));
          }
        } catch (_e) {
          /* 提取失败保持默认青色 */
        }
        resolve();
      };
      img.onerror = function () {
        resolve();
      };
      img.src = 'assets/eki-landing/login-bg.webp';
    });
    return wallpaperThemePromise;
  }
  function $(root, sel) {
    return root.querySelector(sel);
  }
  function on(root, sel, fn) {
    // 每个 root 只挂一个委托监听，按选择器记录处理器；
    // 同 root + 同选择器重复 on() 时替换旧处理器（防止返回等按钮被多个历史监听触发）。
    if (!root.__ekiHandlers) {
      root.__ekiHandlers = [];
      root.addEventListener('click', function (ev) {
        var list = root.__ekiHandlers;
        for (var i = 0; i < list.length; i++) {
          var t = ev.target && ev.target.closest ? ev.target.closest(list[i][0]) : null;
          if (t) {
            list[i][1](ev, t);
            return;
          }
        }
      });
    }
    var list = root.__ekiHandlers;
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] === sel) {
        list[i][1] = fn;
        return;
      }
    }
    list.push([sel, fn]);
  }
  function readToken() {
    try {
      var s = JSON.parse(localStorage.getItem('wuwacalc_cloud_session_v1') || 'null');
      return (s && s.access_token) || null;
    } catch (e) {
      return null;
    }
  }

  // ---------- 库街区属性名 → 词条（复用 EchoOCR 的 mapMain1/mapSub） ----------
  var ELEMENTS = ['湮灭', '衍射', '热熔', '冷凝', '导电', '气动', '光噪'];
  var TYPE_DMG = ['普攻', '重击', '共鸣技能', '共鸣解放'];
  // 声骸目录（echo-catalog.json）：用于 phantomId 缺失时按名字反查编号
  var echoCatalogPromise = null;
  function normEchoName(n) {
    return String(n || '').replace(/\s+/g, '').toLowerCase();
  }
  function loadEchoCatalog() {
    if (echoCatalogPromise) return echoCatalogPromise;
    echoCatalogPromise = fetch('echo-catalog.json?v=3c007ba832')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.echoes || data.specimens || data.data || []);
        var byName = {};
        var byId = {};
        list.forEach(function (e) {
          byName[normEchoName(e.name)] = e;
          byId[String(e.id)] = e;
        });
        try {
          window.ECHO_CATALOG_LIST = list;
          window.ECHO_ECHO_BY_NAME = byName;
          window.ECHO_ECHO_BY_ID = byId;
        } catch (_e) {
          /* ignore */
        }
        return { list: list, byName: byName, byId: byId };
      })
      .catch(function () {
        echoCatalogPromise = null;
        return null;
      });
    return echoCatalogPromise;
  }
  function resolveEchoIdByName(name) {
    if (!name) return null;
    try {
      var byName = window.ECHO_ECHO_BY_NAME;
      if (byName) {
        var e = byName[normEchoName(name)];
        if (e) return String(e.id);
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }
  function normalizeStatName(name) {
    if (name === '暴击') return '暴击率';
    if (name === '共鸣解放伤害') return '共鸣解放伤害加成';
    if (name === '共鸣技能伤害') return '共鸣技能伤害加成';
    return name;
  }
  function detectElement(name) {
    for (var i = 0; i < ELEMENTS.length; i++) if (name.indexOf(ELEMENTS[i]) >= 0) return ELEMENTS[i];
    return '';
  }
  function detectDamageType(name) {
    for (var i = 0; i < TYPE_DMG.length; i++) if (name.indexOf(TYPE_DMG[i]) >= 0) return TYPE_DMG[i];
    return '';
  }
  function statFromKuro(attr) {
    var value = String(attr.attributeValue == null ? '' : attr.attributeValue);
    var unit = value.indexOf('%') >= 0 ? '%' : '';
    var num = parseFloat(value);
    var raw = String(attr.attributeName || '');
    var cjk = raw.replace(/[^\u4e00-\u9fa5]/g, '');
    return {
      name: normalizeStatName(cjk) || cjk,
      value: Number.isFinite(num) ? num : 0,
      unit: unit,
      element: detectElement(raw),
      damageType: detectDamageType(raw),
    };
  }

  // ---------- 转换：库街区角色详情 → member.echoConfig ----------
  var ECHO_MAIN2_FIXED = { 4: { n: '攻击', v: 150 }, 3: { n: '攻击', v: 100 }, 1: { n: '生命', v: 2280 } };
  function buildEchoConfigFromDetail(detail) {
    var list = (detail && detail.phantomData && detail.phantomData.equipPhantomList) || [];
    var slots = [];
    var setCounts = {};
    var unknownEchoes = [];
    var unknownStats = [];
    list.forEach(function (ph) {
      if (!ph) return;
      var cost = [1, 3, 4].indexOf(Number(ph.cost)) >= 0 ? Number(ph.cost) : 3;
      // 主词条：剔除固定词条（cost4=攻击150 / cost3=攻击100 / cost1=生命2280）
      var fixed = ECHO_MAIN2_FIXED[cost];
      var mainEntry = null;
      (ph.mainProps || []).forEach(function (p) {
        if (mainEntry) return;
        if (fixed && p.attributeName === fixed.n && parseFloat(p.attributeValue) === fixed.v) return;
        mainEntry = p;
      });
      var main1 = null;
      if (mainEntry && window.EchoOCR && window.EchoOCR.mapMain1) {
        main1 = window.EchoOCR.mapMain1(statFromKuro(mainEntry), cost);
      }
      var subs = [];
      (ph.subProps || []).forEach(function (p) {
        if (subs.length >= 5) return;
        if (!window.EchoOCR || !window.EchoOCR.mapSub) return;
        var m = window.EchoOCR.mapSub(statFromKuro(p));
        if (m) subs.push({ id: m.id, value: m.value, damageType: m.damageType || '' });
        else unknownStats.push((p.attributeName || '?') + ' ' + (p.attributeValue || ''));
      });
      var phantom = ph.phantomProp || {};
      var setId = ph.fetterDetail ? String(ph.fetterDetail.groupId) : null;
      if (setId) setCounts[setId] = (setCounts[setId] || 0) + 1;
      var echoId = phantom.phantomId != null ? String(phantom.phantomId) : null;
      if (!echoId) echoId = resolveEchoIdByName(phantom.name);
      if (!echoId) unknownEchoes.push(phantom.name || '未知声骸');
      slots.push({
        cost: cost,
        name: phantom.name || '',
        activeSetId: setId,
        echoId: echoId,
        main1: main1 ? main1.id : null,
        main1Element: main1 && main1.element ? main1.element : '',
        subs: subs,
      });
    });
    // 布局与主位推断：
    //  1) 库街区按装备槽位顺序返回，第一个即「首位」（主位），不重排；
    //  2) 由实际 cost 串推断布局（43311 / 43111 / 44111 / 33111 —— 33111 即 3cost 首位）；
    //  3) 顺序与已知布局不一致时才按 cost 降序兜底重排，主位取首个 cost4。
    var finalSlots = slots;
    var costsStr = slots
      .map(function (s) {
        return String(s.cost);
      })
      .join('');
    var layoutKey =
      window.ECHO_LAYOUTS && window.ECHO_LAYOUTS[costsStr] ? costsStr : '43311';
    var mainSlotIndex = 0; // 首位 = 第一个
    if (!(window.ECHO_LAYOUTS && window.ECHO_LAYOUTS[costsStr])) {
      finalSlots = slots.slice().sort(function (a, b) {
        return b.cost - a.cost;
      });
      costsStr = finalSlots
        .map(function (s) {
          return String(s.cost);
        })
        .join('');
      layoutKey = window.ECHO_LAYOUTS && window.ECHO_LAYOUTS[costsStr] ? costsStr : '43311';
      mainSlotIndex = finalSlots.findIndex(function (s) {
        return s.cost === 4;
      });
    }
    if (mainSlotIndex < 0) mainSlotIndex = 0;
    // 完全没有装声骸的角色：按布局生成空槽位（预览显示「未装填」）
    if (!finalSlots.length) {
      var emptyLayout =
        window.ECHO_LAYOUTS && window.ECHO_LAYOUTS[layoutKey]
          ? window.ECHO_LAYOUTS[layoutKey]
          : { costs: [4, 3, 3, 1, 1] };
      finalSlots = (emptyLayout.costs || [4, 3, 3, 1, 1]).map(function (cost) {
        return {
          cost: cost,
          name: '',
          activeSetId: null,
          echoId: null,
          main1: null,
          main1Element: '',
          subs: [],
        };
      });
      mainSlotIndex = 0;
    }
    // setLoadout：按套装聚合；弹窗「选择主位」从 setLoadout 读 echoId，
    // 因此必须把主位声骸的 echoId 放到对应套装条目上（且置为首条）。
    var setLoadout = [];
    Object.keys(setCounts).forEach(function (sid) {
      setLoadout.push({ setId: sid, count: setCounts[sid], echoId: null });
    });
    var mainEcho = finalSlots[mainSlotIndex];
    if (mainEcho && mainEcho.echoId && mainEcho.activeSetId) {
      var mainEntryIdx = -1;
      for (var mei = 0; mei < setLoadout.length; mei++) {
        if (setLoadout[mei].setId === mainEcho.activeSetId) {
          mainEntryIdx = mei;
          break;
        }
      }
      if (mainEntryIdx >= 0) {
        var mainEntry = setLoadout.splice(mainEntryIdx, 1)[0];
        mainEntry.echoId = mainEcho.echoId;
        setLoadout.unshift(mainEntry);
      }
    }
    var cfg = {
      layout: layoutKey,
      mainSlotIndex: mainSlotIndex,
      setLoadout: setLoadout,
      slots: finalSlots,
    };
    // 预览用原始槽位（保留全部声骸 ID/名称/图标），填入计算器用归一化配置
    var previewSlots = finalSlots;
    var norm =
      window.normalizeEchoConfig ||
      (window.__WC && window.__WC.normalizeEchoConfig) ||
      null;
    if (norm) cfg = norm(cfg);
    return {
      config: cfg,
      previewSlots: previewSlots,
      unknownEchoes: unknownEchoes,
      unknownStats: unknownStats,
    };
  }

  // ---------- API 调用 ----------
  async function apiPost(path, body, auth) {
    if (!window.Cloud || !window.Cloud.api) throw new Error('网络服务未就绪');
    // Cloud.api 已自行 JSON 解析并做 401 续期 / 错误抛出，直接返回数据对象
    return await window.Cloud.api(path, { method: 'POST', body: body, auth: !!auth });
  }

  // ---------- 库街区直连客户端（浏览器直连，走用户 IP，避开服务器 IP 限流） ----------
  var KURO_BASE = 'https://api.kurobbs.com';
  var KURO_VERSION = '2.9.1';
  var KURO_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) KuroGameBox/' +
    KURO_VERSION;
  var kuroIpCache = '';
  var KURO_IP_KEY = 'wuwacalc_kuro_ip_v1';
  var KURO_IP_TTL = 10 * 60 * 1000; // 10 分钟
  async function kuroPublicIp() {
    if (kuroIpCache) return kuroIpCache;
    try {
      var cached = JSON.parse(sessionStorage.getItem(KURO_IP_KEY) || 'null');
      if (cached && cached.ip && Date.now() - cached.t < KURO_IP_TTL) {
        kuroIpCache = cached.ip;
        return kuroIpCache;
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () {
        ctrl.abort();
      }, 3000);
      var r = await fetch('https://event.kurobbs.com/event/ip', { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.ok) {
        var ip = (await r.text()).trim();
        if (ip) {
          kuroIpCache = ip;
          try {
            sessionStorage.setItem(KURO_IP_KEY, JSON.stringify({ ip: ip, t: Date.now() }));
          } catch (_e2) {
            /* ignore */
          }
          return ip;
        }
      }
    } catch (_e) {
      /* 拿不到 IP 用占位，接口仍可用 */
    }
    return '127.0.0.1';
  }
  async function kuroHeaders(token, bat) {
    var ip = await kuroPublicIp();
    var h = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      source: 'ios',
      version: KURO_VERSION,
      'User-Agent': KURO_UA,
      devCode: ip + ', ' + KURO_UA,
    };
    if (token) h.token = token;
    if (bat) h['b-at'] = bat;
    return h;
  }
  function kuroParseData(d) {
    if (typeof d !== 'string') return d;
    try {
      return JSON.parse(d);
    } catch (_e) {
      return d;
    }
  }
  async function kuroPost(path, bodyObj, token, bat) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, 10000);
    var r;
    try {
      r = await fetch(KURO_BASE + path, {
        method: 'POST',
        headers: await kuroHeaders(token, bat),
        body: new URLSearchParams(bodyObj || {}).toString(),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    var text = await r.text();
    var json;
    try {
      json = JSON.parse(text);
    } catch (_e) {
      json = { code: -1, msg: '响应解析失败' };
    }
    if (json.code === 220) {
      var err = new Error(json.msg || '库街区令牌已失效，请重新授权');
      err.code = 220;
      throw err;
    }
    if (json.code !== 200 && json.code !== 10902) {
      throw new Error(json.msg || ('库街区请求失败：' + path));
    }
    return json;
  }
  function randomDevCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var s = '';
    for (var i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  async function kuroSendSms(mobile, geeTestData) {
    var body = new URLSearchParams({ mobile: mobile });
    if (geeTestData) body.append('geeTestData', geeTestData);
    var r = await fetch(KURO_BASE + '/user/getSmsCodeForH5', {
      method: 'POST',
      headers: {
        devcode: randomDevCode(),
        source: 'h5',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: body.toString(),
    });
    var json;
    try {
      json = await r.json();
    } catch (_e) {
      json = { code: -1, msg: '响应解析失败' };
    }
    if (json.code !== 200) throw new Error(json.msg || '验证码发送失败');
    return { geeTest: !!(json.data && json.data.geeTest) };
  }
  async function kuroRoles(token) {
    var out = await kuroPost('/user/role/findRoleList', { gameId: 3 }, token, null);
    return out.data || [];
  }
  async function kuroCharacters(token, serverId, roleId) {
    var rt = await kuroPost('/aki/roleBox/requestToken', { serverId: serverId, roleId: roleId }, token, null);
    var bat = (kuroParseData(rt.data) || {}).accessToken || '';
    await kuroPost('/aki/roleBox/akiBox/refreshData', { gameId: 3, serverId: serverId, roleId: roleId }, null, bat);
    var rd = await kuroPost('/aki/roleBox/akiBox/roleData', { gameId: 3, serverId: serverId, roleId: roleId }, null, bat);
    return (kuroParseData(rd.data) || {}).roleList || [];
  }
  async function kuroCharacterDetail(token, serverId, roleId, id) {
    var rt = await kuroPost('/aki/roleBox/requestToken', { serverId: serverId, roleId: roleId }, token, null);
    var bat = (kuroParseData(rt.data) || {}).accessToken || '';
    await kuroPost('/aki/roleBox/akiBox/refreshData', { gameId: 3, serverId: serverId, roleId: roleId }, null, bat);
    var dt = await kuroPost(
      '/aki/roleBox/akiBox/getRoleDetail',
      { gameId: 3, serverId: serverId, roleId: roleId, id: id },
      null,
      bat
    );
    return kuroParseData(dt.data);
  }

  // ---------- 保存模式：绑定 / 解绑 / 读取绑定 ----------
  async function bindAccount() {
    if (!state.role || !state.token) return { ok: false, reason: '未选择角色或库街区令牌缺失' };
    try {
      await window.Cloud.api('/kurobbs/bind', {
        method: 'POST',
        body: {
          token: state.token,
          serverId: state.role.serverId,
          roleId: state.role.roleId,
          roleName: state.role.roleName,
          serverName: state.role.serverName,
        },
        auth: true,
      });
      state.bound = true;
      return { ok: true, uid: String(state.role.roleId || '') };
    } catch (_e) {
      // 未登录 wuwacalc 或保存失败：继续按一次性会话使用
      state.bound = false;
      return { ok: false, reason: ((_e && _e.message) || '').slice(0, 120) || '绑定失败（请确认 wuwacalc 已登录）' };
    }
  }
  async function tryUseBinding() {
    if (!readToken()) return null;
    try {
      var st = await window.Cloud.api('/kurobbs/status', { auth: true });
      return (st && st.binding) || null;
    } catch (_e) {
      return null;
    }
  }
  async function refreshKuroBound(container) {
    var host = container || document;
    var valEl = host.querySelector('[data-eki-bound-val]');
    if (!valEl) return;
    var uid = '';
    try {
      var st = await window.Cloud.api('/kurobbs/status', { auth: true });
      var b = st && st.binding;
      uid = (b && (b.roleId || b.player_uid || b.uid)) || '';
    } catch (_e) {}
    valEl.textContent = uid || '未绑定';
  }
  async function unbindAccount() {
    try {
      await window.Cloud.api('/kurobbs/bind', { method: 'DELETE', auth: true });
    } catch (_e) {
      /* ignore */
    }
    state.bound = false;
  }

  // ---------- 本地持久化（登录一次长期保持，不依赖 wuwacalc 账号） ----------
  var LOCAL_BINDING_KEY = 'wuwacalc_kuro_binding_v1';
  function saveLocalBinding() {
    if (!state.token || !state.role) return;
    try {
      localStorage.setItem(
        LOCAL_BINDING_KEY,
        JSON.stringify({
          token: state.token,
          serverId: state.role.serverId,
          roleId: state.role.roleId,
          roleName: state.role.roleName,
          serverName: state.role.serverName,
        })
      );
    } catch (_e) {
      /* 存储不可用则仅本次会话 */
    }
  }
  function loadLocalBinding() {
    try {
      var s = JSON.parse(localStorage.getItem(LOCAL_BINDING_KEY) || 'null');
      return s && s.token ? s : null;
    } catch (_e) {
      return null;
    }
  }
  function clearLocalBinding() {
    try {
      localStorage.removeItem(LOCAL_BINDING_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  // ---------- 多账号记忆（切换账号可切回，无需重新输验证码） ----------
  var ACCOUNTS_KEY = 'wuwacalc_kuro_accounts_v1';
  function saveAccountToMemory() {
    if (!state.token || !state.role) return;
    try {
      var list = loadAccounts();
      var key = state.role.serverId + '|' + state.role.roleId;
      list = list.filter(function (a) {
        return a.serverId + '|' + a.roleId !== key;
      });
      list.unshift({
        token: state.token,
        serverId: state.role.serverId,
        roleId: state.role.roleId,
        roleName: state.role.roleName,
        serverName: state.role.serverName,
      });
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (_e) {
      /* ignore */
    }
  }
  function loadAccounts() {
    try {
      var s = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
      return Array.isArray(s) ? s : [];
    } catch (_e) {
      return [];
    }
  }

  // 按需加载 echo-ocr.js（提供 mapMain1/mapSub）
  function ensureEchoOCR() {
    return new Promise(function (resolve, reject) {
      if (window.EchoOCR && window.EchoOCR.mapMain1 && window.EchoOCR.mapSub) return resolve();
      var s = document.createElement('script');
      s.src = 'js/echo-ocr.js?v=20260809af';
      s.onload = function () {
        if (window.EchoOCR && window.EchoOCR.mapMain1 && window.EchoOCR.mapSub) resolve();
        else reject(new Error('词条映射模块加载失败'));
      };
      s.onerror = function () {
        reject(new Error('词条映射模块加载失败'));
      };
      document.head.appendChild(s);
    });
  }

  // ---------- GeeTest v4 滑块（库街区 H5 发码的人机验证） ----------
  var GEETEST_CAPTCHA_ID = 'ec4aa4174277d822d73f2442a165a2cd'; // 库街区 H5 公开 captcha_id（来源：小维 XutheringWavesUID）
  var geetestState = { pending: null, instance: null };
  function loadGeetest() {
    return new Promise(function (resolve, reject) {
      if (window.initGeetest4) return resolve();
      var s = document.createElement('script');
      s.src = 'https://static.geetest.com/v4/gt4.js';
      s.onload = function () {
        if (window.initGeetest4) resolve();
        else reject(new Error('人机验证组件加载失败'));
      };
      s.onerror = function () {
        reject(new Error('人机验证组件加载失败，请检查网络'));
      };
      document.head.appendChild(s);
    });
  }
  function initGeetestCaptcha() {
    return new Promise(function (resolve, reject) {
      if (geetestState.instance) return resolve(geetestState.instance);
      if (geetestState.pending) {
        geetestState.pending.then(resolve, reject);
        return;
      }
      geetestState.pending = loadGeetest()
        .then(function () {
          return new Promise(function (res2, rej2) {
            window.initGeetest4(
              { captchaId: GEETEST_CAPTCHA_ID, product: 'bind' },
              function (captcha) {
                geetestState.instance = captcha;
                res2(captcha);
              }
            );
            // initGeetest 异常时兜底（SDK 内部错误不回调的情况）
            setTimeout(function () {
              if (!geetestState.instance) rej2(new Error('人机验证初始化超时，请重试'));
            }, 15000);
          });
        });
      geetestState.pending.then(resolve, reject);
    });
  }
  function startCountdown(btn) {
    var left = 60;
    btn.disabled = true;
    btn.textContent = '已发送(' + left + 's)';
    var timer = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '重新获取';
      } else {
        btn.textContent = '已发送(' + left + 's)';
      }
    }, 1000);
  }

  // ---------- 状态 ----------
  var state = {
    token: '', // 一次性令牌（留空 = 用已绑定）
    roles: [],
    role: null, // { serverId, roleId, roleName, serverName }
    characters: [],
    character: null, // { roleId, roleName, level, ... }
    detail: null,
    built: null,
    onApply: null,
    overlay: null,
    busy: false,
  };

  function setBusy(root, busy, tip) {
    state.busy = busy;
    var btn = $(root, '[data-eki-busy]');
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? tip || '处理中…' : btn.getAttribute('data-eki-idle') || btn.textContent;
    }
  }

  // ---------- 界面 ----------
  function raceTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('恢复登录超时'));
        }, ms);
      }),
    ]);
  }

  async function renderRoot() {
    var o = state.overlay;
    if (!o) return;
    var body = $(o, '[data-eki-body]');
    var session = state.autoRequest;
    var current = function () { return body.isConnected && session === state.autoRequest; };
    // 先立刻渲染登录页，避免网络恢复登录期间白屏；
    // 已保存账号在后台尝试恢复，成功后再切到角色选择。
    var localB = loadLocalBinding();
    var restoring = !!localB;
    renderBind(body, restoring ? '正在检查已保存的账号…' : '');
    if (localB && !state.roles.length) {
      state.token = localB.token;
      state.role = {
        serverId: localB.serverId,
        roleId: localB.roleId,
        roleName: localB.roleName,
        serverName: localB.serverName,
      };
      state.bound = true;
      try {
        var restored = (await raceTimeout(kuroCharacters(state.token, localB.serverId, localB.roleId), 12000)) || [];
        if (!current()) return;
        state.characters = restored;
        renderCharacterPick(body);
        return;
      } catch (_e) {
        if (!current()) return;
        clearLocalBinding(); // 令牌失效 → 清除本地绑定，回登录页
      }
    }
    // 服务器绑定（已登录 wuwacalc 账号时）
    var binding = await tryUseBinding();
    if (!current()) return;
    if (binding && !state.roles.length) {
      state.binding = binding;
      state.role = {
        serverId: binding.server_id,
        roleId: binding.role_id,
        roleName: binding.role_name,
        serverName: binding.server_name,
      };
      try {
        state.token = binding.token || '';
        var restored = (await raceTimeout(kuroCharacters(state.token, binding.server_id, binding.role_id), 12000)) || [];
        if (!current()) return;
        state.characters = restored;
        state.bound = true;
        renderCharacterPick(body);
        return;
      } catch (_e) {
        // 绑定令牌失效 → 回到登录页重新授权
      }
    }
    if (!current()) return;
    if (!state.roles.length) renderBind(body);
    else if (!state.character) renderCharacterPick(body);
    else renderPreview(body);
  }

  function renderBind(body, hint) {
    var logged = !!readToken();
    var savedAccounts = loadAccounts();
    body.innerHTML =
      '<div class="eki-step eki-login">' +
      '<div class="eki-login-side">' +
      '<div class="eki-login-bg" aria-hidden="true"></div>' +
      '<div class="eki-login-side-shade" aria-hidden="true"></div>' +
      '<div class="eki-brand-title">库街区声骸导入</div>' +
      '<ul class="eki-trust">' +
      '<li>自动识别每件声骸的套装与主位</li>' +
      '<li>登录一次自动保存，下次免登录</li>' +
      '</ul>' +
      '</div>' +
      '<div class="eki-login-form">' +
      (hint ? '<p class="eki-hint eki-hint-warn">' + esc(hint) + '</p>' : '') +
      '<div class="eki-form-head">' +
      '<div class="eki-form-title">手机号登录</div>' +
      (savedAccounts.length
        ? '<button type="button" class="eki-saved-chip" data-eki-saved-accounts>已保存 ' +
          savedAccounts.length +
          ' 个账号</button>'
        : '') +
      '</div>' +
      '<p class="eki-hint" style="margin-bottom:4px">登录后库街区 App 会下线，属正常现象。</p>' +
      '<label class="eki-label" for="eki-mobile">手机号</label>' +
      '<input class="eki-input" id="eki-mobile" data-eki-mobile type="tel" inputmode="tel" name="mobile" placeholder="请输入库街区绑定手机号" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
      '<label class="eki-label">验证码</label>' +
      '<div class="eki-code-row">' +
      '<input class="eki-input" data-eki-code type="text" inputmode="numeric" placeholder="6 位验证码" autocomplete="one-time-code" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
      '<button type="button" class="eki-send-btn" data-eki-send-code>获取验证码</button>' +
      '</div>' +
      '<button type="button" class="eki-btn eki-primary eki-block" data-eki-busy data-eki-idle="登录并拉取角色" data-eki-login>登录并拉取角色</button>' +
      '<span class="eki-app-alt" data-eki-app-code>收不到验证码？去库街区 App 获取</span>' +
      '<div class="eki-alt-help" data-eki-app-code-help style="display:none">' +
      '打开库街区 App → 登录页输入本手机号点「获取验证码」（App 自动过滑块）→ 回到这里直接输入收到的验证码点「登录」即可，无需在本页再点获取验证码。' +
      '</div>' +
      '<details class="eki-advanced">' +
      '<summary>高级：使用库街区令牌</summary>' +
      '<p class="eki-hint" style="margin-top:8px">粘贴库街区 App 抓包得到的令牌（eyJ 开头），绕过手机验证码。令牌仅本次会话使用，不保存。</p>' +
      '<input class="eki-input" data-eki-token type="password" placeholder="eyJ..." autocomplete="off" spellcheck="false" />' +
      '<div class="eki-row">' +
      '<button type="button" class="eki-btn eki-primary" data-eki-busy data-eki-idle="获取角色列表" data-eki-fetch-roles>获取角色列表</button>' +
      '</div>' +
      '</details>' +
      '<p class="eki-err" data-eki-err></p>' +
      '</div>' +
      '</div>';
    on(body, '[data-eki-saved-accounts]', function () {
      renderAccountPicker(body);
    });
    on(body, '[data-eki-app-code]', function () {
      var help = $(body, '[data-eki-app-code-help]');
      if (help) help.style.display = help.style.display === 'none' ? 'block' : 'none';
    });
    on(body, '[data-eki-send-code]', async function (ev, btn) {
      ev.preventDefault();
      if (state.busy) return;
      var mobile = (($(body, '[data-eki-mobile]') || {}).value || '').trim();
      if (!/^\d{6,15}$/.test(mobile)) {
        $(body, '[data-eki-err]').textContent = '请输入正确的手机号';
        return;
      }
      $(body, '[data-eki-err]').textContent = '';
      try {
        var captcha = await initGeetestCaptcha();
        captcha
          .onSuccess(function () {
            var result = captcha.getValidate();
            if (!result) {
              $(body, '[data-eki-err]').textContent = '请完成人机验证';
              return;
            }
            result.captcha_id = GEETEST_CAPTCHA_ID;
            (async function () {
              try {
                var data = await kuroSendSms(mobile, JSON.stringify(result));
                if (data.geeTest) {
                  $(body, '[data-eki-err]').textContent = '仍需完成人机验证，请重新获取';
                } else {
                  startCountdown(btn);
                }
              } catch (e) {
                $(body, '[data-eki-err]').textContent = e.message;
              }
            })();
          })
          .onError(function () {
            $(body, '[data-eki-err]').textContent = '人机验证出错，请重试';
          });
        captcha.showBox();
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message;
      }
    });
    on(body, '[data-eki-login]', async function () {
      if (state.busy) return;
      var mobile = (($(body, '[data-eki-mobile]') || {}).value || '').trim();
      var code = (($(body, '[data-eki-code]') || {}).value || '').trim();
      if (!mobile || !code) {
        $(body, '[data-eki-err]').textContent = '请输入手机号和验证码';
        return;
      }
      setBusy(body, true, '登录中…');
      $(body, '[data-eki-err]').textContent = '';
      try {
        var data = await apiPost('/kurobbs/login', { mobile: mobile, code: code }, false);
        state.token = data.token;
        state.roles = (await kuroRoles(state.token)) || [];
        if (!state.roles.length) throw new Error('账号下没有绑定角色');
        renderRoles(body);
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message;
        setBusy(body, false);
      }
    });
    on(body, '[data-eki-fetch-roles]', async function (ev, btn) {
      ev.preventDefault();
      if (state.busy) return;
      var token = (($(body, '[data-eki-token]') || {}).value || '').trim();
      state.token = token.trim();
      if (!state.token) {
        $(body, '[data-eki-err]').textContent = '请粘贴库街区令牌';
        return;
      }
      setBusy(body, true, '获取中…');
      $(body, '[data-eki-err]').textContent = '';
      try {
        state.roles = (await kuroRoles(state.token)) || [];
        if (!state.roles.length) throw new Error('账号下没有绑定角色');
        renderRoles(body);
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message;
        setBusy(body, false);
      }
    });
  }

  function renderRoles(body) {
    state.busy = false;
    body.innerHTML =
      '<div class="eki-step">' +
      '<p class="eki-hint">选择要导入的库街区账号角色：</p>' +
      '<div class="eki-list" data-eki-roles>' +
      state.roles
        .map(function (r, i) {
          return (
            '<label class="eki-opt" data-eki-role="' +
            i +
            '">' +
            '<input type="radio" name="eki-role" value="' +
            i +
            '"' +
            (i === 0 ? ' checked' : '') +
            '/>' +
            '<span>' +
            esc(r.roleName || '') +
            ' <span class="eki-muted">' +
            esc(r.serverName || '') +
            ' · LV' +
            esc(r.gameLevel || '?') +
            ' · ' +
            esc(String(r.roleId || '')) +
            '</span></span>' +
            '</label>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="eki-row">' +
      '<button type="button" class="eki-btn" data-eki-back>返回</button>' +
      '<button type="button" class="eki-btn" data-eki-bind-role>绑定游戏UID</button>' +
      '<button type="button" class="eki-btn eki-primary" data-eki-busy data-eki-idle="下一步" data-eki-next-role>下一步</button>' +
      '</div>' +
      '<p class="eki-err" data-eki-err></p>' +
      '</div>';
    on(body, '[data-eki-back]', function () {
      state.roles = [];
      renderBind(body);
    });
    on(body, '[data-eki-bind-role]', async function () {
      var sel = $(body, 'input[name="eki-role"]:checked');
      if (!sel) { alert('请先选择一个角色'); return; }
      state.role = state.roles[Number(sel.value)];
      await bindAccount();
      var r = typeof refreshKuroBound === 'function' ? await refreshKuroBound(body) : null;
      alert('绑定完成：游戏UID ' + String((state.role && state.role.roleId) || ''));
    });
    on(body, '[data-eki-next-role]', async function () {
      if (state.busy) return;
      var sel = $(body, 'input[name="eki-role"]:checked');
      if (!sel) return;
      state.role = state.roles[Number(sel.value)];
      await bindAccount(); // 已登录 wuwacalc 时自动保存绑定（自动绑定游戏UID）
      saveLocalBinding(); // 本地保存，下次免登录
      saveAccountToMemory(); // 记住账号，切换后可切回
      state.bound = true; // 本地已保存即视为已绑定
      setBusy(body, true, '获取角色中…');
      try {
        state.characters =
          (await kuroCharacters(state.token, state.role.serverId, state.role.roleId)) || [];
        if (!state.characters.length) throw new Error('该账号没有可导入的角色');
        renderCharacterPick(body);
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message;
        setBusy(body, false);
      }
    });
  }

  async function importMatchedCharacter(body) {
    if (!body.isConnected) return;
    var target = state.targetCharacterId;
    var matches = state.characters.filter(function (c) { return String(c.roleId) === target; });
    body.innerHTML = '<div class="eki-step"><p class="eki-hint" data-eki-status></p><p class="eki-err" data-eki-err></p><div class="eki-row"><button type="button" class="eki-btn" data-eki-switch-account>更换账号</button><button type="button" class="eki-btn eki-primary" data-eki-retry>重新拉取</button></div></div>';
    on(body, '[data-eki-switch-account]', function () { state.autoRequest++; renderAccountPicker(body); });
    on(body, '[data-eki-retry]', function () { importMatchedCharacter(body); });
    var status = $(body, '[data-eki-status]');
    var error = $(body, '[data-eki-err]');
    if (matches.length !== 1) {
      status.textContent = '未找到当前配置角色，原配装已保留。请核对游戏账号。';
      return;
    }
    var request = ++state.autoRequest;
    var token = state.token;
    var role = Object.assign({}, state.role);
    var apply = state.onApply;
    var valid = function () { return body.isConnected && request === state.autoRequest && target === state.targetCharacterId; };
    status.textContent = '已匹配「' + matches[0].roleName + '」，正在拉取声骸…';
    $(body, '[data-eki-retry]').disabled = true;
    try {
      await ensureEchoOCR();
      await loadEchoCatalog();
      if (!valid()) return;
      var detail = await raceTimeout(kuroCharacterDetail(token, role.serverId, role.roleId, target), 20000);
      if (!valid()) return;
      var list = detail && detail.phantomData && detail.phantomData.equipPhantomList;
      if (!Array.isArray(list) || list.length !== 5 || list.some(function (p) { return !p || ![1,3,4].includes(Number(p.cost)) || !p.fetterDetail || !p.fetterDetail.groupId || !Array.isArray(p.mainProps) || !p.mainProps.length || !Array.isArray(p.subProps); })) throw new Error('声骸数据不完整，未替换原配装');
      if (list.reduce(function (sum, ph) { return sum + Number(ph.cost); }, 0) > 12 || list.some(function (ph) { return ph.subProps.length > 5 || ph.mainProps.concat(ph.subProps).some(function (p) { return !p || !Number.isFinite(parseFloat(p.attributeValue)); }); })) throw new Error('声骸数值异常，未替换原配装');
      var built = buildEchoConfigFromDetail(detail);
      if (built.unknownEchoes.length || built.unknownStats.length || built.previewSlots.some(function (slot) { return !slot.echoId || !slot.main1; })) throw new Error('部分声骸或词条未识别，未替换原配装');
      if (!valid()) return;
      if (apply) apply(built.config);
      close();
    } catch (e) {
      if (!valid()) return;
      status.textContent = '导入未完成，原配装已保留。';
      error.textContent = e.message || '请求失败，请重试';
      $(body, '[data-eki-retry]').disabled = false;
    }
  }

  function renderCharacterPick(body) {
    if (!body.isConnected) return;
    if (state.targetCharacterId) { void importMatchedCharacter(body); return; }
    state.busy = false;
    body.innerHTML =
      '<div class="eki-step">' +
      '<p class="eki-hint">选择要导入声骸的角色（' +
      state.characters.length +
      ' 人）' +
      (state.bound ? ' · 已绑定，下次免登录' : '') +
      '：</p>' +
      '<div class="eki-char-grid" data-eki-chars>' +
      state.characters
        .map(function (c, i) {
          var avatarId = String(c.roleId != null ? c.roleId : '');
          return (
            '<label class="eki-char-card" data-eki-char="' +
            i +
            '">' +
            '<input type="radio" name="eki-char" value="' +
            i +
            '"' +
            (i === 0 ? ' checked' : '') +
            '/>' +
            '<span class="eki-char-avatar">' +
            (avatarId
              ? '<img src="assets/characters/' +
                encodeURIComponent(avatarId) +
                '.webp" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.eki-char-fb\').style.display=\'flex\'" />'
              : '') +
            '<span class="eki-char-fb">' + esc((c.roleName || '?').slice(0, 1)) + '</span>' +
            '</span>' +
            '<span class="eki-char-name">' + esc(c.roleName || '未命名') + '</span>' +
            '<span class="eki-char-meta">LV' +
            esc(c.level != null ? c.level : '?') +
            ' · 链' +
            esc(c.chainUnlockNum != null ? c.chainUnlockNum : '?') +
            '</span>' +
            '</label>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="eki-row">' +
      (state.bound
        ? '<button type="button" class="eki-btn" data-eki-switch-account>更换账号</button>'
        : '') +
      '<button type="button" class="eki-btn" data-eki-back>返回</button>' +
      '<button type="button" class="eki-btn eki-primary" data-eki-busy data-eki-idle="拉取声骸" data-eki-next-char>拉取声骸</button>' +
      '</div>' +
      '<p class="eki-err" data-eki-err></p>' +
      '</div>';
    on(body, '[data-eki-switch-account]', async function () {
      renderAccountPicker(body);
    });
    on(body, '[data-eki-back]', function () {
      state.characters = [];
      state.role = null;
      renderRoles(body);
    });
    on(body, '[data-eki-next-char]', async function () {
      if (state.busy) return;
      var sel = $(body, 'input[name="eki-char"]:checked');
      if (!sel) return;
      state.character = state.characters[Number(sel.value)];
      setBusy(body, true, '拉取中…');
      try {
        await ensureEchoOCR();
        await loadEchoCatalog(); // 目录就绪后按名字反查编号，避免新声骸缺 phantomId
        state.detail = await kuroCharacterDetail(
          state.token,
          state.role.serverId,
          state.role.roleId,
          state.character.roleId
        );
        state.built = buildEchoConfigFromDetail(state.detail);
        renderPreview(body);
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message;
        setBusy(body, false);
      }
    });
  }

  function slotHtml(slot, idx) {
    var iconEchoId = slot.echoId || resolveEchoIdByName(slot.name);
    var icon =
      iconEchoId
        ? '<img class="eki-icon" src="assets/echoes-thumb/' +
          encodeURIComponent(iconEchoId) +
          '.png" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'assets/echoes/' +
          encodeURIComponent(iconEchoId) +
          '.png\'" />'
        : '<span class="eki-icon eki-icon-empty">?</span>';
    var mainTxt = '默认';
    if (slot.main1) {
      var opts =
        (window.ECHO_MAIN1_OPTIONS && window.ECHO_MAIN1_OPTIONS[slot.cost]) || [];
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].id === slot.main1) {
          var valTxt = opts[i].value ? ' ' + opts[i].value + '%' : '';
          if (slot.main1 === 'main_element_dmg' && slot.main1Element) {
            mainTxt = slot.main1Element + '伤害加成' + valTxt;
          } else {
            mainTxt = opts[i].label + valTxt;
          }
          break;
        }
      }
      if (mainTxt === '默认') mainTxt = esc(slot.main1);
    }
    var subsTxt = (slot.subs || [])
      .map(function (s) {
        var label = s.id;
        if (s.id === 'sub_type_dmg') {
          label = s.damageType ? s.damageType + '伤害加成' : '类型增伤';
          if (Number(s.value)) label += ' ' + Number(s.value) + '%';
        } else if (window.ECHO_SUB_AFFIXES && window.ECHO_SUB_AFFIXES[s.id]) {
          label = window.ECHO_SUB_AFFIXES[s.id].label;
          if (window.ECHO_SUB_AFFIXES[s.id].unit === 'percent') label += ' ' + s.value + '%';
          else label += ' ' + s.value;
        } else {
          label += ' ' + s.value;
        }
        return label;
      })
      .join(' · ');
    return (
      '<div class="eki-slot">' +
      icon +
      '<div class="eki-slot-main">' +
      '<div class="eki-slot-name">' +
      esc(slot.name || '未装填') +
      ' <span class="eki-muted">' +
      slot.cost +
      'cost' +
      (slot.activeSetId ? ' · 套装' + esc(slot.activeSetId) : '') +
      '</span></div>' +
      '<div class="eki-slot-sub">' +
      mainTxt +
      (subsTxt ? '｜' + subsTxt : '') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  // 切换账号：展示已记住的账号列表，可一键切回；或登录新账号
  function renderAccountPicker(body) {
    state.busy = false;
    var accounts = loadAccounts();
    var curKey = state.role ? state.role.serverId + '|' + state.role.roleId : '';
    body.innerHTML =
      '<div class="eki-step">' +
      '<p class="eki-hint">选择要切换的库街区账号：</p>' +
      '<div class="eki-list" data-eki-accounts>' +
      (accounts.length
        ? accounts
            .map(function (a, i) {
              var isCur = a.serverId + '|' + a.roleId === curKey;
              return (
                '<label class="eki-opt" data-eki-account="' +
                i +
                '">' +
                '<input type="radio" name="eki-account" value="' +
                i +
                '"' +
                (isCur ? ' checked' : '') +
                '/>' +
                '<span>' +
                esc(a.roleName || '') +
                ' <span class="eki-muted">' +
                esc(a.serverName || '') +
                ' · ' +
                esc(String(a.roleId || '')) +
                (isCur ? ' · 当前' : '') +
                '</span></span>' +
                '</label>'
              );
            })
            .join('')
        : '<p class="eki-muted" style="padding:.4rem .2rem">暂无已保存的账号</p>') +
      '</div>' +
      '<div class="eki-row">' +
      '<button type="button" class="eki-btn" data-eki-back>返回</button>' +
      '<button type="button" class="eki-btn" data-eki-bind-account>绑定游戏UID</button>' +
      '<button type="button" class="eki-btn eki-primary" data-eki-account-next>下一步</button>' +
      '<button type="button" class="eki-btn" data-eki-new-account>登录新账号</button>' +
      '</div>' +
      '<p class="eki-err" data-eki-err></p>' +
      '</div>';
    on(body, '[data-eki-account]', async function (ev, el) {
      ev.preventDefault(); // 标签已手动选中，避免原生转发点击重复绑定与提示。

      var input = el && el.querySelector ? el.querySelector('input') : null;
      if (input) input.checked = true;
      var idx = Number(el.getAttribute('data-eki-account'));
      var acc = accounts[idx];
      if (!acc) return;
      state.token = acc.token;
      state.role = {
        serverId: acc.serverId,
        roleId: acc.roleId,
        roleName: acc.roleName,
        serverName: acc.serverName,
      };
      state.characters = [];
      state.character = null;
      state.bound = true;
      // 选中即自动绑定并提示结果，停留（不自动跳声骸）
      var bk = await bindAccount();
      if (bk && bk.ok) { alert('已绑定游戏UID：' + (bk.uid || '成功')); }
      else { alert('绑定失败：' + ((bk && bk.reason) || '请确认 wuwacalc 已登录')); }
    });
    on(body, '[data-eki-account-next]', async function () {
      var sel = $(body, 'input[name="eki-account"]:checked');
      var idx = sel ? Number(sel.value) : -1;
      var acc = (idx >= 0 && accounts[idx]) || null;
      if (!acc) { $(body, '[data-eki-err]').textContent = '请先选择一个库街区账号'; return; }
      state.token = acc.token;
      state.role = { serverId: acc.serverId, roleId: acc.roleId, roleName: acc.roleName, serverName: acc.serverName };
      state.characters = [];
      state.character = null;
      state.bound = true;
      await bindAccount();
      saveLocalBinding();
      saveAccountToMemory();
      setBusy(body, true, '获取角色中…');
      try {
        state.characters = (await kuroCharacters(state.token, acc.serverId, acc.roleId)) || [];
        renderCharacterPick(body);
      } catch (e) {
        $(body, '[data-eki-err]').textContent = e.message + '（该账号令牌可能已失效，请登录新账号）';
        setBusy(body, false);
      }
    });
    on(body, '[data-eki-bind-account]', async function () {
      var sel = $(body, 'input[name="eki-account"]:checked');
      var idx = sel ? Number(sel.value) : -1;
      var acc = (idx >= 0 && accounts[idx]) || null;
      if (!acc) { alert('请先选择一个库街区账号'); return; }
      state.token = acc.token;
      state.role = { serverId: acc.serverId, roleId: acc.roleId, roleName: acc.roleName, serverName: acc.serverName };
      setBusy(body, true, '绑定中…');
      var r = await bindAccount();
      setBusy(body, false);
      if (r && r.ok) { alert('绑定成功：游戏UID ' + r.uid); }
      else { alert('绑定失败：' + ((r && r.reason) || '请确认 wuwacalc 已登录')); }
    });
    on(body, '[data-eki-new-account]', async function () {
      await unbindAccount();
      clearLocalBinding();
      state.binding = null;
      state.role = null;
      state.characters = [];
      state.character = null;
      state.token = '';
      renderBind(body);
    });
    on(body, '[data-eki-back]', function () {
      if (state.characters && state.characters.length) renderCharacterPick(body);
      else renderBind(body);
    });
  }

  function renderPreview(body) {
    state.busy = false;
    var b = state.built;
    var slots = (b.previewSlots && b.previewSlots.length ? b.previewSlots : (b.config && b.config.slots)) || [];
    body.innerHTML =
      '<div class="eki-step">' +
      '<p class="eki-hint">' +
      esc(state.character.roleName || '') +
      ' 的声骸配置（' +
      slots.length +
      ' 槽）：</p>' +
      '<div class="eki-slots">' +
      slots.map(slotHtml).join('') +
      '</div>' +
      (b.unknownEchoes.length || b.unknownStats.length
        ? '<div class="eki-warn">待确认：' +
          esc(
            b.unknownEchoes.concat(b.unknownStats).slice(0, 8).join('；') +
              (b.unknownEchoes.length + b.unknownStats.length > 8 ? '…' : '')
          ) +
          '</div>'
        : '') +
      '<div class="eki-row">' +
      '<button type="button" class="eki-btn" data-eki-back>重新选择</button>' +
      '<button type="button" class="eki-btn eki-primary" data-eki-busy data-eki-idle="填入本角色" data-eki-apply>填入本角色</button>' +
      '</div>' +
      '<p class="eki-err" data-eki-err></p>' +
      '</div>';
    on(body, '[data-eki-back]', function () {
      state.detail = null;
      state.built = null;
      state.character = null;
      renderCharacterPick(body);
    });
    on(body, '[data-eki-apply]', function () {
      if (state.busy) return;
      if (state.onApply) state.onApply(b.config);
      close();
    });
  }

  // ---------- 打开 / 关闭 ----------
  function open(opts) {
    close();
    state.busy = false;
    state.targetCharacterId = opts && opts.autoMatchCharacterId != null ? String(opts.autoMatchCharacterId) : '';
    state.onApply = (opts && opts.onApply) || null;
    state.roles = [];
    state.role = null;
    state.characters = [];
    state.character = null;
    state.detail = null;
    state.built = null;
    state.token = '';
    var o = make('div', { class: NS + 'overlay', 'data-eki-root': '' });
    o.innerHTML =
      '<div class="eki-modal">' +
      '<header class="eki-head"><strong>' +
      esc((opts && opts.title) || '库街区声骸导入') +
      '</strong><button type="button" class="eki-close" data-eki-close aria-label="关闭">✕</button></header>' +
      '<div class="eki-body" data-eki-body></div>' +
      '<footer class="eki-foot"><span class="eki-muted">数据来自库街区，仅用于填充计算器配置</span></footer>' +
      '</div>';
    document.body.appendChild(o);
    state.overlay = o;
    applyWallpaperTheme(o); // 提取左栏壁纸主色 → 应用到整窗 CSS 变量
    on(o, '[data-eki-close]', close);
    state.onKey = function (e) {
      if (e && e.key === 'Escape') close();
    };
    document.addEventListener('keydown', state.onKey);
    renderRoot();
  }
  function close() {
    state.autoRequest = (state.autoRequest || 0) + 1;
    if (state.onKey) {
      document.removeEventListener('keydown', state.onKey);
      state.onKey = null;
    }
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }
  }

  loadEchoCatalog(); // 预加载声骸目录，供按名字反查编号/图标

  window.__WC = window.__WC || {};
  window.__WC.EchoImport = window.EchoImport = {
    open: open,
    close: close,
    buildEchoConfigFromDetail: buildEchoConfigFromDetail,
    loadEchoCatalog: loadEchoCatalog,
    resolveEchoIdByName: resolveEchoIdByName,
  };
})();
