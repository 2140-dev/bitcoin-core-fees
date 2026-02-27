import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:5001";

// Whitelist of first path segments allowed to be forwarded to the backend.
// Anything not in this set gets a 404 — prevents SSRF and internal endpoint probing.
const ALLOWED_PATH_ROOTS = new Set([
  "blockcount",
  "mempool-diagram",
  "fees",
  "performance-data",
  "fees-sum",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate root path segment before forwarding anything
  const rootSegment = path[0];
  if (!rootSegment || !ALLOWED_PATH_ROOTS.has(rootSegment)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams.toString();
  const pathStr = path.join("/");
  const targetUrl = `${BACKEND_URL}/${pathStr}${searchParams ? `?${searchParams}` : ""}`;

  if (process.env.NODE_ENV === "development") {
    console.log(`[Proxy] Forwarding to: ${targetUrl}`);
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      // Log full details server-side, return generic message to client
      const errorText = await response.text();
      console.error(`[Proxy] Backend error ${response.status} for ${pathStr}: ${errorText}`);
      return NextResponse.json(
        { error: "Backend request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[Proxy] Failed to reach backend for ${pathStr}:`, error);
    return NextResponse.json(
      { error: "Backend service unavailable" },
      { status: 502 }
    );
  }
}
