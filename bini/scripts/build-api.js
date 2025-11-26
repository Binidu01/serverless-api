#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'dist/api');
const netlifyFunctionsDir = path.join(process.cwd(), 'netlify/functions');

if (!fs.existsSync(distApiDir)) {
  fs.mkdirSync(distApiDir, { recursive: true });
}

if (!fs.existsSync(netlifyFunctionsDir)) {
  fs.mkdirSync(netlifyFunctionsDir, { recursive: true });
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));

console.log(`📦 Building ${apiFiles.length} serverless API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  
  // Read source
  let sourceCode = fs.readFileSync(path.join(srcApiDir, file), 'utf-8');

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
  // NETLIFY: Create CommonJS-only version
  // ============================================
  const netlifyFile = path.join(netlifyFunctionsDir, `${routeName}.js`);
  
  const netlifyWrapper = `// Netlify Function for ${file}
// Extract the handler by executing the source
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

  fs.writeFileSync(netlifyFile, netlifyWrapper);

  // ============================================
  // VERCEL: Create ESM-only version in dist/api
  // ============================================
  const vercelFile = path.join(distApiDir, `${routeName}.js`);
  
  const vercelWrapper = `// Vercel Serverless Function for ${file}
// Extract the handler by executing the source
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

    const result = await Promise.resolve().then(() => originalHandler(nodeReq, nodeRes));
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
`;

  fs.writeFileSync(vercelFile, vercelWrapper);

  console.log(\`  ✅ \${routeName}\`);
});

console.log(\`\n🚀 Serverless API routes built:\n\`);
console.log(\`   📂 Netlify:  netlify/functions/*.js (CommonJS)\`);
console.log(\`   📂 Vercel:   dist/api/*.js (ESM)\n\`);
