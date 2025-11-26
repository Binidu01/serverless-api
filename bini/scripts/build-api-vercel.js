#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'api');

if (!fs.existsSync(distApiDir)) {
  fs.mkdirSync(distApiDir, { recursive: true });
}

const apiFiles = fs.readdirSync(srcApiDir).filter(f => /\.(js|ts|mjs)$/.test(f));
console.log(`📦 Building ${apiFiles.length} serverless API routes...\n`);

apiFiles.forEach(file => {
  const routeName = path.basename(file, path.extname(file));
  const outputPath = path.join(distApiDir, `${routeName}.js`);
  const srcPath = path.join(srcApiDir, file);

  let sourceCode = fs.readFileSync(srcPath, 'utf-8');

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

  const wrapper = `// Vercel Serverless Function for ${file}
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

export default async (req, res) => {
  try {
    // Create a mock response object with chainable methods
    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseBody = null;
    let sent = false;

    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
        return mockRes;
      },
      json: (data) => {
        responseBody = data;
        sent = true;
      },
      send: (data) => {
        responseBody = data;
        sent = true;
      },
      end: (data) => {
        if (data) responseBody = data;
        sent = true;
      }
    };

    const result = await Promise.resolve().then(() => originalHandler(req, mockRes));

    // If nothing was sent via mockRes methods, use the return value
    const finalBody = sent ? responseBody : result;

    res.status(statusCode);
    Object.entries(responseHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.json(finalBody || {});
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
`;

  fs.writeFileSync(outputPath, wrapper);
  console.log(`  ✅ ${routeName}`);
});

console.log(`\n🚀 Vercel Functions ready in: api/\n`);
