// Stockage des images envoyées depuis l'admin (produits, galerie, logo, image d'accueil).
//
// - En ligne (CLOUDINARY_URL défini) : les images sont envoyées sur Cloudinary et l'adresse https
//   complète est enregistrée en base. Rien n'est écrit sur le disque du serveur, ce qui permet
//   d'héberger l'API sur un service gratuit dont le disque est effacé à chaque redémarrage (Render).
// - En local (sans CLOUDINARY_URL) : les images restent dans backend/uploads (ou UPLOAD_DIR),
//   comme avant, pour pouvoir développer sans compte Cloudinary.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const useCloudinary = !!process.env.CLOUDINARY_URL;
const FOLDER = (process.env.CLOUDINARY_FOLDER || 'boutique').replace(/[^A-Za-z0-9_-]/g, '') || 'boutique';

let cloudinary = null;
let CLOUD_NAME = '';
if (useCloudinary) {
  // Le SDK lit CLOUDINARY_URL (cloudinary://cle:secret@nom-du-cloud) tout seul
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ secure: true });
  CLOUD_NAME = cloudinary.config().cloud_name || '';
  if (!CLOUD_NAME) console.warn('⚠️  CLOUDINARY_URL invalide : format attendu cloudinary://CLE:SECRET@NOM_DU_CLOUD');
}

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '../../uploads');
if (!useCloudinary) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Enregistre une image (déjà vérifiée) et renvoie l'adresse à mettre en base
async function saveImage(buf, ext) {
  if (useCloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: FOLDER, resource_type: 'image', unique_filename: true, overwrite: false },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(buf);
    });
    return result.secure_url;
  }
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// Identifiant Cloudinary d'une adresse créée par saveImage, ou null si l'adresse n'est pas à nous
// ex. https://res.cloudinary.com/demo/image/upload/v1712345678/boutique/abc123.jpg -> boutique/abc123
function cloudinaryPublicId(url) {
  if (!CLOUD_NAME) return null;
  const prefix = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`;
  const u = String(url || '');
  if (!u.startsWith(prefix)) return null;
  const rest = u.slice(prefix.length).replace(/^v\d+\//, '');
  const m = rest.match(/^([A-Za-z0-9_\-/]+)\.[A-Za-z0-9]+$/);
  if (!m || !m[1].startsWith(`${FOLDER}/`)) return null;
  return m[1];
}

async function deleteStored(url) {
  const u = String(url || '');
  if (u.startsWith('/uploads/')) {
    const name = u.slice('/uploads/'.length);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
    await fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
    return;
  }
  const publicId = cloudinaryPublicId(u);
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {});
}

// Supprime une image envoyée depuis l'admin, seulement si plus rien ne l'utilise
async function removeIfUnreferenced(db, url) {
  if (!url) return;
  const u = String(url);
  if (!u.startsWith('/uploads/') && !cloudinaryPublicId(u)) return;
  const r = await db.query(
    `SELECT (SELECT COUNT(*) FROM product_images WHERE url = $1)
          + (SELECT COUNT(*) FROM products WHERE image_url = $1)
          + (SELECT COUNT(*) FROM settings WHERE value::text LIKE '%' || $1 || '%') AS n`,
    [u]
  );
  if (Number(r.rows[0].n) === 0) await deleteStored(u);
}

module.exports = { useCloudinary, UPLOAD_DIR, saveImage, removeIfUnreferenced, cloudinaryPublicId };
