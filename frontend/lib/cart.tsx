'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type CartItem = {
  key: string;
  product_id: number;
  variant_id: number | null;
  variant_name: string | null;
  name: string;
  slug: string;
  price: number;
  image_url: string;
  quantity: number;
  max: number; // stock disponible au moment de l'ajout
};

export type CartInput = Omit<CartItem, 'key' | 'quantity'>;

type CartContextType = {
  items: CartItem[];
  addItem: (item: CartInput, quantity?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = 'md_cart';
const keyOf = (productId: number, variantId: number | null) => `${productId}:${variantId || 0}`;
const clamp = (q: number, max: number) => Math.max(1, Math.min(q, max > 0 ? max : 99, 99));

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Compatible avec les anciens paniers (sans option ni clé). Les articles personnalisés
        // d'avant le retrait de la personnalisation sont retirés : leur prix incluait un supplément.
        setItems(
          parsed
            .filter((i: any) => !i.customization)
            .map((i: any) => ({
              variant_id: null, variant_name: null, slug: '', max: 99, ...i,
              key: keyOf(i.product_id, i.variant_id ?? null),
            }))
        );
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = (item: CartInput, quantity = 1) => {
    const key = keyOf(item.product_id, item.variant_id);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, ...item, key, quantity: clamp(i.quantity + quantity, item.max) } : i));
      }
      return [...prev, { ...item, key, quantity: clamp(quantity, item.max) }];
    });
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const updateQuantity = (key: string, quantity: number) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: clamp(quantity, i.max) } : i)));
  const clearCart = () => setItems([]);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans un CartProvider');
  return ctx;
}
