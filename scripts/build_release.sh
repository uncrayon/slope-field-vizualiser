#!/usr/bin/env bash
set -euo pipefail

# Script to build frontend, copy into python package, and build wheel
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BACKEND_STATIC_DIR="${ROOT_DIR}/backend/static"

echo "Building frontend..."
npm --prefix "${FRONTEND_DIR}" ci
npm --prefix "${FRONTEND_DIR}" run build

echo "Preparing backend static directory at ${BACKEND_STATIC_DIR}..."
rm -rf "${BACKEND_STATIC_DIR}"
mkdir -p "${BACKEND_STATIC_DIR}"

echo "Copying frontend/dist → backend/static..."
cp -R "${FRONTEND_DIR}/dist/." "${BACKEND_STATIC_DIR}/"

echo "Building Python wheel..."
# Ensure build package is available
python -m pip install --upgrade build wheel setuptools
python -m build

echo "Build complete. Wheel artifacts are in the dist/ directory."