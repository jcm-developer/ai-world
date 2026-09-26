# TASKS — AI World

Hoja de ruta del hub. Cada escenario nuevo se añade como módulo enchufable (ver «Añadir un escenario» en el README).

## Hecho

- [x] Motor común: bucle de agentes, memoria SQLite por ámbitos, sesiones, historial de partidas, fin de partida
- [x] Hub con catálogo de escenarios y estado en vivo
- [x] **Sala Meridiano**: exploración libre
- [x] **El Archivo**: escape room
- [x] Voz de los agentes (OpenAI TTS con respaldo en la voz del navegador) y sonido ambiente, con el texto sincronizado con la voz
- [x] Cámara en primera persona (WASD + ratón) con colisiones
- [x] La IA percibe al visitante en primera persona, le saluda y le habla (herramienta say)
- [x] Hub y pantalla de juego con el mismo estilo que la landing (serif con cursiva de acento, etiquetas mono, botones en píldora)
- [x] Gráficos realistas: texturas PBR y HDRI de Poly Haven (CC0), sombras, GTAO y SMAA, con calidad baja en móvil
- [x] El visitante puede hablarle a la IA (pulsar T para hablar, con texto como respaldo); las partidas con final quedan marcadas «con ayuda humana»
- [x] Landing de producto para GitHub Pages (`docs/`)

## Escenarios pendientes

### 1. Carrera de obstáculos · IA contra IA
Dos modelos compiten por llegar primero a la meta en un mapa con obstáculos.
- Mapa en rejilla con muros, puertas, trampas y zonas que cambian con el tiempo.
- Niebla de guerra: cada agente solo percibe lo que tiene cerca y debe recordar el mapa (callejones sin salida, atajos).
- Acciones de alto nivel (el modelo decide cada pocos segundos, no puede «conducir»): moverse a una casilla o punto de paso, empujar, saltar, abrir. El servidor resuelve colisiones y trayectorias.
- Cada agente con su propio modelo (p. ej. GPT contra Nemotron) mediante `modelEnv`.
- Novedades técnicas: colisiones, rejilla de navegación (A*), multiagente en la misma escena. Desbloquea los demás escenarios con varios agentes.

### 2. Laboratorio de leyes ocultas · Método científico
Una sala con física secreta que la IA debe descubrir experimentando.
- Reglas ocultas (p. ej. los objetos rojos pesan menos, un sonido abre una puerta, la luz altera la gravedad).
- Herramientas para experimentar (soltar, empujar, combinar, medir) y registrar hipótesis.
- Final: enunciar correctamente las reglas; puntuación según aciertos y número de experimentos.

### 3. Detective · Interrogatorio
Un caso con varios personajes (también IAs) que tienen su versión de los hechos, y alguno miente.
- El detective interroga, cruza testimonios con pruebas físicas y acusa.
- Novedades técnicas: diálogo entre agentes, personajes con secretos e instrucciones propias.
- Final: acusación correcta o incorrecta.

### 4. El traidor · Deducción social
Seis agentes en una estación espacial; uno sabotea en secreto.
- Fases: tareas, reunión, debate y votación.
- El más caro en peticiones: conviene `TICK_MS` alto o modelos «nano».
- Final: expulsan al traidor o este completa el sabotaje.

### 5. Cooperación a ciegas · Información asimétrica
Dos IAs que se necesitan: una ve el mapa pero no se mueve, la otra se mueve pero está a ciegas.
- Solo pueden comunicarse con mensajes cortos y limitados.
- Pone a prueba cómo se explican las cosas entre ellas.

### 6. Tú contra la IA · Tiempo real
El único escenario en el que participa el usuario.
- Colocas obstáculos mientras la IA intenta llegar a la meta, o jugáis al escondite.
- Novedades técnicas: controles del usuario en el navegador que el servidor valida.

### 7. Arena de modelos · Banco de pruebas
Una capa sobre los demás escenarios: el mismo reto con varios modelos a la vez.
- Marcador de tiempo, pasos, errores y coste por modelo.
- Historial comparativo de partidas.

## Mejoras apuntadas

- [ ] Sala Meridiano: herramienta `conclude` para que la IA registre su explicación final del mundo.
- [ ] Sala Meridiano: mundo cambiante (objetos nuevos cada cierto tiempo o al terminar).
- [ ] Agentes que se ponen en reposo solos cuando no les queda nada nuevo que hacer.
- [ ] El Archivo: experimento de ocultar el límite de turnos y comparar el comportamiento.
- [ ] El Archivo: memoria entre partidas, para ver si aprende y escapa más rápido.
- [ ] Hub: comprobar el diseño en un móvil real.
- [ ] Visión real: enviar al modelo una imagen desde los ojos del avatar en lugar de (o junto a) la descripción en texto.
- [ ] Búsqueda de caminos para los avatares (que rodeen los muebles en lugar de atravesarlos).
- [ ] Gráficos: modelos 3D reales (glTF) para muebles y personajes, y texturas comprimidas en KTX2.
- [ ] Hablar con quien miras: dirigirte a un personaje concreto (p. ej. interrogar tú a los sospechosos del Detective).
- [ ] Transcripción de voz en el servidor (`STT_PROVIDER=openai`) para navegadores sin reconocimiento de voz y mejor calidad.
- [ ] Landing: añadir un vídeo o GIF corto de una partida real.
