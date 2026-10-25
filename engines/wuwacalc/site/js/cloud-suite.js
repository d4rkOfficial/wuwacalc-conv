/* ===== P6 抽取：云端方案库（登录/公开库/上传/我的方案/管理审核 + api 层）=====
 * 来源：index.html 内联块（原 4546-5563，1018 行），内容逐字节搬移未改。
 * 加载：defer，位于 ui.js 之后、profile.js 之前（与原文档位置等价；
 *       全部消费方（ui/profile/public-db/matrix/登录页/开场门）对 Cloud/api 均为运行时引用，
 *       acorn 审计确认零解析期引用，定义时机由解析期变为 defer 尾段，行为等价）。
 * 注意：本文件为独立 IIFE，0 全局绑定；导出 window.Cloud（plain 名豁免保留）。
 */
/* 云端方案库（阶段3）— 登录 / 公开库 / 上传 / 我的方案 / 管理审核 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vsakryxeviiwcqvjyexe.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_-qZ9uASYPYm2Jno3_Kez5A_GXTqFXJy';
  var SESSION_KEY = 'wuwacalc_cloud_session_v1';
  var USER_DOMAIN = 'wuwacalc.cn';

  // 账号可以是用户名或邮箱：用户名转成内部邮箱标识（u+hex@wuwacalc.cn），老邮箱账号原样登录
  function accountToEmail(account) {
    var s = String(account || '').trim();
    if (!s) return '';
    if (s.indexOf('@') >= 0) return s;
    var utf8 = unescape(encodeURIComponent(s));
    var hex = '';
    for (var i = 0; i < utf8.length; i++) {
      var h = utf8.charCodeAt(i).toString(16);
      hex += h.length < 2 ? '0' + h : h;
    }
    return 'u' + hex + '@' + USER_DOMAIN;
  }

  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function getToken() { var s = loadSession(); return (s && s.access_token) || null; }
  function getUser() { var s = loadSession(); return (s && s.user) || null; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) { var v = Number(n); if (!Number.isFinite(v)) return '-'; return v >= 10000 ? (v / 10000).toFixed(2) + '万' : Math.round(v).toLocaleString(); }
  function fmtDate(s) { if (!s) return ''; try { return new Date(s).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return String(s); } }

  // 云端 auth 请求超时兜底：supabase 会话刷新/登录若网络卡住将永久挂起（用户中心“卡死”）。
  // 给 sbAuth 加 AbortController 超时（默认 12s），超时即中断并抛错 → 上层 catch 转“请先登录/失败”，绝不永久卡。
  var SBAUTH_TIMEOUT_MS = 12000;
  var pendingRefresh = null; // refreshSession 单飞在途 Promise
  async function sbAuth(path, body, token, method) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, SBAUTH_TIMEOUT_MS);
    var res, aborted = false;
    try {
      res = await fetch(SUPABASE_URL + path, {
        method: method || 'POST',
        headers: Object.assign(
          { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          token ? { Authorization: 'Bearer ' + token } : {}
        ),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      aborted = true;
      throw new Error(e && e.name === 'AbortError' ? '请求超时，请重试' : (e && e.message || '请求失败'));
    } finally {
      clearTimeout(timer);
    }
    if (aborted) throw new Error('请求超时，请重试');
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || ('请求失败 ' + res.status));
    return data;
  }

  async function signUp(account, password) {
    var email = accountToEmail(account);
    var data = await sbAuth('/auth/v1/signup', { email: email, password: password });
    if (data.access_token && data.user) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
      if (window.__notifyRefresh) window.__notifyRefresh();
    }
    return data;
  }
  async function signIn(account, password) {
    var email = accountToEmail(account);
    var data = await sbAuth('/auth/v1/token?grant_type=password', { email: email, password: password });
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    if (window.__notifyRefresh) window.__notifyRefresh();
    return data.user;
  }
  async function refreshSession() {
    var s = loadSession();
    if (!s || !s.refresh_token) return null;
    // 单飞：并发 auth 请求共用同一在途刷新，避免多个 refresh_token 请求互相作废（Supabase 单次令牌）
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = (async function () {
      try {
        var data = await sbAuth('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
        saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
        if (window.__notifyRefresh) window.__notifyRefresh();
        return data;
      } catch (e) {
        clearSession();
        return null;
      } finally {
        pendingRefresh = null;
      }
    })();
    return pendingRefresh;
  }
  /** access_token 缺失或剩余寿命 <5 分钟 → 需要提前刷新（supabase access_token TTL 1h，被动刷新 + 此处主动续期） */
  function accessExpiringSoon() {
    var s = loadSession();
    var t = s && s.access_token;
    if (!t) return true;
    try {
      var p = String(t).split('.')[1];
      var j = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
      var exp = Number(j && j.exp) * 1000;
      return !(exp > 0) || exp - Date.now() < 300000;
    } catch (e) {
      return false;
    }
  }
  function tryProactiveRefresh() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    var s = loadSession();
    if (!s || !s.refresh_token || !accessExpiringSoon()) return;
    refreshSession().catch(function () {});
  }
  async function signOut() {
    var token = getToken();
    if (token) { try { await sbAuth('/auth/v1/logout', {}, token); } catch (e) {} }
    clearSession();
  }

  async function changePassword(newPass) {
    var token = getToken();
    if (!token) throw new Error('请先登录');
    return sbAuth('/auth/v1/user', { password: newPass }, token, 'PUT');
  }

  var API_TIMEOUT_MS = 15000;
  // 写请求（上传/更新方案）放宽：大方案含配置快照可达数十 MB，且旧浏览器可能走明文回退
  var API_WRITE_TIMEOUT_MS = 300000;
  // Batch D（P1-9）：上传体积预检上限（与服务器 express.json 50mb 对齐留余量）
  var UPLOAD_MAX_BYTES = 48 * 1024 * 1024;
  var pendingApiGets = {}; // 在途 GET 去重：method\u0000path\u0000token -> Promise
  var apiControllers = []; // 在途 AbortController（pagehide 统一 abort）

  window.addEventListener('pagehide', function () {
    apiControllers.forEach(function (c) { try { c.abort(); } catch (e) {} });
    apiControllers = [];
    pendingApiGets = {};
  });

  // Draft requests need complete-body timeouts and idempotent create retries.
  var pendingDraftCreates = new Map();
  async function draftApi(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var token = getToken();
    if (opts.auth && !token) {
      if (!await refreshSession()) throw new Error('请先登录');
      token = getToken();
    }
    var body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    var createKey = '', requestId = '';
    if (method === 'POST' && path === '/drafts') {
      // Repackaging regenerates timestamps and internal IDs. Identify the unresolved
      // save intent by owner, name and source draft, rather than serialized bytes.
      createKey = JSON.stringify([getUser()?.id || '', opts.body?.name || '', opts.body?.payload?.schemeDraft?.draftId || '']);
      pendingDraftCreates.forEach(function (entry, key) { if (Date.now()-entry.at > 600000) pendingDraftCreates.delete(key); });
      var entry = pendingDraftCreates.get(createKey);
      if (!entry) {
        entry = {id:crypto.randomUUID(),at:Date.now()};
        pendingDraftCreates.set(createKey, entry);
      }
      requestId = entry.id;
      body = JSON.stringify(Object.assign({}, opts.body, {requestId:requestId}));
    }
    if (body && new Blob([body]).size > 45*1024*1024) throw new Error('方案过大，请减少配置对照行或先导出到本地');
    var sendBody = body, compressed = false;
    if (body && body.length > 65536 && typeof CompressionStream === 'function') {
      try {
        sendBody = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        compressed = true;
      } catch (_) { sendBody = body; }
    }
    var networkRetries = 0, refreshed = false;
    for (;;) {
      var controller = new AbortController(), timedOut = false;
      var timer = setTimeout(function () { timedOut = true; controller.abort(); }, opts.timeoutMs || (method === 'GET' ? 25000 : 45000));
      apiControllers.push(controller);
      var status = 0;
      try {
        var headers = {'Content-Type':'application/json'};
        if (token) headers.Authorization = 'Bearer ' + token;
        if (compressed) headers['Content-Encoding'] = 'gzip';
        var res = await fetch('/api' + path, {method:method,headers:headers,body:sendBody,signal:controller.signal});
        status = res.status;
        if (status === 401 && opts.auth && !refreshed) {
          refreshed = true;
          await res.body?.cancel();
          if (!await refreshSession()) { clearSession(); throw new Error('登录已失效，请重新登录'); }
          token = getToken();
          continue;
        }
        var data;
        try { data = await res.json(); }
        catch (error) {
          if (!res.ok) throw Object.assign(new Error('草稿服务暂时不可用（' + status + '）'), {status:status});
          throw error;
        }
        if (status === 409 && method === 'POST' && requestId && data.code === 'DRAFT_REQUEST_CHANGED') {
          // A prior attempt committed. Save the current repackaged contents into
          // that same owner-checked draft, rather than creating a second record.
          method = 'PUT';
          path = '/drafts/' + requestId;
          continue;
        }
        if (!res.ok) throw Object.assign(new Error(data.error || ('请求失败 ' + status)), {status:status});
        if (method === 'GET' && path === '/drafts' && !Array.isArray(data.items)) throw new SyntaxError('草稿列表不完整');
        if (method === 'POST' && (!data.id || data.id !== requestId)) throw new SyntaxError('保存回执不完整');
        if (method === 'PUT' && (!data.id || String(data.id) !== decodeURIComponent(path.split('/').pop()))) throw new SyntaxError('保存回执不完整');
        if (method === 'GET' && path !== '/drafts' && !data.id) throw new SyntaxError('草稿数据不完整');
        if (createKey) pendingDraftCreates.delete(createKey);
        return data;
      } catch (error) {
        if (controller.signal.aborted && !timedOut) throw error;
        var uncertain = timedOut || error instanceof TypeError || error instanceof SyntaxError || [408,502,503,504].includes(status);
        // POST is safe to replay because the server uses the same UUID as the draft ID.
        if (uncertain && networkRetries < 1 && (method !== 'POST' || requestId)) {
          networkRetries++;
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        if (error.name === 'AbortError' && !timedOut) throw error;
        if (uncertain) throw new Error(method === 'GET' ? '草稿读取暂时中断，当前工作台仍保留，请重试' : '暂未收到草稿保存确认，当前工作台仍保留。请先到草稿箱核对，或再次点击保存重试');
        throw error;
      } finally {
        clearTimeout(timer);
        var index = apiControllers.indexOf(controller);
        if (index >= 0) apiControllers.splice(index, 1);
      }
    }
  }
  async function api(path, opts) {
    if (/^\/drafts(?:\/[^/?]+)?$/.test(path)) return draftApi(path, opts);
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var token = getToken();
    // 详情类 GET（公开方案完整 payload 含配置快照，实测 20~60s）需放宽超时；
    // 默认 GET 15s 保持不变，调用方可传 opts.timeoutMs 覆盖。
    var timeoutMs =
      opts.timeoutMs ||
      (method === 'GET' ? API_TIMEOUT_MS : API_WRITE_TIMEOUT_MS);
    if (opts.auth && !token) {
      var refreshed = await refreshSession();
      if (!refreshed) throw new Error('请先登录');
      token = getToken();
    }

    // 仅 GET 在途合并：相同 method+path+token 返回同一 Promise（写请求不合并）
    var mergeKey = '';
    if (method === 'GET') {
      mergeKey = method + '\u0000' + path + '\u0000' + (token || '');
      if (pendingApiGets[mergeKey]) return pendingApiGets[mergeKey];
    }

    var attempt = async function (tk) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      apiControllers.push(controller);
      var attemptStart = Date.now();
      try {
        var body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
        var headers = Object.assign(
          { 'Content-Type': 'application/json' },
          tk ? { Authorization: 'Bearer ' + tk } : {}
        );
        // 大请求体（上传/草稿/方案更新）gzip 压缩：体积约 1/10，传输快 10 倍；
        // 服务器 express.json 默认自动解压。压缩失败自动回退明文。
        if (
          typeof body === 'string' &&
          body.length > 64 * 1024 &&
          typeof CompressionStream === 'function' &&
          typeof Blob !== 'undefined' &&
          typeof Response !== 'undefined'
        ) {
          try {
            var cs = new CompressionStream('gzip');
            var stream = new Blob([body]).stream().pipeThrough(cs);
            var compressed = await new Response(stream).arrayBuffer();
            headers['Content-Encoding'] = 'gzip';
            body = compressed;
            if (typeof window !== 'undefined') window.__lastApiBodyGzipped = true;
          } catch (e) {
            /* 压缩失败回退明文 */
          }
        }
        try {
          return await fetch('/api' + path, {
            method: method,
            headers: headers,
            body: body,
            signal: controller.signal,
          });
        } catch (e) {
          // 把浏览器的空泛 AbortError 转成可诊断信息
          if (e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || '')))) {
            throw new Error(
              '请求超时（已等待约 ' +
                Math.round((Date.now() - attemptStart) / 1000) +
                ' 秒被中断），网络或服务器无响应，请稍后重试'
            );
          }
          throw e;
        }
      } finally {
        clearTimeout(timer);
        var idx = apiControllers.indexOf(controller);
        if (idx >= 0) apiControllers.splice(idx, 1);
      }
    };

    var run = (async function () {
      var res = await attempt(token);
      // access_token 过期（401）：自动用 refresh_token 续期并重试一次
      if (res.status === 401 && opts.auth) {
        var refreshed = await refreshSession();
        if (refreshed) {
          res = await attempt(getToken());
        } else {
          clearSession();
          throw new Error('登录已失效，请重新登录');
        }
      }
      var data = {};
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(data.error || ('请求失败 ' + res.status));
      return data;
    })();

    if (method === 'GET') {
      pendingApiGets[mergeKey] = run;
      var cleanup = function () { delete pendingApiGets[mergeKey]; };
      run.then(cleanup, cleanup);
    }

    return run;
  }

  // P1（补做）：上传写请求专用（fetch 版）；gzip 压缩复用与 api() 相同逻辑。
  // 拉表数据上传很快，不需要进度回调（原 XHR 版废弃）。catch 顺序：服务端 status 优先 → AbortError → 网络。
  function apiUpload(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'POST').toUpperCase();
    var token = getToken();
    var attempt = async function (tk) {
      var body = JSON.stringify(opts.body);
      var headers = { 'Content-Type': 'application/json' };
      if (tk) headers['Authorization'] = 'Bearer ' + tk;
      var sendBody = body;
      if (
        body.length > 64 * 1024 &&
        typeof CompressionStream === 'function' &&
        typeof Blob !== 'undefined' &&
        typeof Response !== 'undefined'
      ) {
        try {
          var cs = new CompressionStream('gzip');
          var stream = new Blob([body]).stream().pipeThrough(cs);
          sendBody = await new Response(stream).arrayBuffer();
          headers['Content-Encoding'] = 'gzip';
        } catch (e) { /* 压缩失败回退明文 */ }
      }
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, API_WRITE_TIMEOUT_MS);
      try {
        var res = await fetch('/api' + path, {
          method: method,
          headers: headers,
          body: sendBody,
          signal: controller.signal,
        });
        var data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (res.status >= 200 && res.status < 300) return data;
        var err = new Error(data.error || ('请求失败 ' + res.status));
        err.status = res.status;
        throw err;
      } catch (e) {
        // 服务端错误（带 status）优先透传，避免文案含「网络」被误改写
        if (e && e.status) throw e;
        if (e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || '')))) {
          throw new Error('请求超时（已等待约 ' + Math.round(API_WRITE_TIMEOUT_MS / 1000) + ' 秒被中断），网络或服务器无响应');
        }
        if (e && /failed to fetch|network|网络中断/i.test(String(e.message || ''))) {
          throw new Error('网络中断（failed to fetch）');
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };
    return new Promise(function (resolve, reject) {
      if (opts.auth && !token) {
        refreshSession().then(function (refreshed) {
          if (!refreshed) reject(new Error('请先登录'));
          else attempt(getToken()).then(resolve, reject);
        }, function () { reject(new Error('请先登录')); });
        return;
      }
      attempt(token).then(resolve, reject);
    });
  }

  // Batch D（P1-9）：上传错误分类文案
  function classifyUploadError(err) {
    var m = String((err && err.message) || '');
    if (/413|entity too large|请求体过大/i.test(m)) return '方案过大（服务器上限 50MB），请减少配置对照行后再试';
    if (/504|保存超时|请求超时|timeout|aborted|abort/i.test(m)) return '服务器响应超时：方案可能已保存，请先到「我的方案」核对；如未生成再重试';
    if (/failed to fetch|network|网络中断/i.test(m)) return '网络中断：请检查网络后重试（可先到「我的方案」确认是否已提交）';
    return null; // 其余维持原样
  }

  async function fetchMyRole() {
    var token = getToken();
    var user = getUser();
    if (!token || !user) return null;
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id), {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
      });
      if (!res.ok) return null;
      var rows = await res.json();
      return (rows && rows[0] && rows[0].role) || null;
    } catch (e) { return null; }
  }

  var overlayEl = null;
  var cloudOpenOrigin = '';
  var cloudOpenFocus = '';
  var currentTab = 'auth';
  var detailCache = {};
  var stateInfo = { status: '', user: null, role: null };
  var libraryOffset = 0; // 任务3：公开方案库分页游标（30/批）
  var LIBRARY_PAGE = 30;

  function setStatus(msg, isError) {
    stateInfo.status = msg;
    var el = overlayEl && overlayEl.querySelector('[data-cloud-status]');
    if (el) {
      el.textContent = msg || '';
      el.classList.toggle('is-error', !!isError);
    }
  }

  function syncDialogChrome(isAdmin) {
    if (!overlayEl) return;
    var tabs = overlayEl.querySelector('[data-cloud-tabs]');
    var title = overlayEl.querySelector('[data-cloud-title]');
    var dialog = overlayEl.querySelector('[data-cloud-dialog]');
    var isAuthView = currentTab === 'auth';
    if (tabs) tabs.hidden = !isAdmin;
    if (dialog) dialog.classList.toggle('is-compact', isAuthView);
    if (title) {
      if (isAuthView) title.textContent = '修改密码';
      else if (currentTab === 'admin') title.textContent = '管理审核';
      else title.textContent = '云端方案库';
    }
    overlayEl.querySelectorAll('[data-cloud-tab]').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.cloudTab === currentTab);
    });
  }

  function openCloud(tab, opts) {
    cloudOpenOrigin = (opts && opts.origin) || '';
    cloudOpenFocus = (opts && opts.focus) || '';
    if (tab) currentTab = tab;
    // 未登录时走独立鸣潮风登录页（不跟主题、不塞进云端弹窗）
    if (currentTab === 'auth' && !getUser() && window.WaveCalcAuth && typeof WaveCalcAuth.open === 'function') {
      WaveCalcAuth.open({ origin: cloudOpenOrigin });
      return;
    }
    if (overlayEl) {
      overlayEl.style.display = 'flex';
      void renderTab(currentTab);
      return;
    }
    overlayEl = document.createElement('div');
    overlayEl.className = 'cloud-overlay';
    overlayEl.setAttribute('data-cloud-overlay', '');
    overlayEl.innerHTML =
      '<div class="cloud-dialog is-compact" data-cloud-dialog role="dialog" aria-modal="true" aria-labelledby="cloudDialogTitle">' +
      '<header class="cloud-dialog-head">' +
      '<strong class="cloud-dialog-title" id="cloudDialogTitle" data-cloud-title>修改密码</strong>' +
      '<nav class="cloud-dialog-tabs" data-cloud-tabs hidden>' +
      '<button type="button" class="cloud-tab" data-cloud-tab="library">公开方案库</button>' +
      '<button type="button" class="cloud-tab" data-cloud-tab="auth">账号</button>' +
      '<button type="button" class="cloud-tab" data-cloud-tab="admin">管理审核</button>' +
      '</nav>' +
      '<button type="button" class="cloud-dialog-close" data-cloud-close title="关闭" aria-label="关闭">✕</button>' +
      '</header>' +
      '<p class="cloud-status" data-cloud-status></p>' +
      '<div class="cloud-dialog-body" data-cloud-body></div>' +
      '</div>';
    document.body.appendChild(overlayEl);
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) { closeCloud(); return; }
      var close = e.target.closest('[data-cloud-close]');
      if (close) { closeCloud(); return; }
      var tabBtn = e.target.closest('[data-cloud-tab]');
      if (tabBtn) {
        currentTab = tabBtn.dataset.cloudTab;
        if (currentTab === 'auth' && !getUser() && window.WaveCalcAuth && typeof WaveCalcAuth.open === 'function') {
          WaveCalcAuth.open({ origin: 'cloud' });
          return;
        }
        void renderTab(currentTab);
        return;
      }
      var importBtn = e.target.closest('[data-cloud-import]');
      if (importBtn) { void importFromCode(importBtn.dataset.cloudImport); return; }
      var copyBtn = e.target.closest('[data-cloud-copy]');
      if (copyBtn) { copyText(copyBtn.dataset.cloudCopy); return; }
      var uploadBtn = e.target.closest('[data-cloud-upload]');
      if (uploadBtn) { void doUpload(uploadBtn); return; }
      var updateBtn = e.target.closest('[data-cloud-update]');
      if (updateBtn) { void doUpdate(updateBtn.dataset.cloudUpdate); return; }
      var approveBtn = e.target.closest('[data-cloud-approve]');
      if (approveBtn) { void doApprove(approveBtn.dataset.cloudApprove); return; }
      var rejectBtn = e.target.closest('[data-cloud-reject]');
      if (rejectBtn) { void doReject(rejectBtn.dataset.cloudReject); return; }
      var loginBtn = e.target.closest('[data-cloud-login]');
      if (loginBtn) { void doLogin(); return; }
      var signupBtn = e.target.closest('[data-cloud-signup]');
      if (signupBtn) { void doSignup(); return; }
      var logoutBtn = e.target.closest('[data-cloud-logout]');
      if (logoutBtn) { void doLogout(); return; }
      var changePassBtn = e.target.closest('[data-cloud-changepass]');
      if (changePassBtn) {
        var passForm = overlayEl.querySelector('[data-cloud-passchange]');
        if (passForm) passForm.hidden = !passForm.hidden;
        return;
      }
      var changePassConfirm = e.target.closest('[data-cloud-changepass-confirm]');
      if (changePassConfirm) { void doChangePassword(); return; }
      var searchBtn = e.target.closest('[data-cloud-search]');
      if (searchBtn) { void renderLibrary(); return; }
      var refreshBtn = e.target.closest('[data-cloud-refresh]');
      if (refreshBtn) { void renderTab(currentTab); return; }
      var backBtn = e.target.closest('[data-cloud-back]');
      if (backBtn) { detailCache = {}; void renderLibrary(); return; }
      var moreBtn = e.target.closest('[data-cloud-more]');
      if (moreBtn) { void loadLibraryMore(); return; }
    });
    overlayEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCloud(); });
    void renderTab(currentTab || 'auth');
  }
  function closeCloud() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    cloudOpenFocus = '';
  }
  function tabStyle(tab) {
    // 保留兼容；实际样式由 .cloud-tab.is-active 控制
    return '';
  }

  async function renderTab(tab) {
    currentTab = tab || 'auth';
    if (!overlayEl) return;
    var body = overlayEl.querySelector('[data-cloud-body]');
    if (!body) return;
    stateInfo.user = getUser();
    stateInfo.role = await fetchMyRole();
    var adminVisible = stateInfo.role === 'admin';
    // 普通用户不得进入公开方案库 / 管理审核（后续另做管理页）
    if (!adminVisible && (currentTab === 'library' || currentTab === 'admin')) {
      currentTab = 'auth';
    }
    syncDialogChrome(adminVisible);
    if (currentTab === 'library') { void renderLibrary(); return; }
    if (currentTab === 'admin') {
      if (!adminVisible) {
        setStatus('仅管理员可查看', true);
        void renderAuth();
        return;
      }
      void renderAdmin();
      return;
    }
    void renderAuth();
  }

  function renderLibrary() {
    var body = overlayEl.querySelector('[data-cloud-body]');
    setStatus('加载中…');
    body.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input data-cloud-q type="text" placeholder="搜索标题或分享码" value="' + esc(currentQuery || '') + '" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #384055;background:#141824;color:#e8ecf5" />' +
      '<button type="button" data-cloud-search class="btn sm primary" style="padding:8px 16px;border-radius:8px;border:none;background:#2f6feb;color:#fff;cursor:pointer">搜索</button>' +
      '<button type="button" data-cloud-refresh style="padding:8px 14px;border-radius:8px;border:1px solid #384055;background:#1d2230;color:#cfd6e6;cursor:pointer">刷新</button>' +
      '</div><div data-cloud-list></div>';
    void loadLibrary('');
  }
  function libraryItemHtml(it) {
    var sum = it.summary || {};
    var author = (it.profiles && it.profiles.display_name) || '匿名';
    return '<div style="border:1px solid #2c3345;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#171b26">' +
      '<div style="display:flex;gap:10px;align-items:center">' +
      '<strong>' + esc(it.title) + '</strong>' +
      '<span style="color:#7c8699;font-size:12px">' + esc(it.share_code) + '</span>' +
      '<span style="flex:1"></span>' +
      '<span style="color:#ffd166;font-size:12px">总伤 ' + fmtNum(sum.teamTotal) + ' · DPS ' + fmtNum(sum.teamDps) + '</span>' +
      '</div>' +
      '<div style="color:#8b94a8;font-size:12px;margin-top:6px">作者 ' + esc(author) + ' · ' + fmtDate(it.updated_at) +
      (it.tags && it.tags.length ? ' · ' + it.tags.map(esc).join(' / ') : '') + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px">' +
      '<button type="button" data-cloud-import="' + esc(it.share_code) + '" style="padding:5px 12px;border-radius:7px;border:none;background:#2f6feb;color:#fff;cursor:pointer">导入到工作区</button>' +
      '<button type="button" data-cloud-copy="' + esc(it.share_code) + '" style="padding:5px 12px;border-radius:7px;border:1px solid #384055;background:#1d2230;color:#cfd6e6;cursor:pointer">复制分享码</button>' +
      '</div></div>';
  }

  function libraryMoreHtml() {
    return '<div style="text-align:center;padding:8px 0 4px">' +
      '<button type="button" data-cloud-more style="padding:8px 26px;border-radius:8px;border:1px solid #384055;background:#1d2230;color:#cfd6e6;cursor:pointer">加载更多</button>' +
      '</div>';
  }

  async function loadLibraryMore() {
    var listEl = overlayEl.querySelector('[data-cloud-list]');
    var moreEl = listEl && listEl.querySelector('[data-cloud-more]');
    if (moreEl) moreEl.closest('div').remove();
    var q = currentQuery || '';
    try {
      var data = await api('/schemes?limit=' + LIBRARY_PAGE + '&offset=' + libraryOffset + (q ? '&q=' + encodeURIComponent(q) : ''));
      var batch = data.items || [];
      if (!batch.length) {
        setStatus('已加载全部公开方案');
        return;
      }
      libraryOffset += batch.length;
      var html = batch.map(libraryItemHtml).join('');
      listEl.insertAdjacentHTML('beforeend', html);
      if (batch.length >= LIBRARY_PAGE) listEl.insertAdjacentHTML('beforeend', libraryMoreHtml());
      setStatus('共 ' + libraryOffset + '+ 条公开方案');
    } catch (err) {
      listEl.insertAdjacentHTML('beforeend', '<p style="color:#e07b7b">加载更多失败：' + esc(err.message) + '</p>');
      listEl.insertAdjacentHTML('beforeend', libraryMoreHtml());
    }
  }

  async function loadLibrary(q) {
    var listEl = overlayEl.querySelector('[data-cloud-list]');
    try {
      var data = await api('/schemes?limit=' + LIBRARY_PAGE + (q ? '&q=' + encodeURIComponent(q) : ''));
      var items = data.items || [];
      currentQuery = q;
      libraryOffset = items.length;
      if (!items.length) {
        listEl.innerHTML = '<p style="color:#8b94a8;text-align:center;padding:40px 0">还没有公开方案，快来发布第一个吧</p>';
        setStatus('共 0 条');
        return;
      }
      listEl.innerHTML = items.map(libraryItemHtml).join('');
      if (items.length >= LIBRARY_PAGE) listEl.insertAdjacentHTML('beforeend', libraryMoreHtml());
      setStatus('共 ' + items.length + ' 条公开方案');
    } catch (err) {
      listEl.innerHTML = '<p style="color:#e07b7b">加载失败：' + esc(err.message) + '</p>';
      setStatus(err.message, true);
    }
  }

  async function importFromCode(code) {
    var W = window.__WC;
    var importGeneration = W.configWorkspaceOperation.generation;
    if (typeof (window.__WC && window.__WC.parseSchemeImport) !== 'function' || typeof (window.__WC && window.__WC.importWorkspaceFromData) !== 'function') {
      setStatus('导入函数未就绪', true);
      return;
    }
    try {
      setStatus('下载方案中…');
      var detail = await api('/schemes/' + encodeURIComponent(code));
      var payload = detail.payload;
      if (!payload) throw new Error('方案无数据');
      var parsed = parseSchemeImport(payload);
      if (parsed.type !== 'scheme') throw new Error('该方案不是完整工作区格式');
      W.configWorkspaceOperation.assertGeneration(importGeneration);
      var me = getUser();
      var authorId = detail && detail.profiles && detail.profiles.id;
      var sourceCode = me && authorId && String(me.id) === String(authorId) ? String(code || '') : '';
      var imported = await W.importWorkspaceFromData(parsed.data,
        Object.assign({}, parsed.meta || {}, { name: detail.title || parsed.meta?.name, shareCode: sourceCode }));
      if (imported?.ok === false) throw new Error(imported.message || '工作台正在切换，请重试导入');
      setStatus('已导入「' + detail.title + '」到工作区');
      closeCloud();
    } catch (err) {
      setStatus('导入失败：' + err.message, true);
    }
  }
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setStatus('已复制 ' + text); }, function () { setStatus('复制失败', true); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
        setStatus('已复制 ' + text);
      }
    } catch (e) { setStatus('复制失败', true); }
  }

  function renderAuth() {
    var body = overlayEl.querySelector('[data-cloud-body]');
    var user = stateInfo.user;
    if (!user) {
      if (window.WaveCalcAuth && typeof WaveCalcAuth.open === 'function') {
        body.innerHTML = '<p class="cloud-muted" style="text-align:center;padding:28px 0">正在打开登录页…</p>';
        WaveCalcAuth.open({ origin: cloudOpenOrigin || 'cloud' });
        return;
      }
      body.innerHTML = '<p class="cloud-error" style="text-align:center;padding:28px 0">登录模块未加载</p>';
      return;
    }
    var isAdmin = stateInfo.role === 'admin';
    var initial = esc(String(user.email || '用').trim().slice(0, 1).toUpperCase() || '用');
    setStatus('');
    body.innerHTML =
      '<div class="cloud-auth">' +
      '<div class="cloud-auth-user">' +
      '<div class="cloud-auth-avatar" aria-hidden="true">' + initial + '</div>' +
      '<div class="cloud-auth-meta">' +
      '<div class="cloud-auth-email">' + esc(user.email) + '</div>' +
      '<span class="cloud-auth-role' + (isAdmin ? ' is-admin' : '') + '">' + (isAdmin ? '管理员' : '普通用户') + '</span>' +
      '</div>' +
      '</div>' +
      '<form class="cloud-auth-form" data-cloud-passchange onsubmit="return false">' +
      '<label class="cloud-field">' +
      '<span>新密码</span>' +
      '<input data-cloud-newpass type="password" autocomplete="new-password" placeholder="至少 6 位" />' +
      '</label>' +
      '<label class="cloud-field">' +
      '<span>确认新密码</span>' +
      '<input data-cloud-newpass2 type="password" autocomplete="new-password" placeholder="再次输入新密码" />' +
      '</label>' +
      '<button type="button" class="cloud-btn cloud-btn-primary" data-cloud-changepass-confirm>确认修改密码</button>' +
      '</form>' +
      '<button type="button" class="cloud-btn cloud-btn-danger" data-cloud-logout>退出登录</button>' +
      '<p class="cloud-auth-hint">上传 / 更新公开方案请到「数据导出」页操作。</p>' +
      '</div>';
    cloudOpenFocus = '';
  }

  async function loadMySchemes() {
    var el = overlayEl.querySelector('[data-cloud-mine]');
    if (!el) return;
    try {
      var data = await api('/my/schemes', { auth: true });
      var items = data.items || [];
      if (!items.length) { el.innerHTML = '<p style="color:#8b94a8">还没有上传过方案</p>'; return; }
      var statusMap = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
      el.innerHTML = items.map(function (it) {
        return '<div style="border:1px solid #2c3345;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#171b26">' +
          '<div style="display:flex;align-items:center;gap:10px"><strong>' + esc(it.title) + '</strong>' +
          '<span style="font-size:12px;color:#7c8699">' + esc(it.share_code) + '</span>' +
          '<span style="font-size:12px;color:' + (it.status === 'approved' ? '#58d68d' : it.status === 'rejected' ? '#e07b7b' : '#ffd166') + '">' + (statusMap[it.status] || it.status) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button type="button" data-cloud-copy="' + esc(it.share_code) + '" style="padding:4px 10px;border-radius:7px;border:1px solid #384055;background:#1d2230;color:#cfd6e6;cursor:pointer">复制分享码</button>' +
          '</div>' +
          (it.reject_reason ? '<div style="color:#e07b7b;font-size:12px;margin-top:4px">驳回原因：' + esc(it.reject_reason) + '</div>' : '') +
          '</div>';
      }).join('');
    } catch (err) {
      if (el) el.innerHTML = '<p style="color:#e07b7b">' + esc(err.message) + '</p>';
    }
  }

  function collectUploadFields(override) {
    override = override || {};
    var titleEl = overlayEl && overlayEl.querySelector('[data-cloud-title]');
    var descEl = overlayEl && overlayEl.querySelector('[data-cloud-desc]');
    var tagsEl = overlayEl && overlayEl.querySelector('[data-cloud-tags]');
    var title = (override.title != null ? override.title : (titleEl && titleEl.value || '')).trim();
    if (!title) throw new Error('请填写方案名称');
    var refVideo = String(override.refVideoUrl || '').trim();
    if (!refVideo) {
      try {
        if (typeof state !== 'undefined' && state && state.refVideoUrl) refVideo = String(state.refVideoUrl).trim();
      } catch (e) {}
    }
    var tags = override.tags;
    if (!tags) {
      tags = (tagsEl && tagsEl.value || '').split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 10);
    }
    return {
      title: title,
      description: override.description != null ? String(override.description || '') : ((descEl && descEl.value || '').trim()),
      tags: tags,
      meta: { name: title, author: (getUser() && getUser().email) || '', refVideoUrl: refVideo },
    };
  }
  /** PROBE_FIX_UPLOAD_TRANSFERABILITY：判断一行在「别人的浏览器」里能不能真正应用。
   *  cumulative → 必须有随方案一起走的基底锚点（否则 applyExportCfgV2CumulativeToWorkspace 无从落地）
   *  excel      → 行内 finalEditable + schemaVersion
   *  legacy/independent → 必须有内嵌整包（payloadId 只指向作者本机，跨设备读不到）
   *  返回问题行数组（空数组 = 全部异地可用）。纯数据判断，不读本机存储。 */
  function checkConfigRowsTransferable(rows, anchor) {
    var list = Array.isArray(rows) ? rows : [];
    var hasAnchor = !!(anchor && anchor.workspace);
    var bad = [];
    for (var i = 0; i < list.length; i += 1) {
      var s = list[i];
      if (!s || typeof s !== 'object') continue;
      if (s.included === false) continue;
      var t = s.type === 'cumulative' ? 'cumulative' : s.type === 'excel' ? 'excel' : s.type === 'independent' ? 'independent' : 'legacy';
      var reason = '';
      if (t === 'cumulative') {
        if (!hasAnchor) reason = '缺少基底锚点（累积行 = 锚点 + 逐行增量，锚点不在就没有落点）';
      } else if (t === 'excel') {
        if (!(s.finalEditable && typeof s.finalEditable === 'object' && s.schemaVersion)) reason = '缺少 finalEditable/schemaVersion';
      } else if (!(s.payload && typeof s.payload === 'object' && Object.keys(s.payload).length)) {
        reason = '缺少内嵌整包（只剩指向本机的 payloadId）';
      }
      if (reason) bad.push({ id: s.id, label: s.label || s.fingerprint || s.id, type: t, reason: reason });
    }
    return bad;
  }
  try { window.checkConfigRowsTransferable = checkConfigRowsTransferable; if (window.__WC) window.__WC.checkConfigRowsTransferable = checkConfigRowsTransferable; } catch (e) { /* ignore */ }

  async function buildUploadBody(fieldOverride, extra, ownership) {
    var identityGuard = window.__WC.workspaceSchemeIdentity;
    var sourceIdentity = ownership || identityGuard.capture();
    identityGuard.assertCurrent(sourceIdentity);
    if (typeof (window.__WC && window.__WC.assertNoCustomCharactersForPublicUpload) === 'function') {
      assertNoCustomCharactersForPublicUpload();
    }
    // Batch A（P0-5）：公开上传前预检测试服（CSF）角色/武器（仅 9xxx 临时段拦截；1212 景燃 / 21010076 千般渡 / 清宵 1413 / 云琅 21020106 已批准上线勿拦）
    if (typeof state !== 'undefined' && Array.isArray(state.members)) {
      var csfBad = state.members.some(function (m) {
        var cid = String(m && m.characterId || '').trim();
        var wid = String(m && (m.weaponSelection && m.weaponSelection.id || m.weaponId) || '').trim();
        return /^9\d{3}$/.test(cid);
      });
      if (csfBad) throw new Error('公开库不允许上传测试服（CSF）角色/武器方案');
    }
    if (typeof (window.__WC && window.__WC.buildWorkspacePayload) !== 'function') throw new Error('工作区打包函数未就绪');
    var fields = collectUploadFields(fieldOverride || null);
    var summary = null;
    try {
      // 上传前强制现算：summary 与注入的 results 必须来自本次计算，杜绝过期客户端快照
      if (typeof (window.__WC && window.__WC.buildExportSummary) === 'function') summary = buildExportSummary({ skipCompute: false });
    } catch (e) {
      throw new Error('计算未完成，请先完成一次计算后再上传');
    }
    if (summary) {
      fields.meta.summary = summary;
      fields.summary = summary;
    }
    var payload = { meta: fields.meta, data: buildWorkspacePayload() };
    // Batch B（P0-3）：上传前快照行一致性门禁 + B+ 旧数据自动重算（只改打包副本，不动本地 state）
    // PROBE_FIX_UPLOAD_SELFCHECK_AWAIT：0.1% 会把 1~4% 的正常漂移全判成「陈旧」⇒ 每次上传都弹框；
    // 取 1%（仍能抓住 7.9% 这类"记录与内容分家"的真故障，实测 MC-LAX35P）。
    var UPLOAD_SNAP_STALE_TOLERANCE = 0.01; // 1%
    if (payload && payload.data && Array.isArray(payload.data.exportConfigSnapshots)) {
      var cfgRows = payload.data.exportConfigSnapshots
        .filter(function (s) { return s && s.included !== false; })
        .map(function (s) { return JSON.parse(JSON.stringify(s)); });
      // 上传校验复用「全部刷新」的只读计划，避免两个入口按不同面板状态取数。
      var computePlan = window.__WC && window.__WC.cfgRefreshPlanCompute;
      if (cfgRows.length && typeof computePlan !== 'function') throw new Error('配置校验尚未就绪，请刷新页面后重试');
      var uploadPlan = null;
      try {
        if (cfgRows.length) uploadPlan = await computePlan(0, function (progress) {
          if (typeof window.__WC.setSaveStatus === 'function') window.__WC.setSaveStatus('正在校验配置行… ' + progress.done + '/' + progress.total);
        }, { skipBaseConfirm: true });
      } finally {
        if (typeof window.__WC.setSaveStatus === 'function') window.__WC.setSaveStatus('');
      }
      var freshById = new Map();
      if (uploadPlan && uploadPlan.ok && Array.isArray(uploadPlan.行)) {
        uploadPlan.行.forEach(function (entry) { if (entry.ok && entry.新值) freshById.set(String(entry.id), entry.新值); });
      }
      var staleRows = [];
      var unverifiableRows = [];
      var 保持现状 = false; // PROBE_FIX_UPLOAD_KEEP_FLAG：保持现状上传 ⇒ 不标记 snapshotsFresh（转人工审核）
      for (var __ci = 0; __ci < cfgRows.length; __ci += 1) {
        var row = cfgRows[__ci];
        try {
          var fresh = freshById.get(String(row.id));
          if (!fresh || !Number.isFinite(Number(fresh.teamDps))) { unverifiableRows.push(row); continue; }
          if (row._staleImported === true) {
            // B+：导入旧数据行自动重算并回写（仅副本；不可回溯行走剔除分支）
            row.teamTotal = Number(fresh.teamTotal) || 0;
            row.teamDps = Number(fresh.teamDps) || 0;
            row.axisDuration = Number(fresh.axisDuration) || 0;
            row.specialTotal = Number(fresh.specialTotal) || 0;
            if (Array.isArray(fresh.specialItems)) row.specialItems = fresh.specialItems;
            if (Array.isArray(fresh.members)) row.members = fresh.members;
            delete row._staleImported;
            continue;
          }
          var storedDps = Number(row.teamDps) || 0;
          var freshDps = Number(fresh.teamDps) || 0;
          if (storedDps > 0 && Math.abs(freshDps - storedDps) / storedDps > UPLOAD_SNAP_STALE_TOLERANCE) {
            staleRows.push(row);
          }
        } catch (e) {
          unverifiableRows.push(row);
        }
      }
      try { if (typeof window.setSaveStatus === 'function') window.setSaveStatus(''); } catch (e1) { /* ignore */ }
      if (staleRows.length || unverifiableRows.length) {
        var staleChoice = await confirmStaleImportUpload({
          count: staleRows.length + unverifiableRows.length,
          total: cfgRows.length,
          labels: staleRows.concat(unverifiableRows).slice(0, 3).map(function (r) { return r.label || r.fingerprint || '未命名配置'; }),
        });
        if (staleChoice === 'recalc') {
          if (typeof (window.__WC && window.__WC.syncExportConfigSnapshotsFromIndex) === 'function') {
            // PROBE_FIX_UPLOAD_RECALC_BY_BASE：上传前"重算"必须按**基底**重算（用户上一步已选重算，不再弹确认）
            await (window.__WC && window.__WC.syncExportConfigSnapshotsFromIndex)(0, null, { skipBaseConfirm: true });
          }
          // 重算后重新打包（state 已更新），返回新结果
          return buildUploadBody(fieldOverride, extra);
        }
        if (staleChoice === 'drop') {
          var dropIds = new Set(staleRows.concat(unverifiableRows).map(function (r) { return r.id; }));
          cfgRows = cfgRows.filter(function (r) { return !dropIds.has(r.id); });
          payload.data.exportConfigSnapshots = cfgRows;
        }
        if (staleChoice === null) {
          throw new Error('已取消上传');
        }
        if (staleChoice === 'keep') {
          // 保持现状：卡片与配置行数值可能不一致 → 不标记 snapshotsFresh（服务端转人工审核）
          保持现状 = true; // PROBE_FIX_UPLOAD_KEEP_FLAG
          if (fields.meta.summary) delete fields.meta.summary.snapshotsFresh;
          if (fields.summary) delete fields.summary.snapshotsFresh;
        }
      }
      payload.data.exportConfigSnapshots = cfgRows;
      // 全部行一致（或已重算/剔除）：标记 snapshotsFresh=true 供服务端自动审核
      // PROBE_FIX_UPLOAD_KEEP_FLAG：原来这里会把「保持现状」刚删掉的标记又设回 true ⇒
      //   "带病上传转人工审核"的意图被自己撤销（线上 MC-LAX35P 的 snapshotsFresh:true 就是这么来的）。
      if (!保持现状 && fields.meta.summary && typeof fields.meta.summary.snapshotsFresh === 'undefined') {
        fields.meta.summary.snapshotsFresh = true;
        if (fields.summary) fields.summary.snapshotsFresh = true;
      }
    } else if (fields.meta.summary && typeof fields.meta.summary.snapshotsFresh === 'undefined') {
      // 无配置行方案：视为一致
      fields.meta.summary.snapshotsFresh = true;
      if (fields.summary) fields.summary.snapshotsFresh = true;
    }
    // 公开上传必须嵌入配置快照内容：否则导入方无法查看/应用每行具体配置（快照读取失败）
    if (
      payload &&
      payload.data &&
      Array.isArray(payload.data.exportConfigSnapshots) &&
      payload.data.exportConfigSnapshots.length &&
      typeof (window.__WC && window.__WC.embedConfigSnapshotPayloads) === 'function'
    ) {
      payload.data.exportConfigSnapshots = await (window.__WC && window.__WC.embedConfigSnapshotPayloads)(
        payload.data.exportConfigSnapshots
      );
    }
    // PROBE_FIX_UPLOAD_ANCHOR：公开上传必须携带基底锚点（与导出路径 buildSchemePackage 的「草稿/方案必须携带基底」对齐）。
    // 累积链精行 = 锚点 + 逐行 diff；锚点不上传，导入方拿到的是「无根开关」，
    // applyExportCfgV2CumulativeToWorkspace 会因为 state.exportConfigAnchor 为空直接 return null。
    try {
      if (
        payload &&
        payload.data &&
        !payload.data.exportConfigAnchor &&
        typeof state !== 'undefined' &&
        state &&
        state.exportConfigAnchor &&
        state.exportConfigAnchor.workspace &&
        typeof (window.__WC && window.__WC.serializeExportCfgAnchor) === 'function'
      ) {
        payload.data.exportConfigAnchor = (window.__WC && window.__WC.serializeExportCfgAnchor)(
          state.exportConfigAnchor
        );
      }
    } catch (e) { /* 锚点打包失败不阻断上传（无累积行的方案不受影响） */ }
    // PROBE_FIX_UPLOAD_TRANSFERABILITY：上传前「异地可用性」自检 —— 让「别人导入后点应用能不能用」在上传时就暴露，
    // 而不是等对方发现 DPS 猛掉。复用现成的 confirmStaleImportUpload 弹窗（重算 / 剔除 / 保持现状 / 取消）。
    try {
      var tfRows = payload && payload.data && Array.isArray(payload.data.exportConfigSnapshots) ? payload.data.exportConfigSnapshots : [];
      var tfBad = tfRows.length ? checkConfigRowsTransferable(tfRows, payload.data.exportConfigAnchor) : [];
      if (tfBad.length) {
        var tfChoice = await confirmStaleImportUpload({
          count: tfBad.length,
          total: tfRows.length,
          labels: tfBad.slice(0, 3).map(function (r) { return (r.label || r.id) + '（' + r.reason + '）'; }),
        });
        if (tfChoice === null) throw new Error('已取消上传');
        if (tfChoice === 'drop') {
          var tfDrop = {};
          tfBad.forEach(function (r) { tfDrop[r.id] = 1; });
          payload.data.exportConfigSnapshots = tfRows.filter(function (r) { return !tfDrop[r.id]; });
        }
        if (tfChoice === 'recalc') {
          if (typeof (window.__WC && window.__WC.syncExportConfigSnapshotsFromIndex) === 'function') {
            await (window.__WC && window.__WC.syncExportConfigSnapshotsFromIndex)(0, null, { skipBaseConfirm: true }); // PROBE_FIX_UPLOAD_RECALC_BY_BASE
          }
          payload.data.exportConfigSnapshots = await (window.__WC && window.__WC.embedConfigSnapshotPayloads)(payload.data.exportConfigSnapshots);
          if (!payload.data.exportConfigAnchor && typeof state !== 'undefined' && state && state.exportConfigAnchor && state.exportConfigAnchor.workspace && typeof (window.__WC && window.__WC.serializeExportCfgAnchor) === 'function') {
            payload.data.exportConfigAnchor = (window.__WC && window.__WC.serializeExportCfgAnchor)(state.exportConfigAnchor);
          }
          // 重算后复核：仍不合格就不再递归打扰，按「保持现状」继续并交给人工审核
          var tfLeft = checkConfigRowsTransferable(payload.data.exportConfigSnapshots, payload.data.exportConfigAnchor);
          if (tfLeft.length && fields.summary) { fields.summary.snapshotsFresh = false; if (fields.meta && fields.meta.summary) fields.meta.summary.snapshotsFresh = false; }
        }
        if (tfChoice === 'keep') {
          if (fields.summary) fields.summary.snapshotsFresh = false;
          if (fields.meta && fields.meta.summary) fields.meta.summary.snapshotsFresh = false;
        }
      }
    } catch (e) {
      if (String((e && e.message) || '').indexOf('已取消上传') !== -1) throw e;
      // 自检本身出错不阻断上传
      try { console.warn('[transferability]', e); } catch (_) {}
    }
    // serializeMember 不写 results：上传时把成员计算结果注入 payload，服务端据此标记 _serverComputed:true
    if (payload && payload.data && Array.isArray(payload.data.members) && Array.isArray(state && state.members)) {
      payload.data.members.forEach(function (m, i) {
        var mm = state.members[i];
        if (mm && mm.results) {
          m.results = {
            total: Number(mm.results.total) || 0,
            dps: Number(mm.results.dps) || 0,
            axisDuration: Number(mm.results.axisDuration) || 0,
            cycleGrandTotal: Number(mm.results.cycleGrandTotal) || 0,
            cycleMode: mm.results.cycleMode || '',
          };
        }
      });
    }
    // 特殊技能（处决/效应等）结果注入：供服务端 buildSummary 累加
    try {
      if (typeof state !== 'undefined' && state && state.specialSkills && state.specialSkills.results) {
        var sr = state.specialSkills.results;
        if (Number(sr.total) > 0) {
          if (!payload.data.specialSkills) payload.data.specialSkills = {};
          payload.data.specialSkills.results = {
            total: Number(sr.total) || 0,
            dps: Number(sr.dps) || 0,
            axisDuration: Number(sr.axisDuration) || 0,
            cycleGrandTotal: Number(sr.cycleGrandTotal) || 0,
            cycleMode: sr.cycleMode || '',
          };
        }
      }
    } catch (e) {}
    // PROBE_FIX_CFG_ROW_PACK_UPLOAD（2026-09-13）：把每行的内嵌整包 + 锚点整块收成一份自包含的包（实测 12.19MB → 约 3MB）。
    // ⚠️ **不打包 payload.data.members**：服务端 server/utils.js 用它算摘要（成员名/角色/总伤/分母）
    //    并做「自定义角色 / 测试服 CSF」拦截（index.js:691/694）⇒ 打包它会让服务端看成"没有成员"。
    //    入口函数 packCfgRowsForUpload 里也硬性丢掉了 members（双重保险）。
    // ⚠️ 默认开启；加 ?cfgpack=0 可关。失败一律 fail-open（按老格式上传），绝不因为打包挡住用户。
    // 位置保证：本段在「陈旧行自检 / 锚点注入 / 成员 results 注入」**之后**、return 之前 ⇒ 那些逻辑看到的是未打包的数据。
    try {
      var packRowsForUpload = window.__WC && window.__WC.packCfgRowsForUpload;
      if (typeof packRowsForUpload === 'function' && payload && payload.data && Array.isArray(payload.data.exportConfigSnapshots) && payload.data.exportConfigSnapshots.length) {
        var packedRows = packRowsForUpload(payload.data.exportConfigSnapshots, {
          anchor: payload.data.exportConfigAnchor,
        });
        if (packedRows && packedRows.pack) {
          payload.data.exportConfigSnapshots = packedRows.rows;
          if (packedRows.anchor !== undefined) payload.data.exportConfigAnchor = packedRows.anchor;
          payload.data.cfgRowPack = packedRows.pack;
        }
      }
    } catch (e) {
      if (typeof console === 'object' && console.warn) console.warn('[cfgpack] 上传打包失败，按老格式上传：' + (e && e.message));
    }
    identityGuard.assertCurrent(sourceIdentity);
    return Object.assign({ payload: payload, summary: fields.summary }, fields, extra || {});
  }

  async function uploadCurrentScheme(opts, ownership) {
    var guard = window.__WC.workspaceSchemeIdentity;
    var identity = ownership || guard.capture();
    var body = await buildUploadBody(opts || {}, undefined, identity);
    if (body.payload?.data?.exportCardDraft) body.payload.data.exportCardDraft.shareCode = '（网页上线后生成）';
    guard.assertCurrent(identity);
    return api('/schemes', { method: 'POST', auth: true, body: body });
  }

  /** 用当前工作区覆盖更新已上传方案（分享码不变，版本+1，重新待审核） */
  async function updateCurrentScheme(shareCode, opts, ownership) {
    var guard = window.__WC.workspaceSchemeIdentity;
    var identity = ownership || guard.capture();
    guard.assertTarget(identity, shareCode);
    var body = await buildUploadBody(opts || {}, undefined, identity);
    guard.assertTarget(identity, shareCode);
    return api('/schemes/' + encodeURIComponent(String(shareCode || '')), {
      method: 'PUT', auth: true, body: body,
    });
  }

  async function doUpload(btn) {
    try {
      var kind = '';
      try {
        if (typeof (window.__WC && window.__WC.normalizeAxisKind) === 'function' && state?.exportCardDraft) {
          kind = normalizeAxisKind(state.exportCardDraft.axisKind);
        }
      } catch (e) {}
      if (!kind) {
        setStatus('请先在导出页选择轴类型（全局轴 / 循环轴）', true);
        return;
      }
      var body = await buildUploadBody();
      if (body.payload?.data?.exportCardDraft) body.payload.data.exportCardDraft.shareCode = '（网页上线后生成）';
      if (!body.tags || !body.tags.length) {
        body.tags = [kind === 'loop' ? '循环轴' : '全局轴'];
      }
      var bodySize = JSON.stringify(body).length;
      if (bodySize > UPLOAD_MAX_BYTES) {
        setStatus('方案过大（实际约 ' + (bodySize / 1024 / 1024).toFixed(1) + 'MB，含配置快照），超过上传上限约 50MB；请减少配置对照行或分批上传', true);
        return;
      }
      setStatus('正在上传 ' + (bodySize / 1024 / 1024).toFixed(1) + 'MB…');
      var res = await apiUpload('/schemes', { method: 'POST', auth: true, body: body });
      setStatus('已提交，分享码 ' + res.share_code + '（待审核）');
      void loadMySchemes();
    } catch (err) {
      var mapped = classifyUploadError(err);
      setStatus(mapped || ('上传失败：' + (err && err.message)), true);
      var stEl = overlayEl && overlayEl.querySelector('[data-cloud-status]');
      if (stEl && !stEl.querySelector('[data-upload-retry]')) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'btn sm';
        rb.setAttribute('data-upload-retry', '1');
        rb.textContent = '重试上传';
        rb.style.cssText = 'margin-left:8px;vertical-align:middle';
        rb.addEventListener('click', function () { rb.remove(); doUpload(btn); });
        stEl.appendChild(rb);
      }
    }
  }
  async function doUpdate(code) {
    try {
      var identity = window.__WC.workspaceSchemeIdentity.capture();
      window.__WC.workspaceSchemeIdentity.assertTarget(identity, code);
      var body = await buildUploadBody(undefined, undefined, identity);
      var bodySize = JSON.stringify(body).length;
      if (bodySize > UPLOAD_MAX_BYTES) {
        setStatus('方案过大（实际约 ' + (bodySize / 1024 / 1024).toFixed(1) + 'MB，含配置快照），超过上传上限约 50MB；请减少配置对照行或分批上传', true);
        return;
      }
      setStatus('正在更新 ' + (bodySize / 1024 / 1024).toFixed(1) + 'MB…');
      window.__WC.workspaceSchemeIdentity.assertTarget(identity, code);
      var res = await apiUpload('/schemes/' + encodeURIComponent(code), { method: 'PUT', auth: true, body: body });
      setStatus('已更新为 v' + res.version + '（重新待审核）');
      void loadMySchemes();
    } catch (err) {
      var mapped = classifyUploadError(err);
      setStatus(mapped || ('更新失败：' + (err && err.message)), true);
      var stEl = overlayEl && overlayEl.querySelector('[data-cloud-status]');
      if (stEl && !stEl.querySelector('[data-upload-retry]')) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'btn sm';
        rb.setAttribute('data-upload-retry', '1');
        rb.textContent = '重试更新';
        rb.style.cssText = 'margin-left:8px;vertical-align:middle';
        rb.addEventListener('click', function () { rb.remove(); doUpdate(code); });
        stEl.appendChild(rb);
      }
    }
  }

  function renderAdmin() {
    var body = overlayEl.querySelector('[data-cloud-body]');
    body.innerHTML = '<h3 style="margin:0 0 12px">待审核方案</h3><div data-cloud-admin></div>';
    void loadAdmin();
  }
  async function loadAdmin() {
    var el = overlayEl.querySelector('[data-cloud-admin]');
    try {
      var data = await api('/admin/schemes?status=pending&limit=50', { auth: true });
      var items = data.items || [];
      if (!items.length) { el.innerHTML = '<p style="color:#8b94a8">暂无待审核方案</p>'; return; }
      el.innerHTML = items.map(function (it) {
        var author = (it.profiles && (it.profiles.display_name || it.profiles.email)) || '未知';
        return '<div style="border:1px solid #2c3345;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#171b26">' +
          '<div style="display:flex;align-items:center;gap:10px"><strong>' + esc(it.title) + '</strong>' +
          '<span style="font-size:12px;color:#7c8699">' + esc(it.share_code) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button type="button" data-cloud-approve="' + esc(it.id) + '" style="padding:4px 12px;border:none;border-radius:7px;background:#27ae60;color:#fff;cursor:pointer">通过</button>' +
          '<button type="button" data-cloud-reject="' + esc(it.id) + '" style="padding:4px 12px;border:none;border-radius:7px;background:#c0392b;color:#fff;cursor:pointer">驳回</button>' +
          '</div>' +
          '<div style="color:#8b94a8;font-size:12px;margin-top:4px">作者 ' + esc(author) + ' · ' + fmtDate(it.submitted_at) + '</div>' +
          '</div>';
      }).join('');
    } catch (err) {
      el.innerHTML = '<p style="color:#e07b7b">' + esc(err.message) + '</p>';
    }
  }
  async function doApprove(id) {
    try {
      setStatus('审核中…');
      await api('/admin/schemes/' + encodeURIComponent(id) + '/approve', { method: 'POST', auth: true, body: {} });
      setStatus('已通过');
      void loadAdmin();
    } catch (err) { setStatus('操作失败：' + err.message, true); }
  }
  async function doReject(id) {
    var reason = await DialogKit.prompt({ title: '驳回原因', placeholder: '驳回原因', max: 300 });
    if (reason === null) return;
    try {
      setStatus('审核中…');
      await api('/admin/schemes/' + encodeURIComponent(id) + '/reject', { method: 'POST', auth: true, body: { reason: reason } });
      setStatus('已驳回');
      void loadAdmin();
    } catch (err) { setStatus('操作失败：' + err.message, true); }
  }

  async function doLogin() {
    var emailEl = overlayEl.querySelector('[data-cloud-email]');
    var passEl = overlayEl.querySelector('[data-cloud-pass]');
    var email = emailEl && emailEl.value || '';
    var pass = passEl && passEl.value || '';
    if (!email || !pass) { setStatus('请填写账号和密码', true); return; }
    try {
      setStatus('登录中…');
      var user = await signIn(email, pass);
      setStatus('欢迎，' + email);
      renderAuth();
      if (window.SiteIntro && typeof SiteIntro.onAuthMaybeEnter === 'function') {
        SiteIntro.onAuthMaybeEnter();
      }
      if (cloudOpenOrigin === 'profile') {
        cloudOpenOrigin = '';
        closeCloud();
        if (window.WaveCalcProfile && typeof WaveCalcProfile.refresh === 'function') {
          WaveCalcProfile.refresh();
        }
      }
    } catch (err) { setStatus('登录失败：' + err.message, true); }
  }
  async function doSignup() {
    var emailEl = overlayEl.querySelector('[data-cloud-email]');
    var passEl = overlayEl.querySelector('[data-cloud-pass]');
    var agreeEl = overlayEl.querySelector('[data-cloud-agree]');
    var email = emailEl && emailEl.value || '';
    var pass = passEl && passEl.value || '';
    if (!email) { setStatus('请填写账号', true); return; }
    if (email.indexOf('@') < 0 && (email.length < 2 || email.length > 20)) { setStatus('用户名需 2-20 个字符', true); return; }
    if (pass.length < 6) { setStatus('密码至少 6 位', true); return; }
    if (!agreeEl || !agreeEl.checked) { setStatus('请先阅读并同意《用户协议》和《隐私政策》', true); return; }
    try {
      setStatus('注册中…');
      var data = await signUp(email, pass);
      if (data.access_token) {
        setStatus('注册成功，已自动登录');
        renderAuth();
        if (window.SiteIntro && typeof SiteIntro.onAuthMaybeEnter === 'function') {
          SiteIntro.onAuthMaybeEnter();
        }
        if (cloudOpenOrigin === 'profile') {
          cloudOpenOrigin = '';
          closeCloud();
          if (window.WaveCalcProfile && typeof WaveCalcProfile.refresh === 'function') {
            WaveCalcProfile.refresh();
          }
        }
      }
      else setStatus('注册成功，请前往邮箱完成验证后登录');
    } catch (err) { setStatus('注册失败：' + err.message, true); }
  }
  async function doLogout() {
    await signOut();
    if (window.__notifyRefresh) window.__notifyRefresh();
    // 一并清除本机个人资料（昵称/头像），退出即回到访客状态
    try { localStorage.removeItem('wavecalc-user-profile-v1'); } catch (e) {}
    try {
      var nameEl = document.querySelector('.app-user-name');
      if (nameEl) nameEl.textContent = '用户昵称';
      var avatarEl = document.querySelector('.app-user-avatar');
      if (avatarEl) {
        avatarEl.style.backgroundImage = '';
        avatarEl.classList.remove('has-image');
        avatarEl.textContent = '用';
      }
    } catch (e) {}
    // 从个人主页等非弹窗入口退出时，弹窗可能未打开，跳过界面刷新即可
    if (overlayEl) {
      setStatus('已退出登录');
      renderAuth();
    }
  }

  async function doChangePassword() {
    var p1El = overlayEl.querySelector('[data-cloud-newpass]');
    var p2El = overlayEl.querySelector('[data-cloud-newpass2]');
    var p1 = p1El && p1El.value || '';
    var p2 = p2El && p2El.value || '';
    if (p1.length < 6) { setStatus('新密码至少 6 位', true); return; }
    if (p1 !== p2) { setStatus('两次输入的密码不一致', true); return; }
    try {
      setStatus('修改中…');
      await changePassword(p1);
      await signOut();
      setStatus('密码修改成功，请用新密码重新登录');
      renderAuth();
    } catch (err) { setStatus('修改失败：' + err.message, true); }
  }

  var currentQuery = '';
  // 侧栏「公开数据库」由 public-db.js 接管独立页；上传公开方案仅在数据导出页

  window.Cloud = (window.__WC || (window.__WC = {})).Cloud = {
    open: openCloud,
    close: closeCloud,
    api: api,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getUser: getUser,
    fetchMyRole: fetchMyRole,
    refreshSession: refreshSession,
    uploadCurrentScheme: uploadCurrentScheme,
    updateCurrentScheme: updateCurrentScheme,
    logout: doLogout,
    changePassword: changePassword,
    // 主动续期钩子：boot 与回前台时提前刷新，避免长会话静默过期后点用户中心触发无超时挂起
    tryProactiveRefresh: tryProactiveRefresh,
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') tryProactiveRefresh();
    });
    setTimeout(function () { tryProactiveRefresh(); }, 2500);
  }
})();
