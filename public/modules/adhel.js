// public/modules/adhel.js
// Módulo AD/HEL (somente leitura/listagem)
// - Não altera visual; injeta <tr> no <tbody id="adhelTableBody"> existente.
// - Tabela: public.adhel_airfields (id, tipo, oaci, ciad, name, municipio, uf [, nup?])
// - Ordena por oaci ASC, depois ciad ASC.
// - API pública: init(), load(), refresh(), setFilter({ nup, oaci, ciad, name })
//
// Siglas usadas:
// - NUP: Número Único de Protocolo
// - OACI: Organização de Aviação Civil Internacional (código ICAO do aeródromo/heliponto)
// - AISWEB / ROTAER: serviço público do DECEA com dados do ROTAER (Rotas Aéreas) e de aeródromos

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

    // Dialog de NUPs associados
    dialogId: 'adhelNupDialog',
    dialogListId: 'adhelNupDialogList',
    dialogTitleId: 'adhelNupDialogTitle',
    dialogMsgId: 'adhelNupDialogMsg',

    // Dialog de resumo AISWEB/ROTAER
    aisDialogId: 'adhelAisDialog',
    aisDialogTitleId: 'adhelAisDialogTitle',
    aisDialogMsgId: 'adhelAisDialogMsg',
    aisDialogContentId: 'adhelAisDialogContent',
    aisDialogOpenButtonId: 'adhelAisDialogOpen'
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

  // Estado interno para consultas AIS (controle de concorrência/cancelamento)
  const AIS_STATE = { requestToken: 0 };

  // Chaves comuns para extrair um "resumo" do payload AISWEB
  const AIS_SUMMARY_FIELDS = [
    { label: 'Código OACI', keys: ['icao', 'oaci'] },
    { label: 'Nome', keys: ['nome', 'name'] },
    { label: 'Indicativo', keys: ['indicativo'] },
    { label: 'Município', keys: ['municipio', 'cidade'] },
    { label: 'UF', keys: ['uf', 'estado'] },
    { label: 'Tipo', keys: ['tipo'] },
    { label: 'Latitude', keys: ['latitude', 'lat'] },
    { label: 'Longitude', keys: ['longitude', 'lon', 'long'] },
    { label: 'Elevação', keys: ['elevacao', 'elev', 'altitude'] },
    { label: 'Observações', keys: ['observacao', 'observacoes', 'observações'] }
  ];

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
    try { return window.Utils?.normalizeNUP ? window.Utils.normalizeNUP(s) : s; } catch { return s; }
  }

  function getFunctionsBase() {
    const base = window?.APP_CONFIG?.NETLIFY_FUNCTIONS_BASE || '/.netlify/functions';
    return String(base || '/.netlify/functions').replace(/\/$/, '');
  }

  // Monta URL pública de página do AISWEB/ROTAER para abrir em nova aba
  function buildAiswebPageUrl(icao) {
    const code = String(icao || '').trim().toUpperCase();
    if (!code) return '';
    const rawBase = window?.APP_CONFIG?.AISWEB_ROTAER_PAGE_URL || 'https://aisweb.decea.mil.br/?page=rotaer&icao={{ICAO}}';
    if (rawBase.includes('{{ICAO}}')) {
      return rawBase.replace('{{ICAO}}', encodeURIComponent(code));
    }
    try {
      const url = new URL(rawBase);
      url.searchParams.set('icao', code);
      return url.toString();
    } catch (_) {
      const sep = rawBase.includes('?') ? '&' : '?';
      return `${rawBase}${sep}icao=${encodeURIComponent(code)}`;
    }
  }

  // Helpers para tornar legível o resumo
  function formatLabel(key) {
    return String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b([a-zA-ZÀ-ÖØ-öø-ÿ])/g, (m, chr) => chr.toUpperCase());
  }
  function normalizeSummaryValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) {
      return value.map(item => normalizeSummaryValue(item)).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'texto')) return normalizeSummaryValue(value.texto);
      if (Object.prototype.hasOwnProperty.call(value, 'value')) return normalizeSummaryValue(value.value);
      const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
      if (entries.length && entries.length <= 3) {
        return entries.map(([k, v]) => `${formatLabel(k)}: ${normalizeSummaryValue(v)}`).join('; ');
      }
    }
    return '';
  }
  function findValueDeep(obj, keys, depth = 0) {
    if (!obj || typeof obj !== 'object') return null;
    const entries = Object.entries(obj);
    for (const key of keys) {
      const target = String(key).toLowerCase();
      for (const [candidate, value] of entries) {
        if (String(candidate).toLowerCase() === target) return value;
      }
    }
    if (depth >= 3) return null;
    for (const [, value] of entries) {
      if (value && typeof value === 'object') {
        const nested = findValueDeep(value, keys, depth + 1);
        if (nested != null && nested !== '') return nested;
      }
    }
    return null;
  }
  function extractAisEntry(payload) {
    if (!payload) return null;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const entry = extractAisEntry(item);
        if (entry) return entry;
      }
      return null;
    }
    if (typeof payload !== 'object') return null;
    if (payload.rotaer && typeof payload.rotaer === 'object') {
      const entry = extractAisEntry(payload.rotaer);
      if (entry) return entry;
    }
    if (payload.data && typeof payload.data === 'object') {
      const entry = extractAisEntry(payload.data);
      if (entry) return entry;
    }
    if (payload.dados && typeof payload.dados === 'object') {
      const entry = extractAisEntry(payload.dados);
      if (entry) return entry;
    }
    return payload;
  }

  // --------------------------
  // Infra do popup (NUPs)
  // --------------------------
  function ensureDialog() {
    let dlg = getEl(SELECTORS.dialogId);
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = SELECTORS.dialogId;
    // Estrutura simples, herda CSS global
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
    nups.forEach((raw) => {
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

  // Reproduz a ação existente em Prazos/Processos (sem alterar layout global)
  function tryOpenProcessListByNUP(nup) {
    const s = String(nup || '').trim();
    if (!s) return;

    // 1) Funções do módulo Prazos (se existirem)
    if (window.Modules?.prazos?.openProcessByNUP) {
      try { window.Modules.prazos.openProcessByNUP(s); return; } catch {}
    }
    if (window.Modules?.prazos?.openProcessListByNUP) {
      try { window.Modules.prazos.openProcessListByNUP(s); return; } catch {}
    }

    // 2) Outros módulos
    if (window.Modules?.processos?.openByNUP) {
      try { window.Modules.processos.openByNUP(s); return; } catch {}
    }
    if (window.Modules?.processos?.filterByNUP) {
      try { window.Modules.processos.filterByNUP(s); return; } catch {}
    }

    // 3) Evento global (prazos.js pode ouvir)
    try {
      const ev = new CustomEvent('openProcessByNUP', { detail: { nup: s } });
      window.dispatchEvent(ev);
      return;
    } catch {}

    // 4) Fallback de navegação suave para prazos.html?nup=...
    try {
      const url = new URL(window.location.href);
      url.pathname = '/prazos.html';
      url.searchParams.set('nup', s);
      window.location.assign(url.toString());
    } catch (err) {
      console.warn('[AD/HEL] Falha no fallback de navegação para prazos:', err);
    }
  }

  // --------------------------
  // Dialog de resumo AISWEB/ROTAER (sem alterar visual global)
  // --------------------------
  function ensureAisDialog() {
    let dlg = getEl(SELECTORS.aisDialogId);
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = SELECTORS.aisDialogId;
    dlg.className = 'adhel-ais-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="adhel-ais-dialog__form">
        <header class="adhel-ais-dialog__header" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.5rem;">
          <h3 id="${SELECTORS.aisDialogTitleId}" style="margin:0;font-size:1rem;">AISWEB — ROTAER</h3>
          <div class="adhel-ais-dialog__actions" style="display:flex;gap:.5rem;">
            <button type="button" id="${SELECTORS.aisDialogOpenButtonId}" disabled>Ver na AISWEB</button>
            <button type="submit">Fechar</button>
          </div>
        </header>
        <div id="${SELECTORS.aisDialogMsgId}" class="muted adhel-ais-dialog__message" style="margin-bottom:.25rem;"></div>
        <div id="${SELECTORS.aisDialogContentId}" class="adhel-ais-dialog__content"></div>
      </form>
    `;
    document.body.appendChild(dlg);
    try { window.SafetyGuards?.fixButtonTypes?.(dlg); } catch {}

    dlg.addEventListener('cancel', ev => {
      ev.preventDefault();
      dlg.close();
    });
    dlg.addEventListener('close', () => {
      AIS_STATE.requestToken += 1; // invalida requisições em voo
      setAisDialogMsg('');
      const content = getEl(SELECTORS.aisDialogContentId);
      if (content) content.innerHTML = '';
      const openBtn = getEl(SELECTORS.aisDialogOpenButtonId);
      if (openBtn) {
        openBtn.disabled = true;
        openBtn.dataset.url = '';
      }
    });

    const openBtn = getEl(SELECTORS.aisDialogOpenButtonId);
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const url = openBtn.dataset.url;
        if (!url) return;
        try {
          window.open(url, '_blank', 'noopener');
        } catch (_) {
          window.location.assign(url);
        }
      });
    }

    return dlg;
  }

  function setAisDialogMsg(msg, isError = false) {
    const el = getEl(SELECTORS.aisDialogMsgId);
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? 'var(--warn)' : '';
  }

  function setAisDialogTitle(oaci, row) {
    const title = getEl(SELECTORS.aisDialogTitleId);
    if (!title) return;
    const code = String(oaci || row?.oaci || '').trim().toUpperCase();
    const name = String(row?.name || '').trim();
    const pieces = [];
    if (code) pieces.push(code);
    if (name) pieces.push(name);
    title.textContent = pieces.length ? `AISWEB — ${pieces.join(' · ')}` : 'AISWEB — ROTAER';
  }

  function setAisDialogLink(oaci) {
    const openBtn = getEl(SELECTORS.aisDialogOpenButtonId);
    const url = buildAiswebPageUrl(oaci);
    if (!openBtn) return;
    if (url) {
      openBtn.disabled = false;
      openBtn.dataset.url = url;
      openBtn.title = `Abrir AISWEB para ${oaci}`;
    } else {
      openBtn.disabled = true;
      openBtn.dataset.url = '';
      openBtn.title = 'Informe um código OACI para consultar no AISWEB';
    }
  }

  function renderAisDialogContent(row, payload) {
    const container = getEl(SELECTORS.aisDialogContentId);
    if (!container) return;
    container.innerHTML = '';

    const entries = [];
    const seen = new Set();
    const addEntry = (label, value) => {
      const text = normalizeSummaryValue(value);
      if (!text) return;
      if (seen.has(label)) return;
      seen.add(label);
      entries.push({ label, value: text });
    };

    const entry = extractAisEntry(payload);
    if (entry) {
      AIS_SUMMARY_FIELDS.forEach(field => {
        const value = findValueDeep(entry, field.keys);
        if (value != null && value !== '') addEntry(field.label, value);
      });
      if (!entries.length) {
        Object.entries(entry).forEach(([key, value]) => {
          if (value == null) return;
          if (typeof value === 'string' || typeof value === 'number') {
            addEntry(formatLabel(key), value);
          }
        });
      }
    }

    // Fallback: mostrar dados locais da linha
    [
      { label: 'Código OACI', value: row?.oaci },
      { label: 'CIAD', value: row?.ciad },
      { label: 'Nome', value: row?.name },
      { label: 'Município', value: row?.municipio },
      { label: 'UF', value: row?.uf },
      { label: 'Tipo', value: row?.tipo }
    ].forEach(item => addEntry(item.label, item.value));

    if (entries.length) {
      const dl = document.createElement('dl');
      dl.className = 'adhel-ais-summary';
      entries.forEach(item => {
        const dt = document.createElement('dt');
        dt.textContent = item.label;
        const dd = document.createElement('dd');
        dd.textContent = item.value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      container.appendChild(dl);
    } else {
      const paragraph = document.createElement('p');
      paragraph.className = 'muted';
      paragraph.textContent = 'Nenhum dado disponível para exibir.';
      container.appendChild(paragraph);
    }

    // Dados completos (opcional)
    if (payload != null && payload !== '') {
      const details = document.createElement('details');
      details.style.marginTop = '.75rem';
      const summary = document.createElement('summary');
      summary.textContent = 'Ver dados completos (resposta do AISWEB)';
      const pre = document.createElement('pre');
      pre.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      details.appendChild(summary);
      details.appendChild(pre);
      container.appendChild(details);
    }
  }

  async function fetchAisSummary(oaci) {
    const base = getFunctionsBase();
    const url = `${base}/aisweb-rotaer?icao=${encodeURIComponent(String(oaci || '').trim())}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Number(window?.APP_CONFIG?.AISWEB_TIMEOUT_MS || 15000) || 15000;
    let timeoutId = null;
    if (controller) timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller ? controller.signal : undefined });
      const text = await res.text();
      let parsed = null;
      if (text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
      if (!res.ok) {
        const message = parsed?.error || parsed?.message || text || `AISWEB respondeu com status ${res.status}.`;
        throw new Error(message);
      }
      if (parsed && parsed.ok === false) {
        throw new Error(parsed.error || parsed.message || 'Falha ao consultar o AISWEB.');
      }
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
        return parsed.data;
      }
      return parsed ?? text;
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('Tempo de resposta excedido ao consultar o AISWEB.');
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function openAisSummary(row) {
    const dlg = ensureAisDialog();
    const oaci = String(row?.oaci || '').trim().toUpperCase();
    setAisDialogTitle(oaci, row);
    setAisDialogLink(oaci);
    if (oaci) {
      setAisDialogMsg('Carregando dados do AISWEB...');
    } else {
      setAisDialogMsg('Código OACI não disponível para consulta.', true);
    }
    renderAisDialogContent(row, null);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    if (!oaci) return;

    const token = ++AIS_STATE.requestToken;
    try {
      const data = await fetchAisSummary(oaci);
      if (token !== AIS_STATE.requestToken) return; // dialog foi reaberto/fechado
      setAisDialogMsg('Resumo obtido via AISWEB.');
      renderAisDialogContent(row, data);
    } catch (err) {
      if (token !== AIS_STATE.requestToken) return;
      setAisDialogMsg(err?.message || 'Falha ao consultar o AISWEB.', true);
      renderAisDialogContent(row, null);
    }
  }

  // --------------------------
  // Busca NUPs associados (RPC -> tabela relacional -> coluna local "nup")
  // --------------------------
  async function resolveNupsForAirfield(row) {
    const sb = getSupabaseClient();
    if (!sb) return [];

    // 1) RPC
    try {
      if (typeof sb.rpc === 'function') {
        const { data, error } = await sb.rpc('rpc_adhel_list_nups', { airfield_id: row.id });
        if (!error && Array.isArray(data)) {
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

    // 3) Coluna local "nup" (pode ser lista separada por vírgula/; ou quebras de linha)
    const raw = row?.nup;
    if (raw == null || raw === '') return [];
    const parts = String(raw)
      .split(/[\n;,]+/g)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : (raw ? [raw] : []);
  }

  // --------------------------
  // Consulta ao Supabase (com fallback se a coluna nup não existir)
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

      // Coluna "NUP": botão "Ver" + botão "AIS" (resumo ROTAER)
      const tdNup = document.createElement('td');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'adhel-nup-actions';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver';
      btn.title = 'Ver NUPs associados';
      btn.addEventListener('click', async () => {
        setDialogMsg('Carregando NUPs...');
        const nups = await resolveNupsForAirfield(r);
        openNupDialog(r, nups);
      });
      actionWrap.appendChild(btn);

      const aisBtn = document.createElement('button');
      aisBtn.type = 'button';
      aisBtn.textContent = 'AIS';
      aisBtn.title = 'Resumo do ROTAER (AISWEB)';
      aisBtn.addEventListener('click', () => {
        openAisSummary(r);
      });
      actionWrap.appendChild(aisBtn);

      tdNup.appendChild(actionWrap);
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
      window.Utils.bindNUPMask(nupInput); // aplica máscara de NUP (Número Único de Protocolo)
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
    ensureAisDialog();
    await load();
  }

  return { init, load, refresh, setFilter };
})();
