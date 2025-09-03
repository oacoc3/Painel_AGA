import { createClient } from '@supabase/supabase-js';

export default async (req) => {
  // Opcional: reset administrativo de senha
  if (req.method !== 'POST') return new Response(JSON.stringify({ error:'Method not allowed' }), { status:405 });
  const { email, newPassword } = await req.json();
  if (!email || !newPassword) return new Response(JSON.stringify({ error:'Dados incompletos' }), { status:400 });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try{
    const { data: users, error: e1 } = await admin.auth.admin.listUsers();
    if (e1) throw e1;
    const u = users.users.find(u => u.email === email);
    if (!u) return new Response(JSON.stringify({ error:'Usuário não encontrado' }), { status:404 });

    const { error: e2 } = await admin.auth.admin.updateUserById(u.id, { password: newPassword });
    if (e2) throw e2;

    await admin.from('profiles').update({ must_change_password: true }).eq('id', u.id);
    return new Response(JSON.stringify({ ok:true }), { headers:{'Content-Type':'application/json'} });
  }catch(err){ return new Response(JSON.stringify({ error: err.message }), { status:500 }); }
};
