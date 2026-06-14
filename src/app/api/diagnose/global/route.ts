import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import type { DiagnosticResponse } from "@/lib/types";

type RequestBody = {
  sessionId?: string;
  issue_description?: string;
  top_k?: number;
  imageData?: string;
  imageMimeType?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const response = await fetch(`${API_BASE_URL}/products/global/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issue_description: body.issue_description,
        session_id: body.sessionId,
        top_k: body.top_k || 8,
        image_data: body.imageData,
        image_mime_type: body.imageMimeType,
      }),
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return NextResponse.json({ detail: errorMsg || `Diagnostic API failed: ${response.status}` }, { status: response.status });
    }

    const payload = (await response.json()) as DiagnosticResponse;
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { detail: `Diagnostic service unavailable: ${message}` },
      { status: 500 }
    );
  }
}
