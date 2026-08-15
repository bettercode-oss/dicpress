"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

type Step = "password" | "passkey" | "done";

export default function SetupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "인증 실패"); return; }
      setSetupToken(data.setupToken);
      setStep("passkey");
    } catch {
      setError("서버 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyRegister() {
    setError("");
    setLoading(true);
    try {
      // 1) 등록 옵션 요청
      const optRes = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!optRes.ok) { setError("옵션 요청 실패"); return; }
      const options = await optRes.json();

      // 2) 브라우저 Passkey 생성
      const credential = await startRegistration(options);

      // 3) 검증
      const verRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, response: credential }),
      });
      if (!verRes.ok) { setError("Passkey 등록 검증 실패"); return; }

      // 4) Owner 설정 완료
      const completeRes = await fetch("/api/admin/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, setupToken }),
      });
      if (!completeRes.ok) {
        const d = await completeRes.json();
        setError(d.error ?? "설정 완료 실패");
        return;
      }

      setStep("done");
      setTimeout(() => router.push("/admin/login"), 2000);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey 등록이 취소되었습니다");
      } else {
        setError("Passkey 등록 중 오류가 발생했습니다");
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="text-center py-4">
        <p className="text-green-600 font-medium text-sm">✓ 초기 설정이 완료되었습니다</p>
        <p className="text-gray-500 text-xs mt-1">로그인 페이지로 이동합니다...</p>
      </div>
    );
  }

  if (step === "passkey") {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded px-3 py-3">
          <p className="font-medium text-blue-800 mb-1">Passkey 등록</p>
          <p><span className="font-medium">{email}</span> 계정의 Passkey를 등록합니다.</p>
          <p className="mt-1 text-xs text-blue-600">등록 후 비밀번호 없이 Passkey로만 로그인합니다.</p>
        </div>
        <button
          onClick={handlePasskeyRegister}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded text-sm transition-colors"
        >
          {loading ? "등록 중..." : "Passkey 등록하기"}
        </button>
        <button
          onClick={() => { setStep("password"); setError(""); }}
          className="text-xs text-gray-400 hover:text-gray-600 text-center"
        >
          이전으로
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-500">
        기존 계정의 이메일과 비밀번호로 인증 후 Passkey를 등록합니다.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded text-sm transition-colors"
      >
        {loading ? "확인 중..." : "다음"}
      </button>
    </form>
  );
}
