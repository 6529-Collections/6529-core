# 6529-Desktop

## Overview

6529 Desktop App supporting Windows, MacOS and Linux

## Structure

### electron-src

This folder holds the code specific to ElectronJS

### renderer

This is a subtree of `6529seize-frontend` repository (https://github.com/6529-Collections/6529seize-frontend)

## Usage

### 6529seize-frontend

#### Get Updates from 6529seize-frontend repository

Checkout branch 'pull-web' and merge main into it (make sure your local main is up to date)

```
git checkout pull-web
git merge main
```

Bootstrap the repo-scoped `6529` wrapper once from the repo root:

```
./bin/6529 bootstrap
```

Then open a new shell, or activate the current one immediately:

```bash
source <(./bin/6529 bootstrap --print-export)
```

Install dependencies for both the Electron repo and the `renderer/` subtree:

```bash
6529 install
```

Do not `cd renderer` for bootstrap or installs in this repo. The supported
entrypoint is the root wrapper only.

Run the following command to fetch new changes from branch `main` of `6529seize-frontend`:

```
6529 pull-web
```

⚠️ Note: there might be conflicts that need resolving

#### Packages

Renderer dependencies are installed from `renderer/package.json`.  
After pulling frontend changes (or on a fresh clone), run:

```bash
6529 install
```

##### Checklist

- start from latest `main`
- checkout branch `pull-web`
- merge `main` into `pull-web`
- run `6529 pull-web`
- resolve conflicts
- run `6529 install`
- update `tailwind.config.js` with any incoming changes from `renderer/tailwind.config.js`
- merge any relevant `renderer/next.config.ts` changes into root `next.config.ts`
- ensure `renderer/next.config.ts` is removed; this repo uses the root Next config overlay

### Running locally - dev

Use:

```bash
6529 install
6529 run dev
```

or if running on a Windows machine:

```bash
6529 install
6529 run dev-win
```

Optional dependency security check:

```bash
6529 run audit-deps
```

The `6529` shim is repo-scoped. After bootstrap it is only injected while your current working directory is inside this repository tree; it is not intended to become a machine-global command.

CI and GitHub Actions now use the same root pnpm flow. There is no separate
npm bootstrap path for Windows signing or CloudFront invalidation jobs.

## Building and Publishing

> ⚠️ **IMPORTANT:** Before building and publishing a new version of the app, make sure to **update the version in `package.json`**.
> If you skip this step, the previous version may be overwritten and the `electron-updater` will not function correctly.

### Desktop Backend Targets

Desktop distribution scripts take an optional backend target argument:

- default or `live`: use the live backend
- `test`: use the staging/test backend

The backend target is separate from the app environment (`local`, `staging`, or
`production`). The app environment still controls the package config, protocol
scheme, update channel, and splash/titlebar app label. The backend target only
controls the API and WebSocket endpoints, plus the staging access header when
building against Test.

Live backend:

```bash
API_ENDPOINT=https://api.6529.io
WS_ENDPOINT=wss://ws.6529.io
```

Test backend:

```bash
API_ENDPOINT=https://api.staging.6529.io
WS_ENDPOINT=wss://ws.staging.6529.io
```

Examples:

```bash
6529 run dist-mac-local          # Local app, Live backend; label: (Local)
6529 run dist-mac-local test     # Local app, Test backend; label: (Local - Test)
6529 run dist-mac-staging        # Staging app, Live backend; label: (Staging)
6529 run dist-mac-staging test   # Staging app, Test backend; label: (Staging - Test)
6529 run dist-mac-production     # Production app, Live backend; no label suffix
```

Production app builds must not target the Test backend. Commands such as
`6529 run dist-mac-production test` fail immediately before build work starts.
The same optional `live`/`test` argument applies to the Windows, macOS, and
Linux `dist-*` scripts.

Test backend builds require a local staging access key:

```bash
# .env.local, never committed
STAGING_API_KEY=your-staging-access-key
```

`.env.local` is gitignored. The key is baked only for `test` backend builds.
Live backend builds intentionally omit `STAGING_API_KEY`, even if it exists in
the local shell or `.env.local`.

### Rebuilding SQL

This project uses `better-sqlite3`
When changing between building different platforms, you need to rebuild this package first by running:

```
6529 run rebuild-sql
```

Use the following steps to build for each platform:

### Windows

#### Build

Staging

```
6529 run dist-win-staging-upload
```

Production

```
6529 run dist-win-production-upload
```

The above commands will:

- build the project (renderer + electron-src)
- run `electron-builder` which will create Windows related artifacts
- upload artifacts to S3 at location `6529bucket/6529-staging-core-app/win-unsigned/` or `6529bucket/6529-core-app/win-unsigned/`

#### Sign

Use [**Build All Platforms** GitHub workflow](https://github.com/6529-Collections/6529-core/actions/workflows/build-all-platforms.yml)

- Branch: select your branch
- Environment: select between Staging or Production
- Version: type version to build (must match the new version in package.json)
- Flow: Sign Windows

### MacOS

Staging

```
6529 run dist-mac-staging
```

Production

```
6529 run dist-mac-production
```

Packaged versions: arm64 (silicon), x64 (intel)

### Linux

Use [**Build All Platforms** GitHub workflow](https://github.com/6529-Collections/6529-core/actions/workflows/build-all-platforms.yml)

- Branch: select your branch
- Environment: select between Staging or Production
- Version: type version to build (must match the new version in package.json)
- Flow: Linux

### Publish Links

Once all 3 platforms are built, we publish the downloads links per platform / packaged version in html pages saved on S3. To do this use Use [**Build All Platforms** GitHub workflow](https://github.com/6529-Collections/6529-core/actions/workflows/build-all-platforms.yml)

- Branch: select your branch
- Environment: select between Staging or Production
- Version: type version to build (must match the new version in package.json)
- Flow: Publish

The above will extract the latest download links per platform and create html pages per platform for this new version on s3 in the following format:
`https://d3lqz0a4bldqgf.cloudfront.net/6529-core-app/<os>/links/<version>.html`
You should get 3 html links (one per platform) which can be shared on Brain in the [6529 Desktop Releases Wave](https://6529.io/waves?wave=a871e152-5567-4407-80cc-382b475bee1a).
Note: the above github workflow will create links both to s3 and arweave and add them to the htmls automatically.
