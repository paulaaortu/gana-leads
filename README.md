# Gestión de leads comerciales

Aplicación fullstack para gestionar leads comerciales con asignación a agentes y priorización
mediante un sistema configurable de puntuación ponderada.

**Stack:** Node.js + TypeScript (API HTTP), React + TypeScript (frontend), PostgreSQL (Neon).

## Requisitos
- Node.js 20 o superior
- Una base de datos PostgreSQL. Se usó [Neon](https://neon.com) (plan gratuito); sirve cualquier PostgreSQL 14+.

## Instalación y configuración

```bash
git clone https://github.com/paulaaortu/gana-leads.git
cd gana-leads/backend
npm install
cp .env.example .env
```

Edita `backend/.env` con tu cadena de conexión:

```
DATABASE_URL=postgresql://usuario:contraseña@host/dbname?sslmode=verify-full&channel_binding=require
PORT=3000
```

> El fichero `.env` está en `.gitignore`: no se suben credenciales al repositorio.
> En Neon la cadena se copia desde el botón **Connect** del proyecto (usar la conexión directa, no la *pooled*).

## Ejecución

```bash
cd backend
npm run migrate        # crea las tablas y la configuración inicial de pesos (idempotente)
npm run seed -- 500    # datos de ejemplo: 5 agentes (1 admin) y 500 leads; regenerable
npm test               # pruebas automatizadas
npm run dev            # API en http://localhost:3000
```

Comprobación rápida: `GET http://localhost:3000/api/health`.

### Frontend
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173 (el proxy de Vite reenvía /api a http://localhost:3000)
```
Arranca antes el backend. La pantalla de entrada permite elegir el usuario simulado.

## Autenticación simulada

No hay login. Cada petición a rutas protegidas lleva la cabecera `X-Agent-Id`; el backend busca ese agente
en la tabla `agents` y obtiene de ahí su identidad y su rol. El cliente nunca envía el rol.

| Id | Nombre | Rol |
|---|---|---|
| 1 | Admin | admin |
| 2–5 | Agente 01–04 | agent |

Sin cabecera o con un agente inexistente → `401`. Operación de administración sin rol `admin` → `403`.
Todos los errores siguen el formato `{ "error": { "code", "message", "details" } }`.

El script `seed` crea datos deterministas para probar la aplicación. Regenera los leads mediante `TRUNCATE leads`, pero conserva los agentes y la configuración de pesos.


## API

Todas las rutas (salvo `/api/health`) requieren la cabecera `X-Agent-Id`.

### `GET /api/leads`

### `GET /api/leads/:id`
Detalle del lead con `score`, `priority`, `breakdown` (valoración, peso, contribución y si el dato estaba
ausente o era inválido, por criterio) y `weightsConfigId`.

### `GET /api/agents`
Lista pública de usuarios simulados (`id`, `name`, `role`), para elegir identidad.

### `GET /api/weights`
Configuración activa: `configId`, `weights` (`criterion`, `weight`), quién y cuándo la creó, `valid`/`errors`
(si está corrupta, informa en lugar de fallar) y la descripción de cada criterio.

### `PUT /api/weights` (solo administrador)
Cuerpo: `{ "baseConfigId": number, "weights": [{ "criterion", "weight" }, ...] }`. Los pesos deben ser enteros no negativos,
sin criterios duplicados, con los cuatro criterios presentes y suma exactamente 100: si no, `400 INVALID_WEIGHTS`
con **todos** los errores. Si `baseConfigId` ya no es la configuración activa → `409 CONFIG_CONFLICT` con
`details.currentConfigId`. Crea una configuración nueva y la activa de forma atómica.

### `POST /api/leads`
Cuerpo: `name`, `phone` (obligatorios); `isNewCustomer`, `interest` (`low|medium|high`), `source`
(`referral|web|event|cold`) opcionales. Cualquier otro campo → `400`. El estado inicial es `nuevo`, sin agente.
Responde `201` con el lead.

### `POST /api/leads/:id/assign`
Cuerpo opcional: `{ "agentId": number }`. Sin `agentId`, se asigna a quien hace la petición.
Un agente solo puede asignarse a sí mismo (`403` si indica a otro); un administrador puede asignar a cualquier agente.
Solo se asignan leads a usuarios con rol `agent` (`400 INVALID_ASSIGNEE`). Si el lead ya pertenece a otro agente → `409 ALREADY_ASSIGNED`.
Repetir una asignación ya hecha es idempotente.

### `POST /api/leads/:id/unassign`
Lo puede hacer el agente asignado o un administrador (`403` en otro caso). Idempotente.

### `PATCH /api/leads/:id`
Cuerpo: `version` (obligatorio, la que el cliente vio) más al menos un campo editable. Si otra persona modificó
el lead desde entonces → `409 VERSION_CONFLICT` con `details.currentVersion`; el cliente debe recargar y reintentar.

### `PATCH /api/leads/:id/status`
Cuerpo: `{ "status": "nuevo|en_gestion|contactado|cerrado", "version": number }`.
Solo el agente asignado o un administrador (`403 FORBIDDEN`). Un lead cerrado solo lo reabre un administrador
(`403 REOPEN_FORBIDDEN`). Versión desactualizada → `409 VERSION_CONFLICT`. Pedir el estado actual es idempotente.

| Parámetro | Descripción | Por defecto |
|---|---|---|
| `status` | `nuevo`, `en_gestion`, `contactado`, `cerrado` | todos |
| `agent` | id de agente, o `unassigned` para los no asignados | todos |
| `q` | búsqueda por nombre o teléfono | — |
| `sort` | `score_desc` o `score_asc` | `score_desc` |
| `page`, `pageSize` | paginación (máx. 100 por página) | 1, 20 |

Respuesta: `{ data: [{ id, name, phone, status, agent, version, updatedAt, score, priority }], page, pageSize, total, weightsConfigId }`.
Los empates de puntuación se ordenan por `id` ascendente.


## Estructura del repositorio

```
backend/
  migrations/      esquema SQL versionado
  src/db/          conexión a PostgreSQL
  src/middleware/  autenticación
  src/routes/
  src/scoring/     motor de puntuación (funciones puras con tests)
  src/scripts/     migrate y seed
  app.ts
  server.ts
frontend/
  src/pages/       listado, alta, detalle, login y pesos
  src/components/  layout, badges y paginación
  src/api/         cliente HTTP y tipos de respuesta
  src/test/        configuración de tests de interfaz
docs/DECISIONES.md decisiones técnicas y su justificación
```

## Arquitectura

La API está organizada en rutas HTTP, esquemas de validación, repositorios de acceso a datos y módulos de dominio.
Las rutas autentican la petición y validan el cuerpo o los parámetros con Zod; los repositorios ejecutan las consultas
SQL y aplican las reglas de concurrencia; el motor de puntuación contiene funciones puras reutilizables por la API y
por los tests.

Flujo de una petición protegida:

1. El frontend envía `X-Agent-Id` mediante el cliente común de API.
2. El middleware busca el agente en PostgreSQL y añade su identidad a la petición.
3. La ruta valida la entrada y comprueba los permisos necesarios.
4. El repositorio consulta o modifica los datos usando transacciones y control de versiones cuando corresponde.
5. El manejador de errores devuelve siempre `{ error: { code, message, details } }`.

El frontend usa React Router para las pantallas, TanStack Query para caché, carga, errores e invalidación, y Vite como
servidor de desarrollo con proxy hacia la API.

## Modelo de datos
- `agents`: agentes y administradores (`role`).
- `leads`: datos del lead, `agent_id` opcional (un solo agente a la vez), atributos para la puntuación
  (pueden ser nulos) y columna `version` para el control de concurrencia optimista.
- `weight_configs` / `weight_config_items`: configuraciones de pesos versionadas. Una única
  configuración activa, garantizada por un índice único parcial.

## Sistema de pesos y puntuación

`puntuación = Σ (valoración del criterio × peso / 100)`, resultado entre 0 y 100 con 2 decimales.
La puntuación **siempre se calcula en el servidor**; el cliente nunca la envía.

| Criterio | Valoración (0–100) | Peso inicial |
|---|---|---|
| Cliente nuevo | sí → 100, no → 0 | 40 % |
| Interés comercial | bajo 0, medio 50, alto 100 | 30 % |
| Origen del lead | referido 100, web 70, evento 50, frío 20 | 20 % |
| Antigüedad | lineal en días enteros hasta 100 a los 90 días; fecha futura → 0 | 10 % |

- **Dato ausente o inválido:** valoración 0; el desglose indica si el dato faltaba o era inválido.
- **Validación de pesos:** enteros, no negativos, sin criterios duplicados, todos presentes y suma exacta de 100.
- **Prioridad:** alta (≥ 75), media (≥ 40 y < 75), baja (< 40), sobre la puntuación ya redondeada.
- **Empates:** orden estable `puntuación DESC, id ASC`.

Las constantes de negocio están centralizadas en `backend/src/scoring/criteria.ts`.

## Concurrencia y consistencia

- **Asignación simultánea del mismo lead:** la condición de "sin dueño" va dentro de la propia sentencia (`UPDATE ... WHERE agent_id IS NULL`), de modo que PostgreSQL serializa las peticiones sobre esa fila: una gana y el resto reciben `409`. Un test lanza cuatro asignaciones simultáneas y comprueba que solo una prospera.
- **Edición con datos desactualizados:** bloqueo optimista. Cada lead tiene una `version`; el cliente la envía al guardar y el `UPDATE` solo se aplica si coincide (`409 VERSION_CONFLICT` en otro caso). Asignar y desasignar también incrementan la versión, de modo que invalidan ediciones hechas con datos anteriores.
- **Cambio de pesos mientras otros consultan:** las configuraciones son inmutables y versionadas: guardar crea una
  nueva y la activa en una transacción, de modo que cualquier consulta ve la configuración anterior completa o la
  nueva completa. El listado lee pesos y leads en una sola sentencia, por lo que cada respuesta usa una única
  configuración e indica cuál en `weightsConfigId`.
- **Dos administradores guardando a la vez:** bloqueo optimista (`baseConfigId`) más un cerrojo de transacción
  (`pg_advisory_xact_lock`) que los serializa: el segundo ve la configuración ya cambiada y recibe `409`.
- **Pesos inválidos o corruptos:** el guardado se rechaza con `400` y todos los errores; si la configuración activa
  está corrupta, las consultas responden `503 WEIGHTS_CONFIG_INVALID` y el administrador puede repararla.
- **Cambio de estado:** transacción corta con bloqueo de la fila (`SELECT ... FOR UPDATE`). Con la fila bloqueada se
  evalúan los permisos y la versión y se escribe; peticiones simultáneas sobre el mismo lead se atienden una tras otra
  y solo una puede aplicarse con la misma versión.

## Pruebas

Backend:

```bash
cd backend
npm test
npm run typecheck
```

Los tests cubren la validación y el cálculo de puntuación, las rutas de leads y pesos, permisos, filtros, paginación,
asignación concurrente, bloqueo optimista, cambios de estado y consistencia al cambiar la configuración.

Frontend:

```bash
cd frontend
npm test
npm run build
npm run lint
```

Los tests de interfaz cubren el alta y su redirección al detalle, la validación y guardado de pesos, y la representación
del score y el desglose del detalle.

## Limitaciones conocidas y mejoras propuestas
- La puntuación depende de la antigüedad, por lo que cambia con el tiempo aunque el lead no se modifique
  (se cuenta en días enteros para que solo varíe una vez al día).
- El plan gratuito de Neon suspende la base de datos tras un periodo de inactividad: la primera
  consulta puede tardar unos segundos.
- El listado no se actualiza en tiempo real: los cambios de otros usuarios se ven al recargar, cambiar de filtro o de página.

## Uso de inteligencia artificial

Se utilizó asistencia de IA para apoyar la implementación y revisión de código. Las decisiones de arquitectura y las
reglas de negocio se documentaron en [docs/DECISIONES.md](docs/DECISIONES.md). El resultado se revisó mediante tests de
backend, typecheck, build y lint del frontend, además de una comprobación manual de los flujos principales con datos
generados por `npm run seed`.
