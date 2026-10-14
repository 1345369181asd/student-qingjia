import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { getDb } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'student-leave-system-secret-key-2024';
const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'leave_system_token';

export interface UserPayload {
  id: string;
  username: string;
  name: string;
  role: string;
  class_id: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: UserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    return null;
  }
}

import { headers } from 'next/headers';

export async function getCurrentUser(): Promise<UserPayload | null> {
  // Check Authorization header first (for API testing / non-browser clients)
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) return payload;
  }

  // Fall back to cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function loginWithCredentials(username: string, password: string): Promise<{ user: UserPayload; token: string } | null> {
  const db = getDb();
  const { data, error } = await db
    .from('users')
    .select('id, username, password_hash, name, role, class_id')
    .eq('username', username)
    .eq('is_active', 'true')
    .maybeSingle();

  if (error) throw new Error(`查询失败: ${error.message}`);
  if (!data) return null;

  const valid = await verifyPassword(password, data.password_hash);
  if (!valid) return null;

  const payload: UserPayload = {
    id: data.id,
    username: data.username,
    name: data.name,
    role: data.role,
    class_id: data.class_id,
  };

  const token = generateToken(payload);
  return { user: payload, token };
}

export async function seedDemoData() {
  const db = getDb();

  // Check if demo data already exists
  const { data: existingAdmin } = await db
    .from('users')
    .select('id')
    .eq('username', 'admin')
    .maybeSingle();

  if (existingAdmin) return;

  // Create demo classes
  const { data: class1 } = await db.from('classes').insert({
    name: '计算机2401班',
    grade: '2024级',
    description: '计算机科学与技术',
  }).select().single();

  const { data: class2 } = await db.from('classes').insert({
    name: '计算机2402班',
    grade: '2024级',
    description: '软件工程',
  }).select().single();

  const { data: class3 } = await db.from('classes').insert({
    name: '数学2401班',
    grade: '2024级',
    description: '应用数学',
  }).select().single();

  // Create admin
  const adminHash = await hashPassword('admin123');
  await db.from('users').insert({
    username: 'admin',
    password_hash: adminHash,
    name: '系统管理员',
    role: 'admin',
  });

  // Create teachers
  const teacher1Hash = await hashPassword('teacher123');
  const { data: teacher1 } = await db.from('users').insert({
    username: 'T2024001',
    password_hash: teacher1Hash,
    name: '张老师',
    role: 'teacher',
  }).select().single();

  const teacher2Hash = await hashPassword('teacher123');
  await db.from('users').insert({
    username: 'T2024002',
    password_hash: teacher2Hash,
    name: '李老师',
    role: 'teacher',
  });

  // Create students
  const student1Hash = await hashPassword('student123');
  const { data: student1 } = await db.from('users').insert({
    username: 'S2024001',
    password_hash: student1Hash,
    name: '王小明',
    role: 'student',
    class_id: class1?.id,
  }).select().single();

  const student2Hash = await hashPassword('student123');
  const { data: student2 } = await db.from('users').insert({
    username: 'S2024002',
    password_hash: student2Hash,
    name: '李小红',
    role: 'student',
    class_id: class1?.id,
  }).select().single();

  const student3Hash = await hashPassword('student123');
  await db.from('users').insert({
    username: 'S2024003',
    password_hash: student3Hash,
    name: '赵小刚',
    role: 'student',
    class_id: class2?.id,
  });

  const student4Hash = await hashPassword('student123');
  await db.from('users').insert({
    username: 'S2024004',
    password_hash: student4Hash,
    name: '刘小美',
    role: 'student',
    class_id: class3?.id,
  });

  // Create sample leave requests
  if (student1 && teacher1) {
    await db.from('leave_requests').insert([
      {
        student_id: student1.id,
        leave_type: 'sick',
        start_date: '2024-10-01',
        end_date: '2024-10-03',
        reason: '感冒发烧，需要休息',
        status: 'approved',
        teacher_id: teacher1.id,
        approval_comment: '注意休息，早日康复',
        approved_at: new Date().toISOString(),
      },
      {
        student_id: student1.id,
        leave_type: 'personal',
        start_date: '2024-10-10',
        end_date: '2024-10-10',
        reason: '家中有事需要处理',
        status: 'pending',
      },
      {
        student_id: student2.id,
        leave_type: 'sick',
        start_date: '2024-10-05',
        end_date: '2024-10-06',
        reason: '去医院检查牙齿',
        status: 'approved',
        teacher_id: teacher1.id,
        approval_comment: '批准',
        approved_at: new Date().toISOString(),
      },
      {
        student_id: student2.id,
        leave_type: 'other',
        start_date: '2024-10-15',
        end_date: '2024-10-17',
        reason: '参加学术论文答辩',
        status: 'rejected',
        teacher_id: teacher1.id,
        approval_comment: '时间过长，请调整',
        approved_at: new Date().toISOString(),
      },
    ]);
  }
}
