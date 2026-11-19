export type Role = 'agent' | 'admin';
export type LeadStatus = 'nuevo' | 'en_gestion' | 'contactado' | 'cerrado';
export type Interest = 'low' | 'medium' | 'high';
export type Source = 'referral' | 'web' | 'event' | 'cold';
export type Priority = 'alta' | 'media' | 'baja';
export type CriterionKey = 'new_customer' | 'commercial_interest' | 'lead_source' | 'seniority';

export interface Agent {
  id: number;
  name: string;
  role: Role;
}

export interface BreakdownItem {
  criterion: CriterionKey;
  rating: number;
  weight: number;
  contribution: number;
  reason: 'ok' | 'missing' | 'invalid';
}

export interface LeadListItem {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  agent: { id: number; name: string } | null;
  version: number;
  updatedAt: string;
  score: number;
  priority: Priority;
}

export interface LeadListResponse {
  data: LeadListItem[];
  page: number;
  pageSize: number;
  total: number;
  weightsConfigId: number | null;
}

export interface LeadDetail extends Omit<LeadListItem, never> {
  isNewCustomer: boolean | null;
  interest: Interest | null;
  source: Source | null;
  createdAt: string;
  breakdown: BreakdownItem[];
  weightsConfigId: number;
}

export interface WeightsConfig {
  configId: number | null;
  createdAt: string | null;
  createdBy: { id: number; name: string } | null;
  weights: { criterion: CriterionKey; weight: number }[];
  valid: boolean;
  errors: string[];
  criteria: { criterion: CriterionKey; label: string; rule: string }[];
  missingDataRule: string;
}