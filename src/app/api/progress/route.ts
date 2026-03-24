import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { dbQuery } from '@/lib/db';

interface ProgressRow {
    start_date: string | null;
    completed_items: string[];
    language: 'en' | 'ru';
    updated_at: string;
}

export async function GET() {
    const user = await getCurrentUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await dbQuery<ProgressRow>(
        `SELECT start_date, completed_items, language, updated_at
         FROM reading_progress
         WHERE user_id = $1
         LIMIT 1`,
        [user.id]
    );

    const row = result.rows[0];

    return NextResponse.json({
        progress: row
            ? {
                startDate: row.start_date,
                completed: row.completed_items ?? [],
                language: row.language,
                lastSynced: row.updated_at,
            }
            : null,
    });
}

export async function PUT(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const startDate = body.startDate ? String(body.startDate) : null;
        const completed = Array.isArray(body.completed) ? body.completed.map((item: unknown) => String(item)) : [];
        const language = body.language === 'ru' ? 'ru' : 'en';

        const result = await dbQuery<ProgressRow>(
            `INSERT INTO reading_progress (user_id, start_date, completed_items, language, updated_at)
             VALUES ($1, $2, $3::jsonb, $4, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET start_date = EXCLUDED.start_date,
                 completed_items = EXCLUDED.completed_items,
                 language = EXCLUDED.language,
                 updated_at = NOW()
             RETURNING start_date, completed_items, language, updated_at`,
            [user.id, startDate, JSON.stringify(completed), language]
        );

        const row = result.rows[0];

        return NextResponse.json({
            progress: {
                startDate: row.start_date,
                completed: row.completed_items ?? [],
                language: row.language,
                lastSynced: row.updated_at,
            },
        });
    } catch (error) {
        console.error('Save progress failed', error);
        return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
    }
}
