import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const db = getDb();

    let query = db
      .from('leave_requests')
      .select(`
        *,
        student:users!leave_requests_student_id_users_id_fk(id, username, name, class_id, classes:classes!users_class_id_classes_id_fk(id, name)),
        teacher:users!leave_requests_teacher_id_users_id_fk(id, name)
      `)
      .order('created_at', { ascending: false });

    if (user.role === 'student') {
      query = query.eq('student_id', user.id);
    } else if (user.role === 'teacher') {
      // Teachers see pending requests from all students (for approval) and their processed ones
      const type = searchParams.get('type') || 'pending';
      if (type === 'pending') {
        query = query.eq('status', 'pending');
      } else if (type === 'processed') {
        query = query.eq('teacher_id', user.id).neq('status', 'pending');
      }
    }
    // Admin sees all

    if (status && user.role !== 'teacher') {
      query = query.eq('status', status);
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
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: '仅学生可提交请假申请' }, { status: 403 });
    }

    const { leave_type, start_date, end_date, reason } = await request.json();

    if (!leave_type || !start_date || !end_date || !reason) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const db = getDb();
    const { data, error } = await db
      .from('leave_requests')
      .insert({
        student_id: user.id,
        leave_type,
        start_date,
        end_date,
        reason,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`提交失败: ${error.message}`);

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
