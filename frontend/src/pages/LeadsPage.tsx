import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Agent, LeadListResponse } from '../api/types';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import Pagination from '../components/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { STATUS_LABELS, formatDate, formatScore } from '../lib/format';

const PAGE_SIZE = 20;

export default function LeadsPage() {
  // Los filtros son la fuente de verdad en la URL.
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const agent = params.get('agent') ?? '';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') === 'score_asc' ? 'score_asc' : 'score_desc';
  const page = Math.max(1, Number(params.get('page')) || 1);

  /** Cambia parámetros de la URL; por defecto vuelve a la página 1 (los resultados cambian). */
  const update = (
    changes: Record<string, string>,
    opts: { keepPage?: boolean; replace?: boolean } = {},
  ) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!opts.keepPage) next.delete('page');
        return next;
      },
      { replace: opts.replace },
    );

  // Búsqueda: el texto se escribe libremente y a la URL llega con retardo.
  const [text, setText] = useState(q);
  const debouncedText = useDebouncedValue(text.trim());
  useEffect(() => {
    if (debouncedText !== q) update({ q: debouncedText }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<{ data: Agent[] }>('/agents'),
    staleTime: Infinity,
  });

  const leads = useQuery({
    queryKey: ['leads', 'list', { status, agent, q, sort, page }],
    queryFn: () =>
      api<LeadListResponse>('/leads', { query: { status, agent, q, sort, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData, // al paginar, la tabla anterior se queda hasta que llegan los datos nuevos
  });
  const data = leads.data;

  // Página fuera de rango (por ejemplo, tras cambiar los datos): volver a la primera.
  useEffect(() => {
    if (data && !leads.isPlaceholderData && data.data.length === 0 && page > 1) {
      update({ page: '1' }, { keepPage: true, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page]);

  // ¿Han cambiado los pesos entre dos respuestas? Entonces el orden ya no es el que veía el usuario.
  const lastConfigId = useRef<number | null>(null);
  const [configChanged, setConfigChanged] = useState(false);
  useEffect(() => {
    const id = data?.weightsConfigId ?? null;
    if (id === null) return;
    if (lastConfigId.current !== null && lastConfigId.current !== id) setConfigChanged(true);
    lastConfigId.current = id;
  }, [data?.weightsConfigId]);

  const hasFilters = Boolean(status || agent || q);
  const clearFilters = () => {
    setText('');
    setParams((prev) => {
      const next = new URLSearchParams();
      const keepSort = prev.get('sort');
      if (keepSort) next.set('sort', keepSort);
      return next;
    });
  };

  return (
    <section>
      <div className="page-title"><h2>Leads comerciales</h2><Link className="button-link" to="/leads/new">+ Nuevo lead</Link></div>

      <div className="toolbar" role="search">
        <label>
          Buscar
          <input
            type="search"
            placeholder="Nombre o teléfono"
            value={text}
            maxLength={100}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Agente
          <select value={agent} onChange={(e) => update({ agent: e.target.value })}>
            <option value="">Todos</option>
            <option value="unassigned">Sin asignar</option>
            {agents.data?.data
              .filter((a) => a.role === 'agent')
              .map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
          </select>
        </label>
        {hasFilters && <button onClick={clearFilters}>Limpiar filtros</button>}
      </div>

      {configChanged && (
        <div role="status" className="notice">
          <span>Los pesos de puntuación han cambiado: las puntuaciones y el orden se han actualizado.</span>
          <button onClick={() => setConfigChanged(false)}>Entendido</button>
        </div>
      )}

      {leads.isPending && <p aria-busy="true">Cargando leads…</p>}

      {leads.isError && (
        <div role="alert" className="error">
          {errorMessage(leads.error)} <button onClick={() => leads.refetch()}>Reintentar</button>
        </div>
      )}

      {data && (
        <>
          {data.data.length === 0 ? (
            <div className="empty">
              <p>No hay leads que coincidan con los filtros.</p>
              {hasFilters && <button onClick={clearFilters}>Limpiar filtros</button>}
            </div>
          ) : (
            <div className={`table-wrap${leads.isFetching ? ' fetching' : ''}`}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                    <th>Agente</th>
                    <th aria-sort={sort === 'score_desc' ? 'descending' : 'ascending'}>
                      <button
                        className="link"
                        onClick={() => update({ sort: sort === 'score_desc' ? 'score_asc' : '' })}
                      >
                        Score {sort === 'score_desc' ? '↓' : '↑'}
                      </button>
                    </th>
                    <th className="hide-sm">Actualizado</th>
                    <th><span className="sr-only">Acción</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>{lead.phone}</td>
                      <td><StatusBadge status={lead.status} /></td>
                      <td>{lead.agent?.name ?? '—'}</td>
                      <td>
                        {formatScore(lead.score)} <PriorityBadge priority={lead.priority} />
                      </td>
                      <td className="hide-sm">{formatDate(lead.updatedAt)}</td>
                      <td><Link to={`/leads/${lead.id}`}>Ver</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPage={(p) => update({ page: String(p) }, { keepPage: true })}
          />
        </>
      )}
    </section>
  );
}
