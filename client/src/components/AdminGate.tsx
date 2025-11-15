import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePassword } from '../context/PasswordContext';
import useTranslate from '../hooks/useTranslate';

interface AdminGateProps {
  children: ReactNode;
}

const AdminGate = ({ children }: AdminGateProps) => {
  const { role, authorize } = usePassword();
  const { t } = useTranslate();
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (role === 'admin') {
    return <>{children}</>;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = authorize(passcode);
    if (success) {
      setError(null);
      setPasscode('');
    } else {
      setError(t('Incorrect admin password. Please try again.', 'كلمة مرور المدير غير صحيحة. حاول مرة أخرى.', 'Contraseña de administrador incorrecta. Inténtalo de nuevo.'));
      setPasscode('');
    }
  };

  return (
    <div className="panel admin-gate">
      <div className="card">
        <h1>{t('Admin Access', 'وصول الإدارة', 'Acceso de Administrador')}</h1>
        <p>
          {t(
            'This area is restricted. Enter the admin passcode to continue.',
            'هذا القسم مخصص للإدارة. أدخل رمز المرور للمتابعة.',
            'Esta área es restringida. Introduce la contraseña de administrador para continuar.',
          )}
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('Passcode', 'رمز المرور', 'Contraseña')}
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit">
            {t('Unlock Admin', 'فتح لوحة الإدارة', 'Desbloquear Admin')}
          </button>
          {error && <div className="alert alert--error">{error}</div>}
        </form>
        <button
          type="button"
          onClick={() => navigate('/catalog')}
          className="secondary"
          style={{ marginTop: '1rem', width: '100%' }}
        >
          {t('Go to Catalog', 'الذهاب إلى الكتالوج', 'Ir al Catálogo')}
        </button>
      </div>
    </div>
  );
};

export default AdminGate;

