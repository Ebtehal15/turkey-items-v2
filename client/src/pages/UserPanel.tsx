import { useMemo, useState, useEffect } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClasses } from '../hooks/useClasses';
import type { ClassFilters, ClassRecord, ColumnVisibility, ColumnKey } from '../types';
import VideoPreview from '../components/VideoPreview';
import { fetchColumnVisibility } from '../api/settings';
import {
  buildColumnLabels,
  defaultColumnVisibility,
  orderedColumns,
} from '../constants/columns';
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

type ViewMode = 'table' | 'cards';

const getInitialViewMode = (): ViewMode => {
  if (typeof window === 'undefined') {
    return 'table';
  }
  // Mobil cihazlar için card görünümü, masaüstü için table görünümü
  return window.innerWidth <= 768 ? 'cards' : 'table';
};

const UserPanel = () => {
  const [filters, setFilters] = useState<ClassFilters>({});
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [userHasSelected, setUserHasSelected] = useState(false);
  const { data: classes = [], isLoading, error } = useClasses(filters);
  const { language, t } = useTranslate();

  // Ekran boyutu değiştiğinde görünümü otomatik güncelle (sadece kullanıcı manuel seçim yapmadıysa)
  useEffect(() => {
    if (userHasSelected) {
      return;
    }

    const handleResize = () => {
      const isMobile = window.innerWidth <= 768;
      const newViewMode: ViewMode = isMobile ? 'cards' : 'table';
      setViewMode(newViewMode);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [userHasSelected]);

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

  const groups = useMemo<string[]>(() => {
    const set = new Set<string>();
    classes.forEach((item) => {
      if (item.quality) {
        set.add(item.quality);
      }
    });
    return Array.from(set).sort();
  }, [classes]);

  const columnVisibilityQuery = useQuery({
    queryKey: ['columnVisibility'],
    queryFn: fetchColumnVisibility,
    initialData: defaultColumnVisibility,
  });
  const columnVisibility: ColumnVisibility = columnVisibilityQuery.data ?? defaultColumnVisibility;
  const visibleColumnKeys = useMemo(
    () => orderedColumns.filter((key) => columnVisibility[key]),
    [columnVisibility],
  );

  const renderCell = (item: ClassRecord, key: ColumnKey): ReactNode => {
    switch (key) {
      case 'specialId':
        return item.specialId;
      case 'mainCategory':
        return item.mainCategory;
      case 'quality':
        return item.quality;
      case 'className':
        if (language === 'ar' && item.classNameArabic) {
          return item.classNameArabic;
        }
        if (language === 'en' && item.classNameEnglish) {
          return item.classNameEnglish;
        }
        return item.className;
      case 'classNameArabic':
        return item.classNameArabic || '—';
      case 'classNameEnglish':
        return item.classNameEnglish || '—';
      case 'classFeatures':
        return item.classFeatures || t('No features provided yet.', 'لم يتم إضافة المزايا بعد.', 'Aún no se han añadido características.');
      case 'classWeight':
        return formatNumber(item.classWeight, 'kg');
      case 'classPrice':
        if (item.classPrice !== null && item.classPrice !== undefined) {
          return `$${formatNumber(item.classPrice)}`;
        }
        return t('Price on request', 'السعر عند الطلب', 'Precio a solicitud');
      case 'classVideo':
        return (
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
      default:
        return '—';
    }
  };

  const handleFilterChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters((prev: ClassFilters) => ({
      ...prev,
      [name]: value || undefined,
    }));
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  return (
    <section className="panel catalog-panel">
      <div className="card catalog-filters">
        <div className="catalog-filters__header">
          <h2>{t('Search & Filters', 'البحث والتصفية', 'Búsqueda y Filtros')}</h2>
          <p>{t('Use flexible filters to focus on the categories and groups that fit the brief.', 'استخدم خيارات التصفية للتركيز على الفئات المناسبة.', 'Utiliza filtros flexibles para enfocarte en las categorías y grupos adecuados.')}</p>
        </div>
        <div className="catalog-filters__grid">
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
        </div>
        <div className="catalog-filters__actions">
          <button type="button" className="secondary" onClick={handleClearFilters}>
            {t('Clear Filters', 'إزالة الفلترة', 'Limpiar filtros')}
          </button>
        </div>
      </div>

      {isLoading && <p>{t('Loading catalog...', 'جاري تحميل الكتالوج...', 'Cargando catálogo...')}</p>}
      {error && <p className="alert alert--error">{t('Failed to load catalog.', 'تعذر تحميل الكتالوج.', 'No se pudo cargar el catálogo.')}</p>}
      {!isLoading && !classes.length && (
        <div className="card">
          <p>{t('No products available yet. Please check back later.', 'لا توجد منتجات حالياً. يرجى العودة لاحقاً.', 'No hay productos disponibles todavía. Vuelve más tarde.')}</p>
        </div>
      )}

      {!isLoading && classes.length > 0 && (
        <div className="card catalog-table">
          <div className="catalog-table__header">
            <div>
              <h2>{t('Available Classes', 'الأصناف المتاحة', 'Productos Disponibles')}</h2>
              <p>{t('High-level overview of every class, organised for quick reference during buyer sessions.', ' نظرة شاملة على جميع الأصناف .', 'Resumen detallado de cada producto, organizado para una consulta rápida durante las sesiones de compra.')}</p>
            </div>
          </div>
          <div className="catalog-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === 'table' ? 'active' : ''}
              aria-pressed={viewMode === 'table'}
              onClick={() => {
                setViewMode('table');
                setUserHasSelected(true);
              }}
            >
              {t('Table', 'جدول', 'Tabla')}
            </button>
            <button
              type="button"
              className={viewMode === 'cards' ? 'active' : ''}
              aria-pressed={viewMode === 'cards'}
              onClick={() => {
                setViewMode('cards');
                setUserHasSelected(true);
              }}
            >
              {t('Cards', 'بطاقات', 'Tarjetas')}
            </button>
          </div>
          {viewMode === 'table' ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {visibleColumnKeys.map((key) => (
                      <th key={key}>{columnLabels[key]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((item: ClassRecord) => (
                    <tr key={item.id}>
                      {visibleColumnKeys.map((key) => (
                        <td key={key}>{renderCell(item, key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="catalog-card-grid">
              {classes.map((item) => (
                <article key={item.id} className="catalog-card">
                  <div className="catalog-card__content">
                    <header className="catalog-card__header">
                      {columnVisibility.specialId && (
                        <span className="catalog-card__id">
                          {renderCell(item, 'specialId')}
                        </span>
                      )}
                      {columnVisibility.className && (
                        <h3>
                          {renderCell(item, 'className') as React.ReactNode}
                        </h3>
                      )}
                      {columnVisibility.quality && (
                        <p>{renderCell(item, 'quality')}</p>
                      )}
                    </header>
                    <dl>
                      {columnVisibility.mainCategory && (
                        <div>
                          <dt>{t('Main Category', 'الفئة الرئيسية', 'Categoría Principal')}</dt>
                          <dd>{renderCell(item, 'mainCategory')}</dd>
                        </div>
                      )}
                      {columnVisibility.classFeatures && (
                        <div>
                          <dt>{t('Features', 'المميزات', 'Características')}</dt>
                          <dd>{renderCell(item, 'classFeatures')}</dd>
                        </div>
                      )}
                      {columnVisibility.classWeight && (
                        <div>
                          <dt>{t('Weight', 'الوزن', 'Peso')}</dt>
                          <dd>{formatNumber(item.classWeight, 'kg')}</dd>
                        </div>
                      )}
                      {columnVisibility.classPrice && (
                        <div>
                          <dt>{t('Price', 'السعر', 'Precio')}</dt>
                          <dd>
                            {item.classPrice !== null && item.classPrice !== undefined
                              ? `$${formatNumber(item.classPrice)}`
                              : t('Price on request', 'السعر عند الطلب', 'Precio a solicitud')}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  {columnVisibility.classVideo && (
                    <div className="catalog-card__video-wrapper">
                      <VideoPreview
                        src={resolveVideoSrc(item.classVideo)}
                        title={(() => {
                          if (language === 'ar' && item.classNameArabic) return item.classNameArabic;
                          if (language === 'en' && item.classNameEnglish) return item.classNameEnglish;
                          return item.className;
                        })()}
                        variant="card"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default UserPanel;

