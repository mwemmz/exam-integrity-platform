import { Pool, types } from 'pg';

// Most timestamps are `timestamp without time zone` holding UTC. By default node-pg reads them in the server
// process's local timezone, which shifts every deadline when the server is not running in UTC (a 20-minute exam
// showed 0:00 left). Read them as UTC and keep every database session in UTC so both sides agree.
types.setTypeParser(1114, (value: string) => new Date(value.replace(' ', 'T') + 'Z'));

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
        ? { rejectUnauthorized: false }
        : undefined
});
pool.on('connect', client => { client.query("SET TIME ZONE 'UTC'").catch(() => {}); });
