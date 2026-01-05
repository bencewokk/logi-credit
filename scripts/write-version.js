const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeExec(command) {
  try {
    return String(execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    return null;
  }
}

const commit = safeExec('git rev-parse --short HEAD') || 'unknown';
const date = safeExec('git show -s --format=%cI HEAD') || new Date().toISOString();

const version = {
  commit,
  date,
};

const outPath = path.join(__dirname, '..', 'website', 'version.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(version, null, 2) + '\n', 'utf8');

console.log(`Wrote ${outPath}: ${commit} @ ${date}`);
