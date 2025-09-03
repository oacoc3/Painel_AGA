// Inicializa o cliente Supabase usando variáveis de ambiente (Netlify define no build)
// Sigla usada: RLS (Row-Level Security) = segurança por linha
window.SB = {
  url: window.env?.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''),
  anon: window.env?.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '')
};
// Impede inicialização sem as variáveis necessárias
if (!SB.url || !SB.anon) {
  console.error('Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY.');
} else if (typeof supabase !== 'undefined') {
  // Apenas inicializa o cliente caso a biblioteca do Supabase esteja disponível.
if (typeof supabase !== 'undefined') {
  window.supabase = window.supabase || supabase.createClient(SB.url, SB.anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true // captura token de reset de senha
    }
  });
} else {
  console.error('Biblioteca Supabase não carregada. Verifique a tag <script> de importação.');
}
