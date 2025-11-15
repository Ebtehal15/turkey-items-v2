import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  bulkUploadClasses,
  createClass,
  deleteAllClasses,
  deleteClass,
  generateSpecialId,
  updateClass,
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
import { fetchColumnVisibility, updateColumnVisibility } from '../api/settings';
import useTranslate from '../hooks/useTranslate';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

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
  prefix: '',
  classVideoUrl: '',
  deleteVideo: false,
};

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
  const [bulkReport, setBulkReport] = useState<BulkUploadResult | null>(null);
  const [updateOnly, setUpdateOnly] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<'video' | 'price' | 'arabic' | 'english' | null>(null);

  const queryClient = useQueryClient();
  const { data: classes = [], isLoading, error } = useClasses(filters);
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

  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    classes.forEach((item) => {
      if (item.mainCategory) {
        set.add(item.mainCategory);
      }
    });
    return Array.from(set).sort();
  }, [classes]);

  const groups = useMemo<string[]>(() => {
    const set = new Set<string>();
    classes.forEach((item) => {
      if (item.quality) {
        set.add(item.quality);
      }
    });
    return Array.from(set).sort();
  }, [classes]);

  const totalVideos = useMemo(() => classes.filter((item) => item.classVideo).length, [classes]);

  const missingVideoClasses = useMemo(() => classes.filter((item) => !item.classVideo), [classes]);
  const classesWithoutPrice = useMemo(() => classes.filter((item) => item.classPrice === null || item.classPrice === undefined), [classes]);
  const classesWithoutArabic = useMemo(() => classes.filter((item) => !item.classNameArabic || item.classNameArabic.trim() === ''), [classes]);
  const classesWithoutEnglish = useMemo(() => classes.filter((item) => !item.classNameEnglish || item.classNameEnglish.trim() === ''), [classes]);
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

  return (
    <section className="panel">
      <header className="panel__header">
        <div className="panel__header-content">
          <h1>{t('Admin Panel', 'لوحة الإدارة', 'Panel de Administración')}</h1>
          <p>{t('Manage product classes, upload media, and keep the catalog up to date.', 'إدارة أصناف المنتجات، وتحميل الوسائط، والحفاظ على الكتالوج محدثاً.', 'Administra los productos, sube contenido multimedia y mantiene el catálogo actualizado.')}</p>
        </div>
        <div className="panel__header-actions">
          <button type="button" onClick={handleAddClick}>
            {t('+ Add Class', '+ إضافة صنف', '+ Añadir Producto')}
          </button>
          <button type="button" className="secondary" onClick={revoke}>
            {t('Sign Out', 'تسجيل الخروج', 'Cerrar sesión')}
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
        <form className="card form" onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>{selectedClass ? t('Edit Class', 'تعديل الصنف', 'Editar producto') : t('Add New Class', 'إضافة صنف جديد', 'Agregar producto')}</h2>
            <button
              type="button"
              onClick={() => resetForm(true)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#64748b',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b';
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label={t('Close form', 'إغلاق النموذج', 'Cerrar formulario')}
              title={t('Close', 'إغلاق', 'Cerrar')}
            >
              ×
            </button>
          </div>

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

          <label>
            {t('Class Name*', 'اسم الصنف*', 'Nombre del producto*')}
            <input
              type="text"
              name="className"
              value={formState.className}
              onChange={handleInputChange}
              required
            />
          </label>

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

          <label>
            {t('Class Features', 'مميزات الصنف', 'Características del producto')}
            <textarea
              name="classFeatures"
              value={formState.classFeatures}
              onChange={handleInputChange}
              rows={4}
            />
          </label>

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
          </label>

          <div className="form__actions">
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
          <div className="admin-stat">
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
        </div>
        {missingVideoClasses.length > 0 && expandedPanel === 'video' && (
          <div className="admin-stats__missing admin-stats__missing--expanded">
            <div className="admin-stats__toggle">
              <span>
                {t('Classes without video', 'أصناف بلا فيديو', 'Productos sin video')}
                {' '}
                ({missingVideoClasses.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
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
                      {(() => {
                        if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
                        if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
                        return item.className;
                      })()}
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
            <div className="admin-stats__toggle">
              <span>
                {t('Classes without price', 'أصناف بلا سعر', 'Productos sin precio')}
                {' '}
                ({classesWithoutPrice.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
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
                      {(() => {
                        if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
                        if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
                        return item.className;
                      })()}
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
            <div className="admin-stats__toggle">
              <span>
                {t('Classes without Arabic translation', 'أصناف بلا ترجمة عربية', 'Productos sin traducción árabe')}
                {' '}
                ({classesWithoutArabic.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
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
                      {item.className}
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
            <div className="admin-stats__toggle">
              <span>
                {t('Classes without English translation', 'أصناف بلا ترجمة إنجليزية', 'Productos sin traducción inglesa')}
                {' '}
                ({classesWithoutEnglish.length})
              </span>
              <span aria-hidden="true">−</span>
            </div>
            <div className="admin-stats__missing-panel">
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
                      {language === 'ar' && item.classNameArabic ? item.classNameArabic : item.className}
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
                {t('Search', 'بحث', 'Buscar')}
                <input
                  type="search"
                  name="search"
                  value={filters.search ?? ''}
                  onChange={handleFilterChange}
                  placeholder={t('Search by ID or class name', 'ابحث بالرمز أو اسم الصنف', 'Buscar por ID o nombre del producto')}
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
                <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] })}>
                  {t('Refresh', 'تحديث', 'Actualizar')}
                </button>
              </div>
            </div>
            <div className="table-card__controls">
              <details className="column-switcher">
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
                        <button type="button" onClick={() => handleEdit(item)}>
                          {t('Edit', 'تعديل', 'Editar')}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                        >
                          {t('Delete', 'حذف', 'Eliminar')}
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
              'Upload an Excel file with columns: Special ID, Main Category, Group, Class Name, Class Name Arabic, Class Name English, Class Features, Class Price, Class KG, Class Video.',
              'قم برفع ملف إكسل يحتوي على الأعمدة: الرمز الخاص، الفئة الرئيسية، المجموعة، اسم الصنف، اسم الصنف بالعربية، اسم الصنف بالإنجليزية، مميزات الصنف، سعر الصنف، وزن الصنف (كجم)، فيديو الصنف.',
              'Carga un archivo Excel con las columnas: ID especial, categoría principal, grupo, nombre del producto, nombre en árabe, nombre en inglés, características del producto, precio, peso (kg), video del producto.',
            )}
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelChange}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', cursor: 'pointer' }}>
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
          <button type="submit" disabled={!excelFile || actionInProgress}>
            {t('Upload Excel', 'رفع ملف إكسل', 'Subir Excel')}
          </button>
        </form>

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
      </div>
    </section>
  );
};

export default AdminPanel;

