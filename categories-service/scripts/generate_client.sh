#!/usr/bin/env sh
# Генерирует Python-клиент medincident-backend из закоммиченного swagger.
# Клиент (generated/backend) в .gitignore — воспроизводимо создаётся этим скриптом
# (локально и в Dockerfile при сборке).
#
# Шаги: sanitize (убрать суффикс Service) -> swagger2.0 -> openapi3 -> openapi-python-client.
#
# Зависимости: node/npx (swagger2openapi), openapi-python-client, python3.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

SWAGGER="$ROOT/medincident.swagger.json"
SANITIZED="$ROOT/.cache/swagger.sanitized.json"
OPENAPI3="$ROOT/.cache/medincident.openapi.json"
OUT="$ROOT/generated/backend"

mkdir -p "$ROOT/.cache"

echo "[codegen] sanitize swagger (strip Service suffix)"
python3 "$SCRIPT_DIR/sanitize_swagger.py" "$SWAGGER" "$SANITIZED"

echo "[codegen] swagger 2.0 -> openapi 3.0"
npx -y swagger2openapi@7 "$SANITIZED" -o "$OPENAPI3"

echo "[codegen] generate python client -> generated/backend"
rm -rf "$OUT"
mkdir -p "$ROOT/generated"
# делаем generated/ пакетом, чтобы импортировать как `generated.backend`
: > "$ROOT/generated/__init__.py"
openapi-python-client generate \
  --path "$OPENAPI3" \
  --output-path "$OUT" \
  --meta none \
  --overwrite

echo "[codegen] done: $OUT"
