/* Buff check presentation. The live calculation and editor handlers stay in ui.js. */
(() => {
  const observers = [];
  const watch = (target, options) => { const observer = new MutationObserver(sync); observer.observe(target, options); observers.push(observer); };
  const css = [
    'local-jelly.css?v=964bec0de8',
    'local-jelly-views.css?v=3efd0ea2de',
    'local-spring-team.css?v=c0c0ff43b0',
  ];
  const js = [
    'local-jelly.js?v=6fa0cc3651',
    'local-jelly-views.js?v=9356e3ff7c',
    'local-spring-team.js?v=ca6b045e80',
  ];
  let loading = false;
  let loaded = false;

  const isBuffPage = () => {
    const layout = document.getElementById('workspaceLayout');
    return !!layout?.classList.contains('phase-buff') &&
      !document.documentElement.classList.contains('intro-pending') &&
      !document.body.matches('.intro-open,.public-db-open,.user-profile-open,.matrix-page-open') &&
      !window.__wcMobile;
  };
  const addStyle = url => new Promise((resolve, reject) => {
    const node = document.createElement('link');
    node.rel = 'stylesheet';
    node.href = url;
    node.onload = resolve;
    node.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.append(node);
  });
  const addScript = url => new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = url;
    node.onload = resolve;
    node.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.body.append(node);
  });
  const waitForSharedVisuals = async () => {
    for (let i = 0; i < 80 && !window.__WC?.localCharacterBackground; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const sync = async () => {
    if (loaded || loading || !isBuffPage()) return;
    loading = true;
    try {
      await waitForSharedVisuals();
      await Promise.all(css.map(addStyle));
      for (const url of js) await addScript(url);
      loaded = true;
      observers.forEach(observer => observer.disconnect());
    } catch (error) {
      console.warn('Buff UI presentation unavailable:', error);
    } finally {
      loading = false;
    }
  };
  const layout = document.getElementById('workspaceLayout');
  if (layout) watch(layout, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
