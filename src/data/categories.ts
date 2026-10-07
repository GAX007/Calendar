import { CategoryMeta, CategoryType } from '../types';

export const CATEGORIES: Record<CategoryType, CategoryMeta> = {
  'Academics': {
    id: 'Academics',
    label: 'Académico',
    tagColor: 'Blue',
    colorClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-50 dark:bg-blue-500/15',
    borderClass: 'border-blue-200 dark:border-blue-500/30',
    dotColor: '#2563eb',
    cardBg: 'bg-blue-50/70 dark:bg-blue-950/30',
    cardBorder: 'border-blue-200/90 dark:border-blue-900/60',
    leftBar: 'border-l-blue-500',
    hoverBg: 'hover:bg-blue-100/50 dark:hover:bg-blue-950/50',
  },
  'Sports/Karate': {
    id: 'Sports/Karate',
    label: 'Deportes / Karate',
    tagColor: 'Red',
    colorClass: 'text-rose-700 dark:text-rose-300',
    bgClass: 'bg-rose-50 dark:bg-rose-500/15',
    borderClass: 'border-rose-200 dark:border-rose-500/30',
    dotColor: '#e11d48',
    cardBg: 'bg-rose-50/70 dark:bg-rose-950/30',
    cardBorder: 'border-rose-200/90 dark:border-rose-900/60',
    leftBar: 'border-l-rose-500',
    hoverBg: 'hover:bg-rose-100/50 dark:hover:bg-rose-950/50',
  },
  'Work': {
    id: 'Work',
    label: 'Trabajo & Turnos',
    tagColor: 'Amber',
    colorClass: 'text-amber-800 dark:text-amber-300',
    bgClass: 'bg-amber-50 dark:bg-amber-500/15',
    borderClass: 'border-amber-200 dark:border-amber-500/30',
    dotColor: '#d97706',
    cardBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    cardBorder: 'border-amber-200/90 dark:border-amber-900/60',
    leftBar: 'border-l-amber-500',
    hoverBg: 'hover:bg-amber-100/50 dark:hover:bg-amber-950/50',
  },
  'Personal': {
    id: 'Personal',
    label: 'Personal',
    tagColor: 'Green',
    colorClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-50 dark:bg-emerald-500/15',
    borderClass: 'border-emerald-200 dark:border-emerald-500/30',
    dotColor: '#059669',
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    cardBorder: 'border-emerald-200/90 dark:border-emerald-900/60',
    leftBar: 'border-l-emerald-500',
    hoverBg: 'hover:bg-emerald-100/50 dark:hover:bg-emerald-950/50',
  },
  'Health': {
    id: 'Health',
    label: 'Salud',
    tagColor: 'Purple',
    colorClass: 'text-purple-700 dark:text-purple-300',
    bgClass: 'bg-purple-50 dark:bg-purple-500/15',
    borderClass: 'border-purple-200 dark:border-purple-500/30',
    dotColor: '#9333ea',
    cardBg: 'bg-purple-50/70 dark:bg-purple-950/30',
    cardBorder: 'border-purple-200/90 dark:border-purple-900/60',
    leftBar: 'border-l-purple-500',
    hoverBg: 'hover:bg-purple-100/50 dark:hover:bg-purple-950/50',
  },
};

export const getCategoryMeta = (category: string): CategoryMeta => {
  if (category in CATEGORIES) {
    return CATEGORIES[category as CategoryType];
  }
  // Fallback checks
  const lower = category.toLowerCase();
  if (lower.includes('acad') || lower.includes('estudio') || lower.includes('matlab') || lower.includes('uni') || lower.includes('deber') || lower.includes('practic')) {
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
