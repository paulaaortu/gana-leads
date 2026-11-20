import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { CriterionKey, WeightsConfig } from '../api/types';

const criteria: CriterionKey[] = ['new_customer', 'commercial_interest', 'lead_source', 'seniority'];
const fallbackLabels: Record<CriterionKey, string> = {
  new_customer: 'Cliente nuevo', commercial_interest: 'Interés comercial', lead_source: 'Origen del lead', seniority: 'Antigüedad',
};

export default function WeightsPage() {
  const client = useQueryClient();
  const config = useQuery({ queryKey: ['weights'], queryFn: () => api<WeightsConfig>('/weights') });
  const [values, setValues] = useState<Record<CriterionKey, string>>({ new_customer: '', commercial_interest: '', lead_source: '', seniority: '' });
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!config.data) return;
    setValues(Object.fromEntries(criteria.map((criterion) => [criterion, String(config.data.weights.find((w) => w.criterion === criterion)?.weight ?? '')])) as Record<CriterionKey, string>);
  }, [config.data]);

  const total = useMemo(() => criteria.reduce((sum, criterion) => sum + (Number(values[criterion]) || 0), 0), [values]);
  const save = useMutation({
    mutationFn: () => api<WeightsConfig>('/weights', { method: 'PUT', body: { baseConfigId: config.data!.configId, weights: criteria.map((criterion) => ({ criterion, weight: Number(values[criterion]) })) } }),
    onSuccess: async () => { setLocalError(''); await client.invalidateQueries({ queryKey: ['weights'] }); await client.invalidateQueries({ queryKey: ['leads'] }); await client.invalidateQueries({ queryKey: ['lead'] }); },
    onError: (e) => setLocalError(errorMessage(e)),
  });

  const submit = () => {
    setLocalError('');
    if (config.data?.configId === null || config.data?.configId === undefined) return setLocalError('No hay una configuración activa sobre la que guardar.');
    const invalid = criteria.some((criterion) => !/^\d+$/.test(values[criterion]) || Number(values[criterion]) < 0);
    if (invalid) return setLocalError('Los pesos deben ser números enteros no negativos.');
    if (total !== 100) return setLocalError(`La suma actual es ${total} %. Debe ser exactamente 100 %.`);
    save.mutate();
  };

  if (config.isPending) return <p aria-busy="true">Cargando configuración…</p>;
  if (config.isError) return <div role="alert" className="error">{errorMessage(config.error)} <button onClick={() => config.refetch()}>Reintentar</button></div>;
  const current = config.data;

  return (
    <section>
      <h2>Configuración de pesos</h2>
      <p>Los pesos determinan cuánto aporta cada criterio a la puntuación de los leads.</p>
      {!current.valid && <div role="alert" className="error"><strong>Configuración inválida.</strong><ul>{current.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {localError && <div role="alert" className="error">{localError} {localError.includes('otro administrador') && <button onClick={() => config.refetch()}>Recargar</button>}</div>}
      <div className="panel weights-panel">
        <div className="weights-meta"><span>Configuración #{current.configId ?? '—'}</span><span className="muted">{current.createdBy ? `Creada por ${current.createdBy.name}` : 'Sin autor'}</span><strong className={total === 100 ? 'valid-total' : 'invalid-total'}>Total: {total} %</strong></div>
        {criteria.map((criterion) => {
          const info = current.criteria.find((item) => item.criterion === criterion);
          return <label className="weight-row" key={criterion}><span><strong>{info?.label ?? fallbackLabels[criterion]}</strong><small>{info?.rule}</small></span><span className="weight-input"><input type="number" min="0" max="100" step="1" aria-label={`Peso de ${info?.label ?? fallbackLabels[criterion]}`} value={values[criterion]} onChange={(e) => setValues({ ...values, [criterion]: e.target.value })} /><span>%</span></span></label>;
        })}
        <button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar configuración'}</button>
      </div>
      <div className="panel"><h3>Regla de datos ausentes</h3><p>{current.missingDataRule}</p></div>
    </section>
  );
}
