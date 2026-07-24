import { useState } from "react";
import {
  Package,
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Layers,
  X,
  CheckSquare,
  Square,
  Printer,
  ChevronDown,
  ChevronUp,
  Boxes,
} from "lucide-react";
import {
  useListProducts,
  useGetProduct,
  useListCategories,
  useListBrands,
  useListColors,
  useListSizes,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useCreateCategory,
  useCreateBrand,
  useCreateColor,
  useCreateSize,
  useListWarehouses,
  useGetStoreSettings,
  ApiError,
  type Product,
  type ProductVariant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { BarcodeLabelPrintModal } from "@/components/barcode-label-print-modal";

const PAGE_SIZE = 10;
const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

function money(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.edit");
  const canDelete = hasPermission("products.delete");
  const canManage = canEdit || canDelete;

  const settingsQuery = useGetStoreSettings();
  const storeName = settingsQuery.data?.storeName;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [managingVariants, setManagingVariants] = useState<Product | null>(null);
  // State for the quick "Print Barcode" button on the product table row
  const [printBarcodeProduct, setPrintBarcodeProduct] = useState<Product | null>(null);

  const categoriesQuery = useListCategories({ includeInactive: false });
  const brandsQuery = useListBrands({ includeInactive: false });
  const productsQuery = useListProducts({
    page,
    pageSize: PAGE_SIZE,
    search: appliedSearch || undefined,
    categoryId: categoryId || undefined,
    brandId: brandId || undefined,
    includeInactive,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
  };

  const totalPages = productsQuery.data
    ? Math.max(Math.ceil(productsQuery.data.total / PAGE_SIZE), 1)
    : 1;

  function applySearch() {
    setPage(1);
    setAppliedSearch(search.trim());
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="المنتجات"
          subtitle="إدارة المنتجات والتنويعات والأسعار"
          icon={<Package size={24} />}
          action={
            canCreate ? (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-add-product"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">منتج جديد</span>
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="بحث بالاسم أو رمز الصنف أو الباركود..."
              className={inputClass}
              style={{ paddingRight: "2.5rem" }}
              data-testid="input-product-search"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => {
              setPage(1);
              setCategoryId(e.target.value);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium text-slate-700"
            data-testid="select-filter-category"
          >
            <option value="">كل الفئات</option>
            {(categoriesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={brandId}
            onChange={(e) => {
              setPage(1);
              setBrandId(e.target.value);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium text-slate-700"
            data-testid="select-filter-brand"
          >
            <option value="">كل الماركات</option>
            {(brandsQuery.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 px-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setPage(1);
                setIncludeInactive(e.target.checked);
              }}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-include-inactive"
            />
            عرض المعطّلة
          </label>
          <button
            onClick={applySearch}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
            data-testid="button-product-search"
          >
            بحث
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {productsQuery.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : productsQuery.isError ? (
            <p className="text-red-500 text-center py-16">تعذّر تحميل المنتجات.</p>
          ) : productsQuery.data && productsQuery.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-6 py-4">المنتج</th>
                    <th className="text-right font-bold px-6 py-4">الفئة / الماركة</th>
                    <th className="text-center font-bold px-6 py-4">التنويعات</th>
                    <th className="text-right font-bold px-6 py-4">السعر</th>
                    <th className="text-center font-bold px-6 py-4">المخزون</th>
                    <th className="text-left font-bold px-6 py-4">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productsQuery.data.items.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50 ${!p.isActive ? "opacity-60" : ""}`}
                      data-testid={`row-product-${p.id}`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{p.name}</p>
                        {p.nameEn && (
                          <p className="text-xs text-slate-400">{p.nameEn}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700">
                          {p.categoryName ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.brandName ?? "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600 font-bold">
                        {p.variantCount ?? 0}
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">
                        {money(p.basePrice)}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-700">
                        {p.totalStock ?? 0}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setManagingVariants(p)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition"
                            title="التنويعات"
                            data-testid={`button-variants-${p.id}`}
                          >
                            <Layers size={16} />
                          </button>
                          {/* Quick Print Barcode button — opens BarcodeLabelPrintModal directly */}
                          <button
                            onClick={() => setPrintBarcodeProduct(p)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 transition"
                            title="طباعة باركود"
                            data-testid={`button-print-barcode-${p.id}`}
                          >
                            <Printer size={16} />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setEditing(p)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                              title="تعديل"
                              data-testid={`button-edit-product-${p.id}`}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleting(p)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                              title="حذف"
                              data-testid={`button-delete-product-${p.id}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-16">لا توجد منتجات.</p>
          )}

          {productsQuery.data && productsQuery.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {productsQuery.data.total} منتج
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-products-prev"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-products-next"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ProductWizardModal
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteProductModal
          product={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            invalidate();
            setDeleting(null);
          }}
        />
      )}

      {managingVariants && (
        <VariantsModal
          product={managingVariants}
          canEdit={canEdit}
          storeName={storeName}
          onClose={() => setManagingVariants(null)}
          onChanged={invalidate}
        />
      )}

      {/* Quick product-level barcode print — fetches variants then opens modal */}
      {printBarcodeProduct && (
        <ProductBarcodePrintLoader
          product={printBarcodeProduct}
          storeName={storeName}
          onClose={() => setPrintBarcodeProduct(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ProductBarcodePrintLoader
// Fetches product variants, then opens BarcodeLabelPrintModal.
// Used by the "Print Barcode" button on each product table row.
// ══════════════════════════════════════════════════════════════════════════════

function ProductBarcodePrintLoader({
  product,
  storeName,
  onClose,
}: {
  product: Product;
  storeName?: string | null;
  onClose: () => void;
}) {
  const detailQuery = useGetProduct(product.id);
  const variants = detailQuery.data?.variants ?? [];

  if (detailQuery.isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-xl">
          <Loader2 className="animate-spin text-amber-500" size={22} />
          <span className="font-bold text-slate-700">جارٍ تحميل البيانات...</span>
        </div>
      </div>
    );
  }

  const mappedVariants = variants.map((v) => ({
    id: v.id,
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    colorName: v.colorName,
    sizeName: v.sizeName,
    shortId: (v as any).shortId,
    sellingPrice: v.sellingPrice != null ? String(v.sellingPrice) : String(product.basePrice),
  }));

  if (mappedVariants.length === 0 || !mappedVariants[0].barcode) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
          <p className="font-bold text-slate-700 text-center mb-4">
            لا يوجد باركود مسجّل لهذا المنتج.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700"
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  return (
    <BarcodeLabelPrintModal
      open
      onClose={onClose}
      storeName={storeName}
      productName={product.name}
      variants={mappedVariants}
      currency="ج.م"
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// QuickAddField — inline create for catalog items (Category, Brand, Color, Size)
// ══════════════════════════════════════════════════════════════════════════════

function QuickAddField({
  label,
  required,
  value,
  onChange,
  options,
  onQuickAdd,
  testId,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; name: string }[];
  onQuickAdd: (name: string) => Promise<string>; // returns new id
  testId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!newName.trim()) return;
    setPending(true);
    try {
      const id = await onQuickAdd(newName.trim());
      onChange(id);
      setNewName("");
      setAdding(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-2">
        <select
          className={`flex-1 ${inputClass}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        >
          <option value="" disabled>اختر...</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="p-2.5 rounded-xl border border-dashed border-amber-400 text-amber-600 hover:bg-amber-50 transition"
          title={`إضافة ${label} جديد`}
        >
          {adding ? <ChevronUp size={16} /> : <Plus size={16} />}
        </button>
      </div>
      {adding && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            className={`flex-1 ${inputClass} py-2 text-sm`}
            placeholder={`اسم ${label} الجديد...`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setAdding(false); }}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !newName.trim()}
            className="px-3 py-2 bg-amber-500 text-slate-900 rounded-xl text-sm font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center gap-1"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            إضافة
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ProductWizardModal — 3-step wizard replacing old ProductFormModal
// ══════════════════════════════════════════════════════════════════════════════

type VariantRow = {
  colorId: string;
  colorName: string;
  sizeId: string;
  sizeName: string;
  sellingPrice: string;
  costPrice: string;
  openingQty: string; // for opening stock tab
};

function ProductWizardModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasPermission } = useAuth();
  const isEdit = Boolean(product);
  const canSetStock = hasPermission("inventory.manage");

  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const categoriesQuery = useListCategories({ includeInactive: false });
  const brandsQuery = useListBrands({ includeInactive: false });
  const colorsQuery = useListColors({ includeInactive: false });
  const sizesQuery = useListSizes({ includeInactive: false });
  const warehousesQuery = useListWarehouses();
  const createCategory = useCreateCategory();
  const createBrand = useCreateBrand();
  const createColor = useCreateColor();
  const createSize = useCreateSize();

  // ── Step state ─────────────────────────────────────────────
  const STEPS = isEdit ? ["معلومات المنتج"] : ["المعلومات الأساسية", "التنويعات", "المخزون الافتتاحي"];
  const [step, setStep] = useState(0);

  // ── Step 1: Basic Info ──────────────────────────────────────
  const [name, setName] = useState(product?.name ?? "");
  const [nameEn, setNameEn] = useState(product?.nameEn ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [basePrice, setBasePrice] = useState(product ? String(product.basePrice) : "0");
  const [baseCostPrice, setBaseCostPrice] = useState(product ? String(product.baseCostPrice) : "0");
  const [reorderPoint, setReorderPoint] = useState(product ? String(product.reorderPoint) : "0");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);

  // ── Step 2: Variants Matrix ────────────────────────────────
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, { selling: string; cost: string }>>({});

  // ── Step 3: Opening Stock ──────────────────────────────────
  const [openingWarehouseId, setOpeningWarehouseId] = useState("");
  const [openingQtys, setOpeningQtys] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const colors = colorsQuery.data ?? [];
  const sizes = sizesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const brands = brandsQuery.data ?? [];

  // All (color,size) combinations selected
  const variantKeys: { colorId: string; colorName: string; sizeId: string; sizeName: string }[] = [];
  for (const cId of selectedColors) {
    for (const sId of selectedSizes) {
      const c = colors.find((x) => x.id === cId);
      const s = sizes.find((x) => x.id === sId);
      if (c && s) variantKeys.push({ colorId: cId, colorName: c.name, sizeId: sId, sizeName: s.name });
    }
  }

  function toggleColor(id: string) {
    setSelectedColors((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleSize(id: string) {
    setSelectedSizes((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function variantKey(colorId: string, sizeId: string) { return `${colorId}:${sizeId}`; }

  function validateStep0(): string | null {
    if (!name.trim()) return "اسم المنتج مطلوب.";
    if (!categoryId) return "يجب اختيار فئة.";
    return null;
  }

  async function handleSaveEdit() {
    const err = validateStep0();
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      await updateProduct.mutateAsync({
        id: product!.id,
        data: {
          name: name.trim(), nameEn: nameEn.trim() || null,
          categoryId, brandId: brandId || null,
          description: description.trim() || null,
          basePrice: Number(basePrice) || 0,
          baseCostPrice: Number(baseCostPrice) || 0,
          reorderPoint: Number(reorderPoint) || 0,
          isActive,
        },
      });
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e, "تعذّر حفظ المنتج."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    setError(null);
    setSubmitting(true);
    try {
      // Build seed variants with opening stock
      const variants = variantKeys.map((vk) => {
        const key = variantKey(vk.colorId, vk.sizeId);
        const prices = variantPrices[key];
        const qty = Number(openingQtys[key] ?? 0);
        const stockEntry = qty > 0 && openingWarehouseId
          ? [{ warehouseId: openingWarehouseId, quantity: qty }]
          : [];
        return {
          colorId: vk.colorId,
          sizeId: vk.sizeId,
          sellingPrice: prices?.selling ? Number(prices.selling) : null,
          costPrice: prices?.cost ? Number(prices.cost) : null,
          openingStock: stockEntry,
        };
      });

      await createProduct.mutateAsync({
        data: {
          name: name.trim(), nameEn: nameEn.trim() || null,
          categoryId, brandId: brandId || null,
          description: description.trim() || null,
          basePrice: Number(basePrice) || 0,
          baseCostPrice: Number(baseCostPrice) || 0,
          reorderPoint: Number(reorderPoint) || 0,
          variants: variants.length > 0 ? variants : undefined,
        },
      });
      // Invalidate warehouse/inventory data too if stock was set
      if (variantKeys.some((vk) => Number(openingQtys[variantKey(vk.colorId, vk.sizeId)] ?? 0) > 0)) {
        void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      }
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e, "تعذّر إنشاء المنتج."));
    } finally {
      setSubmitting(false);
    }
  }

  function nextStep() {
    setError(null);
    if (step === 0) {
      const err = validateStep0();
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  }

  const refreshCatalog = () => {
    // Invalidate all catalog lookups and immediately refetch mounted queries
    // so newly created categories/brands/colors/sizes appear in dropdowns instantly
    for (const prefix of ["/api/catalog/categories", "/api/catalog/brands", "/api/catalog/colors", "/api/catalog/sizes"]) {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith(prefix);
        },
        refetchType: "all",
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "تعديل المنتج" : "منتج جديد"}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Step indicator (creation only) */}
        {!isEdit && (
          <div className="flex items-center gap-0 mb-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-black transition ${
                  i < step ? "bg-emerald-500 text-white" :
                  i === step ? "bg-amber-500 text-slate-900" :
                  "bg-slate-200 text-slate-500"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`mr-2 text-xs font-bold truncate ${
                  i === step ? "text-amber-600" : "text-slate-400"
                }`}>{s}</span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded ${
                    i < step ? "bg-emerald-400" : "bg-slate-200"
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── STEP 0: Basic Info ─── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">اسم المنتج <span className="text-red-500">*</span></label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-product-name" placeholder="مثال: حذاء رياضي نايكي" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">الاسم بالإنجليزية</label>
                <input className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-testid="input-product-nameEn" placeholder="Nike Running Shoe" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">الوصف</label>
                <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف اختياري..." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <QuickAddField
                label="الفئة" required value={categoryId} onChange={setCategoryId} options={categories}
                testId="select-product-category"
                onQuickAdd={async (n) => {
                  const res = await createCategory.mutateAsync({ data: { name: n } });
                  refreshCatalog();
                  return res.id;
                }}
              />
              <QuickAddField
                label="الماركة" value={brandId} onChange={setBrandId} options={brands}
                testId="select-product-brand"
                onQuickAdd={async (n) => {
                  const res = await createBrand.mutateAsync({ data: { name: n } });
                  refreshCatalog();
                  return res.id;
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">سعر البيع</label>
                <input type="number" min={0} step="0.01" className={inputClass} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} data-testid="input-product-price" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">سعر التكلفة</label>
                <input type="number" min={0} step="0.01" className={inputClass} value={baseCostPrice} onChange={(e) => setBaseCostPrice(e.target.value)} data-testid="input-product-cost" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">حد إعادة الطلب</label>
                <input type="number" min={0} className={inputClass} value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} data-testid="input-product-reorder" />
              </div>
            </div>
            {isEdit && (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-amber-500" data-testid="checkbox-product-active" />
                منتج نشط
              </label>
            )}
          </div>
        )}

        {/* ─── STEP 1: Variants Matrix ─── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Colors */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-slate-700">الألوان</label>
                  <QuickAddField
                    label="" value="" onChange={() => {}} options={[]}
                    onQuickAdd={async (n) => {
                      const res = await createColor.mutateAsync({ data: { name: n } });
                      refreshCatalog();
                      setSelectedColors((p) => [...p, res.id]);
                      return res.id;
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[64px]">
                  {colors.map((c) => {
                    const sel = selectedColors.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleColor(c.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition ${
                          sel ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {sel ? <CheckSquare size={14} /> : <Square size={14} />}
                        {c.name}
                      </button>
                    );
                  })}
                  {colors.length === 0 && <p className="text-slate-400 text-xs">لا توجد ألوان. أضف واحداً ↑</p>}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-slate-700">المقاسات</label>
                  <QuickAddField
                    label="" value="" onChange={() => {}} options={[]}
                    onQuickAdd={async (n) => {
                      const res = await createSize.mutateAsync({ data: { name: n } });
                      refreshCatalog();
                      setSelectedSizes((p) => [...p, res.id]);
                      return res.id;
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[64px]">
                  {sizes.map((s) => {
                    const sel = selectedSizes.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggleSize(s.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition ${
                          sel ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {sel ? <CheckSquare size={14} /> : <Square size={14} />}
                        {s.name}
                      </button>
                    );
                  })}
                  {sizes.length === 0 && <p className="text-slate-400 text-xs">لا توجد مقاسات. أضف واحداً ↑</p>}
                </div>
              </div>
            </div>

            {/* Variant price overrides */}
            {variantKeys.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  التنويعات المحددة ({variantKeys.length}) — أسعار خاصة (اختياري)
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-right font-bold px-4 py-2">اللون / المقاس</th>
                        <th className="text-right font-bold px-3 py-2">سعر البيع</th>
                        <th className="text-right font-bold px-3 py-2">سعر التكلفة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {variantKeys.map((vk) => {
                        const key = variantKey(vk.colorId, vk.sizeId);
                        const prices = variantPrices[key] ?? { selling: "", cost: "" };
                        return (
                          <tr key={key}>
                            <td className="px-4 py-1.5 font-bold text-slate-700">{vk.colorName} / {vk.sizeName}</td>
                            <td className="px-3 py-1.5">
                              <input type="number" min={0} step="0.01" placeholder={basePrice || "سعر المنتج"}
                                className="w-full px-2 py-1 text-sm rounded-lg border border-slate-200 focus:border-amber-500 outline-none"
                                value={prices.selling}
                                onChange={(e) => setVariantPrices((p) => ({ ...p, [key]: { ...prices, selling: e.target.value } }))}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input type="number" min={0} step="0.01" placeholder={baseCostPrice || "سعر التكلفة"}
                                className="w-full px-2 py-1 text-sm rounded-lg border border-slate-200 focus:border-amber-500 outline-none"
                                value={prices.cost}
                                onChange={(e) => setVariantPrices((p) => ({ ...p, [key]: { ...prices, cost: e.target.value } }))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {variantKeys.length === 0 && (
              <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3 text-center">
                اختر ألواناً ومقاسات لإنشاء التنويعات تلقائياً
              </p>
            )}
          </div>
        )}

        {/* ─── STEP 2: Opening Stock ─── */}
        {step === 2 && (
          <div className="space-y-4">
            {!canSetStock ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
                ليس لديك صلاحية إدارة المخزون. يمكنك تخطي هذه الخطوة وإضافة المخزون لاحقاً من صفحة المخزون.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">المخزن <span className="text-red-500">*</span></label>
                  <select
                    className={inputClass}
                    value={openingWarehouseId}
                    onChange={(e) => setOpeningWarehouseId(e.target.value)}
                  >
                    <option value="">اختر مخزناً (يمكن تخطيه)</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                {variantKeys.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-right font-bold px-4 py-2.5">التنويع</th>
                          <th className="text-right font-bold px-4 py-2.5">الكمية الافتتاحية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {variantKeys.map((vk) => {
                          const key = variantKey(vk.colorId, vk.sizeId);
                          return (
                            <tr key={key}>
                              <td className="px-4 py-2 font-bold text-slate-700">{vk.colorName} / {vk.sizeName}</td>
                              <td className="px-4 py-2">
                                <input
                                  type="number" min={0} step={1}
                                  className="w-32 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-amber-500 outline-none"
                                  value={openingQtys[key] ?? ""}
                                  onChange={(e) => setOpeningQtys((p) => ({ ...p, [key]: e.target.value }))}
                                  placeholder="0"
                                  disabled={!openingWarehouseId}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3 text-center">
                    لم تحدد أي تنويعات في الخطوة السابقة. يمكنك تخطي هذه الخطوة.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100" data-testid="text-product-form-error">
            {error}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2">
            <X size={16} /> {step === 0 ? "إلغاء" : "رجوع"}
          </button>
          {step > 0 && !isEdit && (
            <button onClick={() => { setError(null); setStep((s) => s - 1); }}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition">
              ← السابق
            </button>
          )}
          {(isEdit || step === STEPS.length - 1) ? (
            <button
              onClick={() => void (isEdit ? handleSaveEdit() : handleCreate())}
              disabled={submitting}
              className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="button-save-product"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              {isEdit ? "حفظ التعديلات" : "إنشاء المنتج"}
            </button>
          ) : (
            <button onClick={nextStep}
              className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2">
              التالي →
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DeleteProductModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteProduct();
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: product.id });
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف المنتج."));
    }
  }

  return (
    <Modal open onClose={onClose} title="تأكيد الحذف">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل تريد حذف المنتج{" "}
          <span className="font-bold text-slate-800">{product.name}</span>؟ سيتم
          تعطيله مع تنويعاته.
        </p>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handle()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-confirm-delete-product"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}

function VariantsModal({
  product,
  canEdit,
  storeName,
  onClose,
  onChanged,
}: {
  product: Product;
  storeName?: string | null;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const detailQuery = useGetProduct(product.id);
  const colorsQuery = useListColors({ includeInactive: false });
  const sizesQuery = useListSizes({ includeInactive: false });
  const createVariant = useCreateVariant();
  const deleteVariant = useDeleteVariant();

  const [colorId, setColorId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [printVariant, setPrintVariant] = useState<ProductVariant | null>(null);

  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    onChanged();
  };

  async function handleAdd() {
    setError(null);
    if (!colorId) return setError("اختر لوناً.");
    if (!sizeId) return setError("اختر مقاساً.");
    try {
      await createVariant.mutateAsync({
        id: product.id,
        data: { colorId, sizeId, sellingPrice: sellingPrice ? Number(sellingPrice) : null },
      });
      setColorId(""); setSizeId(""); setSellingPrice("");
      invalidateDetail();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إضافة التنويع."));
    }
  }

  async function handleDelete(variantId: string) {
    setError(null);
    try {
      await deleteVariant.mutateAsync({ id: variantId });
      invalidateDetail();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف التنويع."));
    }
  }

  const variants = detailQuery.data?.variants ?? [];

  return (
    <>
      <Modal open onClose={onClose} title={`تنويعات: ${product.name}`} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {canEdit && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
              <label className="block text-sm font-bold text-slate-700">إضافة تنويع جديد</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select className={inputClass} value={colorId} onChange={(e) => setColorId(e.target.value)} data-testid="select-variant-color">
                  <option value="">اللون</option>
                  {(colorsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className={inputClass} value={sizeId} onChange={(e) => setSizeId(e.target.value)} data-testid="select-variant-size">
                  <option value="">المقاس</option>
                  {(sizesQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input type="number" min={0} step="0.01" className={inputClass} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="سعر خاص (اختياري)" data-testid="input-variant-price" />
              </div>
              <button onClick={() => void handleAdd()} disabled={createVariant.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 text-sm disabled:opacity-60"
                data-testid="button-add-variant"
              >
                {createVariant.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                إضافة
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100" data-testid="text-variant-error">{error}</div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {detailQuery.isLoading ? (
              <p className="text-slate-400 text-center py-8">جارٍ التحميل...</p>
            ) : variants.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-4 py-2.5">اللون / المقاس</th>
                    <th className="text-right font-bold px-4 py-2.5">رمز الصنف</th>
                    <th className="text-right font-bold px-4 py-2.5">الباركود</th>
                    <th className="text-center font-bold px-4 py-2.5">المخزون</th>
                    <th className="px-4 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {variants.map((v: ProductVariant) => (
                    <tr key={v.id} data-testid={`row-variant-${v.id}`}>
                      <td className="px-4 py-2.5 font-bold text-slate-800">
                        {[v.colorName, v.sizeName].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{v.sku}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{v.barcode}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-slate-700">{v.totalStock ?? 0}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPrintVariant(v)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition"
                            title="طباعة باركود"
                            data-testid={`button-print-barcode-${v.id}`}
                          >
                            <Printer size={15} />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => void handleDelete(v.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                              title="حذف التنويع"
                              data-testid={`button-delete-variant-${v.id}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-400 text-center py-8">لا توجد تنويعات بعد.</p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2" data-testid="button-close-variants">
              <X size={16} /> إغلاق
            </button>
          </div>
        </div>
      </Modal>

      {/* Barcode label print modal */}
      {printVariant && (
        <BarcodeLabelPrintModal
          open={Boolean(printVariant)}
          onClose={() => setPrintVariant(null)}
          storeName={storeName}
          productName={product.name}
          variants={[{
            id: printVariant.id,
            sku: printVariant.sku ?? "",
            barcode: printVariant.barcode ?? "",
            colorName: printVariant.colorName,
            sizeName: printVariant.sizeName,
            sellingPrice: printVariant.sellingPrice != null ? String(printVariant.sellingPrice) : String(product.basePrice),
          }]}
          currency="ج.م"
        />
      )}
    </>
  );
}
