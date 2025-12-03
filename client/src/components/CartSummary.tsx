import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useCart } from '../context/CartContext';
import useTranslate from '../hooks/useTranslate';
import apiClient from '../api/client';
import { addOrderToHistory, type OrderHistoryItem } from '../utils/orderHistory';

const formatCurrency = (value: number) => {
  if (Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

type CustomerInfoState = {
  fullName: string;
  company: string;
  phone: string;
  salesPerson: string;
  notes: string;
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
  const [customerInfo, setCustomerInfo] = useState<CustomerInfoState>({
    fullName: '',
    company: '',
    phone: '',
    salesPerson: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);

  const hasItems = items.length > 0;

  const resolvedTotalLabel = useMemo(() => {
    if (hasUnknownPrices) {
      return t('Partial total (prices missing)', 'المجموع الجزئي (أسعار ناقصة)', 'Total parcial (faltan precios)');
    }
    return t('Order total', 'إجمالي الطلب', 'Total del pedido');
  }, [hasUnknownPrices, t]);

  // Generate unique order ID from backend
  const getNextOrderId = async (): Promise<number> => {
    try {
      // Backend'den yeni order ID oluştur ve kaydet
      const response = await apiClient.post('/api/cart/order-id');
      return response.data.orderId;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get order ID from backend, using fallback:', error);
      // Fallback: localStorage kullan (sadece backend erişilemezse)
      const STORAGE_KEY = 'lastOrderId';
      const START_ID = 1000;
      const lastId = localStorage.getItem(STORAGE_KEY);
      const nextId = lastId ? parseInt(lastId, 10) + 1 : START_ID;
      localStorage.setItem(STORAGE_KEY, nextId.toString());
      return nextId;
    }
  };

  const generatePDFBlob = async (
    orderId: number,
    override?: {
      items?: typeof items;
      customerInfo?: CustomerInfoState;
      knownTotal?: number;
      totalItems?: number;
      hasUnknownPrices?: boolean;
      language?: string;
    },
  ): Promise<Blob> => {
    const pdfItems = override?.items ?? items;
    const pdfCustomerInfo = override?.customerInfo ?? customerInfo;
    const pdfKnownTotal = override?.knownTotal ?? knownTotal;
    const pdfTotalItems = override?.totalItems ?? totalItems;
    const pdfHasUnknownPrices = override?.hasUnknownPrices ?? hasUnknownPrices;
    const pdfLanguage = override?.language ?? language;
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
        direction: ${pdfLanguage === 'ar' ? 'rtl' : 'ltr'};
        text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'};
        border: 2px solid #0f172a;
        border-radius: 3px;
        background: white;
        min-height: 600px;
      ">
        <div
          style="
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 20px;
            direction: ltr;
          "
        >
          ${
            pdfLanguage === 'ar'
              ? `
          <div
            style="
              flex: 1;
              text-align: left;
              color: #0f172a;
              font-size: 14px;
              font-weight: bold;
            "
          >
            ${formattedDate} - ${formattedTime}
          </div>
          <div
            style="
              text-align: center;
              flex: 0 0 auto;
            "
          >
            <h1
              style="
                font-size: 20px;
                margin: 0 0 4px 0;
                color: #0f172a;
                font-weight: bold;
              "
            >
              ${t('Order Form', 'نموذج الطلب', 'Formulario de pedido')}
            </h1>
            <p
              style="
                margin: 0;
                color: #0f172a;
                font-size: 17px;
                font-weight: 600;
              "
            >
              ${t('Order ID', 'رقم الطلب', 'ID de Pedido')}: ${orderId}
            </p>
          </div>
          <div style="flex: 1;"></div>
          `
              : `
          <div style="flex: 1;"></div>
          <div
            style="
              text-align: center;
              flex: 0 0 auto;
            "
          >
            <h1
              style="
                font-size: 20px;
                margin: 0 0 4px 0;
                color: #0f172a;
                font-weight: bold;
              "
            >
              ${t('Order Form', 'نموذج الطلب', 'Formulario de pedido')}
            </h1>
            <p
              style="
                margin: 0;
                color: #0f172a;
                font-size: 17px;
                font-weight: 600;
              "
            >
              ${t('Order ID', 'رقم الطلب', 'ID de Pedido')}: ${orderId}
            </p>
          </div>
          <div
            style="
              flex: 1;
              text-align: right;
              color: #0f172a;
              font-size: 14px;
              font-weight: bold;
            "
          >
            ${formattedDate} - ${formattedTime}
          </div>
          `
          }
        </div>
        
        <div style="margin-bottom: 20px;">
                 <p style="margin: 4px 0; font-size: 14px;"><strong>${t('Customer Name', 'اسم العميل', 'Nombre del cliente')}:</strong> ${pdfCustomerInfo.fullName}</p>
               <p style="margin: 4px 0; font-size: 14px;"><strong>${t('Company', 'الشركة', 'Empresa')}:</strong> ${pdfCustomerInfo.company || t('N/A', 'غير متوفر', 'No disponible')}</p>
               <p style="margin: 4px 0; font-size: 14px;"><strong>${t('Phone', 'الهاتف', 'Teléfono')}:</strong> ${pdfCustomerInfo.phone || t('N/A', 'غير متوفر', 'No disponible')}</p>
               <p style="margin: 4px 0; font-size: 14px;"><strong>${t('Sales Person', 'مندوب المبيعات', 'Vendedor')}:</strong> ${pdfCustomerInfo.salesPerson || t('N/A', 'غير متوفر', 'No disponible')}</p>
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
                     <th style="padding: 6px 4px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Code', 'الرمز', 'Código')}</th>
                     <th style="padding: 6px 4px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Group', 'المجموعة', 'Grupo')}</th>
                     <th style="padding: 6px 4px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Product Name', 'اسم المنتج', 'Nombre del producto')}</th>
                <th style="padding: 6px 4px; text-align: center; font-size: 13px; font-weight: bold;">${t('Quantity', 'الكمية', 'Cantidad')}</th>
                     <th style="padding: 6px 4px; text-align: ${pdfLanguage === 'ar' ? 'left' : 'right'}; font-size: 13px; font-weight: bold;">${t('Unit Price', 'سعر الوحدة', 'Precio unitario')}</th>
                     <th style="padding: 6px 4px; text-align: ${pdfLanguage === 'ar' ? 'left' : 'right'}; font-size: 13px; font-weight: bold;">${t('Subtotal', 'الإجمالي الفرعي', 'Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
                   ${pdfItems.map(({ record, quantity }, index) => {
                const name = (() => {
                       if (pdfLanguage === 'ar' && record.classNameArabic) return record.classNameArabic;
                       if (pdfLanguage === 'en' && record.classNameEnglish) return record.classNameEnglish;
                  return record.className;
                })();
                const unitPrice = record.classPrice ?? 0;
                const subtotal = record.classPrice ? record.classPrice * quantity : 0;
                return `
                       <tr style="border-bottom: 1px solid #e5e7eb; ${index % 2 === 0 ? 'background: #f9fafb;' : 'background: white;'}">
                         <td style="padding: 4px 6px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${record.specialId}</td>
                         <td style="padding: 4px 6px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${record.quality || t('N/A', 'غير متوفر', 'No disponible')}</td>
                         <td style="padding: 4px 6px; text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${name}</td>
                    <td style="padding: 4px 6px; text-align: center; font-size: 12px;">${quantity}</td>
                         <td style="padding: 4px 6px; text-align: ${pdfLanguage === 'ar' ? 'left' : 'right'}; font-size: 12px;">
                      ${record.classPrice !== null && record.classPrice !== undefined
                        ? `$${formatCurrency(unitPrice)}`
                        : t('Contact for price', 'السعر عند الطلب', 'Precio bajo consulta')}
                    </td>
                         <td style="padding: 4px 6px; text-align: ${pdfLanguage === 'ar' ? 'left' : 'right'}; font-size: 12px;">
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
                 <strong style="font-size: 17px; color: #0f172a;">${t('Order total', 'إجمالي الطلب', 'Total del pedido')}:</strong>
                 <strong style="font-size: 17px; color: #059669;">$${formatCurrency(pdfKnownTotal)}</strong>
               </div>
               <p style="font-size: 14px; color: #0f172a; margin: 0;"><strong>${t('Total items', 'إجمالي العناصر', 'Total de artículos')}:</strong> ${pdfTotalItems}</p>
               ${pdfHasUnknownPrices ? `
            <p style="color: #d97706; margin-top: 8px; font-size: 13px; margin-bottom: 0;">
              ${t('Some prices require confirmation. Totals are estimates.', 'بعض الأسعار تتطلب تأكيداً. الإجمالي تقديري.', 'Algunos precios requieren confirmación. Los totales son estimados.')}
            </p>
          ` : ''}
        </div>

        ${
          pdfCustomerInfo.notes
            ? `
        <div style="
          margin-top: 15px;
          padding: 10px 12px;
          border-radius: 2px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          text-align: ${pdfLanguage === 'ar' ? 'right' : 'left'};
        ">
          <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold;">
            ${t('Notes', 'ملاحظات', 'Notas')}:
          </p>
          <p style="margin: 0; font-size: 12px; white-space: pre-wrap; line-height: 1.4;">${pdfCustomerInfo.notes}</p>
        </div>
        `
            : ''
        }
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

  const handleDownloadClick = async () => {
    if (!items.length) {
      return;
    }

    if (!customerInfo.fullName.trim()) {
      setShowInfoPopup(true);
      return;
    }

    // Immediately show loading state for instant feedback
    setFormError(null);
    setIsGenerating(true);
    
    // Use setTimeout to ensure UI updates immediately
    setTimeout(async () => {
      try {
        // Her yeni PDF için yeni bir order ID oluştur
        const orderId = await getNextOrderId();
        setCurrentOrderId(orderId);
        
        // PDF'i order ID ile oluştur
        const pdfBlob = await generatePDFBlob(orderId);
        setGeneratedPdfBlob(pdfBlob);

        // Bu siparişi geçmişe ekle
        const historyEntry: OrderHistoryItem = {
          orderId,
          createdAt: new Date().toISOString(),
          customerInfo: {
            ...customerInfo,
          },
          items: items.map(({ record, quantity }) => ({
            classId: record.id,
            quantity,
            specialId: record.specialId,
            quality: record.quality ?? null,
            className: record.className,
            classNameArabic: record.classNameArabic ?? null,
            classNameEnglish: record.classNameEnglish ?? null,
            classPrice: record.classPrice ?? null,
          })),
          knownTotal,
          totalItems,
          hasUnknownPrices,
          language,
        };
        addOrderToHistory(historyEntry);
        
        // Download the PDF first
        const fileName = `order-form-${orderId}.pdf`;
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Create preview URL for PDF viewer
      const previewUrl = URL.createObjectURL(pdfBlob);
      setPdfPreviewUrl(previewUrl);
      
      // Show PDF preview and share options after download (cart summary stays open)
      setShowPdfPreview(true);
      setShowShareOptions(true);
      setIsGenerating(false);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to generate PDF', error);
        setFormError(t('Failed to generate PDF. Please try again.', 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo generar el PDF. Inténtalo de nuevo.'));
        setIsGenerating(false);
      }
    }, 0);
  };

  const shareToWhatsApp = async () => {
    if (!generatedPdfBlob || !currentOrderId) {
      return;
    }

    setFormError(null);
    setIsSharing(true);

    try {
      const orderId = currentOrderId;
      const fileName = `order-form-${orderId}.pdf`;
      const file = new File([generatedPdfBlob], fileName, { type: 'application/pdf' });

      // Check if Web Share API is supported and can share files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: t('Order Form', 'نموذج الطلب', 'Formulario de pedido'),
            text: t('Order Form', 'نموذج الطلب', 'Formulario de pedido') + ` - ${customerInfo.fullName}`,
          });
          setShowShareOptions(false);
          setIsSharing(false);
          return;
        } catch (shareError: any) {
          // User cancelled - just close modal
          if (shareError.name === 'AbortError') {
            setIsSharing(false);
            return;
          }
          // If share fails, fall through to WhatsApp Web
        }
      }

      // Fallback: Try WhatsApp app protocol first (mobile), then WhatsApp Web
      const message = t('Order Form', 'نموذج الطلب', 'Formulario de pedido') + 
        ` - ${customerInfo.fullName}\n` +
        t('Please find the order form attached.', 'يرجى الاطلاع على نموذج الطلب المرفق.', 'Por favor, encuentra el formulario de pedido adjunto.');
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // Try WhatsApp app first
        const whatsappAppUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
        window.location.href = whatsappAppUrl;
        
        // Fallback to WhatsApp Web after a delay if app doesn't open
        setTimeout(() => {
          const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
          window.open(whatsappWebUrl, '_blank');
        }, 1000);
      } else {
        // Desktop: Open WhatsApp Web
        const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappWebUrl, '_blank');
      }
      
      // Also download the PDF so user can attach it manually
      const downloadUrl = URL.createObjectURL(generatedPdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      
      setShowShareOptions(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to share PDF', error);
      setFormError(t('Failed to share PDF. Please try again.', 'تعذر مشاركة ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo compartir el PDF. Inténtalo de nuevo.'));
    } finally {
      setIsSharing(false);
    }
  };

  const shareOrderForm = async () => {
    if (!generatedPdfBlob || !currentOrderId) {
      return;
    }

    setFormError(null);
    setIsSharing(true);

    try {
      const orderId = currentOrderId;
      const fileName = `order-form-${orderId}.pdf`;
      const file = new File([generatedPdfBlob], fileName, { type: 'application/pdf' });

      // Check if Web Share API is supported
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: t('Order Form', 'نموذج الطلب', 'Formulario de pedido'),
            text: t('Order Form', 'نموذج الطلب', 'Formulario de pedido') + ` - ${customerInfo.fullName}`,
          });
          setShowShareOptions(false);
        } catch (shareError: any) {
          // User cancelled - just close the modal
          if (shareError.name === 'AbortError') {
            setShowShareOptions(false);
          } else {
            setFormError(t('Failed to share. Please try again.', 'تعذر المشاركة. يرجى المحاولة مرة أخرى.', 'No se pudo compartir. Inténtalo de nuevo.'));
          }
        }
      } else {
        // Web Share API not supported - show error message
        setFormError(t('Share feature is not available on this device.', 'ميزة المشاركة غير متاحة على هذا الجهاز.', 'La función de compartir no está disponible en este dispositivo.'));
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
                {t('Customer Name*', 'اسم العميل*', 'Nombre del cliente*')}
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
            <label className="cart-form-field" style={{ gridColumn: '1 / -1' }}>
              {t('Notes', 'ملاحظات', 'Notas')}
              <textarea
                value={customerInfo.notes}
                onChange={(event) => handleCustomerChange('notes', event.target.value)}
                placeholder={t('Add notes for this order (optional)', 'أضف ملاحظات لهذا الطلب (اختياري)', 'Añade notas para este pedido (opcional)')}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </label>
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

      {/* PDF File Card - shown in cart summary */}
      {showPdfPreview && pdfPreviewUrl && generatedPdfBlob && (
        <div className="cart-pdf-file-section">
          <div className="cart-pdf-file-item">
            <div className="cart-pdf-file-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#DC2626"/>
                <path d="M14 2v6h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <text x="12" y="18" fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">PDF</text>
              </svg>
            </div>
            <div className="cart-pdf-file-info">
              <div className="cart-pdf-file-name">
                {currentOrderId ? `order-form-${currentOrderId}.pdf` : `order-form-${new Date().toISOString().slice(0, 10)}.pdf`}
              </div>
              <div className="cart-pdf-file-size">
                {(generatedPdfBlob.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
            <div className="cart-pdf-file-actions">
              <button
                type="button"
                className="cart-pdf-file-action-btn"
                onClick={() => {
                  if (pdfPreviewUrl) {
                    window.open(pdfPreviewUrl, '_blank');
                  }
                }}
                title={t('Open PDF', 'فتح PDF', 'Abrir PDF')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                type="button"
                className="cart-pdf-file-action-btn cart-pdf-file-action-btn--share"
                onClick={async () => {
                  setShowShareOptions(true);
                }}
                title={t('Share', 'مشاركة', 'Compartir')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" fill="currentColor"/>
                </svg>
              </button>
              <button
                type="button"
                className="cart-pdf-file-action-btn cart-pdf-file-action-btn--delete"
                onClick={() => {
                  setShowPdfPreview(false);
                  setCurrentOrderId(null);
                  if (pdfPreviewUrl) {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
                  }
                  setGeneratedPdfBlob(null);
                }}
                title={t('Delete', 'حذف', 'Eliminar')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

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
                onClick={handleDownloadClick}
                disabled={isGenerating || isSharing}
              >
                {isGenerating
                  ? t('Preparing PDF...', '...جاري تجهيز ملف PDF', 'Preparando PDF...')
                  : t('Download order form', 'تنزيل نموذج الطلب', 'Descargar formulario de pedido')}
              </button>
            </div>
          </div>
      )}


      {/* Share Options Modal */}
      {showShareOptions && (
        <div className="cart-info-popup-overlay" onClick={() => setShowShareOptions(false)}>
          <div className="cart-info-popup" onClick={(e) => e.stopPropagation()}>
            <div className="cart-info-popup-header">
              <h3>{t('Share Order Form', 'مشاركة نموذج الطلب', 'Compartir Formulario de Pedido')}</h3>
              <button
                type="button"
                className="cart-info-popup-close"
                onClick={() => setShowShareOptions(false)}
                aria-label={t('Close', 'إغلاق', 'Cerrar')}
              >
                ×
              </button>
            </div>
            <div className="cart-info-popup-content">
              <p style={{ marginBottom: '1.5rem' }}>
                {t('Choose how you want to share your order form:', 'اختر طريقة مشاركة نموذج الطلب:', 'Elige cómo quieres compartir tu formulario de pedido:')}
              </p>
              <div className="cart-share-options">
                <button
                  type="button"
                  className="cart-share-option-btn cart-share-option-btn--whatsapp"
                  onClick={async () => {
                    await shareToWhatsApp();
                  }}
                  disabled={isSharing}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="currentColor"/>
                  </svg>
                  <span>{t('Share via WhatsApp', 'مشاركة عبر واتساب', 'Compartir por WhatsApp')}</span>
                </button>
                <button
                  type="button"
                  className="cart-share-option-btn cart-share-option-btn--share"
                  onClick={async () => {
                    await shareOrderForm();
                  }}
                  disabled={isSharing}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" fill="currentColor"/>
                  </svg>
                  <span>{t('Share', 'مشاركة', 'Compartir')}</span>
                </button>
              </div>
            </div>
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
                {t('Required field: Customer Name', 'الحقل المطلوب: اسم العميل', 'Campo obligatorio: Nombre del cliente')}
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


