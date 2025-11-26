import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import logoUrl from '../assets/ajlogo.png';
import { useAdminAccess } from '../context/AdminAccessContext';
import useTranslate from '../hooks/useTranslate';
import type { SupportedLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import CartSummary from './CartSummary';

const NavBar = () => {
  const { isAdmin } = useAdminAccess();
  const { language, t, setLanguage } = useTranslate();
  const { totalItems } = useCart();
  const [isCartOpen, setCartOpen] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCartOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCartOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isCartOpen]);

  const labels = {
    brand: t('AJ International Group', 'AJ International Group', 'AJ International Group'),
    catalog: t('Product Catalog', 'كتالوج المنتجات', 'Catálogo'),
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
        <div className="nav__cart" ref={cartRef}>
          <button
            type="button"
            className="nav__cart-btn"
            onClick={() => setCartOpen((prev) => !prev)}
            aria-expanded={isCartOpen}
            aria-label={t('Cart', 'السلة', 'Carrito')}
          >
            <span className="nav__cart-icon" aria-hidden="true">
              🛒
            </span>
            <span className="nav__cart-count">{totalItems}</span>
          </button>
          {isCartOpen &&
            typeof document !== 'undefined' &&
            createPortal(
              <>
                <div className="nav__cart-overlay" onClick={() => setCartOpen(false)} />
                <div className="nav__cart-popover" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="nav__cart-close"
                    onClick={() => setCartOpen(false)}
                    aria-label={t('Close cart', 'إغلاق السلة', 'Cerrar carrito')}
                  >
                    ×
                  </button>
                  <CartSummary />
                </div>
              </>,
              document.body,
            )}
        </div>
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
