// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];
  let remocao = [];
  let obras = [];
  let sobrestamento = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];

  // Formata NUP (Número Único de Protocolo) no padrão XXXXX/XXXX-XX,
  // desconsiderando os 5 dígitos iniciais (prefixo) caso existam.
  function formatNup(nup) {
    if (!nup) return '';
    const digits = String(nup).replace(/\D/g, '');
    if (digits.length <= 5) return '';
    const rest = digits.slice(5);
    const part1 = rest.slice(0, 6);
    const part2 = rest.slice(6, 10);
    const part3 = rest.slice(10, 12);
    let formatted = part1;
    if (part2) formatted += `/${part2}`;
    if (part3) formatted += `-${part3}`;
    return formatted;
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'type', label: 'Tipo' },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    {
      key: 'due_date',
      label: 'Prazo',
      value: r => Utils.fmtDate(r.due_date),
      render: r => {
        const prazo = Utils.fmtDate(r.due_date);
        if (!r.em_atraso) return `<div>${prazo}</div>`;
        return `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>`;
      }
    },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          sessionStorage.setItem('procPreSelect', data.nup);
          window.location.href = 'processos.html';
        });
      } catch {}
    });
  }

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = getPareceresRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb.from('v_prazo_pareceres').select('nup,type,due_date,days_remaining'),
      sb.from('v_prazo_pareceres_externos').select('nup,type,due_date,days_remaining')
    ]);
    pareceres = [...(intRes.data || []), ...(extRes.data || [])]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderPareceres();
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = data || [];
    renderObra();
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderSobrestamento();
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderMonitor();
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,due_date,days_remaining');
    doaga = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderDOAGA();
  }

  function getAdhelRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = getAdhelRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  const PDF_SECTIONS = {
    pareceres: { title: 'Pareceres/Info', columns: PARECERES_COLUMNS, getRows: getPareceresRows },
    remocao: { title: 'Remoção/Rebaixamento', columns: REMOCAO_COLUMNS, getRows: getRemocaoRows },
    obras: { title: 'Término de Obra', columns: OBRAS_COLUMNS, getRows: getObraRows },
    sobrestamento: { title: 'Sobrestamento', columns: SOBRESTAMENTO_COLUMNS, getRows: getSobrestamentoRows },
    monitor: { title: 'Leitura/Expedição', columns: MONITOR_COLUMNS, getRows: getMonitorRows },
    doaga: { title: 'Prazo DO-AGA', columns: DOAGA_COLUMNS, getRows: getDoagaRows },
    adhel: { title: 'Realizar inscrição', columns: ADHEL_COLUMNS, getRows: getAdhelRows }
  };

  function exportPrazoPDF(section) {
    const config = PDF_SECTIONS[section];
    if (!config) return;
    if (!window.jspdf?.jsPDF) {
      alert('Biblioteca de PDF indisponível.');
      return;
    }

    const data = typeof config.getRows === 'function' ? config.getRows() : [];
    const rows = Array.isArray(data) ? data : [];
    const doc = new window.jspdf.jsPDF();
    const margin = 15;
    const lineHeight = 6;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const maxY = pageHeight - margin;
    let y = margin;

    const ensureSpace = (extra = lineHeight) => {
      if (y + extra > maxY) {
        doc.addPage();
        y = margin;
      }
    };

    const addParagraph = (text, opts = {}) => {
      if (text == null || text === '') return;
      const parts = doc.splitTextToSize(String(text), contentWidth);
      parts.forEach(line => {
        ensureSpace();
        doc.text(line, margin, y, opts);
        y += lineHeight;
      });
    };

    const addGap = (amount = lineHeight) => {
      ensureSpace(amount);
      y += amount;
    };

    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    addParagraph(config.title, { align: 'left' });
    addGap(lineHeight / 2);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    addParagraph(`Gerado em: ${Utils.fmtDateTime(new Date())}`);
    addGap(lineHeight / 2);

    if (!rows.length) {
      addParagraph('Nenhum registro disponível.');
    } else {
      rows.forEach(row => {
        const text = config.columns
          .map(col => {
            const label = col.label || '';
            let value = '';
            if (typeof col.pdfValue === 'function') value = col.pdfValue(row);
            else if (typeof col.value === 'function') value = col.value(row);
            else if (col.key) value = row[col.key];
            if (value instanceof Date) value = Utils.fmtDateTime(value);
            if (value == null) value = '';
            value = String(value);
            if (label) return `${label}: ${value}`;
            return value;
          })
          .filter(Boolean)
          .join('  |  ');
        addParagraph(text);
        addGap(lineHeight / 2);
      });
    }

    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
  }

  function bindPdfButtons() {
    document.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-pdf');
        exportPrazoPDF(section);
      });
    });
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderADHEL();
  }

  function init() {
    bindPdfButtons();
  }

  async function load() {
    await Promise.all([
      loadPareceres(),
      loadRemocao(),
      loadObra(),
      loadSobrestamento(),
      loadMonitor(),
      loadDOAGA(),
      loadADHEL()
    ]);
  }

  return { init, load };
})();
