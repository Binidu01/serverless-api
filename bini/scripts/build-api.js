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

  // CRITICAL FIX: Wrap transpiled code in a function to extract the handler
  const wrapper = `// Netlify Function for ${file}

// Execute the source code to get the handler
const handlerModule = {};
(function() {
  const exports = handlerModule;
  const module = { exports: handlerModule };
  
  ${sourceCode}
  
  // Make sure we have a handler
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
    // Parse request
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

    // Create Node.js style request object
    const req = {
      method,
      headers,
      body,
      query: queryParams,
      params: {},
      ip: headers['x-forwarded-for'] || headers['client-ip'] || 'unknown',
      url: pathname
    };

    // Response handler
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
