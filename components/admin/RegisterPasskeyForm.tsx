"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";

export default function RegisterPasskeyForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleRegister() {
    setStatus("loading");
    setMessage("");
    try {
      // 1. Get registration options
      const optRes = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      if (!optRes.ok) {
        const d = await optRes.json();
        throw new Error(d.error ?? "옵션 조회 실패");
      }
      const options = await optRes.json();

      // 2. Trigger browser Passkey UI
      const registrationResponse = await startRegistration(options);

      // 3. Verify registration
      const verRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, response: registrationResponse, token }),
      });
      if (!verRes.ok) {
        const d = await verRes.json();
        throw new Error(d.error ?? "검증 실패");
      }

      // 4. Complete — activate account
      const completeRes = await fetch("/api/admin/register-passkey/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!completeRes.ok) {
        const d = await completeRes.json();
        throw new Error(d.error ?? "계정 활성화 실패");
      }

      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
      // User cancelled Passkey UI — reset silently
      if (msg.includes("cancelled") || msg.includes("AbortError") || msg.includes("NotAllowedError")) {
        setStatus("idle");
        return;
      }
      setMessage(msg);
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-700">Passkey 등록이 완료되었습니다. 이제 로그인할 수 있습니다.</p>
        <button
          onClick={() => router.push("/admin/login")}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          로그인하기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
      <button
        onClick={handleRegister}
        disabled={status === "loading"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "loading" ? "등록 중..." : "Passkey 등록하기"}
      </button>
      <p className="text-center text-xs text-gray-400">기기의 Touch ID / Face ID / 보안 키를 사용합니다.</p>
    </div>
  );
}
