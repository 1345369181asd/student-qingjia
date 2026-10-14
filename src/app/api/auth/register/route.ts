import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, generateToken, setAuthCookie } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { UserPayload } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password, name, class_id } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const db = getDb();

    // Check if username already exists
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '该学号已被注册' }, { status: 409 });
    }

    const password_hash = await hashPassword(password);

    const { data, error } = await db
      .from('users')
      .insert({
        username,
        password_hash,
        name,
        role: 'student',
        class_id: class_id || null,
      })
      .select('id, username, name, role, class_id')
      .single();

    if (error) throw new Error(`注册失败: ${error.message}`);

    const payload: UserPayload = {
      id: data.id,
      username: data.username,
      name: data.name,
      role: data.role,
      class_id: data.class_id,
    };

    const token = generateToken(payload);
    await setAuthCookie(token);

    return NextResponse.json({ user: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '注册失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
