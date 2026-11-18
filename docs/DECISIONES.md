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

## Pendientes de decidir
- Asignación atómica: `UPDATE ... WHERE agent_id IS NULL` y respuesta 409.
- Edición concurrente: bloqueo optimista con `version`.
- Ordenación por score en SQL, desempate por `id`, y tipo de paginación (offset o cursor).

## Limitaciones conocidas
- El score depende del tiempo (antigüedad); varía como mucho una vez al día por lead.
- Neon gratuito: arranque en frío tras inactividad.
- La autenticación es simulada: cualquiera que conozca un X-Agent-Id puede actuar como ese agente. En producción se sustituiría por JWT o sesión.