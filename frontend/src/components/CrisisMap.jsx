import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ref, onValue, remove } from 'firebase/database';
import { db } from '../firebase';
import { HQ, bearingDeg, VEHICLE_TYPES, interpolatePos } from './DispatchEngine';

/* ── CSS ── */
const STYLES = `
@keyframes pulse-ring {
  0%   { transform:translate(-50%,-50%) scale(0.85); opacity:0.7; }
  70%  { transform:translate(-50%,-50%) scale(1.4);  opacity:0;   }
  100% { transform:translate(-50%,-50%) scale(0.85); opacity:0;   }
}
@keyframes sos-pulse {
  0%,100% { box-shadow:0 0 0 0 rgba(255,0,0,0.7); }
  50%      { box-shadow:0 0 0 10px rgba(255,0,0,0);  }
}
@keyframes sim-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
.leaflet-container { background:#060b14 !important; }
.leaflet-popup-content-wrapper { background:#0a1628 !important; border:1px solid rgba(0,180,255,0.25) !important; border-radius:10px !important; box-shadow:0 0 24px rgba(0,0,0,0.8) !important; }
.leaflet-popup-tip { background:#0a1628 !important; }
`;
if (!document.getElementById('cmap-style')) {
  const s = document.createElement('style'); s.id='cmap-style'; s.innerHTML=STYLES; document.head.appendChild(s);
}

const TC = { CRITICAL:'#ef4444', HIGH:'#f97316', MODERATE:'#eab308', LOW:'#22c55e' };
const HI = { Hurricane:'⛈', Earthquake:'🌋', Flood:'🌊', Wildfire:'🔥', 'Disease Outbreak':'☣', Landslide:'⛰', Conflict:'⚡', 'Trapped Person':'🆘' };
const getThreat = s => s>8?'CRITICAL':s>6?'HIGH':s>3?'MODERATE':'LOW';

function zoneIcon(zone) {
  const c = TC[getThreat(zone.severity_level||0)];
  const d = zone._simDelta||0;
  const ring = d!==0 ? (d>0?'#ff8c00':'#00ff9d') : c;
  return L.divIcon({ className:'', iconSize:[70,70], iconAnchor:[35,35], html:`
    <div style="position:relative;width:70px;height:70px;">
      <div style="position:absolute;top:50%;left:50%;width:52px;height:52px;border-radius:50%;border:2px solid ${ring};transform:translate(-50%,-50%);animation:pulse-ring 1.6s infinite;"></div>
      <div style="position:absolute;top:50%;left:50%;width:38px;height:38px;border-radius:50%;background:${c}22;border:2px solid ${c};display:flex;align-items:center;justify-content:center;font-size:17px;transform:translate(-50%,-50%);box-shadow:0 0 18px ${c}99;">${HI[zone.hazard_type]||'◉'}</div>
      ${d!==0?`<div style="position:absolute;top:1px;right:1px;width:16px;height:16px;border-radius:50%;background:${d>0?'#ff8c00':'#00ff9d'};border:2px solid #060b14;display:flex;align-items:center;justify-content:center;font-size:10px;">${d>0?'↑':'↓'}</div>`:''}
    </div>`
  });
}

function vehicleIcon(d) {
  const v = VEHICLE_TYPES[d.vehicleKey]||{};
  const c = v.color||'#00d4ff';
  const onScene = d.status==='on_scene';
  let rot = 0;
  if (d.status==='en_route')  rot = bearingDeg(HQ, {lat:d.zoneLat,lng:d.zoneLng});
  if (d.status==='returning') rot = bearingDeg({lat:d.zoneLat,lng:d.zoneLng}, HQ);
  return L.divIcon({ className:'', iconSize:[52,62], iconAnchor:[26,26], html:`
    <div style="position:relative;width:52px;height:62px;">
      ${onScene?`<div style="position:absolute;top:22px;left:50%;width:46px;height:46px;border-radius:50%;border:2px solid ${c};transform:translate(-50%,-50%);animation:pulse-ring 1s infinite;"></div>`:''}
      <div style="position:absolute;top:22px;left:50%;width:34px;height:34px;border-radius:50%;background:${c}${onScene?'44':'22'};border:2px solid ${c}${onScene?'':'88'};display:flex;align-items:center;justify-content:center;font-size:17px;transform:translate(-50%,-50%) rotate(${rot}deg);box-shadow:0 0 14px ${c}55;">${v.icon||'🚗'}</div>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:rgba(3,5,12,0.95);border:1px solid ${c}66;border-radius:3px;padding:1px 5px;font-family:'IBM Plex Mono',monospace;font-size:7px;color:${c};white-space:nowrap;">${d.id}</div>
    </div>`
  });
}

/* Sim Panel */
function SimPanel({ zone, delta, onEscalate, onDeescalate, onReset, onClose }) {
  const tc = TC[getThreat(zone.severity_level||0)];
  return (
    <div style={{position:'absolute',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:1000,background:'rgba(5,10,20,0.98)',border:`1px solid ${tc}55`,borderRadius:'14px',padding:'14px 18px',minWidth:'300px',maxWidth:'360px',boxShadow:`0 0 40px rgba(0,0,0,.9),0 0 20px ${tc}22`,animation:'sim-in 0.2s ease',fontFamily:'IBM Plex Mono,monospace'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
        <div>
          <div style={{fontSize:'8px',color:'#ff8c00',letterSpacing:'0.16em',marginBottom:'3px'}}>⚡ RISK SIMULATOR</div>
          <div style={{fontSize:'13px',fontWeight:700,color:tc}}>{zone.name}</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#2a4a6a',fontSize:'16px',cursor:'pointer'}}>✕</button>
      </div>
      <div style={{background:'rgba(0,180,255,0.05)',border:'1px solid rgba(0,180,255,0.1)',borderRadius:'8px',padding:'10px 14px',marginBottom:'12px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px',fontSize:'7.5px'}}>
          <span style={{color:'#1a3a54'}}>SEVERITY</span>
          <span style={{color:tc,background:`${tc}18`,padding:'1px 8px',borderRadius:'4px',border:`1px solid ${tc}35`}}>{getThreat(zone.severity_level||0)}</span>
        </div>
        <div style={{height:'6px',background:'rgba(0,180,255,0.08)',borderRadius:'3px',overflow:'hidden',marginBottom:'4px'}}>
          <div style={{height:'100%',width:`${Math.min(100,(zone.severity_level||0)*10)}%`,background:tc,borderRadius:'3px',transition:'width 0.4s'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:'8px'}}>
          <span style={{color:'#1a3a54'}}>0</span>
          <span style={{color:tc,fontWeight:700,fontSize:'14px'}}>{(zone.severity_level||0).toFixed(1)}</span>
          <span style={{color:'#1a3a54'}}>10</span>
        </div>
        {delta!==0&&<div style={{marginTop:'6px',fontSize:'8px',color:delta>0?'#ff8c00':'#00ff9d',textAlign:'center'}}>{delta>0?'▲ ESCALATED':'▼ DE-ESCALATED'} {Math.abs(delta).toFixed(1)}</div>}
      </div>
      <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
        {[{l:'ESCALATE',i:'▲',c:'#ff3a5c',fn:onEscalate},{l:'DE-ESCALATE',i:'▼',c:'#00ff9d',fn:onDeescalate}].map(b=>(
          <button key={b.l} onClick={b.fn} style={{flex:1,background:`${b.c}11`,border:`1px solid ${b.c}44`,borderRadius:'8px',padding:'8px',color:b.c,cursor:'pointer',fontFamily:'IBM Plex Mono,monospace',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
            <span style={{fontSize:'15px'}}>{b.i}</span>
            <div><div style={{fontSize:'9px'}}>{b.l}</div><div style={{fontSize:'7px',opacity:.6}}>{b.i==='▲'?'+':'-'}0.5</div></div>
          </button>
        ))}
      </div>
      <div style={{display:'flex',gap:'10px',fontSize:'8px',color:'#2a4a6a',marginBottom:'10px',flexWrap:'wrap'}}>
        <span>{zone.hazard_type}</span><span>CONF {zone.confidence}%</span><span>{((zone.population_at_risk||0)/1000).toFixed(1)}K pop</span>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        {delta!==0?<button onClick={onReset} style={{background:'rgba(0,180,255,0.06)',border:'1px solid rgba(0,180,255,0.2)',borderRadius:'6px',padding:'4px 12px',color:'#00d4ff',fontSize:'8px',fontFamily:'IBM Plex Mono,monospace',cursor:'pointer'}}>↺ RESET</button>:<div/>}
        <div style={{fontSize:'7px',color:'#1a3a54',textAlign:'right'}}>Live in all tabs</div>
      </div>
    </div>
  );
}

/* ── MAIN ── */
export default function CrisisMap({ zones=[], zoneOverrides={}, onZoneOverride, onZoneOverrideReset, onZoneClick, dispatchesRef, onRescue }) {
  const mapRef       = useRef(null);
  const mapInst      = useRef(null);
  const zoneLayer    = useRef(null);
  const trappedLayer = useRef(null);
  const vehicleLayer = useRef(null);
  const vMarkers     = useRef({});  // dispatchId → L.Marker
  const routeLayer   = useRef(null);
  const rafRef       = useRef(null);

  const [fbReports, setFbReports] = useState([]);
  const [simPanel,  setSimPanel]  = useState(null);

  /* Delete a Firebase trapped-person record */
  const deleteReport = (id) => remove(ref(db, `alerts/${id}`));

  /* Init map */
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    const map = L.map(mapRef.current, { center:[HQ.lat,HQ.lng], zoom:10 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
    L.marker([HQ.lat,HQ.lng], { icon:L.divIcon({ className:'', iconSize:[80,80], iconAnchor:[40,40],
      html:`<div style="position:relative;width:80px;height:80px;"><div style="position:absolute;top:50%;left:50%;width:60px;height:60px;border-radius:50%;border:3px solid #2563eb;transform:translate(-50%,-50%);animation:pulse-ring 2s infinite;"></div><div style="position:absolute;top:50%;left:50%;width:46px;height:46px;border-radius:50%;background:#2563eb22;border:2px solid #2563eb;display:flex;align-items:center;justify-content:center;box-shadow:0 0 25px #2563ebaa;font-size:22px;transform:translate(-50%,-50%);">🏢</div></div>`
    }), zIndexOffset:2000 }).bindPopup('<b style="color:#2563eb;font-family:monospace">VIT Chennai — Crisis HQ</b>').addTo(map);
    vehicleLayer.current = L.layerGroup().addTo(map);
    mapInst.current = map;

    /* ── OWN rAF LOOP for vehicle animation ── */
    const animLoop = () => {
      const layer = vehicleLayer.current;
      if (!layer) { rafRef.current = requestAnimationFrame(animLoop); return; }
      const now = Date.now();
      const active = (dispatchesRef?.current || []).filter(d => d.status !== 'returned');
      const activeIds = new Set(active.map(d => d.id));

      // Remove stale markers
      Object.keys(vMarkers.current).forEach(id => {
        if (!activeIds.has(id)) { layer.removeLayer(vMarkers.current[id]); delete vMarkers.current[id]; }
      });

      // Update / create
      active.forEach(d => {
        let pos = d.currentPos || HQ;
        // Compute live interpolated position
        if (d.status === 'en_route' && d.departedAt && d.travelMs) {
          const t = Math.min(1, (now - d.departedAt) / d.travelMs);
          pos = interpolatePos(HQ, {lat:d.zoneLat,lng:d.zoneLng}, t);
        } else if (d.status === 'returning' && d.returnDepartedAt && d.returnMs) {
          const t = Math.min(1, (now - d.returnDepartedAt) / d.returnMs);
          pos = interpolatePos({lat:d.zoneLat,lng:d.zoneLng}, HQ, t);
        }
        const latlng = [pos.lat, pos.lng];
        if (vMarkers.current[d.id]) {
          vMarkers.current[d.id].setLatLng(latlng);
          vMarkers.current[d.id].setIcon(vehicleIcon({...d, currentPos:pos}));
        } else {
          vMarkers.current[d.id] = L.marker(latlng, { icon:vehicleIcon({...d,currentPos:pos}), zIndexOffset:1000 }).addTo(layer);
        }
      });

      rafRef.current = requestAnimationFrame(animLoop);
    };
    rafRef.current = requestAnimationFrame(animLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.remove(); mapInst.current = null;
    };
  }, []);

  /* Firebase survivors */
  useEffect(() => {
    const reportsRef = ref(db, 'alerts');
    const unsub = onValue(reportsRef, snap => {
      const data = snap.val();
      setFbReports(data ? Object.keys(data).map(k => ({id:k,...data[k]})) : []);
    });
    return () => unsub();
  }, []);

  /* Draw trapped-person markers with Rescue button */
  useEffect(() => {
    const map = mapInst.current; if (!map) return;
    if (trappedLayer.current) map.removeLayer(trappedLayer.current);
    const group = L.layerGroup();

    fbReports.forEach(report => {
      if (!report.lat || !report.lng) return;
      const marker = L.marker([Number(report.lat), Number(report.lng)], {
        icon: L.divIcon({
          className:'', iconSize:[60,60], iconAnchor:[30,30],
          html:`<div style="position:relative;width:60px;height:60px;">
            <div style="position:absolute;top:50%;left:50%;width:40px;height:40px;border-radius:50%;background:rgba(239,68,68,0.35);transform:translate(-50%,-50%);animation:pulse-ring 1.2s infinite;"></div>
            <div style="position:absolute;top:50%;left:50%;width:18px;height:18px;background:#ff0000;border-radius:50%;border:2px solid #fff;box-shadow:0 0 14px #f00;transform:translate(-50%,-50%);animation:sos-pulse 1.5s infinite;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:bold;">🆘</div>
          </div>`,
        }),
        zIndexOffset: 3000,
      });

      // Popup with Rescue button
      const popupDiv = document.createElement('div');
      popupDiv.style.cssText = 'font-family:IBM Plex Mono,monospace;min-width:180px;';
      popupDiv.innerHTML = `
        <div style="color:#ff3a5c;font-size:11px;font-weight:700;margin-bottom:6px;">🆘 TRAPPED PERSON</div>
        <div style="font-size:10px;color:#6a8aaa;margin-bottom:4px;">${report.name || 'Unknown'}</div>
        <div style="font-size:9px;color:#2a4a6a;margin-bottom:10px;">${report.message || 'Help requested'}</div>
        <div style="font-size:8px;color:#1a3a54;margin-bottom:8px;">
          ${Number(report.lat).toFixed(4)}°N, ${Number(report.lng).toFixed(4)}°E
        </div>
        <button id="rescue-btn-${report.id}" style="width:100%;padding:7px;background:rgba(255,58,92,0.15);border:1px solid rgba(255,58,92,0.4);border-radius:7px;color:#ff3a5c;font-family:IBM Plex Mono,monospace;font-size:9px;cursor:pointer;letter-spacing:0.1em;font-weight:600;">
          🚁 DISPATCH RESCUE
        </button>
      `;
      const popup = L.popup({ maxWidth: 220 }).setContent(popupDiv);
      marker.bindPopup(popup);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`rescue-btn-${report.id}`);
        if (btn) {
          btn.onclick = () => {
            onRescue?.(report, deleteReport);
            marker.closePopup();
            // Visual feedback
            btn.textContent = '✓ RESCUE DISPATCHED';
            btn.style.color = '#00ff9d';
            btn.style.borderColor = 'rgba(0,255,157,0.4)';
            btn.style.background = 'rgba(0,255,157,0.1)';
            btn.disabled = true;
          };
        }
      });

      marker.addTo(group);
    });

    group.addTo(map);
    trappedLayer.current = group;
  }, [fbReports]);

  /* Draw zones */
  useEffect(() => {
    const map = mapInst.current; if (!map) return;
    if (zoneLayer.current) map.removeLayer(zoneLayer.current);
    const g = L.layerGroup();
    zones.forEach(z => {
      if (!z.lat||!z.lng) return;
      const m = L.marker([z.lat,z.lng], { icon:zoneIcon(z), zIndexOffset:z._simDelta?500:0 });
      m.on('click', () => { setSimPanel(z); onZoneClick?.(z); });
      m.addTo(g);
    });
    g.addTo(map); zoneLayer.current = g;
  }, [zones]);

  /* Sync sim panel with live zone data */
  useEffect(() => {
    if (!simPanel) return;
    const updated = zones.find(z=>z.zone_id===simPanel.zone_id);
    if (updated) setSimPanel(updated);
  }, [zones]);

  /* Routes */
  useEffect(() => {
    const map = mapInst.current; if (!map) return;
    if (routeLayer.current) map.removeLayer(routeLayer.current);
    const g = L.layerGroup();
    zones.forEach(z => {
      if (!z.lat||!z.lng) return;
      L.polyline([[HQ.lat,HQ.lng],[z.lat,z.lng]], { color:'#00d4ff', weight:1.5, dashArray:'6,5', opacity:0.2 }).addTo(g);
    });
    g.addTo(map); routeLayer.current = g;
  }, [zones]);

  // Derive active units from dispatchesRef for legend (poll every second)
  const [legendUnits, setLegendUnits] = useState([]);
  useEffect(() => {
    const t = setInterval(() => {
      if (dispatchesRef?.current) {
        setLegendUnits(dispatchesRef.current.filter(d=>d.status!=='returned'));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [dispatchesRef]);

  return (
    <div style={{height:'100%',width:'100%',position:'relative'}}>
      <div ref={mapRef} style={{height:'100%',width:'100%',borderRadius:'10px',overflow:'hidden'}}/>

      {simPanel && (
        <SimPanel zone={simPanel} delta={zoneOverrides[simPanel.zone_id]||0}
          onEscalate={()=>onZoneOverride?.(simPanel.zone_id,0.5)}
          onDeescalate={()=>onZoneOverride?.(simPanel.zone_id,-0.5)}
          onReset={()=>onZoneOverrideReset?.(simPanel.zone_id)}
          onClose={()=>setSimPanel(null)}
        />
      )}

      {/* Legend */}
      <div style={{position:'absolute',top:'12px',right:'12px',zIndex:900,background:'rgba(5,10,20,0.95)',border:'1px solid rgba(0,180,255,0.15)',borderRadius:'10px',padding:'10px 14px',fontFamily:'IBM Plex Mono,monospace',fontSize:'8px',minWidth:'150px'}}>
        <div style={{color:'#1a3a54',letterSpacing:'0.14em',marginBottom:'7px'}}>THREAT LEVELS</div>
        {Object.entries(TC).map(([k,c])=>(
          <div key={k} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'4px'}}>
            <div style={{width:'7px',height:'7px',borderRadius:'50%',background:c,boxShadow:`0 0 5px ${c}`,flexShrink:0}}/>
            <span style={{color:c}}>{k}</span>
          </div>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'8px',marginTop:'2px'}}>
          <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#f00',boxShadow:'0 0 5px #f00',flexShrink:0}}/>
          <span style={{color:'#ff3a5c'}}>TRAPPED 🆘</span>
        </div>
        {legendUnits.length>0&&<>
          <div style={{borderTop:'1px solid rgba(0,180,255,0.1)',paddingTop:'7px',marginBottom:'6px',color:'#1a3a54'}}>DEPLOYED</div>
          {legendUnits.map(d=>{
            const v=VEHICLE_TYPES[d.vehicleKey]||{};
            const sc=d.status==='en_route'?'#f97316':d.status==='on_scene'?'#00ff9d':'#2a4a6a';
            return (
              <div key={d.id} style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'3px'}}>
                <span style={{fontSize:'11px'}}>{v.icon}</span>
                <div>
                  <div style={{color:sc,fontSize:'7px'}}>{d.id}{d.isAutoDispatch?' 🤖':''}</div>
                  <div style={{color:'#1a3a54',fontSize:'6.5px'}}>{d.status.replace('_',' ').toUpperCase()}</div>
                </div>
              </div>
            );
          })}
        </>}
        <div style={{borderTop:'1px solid rgba(0,180,255,0.08)',marginTop:'8px',paddingTop:'7px',color:'#1a3a54',fontSize:'7px'}}>CLICK ZONE TO<br/>SIMULATE / DISPATCH<br/>CLICK 🆘 TO RESCUE</div>
      </div>

      {/* Firebase ping count */}
      {fbReports.length>0&&(
        <div style={{position:'absolute',top:'12px',left:'12px',zIndex:900,background:'rgba(255,0,0,0.12)',border:'1px solid rgba(255,58,92,0.35)',borderRadius:'8px',padding:'6px 12px',fontFamily:'IBM Plex Mono,monospace',fontSize:'8px',color:'#ff3a5c',display:'flex',alignItems:'center',gap:'7px'}}>
          <span style={{animation:'sos-pulse 1.5s infinite',display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:'#ff3a5c'}}/>
          {fbReports.length} TRAPPED PERSON{fbReports.length>1?'S':''} REPORTED
        </div>
      )}
    </div>
  );
}
