// src/ui/components/MatchDetailView.tsx
import { useState, useMemo } from 'react';
import type { Team, MatchResult, RoundLog, MatchAward } from '../../types';
import { PlayByPlay } from './PlayByPlay';
import { RoundTimeline } from './RoundTimeline';
import { InlineFlag } from './PlayerAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { generateSyntheticRoundLogs } from '../../sim/syntheticRoundLogs';
import { computeSeriesStorylines } from '../../sim/seriesStats';
import './MatchDetailView.css';

interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  mapWins: number;
  mapLosses: number;
  roundDifferential: number;
}

interface MatchDetailViewProps {
  match: MatchResult;
  homeTeam: Team;
  awayTeam: Team;
  homeStanding?: Standing;
  awayStanding?: Standing;
  homeSeed?: { region: string; seed: number } | null;
  awaySeed?: { region: string; seed: number } | null;
  h2h?: { homeWins: number; awayWins: number }; // current season H2H prior to this match
  allPlayers?: Team['roster']; // full player pool including released players
  onBack: () => void;
  onViewPlayer?: (playerId: string) => void;
  legacyAgentIcons?: string[];
}

const MDV_LEGACY: Record<string, string> = { gekko: 'gekko_old.webp', harbor: 'harbor_old.webp', fade: 'fade_old.webp' };

// Helper to get agent icon URL from local assets
function getAgentIconUrl(agent: string, legacy?: string[]): string {
  if (legacy?.includes(agent) && MDV_LEGACY[agent]) return `/logos/agents/${MDV_LEGACY[agent]}`;
  return `/logos/agents/${agent.toLowerCase()}.png`;
}

// Helper to capitalize agent name for display
function formatAgentName(agent: string): string {
  return agent.charAt(0).toUpperCase() + agent.slice(1).toLowerCase();
}

// Helper for KD ratio color class
function kdClass(kills: number, deaths: number): string {
  if (kills === 0 && deaths === 0) return '';
  return (kills / Math.max(deaths, 1)) >= 1 ? 'positive' : 'negative';
}

// collapsible wrapper for the text play-by-play
function CollapsiblePbp(props: { roundLogs: RoundLog[]; homeTeamId: string; awayTeamId: string; homeAbbr: string; awayAbbr: string; mapName: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pbp-collapsible">
      <button className="pbp-toggle" onClick={() => setExpanded(!expanded)}>
        <span>Play-by-Play Log</span>
        <span className={`pbp-chevron ${expanded ? 'expanded' : ''}`}>▾</span>
      </button>
      {expanded && <PlayByPlay {...props} />}
    </div>
  );
}

function StorylineDropdown({ storylines, homeTeam, awayTeam, playerPool, overflowAwards, mainAwardIds, legacyIcons }: {
  storylines: import('../../sim/seriesStats').SeriesStorylines;
  homeTeam: Team;
  awayTeam: Team;
  playerPool: Map<string, Team['roster'][0]>;
  overflowAwards: MatchAward[];
  mainAwardIds: string[];
  legacyIcons?: string[];
}) {
  const [open, setOpen] = useState(false);
  const ai = (a: string) => getAgentIconUrl(a, legacyIcons);

  const teamOf = (id: string) => id === homeTeam.id ? homeTeam : awayTeam;
  const nat = (id: string) => playerPool.get(id)?.nationality;
  const img = (id: string) => playerPool.get(id)?.imageUrl;
  const agent = (id: string) => storylines.playerAgents[id];
  // returns team-side accent: home=red, away=teal
  const homeIds = new Set(homeTeam.roster.map(p => p.id));
  const sideAccent = (playerId?: string, teamId?: string) => {
    if (teamId) return teamId === homeTeam.id ? 'var(--accent)' : 'var(--accent-secondary)';
    return homeIds.has(playerId ?? '') ? 'var(--accent)' : 'var(--accent-secondary)';
  };
  const teamAbbr = (playerId?: string, teamId?: string) => {
    const isHome = teamId ? teamId === homeTeam.id : homeIds.has(playerId ?? '');
    return isHome ? homeTeam.abbreviation : awayTeam.abbreviation;
  };

  type SingleCard = { kind: 'single'; accent: string; label: string; playerId?: string; icon?: string; agentIcon?: string; name: string; nationality?: string; sub: string };
  type KillsCard = { kind: 'kills'; accent: string; label: string; playerId: string; agentIcon?: string; name: string; nationality?: string; stat: string; mapName: string };
  type DuelCard = {
    kind: 'duel'; accent: string; label: string;
    p1: { id: string; name: string; nat?: string; img?: string; agent?: string };
    score: string; p1Score: number; p2Score: number;
    p2: { id: string; name: string; nat?: string; img?: string; agent?: string };
  };
  type Card = SingleCard | KillsCard | DuelCard;

  const cards: Card[] = [];

  // spill overflow awards from the main bar first
  for (const award of overflowAwards) {
    const awardTeam = award.teamId === homeTeam.id ? homeTeam : awayTeam;
    cards.push({
      kind: 'single',
      accent: award.teamId === homeTeam.id ? 'var(--accent)' : 'var(--accent-secondary)',
      label: award.label,
      playerId: award.playerId,
      icon: ai(award.playerAgent),
      name: award.playerName,
      nationality: awardTeam.roster.find(p => p.id === award.playerId)?.nationality,
      sub: award.value,
    });
  }

  // track all player ids already shown (in overflow awards + storyline cards) to dedup
  // seed featured with all award player IDs (main + overflow) to prevent repetition
  const featured = new Set<string>([...mainAwardIds, ...overflowAwards.map(a => a.playerId)]);

  if (storylines.kryptonite) {
    const k = storylines.kryptonite;
    featured.add(k.killerId);
    featured.add(k.victimId);
    cards.push({
      kind: 'duel', accent: sideAccent(k.killerId), label: 'Living Rent Free',
      p1: { id: k.killerId, name: k.killerName, nat: nat(k.killerId), img: img(k.killerId), agent: agent(k.killerId) },
      score: `${k.kills} – ${k.reverse}`, p1Score: k.kills, p2Score: k.reverse,
      p2: { id: k.victimId, name: k.victimName, nat: nat(k.victimId), img: img(k.victimId), agent: agent(k.victimId) },
    });
  }

  if (storylines.topDuel) {
    const d = storylines.topDuel;
    if (!featured.has(d.p1Id) || !featured.has(d.p2Id)) {
      featured.add(d.p1Id);
      featured.add(d.p2Id);
      cards.push({
        kind: 'duel', accent: sideAccent(d.p1Id), label: 'Heated Rivalry',
        p1: { id: d.p1Id, name: d.p1Name, nat: nat(d.p1Id), img: img(d.p1Id), agent: agent(d.p1Id) },
        score: `${d.p1Kills} – ${d.p2Kills}`, p1Score: d.p1Kills, p2Score: d.p2Kills,
        p2: { id: d.p2Id, name: d.p2Name, nat: nat(d.p2Id), img: img(d.p2Id), agent: agent(d.p2Id) },
      });
    }
  }

  const topFb = [...storylines.firstBloods].sort((a, b) => b.count - a.count)[0];
  if (topFb && !featured.has(topFb.playerId)) {
    featured.add(topFb.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(topFb.playerId), label: 'First Blood',
      playerId: topFb.playerId,
      name: topFb.playerName, nationality: nat(topFb.playerId),
      sub: `${topFb.count} opening kills`,
    });
  }

  if (storylines.clutches.length > 0) {
    const c = storylines.clutches[0];
    if (!featured.has(c.playerId)) {
      featured.add(c.playerId);
      cards.push({
        kind: 'single', accent: sideAccent(c.playerId), label: 'Clutch King',
        playerId: c.playerId,
        icon: ai(c.agent),
        name: c.playerName, nationality: nat(c.playerId),
        sub: `${c.count}x clutch${c.best >= 3 ? ` · 1v${c.best}` : ''}`,
      });
    }
  }

  if (storylines.hsLeader && storylines.hsLeader.pct >= 40 && !featured.has(storylines.hsLeader.playerId)) {
    const h = storylines.hsLeader;
    featured.add(h.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(h.playerId), label: 'Clicking Heads',
      playerId: h.playerId,
      name: h.playerName, nationality: nat(h.playerId),
      sub: `${h.pct}% HS rate`,
    });
  } else if (storylines.mapCarry && !featured.has(storylines.mapCarry.playerId)) {
    const m = storylines.mapCarry;
    featured.add(m.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(m.playerId), label: 'He Can Do No Wrong',
      playerId: m.playerId,
      agentIcon: m.agent ? ai(m.agent) : undefined,
      name: m.playerName, nationality: nat(m.playerId),
      sub: `${m.acs} ACS on ${m.mapName}`,
    });
  }

  if (storylines.sacrifice && !featured.has(storylines.sacrifice.playerId)) {
    const s = storylines.sacrifice;
    featured.add(s.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(s.playerId, s.teamId), label: s.won ? 'Unsung Hero' : 'Sometimes We Just Have to Relax You Know?',
      playerId: s.playerId,
      name: s.playerName, nationality: nat(s.playerId),
      sub: `${s.firstDeaths} first deaths`,
    });
  }

  if (storylines.starFlopped && !featured.has(storylines.starFlopped.playerId)) {
    const s = storylines.starFlopped;
    featured.add(s.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(s.playerId, s.teamId), label: "Star Didn't Show Up",
      playerId: s.playerId,
      name: s.playerName, nationality: nat(s.playerId),
      sub: `${s.kd} K/D · ${s.ovr} OVR`,
    });
  }

  if (storylines.lockedIn && !featured.has(storylines.lockedIn.playerId)) {
    const l = storylines.lockedIn;
    featured.add(l.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(l.playerId, l.teamId), label: 'Locked In',
      playerId: l.playerId,
      name: l.playerName, nationality: nat(l.playerId),
      sub: `${l.kills} kills · ${l.acs} ACS`,
    });
  }

  if (storylines.demon && !featured.has(storylines.demon.playerId)) {
    const d = storylines.demon;
    featured.add(d.playerId);
    cards.push({
      kind: 'kills', accent: sideAccent(d.playerId, d.teamId), label: 'Demon',
      playerId: d.playerId,
      agentIcon: d.agent ? ai(d.agent) : undefined,
      name: d.playerName, nationality: nat(d.playerId),
      stat: `${d.kills} kills`,
      mapName: d.mapName,
    });
  }

  if (storylines.keyboardUnplugged && !featured.has(storylines.keyboardUnplugged.playerId)) {
    const k = storylines.keyboardUnplugged;
    featured.add(k.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(k.playerId, k.teamId), label: 'Keyboard Unplugged?',
      playerId: k.playerId,
      agentIcon: k.agent ? ai(k.agent) : undefined,
      name: k.playerName, nationality: nat(k.playerId),
      sub: `${k.kills}/${k.deaths}/${k.assists} · ${k.acs} ACS on ${k.mapName}`,
    });
  }

  if (storylines.hardCarry) {
    const h = storylines.hardCarry;
    featured.add(h.playerId);
    const mapsLabel = h.mapsTopFragged === 1 ? 'the map' : `all ${h.mapsTopFragged} maps`;
    cards.push({
      kind: 'single', accent: sideAccent(h.playerId, h.teamId), label: 'Hard Carry',
      playerId: h.playerId,
      name: h.playerName, nationality: nat(h.playerId),
      sub: '',
      mapLines: h.mapLines.map(ml => ({
        agent: ml.agent,
        map: ml.map,
        value: `${ml.kills}/${ml.deaths}/${ml.assists} · ${ml.acs} ACS ⭐`,
      })),
    });
  }

  if (storylines.tideTurner && !featured.has(storylines.tideTurner.playerId)) {
    const t = storylines.tideTurner;
    featured.add(t.playerId);
    cards.push({
      kind: 'single', accent: sideAccent(t.playerId, t.teamId), label: 'Tide Turner',
      playerId: t.playerId,
      name: t.playerName, nationality: nat(t.playerId),
      sub: `${t.clutches} clutches in comeback`,
    });
  }

  if (!cards.length) return null;

  return (
    <div className="storylines-dropdown">
      <button className="storylines-toggle" onClick={() => setOpen(o => !o)}>
        <span className="storylines-toggle-label">Advanced Stats</span>
        <span className={`storylines-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="storylines-grid-4">
          {cards.map((c, i) => (
            <div key={i} className={`storyline-award ${c.kind === 'duel' ? 'duel' : ''} ${c.kind === 'kills' ? 'kills' : ''}`} style={{ '--sl-accent': c.accent } as React.CSSProperties}>
              {c.kind === 'duel' ? (
                <>
                  <div className="storyline-single-avatar-wrap">
                    <PlayerAvatar playerName={c.p1.name} nationality={c.p1.nat} imageUrl={c.p1.img} size="md" showFlag={false} />
                  </div>
                  <div className="storyline-award-info">
                    <span className="storyline-award-label">{c.label}</span>
                    <span className="storyline-award-name">
                      <InlineFlag code={c.p1.nat} />
                      {teamAbbr(c.p1.id)} {c.p1.name}
                    </span>
                    <span className="storyline-award-sub">
                      <span style={{fontFamily:'Rajdhani,sans-serif',fontWeight:700,fontSize:'15px',color:'var(--sl-accent, var(--accent))'}}>{c.p1Score}</span>
                      <span style={{color:'var(--text-muted)',fontSize:'12px'}}>—</span>
                      <span style={{fontFamily:'Rajdhani,sans-serif',fontWeight:600,fontSize:'15px',color:'var(--text-secondary)',opacity:0.6}}>{c.p2Score}</span>
                      <span style={{color:'var(--text-muted)',fontSize:'10px',margin:'0 2px'}}>vs</span>
                      <span style={{display:'inline-flex',alignItems:'center',gap:'3px',flexShrink:0}}>
                        <InlineFlag code={c.p2.nat} />
                        {teamAbbr(c.p2.id)} {c.p2.name}
                      </span>
                    </span>
                  </div>
                </>
              ) : c.kind === 'kills' ? (
                <>
                  <span className="storyline-award-label">{c.label}</span>
                  <div className="storyline-kills-row">
                    <div className="storyline-single-avatar-wrap">
                      <PlayerAvatar playerName={c.name} nationality={c.nationality} imageUrl={img(c.playerId)} size="md" showFlag={false} />
                      {c.agentIcon && <img src={c.agentIcon} alt="" className="storyline-duel-agent" />}
                    </div>
                    <div className="storyline-kills-info">
                      <span className="storyline-kills-name">
                        <InlineFlag code={c.nationality} />
                        {teamAbbr(c.playerId)} {c.name}
                      </span>
                      <span className="storyline-kills-stat">{c.stat}</span>
                      <span className="storyline-kills-map">{c.mapName}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="storyline-single-avatar-wrap">
                    {c.playerId && img(c.playerId) ? (
                      <PlayerAvatar playerName={c.name} nationality={c.nationality} imageUrl={img(c.playerId)} size="md" showFlag={false} />
                    ) : c.icon ? (
                      <img src={c.icon} alt="" className="storyline-award-icon" />
                    ) : (
                      <PlayerAvatar playerName={c.name} nationality={c.nationality} size="md" showFlag={false} />
                    )}
                    {c.agentIcon && <img src={c.agentIcon} alt="" className="storyline-duel-agent" />}
                  </div>
                  <div className="storyline-award-info">
                    <span className="storyline-award-label">{c.label}</span>
                    <span className="storyline-award-name">
                      <InlineFlag code={c.nationality} />
                      {teamAbbr(c.playerId)} {c.name}
                    </span>
                    {c.sub && <span className="storyline-award-sub">{c.sub}</span>}
                    {c.mapLines && c.mapLines.map((line, j) => (
                      <span key={j} className="storyline-award-sub storyline-award-mapline">
                        {line.agent && <img src={ai(line.agent)} alt="" className="storyline-mapline-agent" />}
                        {line.map && <span className="storyline-mapline-map">{line.map}</span>}
                        <span>{line.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchDetailView({ match, homeTeam, awayTeam, homeStanding, awayStanding, homeSeed, awaySeed, h2h, allPlayers = [], onBack, onViewPlayer, legacyAgentIcons }: MatchDetailViewProps) {
  const agentIcon = (agent: string) => getAgentIconUrl(agent, legacyAgentIcons);
  const homeWon = match.homeScore > match.awayScore;

  // full player lookup: current rosters + any released players passed in
  const playerPool = useMemo(() => {
    const map = new Map<string, Team['roster'][0]>();
    for (const p of allPlayers) map.set(p.id, p);
    for (const p of homeTeam.roster) map.set(p.id, p);
    for (const p of awayTeam.roster) map.set(p.id, p);
    return map;
  }, [homeTeam.roster, awayTeam.roster, allPlayers]);

  // build roster from actual match stats (so released players still show)
  const buildRosterFromStats = (isHome: boolean): Team['roster'] => {
    const seen = new Set<string>();
    const players: Team['roster'] = [];
    for (const mapScore of match.mapScores) {
      const stats = isHome ? mapScore.homePlayerStats : mapScore.awayPlayerStats;
      for (const s of stats || []) {
        if (!seen.has(s.playerId)) {
          seen.add(s.playerId);
          const p = playerPool.get(s.playerId);
          if (p) {
            players.push(p);
          } else {
            // player not found anywhere — create a stub so stats still show
            players.push({ id: s.playerId, name: s.playerId.split('_')[1] || s.playerId, role: 'flex' } as Team['roster'][0]);
          }
        }
      }
    }
    return players;
  };

  // Calculate series totals for each player, tracking all agents played in order
  const calculateSeriesTotals = (teamRoster: Team['roster'], isHome: boolean) => {
    return teamRoster.map(player => {
      let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalAcs = 0, totalFk = 0, totalFd = 0, mapsPlayed = 0;
      const agentsPlayed: string[] = [];

      match.mapScores.forEach(mapScore => {
        const stats = isHome ? mapScore.homePlayerStats : mapScore.awayPlayerStats;
        const playerStats = stats?.find(s => s.playerId === player.id);
        if (playerStats) {
          totalKills += playerStats.kills;
          totalDeaths += playerStats.deaths;
          totalAssists += playerStats.assists;
          totalAcs += playerStats.acs;
          totalFk += playerStats.firstKills;
          totalFd += playerStats.firstDeaths;
          mapsPlayed++;
          if (playerStats.agent) {
            agentsPlayed.push(playerStats.agent);
          }
        }
      });

      return {
        player, kills: totalKills, deaths: totalDeaths, assists: totalAssists,
        acs: mapsPlayed > 0 ? Math.round(totalAcs / mapsPlayed) : 0,
        kd: totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2),
        firstKills: totalFk, firstDeaths: totalFd, agentsPlayed,
      };
    }).sort((a, b) => b.acs - a.acs);
  };

  const homeTotals = calculateSeriesTotals(buildRosterFromStats(true), true);
  const awayTotals = calculateSeriesTotals(buildRosterFromStats(false), false);

  // build player name map for synthetic round logs
  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const [id, p] of playerPool.entries()) names[id] = p.name;
    return names;
  }, [playerPool]);

  // Generate synthetic round logs for legacy maps that don't have them
  const mapRoundLogs = useMemo(() => {
    return match.mapScores.map((mapScore, idx): RoundLog[] => {
      if (mapScore.roundLogs && mapScore.roundLogs.length > 0) {
        return mapScore.roundLogs;
      }
      // No round logs — generate synthetic ones from known stats
      if (!mapScore.homePlayerStats?.length || !mapScore.awayPlayerStats?.length) return [];
      return generateSyntheticRoundLogs(
        match.homeTeamId, match.awayTeamId,
        mapScore.homeRounds, mapScore.awayRounds,
        mapScore.homePlayerStats, mapScore.awayPlayerStats,
        match.seed || `legacy-${match.id}`, idx,
        playerNames
      );
    });
  }, [match, playerNames]);

  const playerTeams = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of homeTeam.roster) map[p.id] = homeTeam.id;
    for (const p of awayTeam.roster) map[p.id] = awayTeam.id;
    for (const ms of match.mapScores) {
      for (const s of ms.homePlayerStats ?? []) map[s.playerId] ??= match.homeTeamId;
      for (const s of ms.awayPlayerStats ?? []) map[s.playerId] ??= match.awayTeamId;
    }
    return map;
  }, [homeTeam, awayTeam, match]);

  const storylines = useMemo(() => {
    const withLogs = {
      ...match,
      mapScores: match.mapScores.map((ms, i) => ({ ...ms, roundLogs: mapRoundLogs[i] })),
    };
    const playerOvr: Record<string, number> = {};
    for (const [id, p] of playerPool) playerOvr[id] = (p as any).overall ?? 0;
    return computeSeriesStorylines([withLogs], playerNames, playerTeams, playerOvr);
  }, [match, mapRoundLogs, playerNames, playerTeams, playerPool]);

  const REGION_ABBR: Record<string, string> = {
    americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
    alpha: 'ALPHA', omega: 'OMEGA',
  };
  const REGION_COLORS: Record<string, string> = {
    americas: '#e74c3c', emea: '#3498db', pacific: '#2ecc71', china: '#f1c40f',
    alpha: '#c592ff', omega: '#ffc048',
  };
  const seedTag = (s: { region: string; seed: number }) => {
    const abbr = REGION_ABBR[s.region] ?? s.region.toUpperCase();
    const color = REGION_COLORS[s.region] ?? 'var(--text-muted)';
    return (
      <span className="match-hero-seed-tag" style={{ color, background: `${color}18`, borderColor: `${color}44` }}>
        {abbr} #{s.seed}
      </span>
    );
  };

  return (
    <div className="match-detail-view">
      {/* Back Button */}
      <button className="back-link" onClick={onBack}>
        <span className="back-arrow">←</span>
        Back to Schedule
      </button>

      {/* Hero Header */}
      <div className="match-hero">
        <div className="match-hero-accent"></div>
        
        <div className="match-hero-content">
          <div className={`match-hero-team left ${homeWon ? 'winner' : 'loser'}`}>
            <img src={homeTeam.logo} alt={homeTeam.name} className="match-hero-logo" />
            <div className="match-hero-team-info">
              <span className="match-hero-team-name">{homeTeam.name}</span>
              <div className="match-hero-meta-row">
                {homeSeed && seedTag(homeSeed)}
                {homeStanding && (homeStanding.wins + homeStanding.losses) > 0 && (
                  <span className="match-hero-record">
                    {homeStanding.wins}-{homeStanding.losses}
                    <span className={`match-hero-delta ${homeWon ? 'win' : 'loss'}`}>{homeWon ? '+W' : '+L'}</span>
                  </span>
                )}
              </div>
              {homeTeam.staff.headCoach && (
                <div className="match-hero-coach">
                  <InlineFlag code={homeTeam.staff.headCoach.nationality} size={12} />
                  <span>{homeTeam.staff.headCoach.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="match-hero-center">
            <div className="match-hero-score">
              <span className={`hero-score ${homeWon ? 'winner home-winner' : ''}`}>{match.homeScore}</span>
              <span className="hero-score-divider">:</span>
              <span className={`hero-score ${!homeWon ? 'winner away-winner' : ''}`}>{match.awayScore}</span>
            </div>
            {h2h && (h2h.homeWins + h2h.awayWins) > 0 && (
              <div className="match-hero-h2h">
                <span className="match-hero-h2h-label">H2H</span>
                <span className={`match-hero-h2h-num ${h2h.homeWins > h2h.awayWins ? 'lead' : ''}`}>{h2h.homeWins}</span>
                <span className="match-hero-h2h-sep">-</span>
                <span className={`match-hero-h2h-num ${h2h.awayWins > h2h.homeWins ? 'lead' : ''}`}>{h2h.awayWins}</span>
              </div>
            )}
          </div>

          <div className={`match-hero-team right ${!homeWon ? 'winner' : 'loser'}`}>
            <div className="match-hero-team-info right">
              <span className="match-hero-team-name">{awayTeam.name}</span>
              <div className="match-hero-meta-row">
                {awaySeed && seedTag(awaySeed)}
                {awayStanding && (awayStanding.wins + awayStanding.losses) > 0 && (
                  <span className="match-hero-record">
                    {awayStanding.wins}-{awayStanding.losses}
                    <span className={`match-hero-delta ${!homeWon ? 'win' : 'loss'}`}>{!homeWon ? '+W' : '+L'}</span>
                  </span>
                )}
              </div>
              {awayTeam.staff.headCoach && (
                <div className="match-hero-coach">
                  <InlineFlag code={awayTeam.staff.headCoach.nationality} size={12} />
                  <span>{awayTeam.staff.headCoach.name}</span>
                </div>
              )}
            </div>
            <img src={awayTeam.logo} alt={awayTeam.name} className="match-hero-logo" />
          </div>
        </div>
      </div>

      {/* Map Score Cards */}
      <div className="map-cards-section">
        <div className="map-score-cards">
          {match.mapScores.map((mapScore, idx) => {
            const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
            return (
              <div key={idx} className={`map-score-card ${homeMapWin ? 'home-win' : 'away-win'}`}>
                <span className="map-card-name">{mapScore.map}</span>
                <div className="map-card-score">
                  <span className={homeMapWin ? 'winner' : ''}>{mapScore.homeRounds}</span>
                  <span className="map-card-divider">-</span>
                  <span className={!homeMapWin ? 'winner' : ''}>{mapScore.awayRounds}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Series Summary */}
      {(() => {
        const totalRounds = match.mapScores.reduce((s, ms) => s + ms.homeRounds + ms.awayRounds, 0);
        let homePistols = 0, awayPistols = 0;
        for (const ms of match.mapScores) {
          if (ms.roundLogs) {
            for (const r of ms.roundLogs) {
              if (r.roundNumber === 1 || r.roundNumber === 13) {
                if (r.winnerTeamId === match.homeTeamId) homePistols++;
                else awayPistols++;
              }
            }
          }
        }
        let homeFKs = 0, awayFKs = 0;
        for (const ms of match.mapScores) {
          for (const ps of (ms.homePlayerStats || [])) homeFKs += ps.firstKills;
          for (const ps of (ms.awayPlayerStats || [])) awayFKs += ps.firstKills;
        }
        return (
          <div className="match-summary-bar">
            <div className="match-summary-stat">
              <span className="match-summary-val">{totalRounds}</span>
              <span className="match-summary-label">Rounds</span>
            </div>
            <div className="match-summary-divider" />
            <div className="match-summary-stat">
              <span className="match-summary-val">{homePistols}-{awayPistols}</span>
              <span className="match-summary-label">Pistols</span>
            </div>
            <div className="match-summary-divider" />
            <div className="match-summary-stat">
              <span className="match-summary-val">{homeFKs}-{awayFKs}</span>
              <span className="match-summary-label">First Bloods</span>
            </div>
          </div>
        );
      })()}

      {/* Match Awards — capped at 4, rest spill into Advanced Stats */}
      {match.awards && match.awards.length > 0 && (() => {
        const mainAwards = match.awards!.slice(0, 4);
        const spillAwards = match.awards!.slice(4);
        const hasStorylines = storylines.firstBloods.length > 0 || storylines.roundsAnalyzed > 0;
        return (
          <>
            <div className="match-awards-bar">
              {mainAwards.map((award, i) => {
                const isHome = award.teamId === match.homeTeamId;
                const awardTeam = isHome ? homeTeam : awayTeam;
                const awardPlayer = awardTeam.roster.find(p => p.id === award.playerId);
                const agentSrc = agentIcon(award.mapAgent || award.playerAgent);
                return (
                  <div key={i} className={`match-award ${isHome ? 'home' : 'away'}`}>
                    <div className="award-avatar-wrap">
                      <PlayerAvatar
                        playerName={award.playerName}
                        nationality={awardPlayer?.nationality}
                        imageUrl={awardPlayer?.imageUrl}
                        size="md"
                        showFlag={false}
                      />
                    </div>
                    <div className="award-info">
                      <span className="award-label">{award.label}</span>
                      <span className="award-player">
                        <InlineFlag code={awardPlayer?.nationality} />
                        {isHome ? homeTeam.abbreviation : awayTeam.abbreviation} {award.playerName}
                      </span>
                      {(() => {
                        // for raid_boss, compute per-map breakdown dynamically from round logs
                        let resolvedLines = award.mapLines;
                        if (award.type === 'raid_boss' && (!resolvedLines || resolvedLines.length === 0)) {
                          const lines: { agent: string; map: string; value: string }[] = [];
                          match.mapScores.forEach((ms, idx) => {
                            const rounds = mapRoundLogs[idx] || [];
                            const mapAces: Record<string, number> = {};
                            const mapFourKs: Record<string, number> = {};
                            const mapThreeKs: Record<string, number> = {};
                            for (const round of rounds) {
                              const roundKills: Record<string, number> = {};
                              for (const kill of round.kills) {
                                if (kill.killerPlayerId !== award.playerId) continue;
                                const prev = roundKills[kill.killerPlayerId] || 0;
                                if (kill.killerRoundKills > prev) roundKills[kill.killerPlayerId] = kill.killerRoundKills;
                              }
                              const maxK = roundKills[award.playerId] || 0;
                              if (maxK >= 5) mapAces[award.playerId] = (mapAces[award.playerId] || 0) + 1;
                              else if (maxK >= 4) mapFourKs[award.playerId] = (mapFourKs[award.playerId] || 0) + 1;
                              else if (maxK >= 3) mapThreeKs[award.playerId] = (mapThreeKs[award.playerId] || 0) + 1;
                            }
                            const aces = mapAces[award.playerId] || 0;
                            const fourKs = mapFourKs[award.playerId] || 0;
                            const threeKs = mapThreeKs[award.playerId] || 0;
                            if (aces > 0 || fourKs > 0 || threeKs > 0) {
                              const parts: string[] = [];
                              if (aces > 0) parts.push(`${aces}×ACE`);
                              if (fourKs > 0) parts.push(`${fourKs}×4K`);
                              if (threeKs > 0) parts.push(`${threeKs}×3K`);
                              const mapStats = [...(ms.homePlayerStats || []), ...(ms.awayPlayerStats || [])].find(s => s.playerId === award.playerId);
                              lines.push({ agent: mapStats?.agent || award.playerAgent || '', map: ms.map, value: parts.join(' · ') });
                            }
                          });
                          resolvedLines = lines.length > 0 ? lines : undefined;
                        }
                        return resolvedLines && resolvedLines.length > 0 ? (
                          resolvedLines.map((line, j) => (
                            <span key={j} className="award-value award-map-line">
                              <img src={agentIcon(line.agent)} alt="" className="award-meta-agent" />
                              {line.value}
                              <span className="award-meta-map">{line.map}</span>
                            </span>
                          ))
                        ) : (
                          <span className="award-value">
                            {award.agents && award.agents.length > 0
                              ? award.agents.map((ag, j) => (
                                  <img key={j} src={agentIcon(ag)} alt={ag} className="award-meta-agent" title={ag} />
                                ))
                              : agentSrc && <img src={agentSrc} alt="" className="award-meta-agent" />
                            }
                            {award.value}
                            {award.map && <span className="award-meta-map">{award.map}</span>}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
            {(hasStorylines || spillAwards.length > 0) && (
              <StorylineDropdown
                storylines={storylines}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                playerPool={playerPool}
                overflowAwards={spillAwards}
                mainAwardIds={mainAwards.map(a => a.playerId)}
                legacyIcons={legacyAgentIcons}
              />
            )}
          </>
        );
      })()}

      {/* Scoreboard for each map */}
      {match.mapScores.map((mapScore, mapIdx) => {
        const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
        const sortedHomeStats = [...(mapScore.homePlayerStats || [])].sort((a, b) => b.acs - a.acs);
        const sortedAwayStats = [...(mapScore.awayPlayerStats || [])].sort((a, b) => b.acs - a.acs);
        const hasRoundLogs = mapRoundLogs[mapIdx] && mapRoundLogs[mapIdx].length > 0;

        return (
          <div key={mapIdx} className="map-section">
            {/* Map Header — score + map name together */}
            <div className={`map-section-header ${homeMapWin ? 'home-win' : 'away-win'}`}>
              <div className="map-section-score">
                <img src={homeTeam.logo} alt="" className="map-section-logo" />
                <span className={`map-section-abbr ${homeMapWin ? 'winner' : ''}`}>{homeTeam.abbreviation}</span>
                <span className="map-section-rounds">
                  <span className={homeMapWin ? 'winner' : ''}>{mapScore.homeRounds}</span>
                  <span className="map-section-dash">-</span>
                  <span className={!homeMapWin ? 'winner' : ''}>{mapScore.awayRounds}</span>
                </span>
                <span className={`map-section-abbr ${!homeMapWin ? 'winner' : ''}`}>{awayTeam.abbreviation}</span>
                <img src={awayTeam.logo} alt="" className="map-section-logo" />
                <span className="map-section-name">{mapScore.map}</span>
              </div>
            </div>

            {/* Round Timeline */}
            {hasRoundLogs && (
              <div className="map-section-rounds-area">
                <RoundTimeline
                  roundLogs={mapRoundLogs[mapIdx]}
                  homeTeamId={match.homeTeamId}
                  awayTeamId={match.awayTeamId}
                  homeAbbr={homeTeam.abbreviation}
                  awayAbbr={awayTeam.abbreviation}
                  homeLogo={homeTeam.logo}
                  awayLogo={awayTeam.logo}
                />
              </div>
            )}

            {/* Side by Side Scoreboards */}
            <div className="scoreboard-grid">
              {/* Home Team Scoreboard */}
              <div className="scoreboard-table-wrapper home">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th className="col-player">PLAYER</th>
                      <th className="col-acs">ACS</th>
                      <th className="col-kda">K/D/A</th>
                      <th className="col-kd">K/D</th>
                      <th className="col-fk">FK</th>
                      <th className="col-fd">FD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHomeStats.map((stats, idx) => {
                      const player = homeTeam.roster.find(p => p.id === stats.playerId);
                      const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                      const isIGL = stats.playerId === homeTeam.iglId;
                      const isTopFrag = idx === 0;
                      return (
                        <tr key={stats.playerId} className={isTopFrag ? 'top-frag' : ''}>
                          <td className="col-player">
                            <div className="player-cell">
                              {stats.agent && (
                                <img 
                                  src={agentIcon(stats.agent)} 
                                  alt={stats.agent} 
                                  className="agent-icon" 
                                  title={formatAgentName(stats.agent)} 
                                />
                              )}
                              <span className="team-abbr">{homeTeam.abbreviation}</span>
                              <span 
                                className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                                onClick={() => onViewPlayer?.(stats.playerId)}
                              >
                                <InlineFlag code={player?.nationality} />
                                {player?.name || 'Unknown'}
                              </span>
                              {isIGL && <span className="igl-tag">IGL</span>}
                            </div>
                          </td>
                          <td className="col-acs">{stats.acs}</td>
                          <td className="col-kda">{stats.kills}/{stats.deaths}/{stats.assists}</td>
                          <td className={`col-kd ${kdClass(stats.kills, stats.deaths)}`}>{kd}</td>
                          <td className="col-fk">{stats.firstKills}</td>
                          <td className="col-fd">{stats.firstDeaths}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Away Team Scoreboard */}
              <div className="scoreboard-table-wrapper away">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th className="col-player">PLAYER</th>
                      <th className="col-acs">ACS</th>
                      <th className="col-kda">K/D/A</th>
                      <th className="col-kd">K/D</th>
                      <th className="col-fk">FK</th>
                      <th className="col-fd">FD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAwayStats.map((stats, idx) => {
                      const player = awayTeam.roster.find(p => p.id === stats.playerId);
                      const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                      const isIGL = stats.playerId === awayTeam.iglId;
                      const isTopFrag = idx === 0;
                      return (
                        <tr key={stats.playerId} className={isTopFrag ? 'top-frag' : ''}>
                          <td className="col-player">
                            <div className="player-cell">
                              {stats.agent && (
                                <img 
                                  src={agentIcon(stats.agent)} 
                                  alt={stats.agent} 
                                  className="agent-icon" 
                                  title={formatAgentName(stats.agent)} 
                                />
                              )}
                              <span className="team-abbr">{awayTeam.abbreviation}</span>
                              <span 
                                className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                                onClick={() => onViewPlayer?.(stats.playerId)}
                              >
                                <InlineFlag code={player?.nationality} />
                                {player?.name || 'Unknown'}
                              </span>
                              {isIGL && <span className="igl-tag">IGL</span>}
                            </div>
                          </td>
                          <td className="col-acs">{stats.acs}</td>
                          <td className="col-kda">{stats.kills}/{stats.deaths}/{stats.assists}</td>
                          <td className={`col-kd ${kdClass(stats.kills, stats.deaths)}`}>{kd}</td>
                          <td className="col-fk">{stats.firstKills}</td>
                          <td className="col-fd">{stats.firstDeaths}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      {/* Series Totals */}
      <div className="series-totals-section">
        <div className="series-totals-header">
          <span className="series-totals-title">SERIES TOTALS</span>
        </div>

        <div className="scoreboard-grid series">
          {/* Home Team Series */}
          <div className="scoreboard-table-wrapper series home">
            <div className="series-team-banner home">
              <img src={homeTeam.logo} alt="" className="series-team-logo" />
              <span className="series-team-name">{homeTeam.name}</span>
            </div>
            <table className="scoreboard-table series">
              <thead>
                <tr>
                  <th className="col-player">PLAYER</th>
                  <th className="col-acs">ACS</th>
                  <th className="col-k">K</th>
                  <th className="col-d">D</th>
                  <th className="col-a">A</th>
                  <th className="col-kd">K/D</th>
                  <th className="col-fk">FK</th>
                  <th className="col-fd">FD</th>
                </tr>
              </thead>
              <tbody>
                {homeTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }, idx) => {
                  const isIGL = player.id === homeTeam.iglId;
                  const isTopFrag = idx === 0;
                  return (
                    <tr key={player.id} className={isTopFrag ? 'top-frag' : ''}>
                      <td className="col-player">
                        <div className="player-cell">
                          <div className="agent-stack">
                            {agentsPlayed.map((agent, i) => (
                              <img 
                                key={i}
                                src={agentIcon(agent)} 
                                alt={agent} 
                                className="agent-icon stacked" 
                                title={`Map ${i + 1}: ${formatAgentName(agent)}`}
                                style={{ zIndex: agentsPlayed.length - i }}
                              />
                            ))}
                          </div>
                          <span className="team-abbr">{homeTeam.abbreviation}</span>
                          <span 
                            className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                            onClick={() => onViewPlayer?.(player.id)}
                          >
                            <InlineFlag code={player.nationality} />
                            {player.name}
                          </span>
                          {isIGL && <span className="igl-tag">IGL</span>}
                        </div>
                      </td>
                      <td className="col-acs">{acs}</td>
                      <td className="col-k">{kills}</td>
                      <td className="col-d">{deaths}</td>
                      <td className="col-a">{assists}</td>
                      <td className={`col-kd ${kdClass(kills, deaths)}`}>{kd}</td>
                      <td className="col-fk">{firstKills}</td>
                      <td className="col-fd">{firstDeaths}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Away Team Series */}
          <div className="scoreboard-table-wrapper series away">
            <div className="series-team-banner away">
              <img src={awayTeam.logo} alt="" className="series-team-logo" />
              <span className="series-team-name">{awayTeam.name}</span>
            </div>
            <table className="scoreboard-table series">
              <thead>
                <tr>
                  <th className="col-player">PLAYER</th>
                  <th className="col-acs">ACS</th>
                  <th className="col-k">K</th>
                  <th className="col-d">D</th>
                  <th className="col-a">A</th>
                  <th className="col-kd">K/D</th>
                  <th className="col-fk">FK</th>
                  <th className="col-fd">FD</th>
                </tr>
              </thead>
              <tbody>
                {awayTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }, idx) => {
                  const isIGL = player.id === awayTeam.iglId;
                  const isTopFrag = idx === 0;
                  return (
                    <tr key={player.id} className={isTopFrag ? 'top-frag' : ''}>
                      <td className="col-player">
                        <div className="player-cell">
                          <div className="agent-stack">
                            {agentsPlayed.map((agent, i) => (
                              <img 
                                key={i}
                                src={agentIcon(agent)} 
                                alt={agent} 
                                className="agent-icon stacked" 
                                title={`Map ${i + 1}: ${formatAgentName(agent)}`}
                                style={{ zIndex: agentsPlayed.length - i }}
                              />
                            ))}
                          </div>
                          <span className="team-abbr">{awayTeam.abbreviation}</span>
                          <span 
                            className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                            onClick={() => onViewPlayer?.(player.id)}
                          >
                            <InlineFlag code={player.nationality} />
                            {player.name}
                          </span>
                          {isIGL && <span className="igl-tag">IGL</span>}
                        </div>
                      </td>
                      <td className="col-acs">{acs}</td>
                      <td className="col-k">{kills}</td>
                      <td className="col-d">{deaths}</td>
                      <td className="col-a">{assists}</td>
                      <td className={`col-kd ${kdClass(kills, deaths)}`}>{kd}</td>
                      <td className="col-fk">{firstKills}</td>
                      <td className="col-fd">{firstDeaths}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}