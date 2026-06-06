import { NextResponse } from "next/server";
import { parsePlaylistText } from "@/app/lib/playlist-parser";
import { verifyAdminPin } from "@/app/lib/iptv-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!verifyAdminPin(body.pin)) {
      return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
    }

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "Missing playlist URL" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(body.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 IPTV Admin",
        Accept: "*/*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Import failed with status ${response.status}` },
        { status: response.status }
      );
    }

    const text = await response.text();
    const channels = parsePlaylistText(text, "remote", body.url);
    return NextResponse.json({ channels });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Remote playlist timed out"
        : error instanceof Error
          ? error.message
          : "Failed to import URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
