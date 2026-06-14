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
  url?: string | null;
  score?: number | null;
  snippet?: string | null;
};

export type DiagnosticResponse = {
  session_id: string;
  probable_causes: string[];
  follow_up_question: string;
  next_step: string;
  recommended_action: string;
  documentation_references: DiagnosticReference[];
};
