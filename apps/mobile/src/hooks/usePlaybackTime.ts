import { useState } from "react";
import { useEventListener } from "expo";
import type { VideoPlayer } from "expo-video";

export function usePlaybackTime(player: VideoPlayer): number {
  const [currentTime, setCurrentTime] = useState(0);

  useEventListener(player, "timeUpdate", (payload) => {
    setCurrentTime(payload.currentTime);
  });

  return currentTime;
}
