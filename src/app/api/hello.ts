// Example TypeScript API route
export default function handler(req: any, _res: any) {
  return {
    message: 'Hello from Bini.js TypeScript!',
    timestamp: new Date().toISOString(),
    method: req.method,
    working: true,
    typeScript: true
  };
}