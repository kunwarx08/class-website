Project: shared website for this class and course
Goal: begin with an Introductions section where students can add
and view class profiles. Later sessions will add more sections
to the same website.
Hosting and storage: Vercel
Style: simple, mobile-friendly, photos in a neat grid.

---

## How this project is built

Static front end plus Vercel Serverless Functions. No framework, no build
step — the browser loads `public/` directly and the functions in `api/` run
on demand.

```
public/index.html   Passcode gate + Introductions section
public/app.js       Gate logic, form handling, profile rendering
public/styles.css   All styling (mobile-first, CSS variables for theming)
api/config.js       Returns the expected passcode to the browser
api/profiles.js     Reads/writes profiles and photos in Vercel Blob
```

New sections in later sessions should be added as new `<section>` blocks in
`index.html` with a matching nav link, reusing the existing CSS variables so
the styling stays consistent.

## How storage works

Everything lives in one **public** Vercel Blob store:

- `data/profiles.json` — a single JSON array of every profile, newest first
- `photos/<id>.<ext>` — one object per uploaded photo

Saving a profile is a read-modify-write cycle. `api/profiles.js` reads the
current JSON along with its ETag, prepends the new profile, and writes it
back with `ifMatch` set to that ETag. If someone else saved in between, the
ETag no longer matches, the SDK throws `BlobPreconditionFailedError`, and the
whole cycle retries (up to 4 times, with backoff) rather than overwriting
their work. When the file does not exist yet there is no ETag to match on, so
that first write uses `allowOverwrite: false` — a second concurrent creator
fails and retries instead of clobbering the first.

## Deployment

Auto-deploys from the `main` branch of
[github.com/kunwarx08/class-website](https://github.com/kunwarx08/class-website).
Push to `main` and Vercel builds it.

Environment variables (Project → Settings → Environment Variables):

| Variable | Notes |
|---|---|
| `SITE_PASSCODE` | The shared class passcode. Defaults to `classroom2026` if unset. |
| `BLOB_READ_WRITE_TOKEN` | Should appear automatically when a Blob store is connected. If it does not, copy it manually from the store's Quickstart / `.env.local` tab. |

Env vars only apply to **new** deployments — after changing one, redeploy
(Deployments → ⋯ → Redeploy).

## Gotchas already hit on this project

Recorded so we don't lose time to them twice:

- **The Blob store must be created as Public.** Access mode is fixed at
  creation and cannot be changed later. This project needs public mode
  because photos are served straight from their blob URL in `<img>` tags. A
  private store would require routing every read through an authenticated
  function. The dashboard defaults to Private, so this is easy to get wrong.
- **`@vercel/blob` must be v2+.** The project was first written against a
  guessed `^0.27.0`, where `ifMatch`, `BlobNotFoundError`, and
  `BlobPreconditionFailedError` do not exist. Every save failed until this
  was corrected. Check the installed version before using any SDK feature.
- **`cacheControlMaxAge` has a 60-second minimum.** Passing `0` throws on
  every write.
- **Node 20+ is required** by the current SDK, hence the `engines` field in
  `package.json`.
- **Connecting a Blob store does not always add `BLOB_READ_WRITE_TOKEN`.**
  Verify it is actually listed before assuming the connection worked.

## How we work together

Agreed after a debugging session that cost more time than it should have:

- **Verify before writing.** Check the current version of a package and its
  official docs before writing code against it — never rely on a
  remembered version number or API shape. The single worst bug in this
  project came from a fabricated dependency version that made every save
  fail regardless of configuration.
- **Test against the real thing before declaring success.** A local mock
  that stubs out the storage layer proves nothing about the storage layer.
  Say plainly what was actually exercised and what was not, and do not call
  something verified when only a stub was tested.
- **Deploy a thin slice early.** Get one real write working against real
  infrastructure before building the rest on top of it, so integration
  failures surface in minutes rather than after the whole feature exists.
- **Read the docs before proposing dashboard fixes.** Several suggested
  steps here were guesses at symptoms of a bug that was actually in our own
  code.
