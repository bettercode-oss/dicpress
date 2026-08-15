# 외부 사이트 연동 가이드

dic.bizos.kr이 제공하는 공개 API를 사용해 외부 사이트에서 용어 설명 툴팁을 구현하는 방법을 설명합니다.

> **dic 내부 사용과의 차이**  
> dic 자체(dic.bizos.kr)는 두 가지 경로로 요약을 가져옵니다.  
> - **서버 컴포넌트(마크다운 렌더러)**: `InternalLink` + `getEntrySummary(slug)` — DB 직접 조회, HTTP 왕복 없음  
> - **클라이언트 컴포넌트(폼 등)**: `DicTooltip` — `/api/entry/:keyword` fetch, `?` 아이콘 패턴  
>
> 이 문서는 **외부 사이트**를 위한 가이드입니다. 외부 사이트는 항상 API fetch 방식을 사용합니다.

---

## API 엔드포인트

### `GET /api/entry/:slug`

슬러그에 해당하는 PUBLISHED 문서의 요약을 반환합니다.

| 항목 | 값 |
|---|---|
| URL | `https://dic.bizos.kr/api/entry/{slug}` |
| 메서드 | `GET` |
| CORS | `Access-Control-Allow-Origin: *` (모든 출처 허용) |
| 캐시 | `s-maxage=300, stale-while-revalidate` |

#### 응답

```json
{ "summary": "패스키는 비밀번호 없이 생체인식으로 로그인하는 방식입니다…" }
```

문서가 없거나 비공개인 경우:

```json
{ "summary": null }
```

---

## 사용 예시

### Vanilla JS

```js
async function getDicSummary(slug) {
  const res = await fetch(`https://dic.bizos.kr/api/entry/${slug}`);
  const { summary } = await res.json();
  return summary; // string | null
}
```

### React 컴포넌트 패턴 (권장)

외부 사이트가 자체 디자인 시스템 툴팁을 사용하고 싶을 때는 **render prop** 방식으로 렌더러를 주입합니다.

> **UX 패턴 선택**  
> - **children 감싸기**: 키워드 텍스트에 직접 툴팁을 붙이는 방식 (아래 예시)  
> - **`?` 아이콘**: dic 내부(`DicTooltip`)처럼 텍스트 옆에 아이콘을 추가하는 방식  
>
> 외부 사이트는 자체 디자인에 맞는 방식을 선택하세요.

```tsx
import { useState, useEffect } from "react";

type RenderTooltip = (props: {
  content: string;
  children: React.ReactNode;
}) => React.ReactElement;

interface DicTooltipProps {
  keyword: string;           // dic.bizos.kr 슬러그 (예: "passkey")
  children: React.ReactNode; // 툴팁을 붙일 원본 콘텐츠
  renderTooltip?: RenderTooltip; // 툴팁 UI 주입 (생략 시 기본 렌더러 사용)
}

function DefaultTooltip({ content, children }: { content: string; children: React.ReactNode }) {
  // 최소 구현 — 실제 서비스에서는 자체 디자인 시스템 컴포넌트로 교체 권장
  return (
    <span title={content} style={{ cursor: "help", textDecoration: "underline dotted" }}>
      {children}
    </span>
  );
}

export function DicTooltip({
  keyword,
  children,
  renderTooltip = DefaultTooltip,
}: DicTooltipProps) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false; // 언마운트 후 setState 방지
    fetch(`https://dic.bizos.kr/api/entry/${encodeURIComponent(keyword)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSummary(d.summary); })
      .catch(() => {}); // 네트워크 오류 시 툴팁 없이 원본 표시
    return () => { cancelled = true; };
  }, [keyword]);

  if (!summary) return <>{children}</>;
  return renderTooltip({ content: summary, children });
}
```

#### 사용 예

```tsx
// 기본 렌더러 사용
<DicTooltip keyword="passkey">패스키로 로그인</DicTooltip>

// 자체 디자인 시스템 툴팁으로 교체
<DicTooltip
  keyword="passkey"
  renderTooltip={({ content, children }) => (
    <MyTooltip label={content}>{children}</MyTooltip>
  )}
>
  패스키로 로그인
</DicTooltip>
```

---

## 캐싱 권장 사항

- API 응답은 CDN/브라우저에서 5분(`s-maxage=300`) 캐싱됩니다.
- 클라이언트에서 추가 캐싱이 필요하면 `sessionStorage` 또는 React Query의 `staleTime`을 활용하세요.

```tsx
// React Query 사용 예
const { data } = useQuery({
  queryKey: ["dic", keyword],
  queryFn: () =>
    fetch(`https://dic.bizos.kr/api/entry/${keyword}`)
      .then((r) => r.json())
      .then((d) => d.summary),
  staleTime: 5 * 60 * 1000, // 5분
});
```

---

## 연관 이슈

- [#26](https://github.com/bettercode-oss/dicpress/issues/26) — 외부 사이트용 entry summary 공개 API 추가
- [#10](https://github.com/bettercode-oss/dicpress/issues/10) — ordera.bettercode.kr 적용
- [#11](https://github.com/bettercode-oss/dicpress/issues/11) — ordera.libaitian.kr 적용
