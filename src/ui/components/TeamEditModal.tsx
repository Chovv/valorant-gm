// src/ui/components/TeamEditModal.tsx
// Modal for editing team info (name, abbreviation, logo, region)

import React, { useState } from 'react';
import type { Team, Region } from '../../types';
import './TeamEditModal.css';

interface TeamEditModalProps {
  team: Team;
  onSave: (updates: Partial<Team>) => void;
  onClose: () => void;
}

const REGIONS: { value: Region; label: string }[] = [
  { value: 'americas', label: 'Americas' },
  { value: 'emea', label: 'EMEA' },
  { value: 'pacific', label: 'Pacific' },
  { value: 'china', label: 'China' },
];

export const TeamEditModal: React.FC<TeamEditModalProps> = ({ team, onSave, onClose }) => {
  const [name, setName] = useState(team.name);
  const [abbreviation, setAbbreviation] = useState(team.abbreviation);
  const [logo, setLogo] = useState(team.logo);
  const [region, setRegion] = useState<Region>(team.region);
  const [founded, setFounded] = useState(team.founded);

  const hasChanges =
    name !== team.name ||
    abbreviation !== team.abbreviation ||
    logo !== team.logo ||
    region !== team.region ||
    founded !== team.founded;

  const handleSave = () => {
    onSave({
      name: name.trim() || team.name,
      abbreviation: abbreviation.trim().toUpperCase() || team.abbreviation,
      logo: logo.trim() || team.logo,
      region,
      founded,
    });
    onClose();
  };

  return (
    <div className="tem-overlay">
      <div className="tem-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tem-header">
          <h2>Edit Team</h2>
          <button className="tem-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="tem-body">
          {/* Logo Preview */}
          <div className="tem-logo-section">
            <img
              src={logo}
              alt={name}
              className="tem-logo-preview"
              onError={(e) => { (e.target as HTMLImageElement).src = '/logos/teams/placeholder.png'; }}
            />
            <div className="tem-logo-field">
              <label>Logo URL</label>
              <input
                type="text"
                value={logo}
                onChange={e => setLogo(e.target.value)}
                placeholder="/logos/teams/team.png or https://..."
              />
              <span className="tem-hint">Local path or external URL</span>
            </div>
          </div>

          {/* Fields Grid */}
          <div className="tem-fields">
            <div className="tem-field">
              <label>Team Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
              />
            </div>

            <div className="tem-field">
              <label>Abbreviation</label>
              <input
                type="text"
                value={abbreviation}
                onChange={e => setAbbreviation(e.target.value.toUpperCase())}
                maxLength={5}
                placeholder="e.g. SEN"
              />
            </div>

            <div className="tem-field">
              <label>Region</label>
              <select value={region} onChange={e => setRegion(e.target.value as Region)}>
                {REGIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="tem-field">
              <label>Founded</label>
              <input
                type="number"
                value={founded}
                onChange={e => setFounded(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="tem-footer">
          <button className="tem-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="tem-btn-save" onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamEditModal;
