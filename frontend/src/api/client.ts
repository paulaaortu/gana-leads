/** Error de la API con el formato uniforme del backend: { error: { code, message, details } }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number, // 0 = no hubo respuesta (red caída, servidor apagado)
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let currentAgentId: number | null = null;
let onUnauthorized: (() => void) | null = null;

export const setApiAgent = (id: number | null) => {
  currentAgentId = id;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

type Query = Record<string, string | number | undefined>;

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (currentAgentId !== null) headers['X-Agent-Id'] = String(currentAgentId);
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Comprueba tu conexión.');
  }

  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    try {
      payload = await res.json();
    } catch {
      /* cuerpo vacío o no JSON (p. ej. el proxy sin backend detrás) */
    }
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(
      res.status,
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `Error inesperado del servidor (${res.status}).`,
      payload?.error?.details,
    );
  }
  return (await res.json()) as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Ha ocurrido un error inesperado.');
