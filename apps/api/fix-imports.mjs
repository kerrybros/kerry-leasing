// Script to add .js extensions to all relative imports in TypeScript files
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');

// Find all TypeScript files
const files = globSync('**/*.ts', { cwd: srcDir, absolute: true });

console.log(`Found ${files.length} TypeScript files`);

let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  let fixed = 0;
  
  // Match import statements with relative paths that don't end in .js
  // from './something' or from '../something' but NOT from './something.js'
  const importRegex = /from ['"](\.\.[\/\\][^'"]+|\.\/[^'"]+)(?<!\.js)['"]/g;
  
  const newContent = content.replace(importRegex, (match, path) => {
    // Skip if it already has an extension
    if (path.match(/\.(js|ts|json)$/)) {
      return match;
    }
    fixed++;
    return `from '${path}.js'`;
  });
  
  if (fixed > 0) {
    writeFileSync(file, newContent, 'utf-8');
    console.log(`✓ Fixed ${fixed} imports in ${file.replace(srcDir, '')}`);
    totalFixed += fixed;
  }
}

console.log(`\n✅ Total imports fixed: ${totalFixed}`);
