"use client";

import { useEffect, useState, useCallback } from "react";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "AUTHOR";
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  createdAt: string;
};

type AccountRequest = {
  id: string;
  name: string | null;
  email: string;
  requestedAt: string;
};

const ROLE_LABEL: Record<string, string> = { OWNER: "오너", ADMIN: "관리자", AUTHOR: "작성자" };
const STATUS_LABEL: Record<string, string> = { PENDING: "대기", ACTIVE: "활성", SUSPENDED: "정지" };

export default function UsersPage({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: "OWNER" | "ADMIN" | "AUTHOR";
}) {
  const [tab, setTab] = useState<"users" | "requests">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  const fetchRequests = useCallback(async () => {
    const res = await fetch("/api/admin/accounts");
    if (res.ok) setRequests(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch, setState in callback is safe
    Promise.all([fetchUsers(), fetchRequests()]).finally(() => setLoading(false));
  }, [fetchUsers, fetchRequests]);

  async function changeRole(id: string, role: string) {
    await fetch(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await fetchUsers();
  }

  async function changeStatus(id: string, status: string) {
    await fetch(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchUsers();
  }

  async function approve(id: string) {
    await fetch(`/api/admin/accounts/${id}/approve`, { method: "POST" });
    await fetchRequests();
  }

  async function reject(id: string) {
    await fetch(`/api/admin/accounts/${id}/reject`, { method: "POST" });
    await fetchRequests();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">사용자 관리</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(["users", "requests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "users" ? "사용자 목록" : `계정 신청 대기 ${requests.length > 0 ? `(${requests.length})` : ""}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : tab === "users" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="pb-2 pr-4 font-medium">이름</th>
                <th className="pb-2 pr-4 font-medium">이메일</th>
                <th className="pb-2 pr-4 font-medium">역할</th>
                <th className="pb-2 pr-4 font-medium">상태</th>
                <th className="pb-2 pr-4 font-medium">가입일</th>
                <th className="pb-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isOwner = user.role === "OWNER";
                const canChangeRole = currentUserRole === "OWNER" && !isSelf && !isOwner;
                const canChangeStatus = !isSelf && !isOwner;

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-900">{user.name ?? "-"}</td>
                    <td className="py-2 pr-4 text-gray-600">{user.email}</td>
                    <td className="py-2 pr-4">
                      {canChangeRole ? (
                        <select
                          value={user.role}
                          onChange={(e) => changeRole(user.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-1 py-0.5"
                        >
                          <option value="ADMIN">관리자</option>
                          <option value="AUTHOR">작성자</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-600">{ROLE_LABEL[user.role]}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                          user.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : user.status === "SUSPENDED"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {STATUS_LABEL[user.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="py-2">
                      {canChangeStatus && user.status === "ACTIVE" && (
                        <button
                          onClick={() => changeStatus(user.id, "SUSPENDED")}
                          className="text-xs text-red-600 hover:underline"
                        >
                          정지
                        </button>
                      )}
                      {canChangeStatus && user.status === "SUSPENDED" && (
                        <button
                          onClick={() => changeStatus(user.id, "ACTIVE")}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          복구
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400">대기 중인 계정 신청이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="pb-2 pr-4 font-medium">이름</th>
                    <th className="pb-2 pr-4 font-medium">이메일</th>
                    <th className="pb-2 pr-4 font-medium">신청일</th>
                    <th className="pb-2 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-900">{req.name ?? "-"}</td>
                      <td className="py-2 pr-4 text-gray-600">{req.email}</td>
                      <td className="py-2 pr-4 text-xs text-gray-400">
                        {new Date(req.requestedAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="py-2 flex gap-3">
                        <button
                          onClick={() => approve(req.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => reject(req.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          거절
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
