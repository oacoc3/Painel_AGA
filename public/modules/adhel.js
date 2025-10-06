<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="/" />
  <title>Painel DO-AGA</title>
  <link rel="stylesheet" href="./styles.css" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" />
  <!-- App config -->
  <script src="./config.js" defer></script>
  <!-- Supabase library -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js" defer></script>
  <!-- Inicialização do cliente Supabase -->
  <script src="./supabaseClient.js" defer></script>
  <!-- Sessão pronta antes de inicializar a página -->
  <script src="./auth-ready.js" defer></script>
  <script src="./utils.js" defer></script>
  <!-- Guardas de segurança: não alteram visual -->
  <script src="./safety-guards.js" defer></script>
  <script src="./mpa.js" defer></script>
  <script src="./modules/adhel.js" defer></script>
</head>
<body data-route="adhel">
  <div id="app" class="vh">
    <header class="bar">
      <div class="brand">
        <span class="logo">■</span>
        <strong>Painel DO-AGA</strong>
        <small class="build" id="buildInfo">build: carregando…</small>
      </div>
      <nav id="topNav" class="nav hidden">
        <button data-route="dashboard">Início</button>
        <button data-route="processos">Processos</button>
        <button data-route="prazos">Prazos</button>
        <button data-route="modelos">Modelos</button>
        <button data-route="analise">Checklists</button>
        <button data-route="adhel" class="active">AD/HEL</button>
        <button data-route="pessoal">Pessoal</button>
        <button data-route="admin" id="btnAdmin" class="hidden">Administração</button>
      </nav>
      <div id="userBox" class="user hidden">
        <span id="userName"></span>
        <small id="userRole" class="muted"></small>
        <button id="btnLogout" class="danger" type="button">Sair</button>
      </div>
    </header>

    <main class="main">
      <section id="viewAdhel" class="view">
        <div class="columns">
          <div class="card">
            <h2>AD/HEL <small class="muted">(registros: <span id="adhelCount">0</span>)</small></h2>

            <!-- Tabela de listagem: o módulo adhel.js apenas preenche o tbody abaixo -->
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OACI</th>
                    <th>CIAD</th>
                    <th>Nome</th>
                    <th>Município</th>
                    <th>UF</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody id="adhelTableBody">
                  <!-- Linhas injetadas por Modules.adhel -->
                </tbody>
              </table>
            </div>

            <!-- Observação: nenhum estilo foi alterado; apenas adicionamos a estrutura mínima da tabela. -->
          </div>
        </div>
      </section>
    </main>

    <footer class="bar foot">
      <span>Retro-UI</span>
      <span>© DO-AGA</span>
      <span id="footBuild"></span>
    </footer>
  </div>

  <!-- Preenche build no cabeçalho e rodapé -->
  <script defer src="./build-info-client.js"></script>

  <!-- Inicialização do módulo (sem alterar visual) -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      if (window?.Modules?.adhel?.init) {
        window.Modules.adhel.init();
      }
    });
  </script>
</body>
</html>
