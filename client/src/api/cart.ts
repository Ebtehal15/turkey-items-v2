import apiClient from './client';
import type { CartItem } from '../types';

export interface CartResponse {
  items: CartItem[];
  totalItems: number;
  knownTotal: number;
  hasUnknownPrices: boolean;
}

export interface AddToCartRequest {
  classId: number;
}

export interface UpdateCartRequest {
  classId: number;
  quantity: number;
}

export interface CartActionResponse {
  success: boolean;
  message: string;
  cartTotal?: number;
}

export const fetchCart = async (): Promise<CartResponse> => {
  const response = await apiClient.get<CartResponse>('/api/cart');
  return response.data;
};

export const addToCart = async (classId: number): Promise<CartActionResponse> => {
  const response = await apiClient.post<CartActionResponse>('/api/cart/add', { classId });
  return response.data;
};

export const updateCartItem = async (classId: number, quantity: number): Promise<CartActionResponse> => {
  const response = await apiClient.put<CartActionResponse>('/api/cart/update', { classId, quantity });
  return response.data;
};

export const removeFromCart = async (classId: number): Promise<CartActionResponse> => {
  const response = await apiClient.delete<CartActionResponse>(`/api/cart/remove/${classId}`);
  return response.data;
};

export const clearCart = async (): Promise<CartActionResponse> => {
  const response = await apiClient.delete<CartActionResponse>('/api/cart/clear');
  return response.data;
};












