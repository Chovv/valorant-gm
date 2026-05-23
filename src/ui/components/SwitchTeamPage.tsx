// src/ui/components/SwitchTeamPage.tsx
import type { Team, Region } from '../../types';
import './SwitchTeamPage.css';

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

interface SwitchTeamPageProps {
  teams: Team[];
  currentTeamId: string;
  onSwitch: (teamId: string) => void;
}

export function SwitchTeamPage({ teams, currentTeamId, onSwitch }: SwitchTeamPageProps) {
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];

  return (
    <>
      <div className="content-header">
        <h1>Switch Team</h1>
      </div>

      <div className="st-page">
        <div className="st-grid">
          {regions.map(region => {
            const regionTeams = teams
              .filter(t => t.region === region)
              .sort((a, b) => a.name.localeCompare(b.name));

            return (
              <div key={region} className="panel">
                <div className="panel-header">
                  {REGION_NAMES[region]}
                  <span className="panel-header-sub">{regionTeams.length} teams</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {regionTeams.map(team => {
                    const isCurrent = team.id === currentTeamId;
                    return (
                      <button
                        key={team.id}
                        className={`st-row ${isCurrent ? 'current' : ''}`}
                        onClick={() => !isCurrent && onSwitch(team.id)}
                        disabled={isCurrent}
                      >
                        <img src={team.logo} alt="" className="st-logo" />
                        <div className="st-info">
                          <span className="st-name">{team.name}</span>
                          <span className="st-abbr">{team.abbreviation}</span>
                        </div>
                        <div className="st-stats">
                          <span className="st-ovr">{Math.round(team.roster.reduce((s, p) => s + p.overall, 0) / (team.roster.length || 1))}</span>
                          <span className="st-ovr-label">AVG</span>
                        </div>
                        {isCurrent && <span className="st-current-tag">Current</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
