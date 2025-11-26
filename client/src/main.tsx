import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AdminAccessProvider } from './context/AdminAccessContext';
import { LanguageProvider } from './context/LanguageContext';
import { PasswordProvider } from './context/PasswordContext';
import { CartProvider } from './context/CartContext';

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LanguageProvider>
          <PasswordProvider>
            <AdminAccessProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AdminAccessProvider>
          </PasswordProvider>
        </LanguageProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);


