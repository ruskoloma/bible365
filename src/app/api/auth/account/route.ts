import { NextResponse } from 'next/server';
import { clearSession, getCurrentUser } from '@/lib/auth';
import { dbQuery } from '@/lib/db';

export async function DELETE() {
    const user = await getCurrentUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await dbQuery('DELETE FROM app_users WHERE id = $1', [user.id]);
        await clearSession();
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Delete account failed', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
