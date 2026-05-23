// src/sim/coachGenerator.ts
// generates coaches with rating, specialty, and nationality

import type { StaffMember, CoachSpecialty } from '../types/team';
import type { Region } from '../types/team';
import type { RNG } from '../utils/random';
import { randomInt } from '../utils/random';
import { pickNat } from './freeAgency';

const SPECIALTIES: CoachSpecialty[] = ['development', 'tactical', 'mental'];

// coach name pools — real-ish esports coach handles
const COACH_FIRST = [
  'David', 'James', 'Michael', 'Robert', 'Daniel', 'Thomas', 'Mark', 'Chris',
  'Sang', 'Jun', 'Hyun', 'Seung', 'Min', 'Jin', 'Young', 'Dae',
  'Matheus', 'Lucas', 'Gabriel', 'Rafael', 'Pedro', 'Bruno', 'Gustavo', 'Andre',
  'Erik', 'Niklas', 'Lukas', 'Adam', 'Emil', 'Oscar', 'Viktor', 'Aleksi',
  'Pierre', 'Antoine', 'Mehmet', 'Ali', 'Ivan', 'Maxim', 'Dmitry', 'Sergei',
];

const COACH_HANDLES = [
  'Aiden', 'Blitz', 'Cain', 'Duke', 'Edge', 'Flux', 'Grave', 'Haze',
  'Iron', 'Jinx', 'Knox', 'Lance', 'Myth', 'Node', 'Onyx', 'Prism',
  'Reed', 'Slab', 'Trek', 'Vex', 'Warp', 'Xero', 'Yoke', 'Zeal',
  'Bolt', 'Crux', 'Dome', 'Fang', 'Grit', 'Helm', 'Jolt', 'Keen',
];

function generateCoachName(rng: RNG): string {
  // 70% handle-style, 30% first-name style
  if (rng() < 0.7) {
    return COACH_HANDLES[randomInt(rng, 0, COACH_HANDLES.length - 1)];
  }
  return COACH_FIRST[randomInt(rng, 0, COACH_FIRST.length - 1)];
}

// rating tiers: 60% common, 25% good, 12% elite, 3% superstar
function generateCoachRating(rng: RNG, bias: number = 0): number {
  const roll = rng();
  let rating: number;
  if (roll < 0.60) rating = randomInt(rng, 50, 70);
  else if (roll < 0.85) rating = randomInt(rng, 71, 82);
  else if (roll < 0.97) rating = randomInt(rng, 83, 90);
  else rating = randomInt(rng, 91, 95);
  // bias shifts the result (for top-tier teams getting better coaches)
  return Math.max(30, Math.min(99, rating + bias));
}

export interface CoachGenOptions {
  region?: Region;
  ratingBias?: number; // +/- shift to rating distribution
  forceName?: string;
  forceRating?: number;
  forceSpecialty?: CoachSpecialty[];
}

function pickSpecialties(rng: RNG): CoachSpecialty[] {
  // 60% one specialty, 35% two, 5% all three
  const roll = rng();
  if (roll < 0.60) return [SPECIALTIES[randomInt(rng, 0, SPECIALTIES.length - 1)]];
  if (roll < 0.95) {
    const shuffled = [...SPECIALTIES].sort(() => rng() - 0.5);
    return shuffled.slice(0, 2);
  }
  return [...SPECIALTIES];
}

export function generateCoach(rng: RNG, opts: CoachGenOptions = {}): StaffMember {
  const name = opts.forceName ?? generateCoachName(rng);
  const rating = opts.forceRating ?? generateCoachRating(rng, opts.ratingBias ?? 0);
  const specialty = opts.forceSpecialty ?? pickSpecialties(rng);
  const nationality = opts.region ? pickNat(rng, opts.region) : undefined;

  return {
    id: `coach_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name,
    rating,
    nationality,
    specialty,
  };
}

export function generateCoachPool(rng: RNG, count: number): StaffMember[] {
  const used = new Set<string>();
  const coaches: StaffMember[] = [];
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  for (let i = 0; i < count; i++) {
    const region = regions[randomInt(rng, 0, regions.length - 1)];
    let coach = generateCoach(rng, { region });
    // avoid duplicate names
    let attempts = 0;
    while (used.has(coach.name) && attempts < 10) {
      coach = generateCoach(rng, { region });
      attempts++;
    }
    used.add(coach.name);
    coaches.push(coach);
  }
  return coaches;
}
