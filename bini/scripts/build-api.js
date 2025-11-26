#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'dist/api');

// Create output directory
if (!fs.existsSync(distApiDir)) {
  fs.mkdirSync(distApiDir, { recursive: true });
}

// Get all API files
const apiFiles = fs.readdirSync(srcApiDir)
  .filter(f => /\.(js|ts|mjs)$/.test(f));

console.log(`📦 Building ${apiFiles.length} API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  const outputPath = path.join(distApiDir, `${routeName}.js`);
  const srcPath = path.join(srcApiDir, file);

  try {
    // Read the source file
    let sourceCode = fs.readFileSync(srcPath, 'utf-8');

    // If TypeScript, compile to JavaScript
    if (file.endsWith('.ts')) {
      const result = ts.transpileModule(sourceCode, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      });
      sourceCode = result.outputText;
    }

    // Extract the handler code (remove export default)
    let handlerCode = sourceCode.replace(/export\s+default\s+/, '').trim();

    // Web Standard API wrapper with inlined handler
    const wrapper = `// Generated serverless wrapper for ${file}

const handler = ${handlerCode};

export async function GET(req) {
  return await wrapHandler(req, 'GET', handler);
}

export async function POST(req) {
  return await wrapHandler(req, 'POST', handler);
}

export async function PUT(req) {
  return await wrapHandler(req, 'PUT', handler);
}

export async function DELETE(req) {
  return await wrapHandler(req, 'DELETE', handler);
}

export async function PATCH(req) {
  return await wrapHandler(req, 'PATCH', handler);
}

export async function OPTIONS(req) {
  return new Response(null, { 
    status: 204,
    headers: { 'Allow': 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }
  });
}

async function wrapHandler(req, method, handlerFn) {
  try {
    // Create Node.js style request
    const url = new URL(req.url);
    const nodeRequest = {
      method: method,
      headers: Object.fromEntries(req.headers),
      body: ['GET', 'DELETE', 'HEAD'].includes(method) ? {} : await req.json().catch(() => ({})),
      query: Object.fromEntries(url.searchParams),
      params: {},
      ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-client-ip') || 'unknown',
      url: req.url
    };

    // Response accumulator
    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseData = null;

    // Node.js style response
    const nodeResponse = {
      status: (code) => {
        statusCode = code;
        return nodeResponse;
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
        return nodeResponse;
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

    // Call original handler
    const result = await Promise.resolve().then(() => 
      handlerFn(nodeRequest, nodeResponse)
    );

    // Return response
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
  } catch (error) {
    console.error(`  ❌ ${routeName} - ${error.message}`);
  }
});

console.log(`\n🚀 API routes ready in: dist/api/\n`);
