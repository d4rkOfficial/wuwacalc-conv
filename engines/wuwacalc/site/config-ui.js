/* Configuration UI only. Existing controls remain responsible for application state. */
(()=>{
 'use strict';
 const html=document.documentElement;
 let loaded=false;
 let theme='classic',motion='auto';
 try{theme=localStorage.getItem('wavecalc-config-theme')||localStorage.getItem('wavecalc-theme')||'classic';motion=localStorage.getItem('wavecalc-bg-motion-mode')||'auto';}catch{}
 if(theme!=='ivory-prism')theme='classic';
 if(!['auto','on','off'].includes(motion))motion='auto';
 const controls=document.createElement('div');controls.id='configThemeSwitcher';controls.className='theme-switcher';controls.setAttribute('aria-label','配置页主题与背景动效');
 controls.innerHTML='<button type="button" class="theme-btn" data-config-theme="classic" title="炭黑甜酷粉" aria-label="炭黑甜酷粉"><span class="theme-btn-tooltip">炭黑甜酷粉</span></button><button type="button" class="theme-btn" data-config-theme="ivory-prism" title="暖白深海蓝" aria-label="暖白深海蓝"><span class="theme-btn-tooltip">暖白深海蓝</span></button><label class="bg-motion-control">动效<select aria-label="背景动效"><option value="auto">自动</option><option value="on">开启</option><option value="off">关闭</option></select></label>';
 document.body.append(controls);
 function paint(){html.dataset.configTheme=theme;html.dataset.bgMotion=motion;controls.querySelectorAll('button').forEach(b=>{const active=b.dataset.configTheme===theme;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});controls.querySelector('select').value=motion;document.dispatchEvent(new Event('wavecalc-bg-motion-change'));}
 controls.addEventListener('click',e=>{const b=e.target.closest('button[data-config-theme]');if(!b)return;theme=b.dataset.configTheme;try{localStorage.setItem('wavecalc-config-theme',theme);}catch{}paint();});
 controls.querySelector('select').addEventListener('change',e=>{motion=e.target.value;try{localStorage.setItem('wavecalc-bg-motion-mode',motion);}catch{}paint();});
 paint();
 function sync(){
  const layout=document.getElementById('workspaceLayout');
  const active=!!(layout?.classList.contains('phase-setup') || layout?.classList.contains('phase-buff') || layout?.classList.contains('phase-axis') || layout?.classList.contains('phase-calc') || layout?.classList.contains('phase-check') || layout?.classList.contains('phase-export') || (document.body.classList.contains('public-db-open') || document.body.classList.contains('user-profile-open')))&&!html.classList.contains('intro-pending')&&!document.body.matches('.intro-open,.matrix-page-open')&&!window.__wcMobile;
  if(html.hasAttribute('data-config-ui-active')!==active)html.toggleAttribute('data-config-ui-active',active);
  if(active&&!loaded){loaded=true;const s=document.createElement('script');s.src='config-ui-effects.js?v=8e7c240ee8';s.onerror=()=>{loaded=false;html.removeAttribute('data-config-ui-active');};document.body.append(s);}
 }
 const observer=new MutationObserver(sync);observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 observer.observe(html,{attributes:true,attributeFilter:['class']});
 const layout=document.getElementById('workspaceLayout');if(layout)observer.observe(layout,{attributes:true,attributeFilter:['class']});
 sync();
})();

