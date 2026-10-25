/* Independent naming-template sharing. Existing calculator naming functions remain canonical. */
(function () {
  'use strict';
  const wc = window.__WC || (window.__WC = {});
  const enabled = document.currentScript && document.currentScript.dataset.enabled === '1';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labels = { pending: '待审核', published: '已公开', rejected: '已驳回', withdrawn: '已撤回' };
  let active = null;
  async function api(path, options = {}) {
    if (!wc.Cloud || typeof wc.Cloud.api !== 'function') throw new Error('账号接口尚未就绪，请稍后重试');
    let timer;
    try {
      return await Promise.race([
        wc.Cloud.api(path, { timeoutMs: 15000, ...options }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('请求超时，上传内容已保留，可用原提交安全重试')), 25000); })
      ]);
    } finally { clearTimeout(timer); }
  }
  function modal(title, body) {
    if (active) active.close();
    const previous = document.activeElement;
    const root = document.createElement('div');
    root.className = 'nt-share-overlay';
    root.innerHTML = '<section class="nt-share-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) +
      '"><header><h2>' + esc(title) + '</h2><button type="button" class="btn sm" data-ns-close>关闭</button></header>' +
      '<div class="nt-share-body">' + body + '</div><p class="nt-share-status" role="status" aria-live="polite"></p></section>';
    document.body.appendChild(root);
    const view = {
      root, busy: false, alive: true,
      status(message, error = false) {
        if (!view.alive) return;
        const el = root.querySelector('[role="status"]');
        el.textContent = message;
        el.classList.toggle('is-error', error);
      },
      close() {
        view.alive = false;
        root.remove();
        if (active === view) active = null;
        if (previous && previous.isConnected) previous.focus();
      }
    };
    active = view;
    root.querySelector('[data-ns-close]').addEventListener('click', view.close);
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); view.close(); }
      if (e.key === 'Tab') {
        const nodes = [...root.querySelectorAll('button:not(:disabled),input,textarea,select,a[href]')].filter(el => !el.hidden);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    root.querySelector('[data-ns-close]').focus();
    return view;
  }
  function mappingHtml(template) {
    return '<div class="nt-share-mapping-heading"><span>原技能名称</span><span>自定义名称</span></div><div class="nt-share-mappings">' + template.overrides.map(e =>
      '<div><span>' + esc(e.skillName) + '</span><b>→</b><span>' + esc(e.displayName) + '</span></div>').join('') + '</div>';
  }
  function capture(memberIndex) {
    const member = wc.state && wc.state.members[memberIndex];
    if (!member || !member.characterId) throw new Error('请先选择角色');
    const selected = wc.getMemberNamingTemplate(memberIndex);
    if (!selected || String(selected.characterId) !== String(member.characterId)) throw new Error('请先选择该角色的命名模板');
    const overrides = Object.entries(selected.overrides || {}).map(([skillName, displayName]) => ({ skillName, displayName: String(displayName).trim() }));
    if (!overrides.length) throw new Error('当前模板还没有自定义名称');
    return { title: selected.name || '命名模板', characterName: member.name,
      template: { kind: 'character-naming-template', version: 1, characterId: String(member.characterId), overrides } };
  }
  function openUpload(memberIndex) {
    if (!enabled) return;
    if (!wc.Cloud || !wc.Cloud.getUser || !wc.Cloud.getUser()) {
      if (wc.Cloud && typeof wc.Cloud.open === 'function') wc.Cloud.open('auth');
      return;
    }
    let snapshot;
    try { snapshot = capture(memberIndex); }
    catch (e) { const view = modal('上传命名模板', ''); view.status(e.message, true); return; }
    // Capture once; subsequent editing does not change this upload.
    const view = modal('上传命名模板 · ' + snapshot.characterName,
      '<form data-ns-form><p class="nt-share-intro">分享你的角色命名习惯，让其他人也能直接使用。提交后经审核公开。</p>' +
      '<label>模板标题<input name="title" maxlength="30" required value="' + esc(snapshot.title) + '"></label>' +
      '<label>说明 <span class="nt-share-muted">选填 · 最多 300 字</span><textarea name="description" maxlength="300" rows="3" placeholder="例如：用 A1 / A2 标记普攻段数，方便阅读排轴。"></textarea></label>' +
      mappingHtml(snapshot.template) + '<button type="submit" class="btn nt-share-primary" data-ns-submit>提交审核</button></form>');
    let submission = null;
    const form = view.root.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (view.busy) return;
      const title = form.elements.title.value.trim(), description = form.elements.description.value.trim();
      if (!title) { view.status('请填写模板标题', true); return; }
      if (!submission || submission.title !== title || submission.description !== description) {
        submission = { request_id: crypto.randomUUID(), title, description, template: snapshot.template };
      }
      view.busy = true;
      form.querySelectorAll('input,textarea,button').forEach(el => { el.disabled = true; });
      view.status('正在提交…');
      try {
        const result = await api('/naming-templates', { method: 'POST', auth: true, body: submission });
        if (!view.alive) return;
        form.hidden = true;
        view.status('提交成功 · ' + (labels[result.template.status] || result.template.status));
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn'; btn.textContent = '查看我的上传';
        btn.addEventListener('click', () => openLibrary('mine'));
        view.root.querySelector('.nt-share-body').appendChild(btn);
      } catch (error) {
        view.status(error.message, true);
        form.querySelectorAll('input,textarea,button').forEach(el => { el.disabled = false; });
      } finally { view.busy = false; }
    });
  }
  function openLibrary(mode = 'public') {
    if (!enabled) return;
    const admin = mode === 'admin';
    const view = modal(admin ? '命名模板审核' : '命名模板专区',
      '<div class="nt-share-intro"><span class="nt-share-eyebrow">角色命名 · 社区模板</span><p>' +
      (admin ? '查看名称对应关系，审核后即可在公开专区使用。' : '找到顺手的技能名称，让每一段排轴更好读。') + '</p></div>' +
      '<div class="nt-share-discovery">' + (admin ? '' :
        '<nav class="nt-share-tabs" aria-label="模板范围"><button type="button" data-ns-public aria-pressed="false">公开模板</button><button type="button" data-ns-mine aria-pressed="false">我的上传</button></nav>') +
      '<form class="nt-share-search" data-ns-search-form><label><span class="nt-share-sr-only">搜索模板</span><input data-ns-search maxlength="60" placeholder="搜索模板标题或角色名"></label>' +
      '<button type="submit" class="btn" data-ns-search-button>搜索</button></form></div>' +
      '<p class="nt-share-context" data-ns-context></p><div class="nt-share-grid" data-ns-list></div>' +
      '<footer class="nt-share-pagination"><span data-ns-page></span><div><button type="button" class="btn" data-ns-prev>上一页</button>' +
      '<button type="button" class="btn" data-ns-next>下一页</button></div></footer>');
    view.root.querySelector('.nt-share-modal').classList.add('nt-share-library');
    let offset = 0, query = '', generation = 0;
    const list = view.root.querySelector('[data-ns-list]');
    async function load() {
      const token = ++generation;
      view.status('加载中…');
      list.setAttribute('aria-busy', 'true');
      list.innerHTML = '<div class="nt-share-empty"><strong>正在查找模板…</strong><p>请稍候</p></div>';
      view.root.querySelector('[data-ns-context]').textContent = admin ? '审核列表' : mode === 'mine' ? '你提交的模板和审核进度。上传入口在角色的命名模板编辑窗口。' : '公开模板已通过审核，打开详情后可应用到对应角色。';
      for (const tab of view.root.querySelectorAll('.nt-share-tabs button')) {
        tab.setAttribute('aria-pressed', String(tab.hasAttribute('data-ns-mine') ? mode === 'mine' : mode === 'public'));
      }
      view.root.querySelector('[data-ns-next]').disabled = true;
      view.root.querySelector('[data-ns-prev]').disabled = true;
      try {
        const base = mode === 'mine' ? '/my/naming-templates' : admin ? '/admin/naming-templates' : '/naming-templates';
        const result = await api(base + '?offset=' + offset + '&limit=20&q=' + encodeURIComponent(query), { auth: mode !== 'public' });
        if (!view.alive || token !== generation) return;
        list.setAttribute('aria-busy', 'false');
        list.innerHTML = result.items.length ? result.items.map(item =>
          '<article class="nt-share-card"><div class="nt-share-card-top"><span class="nt-share-character">' + esc(item.character_name) + '</span>' +
          '<span class="nt-share-badge" data-state="' + esc(item.status) + '">' + esc(labels[item.status]) + '</span></div>' +
          '<h3>' + esc(item.title) + '</h3><p class="nt-share-description">' + esc(item.description || '作者暂未添加说明。') + '</p>' +
          '<div class="nt-share-card-bottom"><span class="nt-share-muted">' + esc(String(item.created_at || '').slice(0,10)) + '</span>' +
          '<button type="button" class="btn" data-ns-detail="' + esc(item.id) + '">查看名称 <span aria-hidden="true">→</span></button></div></article>').join('') :
          '<div class="nt-share-empty"><strong>' + (query ? '没有找到相关模板' : mode === 'mine' ? '还没有上传命名模板' : '这里还没有命名模板') + '</strong><p>' +
          (query ? '试试角色名，或缩短搜索词。' : mode === 'mine' ? '在角色命名模板编辑窗口中，选择「上传当前模板」即可分享。' : '公开模板通过审核后，会出现在这里。') + '</p></div>';
        view.root.querySelector('[data-ns-prev]').disabled = offset === 0;
        view.root.querySelector('[data-ns-next]').disabled = !result.has_more;
        view.root.querySelector('[data-ns-page]').textContent = '第 ' + (offset / 20 + 1) + ' 页';
        view.status('');
      } catch (error) {
        if (view.alive && token === generation) {
          list.setAttribute('aria-busy', 'false');
          list.innerHTML = '<div class="nt-share-empty"><strong>暂时无法加载</strong><p>请再次点击搜索重试。查看我的上传需要先登录。</p></div>';
          view.status(error.message, true);
        }
      }
    }
    if (!admin) {
      view.root.querySelector('[data-ns-public]').addEventListener('click', () => { mode = 'public'; offset = 0; void load(); });
      view.root.querySelector('[data-ns-mine]').addEventListener('click', () => { mode = 'mine'; offset = 0; void load(); });
    }
    view.root.querySelector('[data-ns-search-form]').addEventListener('submit', e => {
      e.preventDefault();
      query = view.root.querySelector('[data-ns-search]').value.trim(); offset = 0; void load();
    });
    view.root.querySelector('[data-ns-prev]').addEventListener('click', () => { offset = Math.max(0, offset - 20); void load(); });
    view.root.querySelector('[data-ns-next]').addEventListener('click', () => { offset += 20; void load(); });
    list.addEventListener('click', async e => {
      const button = e.target.closest('[data-ns-detail]');
      if (!button || view.busy) return;
      view.busy = true;
      try {
        const prefix = mode === 'mine' ? '/my' : admin ? '/admin' : '';
        const result = await api(prefix + '/naming-templates/' + encodeURIComponent(button.dataset.nsDetail), { auth: mode !== 'public' });
        if (view.alive) openDetail(result.template, mode);
      } catch (error) { view.status(error.message, true); }
      finally { view.busy = false; }
    });
    void load();
  }
  function openDetail(item, mode, onReturn) {
    const view = modal(item.title, '<div class="nt-share-detail-meta"><span class="nt-share-character">' + esc(item.character_name) + '</span><span class="nt-share-badge" data-state="' + esc(item.status) + '">' + esc(labels[item.status]) + '</span><span class="nt-share-muted">' + item.template.overrides.length + ' 个自定义名称</span></div>' +
      '<p class="nt-share-description nt-share-detail-description">' + esc(item.description || '作者暂未添加说明。') + '</p>' +
      mappingHtml(item.template) + '<div class="nt-share-apply"><h3>使用与管理</h3><div class="nt-share-toolbar" data-ns-actions></div></div>');
    const actions = view.root.querySelector('[data-ns-actions]');
    function button(label, fn) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'btn' + (/^(应用命名模板|审核通过)$/.test(label) ? ' nt-share-primary' : ''); el.textContent = label;
      el.addEventListener('click', async () => {
        if (view.busy) return;
        view.busy = true; el.disabled = true;
        try { await fn(); } catch (error) { view.status(error.message, true); }
        finally { view.busy = false; el.disabled = false; }
      });
      actions.appendChild(el);
    }
    const returnToList = () => { if (onReturn) { view.close(); void onReturn(); } else openLibrary(mode); };
    if (mode === 'admin' && item.status === 'pending') {
      const noteLabel = document.createElement('label'); noteLabel.textContent = '审核说明（可选）';
      const note = document.createElement('textarea'); note.maxLength = 300; note.rows = 2; note.setAttribute('aria-label', '审核说明'); noteLabel.appendChild(note); actions.before(noteLabel);
      button('审核通过', async () => {
        await api('/admin/naming-templates/' + item.id + '/review', { method: 'POST', auth: true, body: { action: 'approve', revision: item.revision, note: note.value.trim() } });
        returnToList();
      });
      button('驳回', async () => {
        await api('/admin/naming-templates/' + item.id + '/review', { method: 'POST', auth: true, body: { action: 'reject', revision: item.revision, note: note.value.trim() } });
        returnToList();
      });
    }
    // Viewing and sharing are independent of applying. Reuse existing local naming flow explicitly.
    if (item.status === 'published' && wc.state && wc.createMemberNamingTemplate) {
      const targets = wc.state.members.map((member, index) => ({ member, index })).filter(x => String(x.member.characterId) === item.character_id);
      const select = document.createElement('select');
      select.setAttribute('aria-label', '应用到角色槽位');
      targets.forEach(x => { const option = document.createElement('option'); option.value = x.index; option.textContent = '角色槽 ' + (x.index + 1) + ' · ' + x.member.name; select.appendChild(option); });
      if (targets.length) {
        const targetLabel = document.createElement('label');
        targetLabel.textContent = '应用到角色槽位'; targetLabel.appendChild(select); actions.appendChild(targetLabel);
        const replace = document.createElement('select');
        replace.setAttribute('aria-label', '命名模板存放位置');
        const replaceLabel = document.createElement('label');
        replaceLabel.textContent = '命名模板存放位置'; replaceLabel.appendChild(replace); actions.appendChild(replaceLabel);
        const hint = document.createElement('p'); hint.className = 'nt-share-apply-hint';
        hint.textContent = '应用到该角色全部轮次；不匹配的技能跳过。每个角色可保存两份，替换会覆盖所选模板的名称设置。';
        actions.before(hint);
        function options() {
          const local = wc.listMemberNamingTemplates(Number(select.value));
          replace.innerHTML = (local.length < 2 ? '<option value="">新建一份</option>' : '<option value="" disabled selected>已满两份，请选择替换对象</option>') +
            local.map((t, i) => '<option value="' + esc(t.id) + '">替换槽' + (i + 1) + '：' + esc(t.name) + '</option>').join('');
        }
        select.addEventListener('change', options); options();
        button('应用命名模板', async () => {
          const index = Number(select.value), member = wc.state.members[index];
          if (!member || String(member.characterId) !== item.character_id) throw new Error('角色已变化，请重新打开详情');
          const local = wc.listMemberNamingTemplates(index);
          if (!replace.value && local.length >= 2) throw new Error('请选择要替换的命名模板');
          const char = wc.findCharSkillDef(member.characterId);
          const known = new Set((char && char.skills || []).map(s => s.name));
          for (const s of member.skillPalette || []) known.add(s.librarySkillName || s.name);
          const catalogs = [member.rotationCatalog || [], ...(member.cycleConfig?.enabled ? (member.cycleConfig.rounds || []).map(r => r.rotationCatalog || []) : [])];
          catalogs.forEach(catalog => catalog.forEach(s => known.add(wc.getEntryLibrarySkillName(s) || s.name)));
          const skipped = item.template.overrides.filter(mapping => !known.has(mapping.skillName)).length;
          let target = replace.value ? local.find(t => t.id === replace.value) : null;
          if (replace.value && !target) throw new Error('替换对象已变化，请重新打开详情');
          if (!target) target = wc.createMemberNamingTemplate(index);
          if (!target) throw new Error('命名模板已满，请重新选择');
          target.name = item.title;
          target.overrides = Object.fromEntries(item.template.overrides.map(s => [s.skillName, s.displayName]));
          wc.setActiveMemberNamingTemplate(index, target.id);
          wc.applyMemberNamingTemplateToAxis(index, { matchingOnly: true });
          wc.scheduleSave(); wc.renderMain(); options();
          view.status('已应用到当前角色全部轮次；手动改名保留。' + (skipped ? '已跳过 ' + skipped + ' 个不匹配名称（如未装备的声骸技能）。' : ''));
        });
      } else view.status('请先上阵 ' + item.character_name + '，再应用模板。');
    }
    if (mode === 'mine' && item.status !== 'withdrawn') {
      button('撤回上传', async () => {
        await api('/my/naming-templates/' + item.id + '/withdraw', { method: 'POST', auth: true, body: { revision: item.revision } });
        openLibrary('mine');
      });
    }
    button('返回列表', returnToList);
  }
  async function openAdminDetail(id, onReturn) {
    const result = await api('/admin/naming-templates/' + encodeURIComponent(id), { auth: true });
    openDetail(result.template, 'admin', onReturn);
  }
  wc.NamingTemplates = { enabled, openUpload, openLibrary, openAdminDetail };
  if (!enabled) return;
  document.addEventListener('click', e => {
    const upload = e.target.closest('[data-naming-upload]');
    if (upload) {
      const host = upload.closest('[data-naming-template-modal]');
      openUpload(Number(host && host.dataset.namingMemberIndex));
    }
    if (e.target.closest('[data-naming-community]')) openLibrary();
    if (e.target.closest('[data-naming-admin]')) openLibrary('admin');
  });
})();