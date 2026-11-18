'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import ProductForm from '@/components/admin/ProductForm';

export default function EditProductPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adm.get(`/api/products/admin/${params.id}`).then(setProduct).catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <p className="text-clay">{error}</p>;
  if (!product) return <p className="text-ink/50">Chargement…</p>;

  return (
    <div>
      <Link href="/admin/produits" className="text-sm text-ink/50 hover:text-ink">← Produits</Link>
      <h1 className="font-display text-2xl text-ink mt-2 mb-8">Modifier {product.name}</h1>
      <ProductForm product={product} />
    </div>
  );
}
