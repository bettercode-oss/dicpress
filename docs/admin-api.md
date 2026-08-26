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
  이 거절은 편의 문제가 아니라 **토큰의 권한 상한**입니다 — 토큰만으로는 새 계정을 만들 수
  없고, 사칭은 사람이 관리하는 기존 사용자 집합 안에서만 가능합니다.
- 계정이 `ACTIVE` 가 아니면 403 입니다.
- 이메일은 **소문자로 정규화해 보내세요.** dicpress 가 받는 즉시 `trim` + `toLowerCase` 하므로
  `Kim@Example.com` 도 통합니다만, 콘솔 쪽에서도 소문자로 저장·전송하는 편이
  로그 대조가 쉽습니다.

### ⚠️ 퇴사자 이메일을 재사용하지 마세요

행위자를 **이메일로** 식별하므로, 퇴사한 사람의 주소를 새 사람에게 다시 발급하면
**dicpress 상의 권한과 문서 작성자 귀속이 그대로 승계됩니다.** 새 사람이 전임자의
role(예: OWNER)로 행동하게 되고, 그가 만든 문서는 전임자 것과 구분되지 않습니다.

계정 정리는 dicpress 쪽에서 해당 사용자를 `SUSPENDED` 로 바꾸거나 삭제하는 것으로 합니다.
주소 재사용은 어느 쪽으로도 안전하지 않습니다.

### ⚠️ 신뢰 경계

**토큰을 쥔 쪽은 `X-Actor-Email` 로 누구든 사칭할 수 있습니다.** OWNER 이메일을 넣으면
OWNER 권한을 얻습니다. 즉 이 토큰은 서비스 토큰이라기보다 OWNER 비밀번호에 가깝습니다.

실질적인 방어는 **nginx 가 클라이언트발 `Authorization` 을 비우는 것**입니다
(`proxy_set_header Authorization "";`). 그래서 토큰 경로는 공개 인터넷에서 도달할 수 없고,
루프백으로 들어오는 콘솔에서만 살아 있습니다.

앱 안에서 "루프백에서 왔는가"를 판별하지는 않습니다. `X-Forwarded-For` 는 클라이언트가
보낸 값이 그대로 전달되므로 위조할 수 있고, 그런 가드는 안전하다는 착각만 줍니다.
**경계는 전적으로 nginx 설정에 있습니다.**

### 신뢰 모델 — 콘솔이 지는 책임

정리하면 이렇습니다.

| 누가 | 무엇을 보장하는가 |
|---|---|
| nginx | 토큰 경로가 공개 인터넷에서 도달 불가능하다 |
| dicpress | 토큰이 맞는지, 그 이메일의 계정이 실재하고 `ACTIVE` 인지, 그 계정의 `role` 로 무엇을 할 수 있는지 |
| **콘솔** | **어떤 콘솔 사용자가 어떤 이메일을 주장할 수 있는지** |

마지막 줄이 핵심입니다. dicpress 는 `X-Actor-Email` 이 **정당하게 주장된 값인지 알 방법이
없습니다.** 토큰이 맞으면 그 이메일을 그대로 믿습니다. 따라서 콘솔은:

- `X-Actor-Email` 을 **반드시 서버 사이드 세션에서** 채워야 합니다. 클라이언트가 보낸 값이나
  쿼리 파라미터를 그대로 흘려보내면 콘솔 로그인 사용자 누구나 OWNER 로 승격됩니다.
- BFF 프록시를 무제한 passthrough 로 만들지 마세요. 브라우저가 헤더를 직접 지정할 수 있는
  경로가 하나라도 열리면 이 모델이 무너집니다.
- `DICPRESS_SERVICE_TOKEN` 은 서버 전용입니다 — 커넥터 첫 줄의 `import "server-only"` 가
  클라이언트 번들 유입을 빌드 단계에서 막습니다.

**토큰을 쥔 쪽은 임의의 dicpress 사용자로 사칭할 수 있습니다.** 이것은 버그가 아니라 이
설계가 택한 트레이드오프이고(자세한 근거는 dicpress `docs/decisions/002-admin-console-service-token.md`),
그 대가로 콘솔이 위 책임을 집니다.

**따라서 콘솔은 반드시 `http://127.0.0.1:3001` 로 부릅니다.** 공개 URL 로 부르면
nginx 가 헤더를 비워 401 이 납니다.

### 공통 에러

| 코드 | 뜻 |
|---|---|
| 400 | `X-Actor-Email` 누락 또는 형식 오류, **쿼리 파라미터 값이 허용 목록 밖**, **대상 규칙 위반**(OWNER 계정·자기 자신을 역할 변경·정지·삭제) |
| 401 | 토큰 불일치, `Bearer` 형식 아님, **또는 서버에 토큰이 설정되지 않음** |
| 403 | 해당 이메일의 계정이 없거나 비활성, 또는 역할 부족 |
| 404 | 대상 없음 |
| 409 | slug 중복, **이미 처리된 계정 신청**을 다시 승인·거절 |

응답 본문은 `{ "error": "..." }` 입니다 (한국어). 400 은 어떤 값이 왜 틀렸는지와
허용값을 함께 담습니다.

> **401 은 두 가지를 뜻합니다.** 토큰이 다를 때와, 서버에 `ADMIN_SERVICE_TOKEN` 이 아예
> 없을 때입니다. 후자를 503 으로 구분하지 않는 이유는, 토큰이 없으면 유효한 자격 증명이
> 존재할 수 없으므로 401 이 정직하고 "여기 토큰 경로가 있는데 설정이 틀렸다" 를 밖에
> 알려 줄 이유도 없기 때문입니다. **미설정 진단은 dicpress 기동 로그**가 맡습니다
> (`[authz] ADMIN_SERVICE_TOKEN 이 없습니다…`).

> **403 을 봤다면 토큰은 이미 통과한 것입니다.** 토큰이 다르면 401 이므로, 403 에서
> nginx 설정이나 토큰 회전을 의심할 이유가 없습니다. 뜻은 하나입니다 — **그 이메일의
> `ACTIVE` 계정이 dicpress 에 없다.**
>
> 콘솔 User 와 dicpress User 는 **별도 DB 의 다른 목록**입니다. 콘솔에 로그인되는 사람이
> dicpress 에는 없을 수 있고, 그게 정상입니다. `X-Actor-Email` 에 넣을 값은 **dicpress 의
> `ACTIVE` 계정 주소**이지 콘솔 로그인 주소가 아닙니다 — 두 곳에서 쓰는 주소가 다르면
> 콘솔 `.env` 의 `DICPRESS_ACTOR_EMAIL` 이 dicpress 쪽 주소여야 합니다.
>
> 운영에서 실제로 겪었습니다(#94). 개인 주소로 호출해 403 이 났고, 서버 설정을 한참
> 의심한 뒤에야 그 주소의 dicpress 계정이 애초에 없다는 것을 확인했습니다.

---

## 문서

### `GET /api/documents`

| 항목 | 값 |
|---|---|
| 역할 | 로그인만 (AUTHOR 포함) |
| 쿼리 | `scope` `status` `q` `tag` `counts` |

| 파라미터 | 허용값 | 없을 때 |
|---|---|---|
| `scope` | `all` \| `mine` | `all` |
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` | 필터 없음 |
| `counts` | `1` \| `true` \| `0` \| `false` | `false` |
| `q` | 자유 문자열 — 제목·slug·요약 부분 일치 (대소문자 무시) | 필터 없음 |
| `tag` | 태그 이름 | 필터 없음 |

- `scope=all` — `OWNER`/`ADMIN` 은 전체, `AUTHOR` 는 본인 문서
- `scope=mine` — 역할과 무관하게 본인 문서로 좁힘
- `counts` 를 켜면 상태별 개수를 함께 줍니다. `status` 필터를 **빼고** 세므로 탭 UI 에 바로 씁니다

> ⚠️ **허용 목록 밖의 값은 400 입니다.** 대소문자까지 정확해야 하므로 `status=published` 는
> 거절됩니다. 예전에는 모르는 값이 조용히 "필터 없음" 으로 떨어져서, `status=DRAFT` 는
> 0건인데 `status=DRAFTT` 는 전체를 돌려주는 상태였습니다(#79). 필터를 걸었다고 믿은 쪽이
> 필터 없는 결과를 받는 일을 막으려는 것입니다.
>
> 값이 **비어 있는 것**(`?status=`)은 "지정 안 함" 으로 봅니다 — HTML 폼이 빈 필드를 그렇게
> 보내고, 빈 값은 필터처럼 보이지 않기 때문입니다.
>
> 모르는 **파라미터 이름**은 그대로 무시합니다. Next 가 `_rsc` 같은 쿼리를 스스로 붙입니다.

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

- 이미 쓰는 slug 로 바꾸면 **409** 입니다 (`POST` 와 같습니다).
- **보내지 않은 것과 빈 값을 보낸 것은 다릅니다.** `contentMd: ""` 는 본문을 비웁니다 —
  전체를 지우는 것도 정상적인 편집이라 그대로 저장합니다.
- `title`·`slug` 는 비울 수 없어 빈 문자열·공백뿐이면 **400** 입니다. 빈 제목은 목록에서
  빈 줄이 되고 빈 slug 는 공개 URL 을 깨뜨립니다.

**문서가 발행 상태이거나 발행 상태였으면 `revalidatePath` 가 dicpress 프로세스 안에서
실행됩니다.** 콘솔이 DB 를 직접 쓰면 이게 일어나지 않아 공개 페이지가 낡은 채로 남습니다.
**그래서 문서 쓰기는 반드시 이 API 를 지나야 합니다.**

무효화 범위는 운영에서 실측했습니다(#74).

| 대상 | 갱신 |
|---|---|
| 상세 `/{slug}` | 즉시 (부분 PATCH 로도 확인 — prime 271ms 후 반영, ISR 창 600초) |
| 왼쪽 키워드 목록 | 즉시 (`revalidatePath("/", "layout")`) |
| `/sitemap.xml` | 즉시 (`lastmod` 갱신 확인) |

> 목록은 `app/(public)/layout.tsx` 에서 조회하므로 **`"layout"` 타입 무효화가 필요**합니다.
> `revalidatePath("/")` 만으로는 최대 60초 낡습니다.

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
- 이미 처리된 신청을 다시 승인·거절하면 **409** 입니다. 두 화면을 나란히 띄워 두면
  일어납니다 — 한쪽에서 처리한 신청이 다른 쪽 목록에는 아직 남아 있습니다.
- **목록이 돌려주는 `status` 는 세 가지입니다** — `ACTIVE | SUSPENDED | PENDING`.
  `PENDING` 은 승인은 끝났지만 아직 Passkey 를 등록하지 않은 계정입니다. 승인이 만드는
  초기 상태라서, `PATCH /status` 로는 지정할 수 없습니다(본문은 `ACTIVE | SUSPENDED` 뿐).
  라벨을 따로 만들지 않으면 목록에 빈칸으로 뜹니다.

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
      res.status === 400 ? " 쿼리 파라미터 값이 허용 목록 밖입니다(응답 본문에 허용값이 있습니다)."
      : res.status === 401 ? " 토큰이 다르거나, 서버에 토큰이 없거나, 공개 URL 로 불러 nginx 가 헤더를 비웠습니다."
      : res.status === 403 ? " 해당 이메일의 dicpress 계정이 없거나 권한이 부족합니다."
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
