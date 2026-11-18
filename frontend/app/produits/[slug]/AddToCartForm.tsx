'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import type { Product } from '@/lib/api';

export default function AddToCartForm({ product }: { product: Product }) {
  const { addItem } = useCart();
  const router = useRouter();
  const variants = (product.variants || []).filter((v) => v.is_active);
  const [variantId, setVariantId] = useState<number | null>(variants.find((v) => v.stock > 0)?.id ?? variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = variants.find((v) => v.id === variantId) || null;
  const needsVariant = variants.length > 0;
  const stock = needsVariant ? (variant ? variant.stock : 0) : product.stock;
  const price = parseFloat(variant && variant.price_override !== null ? variant.price_override : product.price);
  const compare = product.compare_at_price ? parseFloat(product.compare_at_price) : 0;
  const hasDiscount = !needsVariant && compare > price;
  const low = stock > 0 && stock <= (product.low_stock_threshold || 5);

  const handleAdd = () => {
    if (stock <= 0) return;
    addItem(
      {
        product_id: product.id,
        variant_id: variant ? variant.id : null,
        variant_name: variant ? variant.name : null,
        name: product.name,
        slug: product.slug,
        price,
        image_url: product.image_url,
        max: stock,
      },
      quantity
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <p className="text-xl text-ink">{price.toFixed(2)} TND</p>
        {hasDiscount && <p className="text-ink/40 line-through">{compare.toFixed(2)} TND</p>}
      </div>

      {needsVariant && (
        <div className="mb-6">
          <p className="field-label">Option</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.stock <= 0}
                onClick={() => { setVariantId(v.id); setQuantity(1); }}
                className={`px-4 py-2 text-sm border rounded-sm ${
                  v.id === variantId ? 'bg-ink text-ivory border-ink' : 'border-line hover:border-ink'
                } ${v.stock <= 0 ? 'opacity-40 line-through cursor-not-allowed' : ''}`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {stock <= 0 ? (
        <p className="text-clay">Rupture de stock</p>
      ) : (
        <>
          {low && <p className="text-sm text-clay mb-3">Plus que {stock} en stock</p>}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center border border-line">
              <button className="px-3 py-2 text-ink/60" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Moins">−</button>
              <span className="px-4">{quantity}</span>
              <button className="px-3 py-2 text-ink/60" onClick={() => setQuantity((q) => Math.min(stock, q + 1))} aria-label="Plus">+</button>
            </div>
            <button className="btn-primary flex-1" onClick={handleAdd}>
              {added ? 'Ajouté ✓' : 'Ajouter au panier'}
            </button>
          </div>
          {added && (
            <button className="text-sm text-forest underline" onClick={() => router.push('/panier')}>
              Voir le panier →
            </button>
          )}
        </>
      )}
    </div>
  );
}
