/* 深色主题弹窗工具：统一替换浏览器原生 alert/confirm/prompt（默认白色弹窗）。
 * window.alert 被覆盖为深色非阻塞提示；confirm/prompt 为 Promise 接口，
 * 调用处需改为 await DialogKit.confirm(...) / DialogKit.prompt(...)。 */
(function () {
  'use strict';
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function baseStyle() {
    return 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400000;display:flex;align-items:center;justify-content:center;';
  }
  function dialogStyle(width) {
    return (
      'background:#1d2430;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:18px;' +
      (width ? 'width:' + width + ';' : 'width:440px;') +
      'max-width:92vw;color:#e8e8e8;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,.4);'
    );
  }
  function btnOk(danger, text) {
    return (
      '<button type="button" data-dk-ok style="padding:7px 18px;border-radius:7px;background:' +
      (danger ? '#a33b3b' : '#3b6ea8') +
      ';border:none;color:#fff;cursor:pointer;font-size:13px;">' +
      escHtml(text || '确定') +
      '</button>'
    );
  }
  function btnCancel() {
    return (
      '<button type="button" data-dk-cancel style="padding:7px 16px;border-radius:7px;background:transparent;border:1px solid rgba(255,255,255,.22);color:#ccc;cursor:pointer;font-size:13px;">取消</button>'
    );
  }
  function showOverlay(html) {
    var overlay = document.createElement('div');
    overlay.className = 'wc-dialog-kit';
    overlay.style.cssText = baseStyle();
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    return overlay;
  }
  var alertQueue = [];
  var alertActive = false;
  function showAlert(message) {
    alertQueue.push(String(message == null ? '' : message));
    if (alertActive) return;
    alertActive = true;
    processAlertQueue();
    function processAlertQueue() {
      if (!alertQueue.length) {
        alertActive = false;
        return;
      }
      var msg = alertQueue.shift();
      var overlay = showOverlay(
        '<div style="' + dialogStyle() + '">' +
          '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:#e8e8e8;">' + escHtml(msg) + '</div>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:14px;">' + btnOk(false) + '</div></div>'
      );
      function close() {
        overlay.remove();
        processAlertQueue();
      }
      overlay.addEventListener('click', function (e) {
        if (e.target.closest('[data-dk-ok]') || e.target === overlay) close();
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
      var okBtn = overlay.querySelector('[data-dk-ok]');
      if (okBtn) okBtn.focus();
    }
  }
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = showOverlay(
        '<div style="' + dialogStyle() + '">' +
          (opts.title ? '<h3 style="margin:0 0 10px;font-size:15px;color:#fff;">' + escHtml(opts.title) + '</h3>' : '') +
          (opts.hint ? '<div style="margin:-6px 0 10px;color:#8b94a8;font-size:12px;line-height:1.5;white-space:pre-wrap;">' + escHtml(opts.hint) + '</div>' : '') +
          '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:#e8e8e8;">' + escHtml(opts.message == null ? '' : opts.message) + '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' + btnCancel() + btnOk(!!opts.danger, opts.okText) + '</div></div>'
      );
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        overlay.remove();
        resolve(v);
      }
      overlay.addEventListener('click', function (e) {
        if (e.target.closest('[data-dk-ok]')) finish(true);
        else if (e.target.closest('[data-dk-cancel]') || e.target === overlay) finish(false);
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      var okBtn = overlay.querySelector('[data-dk-ok]');
      if (okBtn) okBtn.focus();
    });
  }
  function prompt(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = showOverlay(
        '<div style="' + dialogStyle('520px') + '">' +
          (opts.title ? '<h3 style="margin:0 0 10px;font-size:15px;color:#fff;">' + escHtml(opts.title) + '</h3>' : '') +
          '<textarea data-dk-input style="width:100%;min-height:120px;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:#141a24;color:#fff;font-size:14px;line-height:1.6;font-family:inherit;resize:vertical;white-space:pre-wrap;word-break:break-word;" placeholder="' + escHtml(opts.placeholder || '') + '"' + (opts.max ? ' maxlength="' + Number(opts.max) + '"' : '') + '>' + escHtml(opts.initial || '') + '</textarea>' +
          '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:12px;">' +
          '<span data-dk-count style="margin-right:auto;color:#8b94a8;font-size:12px;">' + String(opts.initial || '').length + (opts.max ? '/' + Number(opts.max) : '') + '</span>' +
          btnCancel() + btnOk(false) +
          '</div></div>'
      );
      var input = overlay.querySelector('[data-dk-input]');
      var countEl = overlay.querySelector('[data-dk-count]');
      input.focus();
      if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        overlay.remove();
        resolve(v);
      }
      input.addEventListener('input', function () {
        if (countEl) countEl.textContent = input.value.length + (opts.max ? '/' + Number(opts.max) : '');
      });
      overlay.addEventListener('click', function (e) {
        if (e.target.closest('[data-dk-ok]')) finish(input.value);
        else if (e.target.closest('[data-dk-cancel]') || e.target === overlay) finish(null);
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      });
    });
  }
  window.DialogKit = { alert: showAlert, confirm: confirm, prompt: prompt };
  // 覆盖原生 alert：返回值本就是 undefined，可安全替换为深色非阻塞提示
  window.alert = showAlert;
})();

/* 全站弹窗行为统一层：滚动锁定 + 焦点归还（MutationObserver 通用接管），ESC/遮罩为缺失弹窗补齐 */
(function () {
  'use strict';
  if (window.__wcDialogBehavior) return;
  window.__wcDialogBehavior = true;

  // 顶层浮层：打开时进入文档、关闭时移除
  var ROOTS = [
    '.wc-dialog-kit',
    '.naming-template-overlay',
    '.build-modal-backdrop',
    '[data-ecm-root]',
    '[data-matrix-modal-overlay]',
    '.cloud-dialog',
    '[data-pdb-detail-overlay]',
    '.ecard-crop-overlay',
    '.export-card-maker-overlay',
    '.chain-game-text-batch-layer',
  ];

  // 已自处理 ESC 的弹窗：行为层只做锁滚动与焦点归还
  var SELF_ESC = new Set(['.wc-dialog-kit', '[data-ecm-root]', '[data-matrix-modal-overlay]', '.cloud-dialog']);

  // 缺失 ESC/遮罩的弹窗：esc=关闭按钮；backdrop=true 表示点遮罩也需关闭
  var EXTRA = {
    '.naming-template-overlay': { esc: '[data-nt-close]', backdrop: false },
    '.build-modal-backdrop': { esc: '[data-build-modal-close], [aria-label="关闭"]', backdrop: false },
    '[data-pdb-detail-overlay]': { esc: '[data-pdb-detail-close], [aria-label="关闭"]', backdrop: true },
    '.ecard-crop-overlay': { esc: '[data-ecard-crop-cancel]', backdrop: false },
    '.export-card-maker-overlay': { esc: '[aria-label="关闭"], .close, [data-export-card-close]', backdrop: true },
    '.chain-game-text-batch-layer': { esc: '[data-chain-game-text-batch-close]', backdrop: true },
  };

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  function openRoots() {
    var list = [];
    var els = document.querySelectorAll(ROOTS.join(','));
    for (var i = 0; i < els.length; i++) {
      if (isVisible(els[i])) list.push(els[i]);
    }
    return list;
  }

  function configFor(root) {
    for (var i = 0; i < ROOTS.length; i++) {
      if (root.matches && root.matches(ROOTS[i])) {
        return { selfEsc: SELF_ESC.has(ROOTS[i]), extra: EXTRA[ROOTS[i]] || null };
      }
    }
    return null;
  }

  function findCloseBtn(root) {
    var btns = root.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var s =
        String(b.className || '') + ' ' +
        String(b.getAttribute('aria-label') || '') + ' ' +
        String(b.id || '');
      if (/close|cancel|dismiss|关闭|取消/.test(s)) return b;
    }
    return null;
  }

  function clickEscBtn(root) {
    var cfg = configFor(root);
    if (!cfg || !cfg.extra || !cfg.extra.esc) return false;
    var btn = null;
    try {
      btn = root.querySelector(cfg.extra.esc) || findCloseBtn(root);
    } catch (_) {
      btn = findCloseBtn(root);
    }
    if (btn && typeof btn.click === 'function') {
      btn.click();
      return true;
    }
    return false;
  }

  // 滚动锁定 + 焦点归还
  var lockCount = 0;
  var prevFocus = null;
  var scanScheduled = false;
  function reconcile() {
    var n = openRoots().length;
    var had = lockCount > 0;
    lockCount = n;
    if (n > 0 && !had) {
      try { prevFocus = document.activeElement; } catch (_) { prevFocus = null; }
      document.body.classList.add('wc-dialog-lock');
    } else if (n === 0 && had) {
      document.body.classList.remove('wc-dialog-lock');
      if (prevFocus && document.contains(prevFocus) && prevFocus !== document.body) {
        try { prevFocus.focus({ preventScroll: true }); } catch (_) {}
      }
      prevFocus = null;
    }
  }
  // 性能：DOM 突变合并到微任务再扫描一次（rAF 在部分环境触发延迟，改用微任务保证锁滚动时机稳定）
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    Promise.resolve().then(function () {
      scanScheduled = false;
      reconcile();
    });
  }

  function init() {
    if (!document.body) return;
    var mo = new MutationObserver(function () {
      scheduleScan();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    reconcile();

    // ESC：仅接管未自管 ESC 的弹窗
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape') return;
        var roots = openRoots();
        if (!roots.length) return;
        var root = roots[roots.length - 1];
        var cfg = configFor(root);
        if (cfg && cfg.selfEsc) return;
        if (clickEscBtn(root)) e.preventDefault();
      },
      true
    );

    // 遮罩点击：仅处理明确缺失遮罩关闭的弹窗（点中的是浮层本身而非面板）
    document.addEventListener(
      'pointerdown',
      function (e) {
        var roots = openRoots();
        if (!roots.length) return;
        var root = roots[roots.length - 1];
        if (e.target !== root) return;
        var cfg = configFor(root);
        if (cfg && cfg.extra && cfg.extra.backdrop && clickEscBtn(root)) {
          e.preventDefault();
        }
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
