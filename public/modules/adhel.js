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
    listId: 'adhelList',
    dialogId: 'adhelNupDialog',
    dialogListId: 'adhelNupDialogList',
    dialogTitleId: 'adhelNupDialogTitle',
    dialogMsgId: 'adhelNupDialogMsg'
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

  // --------------------------
  // Utilidades
  // --------------------------
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
  function normalizeNup(n) {
    const s = String(n || '').trim();
    // Se houver utilitário do app, use; caso contrário, devolve s.
    try { return window.Utils?.normalizeNUP ? window.Utils.normalizeNUP(s) : s; } catch { return s; }
  }

  // --------------------------
  // Infra do popup (não altera visual global)
  // --------------------------
  function ensureDialog() {
    let dlg = getEl(SELECTORS.dialogId);
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = SELECTORS.dialogId;
    // Estrutura simples, sem estilos novos (herda CSS global)
    dlg.innerHTML = `
      <form method="dialog" style="max-width: 720px; width: 90vw;">
        <header style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.75rem;">
          <h3 id="${SELECTORS.dialogTitleId}" style="margin:0;font-size:1rem;">NUPs associados</h3>
          <button type="submit" aria-label="Fechar">Fechar</button>
        </header>
        <div id="${SELECTORS.dialogMsgId}" class="muted" style="margin-bottom:.5rem;"></div>
        <div id="${SELECTORS.dialogListId}" role="list"></div>
      </form>
    `;
    document.body.appendChild(dlg);
    // Garantir botões type=button dentro do dialog (caso haja algum botão injetado futuramente)
    try { window.SafetyGuards?.fixButtonTypes?.(dlg); } catch {}
    return dlg;
  }

  function setDialogMsg(msg, isError = false) {
    const el = getEl(SELECTORS.dialogMsgId);
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? 'var(--warn)' : '';
  }

  function renderDialogList(airfieldRow, nups) {
    const list = getEl(SELECTORS.dialogListId);
    if (!list) return;
    list.innerHTML = '';

    if (!Array.isArray(nups) || !nups.length) {
      setDialogMsg('Nenhum NUP associado a este item.', true);
      return;
    }

    const frag = document.createDocumentFragment();
    nups.forEach((raw, idx) => {
      const nup = normalizeNup(raw);
      if (!nup) return;

      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '.5rem';
      row.style.borderTop = '1px solid var(--line)';
      row.style.padding = '.5rem 0';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';
      left.innerHTML = `
        <strong>${nup}</strong>
        <small class="muted">
          ${textOrDash(airfieldRow.oaci)} · ${textOrDash(airfieldRow.ciad)} · ${textOrDash(airfieldRow.name)}
        </small>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver na lista de processos';
      btn.addEventListener('click', () => {
        tryOpenProcessListByNUP(nup);
      });

      row.appendChild(left);
      row.appendChild(btn);
      frag.appendChild(row);
    });

    list.appendChild(frag);
    setDialogMsg(`${nups.length} NUP(s) associado(s).`, false);
  }

  function openNupDialog(airfieldRow, nups) {
    const dlg = ensureDialog();
    const title = getEl(SELECTORS.dialogTitleId);
    if (title) {
      title.textContent = `NUPs associados — ${textOrDash(airfieldRow.oaci)} ${textOrDash(airfieldRow.ciad)} ${textOrDash(airfieldRow.name)}`;
    }
    renderDialogList(airfieldRow, nups || []);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  }

  // Tenta reproduzir a mesma ação do módulo Prazos (sem alterar visual)
  function tryOpenProcessListByNUP(nup) {
    const s = String(nup || '').trim();
    if (!s) return;

    // 1) Funções óbvias (módulo Prazos)
    if (window.Modules?.prazos?.openProcessByNUP) {
      try { window.Modules.prazos.openProcessByNUP(s); return; } catch {}
    }
    if (window.Modules?.prazos?.openProcessListByNUP) {
      try { window.Modules.prazos.openProcessListByNUP(s); return; } catch {}
    }

    // 2) Outros módulos comuns
    if (window.Modules?.processos?.openByNUP) {
      try { window.Modules.processos.openByNUP(s); return; } catch {}
    }
    if (window.Modules?.processos?.filterByNUP) {
      try { window.Modules.processos.filterByNUP(s); return; } catch {}
    }

    // 3) Evento global para quem escuta (ex.: prazos.js pode lidar)
    try {
      const ev = new CustomEvent('openProcessByNUP', { detail: { nup: s } });
      window.dispatchEvent(ev);
      return;
    } catch {}

    // 4) Fallback suave: se existir página de prazos, podemos passar querystring
    // (não muda layout; apenas permite que a página de prazos, se aberta,
    // leia o parâmetro e aplique o mesmo filtro/ação que já existe por lá).
    try {
      const url = new URL(window.location.href);
      url.pathname = '/prazos.html';
      url.searchParams.set('nup', s);
      window.location.assign(url.toString());
    } catch (err) {
      console.warn('[AD/HEL] Falha no fallback de navegação para prazos:', err);
    }
  }

  // Busca NUPs associados para um aeródromo/heliponto de forma resiliente:
  // - 1ª tentativa: RPC: rpc_adhel_list_nups(airfield_id uuid)
  // - 2ª tentativa: Tabela adhel_airfield_nups (airfield_id, nup)
  // - 3ª tentativa: Coluna "nup" do próprio registro (string única ou lista "nup1, nup2")
  async function resolveNupsForAirfield(row) {
    const sb = getSupabaseClient();
    if (!sb) return [];

    // 1) RPC
    try {
      if (typeof sb.rpc === 'function') {
        const { data, error } = await sb.rpc('rpc_adhel_list_nups', { airfield_id: row.id });
        if (!error && Array.isArray(data)) {
          // data pode vir como [{nup: 'xxx'}, ...] ou ['xxx', ...]
          const list = data.map(item => (item && item.nup != null ? item.nup : item)).filter(Boolean);
          if (list.length) return list;
        }
      }
    } catch (err) {
      console.info('[AD/HEL] RPC rpc_adhel_list_nups indisponível ou falhou:', err);
    }

    // 2) Tabela relacional
    try {
      const { data, error } = await sb
        .from('adhel_airfield_nups')
        .select('nup')
        .eq('airfield_id', row.id)
        .limit(100);
      if (!error && Array.isArray(data) && data.length) {
        return data.map(x => x.nup).filter(Boolean);
      }
    } catch (err) {
      console.info('[AD/HEL] Tabela adhel_airfield_nups indisponível:', err);
    }

    // 3) Coluna local "nup" (string única ou lista separada por vírgula/; ou quebra de linha)
    const raw = row?.nup;
    if (raw == null || raw === '') return [];
    const parts = String(raw)
      .split(/[\n;,]+/g)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : (raw ? [raw] : []);
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
      const missingNup = code === '42703' && /nup/i.test(msg);

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

      // Coluna NUP: botão "Ver" abre popup com NUPs associados
      const tdNup = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver';
      btn.title = 'Ver NUPs associados';
      btn.addEventListener('click', async () => {
        setDialogMsg('Carregando NUPs...');
        const nups = await resolveNupsForAirfield(r);
        openNupDialog(r, nups);
      });
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
    ensureDialog();
    await load();
  }

  return { init, load, refresh, setFilter };
})();
