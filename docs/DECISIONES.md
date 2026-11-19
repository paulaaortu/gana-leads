# Decisiones técnicas

Registro de decisiones con su justificación. Se actualiza a medida que avanza el proyecto.

| # | Tema | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|---|
| 1 | Base de datos | PostgreSQL (Neon) | Transacciones, índices y `UPDATE` condicionales atómicos; filtros y orden eficientes con muchos leads | MongoDB |
| 2 | Migraciones | SQL versionado + script propio con transacción y tabla `_migrations` | Reproducible e idempotente, sin dependencias extra | ORM con migraciones automáticas |
| 3 | Acceso a datos | `pg` con SQL directo | Control total sobre el `UPDATE` condicional y la consulta de ordenación por score | ORM |
| 4 | Pesos | Enteros en %, suma exacta 100 | Evita errores de coma flotante | Decimales con tolerancia |
| 5 | Validación de pesos | Doble barrera: lógica de aplicación (acumula todos los errores) + restricciones en BD | Mensajes útiles al usuario y garantía de integridad aunque falle la app | Solo validar en la API |
| 6 | Config. de pesos | Versionada; una sola activa (índice único parcial) | Consistencia ante cambios mientras otros consultan; trazabilidad | Sobrescribir filas |
| 7 | Dato ausente o inválido | Valoración 0 + `reason` en el desglose | Regla explícita y predecible; penaliza la falta de información; la UI puede explicarlo | Valor neutro 50; redistribuir pesos (más complejo, sin ganancia clara) |
| 8 | Antigüedad | Ascendente: más antiguo = más prioridad; días enteros; tope 90 días | Un lead que lleva tiempo esperando requiere atención; días enteros para que el score no cambie a cada segundo | Descendente (lead reciente = más caliente) |
| 9 | Reloj | Un único `now` inyectado por petición | Coherencia dentro de una página de resultados y tests deterministas | `Date.now()` dentro de las funciones |
| 10 | Prioridad | Se decide sobre la puntuación ya redondeada | Lo que ve el usuario es coherente con su categoría (sin "75.00 = media") | Umbral sobre el valor sin redondear |
| 11 | Constantes de negocio | Centralizadas en `criteria.ts` | Cambiar una regla es una modificación de una línea | Valores dispersos por el código |
| 12 | Cálculo del score | Siempre en el servidor | La puntuación no es manipulable desde el navegador | Aceptar un score enviado por el cliente |
| 13 | Framework HTTP | Express 5 + Zod | Maduro, conocido y suficiente; Express 5 propaga errores de handlers async sin envoltorios; Zod valida entradas y configuración | Fastify (válido, pero sin ventaja clara aquí) |
| 14 | Estructura del servidor | `app.ts` (aplicación) separado de `server.ts` (arranque) | Permite probar la API con supertest sin abrir puerto | Todo en un solo fichero |
| 15 | Errores | Formato único `{ error: { code, message, details } }` con `AppError` y un manejador central | Respuestas coherentes; el cliente decide por `code`; los fallos internos no filtran detalles | Respuestas ad hoc en cada ruta |
| 16 | Autenticación | Simulada: cabecera `X-Agent-Id` validada contra `agents`; el rol sale siempre de la BD | El backend decide la identidad; 401 si no hay identidad, 403 si falta permiso | Confiar en un rol enviado por el cliente |
| 17 | Datos de ejemplo | Seed determinista, agentes idempotentes (ids fijos), leads regenerables, inserción por lotes con `unnest` | Reproducible y rápido; no destruye la config de pesos | `TRUNCATE ... CASCADE` (borraría la config) |
| 18 | Configuración | Variables de entorno validadas con Zod al arrancar | Fallo temprano y con mensaje claro | Leer `process.env` sin validar |
| 19 | Score en listados | Calculado en SQL con los pesos activos, generado desde las mismas constantes que el motor TypeScript | Orden y paginación siempre coherentes con la configuración vigente; sin recálculos al cambiar pesos; una sola fuente de verdad para las reglas | Score precalculado y guardado (más rápido de leer, pero exige recalcular y se puede desincronizar) |
| 20 | Consistencia ante cambio de pesos | Pesos y leads se leen en una sola sentencia SQL; la respuesta incluye `weightsConfigId` | Una sentencia ve una instantánea consistente: nunca se mezclan dos configuraciones en una respuesta | Leer pesos en una consulta y leads en otra |
| 21 | Configuración inválida | El CTE solo admite configuraciones con 4 criterios y suma 100; si no hay ninguna válida → 503 `WEIGHTS_CONFIG_INVALID` | Respuesta predecible en lugar de scores absurdos | Asumir que la configuración siempre es válida |
| 22 | Empates | `ORDER BY score, id ASC` | Orden determinista y paginación estable | Orden por score solo |
| 23 | Paginación | Offset/limit con `count(*) OVER ()` y `pageSize` máximo 100 | Encaja con el "1–20 de N" y los botones Anterior/Siguiente; el tope evita peticiones desmesuradas | Paginación por cursor (mejor en páginas profundas, pero no permite saltar a una página ni mostrar el total) |
| 24 | Búsqueda | `ILIKE` en nombre y `LIKE` en teléfono con escape de comodines | Simple, segura y suficiente; parámetros siempre enlazados (sin inyección SQL) | Búsqueda de texto completo |
| 25 | Cobertura SQL/TS | Test que compara el score de SQL con el de TypeScript sobre todo el seed | Detecta cualquier divergencia entre las dos implementaciones | Confiar en que coinciden |
| 26 | Entrada de datos | Esquemas Zod `.strict()`: cualquier campo no permitido se rechaza con 400 | La puntuación no es manipulable desde el navegador; evita *mass assignment* (estado, agente, fechas, versión) | Ignorar en silencio los campos extra |
| 27 | Alta de leads | El servidor fija estado `nuevo`, sin agente y la fecha de creación | El cliente no decide datos que son del sistema | Aceptarlos del cliente |
| 28 | Teléfono | Se normaliza (sin espacios ni signos) y valida: 7–15 dígitos, `+` inicial opcional; se guarda normalizado | Datos consistentes y búsqueda fiable | Guardar el texto tal cual |
| 29 | Edición concurrente | Bloqueo optimista: el cliente envía `version`; `UPDATE ... WHERE id AND version` atómico; si no coincide → 409 con `currentVersion` | Detecta datos desactualizados sin bloqueos largos y sin ventana de carrera; no se pierde ningún cambio en silencio | *Last write wins*; bloqueo pesimista (`SELECT ... FOR UPDATE` durante la edición); `ETag`/`If-Match` (equivalente, más estándar pero más ceremonia) |
| 30 | Edición parcial | PATCH con solo los campos enviados; `null` borra el dato; columnas editables en lista blanca | Distingue «no tocar» de «borrar»; sin inyección por nombres de columna | PUT con el recurso completo |
| 31 | Detalle | Score y desglose calculados con el motor TypeScript y los pesos activos; la respuesta incluye `weightsConfigId` | Desglose explicable; toda la respuesta usa una única versión de pesos | Reutilizar el SQL del listado |
| 32 | Identificadores en URL | Validados antes de llegar a la BD (400 si están mal formados) | Un id inválido nunca debe ser un 500 | Dejar que falle PostgreSQL |
| 33 | Permisos de asignación | Un agente solo se asigna a sí mismo; un admin asigna a cualquier agente; solo se asigna a usuarios con rol `agent` | Regla simple de defender; el admin gestiona, no lleva leads | Cualquiera asigna a cualquiera |
| 34 | Asignación atómica | `UPDATE ... WHERE id AND agent_id IS NULL`; si no cambia ninguna fila → 409 `ALREADY_ASSIGNED` | Comprobar y escribir en una sola sentencia elimina la ventana de carrera; solo un agente puede ganar | `SELECT` y luego `UPDATE` (carrera); `SELECT ... FOR UPDATE` (válido, pero más bloqueos y más código); tabla de asignaciones con restricción única |
| 35 | Desasignación | Permiso (agente asignado o admin) comprobado dentro del `UPDATE` | Nadie puede cambiar el dueño entre la comprobación y la escritura | Comprobar el permiso aparte |
| 36 | Idempotencia | Repetir la misma asignación o desasignación devuelve 200 sin cambios | Un doble clic o un reintento de red no produce un error confuso; 409 solo si el dueño es otro | 409 siempre que no haya cambio |
| 37 | Asignar y versión | Asignar/desasignar suben `version` y `updated_at` | Cualquier modificación del lead invalida las ediciones hechas con datos anteriores | Asignación sin tocar la versión |
| 38 | Asignación y estado | La asignación no depende del estado del lead | Reglas independientes y más simples; las transiciones de estado se tratan aparte | Impedir asignar leads cerrados |
| 39 | Lista de agentes | `GET /api/agents` público | Es la pantalla de "login" simulado; solo expone nombre y rol de usuarios de prueba | Exigir identidad (imposible de usar antes de elegirla) |
| 40 | Transiciones de estado | Libres entre los cuatro estados; excepción: reabrir un lead `cerrado` solo lo hace un admin | Flexible para el trabajo diario y protege el cierre, que suele tener consecuencias de negocio | Máquina de estados estricta (nuevo → en gestión → contactado → cerrado) |
| 41 | Quién cambia el estado | El agente asignado o un admin; un lead sin asignar solo lo cambia un admin (el agente primero se lo asigna) | Responsabilidad clara: quien lleva el lead decide su estado | Cualquier agente |
| 42 | Mecanismo del cambio de estado | Transacción corta con `SELECT ... FOR UPDATE`; reglas en una función pura (`checkStatusChange`) | Hay varias reglas: evaluarlas en código evita duplicarlas en SQL y en TypeScript, y permite probarlas sin base de datos. La asignación, con una sola condición, sí cabe en un `UPDATE` condicional | `UPDATE` condicional con todo en el `WHERE` (lógica duplicada y difícil de mantener) |
| 43 | Estado y versión | El cambio exige `version`; si no coincide → 409. Pedir el estado que ya tiene → 200 sin cambios | Una decisión basada en datos viejos no se aplica a ciegas; los reintentos no fallan | Aceptar el cambio sin versión |
| 44 | Orden de comprobaciones | Existencia → permisos → idempotencia → versión | No revelar el estado del lead a quien no tiene permiso | Comprobar primero la versión |
| 45 | Transacciones | Ayudante `withTransaction` (COMMIT/ROLLBACK, libera siempre la conexión) | Reutilizable (también para guardar pesos) y sin fugas de conexiones | Gestionar BEGIN/COMMIT a mano en cada sitio |
| 46 | Guardado de pesos | Cada guardado crea una configuración NUEVA y la activa en una transacción (desactiva la anterior e inserta la nueva); el histórico se conserva | Trazabilidad y consistencia: nunca se editan pesos "en caliente"; el cambio es atómico | Sobrescribir los pesos existentes |
| 47 | Bloqueo optimista de pesos | El cliente envía `baseConfigId`; si ya no es la activa → 409 `CONFIG_CONFLICT` con `currentConfigId` | Dos administradores no se pisan los cambios; mismo criterio que en los leads | *Last write wins* |
| 48 | Serialización de guardados | `pg_advisory_xact_lock` al inicio de la transacción | Los guardados concurrentes se atienden en fila y el segundo lee el estado ya confirmado. `SELECT ... FOR UPDATE ... WHERE is_active` falla: tras esperar, la fila ya no cumple el filtro y no devuelve la nueva activa, abriendo una ventana de sobreescritura | `FOR UPDATE` sobre la fila activa; nivel `SERIALIZABLE` con reintentos |
| 49 | Consistencia al cambiar pesos | Lecturas de una sola sentencia (instantánea de PostgreSQL) y `weightsConfigId` en cada respuesta | Nadie ve una mezcla de dos configuraciones en una respuesta; el cliente puede detectar un cambio entre páginas y refrescar | Leer pesos y leads en consultas separadas |
| 50 | Validación de pesos | `validateWeights` (todos los errores a la vez) en la API + restricciones en BD; enteros de 0 a 100, suma 100 | Doble barrera sin duplicar reglas; un peso 0 es legítimo (anula un criterio) | Validar solo en la interfaz |
| 51 | Lectura y escritura | `GET` para cualquier usuario autenticado; `PUT` solo admin. El `GET` devuelve `valid` y `errors` en vez de fallar | El administrador necesita ver una configuración corrupta para repararla | Hacer fallar el `GET` con 503 |
| 52 | Configuración corrupta | Listado y detalle → 503 `WEIGHTS_CONFIG_INVALID`; si no hay ninguna activa, se permite guardar una nueva sin base | Respuesta predecible en vez de puntuaciones sin sentido, con vía de recuperación | Asumir que siempre es válida |
| 53 | Descripción de criterios | Etiquetas y reglas generadas desde las constantes de `criteria.ts` | La pantalla de administración no puede desincronizarse de las reglas reales | Textos escritos a mano en el frontend |
| 54 | Tests de integración | Ejecución en serie y los de pesos restauran la configuración original | Comparten la base de datos; evita fallos falsos y no deja basura | Ejecución en paralelo |

## Pendientes de decidir
- Asignación atómica: `UPDATE ... WHERE agent_id IS NULL` y respuesta 409.
- Edición concurrente: bloqueo optimista con `version`.
- Ordenación por score en SQL, desempate por `id`, y tipo de paginación (offset o cursor).

## Limitaciones conocidas
- El score depende del tiempo (antigüedad); varía como mucho una vez al día por lead.
- Neon gratuito: arranque en frío tras inactividad.
- La autenticación es simulada: cualquiera que conozca un X-Agent-Id puede actuar como ese agente. En producción se sustituiría por JWT o sesión.
- Ordenar por score calculado obliga a evaluar la puntuación de todos los leads filtrados en cada petición
(no se puede indexar). Con [tu medición con 50 000 leads: ___ ms] es aceptable; para volúmenes mucho
mayores se propone guardar el score y recalcularlo solo al editar un lead o cambiar los pesos, o paginar por cursor.
- La búsqueda con `ILIKE '%…%'` no usa índice; mejora propuesta: índice `pg_trgm`.
- Con offset, las páginas profundas son más lentas; mejora propuesta: paginación por cursor.
- Si la página pedida está fuera de rango, `total` llega como 0.
- Una edición que no cambia ningún valor también incrementa version y updated_at.
- El bloqueo de fila del cambio de estado es muy breve, pero bajo carga extrema podría formar colas sobre un mismo lead; es un caso poco realista (un lead lo lleva una persona).
- Guardar unos pesos idénticos a los actuales crea igualmente una versión nueva; el histórico crece con cada guardado.
- Con una configuración de pesos corrupta (solo posible por manipulación directa de la base de datos), crear o
  editar un lead guarda el cambio pero responde 503, porque no puede calcular la puntuación en la respuesta.
- Un listado paginado puede cruzar un cambio de pesos entre dos páginas; cada respuesta declara su
  `weightsConfigId` para que el cliente lo detecte y refresque.