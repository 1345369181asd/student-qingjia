import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const db = getDb();

    // Check if the leave request exists and belongs to the student
    const { data: leave, error: fetchError } = await db
      .from('leave_requests')
      .select('id, student_id, status')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!leave) return NextResponse.json({ error: '请假记录不存在' }, { status: 404 });

    if (user.role === 'student' && leave.student_id !== user.id) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    if (leave.status !== 'pending') {
      return NextResponse.json({ error: '只能撤回待审批的申请' }, { status: 400 });
    }

    const { error: deleteError } = await db
      .from('leave_requests')
      .delete()
      .eq('id', id);

    if (deleteError) throw new Error(`撤回失败: ${deleteError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
