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

Run the following script to fetch new changes from branch 'main' of 6529seize-frontend repository

```
npm run pull-web
```

⚠️ Note: there might be conflicts that need resolving

#### Packages

Renderer dependencies are installed from `renderer/package.json`.  
After pulling frontend changes (or on a fresh clone), run:

```
npm run deps
```

##### Checklist

- start from latest `main`
- checkout branch `pull-web`
- merge `main` into `pull-web`
- run `npm run pull-web`
- resolve conflicts
- run `npm run deps`
- update `tailwind.config.js` with any incoming changes from `renderer/tailwind.config.js`
- update root `next.config.mjs` with any related changes from `renderer/next.config.mjs` and delete file `renderer/next.config.mjs`

### Running locally - dev

Use:

```
npm run deps
npm run dev
```

or if running on a windows machine:

```
npm run deps
npm run dev-win
```

Optional dependency security check:

```
npm run audit-deps
```

CI note: workflows intentionally use deterministic installs with `npm ci` and then `npm run install-renderer-deps`.

## Building and Publishing

> ⚠️ **IMPORTANT:** Before building and publishing a new version of the app, make sure to **update the version in `package.json`**.  
> If you skip this step, the previous version may be overwritten and the `electron-updater` will not function correctly.

### Rebuilding SQL

This project uses `better-sqlite3`
When changing between building different platforms, you need to rebuild this package first by running:

```
npm run rebuild-sql
```

Use the following steps to build for each platform:

### Windows

#### Build

Staging

```
npm run dist-win-staging-upload
```

Production

```
npm run dist-win-production-upload
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
npm run dist-mac-staging
```

Production

```
npm run dist-mac-production
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
