// src/ui/components/MassPlayerEditor.tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import type { Team, Player, Role, Region } from '../../types';
import type { StaffMember, CoachSpecialty } from '../../types/team';
import { toLetterGrade } from '../../utils/letterGrade';
import { PlayerAvatar } from './PlayerAvatar';
import './MassPlayerEditor.css';

const COACH_SPECIALTIES: CoachSpecialty[] = ['development', 'tactical', 'mental'];

const GRADE_COLORS: Record<string, string> = {
  S: '#ffd700', A: '#0ac8b9', B: '#ff4655', C: '#888', D: '#555', F: '#444',
};

// local flag SVGs copied from flag-icons into public/flags/
export function flagSrc(code: string): string {
  return `/flags/${code.toLowerCase()}.svg`;
}

export function FlagImg({ code, size = 20 }: { code: string; size?: number }) {
  if (!code) return <span className="me-no-flag">—</span>;
  return <img src={flagSrc(code)} alt={code} className="me-flag-img" style={{ width: size, height: Math.round(size * 0.75) }} />;
}

// realistic nationality distributions per region
export const REGION_NATIONALITIES: Record<Region, { code: string; name: string; weight: number }[]> = {
  americas: [
    { code: 'BR', name: 'Brazil', weight: 35 },
    { code: 'US', name: 'United States', weight: 25 },
    { code: 'CL', name: 'Chile', weight: 10 },
    { code: 'AR', name: 'Argentina', weight: 10 },
    { code: 'MX', name: 'Mexico', weight: 5 },
    { code: 'CA', name: 'Canada', weight: 5 },
    { code: 'CO', name: 'Colombia', weight: 3 },
    { code: 'PE', name: 'Peru', weight: 3 },
    { code: 'UY', name: 'Uruguay', weight: 2 },
    { code: 'PR', name: 'Puerto Rico', weight: 2 },
  ],
  emea: [
    { code: 'TR', name: 'Turkey', weight: 18 },
    { code: 'RU', name: 'Russia', weight: 13 },
    { code: 'SE', name: 'Sweden', weight: 7 },
    { code: 'FR', name: 'France', weight: 7 },
    { code: 'FI', name: 'Finland', weight: 5 },
    { code: 'ES', name: 'Spain', weight: 5 },
    { code: 'DE', name: 'Germany', weight: 4 },
    { code: 'PL', name: 'Poland', weight: 4 },
    { code: 'UA', name: 'Ukraine', weight: 4 },
    { code: 'DK', name: 'Denmark', weight: 3 },
    { code: 'CZ', name: 'Czechia', weight: 3 },
    { code: 'IL', name: 'Israel', weight: 3 },
    { code: 'GB', name: 'United Kingdom', weight: 4 },
    { code: 'LV', name: 'Latvia', weight: 3 },
    { code: 'GE', name: 'Georgia', weight: 2 },
    { code: 'KZ', name: 'Kazakhstan', weight: 2 },
    { code: 'MA', name: 'Morocco', weight: 3 },
    { code: 'IT', name: 'Italy', weight: 3 },
    { code: 'PT', name: 'Portugal', weight: 2 },
    { code: 'BA', name: 'Bosnia and Herzegovina', weight: 2 },
    { code: 'RS', name: 'Serbia', weight: 2 },
    { code: 'LT', name: 'Lithuania', weight: 1 },
  ],
  pacific: [
    { code: 'KR', name: 'South Korea', weight: 25 },
    { code: 'JP', name: 'Japan', weight: 15 },
    { code: 'PH', name: 'Philippines', weight: 15 },
    { code: 'ID', name: 'Indonesia', weight: 12 },
    { code: 'TH', name: 'Thailand', weight: 8 },
    { code: 'SG', name: 'Singapore', weight: 5 },
    { code: 'IN', name: 'India', weight: 5 },
    { code: 'AU', name: 'Australia', weight: 5 },
    { code: 'VN', name: 'Vietnam', weight: 5 },
    { code: 'MY', name: 'Malaysia', weight: 3 },
    { code: 'TW', name: 'Taiwan', weight: 2 },
  ],
  china: [
    { code: 'CN', name: 'China', weight: 95 },
    { code: 'HK', name: 'Hong Kong', weight: 3 },
    { code: 'MO', name: 'Macau', weight: 2 },
  ],
};

export const ALL_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BQ', name: 'Bonaire' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'Congo (DRC)' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'XK', name: 'Kosovo' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macau' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NU', name: 'Niue' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'KP', name: 'North Korea' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'MF', name: 'Saint Martin' },
  { code: 'PM', name: 'Saint Pierre and Miquelon' },
  { code: 'VC', name: 'Saint Vincent' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'São Tomé and Príncipe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks and Caicos' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GB-ENG', name: 'England' },
  { code: 'GB-SCT', name: 'Scotland' },
  { code: 'GB-WLS', name: 'Wales' },
  { code: 'GB-NIR', name: 'Northern Ireland' },
  { code: 'US', name: 'United States' },
  { code: 'VI', name: 'US Virgin Islands' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VG', name: 'Virgin Islands (British)' },
  { code: 'WF', name: 'Wallis and Futuna' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

const ROLE_OPTIONS: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];
const GUN_PREF_OPTIONS = [
  'Vandal', 'Phantom', 'Operator',
  'Odin', 'Ares', 'Guardian', 'Outlaw', 'Bulldog', 'Marshal',
  'Judge', 'Bucky', 'Spectre', 'Stinger',
  'Sheriff', 'Ghost', 'Frenzy', 'Classic', 'Shorty',
];
const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];
const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China',
};

function pickNationality(pool: { code: string; weight: number }[]): string {
  const total = pool.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of pool) { r -= c.weight; if (r <= 0) return c.code; }
  return pool[0].code;
}

// most common esports countries — shown first in picker
const COMMON_CODES = new Set([
  'US', 'BR', 'KR', 'JP', 'TR', 'RU', 'FR', 'SE', 'FI', 'DE',
  'PL', 'UA', 'GB', 'CA', 'CL', 'AR', 'MX', 'PH', 'ID', 'TH',
  'CN', 'IN', 'ES', 'DK', 'CZ', 'IL', 'LV', 'GE', 'KZ', 'IT',
  'PT', 'MA', 'AU', 'VN', 'SG', 'MY', 'PE', 'CO', 'PR', 'BA',
  'RS', 'TW', 'HK', 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR',
]);
const COMMON_COUNTRIES = ALL_COUNTRIES.filter(c => COMMON_CODES.has(c.code));
const OTHER_COUNTRIES = ALL_COUNTRIES.filter(c => !COMMON_CODES.has(c.code));

// visual flag picker popover
export function FlagPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    setSearch('');
    setOpen(!open);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return;
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
    };
  }, [open]);

  const q = search.toLowerCase();
  const filteredCommon = q ? COMMON_COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : COMMON_COUNTRIES;
  const filteredOther = q ? OTHER_COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : OTHER_COUNTRIES;

  return (
    <div className="flag-picker" ref={ref}>
      <button className="flag-picker-btn" onClick={openPicker} title={value || 'No flag'}>
        {value ? <FlagImg code={value} size={20} /> : <span className="me-no-flag-dot" />}
      </button>
      {open && (
        <div className="flag-picker-dropdown">
          <div className="flag-picker-search-row">
            <input
              ref={searchRef}
              className="flag-picker-search"
              type="text"
              placeholder="Search country..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <button className="flag-picker-item flag-picker-none" onClick={() => { onChange(''); setOpen(false); }}>
            ✕ None
          </button>
          {filteredCommon.map(c => (
            <button
              key={c.code}
              className={`flag-picker-item ${c.code === value ? 'active' : ''}`}
              onClick={() => { onChange(c.code); setOpen(false); }}
              title={c.name}
            >
              <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
              <span className="flag-picker-label">{c.code}</span>
            </button>
          ))}
          {filteredCommon.length > 0 && filteredOther.length > 0 && !q && <div className="flag-picker-divider" />}
          {filteredOther.map(c => (
            <button
              key={c.code}
              className={`flag-picker-item ${c.code === value ? 'active' : ''}`}
              onClick={() => { onChange(c.code); setOpen(false); }}
              title={c.name}
            >
              <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
              <span className="flag-picker-label">{c.code}</span>
            </button>
          ))}
          {filteredCommon.length === 0 && filteredOther.length === 0 && (
            <div className="flag-picker-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  teams: Team[];
  freeAgents: Player[];
  onUpdate: (teams: Team[], freeAgents: Player[]) => void;
}

export function MassPlayerEditor({ teams, freeAgents, onUpdate }: Props) {
  const [activeRegion, setActiveRegion] = useState<Region | 'fa'>('americas');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [batchNat, setBatchNat] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const batchRef = useRef<HTMLDivElement>(null);
  const batchSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!batchOpen) return;
    const clickHandler = (e: MouseEvent) => {
      if (batchRef.current && !batchRef.current.contains(e.target as Node)) setBatchOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
    };
  }, [batchOpen]);

  const regionTeams = useMemo(() =>
    activeRegion === 'fa' ? [] :
    teams.filter(t => t.region === activeRegion).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
    [teams, activeRegion]
  );

  const withoutCount = teams.reduce((n, t) => n + t.roster.filter(p => !p.nationality).length, 0)
    + freeAgents.filter(p => !p.nationality).length;
  const regionEmpty = activeRegion === 'fa'
    ? freeAgents.filter(p => !p.nationality).length
    : regionTeams.reduce((n, t) => n + t.roster.filter(p => !p.nationality).length, 0);

  const updatePlayer = (teamId: string, playerId: string, updater: (p: Player) => void) => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      return { ...t, roster: t.roster.map(p => {
        if (p.id !== playerId) return p;
        const clone = { ...p };
        updater(clone);
        return clone;
      })};
    });
    onUpdate(next, freeAgents);
  };

  const updateFA = (playerId: string, updater: (p: Player) => void) => {
    const nextFA = freeAgents.map(p => {
      if (p.id !== playerId) return p;
      const clone = { ...p };
      updater(clone);
      return clone;
    });
    onUpdate(teams, nextFA);
  };

  const updateCoach = (teamId: string, updater: (c: StaffMember) => StaffMember) => {
    const next = teams.map(t => {
      if (t.id !== teamId || !t.staff.headCoach) return t;
      return { ...t, staff: { ...t.staff, headCoach: updater({ ...t.staff.headCoach }) } };
    });
    onUpdate(next, freeAgents);
  };

  const addCoach = (teamId: string) => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      const coach: StaffMember = {
        id: `coach_new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: 'New Coach',
        rating: 60,
        specialty: ['tactical'],
      };
      return { ...t, staff: { ...t.staff, headCoach: coach } };
    });
    onUpdate(next, freeAgents);
  };

  const removeCoach = (teamId: string) => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      return { ...t, staff: { ...t.staff, headCoach: null } };
    });
    onUpdate(next, freeAgents);
  };

  const updateStaff = (teamId: string, role: 'assistantCoach' | 'analyst', updater: (c: StaffMember) => StaffMember) => {
    const next = teams.map(t => {
      if (t.id !== teamId || !t.staff[role]) return t;
      return { ...t, staff: { ...t.staff, [role]: updater({ ...t.staff[role]! }) } };
    });
    onUpdate(next, freeAgents);
  };

  const addStaff = (teamId: string, role: 'assistantCoach' | 'analyst') => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      const s: StaffMember = {
        id: `${role}_new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: role === 'assistantCoach' ? 'New Assistant' : 'New Analyst',
        rating: 55,
        specialty: [role === 'analyst' ? 'development' : 'tactical'],
      };
      return { ...t, staff: { ...t.staff, [role]: s } };
    });
    onUpdate(next, freeAgents);
  };

  const removeStaff = (teamId: string, role: 'assistantCoach' | 'analyst') => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      return { ...t, staff: { ...t.staff, [role]: null } };
    });
    onUpdate(next, freeAgents);
  };

  const exportData = () => {
    const data = {
      teams: teams.map(t => ({
        id: t.id, name: t.name, abbreviation: t.abbreviation, region: t.region,
        roster: t.roster.map(p => ({
          id: p.id, name: p.name, role: p.role, age: p.age, nationality: p.nationality || '', gunPref: p.gunPref || '',
        })),
        headCoach: t.staff.headCoach ? {
          id: t.staff.headCoach.id, name: t.staff.headCoach.name,
          rating: t.staff.headCoach.rating, nationality: t.staff.headCoach.nationality || '',
          specialty: t.staff.headCoach.specialty || [],
        } : null,
        assistantCoach: t.staff.assistantCoach ? {
          id: t.staff.assistantCoach.id, name: t.staff.assistantCoach.name,
          rating: t.staff.assistantCoach.rating, nationality: t.staff.assistantCoach.nationality || '',
          specialty: t.staff.assistantCoach.specialty || [],
        } : null,
        analyst: t.staff.analyst ? {
          id: t.staff.analyst.id, name: t.staff.analyst.name,
          rating: t.staff.analyst.rating, nationality: t.staff.analyst.nationality || '',
          specialty: t.staff.analyst.specialty || [],
        } : null,
      })),
      freeAgents: freeAgents.map(p => ({
        id: p.id, name: p.name, role: p.role, age: p.age, nationality: p.nationality || '', gunPref: p.gunPref || '',
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mass-editor-export.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!data.teams || !Array.isArray(data.teams)) return;

          // build lookup maps from imported data
          const teamMap = new Map(data.teams.map((t: any) => [t.id, t]));
          const faMap = new Map((data.freeAgents || []).map((p: any) => [p.id, p]));

          const nextTeams = teams.map(t => {
            const imp = teamMap.get(t.id) as any;
            if (!imp) return t;
            const playerMap = new Map((imp.roster || []).map((p: any) => [p.id, p]));
            const roster = t.roster.map(p => {
              const ip = playerMap.get(p.id) as any;
              if (!ip) return p;
              return { ...p, name: ip.name ?? p.name, role: ip.role ?? p.role, age: ip.age ?? p.age, nationality: ip.nationality || p.nationality, gunPref: ip.gunPref || p.gunPref };
            });
            let staff = t.staff;
            if (imp.headCoach !== undefined) {
              if (imp.headCoach === null) {
                staff = { ...staff, headCoach: null };
              } else if (t.staff.headCoach) {
                staff = { ...staff, headCoach: {
                  ...t.staff.headCoach,
                  name: imp.headCoach.name ?? t.staff.headCoach.name,
                  rating: imp.headCoach.rating ?? t.staff.headCoach.rating,
                  nationality: imp.headCoach.nationality || t.staff.headCoach.nationality,
                  specialty: imp.headCoach.specialty ?? t.staff.headCoach.specialty,
                }};
              } else {
                // create new coach from import
                staff = { ...staff, headCoach: {
                  id: imp.headCoach.id || `coach_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  name: imp.headCoach.name || 'Coach',
                  rating: imp.headCoach.rating ?? 60,
                  nationality: imp.headCoach.nationality,
                  specialty: imp.headCoach.specialty || [],
                }};
              }
            }
            // assistant coach
            if (imp.assistantCoach !== undefined) {
              if (imp.assistantCoach === null) {
                staff = { ...staff, assistantCoach: null };
              } else if (t.staff.assistantCoach) {
                staff = { ...staff, assistantCoach: { ...t.staff.assistantCoach, name: imp.assistantCoach.name ?? t.staff.assistantCoach.name, rating: imp.assistantCoach.rating ?? t.staff.assistantCoach.rating, nationality: imp.assistantCoach.nationality || t.staff.assistantCoach.nationality, specialty: imp.assistantCoach.specialty ?? t.staff.assistantCoach.specialty }};
              } else {
                staff = { ...staff, assistantCoach: { id: imp.assistantCoach.id || `asst_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: imp.assistantCoach.name || 'Assistant', rating: imp.assistantCoach.rating ?? 55, nationality: imp.assistantCoach.nationality, specialty: imp.assistantCoach.specialty || [] }};
              }
            }
            // analyst
            if (imp.analyst !== undefined) {
              if (imp.analyst === null) {
                staff = { ...staff, analyst: null };
              } else if (t.staff.analyst) {
                staff = { ...staff, analyst: { ...t.staff.analyst, name: imp.analyst.name ?? t.staff.analyst.name, rating: imp.analyst.rating ?? t.staff.analyst.rating, nationality: imp.analyst.nationality || t.staff.analyst.nationality, specialty: imp.analyst.specialty ?? t.staff.analyst.specialty }};
              } else {
                staff = { ...staff, analyst: { id: imp.analyst.id || `analyst_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: imp.analyst.name || 'Analyst', rating: imp.analyst.rating ?? 55, nationality: imp.analyst.nationality, specialty: imp.analyst.specialty || [] }};
              }
            }
            return { ...t, roster, staff };
          });

          const nextFA = freeAgents.map(p => {
            const ip = faMap.get(p.id) as any;
            if (!ip) return p;
            return { ...p, name: ip.name ?? p.name, role: ip.role ?? p.role, age: ip.age ?? p.age, nationality: ip.nationality || p.nationality, gunPref: ip.gunPref || p.gunPref };
          });

          onUpdate(nextTeams, nextFA);
        } catch { /* invalid json */ }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const setAllFANationality = (code: string) => {
    const nextFA = freeAgents.map(p => ({ ...p, nationality: code }));
    onUpdate(teams, nextFA);
  };

  const setTeamNationality = (teamId: string, code: string) => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t;
      return { ...t, roster: t.roster.map(p => ({ ...p, nationality: code })) };
    });
    onUpdate(next, freeAgents);
  };

  const autoAssignRegion = () => {
    if (activeRegion === 'fa') {
      // FA: pick from a mixed pool (weighted equally across all regions)
      const allPool = Object.values(REGION_NATIONALITIES).flat();
      const nextFA = freeAgents.map(p => ({
        ...p, nationality: p.nationality || pickNationality(allPool),
      }));
      onUpdate(teams, nextFA);
      return;
    }
    const next = teams.map(t => {
      if (t.region !== activeRegion) return t;
      return { ...t, roster: t.roster.map(p => ({
        ...p, nationality: p.nationality || pickNationality(REGION_NATIONALITIES[t.region]),
      }))};
    });
    onUpdate(next, freeAgents);
  };

  const rerollRegion = () => {
    if (activeRegion === 'fa') {
      const allPool = Object.values(REGION_NATIONALITIES).flat();
      const nextFA = freeAgents.map(p => ({
        ...p, nationality: pickNationality(allPool),
      }));
      onUpdate(teams, nextFA);
      return;
    }
    const next = teams.map(t => {
      if (t.region !== activeRegion) return t;
      return { ...t, roster: t.roster.map(p => ({
        ...p, nationality: pickNationality(REGION_NATIONALITIES[t.region]),
      }))};
    });
    onUpdate(next, freeAgents);
  };

  const autoAssignAll = () => {
    const allPool = Object.values(REGION_NATIONALITIES).flat();
    const next = teams.map(t => ({
      ...t, roster: t.roster.map(p => ({
        ...p, nationality: p.nationality || pickNationality(REGION_NATIONALITIES[t.region]),
      })),
    }));
    const nextFA = freeAgents.map(p => ({
      ...p, nationality: p.nationality || pickNationality(allPool),
    }));
    onUpdate(next, nextFA);
  };

  return (
    <div className="mass-editor">
      <div className="content-header">
        <h1>🔧 Mass Player Editor</h1>
      </div>

      <div className="me-region-bar">
        <div className="me-region-tabs">
          {REGIONS.map(r => (
            <button
              key={r}
              className={`me-region-tab ${activeRegion === r ? 'active' : ''}`}
              onClick={() => { setActiveRegion(r); setExpandedTeam(null); }}
            >
              {REGION_NAMES[r]}
            </button>
          ))}
          <button
            className={`me-region-tab ${activeRegion === 'fa' ? 'active' : ''}`}
            onClick={() => { setActiveRegion('fa'); setExpandedTeam(null); }}
          >
            Free Agents ({freeAgents.length})
          </button>
        </div>
        <div className="me-actions">
          <button className="btn btn-sm" onClick={autoAssignRegion}>
            🌍 Fill Empty ({regionEmpty})
          </button>
          <button className="btn btn-sm" onClick={rerollRegion}>
            🎲 Re-roll {activeRegion === 'fa' ? 'FAs' : REGION_NAMES[activeRegion]}
          </button>
          <button className="btn btn-sm" onClick={autoAssignAll} title="Fill empty flags for all regions + FAs">
            🌐 Fill All ({withoutCount})
          </button>
          <span className="me-action-divider" />
          <button className="btn btn-sm" onClick={exportData} title="Export players & coaches as JSON">
            📤 Export
          </button>
          <button className="btn btn-sm" onClick={importData} title="Import players & coaches from JSON">
            📥 Import
          </button>
        </div>
      </div>

      {activeRegion !== 'fa' && (
      <div className="me-team-list">
        {regionTeams.map(team => {
          const isExpanded = expandedTeam === team.id;
          const emptyFlags = team.roster.filter(p => !p.nationality).length;
          return (
            <div key={team.id} className={`me-team-section ${isExpanded ? 'expanded' : ''}`}>
              <div className="me-team-header" onClick={() => setExpandedTeam(isExpanded ? null : team.id)}>
                <div className="me-team-left">
                  <img src={team.logo} alt="" className="me-team-logo" />
                  <span className="me-team-name">{team.name}</span>
                  <span className="me-team-abbr">{team.abbreviation}</span>
                  {emptyFlags > 0 && <span className="me-empty-badge">{emptyFlags} missing</span>}
                  {!team.staff.headCoach && <span className="me-empty-badge me-empty-badge--coach">no coach</span>}
                </div>
                <div className="me-team-right">
                  <div className="me-team-flags">
                    {team.roster.slice(0, 7).map(p => (
                      <span key={p.id} className="me-mini-flag">
                        {p.nationality ? <FlagImg code={p.nationality} size={16} /> : <span className="me-no-flag-dot" />}
                      </span>
                    ))}
                  </div>
                  <span className="me-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="me-team-body">
                  {/* batch set for this team */}
                  <div className="me-team-batch">
                    <span className="me-batch-label">Set all to:</span>
                    <div className="flag-picker" ref={batchRef}>
                      <button className="flag-picker-btn batch-flag-btn" onClick={() => {
                        setBatchOpen(!batchOpen); setBatchSearch(''); setTimeout(() => batchSearchRef.current?.focus(), 0);
                      }}>
                        {batchNat ? <><FlagImg code={batchNat} size={18} /> <span>{batchNat}</span></> : <span>Pick flag...</span>}
                      </button>
                      {batchOpen && (() => {
                        const bq = batchSearch.toLowerCase();
                        const bCommon = bq ? COMMON_COUNTRIES.filter(c => c.name.toLowerCase().includes(bq) || c.code.toLowerCase().includes(bq)) : COMMON_COUNTRIES;
                        const bOther = bq ? OTHER_COUNTRIES.filter(c => c.name.toLowerCase().includes(bq) || c.code.toLowerCase().includes(bq)) : OTHER_COUNTRIES;
                        return (
                          <div className="flag-picker-dropdown batch-dropdown">
                            <div className="flag-picker-search-row">
                              <input
                                ref={batchSearchRef}
                                className="flag-picker-search"
                                type="text"
                                placeholder="Search country..."
                                value={batchSearch}
                                onChange={e => setBatchSearch(e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            {bCommon.map(c => (
                              <button
                                key={c.code}
                                className={`flag-picker-item ${c.code === batchNat ? 'active' : ''}`}
                                onClick={() => { setBatchNat(c.code); setBatchOpen(false); }}
                                title={c.name}
                              >
                                <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
                                <span className="flag-picker-label">{c.code}</span>
                              </button>
                            ))}
                            {bCommon.length > 0 && bOther.length > 0 && !bq && <div className="flag-picker-divider" />}
                            {bOther.map(c => (
                              <button
                                key={c.code}
                                className={`flag-picker-item ${c.code === batchNat ? 'active' : ''}`}
                                onClick={() => { setBatchNat(c.code); setBatchOpen(false); }}
                                title={c.name}
                              >
                                <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
                                <span className="flag-picker-label">{c.code}</span>
                              </button>
                            ))}
                            {bCommon.length === 0 && bOther.length === 0 && (
                              <div className="flag-picker-empty">No matches</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      className="btn btn-sm"
                      disabled={!batchNat}
                      onClick={() => { setTeamNationality(team.id, batchNat); setBatchNat(''); }}
                    >
                      Apply
                    </button>
                  </div>

                  <table className="me-player-table">
                    <thead>
                      <tr>
                        <th className="me-th-flag">Flag</th>
                        <th className="me-th-name">Player</th>
                        <th className="me-th-role">Role</th>
                        <th className="me-th-gun">Gun</th>
                        <th className="me-th-age">Age</th>
                        <th className="me-th-ovr">OVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.roster.map(player => (
                        <tr key={player.id}>
                          <td className="me-td-flag">
                            <FlagPicker
                              value={player.nationality || ''}
                              onChange={code => updatePlayer(team.id, player.id, p => { p.nationality = code || undefined; })}
                            />
                            <span className="me-flag-code">{player.nationality || ''}</span>
                          </td>
                          <td className="me-td-name">
                            <div className="me-player-cell">
                              <PlayerAvatar playerId={player.id} playerName={player.name} imageUrl={player.imageUrl} size="sm" />
                              <input
                                className="me-name-input"
                                value={player.name}
                                onChange={e => updatePlayer(team.id, player.id, p => { p.name = e.target.value; })}
                              />
                            </div>
                          </td>
                          <td className="me-td-role">
                            <select
                              className="me-role-select"
                              value={player.role}
                              onChange={e => updatePlayer(team.id, player.id, p => { p.role = e.target.value as Role; })}
                            >
                              {ROLE_OPTIONS.map(r => (
                                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="me-td-gun">
                            <select
                              className="me-gun-select"
                              value={player.gunPref || ''}
                              onChange={e => updatePlayer(team.id, player.id, p => { p.gunPref = e.target.value || undefined; })}
                            >
                              <option value="">—</option>
                              {GUN_PREF_OPTIONS.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </td>
                          <td className="me-td-age">
                            <input
                              className="me-age-input"
                              type="number"
                              min={16} max={40}
                              value={player.age}
                              onChange={e => updatePlayer(team.id, player.id, p => { p.age = parseInt(e.target.value) || player.age; })}
                            />
                          </td>
                          <td className="me-td-ovr">
                            <span className="me-ovr">{player.overall}</span>
                          </td>
                        </tr>
                      ))}

                      {/* head coach row */}
                      <tr className="me-coach-divider-row"><td colSpan={6}><div className="me-coach-divider-line"><span>Head Coach</span></div></td></tr>
                      {team.staff.headCoach ? (
                        <tr className="me-coach-row">
                          <td className="me-td-flag">
                            <FlagPicker
                              value={team.staff.headCoach.nationality || ''}
                              onChange={code => updateCoach(team.id, c => ({ ...c, nationality: code || undefined }))}
                            />
                            <span className="me-flag-code">{team.staff.headCoach.nationality || ''}</span>
                          </td>
                          <td className="me-td-name">
                            <div className="me-player-cell">
                              <span className="me-coach-icon">🎓</span>
                              <input
                                className="me-name-input"
                                value={team.staff.headCoach.name}
                                onChange={e => { const v = e.target.value; updateCoach(team.id, c => ({ ...c, name: v })); }}
                              />
                            </div>
                          </td>
                          <td className="me-td-role">
                            <div className="me-spec-tags">
                              {COACH_SPECIALTIES.map(s => {
                                const specs = team.staff.headCoach!.specialty || [];
                                const isActive = specs.includes(s);
                                return (
                                  <button
                                    key={s}
                                    className={`me-spec-tag ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                      const next = isActive ? specs.filter(x => x !== s) : [...specs, s];
                                      updateCoach(team.id, c => ({ ...c, specialty: next.length ? next : [s] }));
                                    }}
                                  >
                                    {s.slice(0, 3).toUpperCase()}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="me-td-age">
                            <input
                              className="me-age-input"
                              type="text"
                              inputMode="numeric"
                              value={team.staff.headCoach.rating}
                              onChange={e => {
                                const raw = e.target.value.replace(/\D/g, '');
                                if (raw === '') return;
                                updateCoach(team.id, c => ({ ...c, rating: parseInt(raw) }));
                              }}
                              onBlur={() => updateCoach(team.id, c => ({ ...c, rating: Math.max(1, Math.min(99, c.rating)) }))}
                            />
                          </td>
                          <td className="me-td-ovr">
                            {(() => {
                              const grade = toLetterGrade(team.staff.headCoach!.rating);
                              const color = GRADE_COLORS[grade[0]] || '#888';
                              return <span className="me-coach-grade" style={{ color }}>{grade}</span>;
                            })()}
                            <button className="me-coach-remove-btn" onClick={() => removeCoach(team.id)} title="Remove coach">✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr className="me-coach-row">
                          <td colSpan={6} className="me-coach-empty-cell">
                            <button className="btn btn-sm" onClick={() => addCoach(team.id)}>+ Add Coach</button>
                          </td>
                        </tr>
                      )}

                      {/* assistant coach row */}
                      <tr className="me-coach-divider-row"><td colSpan={6}><div className="me-coach-divider-line"><span>Assistant Coach</span></div></td></tr>
                      {team.staff.assistantCoach ? (
                        <tr className="me-coach-row">
                          <td className="me-td-flag">
                            <FlagPicker
                              value={team.staff.assistantCoach.nationality || ''}
                              onChange={code => updateStaff(team.id, 'assistantCoach', c => ({ ...c, nationality: code || undefined }))}
                            />
                            <span className="me-flag-code">{team.staff.assistantCoach.nationality || ''}</span>
                          </td>
                          <td className="me-td-name">
                            <div className="me-player-cell">
                              <span className="me-coach-icon">📋</span>
                              <input
                                className="me-name-input"
                                value={team.staff.assistantCoach.name}
                                onChange={e => { const v = e.target.value; updateStaff(team.id, 'assistantCoach', c => ({ ...c, name: v })); }}
                              />
                            </div>
                          </td>
                          <td className="me-td-role">
                            <div className="me-spec-tags">
                              {COACH_SPECIALTIES.map(s => {
                                const specs = team.staff.assistantCoach!.specialty || [];
                                const isActive = specs.includes(s);
                                return (
                                  <button key={s} className={`me-spec-tag ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                      const next = isActive ? specs.filter(x => x !== s) : [...specs, s];
                                      updateStaff(team.id, 'assistantCoach', c => ({ ...c, specialty: next.length ? next : [s] }));
                                    }}>{s.slice(0, 3).toUpperCase()}</button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="me-td-age">
                            <input className="me-age-input" type="text" inputMode="numeric"
                              value={team.staff.assistantCoach.rating}
                              onChange={e => { const raw = e.target.value.replace(/\D/g, ''); if (raw === '') return; updateStaff(team.id, 'assistantCoach', c => ({ ...c, rating: parseInt(raw) })); }}
                              onBlur={() => updateStaff(team.id, 'assistantCoach', c => ({ ...c, rating: Math.max(1, Math.min(99, c.rating)) }))}
                            />
                          </td>
                          <td className="me-td-ovr">
                            {(() => { const grade = toLetterGrade(team.staff.assistantCoach!.rating); return <span className="me-coach-grade" style={{ color: GRADE_COLORS[grade[0]] || '#888' }}>{grade}</span>; })()}
                            <button className="me-coach-remove-btn" onClick={() => removeStaff(team.id, 'assistantCoach')} title="Remove">✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr className="me-coach-row">
                          <td colSpan={6} className="me-coach-empty-cell">
                            <button className="btn btn-sm" onClick={() => addStaff(team.id, 'assistantCoach')}>+ Add Assistant</button>
                          </td>
                        </tr>
                      )}

                      {/* analyst row */}
                      <tr className="me-coach-divider-row"><td colSpan={6}><div className="me-coach-divider-line"><span>Analyst</span></div></td></tr>
                      {team.staff.analyst ? (
                        <tr className="me-coach-row">
                          <td className="me-td-flag">
                            <FlagPicker
                              value={team.staff.analyst.nationality || ''}
                              onChange={code => updateStaff(team.id, 'analyst', c => ({ ...c, nationality: code || undefined }))}
                            />
                            <span className="me-flag-code">{team.staff.analyst.nationality || ''}</span>
                          </td>
                          <td className="me-td-name">
                            <div className="me-player-cell">
                              <span className="me-coach-icon">📊</span>
                              <input
                                className="me-name-input"
                                value={team.staff.analyst.name}
                                onChange={e => { const v = e.target.value; updateStaff(team.id, 'analyst', c => ({ ...c, name: v })); }}
                              />
                            </div>
                          </td>
                          <td className="me-td-role">
                            <div className="me-spec-tags">
                              {COACH_SPECIALTIES.map(s => {
                                const specs = team.staff.analyst!.specialty || [];
                                const isActive = specs.includes(s);
                                return (
                                  <button key={s} className={`me-spec-tag ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                      const next = isActive ? specs.filter(x => x !== s) : [...specs, s];
                                      updateStaff(team.id, 'analyst', c => ({ ...c, specialty: next.length ? next : [s] }));
                                    }}>{s.slice(0, 3).toUpperCase()}</button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="me-td-age">
                            <input className="me-age-input" type="text" inputMode="numeric"
                              value={team.staff.analyst.rating}
                              onChange={e => { const raw = e.target.value.replace(/\D/g, ''); if (raw === '') return; updateStaff(team.id, 'analyst', c => ({ ...c, rating: parseInt(raw) })); }}
                              onBlur={() => updateStaff(team.id, 'analyst', c => ({ ...c, rating: Math.max(1, Math.min(99, c.rating)) }))}
                            />
                          </td>
                          <td className="me-td-ovr">
                            {(() => { const grade = toLetterGrade(team.staff.analyst!.rating); return <span className="me-coach-grade" style={{ color: GRADE_COLORS[grade[0]] || '#888' }}>{grade}</span>; })()}
                            <button className="me-coach-remove-btn" onClick={() => removeStaff(team.id, 'analyst')} title="Remove">✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr className="me-coach-row">
                          <td colSpan={6} className="me-coach-empty-cell">
                            <button className="btn btn-sm" onClick={() => addStaff(team.id, 'analyst')}>+ Add Analyst</button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Free Agents section */}
      {activeRegion === 'fa' && (
        <div className="me-fa-section">
          <div className="me-team-section expanded">
            <div className="me-team-body">
              <div className="me-team-batch">
                <span className="me-batch-label">Set all to:</span>
                <div className="flag-picker" ref={batchRef}>
                  <button className="flag-picker-btn batch-flag-btn" onClick={() => {
                    setBatchOpen(!batchOpen); setBatchSearch(''); setTimeout(() => batchSearchRef.current?.focus(), 0);
                  }}>
                    {batchNat ? <><FlagImg code={batchNat} size={18} /> <span>{batchNat}</span></> : <span>Pick flag...</span>}
                  </button>
                  {batchOpen && (() => {
                    const bq = batchSearch.toLowerCase();
                    const bCommon = bq ? COMMON_COUNTRIES.filter(c => c.name.toLowerCase().includes(bq) || c.code.toLowerCase().includes(bq)) : COMMON_COUNTRIES;
                    const bOther = bq ? OTHER_COUNTRIES.filter(c => c.name.toLowerCase().includes(bq) || c.code.toLowerCase().includes(bq)) : OTHER_COUNTRIES;
                    return (
                      <div className="flag-picker-dropdown batch-dropdown">
                        <div className="flag-picker-search-row">
                          <input
                            ref={batchSearchRef}
                            className="flag-picker-search"
                            type="text"
                            placeholder="Search country..."
                            value={batchSearch}
                            onChange={e => setBatchSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        {bCommon.map(c => (
                          <button
                            key={c.code}
                            className={`flag-picker-item ${c.code === batchNat ? 'active' : ''}`}
                            onClick={() => { setBatchNat(c.code); setBatchOpen(false); }}
                            title={c.name}
                          >
                            <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
                            <span className="flag-picker-label">{c.code}</span>
                          </button>
                        ))}
                        {bCommon.length > 0 && bOther.length > 0 && !bq && <div className="flag-picker-divider" />}
                        {bOther.map(c => (
                          <button
                            key={c.code}
                            className={`flag-picker-item ${c.code === batchNat ? 'active' : ''}`}
                            onClick={() => { setBatchNat(c.code); setBatchOpen(false); }}
                            title={c.name}
                          >
                            <img src={flagSrc(c.code)} alt={c.code} className="flag-picker-flag" />
                            <span className="flag-picker-label">{c.code}</span>
                          </button>
                        ))}
                        {bCommon.length === 0 && bOther.length === 0 && (
                          <div className="flag-picker-empty">No matches</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <button
                  className="btn btn-sm"
                  disabled={!batchNat}
                  onClick={() => { setAllFANationality(batchNat); setBatchNat(''); }}
                >
                  Apply
                </button>
              </div>

              <table className="me-player-table">
                <thead>
                  <tr>
                    <th className="me-th-flag">Flag</th>
                    <th className="me-th-name">Player</th>
                    <th className="me-th-role">Role</th>
                    <th className="me-th-gun">Gun</th>
                    <th className="me-th-age">Age</th>
                    <th className="me-th-ovr">OVR</th>
                  </tr>
                </thead>
                <tbody>
                  {freeAgents.map(player => (
                    <tr key={player.id}>
                      <td className="me-td-flag">
                        <FlagPicker
                          value={player.nationality || ''}
                          onChange={code => updateFA(player.id, p => { p.nationality = code || undefined; })}
                        />
                        <span className="me-flag-code">{player.nationality || ''}</span>
                      </td>
                      <td className="me-td-name">
                        <div className="me-player-cell">
                          <PlayerAvatar playerId={player.id} playerName={player.name} imageUrl={player.imageUrl} size="sm" />
                          <input
                            className="me-name-input"
                            value={player.name}
                            onChange={e => updateFA(player.id, p => { p.name = e.target.value; })}
                          />
                        </div>
                      </td>
                      <td className="me-td-role">
                        <select
                          className="me-role-select"
                          value={player.role}
                          onChange={e => updateFA(player.id, p => { p.role = e.target.value as Role; })}
                        >
                          {ROLE_OPTIONS.map(r => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="me-td-gun">
                        <select
                          className="me-gun-select"
                          value={player.gunPref || ''}
                          onChange={e => updateFA(player.id, p => { p.gunPref = e.target.value || undefined; })}
                        >
                          <option value="">—</option>
                          {GUN_PREF_OPTIONS.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      <td className="me-td-age">
                        <input
                          className="me-age-input"
                          type="number"
                          min={16} max={40}
                          value={player.age}
                          onChange={e => updateFA(player.id, p => { p.age = parseInt(e.target.value) || player.age; })}
                        />
                      </td>
                      <td className="me-td-ovr">
                        <span className="me-ovr">{player.overall}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
