import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const url = productId === "global"
    ? `${API_BASE_URL}/products/global/knowledge`
    : `${API_BASE_URL}/products/${productId}/knowledge`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend failed: ${response.status}`);
    return NextResponse.json(await response.json());
  } catch {
    // Fallback: read directly from local_indexed_documents.json
    try {
      const filePath = path.join(process.cwd(), "backend", "storage", "local_indexed_documents.json");
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      
      const grouped: Record<string, any> = {};
      for (const [docId, docInfo] of Object.entries(data)) {
        const info = docInfo as any;
        const meta = info.metadata || {};
        if (productId !== "global" && meta.product_id !== productId) continue;
        
        const sourceId = meta.source_id;
        if (!sourceId) continue;
        
        if (!grouped[sourceId]) {
          grouped[sourceId] = {
            source_id: sourceId,
            title: meta.title || "Document",
            type: meta.type || "text",
            filename: meta.filename,
            url: meta.url,
            product_id: meta.product_id,
            product_name: meta.product_name,
            created_at: meta.created_at || new Date().toISOString(),
            chunk_count: 0,
            chunks: []
          };
        }
        
        grouped[sourceId].chunk_count++;
        grouped[sourceId].chunks.push({
          id: docId,
          text: info.text || "",
          chunk_index: Number(meta.chunk_index || 1)
        });
      }
      
      const result = Object.values(grouped).map((g: any) => {
        g.chunks.sort((a: any, b: any) => a.chunk_index - b.chunk_index);
        let snippet = g.chunks[0]?.text || "";
        if (snippet.includes("\n\n")) {
          const parts = snippet.split("\n\n", 2);
          if (parts[1] && parts[0].includes("Product:")) {
            snippet = parts[1];
          }
        }
        return {
          source_id: g.source_id,
          title: g.title,
          type: g.type,
          filename: g.filename,
          url: g.url,
          product_id: g.product_id,
          product_name: g.product_name,
          created_at: g.created_at,
          chunk_count: g.chunk_count,
          text_snippet: snippet.substring(0, 300),
          chunks: g.chunks
        };
      });
      
      result.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return NextResponse.json(result);
    } catch (fallbackError) {
      return NextResponse.json([]);
    }
  }
}
