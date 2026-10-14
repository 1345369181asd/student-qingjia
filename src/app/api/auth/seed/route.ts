import { NextResponse } from 'next/server';
import { seedDemoData } from '@/lib/auth';

export async function POST() {
  try {
    await seedDemoData();
    return NextResponse.json({ success: true, message: '演示数据初始化完成' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
