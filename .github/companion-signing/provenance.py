"""Verify a GitHub-signed receipt for a Companion build or Windows assembly."""

import base64
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.request import build_opener, HTTPRedirectHandler


ISSUER = "https://token.actions.githubusercontent.com"
# jwks_uri advertised by the issuer's /.well-known/openid-configuration.
JWKS_URL = f"{ISSUER}/.well-known/jwks"
REPO = "6529-Collections/6529-validator-companion"
AUDIENCE = "urn:6529:validator-companion"
RECEIPT_AGE = 14 * 24 * 60 * 60  # Same retention as the unsigned build.


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def decode(value):
    if not isinstance(value, str):
        raise ValueError("Invalid GitHub receipt encoding.")
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def der(tag, value):
    length = len(value)
    if length < 128:
        size = bytes([length])
    else:
        encoded = length.to_bytes((length.bit_length() + 7) // 8, "big")
        size = bytes([128 | len(encoded)]) + encoded
    return bytes([tag]) + size + value


def public_key(jwk):
    # Use a SubjectPublicKeyInfo PEM for OpenSSL and macOS system LibreSSL.
    def integer(name):
        value = decode(jwk[name]).lstrip(b"\0")
        if not value:
            raise ValueError("Invalid GitHub RSA key.")
        return der(2, (b"\0" if value[0] & 128 else b"") + value)

    rsa = der(48, integer("n") + integer("e"))
    rsa_algorithm = bytes.fromhex("300d06092a864886f70d0101010500")  # rsaEncryption with NULL parameters
    encoded = base64.b64encode(der(48, rsa_algorithm + der(3, b"\0" + rsa)))
    lines = [encoded[offset:offset + 64] for offset in range(0, len(encoded), 64)]
    return b"\n".join([b"-----BEGIN PUBLIC KEY-----", *lines, b"-----END PUBLIC KEY-----", b""])


def github_key(key_id):
    with build_opener(NoRedirects).open(JWKS_URL, timeout=25) as response:
        keys = json.loads(response.read(131072))["keys"]
    matches = [key for key in keys if key.get("kid") == key_id and key.get("kty") == "RSA"]
    if len(matches) != 1:
        raise ValueError("The artifact receipt does not reference a current GitHub key.")
    return matches[0]


def source_pull_request(ref, channel):
    if ref == "refs/heads/main":
        return None
    match = re.fullmatch(r"refs/pull/([1-9][0-9]*)/head", ref) if isinstance(ref, str) else None
    if channel != "test" or match is None:
        raise ValueError("Only Test releases may use a Companion pull request as source.")
    return match[1]


def verify_claims(claims, inputs, source_ref, build_run_id, installer_digest, now):
    pull_request = source_pull_request(source_ref, inputs["channel"])
    expected = {
        "iss": ISSUER,
        "repository": REPO,
        "ref": "refs/heads/main",
        "event_name": "workflow_dispatch",
        "runner_environment": "github-hosted",
    }
    if inputs["phase"] == "payload":
        checksum = inputs["bundle_sha256"]
        audience = f"{AUDIENCE}:build:{checksum}"
        if pull_request is None:
            # Both Test and Stable can use main. The main receipt binds the
            # whole catalog by digest and pins the workflow SHA to its commit.
            expected["sha"] = inputs["commit"]
        else:
            audience = (f"{AUDIENCE}:test-pr-build:{pull_request}:{inputs['commit']}:"
                        f"{inputs['version']}:{inputs['channel']}:{checksum}")
        expected |= {
            "workflow_ref": f"{REPO}/.github/workflows/build-desktop.yml@refs/heads/main",
            "aud": audience,
            "run_id": build_run_id,
        }
    else:
        audience = (f"{AUDIENCE}:windows-assembly:{build_run_id}:{inputs['commit']}:"
                    f"{inputs['version']}:{inputs['channel']}:{installer_digest}")
        if pull_request is not None:
            audience = (f"{AUDIENCE}:test-pr-windows-assembly:{build_run_id}:{pull_request}:"
                        f"{inputs['commit']}:{inputs['version']}:{inputs['channel']}:{installer_digest}")
        expected |= {
            "workflow_ref": f"{REPO}/.github/workflows/assemble-windows.yml@refs/heads/main",
            "aud": audience,
        }
    if any(claims.get(field) != value for field, value in expected.items()):
        raise ValueError("GitHub did not attest this artifact from the expected Companion workflow.")
    issued, expires = claims["iat"], claims["exp"]
    # The receipt proves what the runner produced, and is not used to log in.
    # Permit stored receipts within artifact retention so a release can be held.
    if (type(issued) is not int or type(expires) is not int or not issued < expires
            or not now - RECEIPT_AGE <= issued <= now + 60):
        raise ValueError("The GitHub artifact receipt is outside its accepted build age.")


def verify_artifact(inputs, source_ref, build_run_id, installer_digest, work: Path, openssl):
    receipt = inputs["artifact_attestation"]
    if not isinstance(receipt, str) or len(receipt) > 16384:
        raise ValueError("Expected a bounded GitHub artifact receipt.")
    header, payload, signature = receipt.split(".")
    metadata = json.loads(decode(header))
    if (not isinstance(metadata, dict) or metadata.get("alg") != "RS256"
            or not isinstance(metadata.get("kid"), str)):
        raise ValueError("Expected a GitHub RSA receipt.")
    key = work / "github-receipt-key.pem"
    key.write_bytes(public_key(github_key(metadata["kid"])))
    signature_file = work / "github-receipt.sig"
    signature_file.write_bytes(decode(signature))
    message = work / "github-receipt.txt"
    message.write_text(f"{header}.{payload}", encoding="ascii")
    try:
        openssl("dgst", "-sha256", "-verify", str(key),
                "-signature", str(signature_file), str(message), capture_output=True)
    except subprocess.CalledProcessError:
        raise ValueError("The GitHub artifact receipt signature is invalid.") from None
    claims = json.loads(decode(payload))
    if not isinstance(claims, dict):
        raise ValueError("Invalid GitHub artifact receipt claims.")
    verify_claims(claims, inputs, source_ref, build_run_id, installer_digest, int(time.time()))
