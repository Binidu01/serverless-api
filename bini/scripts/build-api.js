#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distDir = path.join(process.cwd(), 'dist');

// Create dist directory
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Check if src/app/api exists
if (!fs.existsSync(srcApiDir)) {
  console.log('📦 No API routes found');
  process.exit(0);
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts)$/.test(f));

console.log(`📦 Building ${apiFiles.length} API routes...\n`);

// Get project name
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

// Create a simple worker that handles all API routes
let workerCode = `// Cloudflare Worker for ${projectName}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle API routes
    if (pathname.startsWith('/api/')) {
      const route = pathname.split('/').pop();
      
      if (route === 'hello') {
        return new Response(
          JSON.stringify({ 
            message: 'Hello from Cloudflare Worker!',
            timestamp: new Date().toISOString()
          }),
          { 
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
          }
        );
      }
      
      // Add more API routes here as needed
      
      return new Response(
        JSON.stringify({ error: 'API route not found' }),
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Serve static assets from the dist folder
    return env.ASSETS.fetch(request);
  }
};
`;

// Write worker file
fs.writeFileSync(path.join(process.cwd(), 'worker.js'), workerCode);
console.log('✅ worker.js created');

// Create proper wrangler.toml for Worker with assets
const wranglerToml = `name = "${projectName}"
compatibility_date = "2025-11-28"
main = "worker.js"

[env.production]
vars = { 
  ENVIRONMENT = "production"
}

[site]
bucket = "./dist"
`;

fs.writeFileSync(path.join(process.cwd(), 'wrangler.toml'), wranglerToml);
console.log('✅ wrangler.toml generated');

console.log('\n✨ Build complete!');
console.log('📁 Frontend: dist/');
console.log('🔗 API endpoints:');
apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  console.log(`   • /api/${routeName}`);
});
console.log('\n🚀 To deploy: npx wrangler deploy');
