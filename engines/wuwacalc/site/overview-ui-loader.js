/* Data overview presentation; calculator and saved plans stay on live code. */
(() => {
  const observers = [];
  const watch = (target, options) => { const observer = new MutationObserver(sync); observer.observe(target, options); observers.push(observer); };
  let loading = false, loaded = false;
  const active = () => {
    const page = document.querySelector('.overview-page');
    return !!page && getComputedStyle(page).display !== 'none' &&
      !document.documentElement.classList.contains('intro-pending') &&
      !document.body.matches('.intro-open,.public-db-open,.user-profile-open,.matrix-page-open') &&
      !window.__wcMobile;
  };
  const loadStyle = url => new Promise((resolve, reject) => {
    const node = document.createElement('link');
    node.rel = 'stylesheet'; node.href = url;
    node.onload = resolve; node.onerror = () => reject(new Error('Failed to load ' + url));
    document.head.append(node);
  });
  const loadScript = url => new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = url; node.onload = resolve;
    node.onerror = () => reject(new Error('Failed to load ' + url));
    document.body.append(node);
  });
  const sync = async () => {
    if (loaded || loading || !active()) return;
    loading = true;
    try {
      await Promise.all(['local-overview.css?v=6a6e6669c1', 'local-overview-effects.css?v=2f84d210c2'].map(loadStyle));
      await loadScript('local-overview.js?v=e2aef92682');
      await loadScript('local-overview-effects.js?v=ba2604d1a1');
      loaded = true;
      observers.forEach(observer => observer.disconnect());
    } catch (error) { console.warn('Data overview presentation unavailable:', error); }
    finally { loading = false; }
  };
  const main = document.getElementById('main');
  if (main) watch(main, { childList: true, subtree: true });
  const layout = document.getElementById('workspaceLayout');
  if (layout) watch(layout, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
