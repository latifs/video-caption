import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";
import type { CaptionData } from "types";

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
