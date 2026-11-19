import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setApiAgent, setUnauthorizedHandler } from '../api/client';
import type { Agent } from '../api/types';

const STORAGE_KEY = 'leads.agentId';

interface AuthValue {
  agent: Agent | null;
  loading: boolean;
  login: (id: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setApiAgent(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* almacenamiento no disponible */ }
    setAgent(null);
    queryClient.clear();
  }, [queryClient]);

  const login = useCallback(
    async (id: number) => {
      setApiAgent(id);
      try {
        const me = await api<Agent>('/me'); // el servidor decide quién es y qué rol tiene
        try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* ignorar */ }
        queryClient.clear();
        setAgent(me);
      } catch (e) {
        setApiAgent(null);
        throw e;
      }
    },
    [queryClient],
  );

  // Cualquier 401 de la API cierra la sesión.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Al arrancar: si hay un agente recordado, el servidor lo confirma (o lo descarta).
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* ignorar */ }
    const id = Number(stored);
    if (!stored || !Number.isInteger(id)) {
      setLoading(false);
      return;
    }
    login(id).catch(() => logout()).finally(() => setLoading(false));
  }, [login, logout]);

  const value = useMemo(() => ({ agent, loading, login, logout }), [agent, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}