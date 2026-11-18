import Link from 'next/link';
import { imageUrl } from '@/lib/api';
import type { Product } from '@/lib/api';
import Stars from './Stars';

export default function ProductCard({ product }: { product: Product }) {
  const price = parseFloat(product.price);
  const hasDiscount = product.compare_at_price && parseFloat(product.compare_at_price) > price;
  const min = parseFloat(product.price_min ?? product.price);
  const max = parseFloat(product.price_max ?? product.price);
  const ranged = product.has_variants && min !== max;
  const rating = product.avg_rating ? parseFloat(product.avg_rating) : 0;

  return (
    <Link href={`/produits/${product.slug}`} className="group block">
      <div className="aspect-[4/5] bg-surface overflow-hidden mb-3 relative">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink/30 font-display italic">Ma Boutique</div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {hasDiscount && <span className="bg-clay text-white text-[11px] px-2 py-0.5 rounded-sm">Promo</span>}
          {product.is_bundle && <span className="bg-forest text-ivory text-[11px] px-2 py-0.5 rounded-sm">Pack</span>}
        </div>
      </div>
      <h3 className="font-display text-lg text-ink">{product.name}</h3>
      <div className="flex items-center gap-2 text-sm mt-1">
        {ranged && <span className="text-ink/60">À partir de</span>}
        <span className="text-ink">{(ranged ? min : price).toFixed(2)} TND</span>
        {hasDiscount && !ranged && <span className="text-ink/40 line-through">{parseFloat(product.compare_at_price!).toFixed(2)} TND</span>}
      </div>
      {rating > 0 && (
        <div className="flex items-center gap-1 mt-1 text-xs text-ink/50">
          <Stars value={rating} size={13} />
          <span>({product.reviews_count})</span>
        </div>
      )}
      {product.stock === 0 && <p className="text-xs text-clay mt-1">Rupture de stock</p>}
    </Link>
  );
}
