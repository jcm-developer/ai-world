# AGENTS.md

Normas para agentes de IA (y personas) que trabajen en este repositorio. Qué es el proyecto y cómo se usa está en el [README](README.md); la hoja de ruta, en [TASKS.md](TASKS.md).

## Commits

- **Una sola línea**, con prefijo convencional y en español:
  - `feat: …` nueva funcionalidad
  - `fix: …` arreglo
  - `docs: …` documentación
  - `refactor: …` reorganización sin cambiar comportamiento
  - `style: …` formato
  - `chore: …` dependencias, configuración, Docker
- **Sin** líneas de co-autoría (`Co-Authored-By`) ni ninguna otra atribución.
- Un commit por cambio con sentido propio. No mezcles, por ejemplo, un escenario nuevo con un arreglo de otro.

## Idioma y estilo

- Código, comentarios, textos de interfaz, prompts y documentación **en español**. Los identificadores del código, en inglés.
- JavaScript puro con módulos ES, sin TypeScript ni frameworks de UI. Frontend con three.js y Vite; backend con Node 22.13+, Express y `ws`.
- **Sin dependencias nuevas** salvo que sean imprescindibles. Por ejemplo, SQLite se usa con el módulo nativo `node:sqlite`.
- Imita el estilo del código que rodea tu cambio: densidad de comentarios, nombres, formato (2 espacios, comillas simples, punto y coma).

## Seguridad (innegociable)

- **Nunca** subas `.env`, claves ni bases de datos (`server/data/`, `*.db`). Ya están en `.gitignore` y `.dockerignore`: no los quites.
- La clave del modelo **nunca llega al navegador ni a los logs**. Todo log pasa por `server/logger.js`, que la redacta. El navegador solo recibe estado del mundo.
- El servidor es la **única fuente de verdad**. Toda acción de un agente se valida en el servidor (distancias, inventario, cerraduras…). El cliente solo dibuja.
- Los secretos de un escenario (soluciones, personalidades ocultas) **no se envían al cliente**. Por ejemplo, de los sospechosos del Detective solo se publican `id`, `name`, `title`, `color` y la voz.

## Arquitectura en dos líneas

- `server/engine/` es el motor común: bucle de agentes, cliente del modelo, memoria SQLite por ámbitos, sesiones y voz.
- `server/scenarios/<id>/` y `client/src/scenarios/<id>/` son escenarios enchufables. Para añadir uno, sigue «Añadir un escenario» en el README y regístralo en `server/scenarios/index.js` y `client/src/scenarios/registry.js`.

Principios que conviene mantener:
- El modelo decide **qué** hacer mediante herramientas (tool calling). El servidor resuelve el **cómo** (trayectorias, efectos) y devuelve errores claros para que el agente corrija en el siguiente turno.
- La percepción es texto compacto y de tamaño estable: lo cercano, el progreso, las notas relevantes y las últimas acciones. Si un agente entra en bucles, suele faltarle información de estado en la percepción, no más texto en el prompt.
- Los agentes no gastan peticiones si nadie mira, mientras caminan, ni durante un backoff.

## Spoilers

Las soluciones de los escenarios con final están en el código del servidor: `server/scenarios/escape/` y `server/scenarios/detective/`. Al hablar con el usuario **no reveles soluciones** (códigos, culpables, cadenas de pistas) salvo que las pida expresamente. Al mostrar logs, tapa códigos y diálogos que desvelen el caso.

## Verificar antes de dar algo por hecho

```bash
node --check server/<archivo>.js           # sintaxis del servidor
npm run build                              # compila el cliente (Vite)
MOCK_LLM=true TTS_PROVIDER=off npm run dev # prueba sin clave ni gasto
docker compose up -d --build               # despliegue local
```

- Con `MOCK_LLM=true` cada escenario tiene un cerebro simulado (`mock.js`) que debe completarlo. Úsalo para comprobar que un cambio no rompe el bucle.
- Para probar con un modelo real sin tocar la memoria del usuario, usa una base de datos temporal: `DB_PATH=/ruta/temporal/prueba.db`.
- Los cambios visuales se comprueban con capturas (Chrome headless con `--use-angle=swiftshader`). El parámetro `?cam=x,y,z,tx,ty,tz` fija la cámara.
- Si algo no se ha podido probar (por ejemplo, audio o control con ratón), dilo explícitamente.

## Documentación

- Cualquier cambio visible para el usuario se refleja en el **README** (en español), y en `.env.example` si añade variables de entorno.
- Marca en **TASKS.md** lo terminado y apunta ahí las ideas que queden pendientes.
- **Cada desarrollo actualiza la documentación y la landing** en el mismo cambio. La landing (`docs/`, publicada en https://jcm-developer.github.io/ai-world/ con GitHub Pages) presenta el proyecto al público: si añades o cambias un escenario o una función visible, actualiza su texto y, si hace falta, sus capturas (`docs/assets/`, en WebP y sin spoilers). Es un escaparate: nada de instalación ni detalles internos.
