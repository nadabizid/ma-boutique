import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { api, imageUrl } from '@/lib/api';
import type { HomeData } from '@/lib/api';
import Link from 'next/link';

const FALLBACK: HomeData = {
  hero: {
    eyebrow: 'Bienvenue',
    title: 'Des produits soigneusement sélectionnés, livrés chez vous.',
    subtitle: 'Parcourez notre catalogue et commandez en toute simplicité. Livraison partout en Tunisie, paiement à la réception.',
    button_label: 'Voir le catalogue',
    button_link: '/produits',
    image_url: '',
  },
  sections: [],
};

const sectionLink: Record<string, string> = {
  nouveautes: '/produits',
  promotions: '/produits?promo=1',
  meilleures_ventes: '/produits?sort=popular',
};

export default async function HomePage() {
  let home: HomeData = FALLBACK;
  let storeName = 'Ma Boutique';
  try {
    const [h, s] = await Promise.all([api.getHome(), api.getPublicSettings()]);
    home = h;
    storeName = s.store.name;
  } catch {}
  const { hero, sections } = home;
  const external = /^https?:\/\//.test(hero.button_link);

  return (
    <>
      <Header />

      <section className="border-b border-line">
        <div className="container-page py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
          <div>
            {hero.eyebrow && <p className="text-clay text-sm mb-4">{hero.eyebrow}</p>}
            <h1 className="font-display text-4xl md:text-5xl leading-tight text-ink mb-6">{hero.title}</h1>
            {hero.subtitle && <p className="text-ink/70 mb-8 max-w-md">{hero.subtitle}</p>}
            {hero.button_label &&
              (external ? (
                <a href={hero.button_link} className="btn-primary">{hero.button_label}</a>
              ) : (
                <Link href={hero.button_link || '/produits'} className="btn-primary">{hero.button_label}</Link>
              ))}
          </div>
          <div className="aspect-square bg-surface flex items-center justify-center overflow-hidden">
            {hero.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl(hero.image_url)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl italic text-ink/30">{storeName}</span>
            )}
          </div>
        </div>
      </section>

      {sections.length === 0 && (
        <section className="container-page py-20">
          <p className="text-ink/50">Aucun produit à afficher pour le moment.</p>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.key} className="container-page py-14">
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-display text-2xl text-ink">{s.title}</h2>
            {sectionLink[s.key] && <Link href={sectionLink[s.key]} className="text-sm text-ink/60 hover:text-ink">Voir tout →</Link>}
          </div>
          {s.categories ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {s.categories.map((c) => (
                <Link key={c.id} href={`/produits?category=${c.slug}`} className="border border-line bg-surface py-10 text-center font-display text-lg hover:border-ink transition-colors">
                  {c.name}
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
              {(s.products || []).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      ))}

      <Footer />
    </>
  );
}
