"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";
import { useRouter } from "next/navigation";
import VersionHistoryPanel from "./VersionHistoryPanel";

type DocumentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface DocumentData {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  contentMd: string;
  status: DocumentStatus;
  thumbnailUrl: string | null;
  tags: { tag: { name: string } }[];
}

marked.use({ gfm: true, breaks: true });

function slugify(text: string): string {
  return text
    .trim()
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .substring(0, 80);
}

export default function EditorClient({ document }: { document: DocumentData }) {
  const router = useRouter();

  const [title, setTitle] = useState(document.title);
  const [slug, setSlug] = useState(document.slug);
  const [summary, setSummary] = useState(document.summary ?? "");
  const [tagsInput, setTagsInput] = useState(document.tags.map((t) => t.tag.name).join(", "));
  const [thumbnailUrl, setThumbnailUrl] = useState(document.thumbnailUrl ?? "");
  const [content, setContent] = useState(document.contentMd);
  const [status, setStatus] = useState<DocumentStatus>(document.status);
  const [preview, setPreview] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showMeta, setShowMeta] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [slugManual, setSlugManual] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time preview
  useEffect(() => {
    if (showHistory) return; // 이력 패널이 열려있을 때는 미리보기 불필요
    const result = marked.parse(content || "");
    if (result instanceof Promise) result.then(setPreview);
    else setPreview(result as string);
  }, [content, showHistory]);

  const doSave = useCallback(
    async (nextStatus?: DocumentStatus) => {
      setSaveStatus("saving");
      try {
        const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
        const res = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            slug,
            summary: summary || null,
            contentMd: content,
            status: nextStatus ?? status,
            thumbnailUrl: thumbnailUrl || null,
            tags,
          }),
        });
        if (!res.ok) throw new Error();
        setSaveStatus("saved");
        if (nextStatus) {
          setStatus(nextStatus);
          router.refresh();
        }
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    },
    [document.id, title, slug, summary, content, status, tagsInput, thumbnailUrl, router],
  );

  // 자동저장 (10초 디바운스)
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => doSave(), 10_000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [content, title, slug, summary, tagsInput, doSave]);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave]);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManual) setSlug(slugify(val));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: end } = el;
    const next = content.substring(0, s) + "  " + content.substring(end);
    setContent(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = s + 2;
        textareaRef.current.selectionEnd = s + 2;
      }
    });
  }

  async function uploadImage(file: File, insertAt: number) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("documentId", document.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) return;
    const { url } = await res.json();
    const md = `![${file.name}](${url})`;
    setContent((prev) => prev.substring(0, insertAt) + md + prev.substring(insertAt));
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const pos = textareaRef.current?.selectionStart ?? content.length;
    Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")).forEach((f) => uploadImage(f, pos));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    e.preventDefault();
    const pos = textareaRef.current?.selectionStart ?? content.length;
    images.forEach((f) => uploadImage(f, pos));
  }

  // 버전 복원: 에디터 내용 교체 + 자동저장 타이머 리셋
  function handleRestore(restoredMd: string) {
    setContent(restoredMd);
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  const statusLabel = { DRAFT: "초안", PUBLISHED: "배포됨", ARCHIVED: "보관됨" } as const;
  const statusColor = {
    DRAFT: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    ARCHIVED: "bg-gray-100 text-gray-500",
  } as const;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <a href="/admin/documents" className="text-xs text-gray-400 hover:text-gray-700">← 목록</a>
        <span className="text-gray-200">|</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[status]}`}>
          {statusLabel[status]}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 min-w-[64px] text-right">
          {saveStatus === "saving" && "저장 중..."}
          {saveStatus === "saved" && <span className="text-green-500">저장됨 ✓</span>}
          {saveStatus === "error" && <span className="text-red-500">저장 실패</span>}
        </span>
        {/* 이력 토글 */}
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={`text-xs px-3 py-1.5 border rounded transition-colors ${
            showHistory
              ? "border-blue-400 text-blue-600 bg-blue-50"
              : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          이력
        </button>
        <button
          onClick={() => doSave()}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          임시저장
        </button>
        {status === "PUBLISHED" ? (
          <button
            onClick={() => doSave("DRAFT")}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            배포 취소
          </button>
        ) : (
          <button
            onClick={() => doSave("PUBLISHED")}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            배포
          </button>
        )}
        {status === "PUBLISHED" && (
          <a href={`/${slug}`} target="_blank" className="text-xs text-blue-600 hover:underline">
            보기 ↗
          </a>
        )}
      </div>

      {/* Title area */}
      <div className="px-6 pt-4 pb-2 border-b border-gray-100 bg-white shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="제목(키워드)을 입력하세요"
          className="w-full text-2xl font-bold text-gray-900 outline-none placeholder-gray-300"
        />
        <div className="flex items-center gap-4 mt-1.5">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-400">슬러그:</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              className="text-blue-600 outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-400 min-w-[12rem]"
            />
          </div>
          <button
            onClick={() => setShowMeta((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
          >
            {showMeta ? "▲ 메타데이터 접기" : "▼ 메타데이터 펼치기"}
          </button>
        </div>
      </div>

      {/* Metadata panel */}
      {showMeta && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-2 gap-x-6 gap-y-3 shrink-0">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">요약</label>
            <input type="text" value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="한 줄 요약"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">태그 (쉼표로 구분)</label>
            <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              placeholder="예: 용어, 개념, 패턴"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">대표 이미지 URL</label>
            <input type="text" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="/uploads/image.png 또는 https://..."
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus)}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white">
              <option value="DRAFT">초안</option>
              <option value="PUBLISHED">배포됨</option>
              <option value="ARCHIVED">보관됨</option>
            </select>
          </div>
        </div>
      )}

      {/* Editor / Right panel split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Markdown editor */}
        <div className="w-1/2 flex flex-col border-r border-gray-200">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium shrink-0">
            마크다운 편집 · 이미지 드래그앤드롭 또는 Ctrl+V
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handlePaste}
            placeholder={"# 제목\n\n마크다운으로 작성하세요.\n\n- 이미지: 드래그앤드롭 또는 붙여넣기\n- 자동저장: 10초 간격\n- 수동저장: Ctrl+S / Cmd+S"}
            className="flex-1 p-4 font-mono text-sm text-gray-800 resize-none outline-none leading-relaxed bg-white"
            spellCheck={false}
          />
        </div>

        {/* Right panel: 미리보기 또는 이력 */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          {showHistory ? (
            <VersionHistoryPanel
              documentId={document.id}
              onRestore={handleRestore}
            />
          ) : (
            <>
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium shrink-0">
                미리보기
              </div>
              <div
                className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none prose-headings:font-bold prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
