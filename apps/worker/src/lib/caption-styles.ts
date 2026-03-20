// Keep in sync with apps/mobile/src/lib/caption-styles.ts.
// Duplicated intentionally — the worker is self-contained (no packages/types dep) for Docker builds.
export type CaptionStyleId = 'classic' | 'outline';

export interface AssStyleConfig {
  primaryColour: string;
  backColour: string;
  outlineColour: string;
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  bold: 0 | 1;
  activeWordColour: string;
}

export const ASS_STYLES: Record<CaptionStyleId, AssStyleConfig> = {
  classic: {
    primaryColour: '&H00FFFFFF',
    backColour: '&H40000000',
    outlineColour: '&H00000000',
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    bold: 0,
    activeWordColour: '&H0000D7FF',
  },
  outline: {
    primaryColour: '&H00FFFFFF',
    backColour: '&H80000000',
    outlineColour: '&H00000000',
    borderStyle: 1,
    outline: 3,
    shadow: 1,
    bold: 1,
    activeWordColour: '&H00FFE500',
  },
};

function isCaptionStyleId(id: string): id is CaptionStyleId {
  return id === 'classic' || id === 'outline';
}

export function getAssStyle(id: string): AssStyleConfig {
  if (isCaptionStyleId(id)) {
    return ASS_STYLES[id];
  }
  return ASS_STYLES.classic;
}
