// POST /api/thumbnail
// Called by the C++ server right after a successful /media upload (see
// MediaStore::save() in server/src/common/media_store.hpp) with the
// media id and the full-size image bytes. Generates a small (256px) and
// medium (800px) variant and uploads both to object storage, returning
// their URLs so the C++ server can store them alongside the original.
//
// Why this lives here and not in the C++ server: image resizing is
// CPU-heavy and bursty — most of the time nobody's uploading anything,
// then someone posts five photos in a row. Serverless scales that
// automatically; baking libvips/sharp into the always-on C++ binary would
// mean paying for that CPU headroom 24/7 for a job that runs in bursts.
//
// Deploy target: Vercel Functions or AWS Lambda (both support the
// `sharp` native module out of the box on their standard Node runtimes —
// double check the deploy target's supported Node version against
// sharp's requirements before shipping). Not a great fit for Cloudflare
// Workers, since sharp needs native bindings Workers' runtime doesn't
// support — use Lambda or Vercel for this one specifically.
const sharp = require('sharp');
const { verifySignature } = require('../shared/verify-webhook');

const VARIANTS = [
  { name: 'thumb', width: 256 },
  { name: 'medium', width: 800 },
];

module.exports = async function handler(req, res) {
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-pulse-signature'];
  if (!verifySignature(rawBody, signature, process.env.PULSE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { media_id, image_base64 } = req.body;
  if (!media_id || !image_base64) {
    return res.status(400).json({ error: 'missing media_id or image_base64' });
  }

  const inputBuffer = Buffer.from(image_base64, 'base64');
  const outputs = {};

  for (const variant of VARIANTS) {
    const resized = await sharp(inputBuffer)
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    // Swap this for your real object storage (S3, R2, GCS) — this stub
    // just demonstrates the shape of what each variant needs to become.
    const url = await uploadToObjectStorage(`${media_id}-${variant.name}.webp`, resized);
    outputs[variant.name] = url;
  }

  return res.status(200).json({ media_id, variants: outputs });
};

async function uploadToObjectStorage(filename, buffer) {
  // Placeholder — wire this to S3/R2/GCS's SDK. Returning a fake URL so
  // this file is honest about being a stub, not a finished integration.
  return `https://your-object-storage.example.com/${filename}`;
}
