// netlify/functions/build-info.js
// Exponibiliza metadados do build/deploy (Netlify) para o frontend.
// Não requer autenticação: apenas leitura de variáveis de ambiente do deploy.
// Saída: { ok, commit, commit_short, branch, deploy_id, context, repo, deployed_at, version }
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  try {
    const commit = process.env.COMMIT_REF || null;
    const commit_short = commit ? commit.substring(0, 7) : null;
    const deploy_id = process.env.DEPLOY_ID || null;
    const branch = process.env.BRANCH || process.env.HEAD || null;
    const context = process.env.CONTEXT || (process.env.NETLIFY ? 'netlify' : null);
    const repo = process.env.REPOSITORY_URL || null;
    const version = process.env.APP_VERSION || null; // opcional (se você quiser setar)
    const deployed_at = new Date().toISOString();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: true,
        commit,
        commit_short,
        branch,
        deploy_id,
        context,
        repo,
        deployed_at,
        version,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) }),
    };
  }
};
