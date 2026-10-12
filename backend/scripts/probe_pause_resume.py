"""Drive a paused (human-in-the-loop) run through the real HTTP API.

The capture is blurred and darkened enough that the quality gate should reject it,
so the planner stops to ask instead of reaching `end`. Used to exercise the agent
console's pause/resume pane against a live run.
"""
import json
import sys

import cv2
import numpy as np
import requests

from app.vision.benchmark import draw_panel

BASE = "http://127.0.0.1:8000"
EMAIL = sys.argv[1]
PASSWORD = sys.argv[2]
# `retry` re-runs the quality gate and pauses again on the same capture;
# `proceed` overrides it, which is how the registration question gets reached.
CHOICE = sys.argv[3] if len(sys.argv) > 3 else "proceed"

rng = np.random.default_rng(4242)
reference = draw_panel(rng)
capture = cv2.GaussianBlur(reference, (0, 0), 21)
capture = (capture.astype(np.float32) * 0.20).astype(np.uint8)


def encode(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


login = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
print("login:", login.status_code)
headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

equipment = requests.post(
    f"{BASE}/api/equipment",
    headers=headers,
    json={"name": "Pause probe — blurred capture", "category": "pump", "location": "QA bench"},
)
print("equipment:", equipment.status_code)
equipment_id = equipment.json()["id"]

ref = requests.post(
    f"{BASE}/api/equipment/{equipment_id}/reference-image",
    headers=headers,
    files={"file": ("reference.png", encode(reference), "image/png")},
)
print("reference image:", ref.status_code, ref.text[:160])

inspection = requests.post(
    f"{BASE}/api/inspections", headers=headers, json={"equipment_id": equipment_id}
)
print("inspection:", inspection.status_code, inspection.text[:160])
inspection_id = inspection.json()["id"]

up = requests.post(
    f"{BASE}/api/inspections/{inspection_id}/upload",
    headers=headers,
    files={"file": ("capture.png", encode(capture), "image/png")},
)
print("upload:", up.status_code, up.text[:160])

run = requests.post(f"{BASE}/api/inspections/{inspection_id}/run", headers=headers)
print("run:", run.status_code, run.json().get("message"))
run_id = run.json()["inspection"]["agent_run_id"]

detail = requests.get(f"{BASE}/api/agent/runs/{run_id}", headers=headers).json()
outcome = detail["run"].get("final_outcome") or {}
print(json.dumps({
    "run_id": run_id,
    "status": detail["run"]["status"],
    "final_state": outcome.get("final_state"),
    "awaiting": outcome.get("awaiting"),
    "steps": len(detail["steps"]),
}, indent=1))

resume = requests.post(
    f"{BASE}/api/agent/runs/{run_id}/resume", headers=headers, json={"response": CHOICE}
)
print("resume:", resume.status_code, resume.text[:300])

after = requests.get(f"{BASE}/api/agent/runs/{run_id}", headers=headers).json()
after_outcome = after["run"].get("final_outcome") or {}
# GET /api/inspections/{id} nests the row: {inspection, findings, observations, agent_run}
inspection_row = requests.get(
    f"{BASE}/api/inspections/{inspection_id}", headers=headers
).json()["inspection"]
print(json.dumps({
    "status_after": after["run"]["status"],
    "steps_after": len(after["steps"]),
    "final_state_after": after_outcome.get("final_state"),
    "awaiting_after": after_outcome.get("awaiting"),
    "inspection_status": inspection_row["status"],
}, indent=1))
print(f"console: http://localhost:3000/dashboard/agent?run={run_id}")
