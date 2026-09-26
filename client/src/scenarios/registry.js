// Registro de vistas 3D por escenario (se cargan bajo demanda).
// Cada módulo exporta:
//   stageOptions   → cámara y niebla del escenario
//   mount(ctx)     → { init(world), onAction(action), onAgentsPos?(list), update(dt, t) }

export const SCENARIO_VIEWS = {
  meridiano: () => import('./meridiano/index.js'),
  escape: () => import('./escape/index.js'),
  detective: () => import('./detective/index.js'),
};
