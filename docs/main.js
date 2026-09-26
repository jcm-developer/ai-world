// AI World — landing: pensamientos que se escriben solos y botones de copiar

const THOUGHTS = [
  'Antes de sacar conclusiones, quiero ver todas las piezas.',
  'Una hipótesis solo vale si resiste lo que todavía no he visto.',
  'Hola. Sigo investigando; puedes quedarte a mirar.',
];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const thoughtEl = document.getElementById('thought-text');

if (thoughtEl && !reduceMotion) {
  let index = 0;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Escribe cada pensamiento letra a letra, como en la escena
  (async function cycle() {
    await sleep(4200);
    for (;;) {
      index = (index + 1) % THOUGHTS.length;
      const text = THOUGHTS[index];
      thoughtEl.textContent = '';
      for (const char of text) {
        thoughtEl.textContent += char;
        await sleep(32);
      }
      await sleep(4200);
    }
  })();
}

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    // Copia solo los comandos, sin las líneas de comentario
    const code = button.parentElement.querySelector('code').textContent;
    const commands = code.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
    try {
      await navigator.clipboard.writeText(commands);
      button.textContent = 'Copiado';
    } catch {
      button.textContent = 'Selecciónalo';
    }
    setTimeout(() => (button.textContent = 'Copiar'), 1800);
  });
}
