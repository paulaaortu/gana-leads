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

## Pendientes de decidir
- Autenticación simulada (cabecera `X-Agent-Id` validada contra la tabla `agents`).
- Asignación atómica: `UPDATE ... WHERE agent_id IS NULL` y respuesta 409.
- Edición concurrente: bloqueo optimista con `version`.
- Ordenación por score en SQL, desempate por `id`, y tipo de paginación (offset o cursor).
- Framework HTTP.

## Limitaciones conocidas
- El score depende del tiempo (antigüedad); varía como mucho una vez al día por lead.
- Neon gratuito: arranque en frío tras inactividad.