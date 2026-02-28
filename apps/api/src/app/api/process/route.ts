import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";
import { callWorker } from "@/lib/worker";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  rawUrl: z.string().url(),
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

  const { videoId, rawUrl } = parsed.data;

  try {
    await prisma.video.create({
      data: {
        id: videoId,
        userId: user.id,
        rawUrl,
        status: "processing",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Video already exists" },
        { status: 409 }
      );
    }
    throw error;
  }

  await callWorker(videoId, rawUrl);

  return NextResponse.json({ status: "processing", videoId });
}
