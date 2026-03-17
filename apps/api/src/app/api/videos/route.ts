import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, createdAt: true, durationSec: true },
  });

  return NextResponse.json(videos);
}

const postBodySchema = z.object({
  videoId: z.string().uuid(),
  rawUrl: z.string().url(),
});

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = postBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { videoId, rawUrl } = parsed.data;

  try {
    const video = await prisma.video.create({
      data: {
        id: videoId,
        userId: user.id,
        rawUrl,
        status: "uploaded",
      },
    });

    return NextResponse.json({ id: video.id, status: video.status }, { status: 201 });
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
}
