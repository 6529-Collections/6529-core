# 6529-CORE

## Overview

6529 Core Desktop App supporting Windows, MacOS and Linux

## Structure

### electron-src

This folder holds the code specific to ElectronJS

### renderer

This is a subtree of `6529seize-frontend` repository (https://github.com/6529-Collections/6529seize-frontend)

## Usage

### 6529seize-frontend

#### Get Updates

Run the following script to fetch new changes from branch 'main' of 6529seize-frontend repository

```
npm run pull-web
```

Note: there might be conflicts that need resolving

#### Packages

Any package in this repository's package.json needs to be duplicated in the root package.json - this has to do with electron-builder not detecting the required dependencies of subtrees properly during build phase so it needs to be done in the root package.json

### Running locally - dev

Use:

```
npm run dev
```

or if running on a windows machine:

```
npm run dev-win
```

### Rebuilding SQL

This project uses `better-sqlite3`
When changing between building different platform versions, you need to rebuild this package first by running:

```
npm run rebuild-sql
```

## Building and Publishing

> ⚠️ **IMPORTANT:** Before building and publishing a new version of the app, make sure to **update the version in `package.json`**.  
> If you skip this step, the previous version may be overwritten and the `electron-updater` will not function correctly.

### Build via GitHub Workflow

Instead of building locally, you can now use the [**Build All Platforms** GitHub workflow](https://github.com/6529-Collections/6529-core/actions/workflows/build-all-platforms.yml) to compile and optionally publish the app for multiple platforms.

To trigger the workflow:

1. Visit the [Build All Platforms workflow](https://github.com/6529-Collections/6529-core/actions/workflows/build-all-platforms.yml).
2. Click **"Run workflow"** (you must be logged in and have the necessary permissions).
3. Fill in the required inputs:

#### Workflow Inputs

- **env** (required): Choose the target environment.

  - `Staging` – Build for internal testing.
  - `Production` – Build for public release.

- **version** (required): The version number to build, e.g. `1.3.0`.  
  This **must exactly match** the `version` field in the `package.json` of the checked-out branch.  
  This ensures consistency and avoids accidental mismatches in published versions.

- **os** (required): Select which platforms to build or trigger publish logic for.
  - `All` – Build for macOS (x64 + arm64), Windows, and Linux.
  - `MacOS` – Only build macOS binaries.
  - `Windows` – Only build the Windows binary.
  - `Linux` – Only build the Linux binary.
  - `Publish` – Runs custom logic to prepare the app for public distribution. It performs the following steps:
    - Fetches the latest build artifacts for each platform.
    - Creates and publishes **custom HTML download pages per platform** (e.g. macOS, Windows, Linux).
    - Uploads the artifacts to **Arweave** for permanent storage.
    - Updates the distribution pages to also include **Arweave download links**, allowing users to fetch the app from both your CDN and the decentralized web.

### Build Manually

Use the following commands to build for each platform:

### Windows

```
npm run dist-win
```

Packaged versions: x64, x32, arm, universal

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

Staging

```
npm run dist-linux-staging
```

Production

```
npm run dist-linux-production
```

### Publishing

The project is configured to publish the new version to s3. Each platform has its dedicated folder on S3:

- /win
- /mac
- /linux

## Windows Publish Process

### Build

Staging

```
npm run dist-win-staging
```

Production

```
npm run dist-win-production
```

The above command will:

- build the project (renderer + electron-src)
- run `electron-builder` which will create Windows related artifacts
- upload artifacts to S3 at location `6529bucket/6529-core-app/win-unsigned/`

### Sign

The following must be run on the dedicated 6529 Core Windows EC2 instance `i-06a5dc2fe0d6a9f00` (Use Microsoft Remote Desktop)

In Command prompt cd to project directory and run the sign command:

Staging

```
cd  C:\Users\Administrator\Desktop\6529-core
npm run sign-publish-staging-win
```

Production

```
cd  C:\Users\Administrator\Desktop\6529-core
npm run sign-publish-production-win
```

The above command will:

- download the artifacts from `6529bucket/6529-core-app/win-unsigned/`
- sign the artifacts
- update the latest.yml to match the new sha512 of the artifacts
- upload signed artifacts to S3 at location `6529bucket/6529-core-app/win/`
  (the above upload in this location will trigger the 'autoupdater' functionality of the app)
