# Validator Companion release signing

The release script on the operator’s Mac dispatches `sign-companion.yml` for
installers built by `6529-Collections/6529-validator-companion`. The workflow
runs on Core’s `main` branch, and the GitHub user ID in
`COMPANION_SIGNING_ACTOR_ID` identifies the operator who may dispatch and rerun
it. Each signing job checks the operator again on every attempt. This setting
applies to Companion only.

The dispatch identifies the source build run and commit, release version,
channel, target, and phase. It carries an input ZIP checksum, a short-lived
HTTPS download from the private signing bucket, and the operator’s ephemeral
RSA certificate. Set Core’s `COMPANION_SIGNING_BUCKET` and
`COMPANION_SIGNING_REGION` to match the private transfer bucket in `eu-west-1`.

Core checks the bundle’s expected paths, sizes, and checksums. A GitHub-signed
receipt binds the unsigned archive to Companion’s build workflow on `main`.
For Windows setup signing, the receipt binds the assembled installer SHA-256
to Companion’s Windows assembly workflow and to the original build run,
commit, version, and channel. Core checks GitHub’s signature, the workflow,
ref, and release details before signing. Stored receipts can be used during the
14-day build-artifact retention period. The authorized release operator can
retry a handoff with a new ID.

On macOS, Core verifies the app identity and architecture, signs the app,
notarizes and staples the DMG, and checks Gatekeeper. On Windows the first pass
signs the app, both helpers, and the NSIS uninstaller. Companion embeds the
signed uninstaller as a regular installer file. Before signing the finished
installer, Core extracts and compares all four embedded programs byte for byte
and verifies the standalone signatures. No installer is executed on a signer.

Each successful run returns an encrypted `signed.tar.p7m` with the signed files
and their checksums. The release script retrieves and verifies the files on the
Mac and handles subsequent uploads and the Companion update feed.
