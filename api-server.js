#!/usr/bin/env node

import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyHelmet from "@fastify/helmet";
import fastifyCors from "@fastify/cors";
import fastifyRateLimiter from "@fastify/rate-limit";
import { fileURLToPath } from "url";
import path from "path";
import { createServer } from "net";
import net from "net";
import os from "os";
import { spawn } from "child_process";
import { promisify } from "util";
import { exec as execCb } from "child_process";
import fs from "fs";
import zlib from "zlib";
import { displayBiniStartup } from "./bini/internal/env-checker.js";

const execp = promisify(execCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_ENV = process.env.NODE_ENV || "production";
const DEFAULT_PORT = parseInt(
  process.env.PORT || (NODE_ENV === "development" ? "3001" : "3000"),
  10
);
const ENABLE_CORS = true;
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "100", 10);

const handlerCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

let isShuttingDown = false;
const activeRequests = new Set();

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const shutdownTimeout = setTimeout(() => {
    process.exit(1);
  }, 30000);

  const checkRequests = setInterval(() => {
    if (activeRequests.size === 0) {
      clearInterval(checkRequests);
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }
  }, 100);
}

function validateDistPath(distPath) {
  const resolvedPath = path.resolve(process.cwd(), distPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Build directory not found: ${resolvedPath}\nRun: npm run build`
    );
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Build path is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAllNetworkIps() {
  const interfaces = os.networkInterfaces();
  const allIps = ["localhost"];

  for (const name in interfaces) {
    if (/docker|veth|br-|lo|loopback|vmnet|vbox|utun|tun|tap/i.test(name))
      continue;
    for (const iface of interfaces[name]) {
      if (!iface) continue;
      if (iface.internal) continue;
      if (iface.family === "IPv4") {
        allIps.push(iface.address);
      }
    }
  }
  return [...new Set(allIps)];
}

function displayServerUrls(port) {
  const allIps = getAllNetworkIps();
  console.log(
    "  \x1b[32m➜\x1b[39m  Local:   \x1b[36mhttp://localhost:" +
      port +
      "/\x1b[39m"
  );
  allIps.forEach((ip) => {
    if (ip !== "localhost") {
      console.log(
        "  \x1b[32m➜\x1b[39m  Network: \x1b[36mhttp://" +
          ip +
          ":" +
          port +
          "/\x1b[39m"
      );
    }
  });
}

async function isTcpConnectable(port, host = "127.0.0.1", timeout = 250) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    s.setTimeout(timeout);

    s.once("connect", () => {
      done = true;
      s.destroy();
      resolve(true);
    });

    s.once("timeout", () => {
      if (!done) {
        done = true;
        s.destroy();
        resolve(false);
      }
    });

    s.once("error", () => {
      if (!done) {
        done = true;
        s.destroy();
        resolve(false);
      }
    });

    try {
      s.connect(port, host);
    } catch (e) {
      if (!done) {
        done = true;
        try {
          s.destroy();
        } catch (_) {}
        resolve(false);
      }
    }
  });
}

async function isPortBusyOnLoopback(port, timeout = 200) {
  const v4 = await isTcpConnectable(port, "127.0.0.1", timeout);
  if (v4) return true;

  try {
    const v6 = await isTcpConnectable(port, "::1", timeout);
    return v6;
  } catch {
    return false;
  }
}

async function getPidsListeningOnPort(port) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execp(`netstat -ano | findstr :${port}`, {
        timeout: 3000,
      });
      if (!stdout) return [];
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        const m = line.match(/\s+LISTENING\s+(\d+)$/);
        if (m) pids.add(Number(m[1]));
      }
      return Array.from(pids);
    } else {
      try {
        const { stdout } = await execp(
          `lsof -nP -iTCP:${port} -sTCP:LISTEN -Fp`,
          { timeout: 3000 }
        );
        if (!stdout) return [];
        const pids = new Set();
        for (const line of stdout.split(/\r?\n/)) {
          const m = line.match(/^p(\d+)/);
          if (m) pids.add(Number(m[1]));
        }
        return Array.from(pids);
      } catch {
        try {
          const { stdout } = await execp(`ss -tulpn | grep :${port} || true`, {
            timeout: 3000,
          });
          if (!stdout) return [];
          const pids = new Set();
          for (const line of stdout.split(/\r?\n/)) {
            const mp = line.match(/pid=(\d+)/) || line.match(/(\d+)\/[^\s]+/);
            if (mp) pids.add(Number(mp[1]));
          }
          return Array.from(pids);
        } catch {
          return [];
        }
      }
    }
  } catch {
    return [];
  }
}

async function getCommandLineForPid(pid) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execp(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\\"ProcessId=${pid}\\\" | Select-Object -ExpandProperty CommandLine"`,
        { timeout: 3000 }
      );
      return (stdout || "").trim();
    } else {
      const { stdout } = await execp(`ps -p ${pid} -o args=`, {
        timeout: 3000,
      });
      return (stdout || "").trim();
    }
  } catch {
    return "";
  }
}

async function portOwnedByDisallowedProcess(
  port,
  denyPatterns = [/next/i, /vite/i, /webpack/i]
) {
  const pids = await getPidsListeningOnPort(port);
  if (!pids || pids.length === 0) return false;
  for (const pid of pids) {
    const cmd = await getCommandLineForPid(pid);
    for (const pat of denyPatterns) {
      if (pat.test(cmd)) {
        return { owned: true, pid, cmd };
      }
    }
  }
  return { owned: false };
}

async function findOpenPort(
  startPort = DEFAULT_PORT,
  maxPort = Math.min(startPort + 1000, 65535)
) {
  for (let port = startPort; port <= maxPort; port++) {
    try {
      const accepting = await isPortBusyOnLoopback(port, 200);
      if (accepting) {
        console.log(`Port ${port} is in use, trying another one...`);
        continue;
      }

      const available = await new Promise((resolve, reject) => {
        const tester = createServer();
        const onError = (err) => {
          if (err && err.code === "EADDRINUSE") {
            try {
              tester.close();
            } catch (_) {}
            resolve(false);
          } else {
            try {
              tester.close();
            } catch (_) {}
            reject(err);
          }
        };
        tester.once("error", onError);
        tester.once("listening", () => {
          tester.close(() => resolve(true));
        });
        tester.listen(port, "0.0.0.0");
      });

      if (available) {
        return port;
      } else {
        await delay(50);
        continue;
      }
    } catch (err) {
      if (err && (err.code === "EACCES" || err.code === "EADDRNOTAVAIL"))
        throw err;
      await delay(50);
      continue;
    }
  }
  throw new Error(
    `No available port found between ${startPort} and ${maxPort}`
  );
}

async function loadApiHandler(routePath) {
  const now = Date.now();
  const cached = handlerCache.get(routePath);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.handler;
  }

  try {
    const apiDir = path.join(process.cwd(), "src/app/api");
    const extensions = [".js", ".ts", ".mjs", ".cjs"];
    let handlerPath = null;

    for (const ext of extensions) {
      const testPath = path.join(apiDir, routePath + ext);
      if (fs.existsSync(testPath)) {
        handlerPath = testPath;
        break;
      }
    }

    if (!handlerPath) {
      return null;
    }

    let handlerModule;

    if (handlerPath.endsWith(".ts")) {
      try {
        const handlerUrl =
          new URL("file://" + handlerPath).href + "?t=" + Math.random();
        handlerModule = await import(handlerUrl);
      } catch (tsError) {
        try {
          const ts = await import("typescript");
          const fileContent = fs.readFileSync(handlerPath, "utf8");

          const result = ts.transpileModule(fileContent, {
            compilerOptions: {
              target: ts.ScriptTarget.ES2020,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.React,
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
            },
          });

          const compiledCode = result.outputText;
          const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(
            compiledCode
          )}`;
          handlerModule = await import(moduleUrl);
        } catch (compileError) {
          throw new Error(
            `TypeScript API routes require tsx or ts-node in production. ` +
              `Install with: npm install -D tsx\n` +
              `Or convert ${routePath} to JavaScript.`
          );
        }
      }
    } else {
      const handlerUrl =
        new URL("file://" + handlerPath).href + "?t=" + Math.random();
      handlerModule = await import(handlerUrl);
    }

    const handler = handlerModule.default;

    if (typeof handler !== "function") {
      throw new Error("Invalid API handler - export a default function");
    }

    handlerCache.set(routePath, { handler, timestamp: now });
    return handler;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function createFastifyServer() {
  const distPath = validateDistPath("dist"); // CHANGED: Now uses standard dist folder

  const app = fastify({
    logger: false,
    bodyLimit: 1048576,
    trustProxy: 1,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true,
    connectionTimeout: 60000,
    keepAliveTimeout: 65000,
    requestTimeout: 60000,
    http2SessionTimeout: 600000,
  });

  app.addHook("onClose", async () => {
    handlerCache.clear();
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    dnsPrefetchControl: false,
    frameguard: false,
    hsts: false,
    ieNoOpen: false,
    noSniff: false,
    referrerPolicy: false,
    xssFilter: false,
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyRateLimiter, {
    max: RATE_LIMIT,
    timeWindow: "15 minutes",
    cache: 10000,
    allowList: ["127.0.0.1", "::1"],
    skipOnError: true,
  });

  app.addHook("onRequest", async (req, reply) => {
    const reqId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    activeRequests.add(reqId);
    req.requestId = reqId;

    reply.header("X-Powered-By", "Bini.js");
  });

  app.addHook("onResponse", async (req, reply) => {
    activeRequests.delete(req.requestId);
  });

  await app.register(fastifyStatic, {
    root: distPath,
    prefix: "/",
    constraints: {},
    maxAge: NODE_ENV === "production" ? "1y" : 0,
    etag: true,
    lastModified: true,
    wildcard: false,
    preCompressed: true,
    index: ["index.html"],
    dotfiles: "deny",
    acceptRanges: true,
  });

  app.addHook("onSend", async (req, reply, payload) => {
    try {
      if (
        !reply.sent &&
        !req.url.startsWith("/api/") &&
        req.url !== "/health" &&
        req.url !== "/metrics"
      ) {
        const acceptEncoding = req.headers["accept-encoding"] || "";
        if (
          acceptEncoding.includes("gzip") &&
          (typeof payload === "string" || Buffer.isBuffer(payload))
        ) {
          reply.header("Vary", "Accept-Encoding");
          reply.header("Content-Encoding", "gzip");
          const compressed = await new Promise((resolve, reject) => {
            zlib.gzip(payload, { level: 6 }, (err, result) =>
              err ? reject(err) : resolve(result)
            );
          });
          return compressed;
        }
      }
    } catch (e) {
      // Silent compression failure
    }
    return payload;
  });

  app.get("/health", async (req, reply) {
    reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      node: {
        version: process.version,
        env: NODE_ENV,
      },
    };
  });

  app.get("/metrics", async (req, reply) {
    reply.header("Cache-Control", "no-cache");
    return {
      server: {
        uptime: process.uptime(),
        activeRequests: activeRequests.size,
        handlersCached: handlerCache.size,
      },
      memory: process.memoryUsage(),
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
      };
  });

  app.route({
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    url: "/api/*",
    handler: async (req, reply) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let routePath = url.pathname.replace("/api/", "") || "index";
        if (routePath.endsWith("/")) routePath = routePath.slice(0, -1);

        const handler = await loadApiHandler(routePath);
        if (!handler) {
          reply.status(404).type("application/json");
          return {
            error: "API route not found",
            path: routePath,
          };
        }

        const query = {};
        for (const [k, v] of url.searchParams) query[k] = v;

        const request = {
          method: req.method,
          headers: req.headers,
          body: req.body || {},
          query,
          ip: req.ip,
          url: req.url,
          params: {},
        };

        let responded = false;
        const response = {
          status: (code) => {
            reply.status(code);
            return response;
          },
          setHeader: (k, v) => {
            reply.header(k, v);
            return response;
          },
          json: (data) => {
            responded = true;
            reply.type("application/json").send(data);
          },
          send: (data) => {
            responded = true;
            if (typeof data === "object") {
              reply.type("application/json").send(data);
            } else {
              reply.send(data);
            }
          },
          end: (data) => {
            responded = true;
            if (data) reply.send(data);
          },
        };

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 30000)
        );

        const handlerPromise = Promise.resolve().then(() =>
          handler(request, response)
        );
        const result = await Promise.race([handlerPromise, timeoutPromise]);

        if (!responded && result) {
          reply.type("application/json").send(result);
        }
      } catch (error) {
        if (!reply.sent) {
          reply.status(500).type("application/json");
          reply.send({
            error: "Internal Server Error",
            message: error.message,
            ...(NODE_ENV === "development" && { stack: error.stack }),
          });
        }
      }
    },
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/")) {
      reply.status(404).type("application/json");
      return {
        error: "Not found",
        message: "API endpoint does not exist",
        path: req.url,
      };
    }

    try {
      const indexHtmlPath = path.join(distPath, "index.html");
      if (!fs.existsSync(indexHtmlPath)) {
        throw new Error("Index.html not found");
      }
      reply.type("text/html");
      const content = await fs.promises.readFile(indexHtmlPath, "utf-8");
      return content;
    } catch (error) {
      reply.status(404).type("text/html");
      return `
        <html>
          <head>
            <title>404 - Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <h1>404 Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
          </body>
        </html>
      `;
    }
  });

  app.setErrorHandler(async (error, req, reply) => {
    if (!reply.sent) {
      reply.status(500).type("application/json");
      return {
        error: "Internal Server Error",
        message: "Something went wrong",
        ...(NODE_ENV === "development" && {
          details: error.message,
        }),
      };
    }
  });

  return app;
}

function safeOpenBrowser(port) {
  setTimeout(() => {
    try {
      const url = `http://localhost:${port}`;

      let command, args = [];
      const platform = process.platform;

      if (platform === "darwin") {
        command = "open";
        args = [url];
      } else if (platform === "win32") {
        command = "cmd";
        args = ["/c", "start", "", url];
      } else {
        command = "xdg-open";
        args = [url];
      }

      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });

      child.unref();
      child.on("error", () => {});
    } catch (error) {
      // Silent catch
    }
  }, 1000);
}

async function startServer() {
  const maxPortSpan = 1000;
  const maxPort = Math.min(DEFAULT_PORT + maxPortSpan, 65535);
  let attemptStartPort = DEFAULT_PORT;
  const maxRetries = 50;
  let retries = 0;

  const listenHost = "0.0.0.0";

  while (retries < maxRetries) {
    retries++;
    try {
      const port = await findOpenPort(attemptStartPort, maxPort);
      process.env.PORT = String(port);

      const startTime = Date.now();
      const app = await createFastifyServer();

      try {
        await app.listen({ port, host: listenHost });

        const readyTime = Date.now() - startTime;
        console.log(
          `\n \x1b[32mFastify 4.28\x1b[39m  \x1b[90mready in\x1b[39m ${readyTime} ms\n`
        );

        displayServerUrls(port);

        try {
          displayBiniStartup({
            mode: NODE_ENV === "development" ? "dev" : "prod",
          });
        } catch (e) {
          // Silent fallback
        }

        safeOpenBrowser(port);

        return;
      } catch (listenError) {
        if (listenError && listenError.code === "EADDRINUSE") {
          attemptStartPort = port + 1;
          try {
            await app.close();
          } catch (_) {}
          await delay(100);
          continue;
        } else {
          try {
            await app.close();
          } catch (_) {}
          throw listenError;
        }
      }
    } catch (err) {
      if (err && (err.code === "EACCES" || err.code === "EADDRNOTAVAIL")) {
        process.exit(1);
      }
      if (
        err &&
        err.message &&
        err.message.startsWith("No available port found")
      ) {
        process.exit(1);
      }
      process.exit(1);
    }
  }

  process.exit(1);
}

process.on("uncaughtException", (error) => {
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  process.exit(1);
});

startServer().catch((error) => {
  process.exit(1);
});