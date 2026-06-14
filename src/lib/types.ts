export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  image_url: string;
};

export type ProductView = Product & {
  emoji: string;
  company: string;
  model?: string;
  docs: number;
  sessions: number;
  resolutionRate: number;
  manufacturer: string;
  year: string;
  productType: string;
  featured?: boolean;
  commonIssues?: string[];
  documentation?: Array<{ icon: string; name: string; meta: string; featured?: boolean }>;
  brand?: string;
  price?: number;
  rating?: number;
};

export type ImportStatus = {
  import_id: string;
  source: string;
  status: string;
  imported_count: number;
  indexed_count: number;
  index_name: string;
  product_id?: string | null;
  message: string;
  started_at: string;
  finished_at?: string | null;
};

export type ImportStatusResponse = {
  active_imports: number;
  last_import: ImportStatus | null;
  imports: ImportStatus[];
};

export type DiagnosticReference = {
  source: string;
  type: string;
  id?: string | null;
  title?: string | null;
  section?: string | null;
  page?: string | null;
  url?: string | null;
  score?: number | null;
  snippet?: string | null;
};

export type DiagnosticCause = {
  cause: string;
  probability: number;
  status: "possible" | "eliminated" | "confirmed" | string;
  evidence?: string | null;
  source?: string | null;
  elimination_reason?: string | null;
};

export type DiagnosticVisualAnalysis = {
  visible_items: string[];
  confidence: "low" | "medium" | "high" | string;
  relevance_to_issue?: string | null;
  additional_photos_required: string[];
  safety_notes: string[];
};

export type DiagnosticSparePart = {
  part_name: string;
  part_number: string;
  compatibility: string;
  reason_replacement_may_be_needed: string;
  documentation_source?: string | null;
  source_index?: number | null;
};

export type DiagnosticResponse = {
  session_id: string;
  probable_causes: string[];
  possible_causes?: DiagnosticCause[];
  eliminated_causes?: DiagnosticCause[];
  most_likely_cause?: string | null;
  confidence?: "low" | "medium" | "high" | string;
  investigation_reasoning: string;
  follow_up_question: string;
  next_step: string;
  recommended_action: string;
  documentation_references: DiagnosticReference[];
  visual_analysis?: DiagnosticVisualAnalysis | null;
  detected_product_id?: string | null;
  detected_product_name?: string | null;
  spare_parts?: DiagnosticSparePart[];
};
