const fs = require('fs-extra');
const path = require('path');

// 🔧 EDIT ONLY THIS SECTION
const X = '/home/abhay/Documents/SI-REF-V2';
const Y = '/home/abhay/Documents/wm-si-wafjs3.0';

const EXCLUDE = ['.git', 'README.md'];

// 🔍 Filter logic
function shouldCopy(srcPath, base) {
  const rel = path.relative(base, srcPath);

  // Always ignore empty root
  if (!rel) return true;

  // Exclude rules
  for (const ex of EXCLUDE) {
    if (rel === ex || rel.startsWith(ex + path.sep)) {
      return false;
    }
  }

  return true;
}

// 📦 One-way sync
async function syncOneWay(src, dest) {
  await fs.copy(src, dest, {
    filter: (file) => shouldCopy(file, src)
  });
}

// 🔁 Bi-directional sync
async function syncBoth() {
  console.log('🔄 Sync X ⇄ Y');

  await syncOneWay(X, Y);
  await syncOneWay(Y, X);

  console.log('✅ Done');
}

// ▶️ CLI
const mode = process.argv[2];

(async () => {
  try {
    if (mode === 'x-to-y') {
      console.log('➡️ X → Y');
      await syncOneWay(X, Y);

    } else if (mode === 'y-to-x') {
      console.log('⬅️ Y → X');
      await syncOneWay(Y, X);

    } else if (mode === 'both') {
      await syncBoth();

    } else {
      console.log(`
Usage:
  node sync.js x-to-y
  node sync.js y-to-x
  node sync.js both
      `);
    }
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();

