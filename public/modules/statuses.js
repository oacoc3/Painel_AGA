// public/modules/statuses.js
window.Modules = window.Modules || {};
window.Modules.statuses = (() => {
  const PROCESS_STATUSES = [
    'CONFEC','REV-OACO','APROV','ICA-PUB','EDICAO','AGD-LEIT','ANADOC',
    'ANATEC-PRE','ANATEC','ANAICA','SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL',
    'DECEA','ARQ'
  ];
  return { PROCESS_STATUSES };
})();
