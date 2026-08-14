import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";
import { DocumentStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as DocumentStatus | null;
  const tag = searchParams.get("tag");
  const q = searchParams.get("q");

  const documents = await prisma.document.findMany({
    where: {
      ...(status && { status }),
      ...(tag && { tags: { some: { tag: { name: tag } } } }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, slug, summary, contentMd, status, thumbnailUrl, tags, authorId } = body;

  const contentHtml = await markdownToHtml(contentMd || "");

  const document = await prisma.document.create({
    data: {
      title,
      slug,
      summary,
      contentMd,
      contentHtml,
      status: status || "DRAFT",
      thumbnailUrl,
      authorId,
      ...(status === "PUBLISHED" && { publishedAt: new Date() }),
      ...(tags?.length && {
        tags: {
          create: tags.map((name: string) => ({
            tag: {
              connectOrCreate: { where: { name }, create: { name } },
            },
          })),
        },
      }),
    },
  });

  return NextResponse.json(document, { status: 201 });
}
