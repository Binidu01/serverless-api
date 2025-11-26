export default function handler(req: any, res: any) {
  res.status(200).json({
    message: 'Hello from Bini.js TypeScript!',
    timestamp: new Date().toISOString(),
    method: req.method,
    working: true,
    typeScript: true
  });
}
