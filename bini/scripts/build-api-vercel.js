#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const outputDir = path.join(process.cwd(), '.vercel/output');
const functionsDir = path.join(outputDir, 'functions');
const staticDir = path.join(outputDir, 'static');

// Clean and create directories
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(functionsDir, { recursive: true });
fs.mkdirSync(staticDir, { recursive: true });

// Copy dist to static (frontend)
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      const srcFile = path.join(src, file);
      const destFile = path.join(dest, file);
      if (fs.statSync(srcFile).isDirectory()) {
        copyDir(srcFile, destFile);
      } else {
        fs.copyFileSync(srcFile, destFile);
      }
    });
  };
  copyDir(distDir, staticDir);
  console.log('✅ Frontend copied to static/');
}

// Build API functions
const routes = [];
if (fs.existsSync(srcApiDir)) {
  const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));
  
  console.log(`📦 Building ${apiFiles.length} API routes...\n`);

  apiFiles.forEach(file => {
    const routeName = path.basename(file, path.extname(file));
    const functionDir = path.join(functionsDir, `${routeName}.func`);
    const indexPath = path.join(functionDir, 'index.js');

    fs.mkdirSync(functionDir, { recursive: true });

    const srcPath = path.join(srcApiDir, file);
    let sourceCode = fs.readFileSync(srcPath, 'utf-8');

    // Transpile TypeScript
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

    // Clean up imports
    sourceCode = sourceCode.replace(/import\s+.*?from\s+['"]@vercel\/node['"];?\n?/g, '');
    sourceCode = sourceCode.replace(/export\s+default\s+/g, '');

    const output = `${sourceCode}

module.exports = handler;
`;

    fs.writeFileSync(indexPath, output);

    // Create .vc-config.json for the function
    const vcConfig = {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      lazyLoadingEnabled: false,
      regions: ['iad1'],
    };
    fs.writeFileSync(path.join(functionDir, '.vc-config.json'), JSON.stringify(vcConfig, null, 2));

    // Add routing rule for this API
    routes.push({
      src: `/api/${routeName}(?:/)?$`,
      dest: `/api/${routeName}.func`,
    });

    console.log(`  ✅ ${routeName}`);
  });
}

// Add routes in correct order: API first, then filesystem check, then SPA fallback
routes.push({
  handle: 'filesystem',
});
routes.push({
  src: '/(.*)',
  dest: '/index.html',
});

// Create config.json with routes
const config = {
  version: 3,
  routes,
};
fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(config, null, 2));

console.log(`\n🚀 Build Output API ready in: .vercel/output/\n`);
