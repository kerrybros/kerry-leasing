import type { BrandColorPreset } from '@/hooks/useDataQueries';

type CSSVarBundle = {
  '--primary': string;
  '--primary-foreground': string;
  '--primary-dark': string;
  '--primary-light': string;
  '--ring': string;
};

export type BrandPresetConfig = {
  key: BrandColorPreset;
  label: string;
  swatch: string; // hex/oklch for display in the picker
  light: CSSVarBundle;
  dark: CSSVarBundle;
};

export const BRAND_PRESETS: BrandPresetConfig[] = [
  {
    key: 'KERRY_GOLD',
    label: 'Kerry Gold',
    swatch: '#d9a528',
    light: {
      '--primary': 'oklch(0.74 0.16 85)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.64 0.16 85)',
      '--primary-light': 'oklch(0.84 0.14 85)',
      '--ring': 'oklch(0.708 0 0)',
    },
    dark: {
      '--primary': 'oklch(0.74 0.16 85)',
      '--primary-foreground': 'oklch(0.205 0 0)',
      '--primary-dark': 'oklch(0.64 0.16 85)',
      '--primary-light': 'oklch(0.84 0.14 85)',
      '--ring': 'oklch(0.556 0 0)',
    },
  },
  {
    key: 'ROYAL_BLUE',
    label: 'Royal Blue',
    swatch: '#3b6cf5',
    light: {
      '--primary': 'oklch(0.55 0.22 255)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.45 0.22 255)',
      '--primary-light': 'oklch(0.70 0.15 255)',
      '--ring': 'oklch(0.55 0.15 255)',
    },
    dark: {
      '--primary': 'oklch(0.65 0.20 255)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.55 0.20 255)',
      '--primary-light': 'oklch(0.75 0.14 255)',
      '--ring': 'oklch(0.50 0.15 255)',
    },
  },
  {
    key: 'NAVY',
    label: 'Navy',
    swatch: '#1e3a6e',
    light: {
      '--primary': 'oklch(0.38 0.14 260)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.30 0.14 260)',
      '--primary-light': 'oklch(0.55 0.10 260)',
      '--ring': 'oklch(0.40 0.10 260)',
    },
    dark: {
      '--primary': 'oklch(0.58 0.16 260)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.48 0.16 260)',
      '--primary-light': 'oklch(0.68 0.12 260)',
      '--ring': 'oklch(0.45 0.12 260)',
    },
  },
  {
    key: 'TEAL',
    label: 'Teal',
    swatch: '#0d9488',
    light: {
      '--primary': 'oklch(0.58 0.13 195)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.48 0.13 195)',
      '--primary-light': 'oklch(0.72 0.10 195)',
      '--ring': 'oklch(0.55 0.10 195)',
    },
    dark: {
      '--primary': 'oklch(0.68 0.13 195)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.58 0.13 195)',
      '--primary-light': 'oklch(0.78 0.09 195)',
      '--ring': 'oklch(0.50 0.10 195)',
    },
  },
  {
    key: 'FOREST',
    label: 'Forest',
    swatch: '#15803d',
    light: {
      '--primary': 'oklch(0.50 0.15 145)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.40 0.15 145)',
      '--primary-light': 'oklch(0.65 0.11 145)',
      '--ring': 'oklch(0.48 0.10 145)',
    },
    dark: {
      '--primary': 'oklch(0.62 0.15 145)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.52 0.15 145)',
      '--primary-light': 'oklch(0.72 0.11 145)',
      '--ring': 'oklch(0.48 0.10 145)',
    },
  },
  {
    key: 'BURGUNDY',
    label: 'Burgundy',
    swatch: '#9f1239',
    light: {
      '--primary': 'oklch(0.45 0.20 25)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.36 0.20 25)',
      '--primary-light': 'oklch(0.60 0.15 25)',
      '--ring': 'oklch(0.45 0.14 25)',
    },
    dark: {
      '--primary': 'oklch(0.60 0.18 25)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.50 0.18 25)',
      '--primary-light': 'oklch(0.70 0.13 25)',
      '--ring': 'oklch(0.45 0.12 25)',
    },
  },
  {
    key: 'AMBER',
    label: 'Amber',
    swatch: '#d97706',
    light: {
      '--primary': 'oklch(0.70 0.17 75)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.60 0.17 75)',
      '--primary-light': 'oklch(0.80 0.13 75)',
      '--ring': 'oklch(0.65 0.12 75)',
    },
    dark: {
      '--primary': 'oklch(0.74 0.16 75)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.64 0.16 75)',
      '--primary-light': 'oklch(0.84 0.12 75)',
      '--ring': 'oklch(0.55 0.12 75)',
    },
  },
  {
    key: 'VIOLET',
    label: 'Violet',
    swatch: '#7c3aed',
    light: {
      '--primary': 'oklch(0.50 0.22 290)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.40 0.22 290)',
      '--primary-light': 'oklch(0.65 0.16 290)',
      '--ring': 'oklch(0.48 0.15 290)',
    },
    dark: {
      '--primary': 'oklch(0.62 0.20 290)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.52 0.20 290)',
      '--primary-light': 'oklch(0.72 0.14 290)',
      '--ring': 'oklch(0.48 0.14 290)',
    },
  },
  {
    key: 'SLATE_BRAND',
    label: 'Slate',
    swatch: '#475569',
    light: {
      '--primary': 'oklch(0.45 0.03 250)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.36 0.03 250)',
      '--primary-light': 'oklch(0.60 0.02 250)',
      '--ring': 'oklch(0.45 0.02 250)',
    },
    dark: {
      '--primary': 'oklch(0.60 0.03 250)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.50 0.03 250)',
      '--primary-light': 'oklch(0.70 0.02 250)',
      '--ring': 'oklch(0.45 0.02 250)',
    },
  },
  {
    key: 'COPPER',
    label: 'Copper',
    swatch: '#b45309',
    light: {
      '--primary': 'oklch(0.60 0.17 45)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-dark': 'oklch(0.50 0.17 45)',
      '--primary-light': 'oklch(0.74 0.13 45)',
      '--ring': 'oklch(0.58 0.12 45)',
    },
    dark: {
      '--primary': 'oklch(0.68 0.16 45)',
      '--primary-foreground': 'oklch(0.15 0 0)',
      '--primary-dark': 'oklch(0.58 0.16 45)',
      '--primary-light': 'oklch(0.78 0.12 45)',
      '--ring': 'oklch(0.52 0.12 45)',
    },
  },
];

export const BRAND_PRESET_MAP = Object.fromEntries(
  BRAND_PRESETS.map((p) => [p.key, p])
) as Record<BrandColorPreset, BrandPresetConfig>;
