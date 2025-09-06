// netlify/functions/delete-user.js
// Remove usuário de auth e profile usando Service Role.
// Requer AUTORIZAÇÃO via header "Authorization: Bearer <access_token>" de um usuário com role "Administrador".
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
    const callerRole = userFromToken.user?.user_metadata?.role;
    if (callerRole !== 'Administrador') {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    // 2) Entrada
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); }
    catch { return json(400, { ok: false, error: 'Invalid JSON body' }); }

    const { id } = payload;
    if (!id) {
      return json(400, { ok: false, error: 'Missing user id' });
    }

    // 3) Apaga do Auth
    const { error: errAuth } = await admin.auth.admin.deleteUser(id);
    if (errAuth) return json(400, { ok: false, error: errAuth.message || String(errAuth) });

    // 4) Apaga do profiles
    const { error: errProfile } = await admin.from('profiles').delete().eq('id', id);
    if (errProfile) return json(400, { ok: false, error: errProfile.message || String(errProfile) });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};
