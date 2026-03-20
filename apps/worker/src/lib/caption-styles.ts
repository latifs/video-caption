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

export function getAssStyle(id: string): AssStyleConfig {
  return ASS_STYLES[id as CaptionStyleId] ?? ASS_STYLES.classic;
}
