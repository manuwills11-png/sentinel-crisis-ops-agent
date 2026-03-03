"""
Autonomous AI Crisis Operations Agent — FastAPI Backend
Continuous AI agent loop: Verify → Score → Allocate → Forecast → Strategy → Alerts
"""

import asyncio
import math
import logging
from datetime import datetime, timezone
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import (
    Zone, CitizenPing, Shelter, ResourcePool,
    SimulationParams
)

from agent.verification import compute_confidence, get_threat_label
from agent.scoring import compute_priority, rank_zones
from agent.allocation import allocate_resources, resource_utilization_pct
from agent.cascade import apply_cascade_effects
from agent.forecasting import generate_forecast
from agent.alerts import generate_alerts
from agent.gemini_strategy import generate_strategy


# ─────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Crisis Operations Agent", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────
# INITIAL DATA
# ─────────────────────────────────────────────────────────

INITIAL_ZONES_DATA = [
    {"zone_id": "Z-01", "name": "Marina Beach District",    "lat": 13.0500, "lng": 80.2824, "hazard_type": "Flood",            "severity_level": 7.2, "population_at_risk": 45000, "infrastructure_damage": 0.60, "mobility_disruption": 0.75, "medical_urgency": 0.55, "supply_deficit": 0.65, "conflict_intensity": 0.00, "road_safety_index": 0.30, "hospital_status": 0.60, "source_type": "satellite"},
    {"zone_id": "Z-02", "name": "Tambaram Industrial Zone", "lat": 12.9249, "lng": 80.1000, "hazard_type": "Wildfire",          "severity_level": 8.5, "population_at_risk": 28000, "infrastructure_damage": 0.75, "mobility_disruption": 0.55, "medical_urgency": 0.70, "supply_deficit": 0.50, "conflict_intensity": 0.00, "road_safety_index": 0.40, "hospital_status": 0.55, "source_type": "sensor"},
    {"zone_id": "Z-03", "name": "Chromepet Residential",    "lat": 12.9516, "lng": 80.1462, "hazard_type": "Earthquake",        "severity_level": 5.8, "population_at_risk": 62000, "infrastructure_damage": 0.45, "mobility_disruption": 0.50, "medical_urgency": 0.60, "supply_deficit": 0.40, "conflict_intensity": 0.00, "road_safety_index": 0.55, "hospital_status": 0.75, "source_type": "sensor"},
    {"zone_id": "Z-04", "name": "Kancheepuram Zone",        "lat": 12.8342, "lng": 79.7036, "hazard_type": "Disease Outbreak",  "severity_level": 9.1, "population_at_risk": 35000, "infrastructure_damage": 0.30, "mobility_disruption": 0.45, "medical_urgency": 0.95, "supply_deficit": 0.80, "conflict_intensity": 0.00, "road_safety_index": 0.60, "hospital_status": 0.25, "source_type": "agency"},
    {"zone_id": "Z-05", "name": "Mahabalipuram Coast",      "lat": 12.6269, "lng": 80.1927, "hazard_type": "Flood",            "severity_level": 6.4, "population_at_risk": 18000, "infrastructure_damage": 0.55, "mobility_disruption": 0.70, "medical_urgency": 0.45, "supply_deficit": 0.60, "conflict_intensity": 0.00, "road_safety_index": 0.35, "hospital_status": 0.65, "source_type": "satellite"},
    {"zone_id": "Z-06", "name": "Chengalpattu Hills",       "lat": 12.6921, "lng": 79.9760, "hazard_type": "Landslide",         "severity_level": 4.2, "population_at_risk": 12000, "infrastructure_damage": 0.40, "mobility_disruption": 0.65, "medical_urgency": 0.35, "supply_deficit": 0.30, "conflict_intensity": 0.00, "road_safety_index": 0.45, "hospital_status": 0.70, "source_type": "citizen"},
    {"zone_id": "Z-07", "name": "Pallavaram Sector",        "lat": 12.9675, "lng": 80.1491, "hazard_type": "Hurricane",         "severity_level": 7.8, "population_at_risk": 41000, "infrastructure_damage": 0.70, "mobility_disruption": 0.65, "medical_urgency": 0.75, "supply_deficit": 0.55, "conflict_intensity": 0.00, "road_safety_index": 0.35, "hospital_status": 0.50, "source_type": "agency"},
]

# ─────────────────────────────────────────────────────────
# GLOBAL STATE
# ─────────────────────────────────────────────────────────

agent_state = {
    "cycle": 0,
    "last_run": datetime.now(timezone.utc).isoformat(),
    "zones": [],
    "alerts": [],
    "forecast": [],
    "resources": {},
    "strategy": "",
}

agent_running = False

# ─────────────────────────────────────────────────────────
# AGENT CYCLE
# ─────────────────────────────────────────────────────────

async def run_agent_cycle():
    global agent_state

    cycle = agent_state["cycle"] + 1
    logger.info(f"Agent cycle {cycle} starting...")

    zones = []

    # Drift simulation
    for zd in INITIAL_ZONES_DATA:
        z = Zone(**zd)

        sev_drift = math.sin(cycle * 0.4) * 0.25
        z.severity_level = min(10.0, z.severity_level + sev_drift)
        z.infrastructure_damage = min(1.0, z.infrastructure_damage + cycle * 0.005)

        zones.append(z)

    # Cascade
    zones = [apply_cascade_effects(z, cycle) for z in zones]

    # Confidence
    for z in zones:
        conf, verified = compute_confidence(z, cycle, 2)
        z.confidence = conf
        z.verified = verified

    # Priority
    for z in zones:
        scores = compute_priority(z)
        z.priority = scores["priority"]

    zones = rank_zones(zones)

    for z in zones:
        label, color = get_threat_label(z.priority, z.confidence)
        z.threat_label = label
        z.threat_color = color

    # Resources
    pool = ResourcePool()
    zones, pool = allocate_resources(zones, pool)
    util = resource_utilization_pct(pool)

    # Forecast & Alerts
    forecast = generate_forecast(zones, [], pool, {})
    alerts = generate_alerts(zones, [])

    # Update state
    agent_state.update({
        "cycle": cycle,
        "last_run": datetime.now(timezone.utc).isoformat(),
        "zones": [z.dict() for z in zones],
        "alerts": [a.dict() for a in alerts],
        "forecast": [f.dict() for f in forecast],
        "resources": pool.dict(),
    })

    logger.info(f"Cycle {cycle} complete.")

    # 🔥 NON-BLOCKING STRATEGY


# ─────────────────────────────────────────────────────────
# STRATEGY (FIXED)
# ─────────────────────────────────────────────────────────

async def update_strategy():
    try:
        top = agent_state["zones"][0] if agent_state["zones"] else None

        state_for_ai = {
            "zone_name": top["name"] if top else "N/A",
            "priority": round(top["priority"], 3) if top else 0,
            "confidence": round(top["confidence"], 2) if top else 0,
            "threat": top["threat_label"] if top else "LOW",
        }

        strategy = await asyncio.to_thread(generate_strategy, state_for_ai)

        agent_state["strategy"] = strategy

    except Exception as e:
        logger.error(f"Strategy generation failed: {e}")
        agent_state["strategy"] = "Fallback operational plan activated."

# ─────────────────────────────────────────────────────────
# LOOP
# ─────────────────────────────────────────────────────────

async def agent_loop():
    global agent_running
    agent_running = True

    logger.info("AI Agent loop started.")

    while agent_running:
        try:
            await run_agent_cycle()
        except Exception as e:
            logger.error(f"Agent cycle error: {e}")

        await asyncio.sleep(30)


@app.on_event("startup")
async def startup_event():
    await run_agent_cycle()
    asyncio.create_task(agent_loop())
    logger.info("Agent started.")


@app.on_event("shutdown")
async def shutdown_event():
    global agent_running
    agent_running = False


# ─────────────────────────────────────────────────────────
# API
# ─────────────────────────────────────────────────────────

@app.get("/state")
async def get_state():
    return agent_state


@app.get("/strategy")
async def get_strategy():
    return {"strategy": agent_state["strategy"]}


@app.get("/health")
async def health():
    return {
        "status": "operational",
        "cycle": agent_state["cycle"],
        "agent_running": agent_running,
    }


@app.post("/strategy/regenerate")
async def regenerate_strategy():
    asyncio.create_task(update_strategy())
    return {"status": "generating"}

# ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)