import SignupForm from "@/components/admin/SignupForm";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">계정 신청</h1>
          <p className="mt-1 text-sm text-gray-500">관리자가 승인하면 이메일로 안내해 드립니다.</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
