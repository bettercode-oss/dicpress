import { prisma } from "@/lib/prisma";
import RegisterPasskeyForm from "@/components/admin/RegisterPasskeyForm";

export default async function RegisterPasskeyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const invalid = (msg: string) => (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow text-center">
        <p className="text-red-600 font-medium">{msg}</p>
      </div>
    </div>
  );

  if (!token) return invalid("유효하지 않은 링크입니다.");

  const record = await prisma.webAuthnChallenge.findFirst({
    where: { challenge: token, type: "registration_invite" },
  });

  if (!record) return invalid("유효하지 않은 링크입니다.");
  // eslint-disable-next-line react-hooks/purity -- server component, no re-renders
  if (record.expiresAt.getTime() < Date.now()) return invalid("만료된 링크입니다.");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Passkey 등록</h1>
          <p className="mt-1 text-sm text-gray-500">기기의 생체인증으로 Passkey를 등록합니다.</p>
          <p className="mt-2 text-sm text-gray-700 font-medium">{record.email}</p>
        </div>
        <RegisterPasskeyForm token={token} email={record.email} />
      </div>
    </div>
  );
}
