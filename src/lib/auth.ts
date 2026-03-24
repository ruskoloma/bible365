import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { dbQuery } from './db';

export interface AuthUser {
    id: number;
    username: string;
}

const SESSION_COOKIE_NAME = 'bible365_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const normalizeUsername = (username: string) => username.trim().toLowerCase();

export const hashPassword = (password: string) => {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
    const [salt, expected] = storedHash.split(':');
    if (!salt || !expected) return false;

    const actual = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (actual.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(actual, expectedBuffer);
};

const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const createSession = async (userId: number) => {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await dbQuery(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
    );

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        expires: expiresAt,
    });
};

export const clearSession = async () => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
        await dbQuery('DELETE FROM user_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) return null;

    await dbQuery('DELETE FROM user_sessions WHERE expires_at <= NOW()');

    const result = await dbQuery<AuthUser>(
        `SELECT u.id, u.username
         FROM user_sessions s
         JOIN app_users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
         LIMIT 1`,
        [hashSessionToken(token)]
    );

    return result.rows[0] ?? null;
};

export const validateCredentials = (username: string, password: string) => {
    const normalizedUsername = normalizeUsername(username);

    if (normalizedUsername.length < 3 || normalizedUsername.length > 40) {
        return 'Username must be between 3 and 40 characters';
    }

    if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
        return 'Username can only contain letters, numbers, dots, dashes, and underscores';
    }

    if (password.length < 4 || password.length > 200) {
        return 'Password must be between 4 and 200 characters';
    }

    return null;
};

export const normalizedUserName = normalizeUsername;

