import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callWorker } from "@/lib/worker";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  language: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { videoId, language } = parsed.data;

  const video = await prisma.video.findFirst({
    where: { id: videoId, userId: user.id },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (video.status !== "uploaded") {
    return NextResponse.json(
      { error: "Video is not in uploaded state" },
      { status: 409 }
    );
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "processing", language },
  });

  await callWorker(videoId, video.rawUrl, language);

  return NextResponse.json({ status: "processing", videoId });
}
