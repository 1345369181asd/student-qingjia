import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('classes')
      .select('*')
      .order('grade', { ascending: false })
      .order('name');

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

    const { name, grade, description } = await request.json();
    if (!name || !grade) {
      return NextResponse.json({ error: '请填写班级名称和年级' }, { status: 400 });
    }

    const db = getDb();
    const { data, error } = await db
      .from('classes')
      .insert({ name, grade, description: description || null })
      .select()
      .single();

    if (error) throw new Error(`创建失败: ${error.message}`);

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
