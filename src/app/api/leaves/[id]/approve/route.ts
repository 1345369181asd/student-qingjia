import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可审批' }, { status: 403 });
    }

    const { id } = await params;
    const { action, comment } = await request.json();

    if (!action || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: '无效的审批操作' }, { status: 400 });
    }

    const db = getDb();

    // Check if the leave request is still pending
    const { data: leave, error: fetchError } = await db
      .from('leave_requests')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!leave) return NextResponse.json({ error: '请假记录不存在' }, { status: 404 });
    if (leave.status !== 'pending') {
      return NextResponse.json({ error: '该申请已被处理' }, { status: 400 });
    }

    const { error: updateError } = await db
      .from('leave_requests')
      .update({
        status: action,
        teacher_id: user.id,
        approval_comment: comment || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw new Error(`审批失败: ${updateError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '审批失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
