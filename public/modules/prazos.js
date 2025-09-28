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

  // Formata NUP (Número Único de Protocolo) no padrão XXXXXX/XXXX-00,
  // aceitando entradas com ou sem prefixo de 5 dígitos e com/sem pontuação.
  function formatNup(nup) {
    if (!nup) return '';
    const digits = String(nup).replace(/\D/g, '');
    if (digits.length < 10) return String(nup);
    const core = digits.slice(-10);
    const part1 = core.slice(0, 6);
    const part2 = core.slice(6, 10);
    return `${part1}/${part2}-00`;
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'read_at', label: 'Leitura', value: r => Utils.fmtDate(r.read_at) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'requested_at', label: 'Solicitado em', value: r => Utils.fmtDate(r.requested_at) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' }
  ];

  const SOBRE_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'read_date', label: 'Leitura', value: r => Utils.fmtDate(r.read_date) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  function renderTable(boxId, columns, rows) {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (!rows) rows = [];
    let tbl = box.querySelector('table');
    if (!tbl) {
      tbl = document.createElement('table');
      const th = columns.map(c => `<th>${c.label}</th>`).join('');
      tbl.innerHTML = `<thead><tr>${th}</tr></thead><tbody></tbody>`;
      box.appendChild(tbl);
    }
    const tbody = tbl.querySelector('tbody');
    tbody.innerHTML = rows.map(r => {
      const tds = columns.map(c => `<td>${(c.value ? c.value(r) : r[c.key]) ?? ''}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
  }

  async function loadData() {
    try {
      // Views consolidadas de prazos
      const p1 = sb.from('v_prazo_pareceres').select('*');
      const p2 = sb.from('v_prazo_remocao_rebaixamento').select('*');
      const p3 = sb.from('v_prazo_termino_obra').select('*');
      const p4 = sb.from('v_prazo_sobrestamento').select('*');
      const p5 = sb.from('v_prazo_do_aga').select('*');
      const p6 = sb.from('v_prazo_ad_hel').select('*');

      const [{ data: d1, error: e1 },
             { data: d2, error: e2 },
             { data: d3, error: e3 },
             { data: d4, error: e4 },
             { data: d5, error: e5 },
             { data: d6, error: e6 }] = await Promise.all([p1,p2,p3,p4,p5,p6]);

      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
      if (e4) throw e4; if (e5) throw e5; if (e6) throw e6;

      pareceres = d1 || [];
      remocao = d2 || [];
      obras = d3 || [];
      sobrestamento = d4 || [];
      doaga = d5 || [];
      adhel = d6 || [];

      render();
    } catch (e) {
      const msg = e?.message || String(e);
      console.error(e);
      const box = document.getElementById('prazosMsg');
      if (box) box.textContent = msg;
    }
  }

  function render() {
    renderTable('prazosPareceres', PARECERES_COLUMNS, pareceres);
    renderTable('prazosRemocao', REMOCAO_COLUMNS, remocao);
    renderTable('prazosObras', OBRAS_COLUMNS, obras);
    renderTable('prazosSobrestamento', SOBRE_COLUMNS, sobrestamento);
    renderTable('prazosDOAGA', DOAGA_COLUMNS, doaga);
    renderTable('prazosADHEL', ADHEL_COLUMNS, adhel);
  }

  async function init() {
    await loadData();
  }

  return { init };
})();
