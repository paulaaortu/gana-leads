import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { agent, loading } = useAuth();
  if (loading) return <p className="center">Cargando…</p>;
  if (!agent) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Comodidad de interfaz: la seguridad real es del backend (403). */
export function RequireAdmin() {
  const { agent } = useAuth();
  if (agent?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}