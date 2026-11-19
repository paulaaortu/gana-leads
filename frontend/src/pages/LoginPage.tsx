import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Agent } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { agent, loading, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<{ data: Agent[] }>('/agents'),
  });

  if (!loading && agent) return <Navigate to="/" replace />;

  async function choose(id: number) {
    setError(null);
    try {
      await login(id);
      navigate('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="login">
      <h1>CRM de leads</h1>
      <p>Autenticación simulada: elige con qué usuario quieres entrar.</p>

      {agents.isPending && <p>Cargando usuarios…</p>}
      {agents.isError && (
        <div role="alert" className="error">
          {errorMessage(agents.error)} <button onClick={() => agents.refetch()}>Reintentar</button>
        </div>
      )}
      {error && <div role="alert" className="error">{error}</div>}

      <ul className="agent-list">
        {agents.data?.data.map((a) => (
          <li key={a.id}>
            <button onClick={() => choose(a.id)}>
              {a.name} <small>{a.role === 'admin' ? 'administrador' : 'agente'}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}