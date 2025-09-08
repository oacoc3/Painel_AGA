// netlify/functions/delete-user.js
// Remove usuário de auth e profile usando Service Role.
// Requer AUTORIZAÇÃO via header "Authorization: Bearer <access_token>"
// Aceita Administrador via JWT (user_metadata.role) OU via banco (profiles.role).
const { createClient } = require('@supabase/supabase-js');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

const json = (statusCode, data) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(data),
});

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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
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
    const callerId = caller.id;
    const callerRoleJWT = caller?.user_metadata?.role;

    let isAdmin = (callerRoleJWT === 'Administrador');
    if (!isAdmin && callerId) {
      const { data: prof, error: profErr } = await admin
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .single();
      if (!profErr && prof?.role === 'Administrador') isAdmin = true;
    }

    if (!isAdmin) {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    // 2) Entrada
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); }
    catch { return json(400, { ok: false, error: 'Invalid JSON body' }); }
    const { id } = payload;
    if (!id) return json(400, { ok: false, error: 'Missing id' });

    if (id === callerId) {
      return json(400, { ok: false, error: 'Você não pode excluir a si mesmo.' });
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
