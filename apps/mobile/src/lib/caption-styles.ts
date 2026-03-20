// Keep in sync with apps/worker/src/lib/caption-styles.ts.
// Duplicated intentionally — the worker is self-contained (no packages/types dep) for Docker builds.
export type CaptionStyleId = 'classic' | 'outline';

export interface CaptionStyleDef {
  id: CaptionStyleId;
  label: string;
  textColor: string;
  activeWordColor: string;
  showBackground: boolean;
  backgroundColor: string;
  fontWeight: 'normal' | 'bold';
  textShadow: boolean;
}

export const CAPTION_STYLES: CaptionStyleDef[] = [
  {
    id: 'classic',
    label: 'Classic',
    textColor: '#ffffff',
    activeWordColor: '#FFD700',
    showBackground: true,
    backgroundColor: 'rgba(0,0,0,0.5)',
    fontWeight: 'normal',
    textShadow: false,
  },
  {
    id: 'outline',
    label: 'Outline',
    textColor: '#ffffff',
    activeWordColor: '#00E5FF',
    showBackground: false,
    backgroundColor: 'transparent',
    fontWeight: 'bold',
    textShadow: true,
  },
];

export function getCaptionStyle(id: CaptionStyleId): CaptionStyleDef {
  return CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0];
}
