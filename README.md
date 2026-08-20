# Class Website

A small, mobile-friendly course site. First section: **Introductions**, a
class profile board behind a shared passcode. Later sessions will add more
sections to the same site.

## Stack

- Static front end (`public/`) — no build step.
- Vercel Serverless Functions (`api/`) for saving/listing profiles.
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) for storage:
  - `data/profiles.json` — one JSON array of all profiles, newest first.
  - `photos/<id>.<ext>` — uploaded student photos.

No third-party services (no Supabase, no database) — everything runs on
Vercel.

## How it works

- **Passcode gate**: the browser fetches the expected passcode from
  `/api/config` and compares it to what the student typed. On success it's
  cached in `sessionStorage` and sent as an `x-passcode` header on every
  `/api/profiles` request, which the server also validates.
- **Saving a profile**: `POST /api/profiles` reads the current
  `data/profiles.json` blob (using `head()` to get its ETag), prepends the
  new profile, and writes it back. Right before writing, the function
  re-checks the blob's ETag; if it changed since the read (i.e., someone
  else saved at the same time), the write is treated as a conflict and the
  function retries the whole read-modify-write cycle (up to 4 times, with a
  short randomized backoff) instead of clobbering the other write.
- **Photos**: uploaded as a base64 data URL from the browser, decoded on the
  server, and stored as a Blob object. If a student skips the photo, the
  front end renders a colored circle with their first initial instead
  (color is derived deterministically from their name).

## Local development

```bash
npm install
npx vercel dev
```

You'll need a Vercel Blob store connected to the project (Vercel injects
`BLOB_READ_WRITE_TOKEN` automatically once one is linked — see below).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SITE_PASSCODE` | No (defaults to `classroom2026`) | The shared class passcode. Set your own before sharing the link. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Provided automatically by Vercel once a Blob store is created and linked to the project. |

## Deploying to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket) and import it
   in the Vercel dashboard, **or** deploy directly from the CLI:
   ```bash
   npx vercel
   ```
2. In the Vercel dashboard, go to **Storage → Create Database → Blob** and
   connect the new store to this project (this sets
   `BLOB_READ_WRITE_TOKEN` automatically).
3. In **Settings → Environment Variables**, add `SITE_PASSCODE` with your
   class's passcode.
4. Redeploy (`npx vercel --prod`) so the function picks up the env vars.

Share the deployed URL and passcode with your class.
