import { describe, expect, it } from 'vitest';
import type { Agent } from '../middleware/auth';
import { checkStatusChange } from './statusRules';

const admin: Agent = { id: 1, name: 'Admin', role: 'admin' };
const ana: Agent = { id: 2, name: 'Ana', role: 'agent' };
const luis: Agent = { id: 3, name: 'Luis', role: 'agent' };

describe('checkStatusChange', () => {
  it('el agente asignado puede cambiar entre estados abiertos y cerrar', () => {
    const lead = { status: 'nuevo', agentId: 2 } as const;
    expect(checkStatusChange(ana, lead, 'en_gestion').allowed).toBe(true);
    expect(checkStatusChange(ana, lead, 'cerrado').allowed).toBe(true);
  });

  it('un agente que no es el asignado no puede → FORBIDDEN', () => {
    const r = checkStatusChange(luis, { status: 'nuevo', agentId: 2 }, 'en_gestion');
    expect(r).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
  });

  it('un agente no puede cambiar un lead sin asignar → FORBIDDEN', () => {
    const r = checkStatusChange(ana, { status: 'nuevo', agentId: null }, 'en_gestion');
    expect(r).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
  });

  it('el agente asignado no puede reabrir un lead cerrado → REOPEN_FORBIDDEN', () => {
    const r = checkStatusChange(ana, { status: 'cerrado', agentId: 2 }, 'en_gestion');
    expect(r).toMatchObject({ allowed: false, code: 'REOPEN_FORBIDDEN' });
  });

  it('el administrador puede todo, incluido reabrir y tocar leads sin asignar', () => {
    expect(checkStatusChange(admin, { status: 'cerrado', agentId: 2 }, 'nuevo').allowed).toBe(true);
    expect(checkStatusChange(admin, { status: 'nuevo', agentId: null }, 'contactado').allowed).toBe(true);
  });

  it('dejar un lead cerrado como cerrado no cuenta como reabrir', () => {
    expect(checkStatusChange(ana, { status: 'cerrado', agentId: 2 }, 'cerrado').allowed).toBe(true);
  });
});