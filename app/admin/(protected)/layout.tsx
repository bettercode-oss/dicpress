import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import Link from "next/link";
import Image from "next/image";
import { SITE_NAME } from "@/lib/site";
import { buildInfo } from "@/lib/build-info";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-10 flex items-center gap-4 px-4 border-b border-gray-200 bg-white shrink-0">
        <Link href="/admin/documents" className="hover:opacity-70 transition-opacity">
          <Image src="/logo.png" alt={SITE_NAME} width={24} height={24} />
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/admin/documents" className="text-xs text-gray-500 hover:text-gray-900">문서</Link>
          <Link href="/" target="_blank" className="text-xs text-gray-500 hover:text-gray-900">사이트 보기 ↗</Link>
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
      <footer className="shrink-0 py-2 text-center text-[11px] text-gray-300">
        v{buildInfo.version} ·{" "}
        {buildInfo.repoUrl ? (
          <a href={`${buildInfo.repoUrl}/commit/${buildInfo.gitSha}`} target="_blank" className="hover:text-gray-500">
            {buildInfo.gitSha}
          </a>
        ) : buildInfo.gitSha}{" "}
        · {new Date(buildInfo.buildTime).toLocaleString("ko-KR")}
      </footer>
    </div>
  );
}
