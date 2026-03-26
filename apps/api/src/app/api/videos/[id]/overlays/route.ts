import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";
import type { CaptionData, Overlay } from "types";
import { randomUUID } from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { captionData: true, durationSec: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const captionData = video.captionData as unknown as CaptionData | null;
  if (!captionData) {
    return NextResponse.json(
      { error: "No caption data available" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { text, start, end, position, style } = body;

  // Validate required fields
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "text is required and must be non-empty" },
      { status: 400 }
    );
  }

  if (typeof start !== "number" || typeof end !== "number") {
    return NextResponse.json(
      { error: "start and end must be numbers" },
      { status: 400 }
    );
  }

  if (start < 0) {
    return NextResponse.json(
      { error: "start must be >= 0" },
      { status: 400 }
    );
  }

  if (end <= start) {
    return NextResponse.json(
      { error: "end must be greater than start" },
      { status: 400 }
    );
  }

  if (video.durationSec != null && end > video.durationSec) {
    return NextResponse.json(
      { error: "end must be within video duration" },
      { status: 400 }
    );
  }

  const overlay: Overlay = {
    id: randomUUID(),
    text: text.trim(),
    start,
    end,
    position: position || { x: "center", y: 0.1 },
    style: style || {
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "#000000",
      backgroundOpacity: 0.5,
    },
  };

  captionData.overlayTrack.push(overlay);

  await prisma.video.update({
    where: { id },
    data: {
      captionData: captionData as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ overlay });
}
