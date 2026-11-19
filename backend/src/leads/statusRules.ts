import type { Agent } from '../middleware/auth';
import type { LeadStatus } from './schemas';

export type StatusDecision =
  | { allowed: true }
  | { allowed: false; code: 'FORBIDDEN' | 'REOPEN_FORBIDDEN'; message: string };

/**
 * Reglas del cambio de estado (única fuente de verdad):
 *  1. Solo el agente asignado o un administrador pueden cambiar el estado.
 *     (Un lead sin asignar solo lo cambia un admin.)
 *  2. Un lead cerrado solo puede reabrirlo un administrador.
 */
export function checkStatusChange(
  caller: Agent,
  lead: { status: LeadStatus; agentId: number | null },
  next: LeadStatus,
): StatusDecision {
  const isAdmin = caller.role === 'admin';

  if (!isAdmin && lead.agentId !== caller.id) {
    return {
      allowed: false,
      code: 'FORBIDDEN',
      message: 'Solo el agente asignado o un administrador pueden cambiar el estado de este lead.',
    };
  }
  if (lead.status === 'cerrado' && next !== 'cerrado' && !isAdmin) {
    return {
      allowed: false,
      code: 'REOPEN_FORBIDDEN',
      message: 'Un lead cerrado solo puede reabrirlo un administrador.',
    };
  }
  return { allowed: true };
}