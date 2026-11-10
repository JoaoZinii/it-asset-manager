import { config } from './config.js';
import { createApp } from './app.js';
import { createPgService } from './services/pgService.js';

if (!config.db.user || !config.db.password || !config.db.database) {
  console.error('Configure POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB no arquivo .env (veja .env.example).');
  process.exit(1);
}

createApp(createPgService()).listen(config.port, () => {
  console.log(`API (PostgreSQL) em http://localhost:${config.port}/api`);
});
