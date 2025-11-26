export default {
  // Where Bini will output compiled assets
  outDir: "dist", // CHANGED: Now uses standard dist folder

  // Dev server settings
  port: 3000,
  host: "0.0.0.0",

  // API Routes configuration
  api: {
    dir: "src/app/api",
    bodySizeLimit: "2mb",
    extensions: [".js", ".ts", ".mjs"]
  },

  // Static file handling
  static: {
    dir: "public",
    maxAge: 3600,
    dotfiles: "deny",
    immutable: false
  },

  // Build settings
  build: {
    minify: true,
    sourcemap: true,
    target: "esnext",
    clean: true,
    cssCodeSplit: true
  },

  // CORS
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  },

  // Security Layer
  security: {
    csp: {
      enabled: false,
    },
    hidePoweredBy: true,
    referrerPolicy: "no-referrer",
    xssFilter: true,
    frameguard: "deny"
  },

  // Logging
  logging: {
    level: "info",
    color: true,
    timestamp: true
  }
};