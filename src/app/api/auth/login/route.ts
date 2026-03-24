import { NextResponse } from 'next/server';
import { createSession, normalizedUserName, verifyPassword } from '@/lib/auth';
import { dbQuery } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const username = normalizedUserName(String(body.username || ''));
        const password = String(body.password || '');

        const result = await dbQuery<{ id: number; username: string; password_hash: string }>(
            `SELECT id, username, password_hash
             FROM app_users
             WHERE username = $1
             LIMIT 1`,
            [username]
        );

        const user = result.rows[0];

        if (!user || !verifyPassword(password, user.password_hash)) {
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        await createSession(user.id);

        return NextResponse.json({
            user: {
                id: user.id,
                username: user.username,
            },
        });
    } catch (error) {
        console.error('Login failed', error);
        return NextResponse.json({ error: 'Failed to sign in' }, { status: 500 });
    }
}

