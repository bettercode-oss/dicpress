import { auth } from "@/auth";
import { redirect } from "next/navigation";
import UsersPage from "@/components/admin/UsersPage";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!["OWNER", "ADMIN"].includes(session.user.role)) redirect("/admin/documents");

  return <UsersPage currentUserId={session.user.id} currentUserRole={session.user.role} />;
}
