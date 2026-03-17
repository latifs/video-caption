import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  });

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (video.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed videos can be retried" },
      { status: 409 }
    );
  }

  await prisma.video.update({
    where: { id },
    data: { status: "uploaded" },
  });

  return NextResponse.json({ id, status: "uploaded" });
}
