// Política del cerebro simulado del detective (MOCK_LLM=true): examina las pruebas,
// interroga a todos, confronta al culpable y acusa. Sirve para probar sin gastar peticiones.
//
// ⚠️ SPOILERS: contiene la solución.

import { EVIDENCE_IDS, REACH, TALK_REACH } from './world.js';
import { SUSPECT_IDS } from './suspects.js';

const call = (name, args) => ({ name, args });

export function mockDecide({ world, turn }) {
  const think = (thought) => (turn % 2 ? [call('think', { thought })] : []);

  const pending = EVIDENCE_IDS.find((id) => !world.examined.has(id));
  if (pending) {
    if (world.distanceTo(pending) > REACH) return [call('move_to', { target_id: pending })];
    return [...think('Una prueba más para el tablero.'), call('examine', { evidence_id: pending })];
  }

  const silent = SUSPECT_IDS.find((id) => !world.conversations[id]?.length);
  if (silent) {
    if (world.distanceTo(silent) > TALK_REACH) return [call('move_to', { target_id: silent })];
    return [...think('Quiero su versión de la noche del 13.'), call('ask', { suspect_id: silent, question: '¿Dónde estaba la noche del 13 a las 23:58?', evidence_id: 'ninguna' })];
  }

  if ((world.conversations.tomas?.length ?? 0) < 2) {
    if (world.distanceTo('tomas') > TALK_REACH) return [call('move_to', { target_id: 'tomas' })];
    return [...think('Sus horas no cuadran con el registro.'), call('ask', { suspect_id: 'tomas', question: 'El registro dice que entró a las 23:41. ¿Por qué me mintió?', evidence_id: 'registro_accesos' })];
  }

  return [
    call('think', { thought: 'Accesos, café con su tarjeta y la comisión de Sensotek: todo apunta a Tomás.' }),
    call('accuse', { suspect_id: 'tomas', reasoning: 'Tomás volvió a las 23:41, compró un café en la sala de servidores a las 23:52 con su tarjeta y usó la contraseña del pósit de Marcos para lanzar el script, por la comisión de Sensotek.' }),
  ];
}
