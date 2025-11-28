#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const netlifyFunctionsDir = path.join(process.cwd(), 'netlify/functions');
const cloudflareFunctionsDir = path.join(process.cwd(), 'functions');
const distDir = path.join(process.cwd(), 'dist');

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

console.log(`\n📦 Building ${apiFiles.length} API routes for multiple platforms...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
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

console.log(`✨ API routes built for both platforms!\n`);
console.log(`📂 Frontend: dist/ (unchanged)\n`);
console.log(`🚀 Deployment ready for:\n`);
console.log(`   Netlify: netlify/functions/ + dist/\n`);
console.log(`   Cloudflare Pages: functions/ + dist/\n`);
