import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { backendErrorDetail } from "@/lib/api-error";
import type { DiagnosticResponse } from "@/lib/types";

type RequestBody = {
  sessionId?: string;
  issue_description?: string;
  top_k?: number;
  imageData?: string;
  imageMimeType?: string;
};

export async function POST(request: Request) {
  let body: RequestBody | undefined;
  try {
    body = (await request.json()) as RequestBody;
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
      const errorMsg = await backendErrorDetail(response, `Diagnostic API failed: ${response.status}`);
      return NextResponse.json(fallbackGlobalDiagnostic(body, errorMsg));
    }

    const payload = (await response.json()) as DiagnosticResponse;
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(fallbackGlobalDiagnostic(body, message));
  }
}

function fallbackGlobalDiagnostic(body: RequestBody | undefined, reason: string): DiagnosticResponse {
  const symptom = body?.issue_description?.trim() || "the reported symptom";
  return {
    session_id: body?.sessionId || `global-local-${Date.now().toString(36)}`,
    probable_causes: ["AI diagnostic engine unavailable"],
    possible_causes: [
      {
        cause: "AI diagnostic engine unavailable",
        probability: 0,
        status: "possible",
        evidence: reason,
      },
    ],
    eliminated_causes: [],
    most_likely_cause: "AI diagnostic engine unavailable",
    confidence: "low",
    investigation_reasoning:
      `Current Understanding:\nThe symptom was received across the product catalog: ${symptom}\n\n` +
      "Most Likely Causes:\n1. The AI diagnostic engine is temporarily unavailable.\n2. The backend may be missing GEMINI_API_KEY in production.\n3. Product documentation can still be reviewed manually from the dashboard.\n\n" +
      "Next Diagnostic Question:\nWhat exact product model, error code, status light, or behavior do you see?\n\n" +
      "Reason:\nThose details can still help narrow the issue while backend AI configuration is restored.",
    follow_up_question: "What exact product model, error code, status light, or behavior do you see?",
    next_step: "Open the matching product page or dashboard documents and retry once backend AI configuration is restored.",
    recommended_action:
      "Recommendation:\nVerify the backend deployment has GEMINI_API_KEY configured, then retry this diagnostic request.\n\n" +
      `Evidence:\n${reason}\n\n` +
      "Source:\nDocument Name: Runtime configuration\nPage Number: Not available\nSection Heading: Environment variables",
    documentation_references: [
      {
        source: "local",
        type: "fallback",
        title: "Runtime configuration",
        snippet: reason,
        score: 1,
      },
    ],
    visual_analysis: body?.imageData
      ? {
          visible_items: [],
          confidence: "low",
          relevance_to_issue: "A photo was attached, but the AI vision diagnostic engine is unavailable.",
          additional_photos_required: ["Retry the upload after backend AI configuration is restored."],
          safety_notes: [],
        }
      : null,
    spare_parts: [],
    detected_product_id: null,
    detected_product_name: null,
  };
}
