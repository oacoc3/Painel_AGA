// public/modules/processos.js
/* public/modules/processos.js
 * Módulo Processos — busca/cadastro/edição + controle de abas.
 * Requisitos:
 *  - Ao abrir: somente NUP + Buscar habilitados
 *  - Buscar NUP:
 *      * se existe: preenche formulário, habilita demais abas, leva item ao topo da lista
 *      * se não existe: pergunta se deseja criar e habilita só a aba Processo até salvar
 *  - Selecionar linha na lista: carrega e habilita tudo
 *  - Botão Salvar só habilita quando algo muda; após salvar, volta a desabilitar
 *  - Observações armazenadas em tabela separada (process_observations)
*/

window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let editingOpId = null;
  let editingNtId = null;
  let editingSgId = null;
  let popupProcId = null;
  // Paginação da lista de processos (HTML-first + Supabase range)
  let PROC_PAGE = 1;
  const PROC_PAGE_SIZE = 50; // ajuste se necessário


  // Normaliza entrada de NUP para o formato do banco: XXXXXX/XXXX-XX
function normalizeNupToBankFormat(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  // espelha a normalização do banco (public.normalize_nup):
  // - remove prefixo de 5 dígitos, se houver
  let d = digits;
  if (d.length > 5) d = d.slice(5);
  // - quando houver 12 dígitos (6/4/2), formata preservando os 2 finais
  if (d.length >= 12) {
    const p1 = d.slice(0, 6);
    const p2 = d.slice(6, 10);
    const p3 = d.slice(10, 12);
    return `${p1}/${p2}-${p3}`;
  }
  // caso contrário, devolve como o usuário digitou (sem forçar "-00")
  return input || '';
   }

  function renderProcPagination({ page, pagesTotal, count }) {
    const box = el('procLista');
    if (!box) return;
    let pager = box.querySelector('.pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'pager';
    }
    if (box.firstElementChild !== pager) {
      box.insertBefore(pager, box.firstElementChild);
    }
    const disablePrev = page <= 1;
    const disableNext = page >= pagesTotal;
    pager.innerHTML = `
      <div class="row" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-bottom:.5rem;">
        <button type="button" id="procFirstPage" ${disablePrev ? 'disabled' : ''}>&laquo;</button>
        <button type="button" id="procPrevPage" ${disablePrev ? 'disabled' : ''}>&lsaquo;</button>
        <span id="procPagerInfo">${page} / ${pagesTotal} (${count} itens)</span>
        <button type="button" id="procNextPage" ${disableNext ? 'disabled' : ''}>&rsaquo;</button>
        <button type="button" id="procLastPage" ${disableNext ? 'disabled' : ''}>&raquo;</button>
      </div>`;
    pager.querySelector('#procFirstPage')?.addEventListener('click', () => loadProcessList({ page: 1 }));
    pager.querySelector('#procPrevPage')?.addEventListener('click', () => loadProcessList({ page: Math.max(1, (PROC_PAGE - 1)) }));
    pager.querySelector('#procNextPage')?.addEventListener('click', () => loadProcessList({ page: PROC_PAGE + 1 }));
    pager.querySelector('#procLastPage')?.addEventListener('click', () => loadProcessList({ page: pagesTotal }));
  }

  const PROCESS_STATUSES = window.Modules.statuses.PROCESS_STATUSES;
  const STATUS_OPTIONS = PROCESS_STATUSES.map(s => `<option>${s}</option>`).join('');
  const NOTIFICATION_TYPES = ['FAV', 'FAV-TERM', 'FAV-AD_HEL', 'TERM-ATRA', 'DESF-INI', 'DESF-NAO_INI', 'DESF_JJAER', 'DESF-REM_REB', 'NCD', 'NCT', 'REVOG', 'ARQ-EXTR', 'ARQ-PRAZ'];
  const NOTIFICATION_OPTIONS = NOTIFICATION_TYPES.map(t => `<option>${t}</option>`).join('');
  // NOVO (patch): tipos de notificação que permitem marcação "Resolvida"
  const NOTIFICATION_RESOLUTION_TYPES = new Set(['FAV-AD_HEL', 'TERM-ATRA', 'DESF-REM_REB']);
  const SIGADAER_TYPES = ['COMAE', 'COMPREP', 'COMGAP', 'GABAER', 'SAC', 'ANAC', 'OPR_AD', 'PREF', 'GOV', 'JJAER', 'AJUR', 'AGU', 'OUTRO'];
  const SIGADAER_OPTIONS = SIGADAER_TYPES.map(t => `<option>${t}</option>`).join('');
  // NOVO (patch): prazos padrão por tipo de SIGADAER
  const SIGADAER_DEFAULT_DEADLINES = new Map([
    ['COMAE', 30],
    ['COMPREP', 30],
    ['GABAER', 30],
    ['COMGAP', 90]
  ]);

  const IBGE_MUNICIPALITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
  let SIG_MUNICIPALITIES = null;
  let SIG_MUNICIPALITIES_PROMISE = null;
  const SIG_MUNICIPALITIES_MAP = new Map();

  const CLIPBOARD_ICON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" class="icon-clipboard"><rect x="6" y="5" width="12" height="15" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M9 5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="m10 11 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="m10 16 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  const el = (id) => document.getElementById(id);

  // === Adições do patch: integração com utilitário de PDF/Checklist ===
  const CHECKLIST_PDF = window.Modules?.checklistPDF || {};
  const EXTRA_NC_CODE = CHECKLIST_PDF.EXTRA_NON_CONFORMITY_CODE || '__ck_extra_nc__';

  const normalizeValue = (value) => (
    typeof value === 'string'
      ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      : ''
  );

  function formatSigMunicipality(source) {
    if (!source) return '';
    const name = source.municipality_name || source.name || source.municipio || '';
    const uf = source.municipality_uf || source.uf || source.uf_sigla || '';
    if (!name && !uf) return '';
    return uf ? `${name}/${uf}` : name;
  }

  async function ensureMunicipalitiesLoaded() {
    if (Array.isArray(SIG_MUNICIPALITIES) && SIG_MUNICIPALITIES.length) {
      return SIG_MUNICIPALITIES;
    }
    if (SIG_MUNICIPALITIES_PROMISE) return SIG_MUNICIPALITIES_PROMISE;
    SIG_MUNICIPALITIES_PROMISE = fetch(IBGE_MUNICIPALITIES_URL)
      .then((resp) => {
        if (!resp.ok) {
          throw new Error('Falha ao carregar municípios do IBGE.');
        }
        return resp.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const mapped = list
          .map((item) => {
            const uf = item?.microrregiao?.mesorregiao?.UF;
            const ufSigla = uf?.sigla || '';
            const ufNome = uf?.nome || '';
            return {
              id: item?.id,
              name: item?.nome || '',
              uf: ufSigla,
              uf_name: ufNome
            };
          })
          .filter(entry => entry.id && entry.name);
        mapped.sort((a, b) => {
          const ufCmp = (a.uf || '').localeCompare(b.uf || '', 'pt-BR');
          if (ufCmp !== 0) return ufCmp;
          return (a.name || '').localeCompare(b.name || '', 'pt-BR');
        });
        SIG_MUNICIPALITIES_MAP.clear();
        mapped.forEach((entry) => {
          SIG_MUNICIPALITIES_MAP.set(String(entry.id), entry);
        });
        SIG_MUNICIPALITIES = mapped;
        return SIG_MUNICIPALITIES;
      })
      .catch((err) => {
        SIG_MUNICIPALITIES = [];
        throw err;
      })
      .finally(() => {
        SIG_MUNICIPALITIES_PROMISE = null;
      });
    return SIG_MUNICIPALITIES_PROMISE;
  }

  function getSigMunicipalityById(id) {
    if (!id) return null;
    const key = String(id);
    if (SIG_MUNICIPALITIES_MAP.has(key)) return SIG_MUNICIPALITIES_MAP.get(key);
    if (Array.isArray(SIG_MUNICIPALITIES)) {
      const found = SIG_MUNICIPALITIES.find(entry => String(entry.id) === key);
      if (found) {
        SIG_MUNICIPALITIES_MAP.set(key, found);
        return found;
      }
    }
    return null;
  }

  async function populateMunicipalitySelect(selectEl, msgEl, selectedId) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Carregando municípios…</option>';
    selectEl.disabled = true;
    try {
      const municipios = await ensureMunicipalitiesLoaded();
      if (!Array.isArray(municipios) || municipios.length === 0) {
        throw new Error('Lista de municípios vazia.');
      }
      const frag = document.createDocumentFragment();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Selecione um município';
      frag.appendChild(placeholder);
      municipios.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = String(item.id);
        opt.textContent = item.uf ? `${item.name}/${item.uf}` : item.name;
        opt.dataset.uf = item.uf || '';
        opt.dataset.nome = item.name || '';
        frag.appendChild(opt);
      });
      selectEl.innerHTML = '';
      selectEl.appendChild(frag);
      if (selectedId) selectEl.value = String(selectedId);
      selectEl.disabled = false;
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.classList.remove('error');
      }
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = 'Não foi possível carregar os municípios. Tente novamente.';
        msgEl.classList.add('error');
      }
      selectEl.innerHTML = '<option value="">Lista de municípios indisponível</option>';
      selectEl.disabled = true;
      console.error('Falha ao carregar municípios do IBGE', err);
    }
  }

  async function fetchSigadaerRecord(id) {
    if (!id) return null;
    const { data, error } = await sb
      .from('sigadaer')
      .select('id,municipality_name,municipality_uf')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function populateSigMunicipalityInfo(targetEl, sigadaerRowOrId) {
    if (!targetEl) return;
    targetEl.textContent = 'Município: carregando…';
    try {
      const record = (sigadaerRowOrId && typeof sigadaerRowOrId === 'object')
        ? sigadaerRowOrId
        : await fetchSigadaerRecord(sigadaerRowOrId);
      const display = formatSigMunicipality(record);
      targetEl.textContent = display ? `Município: ${display}` : 'Município: —';
    } catch (err) {
      targetEl.textContent = 'Município: não disponível';
      console.error(err);
    }
  }

  function evaluateChecklistResult(source) {
    if (typeof CHECKLIST_PDF.getChecklistResult === 'function') {
      return CHECKLIST_PDF.getChecklistResult(source);
    }
    const answers = Array.isArray(source?.answers) ? source.answers : [];
    const hasTemplateNonConformity = answers.some(ans => normalizeValue(ans?.value) === 'nao conforme');
    const extraEntry = answers.find(ans => ans?.code === EXTRA_NC_CODE);
    const hasExtraNonConformity = normalizeValue(extraEntry?.value) === 'sim';
    const hasNonConformity = hasTemplateNonConformity || hasExtraNonConformity;
    return {
      hasNonConformity,
      extraFlag: hasExtraNonConformity,
      summary: hasNonConformity ? 'Processo não conforme' : 'Processo conforme'
    };
  }
  // === Fim das adições do patch ===

  // === Patch: normalização de rótulos de Tipo de Processo ===
  const PROCESS_TYPE_LABELS = ['PDIR', 'Inscrição', 'Alteração', 'Exploração', 'OPEA'];
  const PROCESS_TYPE_MAP = PROCESS_TYPE_LABELS.reduce((map, label) => {
    map[label] = label;
    map[`${label} - Documental`] = label;
    return map;
  }, {});
  const normalizeProcessTypeLabel = (value) => {
    if (typeof value !== 'string') return '';
    const key = value.trim();
    return PROCESS_TYPE_MAP[key] || key;
  };
  // ================================================

  const SafeUtils = {
    setMsg(id, text, isError = false) {
      const box = el(id);
      if (!box) return;
      box.textContent = text || '';
      box.classList.remove('error');
      if (isError && text) box.classList.add('error');
    },
    fmtDate(iso) {
      try {
        let d;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y, m, dd] = iso.split('-').map(Number);
          d = new Date(y, m - 1, dd);
        } else {
          d = new Date(iso);
        }
        if (Number.isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d);
      } catch { return ''; }
    },
    fmtDateTime(iso) {
      try {
        let d;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y, m, dd] = iso.split('-').map(Number);
          d = new Date(y, m - 1, dd);
        } else {
          d = new Date(iso);
        }
        if (Number.isNaN(d.getTime())) return '';
        const dt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d);
        const tm = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit'
        }).format(d);
        return `${dt} ${tm}`;
      } catch { return ''; }
    },
    toDateInputValue(isoDate) {
      if (!isoDate) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    },
    toDateTimeLocalValue(isoDateTime) {
      if (!isoDateTime) return '';
      const d = new Date(isoDateTime);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
    }
  };
  const U = (window.Utils && typeof window.Utils.setMsg === 'function') ? window.Utils : SafeUtils;

  // === Guards de autorização para escrita (patch) ===
  const Access = window.AccessGuards || null;
  function guardProcessWrite(msgId, options = {}) {
    if (!Access || typeof Access.ensureWrite !== 'function') return true;
    const opts = { ...options };
    if (msgId && !opts.msgId) opts.msgId = msgId;
    return Access.ensureWrite('processos', opts);
  }
  function guardProcessWriteSilent(msgId) {
    return guardProcessWrite(msgId, { silent: true });
  }
  // ================================================

  // === toggles ===
  function toggleProcFields(on) {
    const box = el('procCampos');
    if (box) box.classList.toggle('hidden', !on);
  }
  function toggleOtherTabsVisible(on) {
    ['tabBtnOpiniao','tabBtnNotif','tabBtnSig'].forEach(id => {
      const b = el(id);
      if (b) b.classList.toggle('hidden', !on);
    });
  }
  function toggleProcActions(on) {
    const box = el('procAcoes');
    if (box) box.classList.toggle('hidden', !on);
  }
  // ===============================

  function setProcFormEnabled(on) {
    ['btnSalvarProc','btnNovoProc']
      .forEach(id => { const b = el(id); if (b) b.disabled = !on; });
  }
  function setOtherTabsEnabled(on) {
    ['opiniao','notif','sig'].forEach(tab => {
      const b = document.querySelector(`[data-tab="${tab}"]`);
      if (b) b.disabled = !on;
    });
  }

  // Mantém o NUP sincronizado nas outras abas (Parecer, Notificação, SIGADAER)
  function syncNupFields() {
    ['opNUP', 'ntNUP', 'sgNUP'].forEach(id => {
      const e = el(id);
      if (e) e.value = currentNUP;
    });
  }

  function showTab(tab) {
    const ids = { proc: 'tabProc', opiniao: 'tabOpiniao', notif: 'tabNotif', sig: 'tabSig' };
    Object.entries(ids).forEach(([k, id]) => {
      const box = el(id); if (box) box.style.display = (k === tab) ? 'block' : 'none';
    });
    Array.from(document.querySelectorAll('[data-tab]'))
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const maps = { proc: 'procLista', opiniao: 'opLista', notif: 'ntLista', sig: 'sgLista' };
    Object.values(maps).forEach(id => { const x = el(id); if (x) x.style.display = 'none'; });
    const visible = el(maps[tab]); if (visible) visible.style.display = 'block';
  }

  function clearProcessForm() {
    currentProcId = null;
    currentNUP = '';
    syncNupFields();

    if (el('procNUP')) el('procNUP').value = '';

    setProcFormEnabled(false);
    setOtherTabsEnabled(false);
    toggleProcFields(false);
    toggleOtherTabsVisible(false);
    toggleProcActions(false);
    U.setMsg('procMsg', '');
  }

  function bindProcFormTracking() {
    // campos de observação removidos
  }

  async function buscarProcesso() {
    let nup = (el('procNUP')?.value || '').trim();
    nup = normalizeNupToBankFormat(nup);
    if (el('procNUP')) el('procNUP').value = nup;
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP (Número Único de Protocolo).', true);

    U.setMsg('procMsg', 'Buscando…');
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at')
        .eq('nup', nup)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        currentProcId = data.id;
        currentNUP = data.nup;
        syncNupFields();

        setProcFormEnabled(true);
        toggleProcFields(true);
        bindProcFormTracking();
        toggleProcActions(true);
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Processo encontrado.');
        // NOVO (patch): calcular a página onde o processo aparece e abrir a lista já posicionada
        let targetPage = null;
        if (data.created_at) {
          try {
            let offset = 0;
            const { count: newerCount, error: newerErr } = await sb
              .from('processes')
              .select('id', { count: 'exact', head: true })
              .gt('created_at', data.created_at);
            if (newerErr) throw newerErr;
            if (typeof newerCount === 'number') offset += newerCount;

            if (data.id) {
              const { count: tieCount, error: tieErr } = await sb
                .from('processes')
                .select('id', { count: 'exact', head: true })
                .eq('created_at', data.created_at)
                .gt('id', data.id);
              if (tieErr) throw tieErr;
              if (typeof tieCount === 'number') offset += tieCount;
            }

            targetPage = Math.max(1, Math.floor(offset / PROC_PAGE_SIZE) + 1);
          } catch (pageErr) {
            console.warn('Falha ao calcular página do processo', pageErr);
          }
        }

        if (targetPage && Number.isFinite(targetPage)) {
          await loadProcessList({ page: targetPage });
        } else {
          await loadProcessList();
        }
      } else {
        const ok = window.confirm('Processo não encontrado. Criar novo?');
        if (ok) {
          await showNovoProcessoPopup(nup);
        } else {
          clearProcessForm();
          await loadProcessList();
        }
      }
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // Popup de “Novo Processo” quando NUP não existe
  async function showNovoProcessoPopup(nup) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `
        <form method="dialog" class="proc-popup">
          <h3>Novo Processo ${nup}</h3>
          <label>Tipo
            <select id="npTipo">
              <option>PDIR</option><option>Inscrição</option><option>Alteração</option><option>Exploração</option><option>OPEA</option>
            </select>
          </label>
          <label>Status
            <select id="npStatus">
              ${STATUS_OPTIONS}
            </select>
          </label>
          <label>Desde <input type="datetime-local" id="npStatusDate"></label>
          <label>1ª entrada <input type="date" id="npEntrada"></label>
          <label>Término da obra <input type="date" id="npObraTermino"></label>
          <button type="button" id="npObraConcluida">Obra concluída</button>
          <menu>
            <button value="cancel">Cancelar</button>
            <button id="npSalvar" value="default">Salvar</button>
          </menu>
        </form>`;
      document.body.appendChild(dlg);
      const obraBtn = dlg.querySelector('#npObraConcluida');
      const obraTerm = dlg.querySelector('#npObraTermino');
      obraBtn?.addEventListener('click', () => {
        obraBtn.classList.toggle('active');
        if (obraTerm) obraTerm.disabled = obraBtn.classList.contains('active');
      });
      dlg.addEventListener('close', () => {
        dlg.remove();
        if (!currentProcId) clearProcessForm();
        resolve();
      });
      dlg.querySelector('#npSalvar')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const tipo = dlg.querySelector('#npTipo')?.value || '';
        const processType = normalizeProcessTypeLabel(tipo);
        const status = dlg.querySelector('#npStatus')?.value || '';
        const statusDateVal = dlg.querySelector('#npStatusDate')?.value || '';
        const entrada = dlg.querySelector('#npEntrada')?.value || '';
        const obraTermVal = dlg.querySelector('#npObraTermino')?.value || '';
        const obraConcl = !!obraBtn?.classList.contains('active');
        if (!processType || !status || !statusDateVal || !entrada || (!obraConcl && !obraTermVal)) {
          alert('Preencha todos os campos.');
          return;
        }
        const payload = {
          nup,
          type: processType,
          status,
          status_since: new Date(statusDateVal).toISOString(),
          first_entry_date: entrada,
          obra_termino_date: obraConcl ? null : obraTermVal,
          obra_concluida: obraConcl
        };
        try {
          const u = await getUser();
          if (!u) throw new Error('Sessão expirada.');
          const { data, error } = await sb
            .from('processes')
            .insert({ ...payload, created_by: u.id })
            .select('id')
            .single();
          if (error) throw error;
          currentProcId = data.id;
          currentNUP = nup;
          el('procNUP').value = nup;
          dlg.close();
          await buscarProcesso();
        } catch(e) {
          alert(e.message || e);
        }
      });
      dlg.showModal();
    });
  }

  async function upsertProcess() {
    if (!guardProcessWrite('procMsg')) return;
    let nup = (el('procNUP')?.value || '').trim();
    nup = normalizeNupToBankFormat(nup);
    if (el('procNUP')) el('procNUP').value = nup;
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP.', true);

    const payload = { nup };

    try {
      if (!currentProcId) {
        const u = await getUser();
        if (!u) return U.setMsg('procMsg', 'Sessão expirada.', true);
        const { data, error } = await sb.from('processes').insert({ ...payload, created_by: u.id }).select('id').single();
        if (error) throw error;
        currentProcId = data.id;
        currentNUP = nup;
        toggleProcActions(true);
        U.setMsg('procMsg', 'Processo cadastrado.');
      } else {
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        currentNUP = nup;
        U.setMsg('procMsg', 'Processo atualizado.');
      }

      syncNupFields();
      if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
      await loadProcessList();
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // Popup para editar status do processo
  function showStatusEditPopup(id, curStatus, curDate) {
    if (!id) return;
    if (!guardProcessWrite('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Alterar status</h3>
        <label>Novo status
          <select id="stNovo">${STATUS_OPTIONS}</select>
        </label>
        <label>Desde <input type="datetime-local" id="stDesde"></label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="stSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('#stNovo');
    if (sel) sel.value = PROCESS_STATUSES.includes(curStatus) ? curStatus : 'ANATEC-PRE';
    const dt = dlg.querySelector('#stDesde');
    if (dt && curDate) dt.value = U.toDateTimeLocalValue(curDate);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#stSalvar')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const payload = {
        status: sel?.value || 'ANATEC-PRE',
        status_since: dt?.value ? new Date(dt.value).toISOString() : null
      };
      try {
        const { error } = await sb.from('processes').update(payload).eq('id', id);
        if (error) throw error;
        dlg.close();
        await loadProcessList();
      } catch (e) {
        alert(e.message || e);
      }
    });
    dlg.showModal();
  }

  // NOVO: Popup para editar 1ª entrada
  function showEntradaEditPopup(id, curDate) {
    if (!id) return;
    if (!guardProcessWrite('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Atualizar 1ª entrada</h3>
        <label>Data <input type="date" id="feData"></label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="feSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('#feData');
    if (input && curDate) input.value = U.toDateInputValue(curDate);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#feSalvar')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const val = input?.value || '';
      if (!val) {
        alert('Informe a data da 1ª entrada.');
        return;
      }
      try {
        const { error } = await sb.from('processes').update({ first_entry_date: val }).eq('id', id);
        if (error) throw error;
        dlg.close();
        await loadProcessList();
      } catch (e) {
        alert(e.message || e);
      }
    });
    dlg.showModal();
  }

  // Popup para editar término de obra
  function showObraEditPopup(id, curDate, concluida) {
    if (!id) return;
    if (!guardProcessWrite('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Atualizar obra</h3>
        <label>Término <input type="date" id="obTerm"></label>
        <label><input type="checkbox" id="obConc"> Obra concluída</label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="obSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const term = dlg.querySelector('#obTerm');
    if (term && curDate) term.value = U.toDateInputValue(curDate);
    const chk = dlg.querySelector('#obConc');
    if (chk) chk.checked = !!concluida;
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#obSalvar')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const payload = {
        obra_termino_date: term?.value || null,
        obra_concluida: !!chk?.checked
      };
      try {
        const { error } = await sb.from('processes').update(payload).eq('id', id);
        if (error) throw error;
        dlg.close();
        await loadProcessList();
      } catch (e) {
        alert(e.message || e);
      }
    });
    dlg.showModal();
  }

  async function deleteProcess(procId) {
    if (!procId) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    // remove dependências que referenciam o processo antes de apagar o registro principal
    const tables = ['internal_opinions', 'notifications', 'sigadaer',
      'process_observations', 'checklist_responses', 'history'];
    await Promise.all(tables.map(t => sb.from(t).delete().eq('process_id', procId)));

    try {
      const { error } = await sb.from('processes').delete().eq('id', procId);
      if (error) throw error;
      if (String(currentProcId) === String(procId)) clearProcessForm();
      await loadProcessList();
    } catch (e) {
      alert(e.message || e);
    }
  }

  // === novo helper para seleção da linha ===
  async function selectProcess(row) {
    if (!row) return;
    currentProcId = row.id;
    currentNUP = row.nup;
    syncNupFields();

    if (el('procNUP')) el('procNUP').value = row.nup;

    setProcFormEnabled(true);
    toggleProcFields(true);
    bindProcFormTracking();
    toggleProcActions(true);
    if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
    if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

    U.setMsg('procMsg', 'Processo selecionado.');
    await loadProcessList();
  }

  async function loadProcessList({ page = PROC_PAGE, pageSize = PROC_PAGE_SIZE } = {}) {
    const box = el('procLista');
    if (!box) return;

    // Garante sessão ativa antes de prosseguir
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession();
        if (refreshErr || !refreshed.session) throw refreshErr || new Error('no-session');
      }
    } catch (err) {
      U.setMsg('procMsg', 'Sessão expirada. Recarregue a página ou faça login novamente.', true);
      console.warn('Falha ao recuperar sessão', err);
      const reload = confirm('Sessão expirada. Recarregar a página? (Cancelar para fazer login novamente)');
      if (!reload) {
        try { await sb.auth.signOut(); } catch (_) {}
      }
      location.reload();
      return;
    }

    box.innerHTML = '<div class="msg">Carregando…</div>';

    try {
      // paginação via Supabase range
      const p = Math.max(1, Number(page) || 1);
      const size = Math.max(1, Number(pageSize) || PROC_PAGE_SIZE);
      const from = (p - 1) * size;
      const to = from + size - 1;

      const query = sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      let toRef;
      const timeout = new Promise((_, reject) => {
        toRef = setTimeout(() => reject(new Error('timeout')), 10000);
      });

      const { data, count, error } = await Promise.race([query, timeout]);
      clearTimeout(toRef);
      if (error) throw error;

      const rows = Array.isArray(data) ? [...data] : [];
      const ids = rows.map(r => r.id);

      // Busca presença nas tabelas relacionadas apenas para os IDs da página atual
      const [op, nt, sg, ob, ck] = await Promise.all([
        sb.from('internal_opinions').select('process_id').in('process_id', ids),
        sb.from('notifications').select('process_id').in('process_id', ids),
        sb.from('sigadaer').select('process_id').in('process_id', ids),
        sb.from('process_observations').select('process_id').in('process_id', ids),
        sb.from('checklist_responses').select('process_id').in('process_id', ids)
      ]);
      const opSet = new Set((op.data || []).map(o => o.process_id));
      const ntSet = new Set((nt.data || []).map(o => o.process_id));
      const sgSet = new Set((sg.data || []).map(o => o.process_id));
      const obSet = new Set((ob.data || []).map(o => o.process_id));
      const ckSet = new Set((ck.data || []).map(o => o.process_id));

      if (currentProcId) {
        const cur = String(currentProcId);
        rows.sort((a, b) => (String(a.id) === cur ? -1 : (String(b.id) === cur ? 1 : 0)));
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th></th><th>NUP</th><th>Tipo</th><th>1ª Entrada</th>
          <th>Status</th><th>Obra</th><th></th><th></th><th></th><th></th><th></th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const isCurrent = String(r.id) === String(currentProcId);
        if (isCurrent) tr.classList.add('selected');
        const hasOp = opSet.has(r.id);
        const hasNt = ntSet.has(r.id);
        const hasSg = sgSet.has(r.id);
        const hasOb = obSet.has(r.id);
        const entradaTxt = U.fmtDate(r.first_entry_date);
        const entradaBtn = isCurrent ? `<button type="button" class="editBtn editEntrada">Editar 1ª Entrada</button>` : '';
        const entradaCell = `${entradaTxt}${entradaBtn ? '<br>' + entradaBtn : ''}`;
        const stTxt = `${r.status || ''}${r.status_since ? '<br><small>' + U.fmtDateTime(r.status_since) + '</small>' : ''}`;
        const stBtn = isCurrent ? `<button type="button" class="editBtn editStatus">Editar Status</button>` : '';
        const stCell = `${stTxt}${isCurrent ? '<br>' + stBtn : ''}`;
        const obTxt = r.obra_concluida ? 'Concluída' : (r.obra_termino_date ? U.fmtDate(r.obra_termino_date) : '');
        const obBtn = isCurrent ? `<button type="button" class="editBtn toggleObra">Editar Obra</button>` : '';
        const obCell = `${obTxt}${isCurrent ? '<br>' + obBtn : ''}`;
        const hasChecklist = ckSet.has(r.id);
        const ckBtn = `<button type="button" class="docIcon ckBtn ${hasChecklist ? 'on' : 'off'}" title="Checklists" aria-label="Checklists">${CLIPBOARD_ICON}</button>`;
        const opBtn = `<button type="button" class="docIcon opBtn ${hasOp ? 'on' : 'off'}">P</button>`;
        const ntBtn = `<button type="button" class="docIcon ntBtn ${hasNt ? 'on' : 'off'}">N</button>`;
        const sgBtn = `<button type="button" class="docIcon sgBtn ${hasSg ? 'on' : 'off'}">S</button>`;
        const obsBtn = `<button type="button" class="docIcon obsIcon obsBtn ${hasOb ? 'on' : 'off'}">OBS</button>`;
        const displayType = normalizeProcessTypeLabel(r.type);
        tr.innerHTML = `
          <td class="align-center"><div class="historyWrap"><button type="button" class="historyBtn" aria-label="Histórico">👁️</button>${ckBtn}</div></td>
          <td>${r.nup || ''}</td>
          <td>${displayType || ''}</td>
          <td>${entradaCell}</td>
          <td>${stCell}</td>
          <td>${obCell}</td>
          <td class="align-center">${obsBtn}</td>
          <td class="align-center">${opBtn}</td>
          <td class="align-center">${ntBtn}</td>
          <td class="align-center">${sgBtn}</td>
          <td class="align-right"><button type="button" class="deleteBtn">Excluir</button></td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // Renderizar no container
      box.innerHTML = '';
      box.appendChild(table);

      // Atualiza estado de página e renderiza paginação
      PROC_PAGE = p;
      const pagesTotal = typeof count === 'number' ? Math.max(1, Math.ceil(count / size)) : 1;
      renderProcPagination({ page: p, pagesTotal, count: count || rows.length });

      // Bind row events (mantém comportamento existente)
      tbody.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr) return;
        const idx = Array.from(tbody.children).indexOf(tr);
        const row = rows[idx];
        if (!row) return;
        if (ev.target.closest('.deleteBtn')) {
          if (!guardProcessWrite('procMsg')) return;
          if (confirm('Excluir este processo?')) deleteProcess(row.id);
          return;
        }
        if (ev.target.closest('.historyBtn')) return showHistoryPopup(row.id);
        if (ev.target.closest('.ckBtn')) return showChecklistPopup(row.id);
        if (ev.target.closest('.opBtn')) return showOpiniaoPopup(row.id);
        if (ev.target.closest('.ntBtn')) return showNotifPopup(row.id);
        if (ev.target.closest('.sgBtn')) return showSigPopup(row.id);
        if (ev.target.closest('.obsBtn')) return showObsPopup(row.id);
        if (ev.target.closest('.editEntrada')) {
          if (!guardProcessWrite('procMsg')) return;
          return showEntradaEditPopup(row.id, row.first_entry_date);
        }
        if (ev.target.closest('.editStatus')) {
          if (!guardProcessWrite('procMsg')) return;
          return showStatusEditPopup(row.id, row.status, row.status_since);
        }
        if (ev.target.closest('.toggleObra')) {
          if (!guardProcessWrite('procMsg')) return;
          return showObraEditPopup(row.id, row.obra_termino_date, row.obra_concluida);
        }
        selectProcess(row);
      });
    } catch (err) {
      box.innerHTML = '<div class="msg error">Falha ao carregar a lista. <button type="button" id="procRetryBtn">Tentar novamente</button></div>';
      document.getElementById('procRetryBtn')?.addEventListener('click', () => loadProcessList());
      window.SafetyGuards?.askReload?.('Falha ao carregar a lista. Recarregar a página?');
      console.error(err);
    }
  }

  async function loadObsList(procId, targetId = 'obsLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('process_observations')
        .select('id,text,created_at')
        .eq('process_id', procId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'created_at', label: 'Data', value: r => U.fmtDateTime(r.created_at) },
        { key: 'text', label: 'Observação' }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // === NOVO: lista de checklists preenchidas (patch aplicado) ===
  async function loadChecklistList(procId, targetId = 'ckLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('id,filled_at,answers,checklist_templates(name,version)')
        .eq('process_id', procId)
        .eq('status', 'final')
        .order('filled_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(r => {
            const evaluation = evaluateChecklistResult(r);
            const version = r.checklist_templates?.version;
            const checklistName = r.checklist_templates?.name || '';
            const checklistWithVersion = version != null
              ? `${checklistName} (v${version})`
              : checklistName;
            return {
              id: r.id,
              checklist: checklistWithVersion,
              filled_at: r.filled_at,
              result: evaluation.summary || ''
            };
          })
        : [];
      if (!rows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist preenchida.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'checklist', label: 'Doc' },
        { key: 'filled_at', label: 'Preenchida em', value: r => U.fmtDateTime(r.filled_at) },
        { key: 'result', label: 'Resultado' },
        {
          label: 'PDF',
          align: 'center',
          render: (r) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'PDF';
            b.addEventListener('click', () => abrirChecklistPDF(r.id));
            return b;
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadOpiniaoList(procId, targetId = 'opLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('internal_opinions')
        .select('id,type,requested_at,status,received_at')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.receb_at || r.received_at) },
        {
          label: 'Ações',
          render: (r) => {
            const wrap = document.createElement('div');
            wrap.className = 'action-buttons';
            if (r.status === 'SOLICITADO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Recebido';
              b.addEventListener('click', () => {
                if (!guardProcessWrite('procMsg')) return;
                showOpRecForm(r.id);
              });
              wrap.appendChild(b);
            } else if (r.status === 'RECEBIDO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Finalizado';
              b.addEventListener('click', () => {
                if (!guardProcessWrite('procMsg')) return;
                showOpFinForm(r.id);
              });
              wrap.appendChild(b);
            }
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = 'Excluir';
            del.addEventListener('click', async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!guardProcessWrite('procMsg')) return;
              await deleteOpinion(r.id);
            });
            wrap.appendChild(del);
            return wrap;
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadNotifList(procId, targetId = 'ntLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('notifications')
        .select('id,type,requested_at,status,read_at,responded_at')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'read_at', label: 'Lida em', value: r => U.fmtDateTime(r.read_at) },
        { key: 'responded_at', label: 'Resolvida em', value: r => U.fmtDateTime(r.responded_at) },
        {
          label: 'Ações',
          render: (r) => {
            const wrap = document.createElement('div');
            wrap.className = 'action-buttons';
            if (r.status !== 'LIDA') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Lida';
              b.addEventListener('click', () => {
                if (!guardProcessWrite('procMsg')) return;
                showNtLidaForm(r.id);
              });
              wrap.appendChild(b);
            }
            if (r.status !== 'RESPONDIDA' && NOTIFICATION_RESOLUTION_TYPES.has(r.type)) {
              const resp = document.createElement('button');
              resp.type = 'button';
              resp.textContent = 'Resolvida';
              resp.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!guardProcessWrite('procMsg')) return;
                showNtResolvidaForm(r.id, r.responded_at);
              });
              wrap.appendChild(resp);
            }
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = 'Excluir';
            del.addEventListener('click', async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!guardProcessWrite('procMsg')) return;
              await deleteNotification(r.id);
            });
            wrap.appendChild(del);
            return wrap;
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadSIGList(procId, targetId = 'sgLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('sigadaer')
        .select('id,numbers,type,requested_at,status,expedit_at,received_at,deadline_days,municipality_name,municipality_uf,municipality_ibge_id')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        {
          key: 'numbers',
          label: 'Números',
          value: r => Array.isArray(r.numbers) ? r.numbers.map(n => String(n).padStart(6, '0')).join('; ') : ''
        },
        { key: 'type', label: 'Tipo' },
        { key: 'municipality_name', label: 'Município', value: formatSigMunicipality },
        { key: 'deadline_days', label: 'Prazo (dias)' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'expedit_at', label: 'Expedida em', value: r => U.fmtDateTime(r.expedit_at) },
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.recebido_at || r.received_at) },
        {
          label: 'Ações',
          render: (r) => {
            const wrap = document.createElement('div');
            wrap.className = 'action-buttons';
            if (r.status === 'SOLICITADO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Expedido';
              b.addEventListener('click', () => {
                if (!guardProcessWrite('procMsg')) return;
                 showSgExpForm(r);
              });
              wrap.appendChild(b);
            } else if (r.status === 'EXPEDIDO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Recebido';
              b.addEventListener('click', () => {
                if (!guardProcessWrite('procMsg')) return;
                  showSgRecForm(r);
              });
              wrap.appendChild(b);
            }
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = 'Excluir';
            del.addEventListener('click', async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!guardProcessWrite('procMsg')) return;
              await deleteSig(r.id);
            });
            wrap.appendChild(del);
            return wrap;
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // === NOVO: abrir PDF de checklist (patch aplicado) ===
  async function abrirChecklistPDF(id) {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,started_at,filled_at,filled_by,profiles:filled_by(name),processes(nup),checklist_templates(name,type,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const startedAt = data.started_at ? U.fmtDateTime(data.started_at) : '—';
      const finishedAt = data.filled_at ? U.fmtDateTime(data.filled_at) : '—';
      const responsible = data.profiles?.name || data.filled_by || '—';

      const url = render(data, {
        mode: 'final',
        startedAt: startedAt || '—',
        finishedAt: finishedAt || '—',
        responsible: responsible || '—'
      });
      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }

  // === NOVO: popup de checklists ===
  async function showChecklistPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ckListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="ckClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#ckClose').addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadChecklistList(procId, 'ckListaPop');
  }

  async function showOpiniaoPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="opListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="opNew">Novo</button><button type="button" id="opClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#opClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#opNew').addEventListener('click', () => {
      if (!guardProcessWrite('procMsg')) return;
      showCadOpiniaoForm(procId);
    });
    dlg.showModal();
    await loadOpiniaoList(procId, 'opListaPop');
  }

  async function showNotifPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ntListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="ntNew">Novo</button><button type="button" id="ntClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#ntClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#ntNew').addEventListener('click', () => {
      if (!guardProcessWrite('procMsg')) return;
      showCadNotifForm(procId);
    });
    dlg.showModal();
    await loadNotifList(procId, 'ntListaPop');
  }

  async function showSigPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="sgListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="sgNew">Novo</button><button type="button" id="sgClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#sgClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#sgNew').addEventListener('click', () => {
      if (!guardProcessWrite('procMsg')) return;
      showCadSigForm(procId);
    });
    dlg.showModal();
    await loadSIGList(procId, 'sgListaPop');
  }

  async function showObsPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="obsListaPop" class="table scrolly">Carregando…</div><div id="obsForm" class="hidden"><textarea id="obsTexto" rows="3"></textarea></div><menu><button type="button" id="obsNova">Nova</button><button type="button" id="obsSalvar" disabled>Salvar</button><button type="button" id="obsFechar">Cancelar</button></menu><div id="obsMsg" class="msg"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#obsFechar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#obsNova').addEventListener('click', () => {
      if (!guardProcessWrite('obsMsg')) return;
      const box = dlg.querySelector('#obsForm');
      box?.classList.remove('hidden');
      const txt = dlg.querySelector('#obsTexto');
      if (txt) txt.value = '';
      dlg.querySelector('#obsSalvar')?.removeAttribute('disabled');
    });
    dlg.querySelector('#obsSalvar').addEventListener('click', async ev => {
      ev.preventDefault();
      if (!guardProcessWrite('obsMsg')) return;
      await salvarObs(procId, dlg);
    });
    dlg.showModal();
    await loadObsList(procId, 'obsListaPop');
  }

  async function salvarObs(procId, dlg) {
    const txt = dlg.querySelector('#obsTexto')?.value.trim();
    if (!txt) return;
    if (!guardProcessWriteSilent('obsMsg')) return;
    try {
      const { error } = await sb
        .from('process_observations')
        .insert({ process_id: procId, text: txt });
      if (error) throw error;
      dlg.querySelector('#obsForm')?.classList.add('hidden');
      dlg.querySelector('#obsSalvar')?.setAttribute('disabled', 'true');
      await loadObsList(procId, 'obsListaPop');
      await loadProcessList();
    } catch (e) {
      U.setMsg('obsMsg', e.message || String(e), true);
    }
  }

  function formatHistoryDetails(det) {
    if (!det) return '';
    try {
      const obj = typeof det === 'string' ? JSON.parse(det) : det;
      return Object.entries(obj)
        .map(([k, v]) => {
          if (v == null) return null;
          const key = k.replace(/_/g, ' ');
          let val = v;
          if (typeof v === 'object') {
            val = JSON.stringify(v);
          } else if (typeof v === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
              val = U.fmtDateTime(v);
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
              val = U.fmtDate(v);
            }
          }
          return `${key}: ${val}`;
        })
        .filter(Boolean)
        .join('; ');
    } catch {
      return typeof det === 'string' ? det : JSON.stringify(det);
    }
  }

  async function showHistoryPopup(procId) {
    if (!procId) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div class="msg">Carregando…</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    try {
      const { data, error } = await sb
        .from('history')
        .select('id,action,details,user_name,created_at')
        .eq('process_id', procId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(r => ({
            ...r,
            user_name: r.user_name || '',
            details_text: formatHistoryDetails(r.details)
          }))
        : [];
      const content = document.createElement('div');
      content.className = 'table scrolly';
      Utils.renderTable(content, [
        { key: 'created_at', label: 'Data', value: r => U.fmtDateTime(r.created_at) },
        { key: 'action', label: 'Ação' },
        { key: 'user_name', label: 'Usuário' },
        { key: 'details_text', label: 'Detalhes' }
      ], rows);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Fechar';
      btn.addEventListener('click', () => dlg.close());
      dlg.innerHTML = '';
      dlg.appendChild(content);
      dlg.appendChild(btn);
    } catch (e) {
      dlg.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // === Cadastro e status ===

  function parseSigNumbers(text) {
    if (!text) return [];
    return text
      .split(/[;,\s]+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const m = p.match(/^(\d{1,3})\/(\d{4})$/);
        if (m) {
          const num = parseInt(m[1], 10);
          const year = parseInt(m[2].slice(-2), 10);
          return year * 1000 + num;
        }
        const n = parseInt(p.replace(/\D/g, ''), 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter(n => n !== null);
  }

  function showCadOpiniaoForm(procId = currentProcId) {
    if (!procId) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Tipo
          <select id="opTipo"><option>ATM</option><option>DT</option><option>CGNA</option></select>
        </label>
        <label>Solicitada em <input type="datetime-local" id="opSolic"></label>
        <menu>
          <button id="btnSalvarOp" type="button">Salvar</button>
          <button type="button" id="btnCancelarOp">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#btnSalvarOp').addEventListener('click', async ev => { ev.preventDefault(); await cadOpiniao(dlg, procId); });
    dlg.querySelector('#btnCancelarOp').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadOpiniao(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('opMsg', 'Selecione um processo.', true);
    if (!guardProcessWriteSilent('opMsg')) return;
    const payload = {
      process_id: procId,
      type: dlg.querySelector('#opTipo')?.value || 'ATM',
      requested_at: dlg.querySelector('#opSolic')?.value ? new Date(dlg.querySelector('#opSolic').value).toISOString() : new Date().toISOString(),
      status: 'SOLICITADO'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('opMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('internal_opinions').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(procId, 'opListaPop');
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showCadNotifForm(procId = currentProcId) {
    if (!procId) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Tipo
          <select id="ntTipo">${NOTIFICATION_OPTIONS}</select>
        </label>
        <label>Solicitada em <input type="datetime-local" id="ntSolic"></label>
        <menu>
          <button id="btnSalvarNt" type="button">Salvar</button>
          <button type="button" id="btnCancelarNt">Cancelar</button>
        </menu>
        <div id="ntCadMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#btnSalvarNt')?.addEventListener('click', async ev => {
      ev.preventDefault();
      await cadNotif(dlg, procId);
    });
    dlg.querySelector('#btnCancelarNt')?.addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadNotif(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('ntCadMsg', 'Selecione um processo.', true);
    if (!guardProcessWriteSilent('ntCadMsg')) return;
    const tipo = dlg.querySelector('#ntTipo')?.value || '';
    if (!tipo) return U.setMsg('ntCadMsg', 'Selecione o tipo de notificação.', true);
    const solicitadaEm = dlg.querySelector('#ntSolic')?.value || '';
    const payload = {
      process_id: procId,
      type: tipo,
      requested_at: solicitadaEm ? new Date(solicitadaEm).toISOString() : new Date().toISOString(),
      status: 'SOLICITADA'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('ntCadMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('notifications').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (procId && el('ntListaPop')) await loadNotifList(procId, 'ntListaPop');
      if (procId && el('ntLista')) await loadNotifList(procId, 'ntLista');
    } catch (e) {
      U.setMsg('ntCadMsg', e.message || String(e), true);
    }
  }

  function showCadSigForm(procId = currentProcId) {
    if (!procId) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Tipo
          <select id="sgTipo">${SIGADAER_OPTIONS}</select>
        </label>
        <label>Município
          <select id="sgMunicipio" disabled>
            <option value="">Carregando municípios…</option>
          </select>
        </label>
        <label>Números (separe com espaços, vírgulas ou ponto e vírgula)
          <input type="text" id="sgNumeros" placeholder="123456; 654321">
        </label>
        <label>Prazo (dias)
          <input type="number" id="sgPrazo" min="0" step="1" placeholder="30">
        </label>
        <label>Solicitada em <input type="datetime-local" id="sgSolic"></label>
        <menu>
          <button id="btnSalvarSg" type="button">Salvar</button>
          <button type="button" id="btnCancelarSg">Cancelar</button>
        </menu>
        <div id="sgCadMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    const tipoSelect = dlg.querySelector('#sgTipo');
    const prazoInput = dlg.querySelector('#sgPrazo');
    const municipioSelect = dlg.querySelector('#sgMunicipio');
    const msgEl = dlg.querySelector('#sgCadMsg');
    const applyDefaultPrazo = () => {
      if (!tipoSelect || !prazoInput) return;
      const defaultPrazo = SIGADAER_DEFAULT_DEADLINES.get(tipoSelect.value);
      if (defaultPrazo !== undefined) {
        prazoInput.value = String(defaultPrazo);
      } else {
        prazoInput.value = '';
      }
    };
    applyDefaultPrazo();
    tipoSelect?.addEventListener('change', () => {
      applyDefaultPrazo();
    });
    populateMunicipalitySelect(municipioSelect, msgEl);
    dlg.querySelector('#btnSalvarSg')?.addEventListener('click', async ev => {
      ev.preventDefault();
      await cadSig(dlg, procId);
    });
    dlg.querySelector('#btnCancelarSg')?.addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadSig(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('sgCadMsg', 'Selecione um processo.', true);
    if (!guardProcessWriteSilent('sgCadMsg')) return;
    const tipo = dlg.querySelector('#sgTipo')?.value || '';
    if (!tipo) return U.setMsg('sgCadMsg', 'Selecione o tipo de SIGADAER.', true);
    const numerosTexto = dlg.querySelector('#sgNumeros')?.value || '';
    const numeros = Array.from(new Set(parseSigNumbers(numerosTexto)));
    if (!numeros.length) return U.setMsg('sgCadMsg', 'Informe ao menos um número SIGADAER válido.', true);
    const municipioSelect = dlg.querySelector('#sgMunicipio');
    if (!municipioSelect) return U.setMsg('sgCadMsg', 'Campo de município indisponível.', true);
    if (municipioSelect.disabled) return U.setMsg('sgCadMsg', 'Aguarde o carregamento da lista de municípios.', true);
    const municipioIdValue = municipioSelect.value || '';
    if (!municipioIdValue) return U.setMsg('sgCadMsg', 'Selecione o município do SIGADAER.', true);
    let municipioData = getSigMunicipalityById(municipioIdValue);
    if (!municipioData) {
      try {
        await ensureMunicipalitiesLoaded();
        municipioData = getSigMunicipalityById(municipioIdValue);
      } catch (loadErr) {
        console.error(loadErr);
        return U.setMsg('sgCadMsg', 'Não foi possível carregar os municípios. Tente novamente.', true);
      }
    }
    if (!municipioData) return U.setMsg('sgCadMsg', 'Município inválido.', true);
    const solicitadaEm = dlg.querySelector('#sgSolic')?.value || '';
    const prazoTexto = dlg.querySelector('#sgPrazo')?.value || '';
    const prazoDiasValor = prazoTexto ? parseInt(prazoTexto, 10) : NaN;
    const prazoDias = Number.isNaN(prazoDiasValor) || prazoDiasValor <= 0 ? null : prazoDiasValor;
    const requestedAtIso = solicitadaEm ? new Date(solicitadaEm).toISOString() : new Date().toISOString();
    const payload = {
      process_id: procId,
      type: tipo,
      requested_at: requestedAtIso,
      status: 'SOLICITADO',
      numbers: numeros,
      municipality_name: municipioData.name,
      municipality_uf: municipioData.uf
    };
    if (prazoDias !== null) payload.deadline_days = prazoDias;
    try {
      const u = await getUser();
      if (!u) return U.setMsg('sgCadMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('sigadaer').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      try {
        const historyDetails = {
          tipo,
          numeros,
          municipio: municipioData.name,
          uf: municipioData.uf,
          requested_at: requestedAtIso
        };
        if (prazoDias !== null) historyDetails.prazo_dias = prazoDias;
        await sb.from('history').insert({
          process_id: procId,
          action: 'SIGADAER criado',
          details: historyDetails,
          user_id: u.id,
          user_name: (u.user_metadata && u.user_metadata.name) || u.email || u.id
        });
      dlg.close();
      await loadProcessList();
      if (procId && el('sgListaPop')) await loadSIGList(procId, 'sgListaPop');
      if (procId && el('sgLista')) await loadSIGList(procId, 'sgLista');
    } catch (e) {
      U.setMsg('sgCadMsg', e.message || String(e), true);
    }
  }

  function showOpRecForm(id) {
    editingOpId = id;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Recebido em <input type="datetime-local" id="opRecInput"></label>
        <menu>
          <button id="btnSalvarOpRec" type="button">Salvar</button>
          <button type="button" id="btnCancelarOpRec">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingOpId = null; });
    dlg.querySelector('#btnSalvarOpRec').addEventListener('click', async ev => {
      ev.preventDefault();
      await salvarOpRec(dlg);
    });
    dlg.querySelector('#btnCancelarOpRec').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  function showOpFinForm(id) {
    editingOpId = id;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Finalizado em <input type="datetime-local" id="opFinInput"></label>
        <menu>
          <button id="btnSalvarOpFin" type="button">Salvar</button>
          <button type="button" id="btnCancelarOpFin">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingOpId = null; });
    dlg.querySelector('#btnSalvarOpFin').addEventListener('click', async ev => {
      ev.preventDefault();
      await salvarOpFin(dlg);
    });
    dlg.querySelector('#btnCancelarOpFin').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarOpRec(dlg) {
    if (!editingOpId) return;
    if (!guardProcessWriteSilent('opMsg')) return;
    const input = dlg.querySelector('#opRecInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(popupProcId || currentProcId, 'opListaPop');
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function salvarOpFin(dlg) {
    if (!editingOpId) return;
    if (!guardProcessWriteSilent('opMsg')) return;
    const input = dlg.querySelector('#opFinInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'FINALIZADO', finalized_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(popupProcId || currentProcId, 'opListaPop');
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function deleteOpinion(id) {
    if (!id) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    if (!confirm('Excluir este parecer interno?')) return;
    const procId = popupProcId || currentProcId;
    try {
      const { error } = await sb
        .from('internal_opinions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadProcessList();
      if (procId && el('opListaPop')) await loadOpiniaoList(procId, 'opListaPop');
      if (procId && el('opLista')) await loadOpiniaoList(procId, 'opLista');
    } catch (e) {
      alert(`Falha ao excluir parecer interno: ${e.message || String(e)}`);
      console.error(e);
    }
  }

  function showNtLidaForm(id) {
    editingNtId = id;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Lida em <input type="datetime-local" id="ntLidaInput"></label>
        <menu>
          <button id="btnSalvarNtLida" type="button">Salvar</button>
          <button type="button" id="btnCancelarNtLida">Cancelar</button>
        </menu>
        <div id="ntMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingNtId = null; });
    dlg.querySelector('#btnSalvarNtLida').addEventListener('click', async ev => { ev.preventDefault(); await salvarNtLida(dlg); });
    dlg.querySelector('#btnCancelarNtLida').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  // NOVO (patch): marcar notificação como RESPONDIDA/Resolvida
  function showNtResolvidaForm(id, respondedAt) {
    editingNtId = id;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Resolvida em <input type="datetime-local" id="ntResolvidaInput"></label>
        <menu>
          <button id="btnSalvarNtResolvida" type="button">Salvar</button>
          <button type="button" id="btnCancelarNtResolvida">Cancelar</button>
        </menu>
        <div id="ntResolvidaMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('#ntResolvidaInput');
    if (input) input.value = U.toDateTimeLocalValue(respondedAt) || '';
    dlg.addEventListener('close', () => { dlg.remove(); editingNtId = null; });
    dlg.querySelector('#btnSalvarNtResolvida').addEventListener('click', async ev => { ev.preventDefault(); await salvarNtResolvida(dlg); });
    dlg.querySelector('#btnCancelarNtResolvida').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarNtLida(dlg) {
    if (!editingNtId) return;
    if (!guardProcessWriteSilent('ntMsg')) return;
    const input = dlg.querySelector('#ntLidaInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('notifications')
        .update({ status: 'LIDA', read_at: dt })
        .eq('id', editingNtId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('ntListaPop')) await loadNotifList(popupProcId || currentProcId, 'ntListaPop');
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  // NOVO (patch): persistir RESPONDIDA/Resolvida
  async function salvarNtResolvida(dlg) {
    if (!editingNtId) return;
    if (!guardProcessWriteSilent('ntResolvidaMsg')) return;
    const input = dlg.querySelector('#ntResolvidaInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    const procId = popupProcId || currentProcId;
    try {
      const { error } = await sb
        .from('notifications')
        .update({ status: 'RESPONDIDA', responded_at: dt })
        .eq('id', editingNtId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (procId && el('ntListaPop')) await loadNotifList(procId, 'ntListaPop');
      if (procId && el('ntLista')) await loadNotifList(procId, 'ntLista');
    } catch (e) {
      U.setMsg('ntResolvidaMsg', e.message || String(e), true);
    }
  }

  async function deleteNotification(id) {
    if (!id) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    if (!confirm('Excluir esta notificação?')) return;
    const procId = popupProcId || currentProcId;
    try {
      const { error } = await sb
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadProcessList();
      if (procId && el('ntListaPop')) await loadNotifList(procId, 'ntListaPop');
      if (procId && el('ntLista')) await loadNotifList(procId, 'ntLista');
    } catch (e) {
      alert(`Falha ao excluir notificação: ${e.message || String(e)}`);
      console.error(e);
    }
  }

  function showSgExpForm(sigadaerRowOrId) {
    const row = (sigadaerRowOrId && typeof sigadaerRowOrId === 'object') ? sigadaerRowOrId : null;
    editingSgId = row?.id || sigadaerRowOrId;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <p class="sgInfo" id="sgMunicipioInfo">Município: carregando…</p>
        <label>Expedida em <input type="datetime-local" id="sgExpInput"></label>
        <menu>
          <button id="btnSalvarSgExp" type="button">Salvar</button>
          <button type="button" id="btnCancelarSgExp">Cancelar</button>
        </menu>
        <div id="sgMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingSgId = null; });
    populateSigMunicipalityInfo(dlg.querySelector('#sgMunicipioInfo'), row || editingSgId);
    dlg.querySelector('#btnSalvarSgExp').addEventListener('click', async ev => {
      ev.preventDefault();
      await salvarSgExp(dlg);
    });
    dlg.querySelector('#btnCancelarSgExp').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  function showSgRecForm(sigadaerRowOrId) {
    const row = (sigadaerRowOrId && typeof sigadaerRowOrId === 'object') ? sigadaerRowOrId : null;
    editingSgId = row?.id || sigadaerRowOrId;
    if (!guardProcessWriteSilent('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <p class="sgInfo" id="sgMunicipioInfo">Município: carregando…</p>
        <label>Recebida em <input type="datetime-local" id="sgRecInput"></label>
        <menu>
          <button id="btnSalvarSgRec" type="button">Salvar</button>
          <button type="button" id="btnCancelarSgRec">Cancelar</button>
        </menu>
        <div id="sgMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingSgId = null; });
    populateSigMunicipalityInfo(dlg.querySelector('#sgMunicipioInfo'), row || editingSgId);
    dlg.querySelector('#btnSalvarSgRec').addEventListener('click', async ev => {
      ev.preventDefault();
      await salvarSgRec(dlg);
    });
    dlg.querySelector('#btnCancelarSgRec').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarSgExp(dlg) {
    if (!editingSgId) return;
    if (!guardProcessWriteSilent('sgMsg')) return;
    const input = dlg.querySelector('#sgExpInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'EXPEDIDO', expedit_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('sgListaPop')) await loadSIGList(popupProcId || currentProcId, 'sgListaPop');
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function deleteSig(id) {
    if (!id) return;
    if (!guardProcessWriteSilent('procMsg')) return;
    if (!confirm('Excluir este SIGADAER?')) return;
    const procId = popupProcId || currentProcId;
    try {
      const { error } = await sb
        .from('sigadaer')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadProcessList();
      if (procId && el('sgListaPop')) await loadSIGList(procId, 'sgListaPop');
      if (procId && el('sgLista')) await loadSIGList(procId, 'sgLista');
    } catch (e) {
      alert(`Falha ao excluir SIGADAER: ${e.message || String(e)}`);
      console.error(e);
    }
  }

  async function salvarSgRec(dlg) {
    if (!editingSgId) return;
    if (!guardProcessWriteSilent('sgMsg')) return;
    const input = dlg.querySelector('#sgRecInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      dlg.close();
      await loadProcessList();
      if (el('sgListaPop')) await loadSIGList(popupProcId || currentProcId, 'sgListaPop');
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Atualização de botões extras / listas ===

  async function reloadLists() {
    await loadProcessList();
    if (popupProcId && el('ckListaPop')) await loadChecklistList(popupProcId, 'ckListaPop');
  }

  function bindEvents() {
    Array.from(document.querySelectorAll('[data-tab]')).forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc');

    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    if (el('btnBuscarProc')) el('btnBuscarProc').addEventListener('click', (ev) => { ev.preventDefault(); buscarProcesso(); });
    if (el('btnLimparProc')) el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); loadProcessList(); });
    if (el('procNUP')) el('procNUP').addEventListener('input', () => { currentNUP = el('procNUP').value.trim(); syncNupFields(); });

    // formulário principal permanece oculto por padrão
  }

  async function init() {
    bindEvents();
    clearProcessForm();     // apenas NUP + Buscar habilitados
    await loadProcessList();

    // suporte à pré-seleção de NUP (ex.: navegar a partir de outra view)
    const pre = sessionStorage.getItem('procPreSelect');
    if (pre && el('procNUP')) {
      sessionStorage.removeItem('procPreSelect');
      el('procNUP').value = pre;
      await buscarProcesso();
    }
  }

  return { init, reloadLists, CLIPBOARD_ICON };
})();
