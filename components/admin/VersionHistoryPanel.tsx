"use client";

import { useState, useEffect } from "react";
import { marked } from "marked";

interface Version {
  id: string;
  versionNo: number;
  contentMd: string;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionHistoryPanel({
  documentId,
  onRestore,
}: {
  documentId: string;
  onRestore: (contentMd: string) => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${documentId}/versions`)
      .then((r) => r.json())
      .then((data: Version[]) => {
        setVersions(data);
        if (data.length > 0) setSelected(data[0]);
        setLoading(false);
      });
  }, [documentId]);

  useEffect(() => {
    if (!selected) { setPreview(""); return; }
    const result = marked.parse(selected.contentMd || "");
    if (result instanceof Promise) result.then(setPreview);
    else setPreview(result as string);
  }, [selected]);

  async function handleRestore() {
    if (!selected || restoring) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNo: selected.versionNo }),
      });
      if (res.ok) {
        const { contentMd } = await res.json();
        onRestore(contentMd);
        setRestored(true);
        setTimeout(() => setRestored(false), 2500);
        // 목록 갱신
        const updated = await fetch(`/api/documents/${documentId}/versions`).then((r) => r.json());
        setVersions(updated);
        if (updated.length > 0) setSelected(updated[0]);
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 flex items-center shrink-0">
        <span>저장 이력{!loading && ` (${versions.length})`}</span>
        {restored && <span className="ml-auto text-green-600">✓ 복원 완료</span>}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>
      ) : versions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-6 text-center">
          저장된 이력이 없습니다.
          <br />
          임시저장 또는 배포 시 이력이 생성됩니다.
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Version list */}
          <ul className="shrink-0 overflow-y-auto border-b border-gray-100" style={{ maxHeight: "220px" }}>
            {versions.map((v) => {
              const isSelected = selected?.id === v.id;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setSelected(v)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors ${
                      isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`font-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        isSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      v{v.versionNo}
                    </span>
                    <span className={`text-xs truncate ${isSelected ? "text-blue-700" : "text-gray-500"}`}>
                      {formatDate(v.createdAt)}
                    </span>
                    {isSelected && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRestore(); }}
                        disabled={restoring}
                        className="ml-auto shrink-0 text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {restoring ? "복원 중…" : "이 버전으로 복원"}
                      </button>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Selected version preview */}
          {selected ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-xs text-gray-400 shrink-0">
                v{selected.versionNo} · {formatDate(selected.createdAt)} 미리보기
              </div>
              <div
                className="flex-1 overflow-y-auto p-4 prose prose-sm max-w-none prose-headings:font-bold prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              버전을 선택하면 미리보기가 표시됩니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}
