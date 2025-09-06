// netlify/functions/create-user.js
// Serverless Function (Netlify) para criar usuários sem expor Service Role no frontend.
// Requer AUTORIZAÇÃO via header "Authorization: Bearer <access_token>" de um usuário com role "Administrador".
// Fluxo: Admin logado no app chama esta função com { email, name, role }.
// Cria usuário no Auth e respectivo registro em 'profiles'.

const { createClient } = require('@supabase/supabase-js');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',              // mesmo domínio não precisa, mas ajuda em testes
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(statusCode, data) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearer(headers = {}) {
  try {
    const h = headers.authorization || headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec((h || '').trim());
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  // Pré-flight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    // Importante manter 500 mas *textualmente* claro para o cliente/admin
    return json(500, { ok: false, error: 'Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE)' });
  }

  // Parse do corpo
  let payload = null;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    console.error('[create-user] Invalid JSON body:', e);
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const { email, name, role } = payload || {};
  if (!email || !name || !role) {
    return json(400, { ok: false, error: 'Missing fields: email, name, role' });
  }

  try {
    // Service Role client
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Autentica quem está chamando (precisa ser Administrador)
    const token = getBearer(event.headers);
    if (!token) return json(401, { ok: false, error: 'Missing Authorization Bearer token' });

    const { data: userFromToken, error: tokenErr } = await admin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user) {
      console.error('[create-user] Invalid token:', tokenErr);
      return json(401, { ok: false, error: 'Invalid or expired token' });
    }

    const callerRole = userFromToken.user?.user_metadata?.role;
    if (callerRole !== 'Administrador') {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    // 2) Cria usuário no Auth (sem senha; login por magic link)
    const { data: created, error: errCreate } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, role },
      app_metadata: {}, // opcional
    });
    if (errCreate) {
      console.error('[create-user] admin.createUser error:', errCreate);
      return json(400, { ok: false, error: errCreate.message || String(errCreate) });
    }

    const uid = created?.user?.id;
    if (!uid) {
      console.error('[create-user] No UID returned:', created);
      return json(500, { ok: false, error: 'User created but no id returned' });
    }

    // 3) Insere no profiles
    const { error: errProfile } = await admin.from('profiles').insert({
      id: uid,
      email,
      name,
      role,
      must_change_password: false, // ajuste conforme sua regra
    });
    if (errProfile) {
      console.error('[create-user] insert profiles error:', errProfile);
      return json(400, { ok: false, error: errProfile.message || String(errProfile) });
    }

    return json(200, { ok: true, id: uid });
  } catch (e) {
    // Qualquer erro não tratado acima cai aqui, SEM página HTML
    console.error('[create-user] Unhandled error:', e);
    const msg = e?.message || String(e);
    return json(500, { ok: false, error: msg });
  }
};
