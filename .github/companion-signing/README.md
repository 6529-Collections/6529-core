# Validator Companion release signing

The `sign-companion.yml` workflow accepts the release inputs produced by
`6529-Collections/6529-validator-companion` on `main` once that repository is set up. The
Companion release workflow dispatches it for each selected target.

The dispatch identifies the Companion run and attempt, version, channel, target,
phase, and commit. It supplies the unsigned ZIP’s SHA-256, a time-limited HTTPS
download from the configured signing bucket, and an RSA certificate for the return
artifact. Set the Core repository variables `COMPANION_SIGNING_BUCKET` and
`COMPANION_SIGNING_REGION` to match Companion’s private transfer bucket. Only the
authorized Companion release role should write to the
`6529-validator-companion/signing/` prefix. The Actions credential used for dispatch
must be entrusted with requesting release signatures.

Core checks the input against the target-specific paths, checksums, and release
metadata. The Mac signing job also verifies the app identity and exact architecture.
It uses the existing Developer ID identity, notarizes the signed DMG, staples the
ticket, and checks Gatekeeper. On Windows, `payload` signs the app, both helpers, and
the NSIS uninstaller. Companion reassembles the per-machine installer with those
signed files. In the `installer` phase, Core verifies the signed payloads, compares
the embedded binaries, and signs Setup.exe. The workflow uses Core’s existing Apple
notary and Azure Key Vault credentials.

Each successful run returns `signed-companion`, an encrypted `signed.tar.p7m` with
the signed files and their checksums. Companion retrieves and verifies it before
offering the final installer as a release artifact. Companion handles the later
publication to S3 and the update feed.
