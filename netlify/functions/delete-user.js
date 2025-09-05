// netlify/functions/delete-user.js
// Remove usuário de auth e profile usando Service Role.
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
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const payload = JSON.parse(event.body || '{}');
    const { id } = payload;
    if (!id) {
      return { statusCode: 400, body: 'Missing user id' };
    }
    const { error: errAuth } = await admin.auth.admin.deleteUser(id);
    if (errAuth) throw errAuth;
    const { error: errProfile } = await admin.from('profiles').delete().eq('id', id);
    if (errProfile) throw errProfile;
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
  }
};
