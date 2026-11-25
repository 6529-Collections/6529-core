import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import provenance


MAIN = "refs/heads/main"
PR = "refs/pull/12/head"
COMMIT = "a" * 40
DIGEST = "b" * 64
RUN = "108"
NOW = 100000


class CompanionProvenanceTests(unittest.TestCase):
    def verify(self, workflow, audience, inputs, ref):
        claims = {
            "iss": provenance.ISSUER,
            "repository": provenance.REPO,
            "ref": MAIN,
            "event_name": "workflow_dispatch",
            "runner_environment": "github-hosted",
            "workflow_ref": f"{provenance.REPO}/.github/workflows/{workflow}.yml@{MAIN}",
            "run_id": RUN,
            "sha": COMMIT if ref == MAIN else "c" * 40,
            "aud": f"{provenance.AUDIENCE}:{audience}",
            "iat": NOW - 60,
            "exp": NOW + 60,
        }
        provenance.verify_claims(claims, inputs, ref, RUN, DIGEST, NOW)

    def test_main_receipt_supports_both_channels(self):
        for channel in ("test", "stable"):
            inputs = {"phase": "payload", "commit": COMMIT, "channel": channel, "bundle_sha256": DIGEST}
            self.verify("build-desktop", f"build:{DIGEST}", inputs, MAIN)

    def test_pr_receipts_bind_source_channel_and_digest(self):
        inputs = {"commit": COMMIT, "channel": "test", "version": "1.2.3", "bundle_sha256": DIGEST}
        for workflow, phase, prefix in (
            ("build-desktop", "payload", "test-pr-build"),
            ("assemble-windows", "installer", f"test-pr-windows-assembly:{RUN}"),
        ):
            request = inputs | {"phase": phase}
            audience = f"{prefix}:12:{COMMIT}:1.2.3:test:{DIGEST}"
            self.verify(workflow, audience, request, PR)
            for wrong_ref in (MAIN, "refs/pull/13/head", "refs/heads/feature"):
                with self.subTest(phase=phase, ref=wrong_ref), self.assertRaises(ValueError):
                    self.verify(workflow, audience, request, wrong_ref)
            with self.assertRaises(ValueError):
                self.verify(workflow, audience, request | {"channel": "stable"}, PR)
            with self.assertRaises(ValueError):
                self.verify(workflow, audience[:-64] + "d" * 64, request, PR)

    def test_signer_uses_the_catalog_source_when_verifying(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"RUNNER_TEMP": tmp}):
            import bundle

            work = Path(tmp) / "handoff"
            inputs = {"phase": "payload", "commit": COMMIT, "channel": "test", "version": "1.2.3",
                      "target": "mac-arm64", "bundle_sha256": DIGEST, "handoff_id": f"{RUN}-1-mac-arm64-payload",
                      "recipient_cert": "-----BEGIN CERTIFICATE-----\nYQ==\n-----END CERTIFICATE-----"}
            archive_path, _ = bundle.expected_paths(inputs)
            installer = Path(tmp) / "sample.dmg"
            installer.write_bytes(b"fixture")

            def copy_fixture(_, archive):
                info = {"product": "6529 Validator Companion", "schema": 1, "source": {"ref": PR, "commit": COMMIT},
                        "version": "1.2.3", "channel": "test", "target": "mac-arm64", "platform": "macos",
                        "architecture": "arm64", "programs": [],
                        "installer": {"path": archive_path, "sha256": bundle.digest(installer), "size": 7}}
                with zipfile.ZipFile(archive, "w") as bundle_zip:
                    bundle_zip.writestr("build-info.json", json.dumps(info))
                    bundle_zip.write(installer, archive_path)

            other_pr = f"test-pr-build:13:{COMMIT}:1.2.3:test:{DIGEST}"
            with (patch.object(bundle, "WORK", work),
                  patch.object(bundle, "fetch_bundle", side_effect=copy_fixture),
                  patch.object(bundle, "openssl") as openssl,
                  patch.object(bundle, "verify_artifact", side_effect=lambda request, ref, *_:
                               self.verify("build-desktop", other_pr, request, ref))):
                openssl.return_value.stdout = "Public Key Algorithm: rsaEncryption\nPublic-Key: (2048 bit)"
                with self.assertRaisesRegex(ValueError, "GitHub did not attest"):
                    bundle.receive(inputs)


if __name__ == "__main__":
    unittest.main()
