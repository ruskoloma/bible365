import { Pool, type QueryResultRow } from 'pg';

const globalForDb = globalThis as typeof globalThis & {
    __bible365Pool?: Pool;
    __bible365SchemaPromise?: Promise<void>;
};

const pool = globalForDb.__bible365Pool ?? new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

if (!globalForDb.__bible365Pool) {
    globalForDb.__bible365Pool = pool;
}

const requiredTables = ['app_users', 'user_sessions', 'reading_progress'] as const;

const verifyRequiredTables = async () => {
    const result = await pool.query<{ table_name: string | null }>(
        `SELECT to_regclass('public.app_users') AS app_users,
                to_regclass('public.user_sessions') AS user_sessions,
                to_regclass('public.reading_progress') AS reading_progress`
    );

    const row = result.rows[0];
    const missingTables = requiredTables.filter((tableName) => row?.[tableName as keyof typeof row] === null);

    if (missingTables.length > 0) {
        throw new Error(
            `Database schema is missing tables (${missingTables.join(', ')}). ` +
            `Grant CREATE on schema public to "${process.env.DATABASE_USER}" or run the SQL in scripts/init-db.sql with an admin account.`
        );
    }
};

const ensureSchema = async () => {
    if (!globalForDb.__bible365SchemaPromise) {
        globalForDb.__bible365SchemaPromise = (async () => {
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS app_users (
                        id BIGSERIAL PRIMARY KEY,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );

                    CREATE TABLE IF NOT EXISTS user_sessions (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                        token_hash TEXT NOT NULL UNIQUE,
                        expires_at TIMESTAMPTZ NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );

                    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
                    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

                    CREATE TABLE IF NOT EXISTS reading_progress (
                        user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
                        start_date TEXT,
                        completed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
                        language TEXT NOT NULL DEFAULT 'en',
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                `);
            } catch (error) {
                const code = typeof error === 'object' && error && 'code' in error ? error.code : null;
                if (code === '42501') {
                    await verifyRequiredTables();
                    return;
                }
                throw error;
            }
        })();
    }

    return globalForDb.__bible365SchemaPromise;
};

export const dbQuery = async <T extends QueryResultRow>(text: string, params: unknown[] = []) => {
    await ensureSchema();
    return pool.query<T>(text, params);
};
