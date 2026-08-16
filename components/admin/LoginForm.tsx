"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { DicTooltip } from "@/components/DicTooltip";

interface LoginFormProps {
  needsSetup?: boolean;
}

export default function LoginForm({ needsSetup }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1) 인증 옵션 요청
      const optRes = await fetch("/api/auth/webauthn/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!optRes.ok) {
        const d = await optRes.json();
        setError(d.error === "등록된 Passkey 없음"
          ? "이 이메일에 등록된 Passkey가 없습니다."
          : "로그인에 실패했습니다.");
        return;
      }

      const options = await optRes.json();

      // 2) 브라우저 Passkey 인증
      const credential = await startAuthentication(options);

      // 3) 서버 검증
      const verRes = await fetch("/api/auth/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, response: credential }),
      });

      if (!verRes.ok) {
        setError("Passkey 인증에 실패했습니다.");
        return;
      }

      const { token } = await verRes.json();

      // 4) NextAuth 세션 발급
      const result = await signIn("webauthn", { token, redirect: false });

      if (result?.error) {
        setError("세션 발급에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      router.push("/admin/documents");
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey 인증이 취소되었습니다.");
      } else {
        setError("로그인 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (needsSetup) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-3">
          <p className="font-medium mb-1">초기 설정이 필요합니다</p>
          <p>먼저 Owner 계정에 Passkey를 등록해 주세요.</p>
        </div>
        <Link
          href="/admin/setup"
          className="w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded text-sm transition-colors"
        >
          초기 설정하기
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <div>
        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
          이메일 <DicTooltip keyword="email-only" side="right" />
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded text-sm transition-colors"
      >
        {loading ? "인증 중..." : "Passkey로 로그인"}
      </button>
      <p className="text-center text-xs text-gray-400">
        계정이 없으신가요?{" "}
        <Link href="/admin/signup" className="text-blue-500 hover:underline">
          계정 신청
        </Link>
      </p>
    </form>
  );
}
