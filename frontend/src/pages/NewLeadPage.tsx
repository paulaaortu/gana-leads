import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Interest, LeadDetail, Source } from '../api/types';

const interestLabels: Record<Interest, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
const sourceLabels: Record<Source, string> = { referral: 'Referido', web: 'Web', event: 'Evento', cold: 'Frío' };

export default function NewLeadPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', isNewCustomer: '', interest: '', source: '' });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api<LeadDetail>('/leads', {
      method: 'POST',
      body: {
        name: form.name,
        phone: form.phone,
        isNewCustomer: form.isNewCustomer === '' ? null : form.isNewCustomer === 'true',
        interest: form.interest || null,
        source: form.source || null,
      },
    }),
    onSuccess: (lead) => navigate(`/leads/${lead.id}`),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    create.mutate();
  };

  return (
    <section>
      <p><Link to="/">← Volver a leads</Link></p>
      <h2>Alta de lead</h2>
      <p className="muted">Los campos marcados como obligatorios son necesarios para crear el lead.</p>
      {error && <div role="alert" className="error">{error}</div>}
      <form className="panel form-panel" onSubmit={submit}>
        <label>Nombre *<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Teléfono *<input required maxLength={30} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Cliente nuevo<select value={form.isNewCustomer} onChange={(e) => setForm({ ...form, isNewCustomer: e.target.value })}><option value="">Sin indicar</option><option value="true">Sí</option><option value="false">No</option></select></label>
        <label>Interés comercial<select value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })}><option value="">Sin indicar</option>{Object.entries(interestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Origen<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="">Sin indicar</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="inline-actions"><button type="submit" disabled={create.isPending}>{create.isPending ? 'Creando…' : 'Crear lead'}</button><Link className="button-link" to="/">Cancelar</Link></div>
      </form>
    </section>
  );
}
