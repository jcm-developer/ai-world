// Avatar de la IA: silueta humanoide holográfica, translúcida, con brillo de borde (fresnel).
//
// Se construye con primitivas articuladas (caderas, hombros, rodillas, codos) para poder
// animar un paso suave. Cada pieza se dibuja dos veces:
//   1) una pasada solo de profundidad, que evita que las piezas solapadas sumen brillo;
//   2) la pasada visible con el shader fresnel y mezcla aditiva.

import * as THREE from 'three';

const HIP_HEIGHT = 0.95;

// Posturas: ángulos objetivo de cada articulación (radianes; hacia delante = negativo en X).
// El avatar pasa de una a otra suavemente; caminar se superpone a la postura de pie.
const POSES = {
  stand: { hipY: HIP_HEIGHT, thigh: 0, knee: 0, shL: 0, shR: 0, elL: -0.18, elR: -0.18, head: 0, torso: 0 },
  stand_hold: { hipY: HIP_HEIGHT, thigh: 0, knee: 0, shL: 0, shR: -0.45, elL: -0.18, elR: -1.35, head: 0, torso: 0 },
  drink: { hipY: HIP_HEIGHT, thigh: 0, knee: 0, shL: 0, shR: -0.45, elL: -0.18, elR: -1.35, head: 0, torso: 0 },
  sit: { hipY: 0.47, thigh: -1.5, knee: 1.5, shL: -0.35, shR: -0.35, elL: -0.8, elR: -0.8, head: 0.05, torso: -0.05 },
  type: { hipY: 0.47, thigh: -1.5, knee: 1.5, shL: -0.85, shR: -0.85, elL: -0.75, elR: -0.75, head: 0.3, torso: 0.12 },
  type_nervous: { hipY: 0.47, thigh: -1.5, knee: 1.5, shL: -0.85, shR: -0.85, elL: -0.75, elR: -0.75, head: 0.25, torso: 0.14 },
  read: { hipY: 0.47, thigh: -1.5, knee: 1.5, shL: -0.7, shR: -0.7, elL: -1.35, elR: -1.35, head: 0.4, torso: 0.05 },
};

const vertexShader = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uRim;
  uniform float uTime;
  uniform float uActivity;
  uniform float uBaseY;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.4);

    float h = vPosW.y - uBaseY;
    // Líneas horizontales muy finas que se desplazan hacia arriba
    float lines = 0.82 + 0.18 * step(0.5, fract(h * 38.0 - uTime * 0.8));
    // Barrido luminoso que recorre el cuerpo de pies a cabeza cada pocos segundos
    float sweepPos = fract(uTime * 0.12) * 2.6 - 0.3;
    float sweep = smoothstep(0.12, 0.0, abs(h - sweepPos));

    vec3 color = mix(uCore * 0.7, uRim, fresnel) * lines;
    color += uRim * (sweep * 0.35 + uActivity * 0.5 * fresnel);
    float alpha = (0.16 + fresnel * 0.9 + sweep * 0.15) * (0.85 + uActivity * 0.4);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** @param {{ color?: string }} opts color base del holograma (cada agente tiene el suyo) */
export function createAvatar(scene, { color = '#8cb8ff' } = {}) {
  const base = new THREE.Color(color);
  const uniforms = {
    uCore: { value: base.clone().multiplyScalar(0.42) },
    uRim: { value: base.clone().lerp(new THREE.Color(0xffffff), 0.62) },
    uTime: { value: 0 },
    uActivity: { value: 0 },
    uBaseY: { value: 0 },
  };

  const holoMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // Pasada de profundidad (invisible). Se marca como transparente para que se dibuje
  // después de los objetos opacos y no "agujeree" el suelo.
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });

  const root = new THREE.Group();
  root.scale.setScalar(1.12);
  scene.add(root);

  /** Añade una pieza del cuerpo (doble pasada) a un nodo del esqueleto. */
  function part(geometry, parent, [x, y, z], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const depth = new THREE.Mesh(geometry, depthMat);
    const holo = new THREE.Mesh(geometry, holoMat);
    for (const m of [depth, holo]) {
      m.position.set(x, y, z);
      m.scale.set(...scale);
      m.rotation.set(...rotation);
      parent.add(m);
    }
    depth.renderOrder = 10;
    holo.renderOrder = 11;
    return holo;
  }

  const joint = (parent, [x, y, z]) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 18);
  const sphere = (r) => new THREE.SphereGeometry(r, 24, 18);

  // --- Esqueleto
  const hips = joint(root, [0, HIP_HEIGHT, 0]);
  const torso = joint(hips, [0, 0, 0]);
  part(capsule(0.16, 0.36), torso, [0, 0.33, 0], [1.18, 1, 0.72]); // tronco
  part(capsule(0.11, 0.1), torso, [0, 0.02, 0], [1.25, 1, 0.8]); // pelvis
  part(capsule(0.045, 0.06), torso, [0, 0.64, 0]); // cuello
  const head = joint(torso, [0, 0.8, 0]);
  part(sphere(0.115), head, [0, 0, 0.01], [0.92, 1.12, 1]);

  const limbs = {};
  for (const side of [1, -1]) {
    const key = side === 1 ? 'L' : 'R';
    // Brazo
    const shoulder = joint(torso, [0.235 * side, 0.55, 0]);
    part(sphere(0.055), shoulder, [0, 0, 0]);
    part(capsule(0.048, 0.22), shoulder, [0, -0.16, 0]);
    const elbow = joint(shoulder, [0, -0.31, 0]);
    part(capsule(0.042, 0.2), elbow, [0, -0.14, 0]);
    part(sphere(0.045), elbow, [0, -0.3, 0.005], [0.8, 1.2, 0.6]);
    // Pierna
    const hip = joint(hips, [0.1 * side, -0.02, 0]);
    part(capsule(0.072, 0.3), hip, [0, -0.21, 0]);
    const knee = joint(hip, [0, -0.44, 0]);
    part(capsule(0.058, 0.3), knee, [0, -0.2, 0]);
    part(capsule(0.045, 0.12), knee, [0, -0.44, 0.06], [1, 1, 1], [Math.PI / 2, 0, 0]); // pie
    limbs[key] = { shoulder, elbow, hip, knee };
  }

  // --- Halo en el suelo bajo el avatar
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 48),
    new THREE.ShaderMaterial({
      uniforms: { uActivity: uniforms.uActivity, uColor: { value: base.clone().lerp(new THREE.Color(0xffffff), 0.3) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uActivity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d) * 0.28 + smoothstep(0.05, 0.0, abs(d - 0.82)) * 0.18;
          gl_FragColor = vec4(uColor, a * (1.0 + uActivity));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.012;
  glow.renderOrder = 5;
  root.add(glow);

  // Punto de anclaje para los pensamientos (encima de la cabeza)
  const thoughtAnchor = new THREE.Object3D();
  thoughtAnchor.position.set(0, 2.1, 0);
  root.add(thoughtAnchor);

  // --- Estado de animación
  const target = new THREE.Vector3();
  let targetHeading = 0;
  let walking = false;
  let walkBlend = 0;
  let phase = 0;
  let activity = 0;
  let lookTarget = null; // punto hacia el que gira la cabeza (p. ej. el visitante)
  let headYaw = 0;
  let pose = 'stand';
  const P = { ...POSES.stand }; // postura actual (interpolada)
  let initialized = false;

  return {
    root,
    thoughtAnchor,
    /** Manos (para colgarles objetos: una taza, un papel…). Origen en el codo; la mano está en y≈-0.3. */
    hands: { L: limbs.L.elbow, R: limbs.R.elbow },

    /** Elimina el avatar de la escena. */
    dispose() {
      scene.remove(root);
      root.traverse((o) => o.geometry?.dispose());
    },

    /** Estado recibido del servidor. snap=true coloca el avatar sin interpolar. */
    setState(state, snap = false) {
      target.set(state.x, 0, state.z);
      targetHeading = state.heading;
      walking = state.walking;
      if (state.pose && POSES[state.pose]) pose = state.pose;
      if (snap || !initialized) {
        root.position.copy(target);
        root.rotation.y = targetHeading;
        initialized = true;
      }
    },

    /** Gira la cabeza hacia un punto del mundo (o null para mirar al frente). */
    setLookTarget(point) {
      lookTarget = point;
    },

    /** Si el avatar está caminando (para los pasos). */
    isWalking() {
      return walking;
    },

    /** Destello breve (al inspeccionar o conectar). */
    pulse(strength = 1) {
      activity = Math.max(activity, strength);
    },

    /** Posición del pecho en coordenadas de mundo (origen de los haces de luz). */
    chestPosition(out = new THREE.Vector3()) {
      return out.set(root.position.x, 1.35, root.position.z);
    },

    update(dt, t) {
      // Interpolación suave hacia la posición del servidor (llega a 10 Hz)
      const k = 1 - Math.exp(-dt * 7);
      root.position.lerp(target, k);
      let dh = targetHeading - root.rotation.y;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      root.rotation.y += dh * (1 - Math.exp(-dt * 6));

      walkBlend += ((walking ? 1 : 0) - walkBlend) * (1 - Math.exp(-dt * 5));
      phase += dt * 6.2 * walkBlend;
      activity = Math.max(0, activity - dt * 0.8);

      const s = Math.sin(phase);
      const wb = walkBlend;

      // Postura objetivo (al caminar, siempre de pie) e interpolación suave hacia ella
      const goal = POSES[walking ? 'stand' : pose];
      const kp = 1 - Math.exp(-dt * 4);
      for (const key in goal) P[key] += (goal[key] - P[key]) * kp;

      // Animaciones propias de cada actividad
      let typeL = 0;
      let typeR = 0;
      let sip = 0;
      let glance = 0;
      if (!walking && (pose === 'type' || pose === 'type_nervous')) {
        const speed = pose === 'type_nervous' ? 22 : 15;
        typeL = Math.sin(t * speed) * 0.06;
        typeR = Math.sin(t * speed + Math.PI) * 0.06;
        if (pose === 'type_nervous') glance = Math.max(0, Math.sin(t * 0.7) - 0.85) * 4; // mira alrededor de vez en cuando
      }
      if (!walking && pose === 'drink') {
        const cycle = t % 7;
        sip = cycle < 1.6 ? Math.sin((cycle / 1.6) * Math.PI) : 0; // un sorbo cada 7 s
      }

      // Piernas (postura + paso) y rodillas
      limbs.L.hip.rotation.x = P.thigh - s * 0.42 * wb;
      limbs.R.hip.rotation.x = P.thigh + s * 0.42 * wb;
      limbs.L.knee.rotation.x = P.knee + Math.max(0, Math.sin(phase + 1.1)) * 0.65 * wb;
      limbs.R.knee.rotation.x = P.knee + Math.max(0, Math.sin(phase + 1.1 + Math.PI)) * 0.65 * wb;

      // Brazos: postura + balanceo al caminar + tecleo o sorbo
      limbs.L.shoulder.rotation.set(P.shL + s * 0.32 * wb, 0, 0.07);
      limbs.R.shoulder.rotation.set(P.shR - s * 0.32 * wb - sip * 0.8, 0, -0.07);
      limbs.L.elbow.rotation.x = P.elL - Math.max(0, -s) * 0.25 * wb + typeL;
      limbs.R.elbow.rotation.x = P.elR - Math.max(0, s) * 0.25 * wb + typeR - sip * 0.6;

      // Cadera, respiración, inclinación del torso
      hips.position.y = P.hipY + Math.abs(Math.cos(phase)) * 0.03 * wb - 0.015 * wb + Math.sin(t * 1.5) * 0.004;
      hips.rotation.y = s * 0.07 * wb;
      torso.rotation.y = -s * 0.05 * wb;
      torso.rotation.x = P.torso + 0.04 * wb;
      thoughtAnchor.position.y = 2.1 + (P.hipY - HIP_HEIGHT);
      // Cabeza: mira al visitante si está cerca y no camina; si no, un leve vaivén
      let goalYaw = Math.sin(t * 0.35) * 0.18 * (1 - wb) + glance * Math.sin(t * 3);
      if (lookTarget && wb < 0.3) {
        const dx = lookTarget.x - root.position.x;
        const dz = lookTarget.z - root.position.z;
        let rel = Math.atan2(dx, dz) - root.rotation.y;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        goalYaw = Math.max(-1.1, Math.min(1.1, rel));
      }
      headYaw += (goalYaw - headYaw) * (1 - Math.exp(-dt * 3));
      head.rotation.y = headYaw;
      head.rotation.x = P.head - sip * 0.25 + Math.sin(t * 0.5) * 0.04;

      uniforms.uTime.value = t;
      uniforms.uActivity.value = activity;
      uniforms.uBaseY.value = root.position.y;
    },
  };
}
