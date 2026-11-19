import type { LeadStatus, Priority } from '../api/types';
import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/format';

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge prio-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}