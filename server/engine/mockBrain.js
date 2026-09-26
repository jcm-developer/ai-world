// Cerebro simulado (MOCK_LLM=true): decide sin llamar a ninguna API.
// Cada escenario aporta su propia política sencilla (scenario.mockDecide).
// Sirve para probar el bucle, la memoria y la escena 3D sin clave ni consumo.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MockBrain {
  label = 'cerebro simulado (MOCK_LLM)';
  turn = 0;

  configWarning() {
    return null;
  }

  /** Conversación simulada: devuelve la respuesta de respaldo que aporte el escenario. */
  async complete({ mock }) {
    await sleep(150);
    return mock ?? '…';
  }

  async decide({ ctx }) {
    await sleep(200); // simula latencia
    this.turn += 1;
    const toolCalls = ctx.scenario.mockDecide({ ...ctx, turn: this.turn });
    // Si hay un visitante, de vez en cuando le dice algo (para probar la herramienta say)
    if (ctx.visitors?.length && this.turn % 4 === 0) toolCalls.unshift({ name: 'say', args: { message: 'Hola. Sigo investigando; puedes quedarte a mirar.' } });
    return { toolCalls, content: '', finishReason: 'tool_calls' };
  }
}
