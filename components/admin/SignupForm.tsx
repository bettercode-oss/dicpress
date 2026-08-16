"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "오류가 발생했습니다.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          계정 신청이 완료되었습니다. 관리자 승인 후 이메일로 Passkey 등록 링크가 발송됩니다.
        </p>
        <Link href="/admin/login" className="block text-center text-sm text-blue-600 hover:underline">
          로그인 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">이름</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">이메일</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "loading" ? "신청 중..." : "계정 신청"}
      </button>
      <p className="text-center text-sm text-gray-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/admin/login" className="text-blue-600 hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
