import apiClient from './client';
import type { BulkUploadResult, ClassFilters, ClassRecord } from '../types';

export const fetchClasses = async (filters: ClassFilters = {}): Promise<ClassRecord[]> => {
  const response = await apiClient.get<ClassRecord[]>('/api/classes', {
    params: filters,
  });
  return response.data;
};

export const generateSpecialId = async (prefix?: string): Promise<string> => {
  const response = await apiClient.post<{ specialId: string }>('/api/classes/generate-id', {
    prefix,
  });
  return response.data.specialId;
};

export const createClass = async (formData: FormData): Promise<ClassRecord> => {
  const response = await apiClient.post<ClassRecord>('/api/classes', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const updateClass = async (id: number, formData: FormData): Promise<ClassRecord> => {
  const response = await apiClient.put<ClassRecord>(`/api/classes/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteClass = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/classes/${id}`);
};

export const deleteAllClasses = async (): Promise<{ deletedCount: number }> => {
  const response = await apiClient.delete<{ deletedCount: number }>('/api/classes');
  return response.data;
};

export const bulkUploadClasses = async (formData: FormData): Promise<BulkUploadResult> => {
  const response = await apiClient.post<BulkUploadResult>('/api/classes/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const syncFromGoogleSheets = async (sheetsUrl: string, updateOnly: boolean = false): Promise<BulkUploadResult> => {
  const response = await apiClient.post<BulkUploadResult>('/api/classes/sync-from-sheets', {
    sheetsUrl,
    updateOnly,
  });
  return response.data;
};

export interface PriceHistoryItem {
  id: number;
  oldPrice: number | null;
  newPrice: number | null;
  changedAt: string;
}

export interface PriceChangeItem {
  id: number;
  classId: number;
  specialId: string;
  className: string;
  classNameArabic: string | null;
  classNameEnglish: string | null;
  mainCategory: string;
  quality: string | null;
  oldPrice: number | null;
  newPrice: number | null;
  changedAt: string;
}

export const fetchPriceHistory = async (classId: number): Promise<PriceHistoryItem[]> => {
  const response = await apiClient.get<PriceHistoryItem[]>(`/api/classes/${classId}/price-history`);
  return response.data;
};

export const fetchRecentPriceChanges = async (limit: number = 50): Promise<PriceChangeItem[]> => {
  const response = await apiClient.get<PriceChangeItem[]>('/api/classes/price-changes/recent', {
    params: { limit },
  });
  return response.data;
};

