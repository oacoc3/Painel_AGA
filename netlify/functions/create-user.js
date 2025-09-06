// netlify/functions/create-user.js
// Serverless Function (Netlify) para criar usuários sem expor Service Role no frontend.
// Requer AUTORIZAÇÃO via header "Authorization: Bearer <access_token>" de um usuário com role "Administrador".
// Fluxo: Admin logado no app chama esta função com { email, name, role }.
// Cria usuário no Auth e respectivo registro em 'profiles'.
// NÃO expõe a Service Role no frontend.
const { createClient } = require('@supabase/supabase-js');

const json = (statusCode, data) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(data),
});

const getBearer = (headers = {}) => {
  const h = headers.authorization || headers.Authorization || '';
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
};

exports.handler = async (event) => {
  // CORS simples (não estritamente necessário para same-origin; seguro manter).
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' });
  }

  try {
    // 1) Autentica quem está chamando (precisa ser Administrador)
    const token = getBearer(event.headers);
    if (!token) return json(401, { ok: false, error: 'Missing Authorization Bearer token' });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userFromToken, error: tokenErr } = await admin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user) {
      return json(401, { ok: false, error: 'Invalid or expired token' });
    }

    const caller = userFromToken.user;
    const callerRole = caller.user_metadata && caller.user_metadata.role;
    if (callerRole !== 'Administrador') {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    // 2) Entrada
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); }
    catch {
      return json(400, { ok: false, error: 'Invalid JSON body' });
    }
    const { email, name, role } = payload;
    if (!email || !name || !role) {
      return json(400, { ok: false, error: 'Missing fields: email, name, role' });
    }

    // 3) Cria usuário no Auth (sem senha; login por magic link)
    const { data: created, error: errCreate } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {}, // opcional
      user_metadata: { name, role },
    });
    if (errCreate) return json(400, { ok: false, error: errCreate.message || String(errCreate) });

    const uid = created?.user?.id;
    if (!uid) return json(500, { ok: false, error: 'User created but no id returned' });

    // 4) Insere no profiles
    const { error: errProfile } = await admin.from('profiles').insert({
