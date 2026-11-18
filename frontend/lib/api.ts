// Adresse de l'API vue par le navigateur. En ligne, c'est l'adresse du site lui-même :
// Netlify transmet /api/* à l'API (voir netlify.toml), ce qui garde les cookies de connexion sur le même domaine.
const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// Côté serveur (pages générées par Next.js), on peut appeler l'API directement, sans passer par Netlify.
const API_URL =
  typeof window === 'undefined' && process.env.API_INTERNAL_URL
    ? process.env.API_INTERNAL_URL.replace(/\/$/, '')
    : PUBLIC_API_URL;

export type Variant = { id: number; name: string; sku?: string | null; price_override: string | null; stock: number; is_active: boolean; position?: number };
export type ProductImage = { id?: number; url: string; position?: number };
export type BundleItem = { product_id: number; quantity: number; name?: string; slug?: string; image_url?: string };
export type Review = { id: number; author_name: string; rating: number; comment: string | null; created_at: string };

export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: string;
  compare_at_price: string | null;
  stock: number;
  image_url: string;
  category_id: number | null;
  category_name?: string;
  category_slug?: string;
  is_active: boolean;
  updated_at?: string;
  is_bundle?: boolean;
  sku?: string | null;
  low_stock_threshold?: number;
  meta_title?: string | null;
  meta_description?: string | null;
  has_variants?: boolean;
  variants_count?: number;
  price_min?: string;
  price_max?: string;
  avg_rating?: string | null;
  reviews_count?: number;
  // fiche produit
  images?: ProductImage[];
  variants?: Variant[];
  bundle_items?: BundleItem[];
  reviews?: Review[];
  related?: Product[];
};

export type Category = { id: number; name: string; slug: string; product_count?: number };

export type PublicSettings = {
  store: { name: string; tagline: string; phone: string; whatsapp: string; email: string; address: string; instagram: string; facebook: string; logo_url: string; show_name: boolean };
  theme: { preset: string; colors: Record<string, string> | null };
  shipping: { default_fee: number; free_threshold: number | null; rates: Record<string, number> };
  gift_wrap: { enabled: boolean; price: number };
  announcement: { enabled: boolean; text: string };
  seo: { site_title: string; site_description: string };
  governorates: string[];
};

export type HomeData = {
  hero: { eyebrow: string; title: string; subtitle: string; button_label: string; button_link: string; image_url: string };
  sections: { key: string; title: string; products?: Product[]; categories?: Category[] }[];
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Opts = { method?: string; body?: any; admin?: boolean; noRedirect?: boolean; headers?: Record<string, string>; raw?: boolean };

async function request(path: string, opts: Opts = {}) {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  let body: any = undefined;
  if (opts.body !== undefined) {
    if (opts.raw) body = opts.body;
    else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }
  // En-tête exigé par le serveur pour toute modification (protection CSRF)
  if (method !== 'GET') headers['X-Requested-With'] = 'XMLHttpRequest';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body, credentials: 'include', cache: 'no-store' });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (typeof window !== 'undefined' && opts.admin && !opts.noRedirect) {
      if (res.status === 401 && data.code === 'UNAUTHENTICATED') window.location.href = '/admin/login';
      if (res.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED') window.location.href = '/admin/compte';
    }
    throw new ApiError(data.error || 'Une erreur est survenue', res.status, data.code);
  }
  return data;
}

const qs = (params: Record<string, any>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // --- Boutique ---
  getProducts: (params: { category?: string; search?: string; sort?: string; promo?: boolean; in_stock?: boolean; limit?: number } = {}) =>
    request(`/api/products${qs({ ...params, promo: params.promo ? '1' : '', in_stock: params.in_stock ? '1' : '' })}`) as Promise<Product[]>,
  getProduct: (slug: string) => request(`/api/products/${encodeURIComponent(slug)}`) as Promise<Product>,
  getCategories: () => request('/api/categories') as Promise<Category[]>,
  getPublicSettings: () => request('/api/settings/public') as Promise<PublicSettings>,
  getHome: () => request('/api/settings/home') as Promise<HomeData>,
  createOrder: (payload: any) => request('/api/orders', { method: 'POST', body: payload }),
  validateCoupon: (payload: { code: string; subtotal: number; phone?: string }) =>
    request('/api/coupons/validate', { method: 'POST', body: payload }) as Promise<{ code: string; type: string; discount: number; free_shipping: boolean; message: string }>,
  postReview: (payload: any) => request('/api/reviews', { method: 'POST', body: payload }),

  // --- Session admin ---
  login: (email: string, password: string) => request('/api/auth/login', { method: 'POST', body: { email, password }, admin: true, noRedirect: true }),
  login2fa: (challenge: string, code: string) => request('/api/auth/login/2fa', { method: 'POST', body: { challenge, code }, admin: true, noRedirect: true }),
  logout: () => request('/api/auth/logout', { method: 'POST', admin: true, noRedirect: true }),
  me: () => request('/api/auth/me', { admin: true, noRedirect: true }),
  forgot: (email: string) => request('/api/auth/forgot', { method: 'POST', body: { email }, admin: true, noRedirect: true }),
  reset: (token: string, password: string) => request('/api/auth/reset', { method: 'POST', body: { token, password }, admin: true, noRedirect: true }),
};

// Appels admin génériques : adm.get('/api/orders'), adm.post(...), adm.put(...), adm.del(...)
export const adm = {
  get: (p: string) => request(p, { admin: true }),
  post: (p: string, body?: any) => request(p, { method: 'POST', body: body ?? {}, admin: true }),
  put: (p: string, body?: any) => request(p, { method: 'PUT', body: body ?? {}, admin: true }),
  del: (p: string) => request(p, { method: 'DELETE', admin: true }),
  qs,
};

// Téléchargement d'un export CSV protégé par la session
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError('Export impossible', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Envoi d'un fichier CSV (import de produits)
export async function importProductsCsv(file: File) {
  const text = await file.text();
  return request('/api/products/import', { method: 'POST', body: text, raw: true, headers: { 'Content-Type': 'text/csv' }, admin: true });
}

// Réduit l'image dans le navigateur avant l'envoi (1600 px max, WebP) pour garder un site rapide
async function shrinkImage(file: File, maxSize = 1600): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    const ratio = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(file: File, maxSize = 1600): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new ApiError('Format non pris en charge (JPG, PNG, WebP ou GIF).', 400);
  const blob = await shrinkImage(file, maxSize);
  if (blob.size > 6 * 1024 * 1024) throw new ApiError('Image trop lourde (6 Mo maximum).', 400);
  const data = await request('/api/uploads', { method: 'POST', body: blob, raw: true, headers: { 'Content-Type': blob.type }, admin: true });
  return data.url as string;
}

// Les images envoyées depuis l'admin sont servies par l'API
export function imageUrl(u?: string | null) {
  if (!u) return '';
  if (u.startsWith('blob:')) return u;
  return u.startsWith('/uploads/') ? `${PUBLIC_API_URL}${u}` : u;
}

export { API_URL };
