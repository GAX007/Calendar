import { CategoryMeta, CategoryType } from '../types';

export const CATEGORIES: Record<CategoryType, CategoryMeta> = {
  'Academics': {
    id: 'Academics',
    label: 'Académico',
    tagColor: 'Blue',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/30',
    dotColor: '#3b82f6',
  },
  'Sports/Karate': {
    id: 'Sports/Karate',
    label: 'Deportes / Karate',
    tagColor: 'Red',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
    dotColor: '#f43f5e',
  },
  'Work': {
    id: 'Work',
    label: 'Trabajo & Turnos',
    tagColor: 'Amber',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
    dotColor: '#f59e0b',
  },
  'Personal': {
    id: 'Personal',
    label: 'Personal',
    tagColor: 'Green',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    dotColor: '#10b981',
  },
  'Health': {
    id: 'Health',
    label: 'Salud',
    tagColor: 'Purple',
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/30',
    dotColor: '#a855f7',
  },
};

export const getCategoryMeta = (category: string): CategoryMeta => {
  if (category in CATEGORIES) {
    return CATEGORIES[category as CategoryType];
  }
  // Fallback checks
  const lower = category.toLowerCase();
  if (lower.includes('acad') || lower.includes('estudio') || lower.includes('matlab') || lower.includes('uni')) {
    return CATEGORIES['Academics'];
  }
  if (lower.includes('karate') || lower.includes('deport') || lower.includes('hipertrof') || lower.includes('gym') || lower.includes('entren')) {
    return CATEGORIES['Sports/Karate'];
  }
  if (lower.includes('trabaj') || lower.includes('bar') || lower.includes('turno') || lower.includes('shift')) {
    return CATEGORIES['Work'];
  }
  if (lower.includes('salud') || lower.includes('medic') || lower.includes('fisio')) {
    return CATEGORIES['Health'];
  }
  return CATEGORIES['Personal'];
};
