// Dibuja en un canvas el contenido de cada objeto flotante.
// - renderHidden: lo que se ve antes de inspeccionar (tipo, descripción corta y contenido velado).
// - renderContent: el contenido detallado, con un estilo propio por tipo de objeto.

import * as THREE from 'three';

const PX_PER_M = 520;
const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

const C = {
  bg0: 'rgba(12, 17, 27, 0.96)',
  bg1: 'rgba(7, 10, 17, 0.96)',
  line: 'rgba(150, 180, 230, 0.16)',
  text: '#d9e2ef',
  dim: '#8793a8',
  faint: '#4f5a6d',
  accent: '#8cb8ff',
  alert: '#f08a8a',
  ok: '#7fd6b0',
  amber: '#e8c07d',
  keyword: '#9ec3ff',
  comment: '#6d7a8f',
};

/** Crea el canvas con marco común (fondo, cabecera con tipo e id). */
function frame(obj, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX_PER_M);
  canvas.height = Math.round(h * PX_PER_M);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.05);
  const headerH = Math.round(Math.min(W, H) * 0.1);
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(headerH * 0.36)}px ${SANS}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(spaced(obj.label.toUpperCase()), pad, headerH * 0.62);
  ctx.textAlign = 'right';
  ctx.font = `${Math.round(headerH * 0.34)}px ${MONO}`;
  ctx.fillStyle = C.faint;
  ctx.fillText(obj.id, W - pad, headerH * 0.62);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, headerH, W - pad * 2, 2);

  return { canvas, ctx, W, H, pad, top: headerH + pad * 0.6 };
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// --- Estado oculto -------------------------------------------------------------

export function renderHidden(obj, w, h) {
  const { canvas, ctx, W, H, pad, top } = frame(obj, w, h);
  const fs = Math.round(Math.min(W, H) * 0.052);

  ctx.textBaseline = 'top';
  ctx.font = `300 ${fs}px ${SANS}`;
  ctx.fillStyle = C.dim;
  const lines = wrap(ctx, obj.short, W - pad * 2);
  lines.forEach((l, i) => ctx.fillText(l, pad, top + i * fs * 1.4));

  // Contenido velado: barras tenues que sugieren información sin revelarla
  let y = top + lines.length * fs * 1.4 + fs;
  let seed = [...obj.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const barH = Math.max(6, fs * 0.32);
  while (y < H - pad * 1.8) {
    const bw = (0.35 + rnd() * 0.6) * (W - pad * 2);
    ctx.fillStyle = `rgba(140, 170, 220, ${0.05 + rnd() * 0.05})`;
    roundRect(ctx, pad, y, bw, barH, barH / 2);
    ctx.fill();
    y += barH * 2.4;
  }

  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(fs * 0.7)}px ${MONO}`;
  ctx.fillStyle = C.faint;
  ctx.fillText('· sin inspeccionar ·', pad, H - pad * 0.8);
  return toTexture(canvas);
}

// --- Contenido revelado --------------------------------------------------------

export function renderContent(obj, w, h) {
  const f = frame(obj, w, h);
  switch (obj.type) {
    case 'codigo':
      drawCode(f, obj.content);
      break;
    case 'datos':
      drawJson(f, obj.content);
      break;
    case 'pantalla':
      drawLog(f, obj.content);
      break;
    case 'grafica':
      obj.visual ? drawChart(f, obj.visual) : drawProse(f, obj.content);
      break;
    case 'plano':
      obj.visual ? drawPlan(f, obj.visual) : drawProse(f, obj.content);
      break;
    case 'cronologia':
      obj.visual ? drawTimeline(f, obj.visual) : drawProse(f, obj.content);
      break;
    default:
      drawProse(f, obj.content);
  }
  return toTexture(f.canvas);
}

/** Texto corrido (documento). Ajusta el tamaño de letra para que quepa. */
function drawProse({ ctx, W, H, pad, top }, text) {
  const maxW = W - pad * 2;
  const avail = H - top - pad;
  let fs = Math.round(Math.min(W, H) * 0.05);
  let lines;
  for (; fs > 10; fs -= 1) {
    ctx.font = `300 ${fs}px ${SANS}`;
    lines = wrapParagraphs(ctx, text, maxW);
    if (lines.length * fs * 1.42 <= avail) break;
  }
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    const isTitle = i === 0;
    ctx.font = `${isTitle ? 600 : 300} ${fs}px ${SANS}`;
    ctx.fillStyle = isTitle ? C.text : l.startsWith('Conclusión') || l.startsWith('Pendiente') ? C.amber : '#c2ccda';
    ctx.fillText(l, pad, top + i * fs * 1.42);
  });
}

/** Ajusta una fuente monoespaciada para que todas las líneas quepan. */
function fitMono(ctx, lines, maxW, avail, maxFs, gutter = 0) {
  let fs = maxFs;
  for (; fs > 8; fs -= 1) {
    ctx.font = `${fs}px ${MONO}`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * fs * 1.45 <= avail && widest + gutter * fs <= maxW) break;
  }
  return fs;
}

const KEYWORD = /^(const|let|export|function|if|else|return|new|for|of)$/;

function drawCode({ ctx, W, H, pad, top }, code) {
  const lines = code.split('\n');
  const fs = fitMono(ctx, lines, W - pad * 2, H - top - pad, Math.round(H * 0.045), 3);
  const lh = fs * 1.45;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    const y = top + i * lh;
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), pad + fs * 1.6, y);
    ctx.textAlign = 'left';
    drawCodeLine(ctx, line, pad + fs * 2.4, y);
  });
}

/** Resaltado mínimo: comentarios, palabras clave, cadenas y números. */
function drawCodeLine(ctx, line, x, y) {
  const commentAt = line.indexOf('//');
  const code = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const comment = commentAt >= 0 ? line.slice(commentAt) : '';
  const tokens = code.split(/(\b(?:const|let|export|function|if|else|return|new|for|of)\b|'[^']*'|\b\d+(?:\.\d+)?\b)/);
  for (const tok of tokens) {
    if (!tok) continue;
    if (KEYWORD.test(tok)) ctx.fillStyle = C.keyword;
    else if (/^'/.test(tok)) ctx.fillStyle = C.amber;
    else if (/^\d/.test(tok)) ctx.fillStyle = C.amber;
    else ctx.fillStyle = C.text;
    ctx.fillText(tok, x, y);
    x += ctx.measureText(tok).width;
  }
  if (comment) {
    ctx.fillStyle = C.comment;
    ctx.fillText(comment, x, y);
  }
}

function drawJson({ ctx, W, H, pad, top }, json) {
  const lines = json.split('\n');
  const fs = fitMono(ctx, lines, W - pad * 2, H - top - pad, Math.round(H * 0.05));
  const lh = fs * 1.45;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    let x = pad;
    const y = top + i * lh;
    const highlight = /"S-4"/.test(line);
    for (const tok of line.split(/("[^"]*"\s*:|"[^"]*"|\d+(?:\.\d+)?)/)) {
      if (!tok) continue;
      if (/^".*:\s*$/.test(tok)) ctx.fillStyle = C.keyword;
      else if (/^"/.test(tok)) ctx.fillStyle = highlight ? C.text : '#b8c4d6';
      else if (/^\d/.test(tok)) ctx.fillStyle = C.amber;
      else ctx.fillStyle = C.dim;
      ctx.fillText(tok, x, y);
      x += ctx.measureText(tok).width;
    }
  });
}

function drawLog({ ctx, W, H, pad, top }, log) {
  const lines = log.split('\n');
  const fs = fitMono(ctx, lines, W - pad * 2, H - top - pad, Math.round(H * 0.045));
  const lh = fs * 1.5;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    const y = top + i * lh;
    const m = line.match(/^(\d\d:\d\d:\d\d)(\s+)(.*)$/);
    let x = pad;
    if (m) {
      ctx.fillStyle = C.faint;
      ctx.fillText(m[1] + m[2], x, y);
      x += ctx.measureText(m[1] + m[2]).width;
    }
    const rest = m ? m[3] : line;
    ctx.fillStyle = /ANOMAL/.test(rest) ? C.alert : /CORRECTO|sin anomalías/.test(rest) ? C.ok : i === 0 ? C.accent : C.text;
    ctx.fillText(rest, x, y);
  });
}

function drawChart({ ctx, W, H, pad, top }, v) {
  const left = pad * 2.2;
  const right = W - pad;
  const bottom = H - pad * 2.2;
  const chartTop = top + pad * 0.4;
  const min = Math.floor(Math.min(...v.series) - 0.3);
  const max = Math.ceil(Math.max(...v.series) + 0.3);
  const x = (i) => left + (i / (v.series.length - 1)) * (right - left);
  const y = (val) => bottom - ((val - min) / (max - min)) * (bottom - chartTop);
  const fs = Math.round(H * 0.04);

  // Rejilla y etiquetas del eje Y
  ctx.font = `${fs}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let val = min; val <= max; val += 0.5) {
    ctx.fillStyle = C.line;
    ctx.fillRect(left, y(val), right - left, 1);
    if (Number.isInteger(val)) {
      ctx.fillStyle = C.faint;
      ctx.fillText(`${val}`, left - fs * 0.5, y(val));
    }
  }
  // Etiquetas del eje X (cada 2 horas)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const perHour = 60 / v.stepMin;
  for (let i = 0; i < v.series.length; i += perHour * 2) {
    ctx.fillStyle = C.faint;
    ctx.fillText(`${String(i / perHour).padStart(2, '0')}:00`, x(i), bottom + fs * 0.6);
  }

  // Área y línea
  const area = ctx.createLinearGradient(0, chartTop, 0, bottom);
  area.addColorStop(0, 'rgba(140, 184, 255, 0.28)');
  area.addColorStop(1, 'rgba(140, 184, 255, 0)');
  ctx.beginPath();
  v.series.forEach((val, i) => (i ? ctx.lineTo(x(i), y(val)) : ctx.moveTo(x(i), y(val))));
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();

  ctx.beginPath();
  v.series.forEach((val, i) => (i ? ctx.lineTo(x(i), y(val)) : ctx.moveTo(x(i), y(val))));
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = Math.max(2, H * 0.006);
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Punto marcado (alarma)
  if (v.markIndex != null) {
    const mx = x(v.markIndex);
    const my = y(v.series[v.markIndex]);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(240, 138, 138, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, chartTop);
    ctx.lineTo(mx, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.alert;
    ctx.beginPath();
    ctx.arc(mx, my, H * 0.014, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = `${fs}px ${SANS}`;
    ctx.fillText(`${v.markLabel} · ${String(v.series[v.markIndex]).replace('.', ',')} ${v.unit}`, mx + fs * 0.5, chartTop + fs * 1.4);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `300 ${Math.round(fs * 0.95)}px ${SANS}`;
  ctx.fillStyle = C.dim;
  ctx.fillText(`Temperatura S-4 (${v.unit}) · ${v.from}–${v.to} · los otros cinco sensores no muestran el descenso`, left, H - pad * 0.5);
}

function drawPlan({ ctx, W, H, pad, top }, v) {
  const availW = W - pad * 2;
  const availH = H - top - pad * 2;
  const s = Math.min(availW / v.w, availH / v.h);
  const ox = pad + (availW - v.w * s) / 2;
  const oy = top + pad * 0.3 + (availH - v.h * s) / 2;
  const X = (px) => ox + px * s;
  const Y = (py) => oy + py * s;
  const fs = Math.round(H * 0.04);

  // Rejilla del plano
  ctx.strokeStyle = 'rgba(140, 184, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= v.w; gx += 1) {
    ctx.beginPath();
    ctx.moveTo(X(gx), Y(0));
    ctx.lineTo(X(gx), Y(v.h));
    ctx.stroke();
  }
  for (let gy = 0; gy <= v.h; gy += 1) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(gy));
    ctx.lineTo(X(v.w), Y(gy));
    ctx.stroke();
  }

  // Muros (con huecos para la puerta y la rejilla)
  ctx.strokeStyle = C.text;
  ctx.lineWidth = Math.max(3, s * 0.18);
  ctx.beginPath();
  ctx.moveTo(X(v.vent.x), Y(0));
  ctx.lineTo(X(0), Y(0));
  ctx.lineTo(X(0), Y(v.h));
  ctx.lineTo(X(v.door.x), Y(v.h));
  ctx.moveTo(X(v.door.x + v.door.w), Y(v.h));
  ctx.lineTo(X(v.w), Y(v.h));
  ctx.lineTo(X(v.w), Y(0));
  ctx.lineTo(X(v.vent.x + v.vent.w), Y(0));
  ctx.stroke();

  // Rejilla de ventilación
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const vx = X(v.vent.x + (v.vent.w * i) / 8);
    ctx.beginPath();
    ctx.moveTo(vx, Y(0) - s * 0.25);
    ctx.lineTo(vx, Y(0) + s * 0.25);
    ctx.stroke();
  }
  ctx.font = `${fs}px ${SANS}`;
  ctx.fillStyle = C.accent;
  ctx.textBaseline = 'bottom';
  ctx.fillText('ventilación', X(v.vent.x), Y(0) - s * 0.35);

  // Sensores
  ctx.textBaseline = 'middle';
  for (const sensor of v.sensors) {
    const special = sensor.id === 'S-4';
    ctx.fillStyle = special ? C.amber : C.dim;
    ctx.beginPath();
    ctx.arc(X(sensor.x), Y(sensor.y), s * (special ? 0.3 : 0.24), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${special ? 600 : 400} ${fs}px ${MONO}`;
    const lx = sensor.x > v.w - 3 ? X(sensor.x) - s * 0.5 - ctx.measureText(sensor.id).width : X(sensor.x) + s * 0.5;
    ctx.fillText(sensor.id, lx, Y(sensor.y) + (special ? s * 0.6 : 0));
  }

  // Anotación a lápiz
  ctx.font = `italic 300 ${fs}px ${SANS}`;
  ctx.fillStyle = C.dim;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“ventilación nocturna 03:00 · 40 min · aire frío”', X(v.vent.x + v.vent.w + 0.6), Y(1.6));
  ctx.fillStyle = C.faint;
  ctx.fillText('Sala Meridiano · 1:100', pad, H - pad * 0.5);
}

function drawTimeline({ ctx, W, H, pad, top }, v) {
  const left = pad * 1.5;
  const right = W - pad * 1.5;
  const midY = top + (H - top) * 0.47;
  const fs = Math.round(H * 0.052);
  const n = v.events.length;

  ctx.fillStyle = C.line;
  ctx.fillRect(left, midY - 1, right - left, 2);

  v.events.forEach((e, i) => {
    const x = left + (i / (n - 1)) * (right - left);
    const up = i % 2 === 0;
    ctx.fillStyle = e.alert ? C.alert : C.accent;
    ctx.beginPath();
    ctx.arc(x, midY, fs * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(150, 180, 230, 0.25)';
    ctx.fillRect(x - 0.5, up ? midY - fs * 1.2 : midY + fs * 0.5, 1, fs * 0.7);

    ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
    ctx.textBaseline = up ? 'bottom' : 'top';
    const baseY = up ? midY - fs * 1.4 : midY + fs * 1.4;
    ctx.font = `${Math.round(fs * 0.8)}px ${MONO}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(e.t, x, up ? baseY - fs * 1.2 : baseY);
    ctx.font = `${e.alert ? 600 : 400} ${fs}px ${SANS}`;
    ctx.fillStyle = e.alert ? C.alert : C.text;
    ctx.fillText(e.label, x, up ? baseY : baseY + fs * 1.1);
  });
  ctx.textAlign = 'left';
}

// --- Utilidades ------------------------------------------------------------------

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function wrapParagraphs(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) out.push('');
    else out.push(...wrap(ctx, para, maxW));
  }
  return out;
}

function spaced(s) {
  return s.split('').join('\u200A');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
