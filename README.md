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

This project used `better-sqlite3`
When changing between building different platform versions, you need to rebuild this package first by running:

```
npm run rebuild-sql
```

## Building and Publishing

IMPORTANT: In order to build and publish a new version of tha app, first you have to update the version of package.json, otherwise the previous version will be overriden and the electron-updater will not work properly!

Use the following commands to build for each platform:

### Windows

```
npm run dist-win
```

Packaged versions: x64, x32, arm, universal

### MacOS

```
npm run dist-mac
```

Packaged versions: arm64 (silicon), x64 (intel)

### Linux

```
npm run dist-linux
```

### Publishing

The project is configured to publish the new version to s3. Each platform has its dedicated folder on S3:

- /win
- /mac
- /linux
