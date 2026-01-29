#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/assets/fonts"

mkdir -p "$TARGET"

download() {
  local url="$1"
  local out="$2"
  echo "Downloading $out"
  curl -sL --fail "$url" -o "$TARGET/$out"
}

# Font URLs from Google Fonts (woff2 format)
# Space Grotesk: https://fonts.google.com/specimen/Space+Grotesk
# JetBrains Mono: https://fonts.google.com/specimen/JetBrains+Mono

# Space Grotesk (variable font, but we use static weights for compatibility)
download "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oUXsMKg.woff2" "SpaceGrotesk-Regular.woff2"
download "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj62UXsMKg.woff2" "SpaceGrotesk-Medium.woff2"
download "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7aUXsMKg.woff2" "SpaceGrotesk-SemiBold.woff2"
download "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7xUXsMKg.woff2" "SpaceGrotesk-Bold.woff2"

# JetBrains Mono
download "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2" "JetBrainsMono-Regular.woff2"
download "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yK1NPVmUsaaDhw.woff2" "JetBrainsMono-SemiBold.woff2"

echo ""
echo "Fonts downloaded to $TARGET"
echo "If this fails, check network access or update URLs from fonts.google.com"
