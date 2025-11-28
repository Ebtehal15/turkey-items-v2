import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
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
  const [isSharing, setIsSharing] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);

  const hasItems = items.length > 0;

  const resolvedTotalLabel = useMemo(() => {
    if (hasUnknownPrices) {
      return t('Partial total (prices missing)', 'المجموع الجزئي (أسعار ناقصة)', 'Total parcial (faltan precios)');
    }
    return t('Order total', 'إجمالي الطلب', 'Total del pedido');
  }, [hasUnknownPrices, t]);

  const generatePDFBlob = async (): Promise<Blob> => {
    // Create HTML content for PDF with Arabic support
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB'); // dd/mm/yyyy
    const formattedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:MM

    const htmlContent = `
      <div style="
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 30px;
        max-width: 750px;
        margin: 0 auto;
        direction: ${language === 'ar' ? 'rtl' : 'ltr'};
        text-align: ${language === 'ar' ? 'right' : 'left'};
        border: 2px solid #0f172a;
        border-radius: 3px;
        background: white;
        min-height: 600px;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        ">
          <div></div>
          <h1 style="
            font-size: 18px;
            margin: 0;
            color: #0f172a;
            font-weight: bold;
            text-align: center;
          ">${t('Order Form', 'نموذج الطلب', 'Formulario de pedido')}</h1>
          <div style="
            color: #0f172a;
            font-size: 10px;
            font-weight: bold;
          ">
            ${formattedDate} - ${formattedTime}
          </div>
        </div>
        
        <div style="margin-bottom: 20px;">
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Full Name', 'الاسم الكامل', 'Nombre completo')}:</strong> ${customerInfo.fullName}</p>
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Company', 'الشركة', 'Empresa')}:</strong> ${customerInfo.company || t('N/A', 'غير متوفر', 'No disponible')}</p>
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Phone', 'الهاتف', 'Teléfono')}:</strong> ${customerInfo.phone || t('N/A', 'غير متوفر', 'No disponible')}</p>
        </div>

        <div style="margin-bottom: 15px;">
          <table style="
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 4px;
            overflow: hidden;
          ">
            <thead>
              <tr style="background: #0f172a; color: white;">
                <th style="padding: 6px 4px; text-align: ${language === 'ar' ? 'right' : 'left'}; font-size: 9px; font-weight: bold;">${t('Code', 'الرمز', 'Código')}</th>
                <th style="padding: 6px 4px; text-align: ${language === 'ar' ? 'right' : 'left'}; font-size: 9px; font-weight: bold;">${t('Product Name', 'اسم المنتج', 'Nombre del producto')}</th>
                <th style="padding: 6px 4px; text-align: center; font-size: 9px; font-weight: bold;">${t('Quantity', 'الكمية', 'Cantidad')}</th>
                <th style="padding: 6px 4px; text-align: ${language === 'ar' ? 'left' : 'right'}; font-size: 9px; font-weight: bold;">${t('Unit Price', 'سعر الوحدة', 'Precio unitario')}</th>
                <th style="padding: 6px 4px; text-align: ${language === 'ar' ? 'left' : 'right'}; font-size: 9px; font-weight: bold;">${t('Subtotal', 'الإجمالي الفرعي', 'Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(({ record, quantity }, index) => {
                const name = (() => {
                  if (language === 'ar' && record.classNameArabic) return record.classNameArabic;
                  if (language === 'en' && record.classNameEnglish) return record.classNameEnglish;
                  return record.className;
                })();
                const unitPrice = record.classPrice ?? 0;
                const subtotal = record.classPrice ? record.classPrice * quantity : 0;
                return `
                  <tr style="border-bottom: 1px solid #e5e7eb; ${index % 2 === 0 ? 'background: #f9fafb;' : 'background: white;'}">
                    <td style="padding: 4px 6px; text-align: ${language === 'ar' ? 'right' : 'left'}; font-size: 8px;">${record.specialId}</td>
                    <td style="padding: 4px 6px; text-align: ${language === 'ar' ? 'right' : 'left'}; font-size: 8px;">${name}</td>
                    <td style="padding: 4px 6px; text-align: center; font-size: 8px;">${quantity}</td>
                    <td style="padding: 4px 6px; text-align: ${language === 'ar' ? 'left' : 'right'}; font-size: 8px;">
                      ${record.classPrice !== null && record.classPrice !== undefined
                        ? `$${formatCurrency(unitPrice)}`
                        : t('Contact for price', 'السعر عند الطلب', 'Precio bajo consulta')}
                    </td>
                    <td style="padding: 4px 6px; text-align: ${language === 'ar' ? 'left' : 'right'}; font-size: 8px;">
                      ${record.classPrice !== null && record.classPrice !== undefined
                        ? `$${formatCurrency(subtotal)}`
                        : t('N/A', 'غير متوفر', 'No disponible')}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="
          background: #f8fafc;
          padding: 12px;
          border-radius: 2px;
          margin-top: 15px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-size: 12px; color: #0f172a;">${t('Order total', 'إجمالي الطلب', 'Total del pedido')}:</strong>
            <strong style="font-size: 12px; color: #059669;">$${formatCurrency(knownTotal)}</strong>
          </div>
          <p style="font-size: 10px; color: #0f172a; margin: 0;"><strong>${t('Total items', 'إجمالي العناصر', 'Total de artículos')}:</strong> ${totalItems}</p>
          ${hasUnknownPrices ? `
            <p style="color: #d97706; margin-top: 8px; font-size: 9px; margin-bottom: 0;">
              ${t('Some prices require confirmation. Totals are estimates.', 'بعض الأسعار تتطلب تأكيداً. الإجمالي تقديري.', 'Algunos precios requieren confirmación. Los totales son estimados.')}
            </p>
          ` : ''}
        </div>
      </div>
    `;

    // Create temporary div
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '800px';
    tempDiv.style.backgroundColor = '#f8fafc';
    tempDiv.style.padding = '20px';
    document.body.appendChild(tempDiv);

    // Convert to canvas
    const canvas = await html2canvas(tempDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#f8fafc',
      width: 840,
      height: tempDiv.scrollHeight + 40,
      x: 0,
      y: 0
    });

    // Remove temporary div
    document.body.removeChild(tempDiv);

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Return PDF as blob
    return pdf.output('blob');
  };

  const downloadOrderForm = async () => {
    if (!items.length) {
      return;
    }

    if (!customerInfo.fullName.trim()) {
      setShowInfoPopup(true);
      return;
    }

    setFormError(null);
    setIsGenerating(true);

    try {
      const pdfBlob = await generatePDFBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `order-form-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate PDF', error);
      setFormError(t('Failed to generate PDF. Please try again.', 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo generar el PDF. Inténtalo de nuevo.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const shareToWhatsApp = async () => {
    if (!items.length) {
      return;
    }

    if (!customerInfo.fullName.trim()) {
      setShowInfoPopup(true);
      return;
    }

    setFormError(null);
    setIsSharing(true);

    try {
      const pdfBlob = await generatePDFBlob();
      const fileName = `order-form-${new Date().toISOString().slice(0, 10)}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // Check if Web Share API is supported
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: t('Order Form', 'نموذج الطلب', 'Formulario de pedido'),
            text: t('Order Form', 'نموذج الطلب', 'Formulario de pedido'),
          });
        } catch (shareError: any) {
          // User cancelled or share failed, fallback to download
          if (shareError.name !== 'AbortError') {
            throw shareError;
          }
        }
      } else {
        // Fallback: Open WhatsApp Web with message
        const message = encodeURIComponent(
          t('Order Form', 'نموذج الطلب', 'Formulario de pedido') + 
          ` - ${customerInfo.fullName}\n` +
          t('Please find the order form attached.', 'يرجى الاطلاع على نموذج الطلب المرفق.', 'Por favor, encuentra el formulario de pedido adjunto.')
        );
        const whatsappUrl = `https://wa.me/?text=${message}`;
        window.open(whatsappUrl, '_blank');
        
        // Also download the PDF as fallback
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to share PDF', error);
      setFormError(t('Failed to share PDF. Please try again.', 'تعذر مشاركة ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo compartir el PDF. Inténtalo de nuevo.'));
    } finally {
      setIsSharing(false);
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
          <div className="cart-card__header-title-row">
            <h2 style={{ margin: 0, textAlign: 'center', width: '100%' }}>{t('Your cart', 'سلة الطلبات', 'Tu carrito')}</h2>
          </div>
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
                className="cart-clear-btn cart-clear-btn--footer"
                onClick={async () => {
                  await clearCart();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('Clear Cart', 'مسح السلة', 'Vaciar Carrito')}
              </button>
              <button
                type="button"
                className="primary cart-download-btn"
                onClick={downloadOrderForm}
                disabled={isGenerating || isSharing}
              >
                {isGenerating
                  ? t('Preparing PDF...', '...جاري تجهيز ملف PDF', 'Preparando PDF...')
                  : t('Download order form', 'تنزيل نموذج الطلب', 'Descargar formulario de pedido')}
              </button>
              <button
                type="button"
                className="primary cart-whatsapp-btn"
                onClick={shareToWhatsApp}
                disabled={isGenerating || isSharing}
              >
                {isSharing ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>
                    </svg>
                    <span className="cart-whatsapp-btn-text">{t('Sharing...', '...جاري المشاركة', 'Compartiendo...')}</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="currentColor"/>
                    </svg>
                    <span className="cart-whatsapp-btn-text">{t('Send to WhatsApp', 'إرسال إلى واتساب', 'Enviar a WhatsApp')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
      )}

      {/* Info Popup Modal */}
      {showInfoPopup && (
        <div className="cart-info-popup-overlay" onClick={() => setShowInfoPopup(false)}>
          <div className="cart-info-popup" onClick={(e) => e.stopPropagation()}>
            <div className="cart-info-popup-header">
              <h3>{t('Information Required', 'معلومات مطلوبة', 'Información Requerida')}</h3>
              <button
                type="button"
                className="cart-info-popup-close"
                onClick={() => setShowInfoPopup(false)}
                aria-label={t('Close', 'إغلاق', 'Cerrar')}
              >
                ×
              </button>
            </div>
            <div className="cart-info-popup-content">
              <p>{t('Please fill in your information before downloading or sharing the order form.', 'يرجى ملء معلوماتك قبل تنزيل أو مشاركة نموذج الطلب.', 'Por favor, completa tu información antes de descargar o compartir el formulario de pedido.')}</p>
              <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                {t('Required field: Full Name', 'الحقل المطلوب: الاسم الكامل', 'Campo obligatorio: Nombre completo')}
              </p>
            </div>
            <div className="cart-info-popup-footer">
              <button
                type="button"
                className="cart-info-popup-button"
                onClick={() => setShowInfoPopup(false)}
              >
                {t('OK', 'حسناً', 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartSummary;


