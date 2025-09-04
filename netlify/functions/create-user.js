// netlify/functions/create-user.js
// Serverless Function (Netlify) para criar usuários sem expor Service Role no frontend.
// Fluxo: Admin logado no app chama esta função com {email, name, role}.
// Cria auth user e profile para login via magic link.
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing Supabase env vars' };
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const payload = JSON.parse(event.body || '{}');
    const { email, name, role } = payload;
    if (!email || !name || !role) {
      return { statusCode: 400, body: 'Missing fields' };
    }

    // Cria usuário no Auth
    const password = Math.random().toString(36).slice(-12);
    const { data: created, error: errCreate } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });
    if (errCreate) throw errCreate;

    const uid = created.user.id;

    // Cria profile
    const { error: errProfile } = await admin.from('profiles').insert({
      id: uid,
      email,
      name,
      role,
      must_change_password: false
    });
    if (errProfile) throw errProfile;

    return { statusCode: 200, body: JSON.stringify({ ok: true, user_id: uid }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
  }
};
