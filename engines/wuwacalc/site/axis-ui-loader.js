/* Axis presentation from the local workbench; calculation stays in live ui.js. */
(() => {
  const observers = [];
  const watch = (target, options) => { const observer = new MutationObserver(sync); observer.observe(target, options); observers.push(observer); };
  let loading = false;
  let loaded = false;
  const active = () => {
    const layout = document.getElementById('workspaceLayout');
    return !!layout?.classList.contains('phase-axis') &&
      !document.documentElement.classList.contains('intro-pending') &&
      !document.body.matches('.intro-open,.public-db-open,.user-profile-open,.matrix-page-open') &&
      !window.__wcMobile;
  };
  const loadStyle = url => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.append(link);
  });
  const loadScript = url => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.body.append(script);
  });
  const sync = async () => {
    if (loaded || loading || !active()) return;
    loading = true;
    try {
      await loadStyle('local-axis.css?v=3718cd79b1');
      await loadScript('local-axis.js?v=4a4e2ec3e6');
      loaded = true;
      observers.forEach(observer => observer.disconnect());
    } catch (error) {
      console.warn('Axis UI presentation unavailable:', error);
    } finally {
      loading = false;
    }
  };
  const layout = document.getElementById('workspaceLayout');
  if (layout) watch(layout, { attributes:true, attributeFilter:['class'] });
  sync();
})();
