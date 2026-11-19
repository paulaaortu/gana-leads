import type { LeadStatus, Priority } from '../api/types';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  en_gestion: 'En gestión',
  contactado: 'Contactado',
  cerrado: 'Cerrado',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

// Hasta 2 decimales: así 74,99 no se muestra como 75 junto a la categoría "Media".
const scoreFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export const formatScore = (n: number) => scoreFormat.format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });