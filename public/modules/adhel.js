// public/modules/adhel.js
// Módulo AD/HEL (somente leitura/listagem)
// - Não altera visual (cores, layout etc.); apenas injeta <tr> em um <tbody id="adhelTableBody"> já existente.
// - Lê a tabela public.adhel_airfields com os campos: id, tipo, oaci, ciad, name, municipio, uf
// - Ordena por oaci (ASC) e, em seguida, ciad (ASC).
// - Expõe API: init(), load(), refresh(), setFilter({ nup, oaci, ciad, name })

window.Modules = window.Modules || {};
window.Modules.adhel = (() => {
  // --------------------------
  // Configurações e utilitários
  // --------------------------
  const STATE = {
    isLoading: false,
    data: [],
    filters: {
      nup: '',
      oaci: '',
      ciad: '',
      name: ''
    },
    page: 1,
    pageSize: 50
  };

  // Seletores esperados (não criamos elementos novos para não mudar o visual):
  // - Um <tbody id="adhelTableBody"> onde as linhas serão inseridas
  // - (Opcional) Um elemento com id="adhelCount" para mostrarmos a quantidade (se existir)
  // - (Opcional) Um contêiner com id="adhelList" para exibirmos a paginação
  const SELECTORS = {
    tbodyId: 'adhelTableBody',
    countId: 'adhelCount',
    listId: 'adhelList'
  };

  const FORM_IDS = {
    formId: 'adhelSearchForm',
    nup: 'adhelSearchNup',
    oaci: 'adhelSearchOaci',
    ciad: 'adhelSearchCiad',
    name: 'adhelSearchName',
    submit: 'adhelSearchSubmit',
    clear: 'adhelSearchClear'
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
    const baseSelect = 'id,tipo,oaci,ciad,name,municipio,uf,nup';

    // Como o conjunto é pequeno (~centenas), buscamos em uma tacada só com um limite alto.
    // Ordenação oaci ASC, depois ciad ASC.
    let { data, error } = await sb
      .from('adhel_airfields')
      .select(baseSelect)
      .order('oaci', { ascending: true, nullsFirst: true })
      .order('ciad', { ascending: true, nullsFirst: true })
      .limit(5000); // margem

    if (error) {
      const columnMissing = typeof error?.message === 'string' && /column\s+"?nup"?/i.test(error.message);
      if (columnMissing) {
        const fallback = await sb
          .from('adhel_airfields')
          .select('id,tipo,oaci,ciad,name,municipio,uf')
          .order('oaci', { ascending: true, nullsFirst: true })
          .order('ciad', { ascending: true, nullsFirst: true })
          .limit(5000);
        if (fallback.error) {
          console.error('[AD/HEL] Erro ao consultar adhel_airfields (fallback):', fallback.error);
          return [];
        }
        data = fallback.data;
      } else {
        console.error('[AD/HEL] Erro ao consultar adhel_airfields:', error);
        return [];
      }
    }
    return data || [];
  }

  // --------------------------
  // Filtro (em memória, sem alterar UI)
  // --------------------------
  function applyFilters(rows) {
    const { nup, oaci, ciad, name } = STATE.filters;
    return rows.filter(r => {
      if (nup && !includesInsensitive(r.nup, nup)) return false;
      if (oaci && !includesInsensitive(r.oaci, oaci)) return false;
      if (ciad && !includesInsensitive(r.ciad, ciad)) return false;
      if (name && !includesInsensitive(r.name, name)) return false;
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

    const totalRows = Array.isArray(rows) ? rows.length : 0;
    const pageSize = Math.max(1, Number(STATE.pageSize) || 50);
    const pagesTotal = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(Math.max(1, STATE.page || 1), pagesTotal);
    if (safePage !== STATE.page) {
      STATE.page = safePage;
    }
    const start = (STATE.page - 1) * pageSize;
    const visibleRows = rows.slice(start, start + pageSize);

    // Limpa conteúdo atual
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    // Monta as linhas (colunas: NUP, OACI, CIAD, Nome, Município, UF, Tipo)
    const frag = document.createDocumentFragment();
    for (const r of visibleRows) {
      const tr = document.createElement('tr');

      const tdNup = document.createElement('td');
      tdNup.textContent = textOrDash(r.nup);
      tr.appendChild(tdNup);

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
      countEl.textContent = String(totalRows);
    }

    renderPagination({ page: STATE.page, pagesTotal, count: totalRows });
  }

  function renderPagination({ page, pagesTotal, count }) {
    const listBox = getEl(SELECTORS.listId);
    if (!listBox) return;

    let pager = listBox.querySelector('.pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'pager';
      listBox.insertBefore(pager, listBox.firstChild);
    }

    const disablePrev = page <= 1;
    const disableNext = page >= pagesTotal;
    pager.innerHTML = `
      <div class="row" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-bottom:.5rem;">
        <button type="button" id="adhelFirstPage" ${disablePrev ? 'disabled' : ''}>&laquo;</button>
        <button type="button" id="adhelPrevPage" ${disablePrev ? 'disabled' : ''}>&lsaquo;</button>
        <span id="adhelPagerInfo">${page} / ${pagesTotal} (${count} itens)</span>
        <button type="button" id="adhelNextPage" ${disableNext ? 'disabled' : ''}>&rsaquo;</button>
        <button type="button" id="adhelLastPage" ${disableNext ? 'disabled' : ''}>&raquo;</button>
      </div>`;

    pager.querySelector('#adhelFirstPage')?.addEventListener('click', () => setPage(1));
    pager.querySelector('#adhelPrevPage')?.addEventListener('click', () => setPage(page - 1));
    pager.querySelector('#adhelNextPage')?.addEventListener('click', () => setPage(page + 1));
    pager.querySelector('#adhelLastPage')?.addEventListener('click', () => setPage(pagesTotal));
  }

  function setPage(page) {
    const pageSize = Math.max(1, Number(STATE.pageSize) || 50);
    const totalRows = applyFilters(STATE.data).length;
    const pagesTotal = Math.max(1, Math.ceil(totalRows / pageSize));
    const nextPage = Math.min(Math.max(1, page), pagesTotal);
    if (nextPage === STATE.page) return;
    STATE.page = nextPage;
    refresh();
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
      STATE.page = 1;
      refresh();
    } finally {
      STATE.isLoading = false;
    }
  }

  function refresh() {
    // Re-aplica filtros ao dataset já carregado (não reconsulta)
    const filtered = applyFilters(STATE.data);
    renderTable(filtered);
  }

  function setFilter({ nup, oaci, ciad, name } = {}) {
    if (typeof nup !== 'undefined') STATE.filters.nup = nup || '';
    if (typeof oaci !== 'undefined') STATE.filters.oaci = oaci || '';
    if (typeof ciad !== 'undefined') STATE.filters.ciad = ciad || '';
    if (typeof name !== 'undefined') STATE.filters.name = name || '';
    STATE.page = 1;
    refresh();
  }

  function bindSearchForm() {
    const form = getEl(FORM_IDS.formId);
    if (!form) return;

    const nupInput = getEl(FORM_IDS.nup);
    if (nupInput && window.Utils?.bindNUPMask) {
      window.Utils.bindNUPMask(nupInput);
    }

    const handleSubmit = event => {
      if (event) event.preventDefault();
      setFilter({
        nup: getInputValue(FORM_IDS.nup),
        oaci: getInputValue(FORM_IDS.oaci),
        ciad: getInputValue(FORM_IDS.ciad),
        name: getInputValue(FORM_IDS.name)
      });
    };

    form.addEventListener('submit', handleSubmit);
    getEl(FORM_IDS.submit)?.addEventListener('click', handleSubmit);

    getEl(FORM_IDS.clear)?.addEventListener('click', event => {
      if (event) event.preventDefault();
      ['nup', 'oaci', 'ciad', 'name'].forEach(key => {
        const input = getEl(FORM_IDS[key]);
        if (input) input.value = '';
      });
      setFilter({ nup: '', oaci: '', ciad: '', name: '' });
    });
  }

  function getInputValue(id) {
    const elInput = getEl(id);
    if (!elInput) return '';
    return (elInput.value || '').trim();
  }

  async function init() {
    // Não criamos elementos; apenas usamos o que já existe.
    bindSearchForm();
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
