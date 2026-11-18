import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { api, imageUrl } from '@/lib/api';
import type { Product } from '@/lib/api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AddToCartForm from './AddToCartForm';
import ProductGallery from './ProductGallery';
import ProductReviews from './ProductReviews';
import Stars from '@/components/Stars';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function load(slug: string): Promise<Product | null> {
  try {
    return await api.getProduct(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p) return { title: 'Produit introuvable' };
  const description = p.meta_description || (p.description || '').replace(/\s+/g, ' ').slice(0, 160);
  const img = p.images && p.images[0] ? imageUrl(p.images[0].url) : imageUrl(p.image_url);
  return {
    title: p.meta_title || p.name,
    description,
    alternates: { canonical: `/produits/${p.slug}` },
    openGraph: { title: p.meta_title || p.name, description, type: 'website', images: img ? [img] : undefined },
  };
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await load(params.slug);
  if (!product) notFound();
  const p = product!;

  const images = (p.images && p.images.length ? p.images.map((i) => i.url) : p.image_url ? [p.image_url] : []) as string[];
  const rating = p.avg_rating ? parseFloat(p.avg_rating) : 0;
  const reviews = p.reviews || [];

  // Données structurées pour Google (prix, disponibilité, note)
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: (p.description || '').slice(0, 500),
    image: images.map((u) => imageUrl(u)),
    sku: p.sku || undefined,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/produits/${p.slug}`,
      priceCurrency: 'TND',
      price: parseFloat(p.price_min ?? p.price).toFixed(2),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  if (reviews.length > 0 && rating > 0) jsonLd.aggregateRating = { '@type': 'AggregateRating', ratingValue: rating, reviewCount: reviews.length };

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="container-page py-16 grid md:grid-cols-2 gap-12">
        <ProductGallery images={images} name={p.name} />
        <div>
          {p.category_name && (
            <Link href={`/produits?category=${p.category_slug}`} className="text-sm text-clay mb-2 inline-block">{p.category_name}</Link>
          )}
          <h1 className="font-display text-3xl text-ink mb-3">{p.name}</h1>
          {rating > 0 && (
            <a href="#avis" className="flex items-center gap-2 text-sm text-ink/60 mb-4">
              <Stars value={rating} /> {rating.toFixed(1)} ({p.reviews_count} avis)
            </a>
          )}
          {p.description && <p className="text-ink/70 mb-8 leading-relaxed whitespace-pre-line">{p.description}</p>}

          {p.is_bundle && p.bundle_items && p.bundle_items.length > 0 && (
            <div className="bg-surface p-4 mb-8">
              <p className="text-sm text-ink mb-2">Ce pack contient :</p>
              <ul className="text-sm text-ink/70 space-y-1">
                {p.bundle_items.map((b) => (
                  <li key={b.product_id}>
                    {b.quantity} × <Link href={`/produits/${b.slug}`} className="underline">{b.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AddToCartForm product={p} />

          <p className="text-xs text-ink/50 mt-6">Paiement à la livraison · Livraison partout en Tunisie</p>
        </div>
      </section>

      <ProductReviews productId={p.id} reviews={reviews} average={rating} />

      {p.related && p.related.length > 0 && (
        <section className="container-page py-12 border-t border-line">
          <h2 className="font-display text-2xl text-ink mb-8">Vous aimerez aussi</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
            {p.related.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      )}
      <Footer />
    </>
  );
}
