import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
// Lê o .env da raiz do projeto (se não existir, segue em silêncio: o modo demo não precisa dele)
dotenv.config({ path: path.resolve(dir, '../../.env') });

export const config = {
  port: Number(process.env.PORT) || 3001,
  companyName: process.env.COMPANY_NAME || 'Nome da Empresa',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  },
};
