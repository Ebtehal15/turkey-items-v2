import { useEffect, useMemo, useState, useRef } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  bulkUploadClasses,
  bulkReplaceClasses,
  createClass,
  deleteAllClasses,
  deleteClass,
  generateSpecialId,
  updateClass,
  syncFromGoogleSheets,
  fetchPriceHistory,
  fetchRecentPriceChanges,
  type PriceHistoryItem,
  type PriceChangeItem,
} from '../api/classes';
import { CLASSES_QUERY_KEY, useClasses } from '../hooks/useClasses';
import type { BulkUploadResult, ClassFilters, ClassRecord, ColumnVisibility, ColumnKey } from '../types';
import VideoPreview from '../components/VideoPreview';
import { useAdminAccess } from '../context/AdminAccessContext';
import {
  columnOptions,
  defaultColumnVisibility,
  buildColumnLabels,
  orderedColumns,
} from '../constants/columns';
import { fetchColumnVisibility, updateColumnVisibility, fetchGoogleSheetsSettings, updateGoogleSheetsSettings } from '../api/settings';
import useTranslate from '../hooks/useTranslate';
import { deleteOrderFromHistory, type OrderHistoryItem } from '../utils/orderHistory';
import { fetchAllOrders, deleteOrder, type OrderResponse } from '../api/orders';

// Dinamik API base URL - dış IP erişimi için
const getApiBaseUrl = () => {
  // Environment variable varsa onu kullan
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Production'da Render URL'i kullan
  if (import.meta.env.PROD) {
    return 'https://cillii.onrender.com';
  }
  
  // Development'ta dış IP erişimi için sabit IP kullan
  // Dış IP: 192.168.1.204
  const EXTERNAL_IP = '192.168.1.204';
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Eğer localhost değilse, belirtilen dış IP'yi kullan
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${EXTERNAL_IP}:4000`;
    }
  }
  
  // Varsayılan olarak localhost
  return 'http://localhost:4000';
};

const API_BASE_URL = getApiBaseUrl();

const joinBaseUrl = (base: string, path: string) => {
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = path.replace(/^\//, '');
  return `${normalizedBase}/${normalizedPath}`;
};

const resolveVideoSrc = (value?: string | null) => {
  if (!value) {
    return null;
  }
  if (/^(?:https?:)?\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) {
    return value;
  }
  return joinBaseUrl(API_BASE_URL, value);
};

interface FormState {
  specialId: string;
  mainCategory: string;
  quality: string;
  className: string;
  classNameArabic: string;
  classNameEnglish: string;
  classFeatures: string;
  classPrice: string;
  classWeight: string;
  classQuantity: string;
  prefix: string;
  classVideoUrl: string;
  deleteVideo: boolean;
}

const emptyForm: FormState = {
  specialId: '',
  mainCategory: '',
  quality: '',
  className: '',
  classNameArabic: '',
  classNameEnglish: '',
  classFeatures: '',
  classPrice: '',
  classWeight: '',
  classQuantity: '',
  prefix: '',
  classVideoUrl: '',
  deleteVideo: false,
};

type BulkReplaceField = 'mainCategory' | 'quality' | 'className' | 'classNameArabic' | 'classNameEnglish';

const AdminPanel = () => {
  const [filters, setFilters] = useState<ClassFilters>({});
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [selectedClass, setSelectedClass] = useState<ClassRecord | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const [bulkReport, setBulkReport] = useState<BulkUploadResult | null>(null);
  const [updateOnly, setUpdateOnly] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<'video' | 'price' | 'arabic' | 'english' | 'name' | 'withVideo' | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [bulkReplaceField, setBulkReplaceField] = useState<BulkReplaceField>('quality');
  const [bulkReplaceSearch, setBulkReplaceSearch] = useState('');
  const [bulkReplaceValue, setBulkReplaceValue] = useState('');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  const [googleSheetsAutoSync, setGoogleSheetsAutoSync] = useState(false);
  const [showGoogleSheets, setShowGoogleSheets] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('showGoogleSheets');
      return saved === 'true';
    }
    return false;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [priceHistoryModal, setPriceHistoryModal] = useState<{ classId: number; className: string } | null>(null);
  const [showPriceChanges, setShowPriceChanges] = useState(false);

  const queryClient = useQueryClient();
  const { data: allClasses = [] } = useClasses({ includeZeroQuantity: true });
  const { data: classes = [], isLoading, error } = useClasses({ ...filters, includeZeroQuantity: true });
  const { language, t } = useTranslate();
  const sanitizedVideoInput = formState.classVideoUrl.trim();
  const effectiveVideoPath = sanitizedVideoInput.length > 0
    ? sanitizedVideoInput
    : (selectedClass?.classVideo ?? null);
  const copyableVideoUrl = resolveVideoSrc(effectiveVideoPath);
  const formatNumber = (value: number | null | undefined, suffix = '') => {
    if (value === null || value === undefined) {
      return '—';
    }
    const formatted = Number.isInteger(value)
      ? value.toFixed(0)
      : value.toFixed(2).replace(/\.?0+$/, '');
    return suffix ? `${formatted} ${suffix}` : formatted;
  };

  const columnLabels = useMemo(
    () => buildColumnLabels(language),
    [language],
  );
  const columnOptionsWithLabels = useMemo(
    () => columnOptions.map(({ key }) => ({ key, label: columnLabels[key] })),
    [columnLabels],
  );
  const { revoke } = useAdminAccess();
  const columnVisibilityQuery = useQuery({
    queryKey: ['columnVisibility'],
    queryFn: fetchColumnVisibility,
    initialData: defaultColumnVisibility,
  });
  const columnVisibility = columnVisibilityQuery.data ?? defaultColumnVisibility;
  const columnVisibilityMutation = useMutation<ColumnVisibility, AxiosError<{ message?: string; error?: string }>, ColumnVisibility>({
    mutationFn: updateColumnVisibility,
    onSuccess: (data) => {
      queryClient.setQueryData(['columnVisibility'], data);
      queryClient.invalidateQueries({ queryKey: ['columnVisibility'] });
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
    },
  });

  useEffect(() => () => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
  }, [videoPreview]);

  // Load order history from backend
  const { data: backendOrders = [], isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery<OrderResponse[]>({
    queryKey: ['allOrders'],
    queryFn: () => fetchAllOrders(500),
  });

  // Convert backend orders to OrderHistoryItem format for compatibility
  useEffect(() => {
    const convertedOrders: OrderHistoryItem[] = backendOrders.map((order) => {
      // Ensure items is always an array
      let items = order.items;
      if (!items) {
        console.warn('⚠️ Order', order.orderId, 'has no items field. totalItems:', order.totalItems);
        items = [];
      } else if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
          console.log('✅ Parsed items for order', order.orderId, ':', items.length, 'items');
        } catch (e) {
          console.error('❌ Failed to parse items JSON for order', order.orderId, ':', e, 'Raw items:', items);
          items = [];
        }
      } else if (!Array.isArray(items)) {
        console.warn('⚠️ Items is not an array for order', order.orderId, ':', items, 'Type:', typeof items);
        items = [];
      } else {
        console.log('✅ Order', order.orderId, 'has', items.length, 'items (already array)');
      }
      
      // Check for inconsistency
      if (items.length === 0 && order.totalItems > 0) {
        console.error('🚨 INCONSISTENCY: Order', order.orderId, 'has totalItems:', order.totalItems, 'but items array is empty!');
      }
      
      return {
        orderId: order.orderId,
        createdAt: order.createdAt,
        customerInfo: order.customerInfo,
        items: items,
        knownTotal: order.knownTotal,
        totalItems: order.totalItems,
        hasUnknownPrices: order.hasUnknownPrices,
        language: order.language,
      };
    });
    setOrderHistory(convertedOrders);
  }, [backendOrders]);

  // Load Google Sheets settings
  const googleSheetsQuery = useQuery({
    queryKey: ['googleSheetsSettings'],
    queryFn: fetchGoogleSheetsSettings,
    refetchInterval: 60000, // Refetch settings every minute to check for auto-sync changes
  });

  // Update state when query data changes
  useEffect(() => {
    if (googleSheetsQuery.data) {
      setGoogleSheetsUrl(googleSheetsQuery.data.url);
      setGoogleSheetsAutoSync(googleSheetsQuery.data.autoSync);
    }
  }, [googleSheetsQuery.data]);

  // Save showGoogleSheets state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('showGoogleSheets', String(showGoogleSheets));
    }
  }, [showGoogleSheets]);

  const googleSheetsMutation = useMutation({
    mutationFn: updateGoogleSheetsSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleSheetsSettings'] });
      setFeedback(t('Google Sheets settings saved successfully.', 'تم حفظ إعدادات Google Sheets بنجاح.', 'Configuración de Google Sheets guardada exitosamente.'));
    },
    onError: (error: AxiosError<{ message?: string; error?: string }>) => {
      setErrorFeedback(extractErrorMessage(error));
    },
  });

  const syncFromSheetsMutation = useMutation({
    mutationFn: ({ url, updateOnly }: { url: string; updateOnly: boolean }) => syncFromGoogleSheets(url, updateOnly),
    onSuccess: (data) => {
      setBulkReport(data);
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(
        t(
          `Sync completed: ${data.processedCount} processed, ${data.skippedCount} skipped.`,
          `اكتمل المزامنة: ${data.processedCount} معالج، ${data.skippedCount} تم تخطيه.`,
          `Sincronización completada: ${data.processedCount} procesados, ${data.skippedCount} omitidos.`
        )
      );
      setIsSyncing(false);
    },
    onError: (error: AxiosError<{ message?: string; error?: string }>) => {
      setErrorFeedback(extractErrorMessage(error));
      setIsSyncing(false);
    },
  });

  // Auto-sync from Google Sheets every 5 minutes if enabled
  useEffect(() => {
    if (!googleSheetsAutoSync || !googleSheetsUrl.trim()) {
      return;
    }

    // Sync function
    const performSync = () => {
      if (!syncFromSheetsMutation.isPending && !isSyncing) {
        setIsSyncing(true);
        syncFromSheetsMutation.mutate(
          {
            url: googleSheetsUrl,
            updateOnly: false,
          },
          {
            onSettled: () => {
              setIsSyncing(false);
            },
          }
        );
      }
    };

    // Perform initial sync immediately when auto-sync is enabled
    performSync();

    // Then sync every 5 minutes
    const interval = setInterval(performSync, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [googleSheetsAutoSync, googleSheetsUrl, syncFromSheetsMutation, isSyncing]);

  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    allClasses.forEach((item) => {
      if (item.mainCategory) {
        set.add(item.mainCategory);
      }
    });
    return Array.from(set).sort();
  }, [allClasses]);

  const groups = useMemo<string[]>(() => {
    const set = new Set<string>();
    allClasses.forEach((item) => {
      if (item.quality) {
        set.add(item.quality);
      }
    });
    return Array.from(set).sort();
  }, [allClasses]);

  const totalVideos = useMemo(() => classes.filter((item) => item.classVideo).length, [classes]);
  const classesWithVideo = useMemo(() => classes.filter((item) => item.classVideo), [classes]);

  const missingVideoClasses = useMemo(() => classes.filter((item) => !item.classVideo), [classes]);
  const classesWithoutPrice = useMemo(
    () => classes.filter((item) => item.classPrice === null || item.classPrice === undefined),
    [classes],
  );
  const classesWithoutArabic = useMemo(
    () => classes.filter((item) => !item.classNameArabic || item.classNameArabic.trim() === ''),
    [classes],
  );
  const classesWithoutEnglish = useMemo(
    () => classes.filter((item) => !item.classNameEnglish || item.classNameEnglish.trim() === ''),
    [classes],
  );
  const classesWithoutName = useMemo(
    () => classes.filter((item) => !item.className || item.className.trim() === ''),
    [classes],
  );

  const getDisplayNameForLanguage = (item: ClassRecord) => {
    if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
    if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
    return item.className;
  };

  const handleCopyClassListAsText = (items: ClassRecord[]) => {
    if (!items.length) return;

    const text = items
      .map((item) => item.specialId)
      .join('\n');

    // Best-effort copy; ignore failures silently
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        // ignore
      });
    }
  };

  const handleCopyClassesWithoutPriceAsText = () => {
    handleCopyClassListAsText(classesWithoutPrice);
  };
  const activeColumnCount = useMemo(
    () => Object.values(columnVisibility).filter(Boolean).length,
    [columnVisibility],
  );
  const orderedVisibleColumns = useMemo(
    () => orderedColumns.filter((key) => columnVisibility[key]),
    [columnVisibility],
  );
  const isUpdatingColumns = columnVisibilityMutation.isPending;

  const handleToggleColumn = (key: ColumnKey) => {
    const nextValue = !columnVisibility[key];
    if (!nextValue && activeColumnCount <= 1) {
      return;
    }
    const updated: ColumnVisibility = { ...columnVisibility, [key]: nextValue };
    columnVisibilityMutation.mutate(updated);
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const previewUrl = URL.createObjectURL(file);
      if (videoPreview) {
        URL.revokeObjectURL(videoPreview);
      }
      setVideoPreview(previewUrl);
      setFormState((prev) => ({
        ...prev,
        classVideoUrl: '',
        deleteVideo: false,
      }));
    } else {
      setVideoFile(null);
      if (videoPreview) {
        URL.revokeObjectURL(videoPreview);
        setVideoPreview(null);
      }
    }
  };

  const handleExcelChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setExcelFile(file ?? null);
  };

  const extractErrorMessage = (error: AxiosError<{ message?: string; error?: string }>) => (
    error.response?.data?.error
    || error.response?.data?.message
    || error.message
  );

  const handleEdit = (record: ClassRecord) => {
    setSelectedClass(record);
    setFormState({
      specialId: record.specialId ?? '',
      mainCategory: record.mainCategory ?? '',
      quality: record.quality ?? '',
      className: record.className ?? '',
      classNameArabic: record.classNameArabic ?? '',
      classNameEnglish: record.classNameEnglish ?? '',
      classFeatures: record.classFeatures ?? '',
      classPrice: record.classPrice !== null && record.classPrice !== undefined
        ? String(record.classPrice)
        : '',
      classWeight: record.classWeight !== null && record.classWeight !== undefined
        ? String(record.classWeight)
        : '',
      classQuantity: record.classQuantity !== null && record.classQuantity !== undefined
        ? String(record.classQuantity)
        : '',
      prefix: '',
      classVideoUrl: record.classVideo ?? '',
      deleteVideo: false,
    });
    setVideoFile(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    setIsFormVisible(true);
  };

  const handleAddClick = async () => {
    resetForm();
    setIsFormVisible(true);
    try {
      const nextId = await generateSpecialId();
      setFormState((prev: FormState) => ({
        ...prev,
        specialId: nextId,
      }));
      setFeedback(t(`Generated next ID ${nextId}.`, `تم إنشاء المعرف التالي ${nextId}.`));
      setErrorFeedback(null);
    } catch (idError) {
      if (idError instanceof Error) {
        setErrorFeedback(idError.message);
      } else {
        setErrorFeedback(t('Failed to generate a new ID.', 'تعذر إنشاء معرف جديد.', 'No se pudo generar un nuevo ID.'));
      }
    }
  };

  const resetForm = (hideForm = false) => {
    setFormState(emptyForm);
    setSelectedClass(null);
    setVideoFile(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    if (hideForm) {
      setIsFormVisible(false);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormState((prev: FormState) => ({
      ...prev,
      [name]: value,
      ...(name === 'classVideoUrl' && { deleteVideo: false }),
    }));
  };

  const handleFilterChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters((prev: ClassFilters) => ({
      ...prev,
      [name]: value || undefined,
    }));
  };

  const buildFormData = () => {
    const data = new FormData();
    data.append('specialId', formState.specialId);
    data.append('mainCategory', formState.mainCategory);
    data.append('quality', formState.quality);
    data.append('className', formState.className);
    data.append('classNameArabic', formState.classNameArabic);
    data.append('classNameEnglish', formState.classNameEnglish);
    data.append('classFeatures', formState.classFeatures);
    data.append('classPrice', formState.classPrice);
    data.append('classWeight', formState.classWeight);
    data.append('classQuantity', formState.classQuantity);
    if (formState.deleteVideo) {
      data.append('classVideoUrl', '__DELETE__');
    } else if (sanitizedVideoInput.length > 0) {
      data.append('classVideoUrl', sanitizedVideoInput);
    }
    if (videoFile) {
      data.append('classVideo', videoFile);
    }
    return data;
  };

  const createMutation = useMutation<ClassRecord, AxiosError<{ message?: string; error?: string }>, FormData>({
    mutationFn: createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(t('Class created successfully.', 'تم إنشاء الصنف بنجاح.', 'Producto creado correctamente.'));
      setErrorFeedback(null);
      resetForm(true);
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
    },
  });

  const updateMutation = useMutation<ClassRecord, AxiosError<{ message?: string; error?: string }>, { id: number; data: FormData }>({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => updateClass(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(t('Class updated successfully.', 'تم تحديث الصنف بنجاح.', 'Producto actualizado correctamente.'));
      setErrorFeedback(null);
      resetForm(true);
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
    },
  });

  const deleteMutation = useMutation<void, AxiosError<{ message?: string; error?: string }>, number>({
    mutationFn: deleteClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(t('Class deleted successfully.', 'تم حذف الصنف بنجاح.', 'Producto eliminado correctamente.'));
      setErrorFeedback(null);
      setBulkReport(null);
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
    },
  });

  const deleteAllMutation = useMutation<{ deletedCount: number }, AxiosError<{ message?: string; error?: string }>, void>({
    mutationFn: deleteAllClasses,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(t(`Deleted ${result.deletedCount} class(es).`, `تم حذف ${result.deletedCount} صنف/أصناف.`));
      setErrorFeedback(null);
      setBulkReport(null);
      resetForm(true);
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
    },
  });

  const bulkUploadMutation = useMutation<BulkUploadResult, AxiosError<{ message?: string; error?: string }>, FormData>({
    mutationFn: bulkUploadClasses,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      setFeedback(`Bulk upload completed. Imported ${result.processedCount}, skipped ${result.skippedCount}.`);
      setErrorFeedback(null);
      setExcelFile(null);
      setBulkReport(result);
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
      setBulkReport(null);
    },
  });

  const bulkReplaceMutation = useMutation<{ updatedCount: number }, AxiosError<{ message?: string; error?: string }>, { field: BulkReplaceField; search: string; replace: string }>({
    mutationFn: bulkReplaceClasses,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] });
      const message = t(
        `Updated ${result.updatedCount} records.`,
        `تم تحديث ${result.updatedCount} من السجلات.`,
        `Se actualizaron ${result.updatedCount} registros.`,
      );
      setFeedback(message);
      setErrorFeedback(null);
      setBulkReplaceSearch('');
      setBulkReplaceValue('');
    },
    onError: (mutationError) => {
      setErrorFeedback(extractErrorMessage(mutationError));
      setFeedback(null);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setErrorFeedback(null);

    const data = buildFormData();

    if (selectedClass) {
      updateMutation.mutate({ id: selectedClass.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (record: ClassRecord) => {
    const localizedName = (() => {
      if (language === 'ar' && record.classNameArabic) return record.classNameArabic;
      if (language === 'en' && record.classNameEnglish) return record.classNameEnglish;
      return record.className;
    })();
    const message = language === 'ar'
      ? `حذف ${localizedName}؟ لا يمكن التراجع عن هذا الإجراء.`
      : `Delete ${localizedName}? This action cannot be undone.`;
    if (window.confirm(message)) {
      deleteMutation.mutate(record.id);
    }
  };

  const handleDeleteAll = () => {
    if (!classes.length) {
      setErrorFeedback(t('There are no classes to delete.', 'لا توجد أصناف لحذفها.', 'No hay productos para eliminar.'));
      return;
    }
    const message = t(
      'Delete ALL classes? This will permanently remove every record and any uploaded videos.',
      'هل تريد حذف جميع الأصناف؟ سيؤدي ذلك إلى إزالة كل السجلات وأي مقاطع فيديو مرفوعة نهائياً.',
    );
    if (window.confirm(message)) {
      deleteAllMutation.mutate();
    }
  };

  const handleGenerateId = async () => {
    try {
      const nextId = await generateSpecialId(formState.prefix || undefined);
      setFormState((prev: FormState) => ({
        ...prev,
        specialId: nextId,
      }));
      setFeedback(t(`Generated ID ${nextId}. Remember to save.`, `تم إنشاء المعرف ${nextId}. لا تنس الحفظ.`));
      setErrorFeedback(null);
    } catch (generationError) {
      if (generationError instanceof Error) {
        setErrorFeedback(generationError.message);
      } else {
        setErrorFeedback(t('Failed to generate special ID.', 'تعذر إنشاء معرف خاص.', 'No se pudo generar un ID especial.'));
      }
      setFeedback(null);
    }
  };

  const handleBulkUpload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBulkReport(null);
    if (!excelFile) {
      setErrorFeedback(t('Please select an Excel file to upload.', 'يرجى اختيار ملف إكسل للتحميل.', 'Selecciona un archivo Excel para cargarlo.'));
      return;
    }
    const data = new FormData();
    data.append('file', excelFile);
    data.append('updateOnly', updateOnly ? 'true' : 'false');
    bulkUploadMutation.mutate(data);
  };

  const actionInProgress = createMutation.isPending
    || updateMutation.isPending
    || deleteMutation.isPending
    || bulkUploadMutation.isPending
    || deleteAllMutation.isPending;

  const exportToExcel = () => {
    const exportData = classes.map((item) => ({
      'Special ID': item.specialId,
      'Main Category': item.mainCategory,
      'Group': item.quality,
      'Class Name': item.className,
      'Class Name Arabic': item.classNameArabic || '',
      'Class Name English': item.classNameEnglish || '',
      'Class Features': item.classFeatures || '',
      'Class Price': item.classPrice ?? '',
      'Class Weight (kg)': item.classWeight ?? '',
      'Class Quantity': item.classQuantity ?? '',
      'Class Video': item.classVideo || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Classes');
    
    const fileName = `classes_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };


  const formatCurrency = (value: number) => {
    if (Number.isNaN(value)) {
      return '—';
    }
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const generateHistoryOrderPdf = async (entry: OrderHistoryItem): Promise<Blob> => {
    const now = new Date(entry.createdAt);
    // Türkiye saatine göre formatla
    const formattedDate = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const formattedTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    const entryLanguage = entry.language || language;

    const htmlContent = `
      <div style="
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 30px;
        max-width: 750px;
        margin: 0 auto;
        direction: ${entryLanguage === 'ar' ? 'rtl' : 'ltr'};
        text-align: ${entryLanguage === 'ar' ? 'right' : 'left'};
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
          <div style="text-align: center;">
            <h1 style="
              font-size: 18px;
              margin: 0 0 4px 0;
              color: #0f172a;
              font-weight: bold;
            ">${t('Order Form', 'نموذج الطلب', 'Formulario de pedido')}</h1>
            <p style="
              margin: 0;
              color: #0f172a;
              font-size: 11px;
              font-weight: 600;
            ">${t('Order ID', 'رقم الطلب', 'ID de Pedido')}: ${entry.orderId}</p>
          </div>
          <div style="
            color: #0f172a;
            font-size: 10px;
            font-weight: bold;
          ">
            ${formattedDate} - ${formattedTime}
          </div>
        </div>
        
        <div style="margin-bottom: 20px;">
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Customer Name', 'اسم العميل', 'Nombre del cliente')}:</strong> ${entry.customerInfo.fullName}</p>
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Company', 'الشركة', 'Empresa')}:</strong> ${entry.customerInfo.company || t('N/A', 'غير متوفر', 'No disponible')}</p>
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Phone', 'الهاتف', 'Teléfono')}:</strong> ${entry.customerInfo.phone || t('N/A', 'غير متوفر', 'No disponible')}</p>
          <p style="margin: 4px 0; font-size: 10px;"><strong>${t('Sales Person', 'مندوب المبيعات', 'Vendedor')}:</strong> ${entry.customerInfo.salesPerson || t('N/A', 'غير متوفر', 'No disponible')}</p>
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
                <th style="padding: 10px 8px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Code', 'الرمز', 'Código')}</th>
                <th style="padding: 10px 8px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Group', 'المجموعة', 'Grupo')}</th>
                <th style="padding: 10px 8px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 13px; font-weight: bold;">${t('Product Name', 'اسم المنتج', 'Nombre del producto')}</th>
                <th style="padding: 10px 8px; text-align: center; font-size: 13px; font-weight: bold;">${t('Quantity', 'الكمية', 'Cantidad')}</th>
                <th style="padding: 10px 8px; text-align: ${entryLanguage === 'ar' ? 'left' : 'right'}; font-size: 13px; font-weight: bold;">${t('Unit Price', 'سعر الوحدة', 'Precio unitario')}</th>
                <th style="padding: 10px 8px; text-align: ${entryLanguage === 'ar' ? 'left' : 'right'}; font-size: 13px; font-weight: bold;">${t('Subtotal', 'الإجمالي الفرعي', 'Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              ${(entry.items || []).map((item, index) => {
                const name = (() => {
                  if (entryLanguage === 'ar' && item.classNameArabic) return item.classNameArabic;
                  if (entryLanguage === 'en' && item.classNameEnglish) return item.classNameEnglish;
                  return item.className;
                })();
                const unitPrice = item.classPrice ?? 0;
                const subtotal = item.classPrice ? item.classPrice * item.quantity : 0;
                return `
                  <tr style="border-bottom: 1px solid #e5e7eb; ${index % 2 === 0 ? 'background: #f9fafb;' : 'background: white;'}">
                    <td style="padding: 8px 10px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${item.specialId}</td>
                    <td style="padding: 8px 10px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${item.quality || t('N/A', 'غير متوفر', 'No disponible')}</td>
                    <td style="padding: 8px 10px; text-align: ${entryLanguage === 'ar' ? 'right' : 'left'}; font-size: 12px;">${name}</td>
                    <td style="padding: 8px 10px; text-align: center; font-size: 12px;">${item.quantity}</td>
                    <td style="padding: 8px 10px; text-align: ${entryLanguage === 'ar' ? 'left' : 'right'}; font-size: 12px;">
                      ${item.classPrice !== null && item.classPrice !== undefined
                        ? `$${formatCurrency(unitPrice)}`
                        : t('Contact for price', 'السعر عند الطلب', 'Precio bajo consulta')}
                    </td>
                    <td style="padding: 8px 10px; text-align: ${entryLanguage === 'ar' ? 'left' : 'right'}; font-size: 12px;">
                      ${item.classPrice !== null && item.classPrice !== undefined
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
            <strong style="font-size: 12px; color: #059669;">$${formatCurrency(entry.knownTotal)}</strong>
          </div>
          <p style="font-size: 10px; color: #0f172a; margin: 0;"><strong>${t('Total items', 'إجمالي العناصر', 'Total de artículos')}:</strong> ${entry.totalItems}</p>
          ${entry.hasUnknownPrices ? `
            <p style="color: #d97706; margin-top: 8px; font-size: 9px; margin-bottom: 0;">
              ${t('Some prices require confirmation. Totals are estimates.', 'بعض الأسعار تتطلب تأكيداً. الإجمالي تقديري.', 'Algunos precios requieren confirmación. Los totales son estimados.')}
            </p>
          ` : ''}
        </div>
      </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '800px';
    tempDiv.style.backgroundColor = '#f8fafc';
    tempDiv.style.padding = '20px';
    document.body.appendChild(tempDiv);

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

    document.body.removeChild(tempDiv);

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

    return pdf.output('blob');
  };

  const handleOpenOrderPdf = async (entry: OrderHistoryItem) => {
    try {
      const blob = await generateHistoryOrderPdf(entry);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate PDF', error);
      setErrorFeedback(t('Failed to generate PDF. Please try again.', 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.', 'No se pudo generar el PDF. Inténtalo de nuevo.'));
    }
  };

  const handleShareOrderPdf = async (entry: OrderHistoryItem) => {
    try {
      const blob = await generateHistoryOrderPdf(entry);
      const fileName = `order-form-${entry.orderId}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('Order Form', 'نموذج الطلب', 'Formulario de pedido'),
          text: t('Order Form', 'نموذج الطلب', 'Formulario de pedido') + ` - ${entry.customerInfo.fullName}`,
        });
      } else {
        setErrorFeedback(
          t(
            'Share feature is not available on this device.',
            'ميزة المشاركة غير متاحة على هذا الجهاز.',
            'La función de compartir no está disponible en este dispositivo.',
          ),
        );
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        // eslint-disable-next-line no-console
        console.error('Failed to share PDF', error);
        setErrorFeedback(
          t(
            'Failed to share PDF. Please try again.',
            'تعذر مشاركة ملف PDF. يرجى المحاولة مرة أخرى.',
            'No se pudo compartir el PDF. Inténtalo de nuevo.',
          ),
        );
      }
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    const message = t(
      'Delete this order? This action cannot be undone.',
      'حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.',
      '¿Eliminar este pedido? Esta acción no se puede deshacer.',
    );
    if (window.confirm(message)) {
      try {
        // Backend'den sil
        await deleteOrder(orderId);
        // LocalStorage'dan da sil (eğer varsa)
        deleteOrderFromHistory(orderId);
        // Listeyi yenile
        await refetchOrders();
        setFeedback(t('Order deleted successfully.', 'تم حذف الطلب بنجاح.', 'Pedido eliminado exitosamente.'));
      } catch (error) {
        setErrorFeedback(t('Failed to delete order.', 'تعذر حذف الطلب.', 'No se pudo eliminar el pedido.'));
      }
    }
  };

  const exportSingleOrderToExcel = (entry: OrderHistoryItem) => {
    const createdDate = new Date(entry.createdAt);
    // Türkiye saatine göre formatla
    const formattedDate = createdDate.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const entryLanguage = entry.language || language;

    // Tek sheet, tek tablo: Order ID | Date | Code | Group | Product Name | Quantity | Unit Price | Subtotal
    const rows = (entry.items || []).map((item) => {
      const name = (() => {
        if (entryLanguage === 'ar' && item.classNameArabic) return item.classNameArabic;
        if (entryLanguage === 'en' && item.classNameEnglish) return item.classNameEnglish;
        return item.className;
      })();

      const unitPrice = item.classPrice ?? 0;
      const subtotal = item.classPrice ? item.classPrice * item.quantity : 0;

      return {
        'Order ID': entry.orderId,
        'Date': formattedDate,
        'Code': item.specialId,
        'Group': item.quality || '',
        'Product Name': name,
        'Quantity': item.quantity,
        'Unit Price': item.classPrice !== null && item.classPrice !== undefined ? unitPrice : '',
        'Subtotal': item.classPrice !== null && item.classPrice !== undefined ? subtotal : '',
      };
    });

    const header = [
      'Order ID',
      'Date',
      'Code',
      'Group',
      'Product Name',
      'Quantity',
      'Unit Price',
      'Subtotal',
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows, { header });
    // Sütun genişlikleri
    worksheet['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
    ];

    // Satır sayısı (header + data)
    const dataRowCount = rows.length;
    const startRow = 2; // 1. satır header

    // Her satır için Subtotal hücresine formül yaz (Quantity * Unit Price)
    for (let i = 0; i < dataRowCount; i += 1) {
      const rowIndex = startRow + i;
      const quantityCell = `F${rowIndex}`;
      const unitPriceCell = `G${rowIndex}`;
      const subtotalCell = `H${rowIndex}`;

      if (!worksheet[subtotalCell]) {
        worksheet[subtotalCell] = { t: 'n', v: 0 };
      }
      worksheet[subtotalCell].f = `${quantityCell}*${unitPriceCell}`;
    }

    // Toplam satırı: H kolonunda SUM formülü
    const totalRowIndex = startRow + dataRowCount;
    const totalLabelCell = `G${totalRowIndex}`;
    const totalValueCell = `H${totalRowIndex}`;

    XLSX.utils.sheet_add_aoa(
      worksheet,
      [[t('Total', 'الإجمالي', 'Total')]],
      { origin: totalLabelCell },
    );

    worksheet[totalValueCell] = {
      t: 'n',
      f: `SUM(H${startRow}:H${startRow + dataRowCount - 1})`,
    };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Order');

    const fileName = `order_${entry.orderId}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportOrderHistoryToExcel = () => {
    if (orderHistory.length === 0) {
      setErrorFeedback(t('No orders to export.', 'لا توجد طلبات للتصدير.', 'No hay pedidos para exportar.'));
      return;
    }

    // Summary Sheet: Her order için özet bilgiler
    const summaryData = orderHistory.map((entry) => {
      const createdDate = new Date(entry.createdAt);
      // Türkiye saatine göre formatla
      return {
        'Order ID': entry.orderId,
        'Date': createdDate.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        'Time': createdDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }),
        'Customer Name': entry.customerInfo.fullName || '',
        'Company': entry.customerInfo.company || '',
        'Phone': entry.customerInfo.phone || '',
        'Sales Person': entry.customerInfo.salesPerson || '',
        'Total Items': entry.totalItems,
        'Total Amount': entry.knownTotal,
        'Has Unknown Prices': entry.hasUnknownPrices ? t('Yes', 'نعم', 'Sí') : t('No', 'لا', 'No'),
      };
    });

    // Details Sheet: Her order'ın ürün detayları
    const detailsData: any[] = [];
    orderHistory.forEach((entry) => {
      (entry.items || []).forEach((item) => {
        const name = (() => {
          const entryLanguage = entry.language || language;
          if (entryLanguage === 'ar' && item.classNameArabic) return item.classNameArabic;
          if (entryLanguage === 'en' && item.classNameEnglish) return item.classNameEnglish;
          return item.className;
        })();
        detailsData.push({
          'Order ID': entry.orderId,
          'Date': new Date(entry.createdAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          'Customer': entry.customerInfo.fullName || '',
          'Product Code': item.specialId,
          'Group': item.quality || '',
          'Product Name': name,
          'Quantity': item.quantity,
          'Unit Price': item.classPrice ?? '',
          'Subtotal': item.classPrice ? item.classPrice * item.quantity : '',
        });
      });
    });

    // Create workbook with two sheets
    const workbook = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, t('Summary', 'ملخص', 'Resumen'));
    
    // Details sheet
    const detailsWorksheet = XLSX.utils.json_to_sheet(detailsData);
    XLSX.utils.book_append_sheet(workbook, detailsWorksheet, t('Details', 'التفاصيل', 'Detalles'));

    // Generate filename with current date
    const fileName = `order_history_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    setFeedback(t('Order history exported to Excel successfully.', 'تم تصدير سجل الطلبات إلى Excel بنجاح.', 'Historial de pedidos exportado a Excel exitosamente.'));
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <div className="panel__header-content">
          <h1>{t('Admin Panel', 'لوحة الإدارة', 'Panel de Administración')}</h1>
          <p>{t('Manage product classes, upload media, and keep the catalog up to date.', 'إدارة أصناف المنتجات، وتحميل الوسائط، والحفاظ على الكتالوج محدثاً.', 'Administra los productos, sube contenido multimedia y mantiene el catálogo actualizado.')}</p>
        </div>
        <div className="panel__header-actions">
          <button type="button" className="admin-icon-btn" onClick={handleAddClick}>
            <span className="admin-icon-btn__icon" aria-hidden="true">＋</span>
            <span className="admin-icon-btn__label">
            {t('+ Add Class', '+ إضافة صنف', '+ Añadir Producto')}
            </span>
          </button>
          <button type="button" className="secondary admin-icon-btn" onClick={revoke}>
            <span className="admin-icon-btn__icon" aria-hidden="true">🚪</span>
            <span className="admin-icon-btn__label">
            {t('Sign Out', 'تسجيل الخروج', 'Cerrar sesión')}
            </span>
          </button>
        </div>
      </header>

      {(feedback || errorFeedback) && (
        <div className="alerts">
          {feedback && <div className="alert alert--success">{feedback}</div>}
          {errorFeedback && <div className="alert alert--error">{errorFeedback}</div>}
        </div>
      )}

      {isFormVisible && (
        <div 
          ref={modalOverlayRef}
          className="form-modal-overlay" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              resetForm(true);
            }
          }}
        >
          <form 
            className="form-modal" 
            onSubmit={handleSubmit} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="form-modal__header">
              <h2>{selectedClass ? t('Edit Class', 'تعديل الصنف', 'Editar producto') : t('Add New Class', 'إضافة صنف جديد', 'Agregar producto')}</h2>
              <button
                type="button"
                onClick={() => resetForm(true)}
                className="form-modal__close"
                aria-label={t('Close form', 'إغلاق النموذج', 'Cerrar formulario')}
                title={t('Close', 'إغلاق', 'Cerrar')}
              >
                ×
              </button>
            </div>
            <div className="form-modal__content">

          <div className="form-section">
            <div className="form-section-title">
              {t('Identification & Category', 'التعريف والفئة', 'Identificación y Categoría')}
            </div>
            <div className="form-row">
              <label>
                {t('Special ID', 'الرمز الخاص', 'ID especial')}
                <input
                  type="text"
                  name="specialId"
                  value={formState.specialId}
                  onChange={handleInputChange}
                  placeholder="CR01"
                />
              </label>

              <label>
                {t('Prefix for Auto ID', 'بادئة المعرف التلقائي', 'Prefijo para ID automático')}
                <div className="input-with-button">
                  <input
                    type="text"
                    name="prefix"
                    value={formState.prefix}
                    onChange={handleInputChange}
                    placeholder="CR"
                    maxLength={4}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateId}
                    disabled={actionInProgress}
                  >
                    {t('Generate', 'توليد', 'Generar')}
                  </button>
                </div>
              </label>
            </div>

            <div className="form-row">
              <label>
                {t('Main Category', 'الفئة الرئيسية', 'Categoría principal')}
                <input
                  type="text"
                  name="mainCategory"
                  value={formState.mainCategory}
                  onChange={handleInputChange}
                />
              </label>

              <label>
                {t('Group', 'المجموعة', 'Grupo')}
                <input
                  type="text"
                  name="quality"
                  value={formState.quality}
                  onChange={handleInputChange}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              {t('Class Names', 'أسماء الصنف', 'Nombres del Producto')}
            </div>
            <label>
              {t('Class Name (Spanish)', 'اسم الصنف (إسباني)', 'Nombre del producto (Español)')}
              <input
                type="text"
                name="className"
                value={formState.className}
                onChange={handleInputChange}
              />
            </label>

            <div className="form-row">
              <label>
                {t('Class Name (Arabic)', 'اسم الصنف (عربي)', 'Nombre en árabe')}
                <input
                  type="text"
                  name="classNameArabic"
                  value={formState.classNameArabic}
                  onChange={handleInputChange}
                  placeholder="اسم الصنف"
                  dir="rtl"
                />
              </label>

              <label>
                {t('Class Name (English)', 'اسم الصنف (إنجليزي)', 'Nombre en inglés')}
                <input
                  type="text"
                  name="classNameEnglish"
                  value={formState.classNameEnglish}
                  onChange={handleInputChange}
                  placeholder="Class Name"
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              {t('Details', 'التفاصيل', 'Detalles')}
            </div>
            <label>
              {t('Class Features', 'مميزات الصنف', 'Características del producto')}
              <textarea
                name="classFeatures"
                value={formState.classFeatures}
                onChange={handleInputChange}
                rows={4}
              />
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              {t('Pricing & Inventory', 'التسعير والمخزون', 'Precios e Inventario')}
            </div>
            <div className="form-row form-row--three">
              <label>
                {t('Class Weight (kg)', 'وزن الصنف (كجم)', 'Peso del producto (kg)')}
                <input
                  type="number"
                  name="classWeight"
                  value={formState.classWeight}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                />
              </label>

              <label>
                {t('Quantity', 'الكمية', 'Cantidad')}
                <input
                  type="number"
                  name="classQuantity"
                  value={formState.classQuantity}
                  onChange={handleInputChange}
                  step="1"
                  min="0"
                />
              </label>

              <label>
                {t('Class Price', 'سعر الصنف', 'Precio del producto')}
                <input
                  type="number"
                  name="classPrice"
                  value={formState.classPrice}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              {t('Media', 'الوسائط', 'Medios')}
            </div>
            <label>
              {t('Class Video', 'فيديو الصنف', 'Video del producto')}
              <input
                type="file"
                name="classVideo"
                accept="video/*"
                onChange={handleVideoChange}
              />
            </label>

            <label>
              {t('Video URL', 'رابط الفيديو', 'URL del video')}
              <div className="input-with-button">
                <input
                  type="text"
                  name="classVideoUrl"
                  value={formState.classVideoUrl}
                  onChange={handleInputChange}
                  placeholder={t('Paste video link or leave empty to use uploaded file', 'ألصق رابط الفيديو أو اتركه فارغًا لاستخدام الملف المرفوع', 'Pega el enlace del video o déjalo vacío para usar el archivo subido')}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (copyableVideoUrl) {
                      navigator.clipboard.writeText(copyableVideoUrl);
                    }
                  }}
                  disabled={!copyableVideoUrl}
                >
                  {t('Copy', 'نسخ', 'Copiar')}
                </button>
              </div>
            </label>
            {copyableVideoUrl && (
              <p className="form__hint">
                {t('Current link:', 'الرابط الحالي:', 'Enlace actual:')}{' '}
                <a href={copyableVideoUrl} target="_blank" rel="noreferrer">
                  {copyableVideoUrl}
                </a>
              </p>
            )}
            {selectedClass && (selectedClass.classVideo || copyableVideoUrl) && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setFormState((prev) => ({
                    ...prev,
                    deleteVideo: !prev.deleteVideo,
                    classVideoUrl: prev.deleteVideo ? (selectedClass.classVideo ?? '') : '',
                  }));
                  setVideoFile(null);
                  if (videoPreview) {
                    URL.revokeObjectURL(videoPreview);
                    setVideoPreview(null);
                  }
                }}
                style={{ marginTop: '0.5rem' }}
              >
                {formState.deleteVideo
                  ? t('Restore Video', 'استعادة الفيديو', 'Restaurar video')
                  : t('Delete Video', 'حذف الفيديو', 'Eliminar video')}
              </button>
            )}
            {formState.deleteVideo && (
              <p className="form__hint" style={{ color: '#ef4444', marginTop: '0.5rem' }}>
                {t('Video will be deleted when you save.', 'سيتم حذف الفيديو عند الحفظ.', 'El video se eliminará al guardar.')}
              </p>
            )}
          </div>

            </div>
            <div className="form-modal__actions">
              <button type="submit" disabled={actionInProgress}>
                {selectedClass ? t('Update Class', 'تحديث الصنف', 'Actualizar producto') : t('Create Class', 'إنشاء الصنف', 'Crear producto')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => resetForm(true)}
                disabled={actionInProgress}
              >
                {t('Cancel', 'إلغاء', 'Cancelar')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card admin-stats">
        <div className="admin-stats__metrics">
          <div className="admin-stat">
            <span>{classes.length}</span>
            <p>{t('Total Classes', 'إجمالي الأصناف', 'Total de Productos')}</p>
          </div>
          <div className="admin-stat">
            <span>{groups.length}</span>
            <p>{t('Groups', 'المجموعات', 'Grupos')}</p>
          </div>
          <div 
            className={`admin-stat ${expandedPanel === 'withVideo' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'withVideo' ? null : 'withVideo')}
          >
            <span>{totalVideos}</span>
            <p>{t('Videos Uploaded', 'عدد مقاطع الفيديو', 'Videos Subidos')}</p>
          </div>
          <div 
            className={`admin-stat admin-stat--warning ${expandedPanel === 'video' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'video' ? null : 'video')}
          >
            <span>{missingVideoClasses.length}</span>
            <p>{t('Missing Videos', 'أصناف بلا فيديو', 'Productos sin Video')}</p>
          </div>
          <div 
            className={`admin-stat admin-stat--warning ${expandedPanel === 'price' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'price' ? null : 'price')}
          >
            <span>{classesWithoutPrice.length}</span>
            <p>{t('Without Price', 'بلا سعر', 'Sin Precio')}</p>
          </div>
          <div 
            className={`admin-stat admin-stat--warning ${expandedPanel === 'arabic' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'arabic' ? null : 'arabic')}
          >
            <span>{classesWithoutArabic.length}</span>
            <p>{t('Without Arabic Translation', 'بلا ترجمة عربية', 'Sin Traducción Árabe')}</p>
          </div>
          <div 
            className={`admin-stat admin-stat--warning ${expandedPanel === 'english' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'english' ? null : 'english')}
          >
            <span>{classesWithoutEnglish.length}</span>
            <p>{t('Without English Translation', 'بلا ترجمة إنجليزية', 'Sin Traducción Inglesa')}</p>
          </div>
          <div 
            className={`admin-stat admin-stat--warning ${expandedPanel === 'name' ? 'admin-stat--active' : ''}`}
            style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            onClick={() => setExpandedPanel(expandedPanel === 'name' ? null : 'name')}
          >
            <span>{classesWithoutName.length}</span>
            <p>{t('Missing Class Name', 'بدون اسم صنف', 'Sin Nombre de Producto')}</p>
          </div>
        </div>
        {classesWithVideo.length > 0 && expandedPanel === 'withVideo' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes with video', 'أصناف مع فيديو', 'Productos con video')}
                {' '}
                ({classesWithVideo.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCopyClassListAsText(classesWithVideo)}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {classesWithVideo.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {getDisplayNameForLanguage(item)}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {missingVideoClasses.length > 0 && expandedPanel === 'video' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes without video', 'أصناف بلا فيديو', 'Productos sin video')}
                {' '}
                ({missingVideoClasses.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCopyClassListAsText(missingVideoClasses)}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {missingVideoClasses.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {getDisplayNameForLanguage(item)}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {classesWithoutPrice.length > 0 && expandedPanel === 'price' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes without price', 'أصناف بلا سعر', 'Productos sin precio')}
                {' '}
                ({classesWithoutPrice.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCopyClassesWithoutPriceAsText}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {classesWithoutPrice.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {getDisplayNameForLanguage(item)}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {classesWithoutArabic.length > 0 && expandedPanel === 'arabic' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes without Arabic translation', 'أصناف بلا ترجمة عربية', 'Productos sin traducción árabe')}
                {' '}
                ({classesWithoutArabic.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCopyClassListAsText(classesWithoutArabic)}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {classesWithoutArabic.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {getDisplayNameForLanguage(item)}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {classesWithoutEnglish.length > 0 && expandedPanel === 'english' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes without English translation', 'أصناف بلا ترجمة إنجليزية', 'Productos sin traducción inglesa')}
                {' '}
                ({classesWithoutEnglish.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCopyClassListAsText(classesWithoutEnglish)}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {classesWithoutEnglish.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {getDisplayNameForLanguage(item)}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {classesWithoutName.length > 0 && expandedPanel === 'name' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div 
              className="admin-stats__toggle"
              onClick={() => setExpandedPanel(null)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {t('Classes without name', 'أصناف بلا اسم', 'Productos sin nombre')}
                {' '}
                ({classesWithoutName.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
              <div className="admin-stats__missing-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCopyClassListAsText(classesWithoutName)}
                  aria-label={t('Copy IDs as text', 'نسخ الأكواد كنص', 'Copiar IDs como texto')}
                >
                  📋
                </button>
              </div>
              <ul>
                {classesWithoutName.map((item) => (
                  <li 
                    key={item.id}
                    onClick={() => {
                      handleEdit(item);
                      setExpandedPanel(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="admin-stats__missing-name">
                      {t('Unnamed class', 'صنف بدون اسم', 'Producto sin nombre')}
                    </span>
                    <span className="admin-stats__missing-id">{item.specialId}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="panel__stack">
        <div className="card table-wrapper">
          <div className="table-card__header">
            <div className="table-card__title">
              <h2>{t('Classes', 'الأصناف', 'Productos')} ({classes.length})</h2>
              <p>{t('Browse and manage all catalog classes from a single view.', 'تصفح جميع الأصناف وقم بإدارتها من مكان واحد.', 'Consulta y gestiona todos los productos desde una sola vista.')}</p>
            </div>
            <div className="table-card__filters">
              <label>
                {t('Class Name', 'اسم الصنف', 'Nombre del producto')}
                <input
                  type="search"
                  name="classNameSearch"
                  value={filters.classNameSearch ?? ''}
                  onChange={handleFilterChange}
                  placeholder={t('Search by class name', 'ابحث باسم الصنف', 'Buscar por nombre del producto')}
                />
              </label>
              <label>
                {t('Code', 'الرمز', 'Código')}
                <input
                  type="search"
                  name="codeSearch"
                  value={filters.codeSearch ?? ''}
                  onChange={handleFilterChange}
                  placeholder={t('Search by code', 'ابحث بالرمز', 'Buscar por código')}
                />
              </label>
              <label>
                {t('Category', 'الفئة', 'Categoría')}
                <select
                  name="category"
                  value={filters.category ?? ''}
                  onChange={handleFilterChange}
                >
                  <option value="">{t('All', 'الكل', 'Todos')}</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
          <label>
            {t('Group', 'المجموعة', 'Grupo')}
            <select
              name="quality"
              value={filters.quality ?? ''}
              onChange={handleFilterChange}
            >
              <option value="">{t('All', 'الكل', 'Todos')}</option>
              {groups.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
              <div className="table-card__filter-actions">
                <button type="button" className="secondary" onClick={handleClearFilters}>
                  {t('Clear Filters', 'إزالة الفلترة', 'Limpiar filtros')}
                </button>
              </div>
            </div>
            <div className="table-card__controls">
              <details className="column-switcher" open>
                <summary>{t('Columns', 'الأعمدة', 'Columnas')}</summary>
                <div className="column-switcher__grid">
                  {columnOptionsWithLabels.map(({ key, label }) => {
                    const disabled = (activeColumnCount <= 1 && columnVisibility[key]) || isUpdatingColumns;
                    return (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={columnVisibility[key]}
                          onChange={() => handleToggleColumn(key)}
                          disabled={disabled}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={exportToExcel}
                  disabled={!classes.length}
                >
                  {t('Export Excel', 'تصدير Excel', 'Exportar Excel')}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={handleDeleteAll}
                  disabled={deleteAllMutation.isPending || !classes.length}
                >
                  {deleteAllMutation.isPending ? t('Deleting…', 'جارٍ الحذف...', 'Eliminando…') : t('Delete All', 'حذف الكل', 'Eliminar todo')}
                </button>
              </div>
            </div>
          </div>

          {isLoading && <p>{t('Loading classes...', 'جاري تحميل الأصناف...', 'Cargando productos...')}</p>}
          {error && <p className="alert alert--error">{t('Failed to load classes.', 'تعذر تحميل الأصناف.', 'No se pudieron cargar los productos.')}</p>}

          {!isLoading && !classes.length && (
            <p>{t('No records yet. Add your first class using the form.', 'لا توجد سجلات بعد. أضف أول صنف باستخدام النموذج.', 'No hay registros aún. Agrega tu primer producto usando el formulario.')}</p>
          )}

          {!isLoading && classes.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {orderedVisibleColumns.map((key) => (
                      <th key={key}>{columnLabels[key]}</th>
                    ))}
                    <th>{t('Actions', 'إجراءات', 'Acciones')}</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((item) => (
                    <tr key={item.id}>
                      {orderedVisibleColumns.map((key) => {
                        const label = columnLabels[key];
                        let content: ReactNode;
                        switch (key) {
                          case 'specialId':
                            content = item.specialId;
                            break;
                          case 'mainCategory':
                            content = item.mainCategory;
                            break;
                          case 'quality':
                            content = item.quality;
                            break;
                          case 'className':
                            if (language === 'ar' && item.classNameArabic) {
                              content = item.classNameArabic;
                            } else if (language === 'en' && item.classNameEnglish) {
                              content = item.classNameEnglish;
                            } else {
                              content = item.className;
                            }
                            break;
                          case 'classNameArabic':
                            content = item.classNameArabic || '-';
                            break;
                          case 'classNameEnglish':
                            content = item.classNameEnglish || '-';
                            break;
                          case 'classFeatures':
                            content = item.classFeatures || t('No features provided yet.', 'لم يتم إضافة المزايا بعد.', 'Aún no se han añadido características.');
                            break;
                          case 'classWeight':
                            content = formatNumber(item.classWeight, 'kg');
                            break;
                          case 'classQuantity':
                            content = item.classQuantity !== null && item.classQuantity !== undefined
                              ? String(item.classQuantity)
                              : '—';
                            break;
                          case 'classPrice':
                            content = item.classPrice !== null && item.classPrice !== undefined
                              ? `$${formatNumber(item.classPrice)}`
                              : t('Price on request', 'السعر عند الطلب', 'Precio a solicitud');
                            break;
                          case 'classVideo':
                            content = (
                              <VideoPreview
                                src={resolveVideoSrc(item.classVideo)}
                                title={(() => {
                                  if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
                                  if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
                                  return item.className;
                                })()}
                                variant="icon"
                              />
                            );
                            break;
                          default:
                            content = '-';
                        }
                        return (
                          <td key={key} data-label={label}>
                            {content}
                          </td>
                        );
                      })}
                      <td className="table__actions" data-label={t('Actions', 'إجراءات', 'Acciones')}>
                        <button type="button" onClick={() => handleEdit(item)} title={t('Edit', 'تعديل', 'Editar')}>
                          <span className="table__actions-icon" aria-hidden="true">✏️</span>
                          <span className="table__actions-label">{t('Edit', 'تعديل', 'Editar')}</span>
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            const localizedName = (() => {
                              if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
                              if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
                              return item.className;
                            })();
                            setPriceHistoryModal({ classId: item.id, className: localizedName });
                          }}
                          title={t('Price History', 'سجل الأسعار', 'Historial de Precios')}
                        >
                          <span className="table__actions-icon" aria-hidden="true">💰</span>
                          <span className="table__actions-label">{t('Price', 'السعر', 'Precio')}</span>
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                          title={t('Delete', 'حذف', 'Eliminar')}
                        >
                          <span className="table__actions-icon" aria-hidden="true">🗑️</span>
                          <span className="table__actions-label">{t('Delete', 'حذف', 'Eliminar')}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="card form" onSubmit={handleBulkUpload}>
          <h2>{t('Bulk Upload', 'رفع جماعي', 'Carga masiva')}</h2>
          <p className="form__hint">
            {t(
              'Upload an Excel file with columns: Special ID, Main Category, Group, Class Name, Class Name Arabic, Class Name English, Class Features, Class Price, Class KG, Class Quantity, Class Video.',
              'قم برفع ملف إكسل يحتوي على الأعمدة: الرمز الخاص، الفئة الرئيسية، المجموعة، اسم الصنف، اسم الصنف بالعربية، اسم الصنف بالإنجليزية، مميزات الصنف، سعر الصنف، وزن الصنف (كجم)، كمية الصنف، فيديو الصنف.',
              'Carga un archivo Excel con las columnas: ID especial, categoría principal, grupo, nombre del producto, nombre en árabe, nombre en inglés, características del producto, precio, peso (kg), cantidad, video del producto.',
            )}
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelChange}
          />
          <label className="bulk-upload__toggle">
            <input
              type="checkbox"
              checked={updateOnly}
              onChange={(e) => setUpdateOnly(e.target.checked)}
            />
            <span>
              {t(
                'Update only existing records (skip new records)',
                'تحديث السجلات الموجودة فقط (تخطي السجلات الجديدة)',
                'Actualizar solo registros existentes (omitir registros nuevos)'
              )}
            </span>
          </label>
          <button
            type="submit"
            className="bulk-upload__submit"
            disabled={!excelFile || actionInProgress}
          >
            {t('Upload Excel', 'رفع ملف إكسل', 'Subir Excel')}
          </button>
        </form>

        <div className="card bulk-replace">
          <h2>{t('Bulk Text Replace', 'استبدال نص جماعي', 'Reemplazo de texto masivo')}</h2>
          <p className="form__hint">
            {t(
              'Quickly normalize names. Example: replace "S - CREAM DUBAI" with "Cream Dubai" in the Group column.',
              'قم بتوحيد الأسماء بسرعة. مثال: استبدل "S - CREAM DUBAI" بـ "Cream Dubai" في عمود المجموعة.',
              'Normaliza nombres rápidamente. Ejemplo: reemplaza "S - CREAM DUBAI" por "Cream Dubai" en la columna Grupo.',
            )}
          </p>
          <div className="bulk-replace__grid">
            <label>
              {t('Field', 'الحقل', 'Campo')}
              <select
                value={bulkReplaceField}
                onChange={(e) => setBulkReplaceField(e.target.value as BulkReplaceField)}
              >
                <option value="mainCategory">{t('Main Category', 'الفئة الرئيسية', 'Categoría principal')}</option>
                <option value="quality">{t('Group', 'المجموعة', 'Grupo')}</option>
                <option value="className">{t('Class Name (Spanish)', 'اسم الصنف (إسباني)', 'Nombre del producto (Español)')}</option>
                <option value="classNameArabic">{t('Class Name (Arabic)', 'اسم الصنف (عربي)', 'Nombre en árabe')}</option>
                <option value="classNameEnglish">{t('Class Name (English)', 'اسم الصنف (إنجليزي)', 'Nombre en inglés')}</option>
              </select>
            </label>
            <label>
              {t('Find text', 'النص المطلوب إيجاده', 'Texto a buscar')}
              <input
                type="text"
                value={bulkReplaceSearch}
                onChange={(e) => setBulkReplaceSearch(e.target.value)}
                placeholder={t('S - CREAM DUBAI', 'S - CREAM DUBAI', 'S - CREAM DUBAI')}
              />
            </label>
            <label>
              {t('Replace with', 'استبدل بـ', 'Reemplazar con')}
              <input
                type="text"
                value={bulkReplaceValue}
                onChange={(e) => setBulkReplaceValue(e.target.value)}
                placeholder={t('Cream Dubai', 'Cream Dubai', 'Cream Dubai')}
              />
            </label>
          </div>
          <div className="bulk-replace__actions">
            <button
              type="button"
              className="secondary"
              disabled={!bulkReplaceSearch || bulkReplaceMutation.isPending}
              onClick={() => {
                if (!bulkReplaceSearch.trim()) {
                  return;
                }
                const confirmed = window.confirm(t(
                  'Apply this replacement to all records? This cannot be undone.',
                  'تطبيق هذا الاستبدال على جميع السجلات؟ لا يمكن التراجع عن ذلك.',
                  '¿Aplicar este reemplazo a todos los registros? No se puede deshacer.',
                ));
                if (!confirmed) return;
                bulkReplaceMutation.mutate({
                  field: bulkReplaceField,
                  search: bulkReplaceSearch,
                  replace: bulkReplaceValue,
                });
              }}
            >
              {bulkReplaceMutation.isPending
                ? t('Replacing…', 'جاري الاستبدال…', 'Reemplazando…')
                : t('Run Replace', 'تنفيذ الاستبدال', 'Ejecutar reemplazo')}
            </button>
          </div>
        </div>

        {bulkReport && (
          <div className="card bulk-report">
            <h3>{t('Bulk Upload Summary', 'ملخص الرفع الجماعي', 'Resumen de la carga masiva')}</h3>
            <p>
              {t('Imported', 'تم استيراد', 'Importados')}{' '}
              <strong>{bulkReport.processedCount}</strong>{' '}
              {t('row(s), skipped', 'سجل، وتم تخطي', 'fila(s); omitidas')}{' '}
              <strong>{bulkReport.skippedCount}</strong>.
            </p>
            {bulkReport.skippedCount > 0 && (
              <>
                <p className="bulk-report__hint">
                  {t('Rows were skipped for the reasons below (showing up to 10). Update your spreadsheet and try again.', 'تم تخطي الصفوف للأسباب الموضحة أدناه (حتى 10 صفوف). حدّث ملف الإكسل وحاول مرة أخرى.', 'Las filas se omitieron por las razones siguientes (mostrando hasta 10). Actualiza tu hoja y vuelve a intentarlo.')}
                </p>
                <ul>
                  {bulkReport.skipped.slice(0, 10).map((entry) => (
                    <li key={entry.index}>
                      <span className="bulk-report__row">
                        {t('Row', 'صف', 'Fila')}
                        {' '}
                        {entry.index}
                      </span>
                      <span className="bulk-report__reason">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
                {bulkReport.skippedCount > 10 && (
                  <p className="bulk-report__hint">
                    {t('…and', 'و', '…y')}{' '}
                    {bulkReport.skippedCount - 10}{' '}
                    {t('more row(s) skipped.', 'صف إضافي تم تخطيه.', 'fila(s) más se omitieron.')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Google Sheets Sync Section */}
        <div className="card">
          <div className="admin-card-header">
            <div className="admin-card-header__content">
              <h2>{t('Google Sheets Sync', 'مزامنة Google Sheets', 'Sincronización de Google Sheets')}</h2>
              <p>{t('Sync your product data from an online Google Sheets document in real-time.', 'قم بمزامنة بيانات المنتجات من مستند Google Sheets عبر الإنترنت في الوقت الفعلي.', 'Sincroniza los datos de tus productos desde un documento de Google Sheets en línea en tiempo real.')}</p>
            </div>
            <div className="admin-card-header__actions">
            <button
              type="button"
                className="secondary admin-icon-btn"
              onClick={() => {
                setShowGoogleSheets(!showGoogleSheets);
                if (!showGoogleSheets) {
                  googleSheetsQuery.refetch();
                }
              }}
            >
                <span className="admin-icon-btn__icon" aria-hidden="true">
                  {showGoogleSheets ? '▲' : '▼'}
                </span>
                <span className="admin-icon-btn__label">
              {showGoogleSheets ? t('Hide', 'إخفاء', 'Ocultar') : t('Show', 'عرض', 'Mostrar')}
                </span>
            </button>
            </div>
          </div>

          {showGoogleSheets && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="google-sheets-url" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  {t('Google Sheets URL', 'رابط Google Sheets', 'URL de Google Sheets')}
                </label>
                <input
                  id="google-sheets-url"
                  type="text"
                  value={googleSheetsUrl}
                  onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }}
                />
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                  {t('Make sure the Google Sheets is set to "Anyone with the link can view".', 'تأكد من أن Google Sheets مضبوط على "أي شخص لديه الرابط يمكنه المشاهدة".', 'Asegúrate de que Google Sheets esté configurado en "Cualquiera con el enlace puede ver".')}
                </p>
              </div>

              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="google-sheets-auto-sync"
                  type="checkbox"
                  checked={googleSheetsAutoSync}
                  onChange={(e) => setGoogleSheetsAutoSync(e.target.checked)}
                />
                <label htmlFor="google-sheets-auto-sync" style={{ cursor: 'pointer' }}>
                  {t('Enable automatic sync (syncs every 5 minutes)', 'تفعيل المزامنة التلقائية (تزامن كل 5 دقائق)', 'Habilitar sincronización automática (sincroniza cada 5 minutos)')}
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    googleSheetsMutation.mutate({
                      url: googleSheetsUrl,
                      autoSync: googleSheetsAutoSync,
                    });
                  }}
                  disabled={googleSheetsMutation.isPending}
                >
                  {googleSheetsMutation.isPending
                    ? t('Saving...', 'جاري الحفظ...', 'Guardando...')
                    : t('Save Settings', 'حفظ الإعدادات', 'Guardar Configuración')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (!googleSheetsUrl.trim()) {
                      setErrorFeedback(t('Please enter a Google Sheets URL first.', 'يرجى إدخال رابط Google Sheets أولاً.', 'Por favor ingresa una URL de Google Sheets primero.'));
                      return;
                    }
                    setIsSyncing(true);
                    syncFromSheetsMutation.mutate({
                      url: googleSheetsUrl,
                      updateOnly,
                    });
                  }}
                  disabled={isSyncing || !googleSheetsUrl.trim() || syncFromSheetsMutation.isPending}
                >
                  {isSyncing || syncFromSheetsMutation.isPending
                    ? t('Syncing...', 'جاري المزامنة...', 'Sincronizando...')
                    : t('Sync Now', 'مزامنة الآن', 'Sincronizar Ahora')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (!googleSheetsUrl.trim()) {
                      setErrorFeedback(t('Please enter a Google Sheets URL first.', 'يرجى إدخال رابط Google Sheets أولاً.', 'Por favor ingresa una URL de Google Sheets primero.'));
                      return;
                    }
                    setIsSyncing(true);
                    syncFromSheetsMutation.mutate({
                      url: googleSheetsUrl,
                      updateOnly: true,
                    });
                  }}
                  disabled={isSyncing || !googleSheetsUrl.trim() || syncFromSheetsMutation.isPending}
                >
                  {isSyncing || syncFromSheetsMutation.isPending
                    ? t('Update Only...', 'تحديث فقط...', 'Solo Actualizar...')
                    : t('Update Existing Only', 'تحديث الموجود فقط', 'Solo Actualizar Existentes')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Price Changes Section */}
        <div className="card">
          <div className="admin-card-header">
            <div className="admin-card-header__content">
              <h2>{t('Recent Price Changes', 'التغييرات الأخيرة في الأسعار', 'Cambios Recientes de Precios')}</h2>
              <p>{t('View all products that have had price changes recently.', 'عرض جميع المنتجات التي تغيرت أسعارها مؤخراً.', 'Ver todos los productos que han tenido cambios de precio recientemente.')}</p>
            </div>
            <div className="admin-card-header__actions">
            <button
              type="button"
                className="secondary admin-icon-btn"
              onClick={() => {
                setShowPriceChanges(!showPriceChanges);
                if (!showPriceChanges) {
                  queryClient.invalidateQueries({ queryKey: ['recentPriceChanges'] });
                }
              }}
            >
                <span className="admin-icon-btn__icon" aria-hidden="true">
                  {showPriceChanges ? '▲' : '▼'}
                </span>
                <span className="admin-icon-btn__label">
              {showPriceChanges ? t('Hide', 'إخفاء', 'Ocultar') : t('Show', 'عرض', 'Mostrar')}
                </span>
            </button>
            </div>
          </div>

          {showPriceChanges && (
            <PriceChangesList />
          )}
        </div>

        {/* Order History Section */}
        <div className="card">
          <div className="admin-card-header">
            <div className="admin-card-header__content">
              <h2>{t('All Orders', 'جميع الطلبات', 'Todos los Pedidos')}</h2>
              <p>{t('View and manage all order forms from all devices.', 'عرض وإدارة جميع نماذج الطلبات من جميع الأجهزة.', 'Ver y gestionar todos los formularios de pedidos de todos los dispositivos.')}</p>
            </div>
            <div className="admin-card-header__actions">
              {showOrderHistory && orderHistory.length > 0 && (
                <button
                  type="button"
                  className="secondary admin-icon-btn"
                  onClick={exportOrderHistoryToExcel}
                >
                  <span className="admin-icon-btn__icon" aria-hidden="true">📊</span>
                  <span className="admin-icon-btn__label">
                  {t('Export Excel', 'تصدير Excel', 'Exportar Excel')}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="secondary admin-icon-btn"
                onClick={async () => {
                  setShowOrderHistory(!showOrderHistory);
                  if (!showOrderHistory) {
                    await refetchOrders();
                  }
                }}
              >
                <span className="admin-icon-btn__icon" aria-hidden="true">
                  {showOrderHistory ? '▲' : '▼'}
                </span>
                <span className="admin-icon-btn__label">
                {showOrderHistory ? t('Hide', 'إخفاء', 'Ocultar') : t('Show', 'عرض', 'Mostrar')}
                </span>
              </button>
            </div>
          </div>

          {showOrderHistory && (
            <>
              {isLoadingOrders ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p>{t('Loading orders...', 'جاري تحميل الطلبات...', 'Cargando pedidos...')}</p>
                </div>
              ) : orderHistory.length === 0 ? (
                <p>{t('No orders found.', 'لا توجد طلبات.', 'No se encontraron pedidos.')}</p>
              ) : (
                <div className="admin-order-history">
                  <ul className="admin-order-history__list">
                    {orderHistory.map((entry) => {
                      const createdDate = new Date(entry.createdAt);
                      // Türkiye saatine göre formatla
                      const dateLabel = `${createdDate.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} ${createdDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}`;
                      return (
                        <li key={entry.orderId} className="admin-order-history__item">
                          <div className="admin-order-history__info">
                            <span className="admin-order-history__id">
                              {t('Order', 'الطلب', 'Pedido')} {entry.orderId}
                            </span>
                            <span className="admin-order-history__meta">
                              {entry.customerInfo.fullName || t('Unknown customer', 'عميل غير معروف', 'Cliente desconocido')} · {dateLabel}
                            </span>
                            <span className="admin-order-history__details">
                              {entry.totalItems} {t('items', 'عنصر', 'artículos')} · ${formatCurrency(entry.knownTotal)}
                            </span>
                          </div>
                          <div className="admin-order-history__actions">
                            <button
                              type="button"
                              className="admin-order-history__btn admin-order-history__btn--open"
                              onClick={() => handleOpenOrderPdf(entry)}
                            >
                              <span className="admin-order-history__btn-icon" aria-hidden="true">
                                <img src="/pdf.png" alt="" className="admin-order-history__btn-icon-img" />
                              </span>
                              <span className="admin-order-history__btn-label">
                              {t('Open PDF', 'فتح PDF', 'Abrir PDF')}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="admin-order-history__btn admin-order-history__btn--share"
                              onClick={() => handleShareOrderPdf(entry)}
                            >
                              <span className="admin-order-history__btn-icon" aria-hidden="true">
                                <img src="/share.png" alt="" className="admin-order-history__btn-icon-img" />
                              </span>
                              <span className="admin-order-history__btn-label">
                              {t('Share', 'مشاركة', 'Compartir')}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="admin-order-history__btn admin-order-history__btn--export"
                              onClick={() => exportSingleOrderToExcel(entry)}
                            >
                              <span className="admin-order-history__btn-icon" aria-hidden="true">
                                <img src="/logoexc.png" alt="" className="admin-order-history__btn-icon-img" />
                              </span>
                              <span className="admin-order-history__btn-label">
                              {t('Export Excel', 'تصدير Excel', 'Exportar Excel')}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="admin-order-history__btn admin-order-history__btn--delete"
                              onClick={() => handleDeleteOrder(entry.orderId)}
                            >
                              <span className="admin-order-history__btn-icon" aria-hidden="true">
                                <img src="/trash.png" alt="" className="admin-order-history__btn-icon-img" />
                              </span>
                              <span className="admin-order-history__btn-label">
                              {t('Delete', 'حذف', 'Eliminar')}
                              </span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Price History Modal */}
      {priceHistoryModal && (
        <PriceHistoryModal
          classId={priceHistoryModal.classId}
          className={priceHistoryModal.className}
          onClose={() => setPriceHistoryModal(null)}
        />
      )}

      {/* Listen for price history open events from PriceChangesList */}
      <PriceHistoryEventListener setPriceHistoryModal={setPriceHistoryModal} />
    </section>
  );
};

// Component to handle price history events
const PriceHistoryEventListener = ({ setPriceHistoryModal }: { setPriceHistoryModal: (modal: { classId: number; className: string } | null) => void }) => {
  useEffect(() => {
    const handleOpenPriceHistory = (event: Event) => {
      const customEvent = event as CustomEvent;
      setPriceHistoryModal({ classId: customEvent.detail.classId, className: customEvent.detail.className });
    };
    window.addEventListener('openPriceHistory', handleOpenPriceHistory);
    return () => {
      window.removeEventListener('openPriceHistory', handleOpenPriceHistory);
    };
  }, [setPriceHistoryModal]);
  return null;
};

// Price History Modal Component
const PriceHistoryModal = ({ classId, className, onClose }: { classId: number; className: string; onClose: () => void }) => {
  const { language, t } = useTranslate();
  const { data: priceHistory = [], isLoading, error } = useQuery<PriceHistoryItem[]>({
    queryKey: ['priceHistory', classId],
    queryFn: () => fetchPriceHistory(classId),
  });

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) {
      return t('N/A', 'غير متوفر', 'N/A');
    }
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Türkiye saatine göre formatla
    return date.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="form-modal-overlay" onClick={onClose}>
      <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="form-modal__header">
          <h2>
            {t('Price History', 'سجل الأسعار', 'Historial de Precios')} - {className}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="form-modal__close"
            aria-label={t('Close', 'إغلاق', 'Cerrar')}
            title={t('Close', 'إغلاق', 'Cerrar')}
          >
            ×
          </button>
        </div>
        <div className="form-modal__content">
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p>{t('Loading price history...', 'جاري تحميل سجل الأسعار...', 'Cargando historial de precios...')}</p>
            </div>
          )}
          {error && (
            <div className="alert alert--error">
              {t('Failed to load price history.', 'تعذر تحميل سجل الأسعار.', 'No se pudo cargar el historial de precios.')}
            </div>
          )}
          {!isLoading && !error && priceHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p>{t('No price history available.', 'لا يوجد سجل أسعار متاح.', 'No hay historial de precios disponible.')}</p>
            </div>
          )}
          {!isLoading && !error && priceHistory.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: 'white' }}>
                    <th style={{ padding: '10px', textAlign: language === 'ar' ? 'right' : 'left', fontSize: '14px' }}>
                      {t('Date', 'التاريخ', 'Fecha')}
                    </th>
                    <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '14px' }}>
                      {t('Old Price', 'السعر القديم', 'Precio Anterior')}
                    </th>
                    <th style={{ padding: '10px', textAlign: 'center', fontSize: '14px' }}>→</th>
                    <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '14px' }}>
                      {t('New Price', 'السعر الجديد', 'Precio Nuevo')}
                    </th>
                    <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '14px' }}>
                      {t('Change', 'التغيير', 'Cambio')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((item, index) => {
                    const oldPrice = item.oldPrice ?? 0;
                    const newPrice = item.newPrice ?? 0;
                    const change = newPrice - oldPrice;
                    const changePercent = oldPrice !== 0 ? ((change / oldPrice) * 100) : 0;
                    const isIncrease = change > 0;
                    const isDecrease = change < 0;

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          background: index % 2 === 0 ? '#f9fafb' : 'white',
                        }}
                      >
                        <td style={{ padding: '10px', fontSize: '13px' }}>{formatDate(item.changedAt)}</td>
                        <td style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '13px' }}>
                          {`$${formatCurrency(item.oldPrice)}`}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', fontSize: '16px' }}>→</td>
                        <td style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '13px', fontWeight: 'bold' }}>
                          {`$${formatCurrency(item.newPrice)}`}
                        </td>
                        <td
                          style={{
                            padding: '10px',
                            textAlign: language === 'ar' ? 'left' : 'right',
                            fontSize: '13px',
                            color: isIncrease ? '#059669' : isDecrease ? '#dc2626' : '#64748b',
                            fontWeight: 'bold',
                          }}
                        >
                          {isIncrease ? '+' : ''}{`$${formatCurrency(change)}`} ({isIncrease ? '+' : ''}{changePercent.toFixed(1)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="form-modal__actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t('Close', 'إغلاق', 'Cerrar')}
          </button>
        </div>
      </div>
    </div>
  );
};

// Price Changes List Component
const PriceChangesList = () => {
  const { language, t } = useTranslate();
  const { data: priceChanges = [], isLoading, error } = useQuery<PriceChangeItem[]>({
    queryKey: ['recentPriceChanges'],
    queryFn: () => fetchRecentPriceChanges(), // No limit - fetch all price changes
  });

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) {
      return t('N/A', 'غير متوفر', 'N/A');
    }
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Türkiye saatine göre formatla
    return date.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>{t('Loading price changes...', 'جاري تحميل تغييرات الأسعار...', 'Cargando cambios de precios...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert--error">
        {t('Failed to load price changes.', 'تعذر تحميل تغييرات الأسعار.', 'No se pudieron cargar los cambios de precios.')}
      </div>
    );
  }

  if (priceChanges.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>{t('No price changes found.', 'لا توجد تغييرات في الأسعار.', 'No se encontraron cambios de precios.')}</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'right' : 'left', fontSize: '13px' }}>
              {t('Date', 'التاريخ', 'Fecha')}
            </th>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'right' : 'left', fontSize: '13px' }}>
              {t('Code', 'الرمز', 'Código')}
            </th>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'right' : 'left', fontSize: '13px' }}>
              {t('Product Name', 'اسم المنتج', 'Nombre del Producto')}
            </th>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '13px' }}>
              {t('Old Price', 'السعر القديم', 'Precio Anterior')}
            </th>
            <th style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>→</th>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '13px' }}>
              {t('New Price', 'السعر الجديد', 'Precio Nuevo')}
            </th>
            <th style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '13px' }}>
              {t('Change', 'التغيير', 'Cambio')}
            </th>
            <th style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>
              {t('Actions', 'إجراءات', 'Acciones')}
            </th>
          </tr>
        </thead>
        <tbody>
          {priceChanges.map((item, index) => {
            const oldPrice = item.oldPrice ?? 0;
            const newPrice = item.newPrice ?? 0;
            const change = newPrice - oldPrice;
            const changePercent = oldPrice !== 0 ? ((change / oldPrice) * 100) : 0;
            const isIncrease = change > 0;
            const isDecrease = change < 0;

            const productName = (() => {
              if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
              if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
              return item.className;
            })();

            return (
              <tr
                key={item.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  background: index % 2 === 0 ? '#f9fafb' : 'white',
                }}
              >
                <td style={{ padding: '10px', fontSize: '12px' }}>{formatDate(item.changedAt)}</td>
                <td style={{ padding: '10px', fontSize: '12px', fontFamily: 'monospace' }}>{item.specialId}</td>
                <td style={{ padding: '10px', fontSize: '12px' }}>{productName}</td>
                <td style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '12px' }}>
                  {`$${formatCurrency(item.oldPrice)}`}
                </td>
                <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px' }}>→</td>
                <td style={{ padding: '10px', textAlign: language === 'ar' ? 'left' : 'right', fontSize: '12px', fontWeight: 'bold' }}>
                  {`$${formatCurrency(item.newPrice)}`}
                </td>
                <td
                  style={{
                    padding: '10px',
                    textAlign: language === 'ar' ? 'left' : 'right',
                    fontSize: '12px',
                    color: isIncrease ? '#059669' : isDecrease ? '#dc2626' : '#64748b',
                    fontWeight: 'bold',
                  }}
                >
                  {isIncrease ? '+' : ''}{`$${formatCurrency(change)}`} ({isIncrease ? '+' : ''}{changePercent.toFixed(1)}%)
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const event = new CustomEvent('openPriceHistory', { 
                        detail: { classId: item.classId, className: productName } 
                      });
                      window.dispatchEvent(event);
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    {t('View History', 'عرض السجل', 'Ver Historial')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPanel;

