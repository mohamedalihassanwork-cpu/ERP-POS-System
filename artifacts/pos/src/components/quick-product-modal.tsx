import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useListCategories,
  useListBrands,
  useListColors,
  useListSizes,
  customFetch,
  ApiError,
  type Product,
  type ProductVariant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/modal";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

export function QuickProductModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (product: Product, variant: ProductVariant) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [colorId, setColorId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const queryClient = useQueryClient();

  const categories = useListCategories({ includeInactive: false }).data ?? [];
  const brands = useListBrands({ includeInactive: false }).data ?? [];
  const colors = useListColors({ includeInactive: false }).data ?? [];
  const sizes = useListSizes({ includeInactive: false }).data ?? [];

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("أدخل اسم المنتج");
    if (!categoryId) return setError("اختر القسم");
    // Both color and size must be provided to create a variant
    if ((colorId && !sizeId) || (!colorId && sizeId)) {
      return setError("يجب اختيار اللون والمقاس معاً، أو تركهما فارغَين");
    }

    setPending(true);
    try {
      // Only include variants array if BOTH colorId AND sizeId are selected.
      // colorId and sizeId are required UUID fields in the API schema — sending
      // empty strings or undefined values causes a Zod validation error.
      const hasVariant = Boolean(colorId && sizeId);

      const productInput: {
        name: string;
        categoryId: string;
        brandId?: string;
        basePrice: number;
        baseCostPrice: number;
        variants?: { colorId: string; sizeId: string; sellingPrice?: number; costPrice?: number }[];
      } = {
        name: name.trim(),
        categoryId,
        brandId: brandId || undefined,
        basePrice: Number(sellingPrice) || 0,
        baseCostPrice: Number(costPrice) || 0,
      };

      if (hasVariant) {
        productInput.variants = [
          {
            colorId,
            sizeId,
            sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
            costPrice: costPrice ? Number(costPrice) : undefined,
          },
        ];
      }

      const res = (await customFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productInput),
      })) as Product & { variants?: ProductVariant[] };

      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      const variant = res.variants?.[0];
      if (!variant) {
        // Product was created without a variant (no color/size selected).
        // Notify the parent with the product only so it can display it in the list,
        // but we cannot add it to the cart without a variant.
        throw new Error(
          "تمت إضافة المنتج بنجاح، لكن يجب اختيار لون ومقاس لإضافته للفاتورة. يمكنك العثور عليه في قائمة المنتجات."
        );
      }

      onCreated(res, variant);
    } catch (err) {
      setError(apiErrorMessage(err, "فشل إضافة الصنف الجديد"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="إضافة صنف جديد (سريع)">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            اسم المنتج <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              القسم <span className="text-red-500">*</span>
            </label>
            <select
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">اختر...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">العلامة التجارية</label>
            <select
              className={inputClass}
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">(بدون)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">سعر التكلفة</label>
            <input
              type="number"
              className={inputClass}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">سعر البيع</label>
            <input
              type="number"
              className={inputClass}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">اللون</label>
            <select
              className={inputClass}
              value={colorId}
              onChange={(e) => setColorId(e.target.value)}
            >
              <option value="">(بدون)</option>
              {colors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">المقاس</label>
            <select
              className={inputClass}
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
            >
              <option value="">(بدون)</option>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>


        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={pending}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {pending && <Loader2 size={18} className="animate-spin" />}
            إضافة الصنف للفاتورة
          </button>
        </div>
      </div>
    </Modal>
  );
}
