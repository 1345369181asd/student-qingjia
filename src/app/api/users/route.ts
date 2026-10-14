import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const classId = searchParams.get('class_id');
    const keyword = searchParams.get('keyword');

    const db = getDb();
    let query = db
      .from('users')
      .select('*, classes(name)')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });

    if (role) query = query.eq('role', role);
    if (classId) query = query.eq('class_id', classId);
    if (keyword) {
      query = query.or(`username.ilike.%${keyword}%,name.ilike.%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const { username, password, name, role, class_id } = await request.json();

    if (!username || !password || !name || !role) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const db = getDb();

    // Check duplicate
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '该账号已存在' }, { status: 409 });
    }

    const { hashPassword } = await import('@/lib/auth');
    const password_hash = await hashPassword(password);

    const { data, error } = await db
      .from('users')
      .insert({
        username,
        password_hash,
        name,
        role,
        class_id: class_id || null,
      })
      .select()
      .single();

    if (error) throw new Error(`创建失败: ${error.message}`);

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
