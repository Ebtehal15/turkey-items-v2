import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import type { ReactNode } from 'react';

export type UserRole = 'none' | 'user' | 'admin';

interface PasswordContextValue {
  role: UserRole;
  authorize: (password: string) => boolean;
  revoke: () => void;
}

const PasswordContext = createContext<PasswordContextValue | undefined>(undefined);

const STORAGE_KEY = 'userRole';

interface ProviderProps {
  children: ReactNode;
}

const DEFAULT_USER_PASSWORD = 'user123';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

export const PasswordProvider = ({ children }: ProviderProps) => {
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window === 'undefined') {
      return 'none';
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'user' || stored === 'admin') {
      return stored;
    }
    return 'none';
  });

  useEffect(() => {
    if (role !== 'none') {
      window.localStorage.setItem(STORAGE_KEY, role);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [role]);

  const authorize = useCallback((password: string): boolean => {
    const userPassword = import.meta.env.VITE_USER_PASSWORD ?? DEFAULT_USER_PASSWORD;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSCODE ?? DEFAULT_ADMIN_PASSWORD;

    if (password.trim() === adminPassword) {
      setRole('admin');
      return true;
    }
    if (password.trim() === userPassword) {
      setRole('user');
      return true;
    }
    return false;
  }, []);

  const revoke = useCallback(() => {
    setRole('none');
  }, []);

  const value = useMemo(() => ({
    role,
    authorize,
    revoke,
  }), [authorize, revoke, role]);

  return (
    <PasswordContext.Provider value={value}>
      {children}
    </PasswordContext.Provider>
  );
};

export const usePassword = (): PasswordContextValue => {
  const context = useContext(PasswordContext);
  if (!context) {
    throw new Error('usePassword must be used within a PasswordProvider');
  }
  return context;
};


