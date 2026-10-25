/* Runs before the application only inside the mobile card studio engine. */
(function () {
  if (new URLSearchParams(location.search).get('cardStudio') !== '1') return;
  const W = window.__WC || (window.__WC = {});
  const id = 'wc-card-studio-' + crypto.randomUUID() + ':';
  let durable;
  const remembered = new Set(['wuwacalc_kuro_binding_v1', 'wuwacalc_kuro_accounts_v1']);
  function memoryStorage(persistKuro = false) {
    const values = new Map();
    return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
      getItem: key => persistKuro && remembered.has(String(key)) ? durable.getItem(String(key)) : values.get(String(key)) ?? null,
      setItem: (key, value) => { if (persistKuro && remembered.has(String(key))) durable.setItem(String(key),String(value)); else values.set(String(key),String(value)); },
      removeItem: key => { if (persistKuro && remembered.has(String(key))) durable.removeItem(String(key)); else values.delete(String(key)); }, clear: () => values.clear() };
  }
  try {
    durable = window.localStorage;
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(true) });
    Object.defineProperty(window, 'sessionStorage', { value: memoryStorage() });
    const factory = window.indexedDB, open = factory.open.bind(factory), drop = factory.deleteDatabase.bind(factory);
    const databases = new Set(), connections = new Set();
    factory.open = (name, version) => {
      const isolated = id + name; databases.add(isolated);
      const request = version === undefined ? open(isolated) : open(isolated, version);
      request.addEventListener('success', () => connections.add(request.result));
      return request;
    };
    factory.deleteDatabase = name => drop(id + name);
    if (window.BroadcastChannel) {
      const Channel = window.BroadcastChannel;
      window.BroadcastChannel = class extends Channel { constructor(name) { super(id + name); } };
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      const method = String(options?.method || input?.method || 'GET').toUpperCase();
      const kuro = (url.origin === location.origin && /^\/api\/kurobbs\/(?:login|send-code|roles|characters|character-detail)$/.test(url.pathname)) ||
        (url.protocol === 'https:' && ['api.kurobbs.com', 'event.kurobbs.com'].includes(url.hostname));
      if (!['GET', 'HEAD'].includes(method) && !kuro)
        return Promise.reject(new Error('出图页不会写入云端方案或工作区，请回首页管理存档'));
      return nativeFetch(input, options);
    };
    W.MobileStudioIsolation = { id, dispose() {
      for (const connection of connections) connection.close();
      for (const name of databases) drop(name);
    } };
    window.addEventListener('pagehide', () => W.MobileStudioIsolation.dispose());
    document.documentElement.classList.add('mobile-card-engine');
  } catch (error) {
    // Fail closed: an engine without storage isolation must never load a scheme.
    W.MobileStudioIsolation = { error: '无法建立临时出图空间，请换用新版浏览器重试' };
    window.stop();
  }
})();
