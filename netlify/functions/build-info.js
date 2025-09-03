// Retorna informações de build para exibir no rodapé (commit, data).
exports.handler = async () => {
  const { COMMIT_REF, REVIEW_ID, BRANCH, CONTEXT, SITE_NAME } = process.env;
  const builtAt = new Date().toISOString();
  return {
    statusCode: 200,
    body: JSON.stringify({
      commit: COMMIT_REF || 'local',
      branch: BRANCH || 'local',
      context: CONTEXT || 'dev',
      site: SITE_NAME || 'local',
      builtAt
    })
  };
};
