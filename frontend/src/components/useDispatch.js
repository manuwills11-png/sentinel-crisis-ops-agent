// useDispatch.js
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  HQ, VEHICLE_TYPES, HAZARD_VEHICLE_MAP, onSceneMs, newDispatchId,
  makeLogEntry, LOG_TYPES, randomCommsMessage, interpolatePos, bearingDeg,
  distanceKm, etaMs,
} from './DispatchEngine';

export function useDispatch({ zones, zoneOverrides, setZoneOverrides }) {
  // dispatchesRef holds the live data — read by CrisisMap's own rAF loop
  const dispatchesRef = useRef([]);
  // State copy for React renders (alerts tab, logs tab, sidebar counts)
  const [dispatches, setDispatches]   = useState([]);
  const [logEntries, setLogEntries]   = useState([
    makeLogEntry(LOG_TYPES.SYSTEM, { message: 'Crisis Operations Center ONLINE — VIT Chennai HQ active.' }),
    makeLogEntry(LOG_TYPES.SYSTEM, { message: 'AI Dispatch Coordinator armed. Monitoring Tamil Nadu region.' }),
  ]);
  const timersRef = useRef({});

  const addLog = useCallback((type, data) => {
    setLogEntries(prev => [makeLogEntry(type, data), ...prev].slice(0, 300));
  }, []);

  // Sync ref → state (throttled to ~10fps so UI updates without overloading React)
  const syncRef = useRef(null);
  const scheduleSync = useCallback(() => {
    if (syncRef.current) return;
    syncRef.current = setTimeout(() => {
      setDispatches([...dispatchesRef.current]);
      syncRef.current = null;
    }, 100);
  }, []);

  const updateDispatch = useCallback((id, patch) => {
    dispatchesRef.current = dispatchesRef.current.map(d => d.id === id ? { ...d, ...patch } : d);
    scheduleSync();
  }, [scheduleSync]);

  const sendDispatch = useCallback((zone, vehicleKey, isAutoDispatch = false) => {
    const vehicle = VEHICLE_TYPES[vehicleKey];
    if (!zone?.lat || !zone?.lng || !vehicle) return null;

    const id = newDispatchId();
    const distKm   = distanceKm(HQ, { lat: zone.lat, lng: zone.lng });
    const travelMs = etaMs(distKm, vehicle.speedKmh);
    const returnMs = etaMs(distKm, vehicle.returnSpeedKmh);
    const etaSec   = Math.round(travelMs / 1000);
    const departedAt = Date.now();

    const dispatch = {
      id, vehicleKey,
      vehicleIcon:  vehicle.icon,
      vehicleLabel: vehicle.label,
      vehicleColor: vehicle.color,
      zoneId:   zone.zone_id,
      zoneName: zone.name,
      zoneLat:  zone.lat,
      zoneLng:  zone.lng,
      severity: zone.severity_level || 5,
      departedAt, travelMs,
      returnMs,
      returnDepartedAt: null,
      arrivedAt: null, returnedAt: null,
      status: 'en_route',
      currentPos: { ...HQ },
      progress: 0,
      isAutoDispatch,
      // For rescue missions
      rescueTarget: zone.rescueTarget || null,
    };

    dispatchesRef.current = [dispatch, ...dispatchesRef.current];
    scheduleSync();

    addLog(LOG_TYPES.DISPATCH_SENT, {
      id, vehicleIcon: vehicle.icon, vehicleLabel: vehicle.label,
      zoneName: zone.name, etaSec, capacity: vehicle.capacity,
    });
    if (isAutoDispatch) {
      addLog(LOG_TYPES.SYSTEM, { message: `AI auto-dispatched ${vehicle.icon} ${vehicle.label} → ${zone.name} (SEV ${zone.severity_level?.toFixed(1)})` });
    }

    // Comms during travel
    [0.3, 0.6, 0.85].forEach((f, i) => {
      timersRef.current[`${id}-c${i}`] = setTimeout(() => {
        addLog(LOG_TYPES.COMMS_INTERCEPT, { id, message: randomCommsMessage(vehicleKey) });
      }, travelMs * f);
    });

    // ── ARRIVAL ──
    timersRef.current[`${id}-arr`] = setTimeout(() => {
      updateDispatch(id, { status: 'on_scene', arrivedAt: Date.now(), currentPos: { lat: zone.lat, lng: zone.lng }, progress: 1 });

      addLog(LOG_TYPES.DISPATCH_ARRIVED, {
        id, zoneName: zone.name,
        action: vehicleKey === 'drone' ? 'aerial surveillance'
              : vehicleKey === 'ambulance' ? 'medical triage' : 'search & rescue',
      });

      // Severity reduction — 50% on arrival
      const baseSev = zone.severity_level || 0;
      const currentDelta = zoneOverrides[zone.zone_id] || 0;
      const currentSev   = Math.max(0, baseSev + currentDelta);
      const arrReduce    = vehicle.severityReduction * 0.5;
      const newSev       = Math.max(0, currentSev - arrReduce);
      const newDelta     = newSev - baseSev;

      setZoneOverrides(prev => ({ ...prev, [zone.zone_id]: newDelta }));
      addLog(LOG_TYPES.DISPATCH_ON_SCENE,  { id, zoneName: zone.name, oldSev: currentSev, newSev });
      addLog(LOG_TYPES.SEVERITY_REDUCED,   { zoneName: zone.name, oldSev: currentSev, newSev, delta: arrReduce });

      // Comms on-scene
      const sceneMs = onSceneMs(zone.severity_level || 5);
      timersRef.current[`${id}-sc`] = setTimeout(() =>
        addLog(LOG_TYPES.COMMS_INTERCEPT, { id, message: randomCommsMessage(vehicleKey) }), sceneMs * 0.5);

      // ── DEPART SCENE ──
      timersRef.current[`${id}-dep`] = setTimeout(() => {
        const returnDepartedAt = Date.now();
        updateDispatch(id, { status: 'returning', returnDepartedAt, returnMs });
        addLog(LOG_TYPES.DISPATCH_RETURNING, { id, zoneName: zone.name });

        // Remaining severity reduction on departure
        const baseSev2    = zone.severity_level || 0;
        const curDelta2   = zoneOverrides[zone.zone_id] ?? newDelta;
        const curSev2     = Math.max(0, baseSev2 + curDelta2);
        const depReduce   = vehicle.severityReduction * 0.5;
        const newSev2     = Math.max(0, curSev2 - depReduce);
        const newDelta2   = newSev2 - baseSev2;
        setZoneOverrides(prev => ({ ...prev, [zone.zone_id]: newDelta2 }));
        addLog(LOG_TYPES.SEVERITY_REDUCED, { zoneName: zone.name, oldSev: curSev2, newSev: newSev2, delta: depReduce });

        // ── RETURNED ──
        timersRef.current[`${id}-ret`] = setTimeout(() => {
          const totalTimeSec = Math.round((Date.now() - departedAt) / 1000);
          updateDispatch(id, { status: 'returned', returnedAt: Date.now(), currentPos: { ...HQ }, progress: 1 });
          addLog(LOG_TYPES.DISPATCH_RETURNED, { id, vehicleLabel: vehicle.label, totalTimeSec });
          // Remove after 5s
          setTimeout(() => {
            dispatchesRef.current = dispatchesRef.current.filter(d => d.id !== id);
            scheduleSync();
          }, 5000);
        }, returnMs);
      }, sceneMs);
    }, travelMs);

    return id;
  }, [addLog, zoneOverrides, setZoneOverrides, updateDispatch, scheduleSync]);

  // ── Rescue a trapped person ──
  const sendRescue = useCallback((report, deleteFromFirebase) => {
    // Create a pseudo-zone for the rescue target
    const rescueZone = {
      zone_id:          `rescue-${report.id}`,
      name:             `Rescue · ${report.name || report.id}`,
      lat:              Number(report.lat),
      lng:              Number(report.lng),
      hazard_type:      'Trapped Person',
      severity_level:   8,
      confidence:       95,
      population_at_risk: 1,
      threat_label:     'CRITICAL',
      priority:         0.9,
      rescueTarget:     report.id,   // Firebase key to delete on return
    };
    // Pick best vehicle (helicopter for speed)
    const vehicleKey = 'helicopter';
    const id = sendDispatch(rescueZone, vehicleKey);
    if (!id) return;

    addLog(LOG_TYPES.SYSTEM, { message: `🆘 RESCUE MISSION ${id} — ${report.name || 'Unknown'} at (${Number(report.lat).toFixed(4)}, ${Number(report.lng).toFixed(4)})` });

    // Delete Firebase record after helicopter returns
    const checkReturn = setInterval(() => {
      const d = dispatchesRef.current.find(d => d.id === id);
      if (d?.status === 'returned') {
        clearInterval(checkReturn);
        deleteFromFirebase(report.id);
        addLog(LOG_TYPES.SYSTEM, { message: `✓ RESCUED — ${report.name || 'person'} extracted safely. Firebase record cleared.` });
      }
      if (!d) clearInterval(checkReturn); // dispatch was removed
    }, 1000);
  }, [sendDispatch, addLog]);

  // ── AI auto-dispatch ──
  // Every 15s, scan zones with HIGH/CRITICAL severity that have no active dispatch
  useEffect(() => {
    const interval = setInterval(() => {
      const activeZoneIds = new Set(
        dispatchesRef.current
          .filter(d => d.status === 'en_route' || d.status === 'on_scene')
          .map(d => d.zoneId)
      );

      const candidates = zones.filter(z =>
        (z.threat_label === 'CRITICAL' || z.threat_label === 'HIGH') &&
        z.severity_level >= 6 &&
        !activeZoneIds.has(z.zone_id) &&
        z.lat && z.lng
      );

      if (candidates.length === 0) return;

      // Dispatch to the highest severity unattended zone
      const target = candidates.sort((a, b) => (b.severity_level || 0) - (a.severity_level || 0))[0];
      const hazardVehicles = HAZARD_VEHICLE_MAP[target.hazard_type] || ['rescue_team'];
      const vehicleKey = hazardVehicles[0];

      sendDispatch(target, vehicleKey, true);
    }, 15000);

    return () => clearInterval(interval);
  }, [zones, sendDispatch]);

  // Zone escalation logger
  const prevSevRef = useRef({});
  useEffect(() => {
    zones.forEach(z => {
      const prev = prevSevRef.current[z.zone_id];
      const curr = z.severity_level;
      if (prev !== undefined && Math.abs(curr - prev) >= 0.5) {
        const lbl = s => s > 8 ? 'CRITICAL' : s > 6 ? 'HIGH' : s > 3 ? 'MODERATE' : 'LOW';
        if (lbl(curr) !== lbl(prev)) {
          addLog(curr > prev ? LOG_TYPES.ZONE_ESCALATED : LOG_TYPES.ZONE_DEESCALATED,
            { zoneName: z.name, oldSev: prev, newSev: curr, newThreat: lbl(curr) });
        }
      }
      prevSevRef.current[z.zone_id] = curr;
    });
  }, [zones, addLog]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout);
    if (syncRef.current) clearTimeout(syncRef.current);
  }, []);

  return { dispatches, dispatchesRef, logEntries, sendDispatch, sendRescue, addLog };
}
