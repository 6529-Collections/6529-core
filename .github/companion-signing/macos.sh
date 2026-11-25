#!/bin/bash
set -euo pipefail

work="$RUNNER_TEMP/companion-signing"
source_image=("$work"/input/macos/*.dmg)
[[ ${#source_image[@]} == 1 && -f "${source_image[0]}" ]]
image="${source_image[0]}"
mount="$work/mount"
scratch="$work/scratch.dmg"
keychain="$work/signing.keychain-db"
p12="$work/identity.p12"
mounted=false
cleanup() {
  if "$mounted"; then hdiutil detach "$mount" >/dev/null || true; fi
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -f "$p12"
}
trap cleanup EXIT
mkdir "$mount" "$work/out"
mkdir "$work/out/macos"

# Preserve the drag-to-Applications layout and artwork from the unsigned DMG.
hdiutil verify "$image"
hdiutil convert "$image" -format UDRW -o "$scratch"
bytes=$(stat -f %z "$scratch")
hdiutil resize -size "$(( (bytes + 1048575) / 1048576 + 16 ))m" "$scratch"
hdiutil attach "$scratch" -nobrowse -noautoopen -mountpoint "$mount"
mounted=true
app="$mount/6529 Validator Companion.app"
test_app="$mount/6529 Validator Companion Test.app"
# Keep older Test artifacts signable while accepting the new side-by-side bundle.
if [[ "$CHANNEL" == test && -e "$test_app" ]]; then
  app="$test_app"
fi
plist="$app/Contents/Info.plist"
[[ "$(readlink "$mount/Applications")" == /Applications ]]
python3 - "$app" <<'PY'
from pathlib import Path
import sys

app = Path(sys.argv[1])
mount = app.parent
volume = {".DS_Store", ".VolumeIcon.icns", ".background.tiff", ".fseventsd", ".Trashes",
          ".Spotlight-V100", ".metadata_never_index", "Applications", app.name}
if not app.is_dir() or app.is_symlink() or set(item.name for item in mount.iterdir()) - volume:
    sys.exit("Unexpected files at the root of the Companion DMG.")
for path in app.rglob("*"):
    if path.is_symlink() or not (path.is_file() or path.is_dir()):
        sys.exit("Unexpected file type inside Companion.app.")
    if path.is_file():
        relative = path.relative_to(app).as_posix()
        allowed = {"Contents/Info.plist", "Contents/MacOS/CompanionIroh", "Contents/MacOS/companion-iroh-host",
                   "Contents/MacOS/companion-iroh-transport", "Contents/Resources/Assets.car",
                   "Contents/Resources/ValidatorCompanion.icns", "Contents/Resources/Companion-Menu.png",
                   "Contents/Resources/desktop-help.json", "Contents/Resources/desktop-receiver.js"}
        if relative not in allowed:
            sys.exit(f"Unexpected app file: {relative}")
PY
# The packaged app points at the public update feed. Signing inputs use a different private bucket.
plist_value() { plutil -extract "$1" raw -o - "$plist"; }
bundle="$(plist_value CFBundleIdentifier)"
case "$CHANNEL:$bundle" in
  stable:io.6529.validator.companion|stable:io.6529.validator.companion.iroh.preview|test:io.6529.validator.companion.iroh.preview) ;;
  *) printf 'Unexpected Companion bundle identifier for %s.\n' "$CHANNEL" >&2; exit 1 ;;
esac
[[ "$(plist_value CFBundleExecutable)" == CompanionIroh &&
   "$(plist_value CFBundleShortVersionString)" == "$VERSION" &&
   "$(plist_value CompanionUpdateChannel)" == "$CHANNEL" &&
   "$(plist_value CompanionUpdateBaseURL)" == 'https://6529bucket.s3.eu-west-1.amazonaws.com/6529-validator-companion/' &&
   "$(plist_value LSMinimumSystemVersion)" == 13.0 ]]
arch=arm64
if [[ "$TARGET" == mac-x64 ]]; then arch=x86_64; fi
for program in CompanionIroh companion-iroh-host companion-iroh-transport; do
  [[ "$(lipo -archs "$app/Contents/MacOS/$program")" == "$arch" ]]
done

password=$(openssl rand -hex 24)
echo "::add-mask::$password"
printf '%s' "$CERTIFICATE_P12" | base64 --decode > "$p12"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 7200 "$keychain"
security default-keychain -s "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$p12" -k "$keychain" -P "$CERT_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null
# Match Core's release signing setup so codesign can find the temporary identity.
# shellcheck disable=SC2046
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
rm -f "$p12"
identity=$(security find-identity -v -p codesigning "$keychain" |
  awk '/Developer ID Application: 6529 Collection LLC \(4962266Y3D\)/ {print $2}')
[[ "$identity" =~ ^[A-F0-9]{40}$ ]]
xattr -cr "$app"
for helper in companion-iroh-host companion-iroh-transport; do
  codesign --force --keychain "$keychain" --sign "$identity" --options runtime --timestamp \
    --identifier "$bundle.$helper" "$app/Contents/MacOS/$helper"
done
codesign --force --keychain "$keychain" --sign "$identity" --options runtime --timestamp "$app"
codesign --verify --deep --strict --verbose=2 "$app"
hdiutil detach "$mount" >/dev/null
mounted=false

final="$work/out/macos/${image##*/}"
hdiutil convert "$scratch" -format UDZO -o "$final"
codesign --force --keychain "$keychain" --sign "$identity" --timestamp --identifier "$bundle.dmg" "$final"
notary="$work/notary.json"
xcrun notarytool submit "$final" --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" --wait --timeout 30m --output-format json > "$notary"
submission=$(plutil -extract id raw -o - "$notary")
if [[ "$(plutil -extract status raw -o - "$notary")" != Accepted ]]; then
  echo "::error::Apple rejected notarization submission $submission"
  exit 1
fi
xcrun stapler staple "$final"
xcrun stapler validate "$final"
hdiutil verify "$final"
codesign --verify --strict --verbose=2 "$final"
assessment=$(spctl --assess --type open --context context:primary-signature -vv "$final" 2>&1)
grep -F 'source=Notarized Developer ID' <<< "$assessment"
echo "Apple accepted notarization submission $submission"
