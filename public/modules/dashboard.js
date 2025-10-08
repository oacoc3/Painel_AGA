--- a/public/modules/dashboard.js
+++ b/public/modules/dashboard.js
@@ -XXX,6 +XXX,7 @@
   async function load() {
     renderEntryChartEmpty('Carregando…');
     renderHourlyEngagementEmpty('Carregando…');
+    const sb = window.sb; // << correção: declarar o cliente Supabase usado adiante
     const yearSelect = el('entryYearSelect');
     if (yearSelect) yearSelect.disabled = true;
 
@@ -YYY,46 +YYY,58 @@
   function renderYearlyActivity() {
     const metricEls = {
       anadoc: el('dashboardMetricAnadoc'),
       anatecPre: el('dashboardMetricAnatecPre'),
       anatec: el('dashboardMetricAnatec'),
       notifications: el('dashboardMetricNotifications'),
       sigadaerJjaer: el('dashboardMetricSigadaerJjaer'),
       sigadaerAgu: el('dashboardMetricSigadaerAgu'),
       sigadaerPref: el('dashboardMetricSigadaerPref') // PREF: Prefeitura
     };
 
     Object.values(metricEls).forEach(node => { if (node) node.textContent = '—'; });
 
     const select = el('entryYearSelect');
     const year = select && select.value ? Number(select.value) : NaN;
     if (!Number.isFinite(year)) return;
 
-    const counters = {
-      anadoc: 0,
-      anatecPre: 0,
-      anatec: 0,
-      notifications: 0,
-      sigadaerJjaer: 0,
-      sigadaerAgu: 0,
-      sigadaerPref: 0
-    };
+    const counters = { anadoc: 0, anatecPre: 0, anatec: 0, notifications: 0, sigadaerJjaer: 0, sigadaerAgu: 0, sigadaerPref: 0 };
+
+    // >>> Correção: contar eventos de ENTRADA no status (por histórico), 1x por processo/ano
+    const statusProcessSets = { anadoc: new Set(), anatecPre: new Set(), anatec: new Set() };
+
+    // 1) Usar o histórico (tabela history já carregada em cachedStatusHistory)
+    Object.entries(cachedStatusHistory || {}).forEach(([procId, list]) => {
+      if (!Array.isArray(list)) return;
+      for (let i = 0; i < list.length; i++) {
+        const cur = list[i];
+        if (!cur || !cur.start || !cur.status) continue;
+        // evitar duplicatas idênticas em sequência:
+        if (i > 0) {
+          const prev = list[i - 1];
+          if (prev && prev.start === cur.start && prev.status === cur.status) continue;
+        }
+        const start = new Date(cur.start);
+        if (Number.isNaN(+start) || start.getFullYear() !== year) continue;
+        const pid = String(procId);
+        if (cur.status === 'ANADOC') statusProcessSets.anadoc.add(pid);
+        if (cur.status === 'ANATEC-PRE') statusProcessSets.anatecPre.add(pid);
+        if (cur.status === 'ANATEC') statusProcessSets.anatec.add(pid);
+      }
+    });
+
+    // 2) Fallback: se não houver histórico para o processo naquele ano, considerar status_since
+    (cachedProcesses || []).forEach(proc => {
+      if (!proc || !proc.id || !proc.status || !proc.status_since) return;
+      const d = new Date(proc.status_since);
+      if (Number.isNaN(+d) || d.getFullYear() !== year) return;
+      const pid = String(proc.id);
+      if (proc.status === 'ANADOC') statusProcessSets.anadoc.add(pid);
+      if (proc.status === 'ANATEC-PRE') statusProcessSets.anatecPre.add(pid);
+      if (proc.status === 'ANATEC') statusProcessSets.anatec.add(pid);
+    });
+
+    counters.anadoc     = statusProcessSets.anadoc.size;
+    counters.anatecPre  = statusProcessSets.anatecPre.size;
+    counters.anatec     = statusProcessSets.anatec.size;
+    // <<< Fim da correção
 
-    // (lógica anterior baseada no status atual removida apenas para estes três contadores)
-    // counters.anadoc / anatecPre / anatec deixavam de contar quando o processo avançava de status
-    // Agora contam “entrada no status”, sem cair quando muda.
-
     // (as demais métricas permanecem iguais)
     (cachedNotifications || []).forEach(notification => {
       if (!notification) return;
       const { requested_at: requestedAt } = notification;
       if (!requestedAt) return;
       const requestedDate = new Date(requestedAt);
       if (!Number.isNaN(+requestedDate) && requestedDate.getFullYear() === year) {
         counters.notifications += 1;
       }
     });
 
     (cachedSigadaer || []).forEach(sigadaer => {
       if (!sigadaer) return;
       const { type, status, expedit_at: expeditAt } = sigadaer;
       if (!expeditAt || status !== 'EXPEDIDO') return;
       const expeditDate = new Date(expeditAt);
       if (Number.isNaN(+expeditDate) || expeditDate.getFullYear() !== year) return;
       const t = typeof type === 'string' ? type.toUpperCase() : '';
       if (t === 'JJAER') counters.sigadaerJjaer += 1;
       if (t === 'AGU')   counters.sigadaerAgu   += 1;
       if (t === 'PREF')  counters.sigadaerPref  += 1;
     });
