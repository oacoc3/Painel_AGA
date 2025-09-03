// Utilidades de UI (User Interface)
export function showRoute(id){
  document.querySelectorAll('.route').forEach(r => r.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

export function setNavVisible(visible){
  const nav = document.getElementById('main-nav');
  const userbox = document.getElementById('userbox');
  if (visible){ nav.classList.remove('hidden'); userbox.classList.remove('hidden'); }
  else { nav.classList.add('hidden'); userbox.classList.add('hidden'); }
}

export function fillSelect(el, options){
  el.innerHTML = '';
  for (const {value, label} of options){
    const o = document.createElement('option');
    o.value = value; o.textContent = label ?? value;
    el.appendChild(o);
  }
}

export const STATUS = [
  'ANADOC','ANATEC-PRE','ANATEC','ANAICA',
  'SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL',
  'APROV','ARQ'
];

export function fmtDate(d){
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR');
}
export function fmtDateTime(d){
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR');
}
export function daysBetween(aDate, bDate){
  const a = new Date(aDate), b = new Date(bDate);
  return Math.round((b - a) / (1000*60*60*24));
}

export function setBuildInfo(text){ document.getElementById('build-info').textContent = text; }

// Habilita botões "Salvar" apenas quando há mudanças
export function dirtyWatcher(formEl, buttonEl){
  const initial = new FormData(formEl);
  function changed(){
    const now = new FormData(formEl);
    for (const [k,v] of now){
      if (initial.get(k) !== v) return true;
    }
    return false;
  }
  const handler = () => { buttonEl.disabled = !changed(); };
  formEl.addEventListener('input', handler);
  formEl.addEventListener('change', handler);
  handler();
}
