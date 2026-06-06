import { NextResponse } from "next/server";
import { readIPTVConfig, verifyAdminPin, writeIPTVConfig } from "@/app/lib/iptv-store";

export async function GET() {
  return NextResponse.json(await readIPTVConfig(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!verifyAdminPin(body.pin)) {
      return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
    }

    const saved = await writeIPTVConfig(body.config);
    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save config" },
      { status: 500 }
    );
  }
}
