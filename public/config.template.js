// public/config.template.js
// Template sem segredos: valores reais são injetados no deploy.
window.APP_CONFIG = {
  ENVIRONMENT: "__APP_ENV__",                 // "staging" | "production" | "dev"
  SUPABASE_URL: "__SUPABASE_URL__",          // ex.: https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__",// anon é pública por design
  NETLIFY_FUNCTIONS_BASE: "/.netlify/functions",
  // Versão manual do app (pode ser substituída por variável também)
  VERSION: "__APP_VERSION__"
};
