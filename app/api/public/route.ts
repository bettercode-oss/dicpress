import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공개 색인용 - 좌측 키워드 목록 데이터
export async function GET() {
  const documents = await prisma.document.findMany({
    where: { status: "PUBLISHED" },
    select: {
      title: true,
      slug: true,
      summary: true,
      publishedAt: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(documents, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate" },
  });
}
