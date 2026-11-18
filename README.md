# Ma Boutique — Site e-commerce + Admin (v2)

Stack : **Next.js 14 (frontend)** + **Express (API)** + **PostgreSQL**, pensée pour un VPS OVHcloud.

> **Hébergement gratuit sans carte bancaire** (Netlify + Render + Neon + Cloudinary) : suis le guide
> [`HEBERGEMENT-GRATUIT.md`](HEBERGEMENT-GRATUIT.md). Les instructions ci-dessous concernent l'installation sur un VPS.

```
ecommerce-site/
  backend/     → API Express + PostgreSQL
  frontend/    → Site Next.js (boutique + espace /admin)
```

## Mise à jour depuis la v1 (base existante)

1. **Sauvegarde la base** : `pg_dump -U app_user ecommerce_db > sauvegarde.sql`
2. Remplace les dossiers `backend/` et `frontend/` (garde tes fichiers `.env` / `.env.local`).
3. Ajoute dans `backend/.env` les nouvelles variables (voir `backend/.env.example`) : `NODE_ENV=production`, `FRONTEND_URL`, `TRUST_PROXY=1`.
   `JWT_SECRET` doit faire **32 caractères minimum** (le serveur refuse de démarrer en production sinon). Pour en générer un :
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. Dans `frontend/.env.local`, ajoute `NEXT_PUBLIC_SITE_URL=https://tondomaine.tn`.
5. Backend : `npm install && npm run migrate && pm2 restart md-api`
   Le script de migration est **sans risque sur une base existante** : il ajoute les nouvelles colonnes/tables,
   fusionne les clients en doublon (même téléphone) en conservant leurs commandes, et reprend les anciennes images.
6. Frontend : `npm install && npm run build && pm2 restart md-frontend`
7. Tes comptes admin existants deviennent **propriétaires**. Pense à activer la double authentification (Admin → Mon compte).

> Les cookies de connexion admin fonctionnent quand le site et l'API partagent le même domaine principal
> (`tondomaine.tn` et `api.tondomaine.tn`). Si ce n'est pas le cas, mets `COOKIE_SAMESITE=none` (HTTPS obligatoire).

## Installation (nouvelle base)

```bash
sudo apt install postgresql
sudo -u postgres psql
CREATE DATABASE ecommerce_db;
CREATE USER app_user WITH ENCRYPTED PASSWORD 'choisis_un_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE ecommerce_db TO app_user;
ALTER DATABASE ecommerce_db OWNER TO app_user;
\q

cd backend && cp .env.example .env     # édite DATABASE_URL, JWT_SECRET, CORS_ORIGIN, FRONTEND_URL
npm install
npm run migrate                        # ajouter  -- --seed  pour des produits d'exemple + un admin de démo
npm start                              # ou : pm2 start src/server.js --name md-api

cd ../frontend && cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL
npm install && npm run build
pm2 start npm --name md-frontend -- start
```

**Premier accès admin** : `https://tondomaine.tn/admin`
- Avec `--seed` : `admin@maboutique.tn` / `admin123` → le site **impose de changer le mot de passe** dès la première connexion.
- Sans `--seed`, crée ton compte en ligne de commande : `npm run admin -- create toi@exemple.tn "Ton Nom" "UnMotDePasseSolide1"`

### Outil de dépannage (accès au serveur requis)
```bash
npm run admin -- list                              # liste les comptes
npm run admin -- password email "NouveauMdp123"    # mot de passe perdu (sans email configuré)
npm run admin -- disable-2fa email                 # téléphone perdu
```

## Nginx

- `tondomaine.tn` → `localhost:3000` (frontend) ; `api.tondomaine.tn` → `localhost:4000` (API)
- Dans le bloc de l'API : `client_max_body_size 8m;` (envoi d'images) et les en-têtes `X-Forwarded-For` / `X-Forwarded-Proto` (`proxy_set_header`).
- HTTPS gratuit : `sudo certbot --nginx`
- **Les images envoyées depuis l'admin** sont stockées dans `backend/uploads/` (ou `UPLOAD_DIR`) : **inclus ce dossier dans tes sauvegardes**.
  Si `CLOUDINARY_URL` est défini, elles sont envoyées sur Cloudinary à la place (rien n'est écrit sur le serveur).

## Ce qui est nouveau

**Boutique** : livraison par gouvernorat (+ livraison offerte au-dessus d'un seuil), codes promo, emballage cadeau, options produit
(format/couleur) avec stock par option, packs, galerie d'images, avis clients modérés, recherche et tri, bandeau d'annonce et
sections d'accueil pilotés depuis l'admin, SEO (titres, sitemap.xml, données structurées Google).

**Apparence** (Admin → Paramètres → Apparence) : logo modifiable (affiché avant le nom dans l'en-tête et utilisé comme icône d'onglet), 9 thèmes de couleurs
prêts à l'emploi, couleurs personnalisables avec contrôle de lisibilité, et suggestion de thèmes calculée à partir des couleurs du logo
(analyse faite dans le navigateur, sans IA ni service externe). L'espace admin garde ses couleurs d'origine. Le nom de la marque n'est pas un lien ;
la recherche se trouve uniquement sur la page Produits.

**Commandes** : recherche/filtres/pagination, actions groupées, export CSV, bon de livraison et étiquettes imprimables (PDF via
« Imprimer »), transporteur + suivi, notes internes, historique (qui / quoi / quand), statut « retournée / refusée » avec remise en
stock automatique, boutons Appeler / WhatsApp avec messages pré-remplis, avertissement sur les clients signalés.

**Dashboard** : période au choix (+ comparaison à la précédente), CA livré vs en cours, panier moyen, taux d'annulation et de refus,
graphique journalier, top produits, produits sans vente, ventes par gouvernorat, nouveaux vs fidèles, stock faible (produits et options).

**Produits** : upload d'images, options, packs, duplication, actions groupées (prix, stock, catégorie, visibilité), import/export CSV,
SKU, seuil de stock faible par produit, SEO par produit.

**Clients** : fiche détaillée, notes, adresses, signalement des mauvais payeurs, export CSV.

**Sécurité** : session par cookie `httpOnly`, protection CSRF, limitation des tentatives de connexion, mot de passe oublié, changement
de mot de passe, double authentification (TOTP + codes de secours), comptes multiples avec rôles (propriétaire / gestionnaire de
commandes), journal d'activité, mot de passe provisoire obligatoirement changé.

**Corrections** : plus de survente (le stock est vérifié et décrémenté de façon atomique), stock remis en cas d'annulation/retour,
clients dédoublonnés par téléphone, produits masqués non exposés publiquement, messages d'erreur serveur sans détails techniques.

## Personnalisation des produits : retirée

La personnalisation de couverture (modèles, image envoyée par le client, texte) a été retirée pour permettre l'hébergement gratuit :
elle stockait les images des clients sur le disque du serveur, qui est effacé à chaque redémarrage sur les hébergeurs gratuits.
Les anciennes commandes personnalisées restent en base, les anciens produits personnalisables redeviennent des produits normaux.

## Livraison ColisPlus (facultatif)

1. Dans `backend/.env` : `COLISPLUS_API_KEY` (clé de ton espace ColisPlus) et `COLISPLUS_WEBHOOK_SECRET` (valeur aléatoire de ton choix). Redémarre l'API.
2. Admin → **Livraison (ColisPlus)** : active l'intégration, vérifie les règles de statut (liste réelle via « Voir les statuts de ColisPlus »).
3. Chez ColisPlus (Intégration API → Webhook) : URL de réception `https://api.tondomaine.tn/api/webhooks/colisplus` et « Token de Sécurité » = ton `COLISPLUS_WEBHOOK_SECRET`.
4. Fiche d'une commande → **Envoyer à ColisPlus** : choisis la délégation (liste officielle ColisPlus), le colis est créé avec le montant à encaisser,
   le code est enregistré comme numéro de suivi, puis les statuts reviennent automatiquement (livré, retourné…) et mettent la commande à jour
   (stock remis en cas de retour). L'historique des notifications reçues est consultable sur la page Livraison.

Sécurité : la clé API ne vit que dans `.env` ; le webhook refuse toute requête sans le bon jeton ; une commande n'est jamais annulée ni remise en arrière par le transporteur.
Test sans colis réel : page Livraison → « Tester une notification ».

## Notifications (facultatives)

- **Email** : renseigne `SMTP_*` et `MAIL_FROM` dans `backend/.env` → nouvelle commande (à toi), confirmation (au client qui a donné son
  email), lien « mot de passe oublié ». Sans SMTP, le lien de réinitialisation s'affiche dans les logs (`pm2 logs md-api`).
- **Telegram** (alerte instantanée sur téléphone) : crée un bot avec @BotFather puis renseigne `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`.
- **WhatsApp** : l'envoi automatique nécessite l'API WhatsApp Business (modèles de messages à faire valider par Meta). À la place,
  chaque commande propose des boutons WhatsApp avec le message déjà rédigé, à envoyer en un clic.

## Import CSV des produits

Colonnes : `sku;nom;description;prix;prix_barre;stock;categorie;image_url;actif;seuil_stock;meta_titre;meta_description`
(séparateur `;` ou `,`). Un produit est mis à jour s'il existe déjà (même SKU, sinon même nom), sinon il est créé. Le plus simple :
exporte tes produits pour obtenir le modèle. Les options et les packs se gèrent dans la fiche produit.

## Tests

`cd backend && npm test` — vérifie la logique des totaux, du stock, des packs, des codes promo, de la double authentification, etc.

## Avant la mise en ligne

- `JWT_SECRET` solide, mot de passe admin changé, double authentification activée
- Livraison, WhatsApp, coordonnées et bannière réglés dans Admin → Paramètres
- Sauvegardes régulières : `pg_dump` + dossier `backend/uploads/`
