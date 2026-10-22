/* =========================================================
   charts.js — Gráficos con Canvas API nativa (sin librerías)
   Barras, líneas/área y dona, con animación de entrada y tooltip.
   ========================================================= */

const Charts = (() => {
  let tooltipEl = null;
  function tooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chart-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function hideTip() { if (tooltipEl) tooltipEl.style.opacity = '0'; }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function animate(canvas, draw) {
    if (api.quiet) { draw(1); return; } // refresco en vivo: sin animación de entrada
    const t0 = performance.now(), DUR = 750;
    function frame(t) {
      if (!canvas.isConnected) return;
      const p = Math.min(1, (t - t0) / DUR);
      draw(1 - Math.pow(1 - p, 3)); // easeOutCubic
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const COLORS = ['#2d8a4e', '#2980b9', '#d4a017', '#c0392b', '#7f8c8d', '#8e44ad'];

  function drawAxes(ctx, w, h, pad, maxVal) {
    ctx.strokeStyle = 'rgba(26,46,31,.08)';
    ctx.fillStyle = '#7a8f80';
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      const val = Math.round(maxVal * (1 - i / 4));
      ctx.fillText(String(val), 4, y + 3);
    }
  }

  /** Gráfico de barras */
  function bar(canvas, { labels, values, color = '#2d8a4e' }) {
    const { ctx, w, h } = setup(canvas);
    const pad = { l: 38, r: 12, t: 14, b: 26 };
    const max = Math.max(...values, 1) * 1.15;
    const iw = (w - pad.l - pad.r) / values.length;
    const bw = Math.min(46, iw * 0.55);
    drawAxes(ctx, w, h, pad, max);
    canvas._geom = { pad, values, labels, iw, max };
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const i = Math.floor((x - pad.l) / iw);
      if (i >= 0 && i < values.length) {
        const tip = tooltip();
        tip.textContent = labels[i] + ': ' + values[i].toLocaleString('es-CL') + ' L';
        tip.style.opacity = '1';
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top = (e.clientY - 10) + 'px';
      } else hideTip();
    };
    canvas.onmouseleave = hideTip;
    animate(canvas, p => {
      ctx.clearRect(0, 0, w, h);
      drawAxes(ctx, w, h, pad, max);
      values.forEach((v, i) => {
        const bh = (h - pad.t - pad.b) * (v / max) * p;
        const x = pad.l + iw * i + (iw - bw) / 2;
        const y = h - pad.b - bh;
        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, bw, Math.max(1, bh), [5, 5, 0, 0]); }
        else ctx.rect(x, y, bw, Math.max(1, bh));
        ctx.fill();
        ctx.fillStyle = '#4a6352';
        ctx.font = '10px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], pad.l + iw * i + iw / 2, h - 8);
        ctx.textAlign = 'left';
      });
    });
  }

  /** Gráfico de líneas (con relleno opcional tipo área) */
  function line(canvas, { labels, values, color = '#2980b9', fill = false, unit = '' }) {
    const { ctx, w, h } = setup(canvas);
    const pad = { l: 38, r: 12, t: 14, b: 26 };
    const max = Math.max(...values, 1) * 1.15;
    const iw = (w - pad.l - pad.r) / Math.max(values.length - 1, 1);
    drawAxes(ctx, w, h, pad, max);
    const px = i => pad.l + iw * i;
    const py = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const i = Math.round((e.clientX - rect.left - pad.l) / iw);
      if (i >= 0 && i < values.length) {
        const tip = tooltip();
        tip.textContent = labels[i] + ': ' + values[i].toLocaleString('es-CL') + unit;
        tip.style.opacity = '1';
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top = (e.clientY - 10) + 'px';
      } else hideTip();
    };
    canvas.onmouseleave = hideTip;
    animate(canvas, p => {
      ctx.clearRect(0, 0, w, h);
      drawAxes(ctx, w, h, pad, max);
      const upto = Math.max(2, Math.floor(values.length * p));
      // clip progresivo para efecto de "dibujo"
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, pad.l + iw * (values.length - 1) * p + 4, h);
      ctx.clip();
      ctx.beginPath();
      values.forEach((v, i) => { i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)); });
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      if (fill) {
        ctx.lineTo(px(values.length - 1), h - pad.b);
        ctx.lineTo(px(0), h - pad.b);
        ctx.closePath();
        ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      values.forEach((v, i) => {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px(i), py(v), 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a8f80'; ctx.font = '10px Segoe UI, sans-serif'; ctx.textAlign = 'center';
        if (labels[i]) ctx.fillText(labels[i], px(i), h - 8);
        ctx.textAlign = 'left';
      });
    });
  }

  /** Gráfico de dona */
  function donut(canvas, { labels, values }) {
    const { ctx, w, h } = setup(canvas);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18, r = R * 0.58;
    const total = values.reduce((s, v) => s + v, 0) || 1;
    const geom = [];
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > r && dist < R && geom.length) {
        let ang = Math.atan2(dy, dx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
        const g = geom.find(g => ang >= g.a0 && ang < g.a1);
        if (g) {
          const tip = tooltip();
          tip.textContent = g.label + ': ' + g.val.toLocaleString('es-CL') + ' L (' + Math.round(g.val / total * 100) + '%)';
          tip.style.opacity = '1';
          tip.style.left = (e.clientX + 12) + 'px';
          tip.style.top = (e.clientY - 10) + 'px';
          return;
        }
      }
      hideTip();
    };
    canvas.onmouseleave = hideTip;
    animate(canvas, p => {
      ctx.clearRect(0, 0, w, h);
      geom.length = 0;
      let a0 = -Math.PI / 2;
      values.forEach((v, i) => {
        const a1 = a0 + (v / total) * Math.PI * 2 * p;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.arc(cx, cy, r, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();
        if (v > 0) geom.push({ a0, a1: a0 + (v / total) * Math.PI * 2, label: labels[i], val: v });
        a0 = a0 + (v / total) * Math.PI * 2;
      });
      ctx.fillStyle = '#1a2e1f';
      ctx.font = 'bold 15px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(total.toLocaleString('es-CL') + ' L', cx, cy + 5);
      ctx.font = '10px Segoe UI, sans-serif';
      ctx.fillStyle = '#7a8f80';
      ctx.fillText('este mes', cx, cy + 20);
      ctx.textAlign = 'left';
    });
  }

  const api = { bar, line, donut, COLORS, quiet: false };
  return api;
})();
