#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const functionsDir = path.join(process.cwd(), 'functions');
const distDir = path.join(process.cwd(), 'dist');

// Create directories
[functionsDir, distDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Check if src/app/api exists
if (!fs.existsSync(srcApiDir)) {
  console.log('📦 No API routes found');
  process.exit(0);
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts)$/.test(f));

console.log(`📦 Building ${apiFiles.length} API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  const srcPath = path.join(srcApiDir, file);

  // Read source code
  const sourceCode = fs.readFileSync(srcPath, 'utf-8');

  // Simple Cloudflare Pages Function
  const functionCode = `// Cloudflare Pages Function: ${file}
${sourceCode}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const method = request.method;
      
      let body = {};
      if (method !== 'GET') {
        try {
          body = await request.json();
        } catch (e) {
          body = {};
        }
      }

      const query = Object.fromEntries(url.searchParams);
      
      // Simple request object
      const req = {
        method,
        headers: Object.fromEntries(request.headers),
        body,
        query,
        url: url.pathname
      };

      // Call the handler
      const handler = module.exports?.default || module.exports;
      const result = await handler(req);
      
      return new Response(
        JSON.stringify(result),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Internal Server Error',
          message: error.message 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};
`;

  const outputPath = path.join(functionsDir, `${routeName}.js`);
  fs.writeFileSync(outputPath, functionCode);

  console.log(`✅ ${routeName} -> functions/${routeName}.js`);
});

// Simple wrangler.toml
const packageJsonPath = path.join(process.cwd(), 'package.json');
let projectName = 'my-bini-app';

if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    projectName = packageJson.name || projectName;
  } catch (e) {
    // Use default name
  }
}

const wranglerToml = `name = "${projectName}"
compatibility_date = "2025-11-28"

[build]
  command = "pnpm run build"
`;

fs.writeFileSync(path.join(process.cwd(), 'wrangler.toml'), wranglerToml);
console.log('\n✅ wrangler.toml generated');

console.log('\n✨ Build complete!');
console.log('📁 Frontend: dist/');
console.log('📁 API Routes: functions/');
console.log(`🔗 API endpoints:`);
apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  console.log(`   • /api/${routeName}`);
});
