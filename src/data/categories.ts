import { CategoryMeta, CategoryType } from '../types';

export const CATEGORIES: Record<CategoryType, CategoryMeta> = {
  'Academics': {
    id: 'Academics',
    label: 'Académico',
    tagColor: 'Blue',
    colorClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    dotColor: '#3A6FE0',
    cardBg: 'bg-blue-50/70',
    cardBorder: 'border-blue-200/90',
    leftBar: 'border-l-blue-500',
    hoverBg: 'hover:bg-blue-100/50',
  },
  'Sports/Karate': {
    id: 'Sports/Karate',
    label: 'Deporte',
    tagColor: 'Red',
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200',
    dotColor: '#E5484D',
    cardBg: 'bg-rose-50/70',
    cardBorder: 'border-rose-200/90',
    leftBar: 'border-l-rose-500',
    hoverBg: 'hover:bg-rose-100/50',
  },
  'Work': {
    id: 'Work',
    label: 'Trabajo',
    tagColor: 'Amber',
    colorClass: 'text-amber-800',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    dotColor: '#D69200',
    cardBg: 'bg-amber-50/70',
    cardBorder: 'border-amber-200/90',
    leftBar: 'border-l-amber-500',
    hoverBg: 'hover:bg-amber-100/50',
  },
  'Personal': {
    id: 'Personal',
    label: 'Personal',
    tagColor: 'Green',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    dotColor: '#2E9E68',
    cardBg: 'bg-emerald-50/70',
    cardBorder: 'border-emerald-200/90',
    leftBar: 'border-l-emerald-500',
    hoverBg: 'hover:bg-emerald-100/50',
  },
  'Health': {
    id: 'Health',
    label: 'Salud',
    tagColor: 'Purple',
    colorClass: 'text-purple-700',
    bgClass: 'bg-purple-50',
    borderClass: 'border-purple-200',
    dotColor: '#8B5CF6',
    cardBg: 'bg-purple-50/70',
    cardBorder: 'border-purple-200/90',
    leftBar: 'border-l-purple-500',
    hoverBg: 'hover:bg-purple-100/50',
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
