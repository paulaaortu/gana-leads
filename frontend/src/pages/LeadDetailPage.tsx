import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../api/client';
import type { Agent, CriterionKey, Interest, LeadDetail, Source } from '../api/types';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { formatDate, formatScore, STATUS_LABELS } from '../lib/format';

const criterionLabels: Record<CriterionKey, string> = {
  new_customer: 'Cliente nuevo',
  commercial_interest: 'Interés comercial',
  lead_source: 'Origen del lead',
  seniority: 'Antigüedad',
};

const reasonLabels = { ok: 'Dato válido', missing: 'Dato ausente', invalid: 'Dato no válido' } as const;

const interestLabels: Record<Interest, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
const sourceLabels: Record<Source, string> = {
  referral: 'Referido', web: 'Web', event: 'Evento', cold: 'Frío',
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const { agent: currentAgent } = useAuth();
  const queryClient = useQueryClient();
  const leadId = Number(id);
  const [form, setForm] = useState({
    name: '', phone: '', isNewCustomer: '', interest: '', source: '',
  });
  const [actionError, setActionError] = useState('');

  const lead = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => api<LeadDetail>(`/leads/${leadId}`),
    enabled: Number.isInteger(leadId) && leadId > 0,
  });
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<{ data: Agent[] }>('/agents'),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!lead.data) return;
    setForm({
      name: lead.data.name,
      phone: lead.data.phone,
      isNewCustomer: lead.data.isNewCustomer === null ? '' : String(lead.data.isNewCustomer),
      interest: lead.data.interest ?? '',
      source: lead.data.source ?? '',
    });
  }, [lead.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] }),
      queryClient.invalidateQueries({ queryKey: ['leads'] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      api<LeadDetail>(path, { method, body }),
    onSuccess: refresh,
    onError: (error) => setActionError(errorMessage(error)),
  });

  const current = lead.data;
  const canManage = Boolean(currentAgent?.role === 'admin' || current?.agent?.id === currentAgent?.id);
  const isAdmin = currentAgent?.role === 'admin';

  const run = (path: string, method: string, body?: unknown) => {
    setActionError('');
    mutation.mutate({ path, method, body });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    run(`/leads/${current.id}`, 'PATCH', {
      version: current.version,
      name: form.name,
      phone: form.phone,
      isNewCustomer: form.isNewCustomer === '' ? null : form.isNewCustomer === 'true',
      interest: form.interest || null,
      source: form.source || null,
    });
  };

  if (lead.isPending) return <p aria-busy="true">Cargando detalle…</p>;
  if (lead.isError) return <div role="alert" className="error">{errorMessage(lead.error)} <button onClick={() => lead.refetch()}>Reintentar</button></div>;
  if (!current) return <div role="alert" className="error">El lead no existe.</div>;

  return (
    <section>
      <p><Link to="/">← Volver a leads</Link></p>
      <div className="detail-heading">
        <div>
          <h2>{current.name}</h2>
          <p className="muted">Lead #{current.id} · Actualizado el {formatDate(current.updatedAt)}</p>
        </div>
        <div className="detail-badges"><StatusBadge status={current.status} /><PriorityBadge priority={current.priority} /></div>
      </div>

      {actionError && <div role="alert" className="error">{actionError} <button onClick={() => setActionError('')}>Cerrar</button></div>}

      <div className="detail-grid">
        <form className="panel" onSubmit={save}>
          <h3>Datos del lead</h3>
          <label>Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Teléfono<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Cliente nuevo<select value={form.isNewCustomer} onChange={(e) => setForm({ ...form, isNewCustomer: e.target.value })}><option value="">Sin indicar</option><option value="true">Sí</option><option value="false">No</option></select></label>
          <label>Interés comercial<select value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })}><option value="">Sin indicar</option>{Object.entries(interestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Origen<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="">Sin indicar</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
        </form>

        <div className="panel">
          <h3>Gestión</h3>
          <p><strong>Estado:</strong> <StatusBadge status={current.status} /></p>
          <div className="inline-actions">
            <select aria-label="Nuevo estado" defaultValue={current.status} disabled={!canManage || mutation.isPending} onChange={(e) => run(`/leads/${current.id}/status`, 'PATCH', { status: e.target.value, version: current.version })}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <p><strong>Agente:</strong> {current.agent?.name ?? 'Sin asignar'}</p>
          {isAdmin && !current.agent && <div className="inline-actions"><select aria-label="Agente asignado" defaultValue="" disabled={mutation.isPending} onChange={(e) => e.target.value && run(`/leads/${current.id}/assign`, 'POST', { agentId: Number(e.target.value) })}><option value="">Asignar agente…</option>{agents.data?.data.filter((a) => a.role === 'agent').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
          {!current.agent && !isAdmin && <button disabled={mutation.isPending} onClick={() => run(`/leads/${current.id}/assign`, 'POST')}>Asignarme este lead</button>}
          {current.agent && canManage && <button disabled={mutation.isPending} onClick={() => run(`/leads/${current.id}/unassign`, 'POST')}>Desasignar</button>}
          <p className="muted">Versión {current.version} · Creado el {formatDate(current.createdAt)}</p>
        </div>
      </div>

      <div className="panel score-panel">
        <div className="score-summary"><div><span className="score-value">{formatScore(current.score)}</span><span className="muted"> / 100</span></div><div>Configuración de pesos #{current.weightsConfigId}</div></div>
        <h3>Desglose de puntuación</h3>
        <div className="table-wrap"><table><thead><tr><th>Criterio</th><th>Valoración</th><th>Peso</th><th>Contribución</th><th>Dato</th></tr></thead><tbody>{current.breakdown.map((item) => <tr key={item.criterion}><td>{criterionLabels[item.criterion]}</td><td>{item.rating}</td><td>{item.weight} %</td><td>{formatScore(item.contribution)}</td><td>{reasonLabels[item.reason]}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
