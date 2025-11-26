// Deploy to Cloudflare Workers
import router from 'itty-router';

const r = router();

// Import all API routes
const apiRoutes = import.meta.glob('./dist/api/*.js', { eager: true });

for (const [path, module] of Object.entries(apiRoutes)) {
  const routeName = path.match(/\/(\w+)\.js$/)?.[1];
  if (!routeName) continue;

  r.all(`/api/${routeName}`, async (req) => {
    const method = req.method.toUpperCase();
    if (module[method]) {
      return await module[method](req);
    }
    return new Response('Method Not Allowed', { status: 405 });
  });
}

// SPA fallback
r.all('*', async (req) => {
  const response = await fetch(req);
  return response;
});

export default r;