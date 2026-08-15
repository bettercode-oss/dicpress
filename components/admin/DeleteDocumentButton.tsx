"use client";

import { useRouter } from "next/navigation";

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm(`"${title}" 문서를 영구 삭제합니다. 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("삭제에 실패했습니다.");
  }

  return (
    <button
      onClick={handleDelete}
      className="text-xs text-red-500 hover:underline ml-3"
    >
      삭제
    </button>
  );
}
