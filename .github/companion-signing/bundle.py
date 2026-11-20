"""Validate the Companion release input and encrypt the signed output."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.parse
import urllib.request
import zipfile

from provenance import NoRedirects, verify_artifact


WORK = Path(os.environ["RUNNER_TEMP"]) / "companion-signing"
LIMIT = 256 * 1024 * 1024
WINDOWS_PROGRAMS = {
    "windows/companion-windows.exe",
    "windows/helpers/companion-host.exe",
    "windows/helpers/companion-iroh-transport.exe",
    "windows/nsis/uninstall.exe",
}


def digest(path):
    with path.open("rb") as contents:
        return hashlib.file_digest(contents, "sha256").hexdigest()


def validate_request(inputs):
    version, channel, target, phase = (inputs[key] for key in ("version", "channel", "target", "phase"))
    if not re.fullmatch(r"(?:0|[1-9][0-9]{0,4})(?:\.(?:0|[1-9][0-9]{0,4})){2}", version):
        raise ValueError("Invalid release version.")
    if max(map(int, version.split("."))) > 65535 or channel not in {"test", "stable"}:
        raise ValueError("Version or channel is outside the release contract.")
    if phase not in {"payload", "installer"} or target not in {"mac-arm64", "mac-x64", "windows-x64"}:
        raise ValueError("Invalid signing phase or target.")
    if phase == "installer" and target != "windows-x64":
        raise ValueError("Only Windows uses the installer signing phase.")
    if not re.fullmatch(r"[a-f0-9]{40}", inputs["commit"]) or not re.fullmatch(r"[a-f0-9]{64}", inputs["bundle_sha256"]):
        raise ValueError("Expected a source commit and archive SHA-256.")
    if not re.fullmatch(r"[1-9][0-9]*-[1-9][0-9]*-" + target + "-" + phase, inputs["handoff_id"]):
        raise ValueError("Invalid handoff ID.")


def expected_paths(inputs):
    suffix = "-test" if inputs["channel"] == "test" else ""
    name = f"6529-validator-companion-v{inputs['version']}{suffix}"
    if inputs["target"] == "windows-x64":
        return f"windows/{name}.exe", WINDOWS_PROGRAMS
    return f"macos/{name}.dmg", set()


def fetch_bundle(inputs, archive):
    url = urllib.parse.urlsplit(inputs["bundle_url"])
    bucket, region = os.environ["SIGNING_BUCKET"], os.environ["SIGNING_REGION"]
    if (not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket) or bucket == "6529bucket"
            or region != "eu-west-1"):
        raise ValueError("Configure the private signing transfer bucket.")
    expected_host = f"{bucket}.s3.{region}.amazonaws.com"
    expected_key = f"/6529-validator-companion/signing/{inputs['handoff_id']}/{inputs['bundle_sha256']}.zip"
    if url.scheme != "https" or url.netloc != expected_host or url.path != expected_key or not url.query or url.fragment:
        raise ValueError("The signing input must come from the configured private transfer path.")
    print(f"::add-mask::{inputs['bundle_url']}", flush=True)
    try:
        opener = urllib.request.build_opener(NoRedirects)
        with opener.open(inputs["bundle_url"], timeout=120) as response, archive.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                if output.tell() + len(chunk) > LIMIT:
                    raise ValueError("Input bundle is too large.")
                output.write(chunk)
    except OSError:
        raise ValueError("Could not download the signing input.") from None
    if digest(archive) != inputs["bundle_sha256"]:
        raise ValueError("Signing input checksum mismatch.")


def unpack(inputs, archive, dest):
    installer, programs = expected_paths(inputs)
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if sorted(entry.filename for entry in entries) != sorted({"build-info.json", installer} | programs):
            raise ValueError("Signing bundle paths do not match the Companion allowlist.")
        if sum(entry.file_size for entry in entries) > LIMIT or bundle.getinfo("build-info.json").file_size > 16384:
            raise ValueError("Signing input contents are too large.")
        info = json.loads(bundle.read("build-info.json"))
        if (not isinstance(info, dict) or not isinstance(info.get("installer"), dict)
                or not isinstance(info.get("programs"), list)
                or not all(isinstance(entry, dict) for entry in info["programs"])):
            raise ValueError("Invalid signing catalog structure.")
        source = {"ref": "refs/heads/main", "commit": inputs["commit"]}
        if (info["source"] != source or info["product"] != "6529 Validator Companion" or info["schema"] != 1
                or any(info[key] != inputs[key] for key in ("version", "channel", "target"))):
            raise ValueError("Signing input metadata does not match the requested release.")
        platform, arch = inputs["target"].split("-", 1)
        expected_platform = "macos" if platform == "mac" else platform
        if (info["platform"], info["architecture"]) != (expected_platform, arch):
            raise ValueError("Wrong platform or architecture.")
        records = [info["installer"], *info["programs"]]
        if info["installer"]["path"] != installer or sorted(entry["path"] for entry in records) != sorted({installer} | programs):
            raise ValueError("Missing or unexpected file in the signing catalog.")
        # Extract only the exact catalog paths checked against the allowlist above.
        for entry in records:
            path = dest / entry["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(entry["path"]) as contents, path.open("wb") as file:
                shutil.copyfileobj(contents, file)
            if not path.stat().st_size or path.stat().st_size != entry["size"] or digest(path) != entry["sha256"]:
                raise ValueError(f"Invalid signing input: {entry['path']}")
    return info


def openssl(*arguments, **kwargs):
    binary = shutil.which("openssl")
    if binary is None and os.name == "nt":
        binary = str(Path(os.environ["ProgramFiles"]) / "Git/usr/bin/openssl.exe")
    return subprocess.run([binary or "openssl", *arguments], check=True, **kwargs)


def receive(inputs):
    validate_request(inputs)
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir()
    # An authorized operator supplies an ephemeral certificate for the return artifact.
    certificate = WORK / "recipient.pem"
    pem = inputs["recipient_cert"].strip()
    if not re.fullmatch(r"-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----", pem):
        raise ValueError("Invalid recipient certificate.")
    certificate.write_text(pem + "\n", encoding="ascii")
    details = openssl("x509", "-in", str(certificate), "-noout", "-text", "-checkend", "3600",
                      capture_output=True, text=True).stdout
    if "Public Key Algorithm: rsaEncryption" not in details or not re.search(r"Public-Key: \((2048|3072|4096) bit\)", details):
        raise ValueError("Expected an RSA recipient certificate with at least 2048 bits.")
    archive = WORK / "input.zip"
    fetch_bundle(inputs, archive)
    info = unpack(inputs, archive, WORK / "input")
    verify_artifact(inputs, info["installer"]["sha256"], WORK, openssl)
    (WORK / "build-info.json").write_text(json.dumps(info), encoding="utf-8")


def send(inputs):
    installer, programs = expected_paths(inputs)
    paths = programs if inputs["target"] == "windows-x64" and inputs["phase"] == "payload" else {installer}
    output = WORK / "out"
    if sorted(path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()) != sorted(paths):
        raise ValueError("Signing output paths do not match the release contract.")
    result = {key: inputs[key] for key in ("channel", "version", "target", "phase", "commit", "handoff_id", "bundle_sha256")}
    result["files"] = [{"path": path, "size": (output / path).stat().st_size, "sha256": digest(output / path)}
                       for path in sorted(paths)]
    receipt = WORK / "signed.json"
    receipt.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    archive = WORK / "signed.tar"
    with tarfile.open(archive, "w") as bundle:
        bundle.add(receipt, arcname="signed.json")
        for path in sorted(paths):
            bundle.add(output / path, arcname=path)
    openssl("cms", "-encrypt", "-binary", "-aes256", "-in", str(archive), "-outform", "DER",
            "-out", str(WORK / "signed.tar.p7m"), str(WORK / "recipient.pem"))


if __name__ == "__main__":
    try:
        inputs = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))["inputs"]
        {"receive": receive, "send": send}[sys.argv[1]](inputs)
    except (KeyError, TypeError, ValueError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        sys.exit(f"Signing transfer failed: {error}")
