import { app, errorHandler } from './app.js';
import express from 'express';
import { resolve } from 'node:path';
import { production } from './config.js';
if (production) {
  app.use(express.static(resolve('dist'), { index: false }));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use(errorHandler);
const server = app.listen(Number(process.env.PORT || 3000), () => console.log(`Dantam listening on http://localhost:${process.env.PORT || 3000}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
