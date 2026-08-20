import { put, head, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';

const PROFILES_PATH = 'data/profiles.json';
const MAX_RETRIES = 4;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkPasscode(req) {
  const expected = process.env.SITE_PASSCODE || 'classroom2026';
  const provided = req.headers['x-passcode'];
  return provided === expected;
}

async function readProfiles() {
  try {
    const meta = await head(PROFILES_PATH);
    const response = await fetch(meta.url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch profiles blob');
    const profiles = await response.json();
    return { profiles, etag: meta.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) {
      return { profiles: [], etag: null };
    }
    throw err;
  }
}

// Conditional write. When the blob already exists we pass its ETag via
// ifMatch, so the write only lands if nobody else changed it since we read.
// When it does not exist yet there is no ETag to match on, so allowOverwrite:
// false makes the write create-only and a second concurrent creator fails
// instead of silently overwriting the first.
async function writeProfiles(profiles, expectedEtag) {
  const options = {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
  };

  if (expectedEtag) {
    options.allowOverwrite = true;
    options.ifMatch = expectedEtag;
  } else {
    options.allowOverwrite = false;
  }

  await put(PROFILES_PATH, JSON.stringify(profiles), options);
}

function isWriteConflict(err) {
  return (
    err instanceof BlobPreconditionFailedError ||
    /already exists/i.test(err?.message || '')
  );
}

async function addProfileWithRetry(newProfile) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { profiles, etag } = await readProfiles();
    const updated = [newProfile, ...profiles];
    try {
      await writeProfiles(updated, etag);
      return updated;
    } catch (err) {
      if (isWriteConflict(err) && attempt < MAX_RETRIES) {
        await sleep(120 * (attempt + 1) + Math.floor(Math.random() * 100));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not save profile after multiple attempts');
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function uploadPhoto(photoDataUrl, id) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(photoDataUrl);
  if (!match) {
    throw new Error('Invalid photo data');
  }
  const [, mimeType, base64] = match;
  const extension = ALLOWED_PHOTO_TYPES[mimeType];
  if (!extension) {
    throw new Error('Unsupported photo type');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    throw new Error('Photo is too large');
  }

  const blob = await put(`photos/${id}.${extension}`, buffer, {
    access: 'public',
    contentType: mimeType,
    addRandomSuffix: false,
  });

  return blob.url;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!checkPasscode(req)) {
      res.status(401).json({ error: 'Invalid or missing passcode' });
      return;
    }
    try {
      const { profiles } = await readProfiles();
      res.status(200).json({ profiles });
    } catch (err) {
      console.error('Failed to list profiles', err);
      res.status(500).json({ error: 'Failed to load profiles' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!checkPasscode(req)) {
      res.status(401).json({ error: 'Invalid or missing passcode' });
      return;
    }

    const body = req.body || {};
    const firstName = sanitizeText(body.firstName, 60);
    const major = sanitizeText(body.major, 80);
    const year = sanitizeText(body.year, 40);
    const hometown = sanitizeText(body.hometown, 80);

    if (!firstName || !major || !year || !hometown) {
      res.status(400).json({ error: 'First name, major, year, and hometown are required' });
      return;
    }

    const id = randomId();
    let photoUrl = null;

    try {
      if (body.photoDataUrl) {
        photoUrl = await uploadPhoto(body.photoDataUrl, id);
      }
    } catch (err) {
      res.status(400).json({ error: err.message || 'Invalid photo' });
      return;
    }

    const profile = {
      id,
      firstName,
      major,
      year,
      hometown,
      photoUrl,
      createdAt: new Date().toISOString(),
    };

    try {
      const profiles = await addProfileWithRetry(profile);
      res.status(201).json({ profile, profiles });
    } catch (err) {
      console.error('Failed to save profile', err);
      res.status(409).json({ error: 'Could not save profile, please try again' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
