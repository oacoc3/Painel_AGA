// Inicializa o cliente Supabase usando variáveis de ambiente (Netlify define no build)
// Sigla usada: RLS (Row-Level Security) = segurança por linha
window.SB = {
  url: window.env?.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''),
  anon: window.env?.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '')
};
if (!SB.url || !SB.anon) {
  console.warn('Defina SUPABASE_URL e SUPABASE_ANON_KEY no ambiente do Netlify.');
}
window.supabase = window.supabase || supabase.createClient(SB.url, SB.anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true // captura token de reset de senha
  }
});
