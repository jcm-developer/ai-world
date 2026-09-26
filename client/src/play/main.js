// Página de juego: monta el escenario indicado en la URL (?s=<id>) y lo sincroniza con el servidor.
// El navegador no decide nada: solo representa el estado y las acciones que envía el servidor.

import * as THREE from 'three';
import { createAgents } from '../engine/agents.js';
import { createAmbience } from '../engine/ambience.js';
import { circle } from '../engine/collision.js';
import { createFirstPerson } from '../engine/firstPerson.js';
import { createPanel } from '../engine/panel.js';
import { connectSocket } from '../engine/socket.js';
import { createStage } from '../engine/stage.js';
import { createTalk } from '../engine/talk.js';
import { createVoice } from '../engine/voice.js';
import { SCENARIO_VIEWS } from '../scenarios/registry.js';

const STEP_SECONDS = 0.42; // cadencia de los pasos al caminar
const PREFS = { voice: 'aiworld.voice', ambience: 'aiworld.ambience' };
const SPEECH_WAIT_MS = 9000; // si la voz no llega a tiempo, el texto se muestra igualmente
const DEFAULT_FPS_START = { position: [0, 1.65, 5], lookAt: [0, 1.5, 0] };
const VISITOR_SEND_MS = 500; // cada cuánto se comunica tu posición en primera persona
const VISITOR_HEARTBEAT_MS = 3000; // aunque no te muevas, para que el servidor sepa que sigues ahí
const LOOK_AT_VISITOR_M = 4.5; // la IA gira la cabeza hacia ti si estás a menos de esto
const DEFAULT_HEAR_RADIUS_M = 6; // lo fija el servidor en world:init; es solo para la indicación en pantalla

const scenarioId = new URLSearchParams(location.search).get('s') ?? 'meridiano';
const loadView = SCENARIO_VIEWS[scenarioId];

if (!loadView) {
  location.replace('/'); // escenario desconocido: de vuelta al hub
} else {
  loadView().then(start);
}

// Efecto de sonido para cada acción (genérico para todos los escenarios)
function soundFor(action) {
  if (action.type === 'enter_code') return action.data?.opened ? 'unlock' : 'deny';
  if (!action.ok) return null;
  return { inspect: 'scan', examine: 'scan', connect: 'link', remember: 'note', take: 'pickup', combine: 'pickup', use: 'use' }[action.type] ?? null;
}

function start(viewModule) {
  const stage = createStage(document.getElementById('scene'), viewModule.stageOptions);
  const agents = createAgents(stage.scene);
  // Con la voz activada, el texto flotante espera al audio y avanza a su ritmo
  const speechWait = new Map(); // agentId → temporizador de respaldo
  const voice = createVoice({
    onStart: (p) => {
      clearTimeout(speechWait.get(p.agentId));
      agents.get(p.agentId)?.thoughts.begin(p.text ?? '', p.kind);
    },
    onProgress: (p, f) => agents.get(p.agentId)?.thoughts.progress(f),
    onEnd: (p) => p.text && agents.get(p.agentId)?.thoughts.finish(p.text, p.kind),
  });
  const ambience = createAmbience();
  const sfx = (name) => ambience.play(name);
  const view = viewModule.mount({ scene: stage.scene, renderer: stage.renderer, stage, agents, sfx });

  // Primera persona: colisiones con el escenario y con los avatares de las IAs
  const fp = createFirstPerson({
    camera: stage.camera,
    domElement: stage.renderer.domElement,
    getColliders: () => [
      ...(view.colliders?.() ?? []),
      ...agents.all().map((a) => circle(a.avatar.root.position.x, a.avatar.root.position.z, 0.42)),
    ],
    onStep: () => sfx('step'),
  });

  const panel = createPanel({
    onControl: (action) => socket.send('control', { action }),
  });

  const socket = connectSocket(scenarioId, {
    onOpen: () => {
      panel.setConnected(true);
      socket.send('voice', { enabled: voice.enabled }); // el servidor solo genera audio si alguien escucha
    },
    onClose: () => {
      panel.setConnected(false);
      for (const a of agents.all()) a.thoughts.setThinking(false);
    },
    onMessage: handleMessage,
  });

  // Hablar con la IA (pulsar para hablar). Al empezar a hablar, la IA se calla.
  let hearRadius = DEFAULT_HEAR_RADIUS_M;
  const talk = createTalk({
    canTalk: () => stage.mode === 'fps' && fp.active,
    onStart: () => voice.stop(),
    onSend: (text) => socket.send('visitor_say', { text }),
  });

  setupAudioControls();
  setupCamera();

  function handleMessage(type, p) {
    switch (type) {
      case 'world:init':
        agents.sync(p.agents);
        view.init(p.world);
        panel.init(p);
        document.getElementById('voice-toggle').hidden = p.voice === 'off';
        hearRadius = p.talk?.radius ?? DEFAULT_HEAR_RADIUS_M;
        talk.configure(p.talk);
        break;

      case 'visitor:said':
        talk.showSaid(p);
        break;

      case 'world:update':
        view.onWorldUpdate?.(p);
        break;

      case 'agents:pos':
        for (const a of p) agents.setState(a.agentId, a);
        view.onAgentsPos?.(p);
        break;

      case 'action': {
        panel.addActivity(p);
        view.onAction(p);
        const sound = soundFor(p);
        if (sound) sfx(sound);
        break;
      }

      case 'thought': {
        panel.setThought(p.agentId, p.text);
        const thoughts = agents.get(p.agentId)?.thoughts;
        if (!voice.enabled) thoughts?.show(p.text);
        else {
          clearTimeout(speechWait.get(p.agentId));
          speechWait.set(p.agentId, setTimeout(() => thoughts?.show(p.text), SPEECH_WAIT_MS));
        }
        break;
      }

      case 'said': {
        // Lo que la IA te dice en voz alta: bocadillo propio (sincronizado con la voz si está activa)
        const thoughts = agents.get(p.agentId)?.thoughts;
        if (!voice.enabled) thoughts?.show(p.text, 'said');
        else {
          clearTimeout(speechWait.get(p.agentId));
          speechWait.set(p.agentId, setTimeout(() => thoughts?.show(p.text, 'said'), SPEECH_WAIT_MS));
        }
        break;
      }

      case 'speech':
        voice.play(p);
        break;

      case 'thinking':
        agents.get(p.agentId)?.thoughts.setThinking(p.thinking);
        panel.setThinking(p.agentId, p.thinking);
        break;

      case 'memory':
        panel.setMemory(p.agentId, p.memory);
        break;

      case 'stats':
        panel.setStats(p);
        break;

      case 'status':
        panel.setStatus(p);
        break;

      case 'finished':
        // Se deja ver el desenlace (la puerta abriéndose…) antes de mostrar el resultado
        setTimeout(() => {
          panel.showFinished(p);
          sfx('success');
        }, 3000);
        break;
    }
  }

  /** Botones de voz y sonido, con la preferencia recordada en este navegador. */
  function setupAudioControls() {
    const bind = (id, key, apply) => {
      const btn = document.getElementById(id);
      const set = (on) => {
        btn.setAttribute('aria-pressed', String(on));
        apply(on);
        try {
          localStorage.setItem(key, on ? '1' : '0');
        } catch {
          /* sin almacenamiento */
        }
      };
      btn.addEventListener('click', () => set(btn.getAttribute('aria-pressed') !== 'true'));
      let saved = false;
      try {
        saved = localStorage.getItem(key) === '1';
      } catch {
        /* sin almacenamiento */
      }
      if (saved) set(true);
    };

    bind('voice-toggle', PREFS.voice, (on) => {
      voice.setEnabled(on);
      socket.send('voice', { enabled: on });
    });
    bind('ambience-toggle', PREFS.ambience, (on) => ambience.setEnabled(on));

    // Los navegadores bloquean el audio hasta la primera interacción: se reanuda entonces
    window.addEventListener('pointerdown', () => ambience.unlock(), { once: true });
  }

  /** Cámara: primera persona (por defecto en escritorio) o vista general, con la tecla V. */
  function setupCamera() {
    const btn = document.getElementById('camera-toggle');
    const label = btn.querySelector('.camera-label');
    const hint = document.getElementById('fps-hint');
    const crosshair = document.getElementById('crosshair');
    const touch = matchMedia('(pointer: coarse)').matches;
    const fixedCam = new URLSearchParams(location.search).has('cam');

    const refresh = () => {
      const fps = stage.mode === 'fps';
      label.textContent = fps ? 'Primera persona' : 'Vista general';
      hint.hidden = !fps || fp.locked;
      crosshair.hidden = !fps || !fp.locked;
    };
    const setCamera = (mode) => {
      stage.setMode(mode);
      if (mode !== 'fps') socket.send('visitor', { present: false }); // en la vista general no estás en la sala
      if (mode === 'fps') fp.enable(viewModule.stageOptions?.fpsStart ?? DEFAULT_FPS_START);
      else fp.disable();
      refresh();
    };

    btn.hidden = touch;
    btn.addEventListener('click', () => setCamera(stage.mode === 'fps' ? 'orbit' : 'fps'));
    fp.controls.addEventListener('lock', refresh);
    fp.controls.addEventListener('unlock', refresh);
    stage.renderer.domElement.addEventListener('click', () => {
      if (stage.mode === 'fps') fp.lock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea') || touch) return;
      if (e.code === 'KeyV') setCamera(stage.mode === 'fps' ? 'orbit' : 'fps');
      if (e.code === 'KeyF' && stage.mode === 'fps') {
        const a = agents.all()[0];
        if (a) fp.lookAt({ x: a.avatar.root.position.x, y: 1.4, z: a.avatar.root.position.z });
      }
    });

    setCamera(touch || fixedCam ? 'orbit' : 'fps');
  }

  // Pasos: un golpe suave cada STEP_SECONDS mientras un avatar camina
  const stepTimers = new Map();
  // Tu presencia: en primera persona se envía tu posición y hacia dónde miras
  const camDir = new THREE.Vector3();
  let lastSent = { x: 0, z: 0, heading: 0, at: 0 };
  function reportVisitor(now) {
    if (stage.mode !== 'fps') return;
    const cam = stage.camera;
    cam.getWorldDirection(camDir);
    const heading = Math.atan2(camDir.x, camDir.z);
    const moved = Math.hypot(cam.position.x - lastSent.x, cam.position.z - lastSent.z) > 0.15;
    const turned = Math.abs(Math.atan2(Math.sin(heading - lastSent.heading), Math.cos(heading - lastSent.heading))) > 0.2;
    const due = now - lastSent.at > (moved || turned ? VISITOR_SEND_MS : VISITOR_HEARTBEAT_MS);
    if (!due) return;
    lastSent = { x: cam.position.x, z: cam.position.z, heading, at: now };
    socket.send('visitor', { present: true, x: +cam.position.x.toFixed(2), z: +cam.position.z.toFixed(2), heading: +heading.toFixed(3) });
  }

  stage.onFrame((dt, t) => {
    fp.update(dt);
    reportVisitor(performance.now());
    // La IA gira la cabeza hacia ti cuando estás cerca
    const me = stage.mode === 'fps' ? stage.camera.position : null;
    let nearest = Infinity;
    for (const a of agents.all()) {
      const dist = me ? Math.hypot(me.x - a.avatar.root.position.x, me.z - a.avatar.root.position.z) : Infinity;
      a.avatar.setLookTarget(dist < LOOK_AT_VISITOR_M ? me : null);
      if (a.def.role !== 'npc') nearest = Math.min(nearest, dist); // solo te oyen los agentes autónomos
    }
    talk.setReach(me && fp.locked ? (nearest <= hearRadius ? 'near' : 'far') : null);
    agents.update(dt, t);
    view.update(dt, t);
    for (const a of agents.all()) {
      if (!a.avatar.isWalking()) {
        stepTimers.set(a.def.id, 0);
        continue;
      }
      const acc = (stepTimers.get(a.def.id) ?? 0) + dt;
      if (acc >= STEP_SECONDS) sfx('step');
      stepTimers.set(a.def.id, acc % STEP_SECONDS);
    }
  });
  stage.start();
}
