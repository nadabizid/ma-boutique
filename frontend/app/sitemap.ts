import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/produits`, changeFrequency: 'daily', priority: 0.9 },
  ];
  try {
    const [products, categories] = await Promise.all([api.getProducts(), api.getCategories()]);
    products.forEach((p) =>
      pages.push({ url: `${SITE_URL}/produits/${p.slug}`, lastModified: p.updated_at ? new Date(p.updated_at as any) : undefined, changeFrequency: 'weekly', priority: 0.7 })
    );
    categories.forEach((c) => pages.push({ url: `${SITE_URL}/produits?category=${c.slug}`, changeFrequency: 'weekly', priority: 0.6 }));
  } catch {}
  return pages;
}
