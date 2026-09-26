// Sonido ambiente y efectos, sintetizados en el momento con Web Audio (sin archivos):
// un zumbido grave de sala, pasos del avatar y un sonido discreto por cada tipo de acción.

export function createAmbience() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let enabled = false;
  let hum = null;
  let noiseBuffer = null;

  /** El AudioContext solo puede crearse/reanudarse tras una interacción del usuario. */
  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      noiseBuffer = makeNoise(ctx, 2);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // --- Zumbido de sala: dos graves desafinados + ruido filtrado que respira despacio
  function startHum() {
    if (hum) return;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(master);
    const o1 = osc('sine', 55, 0.5, g);
    const o2 = osc('sine', 110.6, 0.18, g);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(lp).connect(ng).connect(g);
    noise.start();
    const lfo = osc('sine', 0.07, 140, lp.frequency);
    hum = { g, nodes: [o1, o2, noise, lfo] };
  }

  function osc(type, freq, gain, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
    return o;
  }

  // --- Piezas para los efectos -------------------------------------------------------

  function tone(freq, { type = 'sine', start = 0, dur = 0.3, vol = 0.15, to = null, attack = 0.005 } = {}) {
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseBurst({ start = 0, dur = 0.08, vol = 0.12, freq = 1200, q = 1.2, type = 'bandpass', sweepTo = null } = {}) {
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  const SFX = {
    step: () => noiseBurst({ dur: 0.07, vol: 0.05, freq: 700 + Math.random() * 300, q: 0.8 }),
    scan: () => {
      tone(520, { to: 1040, dur: 0.45, vol: 0.05, attack: 0.05 });
      tone(1560, { start: 0.2, dur: 0.6, vol: 0.025 });
    },
    link: () => {
      tone(880, { dur: 1.4, vol: 0.05 });
      tone(1318.5, { start: 0.08, dur: 1.6, vol: 0.04 });
      tone(1760, { start: 0.16, dur: 1.8, vol: 0.02 });
    },
    note: () => tone(1046.5, { type: 'triangle', dur: 0.5, vol: 0.04 }),
    pickup: () => {
      tone(520, { type: 'triangle', to: 880, dur: 0.18, vol: 0.06 });
      tone(1320, { start: 0.12, dur: 0.3, vol: 0.03 });
    },
    use: () => noiseBurst({ dur: 0.6, vol: 0.05, freq: 300, sweepTo: 2400, q: 2 }),
    unlock: () => {
      noiseBurst({ dur: 0.04, vol: 0.12, freq: 3000, q: 4 });
      tone(660, { start: 0.05, dur: 0.25, vol: 0.06 });
      tone(990, { start: 0.18, dur: 0.45, vol: 0.06 });
    },
    deny: () => {
      tone(190, { type: 'square', dur: 0.14, vol: 0.035 });
      tone(160, { type: 'square', start: 0.17, dur: 0.18, vol: 0.035 });
    },
    door: () => {
      noiseBurst({ dur: 2.2, vol: 0.09, freq: 150, sweepTo: 1800, q: 0.7, type: 'lowpass' });
      tone(70, { dur: 0.9, vol: 0.12, to: 45 });
    },
    success: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { start: i * 0.12, dur: 1.2, vol: 0.05 })),
  };

  return {
    get enabled() {
      return enabled;
    },

    setEnabled(value) {
      enabled = value;
      if (value) {
        ensure();
        startHum();
      }
      if (master) master.gain.setTargetAtTime(value ? 0.8 : 0, ctx.currentTime, 0.3);
    },

    /** Reproduce un efecto por nombre (si el sonido está activado). */
    play(name) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      SFX[name]?.();
    },

    /** Reanuda el audio tras una interacción (necesario si se activó en una visita anterior). */
    unlock() {
      if (enabled) {
        ensure();
        startHum();
      }
    },
  };
}

function makeNoise(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // Ruido "rosado" aproximado: más suave que el blanco
    last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
    data[i] = last * 6;
  }
  return buf;
}
