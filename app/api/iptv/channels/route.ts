import { NextResponse } from "next/server";
import { getConfigHash, readIPTVConfig } from "@/app/lib/iptv-store";

export async function getChannelsWithHash() {
  const config = await readIPTVConfig();
  const segmentChannels = config.segments.flatMap((segment) =>
    segment.channels.map((channel) => ({
      ...channel,
      group: segment.title || channel.group,
    }))
  );
  const playlistChannels = config.playlists.flatMap((playlist) => playlist.channels);
  return { channels: [...segmentChannels, ...playlistChannels], hash: getConfigHash(config) };
}

export async function GET() {
  const { channels, hash } = await getChannelsWithHash();

  return NextResponse.json(channels, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Channels-Hash": hash,
    },
  });
}
