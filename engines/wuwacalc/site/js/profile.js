/**
 * 个人用户主页（本机）
 * - 头像上传 / 昵称
 * - 草稿箱 / 云端方案库 / 矩阵数据库
 * - 账号设置、连接状态、消息通知、声骸配置
 * 样式跟随网站主题 CSS 变量
 */
(function () {
  const STORAGE_KEY = 'wavecalc-user-profile-v1';
  const MAX_AVATAR_EDGE = 256;
  const MAX_AVATAR_BYTES = 64 * 1024;

  let activeDataTab = 'draft';
  let activeCommunity = '';
  let identityEditing = false;
let lastCloudProfile = null;
  let lastDraftsResult = null;
  let lastConn = null;
  let renderedCloudProfile = null;
let cloudSchemesState = { items: [], error: '', loading: false };
let matrixState = { items: [], loading: false, error: '' };
let notificationsState = { items: [], unread: 0, loading: false, error: '' };
let reviewsState = { items: [], loading: false, error: '' };
let echoProfilesState = { items: [], loading: false, error: '' };

  // 各分区失效标记（H14）：true=下次 renderProfilePage 需要重拉该分区
  const profilePartitionsStale = {
    drafts: true,
    profile: true,
    conn: true,
    cloud: true,
    matrix: true,
    notifications: true,
    reviews: true,
    echo: true,
  };

  function invalidateProfilePartition(name) {
    if (Object.prototype.hasOwnProperty.call(profilePartitionsStale, name)) {
      profilePartitionsStale[name] = true;
    }
  }

  function invalidateAllProfilePartitions() {
    Object.keys(profilePartitionsStale).forEach((k) => {
      profilePartitionsStale[k] = true;
    });
  }

  function defaultProfile() {
    return { nickname: '用户昵称', avatarDataUrl: '', updatedAt: '', role: '' };
  }

  // ---------- 头像 IndexedDB 存储（M13） ----------
  const AVATAR_IDB_NAME = 'wavecalc-user-profile';
  const AVATAR_IDB_STORE = 'avatar';
  const AVATAR_IDB_KEY = 'avatar';
  let avatarObjectUrl = null; // 当前头像 Blob 的对象 URL（同步缓存，避免竞态）

  function idbAvatarOpen() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(AVATAR_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(AVATAR_IDB_STORE)) {
            req.result.createObjectStore(AVATAR_IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
      } catch (e) {
        reject(e);
      }
    });
  }

  function idbAvatarPut(blob) {
    return idbAvatarOpen().then((db) => new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(AVATAR_IDB_STORE, 'readwrite');
        tx.objectStore(AVATAR_IDB_STORE).put(blob, AVATAR_IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('头像写入失败')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('头像写入中止')); };
      } catch (e) {
        db.close();
        reject(e);
      }
    }));
  }

  function idbAvatarGet() {
    return idbAvatarOpen().then((db) => new Promise((resolve) => {
      try {
        const tx = db.transaction(AVATAR_IDB_STORE, 'readonly');
        const req = tx.objectStore(AVATAR_IDB_STORE).get(AVATAR_IDB_KEY);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); resolve(null); };
      } catch (e) {
        db.close();
        resolve(null);
      }
    }));
  }

  function idbAvatarDelete() {
    return idbAvatarOpen().then((db) => new Promise((resolve) => {
      try {
        const tx = db.transaction(AVATAR_IDB_STORE, 'readwrite');
        tx.objectStore(AVATAR_IDB_STORE).delete(AVATAR_IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); resolve(); };
      } catch (e) {
        db.close();
        resolve();
      }
    }));
  }

  function dataUrlToBlob(dataUrl) {
    const m = String(dataUrl || '').match(/^data:([^;]*)(;base64)?,(.*)$/);
    if (!m) return null;
    try {
      const mime = m[1] || 'image/jpeg';
      const body = m[3];
      const bin = m[2] ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function revokeAvatarObjectUrl() {
    if (avatarObjectUrl) {
      try { URL.revokeObjectURL(avatarObjectUrl); } catch (_) {}
      avatarObjectUrl = null;
    }
  }

  async function getAvatarDisplayUrl() {
    if (avatarObjectUrl) return avatarObjectUrl;
    try {
      const blob = await idbAvatarGet();
      if (blob) {
        avatarObjectUrl = URL.createObjectURL(blob);
        return avatarObjectUrl;
      }
    } catch (_) {}
    return '';
  }

  async function migrateLegacyProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj.avatarDataUrl === 'string' && obj.avatarDataUrl) {
        const blob = dataUrlToBlob(obj.avatarDataUrl);
        // 小字段保留在 localStorage，头像 dataURL 迁入 IndexedDB
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            nickname: String(obj.nickname || '用户昵称').trim() || '用户昵称',
            updatedAt: String(obj.updatedAt || ''),
            role: String(obj.role || ''),
          })
        );
        if (blob) {
          await idbAvatarPut(blob);
          revokeAvatarObjectUrl();
          avatarObjectUrl = URL.createObjectURL(blob);
        }
      }
    } catch (_) {}
  }

  function loadProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return defaultProfile();
      return {
        nickname: String(raw.nickname || '用户昵称').trim() || '用户昵称',
        avatarDataUrl: '', // 头像已迁至 IndexedDB，此字段仅作兼容占位
        updatedAt: String(raw.updatedAt || ''),
        role: String(raw.role || ''),
      };
    } catch (_) {
      return defaultProfile();
    }
  }

  function saveProfile(next) {
    const profile = {
      nickname: String(next.nickname || '用户昵称').trim() || '用户昵称',
      avatarDataUrl: '', // 头像走 IndexedDB，localStorage 只存小字段
      updatedAt: new Date().toISOString(),
      role: String(next.role || ''),
    };
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ nickname: profile.nickname, updatedAt: profile.updatedAt, role: profile.role })
      );
    } catch (err) {
      alert('个人资料保存失败（可能是存储已满）。请换一张较小的图片。');
      return null;
    }
    return profile;
  }

  function isLoggedIn() {
    return !!(window.Cloud && typeof Cloud.getUser === 'function' && Cloud.getUser());
  }

  function getCloudUser() {
    try {
      return window.Cloud && typeof Cloud.getUser === 'function' ? Cloud.getUser() : null;
    } catch (_) {
      return null;
    }
  }

  function accountIdText(user) {
    if (!user) return '游客';
    const id = String(user.id || '').replace(/-/g, '');
    if (id) return id.slice(0, 8).toUpperCase();
    const email = String(user.email || '');
    if (email) return email.split('@')[0];
    return '已登录';
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

  function fmtTime(iso) {
    if (!iso) return '';
    return String(iso).replace('T', ' ').slice(0, 16);
  }

  function cacheProfile(p) {
    // 小字段进 localStorage；头像仅在显式传入 avatarDataUrl 时改动 IndexedDB
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nickname: String(p.nickname || '用户昵称').trim() || '用户昵称',
          updatedAt: new Date().toISOString(),
          role: String(p.role || ''),
        })
      );
    } catch (e) {}
    if (Object.prototype.hasOwnProperty.call(p, 'avatarDataUrl')) {
      const avatar = typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : '';
      if (avatar) {
        const blob = dataUrlToBlob(avatar);
        if (blob) {
          revokeAvatarObjectUrl();
          avatarObjectUrl = URL.createObjectURL(blob);
          void idbAvatarPut(blob).catch(() => {});
        }
      } else {
        revokeAvatarObjectUrl();
        void idbAvatarDelete().catch(() => {});
      }
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      } catch (_) {
        resolve('');
      }
    });
  }

  // 云端资料为空时保留本机已有头像；显式清除头像的流程仍直接传入空值。
  function cacheCloudProfile(p) {
    const patch = {
      nickname: (p && p.display_name) || '用户昵称',
      role: p && p.role,
    };
    if (p && p.avatar_data_url) patch.avatarDataUrl = p.avatar_data_url;
    cacheProfile(patch);
  }

  async function migrateLocalAvatarToCloud(cp) {
    const owner = window.__WC.Cloud.getUser()?.id;
    if (!cp || cp.avatar_data_url || !owner) return cp;
    try {
      const localAvatar = await idbAvatarGet();
      if (!localAvatar) return cp;
      const dataUrl = await blobToDataUrl(localAvatar);
      if (!dataUrl || window.__WC.Cloud.getUser()?.id !== owner) return cp;
      const data = await Cloud.api('/me/profile', {
        method: 'PUT',
        auth: true,
        body: { avatar_data_url: dataUrl },
      });
      const migrated = data && data.profile;
      if (window.__WC.Cloud.getUser()?.id !== owner) return cp;
      if (migrated) {
        lastCloudProfile = migrated;
        cacheCloudProfile(migrated);
        return migrated;
      }
    } catch (_) {}
    return cp;
  }

  async function syncTopbar(profile) {
    const p = profile || loadProfile();
    const nameEl = document.querySelector('.app-user-name');
    const avatarEl = document.querySelector('.app-user-avatar');
    if (nameEl) nameEl.textContent = p.nickname || '用户昵称';
    if (avatarEl) {
      const url = await getAvatarDisplayUrl();
      if (url) {
        avatarEl.style.backgroundImage = `url("${url}")`;
        avatarEl.classList.add('has-image');
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.classList.remove('has-image');
        const ch = (p.nickname || '用').trim().slice(0, 1);
        avatarEl.textContent = ch;
      }
    }
  }

  function refreshIcons(root) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') return;
    try {
      lucide.createIcons({
        root: root || document.getElementById('userProfilePage') || document.body,
        attrs: { 'stroke-width': 1.75 },
      });
    } catch (_) {}
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片无法解析'));
      img.src = src;
    });
  }

  async function compressAvatar(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('请选择图片文件');
    const rawUrl = await readFileAsDataUrl(file);
    const img = await loadImage(rawUrl);
    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.88;
    let out = canvas.toDataURL('image/jpeg', quality);
    while (out.length > MAX_AVATAR_BYTES * 1.37 && quality > 0.5) {
      quality -= 0.08;
      out = canvas.toDataURL('image/jpeg', quality);
    }
    if (out.length > MAX_AVATAR_BYTES * 1.37) {
      throw new Error('图片压缩后仍过大，请换一张更小的图');
    }
    return out;
  }

  function schemeRosterText(item) {
    const s = item.meta?.summary || {};
    const names = Array.isArray(s.memberNames) ? s.memberNames.filter(Boolean) : [];
    if (names.length) return names.join(' · ');
    const dataMembers = item.data?.members;
    if (Array.isArray(dataMembers) && dataMembers.length) {
      return dataMembers
        .map((m) => m?.name || '')
        .filter(Boolean)
        .join(' · ');
    }
    return '未记录阵容';
  }

  function renderEmptyState(message, actionLabel, actionAttr) {
    return `<div class="up-empty">
      <div class="up-empty-icon" aria-hidden="true"><i data-lucide="inbox"></i></div>
      <p class="up-empty-text">${esc(message)}</p>
      ${
        actionLabel
          ? `<button type="button" class="up-btn up-btn-primary" ${actionAttr}>${esc(actionLabel)}</button>`
          : ''
      }
    </div>`;
  }

  function renderMatrixDbCards() {
    if (!isLoggedIn()) {
      return renderEmptyState('登录后查看你的矩阵数据。', '去登录', 'data-profile-login');
    }
    if (matrixState.loading) {
      return '<div class="ui-loading" aria-label="矩阵数据加载中"><span class="ui-loading-bar"></span><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>';
    }
    if (matrixState.error) {
      return `<div class="up-alert">${esc(matrixState.error)}</div>`;
    }
    const items = matrixState.items || [];
    if (!items.length) {
      return renderEmptyState(
        '还没有上传过矩阵数据。',
        '去矩阵页面上传',
        'data-profile-open-matrix'
      );
    }
    const statusMap = { pending: '待审核', approved: '已通过', rejected: '已下架' };
    return `<div class="up-scheme-list">${items
      .map((it) => {
        const status = statusMap[it.status] || it.status || '';
        const members = Array.isArray(it.members) ? it.members : [];
        const roster = members.map((m) => m && m.name).filter(Boolean).join(' · ');
        const isRejected = it.status === 'rejected';
        const metaLine = [
          status,
          `第${it.round_no || 1}轮`,
          it.boss ? esc(it.boss) : '',
          `UID ${esc(it.player_uid)}`,
          fmtTime(it.created_at),
        ]
          .filter(Boolean)
          .join(' · ');
        return `<article class="up-scheme-card">
          <div class="up-scheme-icon" aria-hidden="true"><i data-lucide="target"></i></div>
          <div class="up-scheme-body">
            <div class="up-scheme-title">${fmtNum(it.matrix_score)}<span class="up-tag up-tag-secondary">${it.is_self ? '本人' : '代传'}</span>${status ? `<span class="up-tag up-tag-secondary">${esc(status)}</span>` : ''}</div>
            <div class="up-scheme-sub">${roster ? esc(roster) + ' · ' : ''}${esc(metaLine)}</div>
          </div>
          <div class="up-scheme-actions is-always">
            ${it.video_url ? `<a class="up-icon-btn" title="查看视频" href="${esc(it.video_url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="video"></i></a>` : ''}
            <button type="button" class="up-icon-btn" title="打开矩阵页面" data-profile-open-matrix><i data-lucide="external-link"></i></button>
            ${isRejected ? `<button type="button" class="up-icon-btn" title="重新上架（重新审核）" data-profile-resubmit-matrix="${esc(it.id)}"><i data-lucide="rotate-ccw"></i></button>` : ''}
            <button type="button" class="up-icon-btn is-danger" title="删除数据" data-profile-del-matrix="${esc(it.id)}"><i data-lucide="trash-2"></i></button>
          </div>
        </article>`;
      })
      .join('')}</div>`;
  }

  function renderCloudSchemeCards() {
    if (!isLoggedIn()) {
      return renderEmptyState('登录后查看云端方案库。', '去登录', 'data-profile-login');
    }
    if (cloudSchemesState.loading) {
      return '<div class="ui-loading" aria-label="云端方案加载中"><span class="ui-loading-bar"></span><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>';
    }
    if (cloudSchemesState.error) {
      return `<div class="up-alert">${esc(cloudSchemesState.error)}</div>`;
    }
    const items = cloudSchemesState.items || [];
    if (!items.length) {
      return renderEmptyState(
        '还没有上传过云端方案。',
        '前往数据导出页',
        'data-profile-goto-export'
      );
    }
    const statusMap = { pending: '待审核', approved: '已通过', rejected: '已下架' };
    return `<div class="up-scheme-list">${items
      .map((it) => {
        const code = esc(it.share_code || '');
        const title = esc(it.title || '未命名');
        const st = statusMap[it.status] || it.status || '';
        const isRejected = it.status === 'rejected';
        const rejectReason = it.reject_reason ? `<div class="up-scheme-reject">下架原因：${esc(it.reject_reason)}</div>` : '';
        const time = esc(fmtTime(it.updated_at || it.submitted_at));
        const s = it.summary || {};
        const metaLine = [
          st,
          s.teamTotal != null ? `总伤 ${fmtNum(s.teamTotal)}` : '',
          time,
        ]
          .filter(Boolean)
          .join(' · ');
        return `<article class="up-scheme-card">
          <div class="up-scheme-icon" aria-hidden="true"><i data-lucide="cloud"></i></div>
          <div class="up-scheme-body">
            <div class="up-scheme-title">${title}<span class="up-tag up-tag-secondary">${esc(st)}</span></div>
            <div class="up-scheme-sub">${esc(metaLine)}${code ? ' · ' + code : ''}</div>
            ${rejectReason}
          </div>
          <div class="up-scheme-actions">
            <button type="button" class="up-icon-btn" title="导入到工作区编辑" data-profile-load-cloud="${code}"><i data-lucide="download"></i></button>
            <button type="button" class="up-icon-btn" title="复制分享码" data-profile-copy-code="${code}"><i data-lucide="copy"></i></button>
            <button type="button" class="up-icon-btn is-danger" title="删除方案" data-profile-del-scheme="${code}"><i data-lucide="trash-2"></i></button>
          </div>
          ${isRejected ? `<div class="up-scheme-tip">被下架方案：点击导入编辑，修改后重新上传即可再次上架</div>` : ''}
        </article>`;
      })
      .join('')}</div>`;
  }

  async function importCloudScheme(code) {
    if (!isLoggedIn()) {
      alert('请先登录');
      return;
    }
    if (typeof window.parseSchemeImport !== 'function' || typeof window.importWorkspaceFromData !== 'function') {
      alert('导入函数未就绪，请刷新后重试');
      return;
    }
    if (!(await DialogKit.confirm({ message: '导入该云端方案将覆盖当前工作区内容，继续？', okText: '导入' }))) return;
    try {
      const detail = await Cloud.api('/my/schemes/' + encodeURIComponent(code), { auth: true });
      const payload = detail && detail.payload;
      if (!payload) throw new Error('方案无数据');
      const parsed = parseSchemeImport(payload);
      if (parsed.type !== 'scheme') throw new Error('该方案不是完整工作区格式');
      await importWorkspaceFromData(parsed.data, parsed.meta || { name: detail.title || '未命名' }, {
        axis: true,
        build: true,
        buff: true,
      });
      // 我的方案必然是自己上传的：恢复来源分享码，重新上传走「覆盖更新」
      if (!state.exportCardDraft) state.exportCardDraft = {};
      state.exportCardDraft.shareCode = String(code || '');
      if (typeof window.scheduleSave === 'function') scheduleSave();
      alert('已导入到工作区，可继续编辑；修改后重新点击上传即可覆盖更新');
      setProfileOpen(false);
      if (typeof window.setWorkspacePhase === 'function') setWorkspacePhase('setup');
    } catch (e) {
      alert('导入失败：' + (e.message || '未知错误'));
    }
  }

  function renderDraftListHtml(draftsResult) {
    if (!isLoggedIn()) {
      return `<div class="up-draft-body-inner">
        <p class="up-hint">登录后使用个人草稿箱（云端保存，仅自己可见）。</p>
        <button type="button" class="up-btn up-btn-primary" data-profile-login>去登录</button>
      </div>`;
    }
    if (draftsResult && draftsResult.error) {
      return `<div class="up-draft-body-inner">
        <div class="up-alert">${esc(draftsResult.error)}</div>
      </div>`;
    }
    const items = (draftsResult && draftsResult.items) || [];
    if (!items.length) {
      return `<div class="up-draft-body-inner">
        <div class="up-empty up-empty-compact">
          <div class="up-empty-icon" aria-hidden="true"><i data-lucide="file-text"></i></div>
          <p class="up-empty-text">草稿箱还是空的：导出页点「保存当前方案」即可存入（最多 3 个）。</p>
        </div>
      </div>`;
    }
    return `<div class="up-draft-body-inner"><div class="up-scheme-list">${items
      .map((it) => {
        const s = it.summary || {};
        const label = fmtTime(it.updated_at);
        const author = String(it.author || '').trim();
        const id = esc(it.id);
        return `<article class="up-scheme-card">
          <div class="up-scheme-icon" aria-hidden="true"><i data-lucide="file-pen"></i></div>
          <div class="up-scheme-body">
            <div class="up-scheme-title">${esc(it.name)}</div>
            <div class="up-scheme-sub">${author ? esc(author) + ' · ' : ''}${label ? esc(label) : ''} · 总伤 ${fmtNum(s.teamTotal || 0)}</div>
          </div>
          <div class="up-scheme-actions is-always">
            <button type="button" class="up-icon-btn" title="打开" data-draft-open="${id}"><i data-lucide="external-link"></i></button>
            <button type="button" class="up-icon-btn is-danger" title="删除" data-draft-del="${id}"><i data-lucide="trash-2"></i></button>
          </div>
        </article>`;
      })
      .join('')}</div></div>`;
  }

  async function fetchDraftsResult() {
    if (!isLoggedIn()) return { items: [], error: '' };
    try {
      const data = await Cloud.api('/drafts', { auth: true });
      return { items: data.items || [], error: '' };
    } catch (e) {
      return { items: [], error: '草稿加载失败：' + (e.message || '未知错误') };
    }
  }

  async function fetchCloudSchemes() {
    profilePartitionsStale.cloud = false;
    if (!isLoggedIn()) {
      cloudSchemesState = { items: [], error: '', loading: false };
      return;
    }
    cloudSchemesState = { items: [], error: '', loading: true };
    try {
      const data = await Cloud.api('/my/schemes', { auth: true });
      cloudSchemesState = { items: data.items || [], error: '', loading: false };
    } catch (e) {
      cloudSchemesState = {
        items: [],
        error: e.message || '云端方案加载失败',
        loading: false,
      };
    }
  }

  async function fetchMyMatrix() {
    profilePartitionsStale.matrix = false;
    if (!isLoggedIn()) {
      matrixState = { items: [], loading: false, error: '' };
      return;
    }
    matrixState = { items: [], loading: true, error: '' };
    try {
      const data = await Cloud.api('/my/matrix-scores', { auth: true });
      matrixState = { items: data.items || [], loading: false, error: '' };
    } catch (e) {
      matrixState = { items: [], loading: false, error: e.message || '矩阵数据加载失败' };
    }
  }

  async function checkConnection() {
    if (!window.Cloud || typeof Cloud.api !== 'function') {
      return { ok: false, text: '云端未就绪', badge: '离线' };
    }
    try {
      await Cloud.api('/health');
      if (isLoggedIn()) return { ok: true, text: '云端已连接', badge: '已登录' };
      return { ok: true, text: '云端已连接', badge: '游客' };
    } catch (_) {
      return { ok: false, text: '无法连接云端', badge: '无连接' };
    }
  }

  async function cachedProfileAsCp() {
    const p = loadProfile();
    const avatarUrl = await getAvatarDisplayUrl();
    return {
      display_name: p.nickname,
      avatar_data_url: avatarUrl,
      role: p.role || (lastCloudProfile && lastCloudProfile.role) || '',
      avatar_changes: lastCloudProfile ? Number(lastCloudProfile.avatar_changes) || 0 : 0,
      nickname_changes: lastCloudProfile ? Number(lastCloudProfile.nickname_changes) || 0 : 0,
    };
  }

  // 登录成功后立即从云端水合昵称和头像；新设备没有旧设备的 IndexedDB 缓存。
  async function hydrateCloudProfile() {
    if (!isLoggedIn() || !window.Cloud || typeof Cloud.api !== 'function') return null;
    const owner = window.__WC.Cloud.getUser()?.id;
    try {
      const data = await Cloud.api('/me/profile', { auth: true });
      const cp = data && data.profile;
      if (!cp || window.__WC.Cloud.getUser()?.id !== owner) return null;
      const hydrated = await migrateLocalAvatarToCloud(cp);
      if (window.__WC.Cloud.getUser()?.id !== owner) return null;
      lastCloudProfile = hydrated || cp;
      profilePartitionsStale.profile = false;
      cacheCloudProfile(hydrated || cp);
      await syncTopbar(loadProfile());
      return hydrated || cp;
    } catch (_) {
      return null;
    }
  }

  function closeNicknameModal() {
    const el = document.querySelector('[data-profile-nick-modal]');
    if (el) el.remove();
  }

  function closePasswordModal() {
    const el = document.querySelector('[data-profile-pass-modal]');
    if (el) el.remove();
  }

  function closeProfileModals() {
    closeNicknameModal();
    closePasswordModal();
    closeCommunityModal();
    closeFeedbackModal();
  }

  function closeFeedbackModal() {
    const el = document.querySelector('[data-profile-feedback-modal]');
    if (el) el.remove();
  }

  async function submitFeedback() {
    const modal = document.querySelector('[data-profile-feedback-modal]');
    if (!modal) return;
    const catEl = modal.querySelector('[data-feedback-cat].is-on');
    const category = catEl ? catEl.dataset.feedbackCat : 'other';
    const contentEl = modal.querySelector('[data-feedback-content]');
    const content = contentEl ? contentEl.value.trim() : '';
    const statusEl = modal.querySelector('[data-feedback-status]');
    const setSt = (msg, isError) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('is-error', !!isError);
    };
    if (!content) {
      setSt('请填写反馈内容', true);
      return;
    }
    const btn = modal.querySelector('[data-feedback-submit]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '提交中…';
    }
    try {
      await Cloud.api('/feedback', {
        method: 'POST',
        auth: true,
        body: { category, content },
      });
      closeFeedbackModal();
      alert('反馈已提交，感谢你的意见！');
    } catch (err) {
      setSt('提交失败：' + (err.message || '未知错误'), true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '提交反馈';
      }
    }
  }

  function openFeedbackModal() {
    closeProfileModals();
    if (!isLoggedIn()) {
      if (window.Cloud && typeof Cloud.open === 'function') {
        Cloud.open('auth');
      } else {
        alert('请先登录');
      }
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'up-modal-overlay';
    overlay.setAttribute('data-profile-feedback-modal', '');
    overlay.innerHTML = `
      <div class="up-modal up-modal-comm" role="dialog" aria-modal="true" aria-labelledby="upFeedbackTitle">
        <header class="up-modal-head">
          <strong id="upFeedbackTitle">反馈意见箱</strong>
          <button type="button" class="up-modal-close" data-feedback-close aria-label="关闭">✕</button>
        </header>
        <div class="up-modal-body">
          <p class="up-modal-hint">反馈会直接提交给管理员处理，请选择分类：</p>
          <div class="up-feedback-cats" role="radiogroup">
            <button type="button" class="up-fb-chip is-on" data-feedback-cat="bug">Bug</button>
            <button type="button" class="up-fb-chip" data-feedback-cat="suggestion">优化建议</button>
            <button type="button" class="up-fb-chip" data-feedback-cat="other">其他</button>
          </div>
          <label class="up-field">
            <span>反馈内容</span>
            <textarea class="up-input up-feedback-input" data-feedback-content maxlength="1000" placeholder="请描述遇到的问题或建议（1000 字内）"></textarea>
          </label>
          <p class="up-modal-hint" data-feedback-status></p>
          <div class="up-modal-actions">
            <button type="button" class="up-btn up-btn-ghost" data-feedback-cancel>取消</button>
            <button type="button" class="up-btn up-btn-primary" data-feedback-submit>提交反馈</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function closeCommunityModal() {
    const el = document.querySelector('[data-profile-comm-modal]');
    if (el) el.remove();
    document.body.classList.remove('up-modal-lock');
    activeCommunity = '';
  }

  function refreshCommunityModal(which) {
    const overlay = document.querySelector('[data-profile-comm-modal]');
    if (!overlay || overlay.getAttribute('data-profile-comm-modal-type') !== which) return;
    const body = overlay.querySelector('.up-modal-body-comm');
    if (body) body.innerHTML = which === 'notify' ? renderNotificationsList() : renderReviewsList();
  }

  function openCommunityModal(which) {
    if (which !== 'notify' && which !== 'review') return;
    closeProfileModals();
    const title = which === 'notify' ? '消息通知' : '方案评价';
    const listHtml = which === 'notify' ? renderNotificationsList() : renderReviewsList();
    const overlay = document.createElement('div');
    overlay.className = 'up-modal-overlay';
    overlay.setAttribute('data-profile-comm-modal', '');
    overlay.setAttribute('data-profile-comm-modal-type', which);
    overlay.innerHTML = `
      <div class="up-modal up-modal-comm" role="dialog" aria-modal="true" aria-labelledby="upCommModalTitle">
        <header class="up-modal-head">
          <strong id="upCommModalTitle">${title}</strong>
          <button type="button" class="up-modal-close" data-profile-comm-close aria-label="关闭">✕</button>
        </header>
        <div class="up-modal-body up-modal-body-comm">${listHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('up-modal-lock');
    activeCommunity = which;
  }

  function setIdentityEditing(on) {
    identityEditing = !!on;
    const page = document.getElementById('userProfilePage');
    if (!page || page.hidden) return;
    // 仅重绘身份卡：用当前缓存资料快速切换，避免整页闪烁
    const host = page.querySelector('[data-profile-identity]');
    if (!host) {
      renderProfilePage();
      return;
    }
    const loggedIn = isLoggedIn();
    void cachedProfileAsCp().then((cp) => {
      const current = page.querySelector('[data-profile-identity]');
      if (current) {
        current.outerHTML = renderIdentityCard(loggedIn, cp);
        refreshIcons(page);
      }
    });
  }

  function openPasswordModal() {
    closeProfileModals();
    if (!isLoggedIn()) {
      if (window.Cloud && typeof Cloud.open === 'function') {
        Cloud.open('auth', { origin: 'profile' });
      } else {
        alert('请先登录');
      }
      return;
    }
    if (!window.Cloud || typeof Cloud.changePassword !== 'function') {
      alert('账号模块未就绪，请刷新页面后重试');
      return;
    }
    const user = getCloudUser();
    const email = user && user.email ? String(user.email) : '';
    const overlay = document.createElement('div');
    overlay.className = 'up-modal-overlay';
    overlay.setAttribute('data-profile-pass-modal', '');
    overlay.innerHTML = `
      <div class="up-modal" role="dialog" aria-modal="true" aria-labelledby="upPassModalTitle">
        <header class="up-modal-head">
          <strong id="upPassModalTitle">修改密码</strong>
          <button type="button" class="up-modal-close" data-profile-pass-cancel aria-label="关闭">✕</button>
        </header>
        <div class="up-modal-body">
          ${email ? `<p class="up-modal-hint">账号 · ${esc(email)}</p>` : ''}
          <label class="up-field">
            <span>新密码</span>
            <input type="password" class="up-input" data-profile-newpass autocomplete="new-password" placeholder="至少 6 位" />
          </label>
          <label class="up-field">
            <span>确认新密码</span>
            <input type="password" class="up-input" data-profile-newpass2 autocomplete="new-password" placeholder="再次输入新密码" />
          </label>
          <p class="up-modal-hint" data-profile-pass-status></p>
          <div class="up-modal-actions">
            <button type="button" class="up-btn up-btn-ghost" data-profile-pass-cancel>取消</button>
            <button type="button" class="up-btn up-btn-primary" data-profile-pass-save>确认修改</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('[data-profile-newpass]');
    if (input) input.focus();
  }

  function renderIdentityCard(loggedIn, cp) {
    const nickname = cp ? cp.display_name || '用户昵称' : '用户昵称';
    const avatarUrl = cp ? cp.avatar_data_url || '' : '';
    const avatarRemain = cp ? Math.max(0, 3 - (Number(cp.avatar_changes) || 0)) : 0;
    const nickRemain = cp ? Math.max(0, 3 - (Number(cp.nickname_changes) || 0)) : 0;
    const user = getCloudUser();
    const accountId = accountIdText(user);
    const initial = esc((nickname || '用').trim().slice(0, 1) || '用');
    const avatarInner = avatarUrl
      ? `<img src="${String(avatarUrl).replace(/"/g, '')}" alt="" class="up-avatar-img" />`
      : `<span class="up-avatar-fallback">${initial}</span>`;
    const editing = loggedIn && identityEditing;

    const limitHtml = loggedIn
      ? `本月剩余：头像 ${avatarRemain} 次 · 昵称 ${nickRemain} 次`
      : '游客身份';
    const staff = loggedIn && cp && (cp.role === 'admin' || cp.role === 'moderator' || cp.role === 'owner');

    const titleRow = editing
      ? `<div class="up-identity-title-row is-editing">
          <input type="text" class="up-nick-input" maxlength="24" data-profile-nickname value="${esc(nickname)}" placeholder="输入昵称" />
          <div class="up-identity-edit-actions">
            <button type="button" class="up-btn up-btn-primary up-btn-sm" data-profile-save-name>保存</button>
            <button type="button" class="up-btn up-btn-ghost up-btn-sm" data-profile-cancel-edit>取消</button>
          </div>
        </div>`
      : `<div class="up-identity-title-row">
          <h2 class="up-nick">${esc(nickname)}</h2>
          ${
            loggedIn
              ? `<button type="button" class="up-btn up-btn-ghost up-btn-sm" data-profile-edit-profile>编辑资料</button>` +
                (staff
                  ? `<a class="up-btn up-btn-ghost up-btn-sm up-admin-link" href="admin.html" style="text-decoration:none">管理后台</a>`
                  : '')
              : `<button type="button" class="up-btn up-btn-ghost up-btn-sm" data-profile-login>去登录</button>`
          }
        </div>`;

    const avatarBlock = editing
      ? `<button type="button" class="up-avatar-wrap is-editing" data-profile-avatar-pick title="更换头像" aria-label="更换头像">
          <div class="up-avatar" data-profile-avatar-preview>${avatarInner}</div>
          <span class="up-avatar-mask"><span>更换头像</span></span>
        </button>`
      : loggedIn
        ? `<button type="button" class="up-avatar-wrap" data-profile-avatar-pick title="更换头像" aria-label="更换头像">
            <div class="up-avatar" data-profile-avatar-preview>${avatarInner}</div>
          </button>`
        : `<div class="up-avatar-wrap">
            <div class="up-avatar" data-profile-avatar-preview>${avatarInner}</div>
          </div>`;

    return `<section class="up2-card up2-identity${editing ? ' is-editing' : ''}" data-profile-identity>
      <div class="up2-identity-row">
        ${avatarBlock}
        <div class="up2-identity-meta">
          ${titleRow}
          <button type="button" class="up2-account-id" data-profile-copy-id title="点击复制账号 ID">账号 ID · ${esc(accountId)}</button>
          <button type="button" class="up2-account-id up2-uid" data-profile-kuro-uid title="点击绑定/查看库街区游戏UID">游戏UID · <span data-profile-kuro-uid-value>点击登录绑定游戏信息</span></button>
          <p class="up2-limit">${esc(limitHtml)}</p>
        </div>
      </div>
      <p class="up2-foot-hint">昵称与头像跟随账号；游客不可设置</p>
    </section>`;
  }

  function renderContentSection(draftCount, cloudCount, matrixCount, draftsResult) {
    const listHtml =
      activeDataTab === 'draft'
        ? renderDraftListHtml(draftsResult || { items: [], error: '' })
        : activeDataTab === 'matrix'
          ? renderMatrixDbCards()
          : renderCloudSchemeCards();
    return `<section class="up2-section" data-profile-content-section>
      <h3 class="up2-section-title">我的内容</h3>
      <div class="up2-content-grid">
        <button type="button" class="up2-stat-card${activeDataTab === 'draft' ? ' is-active' : ''}" data-profile-content-card="draft">
          <span class="up2-stat-label">草稿箱</span>
          <span class="up2-stat-num">${draftCount}</span>
        </button>
        <button type="button" class="up2-stat-card${activeDataTab === 'cloud' ? ' is-active' : ''}" data-profile-content-card="cloud">
          <span class="up2-stat-label">云端方案库</span>
          <span class="up2-stat-num">${cloudCount}</span>
        </button>
        <button type="button" class="up2-stat-card${activeDataTab === 'matrix' ? ' is-active' : ''}" data-profile-content-card="matrix">
          <span class="up2-stat-label">矩阵数据库</span>
          <span class="up2-stat-num">${matrixCount}</span>
        </button>
      </div>
      <div class="up2-tabs" role="tablist">
        <button type="button" class="up2-tab${activeDataTab === 'draft' ? ' is-active' : ''}" role="tab" aria-selected="${activeDataTab === 'draft'}" data-profile-data-tab="draft">草稿箱</button>
        <button type="button" class="up2-tab${activeDataTab === 'cloud' ? ' is-active' : ''}" role="tab" aria-selected="${activeDataTab === 'cloud'}" data-profile-data-tab="cloud">云端方案库</button>
        <button type="button" class="up2-tab${activeDataTab === 'matrix' ? ' is-active' : ''}" role="tab" aria-selected="${activeDataTab === 'matrix'}" data-profile-data-tab="matrix">矩阵数据库</button>
      </div>
      <div class="up2-panel">${listHtml}</div>
    </section>`;
  }

  function fmtAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小时前';
    const d = Math.floor(hr / 24);
    if (d < 30) return d + ' 天前';
    return fmtTime(iso);
  }

  function renderCommunitySection(loggedIn) {
    if (!loggedIn) {
      return `<section class="up2-section" data-profile-community-section>
        <h3 class="up2-section-title">社区互动</h3>
        <div class="up2-community up2-is-guest">
          <button type="button" class="up2-comm-card" disabled>
            <span class="up2-comm-title">消息通知</span>
            <span class="up2-comm-sub">登录后可用</span>
          </button>
          <button type="button" class="up2-comm-card" disabled>
            <span class="up2-comm-title">方案评价</span>
            <span class="up2-comm-sub">登录后可用</span>
          </button>
        </div>
      </section>`;
    }
    const ns = notificationsState;
    const rs = reviewsState;
    const nItems = ns.items || [];
    const rItems = rs.items || [];
    const lastN = nItems.length ? fmtAgo(nItems[0].created_at) : '';
    const lastR = rItems.length ? fmtAgo(rItems[0].created_at) : '';
    const pendingR = rItems.filter((x) => x.status === 'pending').length;
    const nHasNew = Number(ns.unread) > 0;
    const rHasNew = pendingR > 0;
    return `<section class="up2-section" data-profile-community-section>
      <h3 class="up2-section-title">社区互动</h3>
      <div class="up2-community">
        <button type="button" class="up2-comm-card${nHasNew ? ' has-new' : ''}" data-profile-comm="notify">
          ${nHasNew ? '<span class="up2-comm-dot" aria-hidden="true"></span>' : ''}
          <span class="up2-comm-title">消息通知</span>
          <span class="up2-comm-sub${nHasNew ? ' is-new' : ''}">${nHasNew ? '新消息 · ' + ns.unread : '暂无新消息'}</span>
          <span class="up2-comm-time">${lastN ? '上次: ' + esc(lastN) : ''}</span>
        </button>
        <button type="button" class="up2-comm-card${rHasNew ? ' has-new' : ''}" data-profile-comm="review">
          ${rHasNew ? '<span class="up2-comm-dot" aria-hidden="true"></span>' : ''}
          <span class="up2-comm-title">方案评价</span>
          <span class="up2-comm-sub${rHasNew ? ' is-new' : ''}">${rHasNew ? '新评价 · ' + pendingR : '暂无新评价'}</span>
          <span class="up2-comm-time">${lastR ? '上次: ' + esc(lastR) : ''}</span>
        </button>
      </div>
    </section>`;
  }

  function renderAccountSection(loggedIn, conn) {
    const connRow = `<button type="button" class="up2-set-row">
      <span class="up2-set-label">连接状态</span>
      <span class="up2-set-value"><span class="up2-dot${conn.ok ? ' is-on' : ''}" aria-hidden="true"></span>${esc(conn.ok ? '云端已连接' : conn.text || '未连接')}</span>
    </button>`;
    const loginRow = `<button type="button" class="up2-set-row">
      <span class="up2-set-label">登录状态</span>
      <span class="up2-set-value"><span class="up2-dot${loggedIn ? ' is-on' : ''}" aria-hidden="true"></span>${loggedIn ? '已登录' : '未登录'}</span>
    </button>`;
    const rows = loggedIn
      ? `<button type="button" class="up2-set-row" data-profile-changepass>
          <span class="up2-set-label">修改密码</span>
          <span class="up2-set-value is-link"><i data-lucide="chevron-right"></i></span>
        </button>
        <button type="button" class="up2-set-row is-danger" data-profile-logout>
          <span class="up2-set-label">退出登录</span>
          <span class="up2-set-value is-link"><i data-lucide="chevron-right"></i></span>
        </button>`
      : `<button type="button" class="up2-set-row" data-profile-login>
          <span class="up2-set-label">登录 / 注册</span>
          <span class="up2-set-value is-link"><i data-lucide="chevron-right"></i></span>
        </button>`;
    return `<section class="up2-section" data-profile-account-section>
      <h3 class="up2-section-title">账号设置</h3>
      <div class="up2-set-list">${connRow}${loginRow}${rows}</div>
    </section>`;
  }

  function renderQuickRow() {
    return `<div class="up2-quick">
      <button type="button" class="up2-quick-btn" data-profile-import><i data-lucide="file-up"></i>导入方案</button>
      <button type="button" class="up2-quick-btn" data-profile-public-db><i data-lucide="database"></i>公开数据库</button>
      <button type="button" class="up2-quick-btn" data-profile-feedback><i data-lucide="message-square"></i>反馈意见箱</button>
    </div>`;
  }

  function renderProfileShell(page, opts) {
    const {
      loggedIn,
      cp,
      draftsResult,
      conn,
    } = opts;
    const isFirstRender = !page.classList.contains('up-settled');
    const draftCount = (draftsResult && (draftsResult.items || []).length) || 0;
    const cloudCount = isLoggedIn() ? (cloudSchemesState.items || []).length : 0;
    const matrixCount = isLoggedIn() ? (matrixState.items || []).length : 0;

    page.innerHTML = `
      <div class="up2-shell">
        <header class="up-page-head up-enter" style="--up-delay:0s">
          <h1 class="up-page-title">个人主页</h1>
          <button type="button" class="up-back" data-profile-back>← 返回计算器</button>
        </header>

        <div class="up2-container">
          <div class="up2-grid-span">${renderIdentityCard(loggedIn, cp)}</div>
          <div class="up2-col-left">
            ${renderContentSection(draftCount, cloudCount, matrixCount, draftsResult)}
          </div>
          <div class="up2-col-right">
            ${renderCommunitySection(loggedIn)}
            ${renderEchoProfilesSection()}
          </div>
          <div class="up2-col-left">
            ${renderAccountSection(loggedIn, conn)}
          </div>
          <div class="up2-col-right">
            ${renderQuickRow()}
          </div>
        </div>

      </div>`;

    if (isFirstRender) page.classList.add('up-settled');
    void syncTopbar(loadProfile());
    refreshIcons(page);
  }

  function updateNotifyBell() {
    const badge = document.getElementById('appNotifyBadge');
    const btn = document.getElementById('appNotifyBtn');
    if (!badge) return;
    const n = isLoggedIn() ? Math.max(0, Number(notificationsState.unread) || 0) : 0;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    if (btn) btn.classList.toggle('has-unread', n > 0);
  }

  async function fetchNotifications() {
    profilePartitionsStale.notifications = false;
    if (!isLoggedIn()) {
      notificationsState = { items: [], unread: 0, loading: false, error: '' };
      updateNotifyBell();
      return;
    }
    notificationsState = { ...notificationsState, loading: true };
    try {
      const data = await Cloud.api('/notifications', { auth: true });
      notificationsState = {
        items: data.items || [],
        unread: Number(data.unread) || 0,
        loading: false,
        error: '',
      };
    } catch (e) {
      notificationsState = { items: [], unread: 0, loading: false, error: e.message };
    }
    updateNotifyBell();
  }

  async function fetchMyReviews() {
    profilePartitionsStale.reviews = false;
    if (!isLoggedIn()) {
      reviewsState = { items: [], loading: false, error: '' };
      return;
    }
    reviewsState = { ...reviewsState, loading: true };
    try {
      const data = await Cloud.api('/my/reviews', { auth: true });
      reviewsState = { items: data.items || [], loading: false, error: '' };
    } catch (e) {
      reviewsState = { items: [], loading: false, error: e.message };
    }
  }

  function countEchoSubs(echoConfig) {
    let n = 0;
    const slots = echoConfig && Array.isArray(echoConfig.slots) ? echoConfig.slots : [];
    slots.forEach((s) => {
      if (Array.isArray(s && s.subs)) n += s.subs.filter(Boolean).length;
    });
    return n || 20;
  }

  function captureWorkspaceEcho() {
    const members = (typeof state !== 'undefined' && state.members) || [];
    return members.slice(0, 3).map((m) => {
      const echoConfig = (m && m.echoConfig) || null;
      const count = echoConfig ? countEchoSubs(echoConfig) : 0;
      return {
        name: (m && m.name) || '角色',
        charId: (m && m.characterId) || '',
        echoConfig,
        count,
      };
    });
  }

  function openEchoProfileEditor(existing) {
    if (!isLoggedIn()) {
      alert('请先登录');
      return;
    }
    if (typeof window.EchoConfigModal === 'undefined') {
      alert('声骸配置模块未加载，请刷新后重试');
      return;
    }
    const isEdit = !!(existing && existing.id);
    const oldConfig = isEdit && existing.chars && existing.chars[0] ? existing.chars[0].echoConfig || {} : {};
    // 直接进入声骸录入界面，方案名称留到保存时再填
    EchoConfigModal.open({
      title: (isEdit ? '编辑 · ' + (existing.name || '未命名') : '新建声骸配置') + ' · 声骸配置',
      initial: isEdit ? oldConfig : {},
      onSave: async (cfg) => {
        const schemeName = await promptEchoProfileName(
          isEdit ? (existing.name || '未命名声骸配置') + ' · 副本' : '未命名声骸配置'
        );
        if (!schemeName) return; // 取消命名 = 不保存
        try {
          const totalCount = echoSubCountSafe(cfg);
          const charsData = [{ name: '', charId: '', echoConfig: cfg }];
          const echoCounts = {};
          if (totalCount > 0) echoCounts[''] = totalCount;
          await Cloud.api('/my/echo-profiles', {
            method: 'POST',
            auth: true,
            body: { name: schemeName, chars: charsData, echoCounts },
          });
          alert(isEdit ? '已保存为新的声骸配置方案（原方案未改动）' : '声骸配置方案已保存');
          await fetchEchoProfiles();
          renderProfilePage();
        } catch (err) {
          alert('保存失败：' + (err.message || '未知错误'));
        }
      },
    });
  }

  function promptEchoProfileName(defaultName) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'up2-picker-overlay';
      overlay.innerHTML = `
        <div class="up2-picker">
          <header class="up2-picker-head">
            <strong>保存声骸配置方案</strong>
            <button type="button" class="up2-picker-close" data-echo-name-close aria-label="关闭">✕</button>
          </header>
          <div class="up2-picker-body">
            <p class="up2-hint">为这套声骸配置起个名字，保存后可在任意角色上应用。</p>
            <label class="up2-field">
              <span class="up2-hint">方案名称</span>
              <input type="text" class="up-input" data-echo-name-input maxlength="30" value="${esc(defaultName || '')}" placeholder="例如：43311 双爆模板" />
            </label>
            <div class="up2-picker-actions">
              <button type="button" class="up-btn up-btn-ghost" data-echo-name-close>取消</button>
              <button type="button" class="up-btn up-btn-primary" data-echo-name-save>保存</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      let done = false;
      const finish = (name) => {
        if (done) return;
        done = true;
        overlay.remove();
        resolve(name);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target.closest('[data-echo-name-close]') || e.target.hasAttribute('data-echo-picker-overlay')) {
          finish(null);
          return;
        }
        if (e.target.closest('[data-echo-name-save]')) {
          const input = overlay.querySelector('[data-echo-name-input]');
          finish((input ? input.value.trim() : '') || '未命名声骸配置');
        }
      });
      const input = overlay.querySelector('[data-echo-name-input]');
      if (input) {
        input.focus();
        input.select();
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            finish(input.value.trim() || '未命名声骸配置');
          }
        });
      }
    });
  }

  function echoSubCountSafe(cfg) {
    let n = 0;
    const slots = cfg && Array.isArray(cfg.slots) ? cfg.slots : [];
    slots.forEach((s) => {
      if (Array.isArray(s && s.subs)) n += s.subs.filter(Boolean).length;
    });
    return n;
  }

  const ECHO_PROFILE_CACHE_KEY = 'wc_profile_echo_v1';
  function loadEchoProfileCache() {
    try {
      const s = JSON.parse(sessionStorage.getItem(ECHO_PROFILE_CACHE_KEY) || 'null');
      if (s && Array.isArray(s.items)) return s.items;
    } catch (e) {
      /* ignore */
    }
    return null;
  }
  function saveEchoProfileCache(items) {
    try {
      sessionStorage.setItem(
        ECHO_PROFILE_CACHE_KEY,
        JSON.stringify({ items: items || [], t: Date.now() })
      );
    } catch (e) {
      /* ignore */
    }
  }

  async function fetchEchoProfiles() {
    profilePartitionsStale.echo = false;
    if (!isLoggedIn()) {
      echoProfilesState = { items: [], loading: false, error: '' };
      return;
    }
    // 刷新后的首屏：先用会话缓存立刻出内容，再后台拉新数据
    if (!echoProfilesState.items.length) {
      const cached = loadEchoProfileCache();
      if (cached) echoProfilesState = { items: cached, loading: false, error: '' };
    }
    // 已有缓存内容时后台静默刷新，避免闪加载条
    echoProfilesState = {
      ...echoProfilesState,
      loading: echoProfilesState.items && echoProfilesState.items.length ? false : true,
    };
    try {
      const data = await Cloud.api('/my/echo-profiles', { auth: true });
      const items = data.items || [];
      echoProfilesState = { items, loading: false, error: '' };
      saveEchoProfileCache(items);
    } catch (e) {
      const cached = loadEchoProfileCache();
      echoProfilesState = cached
        ? { items: cached, loading: false, error: '' }
        : { items: [], loading: false, error: e.message };
    }
  }

  function profileMainEchoInfo(p) {
    const cfg = p && p.chars && p.chars[0] ? p.chars[0].echoConfig : null;
    if (!cfg || !Array.isArray(cfg.slots) || !cfg.slots.length) return null;
    let idx = Number.isInteger(cfg.mainSlotIndex) ? cfg.mainSlotIndex : 0;
    if (idx < 0 || idx >= cfg.slots.length) idx = 0;
    const slot = cfg.slots[idx] || null;
    if (!slot) return null;
    let echoId = slot.echoId || null;
    const name = slot.name || '';
    if (!echoId && name && typeof window.ECHO_ECHO_BY_NAME !== 'undefined') {
      try {
        const hit = window.ECHO_ECHO_BY_NAME[String(name).replace(/\s+/g, '').toLowerCase()];
        if (hit) echoId = String(hit.id);
      } catch (_e) {
        /* ignore */
      }
    }
    return { echoId, name };
  }

  function renderEchoProfilesSection() {
    const s = echoProfilesState;
    const items = s.items || [];
    const loggedIn = isLoggedIn();
    return `<section class="up2-section" data-profile-echo-section>
      <div class="up2-section-head up2-echo-head">
        <div class="up2-echo-head-left">
          <h3 class="up2-section-title">声骸配置管理</h3>
          <span class="up2-section-note">最多 12 套</span>
        </div>
        <button type="button" class="up2-primary-btn" data-echo-save>新建声骸配置方案</button>
      </div>
      <div class="up2-echo-list">
        ${
          !loggedIn
            ? `<div class="up2-empty">
                <div class="up2-empty-icon" aria-hidden="true"><i data-lucide="shield"></i></div>
                <p>登录后可用</p>
              </div>`
            : s.loading
            ? '<div class="ui-loading is-compact" aria-label="加载中"><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>'
            : s.error
              ? `<div class="up2-alert">${esc(s.error)}</div>`
              : !items.length
                ? `<div class="up2-empty">
                    <div class="up2-empty-icon" aria-hidden="true"><i data-lucide="shield"></i></div>
                  <p>暂无保存的声骸配置</p>
                  <span>新建独立的声骸配置方案（cost/套装/副词条），可在矩阵上传时应用到任意角色</span>
                  </div>`
                : items
                    .map(
                      (p) => {
                        const mainEcho = profileMainEchoInfo(p);
                        const thumb = mainEcho && mainEcho.echoId
                          ? `<img class="up2-echo-thumb-img" src="assets/echoes-thumb/${esc(mainEcho.echoId)}.png" alt="" width="66" height="58" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/echoes/${esc(mainEcho.echoId)}.png'" />`
                          : `<span class="up2-echo-thumb-fb">${esc((mainEcho && mainEcho.name ? mainEcho.name.slice(0, 1) : '声'))}</span>`;
                        return `<div class="up2-echo-item" data-echo-id="${esc(p.id)}">
                        <span class="up2-echo-thumb">${thumb}</span>
                        <div class="up2-echo-main">
                          <div class="up2-echo-name"><b>${esc(p.name)}</b><span class="up2-echo-time">${esc(fmtTime(p.updated_at))}</span></div>
                          <span class="up2-echo-sub">${esc((p.chars || []).map((c) => c.name).join(' / ') || '通用声骸配置')}</span>
                        </div>
                        <div class="up2-echo-actions">
                          <button type="button" class="up2-mini-btn" data-echo-apply="${esc(p.id)}">导入</button>
                          <button type="button" class="up2-mini-btn" data-echo-edit="${esc(p.id)}">编辑</button>
                          <button type="button" class="up2-mini-btn" data-echo-rename="${esc(p.id)}">重命名</button>
                          <button type="button" class="up2-mini-btn is-danger" data-echo-del="${esc(p.id)}">删除</button>
                        </div>
                      </div>`;
                      }
                    )
                    .join('')
        }
      </div>
    </section>`;
  }

  function renderNotificationsList() {
    const s = notificationsState;
    const items = s.items || [];
    return `<div class="up2-comm-list-head">
        <span>消息通知${s.unread ? ` · ${s.unread} 条未读` : ''}</span>
        ${items.length ? '<button type="button" class="up2-mini-btn" data-profile-notify-all-read>全部已读</button>' : ''}
      </div>
      <div class="up2-notify-list">
        ${
          s.loading
            ? '<div class="ui-loading is-compact" aria-label="加载中"><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>'
            : s.error
              ? `<div class="up2-alert">${esc(s.error)}</div>`
              : !items.length
                ? `<div class="up2-empty up2-empty-compact"><p>暂无消息</p></div>`
                : items
                    .map(
                      (n) => `<div class="up2-notify-item${n.read ? ' is-read' : ''}" data-profile-notify="${esc(n.id)}" data-profile-notify-code="${esc((n.schemes && n.schemes.share_code) || '')}">
                        <div class="up2-notify-title">${esc(n.title)}${!n.read ? '<span class="up2-dot-mini" aria-hidden="true"></span>' : ''}</div>
                        ${n.schemes && n.schemes.title ? `<div class="up2-notify-scheme">方案：${esc(n.schemes.title)}</div>` : ''}
                        <div class="up2-notify-body">${esc(n.body)}</div>
                        <div class="up2-notify-time">${esc(fmtTime(n.created_at))}</div>
                      </div>`
                    )
                    .join('')
        }
      </div>`;
  }

  function renderReviewsList() {
    const s = reviewsState;
    const items = s.items || [];
    return `<div class="up2-comm-list-head">
        <span>方案评价</span>
      </div>
      <div class="up2-review-list">
        ${
          s.loading
            ? '<div class="ui-loading is-compact" aria-label="加载中"><span class="ui-loading-bar short"></span><span class="ui-loading-bar tiny"></span></div>'
            : s.error
              ? `<div class="up2-alert">${esc(s.error)}</div>`
              : !items.length
                ? `<div class="up2-empty up2-empty-compact"><p>还没有收到评价</p></div>`
                : items
                    .map((r) => {
                      const reviewer = (r.profiles && r.profiles.display_name) || '匿名';
                      const st = r.status === 'fixed' ? '已纠正' : r.status === 'rejected' ? '已驳回' : '待处理';
                      const schemeTitle = (r.schemes && (r.schemes.title || r.schemes.share_code)) || '—';
                      const replyHtml =
                        r.status === 'fixed' && r.fix_note
                          ? `纠正说明：${esc(r.fix_note)}`
                          : r.status === 'rejected' && r.reject_reason
                            ? `驳回原因：${esc(r.reject_reason)}`
                            : r.fix_note
                              ? `作者回复：${esc(r.fix_note)}`
                              : '';
                      return `<div class="up2-review-item" data-review-id="${esc(r.id)}">
                        <div class="up2-review-head">
                          <span class="up2-review-author">${esc(reviewer)}</span>
                          <span class="up2-review-scheme">${esc(schemeTitle)}</span>
                          <span class="up2-review-status is-${esc(r.status)}">${esc(st)}</span>
                        </div>
                        <div class="up2-review-content">${esc(r.content)}</div>
                        ${replyHtml ? `<div class="up2-review-fixnote">${replyHtml}</div>` : ''}
                        <div class="up2-review-actions">
                          <button type="button" class="up-btn up-btn-ghost up-btn-sm" data-profile-review-reply="${esc(r.id)}">回复</button>
                          ${
                            r.status === 'pending'
                              ? `<button type="button" class="up-btn up-btn-primary up-btn-sm" data-profile-review-fix="${esc(r.id)}">已纠正</button>
                                 <button type="button" class="up-btn up-btn-ghost up-btn-sm is-danger" data-profile-review-reject="${esc(r.id)}">驳回</button>`
                              : ''
                          }
                        </div>
                      </div>`;
                    })
                    .join('')
        }
      </div>`;
  }

  // 用户中心分区有界超时兜底（2026-09-09 事故定位）：任一分区 fetch（草稿/资料/连接/云端/矩阵/通知/评论/声骸）
  // 最多等 PROFILE_PARTITION_TIMEOUT_MS，超时按失败态渲染，整页遮罩不再因单个挂起分区永久“检测中…”。
  const PROFILE_PARTITION_TIMEOUT_MS = 8000;
  function withPartitionTimeout(promise, fallback) {
    return Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((resolve) => setTimeout(() => resolve(fallback), PROFILE_PARTITION_TIMEOUT_MS)),
    ]);
  }

  let profileKuroUidPending = null;
  async function fillProfileKuroUid() {
    const page = document.getElementById('userProfilePage');
    if (!page || page.hidden) return;
    const el = page.querySelector('[data-profile-kuro-uid-value]');
    if (!el) return;
    if (profileKuroUidPending) return profileKuroUidPending;
    profileKuroUidPending = (async () => {
      let uid = '';
      try {
        const st = await window.Cloud.api('/kurobbs/status', { auth: true });
        const b = st && st.binding;
        uid = (b && (b.role_id || b.roleId || b.player_uid || b.uid)) || '';
      } catch (e) {}
      const nextText = uid || '点击登录绑定游戏信息';
      const currentPage = document.getElementById('userProfilePage');
      const currentEl = currentPage && !currentPage.hidden
        ? currentPage.querySelector('[data-profile-kuro-uid-value]')
        : null;
      if (currentEl && currentEl.textContent !== nextText) currentEl.textContent = nextText;
    })();
    try {
      return await profileKuroUidPending;
    } finally {
      profileKuroUidPending = null;
    }
  }

  async function renderProfilePage() {
    const page = document.getElementById('userProfilePage');
    if (!page) return;
    const loggedIn = isLoggedIn();
    // 刷新后首屏立即用水合缓存渲染，避免声骸配置区块白等
    if (loggedIn && !echoProfilesState.items.length && !echoProfilesState.loading) {
      const cached = loadEchoProfileCache();
      if (cached) echoProfilesState = { items: cached, loading: false, error: '' };
    }

    renderProfileShell(page, {
      loggedIn,
      cp: await cachedProfileAsCp(),
      draftsResult: lastDraftsResult || { items: [], error: '' },
      conn: lastConn || { ok: false, text: '检测中…', badge: '…' },
    });

    // 分区缓存复用：仅重拉被标记失效的分区（H14）
    const draftsPromise = profilePartitionsStale.drafts
      ? ((profilePartitionsStale.drafts = false), fetchDraftsResult())
      : Promise.resolve(lastDraftsResult || { items: [], error: '' });
    const cpPromise = profilePartitionsStale.profile
      ? ((profilePartitionsStale.profile = false),
        loggedIn
          ? Cloud.api('/me/profile', { auth: true })
              .then((d) => d.profile || null)
              .catch(() => null)
          : Promise.resolve(null))
      : Promise.resolve(null);
    const connPromise = profilePartitionsStale.conn
      ? ((profilePartitionsStale.conn = false), checkConnection())
      : Promise.resolve(lastConn || { ok: false, text: '检测中…', badge: '…' });

    const sideFetches = [];
    if (profilePartitionsStale.cloud) sideFetches.push(fetchCloudSchemes());
    if (profilePartitionsStale.matrix) sideFetches.push(fetchMyMatrix());
    if (profilePartitionsStale.notifications) sideFetches.push(fetchNotifications());
    if (profilePartitionsStale.reviews) sideFetches.push(fetchMyReviews());
    if (profilePartitionsStale.echo) sideFetches.push(fetchEchoProfiles());

    const [draftsResult, cp, conn] = [
      await withPartitionTimeout(draftsPromise, { items: [], error: '加载超时' }),
      await withPartitionTimeout(cpPromise, null),
      await withPartitionTimeout(connPromise, { ok: false, text: '连接超时，请检查网络后重试', badge: '…' }),
    ];
    if (sideFetches.length) await Promise.all(sideFetches.map((p) => withPartitionTimeout(p, null)));

    if (cp) {
      lastCloudProfile = cp;
      cacheCloudProfile(cp);
    }
    lastDraftsResult = draftsResult;
    lastConn = conn;
    if (!page.hidden) {
      patchProfileShell(page, {
        loggedIn,
        cp: cp || (await cachedProfileAsCp()),
        draftsResult,
        conn,
      });
    }
    void syncTopbar(loadProfile());
  }

  // 数据到位后就地更新各分区，避免整页重建导致的计数闪烁与按钮闪没
  function patchProfileShell(page, opts) {
    const { loggedIn, cp, draftsResult, conn } = opts;
    const draftCount = (draftsResult && (draftsResult.items || []).length) || 0;
    const cloudCount = isLoggedIn() ? (cloudSchemesState.items || []).length : 0;
    const matrixCount = isLoggedIn() ? (matrixState.items || []).length : 0;
    const sections = [
      ['[data-profile-content-section]', renderContentSection(draftCount, cloudCount, matrixCount, draftsResult)],
      ['[data-profile-community-section]', renderCommunitySection(loggedIn)],
      ['[data-profile-echo-section]', renderEchoProfilesSection()],
      ['[data-profile-account-section]', renderAccountSection(loggedIn, conn)],
    ];
    for (const [sel, html] of sections) {
      const host = page.querySelector(sel);
      if (host) host.outerHTML = html;
    }
    if (typeof fillProfileKuroUid === 'function') {
      void fillProfileKuroUid();
    }
    // 身份卡：云端资料带角色或资料变化时才替换，避免编辑态与按钮闪烁
    const identityHost = page.querySelector('[data-profile-identity]');
    if (identityHost && cp) {
      const prev = renderedCloudProfile;
      const changed =
        !prev ||
        String(cp.display_name || '') !== String(prev.display_name || '') ||
        String(cp.avatar_data_url || '') !== String(prev.avatar_data_url || '') ||
        Boolean(cp.role) !== Boolean(prev.role);
      if (changed) {
        identityHost.outerHTML = renderIdentityCard(loggedIn, cp);
        renderedCloudProfile = cp;
      }
    }
    refreshIcons(page);
  }

  // 我的内容分区切换：仅就地更新该分区，不重建整页
  function renderContentSectionOnly() {
    const page = document.getElementById('userProfilePage');
    if (!page || page.hidden) return;
    const host = page.querySelector('[data-profile-content-section]');
    if (!host) return;
    const draftsResult = lastDraftsResult || { items: [], error: '' };
    const draftCount = (draftsResult.items || []).length || 0;
    const cloudCount = isLoggedIn() ? (cloudSchemesState.items || []).length : 0;
    const matrixCount = isLoggedIn() ? (matrixState.items || []).length : 0;
    host.outerHTML = renderContentSection(draftCount, cloudCount, matrixCount, draftsResult);
    refreshIcons(page);
  }

  function setProfileOpen(open) {
    document.body.classList.toggle('user-profile-open', !!open);
    const page = document.getElementById('userProfilePage');
    if (page) page.hidden = !open;
    if (!open) {
      identityEditing = false;
      closeProfileModals();
    }
    if (open) {
      if (window.PublicDb && typeof PublicDb.close === 'function') PublicDb.close();
      if (window.Matrix && typeof Matrix.close === 'function') Matrix.close();
      renderProfilePage();
      // 打开即填充游戏 UID；并发请求由 fillProfileKuroUid 合并。
      if (typeof fillProfileKuroUid === 'function') {
        void fillProfileKuroUid();
      }
    }
  }

  function isOpen() {
    return document.body.classList.contains('user-profile-open');
  }

  function gotoExport() {
    setProfileOpen(false);
    if (typeof window.setWorkspacePhase === 'function') setWorkspacePhase('export');
  }

  async function onAvatarFile(file) {
    try {
      const dataUrl = await compressAvatar(file);
      if (!isLoggedIn()) {
        alert('请先登录后上传头像');
        return;
      }
      const data = await Cloud.api('/me/profile', {
        method: 'PUT',
        auth: true,
        body: { avatar_data_url: dataUrl },
      });
      const p = data.profile || {};
      lastCloudProfile = p;
      cacheCloudProfile(p);
      void syncTopbar(loadProfile());
      // 上传头像后保持编辑态
      identityEditing = true;
      renderProfilePage();
    } catch (err) {
      alert(err?.message || '头像上传失败');
      renderProfilePage();
    }
  }

  function bind() {
    const userBtn = document.getElementById('appUserBtn');
    const fileInput = document.getElementById('userAvatarFileInput');
    if (userBtn && !userBtn.dataset.profileBound) {
      userBtn.dataset.profileBound = '1';
      userBtn.addEventListener('click', () => setProfileOpen(true));
    }
    const notifyBtn = document.getElementById('appNotifyBtn');
    if (notifyBtn && !notifyBtn.dataset.notifyBound) {
      notifyBtn.dataset.notifyBound = '1';
      notifyBtn.addEventListener('click', () => {
        void (async () => {
          if (isLoggedIn()) await fetchNotifications();
          openCommunityModal('notify');
        })();
      });
    }
    window.__notifyRefresh = () => {
      if (isLoggedIn()) void fetchNotifications();
    };
    if (isLoggedIn()) void fetchNotifications();
    // 轮询未读消息，保持顶栏角标最新（M17：页面隐藏时暂停，恢复时立即刷新）
    let notifyPollTimer = setInterval(() => {
      if (isLoggedIn()) void fetchNotifications();
    }, 45000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (notifyPollTimer) {
          clearInterval(notifyPollTimer);
          notifyPollTimer = null;
        }
      } else if (document.visibilityState === 'visible') {
        if (!notifyPollTimer) {
          notifyPollTimer = setInterval(() => {
            if (isLoggedIn()) void fetchNotifications();
          }, 45000);
        }
        if (isLoggedIn()) void fetchNotifications();
      }
    });

  document.body.addEventListener('click', async (e) => {
      if (e.target.closest('[data-profile-back]')) {
        setProfileOpen(false);
        return;
      }
      if (e.target.closest('[data-profile-content-card]')) {
        const tab = e.target.closest('[data-profile-content-card]').dataset.profileContentCard;
        if (tab === 'draft' || tab === 'cloud' || tab === 'matrix') {
          activeDataTab = tab;
          activeCommunity = '';
          renderContentSectionOnly();
        }
        return;
      }
      if (e.target.closest('[data-profile-copy-id]')) {
        const user = getCloudUser();
        const id = accountIdText(user);
        if (id && navigator.clipboard) {
          navigator.clipboard.writeText(id).then(
            () => alert('已复制账号 ID：' + id),
            () => alert(id)
          );
        } else if (id) {
          alert(id);
        }
        return;
      }
      if (e.target.closest('[data-profile-kuro-uid]')) {
        const val = document.querySelector('[data-profile-kuro-uid-value]');
        const raw = val ? val.textContent.trim() : '';
        if (!raw || raw === '…' || raw === '点击绑定游戏信息') {
          // 未绑定 → 直接打开库街区登录界面绑定（EchoImport.open）
          if (window.EchoImport && typeof window.EchoImport.open === 'function') {
            window.EchoImport.open();
          } else {
            alert('请到「声骸导入 · 库街区」登录并绑定游戏UID');
          }
        } else {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(raw).then(() => alert('已复制游戏UID：' + raw), () => alert(raw));
          } else {
            alert(raw);
          }
        }
        return;
      }
      if (e.target.closest('[data-profile-comm]')) {
        const which = e.target.closest('[data-profile-comm]').dataset.profileComm;
        openCommunityModal(which);
        return;
      }
      if (e.target.closest('[data-profile-feedback]')) {
        openFeedbackModal();
        return;
      }
      if (e.target.closest('[data-profile-data-tab]')) {
        const tab = e.target.closest('[data-profile-data-tab]').dataset.profileDataTab;
        if (tab === 'draft' || tab === 'cloud' || tab === 'matrix') {
          activeDataTab = tab;
          activeCommunity = '';
          if (tab === 'matrix') {
            void (async () => {
              await fetchMyMatrix();
              renderContentSectionOnly();
            })();
          } else {
            renderContentSectionOnly();
          }
        }
        return;
      }
      if (e.target.closest('[data-profile-open-matrix]')) {
        setProfileOpen(false);
        if (window.Matrix && typeof Matrix.open === 'function') Matrix.open();
        return;
      }
      if (e.target.closest('[data-profile-goto-export]')) {
        gotoExport();
        return;
      }
      if (e.target.closest('[data-profile-import]')) {
        setProfileOpen(false);
        document.getElementById('schemeFileInput')?.click();
        return;
      }
      if (e.target.closest('[data-profile-public-db]')) {
        setProfileOpen(false);
        if (window.PublicDb && typeof PublicDb.open === 'function') PublicDb.open();
        return;
      }
      if (e.target.closest('[data-profile-copy-code]')) {
        const code = e.target.closest('[data-profile-copy-code]').dataset.profileCopyCode;
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code).then(
            () => alert('已复制分享码：' + code),
            () => alert(code)
          );
        } else if (code) {
          alert(code);
        }
        return;
      }
      if (e.target.closest('[data-profile-load-cloud]')) {
        const code = e.target.closest('[data-profile-load-cloud]').dataset.profileLoadCloud;
        if (code) void importCloudScheme(code);
        return;
      }
      if (e.target.closest('[data-profile-notify-all-read]')) {
        void (async () => {
          try {
            await Cloud.api('/notifications/read', { method: 'POST', auth: true, body: {} });
            await fetchNotifications();
            refreshCommunityModal('notify');
            renderProfilePage();
          } catch (err) {
            alert('操作失败：' + err.message);
          }
        })();
        return;
      }
      const notifyItem = e.target.closest('[data-profile-notify]');
      if (notifyItem) {
        const id = notifyItem.dataset.profileNotify;
        const shareCode = notifyItem.dataset.profileNotifyCode || '';
        void (async () => {
          try {
            if (!notifyItem.classList.contains('is-read')) {
              await Cloud.api('/notifications/read', {
                method: 'POST',
                auth: true,
                body: { ids: [id] },
              });
              await fetchNotifications();
              refreshCommunityModal('notify');
              renderProfilePage();
            }
            if (shareCode && window.PublicDb && typeof PublicDb.openDetail === 'function') {
              setProfileOpen(false);
              PublicDb.openDetail(shareCode);
            }
          } catch (err) {
            /* ignore */
          }
        })();
        return;
      }
  function openTextComposer(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'up-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:320100;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML =
        '<div style="background:#1d2430;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:18px;width:520px;max-width:92vw;color:#e8e8e8;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,.4);">' +
        '<h3 style="margin:0 0 10px;font-size:15px;color:#fff;">' + esc(opts.title || '输入内容') + '</h3>' +
        '<textarea data-utc-input style="width:100%;min-height:130px;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:#141a24;color:#fff;font-size:14px;line-height:1.6;font-family:inherit;resize:vertical;white-space:pre-wrap;word-break:break-word;" placeholder="' + esc(opts.placeholder || '') + '"' + (opts.max ? ' maxlength="' + Number(opts.max) + '"' : '') + '></textarea>' +
        '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:12px;">' +
        '<span data-utc-count style="margin-right:auto;color:#8b94a8;font-size:12px;">0' + (opts.max ? '/' + Number(opts.max) : '') + '</span>' +
        '<button type="button" data-utc-cancel style="padding:7px 16px;border-radius:7px;background:transparent;border:1px solid rgba(255,255,255,.22);color:#ccc;cursor:pointer;font-size:13px;">取消</button>' +
        '<button type="button" data-utc-ok style="padding:7px 16px;border-radius:7px;background:#3b6ea8;border:none;color:#fff;cursor:pointer;font-size:13px;">确定</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      var input = overlay.querySelector('[data-utc-input]');
      var countEl = overlay.querySelector('[data-utc-count]');
      input.focus();
      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        overlay.remove();
        resolve(val);
      }
      input.addEventListener('input', function () {
        if (countEl) countEl.textContent = input.value.length + (opts.max ? '/' + Number(opts.max) : '');
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      });
      overlay.addEventListener('click', function (e) {
        if (e.target.closest('[data-utc-ok]')) finish(input.value);
        else if (e.target.closest('[data-utc-cancel]') || e.target === overlay) finish(null);
      });
    });
  }

      const reviewFix = e.target.closest('[data-profile-review-fix]');
      if (reviewFix) {
        void (async () => {
          const note = await openTextComposer({
            title: '标记为已纠正',
            placeholder: '纠正说明（改了什么，将展示给评价人）',
            max: 300,
          });
          if (note === null) return;
          try {
            await Cloud.api(
              '/reviews/' + encodeURIComponent(reviewFix.dataset.profileReviewFix) + '/fix',
              { method: 'POST', auth: true, body: { note: note.trim() } }
            );
            alert('已标记为已纠正，评价人将收到通知');
            await Promise.all([fetchMyReviews(), fetchNotifications()]);
            refreshCommunityModal('review');
            renderProfilePage();
          } catch (err) {
            alert('操作失败：' + err.message);
          }
        })();
        return;
      }
      const reviewReject = e.target.closest('[data-profile-review-reject]');
      if (reviewReject) {
        void (async () => {
          const reason = await openTextComposer({
            title: '驳回评价',
            placeholder: '请输入驳回原因（将通知评价人）',
            max: 500,
          });
          if (reason === null) return;
          if (!reason.trim()) {
            alert('请填写驳回原因');
            return;
          }
          try {
            await Cloud.api(
              '/reviews/' + encodeURIComponent(reviewReject.dataset.profileReviewReject) + '/reject',
              { method: 'POST', auth: true, body: { reason: reason.trim() } }
            );
            alert('已驳回该评价，评价人将收到通知');
            await Promise.all([fetchMyReviews(), fetchNotifications()]);
            refreshCommunityModal('review');
            renderProfilePage();
          } catch (err) {
            alert('操作失败：' + err.message);
          }
        })();
        return;
      }
      const reviewReply = e.target.closest('[data-profile-review-reply]');
      if (reviewReply) {
        void (async () => {
          const content = await openTextComposer({
            title: '回复评价',
            placeholder: '回复内容（将展示在该评论下方并通知评价人）',
            max: 500,
          });
          if (content === null) return;
          if (!content.trim()) {
            alert('请填写回复内容');
            return;
          }
          try {
            await Cloud.api(
              '/reviews/' + encodeURIComponent(reviewReply.dataset.profileReviewReply) + '/reply',
              { method: 'POST', auth: true, body: { content: content.trim() } }
            );
            alert('已回复，评价人将收到通知');
            await Promise.all([fetchMyReviews(), fetchNotifications()]);
            refreshCommunityModal('review');
            renderProfilePage();
          } catch (err) {
            alert('操作失败：' + err.message);
          }
        })();
        return;
      }
      const echoApply = e.target.closest('[data-echo-apply]');
      if (echoApply) {
        const id = echoApply.dataset.echoApply;
        const p = (echoProfilesState.items || []).find((x) => x.id === id);
        if (!p) return;
        const members = (typeof state !== 'undefined' && state.members) || [];
        const chars = Array.isArray(p.chars) ? p.chars : [];
        let applied = 0;
        const first = chars[0];
        const hasChar = !!(first && (first.name || first.charId));
        if (!hasChar) {
          // 无主方案：应用到工作区第一个角色
          const target = members.find((m) => m && m.characterId && m.name);
          if (target && first && first.echoConfig) {
            target.echoConfig = first.echoConfig;
            applied = 1;
          }
        } else {
          members.forEach((m) => {
            const c = chars.find(
              (x) =>
                (x.charId && m.characterId && String(x.charId) === String(m.characterId)) ||
                (!x.charId && x.name && m.name === x.name)
            );
            if (c && c.echoConfig) {
              m.echoConfig = c.echoConfig;
              applied++;
            }
          });
        }
        if (applied > 0) {
          alert('已将「' + p.name + '」应用到工作区 ' + applied + ' 名角色，可重新计算查看效果');
          setProfileOpen(false);
        } else {
          alert('工作区还没有可应用的角色，请先配置角色');
        }
        return;
      }
      const echoSave = e.target.closest('[data-echo-save]');
      if (echoSave) {
        openEchoProfileEditor();
        return;
      }
      const echoRename = e.target.closest('[data-echo-rename]');
      if (echoRename) {
        const id = echoRename.dataset.echoRename;
        const cur = (echoProfilesState.items || []).find((p) => p.id === id);
        const name = await DialogKit.prompt({ title: '重命名配置', placeholder: '新的配置名称', max: 30, initial: (cur && cur.name) || '' });
        if (name === null) return;
        if (!name.trim()) {
          alert('配置名称不能为空');
          return;
        }
        void (async () => {
          try {
            await Cloud.api('/my/echo-profiles/' + encodeURIComponent(id), {
              method: 'PUT',
              auth: true,
              body: { name: name.trim() },
            });
            await fetchEchoProfiles();
            renderProfilePage();
          } catch (err) {
            alert('重命名失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      const echoEdit = e.target.closest('[data-echo-edit]');
      if (echoEdit) {
        const id = echoEdit.dataset.echoEdit;
        const p = (echoProfilesState.items || []).find((x) => x.id === id);
        if (p) openEchoProfileEditor(p);
        else alert('未找到该方案');
        return;
      }
      const echoDel = e.target.closest('[data-echo-del]');
      if (echoDel) {
        if (!(await DialogKit.confirm({ message: '删除这套声骸配置？', okText: '删除', danger: true }))) return;
        void (async () => {
          try {
            await Cloud.api('/my/echo-profiles/' + encodeURIComponent(echoDel.dataset.echoDel), {
              method: 'DELETE',
              auth: true,
            });
            await fetchEchoProfiles();
            renderProfilePage();
          } catch (err) {
            alert('删除失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-avatar-pick]')) {
        fileInput?.click();
        return;
      }
      if (e.target.closest('[data-profile-avatar-clear]')) {
        (async () => {
          try {
            if (!isLoggedIn()) {
              alert('请先登录');
              return;
            }
            await Cloud.api('/me/profile', {
              method: 'PUT',
              auth: true,
              body: { avatar_data_url: '' },
            });
            cacheProfile({ nickname: loadProfile().nickname, avatarDataUrl: '' });
            void syncTopbar(loadProfile());
            invalidateProfilePartition('profile');
            renderProfilePage();
          } catch (err) {
            alert(err?.message || '清除头像失败');
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-edit-profile]')) {
        if (!isLoggedIn()) {
          if (window.Cloud && typeof Cloud.open === 'function') {
            Cloud.open('auth', { origin: 'profile' });
          }
          return;
        }
        setIdentityEditing(true);
        const input = document.querySelector('[data-profile-nickname]');
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }
      if (e.target.closest('[data-profile-cancel-edit]')) {
        setIdentityEditing(false);
        return;
      }
      if (e.target.closest('[data-profile-pass-cancel]')) {
        closePasswordModal();
        return;
      }
      if (
        e.target.closest('[data-feedback-close]') ||
        e.target.closest('[data-feedback-cancel]') ||
        (e.target.closest('[data-profile-feedback-modal]') && e.target.hasAttribute('data-profile-feedback-modal'))
      ) {
        closeFeedbackModal();
        return;
      }
      if (e.target.closest('[data-feedback-cat]')) {
        const chip = e.target.closest('[data-feedback-cat]');
        document.querySelectorAll('[data-feedback-cat]').forEach((b) => {
          b.classList.toggle('is-on', b === chip);
        });
        return;
      }
      if (e.target.closest('[data-feedback-submit]')) {
        void submitFeedback();
        return;
      }
      if (e.target.closest('[data-profile-comm-close]') || (e.target.closest('[data-profile-comm-modal]') && e.target.hasAttribute('data-profile-comm-modal'))) {
        closeCommunityModal();
        return;
      }
      if (e.target.closest('[data-profile-pass-modal]') && e.target.hasAttribute('data-profile-pass-modal')) {
        closePasswordModal();
        return;
      }
      if (e.target.closest('[data-profile-pass-save]')) {
        const modal = document.querySelector('[data-profile-pass-modal]');
        const p1 = ((modal && modal.querySelector('[data-profile-newpass]')) || {}).value || '';
        const p2 = ((modal && modal.querySelector('[data-profile-newpass2]')) || {}).value || '';
        const statusEl = modal && modal.querySelector('[data-profile-pass-status]');
        const saveBtn = e.target.closest('[data-profile-pass-save]');
        const setPassStatus = (msg, isError) => {
          if (!statusEl) return;
          statusEl.textContent = msg || '';
          statusEl.classList.toggle('is-error', !!isError);
        };
        if (String(p1).length < 6) {
          setPassStatus('新密码至少 6 位', true);
          return;
        }
        if (p1 !== p2) {
          setPassStatus('两次输入的密码不一致', true);
          return;
        }
        (async () => {
          try {
            if (saveBtn) saveBtn.disabled = true;
            setPassStatus('修改中…', false);
            await Cloud.changePassword(p1);
            closePasswordModal();
            if (typeof Cloud.logout === 'function') {
              await Cloud.logout();
            }
            setProfileOpen(false);
            alert('密码修改成功，请用新密码重新登录');
            if (window.Cloud && typeof Cloud.open === 'function') {
              Cloud.open('auth', { origin: 'profile' });
            }
          } catch (err) {
            setPassStatus(err?.message || '修改失败', true);
            if (saveBtn) saveBtn.disabled = false;
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-save-name]')) {
        const input = document.querySelector('[data-profile-nickname]');
        const name = ((input && input.value) || '').trim();
        if (!name) {
          alert('昵称不能为空');
          return;
        }
        const saveBtn = e.target.closest('[data-profile-save-name]');
        (async () => {
          try {
            if (!isLoggedIn()) {
              alert('请先登录');
              return;
            }
            if (saveBtn) saveBtn.disabled = true;
            const data = await Cloud.api('/me/profile', {
              method: 'PUT',
              auth: true,
              body: { display_name: name },
            });
            if (data.profile) lastCloudProfile = data.profile;
            cacheProfile({
              nickname: name,
              role: (lastCloudProfile && lastCloudProfile.role) || loadProfile().role,
            });
            void syncTopbar(loadProfile());
            identityEditing = false;
            renderProfilePage();
          } catch (err) {
            alert(err?.message || '保存昵称失败');
            if (saveBtn) saveBtn.disabled = false;
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-login]')) {
        if (window.Cloud && typeof Cloud.open === 'function') {
          Cloud.open('auth', { origin: 'profile' });
        }
        return;
      }
      if (e.target.closest('[data-profile-changepass]')) {
        openPasswordModal();
        return;
      }
      if (e.target.closest('[data-draft-open]')) {
        const id = e.target.closest('[data-draft-open]').dataset.draftOpen;
        (async () => {
          try {
            if (!isLoggedIn()) {
              alert('请先登录');
              return;
            }
            const d = await Cloud.api('/drafts/' + encodeURIComponent(id), { auth: true });
            if (typeof window.importWorkspaceFromData === 'function' && d.payload) {
      await importWorkspaceFromData(d.payload, d.meta || { name: d.name });
              if (typeof state !== 'undefined' && state.schemeDraft) {
                state.schemeDraft.draftId = id;
              }
              setProfileOpen(false);
            } else {
              alert('草稿数据不完整');
            }
          } catch (err) {
            alert('打开失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-del-scheme]')) {
        const code = e.target.closest('[data-profile-del-scheme]').dataset.profileDelScheme;
        (async () => {
          const ok = await (typeof window.showConfirmModal === 'function'
            ? showConfirmModal({
                title: '删除这份云端方案？',
                description: '删除后该方案将从公开数据库移除，且无法恢复。',
                confirmText: '删除',
                cancelText: '取消',
                danger: true,
              })
            : DialogKit.confirm({ message: '删除这份云端方案？删除后无法恢复。', okText: '删除', danger: true }));
          if (!ok) return;
          try {
            await Cloud.api('/my/schemes/' + encodeURIComponent(code), {
              method: 'DELETE',
              auth: true,
            });
            invalidateProfilePartition('cloud');
            renderProfilePage();
          } catch (err) {
            alert('删除失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-del-matrix]')) {
        const id = e.target.closest('[data-profile-del-matrix]').dataset.profileDelMatrix;
        (async () => {
          const ok = await (typeof window.showConfirmModal === 'function'
            ? showConfirmModal({
                title: '删除这份矩阵数据？',
                description: '删除后该矩阵数据将从矩阵数据库移除，且无法恢复。',
                confirmText: '删除',
                cancelText: '取消',
                danger: true,
              })
            : DialogKit.confirm({ message: '删除这份矩阵数据？删除后无法恢复。', okText: '删除', danger: true }));
          if (!ok) return;
          try {
            await Cloud.api('/my/matrix-scores/' + encodeURIComponent(id), {
              method: 'DELETE',
              auth: true,
            });
            invalidateProfilePartition('matrix');
            renderProfilePage();
          } catch (err) {
            alert('删除失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-resubmit-matrix]')) {
        const id = e.target.closest('[data-profile-resubmit-matrix]').dataset.profileResubmitMatrix;
        (async () => {
          const ok = await (typeof window.showConfirmModal === 'function'
            ? showConfirmModal({
                title: '重新上架这份矩阵数据？',
                description: '重新上架后将进入审核队列，审核通过后重新展示在矩阵数据库。',
                confirmText: '重新上架',
                cancelText: '取消',
              })
            : DialogKit.confirm({ message: '重新上架这份矩阵数据？将重新进入审核。', okText: '重新上架' }));
          if (!ok) return;
          try {
            const res = await Cloud.api('/my/matrix-scores/' + encodeURIComponent(id) + '/resubmit', {
              method: 'POST',
              auth: true,
            });
            alert(res && res.auto_approved ? '已重新上架并通过自动审核' : '已提交重新上架，等待审核');
            invalidateProfilePartition('matrix');
            renderProfilePage();
          } catch (err) {
            alert('重新上架失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-draft-del]')) {
        const id = e.target.closest('[data-draft-del]').dataset.draftDel;
        (async () => {
          const ok = await (typeof window.showConfirmModal === 'function'
            ? showConfirmModal({
                title: '删除这份草稿？',
                description: '删除后无法恢复。',
                confirmText: '删除',
                cancelText: '取消',
                danger: true,
              })
            : DialogKit.confirm({ message: '删除这份草稿？', okText: '删除', danger: true }));
          if (!ok) return;
          try {
            await Cloud.api('/drafts/' + encodeURIComponent(id), {
              method: 'DELETE',
              auth: true,
            });
            invalidateProfilePartition('drafts');
            renderProfilePage();
          } catch (err) {
            alert('删除失败：' + (err.message || '未知错误'));
          }
        })();
        return;
      }
      if (e.target.closest('[data-profile-logout]')) {
        if (window.Cloud && typeof Cloud.logout === 'function') {
          Cloud.logout().then(() => {
            setProfileOpen(false);
          });
        }
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[data-profile-comm-modal]')) closeCommunityModal();
        else if (document.querySelector('[data-profile-feedback-modal]')) closeFeedbackModal();
      }
    });

    if (fileInput && !fileInput.dataset.profileBound) {
      fileInput.dataset.profileBound = '1';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) void onAvatarFile(file);
      });
    }
  }

  async function boot() {
    await migrateLegacyProfile();
    await syncTopbar(loadProfile());
    bind();
    if (isLoggedIn()) void hydrateCloudProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void boot(); });
  } else {
    void boot();
  }

  var profileApi = window.WaveCalcProfile = {
    open: () => setProfileOpen(true),
    close: () => setProfileOpen(false),
    refresh: () => {
      invalidateAllProfilePartitions();
      if (isLoggedIn()) {
        void hydrateCloudProfile().then(() => {
          if (isOpen()) renderProfilePage();
        });
      } else {
        void syncTopbar(defaultProfile());
        if (isOpen()) renderProfilePage();
      }
    },
    refreshMatrix: () => {
      void (async () => {
        await fetchMyMatrix();
        if (isOpen()) renderContentSectionOnly();
      })();
    },
    getProfile: loadProfile,
  };
  window.addEventListener('wavecalc-auth-changed', function () { profileApi.refresh(); });
})();
