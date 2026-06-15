from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock

from models.schemas import (
    TroubleshootingFlow,
    FlowEquipment,
    FlowTrigger,
    FlowMetadata,
    FlowNode,
    FlowNodeContent,
    FlowNodeTest,
    FlowNodeRepair,
    FlowNodeEscalation,
    FlowNodeBranch
)
from services.config import BASE_DIR
from services.exceptions import NotFoundError

logger = logging.getLogger(__name__)

SEED_FLOWS = [
    TroubleshootingFlow(
        flow_id="hp-laserjet-50-1-fuser",
        title="50.1 Fuser Overheat Error",
        domain="industrial",
        equipment=FlowEquipment(
            manufacturer="HP",
            model="LaserJet Pro M404n",
            model_variants=["M404dn", "M404dw"],
            subsystem="Fuser Assembly"
        ),
        trigger=FlowTrigger(
            type="dtc",
            code="50.1",
            description="Fuser overheating fault detected by thermistor sensor."
        ),
        root_node_id="root",
        nodes={
            "root": FlowNode(
                node_id="root",
                node_type="question",
                content=FlowNodeContent(
                    text="Error Code 50.1 (Fuser Overheating) is displayed. Is the printer fuser power cable firmly connected to the fuser receptacle and the main unit?",
                    safety_note="CAUTION: Fuser area runs hot! Power off and cool unit for 20 minutes before inspecting wiring."
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes, cable is secure", next_node_id="fuser_test"),
                    FlowNodeBranch(condition="no", label="No, cable is loose or unplugged", next_node_id="plug_cable")
                ]
            ),
            "plug_cable": FlowNode(
                node_id="plug_cable",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="Reseat the fuser power connector and secure the locking clips."
                ),
                repair=FlowNodeRepair(
                    action="reseat",
                    verification_step="root"
                )
            ),
            "fuser_test": FlowNode(
                node_id="fuser_test",
                node_type="test_step",
                content=FlowNodeContent(
                    text="Turn off the printer, unplug the power cord, and measure the resistance across pins 1 and 2 of the fuser assembly. Is the resistance between 5 and 20 ohms?",
                    tools_required=["Digital Multimeter"],
                    estimated_time_minutes=10
                ),
                test=FlowNodeTest(
                    measurement_type="resistance",
                    component="Fuser Heating Element",
                    expected_value="5-20 ohms",
                    comparison="in_range"
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes (Reads 5-20 ohms)", next_node_id="control_board_test"),
                    FlowNodeBranch(condition="no", label="No (Reads open circuit / infinite ohms)", next_node_id="replace_fuser")
                ]
            ),
            "replace_fuser": FlowNode(
                node_id="replace_fuser",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="The heating element or thermal fuse is blown. Replace the fuser assembly."
                ),
                repair=FlowNodeRepair(
                    action="replace",
                    part_number="RM2-2585-000",
                    verification_step="fuser_test"
                )
            ),
            "control_board_test": FlowNode(
                node_id="control_board_test",
                node_type="test_step",
                content=FlowNodeContent(
                    text="Reconnect fuser. Turn on printer and check supply voltage from the power supply board to fuser pins during startup. Does it supply 110V AC?",
                    tools_required=["Digital Multimeter"],
                    safety_note="WARNING: Measuring active high voltage! Be extremely careful."
                ),
                test=FlowNodeTest(
                    measurement_type="voltage",
                    component="Low Voltage Power Supply",
                    expected_value="110V AC",
                    comparison="equals"
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes (110V AC supplied)", next_node_id="escalate_support"),
                    FlowNodeBranch(condition="no", label="No supply voltage detected", next_node_id="replace_lvps")
                ]
            ),
            "replace_lvps": FlowNode(
                node_id="replace_lvps",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="The power supply triac circuit is defective. Replace the Low Voltage Power Supply (LVPS) board."
                ),
                repair=FlowNodeRepair(
                    action="replace",
                    part_number="RM2-2560-000",
                    verification_step="control_board_test"
                )
            ),
            "escalate_support": FlowNode(
                node_id="escalate_support",
                node_type="escalation",
                content=FlowNodeContent(
                    text="Both fuser heating element and power supply tests passed. Escalate to engineering for logic board / sensor firmware diagnostics."
                ),
                escalation=FlowNodeEscalation(
                    escalate_to="certified_technician",
                    reason="Suspected engine control board logic failure or corrupted thermistor temperature calibration data."
                )
            )
        },
        metadata=FlowMetadata(
            version="1.0",
            source="HP LaserJet Service Manual Section 5.1",
            last_updated="2026-06-15",
            required_tools=["Digital Multimeter", "Screwdriver"],
            skill_level="trained_technician"
        )
    ),
    TroubleshootingFlow(
        flow_id="moss-router-pairing",
        title="Unpaired Mesh Node Setup",
        domain="scooter",
        equipment=FlowEquipment(
            manufacturer="Moss",
            model="Router X1",
            subsystem="Wireless Mesh Synchronization"
        ),
        trigger=FlowTrigger(
            type="symptom",
            description="Secondary mesh node displays a slowly pulsing amber light and won't connect."
        ),
        root_node_id="root",
        nodes={
            "root": FlowNode(
                node_id="root",
                node_type="question",
                content=FlowNodeContent(
                    text="The secondary node's LED is pulsing amber slowly, meaning it is in pairing mode. Have you placed the node in the same room (5-10 feet) as the primary router?"
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes, routers are close", next_node_id="trigger_sync"),
                    FlowNodeBranch(condition="no", label="No, they are in different rooms", next_node_id="move_routers")
                ]
            ),
            "move_routers": FlowNode(
                node_id="move_routers",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="Move the secondary mesh node into the same room as the primary router (within 5-10 feet) for initial pairing."
                ),
                repair=FlowNodeRepair(
                    action="adjust",
                    verification_step="root"
                )
            ),
            "trigger_sync": FlowNode(
                node_id="trigger_sync",
                node_type="instruction",
                content=FlowNodeContent(
                    text="Press and hold the Sync button on the back of the primary router for 3 seconds until its LED flashes blue, then press the Sync button on the secondary node. Wait 2 minutes. Did the LED turn solid blue or green?"
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes, LED is solid blue/green", next_node_id="paired_end"),
                    FlowNodeBranch(condition="no", label="No, LED continues to blink amber", next_node_id="check_amber_speed")
                ]
            ),
            "paired_end": FlowNode(
                node_id="paired_end",
                node_type="end",
                content=FlowNodeContent(
                    text="The secondary node has successfully synchronized. You may now move it to its permanent location."
                ),
                resolution_status="resolved"
            ),
            "check_amber_speed": FlowNode(
                node_id="check_amber_speed",
                node_type="question",
                content=FlowNodeContent(
                    text="Is the LED on the secondary router pulsing rapidly amber now?"
                ),
                branches=[
                    FlowNodeBranch(condition="yes", label="Yes, rapidly pulsing amber", next_node_id="power_cycle"),
                    FlowNodeBranch(condition="no", label="No, still pulsing slowly", next_node_id="hard_reset")
                ]
            ),
            "power_cycle": FlowNode(
                node_id="power_cycle",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="Rapid pulsing amber indicates a sync failure. Power off both the primary router and secondary node, wait 30 seconds, power them back on, and retry pairing."
                ),
                repair=FlowNodeRepair(
                    action="reset",
                    verification_step="trigger_sync"
                )
            ),
            "hard_reset": FlowNode(
                node_id="hard_reset",
                node_type="repair_action",
                content=FlowNodeContent(
                    text="The pairing state is locked. Press the reset pinhole button on the back of the secondary router for 10 seconds to factory reset it, wait for initialization, and try again."
                ),
                repair=FlowNodeRepair(
                    action="reset",
                    verification_step="root"
                )
            )
        },
        metadata=FlowMetadata(
            version="1.0",
            source="Moss Router User Manual v1",
            last_updated="2026-06-15",
            skill_level="diy"
        )
    )
]


class FlowStore:
    def __init__(self, flows_path: Path | None = None) -> None:
        self.flows_path = flows_path or BASE_DIR / "storage" / "flows.json"
        self._lock = Lock()
        self.flows_path.parent.mkdir(parents=True, exist_ok=True)
        self._seed_flows_if_needed()

    def list_flows(self, product_id: str | None = None) -> list[TroubleshootingFlow]:
        with self._lock:
            flows = self._read_flows_unlocked()
        
        if product_id:
            # Match by product_id inside equipment or match subdomain/subsystem
            product_id_normalized = product_id.lower().replace("-", " ")
            matched = []
            for flow in flows:
                # If equipment model or manufacturer matches product_id
                eq = flow.equipment
                if eq:
                    model_match = eq.model and eq.model.lower() in product_id_normalized
                    manu_match = eq.manufacturer and eq.manufacturer.lower() in product_id_normalized
                    id_match = (flow.flow_id.startswith(product_id) or product_id in flow.flow_id)
                    if model_match or manu_match or id_match:
                        matched.append(flow)
                elif product_id in flow.flow_id:
                    matched.append(flow)
            return matched
        return flows

    def get_flow(self, flow_id: str) -> TroubleshootingFlow:
        with self._lock:
            flows = self._read_flows_unlocked()
        for flow in flows:
            if flow.flow_id == flow_id:
                return flow
        raise NotFoundError(f"Troubleshooting flow not found: {flow_id}")

    def _seed_flows_if_needed(self) -> None:
        try:
            flows = self._read_flows_unlocked() if (self.flows_path.exists() and self.flows_path.stat().st_size > 0) else []
        except Exception:
            flows = []

        existing_ids = {f.flow_id for f in flows}
        added = False
        for f in SEED_FLOWS:
            if f.flow_id not in existing_ids:
                flows.append(f)
                added = True

        if added or not self.flows_path.exists() or self.flows_path.stat().st_size == 0:
            self._write_json_unlocked(self.flows_path, [f.model_dump() for f in flows])

    def _read_flows_unlocked(self) -> list[TroubleshootingFlow]:
        raw_flows = self._read_json_unlocked(self.flows_path, [])
        if not isinstance(raw_flows, list):
            return []
        return [TroubleshootingFlow(**item) for item in raw_flows if isinstance(item, dict)]

    @staticmethod
    def _read_json_unlocked(path: Path, default: object) -> object:
        if not path.exists() or path.stat().st_size == 0:
            return default
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _write_json_unlocked(path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(f"{path.suffix}.tmp")
        tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp_path.replace(path)


flow_store = FlowStore()
