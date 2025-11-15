import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import { usePassword } from './PasswordContext';

interface AdminAccessContextValue {
  isAdmin: boolean;
  authorize: () => void;
  revoke: () => void;
}

const AdminAccessContext = createContext<AdminAccessContextValue | undefined>(undefined);

interface ProviderProps {
  children: ReactNode;
}

export const AdminAccessProvider = ({ children }: ProviderProps) => {
  const { role, revoke: revokePassword } = usePassword();
  const isAdmin = role === 'admin';

  const authorize = useCallback(() => {
    // Authorization is now handled by PasswordContext
    // This function is kept for backward compatibility
  }, []);

  const revoke = useCallback(() => {
    revokePassword();
  }, [revokePassword]);

  const value = useMemo(() => ({
    isAdmin,
    authorize,
    revoke,
  }), [authorize, revoke, isAdmin]);

  return (
    <AdminAccessContext.Provider value={value}>
      {children}
    </AdminAccessContext.Provider>
  );
};

export const useAdminAccess = (): AdminAccessContextValue => {
  const context = useContext(AdminAccessContext);
  if (!context) {
    throw new Error('useAdminAccess must be used within an AdminAccessProvider');
  }
  return context;
};


