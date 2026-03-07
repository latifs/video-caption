import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callWorkerExport } from "@/lib/worker";

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
    select: { status: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (video.status !== "transcribed" && video.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot export from status "${video.status}"` },
      { status: 400 }
    );
  }

  await callWorkerExport(id);

  return NextResponse.json({ status: "exporting" });
}
