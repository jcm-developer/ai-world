// Texturas dibujadas en canvas para El Archivo: esfera del reloj, póster del prisma,
// letrero de salida, pantalla del terminal y cifras de tinta invisible.

import * as THREE from 'three';

const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Esfera de reloj con las agujas en una hora fija. */
export function clockFaceTexture(hours, minutes) {
  return canvasTexture(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#e9e4da';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b2b2e';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const long = i % 5 === 0;
      ctx.lineWidth = long ? 8 : 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * c * (long ? 0.78 : 0.85), c - Math.cos(a) * c * (long ? 0.78 : 0.85));
      ctx.lineTo(c + Math.sin(a) * c * 0.92, c - Math.cos(a) * c * 0.92);
      ctx.stroke();
    }
    const hand = (angle, len, width) => {
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.sin(angle) * len, c - Math.cos(angle) * len);
      ctx.stroke();
    };
    ctx.strokeStyle = '#1d1d20';
    hand(((hours % 12) + minutes / 60) / 12 * Math.PI * 2, c * 0.5, 14);
    hand((minutes / 60) * Math.PI * 2, c * 0.74, 9);
    ctx.fillStyle = '#b23a2e';
    ctx.beginPath();
    ctx.arc(c, c, 14, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Póster divulgativo: prisma que descompone la luz. */
export function prismPosterTexture() {
  return canvasTexture(640, 832, (ctx, w, h) => {
    ctx.fillStyle = '#0f1218';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.42;
    const cy = h * 0.42;
    // Rayo blanco de entrada
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(30, cy + 40);
    ctx.lineTo(cx - 20, cy + 6);
    ctx.stroke();
    // Abanico de colores
    const colors = ['#e5484d', '#f28a3c', '#f2d13c', '#46b872', '#3a7fe0', '#4b4bb5', '#8d5bd6'];
    colors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + 40, cy);
      ctx.lineTo(w - 20, cy - 150 + i * 44);
      ctx.lineTo(w - 20, cy - 150 + (i + 1) * 44);
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Prisma
    ctx.fillStyle = 'rgba(200,220,255,0.18)';
    ctx.strokeStyle = 'rgba(220,235,255,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 120);
    ctx.lineTo(cx + 105, cy + 80);
    ctx.lineTo(cx - 105, cy + 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Pie de foto
    ctx.fillStyle = '#d9e2ef';
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText('La luz se abre', 44, h - 200);
    ctx.fillStyle = '#8793a8';
    ctx.font = `300 22px ${SANS}`;
    const caption = ['Newton, 1666: rojo, naranja, amarillo,', 'verde, azul, añil y violeta,', 'siempre en ese orden.'];
    caption.forEach((l, i) => ctx.fillText(l, 44, h - 150 + i * 32));
  });
}

/** Letrero luminoso de SALIDA. */
export function exitSignTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8f6ee';
    ctx.font = `600 64px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S A L I D A', w / 2, h / 2 + 4);
  });
}

/** Pantalla del terminal con un registro de texto. */
export function terminalTexture(lines) {
  return canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#071018';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `22px ${MONO}`;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillStyle = /ANOMAL/.test(line) ? '#f08a8a' : /CORRECTO/.test(line) ? '#7fd6b0' : i === 0 ? '#8cb8ff' : '#b8c7da';
      ctx.fillText(line, 28, 28 + i * 34);
    });
    // Líneas de barrido muy tenues
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
}

/** Cifra o texto en "tinta invisible" que brilla bajo la luz UV. */
export function uvTextTexture(text, { width = 256, height = 256, size = 180 } = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#d9b8ff';
    ctx.shadowColor = '#b27dff';
    ctx.shadowBlur = 24;
    ctx.font = `600 ${size}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  });
}
