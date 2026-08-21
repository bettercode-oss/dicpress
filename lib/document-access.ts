import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/authz";
import type { Prisma } from "@prisma/client";

/**
 * 목록 조회용 where 조각.
 * OWNER/ADMIN 은 전체 문서, AUTHOR 는 본인 문서만 본다.
 */
export function documentScope(actor: Actor): Prisma.DocumentWhereInput {
  return actor.role === "AUTHOR" ? { authorId: actor.id } : {};
}

/** 이 문서를 다룰 수 있는가. AUTHOR 는 본인 문서만. */
export function canAccessDocument(actor: Actor, document: { authorId: string }) {
  return actor.role !== "AUTHOR" || document.authorId === actor.id;
}

/** 접근 거부 응답. 문서를 이미 조회한 곳에서 canAccessDocument 와 함께 쓴다. */
export function forbidden() {
  return NextResponse.json({ error: "권한 없음" }, { status: 403 });
}

/**
 * 단일 문서에 접근할 수 있는지 확인하고 문서를 반환한다.
 * 실패 시 그대로 반환하면 되는 응답을 돌려준다.
 *
 *   const document = await requireDocumentAccess(actor, id);
 *   if (document instanceof NextResponse) return document;
 */
export async function requireDocumentAccess(actor: Actor, id: string) {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessDocument(actor, document)) return forbidden();
  return document;
}
