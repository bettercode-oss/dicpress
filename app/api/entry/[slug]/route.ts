import { getEntrySummary } from "@/lib/entry-summary";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "s-maxage=300, stale-while-revalidate",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const summary = await getEntrySummary(slug);
  return Response.json({ summary }, { headers: CORS_HEADERS });
}
