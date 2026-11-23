import { createApp } from './app';
import { config } from './config';
import { pool } from './db/pool';

const server = createApp().listen(config.PORT, () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);