#!/bin/bash
set -e

echo "Installing OpenMirror..."

if ! command -v node &> /dev/null; then
  echo "Node.js was not found. Please install Node.js 18 or newer first."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Found: $(node -v)"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "OpenMirror is ready."
echo "Start it with: npm start"
echo "Then open http://localhost:3000 in your browser."
