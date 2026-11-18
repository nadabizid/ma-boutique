# Mettre la boutique en ligne gratuitement (sans carte bancaire)

| Partie | Service gratuit | Rôle |
|---|---|---|
| Code | **GitHub** | Les autres services récupèrent le code ici et se mettent à jour à chaque modification |
| Base de données | **Neon** | PostgreSQL (produits, commandes, clients…) |
| Images | **Cloudinary** | Photos des produits, logo, image d'accueil |
| API (dossier `backend`) | **Render** | Le serveur Express |
| Boutique (dossier `frontend`) | **Netlify** | Le site Next.js + l'espace `/admin` |
| Réveil de l'API | **UptimeRobot** | Empêche l'API gratuite de s'endormir |

Compte environ 1 h. Garde un bloc-notes ouvert pour coller les adresses et les clés au fur et à mesure.

---

## 1. Mettre le code sur GitHub

1. Crée un compte sur https://github.com puis **New repository** : nom `ma-boutique`, coche **Private**, puis **Create repository**.
2. Clique sur **uploading an existing file**.
3. Fais glisser dans la page le contenu du dossier `ecommerce-site` : les dossiers `backend` et `frontend`, ainsi que `README.md`, `HEBERGEMENT-GRATUIT.md` et `.gitignore`.
   GitHub accepte 100 fichiers par envoi. Si ça bloque, envoie d'abord `backend` (**Commit changes**), puis recommence avec `frontend` et les fichiers restants.
   N'envoie jamais de fichier `.env` ni de dossier `node_modules`.
4. Vérifie qu'à la racine du dépôt on voit bien `backend/` et `frontend/`.

## 2. Base de données : Neon

1. Crée un compte sur https://neon.com (connexion Google ou GitHub possible).
2. Crée un projet : nom `ma-boutique`, région **AWS Europe Central 1 (Frankfurt)** (la plus proche de la Tunisie).
3. Clique sur **Connect**, **décoche « Connection pooling »**, puis copie la chaîne de connexion. Elle ressemble à ceci :
   `postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   L'adresse **ne doit pas** contenir `-pooler`.
   → À noter : **DATABASE_URL**

## 3. Images : Cloudinary

1. Crée un compte sur https://cloudinary.com (offre **Free**).
2. Va dans **Settings → API Keys** (ou sur le tableau de bord). Repère la ligne **API environment variable** :
   `CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@ton-cloud`
3. Remplace `<your_api_key>` par ta **API Key** et `<your_api_secret>` par ton **API Secret** (clique sur l'œil pour l'afficher).
   → À noter : **CLOUDINARY_URL**, la valeur qui commence par `cloudinary://` (sans le `CLOUDINARY_URL=` du début).

## 4. API : Render

1. Crée un compte sur https://render.com **avec ton compte GitHub**.
2. Clique sur **New → Web Service**, choisis ton dépôt `ma-boutique` (autorise Render à y accéder si on te le demande).
3. Remplis :
   - **Name** : `ma-boutique-api`
   - **Region** : **Frankfurt**
   - **Root Directory** : `backend`
   - **Runtime** : Node
   - **Build Command** : `npm install && npm run migrate`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
4. Dans **Environment Variables**, ajoute :

   | Clé | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | la chaîne de connexion Neon |
   | `JWT_SECRET` | une longue suite aléatoire de 48 caractères minimum (bouton **Generate** de Render s'il est proposé) |
   | `CLOUDINARY_URL` | la valeur `cloudinary://…` |
   | `ADMIN_EMAIL` | ton email de connexion à l'admin |
   | `ADMIN_PASSWORD` | 10 caractères minimum, avec des lettres **et** des chiffres (pas « motdepasse… » ni « admin123… ») |
   | `ADMIN_NAME` | ton nom |
   | `TRUST_PROXY` | `4` (valeur provisoire, à ajuster à l'étape 8) |

5. Clique sur **Deploy Web Service**. Pendant le déploiement, les journaux doivent afficher `Schéma appliqué avec succès.` puis `Premier compte admin créé : …`.
6. Récupère l'adresse affichée en haut, du type `https://ma-boutique-api.onrender.com`.
   → À noter : **adresse de l'API**. Test : `https://ma-boutique-api.onrender.com/api/health` doit afficher `{"status":"ok"}`.

> Si Render te demande une carte bancaire, arrête-toi là et dis-le-moi : on passera par une autre solution.

## 5. Boutique : Netlify

**a) Indiquer l'adresse de l'API au site.** Sur GitHub, ouvre `frontend/netlify.toml` et clique sur le crayon (Edit). Remplace
`https://TON-API.onrender.com` par l'adresse de ton API Render (sans `/` à la fin), puis clique sur **Commit changes**.

**b) Créer le site.**
1. Crée un compte sur https://www.netlify.com **avec ton compte GitHub** (offre **Free**).
2. **Add new project → Import an existing project → GitHub**, puis choisis `ma-boutique`.
3. **Base directory** : `frontend`. Laisse les autres réglages tels quels (Netlify reconnaît Next.js tout seul).
4. Clique sur **Deploy**. Ce premier déploiement ne sert qu'à créer le site. Il n'est pas encore relié à l'API.

**c) Choisir l'adresse du site.** Dans **Project configuration → General → Change project name**, choisis par exemple `ma-boutique`.
L'adresse devient `https://ma-boutique.netlify.app`.
→ À noter : **adresse du site**

**d) Ajouter les variables.** Dans **Project configuration → Environment variables**, ajoute :

| Clé | Valeur |
|---|---|
| `NEXT_PUBLIC_API_URL` | l'**adresse du site** (oui, celle du site : l'API passe par lui) |
| `NEXT_PUBLIC_SITE_URL` | l'**adresse du site** |
| `API_INTERNAL_URL` | l'**adresse de l'API** Render |

**e) Redéployer.** Va dans **Deploys → Trigger deploy → Clear cache and deploy project**. C'est obligatoire : les variables `NEXT_PUBLIC_…` ne sont prises en compte qu'au moment du déploiement.

## 6. Relier l'API au site (Render)

Sur Render, dans ton service, va dans **Environment** et ajoute :

| Clé | Valeur |
|---|---|
| `CORS_ORIGIN` | l'**adresse du site** (ex. `https://ma-boutique.netlify.app`, sans `/` à la fin) |
| `FRONTEND_URL` | l'**adresse du site** |

Enregistre : Render redéploie l'API tout seul.

## 7. Empêcher l'API de s'endormir : UptimeRobot

Sans visite pendant 15 minutes, l'API gratuite de Render s'endort et met environ une minute à se réveiller. Pendant ce temps,
le site afficherait des erreurs.

1. Crée un compte gratuit sur https://uptimerobot.com.
2. Clique sur **New monitor** et choisis le type **HTTP(s)**.
3. **URL** : `https://ma-boutique-api.onrender.com/api/health` (l'adresse de l'API, pas celle du site). **Intervalle** : 5 minutes.

Bonus : UptimeRobot t'envoie un email si l'API tombe. Cet appel ne réveille pas la base de données, donc il ne consomme pas ton quota Neon.

## 8. Vérifier que tout fonctionne

1. Ouvre `https://ma-boutique.netlify.app/admin` et connecte-toi avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`.
2. Active la double authentification dans **Admin → Mon compte**.
3. Crée un produit **avec une photo**. La photo doit s'afficher, et elle doit aussi apparaître dans Cloudinary (**Media Library**, dossier `boutique`).
4. Passe une commande test sur la boutique, puis vérifie qu'elle apparaît dans **Admin → Commandes**.
5. **Réglage de `TRUST_PROXY`** (pour que la protection contre les abus voie la vraie adresse IP des visiteurs) :
   ouvre `https://ma-boutique.netlify.app/api/ip`.
   - Si `trust_proxy_conseille` affiche un nombre, mets ce nombre dans `TRUST_PROXY` sur Render.
   - S'il affiche `null`, compare `ip_vue_par_l_api` avec ton adresse IP (affichée par exemple sur https://ifconfig.me). Si elles sont différentes, essaie `3` puis `5` jusqu'à ce qu'elles correspondent.
6. Sur Render, **supprime `ADMIN_PASSWORD`** : il ne sert plus, et il vaut mieux ne pas le laisser traîner.

C'est en ligne. Chaque modification envoyée sur GitHub redéploie automatiquement l'API et la boutique.

---

## Limites des offres gratuites

- **Render** : 750 heures par mois, juste de quoi faire tourner **un seul** service en continu. Ne crée pas un deuxième service gratuit sur le même compte.
- **Neon** : 1 Go de données, largement suffisant pour des milliers de commandes. La base se met en veille quand personne ne s'en sert et se réveille en moins d'une seconde.
- **Cloudinary** : 25 crédits par mois (1 crédit = 1 Go stocké **ou** 1 Go affiché **ou** 1 000 transformations). L'admin réduit déjà les images avant l'envoi.
- **Netlify** : 300 crédits par mois. Chaque déploiement en coûte environ 15, et le trafic consomme le reste.
  Évite donc de modifier le code sur GitHub des dizaines de fois par mois : regroupe tes changements.
  Si le quota est dépassé, le site est mis en pause jusqu'au mois suivant.

## Bon à savoir

- **Emails** (nouvelle commande, confirmation client, mot de passe oublié) : ajoute les variables `SMTP_*`, `MAIL_FROM` et `NOTIFY_EMAIL` sur Render
  (voir `backend/.env.example`). Un compte Gmail avec un « mot de passe d'application » fonctionne. **Telegram** : `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`.
- **Mot de passe admin perdu sans email configuré** : Render gratuit n'offre pas de ligne de commande. Depuis ton ordinateur (Node.js installé),
  dans le dossier `backend`, crée un fichier `.env` qui contient seulement `DATABASE_URL=` (la chaîne Neon), puis lance `npm install` et
  `npm run admin -- password ton@email.tn "NouveauMotDePasse1"`.
- **ColisPlus** : URL du webhook = `https://ma-boutique-api.onrender.com/api/webhooks/colisplus`. Mets `COLISPLUS_API_KEY` et `COLISPLUS_WEBHOOK_SECRET` sur Render.
- **Ton propre nom de domaine plus tard** (ex. `maboutique.tn`) : ajoute-le dans Netlify (**Domain management**), puis remplace l'adresse du site
  dans `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SITE_URL` (Netlify, puis **Clear cache and deploy**) et dans `CORS_ORIGIN` et `FRONTEND_URL` (Render).
- **Personnalisation des produits** : elle a été retirée de cette version, car elle stockait les images des clients sur le disque du serveur.
