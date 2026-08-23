"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 새 문서를 만든다.
 *
 * 예전에는 `/admin/documents/new` 페이지가 렌더 도중 문서를 만들고 리다이렉트했다.
 * 그러면 `<Link>` 의 prefetch 가 **hover 만으로** 문서를 만들어 버려서, 목록을 열어
 * 훑기만 해도 빈 문서가 쌓였다. 생성은 반드시 사용자의 클릭 → POST 여야 한다.
 */
export function NewDocumentButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 문서", status: "DRAFT" }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: null }));
        alert(error ?? "문서를 만들지 못했습니다.");
        return;
      }
      const doc = await res.json();
      router.push(`/admin/documents/${doc.id}/edit`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <button type="button" onClick={create} disabled={creating} className={className}>
      {creating ? "만드는 중…" : children}
    </button>
  );
}
