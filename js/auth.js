import { showRoute, setNavVisible, setBuildInfo } from './ui.js';

const el = (id) => document.getElementById(id);

async function fetchBuildInfo(){
  try{
    const r = await fetch('/.netlify/functions/build-info');
    const j = await r.json();
    setBuildInfo(`${j.commit?.slice(0,7) || 'local'} @ ${j.time}`);
  }catch(e){ setBuildInfo('local'); }
}

export async function initAuth(){
  // Info de build
  fetchBuildInfo();

  if (!window.supabase) {
    console.error('Cliente Supabase não inicializado. Verifique as variáveis de ambiente.');
    setNavVisible(false);
    showRoute('route-login');
    el('auth-msg').textContent = 'Configuração do Supabase ausente.';
    return;
  }

  // Captura token de recuperação de senha (Supabase envia para a URL)
  const hash = window.location.hash;
  if (hash.includes('type=recovery') || hash.includes('access_token=')){
    // Usuário abrindo link de reset → exige nova senha
    showRoute('route-login');
    document.getElementById('recover-box').classList.add('hidden');
    document.getElementById('force-change').classList.remove('hidden');
  }

  // Estado de sessão
  const { data: { session } } = await supabase.auth.getSession();
  if (session){
    await afterLogin(session);
  }else{
    setNavVisible(false);
    showRoute('route-login');
  }

  // Eventos de auth
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (['SIGNED_IN', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) {
      if (session) await afterLogin(session);
    }
    if (event === 'SIGNED_OUT'){
      setNavVisible(false);
      showRoute('route-login');
    }
  });

  // Login
  el('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('auth-msg').textContent = '';
    const email = el('login-email').value.trim();
    const password = el('login-password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error){ el('auth-msg').textContent = error.message; return; }
    await afterLogin(data.session);
  });

  // Logout
  el('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // Recuperar senha
  el('link-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    el('recover-box').classList.remove('hidden');
  });
  el('form-recover').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el('recover-email').value.trim();
    const redirectTo = window.location.origin; // SPA detecta token
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    el('auth-msg').textContent = error ? error.message : 'E-mail enviado (verifique caixa de entrada).';
  });

  // Troca obrigatória / recuperação
  el('form-force-change').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = el('force-pass-1').value, p2 = el('force-pass-2').value;
    if (p1 !== p2){ alert('Senhas não coincidem.'); return; }
    const { data: { user }, error } = await supabase.auth.updateUser({ password: p1 });
    if (error){ alert(error.message); return; }
    // Marca que não precisa mais trocar
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id);
    alert('Senha atualizada com sucesso.');
    el('force-change').classList.add('hidden');
  });
}

async function afterLogin(session){
  // Carrega perfil e exibe navegação
  const uid = session.user.id;
  const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  if (error){ console.error(error); }

  // Sem autocadastro: se o perfil não existir, bloqueia
  if (!prof){ await supabase.auth.signOut(); alert('Usuário não autorizado. Contate o Administrador.'); return; }

  document.getElementById('user-ident').textContent = prof.name || session.user.email;
  document.getElementById('user-role').textContent = prof.role;
  setNavVisible(true);

  // Controla visibilidade do menu por perfil
  document.querySelectorAll('#main-nav [data-role]').forEach(btn => {
    const roleReq = btn.getAttribute('data-role');
    btn.style.display = (prof.role === roleReq) ? '' : 'none';
  });

  // Troca obrigatória
  if (prof.must_change_password){
    showRoute('route-login');
    document.getElementById('force-change').classList.remove('hidden');
  }else{
    location.hash = location.hash || '#/dashboard';
  }
}

export function guardRoute(requiredRoles = []){
  // Simples guard por perfil
  return async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.hash = '#/login'; return false; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    if (requiredRoles.length && !requiredRoles.includes(prof.role)){ alert('Acesso negado.'); return false; }
    return true;
  };
}
