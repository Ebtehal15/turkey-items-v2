import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePassword } from '../context/PasswordContext';
import useTranslate from '../hooks/useTranslate';

interface PasswordGateProps {
  children: ReactNode;
}

const PasswordGate = ({ children }: PasswordGateProps) => {
  const { role, authorize } = usePassword();
  const { t } = useTranslate();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (role !== 'none') {
    return <>{children}</>;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    
    // Şifreyi kontrol et ve role'ü belirle
    const userPassword = import.meta.env.VITE_USER_PASSWORD ?? 'user123';
    const adminPassword = import.meta.env.VITE_ADMIN_PASSCODE ?? 'admin123';
    
    const trimmedPassword = password.trim();
    let newRole: 'user' | 'admin' | null = null;
    
    if (trimmedPassword === adminPassword) {
      newRole = 'admin';
    } else if (trimmedPassword === userPassword) {
      newRole = 'user';
    }
    
    if (newRole) {
      // Şifre doğru, authorize et ve yönlendir
      authorize(password);
      if (newRole === 'admin') {
        navigate('/admin');
      } else {
        navigate('/catalog');
      }
      setPassword('');
    } else {
      // Şifre yanlış
      setError(t('Incorrect password. Please try again.', 'كلمة المرور غير صحيحة. حاول مرة أخرى.', 'Contraseña incorrecta. Inténtalo de nuevo.'));
      setPassword('');
    }
  };

  return (
    <div className="panel password-gate">
      <div className="card">
        <h1>{t('Enter Password', 'أدخل كلمة المرور', 'Ingrese la contraseña')}</h1>
        <p>
          {t(
            'This site is password protected. Enter your password to continue.',
            'هذا الموقع محمي بكلمة مرور. أدخل كلمة المرور للمتابعة.',
            'Este sitio está protegido con contraseña. Ingrese su contraseña para continuar.',
          )}
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('Password', 'كلمة المرور', 'Contraseña')}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit">
            {t('Enter', 'دخول', 'Entrar')}
          </button>
          {error && <div className="alert alert--error">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default PasswordGate;

