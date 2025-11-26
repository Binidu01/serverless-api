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

  // Compile TypeScript to JavaScript
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

  // Extract the function body - handle both arrow functions and function declarations
  let handlerCode = sourceCode;

  // Remove CommonJS exports
  handlerCode = handlerCode.replace(/exports\.default\s*=\s*/, '');
  handlerCode = handlerCode.replace(/module\.exports\s*=\s*/, '');
  handlerCode = handlerCode.replace(/export\s+default\s+/, '');

  // Trim
  handlerCode = handlerCode.trim();

  // Remove trailing semicolon if it exists
  if (handlerCode.endsWith(';')) {
    handlerCode = handlerCode.slice(0, -1);
  }

  // Generate Netlify Function wrapper (CommonJS format for Netlify)
  const wrapper = `// Netlify Function for ${file}
const originalHandler = ${handlerCode};

exports.handler = async (event, context) => {
  try {
    // Parse request
    const method = event.httpMethod || 'GET';
    const headers = event.headers || {};
    const path = event.path || '/';
    
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        body = {};
      }
    }

    const queryParams = event.queryStringParameters || {};

    // Create Node.js style request object
    const req = {
      method,
      headers,
      body,
      query: queryParams,
      params: {},
      ip: headers['x-forwarded-for'] || headers['client-ip'] || 'unknown',
      url: path
    };

    // Response handler
    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseBody = null;
    let responded = false;

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
        responded = true;
      },
      send: (data) => {
        responseBody = data;
        responded = true;
      },
      end: (data) => {
        if (data) responseBody = data;
        responded = true;
      }
    };

    // Call original handler
    const result = await Promise.resolve().then(() => originalHandler(req, res));

    // Use responseBody if set by res methods, otherwise use result
    const finalBody = responseBody !== null ? responseBody : result;

    // Return Netlify Function response
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

  fs.writeFileSync(outputPath, wrapper);
  console.log(`  ✅ ${routeName}`);
});

console.log(`\n🚀 Netlify Functions ready in: dist/api/\n`);
