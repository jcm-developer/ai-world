// Registro de escenarios del hub.
// - SCENARIOS: los que se pueden jugar (tienen implementación).
// - CATALOG: todo lo que muestra el hub, incluidos los que están por llegar.

import detective from './detective/index.js';
import escape from './escape/index.js';
import meridiano from './meridiano/index.js';

export const SCENARIOS = new Map([meridiano, escape, detective].map((s) => [s.id, s]));

export const CATALOG = [
  {
    id: 'meridiano',
    title: 'Sala Meridiano',
    tagline: 'Exploración libre',
    description: 'Una IA curiosa recorre una sala con siete objetos que esconden una historia. Nadie le dice qué buscar.',
    agents: '1 agente',
    accent: '#8cb8ff',
    icon: 'orbit',
  },
  {
    id: 'escape',
    title: 'El Archivo',
    tagline: 'Escape room',
    description: 'Encerrada en el sótano del laboratorio, la IA busca pistas, combina objetos y descifra cerraduras. 150 turnos para salir.',
    agents: '1 agente',
    accent: '#f0c674',
    icon: 'key',
  },
  {
    id: 'detective',
    title: 'La noche del 13',
    tagline: 'Detective',
    description: 'Alguien lanzó el script que provocó la falsa alarma. Una IA detective interroga a cuatro sospechosos, cada uno con su propia IA, sus secretos y su voz.',
    agents: '1 detective + 4 sospechosos',
    accent: '#f08a8a',
    icon: 'lens',
  },
  {
    id: 'carrera',
    title: 'Carrera de obstáculos',
    tagline: 'IA contra IA',
    description: 'Dos modelos compiten por llegar a la meta en un mapa con obstáculos y niebla: explorar, recordar y adaptarse.',
    agents: '2 agentes',
    accent: '#7fd6b0',
    icon: 'flag',
    status: 'proximamente',
  },
  {
    id: 'laboratorio',
    title: 'Laboratorio de leyes ocultas',
    tagline: 'Método científico',
    description: 'Una sala con física secreta. La IA experimenta, formula hipótesis y descubre las reglas del mundo.',
    agents: '1 agente',
    accent: '#c3a6ff',
    icon: 'flask',
    status: 'proximamente',
  },
  {
    id: 'traidor',
    title: 'El traidor',
    tagline: 'Deducción social',
    description: 'Seis agentes en una estación, uno sabotea en secreto. Tareas, debates y votaciones.',
    agents: '6 agentes',
    accent: '#ff9f7a',
    icon: 'mask',
    status: 'proximamente',
  },
  {
    id: 'cooperacion',
    title: 'Cooperación a ciegas',
    tagline: 'Información asimétrica',
    description: 'Una IA ve el mapa pero no se mueve; la otra se mueve pero no ve. Solo pueden hablar con mensajes cortos.',
    agents: '2 agentes',
    accent: '#7fc8e8',
    icon: 'link',
    status: 'proximamente',
  },
  {
    id: 'duelo',
    title: 'Tú contra la IA',
    tagline: 'Juega en tiempo real',
    description: 'Colocas obstáculos mientras la IA intenta llegar a la meta. El único escenario en el que participas.',
    agents: '1 agente + tú',
    accent: '#e6ecf5',
    icon: 'duel',
    status: 'proximamente',
  },
  {
    id: 'arena',
    title: 'Arena de modelos',
    tagline: 'Banco de pruebas',
    description: 'El mismo reto con varios modelos a la vez y un marcador de tiempo, pasos, errores y coste.',
    agents: 'varios modelos',
    accent: '#b8c4d6',
    icon: 'podium',
    status: 'proximamente',
  },
].map((entry) => ({ status: SCENARIOS.has(entry.id) ? 'disponible' : 'proximamente', ...entry }));
