import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SetupForm from "@/components/admin/SetupForm";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: `초기 설정 — ${SITE_NAME} 관리자` };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (ownerExists) redirect("/admin/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{SITE_NAME} 초기 설정</h1>
        <p className="text-xs text-gray-400 mb-6">최초 1회 실행 — Owner 계정 Passkey 등록</p>
        <SetupForm />
      </div>
    </div>
  );
}
