import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/authz";
import UsersPage from "@/components/admin/UsersPage";

export default async function AdminUsersPage() {
  // role 을 세션이 아니라 DB 에서 읽는다 — 강등이 즉시 반영되어야 한다.
  const actor = await getSessionActor();
  if (!actor) redirect("/admin/login");
  if (!["OWNER", "ADMIN"].includes(actor.role)) redirect("/admin/documents");

  return <UsersPage currentUserId={actor.id} currentUserRole={actor.role} />;
}
