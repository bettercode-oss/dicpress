"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface DocItem {
  title: string;
  slug: string;
  tags: string[];
}

export default function KeywordList({
  docs,
  onSelect,
}: {
  docs: DocItem[];
  onSelect?: () => void;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(query.toLowerCase()) ||
          d.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
      )
    : docs;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-100 shrink-0">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="키워드 검색..."
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 bg-gray-50"
        />
      </div>

      {/* Keyword list */}
      <ul className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-sm text-gray-400 text-center">
            검색 결과 없음
          </li>
        )}
        {filtered.map((doc) => {
          const isActive = pathname === `/${doc.slug}`;
          return (
            <li key={doc.slug}>
              <Link
                href={`/${doc.slug}`}
                onClick={onSelect}
                className={`block px-4 py-2.5 text-sm transition-colors border-l-2 ${
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                    : "border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-200"
                }`}
              >
                {doc.title}
                {doc.tags.length > 0 && (
                  <span className="block text-xs text-gray-400 mt-0.5 font-normal">
                    {doc.tags.join(" · ")}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer count */}
      <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 shrink-0">
        {filtered.length}개 항목
      </div>
    </div>
  );
}
