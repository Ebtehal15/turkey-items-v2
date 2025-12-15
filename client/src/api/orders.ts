import apiClient from './client';
import type { OrderHistoryItem } from '../utils/orderHistory';

export interface OrderItem {
  classId: number;
  quantity: number;
  specialId: string;
  quality: string | null;
  className: string;
  classNameArabic: string | null;
  classNameEnglish: string | null;
  classPrice: number | null;
}

export interface OrderResponse {
  id: number;
  orderId: number;
  customerInfo: {
    fullName: string;
    company: string;
    phone: string;
    salesPerson: string;
    notes: string;
  };
  items: OrderItem[];
  knownTotal: number;
  totalItems: number;
  hasUnknownPrices: boolean;
  language: string;
  createdAt: string;
}

export const createOrder = async (order: OrderHistoryItem): Promise<OrderResponse> => {
  const response = await apiClient.post<OrderResponse>('/api/orders', order);
  return response.data;
};

export const fetchAllOrders = async (limit: number = 100, offset: number = 0): Promise<OrderResponse[]> => {
  const response = await apiClient.get<OrderResponse[]>('/api/orders', {
    params: { limit, offset },
  });
  return response.data;
};

export const fetchOrderById = async (orderId: number): Promise<OrderResponse> => {
  const response = await apiClient.get<OrderResponse>(`/api/orders/${orderId}`);
  return response.data;
};

export const deleteOrder = async (orderId: number): Promise<void> => {
  await apiClient.delete(`/api/orders/${orderId}`);
};


