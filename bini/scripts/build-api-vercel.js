#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'api');

// Create api directory if it doesn't exist
if (!fs.existsSync(distApiDir)) {
  fs.mkdirSync(distApiDir, { recursive: true });
}

// Check if source directory exists
if (!fs.existsSync(srcApiDir)) {
  console.error(`❌ Source directory not found: ${srcApiDir}`);
  process.exit(1);
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));

if (apiFiles.length === 0) {
  console.log('⚠️ No API files found in src/app/api');
  process.exit(0);
}

console.log(`📦 Building ${apiFiles.length} serverless API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  const outputPath = path.join(distApiDir, `${routeName}.js`);
  const srcPath = path.join(srcApiDir, file);

  try {
    let sourceCode = fs.readFileSync(srcPath, 'utf-8');

    // Transpile TypeScript to JavaScript if needed
    if (file.endsWith('.ts')) {
      const result = ts.transpileModule(sourceCode, {
        compilerOptions: {
          module: ts.ModuleKind.ES2020,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
        },
      });
      sourceCode = result.outputText;
    }

    // Remove @vercel/node imports
    sourceCode = sourceCode.replace(/import\s+.*?from\s+['"]@vercel\/node['"];?\n?/g, '');

    // Remove 'export default' if present, we'll add it back properly
    sourceCode = sourceCode.replace(/export\s+default\s+/g, '');

    // Write the file with proper export
    const output = `${sourceCode}

export default handler;
`;

    fs.writeFileSync(outputPath, output);
    console.log(`  ✅ ${routeName}`);
  } catch (error) {
    console.error(`  ❌ Error building ${routeName}:`, error.message);
  }
});

console.log(`\n🚀 Vercel Functions ready in: api/\n`);
