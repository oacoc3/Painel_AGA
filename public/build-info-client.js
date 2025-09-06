// public/build-info-client.js
(function () {
  const TRY_IDS = ['appVersion', 'footerVersion', 'buildVersion'];

  function findTargetEl() {
    for (const id of TRY_IDS) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    const dataEl = document.querySelector('[data-build-info]');
    if (dataEl) return dataEl;
    return null;
  }

  function fmt(info) {
    // Prioriza dados do deploy; se não existirem, usa APP_CONFIG.VERSION (fallback local)
    const local = (window.APP_CONFIG && window.APP_CONFIG.VERSION) ? `v${window.APP_CONFIG.VERSION}` : '';
    if (!info || info.ok !== true) return local || '';

    const parts = [];
    if (local) parts.push(local);
    if (info.branch) parts.push(info.branch);
    if (info.commit_short) parts.push(`@${info.commit_short}`);
    // Ex.: "v1.4.2 main @a1b2c3d"
    return parts.join(' ').trim() || local || '';
  }

  async function fetchWithTimeout(url, ms = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), ms);
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  async function apply() {
    try {
      const res = await fetchWithTimeout('/.netlify/functions/build-info', 4000);
      const data = await res.json().catch(() => ({}));
      window.APP_BUILD_INFO = data; // expõe global p/ inspeção/telemetria, se quiser
      const tgt = findTargetEl();
      const text = fmt(data);
      if (tgt && text) {
        tgt.textContent = text;
        tgt.setAttribute('title', data.deployed_at ? `Deploy: ${data.deployed_at}` : '');
      } else {
        // sem alvo visível -> apenas loga (não altera visual)
        console.info('[build-info]', text || '(sem info)', data);
      }
    } catch (e) {
      // Falha ao buscar build-info -> mantém apenas APP_CONFIG.VERSION, se houver
      const tgt = findTargetEl();
      const local = (window.APP_CONFIG && window.APP_CONFIG.VERSION) ? `v${window.APP_CONFIG.VERSION}` : '';
      if (tgt && local) tgt.textContent = local;
      console.warn('[build-info] falha ao obter info do deploy:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
