// src/db/gameDatabase.ts
// LocalStorage-based game save/load for ValorantGM

import type { GameState } from '../sim/gameState';

export interface SavedGame {
  id: string;
  name: string;
  gameState: GameState;
  savedAt: number;
  devMode?: boolean;
}

const STORAGE_KEY = 'valorantgm_saves';

function getSaves(): SavedGame[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedGame[];
  } catch {
    return [];
  }
}

function setSaves(saves: SavedGame[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

export async function saveGame(
  gameState: GameState, 
  name: string, 
  existingId?: string,
  devMode?: boolean,
): Promise<SavedGame> {
  const saves = getSaves();
  
  const save: SavedGame = {
    id: existingId || `save_${Date.now()}`,
    name,
    gameState,
    savedAt: Date.now(),
    devMode: devMode || false,
  };

  if (existingId) {
    // Update existing save
    const index = saves.findIndex(s => s.id === existingId);
    if (index >= 0) {
      saves[index] = save;
    } else {
      saves.push(save);
    }
  } else {
    saves.push(save);
  }

  setSaves(saves);
  return save;
}

export async function loadGame(id: string): Promise<SavedGame | null> {
  const saves = getSaves();
  return saves.find(s => s.id === id) || null;
}

export async function getAllSaves(): Promise<SavedGame[]> {
  return getSaves().sort((a, b) => b.savedAt - a.savedAt);
}

export async function renameSave(id: string, newName: string): Promise<void> {
  const saves = getSaves();
  const index = saves.findIndex(s => s.id === id);
  if (index >= 0) {
    saves[index].name = newName;
    setSaves(saves);
  }
}

export async function deleteSave(id: string): Promise<void> {
  const saves = getSaves();
  setSaves(saves.filter(s => s.id !== id));
}

export async function duplicateSave(id: string): Promise<SavedGame | null> {
  const saves = getSaves();
  const original = saves.find(s => s.id === id);
  if (!original) return null;

  const copy: SavedGame = {
    ...original,
    id: `save_${Date.now()}`,
    name: `${original.name} (Copy)`,
    gameState: JSON.parse(JSON.stringify(original.gameState)),
    savedAt: Date.now(),
  };

  saves.push(copy);
  setSaves(saves);
  return copy;
}