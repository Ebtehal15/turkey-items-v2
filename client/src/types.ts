export interface ClassRecord {
  id: number;
  specialId: string;
  mainCategory: string;
  quality: string;
  className: string;
  classNameArabic: string | null;
  classNameEnglish: string | null;
  classFeatures: string | null;
  classPrice: number | null;
  classWeight: number | null;
  classQuantity: number | null;
  classVideo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkUploadResult {
  processedCount: number;
  skippedCount: number;
  skipped: Array<{ index: number; reason: string }>;
}

export interface ClassFilters {
  classNameSearch?: string;
  codeSearch?: string;
  category?: string;
  quality?: string;
  includeZeroQuantity?: boolean;
}

export type ColumnKey =
  | 'specialId'
  | 'mainCategory'
  | 'quality'
  | 'className'
  | 'classNameArabic'
  | 'classNameEnglish'
  | 'classFeatures'
  | 'classWeight'
  | 'classQuantity'
  | 'classPrice'
  | 'classVideo';

export type ColumnVisibility = Record<ColumnKey, boolean>;

export interface CartItem {
  record: ClassRecord;
  quantity: number;
}

