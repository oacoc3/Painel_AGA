/* public/modules/ols.js — correção Conical (raio externo), sem mudar o visual */
(function(){
  const DEG = Math.PI/180;
  const el=(id)=>document.getElementById(id);
  const num=(v,d=0)=>{ const x=Number(v); return Number.isFinite(x)?x:d; };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=(x)=> new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(x);

  function setMsg(t,e=false){ const m=el('msg'); if(!m) return; m.textContent=t||''; m.style.color=e?'#b20':'#666'; }

  // (…todo o restante do arquivo permanece igual à sua versão atual…)
  // — Para economizar espaço aqui, só mostro as duas funções onde houve alteração —
  // Se preferir, posso colar o arquivo completo novamente.

  // >>> dentro de drawPlan(), troque apenas este bloco da Conical:
  function drawConicalInPlan(ctx, conical){
    // CORREÇÃO: “run” (desenvolvimento horizontal) = height / (slope/100)
    const run = conical.height / (conical.slope/100);
    const outerR = conical.innerRadius + run;
    drawCircle(ctx, outerR, '#99cc66');
    label(ctx, `Conical Rext≈${fmt(outerR)}m`, 8, 12);
  }

  // ===== A partir daqui é o mesmo desenho de antes, chamando drawConicalInPlan
  // (vou incluir uma versão compacta das funções de desenho para ficar completo)

  function _scaleFromCTX(ctx){ const m=ctx.getTransform(); return Math.hypot(m.a,m.b); }
  function drawPolygon(ctx, poly, style='#0b5'){
    const k=_scaleFromCTX(ctx);
    ctx.beginPath(); poly.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }); ctx.closePath();
    ctx.strokeStyle=style; ctx.lineWidth=2/Math.max(k,0.001); ctx.stroke();
    ctx.globalAlpha=0.06; ctx.fillStyle=style; ctx.fill(); ctx.globalAlpha=1;
  }
  function drawCircle(ctx, r, style='#09f'){ const k=_scaleFromCTX(ctx); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.strokeStyle=style; ctx.lineWidth=2/Math.max(k,0.001); ctx.stroke(); }
  function label(ctx, text, x, y){ const p=ctx.getTransform().transformPoint(new DOMPoint(x,y)); ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#333'; ctx.font='12px system-ui'; ctx.fillText(text,p.x,p.y); ctx.restore(); }

  // Você já tinha todas as demais funções (zoom, perfil, 3D, etc.). 
  // O único ponto alterado na planta é usar drawConicalInPlan() no lugar do cálculo antigo:
  //   const outerR = geom.conical.innerRadius + (geom.conical.height * geom.conical.slope/100);  [INCORRETO]
  // agora ficou:
  //   const run = geom.conical.height / (geom.conical.slope/100);
  //   const outerR = geom.conical.innerRadius + run;                                             [CORRETO]

  // Se preferir que eu entregue o arquivo inteiro novamente, me avise e eu colo completo.
})();
