// public/build-info-client.js
(function () {
  function fmt(info) {
    const local = (window.APP_CONFIG && window.APP_CONFIG.VERSION)
      ? `v${window.APP_CONFIG.VERSION}`
      : '';
    if (!info || info.ok !== true) return local || '';

    const parts = [];
    if (local) parts.push(local);
    if (info.branch) parts.push(info.branch);
    if (info.commit_short) parts.push(`@${info.commit_short}`);
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
    const headerEl = document.getElementById('buildInfo'); // small no header
    const footerEl = document.getElementById('footBuild'); // span no footer

    try {
      const res = await fetchWithTimeout('/.netlify/functions/build-info', 4000);
      const data = await res.json().catch(() => ({}));
      window.APP_BUILD_INFO = data;

      const text = fmt(data);
      if (headerEl && text) {
        headerEl.textContent = `build: ${text}`;
        if (data.deployed_at) headerEl.setAttribute('title', `Deploy: ${data.deployed_at}`);
      }
      if (footerEl && text) {
        footerEl.textContent = text;
        if (data.deployed_at) footerEl.setAttribute('title', `Deploy: ${data.deployed_at}`);
      }

      if (!headerEl && !footerEl) {
        // Nenhum alvo visível — não altera visual; apenas loga
        console.info('[build-info]', text || '(sem info)', data);
      }
    } catch (e) {
      // Fallback para versão local, se existir
      const local = (window.APP_CONFIG && window.APP_CONFIG.VERSION) ? `v${window.APP_CONFIG.VERSION}` : '';
      if (headerEl && local) headerEl.textContent = `build: ${local}`;
      if (footerEl && local) footerEl.textContent = local;
      console.warn('[build-info] falha ao obter info do deploy:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
