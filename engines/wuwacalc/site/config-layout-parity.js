/* Keep echo affix navigation inside the existing single-row controls. */
(() => {
  const rowSelector = '#workspaceLayout.phase-setup .local-echo-wide .echo-sub-row';
  const backValue = '__echo_affix_back__';
  const previousTypes = new WeakMap();
  function syncEchoPresentation() {
    document.querySelectorAll(rowSelector).forEach(row => {
      const stat = row.querySelector('select[data-echo-sub-stat]');
      const type = row.querySelector('select[data-echo-sub-dmgtype]');
      if (stat) {
        stat.classList.add('echo-sub-stat');
        stat.classList.toggle('echo-sub-stat-type-parent', !!type);
        stat.removeAttribute('aria-hidden');
        stat.removeAttribute('tabindex');
      }
      if (type) {
        type.classList.add('echo-sub-type-only');
        if (!previousTypes.has(type)) previousTypes.set(type, type.value);
        if (![...type.options].some(option => option.value === backValue)) {
          const back = new Option('← 返回词条属性', backValue);
          type.add(back);
        }
      }
    });
  }
  // Menu navigation is presentation only: never send its sentinel to the affix model.
  document.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const row = select.closest(rowSelector);
    if (!row) return;
    const stat = row.querySelector('select[data-echo-sub-stat]');
    const type = row.querySelector('select[data-echo-sub-dmgtype]');
    if (!stat || !type) return;
    if (select === type && select.value === backValue) {
      event.stopImmediatePropagation();
      type.value = previousTypes.get(type) || '';
      const placeholder = new Option('选择词条属性', '');
      placeholder.disabled = true;
      placeholder.dataset.echoAffixPlaceholder = '';
      stat.add(placeholder, 0);
      stat.value = '';
      row.classList.add('is-selecting-affix');
      stat.focus();
    } else if (select === stat && row.classList.contains('is-selecting-affix')) {
      row.classList.remove('is-selecting-affix');
      stat.querySelector('[data-echo-affix-placeholder]')?.remove();
      if (stat.value === 'sub_type_dmg') {
        event.stopImmediatePropagation();
        type.focus();
      }
    } else if (select === type) {
      previousTypes.set(type, type.value);
    }
  }, true);
  const layout = document.getElementById('workspaceLayout');
  if (layout) new MutationObserver(syncEchoPresentation).observe(layout, { childList: true, subtree: true });
  syncEchoPresentation();
})();
