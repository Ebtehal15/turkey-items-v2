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

export interface GoogleSheetsSettings {
  url: string;
  autoSync: boolean;
}

export const fetchGoogleSheetsSettings = async (): Promise<GoogleSheetsSettings> => {
  const response = await apiClient.get<GoogleSheetsSettings>('/api/settings/google-sheets');
  return response.data;
};

export const updateGoogleSheetsSettings = async (settings: Partial<GoogleSheetsSettings>): Promise<GoogleSheetsSettings> => {
  const response = await apiClient.put<GoogleSheetsSettings>('/api/settings/google-sheets', settings);
  return response.data;
};





