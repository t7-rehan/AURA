export type QualityTier = 'performance' | 'balanced' | 'high' | 'ultra';

export interface QualitySetting {
  tier: QualityTier;
  label: string;
  particleCount: number;
  description: string;
}

/**
 * Centralized master particle count configuration.
 * Easy one-variable modification.
 */
export const DEFAULT_PARTICLE_COUNT = 8000;

export const QUALITY_TIERS: Record<QualityTier, QualitySetting> = {
  performance: {
    tier: 'performance',
    label: 'Eco',
    particleCount: 4000,
    description: 'Ultra-lightweight 4K particles for high-framerate interaction',
  },
  balanced: {
    tier: 'balanced',
    label: 'Balanced',
    particleCount: 6000,
    description: 'Silky 6K fluid streams for standard hardware',
  },
  high: {
    tier: 'high',
    label: 'High (Default)',
    particleCount: 8000,
    description: 'Balanced 8K luminous energy field (recommended)',
  },
  ultra: {
    tier: 'ultra',
    label: 'Ultra',
    particleCount: 12000,
    description: 'Dense 12K particle field for dedicated GPUs',
  },
};

export type ParticlePatternType = 'FREE' | 'GALAXY' | 'NEBULA' | 'SPHERE';

export type ParticleInteractionMode =
  | 'FREE'
  | 'ATTRACT'
  | 'REPEL'
  | 'TWO_HAND_EXPAND'
  | 'TWO_HAND_CONTRACT'
  | 'DUAL_CONTROL';

export interface ParticlePhysicsConfig {
  damping: number;
  flowFieldStrength: number;
  flowFieldFrequency: number;
  flowSpeed: number;
  handRepelRadius: number;
  handRepelForce: number;
  handAttractRadius: number;
  handAttractForce: number;
  fingertipInfluenceRadius: number;
  fingertipForce: number;
  fluidWakeForce: number;
  vortexForce: number;
  patternSpringForce: number;
  patternMorphSpeed: number;
  returnStrength: number;
  maxVelocity: number;
  maxForce: number;
  maxHandSpeed: number;
}

export const DEFAULT_PHYSICS_CONFIG: ParticlePhysicsConfig = {
  damping: 0.978,
  flowFieldStrength: 0.82,
  flowFieldFrequency: 0.018,
  flowSpeed: 0.65,
  handRepelRadius: 44.0,
  handRepelForce: 72.0,
  handAttractRadius: 46.0,
  handAttractForce: 68.0,
  fingertipInfluenceRadius: 38.0,
  fingertipForce: 34.0,
  fluidWakeForce: 36.0,
  vortexForce: 28.0,
  patternSpringForce: 3.6,
  patternMorphSpeed: 1.5,
  returnStrength: 0.18,
  maxVelocity: 58.0,
  maxForce: 90.0,
  maxHandSpeed: 80.0,
};

export interface ParticleColorPalette {
  name: string;
  primary: [number, number, number];    // RGB normalized 0-1
  secondary: [number, number, number];
  accent: [number, number, number];
  highlight: [number, number, number];
}

export const PARTICLE_PALETTES: ParticleColorPalette[] = [
  {
    name: 'Luminous Cosmos (Reference)',
    primary: [0.12, 0.88, 0.96],      // Electric cyan / teal
    secondary: [0.68, 0.24, 0.95],   // Subtle violet / purple
    accent: [0.18, 0.92, 0.58],      // Subtle quantum emerald / green
    highlight: [1.0, 1.0, 1.0],      // Radiant pure white core
  },
  {
    name: 'Solar Flare',
    primary: [1.0, 0.45, 0.1],       // Radiant orange
    secondary: [0.95, 0.82, 0.2],    // Golden yellow
    accent: [0.95, 0.15, 0.35],      // Ruby crimson
    highlight: [1.0, 1.0, 0.92],     // White heat
  },
  {
    name: 'Quantum Emerald',
    primary: [0.08, 0.95, 0.65],     // Quantum mint
    secondary: [0.1, 0.58, 0.92],    // Azure
    accent: [0.78, 1.0, 0.28],       // Lime plasma
    highlight: [0.92, 1.0, 1.0],     // Pure teal
  },
  {
    name: 'Ethereal Violet',
    primary: [0.68, 0.28, 1.0],      // Ultraviolet
    secondary: [0.32, 0.52, 1.0],    // Indigo
    accent: [1.0, 0.28, 0.62],       // Neon pink
    highlight: [0.96, 0.92, 1.0],    // Diamond light
  },
];
