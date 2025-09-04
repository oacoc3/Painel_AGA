// public/supabaseClient.js
// Inicializa o cliente do Supabase usando as chaves do config.js (ANON é pública por design).
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Config Supabase ausente em window.APP_CONFIG.');
  }
  // supabase (global) vem do UMD: <script src=".../supabase.min.js">
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: { headers: { 'x-application-name': 'Painel DO-AGA' } }
  });

  // Helper para obter sessão/perfil rapidamente
  window.getSession = async () => (await sb.auth.getSession()).data.session || null;
  window.getUser = async () => (await sb.auth.getUser()).data.user || null;
})();
