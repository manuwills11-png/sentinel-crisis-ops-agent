import { useState, useCallback } from 'react';
import './index.css';
import { useAgentState } from './hooks/useAgentState';
import { useDispatch } from './components/useDispatch';
import { DEMO_ZONES } from './components/DispatchEngine';
import Ticker from './components/Ticker';
import Sidebar from './components/Sidebar';
import CrisisMap from './components/CrisisMap';
import Dashboard from './components/Dashboard';
import AlertsTab from './components/AlertsTab';
import TrendsTab from './components/TrendsTab';
import StrategyTab from './components/StrategyTab';
import LogsTab from './components/LogsTab';

const TABS = [
  { id: 'map',       label: '⬡ MAP'       },
  { id: 'alerts',    label: '⚠ ALERTS'    },
  { id: 'dashboard', label: '◈ DASHBOARD' },
  { id: 'trends',    label: '◉ TRENDS'    },
  { id: 'strategy',  label: '⬡ STRATEGY'  },
  { id: 'logs',      label: '▣ LOGS'      },
];

export default function App() {
  const { state, loading, error, lastUpdated, refresh } = useAgentState();
  const [selectedZone,  setSelectedZone]  = useState(null);
  const [activeTab,     setActiveTab]     = useState('map');
  const [zoneOverrides, setZoneOverrides] = useState({});

  /* ── Raw backend data with DEMO_ZONES fallback ── */
  const rawZones  = state?.zones ?? [];
  const zones     = rawZones.length > 0 ? rawZones : DEMO_ZONES;
  const alerts    = state?.alerts    ?? [];
  const resources = state?.resources ?? {};
  const shelters  = state?.shelters  ?? [];
  const forecast  = Array.isArray(state?.forecast) ? state.forecast : [];
  const strategy  = state?.strategy     ?? '';
  const logs      = state?.decision_log ?? [];
  const cycle     = state?.cycle        ?? 0;
  const simParams = state?.simulation_params ?? {};

  /* ── Merge severity overrides — single source of truth for all tabs ── */
  const zonesWithOverrides = zones.map(z => {
    const delta = zoneOverrides[z.zone_id];
    if (!delta) return z;
    const newSev    = Math.max(0, Math.min(10, (z.severity_level || 0) + delta));
    const newThreat = newSev > 8 ? 'CRITICAL' : newSev > 6 ? 'HIGH' : newSev > 3 ? 'MODERATE' : 'LOW';
    return { ...z, severity_level: newSev, threat_label: newThreat, priority: Math.min(1, newSev / 10), _simDelta: delta };
  });

  /* ── Dispatch (NO API key — pure local logic + timers) ── */
  const { dispatches, dispatchesRef, logEntries, sendDispatch, sendRescue } = useDispatch({
    zones: zonesWithOverrides, zoneOverrides, setZoneOverrides,
  });

  /* ── Merge dispatch + agent logs ── */
  const allLogs = [
    ...logEntries,
    ...logs.map(l => ({
      id: `agent-${l.timestamp || Math.random()}`, type: 'SYSTEM',
      ts: l.timestamp, text: l.decision || l.text || JSON.stringify(l), data: l,
    })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 300);

  /* ── Handlers ── */
  const handleZoneOverride = useCallback((zoneId, delta) => {
    setZoneOverrides(prev => ({
      ...prev,
      [zoneId]: Math.max(-5, Math.min(5, (prev[zoneId] || 0) + delta)),
    }));
  }, []);

  const handleZoneOverrideReset = useCallback((zoneId) => {
    setZoneOverrides(prev => { const n = { ...prev }; delete n[zoneId]; return n; });
  }, []);

  const handleZoneSelect = useCallback((zone) => {
    setSelectedZone(zone);
    setActiveTab('map');
  }, []);

  const handleStratRegen = useCallback(() => {
    setActiveTab('strategy');
    setTimeout(refresh, 4000);
  }, [refresh]);

  /* ── Global risk ── */
  const globalRisk = zonesWithOverrides.length > 0
    ? zonesWithOverrides.reduce((a, z) => a + (z.priority || 0), 0) / zonesWithOverrides.length
    : 0;
  const riskColor = globalRisk > 0.75 ? '#ef4444' : globalRisk > 0.5 ? '#f97316' : '#22c55e';

  /* ── Loading screen ── */
  if (loading && !state) return (
    <div style={{ height:'100vh', width:'100vw', display:'flex', alignItems:'center', justifyContent:'center', background:'#060b14', flexDirection:'column', gap:'16px' }}>
      <div style={{ width:'36px', height:'36px', border:'2px solid rgba(56,189,248,0.15)', borderTopColor:'#38bdf8', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:'10px', letterSpacing:'0.16em', color:'#2a4060' }}>AGENT INITIALIZING...</div>
    </div>
  );

  return (
    <div style={{ height:'100vh', width:'100vw', display:'flex', flexDirection:'column', overflow:'hidden', background:'#060b14' }}>

      {/* ══════════════════════════════
          HEADER
      ══════════════════════════════ */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', height:'54px', flexShrink:0,
        background:'rgba(3,7,18,0.98)',
        borderBottom:'1px solid rgba(56,120,200,0.18)',
        boxShadow:'0 2px 24px rgba(0,0,0,0.5)',
      }}>
        {/* Logo + Title */}
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <div style={{
            width:'34px', height:'34px', borderRadius:'8px',
            background:'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'18px', boxShadow:'0 0 20px #2563eb99', flexShrink:0,
          }}>⬡</div>
          <div>
            <div style={{
              fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'16px',
              color:'#f0f4ff', letterSpacing:'0.06em', lineHeight:1,
              textShadow:'0 0 20px rgba(56,189,248,0.3)',
            }}>CRISIS OPERATIONS</div>
            <div style={{
              fontFamily:'IBM Plex Mono,monospace', fontSize:'8px',
              color:'#1e4a6a', letterSpacing:'0.2em', marginTop:'3px',
            }}>VIT CHENNAI · AI DISPATCH COMMAND</div>
          </div>
        </div>

        {/* Centre KPIs */}
        <div style={{ display:'flex', alignItems:'center', gap:'28px' }}>
          {[
            { label:'AGENT CYCLE',  val: String(cycle).padStart(4,'0'), color:'#38bdf8' },
            { label:'GLOBAL RISK',  val: `${Math.round(globalRisk*100)}%`, color:riskColor },
            { label:'ZONES',        val: zonesWithOverrides.length, color:'#c0d4f0' },
            { label:'ALERTS',       val: alerts.length, color: alerts.length > 0 ? '#ef4444' : '#22c55e',
              blink: alerts.length > 0 },
          ].map(({ label, val, color, blink }) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:'7px', color:'#1a3a54', letterSpacing:'0.18em', marginBottom:'2px' }}>{label}</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'20px', color, lineHeight:1, animation: blink ? 'blink 1.8s infinite' : 'none' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {/* Live/Demo badge */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px', fontFamily:'IBM Plex Mono,monospace', fontSize:'8px', color: error ? '#f97316' : '#22c55e' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: error ? '#f97316' : '#22c55e', display:'inline-block', animation:'glow-pulse 2s infinite' }}/>
            {error ? 'DEMO MODE' : 'LIVE'}
          </div>
          <button onClick={handleStratRegen} style={{
            background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.28)',
            borderRadius:'7px', padding:'6px 14px', color:'#38bdf8',
            fontFamily:'IBM Plex Mono,monospace', fontSize:'8px', letterSpacing:'0.1em', cursor:'pointer',
          }}>⬡ REGEN STRATEGY</button>
          <button onClick={refresh} style={{
            background:'rgba(56,189,248,0.05)', border:'1px solid rgba(56,189,248,0.15)',
            borderRadius:'7px', padding:'6px 10px', color:'#2a5070',
            fontFamily:'IBM Plex Mono,monospace', fontSize:'12px', cursor:'pointer',
          }}>↺</button>
        </div>
      </header>

      {/* Risk bar */}
      <div style={{ height:'3px', background:'rgba(56,120,200,0.08)', flexShrink:0 }}>
        <div style={{ height:'100%', width:`${globalRisk*100}%`, background:riskColor, transition:'width 0.6s ease', boxShadow:`0 0 8px ${riskColor}` }} />
      </div>

      {/* Ticker */}
      <Ticker zones={zonesWithOverrides} />

      {/* Main body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar zones={zonesWithOverrides} resources={resources} selectedZone={selectedZone} onZoneSelect={handleZoneSelect} />

        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {/* Tab bar */}
          <div style={{ display:'flex', background:'rgba(6,11,20,0.96)', borderBottom:'1px solid rgba(56,120,200,0.12)', flexShrink:0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding:'9px 16px', fontSize:'9px', letterSpacing:'0.1em',
                cursor:'pointer', background:'transparent', border:'none',
                borderBottom: activeTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeTab === tab.id ? '#38bdf8' : '#2a4060',
                fontFamily:'IBM Plex Mono,monospace', position:'relative', transition:'color 0.2s',
              }}>
                {tab.label}
                {tab.id === 'alerts' && alerts.length > 0 && (
                  <span style={{ position:'absolute', top:'5px', right:'5px', background:'#ef4444', borderRadius:'50%', width:'6px', height:'6px', display:'block', animation:'glow-pulse 2s infinite' }} />
                )}
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', paddingRight:'16px', fontFamily:'IBM Plex Mono,monospace', fontSize:'8px', color:'#1e3550' }}>
              {lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString()}` : error ? '⚠ DEMO MODE' : 'SYNCING...'}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div style={{ flex:1, overflow:'auto', padding:'14px', background:'rgba(6,11,20,0.55)' }}>

            {/* MAP TAB — always mounted so rAF/timers never die on tab switch */}
            <div style={{ display: activeTab === 'map' ? 'flex' : 'none', gap:'14px', height:'calc(100vh - 215px)' }}>
              {/* Map */}
              <div style={{ flex:1, minWidth:0 }}>
                <CrisisMap
                  zones={zonesWithOverrides}
                  selectedZone={selectedZone}
                  zoneOverrides={zoneOverrides}
                  onZoneOverride={handleZoneOverride}
                  onZoneOverrideReset={handleZoneOverrideReset}
                  onZoneClick={setSelectedZone}
                  dispatchesRef={dispatchesRef}
                  onRescue={sendRescue}
                  visible={activeTab === 'map'}
                />
              </div>
              {/* Dashboard panel beside map */}
              <div style={{ width:'300px', flexShrink:0, overflowY:'auto' }}>
                <Dashboard
                  zones={zonesWithOverrides}
                  shelters={shelters}
                  resources={resources}
                  alerts={alerts}
                />
              </div>
            </div>

            {/* All other tabs — receive zonesWithOverrides so severity changes propagate */}
            {activeTab === 'alerts'    && <AlertsTab   alerts={alerts} zones={zonesWithOverrides} dispatches={dispatches} onDispatch={sendDispatch} />}
            {activeTab === 'dashboard' && <Dashboard   zones={zonesWithOverrides} shelters={shelters} resources={resources} alerts={alerts} />}
            {activeTab === 'trends'    && <TrendsTab   forecast={forecast} simParams={simParams} zones={zonesWithOverrides} zoneOverrides={zoneOverrides} onSimUpdate={() => setTimeout(refresh, 2000)} />}
            {activeTab === 'strategy'  && <StrategyTab strategy={strategy} cycle={cycle} zones={zonesWithOverrides} zoneOverrides={zoneOverrides} />}
            {activeTab === 'logs'      && <LogsTab     logEntries={allLogs} />}

          </div>
        </div>
      </div>
    </div>
  );
}
