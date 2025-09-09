diff --git a/public/utils.js b/public/utils.js
index 07ceba83552feea70faee1fc8cb9f42f7c9a9b60..9d12f0dc0bee53e04b7e2650e4e6937a20c157e5 100644
--- a/public/utils.js
+++ b/public/utils.js
@@ -16,64 +16,72 @@ function setText(id, txt) {
 }
 
 function setMsg(id, txt, isError = false) {
   const e = el(id);
   if (!e) return;
   e.textContent = txt || '';
   e.classList.toggle('error', !!isError);
 }
 
 // Normaliza valor para “apenas data” (00:00:00 local)
 function dateOnly(v) {
   if (!v) return null;
   if (v instanceof Date) {
     return new Date(v.getFullYear(), v.getMonth(), v.getDate());
   }
   if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
     const [y, m, d] = v.split('-').map(Number);
     return new Date(y, m - 1, d);
   }
   const x = new Date(v);
   if (Number.isNaN(+x)) return null;
   return new Date(x.getFullYear(), x.getMonth(), x.getDate());
 }
 
 function fmtDate(d) {
-  const x = dateOnly(d);
-  if (!x) return '';
-  const y = x.getFullYear();
-  const m = String(x.getMonth()+1).padStart(2, '0');
-  const day = String(x.getDate()).padStart(2, '0');
-  return `${day}/${m}/${y}`;
+  if (!d) return '';
+  const x = (d instanceof Date) ? d : new Date(d);
+  if (Number.isNaN(+x)) return '';
+  return new Intl.DateTimeFormat('pt-BR', {
+    timeZone: 'America/Sao_Paulo',
+    day: '2-digit',
+    month: '2-digit',
+    year: '2-digit'
+  }).format(x);
 }
 function fmtDateTime(d) {
   if (!d) return '';
   const x = (d instanceof Date) ? d : new Date(d);
   if (Number.isNaN(+x)) return '';
-  const hh = String(x.getHours()).padStart(2, '0');
-  const mm = String(x.getMinutes()).padStart(2, '0');
-  return `${fmtDate(x)} ${hh}:${mm}`;
+  const dt = fmtDate(x);
+  let tm = new Intl.DateTimeFormat('pt-BR', {
+    timeZone: 'America/Sao_Paulo',
+    hour: '2-digit',
+    minute: '2-digit'
+  }).format(x);
+  tm = tm.replace(':', '/');
+  return `${dt} ${tm}`;
 }
 function toDateInputValue(date) {
   const x = (date instanceof Date) ? date : new Date(date);
   if (Number.isNaN(+x)) return '';
   const y = x.getFullYear();
   const m = String(x.getMonth()+1).padStart(2, '0');
   const d = String(x.getDate()).padStart(2, '0');
   return `${y}-${m}-${d}`;
 }
 function toDateTimeLocalValue(date) {
   const x = (date instanceof Date) ? date : new Date(date);
   if (Number.isNaN(+x)) return '';
   const y = x.getFullYear();
   const m = String(x.getMonth()+1).padStart(2, '0');
   const d = String(x.getDate()).padStart(2, '0');
   const hh = String(x.getHours()).padStart(2, '0');
   const mm = String(x.getMinutes()).padStart(2, '0');
   return `${y}-${m}-${d}T${hh}:${mm}`;
 }
 function daysBetween(a, b = new Date()) {
   const d1 = dateOnly(a), d2 = dateOnly(b);
   if (!d1 || !d2) return '';
   return Math.round((d2 - d1) / (24*3600*1000));
 }
