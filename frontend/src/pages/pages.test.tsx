import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import NewLeadPage from './NewLeadPage';
import WeightsPage from './WeightsPage';
import LeadDetailPage from './LeadDetailPage';
import type { LeadDetail, WeightsConfig } from '../api/types';

const { mockApi, mockUseAuth } = vi.hoisted(() => ({ mockApi: vi.fn(), mockUseAuth: vi.fn() }));

vi.mock('../api/client', () => ({
  api: mockApi,
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'Error de prueba',
}));

vi.mock('../auth/AuthContext', () => ({ useAuth: mockUseAuth }));

const weights: WeightsConfig = {
  configId: 7,
  createdAt: '2026-11-20T10:00:00.000Z',
  createdBy: { id: 1, name: 'Admin' },
  weights: [
    { criterion: 'new_customer', weight: 40 },
    { criterion: 'commercial_interest', weight: 30 },
    { criterion: 'lead_source', weight: 20 },
    { criterion: 'seniority', weight: 10 },
  ],
  valid: true,
  errors: [],
  criteria: [
    { criterion: 'new_customer', label: 'Cliente nuevo', rule: 'Sí → 100, no → 0.' },
    { criterion: 'commercial_interest', label: 'Interés comercial', rule: 'bajo 0, medio 50, alto 100.' },
    { criterion: 'lead_source', label: 'Origen del lead', rule: 'referido 100, web 70, evento 50, frío 20.' },
    { criterion: 'seniority', label: 'Antigüedad', rule: 'Lineal hasta 90 días.' },
  ],
  missingDataRule: 'Dato ausente o inválido → 0.',
};

const lead: LeadDetail = {
  id: 12,
  name: 'Ana Pérez',
  phone: '600123456',
  status: 'nuevo',
  agent: null,
  version: 1,
  updatedAt: '2026-11-20T10:00:00.000Z',
  createdAt: '2026-11-19T10:00:00.000Z',
  isNewCustomer: true,
  interest: 'high',
  source: 'web',
  score: 82.5,
  priority: 'alta',
  weightsConfigId: 7,
  breakdown: [
    { criterion: 'new_customer', rating: 100, weight: 40, contribution: 40, reason: 'ok' },
    { criterion: 'commercial_interest', rating: 100, weight: 30, contribution: 30, reason: 'ok' },
    { criterion: 'lead_source', rating: 70, weight: 20, contribution: 14, reason: 'ok' },
    { criterion: 'seniority', rating: 0, weight: 10, contribution: 0, reason: 'ok' },
  ],
};

function renderWithProviders(ui: ReactNode, initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApi.mockReset();
  mockUseAuth.mockReturnValue({ agent: { id: 1, name: 'Admin', role: 'admin' } });
});

afterEach(() => cleanup());

describe('alta de lead', () => {
  it('envía los datos y navega al detalle creado', async () => {
    mockApi.mockResolvedValue(lead);
    renderWithProviders(
      <Routes>
        <Route path="/leads/new" element={<NewLeadPage />} />
        <Route path="/leads/:id" element={<p>Detalle creado</p>} />
      </Routes>,
      '/leads/new',
    );

    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText('Teléfono *'), { target: { value: '600123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear lead' }));

    await waitFor(() => expect(screen.getByText('Detalle creado')).toBeInTheDocument());
    expect(mockApi).toHaveBeenCalledWith('/leads', expect.objectContaining({ method: 'POST' }));
  });
});

describe('pantalla de pesos', () => {
  it('no guarda una configuración cuya suma no es 100', async () => {
    mockApi.mockResolvedValue(weights);
    renderWithProviders(<WeightsPage />, '/admin/weights');
    await screen.findByDisplayValue('40');

    fireEvent.change(screen.getByLabelText('Peso de Cliente nuevo'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByText('La suma actual es 110 %. Debe ser exactamente 100 %.')).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('guarda una configuración válida', async () => {
    mockApi.mockResolvedValue(weights);
    renderWithProviders(<WeightsPage />, '/admin/weights');
    await screen.findByDisplayValue('40');

    for (const label of ['Cliente nuevo', 'Interés comercial', 'Origen del lead', 'Antigüedad']) {
      fireEvent.change(screen.getByLabelText(`Peso de ${label}`), { target: { value: '25' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/weights', expect.objectContaining({ method: 'PUT' })));
  });
});

describe('detalle del lead', () => {
  it('muestra score, prioridad y desglose', async () => {
    mockApi.mockImplementation((path: string) => path === '/agents' ? Promise.resolve({ data: [] }) : Promise.resolve(lead));
    renderWithProviders(
      <Routes><Route path="/leads/:id" element={<LeadDetailPage />} /></Routes>,
      '/leads/12',
    );

    expect(await screen.findByText('82,5')).toBeInTheDocument();
    expect(screen.getAllByText('Cliente nuevo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Interés comercial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Antigüedad').length).toBeGreaterThan(0);
  });
});
