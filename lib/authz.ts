import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";

/** 요청을 수행하는 주체. 세션에서 뽑아낸 최소 정보만 담는다. */
export type Actor = {
  id: string;
  email: string;
  role: UserRole;
};

/**
 * 세션을 확인하고 Actor 를 반환한다. 실패 시 그대로 반환하면 되는 응답을 돌려준다.
 *
 *   const actor = await requireSession(["OWNER", "ADMIN"]);
 *   if (actor instanceof NextResponse) return actor;
 */
export async function requireSession(roles?: UserRole[]): Promise<Actor | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const actor: Actor = {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
  };

  if (roles && !roles.includes(actor.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  return actor;
}
