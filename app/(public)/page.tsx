import { prisma } from "@/lib/prisma";
import { SITE_NAME } from "@/lib/site";

export const revalidate = 60;

export default async function HomePage() {
  const count = await prisma.document.count({ where: { status: "PUBLISHED" } });

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-4xl mb-5 select-none">📖</p>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {SITE_NAME}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          키워드 중심의 사전식 지식 아카이브입니다.
          <br />
          좌측 목록에서 키워드를 선택하면
          <br />
          해당 내용이 여기에 표시됩니다.
        </p>
        {count > 0 && (
          <p className="text-xs text-gray-400">현재 {count}개 항목</p>
        )}
      </div>
    </div>
  );
}
