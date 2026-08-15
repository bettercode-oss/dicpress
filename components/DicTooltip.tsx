"use client";

import { useState, useEffect } from "react";
import { HelpTooltip } from "@/components/help-tooltip";
import type { EntryData } from "@/lib/entry-summary";

interface DicTooltipProps {
  keyword: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * dic 내부 클라이언트 컴포넌트용 툴팁.
 * keyword에 해당하는 문서 요약을 /api/entry/:keyword 에서 fetch해
 * HelpTooltip(? 아이콘)으로 표시한다. 클릭 시 DocModal로 전문 표시.
 *
 * 서버 컴포넌트 환경(마크다운 렌더러)에서는 InternalLink + getEntry를 사용할 것.
 */
export function DicTooltip({ keyword, side = "top" }: DicTooltipProps) {
  const [entry, setEntry] = useState<EntryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/entry/${encodeURIComponent(keyword)}`)
      .then((r) => r.json())
      .then((d: EntryData) => { if (!cancelled) setEntry(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [keyword]);

  if (!entry?.summary) return null;

  return (
    <HelpTooltip
      content={entry.summary}
      side={side}
      modalData={
        entry.title && entry.contentHtml
          ? { title: entry.title, html: entry.contentHtml }
          : undefined
      }
    />
  );
}
