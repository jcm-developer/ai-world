# AI World

Un hub de experimentos con agentes de IA autónomos que viven en mundos 3D. No hay ventana de chat: el mundo entero es su interfaz. Cada agente percibe su entorno, razona, actúa y recuerda sin que nadie le dé instrucciones. Tú solo miras.

**Página del proyecto:** https://jcm-developer.github.io/ai-world/ (en inglés; su código está en `docs/`, publicado con GitHub Pages desde la rama `main`).

Al abrir la aplicación verás el **hub** con todos los escenarios. Hoy se pueden jugar:

- **Sala Meridiano** (exploración libre): una IA curiosa recorre una sala con siete objetos flotantes (un informe, un fragmento de código, una gráfica, una configuración, un registro del sistema, un plano y una cronología). Los inspecciona, guarda lo que aprende y conecta ideas con líneas de luz. La sala esconde una historia: si relaciona bien las pistas, descubre algo que el informe no dice.

- **El Archivo** (escape room): la IA despierta encerrada en el sótano del laboratorio y tiene 150 turnos para salir. Examina objetos, coge lo que encuentra, lo usa o lo combina y descifra cerraduras a partir de pistas. Tras 3 códigos fallidos seguidos, una cerradura se bloquea unos turnos, así que no le compensa adivinar. Cada partida queda en el historial del hub.

  > ⚠️ **Spoilers**: la solución está en `server/scenarios/escape/`. No abras esa carpeta si quieres verlo como espectador.

En camino: Carrera de obstáculos (IA contra IA), Laboratorio de leyes ocultas, Detective, El traidor, Cooperación a ciegas, Tú contra la IA y Arena de modelos.

---

## Requisitos

| Para… | Necesitas |
|---|---|
| Arrancar con Docker (recomendado) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) con Docker Compose |
| Arrancar sin Docker | Node.js **22.13 o superior** (usa el módulo nativo `node:sqlite`) |
| El cerebro de la IA | Una clave de OpenAI (recomendado), NVIDIA NIM, un modelo local con Ollama **o** el modo simulado |

Todo corre en tu máquina: servidor, escena 3D y base de datos (SQLite). El modelo puede ser remoto (OpenAI, NVIDIA NIM) o 100 % local (Ollama).

---

## 1. Consigue una clave

**OpenAI (recomendado)**: entra en **https://platform.openai.com/api-keys**, crea una clave (empieza por `sk-`) y, por prudencia, fija un límite de gasto en *Settings → Limits*. El modelo por defecto es `gpt-5.4-mini`: responde en 1–2 s y razona bien.

**NVIDIA NIM (gratuito, más lento)**: entra en **https://build.nvidia.com**, abre un modelo con *tool calling* y pulsa **"Get API Key"** (empieza por `nvapi-`). El free tier admite ~40 peticiones por minuto, pero con cola puede tardar de 30 a 100 s por respuesta, lo que hace al agente muy lento.

## 2. Configura `.env`

En la raíz del proyecto:

```bash
cp .env.example .env
```

Abre `.env` y pega tu clave:

```ini
API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

Para usar NVIDIA NIM en su lugar, sigue la tabla de [Cambiar de modelo o de proveedor](#cambiar-de-modelo-o-de-proveedor).

El resto de valores ya tienen un valor por defecto razonable (ver [Variables de entorno](#variables-de-entorno)).

> **La clave nunca sale del servidor**: no se envía al navegador, no aparece en los logs (se redacta automáticamente) y `.env` está en `.gitignore` y `.dockerignore`.

## 3. Arranca

### Opción A: Docker (recomendado)

```bash
docker compose up -d --build
```

Abre **http://localhost:3000**. Para ver lo que piensa y hace el agente en tiempo real:

```bash
docker compose logs -f app
```

Parar: `docker compose down`. La memoria del agente se conserva en el volumen `ai-world-data`.

### Opción B: desarrollo local (sin Docker)

```bash
npm install
npm run dev
```

Abre **http://localhost:5173** (Vite con recarga en caliente). El servidor corre en el puerto 3000 y la consola muestra cada tick del agente.

Para simular producción sin Docker: `npm run build && npm start` y abre http://localhost:3000.

### Probar sin clave: modo simulado

Pon `MOCK_LLM=true` en `.env`. Un "cerebro" falso toma decisiones sencillas sin llamar a ninguna API: sirve para ver la escena, el bucle y la memoria funcionando sin gastar peticiones.

---

## Cambiar de modelo o de proveedor

El código usa el SDK de OpenAI, así que funciona con **cualquier API compatible con OpenAI**. Solo hay que cambiar tres variables en `.env`: `BASE_URL`, `MODEL` y la clave.

| Proveedor | `BASE_URL` | `MODEL` (ejemplo) | Clave |
|---|---|---|---|
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `nvidia/nemotron-3.5-lightning-30b-a3b` | `NVIDIA_API_KEY` |
| Ollama en Docker | `http://ollama:11434/v1` | `qwen2.5:7b` | no hace falta |
| Ollama en tu máquina | `http://localhost:11434/v1` | `qwen2.5:7b` | no hace falta |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.4-mini` | `API_KEY` |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct` | `API_KEY` |

Si defines `API_KEY`, tiene prioridad sobre `NVIDIA_API_KEY`. Tras cambiar `.env`, reinicia: `docker compose up -d` (recrea el contenedor) o vuelve a lanzar `npm run dev`.

**Requisito del modelo:** debe admitir *tool calling* (llamadas a funciones). Si el proveedor no acepta `tool_choice: "required"`, el servidor pasa automáticamente a `"auto"`.

### Modelo 100 % local con Ollama (en Docker)

```bash
# 1. En .env:  BASE_URL=http://ollama:11434/v1   MODEL=qwen2.5:7b
# 2. Levanta la app junto con Ollama
docker compose --profile local-llm up -d --build
# 3. Descarga el modelo (solo la primera vez)
docker compose exec ollama ollama pull qwen2.5:7b
```

Con GPU NVIDIA, descomenta el bloque `deploy` del servicio `ollama` en `docker-compose.yml` (requiere NVIDIA Container Toolkit). Sin GPU funciona, pero cada decisión tardará bastante más: sube `TICK_MS` si hace falta.

---

## Qué verás

**El hub** (`/`): una tarjeta por cada mundo jugable, con si alguien lo está mirando y cuánto ha vivido o cómo acabó la última partida, y debajo, en «Lo que viene», los escenarios en desarrollo o por llegar. Pulsa una tarjeta para entrar. El hub, la pantalla de juego y la [landing](https://jcm-developer.github.io/ai-world/) comparten estilo: titulares en Instrument Serif, texto en Inter y etiquetas en JetBrains Mono (se cargan de Google Fonts; sin conexión se usan fuentes del sistema).

**Dentro de un escenario** (Sala Meridiano):

- **La sala**: suelo de hormigón oscuro con reflejos suaves, paredes de yeso, luz blanca y azul fría, un foco cenital que proyecta la sombra de los paneles, conos de luz volumétrica y partículas en suspensión.
- **El avatar**: una silueta humanoide holográfica (shader translúcido con brillo de borde fresnel) que camina hacia los objetos.
- **Los objetos**: paneles flotantes. Antes de inspeccionarlos solo muestran su descripción corta; al inspeccionarlos, un barrido de luz revela su contenido.
- **Las conexiones**: líneas de luz finas entre objetos relacionados, con el motivo flotando unos segundos.
- **Los pensamientos**: texto discreto junto al avatar.
- **El panel lateral** (plegable): estado, último pensamiento, progreso, memoria reciente, actividad y botones **Pausar / Reanudar** y **Reiniciar** (borra lo aprendido en ese escenario y empieza de cero).

**En El Archivo** además verás el inventario (abajo a la izquierda), las luces de cada cerradura (rojo cerrada, ámbar bloqueada, verde abierta), el haz violeta de la linterna UV y, al final, la puerta abriéndose hacia un pasillo iluminado.

**Gráficos realistas.** Las tres salas usan texturas PBR escaneadas (hormigón, yeso, madera, metal, cuero, tela) con su tamaño real, iluminación de entorno con un HDRI por escenario, sombras suaves (los fluorescentes y la lámpara del Archivo, el sol que entra por los ventanales de la oficina y dibuja las lamas de las persianas en el suelo) y un postproceso con oclusión ambiental (GTAO), bloom sutil y antialiasing (SMAA). En pantallas táctiles se usa una calidad **baja** (sin GTAO ni SMAA y sombras más pequeñas); puedes forzarla con `?quality=baja` o `?quality=alta` en la URL. Las texturas y los HDRI son de [Poly Haven](https://polyhaven.com) (licencia CC0) y están en `client/public/assets/`.

**Voz y sonido**: arriba a la izquierda tienes dos botones. **Voz** lee en voz alta cada pensamiento (cada agente tiene su voz y su tono) y **Sonido** activa un ambiente sutil de sala, los pasos del avatar y un efecto discreto para cada acción (examinar, recordar, coger, abrir una cerradura, fallar un código, la puerta…). El navegador recuerda tu elección.

**Los agentes solo piensan mientras alguien mira.** Si cierras la pestaña, quedan en reposo y no gastan peticiones; al volver, retoman donde lo dejaron.

**Cámara en primera persona** (por defecto en ordenador): haz clic en la escena para entrar en la sala y muévete como si estuvieras dentro, con colisiones contra paredes, muebles y el propio avatar.

| Tecla | Acción |
|---|---|
| Ratón | Mirar |
| W A S D / flechas | Caminar |
| Shift | Correr |
| F | Girarte hacia la IA |
| T (mantener) | Hablarle a la IA: suéltala para enviar |
| V | Cambiar a la vista general (y volver) |
| Esc | Soltar el ratón (para usar el panel) |

**Vista general** (botón de cámara o tecla V; por defecto en pantallas táctiles): arrastra para orbitar, rueda para acercar y botón derecho para desplazar. Si no la tocas en 25 s, vuelve a girar despacio sola.

Con la **voz** activada, el texto flotante espera a que empiece el audio y se escribe al mismo ritmo que la voz.

**La IA te percibe.** Cuando estás en primera persona, tu posición y hacia dónde miras entran en su percepción como un visitante («a 2 m, a tu izquierda; te está mirando»). Te saluda al entrar, de vez en cuando te cuenta en voz alta lo que descubre (con un bocadillo ámbar entre comillas, distinto de sus pensamientos, y con su voz si está activada) y gira la cabeza hacia ti cuando estás cerca. Para no distraerse, habla como mucho una vez cada 30 segundos y nunca en lugar de su acción del turno. En la vista general no estás «dentro» de la sala y deja de percibirte.

**Háblale.** En primera persona, mantén pulsada la **T**, habla y suéltala: lo que dices aparece transcrito en directo y, al soltar, se envía. La IA solo te oye si estás cerca (a menos de 6 m; junto a la mira verás «T hablar» o «Acércate a la IA para hablarle»). Te contesta en uno o dos segundos con su voz y su bocadillo, aunque esté caminando, y en su siguiente turno decide ella si te hace caso: sabe que eres un espectador y que puedes equivocarte. Si empiezas a hablar mientras ella habla, se calla. La transcripción usa el reconocimiento de voz del navegador (en Chrome el audio se procesa en los servidores de Google); si tu navegador no lo tiene (Firefox) o no das permiso al micrófono, la T abre un campo para escribir. El micrófono solo funciona en `localhost` o con HTTPS. En los escenarios con final, si alguien le habla la partida queda marcada **«con ayuda humana»** en el hub y en el resultado.

---

## Cómo funciona

```
┌──────────── servidor (Node) ────────────┐        WebSocket         ┌──── navegador ────┐
│  percibir → pensar → actuar → recordar  │ ───── estado, acciones ─▶ │  escena three.js  │
│      ▲          │ LLM         │         │ ◀──── pausa/reanudar ──── │  panel lateral    │
│      │          ▼             ▼         │                           └───────────────────┘
│   mundo (posiciones)     memoria SQLite │
└─────────────────────────────────────────┘
```

**El servidor es la única fuente de verdad.** El navegador solo dibuja lo que recibe.

Cada tick (~5 s):

1. **Percibir**: se genera un texto con los objetos ordenados por distancia (al alcance o lejos, inspeccionados o no), las conexiones creadas, las notas de memoria relevantes y el resultado de las últimas acciones.
2. **Pensar**: una sola petición al modelo con el prompt de sistema, esa percepción y las herramientas disponibles.
3. **Actuar**: el servidor valida y ejecuta hasta dos herramientas (`think` más una acción física).
4. **Recordar**: notas, inspecciones, conexiones y registro de acciones se guardan en SQLite.

Mientras el avatar camina no se consulta al modelo.

### Herramientas del agente

| Herramienta | Qué hace | Validación en el servidor |
|---|---|---|
| `move_to(object_id)` | Camina hacia un objeto | El objeto existe y no está ya a su lado |
| `inspect(object_id)` | Revela el contenido detallado | Debe estar a menos de 2,5 m |
| `connect(id_a, id_b, reason)` | Línea de luz entre dos objetos | Ambos inspeccionados, distintos, motivo no vacío, sin duplicados |
| `remember(note)` | Guarda una nota en memoria | No vacía, máximo 400 caracteres, sin duplicados |
| `think(thought)` | Muestra un pensamiento en el mundo | No vacío, máximo 280 caracteres |

### Memoria

Se guarda en SQLite (`server/data/ai-world.db` en local, volumen `/data` en Docker), separada por **ámbitos**: `meridiano` guarda el estado de la sala (objetos inspeccionados, conexiones, posición del avatar) y `meridiano/main` la memoria del agente (notas, registro de acciones, tick). Cada escenario y cada agente tienen la suya. La tabla `runs` guarda el historial de partidas de los escenarios con final. Se carga al arrancar, así que la IA recuerda lo aprendido entre sesiones.

Al modelo solo le llegan las últimas `MEMORY_WINDOW` notas, más algunas antiguas que mencionen los objetos que tiene al alcance, para no gastar contexto.

**Empezar de cero en un escenario**: botón **Reiniciar** del panel.

**Borrar toda la memoria del hub**:

```bash
# Local
rm server/data/ai-world.db*

# Docker
docker compose down
docker volume rm ai-world_ai-world-data
```

### Robustez

- **Límite de peticiones (429)**: espera con backoff exponencial (5 s, 10 s, 20 s… hasta 2 min) y respeta `Retry-After`. Nunca reintenta en bucle; el panel muestra la cuenta atrás.
- **Clave inválida (401/403) o modelo inexistente (404)**: el agente se detiene y lo indica en el panel. Corrige `.env`, reinicia y pulsa **Reanudar**.
- **Errores de red o del proveedor**: nuevo intento con espera creciente.
- **Herramienta inválida, JSON roto o texto sin herramienta**: se registra, el agente ve el error en su siguiente percepción y sigue. Si el modelo escribe la llamada como texto (`<tool_call>…`), se rescata.
- **Una sola petición a la vez**: el bucle es secuencial y entre dos peticiones pasan al menos `TICK_MS` ms.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `NVIDIA_API_KEY` | — | Clave de NVIDIA NIM |
| `API_KEY` | — | Clave para otros proveedores (prioritaria si existe) |
| `BASE_URL` | `https://integrate.api.nvidia.com/v1` (en `.env.example`: OpenAI) | Endpoint compatible con OpenAI |
| `MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` (en `.env.example`: `gpt-5.4-mini`) | Modelo a usar |
| `TICK_MS` | `5000` | Milisegundos mínimos entre decisiones |
| `MEMORY_WINDOW` | `12` | Notas recientes que se envían al modelo |
| `TOOL_CHOICE` | `required` | `required` o `auto` |
| `TEMPERATURE` | `0.6` | Creatividad del modelo |
| `REASONING_EFFORT` | `low` | Razonamiento interno del modelo (`none`, `low`, `medium`, `high`); se desactiva solo si el proveedor no lo admite |
| `API_MODE` | `auto` | `auto` (API Responses con OpenAI cuando hay razonamiento; chat/completions en el resto), `chat` o `responses` |
| `MAX_TOKENS` | `1500` | Máximo de tokens por respuesta (incluye el razonamiento en modelos que razonan) |
| `REQUEST_TIMEOUT_MS` | `90000` | Espera máxima por respuesta del modelo |
| `TTS_PROVIDER` | `openai` | Voz: `openai`, `browser` (voz del navegador, gratis) u `off` |
| `TTS_MODEL` | `gpt-4o-mini-tts` | Modelo de voz de OpenAI |
| `TTS_VOICE` | `marin` | Voz por defecto (cada escenario define la suya) |
| `TTS_API_KEY` | la de `API_KEY` | Clave para la voz, si es distinta |
| `MOCK_LLM` | `false` | `true` para usar el cerebro simulado |
| `PORT` | `3000` | Puerto del servidor (en Docker, puerto publicado en tu máquina) |
| `DB_PATH` | `./data/ai-world.db` | Ruta de SQLite, relativa a `server/` (en Docker se fija a `/data`) |

---

## Estructura

Un **motor común** (bucle de agentes, memoria, sesiones, escena base) y **escenarios enchufables** que aportan su mundo, sus herramientas y su vista 3D.

```
ai-world/
├─ docker-compose.yml, Dockerfile   # app + Ollama opcional
├─ .env.example                     # plantilla de configuración
├─ server/
│  ├─ index.js              # Express + WebSocket: API del hub y sesiones por escenario
│  ├─ config.js, logger.js  # configuración (.env) y logs con redacción de secretos
│  ├─ engine/
│  │  ├─ session.js         # un escenario en marcha: mundo, agentes, espectadores, fin de partida
│  │  ├─ agent.js           # bucle percibir → pensar → actuar → recordar (genérico)
│  │  ├─ llm.js             # cliente compatible con OpenAI y clasificación de errores
│  │  ├─ mockBrain.js       # cerebro simulado (MOCK_LLM)
│  │  └─ memory.js          # SQLite por ámbitos + historial de partidas
│  └─ scenarios/
│     ├─ index.js           # registro y catálogo del hub
│     ├─ common/            # herramientas y piezas de percepción compartidas (think, remember…)
│     └─ meridiano/         # world, tools, perception, prompt, mock, index (definición)
└─ client/
   ├─ index.html            # hub
   ├─ play.html             # escena de juego (?s=<escenario>)
   └─ src/
      ├─ hub/               # página del hub
      ├─ play/main.js       # monta el escenario y lo sincroniza con el servidor
      ├─ engine/            # stage, avatar, agents, thoughts, links, panel, socket
      └─ scenarios/
         ├─ registry.js     # vistas 3D por escenario
         └─ meridiano/      # sala, objetos, texturas de contenido
```

### Añadir un escenario

1. **Servidor**: crea `server/scenarios/<id>/index.js` exportando un objeto con `id`, `title`, `agents` (lista de `{ id, name, color }`), `freeTools`, `createWorld(saved)`, `systemPrompt()`, `tools()`, `perceive(ctx)`, `execute(name, args, ctx)`, `mockDecide(ctx)` y, opcionalmente, `stats()`, `hasEnding` y `checkFinish()`. El mundo debe implementar `update(dt)`, `isBusy(agentId)`, `agentState(agentId)`, `publicState()` y `serialize()`.
2. Regístralo en `server/scenarios/index.js` (en `SCENARIOS` y en `CATALOG`).
3. **Cliente**: crea `client/src/scenarios/<id>/index.js` con `stageOptions` y `mount(ctx)`, que devuelve `{ init(world), onAction(action), update(dt, t) }`, y añádelo a `registry.js`.

Para cambiar los objetos de la Sala Meridiano, edita `OBJECTS` en `server/scenarios/meridiano/world.js`.

---

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Panel en "Detenido" con error 401 | Clave vacía o incorrecta en `.env` |
| Panel en "Detenido" con error 404 | El modelo no existe en ese proveedor: revisa `MODEL` |
| "En espera · N s" frecuente | Demasiadas peticiones: sube `TICK_MS` (p. ej. 5000) |
| El agente responde con texto y no actúa | El modelo no admite tool calling: elige otro |
| `Cannot find module 'node:sqlite'` | Node es anterior a 22.13: actualízalo o usa Docker |
| La escena va lenta | Tarjeta gráfica modesta: añade `?quality=baja` a la URL, reduce el tamaño de la ventana o cierra otras pestañas con 3D |
