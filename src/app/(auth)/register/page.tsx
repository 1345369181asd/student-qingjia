import Link from "next/link";
import { Info } from "lucide-react";

export const metadata = { title: "注册已关闭 - 学生请假系统" };

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 mb-4">
          <Info className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">自助注册已关闭</h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          学生账号由管理员统一创建并分配初始密码，支持 CSV 批量导入。
          如忘记密码，请联系管理员重置。
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          返回登录
        </Link>
      </div>
    </div>
  );
}
