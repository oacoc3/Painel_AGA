export default async () => {
  const time = new Date().toISOString();
  // Netlify disponibiliza COMMIT_REF e DEPLOY_ID
  const commit = process.env.COMMIT_REF || '';
  const deploy = process.env.DEPLOY_ID || '';
  return new Response(JSON.stringify({ time, commit, deploy }), { headers: { 'Content-Type':'application/json' } });
};
