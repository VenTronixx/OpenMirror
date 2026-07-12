@echo off
echo Installing OpenMirror...

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js was not found. Please install Node.js 18 or newer first.
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  npm install
)

echo OpenMirror is ready.
echo Start it with: npm start
echo Then open http://localhost:3000 in your browser.
