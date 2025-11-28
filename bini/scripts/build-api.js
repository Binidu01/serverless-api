#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const netlifyFunctionsDir = path.join(process.cwd(), 'netlify/functions');
const cloudflareFunctionsDir = path.join(process.cwd(), 'functions');
const distDir = path.join(process.cwd(), 'dist');
const rootDir = process.cwd();

// Create directories
[netlifyFunctionsDir, cloudflareFunctionsDir, distDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Check if src/app/api exists
if (!fs.existsSync(srcApiDir)) {
  console.log('⚠️  No API routes found at src/app/api');
  process.exit(0);
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));

console.log(`\n📦 Building ${apiFiles.length} API routes for both Netlify & Cloudflare...\n`);

// Store all route names for configuration
const routeNames = [];

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  routeNames.push(routeName);
  const srcPath = path.join(srcApiDir, file);

  // Read source
  let sourceCode = fs.readFileSync(srcPath, 'utf-8');

  // Compile TypeScript to JavaScript if needed
  if (file.endsWith('.ts')) {
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    });
    sourceCode = result.outputText;
  }

  // ============================================
  // NETLIFY FUNCTION BUILD
  // ============================================
  const netlifyOutput = path.join(netlifyFunctionsDir, `${routeName}.js`);
  const netlifyWrapper = `// Netlify Function: ${file}

const handlerModule = {};
(function() {
  const exports = handlerModule;
  const module = { exports: handlerModule };

  ${sourceCode}

  if (!handlerModule.default && typeof module.exports === 'function') {
    handlerModule.default = module.exports;
  }
})();

const originalHandler = handlerModule.default || handlerModule.handler;

if (!originalHandler || typeof originalHandler !== 'function') {
  throw new Error('Handler not found or not a function');
}

exports.handler = async (event, context) => {
  try {
    const method = event.httpMethod || 'GET';
    const headers = event.headers || {};
    const pathname = event.path || '/';

    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        body = {};
      }
    }

    const queryParams = event.queryStringParameters || {};

    const req = {
      method,
      headers,
      body,
      query: queryParams,
      params: {},
      ip: headers['x-forwarded-for'] || headers['client-ip'] || 'unknown',
      url: pathname
    };

    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseBody = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
        return res;
      },
      json: (data) => {
        responseBody = data;
      },
      send: (data) => {
        responseBody = data;
      },
      end: (data) => {
        if (data) responseBody = data;
      }
    };

    const result = await Promise.resolve().then(() => originalHandler(req, res));
    const finalBody = responseBody !== null ? responseBody : result;

    return {
      statusCode,
      headers: responseHeaders,
      body: typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody || {})
    };
  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
`;

  fs.writeFileSync(netlifyOutput, netlifyWrapper);

  // ============================================
  // CLOUDFLARE PAGES FUNCTION BUILD
  // ============================================
  const cloudflareOutput = path.join(cloudflareFunctionsDir, `${routeName}.js`);
  const cloudflareWrapper = `// Cloudflare Pages Function: ${file}

const handlerModule = {};
(function() {
  const exports = handlerModule;
  const module = { exports: handlerModule };

  ${sourceCode}

  if (!handlerModule.default && typeof module.exports === 'function') {
    handlerModule.default = module.exports;
  }
})();

const originalHandler = handlerModule.default || handlerModule.handler;

if (!originalHandler || typeof originalHandler !== 'function') {
  throw new Error('Handler not found or not a function');
}

export default {
  async onRequest(context) {
    try {
      const { request } = context;
      const url = new URL(request.url);
      const method = request.method;
      const headers = Object.fromEntries(request.headers);

      let body = {};
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const contentType = headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            body = await request.json();
          } catch (e) {
            body = {};
          }
        }
      }

      const queryParams = Object.fromEntries(url.searchParams);

      const req = {
        method,
        headers,
        body,
        query: queryParams,
        params: {},
        ip: headers['cf-connecting-ip'] || 'unknown',
        url: url.pathname
      };

      let statusCode = 200;
      let responseHeaders = { 'Content-Type': 'application/json' };
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        setHeader: (name, value) => {
          responseHeaders[name] = value;
          return res;
        },
        json: (data) => {
          responseBody = data;
        },
        send: (data) => {
          responseBody = data;
        },
        end: (data) => {
          if (data) responseBody = data;
        }
      };

      const result = await Promise.resolve().then(() => originalHandler(req, res));
      const finalBody = responseBody !== null ? responseBody : result;

      const responseInit = {
        status: statusCode,
        headers: new Headers(responseHeaders)
      };

      const bodyContent = typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody || {});

      return new Response(bodyContent, responseInit);
    } catch (error) {
      console.error('API Error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error.message,
          timestamp: new Date().toISOString()
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

  fs.writeFileSync(cloudflareOutput, cloudflareWrapper);

  console.log(`  ✅ ${routeName}`);
  console.log(`     📍 Netlify: netlify/functions/${routeName}.js`);
  console.log(`     ☁️  Cloudflare: functions/${routeName}.js\n`);
});

// ============================================
// AUTO-GENERATE NETLIFY.TOML (For Netlify CI/CD)
// ============================================

const netlifyTomlPath = path.join(rootDir, 'netlify.toml');

const netlifyTomlContent = `[build]
  command = "pnpm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "22.16.0"
  PNPM_VERSION = "10.11.1"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Cache-Control = "public, max-age=3600"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`;

fs.writeFileSync(netlifyTomlPath, netlifyTomlContent);
console.log(`  ✅ netlify.toml generated\n`);

// ============================================
// AUTO-GENERATE CLOUDFLARE PAGES CONFIG
// ============================================

const packageJsonPath = path.join(rootDir, 'package.json');
let projectName = 'my-bini-app';

if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    projectName = packageJson.name || projectName;
  } catch (e) {
    // Use default if package.json parsing fails
  }
}

// For Cloudflare Pages CI/CD - they auto-detect functions in /functions
const wranglerTomlPath = path.join(rootDir, 'wrangler.toml');
const wranglerTomlContent = `name = "${projectName}"
compatibility_date = "2025-11-28"

[build]
  command = "pnpm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

fs.writeFileSync(wranglerTomlPath, wranglerTomlContent);
console.log(`  ✅ wrangler.toml generated\n`);

// ============================================
// CREATE CLOUDFLARE PAGES _routes.json
// ============================================

const routesJsonPath = path.join(rootDir, 'functions', '_routes.json');
const routesJsonContent = {
  version: 1,
  include: [
    "/*"
  ],
  exclude: [
    "/_build/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ]
};

fs.writeFileSync(routesJsonPath, JSON.stringify(routesJsonContent, null, 2));
console.log(`  ✅ functions/_routes.json generated\n`);

// ============================================
// CREATE CLOUDFLARE PAGES _headers.json
// ============================================

const headersJsonPath = path.join(rootDir, 'functions', '_headers.json');
const headersJsonContent = {
  "/api/*": {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }
};

fs.writeFileSync(headersJsonPath, JSON.stringify(headersJsonContent, null, 2));
console.log(`  ✅ functions/_headers.json generated\n`);

// ============================================
// UPDATE PACKAGE.JSON FOR PLATFORM CI/CD
// ============================================

if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    // Ensure build script exists
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts.build = packageJson.scripts.build || "node bini/scripts/build-api.js && vite build";
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`  ✅ package.json build script verified\n`);
  } catch (e) {
    console.log(`  ⚠️  Could not update package.json: ${e.message}\n`);
  }
}

// ============================================
// CREATE PLATFORM DETECTION SCRIPT
// ============================================

const platformScriptPath = path.join(rootDir, 'bini', 'scripts', 'detect-platform.js');
const platformScriptContent = `#!/usr/bin/env node
// Platform detection for CI/CD
const isNetlify = process.env.NETLIFY === 'true';
const isCloudflarePages = process.env.CF_PAGES === 'true';
const isVercel = process.env.VERCEL === '1';

console.log('🔍 Detected Platform:', {
  netlify: isNetlify,
  cloudflarePages: isCloudflarePages,
  vercel: isVercel,
  node: process.version
});

// Export for use in build scripts
module.exports = { isNetlify, isCloudflarePages, isVercel };
`;

// Ensure directory exists
const platformScriptDir = path.dirname(platformScriptPath);
if (!fs.existsSync(platformScriptDir)) {
  fs.mkdirSync(platformScriptDir, { recursive: true });
}
fs.writeFileSync(platformScriptPath, platformScriptContent);
console.log(`  ✅ Platform detection script created\n`);

// ============================================
// CREATE DEPLOYMENT GUIDE
// ============================================

const deployGuidePath = path.join(rootDir, 'DEPLOYMENT.md');
const deployGuideContent = `# Deployment Guide

## Netlify CI/CD
1. Connect your GitHub repo to Netlify
2. Netlify will auto-detect \`netlify.toml\`
3. Auto-deploys on git push

## Cloudflare Pages CI/CD  
1. Connect your GitHub repo to Cloudflare Pages
2. Build command: \`pnpm run build\`
3. Build output: \`dist\`
4. Functions directory: \`functions\`
5. Auto-deploys on git push

## Environment Setup
Both platforms will automatically:
- Install dependencies using \`pnpm install\`
- Run \`pnpm run build\`
- Deploy the \`dist\` folder
- Deploy API routes from \`functions/\` directory

## API Routes
Your API routes are available at:
- Netlify: \`/api/{route-name}\`
- Cloudflare: \`/api/{route-name}\`

Available routes:
${routeNames.map(name => `- /api/${name}`).join('\n')}
`;

fs.writeFileSync(deployGuidePath, deployGuideContent);
console.log(`  ✅ DEPLOYMENT.md guide created\n`);

// ============================================
// SUMMARY
// ============================================

console.log(`✨ Build complete!\n`);
console.log(`📂 Frontend: dist/\n`);
console.log(`📁 Netlify Functions: netlify/functions/ (${routeNames.length} routes)`);
console.log(`📁 Cloudflare Pages Functions: functions/ (${routeNames.length} routes)\n`);
console.log(`⚙️  Auto-generated Configs:\n`);
console.log(`   📄 netlify.toml - Netlify CI/CD config`);
console.log(`   📄 wrangler.toml - Cloudflare Pages config`);
console.log(`   📄 functions/_routes.json - CF Pages routing`);
console.log(`   📄 functions/_headers.json - API CORS headers`);
console.log(`   📄 DEPLOYMENT.md - Deployment guide\n`);
console.log(`🚀 CI/CD Ready:\n`);
console.log(`   Both platforms will auto-deploy when you push to GitHub`);
console.log(`   No manual deploy commands needed!\n`);
console.log(`🔗 Your API endpoints:\n`);
routeNames.forEach(name => console.log(`   • /api/${name}`));
console.log(`\n`);
