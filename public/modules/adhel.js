// public/modules/adhel.js
// Módulo AD/HEL (somente leitura/listagem)
// - Não altera visual; injeta <tr> no <tbody id="adhelTableBody"> existente.
// - Tabela: public.adhel_airfields (id, tipo, oaci, ciad, name, municipio, uf [, nup?])
// - Ordena por oaci ASC, depois ciad ASC.
// - API: init(), load(), refresh(), setFilter({ nup, oaci, ciad, name })

window.Modules = window.Modules || {};
window.Modules.adhel = (() => {
  const STATE = {
    isLoading: false,
    data: [],
    filters: { nup: '', oaci: '', ciad: '', name: '' },
    page: 1,
    pageSize: 50
  };

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
    const sb =
      (typeof window.sb !== 'undefined' ? window.sb : null) ||
      (typeof window.supabaseClient !== 'undefined' ? window.supabaseClient : null) ||
      (window.supabase && window.supabase._client) || null;

    if (!sb || typeof sb.from !== 'function') {
      console.warn('[AD/HEL] Cliente Supabase não encontrado. Verifique supabaseClient.js.');
      return null;
    }
    return sb;
  }

  function getEl(id) { return document.getElementById(id); }
  function textOrDash(v) { return (v === null || v === undefined || v === '') ? '—' : String(v); }
  function includesInsensitive(hay, needle) {
    if (!needle) return true;
    if (hay == null) return false;
    return String(hay).toLowerCase().includes(String(needle).toLowerCase());
  }

  // --------------------------
  // Consulta ao Supabase (com fallback sem 'nup')
  // --------------------------
  async function fetchAllFromDB() {
    const sb = getSupabaseClient();
    if (!sb) return [];

    const selectWithNup = 'id,tipo,oaci,ciad,name,municipio,uf,nup';
    const selectNoNup   = 'id,tipo,oaci,ciad,name,municipio,uf';

    let { data, error } = await sb
      .from('adhel_airfields')
      .select(selectWithNup)
      .order('oaci', { ascending: true, nullsFirst: true })
      .order('ciad', { ascending: true, nullsFirst: true })
      .limit(5000);

    if (error) {
      const msg = String(error?.message || '');
      const code = String(error?.code || '');
      const missingNup =
        code === '42703' && /nup/i.test(msg); // ex.: "column adhel_airfields.nup does not exist"

      if (missingNup) {
        console.info('[AD/HEL] Coluna nup não existe — usando fallback sem nup.');
        const fallback = await sb
          .from('adhel_airfields')
          .select(selectNoNup)
          .order('oaci', { ascending: true, nullsFirst: true })
          .order('ciad', { ascending: true, nullsFirst: true })
          .limit(5000);
        if (fallback.error) {
          console.error('[AD/HEL] Erro no fallback adhel_airfields:', fallback.error);
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
  // Filtro em memória
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
  // Renderização (tbody existente)
  // --------------------------
  function renderTable(rows) {
    const tbody = getEl(SELECTORS.tbodyId);
    if (!tbody) {
      console.warn(`[AD/HEL] <tbody id="${SELECTORS.tbodyId}"> não encontrado.`);
      return;
    }

    const totalRows = Array.isArray(rows) ? rows.length : 0;
    const pageSize = Math.max(1, Number(STATE.pageSize) || 50);
    const pagesTotal = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(Math.max(1, STATE.page || 1), pagesTotal);
    if (safePage !== STATE.page) STATE.page = safePage;
    const start = (STATE.page - 1) * pageSize;
    const visibleRows = rows.slice(start, start + pageSize);

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

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

    const countEl = getEl(SELECTORS.countId);
    if (countEl) countEl.textContent = String(totalRows);

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
    const filtered = applyFilters(STATE.data);
    renderTable(filtered);
  }

  function setFilter({ nup, oaci, ciad, name } = {}) {
    if (typeof nup  !== 'undefined') STATE.filters.nup  = nup  || '';
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
      window.Utils.bindNUPMask(nupInput); // máscara NUP (Número Único de Protocolo)
    }

    const handleSubmit = (e) => {
      if (e) e.preventDefault();
      setFilter({
        nup: getInputValue(FORM_IDS.nup),
        oaci: getInputValue(FORM_IDS.oaci),
        ciad: getInputValue(FORM_IDS.ciad),
        name: getInputValue(FORM_IDS.name)
      });
    };

    form.addEventListener('submit', handleSubmit);
    getEl(FORM_IDS.submit)?.addEventListener('click', handleSubmit);

    getEl(FORM_IDS.clear)?.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      ['nup', 'oaci', 'ciad', 'name'].forEach(key => {
        const input = getEl(FORM_IDS[key]);
        if (input) input.value = '';
      });
      setFilter({ nup: '', oaci: '', ciad: '', name: '' });
    });
  }

  function getInputValue(id) {
    const elInput = getEl(id);
    return elInput ? String(elInput.value || '').trim() : '';
  }

  async function init() {
    bindSearchForm();
    await load();
  }

  return { init, load, refresh, setFilter };
})();
