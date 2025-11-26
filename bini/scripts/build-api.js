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

  // Extract handler code (remove export default)
  const handlerCode = sourceCode.replace(/export\s+default\s+/, '').trim();

  // Generate Netlify Function wrapper (CommonJS format for Netlify)
  const wrapper = `// Netlify Function for ${file}
const originalHandler = ${handlerCode};

exports.handler = async (event, context) => {
  try {
    // Parse request
    const method = event.httpMethod;
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
        responseBody = JSON.stringify(data);
      },
      send: (data) => {
        if (typeof data === 'object') {
          responseBody = JSON.stringify(data);
        } else {
          responseBody = data;
        }
      },
      end: (data) => {
        if (data) {
          if (typeof data === 'object') {
            responseBody = JSON.stringify(data);
          } else {
            responseBody = data;
          }
        }
      }
    };

    // Call original handler
    const result = await Promise.resolve().then(() => originalHandler(req, res));

    // Return Netlify Function response
    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody || JSON.stringify(result || {})
    };

  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      })
    };
  }
};
`;

  fs.writeFileSync(outputPath, wrapper);
  console.log(`  ✅ ${routeName}`);
});

console.log(`\n🚀 Netlify Functions ready in: dist/api/\n`);
