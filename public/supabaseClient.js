// public/supabaseClient.js
// Cria o cliente Supabase a partir do window.APP_CONFIG (definido em public/config.js)
// e evita inicializar sem chave (o que causaria "No API key found in request").
// Não altera o visual nem a lógica do app; apenas robustece a inicialização e adiciona diagnóstico.

(() => {
  // 1) Checar se a lib UMD está no window
  if (!window.supabase) {
    console.error('[Supabase] Biblioteca @supabase/supabase-js não carregou. Confira a tag <script> do CDN.');
    return;
  }

  // 2) Função que tenta criar o cliente; retorna true/false
  function tryCreateClient() {
    const cfg = window.APP_CONFIG || {};
    const url = cfg.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY;

    if (!url || !key) {
      // Ainda não temos config carregada — NÃO criar o cliente aqui.
      return false;
    }

    // Evitar recriações
    if (window.sb && window.sb.auth) {
      return true;
    }

    // Criar cliente com opções padrão do seu projeto
    window.sb = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true // processa o token do magic link (OTP)
      },
      global: { headers: { 'x-application-name': 'Painel DO-AGA' } }
    });

    // Expor helpers (mantém compatibilidade com seu código)
    window.getSession = async () => (await sb.auth.getSession()).data.session || null;
    window.getUser = async () => (await sb.auth.getUser()).data.user || null;

    // Log leve p/ confirmar chave lida (não vaza a chave)
    try {
      console.log('[SB READY]', { url, anonKeyLen: (key || '').length });
    } catch (_) {}
    return true;
  }

  // 3) Tenta já; se não der, agenda algumas novas tentativas (corrida de scripts/cache)
  if (!tryCreateClient()) {
    let tries = 0;
    const maxTries = 30; // ~3s
    const timer = setInterval(() => {
      tries += 1;
      if (tryCreateClient() || tries >= maxTries) {
        clearInterval(timer);
        if (tries >= maxTries) {
          const cfg = window.APP_CONFIG || {};
          console.error('[Supabase] Config ausente/incompleta após espera.',
            { url: cfg.SUPABASE_URL, anonKeyLen: (cfg.SUPABASE_ANON_KEY || '').length });
        }
      }
    }, 100);
  }

  // 4) Utilitário opcional de diagnóstico: __SB_DIAG('email@dominio')
  window.__SB_DIAG = async function (email) {
    const cfg = window.APP_CONFIG || {};
    const urlBase = cfg.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY;

    if (!urlBase || !key) {
      console.log('[Diag] APP_CONFIG incompleto', { url: urlBase, anonKeyLen: (key || '').length });
      return;
    }

    try {
      const r1 = await fetch(urlBase + '/auth/v1/health', { cache: 'no-store' });
      console.log('[Diag] /auth/v1/health →', r1.status, r1.ok);
    } catch (e) {
      console.log('[Diag] health erro:', String(e));
    }

    try {
      const r2 = await fetch(urlBase + '/auth/v1/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({ email, type: 'magiclink', create_user: false })
      });
      const body = await r2.json().catch(() => ({}));
      console.log('[Diag] /auth/v1/otp →', r2.status, body);
    } catch (e) {
      console.log('[Diag] otp erro:', String(e));
    }
  };
})();
