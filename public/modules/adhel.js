// public/modules/adhel.js
// Módulo AD/HEL (somente leitura/listagem)
// - Não altera visual (cores, layout etc.); apenas injeta <tr> em um <tbody id="adhelTableBody"> já existente.
// - Lê a tabela public.adhel_airfields com os campos: id, tipo, oaci, ciad, name, municipio, uf
// - Ordena por oaci (ASC) e, em seguida, ciad (ASC).
// - Expõe API: init(), load(), refresh(), setFilter({ search, uf, tipo })

window.Modules = window.Modules || {};
window.Modules.adhel = (() => {
  // --------------------------
  // Configurações e utilitários
  // --------------------------
  const STATE = {
    isLoading: false,
    data: [],
    filters: {
      search: '',   // busca por OACI, CIAD, Nome ou Município (contém)
      uf: '',       // filtro exato por UF (2 letras)
      tipo: ''      // filtro exato por tipo (por ex.: "Aeródromo", "Heliponto")
    }
  };

  // Seletores esperados (não criamos elementos novos para não mudar o visual):
  // - Um <tbody id="adhelTableBody"> onde as linhas serão inseridas
  // - (Opcional) Um elemento com id="adhelCount" para mostramos a quantidade (se existir)
  const SELECTORS = {
    tbodyId: 'adhelTableBody',
    countId: 'adhelCount'
  };

  function getSupabaseClient() {
    // Procuramos o cliente conforme seu projeto (supabaseClient.js)
    // Sem criar nada novo; se não achar, avisamos claramente e abortamos o carregamento.
    const sb =
      // projetos anteriores costumam expor window.sb
      (typeof window.sb !== 'undefined' ? window.sb : null)
      // em alguns casos, guardam em window.supabaseClient
      || (typeof window.supabaseClient !== 'undefined' ? window.supabaseClient : null)
      // fallback inseguro: se alguém exportou client como window.supabaseClient?.sb
      || (window.supabase && window.supabase._client) || null;

    if (!sb || typeof sb.from !== 'function') {
      console.warn('[AD/HEL] Cliente Supabase não encontrado. Verifique se supabaseClient.js expõe window.sb.');
      return null;
    }
    return sb;
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function textOrDash(v) {
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  function includesInsensitive(hay, needle) {
    if (!needle) return true;
    if (hay == null) return false;
    return String(hay).toLowerCase().includes(String(needle).toLowerCase());
  }

  // --------------------------
  // Consulta ao Supabase
  // --------------------------
  async function fetchAllFromDB() {
    const sb = getSupabaseClient();
    if (!sb) return [];

    // SELECT padrão (sem alterar visual, apenas dados)
    const baseSelect = 'id,tipo,oaci,ciad,name,municipio,uf';

    // Como o conjunto é pequeno (~centenas), buscamos em uma tacada só com um limite alto.
    // Ordenação oaci ASC, depois ciad ASC.
    const { data, error } = await sb
      .from('adhel_airfields')
      .select(baseSelect)
      .order('oaci', { ascending: true, nullsFirst: true })
      .order('ciad', { ascending: true, nullsFirst: true })
      .limit(5000); // margem

    if (error) {
      console.error('[AD/HEL] Erro ao consultar adhel_airfields:', error);
      return [];
    }
    return data || [];
  }

  // --------------------------
  // Filtro (em memória, sem alterar UI)
  // --------------------------
  function applyFilters(rows) {
    const { search, uf, tipo } = STATE.filters;
    return rows.filter(r => {
      // UF e Tipo: filtros exatos se fornecidos
      if (uf && String(r.uf || '').toUpperCase() !== String(uf).toUpperCase()) return false;
      if (tipo && String(r.tipo || '') !== String(tipo)) return false;

      // Busca livre: em OACI, CIAD, Nome e Município (contém, case-insensitive)
      if (search) {
        const ok =
          includesInsensitive(r.oaci, search) ||
          includesInsensitive(r.ciad, search) ||
          includesInsensitive(r.name, search) ||
          includesInsensitive(r.municipio, search);
        if (!ok) return false;
      }
      return true;
    });
  }

  // --------------------------
  // Renderização (apenas TR/TD no tbody existente)
  // --------------------------
  function renderTable(rows) {
    const tbody = getEl(SELECTORS.tbodyId);
    if (!tbody) {
      // Não criamos nada novo para não alterar visual.
      console.warn(`[AD/HEL] <tbody id="${SELECTORS.tbodyId}"> não encontrado. O módulo não alterará o layout.`);
      return;
    }

    // Limpa conteúdo atual
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    // Monta as linhas (colunas: OACI, CIAD, Nome, Município, UF, Tipo)
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');

      const tdOaci = document.createElement('td');
      tdOaci.textContent = textOrDash(r.oaci);
      tr.appendChild(tdOaci);

      const tdCiad = document.createElement('td');
      tdCiad.textContent = textOrDash(r.ciad);
      tr.appendChild(tdCiad);

      const tdName = document.createElement('td');
      tdName.textContent = textOrDash(r.name);
      tr.appendChild(tdName);

      const tdMunicipio = document.createElement('td');
      tdMunicipio.textContent = textOrDash(r.municipio);
      tr.appendChild(tdMunicipio);

      const tdUf = document.createElement('td');
      tdUf.textContent = textOrDash(r.uf);
      tr.appendChild(tdUf);

      const tdTipo = document.createElement('td');
      tdTipo.textContent = textOrDash(r.tipo);
      tr.appendChild(tdTipo);

      frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    // (Opcional) contador, se existir
    const countEl = getEl(SELECTORS.countId);
    if (countEl) {
      countEl.textContent = String(rows.length);
    }
  }

  // --------------------------
  // Fluxo público
  // --------------------------
  async function load() {
    if (STATE.isLoading) return;
    STATE.isLoading = true;
    try {
      const all = await fetchAllFromDB();
      STATE.data = Array.isArray(all) ? all : [];
      const filtered = applyFilters(STATE.data);
      renderTable(filtered);
    } finally {
      STATE.isLoading = false;
    }
  }

  function refresh() {
    // Re-aplica filtros ao dataset já carregado (não reconsulta)
    const filtered = applyFilters(STATE.data);
    renderTable(filtered);
  }

  function setFilter({ search, uf, tipo } = {}) {
    if (typeof search !== 'undefined') STATE.filters.search = search || '';
    if (typeof uf !== 'undefined') STATE.filters.uf = uf || '';
    if (typeof tipo !== 'undefined') STATE.filters.tipo = tipo || '';
    refresh();
  }

  async function init() {
    // Não criamos elementos; apenas usamos o que já existe.
    await load();
  }

  // API pública
  return {
    init,
    load,
    refresh,
    setFilter
  };
})();
