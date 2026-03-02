🛰 Sentinel — Autonomous Crisis Operations AI Agent

Sentinel is a real-time humanitarian crisis response simulation platform that combines deterministic risk modeling with AI-generated operational command directives.

The system continuously evaluates crisis zones, allocates constrained resources, forecasts cascading impacts, and generates structured emergency action plans using an LLM.

🚨 Problem

In high-risk humanitarian crises (natural disasters, floods, earthquakes, conflict zones), response coordination suffers from:

Data fragmentation

Poor prioritization

Resource misallocation

Lack of structured operational directives

Most dashboards visualize data — but do not operationalize it.

Sentinel transforms crisis data into executable command structures.

🧠 Solution

Sentinel separates decision intelligence into two layers:

1️⃣ Deterministic Risk Engine

Responsible for:

Zone verification scoring

Priority computation

Threat labeling

Resource allocation optimization

Cascade modeling

6-hour forecasting

2️⃣ AI Strategic Reasoning Layer

Responsible for:

Translating risk scores into structured command plans

Generating operational directives

Producing evacuation orders

Defining monitoring triggers

Structuring emergency response outputs

The AI does NOT compute risk.
It interprets structured risk signals.

This ensures:

Explainability

Transparency

Operational control

⚙️ System Architecture
Backend (FastAPI)

Continuous autonomous agent loop

Multi-zone scoring engine

Resource pool optimization

Cascade effect simulation

Forecast generation

Structured AI command generation (Gemma via Gemini API)

Core Loop:

Verify → Score → Rank → Allocate → Forecast → Generate Strategy → Alert

Frontend (React + Vite)

Real-time crisis map (Leaflet)

Dynamic zone ranking sidebar

Forecast trend visualizations (Recharts)

What-if simulation controls

Structured AI command rendering

Autonomous cycle indicator

Resource allocation dashboard

🔥 Core Features

Real-time zone prioritization

Threat classification (Low / Moderate / High / Critical)

Confidence scoring system

Resource allocation tracking

Cascade propagation modeling

Forecast trend simulation

AI-generated structured operational directives

Simulation override controls

Continuous autonomous agent cycle

Non-blocking AI reasoning engine

📊 Strategic Command Format

The AI produces structured outputs in this format:

[PRIORITY COMMANDS]

Establish Incident Command Post.

Deploy 4 medical units via Route 7.

Initiate evacuation within 3km flood radius.

[RESOURCE DIRECTIVES]

Allocate remaining boats to waterfront extraction.

Reserve helicopter for medevac standby.

[EVACUATION & CIVIL CONTROL]

Redirect civilians to Eastbrook Shelter A.

Activate traffic redirection protocol.

[RISK MONITORING]

Escalate if severity exceeds 9.0.

Monitor hospital capacity under 40%.

This makes the output actionable for rescue personnel.

🧪 What-If Simulation

Operators can dynamically adjust:

Severity boost

Rainfall increase

Conflict escalation

The system recalculates forecast trajectories and resource strain in real time.

🏗 Tech Stack
Backend

Python

FastAPI

Pydantic

Uvicorn

Gemini API (Gemma model)

Frontend

React (Vite)

Leaflet

Recharts

IBM Plex Mono + Syne Typography

Glass UI design system

🚀 Local Setup
Clone Repository

git clone https://github.com/YOUR_USERNAME/sentinel-crisis-ops-agent.git

cd sentinel-crisis-ops-agent

Backend Setup

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

Create a .env file inside backend:

GEMINI_API_KEY=your_api_key_here

Run backend:

uvicorn main:app --reload --port 8000

Backend runs on:

http://localhost:8000

Frontend Setup

cd frontend
npm install
npm run dev

Frontend runs on:

http://localhost:5173

🔐 Environment Variables

Backend requires:

GEMINI_API_KEY

Never commit .env files.

🧠 Design Philosophy

Sentinel is built around:

Deterministic control systems

AI-assisted reasoning

Structured operational output

Crisis transparency

Explainable intelligence

It avoids black-box decision making by isolating AI reasoning from risk scoring.

📈 Future Improvements

Multi-agent coordination

Real-time sensor ingestion

Satellite data streaming

Reinforcement learning resource allocation

Multi-model strategic reasoning

GIS evacuation corridor overlays

Live deployment dashboard

🛡 Disclaimer

This project is a simulation and research prototype.
Not intended for live emergency deployment.

👨‍💻 Author

Martin Wills
B.Tech Computer Science
AI Systems & Autonomous Agents

⭐ License

MIT License