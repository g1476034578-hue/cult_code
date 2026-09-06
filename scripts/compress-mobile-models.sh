#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p public/models-mobile
for model in character_v02 character_scared_v03 character_motion shovel; do
  npx --yes --package=@gltf-transform/cli@4.5.0 gltf-transform optimize \
    "public/models/$model.glb" "public/models-mobile/$model.glb" \
    --compress meshopt --texture-compress webp --texture-size 1024 \
    --simplify-ratio 0.15 --simplify-error 0.001 \
    --flatten false --join false --instance false --palette false --prune false
done
node scripts/check-mobile-models.mjs
