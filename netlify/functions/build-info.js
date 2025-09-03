// Retorna informações de build para exibir no rodapé/cabeçalho.
// Agora inclui "version", calculada automaticamente:
// - COMMIT_REF (7 chars) quando o deploy vem do Git
// - se não houver, usa o DEPLOY_ID (8 chars)
// - fallback: "local"
exports.handler = async () => {
  const { COMMIT_REF, REVIEW_ID, BRANCH, CONTEXT, SITE_NAME, DEPLOY_ID } = process.env;
  const builtAt = new Date().toISOString();
  const version =
    (COMMIT_REF && COMMIT_REF.slice(0, 7)) ||
    (DEPLOY_ID && DEPLOY_ID.slice(0, 8)) ||
    'local';

  return {
    statusCode: 200,
    body: JSON.stringify({
      version,
      commit: COMMIT_REF || 'local',
      branch: BRANCH || 'local',
      context: CONTEXT || 'dev',
      site: SITE_NAME || 'local',
      builtAt
    })
  };
};
