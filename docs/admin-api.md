# 관리자 API 연동 가이드

> 이 문서는 **admin.bizos.kr 통합 관리자 콘솔**(`ahnyounghoe/admin`)이 dicpress 를
> 서버 간 호출로 관리하기 위한 계약입니다. 브라우저에서 직접 부르는 공개 API
> (`/api/entry/:slug` 등)는 [integration.md](./integration.md)를 보세요.

dicpress 자체 관리자 UI(`dic.bizos.kr/admin`)와 콘솔은 **같은 라우트 핸들러**를 지납니다.
인증 방식만 다르고 권한 정책·캐시 무효화는 완전히 동일합니다.

---

## 인증

| 항목 | 값 |
|---|---|
| 방식 | 고정 서비스 토큰 (`Authorization: Bearer …`) + 행위자 이메일 헤더 |
| Base URL | `http://127.0.0.1:3001` (**루프백 권장**) |
| CORS | 없음. 브라우저에서 직접 부르지 않습니다 |
| 캐시 | `cache: "no-store"` — 관리 화면은 항상 지금 값을 봐야 합니다 |

```http
Authorization: Bearer <ADMIN_SERVICE_TOKEN>
X-Actor-Email: <콘솔에 로그인한 사람의 이메일>
```

### 두 헤더가 모두 필요한 이유

콘솔과 dicpress 는 **사용자 DB 가 서로 다릅니다**(`admin_bizos` vs `dic_bizos`).
토큰은 "콘솔이라는 서비스"를 증명할 뿐 누가 그 일을 하는지는 말해 주지 않습니다.
문서의 `authorId`, `AUTHOR` 범위 정책, "자기 자신은 정지할 수 없다" 같은 규칙이
전부 행위자를 필요로 하므로 이메일을 함께 보냅니다.

dicpress 는 그 이메일로 **자기 User 를 조회**해 `role` 과 `status` 를 DB 에서 확인합니다.
헤더로 넘어온 권한 정보는 무엇도 신뢰하지 않습니다.

- 해당 이메일의 dicpress 계정이 **미리 있어야** 합니다. 없으면 만들어 주지 않고 403 입니다.
- 계정이 `ACTIVE` 가 아니면 403 입니다.
- 이메일은 **대소문자를 구분**합니다. dicpress 에 등록된 주소 그대로 보내세요.

### ⚠️ 신뢰 경계

**토큰을 쥔 쪽은 `X-Actor-Email` 로 누구든 사칭할 수 있습니다.** OWNER 이메일을 넣으면
OWNER 권한을 얻습니다. 즉 이 토큰은 서비스 토큰이라기보다 OWNER 비밀번호에 가깝습니다.

실질적인 방어는 **nginx 가 클라이언트발 `Authorization` 을 비우는 것**입니다
(`proxy_set_header Authorization "";`). 그래서 토큰 경로는 공개 인터넷에서 도달할 수 없고,
루프백으로 들어오는 콘솔에서만 살아 있습니다. 보조로 dicpress 는 토큰 요청에
`X-Forwarded-For` 가 붙어 있으면(= 공개 경로를 거쳐 왔으면) 거절합니다.

**따라서 콘솔은 반드시 `http://127.0.0.1:3001` 로 부릅니다.** 공개 URL 로 부르면
nginx 가 헤더를 비워 401 이 납니다.

### 공통 에러

| 코드 | 뜻 |
|---|---|
| 400 | `X-Actor-Email` 누락 또는 형식 오류 |
| 401 | 토큰 불일치, `Bearer` 형식 아님, 외부 경유(`X-Forwarded-For` 있음) |
| 403 | 해당 이메일의 계정이 없거나 비활성, 또는 역할 부족 |
| 404 | 대상 없음 |
| 409 | slug 중복 |
| 503 | 서버에 `ADMIN_SERVICE_TOKEN` 이 설정되지 않음 |

응답 본문은 `{ "error": "..." }` 입니다 (한국어).

---

## 문서

### `GET /api/documents`

| 항목 | 값 |
|---|---|
| 역할 | 로그인만 (AUTHOR 포함) |
| 쿼리 | `scope` `status` `q` `tag` `counts` |

- `scope=all`(기본) — `OWNER`/`ADMIN` 은 전체, `AUTHOR` 는 본인 문서
- `scope=mine` — 역할과 무관하게 본인 문서로 좁힘
- `status` — `DRAFT` \| `PUBLISHED` \| `ARCHIVED`
- `q` — 제목·slug·요약 부분 일치 (대소문자 무시)
- `counts=1` — 상태별 개수 포함. `status` 필터를 **빼고** 세므로 탭 UI 에 바로 씁니다

`AUTHOR` 가 `scope=all` 을 보내도 에러가 아니라 조용히 좁혀지고, 응답의 `scope` 에
**실제 적용된 값**이 담깁니다.

#### 응답

```jsonc
{
  "scope": "all",
  "total": 42,
  "items": [
    {
      "id": "clx...",
      "title": "관심사 분리",
      "slug": "separation-of-concerns",
      "summary": "...",
      "status": "PUBLISHED",
      "publishedAt": "2026-08-01T00:00:00.000Z",
      "createdAt": "2026-07-20T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "author": { "id": "clx...", "name": "안영회", "email": "..." },
      "tags": ["설계", "용어"]
    }
  ],
  "counts": { "ALL": 42, "DRAFT": 10, "PUBLISHED": 30, "ARCHIVED": 2 }
}
```

### `POST /api/documents`

문서를 만듭니다. 본문은 전부 선택입니다.

```jsonc
{ "title": "새 문서", "slug": "new-doc", "summary": null,
  "contentMd": "", "status": "DRAFT", "tags": ["설계"] }
```

- `slug` 를 주지 않으면 `draft-<timestamp>` 임시값이 붙습니다. 편집 화면에서 고칩니다
- 중복 slug 는 **409**
- `status: "PUBLISHED"` 로 만들면 공개 페이지 캐시를 즉시 무효화합니다
- 응답 **201** — 생성된 문서 레코드

### `GET` / `PATCH` / `DELETE` `/api/documents/{id}`

`GET` 은 태그와 최근 버전 10개를 포함한 문서 레코드입니다.
`PATCH` 는 보낸 필드만 바꾸고, 바꾸기 전 내용을 자동으로 새 버전으로 남깁니다.

**배포·비공개 전환·slug 변경·삭제 시 `revalidatePath` 가 dicpress 프로세스 안에서 실행됩니다.**
콘솔이 DB 를 직접 쓰면 이게 일어나지 않아 공개 페이지가 낡은 채로 남습니다.
**그래서 문서 쓰기는 반드시 이 API 를 지나야 합니다.**

### `GET /api/documents/{id}/versions` · `POST /api/documents/{id}/restore`

버전 목록과 복원입니다. 복원 본문은 `{ "versionNo": 3 }` 이고,
현재 내용을 새 버전으로 저장한 뒤 되돌립니다.

### `POST /api/upload`

`multipart/form-data` — `file`(필수), `documentId`(선택).
JPEG·PNG·GIF·WebP, 최대 5MB.

```jsonc
{ "url": "/uploads/1724...-ab12.png",
  "absoluteUrl": "https://dic.bizos.kr/uploads/1724...-ab12.png" }
```

> **`url` 은 상대 경로입니다.** 이 값이 `contentMd` 에 그대로 박히기 때문에 바꾸지 않습니다.
> 절대 URL 로 바꾸면 기존 본문 전량 백필이 필요하고 도메인이 바뀌면 또 깨집니다.
>
> 콘솔은 이미지를 그릴 때 `absoluteUrl` 을 쓰고, **본문 미리보기에서는 `/uploads/` 를
> `https://dic.bizos.kr/uploads/` 로 프리픽스**하세요. 파일 서빙 주체는 계속 dic.bizos.kr 의
> nginx 입니다.

---

## 사용자와 계정 신청

| 라우트 | 메서드 | 역할 | 하는 일 |
|---|---|---|---|
| `/api/admin/users` | GET | OWNER·ADMIN | 사용자 목록 |
| `/api/admin/users/{id}` | DELETE | OWNER | 삭제 (자격증명·신청 함께) |
| `/api/admin/users/{id}/role` | PATCH | OWNER | `{ role: "ADMIN" \| "AUTHOR" }` |
| `/api/admin/users/{id}/status` | PATCH | OWNER·ADMIN | `{ status: "ACTIVE" \| "SUSPENDED" }` |
| `/api/admin/accounts` | GET | OWNER·ADMIN | 대기 중 계정 신청 |
| `/api/admin/accounts/{id}/approve` | POST | OWNER·ADMIN | 승인 + Passkey 등록 메일 |
| `/api/admin/accounts/{id}/reject` | POST | OWNER·ADMIN | 거절 |

- OWNER 계정은 역할 변경·정지·삭제할 수 없습니다 (400).
- **자기 자신**은 역할 변경·정지·삭제할 수 없습니다 (400). `X-Actor-Email` 이 가리키는
  사람이 기준입니다.
- 승인 응답은 `{ ok: true, emailSent: boolean }` — 메일 발송이 실패해도 승인은 완료됩니다.
  등록 링크는 `dic.bizos.kr/admin/register-passkey?token=…` 이고 24시간 유효합니다.

---

## 커넥터 예시

```ts
import "server-only";

const BASE_URL = process.env.DICPRESS_BASE_URL ?? "http://127.0.0.1:3001";

async function dicFetch<T>(actorEmail: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.DICPRESS_SERVICE_TOKEN;
  if (!token) throw new Error("DICPRESS_SERVICE_TOKEN 이 설정되지 않았습니다.");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Actor-Email": actorEmail,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    const hint =
      res.status === 401 ? " 토큰이 다르거나 공개 URL 로 호출했습니다(루프백을 쓰세요)."
      : res.status === 403 ? " 해당 이메일의 dicpress 계정이 없거나 권한이 부족합니다."
      : res.status === 503 ? " dicpress 서버에 ADMIN_SERVICE_TOKEN 이 없습니다."
      : "";
    throw new Error(`[dicpress] ${path} 실패 (${res.status}).${hint} ${body}`);
  }

  return res.json() as Promise<T>;
}
```

---

## 연관 이슈

- [#70 콘솔이 쓸 서비스 토큰 인증 — 자체 UI와 병행](https://github.com/bettercode-oss/dicpress/issues/70)
- [#68 Epic: 관리자 기능을 통합 콘솔로 분리](https://github.com/bettercode-oss/dicpress/issues/68)
- `ahnyounghoe/admin#8` dicpress 커넥터
