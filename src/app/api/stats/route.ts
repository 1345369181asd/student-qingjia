import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可查看统计' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const db = getDb();

    // Build base query filter
    let baseFilter = db.from('leave_requests').select('id, leave_type, status, student_id, start_date');
    if (startDate) {
      baseFilter = baseFilter.gte('start_date', startDate);
    }
    if (endDate) {
      baseFilter = baseFilter.lte('start_date', endDate);
    }

    const { data: allLeaves, error } = await baseFilter;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const leaves = allLeaves || [];

    // Total counts
    const total = leaves.length;
    const pending = leaves.filter(l => l.status === 'pending').length;
    const approved = leaves.filter(l => l.status === 'approved').length;
    const rejected = leaves.filter(l => l.status === 'rejected').length;

    // By leave type
    const byType: Record<string, number> = {};
    for (const l of leaves) {
      byType[l.leave_type] = (byType[l.leave_type] || 0) + 1;
    }

    // By status
    const byStatus = { pending, approved, rejected };

    // Get class info for students
    const studentIds = [...new Set(leaves.map(l => l.student_id))];
    const studentClassMap: Record<string, string> = {};
    if (studentIds.length > 0) {
      const { data: students } = await db
        .from('users')
        .select('id, class_id')
        .in('id', studentIds);
      if (students) {
        for (const s of students) {
          studentClassMap[s.id] = s.class_id || 'unknown';
        }
      }
    }

    // Get class names
    const classIds = [...new Set(Object.values(studentClassMap))].filter(id => id !== 'unknown');
    const classNameMap: Record<string, string> = {};
    if (classIds.length > 0) {
      const { data: classes } = await db
        .from('classes')
        .select('id, name')
        .in('id', classIds);
      if (classes) {
        for (const c of classes) {
          classNameMap[c.id] = c.name;
        }
      }
    }

    // By class
    const byClass: Record<string, number> = {};
    for (const l of leaves) {
      const classId = studentClassMap[l.student_id] || 'unknown';
      const className = classNameMap[classId] || '未分班';
      byClass[className] = (byClass[className] || 0) + 1;
    }

    // By date (daily)
    const byDate: Record<string, number> = {};
    for (const l of leaves) {
      byDate[l.start_date] = (byDate[l.start_date] || 0) + 1;
    }

    return NextResponse.json({
      data: {
        total,
        byStatus,
        byType,
        byClass,
        byDate,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
