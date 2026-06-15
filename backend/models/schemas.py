from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class KnowledgeDocument(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    metadata: dict[str, str] = Field(default_factory=dict)


class GithubImportRequest(BaseModel):
    owner: str = Field(..., min_length=1, examples=["owner"])
    repo: str = Field(..., min_length=1, examples=["repo"])


class ImportResponse(BaseModel):
    imported_count: int
    indexed_count: int
    index_name: str
    job_id: str | None = None
    import_id: str | None = None
    product_id: str | None = None
    message: str


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, examples=["Why is checkout slow?"])
    top_k: int = Field(default=10, ge=1, le=25)


class SearchResultItem(BaseModel):
    id: str
    text: str
    metadata: dict[str, str] = Field(default_factory=dict)
    score: float | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, examples=["Why was checkout rewritten?"])
    top_k: int = Field(default=10, ge=1, le=25)


class Source(BaseModel):
    source: str
    type: str
    url: str | None = None
    id: str | None = None
    citation: str | None = None
    title: str | None = None
    repo: str | None = None
    product_id: str | None = None
    product_name: str | None = None
    product_category: str | None = None
    score: float | None = None
    snippet: str | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


class ErrorResponse(BaseModel):
    detail: str
    error_type: str | None = None


class ImportStatus(BaseModel):
    import_id: str
    source: str
    status: str
    imported_count: int = 0
    indexed_count: int = 0
    index_name: str
    job_id: str | None = None
    repo: str | None = None
    filename: str | None = None
    product_id: str | None = None
    message: str
    error: str | None = None
    started_at: str
    finished_at: str | None = None


class ImportStatusResponse(BaseModel):
    active_imports: int
    last_import: ImportStatus | None = None
    imports: list[ImportStatus]


class RepositoryStats(BaseModel):
    repo: str
    total_documents: int
    issues: int = 0
    pull_requests: int = 0
    commits: int = 0
    last_import_id: str | None = None
    last_import_status: str | None = None


class RepositoryStatsResponse(BaseModel):
    repositories: list[RepositoryStats]


class ProductCreate(BaseModel):
    id: str | None = Field(default=None, min_length=1, examples=["moss-router-x1"])
    name: str = Field(..., min_length=1, examples=["Moss Router X1"])
    category: str = Field(..., min_length=1, examples=["Networking"])
    description: str = Field(..., min_length=1)
    image_url: str = Field(..., min_length=1)


class Product(BaseModel):
    id: str
    name: str
    category: str
    description: str
    image_url: str


class UrlKnowledgeRequest(BaseModel):
    url: HttpUrl
    title: str | None = Field(default=None, min_length=1)


class TextKnowledgeRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    text: str = Field(..., min_length=1)


class DiagnosticRequest(BaseModel):
    issue_description: str | None = Field(
        default=None,
        min_length=1,
        examples=["The device powers on but keeps dropping Wi-Fi every few minutes."],
    )
    session_id: str | None = Field(default=None, min_length=1)
    answer: str | None = Field(default=None, min_length=1)
    top_k: int = Field(default=8, ge=1, le=25)
    image_data: str | None = Field(default=None, min_length=1)
    image_mime_type: str | None = Field(default=None, min_length=1)


class DiagnosticReference(BaseModel):
    source: str
    type: str
    id: str | None = None
    title: str | None = None
    section: str | None = None
    page: str | None = None
    url: str | None = None
    score: float | None = None
    snippet: str | None = None


class DiagnosticCause(BaseModel):
    cause: str
    probability: float = Field(default=0.0, ge=0.0, le=1.0)
    status: str = Field(default="possible")
    evidence: str | None = None
    source: str | None = None
    elimination_reason: str | None = None


class DiagnosticVisualAnalysis(BaseModel):
    visible_items: list[str] = Field(default_factory=list)
    confidence: str = "low"
    relevance_to_issue: str | None = None
    additional_photos_required: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)


class DiagnosticSparePart(BaseModel):
    part_name: str
    part_number: str
    compatibility: str
    reason_replacement_may_be_needed: str
    documentation_source: str | None = None
    source_index: int | None = None


class DiagnosticResponse(BaseModel):
    session_id: str
    probable_causes: list[str]
    possible_causes: list[DiagnosticCause] = Field(default_factory=list)
    eliminated_causes: list[DiagnosticCause] = Field(default_factory=list)
    most_likely_cause: str | None = None
    confidence: str = "low"
    investigation_reasoning: str
    follow_up_question: str
    next_step: str
    recommended_action: str
    documentation_references: list[DiagnosticReference]
    visual_analysis: DiagnosticVisualAnalysis | None = None
    spare_parts: list[DiagnosticSparePart] = Field(default_factory=list)
    detected_product_id: str | None = None
    detected_product_name: str | None = None


def clean_metadata(metadata: dict[str, Any]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        cleaned[str(key)] = str(value)
    return cleaned


class FlowEquipment(BaseModel):
    manufacturer: str | None = None
    model: str | None = None
    model_variants: list[str] = Field(default_factory=list)
    subsystem: str | None = None


class FlowTrigger(BaseModel):
    type: str  # symptom, error_code, dtc, top_event, sensor_alarm
    code: str | None = None
    description: str


class FlowMetadata(BaseModel):
    version: str | None = None
    source: str | None = None
    last_updated: str | None = None
    safety_warnings: list[str] = Field(default_factory=list)
    required_tools: list[str] = Field(default_factory=list)
    skill_level: str | None = None  # diy, trained_technician, certified_specialist


class FlowNodeMedia(BaseModel):
    type: str  # image, video, diagram, pdf_page
    url: str
    caption: str | None = None


class FlowNodeContent(BaseModel):
    text: str
    expected_result: str | None = None
    media: list[FlowNodeMedia] = Field(default_factory=list)
    tools_required: list[str] = Field(default_factory=list)
    estimated_time_minutes: float | None = None
    safety_note: str | None = None


class FlowNodeTest(BaseModel):
    measurement_type: str | None = None  # voltage, resistance, pressure, temperature, code_read, visual, signal, flow, other
    component: str | None = None
    expected_value: str | None = None
    comparison: str | None = None


class FlowNodeGate(BaseModel):
    gate_type: str  # AND, OR, XOR, PRIORITY_AND, VOTING
    voting_threshold: int | None = None
    children: list[str] = Field(default_factory=list)


class FlowNodeCause(BaseModel):
    failure_mode: str | None = None
    probability: float | None = None
    frequency_rank: int | None = None


class FlowNodeBranch(BaseModel):
    condition: str
    label: str | None = None
    next_node_id: str


class FlowNodeRepair(BaseModel):
    action: str  # replace, repair, adjust, clean, reset, reseat, reprogram
    part_number: str | None = None
    verification_step: str | None = None


class FlowNodeEscalation(BaseModel):
    escalate_to: str  # certified_technician, safety_team, engineering_review, manufacturer_support
    reason: str | None = None


class FlowNodeSubRoutine(BaseModel):
    target_flow_id: str
    target_node_id: str | None = None


class FlowNode(BaseModel):
    node_id: str
    node_type: str  # question, test_step, instruction, gate, cause, repair_action, escalation, sub_routine_reference, end
    content: FlowNodeContent
    test: FlowNodeTest | None = None
    gate: FlowNodeGate | None = None
    cause: FlowNodeCause | None = None
    branches: list[FlowNodeBranch] = Field(default_factory=list)
    repair: FlowNodeRepair | None = None
    escalation: FlowNodeEscalation | None = None
    sub_routine: FlowNodeSubRoutine | None = None
    resolution_status: str | None = None


class TroubleshootingFlow(BaseModel):
    flow_id: str
    title: str
    domain: str  # automotive, scooter, appliance, hvac, industrial, other
    equipment: FlowEquipment | None = None
    trigger: FlowTrigger
    root_node_id: str
    nodes: dict[str, FlowNode]
    metadata: FlowMetadata | None = None
