import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";
import type { CaptionData } from "types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; overlayId: string }> }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, overlayId } = await params;

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

  const overlay = captionData.overlayTrack.find((o) => o.id === overlayId);
  if (!overlay) {
    return NextResponse.json(
      { error: "Overlay not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { text, start, end } = body;

  if (text !== undefined) {
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text must be a non-empty string" },
        { status: 400 }
      );
    }
    overlay.text = text.trim();
  }

  if (start !== undefined) {
    if (typeof start !== "number" || start < 0) {
      return NextResponse.json(
        { error: "start must be a number >= 0" },
        { status: 400 }
      );
    }
    overlay.start = start;
  }

  if (end !== undefined) {
    if (typeof end !== "number") {
      return NextResponse.json(
        { error: "end must be a number" },
        { status: 400 }
      );
    }
    overlay.end = end;
  }

  if (overlay.end <= overlay.start) {
    return NextResponse.json(
      { error: "end must be greater than start" },
      { status: 400 }
    );
  }

  if (video.durationSec != null && overlay.end > video.durationSec) {
    return NextResponse.json(
      { error: "end must be within video duration" },
      { status: 400 }
    );
  }

  await prisma.video.update({
    where: { id },
    data: {
      captionData: captionData as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ overlay });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; overlayId: string }> }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, overlayId } = await params;

  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { captionData: true },
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

  const idx = captionData.overlayTrack.findIndex((o) => o.id === overlayId);
  if (idx === -1) {
    return NextResponse.json(
      { error: "Overlay not found" },
      { status: 404 }
    );
  }

  captionData.overlayTrack.splice(idx, 1);

  await prisma.video.update({
    where: { id },
    data: {
      captionData: captionData as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ success: true });
}
