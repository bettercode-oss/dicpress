"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import KeywordList, { type DocItem } from "./KeywordList";
import { SITE_NAME } from "@/lib/site";

export default function DictionaryLayout({
  docs,
  children,
}: {
  docs: DocItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 키워드 클릭 후 모바일 사이드바 닫기
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-11 flex items-center px-4 border-b border-gray-100 bg-white shrink-0 z-20">
        <Link href="/" className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors">
          {SITE_NAME}
        </Link>
        {/* Mobile: show current keyword */}
        {pathname !== "/" && (
          <span className="ml-3 text-sm text-gray-400 truncate max-w-[200px] hidden sm:block">
            {docs.find((d) => `/${d.slug}` === pathname)?.title}
          </span>
        )}
        {/* Mobile toggle button */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="ml-auto text-sm text-gray-500 md:hidden flex items-center gap-1"
          aria-label="목록 열기"
        >
          {mobileOpen ? (
            <>닫기 <span aria-hidden>✕</span></>
          ) : (
            <>목록 <span aria-hidden>☰</span></>
          )}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={`
            flex-col border-r border-gray-100 bg-white
            ${mobileOpen ? "flex" : "hidden"}
            md:flex
            w-full md:w-64 lg:w-72
            absolute md:relative inset-0 md:inset-auto
            z-10 shrink-0
          `}
        >
          <KeywordList docs={docs} onSelect={() => setMobileOpen(false)} />
        </aside>

        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-[5] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Right content panel */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
