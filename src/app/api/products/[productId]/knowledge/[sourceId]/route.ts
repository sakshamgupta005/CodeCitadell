import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string; sourceId: string }> }
) {
  const { productId, sourceId } = await params;
  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}/knowledge/${sourceId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`Backend failed: ${response.status}`);
    return new NextResponse(null, { status: 204 });
  } catch {
    // Fallback deletion
    try {
      const filePath = path.join(process.cwd(), "backend", "storage", "local_indexed_documents.json");
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      
      let deletedCount = 0;
      for (const key of Object.keys(data)) {
        const meta = data[key]?.metadata || {};
        if (meta.product_id === productId && meta.source_id === sourceId) {
          delete data[key];
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      }
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      return NextResponse.json({ detail: "Failed to delete knowledge document" }, { status: 500 });
    }
  }
}
