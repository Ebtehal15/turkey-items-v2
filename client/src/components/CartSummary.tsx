import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCart } from '../context/CartContext';
import useTranslate from '../hooks/useTranslate';

const formatCurrency = (value: number) => {
  if (Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const CartSummary = () => {
  const {
    items,
    totalItems,
    knownTotal,
    hasUnknownPrices,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const { language, t } = useTranslate();
  const [customerInfo, setCustomerInfo] = useState({
    fullName: '',
    company: '',
    phone: '',
    salesPerson: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const hasItems = items.length > 0;

  const resolvedTotalLabel = useMemo(() => {
    if (hasUnknownPrices) {
      return t('Partial total (prices missing)', 'المجموع الجزئي (أسعار ناقصة)', 'Total parcial (faltan precios)');
    }
    return t('Order total', 'إجمالي الطلب', 'Total del pedido');
  }, [hasUnknownPrices, t]);

  const downloadOrderForm = async () => {
    if (!items.length) {
      return;
    }

    if (!customerInfo.fullName.trim()) {
      setFormError(t('Please fill the required field (name).', 'يرجى ملء الحقل المطلوب (الاسم).', 'Completa el campo obligatorio (nombre).'));
      return;
    }

    setFormError(null);
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(18);
      doc.text(t('Order Form', 'نموذج الطلب', 'Formulario de pedido'), pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(12);
      const infoEntries: Array<[string, string]> = [
        [t('Full Name', 'الاسم الكامل', 'Nombre completo'), customerInfo.fullName],
        [t('Company', 'الشركة', 'Empresa'), customerInfo.company || t('N/A', 'غير متوفر', 'No disponible')],
        [t('Phone', 'الهاتف', 'Teléfono'), customerInfo.phone || t('N/A', 'غير متوفر', 'No disponible')],
        [t('Sales Person', 'مندوب المبيعات', 'Vendedor'), customerInfo.salesPerson || t('N/A', 'غير متوفر', 'No disponible')],
      ];

      let infoY = 32;
      infoEntries.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 20, infoY);
        infoY += 8;
      });

      const headers = [
        t('Code', 'الرمز', 'Código'),
        t('Product Name', 'اسم المنتج', 'Nombre del producto'),
        t('Quantity', 'الكمية', 'Cantidad'),
        t('Unit Price', 'سعر الوحدة', 'Precio unitario'),
        t('Subtotal', 'الإجمالي الفرعي', 'Subtotal'),
      ];

      const rows = items.map(({ record, quantity }) => {
        const name = (() => {
          if (language === 'ar' && record.classNameArabic) return record.classNameArabic;
          if (language === 'en' && record.classNameEnglish) return record.classNameEnglish;
          return record.className;
        })();
        const unitPrice = record.classPrice ?? 0;
        const subtotal = record.classPrice ? record.classPrice * quantity : 0;
        return [
          record.specialId,
          name,
          String(quantity),
          record.classPrice !== null && record.classPrice !== undefined
            ? `$${formatCurrency(unitPrice)}`
            : t('Contact for price', 'السعر عند الطلب', 'Precio bajo consulta'),
          record.classPrice !== null && record.classPrice !== undefined
            ? `$${formatCurrency(subtotal)}`
            : t('N/A', 'غير متوفر', 'No disponible'),
        ];
      });

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: infoY + 4,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42] },
      });

      const finalY = ((doc as any).lastAutoTable?.finalY ?? infoY) + 12;
      doc.setFontSize(12);
      doc.text(`${resolvedTotalLabel}: $${formatCurrency(knownTotal)}`, 20, finalY);
      doc.text(
        `${t('Total items', 'إجمالي العناصر', 'Total de artículos')}: ${totalItems}`,
        20,
        finalY + 8,
      );
      doc.text(
        `${t('Generated on', 'تم الإنشاء في', 'Generado el')}: ${new Date().toLocaleString()}`,
        20,
        finalY + 16,
      );
      if (hasUnknownPrices) {
        doc.setTextColor(214, 118, 17);
        doc.text(
          t('Some prices require confirmation. Totals are estimates.', 'بعض الأسعار تتطلب تأكيداً. الإجمالي تقديري.', 'Algunos precios requieren confirmación. Los totales son estimados.'),
          20,
          finalY + 24,
        );
        doc.setTextColor(0, 0, 0);
      }

      doc.save(`order-form-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate PDF', error);
      setFormError(t('Failed to generate PDF. Please try again.', 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo generar el PDF. Inténtalo de nuevo.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCustomerChange = (field: keyof typeof customerInfo, value: string) => {
    setCustomerInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleQuantityChange = async (classId: number, next: number) => {
    if (Number.isNaN(next) || next <= 0) {
      await removeItem(classId);
      return;
    }
    await updateQuantity(classId, next);
  };

  return (
    <div className="card cart-card">
      <div className="cart-card__header">
        <div>
          <h2>{t('Your cart', 'سلة الطلبات', 'Tu carrito')}</h2>
          <p>{hasItems ? t('Review and adjust your selection before exporting the order form.', 'راجع وعدّل اختيارك قبل تنزيل نموذج الطلب.', 'Revisa y ajusta tu selección antes de descargar el formulario de pedido.') : t('Add products to build your order form.', 'أضف منتجات لإنشاء نموذج الطلب الخاص بك.', 'Añade productos para crear tu formulario de pedido.')}</p>
        </div>
      </div>

      <div className="cart-card__content">
        {!hasItems && (
          <div className="cart-card__empty">
            <div role="img" aria-label="Empty cart">🛒</div>
            <p>{t('No items selected yet.', 'لم يتم اختيار أي عناصر بعد.', 'Todavía no hay artículos seleccionados.')}</p>
          </div>
        )}

        {hasItems && (
          <>
            <div className="cart-card__form">
            <h3>{t('Your details', 'بياناتك', 'Tus datos')}</h3>
            <div className="cart-form-grid">
              <label className="cart-form-field">
                {t('Full Name*', 'الاسم الكامل*', 'Nombre completo*')}
                <input
                  type="text"
                  value={customerInfo.fullName}
                  required
                  onChange={(event) => handleCustomerChange('fullName', event.target.value)}
                  placeholder={t('Enter your full name', 'أدخل اسمك الكامل', 'Escribe tu nombre completo')}
                />
              </label>
              <label className="cart-form-field">
                {t('Company', 'الشركة', 'Empresa')}
                <input
                  type="text"
                  value={customerInfo.company}
                  onChange={(event) => handleCustomerChange('company', event.target.value)}
                  placeholder={t('Company (optional)', 'الشركة (اختياري)', 'Empresa (opcional)')}
                />
              </label>
              <label className="cart-form-field">
                {t('Phone', 'الهاتف', 'Teléfono')}
                <input
                  type="tel"
                  value={customerInfo.phone}
                  onChange={(event) => handleCustomerChange('phone', event.target.value)}
                  placeholder={t('Phone number (optional)', 'رقم الهاتف (اختياري)', 'Teléfono (opcional)')}
                />
              </label>
              <label className="cart-form-field">
                {t('Sales Person', 'مندوب المبيعات', 'Vendedor')}
                <input
                  type="text"
                  value={customerInfo.salesPerson}
                  onChange={(event) => handleCustomerChange('salesPerson', event.target.value)}
                  placeholder={t('Sales person name (optional)', 'اسم مندوب المبيعات (اختياري)', 'Nombre del vendedor (opcional)')}
                />
              </label>
            </div>
            {formError && <p className="cart-form-error">{formError}</p>}
          </div>


          <ul className="cart-card__list">
            {items.map(({ record, quantity }) => (
              <li key={record.id} className="cart-item">
                <button
                  type="button"
                  className="cart-remove-btn cart-remove-btn--top"
                  onClick={async () => { await removeItem(record.id); }}
                  aria-label={t('Remove from cart', 'إزالة من السلة', 'Eliminar del carrito')}
                  title={t('Remove from cart', 'إزالة من السلة', 'Eliminar del carrito')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="cart-item__info">
                  <span className="cart-item__code">{record.specialId}</span>
                  <div className="cart-item__name-row">
                    <p className="cart-item__name">
                      {(() => {
                        if (language === 'ar' && record.classNameArabic) return record.classNameArabic;
                        if (language === 'en' && record.classNameEnglish) return record.classNameEnglish;
                        return record.className;
                      })()}
                    </p>
                    <div className="cart-item__name-row-actions">
                      <div className="cart-quantity-buttons cart-quantity-buttons--inline" role="group" aria-label={t('Adjust quantity', 'ضبط الكمية', 'Ajustar cantidad')}>
                        <button
                          type="button"
                          className="cart-quantity-btn"
                          onClick={() => handleQuantityChange(record.id, Math.max(1, quantity - 1))}
                          aria-label={t('Decrease quantity', 'تقليل الكمية', 'Disminuir cantidad')}
                        >
                          −
                        </button>
                        <span className="cart-quantity-value" aria-live="polite">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          className="cart-quantity-btn"
                          onClick={() => handleQuantityChange(record.id, quantity + 1)}
                          aria-label={t('Increase quantity', 'زيادة الكمية', 'Aumentar cantidad')}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <span className="cart-item__price">
                    {record.classPrice !== null && record.classPrice !== undefined
                      ? `$${formatCurrency(record.classPrice)}`
                      : t('Contact for price', 'السعر عند الطلب', 'Precio bajo consulta')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {hasItems && (
          <div className="cart-card__footer">
            <div className="cart-card__footer-total">
              <p className="cart-card__total-label">{resolvedTotalLabel}</p>
              <p className="cart-card__total-value">
                {hasUnknownPrices
                  ? `$${formatCurrency(knownTotal)}`
                  : `$${formatCurrency(knownTotal)}`}
              </p>
            </div>
            <div className="cart-card__footer-actions">
              <button
                type="button"
                className="text danger cart-clear-btn"
                onClick={async () => { await clearCart(); }}
              >
                {t('Clear cart', 'مسح السلة', 'Vaciar carrito')}
              </button>
              <button
                type="button"
                className="primary"
                onClick={downloadOrderForm}
                disabled={isGenerating}
              >
                {isGenerating
                  ? t('Preparing PDF...', '...جاري تجهيز ملف PDF', 'Preparando PDF...')
                  : t('Download order form', 'تنزيل نموذج الطلب', 'Descargar formulario de pedido')}
              </button>
            </div>
          </div>
      )}
    </div>
  );
};

export default CartSummary;


