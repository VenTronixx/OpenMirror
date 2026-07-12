const { execSync } = require('child_process');
const fs = require('fs');

console.log('Installing OpenMirror...');

if (!fs.existsSync('node_modules')) {
  console.log('Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
}

console.log('OpenMirror is ready.');
console.log('Start it with: npm start');
console.log('Then open http://localhost:3000 in your browser.');
