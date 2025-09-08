// netlify/functions/update-user.js
// Atualiza dados de um usuário existente (nome, e-mail e perfil).
// Exige token de Administrador.

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

  let payload = null;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    console.error('[update-user] Invalid JSON body:', e);
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const { id, email, name, role } = payload || {};
  if (!id || !email || !name || !role) {
    return json(400, { ok: false, error: 'Missing fields: id, email, name, role' });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = getBearer(event.headers);
    if (!token) return json(401, { ok: false, error: 'Missing Authorization Bearer token' });

    const { data: userFromToken, error: tokenErr } = await admin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user) {
      console.error('[update-user] Invalid token:', tokenErr);
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
      if (profErr) console.error('[update-user] profiles read error:', profErr);
      if (prof?.role === 'Administrador') isAdmin = true;
    }
    if (!isAdmin) {
      return json(403, { ok: false, error: 'Forbidden: requires Administrador' });
    }

    const { error: errUpdAuth } = await admin.auth.admin.updateUserById(id, {
      email,
      user_metadata: { name, role },
    });
    if (errUpdAuth) {
      console.error('[update-user] admin.updateUserById error:', errUpdAuth);
      return json(400, { ok: false, error: errUpdAuth.message || String(errUpdAuth) });
    }

    const { error: errProfile } = await admin
      .from('profiles')
      .update({ email, name, role })
      .eq('id', id);
    if (errProfile) {
      console.error('[update-user] update profiles error:', errProfile);
      return json(400, { ok: false, error: errProfile.message || String(errProfile) });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error('[update-user] Unhandled error:', e);
    const msg = e?.message || String(e);
    return json(500, { ok: false, error: msg });
  }
};
