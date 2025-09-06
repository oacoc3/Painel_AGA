// netlify/functions/create-user.js
// Serverless Function (Netlify) para criar usuários sem expor Service Role no frontend.
// Autoriza se o chamador for Administrador no JWT (user_metadata.role)
// OU no banco (profiles.role). Mantém CORS e respostas sempre em JSON.

const { createClient } = require('@supabase/supabase-js');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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
    return json(500, { ok: false, error: 'Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE)' });
  }

  // Corpo
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
    // Client com Service Role
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Autenticação do chamador
    const token = getBearer(event.headers);
    if (!token) return json(401, { ok: false, error: 'Missing Authorization Bearer token' });

    const { data: userFromToken, error: tokenErr } = await admin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user) {
      console.error('[create-user] Invalid token:', tokenErr);
      return json(401, { ok: false, error: 'Invalid or expired token' });
    }

    const caller = userFromToken.user;
    const callerId = caller.id;
    const callerRoleJWT = caller?.user_metadata?.role;

    // Autorização: JWT OU profiles
    let isAdmin = (callerRoleJWT === 'Administrador');

    if (!isAdmin && callerId) {
      const { data: prof, error: profErr } = await admin
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .single();
      if (profErr) console.error('[create-user] profiles read error:', profErr);
      if (prof?.role === 'Administrador') isAdmin = true;
    }

    if (!isAdmin) {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    // Criação no Auth (magic link; sem senha)
    const { data: created, error: errCreate } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, role },
      app_metadata: {},
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

    // Registro em profiles
    const { error: errProfile } = await admin.from('profiles').insert({
      id: uid,
      email,
      name,
      role,
      must_change_password: false,
    });
    if (errProfile) {
      console.error('[create-user] insert profiles error:', errProfile);
      return json(400, { ok: false, error: errProfile.message || String(errProfile) });
    }

    return json(200, { ok: true, id: uid });
  } catch (e) {
    console.error('[create-user] Unhandled error:', e);
    const msg = e?.message || String(e);
    return json(500, { ok: false, error: msg });
  }
};
