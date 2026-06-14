import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;

  try {
    const formData = await request.formData();
    const response = await fetch(`${API_BASE_URL}/products/${productId}/knowledge/text`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return NextResponse.json({ detail: errorMsg || "Failed to upload text" }, { status: response.status });
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
