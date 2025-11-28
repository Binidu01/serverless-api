#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

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

// Create a simple worker that handles API routes and serves static files
const workerCode = `// Cloudflare Worker for ${projectName}
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
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'API route not found' }),
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // For static assets, we'll use the site feature
    // This requires the [site] configuration in wrangler.toml
    return new Response('Static site should be served via [site] configuration', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
`;

// Write worker file
fs.writeFileSync(path.join(process.cwd(), 'worker.js'), workerCode);
console.log('✅ worker.js created');

// Complete wrangler.toml with all options to eliminate warnings
const wranglerToml = `name = "${projectName}"
main = "worker.js"
compatibility_date = "2025-11-28"
workers_dev = true
preview_urls = true

[site]
bucket = "./dist"
`;

fs.writeFileSync(path.join(process.cwd(), 'wrangler.toml'), wranglerToml);
console.log('✅ wrangler.toml generated');

console.log('\n✨ Build complete!');
console.log('📁 Frontend: dist/');
console.log('🔗 API endpoint: /api/hello');
console.log('\n🚀 To deploy: npx wrangler deploy');
