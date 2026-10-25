/* Calculation check presentation; live table and matrix handlers stay in ui.js. */
(() => {
  const observers = [];
  const watch = (target, options) => { const observer = new MutationObserver(sync); observer.observe(target, options); observers.push(observer); };
  let loading=false,loaded=false;
  const active=()=>{
    const layout=document.getElementById('workspaceLayout');
    return !!layout?.classList.contains('phase-check') &&
      !document.documentElement.classList.contains('intro-pending') &&
      !document.body.matches('.intro-open,.public-db-open,.user-profile-open,.matrix-page-open') &&
      !window.__wcMobile;
  };
  const loadStyle=url=>new Promise((resolve,reject)=>{const node=document.createElement('link');node.rel='stylesheet';node.href=url;node.onload=resolve;node.onerror=()=>reject(new Error(`Failed to load ${url}`));document.head.append(node)});
  const loadScript=url=>new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=url;node.onload=resolve;node.onerror=()=>reject(new Error(`Failed to load ${url}`));document.body.append(node)});
  const sync=async()=>{
    if (loaded || loading || !active())return;
    loading=true;
    try{
      await Promise.all(['local-check.css?v=b29f0fd84a', 'check-ui-bridge.css?v=fe11805190'].map(loadStyle));
      await loadScript('check-ui-bridge.js?v=38afeb4857');
      loaded = true;
      observers.forEach(observer => observer.disconnect());
    }catch(error){console.warn('Calculation check UI presentation unavailable:',error)}finally{loading=false}
  };
  const layout=document.getElementById('workspaceLayout');if(layout)watch(layout, {attributes:true,attributeFilter:['class']});sync();
})();
