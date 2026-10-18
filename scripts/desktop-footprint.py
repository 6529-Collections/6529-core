"""Footprint of a packaged 6529 desktop build (6529-core, Electron).

Vendored from the 6529chain design repository,
design/evidence/desktop-footprint.py (2026-10-15), for the desktop size
budget (scripts/helpers/size-budget.cjs). Local additions: the
--max-total-mb budget and --json OUT. Keep it standard-library only.

Research script, not product code. Python standard library only; no network
access. It reads an unpacked electron-builder output folder (for example
`dist/win-unpacked`), parses `resources/app.asar`'s header directly (the
Chromium pickle format: two little-endian uint32 size words, then a JSON
index of every file with its size), and sorts every byte into one category:

- the Electron and Chromium runtime outside `resources/`;
- build and lint tooling that ships by mistake (ESLint, Babel, the SWC
  compiler, TypeScript and the like, matched on the innermost package name);
- the Next.js framework, the Next server output, the client bundles,
  the frontend's public assets (review data split out);
- the main-process code, other runtime packages, native modules unpacked
  beside the asar, and bundled binaries such as IPFS Kubo.

It also reports cross-cutting waste (source maps, type declarations,
copies of the same package file in several places) and writes no absolute
paths, so its JSON can be committed.

Usage:

  python scripts/desktop-footprint.py selftest
  python scripts/desktop-footprint.py measure PATH [--label LABEL] [--write]
      [--json OUT]
  python scripts/desktop-footprint.py check PATH [--max-tooling-mb N]
      [--max-maps-mb N] [--max-duplicates-mb N] [--max-files N]
      [--max-total-mb N] [--json OUT]

`--write` saves `desktop-footprint-LABEL.json` beside this script; `--json
OUT` saves it at OUT instead. `check` prints the same report and exits 1
when a given budget is exceeded, for use in CI. Output uses LF line ends on
every platform.
"""

import json
import os
import struct
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MB = 1_000_000

# Packages that build or lint the app and are never needed at run time.
# Matched on the innermost package of a path, so a Babel copy nested under
# an ESLint plugin counts as tooling.
TOOLING_EXACT = {
    "typescript", "esbuild", "rollup", "terser", "webpack", "prettier",
    "autoprefixer", "tailwindcss", "browserslist",
    "@electron/notarize", "electron-builder",
    "app-builder-lib", "app-builder-bin", "dmg-builder", "7zip-bin",
    "eslint", "ts-node", "tsx", "jest", "vitest", "@playwright/test",
    "playwright", "playwright-core", "lightningcss",
}
TOOLING_PREFIX = (
    "eslint-", "@eslint/", "@typescript-eslint/", "@babel/", "@next/swc-",
    "@swc/", "@esbuild/", "@rollup/", "@types/", "postcss-",
    "@tailwindcss/", "tailwind-", "lightningcss-", "@jest/", "babel-",
)

# Runtime dependencies of the `next` package itself (next@16), counted with
# the framework rather than as tooling even where their names look like it.
NEXT_RUNTIME = {
    "@next/env", "@swc/helpers", "baseline-browser-mapping", "caniuse-lite",
    "postcss", "styled-jsx",
}

CATEGORIES = [
    ("runtime", "Electron and Chromium runtime"),
    ("tooling", "Build and lint tooling"),
    ("next", "Next.js framework packages"),
    ("next-server", "Next server output (SSR, prerendered pages)"),
    ("next-static", "Next client bundles"),
    ("review-data", "Frontend public review data"),
    ("public", "Frontend public assets"),
    ("main", "Main-process code"),
    ("packages", "Other runtime packages"),
    ("binaries", "Bundled binaries (resources outside the asar)"),
    ("other", "Everything else"),
]


def innermost_package(parts):
    """Return the package name of the deepest node_modules segment, or None."""
    for i in range(len(parts) - 1, -1, -1):
        if parts[i] == "node_modules" and i + 1 < len(parts):
            name = parts[i + 1]
            if name.startswith("@") and i + 2 < len(parts):
                name = name + "/" + parts[i + 2]
            return name, i
    return None, None


def is_tooling(pkg):
    return pkg in TOOLING_EXACT or pkg.startswith(TOOLING_PREFIX)


def classify(rel):
    """Category key for a path inside the app (asar or asar.unpacked)."""
    parts = rel.split("/")
    pkg, _ = innermost_package(parts)
    if pkg is not None:
        if pkg in NEXT_RUNTIME:
            return "next"
        if is_tooling(pkg):
            return "tooling"
        if pkg == "next" or pkg.startswith("@next/"):
            return "next"
        return "packages"
    if rel.startswith("renderer/out/server/") or rel.startswith(
            "renderer/.next/server/"):
        return "next-server"
    if rel.startswith("renderer/out/static/") or rel.startswith(
            "renderer/.next/static/"):
        return "next-static"
    if rel.startswith("renderer/public/review-data/"):
        return "review-data"
    if rel.startswith("renderer/public/"):
        return "public"
    if rel.startswith("main/"):
        return "main"
    return "other"


def read_asar_index(path):
    """Parse an asar header. Return {relative path: (size, unpacked)}."""
    with open(path, "rb") as f:
        head = f.read(8)
        if len(head) != 8:
            raise ValueError("not an asar archive: %s" % path)
        word, header_size = struct.unpack("<II", head)
        if word != 4:
            raise ValueError("unexpected asar size pickle: %d" % word)
        header = f.read(header_size)
    _payload, json_len = struct.unpack("<II", header[:8])
    index = json.loads(header[8:8 + json_len].decode("utf-8"))
    files = {}

    def walk(node, prefix):
        for name, child in node.get("files", {}).items():
            rel = prefix + name
            if "files" in child:
                walk(child, rel + "/")
            elif "link" in child:
                continue
            else:
                files[rel] = (int(child.get("size", 0)),
                              bool(child.get("unpacked", False)))

    walk(index, "")
    return files


def tree_sizes(root):
    """Yield (relative posix path, size) for every regular file under root."""
    root = Path(root)
    for dirpath, _dirs, names in os.walk(root):
        for name in names:
            p = Path(dirpath) / name
            if p.is_symlink():
                continue
            yield p.relative_to(root).as_posix(), p.stat().st_size


def find_resources(build):
    build = Path(build)
    for cand in (build / "resources",
                 build / "Contents" / "Resources",
                 *sorted(build.glob("*.app/Contents/Resources"))):
        if (cand / "app.asar").is_file():
            return cand
    raise SystemExit("no resources/app.asar under %s" % build)


def measure(build):
    build = Path(build)
    res = find_resources(build)
    totals = {key: 0 for key, _ in CATEGORIES}
    top = {}
    runtime_files = {}
    by_ext = {".map": 0, ".d.ts": 0, ".md": 0}
    copies = {}

    def add(rel, size, where):
        cat = classify(rel)
        totals[cat] += size
        parts = rel.split("/")
        pkg, i = innermost_package(parts)
        if pkg is not None:
            key = (cat, pkg)
            inner = "/".join(parts[i + 1 + (2 if pkg.startswith("@") else 1):])
            copies.setdefault((pkg, inner, size), set()).add(
                "/".join(parts[:i]) or ".")
        else:
            key = (cat, "/".join(parts[:3]))
        top[key] = top.get(key, 0) + size
        for ext in by_ext:
            if rel.endswith(ext):
                by_ext[ext] += size
        return where

    asar = read_asar_index(res / "app.asar")
    packed = sum(s for s, u in asar.values() if not u)
    for rel, (size, unpacked) in asar.items():
        if not unpacked:
            add(rel, size, "asar")
    unpacked_dir = res / "app.asar.unpacked"
    unpacked_total = 0
    if unpacked_dir.is_dir():
        for rel, size in tree_sizes(unpacked_dir):
            unpacked_total += size
            add(rel, size, "unpacked")

    binaries = 0
    for rel, size in tree_sizes(res):
        first = rel.split("/")[0]
        if first in ("app.asar", "app.asar.unpacked"):
            continue
        binaries += size
        top[("binaries", first)] = top.get(("binaries", first), 0) + size
    totals["binaries"] = binaries

    runtime = 0
    for rel, size in tree_sizes(build):
        if rel.startswith(res.relative_to(build).as_posix() + "/"):
            continue
        runtime += size
        head = rel.split("/")[0]
        runtime_files[head] = runtime_files.get(head, 0) + size
    totals["runtime"] = runtime

    duplicate_excess = 0
    for (_pkg, _inner, size), places in copies.items():
        if len(places) > 1:
            duplicate_excess += size * (len(places) - 1)

    grand = sum(totals.values())
    largest = sorted(((v, k) for k, v in top.items()), reverse=True)[:40]
    return {
        "asar_files": len(asar),
        "asar_packed_bytes": packed,
        "asar_unpacked_bytes": unpacked_total,
        "total_bytes": grand,
        "categories": {k: totals[k] for k, _ in CATEGORIES},
        "runtime_files": dict(sorted(runtime_files.items(),
                                     key=lambda kv: -kv[1])[:15]),
        "cross_cutting": {
            "source_maps_bytes": by_ext[".map"],
            "type_declarations_bytes": by_ext[".d.ts"],
            "markdown_bytes": by_ext[".md"],
            "duplicate_package_file_excess_bytes": duplicate_excess,
        },
        "largest": [{"category": k[0], "item": k[1], "bytes": v}
                    for v, k in largest],
    }


def mb(n):
    return "%.1f" % (n / MB)


def render(result, label):
    out = []
    out.append("# Desktop footprint: %s" % label)
    out.append("")
    out.append("Total %s MB; app.asar %s MB packed in %d files, %s MB "
               "unpacked beside it." % (
                   mb(result["total_bytes"]), mb(result["asar_packed_bytes"]),
                   result["asar_files"], mb(result["asar_unpacked_bytes"])))
    out.append("")
    out.append("| Category | MB | Share |")
    out.append("| --- | ---: | ---: |")
    names = dict(CATEGORIES)
    for key, value in result["categories"].items():
        if value:
            out.append("| %s | %s | %.1f%% |" % (
                names[key], mb(value), 100.0 * value / result["total_bytes"]))
    out.append("")
    out.append("| Cross-cutting | MB |")
    out.append("| --- | ---: |")
    for key, value in result["cross_cutting"].items():
        out.append("| %s | %s |" % (key.replace("_bytes", "").replace(
            "_", " "), mb(value)))
    out.append("")
    out.append("| Largest items | Category | MB |")
    out.append("| --- | --- | ---: |")
    for row in result["largest"][:25]:
        out.append("| %s | %s | %s |" % (row["item"], names[row["category"]],
                                         mb(row["bytes"])))
    return "\n".join(out) + "\n"


# -------------------------------------------------------------------- selftest
def write_asar(path, tree, blobs):
    """Write a minimal asar: tree maps names to dicts or file contents."""
    offset = [0]

    def node(t):
        files = {}
        for name, value in t.items():
            if isinstance(value, dict):
                files[name] = node(value)
            else:
                files[name] = {"size": len(value), "offset": str(offset[0])}
                offset[0] += len(value)
                blobs.append(value)
        return {"files": files}

    body = json.dumps(node(tree)).encode("utf-8")
    pad = (4 - len(body) % 4) % 4
    payload = struct.pack("<I", len(body)) + body + b"\0" * pad
    header = struct.pack("<I", len(payload)) + payload
    with open(path, "wb") as f:
        f.write(struct.pack("<II", 4, len(header)))
        f.write(header)
        for blob in blobs:
            f.write(blob)


def selftest():
    checks = 0
    assert classify("node_modules/eslint-plugin-x/node_modules/@babel/core/a.js") == "tooling"
    assert classify("renderer/out/node_modules/@next/swc-win32-x64-msvc/n.node") == "tooling"
    assert classify("node_modules/next/dist/server.js") == "next"
    assert classify("node_modules/next/node_modules/@swc/helpers/a.js") == "next"
    assert classify("node_modules/caniuse-lite/data/agents.js") == "next"
    assert classify("node_modules/@swc/core/index.js") == "tooling"
    assert classify("node_modules/ethers/lib/index.js") == "packages"
    assert classify("renderer/out/server/app/page.js") == "next-server"
    assert classify("renderer/out/static/chunks/1.js") == "next-static"
    assert classify("renderer/public/review-data/x/v1.json") == "review-data"
    assert classify("renderer/public/logo.png") == "public"
    assert classify("main/electron-src/index.js") == "main"
    checks += 12
    with tempfile.TemporaryDirectory() as tmp:
        build = Path(tmp) / "win-unpacked"
        res = build / "resources"
        (res / "ipfs-binaries").mkdir(parents=True)
        (res / "ipfs-binaries" / "ipfs.exe").write_bytes(b"k" * 7)
        (build / "app.exe").write_bytes(b"e" * 11)
        tree = {
            "main": {"index.js": b"main"},
            "node_modules": {
                "eslint-plugin-a": {"index.js": b"lint!",
                                    "node_modules": {"@babel": {"core": {
                                        "x.js": b"babel"}}}},
                "@babel": {"core": {"x.js": b"babel"}},
                "ethers": {"index.js": b"eth", "index.js.map": b"mapmap"},
            },
            "renderer": {"out": {"static": {"c.js": b"js"}}},
        }
        write_asar(res / "app.asar", tree, [])
        r = measure(build)
        assert r["asar_files"] == 7, r["asar_files"]
        assert r["categories"]["runtime"] == 11
        assert r["categories"]["binaries"] == 7
        assert r["categories"]["main"] == 4
        assert r["categories"]["tooling"] == 15
        assert r["categories"]["packages"] == 9
        assert r["categories"]["next-static"] == 2
        assert r["cross_cutting"]["source_maps_bytes"] == 6
        assert r["cross_cutting"]["duplicate_package_file_excess_bytes"] == 5
        assert r["total_bytes"] == 11 + 7 + 4 + 15 + 9 + 2
        checks += 10
        failures = budget_failures(r, {"tooling": 0, "maps": 0,
                                       "duplicates": 0, "files": 7})
        assert sorted(f.split(":")[0] for f in failures) == [
            "duplicates", "maps", "tooling"], failures
        assert budget_failures(r, {"files": 6}) == [
            "files: 7 > 6"], budget_failures(r, {"files": 6})
        assert budget_failures(r, {"total": 0.00004}) == [
            "total: 0.0 MB > 4e-05 MB"], budget_failures(r, {"total": 0.00004})
        checks += 3
    print("selftest: %d checks passed" % checks)
    return 0


def budget_failures(result, budgets):
    """Return one line per exceeded budget; sizes in MB, files as a count."""
    actual = {
        "tooling": result["categories"]["tooling"] / MB,
        "maps": result["cross_cutting"]["source_maps_bytes"] / MB,
        "duplicates":
            result["cross_cutting"]["duplicate_package_file_excess_bytes"] / MB,
        "files": result["asar_files"],
        "total": result["total_bytes"] / MB,
    }
    out = []
    for key in ("tooling", "maps", "duplicates", "files", "total"):
        if key in budgets and actual[key] > budgets[key]:
            if key == "files":
                out.append("files: %d > %d" % (actual[key], budgets[key]))
            else:
                out.append("%s: %.1f MB > %s MB" % (key, actual[key],
                                                     budgets[key]))
    return out


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = argv.pop(0)
    if cmd in ("selftest", "--selftest"):
        return selftest()
    if cmd not in ("measure", "check") or not argv:
        print(__doc__)
        return 2
    build = argv.pop(0)
    label = "build"
    write = False
    budgets = {}
    json_out = None
    flags = {"--max-tooling-mb": "tooling", "--max-maps-mb": "maps",
             "--max-duplicates-mb": "duplicates", "--max-files": "files",
             "--max-total-mb": "total"}
    while argv:
        arg = argv.pop(0)
        if arg == "--label" and argv:
            label = argv.pop(0)
        elif arg == "--write" and cmd == "measure":
            write = True
        elif arg == "--json" and argv:
            json_out = Path(argv.pop(0))
        elif arg in flags and argv and cmd == "check":
            key = flags[arg]
            value = argv.pop(0)
            budgets[key] = int(value) if key == "files" else float(value)
        else:
            print("unknown argument: %s" % arg)
            return 2
    result = measure(build)
    result = {"label": label, **result}
    text = render(result, label)
    sys.stdout.buffer.write(text.encode("utf-8"))
    if write or json_out is not None:
        out = json_out or HERE / ("desktop-footprint-%s.json" % label)
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(result, f, indent=1, sort_keys=False)
            f.write("\n")
        print("wrote %s" % out.name)
    if cmd == "check":
        failures = budget_failures(result, budgets)
        for line in failures:
            print("over budget: " + line)
        return 1 if failures else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
