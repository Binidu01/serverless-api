// #!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const srcApiDir = path.join(process.cwd(), 'src/app/api');
const distApiDir = path.join(process.cwd(), 'api'); // Change to 'api' for Vercel

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

  // VERCEL FORMAT
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
    const method = req.method || 'GET';
    const headers = req.headers || {};
    
    let body = {};
    if (req.body) {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        body = {};
      }
    }

    const request = {
      method,
      headers,
      body,
      query: req.query || {},
      params: req.params || {},
      ip: headers['x-forwarded-for'] || headers['client-ip'] || 'unknown',
      url: req.url
    };

    let statusCode = 200;
    let responseHeaders = { 'Content-Type': 'application/json' };
    let responseBody = null;

    const response = {
      status: (code) => {
        statusCode = code;
        return response;
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
        return response;
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

    const result = await Promise.resolve().then(() => originalHandler(request, response));
    const finalBody = responseBody !== null ? responseBody : result;

    res.status(statusCode).setHeader('Content-Type', 'application/json').json(finalBody || {});
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
