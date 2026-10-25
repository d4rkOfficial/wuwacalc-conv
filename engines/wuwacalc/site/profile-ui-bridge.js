/* Keep the live account behavior while matching the local profile hierarchy. */
(()=>{
  const page=document.getElementById('userProfilePage');
  if(!page)return;
  let queued=false;
  function sync(){
    queued=false;
    if(!document.body.classList.contains('user-profile-open'))return;
    const container=page.querySelector('.up2-container');
    const right=container?.querySelector(':scope > .up2-col-right');
    const account=page.querySelector('[data-profile-account-section]');
    const echo=page.querySelector('[data-profile-echo-section]');
    const quick=page.querySelector('.up2-quick');
    if(!container||!right)return;
    page.querySelector('[data-profile-identity]')?.parentElement?.setAttribute('data-local-profile-identity','');
    let span=container.querySelector(':scope > [data-local-profile-echo]');
    if(!span){span=document.createElement('div');span.className='up2-grid-span';span.setAttribute('data-local-profile-echo','');right.insertAdjacentElement('afterend',span)}
    let quickSpan=container.querySelector(':scope > [data-local-profile-quick]');
    if(!quickSpan){quickSpan=document.createElement('div');quickSpan.className='up2-grid-span';quickSpan.setAttribute('data-local-profile-quick','');span.insertAdjacentElement('afterend',quickSpan)}
    const oldAccountParent=account?.parentElement;
    const oldQuickParent=quick?.parentElement;
    if(account&&account.parentElement!==right)right.append(account);
    if(echo&&echo.parentElement!==span)span.append(echo);
    if(quick&&quick.parentElement!==quickSpan)quickSpan.append(quick);
    if(oldAccountParent!==right&&oldAccountParent?.classList.contains('up2-col-left')&&!oldAccountParent.children.length)oldAccountParent.remove();
    if(oldQuickParent!==right&&oldQuickParent?.classList.contains('up2-col-right')&&!oldQuickParent.children.length)oldQuickParent.remove();
    const title=page.querySelector('.up-page-title');
    if(title&&title.textContent.trim()!=='个人中心')title.textContent='个人中心';
  }
  const schedule=()=>{if(!queued){queued=true;queueMicrotask(sync)}};
  new MutationObserver(schedule).observe(page,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  schedule();
})();
