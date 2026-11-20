import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Layout() {
  const { agent, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <strong>CRM · Leads</strong>
        <nav>
          <NavLink to="/" end>Leads</NavLink>
          <NavLink to="/leads/new">Nuevo lead</NavLink>
          {agent?.role === 'admin' && <NavLink to="/admin/weights">Pesos</NavLink>}
        </nav>
        <span className="who">
          {agent?.name} <small>({agent?.role === 'admin' ? 'administrador' : 'agente'})</small>
        </span>
        <button onClick={logout}>Cambiar de usuario</button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
