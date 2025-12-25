// src/stores/uiStore.ts
// UI state management - navigation, selections, modals

import { create } from 'zustand';
import type { Region } from '../types';

export type NavView =
  | 'dashboard'
  | 'standings'
  | 'schedule'
  | 'playoffs'
  | 'power-rankings'
  | 'team'
  | 'roster'
  | 'free-agents'
  | 'trade'
  | 'draft'
  | 'history'
  | 'finances'
  | 'player'
  | 'league-standings'
  | 'international'
  | 'match-detail'
  | 'players'
  | 'roster-management'
  | 'free-agency';

export type AppScreen = 'welcome' | 'setup' | 'game' | 'editor';

interface UIStore {
  // Screen state
  screen: AppScreen;
  view: NavView;
  previousView: NavView;

  // Selection state
  selectedTeamId: string | null;
  selectedPlayerId: string | null;
  selectedMatchId: string | null;
  selectedRegion: Region;

  // Modal state
  showEditPlayerModal: boolean;

  // Dev mode
  devMode: boolean;

  // Actions - Screen
  setScreen: (screen: AppScreen) => void;

  // Actions - Navigation
  navigate: (view: NavView, teamId?: string) => void;
  setView: (view: NavView) => void;
  goBack: () => void;

  // Actions - Selection
  setSelectedTeamId: (id: string | null) => void;
  setSelectedPlayerId: (id: string | null) => void;
  setSelectedMatchId: (id: string | null) => void;
  setSelectedRegion: (region: Region) => void;

  // Actions - Modals
  openEditPlayerModal: () => void;
  closeEditPlayerModal: () => void;

  // Actions - Dev mode
  toggleDevMode: () => void;

  // Actions - View team/player/match
  viewTeam: (teamId: string) => void;
  viewPlayer: (playerId: string) => void;
  viewMatch: (matchId: string) => void;
  viewNextTeam: (teams: { id: string }[]) => void;
  viewPrevTeam: (teams: { id: string }[]) => void;

  // Reset for new game
  resetForNewGame: (userTeamId: string, region: Region) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  screen: 'welcome',
  view: 'dashboard',
  previousView: 'dashboard',
  selectedTeamId: null,
  selectedPlayerId: null,
  selectedMatchId: null,
  selectedRegion: 'americas',
  showEditPlayerModal: false,
  devMode: false,

  // Screen
  setScreen: (screen) => set({ screen }),

  // Navigation
  navigate: (view, teamId) => {
    set(state => ({
      view,
      previousView: state.view,
      selectedTeamId: teamId ?? state.selectedTeamId,
    }));
  },

  setView: (view) => set(state => ({ view, previousView: state.view })),

  goBack: () => set(state => ({ view: state.previousView })),

  // Selection
  setSelectedTeamId: (id) => set({ selectedTeamId: id }),
  setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
  setSelectedMatchId: (id) => set({ selectedMatchId: id }),
  setSelectedRegion: (region) => set({ selectedRegion: region }),

  // Modals
  openEditPlayerModal: () => set({ showEditPlayerModal: true }),
  closeEditPlayerModal: () => set({ showEditPlayerModal: false }),

  // Dev mode
  toggleDevMode: () => set(state => ({ devMode: !state.devMode })),

  // View helpers
  viewTeam: (teamId) => {
    set(state => ({
      selectedTeamId: teamId,
      view: 'team',
      previousView: state.view,
    }));
  },

  viewPlayer: (playerId) => {
    set(state => ({
      selectedPlayerId: playerId,
      view: 'player',
      previousView: state.view,
    }));
  },

  viewMatch: (matchId) => {
    set(state => ({
      selectedMatchId: matchId,
      view: 'match-detail',
      previousView: state.view,
    }));
  },

  viewNextTeam: (teams) => {
    const { selectedTeamId } = get();
    const currentIdx = teams.findIndex(t => t.id === selectedTeamId);
    const nextIdx = (currentIdx + 1) % teams.length;
    set({ selectedTeamId: teams[nextIdx].id, view: 'team' });
  },

  viewPrevTeam: (teams) => {
    const { selectedTeamId } = get();
    const currentIdx = teams.findIndex(t => t.id === selectedTeamId);
    const prevIdx = (currentIdx - 1 + teams.length) % teams.length;
    set({ selectedTeamId: teams[prevIdx].id, view: 'team' });
  },

  // Reset for new game
  resetForNewGame: (userTeamId, region) => {
    set({
      screen: 'game',
      view: 'dashboard',
      previousView: 'dashboard',
      selectedTeamId: userTeamId,
      selectedPlayerId: null,
      selectedMatchId: null,
      selectedRegion: region,
      showEditPlayerModal: false,
    });
  },
}));