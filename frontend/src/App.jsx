import { useState, useMemo } from 'react';
import { useAgentState } from './hooks/useAgentState';
import Ticker from './components/Ticker';
import CrisisMap from './components/CrisisMap';
import Dashboard from './components/Dashboard';
import AlertsTab from './components/AlertsTab';
import TrendsTab from './components/TrendsTab';
import StrategyTab from './components/StrategyTab';
import LogsTab from './components/LogsTab';
import { useDispatch } from './useDispatch';
import { DEMO_ZONES } from './DispatchEngine';

const TABS = [
  { id:'overview',  label:'Overview',  icon:'◈' },
  { id:'alerts',    label:'Alerts',    icon:'⚠' },
  { id:'trends',    label:'Trends',    icon:'◉' },
  { id:'strategy',  label:'Strategy',  icon:'⬡' },
  { id:'logs',      label:'Logs',      icon:'▣' },
];

const HI = { Hurricane:'⛈', Earthquake:'🌋', Flood:'🌊', Wildfire:'🔥', 'Disease Outbreak':'☣', Landslide:'⛰', Conflict:'⚡' };
const TC = { CRITICAL:'#ff3a5c', HIGH:'#ff8c00', MODERATE:'#f0c040', LOW:'#00ff9d' };
const VI = { helicopter:'🚁', ambulance:'🚑', fire_truck:'🚒', rescue_team:'🚐', coast_guard:'🚢', military:'🪖', drone:'🛸' };

function applyOverride(zone, delta) {
  if (!delta) return zone;
  const s = Math.min(10, Math.max(0, (zone.severity_level||0)+delta));
  return { ...zone, severity_level:s, threat_label:s>8?'CRITICAL':s>6?'HIGH':s>3?'MODERATE':'LOW', priority:s/10, _simDelta:delta };
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&family=Inter:wght@300;400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{height:100%;background:#03060e;font-family:'Inter',sans-serif;overflow:hidden}
  ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(0,180,255,0.2);border-radius:3px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes breathe{0%,100%{opacity:.3}50%{opacity:1}}
  @keyframes sim-flash{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes glow-line{0%,100%{opacity:.4}50%{opacity:1}}
`;

const glass = (extra={}) => ({
  background:'rgba(8,16,40,0.6)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
  border:'1px solid rgba(0,180,255,0.13)', borderRadius:'14px',
  boxShadow:'0 4px 32px rgba(0,0,0,0.5),inset 0 1px 0 rgba(0,180,255,0.07)', ...extra,
});

export default function App() {
  const { state, loading, error, lastUpdated, refresh } = useAgentState();
  const [selectedZone,  setSelectedZone]  = useState(null);
  const [activeTab,     setActiveTab]     = useState('overview');
  const [zoneOverrides, setZoneOverrides] = useState({});

  // Backend data
  const backendZones  = state?.zones       ?? [];
  const resources     = state?.resources   ?? {};
  const shelters      = state?.shelters    ?? [];
  const forecast      = Array.isArray(state?.forecast)?state.forecast:[];
  const strategy      = state?.strategy    ?? '';
  const citizenPings  = state?.citizen_pings ?? [];
  const cycle         = state?.cycle       ?? 0;
  const simParams     = state?.simulation_params ?? {};

  // ALWAYS use DEMO_ZONES (Chennai) for lat/lng — overlay live severity from backend if zone_id matches
  const rawZones = useMemo(() => {
    const byId = {};
    backendZones.forEach(z => { byId[z.zone_id] = z; });
    return DEMO_ZONES.map(demo => {
      const live = byId[demo.zone_id];
      if (!live) return demo;
      return {
        ...demo,  // lat, lng, name, hazard_type always from demo (Chennai)
        severity_level:    live.severity_level    ?? demo.severity_level,
        threat_label:      live.threat_label      ?? demo.threat_label,
        priority:          live.priority          ?? demo.priority,
        confidence:        live.confidence        ?? demo.confidence,
        population_at_risk:live.population_at_risk?? demo.population_at_risk,
        verified:          live.verified          ?? demo.verified,
      };
    });
  }, [backendZones]);

  const zones = useMemo(() =>
    rawZones.map(z => applyOverride(z, zoneOverrides[z.zone_id]||0)),
    [rawZones, zoneOverrides]
  );

  const { dispatches, dispatchesRef, logEntries, sendDispatch, sendRescue } = useDispatch({
    zones, zoneOverrides, setZoneOverrides,
  });

  // Build alerts purely from Chennai zones — no backend alert data to avoid NYC names
  const effectiveAlerts = useMemo(() => {
    return zones
      .filter(z =>
        (z.threat_label==='CRITICAL'||z.threat_label==='HIGH') &&
        (z.priority||0)>=0.45 && (z.confidence||0)>=55
      )
      .sort((a,b)=>(b.severity_level||0)-(a.severity_level||0))
      .map(z => ({
        alert_id:          `alert-${z.zone_id}`,
        zone:              z.name,
        hazard:            z.hazard_type,
        urgency_level:     z.threat_label,
        confidence_level:  z.confidence||70,
        population:        z.population_at_risk||0,
        recommended_action:`${z.hazard_type} event — ${z.threat_label} severity. Deploy ${z.threat_label==='CRITICAL'?'immediate':'priority'} response.`,
        resources_dispatched:[],
        timestamp:         new Date().toISOString(),
        threat_color:      TC[z.threat_label],
      }));
  }, [zones]);

  // Derived stats
  const simActive        = Object.values(zoneOverrides).some(d=>d!==0);
  const globalRisk       = zones.length ? zones.reduce((a,z)=>a+(z.priority||0),0)/zones.length : 0;
  const riskColor        = globalRisk>0.75?'#ff3a5c':globalRisk>0.5?'#ff8c00':'#00ff9d';
  const critCount        = zones.filter(z=>z.threat_label==='CRITICAL').length;
  const totalPop         = zones.reduce((s,z)=>s+(z.population_at_risk||0),0);
  const totalResLeft     = Object.values(resources).reduce((s,r)=>s+(r?.available||0),0);
  const activeDispatches = dispatches.filter(d=>d.status!=='returned').length;
  const aiDispatches     = dispatches.filter(d=>d.isAutoDispatch&&d.status!=='returned').length;

  if (loading&&!state) return (
    <><style>{css}</style>
    <div style={{height:'100vh',width:'100vw',display:'flex',alignItems:'center',justifyContent:'center',background:'#03060e',flexDirection:'column',gap:'20px'}}>
      <div style={{width:'40px',height:'40px',border:'2px solid rgba(0,180,255,0.1)',borderTopColor:'#00d4ff',borderRadius:'50%',animation:'spin 0.9s linear infinite'}}/>
      <span style={{fontFamily:'IBM Plex Mono',fontSize:'10px',letterSpacing:'0.2em',color:'#1a3a5a'}}>AGENT INITIALIZING</span>
    </div></>
  );

  if (error&&!state) return (
    <><style>{css}</style>
    <div style={{height:'100vh',width:'100vw',display:'flex',alignItems:'center',justifyContent:'center',background:'#03060e',flexDirection:'column',gap:'14px'}}>
      <span style={{fontSize:'28px'}}>⚠</span>
      <span style={{fontFamily:'IBM Plex Mono',fontSize:'11px',letterSpacing:'0.15em',color:'#ff3a5c'}}>BACKEND CONNECTION FAILED</span>
      <button onClick={refresh} style={{marginTop:'8px',background:'rgba(0,180,255,0.07)',border:'1px solid rgba(0,180,255,0.25)',borderRadius:'8px',padding:'8px 22px',color:'#00d4ff',cursor:'pointer',fontFamily:'IBM Plex Mono',fontSize:'10px'}}>↺ RETRY</button>
    </div></>
  );

  return (
    <><style>{css}</style>
    <div style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none',background:'radial-gradient(ellipse 80% 50% at 50% 0%,rgba(0,80,200,0.14) 0%,transparent 65%),radial-gradient(ellipse 50% 40% at 85% 85%,rgba(0,30,100,0.2) 0%,transparent 55%),#03060e'}}/>

    <div style={{position:'relative',zIndex:1,height:'100vh',width:'100vw',display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* TOP BAR */}
      <header style={{height:'52px',flexShrink:0,display:'flex',alignItems:'center',gap:'16px',padding:'0 20px',background:'rgba(3,6,18,0.9)',backdropFilter:'blur(24px)',borderBottom:'1px solid rgba(0,180,255,0.1)',zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <div style={{width:'32px',height:'32px',borderRadius:'8px',background:'linear-gradient(135deg,rgba(239,68,68,0.7),rgba(153,27,27,0.9))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',boxShadow:'0 0 20px rgba(239,68,68,0.3)',flexShrink:0}}>☢</div>
          <div>
            <div style={{fontFamily:'IBM Plex Mono',fontWeight:700,fontSize:'12px',color:'#e2eaf4',letterSpacing:'0.12em'}}>CRISIZ <span style={{color:'#00d4ff'}}>·</span> CRISIS OPS</div>
            <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',color:'#1a3555',letterSpacing:'0.14em'}}>VIT CHENNAI · TAMIL NADU DISASTER RESPONSE</div>
          </div>
        </div>

        <div style={{width:'1px',height:'26px',background:'rgba(0,180,255,0.1)'}}/>

        {[
          {label:'CYCLE',       value:String(cycle).padStart(3,'0'), color:'#00d4ff'},
          {label:'CRITICAL',    value:critCount,                     color:critCount>0?'#ff3a5c':'#2a4a6a'},
          {label:'POP AT RISK', value:`${((totalPop||0)/1000).toFixed(0)}K`, color:'#ff8c00'},
          {label:'DISPATCHED',  value:activeDispatches,              color:activeDispatches>0?'#f97316':'#2a4a6a'},
          {label:'AI UNITS',    value:aiDispatches,                  color:aiDispatches>0?'#a78bfa':'#2a4a6a'},
        ].map(({label,value,color})=>(
          <div key={label} style={{display:'flex',flexDirection:'column',gap:'1px'}}>
            <span style={{fontFamily:'IBM Plex Mono',fontSize:'7px',color:'#1a3555',letterSpacing:'0.14em'}}>{label}</span>
            <span style={{fontFamily:'IBM Plex Mono',fontWeight:700,fontSize:'14px',color,lineHeight:1}}>{value}</span>
          </div>
        ))}

        {simActive&&(
          <div style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(255,140,0,0.1)',border:'1px solid rgba(255,140,0,0.3)',borderRadius:'8px',padding:'4px 12px'}}>
            <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#ff8c00',animation:'sim-flash 1s infinite'}}/>
            <span style={{fontFamily:'IBM Plex Mono',fontSize:'8px',color:'#ff8c00',letterSpacing:'0.12em'}}>SIMULATION ACTIVE</span>
            <button onClick={()=>setZoneOverrides({})} style={{marginLeft:'6px',background:'rgba(255,58,92,0.1)',border:'1px solid rgba(255,58,92,0.3)',borderRadius:'5px',padding:'2px 8px',color:'#ff3a5c',fontSize:'8px',fontFamily:'IBM Plex Mono',cursor:'pointer'}}>✕ RESET</button>
          </div>
        )}

        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontFamily:'IBM Plex Mono',fontSize:'7px',color:'#1a3555',letterSpacing:'0.14em'}}>GLOBAL RISK</span>
          <div style={{width:'80px',height:'4px',background:'rgba(0,180,255,0.1)',borderRadius:'2px'}}>
            <div style={{height:'4px',borderRadius:'2px',background:riskColor,width:`${globalRisk*100}%`,transition:'width 0.5s'}}/>
          </div>
          <span style={{fontFamily:'IBM Plex Mono',fontWeight:700,fontSize:'12px',color:riskColor}}>{Math.round(globalRisk*100)}%</span>
          <div style={{width:'1px',height:'26px',background:'rgba(0,180,255,0.1)'}}/>
          {lastUpdated&&<span style={{fontFamily:'IBM Plex Mono',fontSize:'7px',color:'#1a3555'}}>{new Date(lastUpdated).toLocaleTimeString()}</span>}
          <button onClick={refresh} style={{background:'rgba(0,180,255,0.07)',border:'1px solid rgba(0,180,255,0.15)',borderRadius:'7px',padding:'5px 12px',color:'#00d4ff',fontFamily:'IBM Plex Mono',fontSize:'8px',cursor:'pointer',letterSpacing:'0.1em'}}>↺ SYNC</button>
        </div>
      </header>

      <Ticker zones={zones}/>

      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

        {/* SIDEBAR */}
        <aside style={{width:'260px',flexShrink:0,background:'rgba(3,6,18,0.85)',backdropFilter:'blur(18px)',borderRight:'1px solid rgba(0,180,255,0.09)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{fontFamily:'IBM Plex Mono',fontSize:'7.5px',letterSpacing:'0.16em',color:'#1a3a54',padding:'8px 14px 6px',borderBottom:'1px solid rgba(0,180,255,0.07)',display:'flex',alignItems:'center',gap:'7px'}}>
            <span style={{width:'4px',height:'4px',borderRadius:'50%',background:'#38bdf8',display:'inline-block'}}/>SITUATION REPORT
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1px',background:'rgba(0,180,255,0.05)',flexShrink:0}}>
            {[
              {l:'CRITICAL',  v:critCount,        crit:critCount>0},
              {l:'POP AT RISK',v:`${((totalPop||0)/1000).toFixed(0)}K`},
              {l:'RESOURCES', v:totalResLeft,     warn:totalResLeft<20},
              {l:'UNITS OUT', v:activeDispatches, warn:activeDispatches>0},
            ].map(({l,v,crit,warn})=>(
              <div key={l} style={{padding:'10px 12px',background:'rgba(12,24,40,0.6)'}}>
                <div style={{fontFamily:'IBM Plex Mono',fontWeight:800,fontSize:'22px',color:crit?'#ff3a5c':warn?'#ff8c00':'#38bdf8',lineHeight:1,animation:crit?'blink 1.5s infinite':'none'}}>{v}</div>
                <div style={{fontSize:'7px',color:'#2a4060',letterSpacing:'0.14em',marginTop:'4px',textTransform:'uppercase'}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{fontFamily:'IBM Plex Mono',fontSize:'7.5px',color:'#1e3550',letterSpacing:'0.16em',padding:'8px 14px 6px',borderBottom:'1px solid rgba(0,180,255,0.08)',display:'flex',alignItems:'center',gap:'7px'}}>
            <span style={{width:'4px',height:'4px',borderRadius:'50%',background:'#f97316',display:'inline-block'}}/>PRIORITY ZONES
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {zones.map(z=>{
              const tc=TC[z.threat_label]||'#22c55e';
              const sel=selectedZone?.zone_id===z.zone_id;
              const delta=zoneOverrides[z.zone_id]||0;
              const zd=dispatches.filter(d=>d.zoneId===z.zone_id&&d.status!=='returned');
              return (
                <div key={z.zone_id} onClick={()=>setSelectedZone(z)} style={{padding:'9px 14px',borderBottom:'1px solid rgba(56,120,200,0.07)',cursor:'pointer',background:sel?'rgba(56,189,248,0.06)':'transparent',borderLeft:sel?`2px solid ${tc}`:'2px solid transparent',transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'10px',color:'#8eacc8'}}>
                    <span>{HI[z.hazard_type]||'◉'}</span>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{z.name}</span>
                    {zd.length>0&&<span style={{fontSize:'11px'}}>{zd.map(d=>VI[d.vehicleKey]||'🚗').join('')}</span>}
                    {delta!==0&&<span style={{fontSize:'7px',color:delta>0?'#ff8c00':'#00ff9d',background:delta>0?'rgba(255,140,0,0.1)':'rgba(0,255,157,0.1)',padding:'1px 5px',borderRadius:'3px',border:`1px solid ${delta>0?'rgba(255,140,0,0.3)':'rgba(0,255,157,0.3)'}`,flexShrink:0}}>{delta>0?'+':''}{delta.toFixed(1)}</span>}
                    <span style={{fontSize:'7px',fontWeight:600,padding:'1px 5px',borderRadius:'3px',color:tc,background:`${tc}18`,border:`1px solid ${tc}35`,flexShrink:0}}>{z.threat_label}</span>
                  </div>
                  <div style={{display:'flex',gap:'10px',fontSize:'8px',color:'#2a4060',marginTop:'4px'}}>
                    <span>SEV {(z.severity_level||0).toFixed(1)}</span><span>CONF {z.confidence}%</span><span>{((z.population_at_risk||0)/1000).toFixed(1)}K</span>
                  </div>
                  <div style={{height:'2px',background:'rgba(0,180,255,0.08)',borderRadius:'1px',marginTop:'6px'}}>
                    <div style={{height:'100%',width:`${Math.min(100,(z.priority||0)*100)}%`,background:tc,borderRadius:'1px',transition:'width 0.5s'}}/>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{borderTop:'1px solid rgba(0,180,255,0.08)',padding:'10px 14px',flexShrink:0}}>
            <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'#1a3a54',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'4px',height:'4px',borderRadius:'50%',background:'#00d4ff',display:'inline-block'}}/>RESOURCE POOL
            </div>
            {Object.entries(resources).map(([k,r])=>{
              const pct=(r?.available||0)/(r?.total||1);
              const col=pct<0.25?'#ff3a5c':pct<0.5?'#ff8c00':'#00ff9d';
              return (
                <div key={k} style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                  <span style={{fontFamily:'IBM Plex Mono',fontSize:'7px',color:'#1e3a58',width:'80px',textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{k.replace(/_/g,' ')}</span>
                  <div style={{flex:1,height:'3px',background:'rgba(0,180,255,0.08)',borderRadius:'2px'}}>
                    <div style={{height:'100%',width:`${pct*100}%`,background:col,borderRadius:'2px',transition:'width 0.5s'}}/>
                  </div>
                  <span style={{fontFamily:'IBM Plex Mono',fontSize:'9px',color:col,fontWeight:700,width:'28px',textAlign:'right'}}>{r?.available}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAIN */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          <div style={{height:'40px',flexShrink:0,display:'flex',alignItems:'center',gap:'2px',padding:'0 16px',background:'rgba(3,6,18,0.7)',backdropFilter:'blur(14px)',borderBottom:'1px solid rgba(0,180,255,0.07)'}}>
            {TABS.map(t=>{
              const isActive=activeTab===t.id;
              const badge=t.id==='alerts'?effectiveAlerts.length:t.id==='logs'?Math.min(logEntries.length,99):null;
              return (
                <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{display:'flex',alignItems:'center',gap:'5px',padding:'5px 14px',background:isActive?'rgba(0,180,255,0.1)':'transparent',border:'none',borderRadius:'7px',color:isActive?'#00d4ff':'#243a56',fontFamily:'Inter',fontSize:'12px',fontWeight:500,cursor:'pointer',transition:'all 0.15s',boxShadow:isActive?'0 0 0 1px rgba(0,180,255,0.2)':'none',outline:'none',position:'relative'}}>
                  <span style={{fontSize:'11px',opacity:isActive?1:0.4}}>{t.icon}</span>
                  {t.label}
                  {badge>0&&<span style={{position:'absolute',top:'2px',right:'4px',background:t.id==='alerts'?'#ff3a5c':'rgba(0,180,255,0.4)',borderRadius:'8px',padding:'0 4px',fontSize:'7px',fontFamily:'IBM Plex Mono',color:'white',minWidth:'14px',textAlign:'center',lineHeight:'14px'}}>{badge}</span>}
                </button>
              );
            })}
          </div>

          <div style={{flex:1,overflow:'auto',padding:'14px',minHeight:0,background:'rgba(3,6,18,0.3)'}}>

            {activeTab==='overview'&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:'14px',height:'100%',minHeight:0}}>
                <div style={{...glass(),display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden',padding:0}}>
                  <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(0,180,255,0.09)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                      <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#00d4ff',boxShadow:'0 0 6px #00d4ff',animation:'breathe 2s infinite'}}/>
                      <span style={{fontFamily:'IBM Plex Mono',fontSize:'9px',color:'#1a4060',letterSpacing:'0.16em'}}>LIVE SITUATION MAP — TAMIL NADU</span>
                    </div>
                    <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                      {activeDispatches>0&&<span style={{fontFamily:'IBM Plex Mono',fontSize:'8px',color:'#f97316',background:'rgba(249,115,22,0.1)',padding:'2px 10px',borderRadius:'5px',border:'1px solid rgba(249,115,22,0.25)',animation:'sim-flash 2s infinite'}}>{activeDispatches} UNIT{activeDispatches>1?'S':''} DEPLOYED{aiDispatches>0?` · ${aiDispatches} AI 🤖`:''}</span>}
                      {simActive&&<span style={{fontFamily:'IBM Plex Mono',fontSize:'8px',color:'#ff8c00',background:'rgba(255,140,0,0.1)',padding:'2px 10px',borderRadius:'5px',border:'1px solid rgba(255,140,0,0.2)',animation:'sim-flash 1.5s infinite'}}>⚡ SIMULATION</span>}
                    </div>
                  </div>
                  <div style={{flex:1,minHeight:0}}>
                    <CrisisMap
                      zones={zones} shelters={shelters} citizenPings={citizenPings}
                      selectedZone={selectedZone} onZoneClick={setSelectedZone}
                      zoneOverrides={zoneOverrides}
                      onZoneOverride={(id,delta)=>setZoneOverrides(prev=>({...prev,[id]:Math.min(5,Math.max(-5,(prev[id]||0)+delta))}))}
                      onZoneOverrideReset={id=>setZoneOverrides(prev=>{const c={...prev};delete c[id];return c;})}
                      dispatchesRef={dispatchesRef}
                      onRescue={sendRescue}
                    />
                  </div>
                </div>

                <div style={{display:'flex',flexDirection:'column',gap:'12px',overflow:'auto',maxHeight:'100%'}}>
                  <div style={{...glass({padding:'14px'})}}>
                    <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'#1a4060',marginBottom:'12px'}}>SYSTEM STATUS</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                      {[
                        {label:'ZONES',     value:zones.length,           color:'#00d4ff'},
                        {label:'SHELTERS',  value:shelters.length,        color:'#00ff9d'},
                        {label:'ALERTS',    value:effectiveAlerts.length, color:effectiveAlerts.length>0?'#ff3a5c':'#00d4ff'},
                        {label:'AI UNITS',  value:aiDispatches,           color:aiDispatches>0?'#a78bfa':'#2a4a6a'},
                      ].map(({label,value,color})=>(
                        <div key={label} style={{padding:'10px 12px',background:'rgba(0,180,255,0.04)',border:'1px solid rgba(0,180,255,0.1)',borderRadius:'10px'}}>
                          <div style={{fontFamily:'IBM Plex Mono',fontSize:'7px',color:'#1e3a58',letterSpacing:'0.14em',marginBottom:'4px'}}>{label}</div>
                          <div style={{fontFamily:'IBM Plex Mono',fontWeight:700,fontSize:'22px',color,lineHeight:1}}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{...glass({padding:'14px'}),overflow:'visible'}}>
                    <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'#1a4060',marginBottom:'12px'}}>ZONE DASHBOARD</div>
                    <Dashboard zones={zones} shelters={shelters} resources={resources} alerts={effectiveAlerts}/>
                  </div>
                </div>
              </div>
            )}

            {activeTab==='alerts'&&(
              <div style={{...glass({padding:'16px'})}}>
                <AlertsTab alerts={effectiveAlerts} zones={zones} dispatches={dispatches} onDispatch={sendDispatch}/>
              </div>
            )}

            {activeTab==='trends'&&(
              <div style={{...glass({padding:'16px'})}}>
                <TrendsTab forecast={forecast} simParams={simParams} zones={zones} zoneOverrides={zoneOverrides} onSimUpdate={()=>setTimeout(refresh,2000)}/>
              </div>
            )}

            {activeTab==='strategy'&&(
              <div style={{...glass({padding:'16px'})}}>
                <StrategyTab strategy={strategy} cycle={cycle} zones={zones} zoneOverrides={zoneOverrides}/>
              </div>
            )}

            {activeTab==='logs'&&(
              <div style={{...glass({padding:'16px'}),height:'100%',display:'flex',flexDirection:'column'}}>
                <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'#1a4060',marginBottom:'14px',flexShrink:0}}>DECISION LOG</div>
                <LogsTab logEntries={logEntries}/>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
    </>
  );
}
