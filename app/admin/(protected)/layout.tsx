import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { SITE_NAME } from "@/lib/site";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-10 flex items-center gap-4 px-4 border-b border-gray-200 bg-white shrink-0">
        <a href="/admin/documents" className="text-sm font-semibold text-gray-900 hover:text-blue-600">
          {SITE_NAME} 관리
        </a>
        <nav className="flex items-center gap-3">
          <a href="/admin/documents" className="text-xs text-gray-500 hover:text-gray-900">문서</a>
          <a href="/" target="_blank" className="text-xs text-gray-500 hover:text-gray-900">사이트 보기 ↗</a>
        </nav>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">{session.user?.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
            로그아웃
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
