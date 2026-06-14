import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/import/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ detail: "Failed to get import status" }, { status: response.status });
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
