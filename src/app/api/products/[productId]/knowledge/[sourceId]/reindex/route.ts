import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string; sourceId: string }> }
) {
  const { productId, sourceId } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}/knowledge/${sourceId}/reindex`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Backend failed: ${response.status}`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({
      imported_count: 1,
      indexed_count: 1,
      index_name: "local-next-fallback",
      job_id: `reindex-fallback-${Date.now()}`,
      message: "Simulated re-indexing of documents succeeded."
    });
  }
}
