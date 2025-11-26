#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'dist/api');

if (!fs.existsSync(distApiDir)) {
  fs.mkdirSync(distApiDir, { recursive: true });
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));

console.log(`📦 Building ${apiFiles.length} serverless API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  const outputPath = path.join(distApiDir, `${routeName}.js`);
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

  // Generate universal wrapper that works on Vercel, Netlify, and local
  const wrapper = `// Universal Serverless Function for ${file}
// Works on: Vercel, Netlify, Cloudflare Workers, Local

// Execute the source code to extract the handler
const handlerModule = {};
(function() {
  const exports = handlerModule;
  const module = { exports: handlerModule };
  
  ${sourceCode}
  
  // Capture the exported handler
  if (!handlerModule.default && typeof module.exports === 'function') {
    handlerModule.default = module.exports;
  }
})();

const originalHandler = handlerModule.default || handlerModule.handler;

if (!originalHandler || typeof originalHandler !== 'function') {
  throw new Error('Handler not found or not a function');
}

// Helper function to convert Node.js response to Response object or Netlify format
async function callHandler(req, res) {
  const result = await Promise.resolve().then(() => originalHandler(req, res));
  return result;
}

// ============================================
// Netlify Functions (CommonJS exports)
// ============================================
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

    const result = await callHandler(req, res);
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

// ============================================
// Vercel Serverless Functions (ESM exports)
// ============================================
export async function GET(req) {
  return handleRequest(req, 'GET');
}

export async function POST(req) {
  return handleRequest(req, 'POST');
}

export async function PUT(req) {
  return handleRequest(req, 'PUT');
}

export async function DELETE(req) {
  return handleRequest(req, 'DELETE');
}

export async function PATCH(req) {
  return handleRequest(req, 'PATCH');
}

async function handleRequest(req, method) {
  try {
    const url = new URL(req.url);
    
    const nodeReq = {
      method: method,
      headers: Object.fromEntries(req.headers),
      body: ['GET', 'DELETE', 'HEAD'].includes(method) ? {} : await req.json().catch(() => ({})),
      query: Object.fromEntries(url.searchParams),
      params: {},
      ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
      url: req.url
    };

    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseData = null;

    const nodeRes = {
      status: (code) => {
        statusCode = code;
        return nodeRes;
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
        return nodeRes;
      },
      json: (data) => {
        responseData = data;
      },
      send: (data) => {
        responseData = data;
      },
      end: (data) => {
        responseData = data;
      }
    };

    const result = await callHandler(nodeReq, nodeRes);
    const body = responseData || result;

    return new Response(JSON.stringify(body), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...responseHeaders
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
`;

  fs.writeFileSync(outputPath, wrapper);
  console.log(`  ✅ ${routeName}`);
});

console.log(`\n🚀 Universal serverless API routes ready in: dist/api/\n`);
console.log(`   ✅ Netlify: exports.handler (CommonJS)`);
console.log(`   ✅ Vercel: export GET/POST/PUT/DELETE/PATCH (ESM)`);
console.log(`   ✅ Local: Node.js server compatible\n`);
