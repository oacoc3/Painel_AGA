// public/process_ring.js
// Retro Elegant Process Ring (dias/processo)
// API (Interface de Programação de Aplicações): window.AppComponents.ProcessRing.create(container, options)
// NUP = Número Único de Protocolo
// SVG = Scalable Vector Graphics
// ARIA = Accessible Rich Internet Applications

window.AppComponents = window.AppComponents || {};
window.AppComponents.ProcessRing = (() => {
  const TAU = Math.PI * 2;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Mapeia valor (dias/processo) para "ok/warn/bad"
  function band(value, min, max) {
    const t = (value - min) / Math.max(1e-6, (max - min));
    if (t <= 1/3) return 'ok';
    if (t <= 2/3) return 'warn';
    return 'bad';
  }

  // Constrói as marcas (ticks) em SVG
  function buildTicks(svg, cx, cy, rOuter, count = 60) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'ticks');
    for (let i = 0; i < count; i++) {
      const major = (i % (count / 12) === 0); // 12 maiores
      const a = (-Math.PI / 2) + (i / count) * TAU; // começa no topo
      const r1 = rOuter - (major ? 6 : 3);
      const r2 = rOuter - 1;
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy + Math.sin(a) * r1;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2;
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1.toFixed(3));
      ln.setAttribute('y1', y1.toFixed(3));
      ln.setAttribute('x2', x2.toFixed(3));
      ln.setAttribute('y2', y2.toFixed(3));
      ln.setAttribute('stroke-width', major ? 1.6 : 1);
      g.appendChild(ln);
    }
    svg.appendChild(g);
  }

  // Cria arco básico (círculo com stroke)
  function makeCircle(svg, cx, cy, r, cls, strokeWidth) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('class', cls);
    c.setAttribute('stroke-width', strokeWidth);
    svg.appendChild(c);
    return c;
  }

  // Linha alvo (notch)
  function makeTarget(svg, cx, cy, rOuter) {
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    a.setAttribute('class', 'target');
    a.setAttribute('stroke', '#222');
    a.setAttribute('stroke-width', 1.8);
    svg.appendChild(a);
    return a;
  }

  function setTargetLine(el, cx, cy, rOuter, value, min, max) {
    if (value == null || isNaN(value)) {
      el.setAttribute('x1', cx); el.setAttribute('y1', cy);
      el.setAttribute('x2', cx); el.setAttribute('y2', cy);
      return;
    }
    const t = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
    const angle = (-Math.PI / 2) + t * TAU;
    const r1 = rOuter - 10;
    const r2 = rOuter - 2;
    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;
    el.setAttribute('x1', x1.toFixed(2));
    el.setAttribute('y1', y1.toFixed(2));
    el.setAttribute('x2', x2.toFixed(2));
    el.setAttribute('y2', y2.toFixed(2));
  }

  function formatValue(v) {
    if (v == null || isNaN(v)) return '—';
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }

  function create(container, opts) {
    const options = Object.assign({
      nup: '00000.000000/0000-00', // NUP (Número Único de Protocolo)
      status: 'Em análise',
      speed: 7.5,     // dias/processo (quanto menor, mais rápido)
      min: 0,
      max: 30,        // ajuste conforme sua realidade
      target: 10,     // meta/linha de referência (opcional)
      sizeClass: '',  // '', 'sm', 'lg'
      ariaLabel: 'Velocidade de tramitação em dias por processo'
    }, opts || {});

    // Raio e medidas baseadas no viewBox
    const vb = 100;
    const cx = vb / 2, cy = vb / 2;
    const r = 42;           // raio do arco principal
    const stroke = 8;       // espessura do arco
    const rOuter = r + stroke/2 + 6; // para os ticks

    // Raiz
    const root = document.createElement('div');
    root.className = `process-ring ${options.sizeClass || ''}`;
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', options.ariaLabel);

    // SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${vb} ${vb}`);

    // Trilhas
    const track = makeCircle(svg, cx, cy, r, 'track', stroke);
    const progress = makeCircle(svg, cx, cy, r, 'progress', stroke);
    progress.setAttribute('stroke-dasharray', '0 999');
    progress.setAttribute('stroke', 'currentColor'); // cor virá via classe ok/warn/bad

    // Ticks
    buildTicks(svg, cx, cy, rOuter, 60);

    // Target (meta)
    const target = makeTarget(svg, cx, cy, rOuter);

    // Centro (HTML)
    const center = document.createElement('div');
    center.className = 'center';
    center.innerHTML = `
      <div class="nup" title="NUP (Número Único de Protocolo)">${options.nup}</div>
      <div class="status" title="Status do processo">${options.status}</div>
      <div class="metric" aria-hidden="true">
        <span class="value">${formatValue(options.speed)}</span>
        <span class="unit">dias/processo</span>
      </div>
      <div class="sr-only">Valor atual: ${formatValue(options.speed)} dias por processo.</div>
    `;

    root.appendChild(svg);
    root.appendChild(center);
    container.appendChild(root);

    // Função de atualização do arco e classes de cor
    function render() {
      const { speed, min, max, target: tgt } = options;
      const C = 2 * Math.PI * r;

      // PATCH: robustez quando speed for ausente/não numérico
      const hasSpeed = typeof speed === 'number' && Number.isFinite(speed);
      const safeSpeed = hasSpeed ? speed : 0;
      const pct = hasSpeed
        ? clamp((safeSpeed - min) / Math.max(1e-6, max - min), 0, 1)
        : 0;

      progress.setAttribute('stroke-dasharray', `${(C * pct).toFixed(2)} ${(C * (1 - pct)).toFixed(2)}`);

      // Cor por faixa (somente se houver speed válido)
      root.classList.remove('ok', 'warn', 'bad');
      if (hasSpeed) {
        root.classList.add(band(safeSpeed, min, max));
      }

      // alvo
      setTargetLine(target, cx, cy, rOuter, tgt, min, max);

      // números e textos
      center.querySelector('.value').textContent = formatValue(hasSpeed ? safeSpeed : NaN);
      center.querySelector('.nup').textContent = options.nup || '';
      center.querySelector('.status').textContent = options.status || '';
    }

    render();

    // API pública
    return {
      el: root,
      update(partial) {
        Object.assign(options, partial || {});
        render();
      }
    };
  }

  return { create };
})();
