#!/usr/bin/env bash
# Builds the app icon PNGs from the Figma SVGs. Run from the project root.
set -euo pipefail

SRC="${1:-$HOME/figma-src/public}"
OUT="assets/images"
SCALE="0.70"

command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found. Install librsvg2-bin."; exit 1; }
for f in app-icon-foreground app-icon-background app-icon-light; do
  [ -f "$SRC/$f.svg" ] || { echo "Missing $SRC/$f.svg"; exit 1; }
done
[ -d "$OUT" ] || { echo "Run this from the project root ($OUT not found)."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The foreground file must hold exactly the four shapes this script expects.
grep -v -e '^<svg' -e '^</svg>' "$SRC/app-icon-foreground.svg" > "$TMP/inner.svg"
[ "$(grep -c -E '<(circle|path) ' "$TMP/inner.svg")" -eq 4 ] || { echo "Foreground SVG changed. Review the script."; exit 1; }

wrap() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 24 24" fill="none">\n'
  printf '<g transform="translate(12 12) scale(%s) translate(-12 -12)">\n' "$SCALE"
  cat "$1"
  printf '</g>\n</svg>\n'
}
render() { rsvg-convert -w 1024 -h 1024 -f png -o "$2" "$1"; }

wrap "$TMP/inner.svg" > "$TMP/fg.svg"
sed -E 's/#[0-9A-Fa-f]{6}/#000000/g' "$TMP/inner.svg" > "$TMP/inner-mono.svg"
wrap "$TMP/inner-mono.svg" > "$TMP/mono.svg"

render "$TMP/fg.svg" "$OUT/android-icon-foreground.png"
render "$TMP/mono.svg" "$OUT/android-icon-monochrome.png"
render "$SRC/app-icon-background.svg" "$OUT/android-icon-background.png"

# Store and fallback icon: the light icon without rounded corners.
grep -q ' rx="5"' "$SRC/app-icon-light.svg" || { echo "Light icon has no rounded corners to remove. Review the script."; exit 1; }
sed 's/ rx="5"//' "$SRC/app-icon-light.svg" > "$TMP/light.svg"
render "$TMP/light.svg" "$OUT/icon.png"

# Blank native splash image. The launch animation in the app draws the mark.
printf '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1" height="1" fill="none"/></svg>\n' > "$TMP/splash.svg"
render "$TMP/splash.svg" "$OUT/splash-icon.png"

# Preview with a launcher mask (white circle edge) and the safe zone (red dashes).
{
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 24 24">\n'
  printf '<rect width="24" height="24" fill="#ffffff"/>\n<defs><clipPath id="m"><circle cx="12" cy="12" r="8"/></clipPath></defs>\n'
  printf '<g clip-path="url(#m)"><rect width="24" height="24" fill="#008069"/>\n'
  printf '<g fill="none" transform="translate(12 12) scale(%s) translate(-12 -12)">\n' "$SCALE"
  cat "$TMP/inner.svg"
  printf '</g></g>\n'
  printf '<circle cx="12" cy="12" r="7.33" fill="none" stroke="#ff0000" stroke-width="0.08" stroke-dasharray="0.4 0.4"/>\n</svg>\n'
} > "$TMP/preview.svg"
rsvg-convert -f png -o /tmp/weeez-icon-preview.png "$TMP/preview.svg"

file "$OUT"/icon.png "$OUT"/android-icon-*.png "$OUT"/splash-icon.png
echo "Done. Preview: /tmp/weeez-icon-preview.png"

# Notification small icon: all white mark on transparent, 96 px.
sed -E 's/#[0-9A-Fa-f]{6}/#FFFFFF/g' "$TMP/inner.svg" > "$TMP/inner-white.svg"
{
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none">\n'
  cat "$TMP/inner-white.svg"
  printf '</svg>\n'
} > "$TMP/notif.svg"
rsvg-convert -w 96 -h 96 -f png -o "$OUT/notification-icon.png" "$TMP/notif.svg"
file "$OUT/notification-icon.png"
