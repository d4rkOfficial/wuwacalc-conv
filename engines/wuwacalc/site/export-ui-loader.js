/* Export workbench presentation; online export and upload actions stay in ui.js. */
(() => {
  const observers = [];
  const watch = (target, options) => { const observer = new MutationObserver(sync); observer.observe(target, options); observers.push(observer); };
  let loading=false, loaded=false;
  const active=()=>{
    const page=document.querySelector('.export-page');
    return !!page && getComputedStyle(page).display!=='none' && !window.__wcMobile &&
      !document.documentElement.classList.contains('intro-pending') &&
      !document.body.matches('.intro-open,.public-db-open,.user-profile-open,.matrix-page-open');
  };
  const loadStyle=url=>new Promise((resolve,reject)=>{const n=document.createElement('link');n.rel='stylesheet';n.href=url;n.onload=resolve;n.onerror=()=>reject(new Error('Failed to load '+url));document.head.append(n)});
  const loadScript=url=>new Promise((resolve,reject)=>{const n=document.createElement('script');n.src=url;n.onload=resolve;n.onerror=()=>reject(new Error('Failed to load '+url));document.body.append(n)});
  const sync=async()=>{
    if (loaded || loading || !active())return;
    loading=true;
    try{
      await loadStyle('export-ui.css?v=459387115f');
      await loadScript('export-ui-bridge.js?v=a1eda8a42f');
      loaded = true;
      observers.forEach(observer => observer.disconnect());
    }catch(error){console.warn('Export UI presentation unavailable:',error)}finally{loading=false}
  };
  const main=document.getElementById('main');if(main)watch(main, {childList:true,subtree:true});
  const layout=document.getElementById('workspaceLayout');if(layout)watch(layout, {attributes:true,attributeFilter:['class']});
  sync();
})();
