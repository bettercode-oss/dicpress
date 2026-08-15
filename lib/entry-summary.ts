import { cache } from "react";
import { prisma } from "@/lib/prisma";

const SUMMARY_MAX_LENGTH = 150;

/** contentMd에서 첫 문단 텍스트를 추출해 요약으로 사용 */
function extractFirstParagraph(md: string): string {
  const paragraph = md
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("```"));

  if (!paragraph) return "";

  // 마크다운 인라인 문법 제거 (링크, 강조, 코드)
  const plain = paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .trim();

  return plain.length > SUMMARY_MAX_LENGTH
    ? plain.slice(0, SUMMARY_MAX_LENGTH) + "…"
    : plain;
}

/**
 * slug로 PUBLISHED 문서의 요약을 반환한다.
 * Document.summary 필드 우선, 없으면 contentMd 첫 문단에서 추출.
 * 문서가 없거나 비공개이면 null 반환.
 */
// 캐싱 전략: React.cache()로 단일 요청 내 동일 slug 중복 DB 조회 제거.
// 요청 간 지속 캐시는 호출 측 페이지의 ISR(revalidate=600)에 위임.
export const getEntrySummary = cache(async function getEntrySummary(slug: string): Promise<string | null> {
  const doc = await prisma.document.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { summary: true, contentMd: true },
  });

  if (!doc) return null;
  if (doc.summary) return doc.summary;
  return extractFirstParagraph(doc.contentMd) || null;
});

export interface EntryData {
  summary: string | null;
  title: string | null;
  content: string | null;
}

/**
 * slug로 PUBLISHED 문서의 요약·제목·본문을 반환한다.
 * 모달 표시 등 전문이 필요한 경우 사용.
 * 캐싱 전략: getEntrySummary와 동일 (React.cache + 호출 측 ISR).
 */
export const getEntry = cache(async function getEntry(slug: string): Promise<EntryData> {
  const doc = await prisma.document.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { title: true, summary: true, contentMd: true },
  });

  if (!doc) return { summary: null, title: null, content: null };

  const summary = doc.summary || extractFirstParagraph(doc.contentMd) || null;
  return { summary, title: doc.title, content: doc.contentMd };
});

/**
 * 마크다운 텍스트에서 내부 사전 링크의 slug 목록을 추출한다.
 * [키워드](https://dic.bizos.kr/slug) 패턴 감지.
 */
export function extractDicSlugs(md: string, siteUrl: string): string[] {
  const origin = new URL(siteUrl).origin;
  const pattern = new RegExp(
    `\\[[^\\]]+\\]\\(${origin.replace(/\./g, "\\.")}/([^/)]+)\\)`,
    "g"
  );
  const slugs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(md)) !== null) {
    slugs.push(match[1]);
  }
  return [...new Set(slugs)];
}
