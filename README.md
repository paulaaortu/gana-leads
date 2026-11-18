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
DATABASE_URL=postgresql://usuario:contraseña@host/dbname?sslmode=verify-full
PORT=3000
```

> El fichero `.env` está en `.gitignore`: no se suben credenciales al repositorio.
> En Neon la cadena se copia desde el botón **Connect** del proyecto (usar la conexión directa, no la *pooled*).

## Ejecución

```bash
cd backend
npm run migrate        # crea las tablas y la configuración inicial de pesos (idempotente)
npm run seed -- 500    # datos de ejemplo: 5 agentes (1 admin) y 500 leads; regenerable
npm run dev            # API en http://localhost:3000
npm test               # pruebas automatizadas
```

Comprobación rápida: `GET http://localhost:3000/api/health`.

## Autenticación simulada

No hay login. Cada petición a rutas protegidas lleva la cabecera `X-Agent-Id`; el backend busca ese agente
en la tabla `agents` y obtiene de ahí su identidad y su rol. El cliente nunca envía el rol.

| Id | Nombre | Rol |
|---|---|---|
| 1 | Admin | admin |
| 2–5 | Agente 01–04 | agent |

Sin cabecera o con un agente inexistente → `401`. Operación de administración sin rol `admin` → `403`.
Todos los errores siguen el formato `{ "error": { "code", "message", "details" } }`.

Pendiente de documentar: datos de ejemplo (`npm run seed`), arranque de la API (`npm run dev`) y del frontend.


## API

Todas las rutas (salvo `/api/health`) requieren la cabecera `X-Agent-Id`.

### `GET /api/leads`

### `GET /api/leads/:id`
Detalle del lead con `score`, `priority`, `breakdown` (valoración, peso, contribución y si el dato estaba
ausente o era inválido, por criterio) y `weightsConfigId`.

### `POST /api/leads`
Cuerpo: `name`, `phone` (obligatorios); `isNewCustomer`, `interest` (`low|medium|high`), `source`
(`referral|web|event|cold`) opcionales. Cualquier otro campo → `400`. El estado inicial es `nuevo`, sin agente.
Responde `201` con el lead.

### `PATCH /api/leads/:id`
Cuerpo: `version` (obligatorio, la que el cliente vio) más al menos un campo editable. Si otra persona modificó
el lead desde entonces → `409 VERSION_CONFLICT` con `details.currentVersion`; el cliente debe recargar y reintentar.

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
  src/scripts/     migrate (y seed, pendiente)
  app.ts
  server.ts
frontend/          (pendiente)
docs/DECISIONES.md decisiones técnicas y su justificación
```

## Arquitectura
(pendiente: capas de la API, autenticación simulada, flujo de una petición)

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
- **Empates:** orden estable `puntuación DESC, id ASC` (pendiente de implementar en la API).

Las constantes de negocio están centralizadas en `backend/src/scoring/criteria.ts`.

## Concurrencia y consistencia
(pendiente: asignación atómica, bloqueo optimista, cambios de pesos con usuarios activos)

## Pruebas
`cd backend && npm test`. Cubren la validación de pesos y el cálculo de puntuación (casos límite incluidos).
(se ampliará con las pruebas de API y concurrencia)

## Limitaciones conocidas y mejoras propuestas
- La puntuación depende de la antigüedad, por lo que cambia con el tiempo aunque el lead no se modifique
  (se cuenta en días enteros para que solo varíe una vez al día).
- El plan gratuito de Neon suspende la base de datos tras un periodo de inactividad: la primera
  consulta puede tardar unos segundos.
- (se completará al avanzar)

## Uso de inteligencia artificial
(pendiente: indicar qué herramientas se usaron y cómo se revisó el código)
Se utilizó Claude para la ayuda de la generación de código.