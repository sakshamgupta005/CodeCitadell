import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import type { DiagnosticResponse } from "@/lib/types";

type RequestBody = {
  productId?: string;
  sessionId?: string;
  issue?: string;
  answer?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const productId = body.productId || "hp-laserjet-pro-m404n";

  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issue_description: body.issue,
        session_id: body.sessionId,
        answer: body.answer,
        top_k: 8,
      }),
    });

    if (!response.ok) {
      throw new Error(`Diagnostic API failed: ${response.status}`);
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
