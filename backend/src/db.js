import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool(config.db);

/** Executa `fn(client)` dentro de uma transação (BEGIN/COMMIT, ROLLBACK em caso de erro). */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
