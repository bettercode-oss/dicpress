"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import { SITE_URL } from "@/lib/site";

marked.use({ gfm: true, breaks: true });

interface DocModalProps {
  title: string;
  content: string;
  slug: string;
  onClose: () => void;
}

export function DocModal({ title, content, slug, onClose }: DocModalProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    Promise.resolve(marked.parse(content)).then(setHtml);
  }, [content]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div
          className="overflow-y-auto px-5 py-4 prose prose-sm max-w-none
            prose-headings:font-bold prose-a:text-blue-600
            prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <a
            href={`${SITE_URL}/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            전체 보기 ↗
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
