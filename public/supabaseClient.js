// public/supabaseClient.js
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Config Supabase ausente em window.APP_CONFIG.');
  }
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // ⚠️ Importante: nós mesmos processamos o link de recuperação
      detectSessionInUrl: false
    },
    global: { headers: { 'x-application-name': 'Painel DO-AGA' } }
  });

  window.getSession = async () => (await sb.auth.getSession()).data.session || null;
  window.getUser = async () => (await sb.auth.getUser()).data.user || null;
})();
