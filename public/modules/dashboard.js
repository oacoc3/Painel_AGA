diff --git a/public/modules/dashboard.js b/public/modules/dashboard.js
index 7b0c2a1..e19d9a3 100644
--- a/public/modules/dashboard.js
+++ b/public/modules/dashboard.js
@@ -1,6 +1,7 @@
 // public/modules/dashboard.js
 (function () {
   const sb = window.sb;
+  const el = (id) => document.getElementById(id);

   // ... (demais imports/constantes/funções que você já tem)

   // -----------------------------------------------------------------------------
-  // Renderização: Distribuição horária (um gráfico)
-  async function loadHourlyEngagement() {
-    const box = document.getElementById('hourlyEngagementChart');
-    if (!box) return;
+  // Renderização: Distribuição horária (dias úteis x fim de semana)
+  async function loadHourlyEngagement() {
+    const boxWeekdays = el('hourlyEngagementChartWeekdays');
+    const boxWeekend  = el('hourlyEngagementChartWeekend');
+    // Compat: caso o HTML antigo ainda exista, não quebrar
+    const legacyBox   = el('hourlyEngagementChart');
+    if (!boxWeekdays && !boxWeekend && !legacyBox) return;

     try {
-      // ⚠️ Reutilize sua origem atual (RPC/view/tabela). Exemplo genérico:
-      // Esperado: linhas com { hour: 0..23, count: number } OU { hour, dow, count }
-      const { data, error } = await sb.rpc('dashboard_hourly_engagement', { days: 90 });
+      // ⚠️ Reutilize sua origem atual (RPC/view/tabela).
+      // Esperado: linhas com { hour: 0..23, count: number }
+      //           OU { hour: 0..23, dow: 0..6, count: number }
+      // Troque abaixo pela sua chamada real (select / rpc / view):
+      const { data, error } = await sb.rpc('dashboard_hourly_engagement', { days: 90 });
       if (error) throw error;
       const rows = Array.isArray(data) ? data : [];

-      renderHourlyHistogram(box, rows);
+      // Split em dias úteis vs fds; se não houver 'dow', duplica para ambos
+      const split = splitWeekdaysWeekend(rows);
+
+      if (boxWeekdays) {
+        renderHourlyHistogram(boxWeekdays, split.weekdays);
+      } else if (legacyBox) {
+        // compat: se só existir o container legado, mostra dias úteis nele
+        renderHourlyHistogram(legacyBox, split.weekdays);
+      }
+
+      if (boxWeekend) {
+        renderHourlyHistogram(boxWeekend, split.weekend);
+      }
     } catch (err) {
-      console.error('[dashboard] hourly engagement:', err);
-      safeSetChartError('hourlyEngagementChart', 'Falha ao carregar distribuição horária.');
+      console.error('[dashboard] hourly engagement:', err);
+      if (boxWeekdays) safeSetChartError('hourlyEngagementChartWeekdays', 'Falha ao carregar (dias úteis).');
+      if (boxWeekend)  safeSetChartError('hourlyEngagementChartWeekend',  'Falha ao carregar (fim de semana).');
+      if (!boxWeekdays && !boxWeekend && legacyBox) {
+        safeSetChartError('hourlyEngagementChart', 'Falha ao carregar distribuição horária.');
+      }
     }
   }

+  // Se existirem dows (0..6), agrega no cliente para dias úteis (1..5) e fds (0,6).
+  // Caso contrário, duplica a mesma série para ambos.
+  function splitWeekdaysWeekend(rows) {
+    const hasDow = rows.some(r => r.dow != null || r.day_of_week != null);
+    const getDow = (r) => (r.dow != null ? r.dow : r.day_of_week);
+
+    if (!hasDow) {
+      const series = aggregate24(rows);
+      return { weekdays: series, weekend: series };
+    }
+    const wd = rows.filter(r => [1,2,3,4,5].includes(getDow(r)));
+    const we = rows.filter(r => [0,6].includes(getDow(r)));
+    return { weekdays: aggregate24(wd), weekend: aggregate24(we) };
+  }
+
+  // Consolida em 24 bins (0..23), garantindo zeros
+  function aggregate24(rows) {
+    const bins = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
+    for (const r of rows) {
+      const h = Number(r.hour);
+      const c = Number(r.count || 0);
+      if (!Number.isNaN(h) && h >= 0 && h <= 23) {
+        bins[h].count += c;
+      }
+    }
+    return bins;
+  }
+
   // Desenha um histograma de 24 barras dentro de um container
-  function renderHourlyHistogram(containerEl, rows) {
+  function renderHourlyHistogram(containerEl, rows) {
     if (!containerEl) return;
     containerEl.innerHTML = '';

     const data = ensure24(rows);
     const max = Math.max(1, ...data.map(d => d.count || 0));
@@ -45,7 +86,7 @@
     containerEl.appendChild(wrapper);
   }

   // Garante 24 barras (0..23), com zeros onde faltar
   function ensure24(rows) {
-    const map = new Map(rows.map(r => [Number(r.hour), Number(r.count || 0)]));
+    const map = new Map((rows || []).map(r => [Number(r.hour), Number(r.count || 0)]));
     const out = [];
     for (let h = 0; h < 24; h++) {
       out.push({ hour: h, count: map.get(h) || 0 });
@@ -53,6 +94,7 @@
     return out;
   }

   // -----------------------------------------------------------------------------
   // Inicialização
   async function init() {
     try {
       // ... (suas outras cargas de dashboard)
       await loadHourlyEngagement();
     } catch (err) {
       console.error('[dashboard] init:', err);
     }
   }

   window.Modules = window.Modules || {};
   window.Modules.dashboard = { init };
 })();
