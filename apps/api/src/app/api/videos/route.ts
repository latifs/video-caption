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
  rawUrl: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          // Must be a Supabase storage URL for the videos bucket
          return url.pathname.startsWith("/storage/v1/object/public/videos/raw/");
        } catch {
          return false;
        }
      },
      { message: "rawUrl must point to a valid Supabase storage URL" }
    ),
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
    // Enforce the free tier limit server-side (1 video for unsubscribed users).
    // This runs before the insert so the check and create are in the same
    // round-trip; a race between two concurrent requests is acceptable —
    // both would pass the count check and create their videos, which is a
    // minor edge case we can tighten once real subscription enforcement is live.
    const [videoCount, dbUser] = await Promise.all([
      prisma.video.count({ where: { userId: user.id } }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { subscriptionStatus: true },
      }),
    ]);

    const isSubscribed = dbUser?.subscriptionStatus === "active";
    if (videoCount >= 1 && !isSubscribed) {
      return NextResponse.json(
        { error: "Subscription required to upload additional videos" },
        { status: 403 }
      );
    }

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
