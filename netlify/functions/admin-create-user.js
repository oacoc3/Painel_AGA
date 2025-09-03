import { createClient } from '@supabase/supabase-js';

export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error:'Method not allowed' }), { status:405 });

  const body = await req.json().catch(()=> ({}));
  const { email, password, name, role } = body || {};
  if (!email || !password || !name || !role) return new Response(JSON.stringify({ error:'Dados incompletos' }), { status:400 });

  const supaAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try{
    // Cria usuário de Auth
    const { data: user, error: e1 } = await supaAdmin.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (e1) throw e1;

    // Insere perfil
    const { error: e2 } = await supaAdmin.from('profiles').insert({
      id: user.user.id, email, name, role, must_change_password: true
    });
    if (e2) throw e2;

    return new Response(JSON.stringify({ ok:true }), { headers:{'Content-Type':'application/json'} });
  }catch(err){
    return new Response(JSON.stringify({ error: err.message }), { status:500 });
  }
};
