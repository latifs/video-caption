import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/prisma";
import type { CaptionData } from "types";

interface SpeechEdit {
  segmentIndex: number;
  wordIndex: number;
  newText: string;
}

export async function PATCH(
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

  const body = await request.json();
  const edits: SpeechEdit[] = body.edits;

  if (!Array.isArray(edits) || edits.length === 0) {
    return NextResponse.json(
      { error: "edits must be a non-empty array" },
      { status: 400 }
    );
  }

  // Validate all edits before applying
  for (const edit of edits) {
    if (
      typeof edit.segmentIndex !== "number" ||
      typeof edit.wordIndex !== "number" ||
      typeof edit.newText !== "string"
    ) {
      return NextResponse.json(
        { error: "Each edit must have segmentIndex, wordIndex, and newText" },
        { status: 400 }
      );
    }

    if (
      edit.segmentIndex < 0 ||
      edit.segmentIndex >= captionData.speechTrack.segments.length
    ) {
      return NextResponse.json(
        { error: `segmentIndex ${edit.segmentIndex} out of bounds` },
        { status: 400 }
      );
    }

    const segment = captionData.speechTrack.segments[edit.segmentIndex];
    if (edit.wordIndex < 0 || edit.wordIndex >= segment.words.length) {
      return NextResponse.json(
        {
          error: `wordIndex ${edit.wordIndex} out of bounds for segment ${edit.segmentIndex}`,
        },
        { status: 400 }
      );
    }
  }

  // Apply edits (text only — timing is immutable)
  for (const edit of edits) {
    captionData.speechTrack.segments[edit.segmentIndex].words[
      edit.wordIndex
    ].word = edit.newText;
  }

  // Rebuild derived full transcript
  captionData.speechTrack.text = captionData.speechTrack.segments
    .map((seg) => seg.words.map((w) => w.word).join(" "))
    .join(" ");

  await prisma.video.update({
    where: { id },
    data: {
      captionData: captionData as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ captionData });
}
