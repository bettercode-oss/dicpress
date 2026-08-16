import LoginForm from "@/components/admin/LoginForm";
import { SITE_NAME } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const metadata = { title: `로그인 — ${SITE_NAME} 관리자` };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" } });
  const needsSetup = !ownerExists;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">{SITE_NAME} 관리자</h1>
        <LoginForm needsSetup={needsSetup} />
      </div>
    </div>
  );
}
