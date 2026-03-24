import { NextResponse } from 'next/server';
import { createSession, hashPassword, normalizedUserName, validateCredentials } from '@/lib/auth';
import { dbQuery } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const username = String(body.username || '');
        const password = String(body.password || '');
        const validationError = validateCredentials(username, password);

        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const normalizedUsernameValue = normalizedUserName(username);
        const existing = await dbQuery<{ id: number }>(
            'SELECT id FROM app_users WHERE username = $1 LIMIT 1',
            [normalizedUsernameValue]
        );

        if (existing.rows[0]) {
            return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
        }

        const inserted = await dbQuery<{ id: number; username: string }>(
            `INSERT INTO app_users (username, password_hash)
             VALUES ($1, $2)
             RETURNING id, username`,
            [normalizedUsernameValue, hashPassword(password)]
        );

        const user = inserted.rows[0];

        await dbQuery(
            `INSERT INTO reading_progress (user_id, start_date, completed_items, language)
             VALUES ($1, NULL, '[]'::jsonb, 'en')
             ON CONFLICT (user_id) DO NOTHING`,
            [user.id]
        );

        await createSession(user.id);

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Register failed', error);
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
}

