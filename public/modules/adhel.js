// public/modules/adhel.js
// Módulo AD/HEL (somente leitura/listagem)
// - Não altera visual; injeta <tr> no <tbody id="adhelTableBody"> existente.
// - Tabela: public.adhel_airfields (id, tipo, oaci, ciad, name, municipio, uf).
// - Ordena por oaci ASC, depois ciad ASC.
// - Coluna "NUP": botão "Ver" que abre popup com NUPs associados ao item.
//   Em cada NUP do popup há um botão "Ver na lista de processos" que executa
//   a MESMA ação usada no módulo Prazos (sessionStorage.procPreSelect + redirect).
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
  // Consulta ao Supabase (sem nup, que não existe no schema atual)
  // --------------------------
  async function fetchAllFromDB() {
    const sb = getSupabaseClient();
    if (!sb) return [];

    const baseSelect = 'id,tipo,oaci,ciad,name,municipio,uf';

    const { data, error } = await sb
      .from('adhel_airfields')
      .select(baseSelect)
      .order('oaci', { ascending: true, nullsFirst: true })
      .order('ciad', { ascending: true, nullsFirst: true })
      .limit(5000);

    if (error) {
      console.error('[AD/HEL] Erro ao consultar adhel_airfields:', error);
      return [];
    }
    return data || [];
  }

  // --------------------------
  // Fonte dos NUPs associados (definível no futuro)
  // Tenta: RPC 'adhel_list_nups(p_airfield_id uuid|bigint)' -> [{nup}]
  //        Tabela 'adhel_nups' (colunas: airfield_id -> id de adhel_airfields, nup text)
  // Se nada existir, retorna [].
  // --------------------------
  async function fetchNupsForAirfield(airfieldId) {
    const sb = getSupabaseClient();
    if (!sb || !airfieldId) return [];
    // 1) RPC
    try {
      const { data, error } = await sb.rpc('adhel_list_nups', { p_airfield_id: airfieldId });
      if (!error && Array.isArray(data)) {
        return data
          .map(r => String(r.nup || '').trim())
          .filter(Boolean);
      }
    } catch (_) { /* ignore */ }

    // 2) Tabela adhel_nups
    try {
      const { data, error } = await sb
        .from('adhel_nups')
        .select('nup')
        .eq('airfield_id', airfieldId)
        .order('nup', { ascending: true });
      if (!error && Array.isArray(data)) {
        return data
          .map(r => String(r.nup || '').trim())
          .filter(Boolean);
      }
    } catch (_) { /* ignore */ }

    return [];
  }

  // --------------------------
  // Filtro em memória
  // Obs.: o filtro por NUP só funciona se o item tiver _nups carregados.
  // Enquanto a associação não existir, o filtro de NUP não elimina linhas.
  // --------------------------
  function applyFilters(rows) {
    const { nup, oaci, ciad, name } = STATE.filters;
    return rows.filter(r => {
      if (oaci && !includesInsensitive(r.oaci, oaci)) return false;
      if (ciad && !includesInsensitive(r.ciad, ciad)) return false;
      if (name && !includesInsensitive(r.name, name)) return false;

      if (nup) {
        const list = Array.isArray(r._nups) ? r._nups : (r.nup ? [r.nup] : null);
        if (list) {
          const hit = list.some(n => includesInsensitive(n, nup));
          if (!hit) return false;
        }
        // Se não houver associação ainda, não filtra fora.
      }
      return true;
    });
  }

  // --------------------------
  // Ação "Ver na lista de processos" (mesma do módulo Prazos)
  // --------------------------
  function goToProcessListWithNUP(nup) {
    if (!nup) return;
    try {
      sessionStorage.setItem('procPreSelect', nup);
    } catch (_) {}
    window.location.href = 'processos.html';
  }

  // --------------------------
  // Popup de NUPs associados
  // --------------------------
  function openNupPopup(item, nups) {
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-popup'; // reutiliza estilo existente, sem mudar visual global
    const itemsHtml = (nups && nups.length)
      ? nups.map(n => `
          <li style="display:flex;gap:.5rem;align-items:center;justify-content:space-between;">
            <code>${n}</code>
            <button type="button" data-nup="${n}">Ver na lista de processos</button>
          </li>`).join('')
      : `<li class="muted">Nenhum NUP associado.</li>`;

    dlg.innerHTML = `
      <form method="dialog">
        <h3>NUP associados</h3>
        <div class="muted" style="margin-bottom:.5rem;">
          ${textOrDash(item.oaci)} — ${textOrDash(item.ciad)} — ${textOrDash(item.name)}
        </div>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:.5rem;">${itemsHtml}</ul>
        <menu>
          <button value="cancel" formnovalidate>Fechar</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);

    dlg.addEventListener('click', ev => {
      const btn = ev.target && ev.target.closest('button[data-nup]');
      if (btn) {
        ev.preventDefault();
        const v = btn.getAttribute('data-nup');
        dlg.close();
        goToProcessListWithNUP(v);
      }
    });

    dlg.addEventListener('close', () => dlg.remove());
    try { dlg.showModal(); } catch { dlg.show(); }
  }

  async function handleViewNupsClick(item) {
    // Cache simples por item para evitar consultas repetidas
    if (!Array.isArray(item._nups)) {
      item._nups = await fetchNupsForAirfield(item.id);
    }
    openNupPopup(item, item._nups);
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

      // Coluna NUP -> botão "Ver"
      const tdNup = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver';
      btn.addEventListener('click', () => handleViewNupsClick(r));
      tdNup.appendChild(btn);
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
      window.Utils.bindNUPMask(nupInput);
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
