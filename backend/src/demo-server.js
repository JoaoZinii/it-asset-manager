import { config } from './config.js';
import { createApp } from './app.js';
import { createMemoryService } from './services/memoryService.js';

createApp(createMemoryService()).listen(config.port, () => {
  console.log(`API (DEMO, dados em memória) em http://localhost:${config.port}/api`);
});
