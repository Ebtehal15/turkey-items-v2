import apiClient from './client';
import type { ColumnVisibility } from '../types';
import { defaultColumnVisibility, normalizeColumnVisibility } from '../constants/columns';

export const fetchColumnVisibility = async (): Promise<ColumnVisibility> => {
  const response = await apiClient.get<Partial<ColumnVisibility>>('/api/settings/columns');
  return normalizeColumnVisibility(response.data ?? defaultColumnVisibility);
};

export const updateColumnVisibility = async (columns: ColumnVisibility): Promise<ColumnVisibility> => {
  const response = await apiClient.put<ColumnVisibility>('/api/settings/columns', { columns });
  return normalizeColumnVisibility(response.data);
};





