import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { api } from '@/lib/api';
import Link from 'next/link';

type SP = { category?: string; search?: string; sort?: string; promo?: string; in_stock?: string };

export const metadata = { title: 'Tous les produits' };

export default async function ProduitsPage({ searchParams }: { searchParams: SP }) {
  const category = searchParams.category || '';
  const search = searchParams.search || '';
  const sort = searchParams.sort || 'newest';
  const promo = searchParams.promo === '1';
  const inStock = searchParams.in_stock === '1';

  let products: Awaited<ReturnType<typeof api.getProducts>> = [];
  let categories: Awaited<ReturnType<typeof api.getCategories>> = [];
  try {
    [products, categories] = await Promise.all([
      api.getProducts({ category: category || undefined, search: search || undefined, sort, promo, in_stock: inStock }),
      api.getCategories(),
    ]);
  } catch {}

  const chip = (active: boolean) =>
    `px-4 py-2 text-sm rounded-full border ${active ? 'bg-ink text-ivory border-ink' : 'border-ink/20 text-ink/70 hover:border-ink'}`;

  return (
    <>
      <Header />
      <section className="container-page py-16">
        <h1 className="font-display text-3xl text-ink mb-8">
          {promo ? 'Promotions' : search ? `Résultats pour « ${search} »` : 'Tous les produits'}
        </h1>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Link href="/produits" className={chip(!category && !promo)}>Tout</Link>
            {categories.map((c) => (
              <Link key={c.slug} href={`/produits?category=${c.slug}`} className={chip(category === c.slug)}>
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <form method="get" className="flex flex-wrap items-end gap-3 mb-12 text-sm">
          {category && <input type="hidden" name="category" value={category} />}
          {promo && <input type="hidden" name="promo" value="1" />}
          <div>
            <label className="field-label" htmlFor="search">Recherche</label>
            <input id="search" name="search" defaultValue={search} placeholder="Nom du produit" className="field-input" />
          </div>
          <div>
            <label className="field-label" htmlFor="sort">Trier par</label>
            <select id="sort" name="sort" defaultValue={sort} className="field-input">
              <option value="newest">Nouveautés</option>
              <option value="popular">Meilleures ventes</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
              <option value="name">Nom (A-Z)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" name="in_stock" value="1" defaultChecked={inStock} /> En stock uniquement
          </label>
          <button className="btn-outline btn-sm" type="submit">Appliquer</button>
        </form>

        {products.length === 0 ? (
          <p className="text-ink/50">Aucun produit ne correspond à votre recherche.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
