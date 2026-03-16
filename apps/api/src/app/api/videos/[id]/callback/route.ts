import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = [
  "transcribed",
  "exporting",
  "completed",
  "failed",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get("x-worker-secret");
  if (secret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, captionData, durationSec, processedUrl } = body;

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { status };
  if (captionData !== undefined) data.captionData = captionData;
  if (durationSec !== undefined) data.durationSec = durationSec;
  if (processedUrl !== undefined) data.processedUrl = processedUrl;

  await prisma.video.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true });
}
