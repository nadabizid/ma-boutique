import { imageUrl } from '@/lib/api';
import type { CartItem } from '@/lib/cart';

// Miniature d'une ligne du panier : photo du produit
export default function CartLineThumb({ item, className = '' }: { item: Pick<CartItem, 'image_url' | 'name'>; className?: string }) {
  return (
    <div className={`bg-surface overflow-hidden aspect-square ${className}`}>
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" />
      )}
    </div>
  );
}
