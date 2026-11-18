const express = require('express');
const { requireOwner } = require('../middleware/auth');
const { wrap, bad, AppError } = require('../utils/http');
const { saveImage } = require('../utils/storage');

const router = express.Router();

// Le type réel du fichier est déterminé par son contenu, jamais par ce que déclare le navigateur
function detectExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  return null;
}

// Corps brut de l'image (le navigateur la redimensionne avant l'envoi)
router.post(
  '/',
  requireOwner,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '6mb' }),
  wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('Image manquante ou format non pris en charge (JPG, PNG, WebP, GIF).');
    const ext = detectExt(req.body);
    if (!ext) throw bad("Ce fichier n'est pas une image valide.");
    let url;
    try {
      url = await saveImage(req.body, ext);
    } catch (e) {
      console.error("Envoi d'image :", e.message || e);
      throw new AppError(502, "L'image n'a pas pu être enregistrée. Réessayez dans un instant.");
    }
    res.status(201).json({ url });
  })
);

module.exports = router;
