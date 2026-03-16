import { useState } from "react";
import { useEventListener } from "expo";
import type { VideoPlayer } from "expo-video";

export function usePlaybackTime(player: VideoPlayer): number {
  const [currentTime, setCurrentTime] = useState(0);

  // timeUpdate fires at the interval set by timeUpdateEventInterval (0.1s)
  // during playback AND on seeks — single reliable source of truth.
  useEventListener(player, "timeUpdate", (payload) => {
    setCurrentTime(payload.currentTime);
  });

  return currentTime;
}
