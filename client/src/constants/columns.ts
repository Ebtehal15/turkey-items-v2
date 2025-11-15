import type { ColumnKey, ColumnVisibility } from '../types';
import type { SupportedLanguage } from '../context/LanguageContext';

const columnLabelMap: Record<ColumnKey, Record<SupportedLanguage, string>> = {
  specialId: {
    en: 'Special ID',
    ar: 'كود الصنف',
    es: 'ID Especial',
  },
  mainCategory: {
    en: 'Main Category',
    ar: 'الفئة الرئيسية',
    es: 'Categoría Principal',
  },
  quality: {
    en: 'Group',
    ar: 'المجموعة',
    es: 'Grupo',
  },
  className: {
    en: 'Class Name',
    ar: 'اسم الصنف',
    es: 'Nombre del Producto',
  },
  classNameArabic: {
    en: 'Class Name (Arabic)',
    ar: 'اسم الصنف (عربي)',
    es: 'Nombre (Árabe)',
  },
  classNameEnglish: {
    en: 'Class Name (English)',
    ar: 'اسم الصنف (إنجليزي)',
    es: 'Nombre (Inglés)',
  },
  classFeatures: {
    en: 'Features',
    ar: 'المميزات',
    es: 'Características',
  },
  classWeight: {
    en: 'Weight (kg)',
    ar: 'الوزن (كجم)',
    es: 'Peso (kg)',
  },
  classPrice: {
    en: 'Price',
    ar: 'السعر',
    es: 'Precio',
  },
  classVideo: {
    en: 'Video',
    ar: 'فيديو',
    es: 'Video',
  },
};

export const getColumnLabel = (key: ColumnKey, language: SupportedLanguage = 'en'): string => (
  columnLabelMap[key]?.[language] ?? columnLabelMap[key]?.en ?? key
);

export const buildColumnLabels = (
  language: SupportedLanguage = 'en',
): Record<ColumnKey, string> => (
  orderedColumns.reduce((acc, key) => {
    acc[key] = getColumnLabel(key, language);
    return acc;
  }, {} as Record<ColumnKey, string>)
);

export const orderedColumns: ColumnKey[] = [
  'specialId',
  'mainCategory',
  'quality',
  'className',
  'classNameArabic',
  'classNameEnglish',
  'classFeatures',
  'classWeight',
  'classPrice',
  'classVideo',
];

export const columnOptions = orderedColumns.map((key) => ({ key }));

export const defaultColumnVisibility: ColumnVisibility = orderedColumns.reduce((acc, key) => {
  acc[key] = key !== 'classNameArabic' && key !== 'classNameEnglish';
  return acc;
}, {} as ColumnVisibility);

export const normalizeColumnVisibility = (visibility?: Partial<ColumnVisibility> | null): ColumnVisibility => {
  const normalized: ColumnVisibility = { ...defaultColumnVisibility };
  if (visibility && typeof visibility === 'object') {
    orderedColumns.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(visibility, key)) {
        normalized[key] = Boolean(visibility[key]);
      }
    });
  }
  if (!orderedColumns.some((key) => normalized[key])) {
    return { ...defaultColumnVisibility };
  }
  return normalized;
};
