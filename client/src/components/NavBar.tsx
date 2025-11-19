import { NavLink } from 'react-router-dom';
import logoUrl from '../assets/ajlogo.png';
import { useAdminAccess } from '../context/AdminAccessContext';
import useTranslate from '../hooks/useTranslate';
import type { SupportedLanguage } from '../context/LanguageContext';

const NavBar = () => {
  const { isAdmin } = useAdminAccess();
  const { language, t, setLanguage } = useTranslate();

  const labels = {
    brand: t('AJ International Group', 'AJ International Group', 'AJ International Group'),
    catalog: t('Catalog', 'الكتالوج', 'Catálogo'),
    admin: t('Admin', 'الإدارة', 'Administración'),
  };

  const languageOptions: Array<{ code: SupportedLanguage; label: string; aria: string }> = [
    { code: 'en', label: 'EN', aria: 'English' },
    { code: 'ar', label: 'AR', aria: 'العربية' },
    { code: 'es', label: 'ES', aria: 'Español' },
  ];

  return (
    <header className="nav">
      <div className="nav__brand">
        <img src={logoUrl} alt="Product Catalog logo" />
        <span>{labels.brand}</span>
      </div>
      <nav className="nav__links">
        <NavLink
          to="/catalog"
          className={({ isActive }: { isActive: boolean }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
        >
          {labels.catalog}
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }: { isActive: boolean }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
          >
            {labels.admin}
          </NavLink>
        )}
        <div className="nav__lang-group">
          {languageOptions.map(({ code, label, aria }) => (
            <button
              key={code}
              type="button"
              className={`nav__lang-btn ${language === code ? 'nav__lang-btn--active' : ''}`}
              onClick={() => setLanguage(code)}
              aria-label={aria}
              title={aria}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
