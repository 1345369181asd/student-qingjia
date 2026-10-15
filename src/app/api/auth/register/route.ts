import { NextResponse } from "next/server";

// 一期不开放匿名自行注册，学生账号由教务资料导入 / 管理员创建
export async function POST() {
  return NextResponse.json(
    { error: "本系统不开放自行注册，学生账号由学校导入或管理员分配" },
    { status: 403 }
  );
}
