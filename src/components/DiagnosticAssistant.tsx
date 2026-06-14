"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiagnosticResponse, ProductView, DiagnosticReference } from "@/lib/types";

type Message = {
  role: "ai" | "user";
  text: string;
  citation?: string;
  snippet?: string | null;
  section?: string | null;
  page?: string | null;
  citations?: DiagnosticReference[];
  followUp?: string;
  detectedProductId?: string | null;
  detectedProductName?: string | null;
};

const defaultQuickReplies = ["Horizontal bands", "Random light patches", "Faded edges only"];

export function DiagnosticAssistant({
  product,
  initialIssue,
  allProducts = [],
}: {
  product: ProductView | null;
  initialIssue?: string;
  allProducts?: ProductView[];
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState(initialIssue ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse | null>(null);
  const [dynamicDocs, setDynamicDocs] = useState<any[]>([]);
  
  // Load dynamic knowledge documents for this product
  useEffect(() => {
    if (product) {
      void fetch(`/api/products/${product.id}/knowledge`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDynamicDocs(data);
        })
        .catch(err => console.error("Failed to load diagnostic manuals", err));
    }
  }, [product]);

  const [messages, setMessages] = useState<Message[]>(() => {
    if (product) {
      if (initialIssue) {
        return [
          {
            role: "ai",
            text: `I'm analyzing the ${product.name}. Tell me exactly what you're seeing: when it happens, what the output looks like, and any error lights.`,
          },
        ];
      } else {
        return [
          {
            role: "ai",
            text: `I'm analyzing the ${product.name}. Tell me exactly what you're seeing: when it happens, what the output looks like, and any error lights.`,
          },
          {
            role: "ai",
            text: "Intermittent symptoms narrow this significantly. I am tracking likely causes against indexed product documentation and will ask targeted follow-up questions.",
            citation: "📄 Service Manual · Troubleshooting",
            followUp: "Describe the symptom in as much detail as you can.",
          },
        ];
      }
    } else {
      // Global diagnostic mode initial messages
      return [
        {
          role: "ai",
          text: "I am FixPilot's Global Support Router. Describe the symptoms or product you are having trouble with, and I will search our comprehensive support manuals to diagnose the issue.",
        },
        {
          role: "ai",
          text: "I scan across all registered products to match your problem with the correct technical troubleshooting guide.",
          followUp: "Please describe the problem you are experiencing in detail.",
        },
      ];
    }
  });

  useEffect(() => {
    if (initialIssue && !sessionId && messages.length === 1) {
      void submit(initialIssue);
    }
  }, [initialIssue]);

  const causes = useMemo(() => {
    if (!product) {
      return [
        { name: "Awaiting symptom analysis...", confidence: 0, color: "var(--text-muted)", eliminated: false }
      ];
    }
    if (diagnostic?.probable_causes.length) {
      return diagnostic.probable_causes.map((cause, index) => ({
        name: cause,
        confidence: [72, 58, 31, 18][index] ?? Math.max(12, 72 - index * 14),
        color: index === 0 ? "var(--amber)" : index === 1 ? "var(--indigo)" : "var(--text-muted)",
        eliminated: false,
      }));
    }

    // Default placeholders matching product categories
    const isPrinter = product.id.includes("printer") || product.id.includes("laserjet");
    if (isPrinter) {
      return [
        { name: "Drum contamination", confidence: 72, color: "var(--amber)", eliminated: false },
        { name: "Fuser temperature", confidence: 58, color: "var(--indigo)", eliminated: false },
        { name: "Toner defect", confidence: 31, color: "var(--text-muted)", eliminated: false },
        { name: "Paper moisture", confidence: 5, color: "var(--text-muted)", eliminated: true },
      ];
    }
    
    return [
      { name: "Connection backhaul drop", confidence: 64, color: "var(--amber)", eliminated: false },
      { name: "IP lease collision", confidence: 45, color: "var(--indigo)", eliminated: false },
      { name: "Firmware mismatch", confidence: 22, color: "var(--text-muted)", eliminated: false },
    ];
  }, [diagnostic, product]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setInput("");
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      let payload: DiagnosticResponse;

      if (product) {
        // Product-specific diagnostic
        const response = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            sessionId,
            issue: sessionId ? undefined : trimmed,
            answer: sessionId ? trimmed : undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || `API error: ${response.status}`);
        }
        payload = (await response.json()) as DiagnosticResponse;
      } else {
        // Global cross-product diagnostic router
        const response = await fetch("/api/diagnose/global", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            issue_description: trimmed,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || `API error: ${response.status}`);
        }
        payload = (await response.json()) as DiagnosticResponse;
      }

      setDiagnostic(payload);
      setSessionId(payload.session_id);
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: payload.investigation_reasoning || payload.next_step || payload.recommended_action,
          citation: payload.documentation_references[0]?.title || undefined,
          snippet: payload.documentation_references[0]?.snippet || null,
          section: payload.documentation_references[0]?.section || null,
          page: payload.documentation_references[0]?.page || null,
          citations: payload.documentation_references,
          followUp: payload.follow_up_question,
          detectedProductId: payload.detected_product_id,
          detectedProductName: payload.detected_product_name,
        },
      ]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Connection failed";
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: `Diagnostic API call failed: ${errorMsg}. Please ensure the backend is running and healthy.`,
          followUp: "Try submitting again once the service is available.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const quickReplies = product 
    ? (product.commonIssues?.slice(0, 3) || defaultQuickReplies)
    : ["My mesh node won't connect", "LaserJet printer jam in Tray 2", "Air Conditioner water leak"];

  return (
    <>
      <div className="page-kicker">{product ? "Product Diagnostics" : "Global Router"}</div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">
            {product ? `Investigating ${product.name}` : "Support Engineering Desk"}
          </h1>
          <p className="page-desc">
            {product
              ? `Guided troubleshooting based on indexed manuals, schematics, and field reports for the ${product.name}.`
              : "Search across our entire hardware line using smart symptom routing and documentation indexing."}
          </p>
        </div>
      </div>

      <div className="mock-diagnostic">
        <InvestigationThread 
          activeStep={diagnostic ? 4 : initialIssue ? 3 : 2} 
          isGlobal={!product}
          product={product}
          dynamicDocs={dynamicDocs}
          onSubmit={submit}
        />
        
        <section className="mock-diag-chat">
          <div className="mock-diag-chat-header">
            <div className="mock-diag-product-badge">
              <div className="mock-diag-product-icon">
                {product ? product.emoji : "🔍"}
              </div>
              <div>
                <div className="mock-diag-product-name">
                  {product ? product.name : "Global Support Router"}
                </div>
                <div className="mock-diag-product-mfg">
                  {product 
                    ? `${product.company} · Session #${sessionId?.slice(0, 7).toUpperCase() ?? "DX-2047"}` 
                    : `Multi-Device Context · Session #${sessionId?.slice(0, 7).toUpperCase() ?? "GLOBAL"}`}
                </div>
              </div>
            </div>
            <div className="mock-diag-sessions">
              <span style={{ color: "var(--teal)" }}>●</span> Live · {product ? product.sessions.toLocaleString() : "All"} sessions
            </div>
          </div>

          <div className="mock-chat-msgs">
            {messages.map((message, index) => (
              <ChatMessage message={message} key={`${message.role}-${index}`} />
            ))}
            {isLoading && (
              <ChatMessage
                message={{
                  role: "ai",
                  text: "Analyzing indexed documentation with Moss...",
                  citation: "Retrieval engine searching...",
                }}
              />
            )}
          </div>

          <form
            className="mock-chat-input-area"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input);
            }}
          >
            <div className="quick-replies">
              {quickReplies.map((reply) => (
                <button className="quick-reply" key={reply} onClick={() => void submit(reply)} type="button">
                  {reply}
                </button>
              ))}
            </div>
            <div className="mock-chat-input-row">
              <textarea
                className="mock-chat-input"
                onChange={(event) => setInput(event.target.value)}
                placeholder={product ? "Describe symptom in detail..." : "Describe symptoms or enter product name..."}
                rows={1}
                value={input}
              />
              <span style={{ color: "var(--text-muted)", fontSize: 14 }}>📎</span>
              <button className="mock-send-btn" disabled={isLoading} type="submit">
                ↑
              </button>
            </div>
          </form>
        </section>
        
        <AnalysisPanel causes={causes} diagnostic={diagnostic} isGlobal={!product} />
      </div>
    </>
  );
}

function InvestigationThread({ 
  activeStep, 
  isGlobal, 
  product, 
  dynamicDocs,
  onSubmit 
}: { 
  activeStep: number; 
  isGlobal: boolean; 
  product: ProductView | null;
  dynamicDocs: any[];
  onSubmit: (text: string) => void;
}) {
  const steps = isGlobal ? [
    ["Symptom Intake", "Analyzing global problem description."],
    ["Cross-Product Search", "Scanning documentation across registered products."],
    ["Device Routing", "Determining hardware guide context matches."],
    ["Inspection Selection", "Awaiting redirection to diagnostic console."],
  ] : [
    ["Symptom Intake", "Identifying initial hardware symptom details."],
    ["Cause Generation", "Scanning documentation chunks for probable causes."],
    ["Clarification", "Narrowing down failure points via targeted queries."],
    ["Inspection Action", "Executing recommended technician checks."],
    ["Elimination Phase", "Ruling out non-applicable failure causes."],
    ["Root Cause Found", "—"],
  ];

  return (
    <aside className="mock-diag-left">
      {/* Product Summary Card (Critical Issue 7) */}
      {product && (
        <div className="mock-product-details-card" style={{
          marginBottom: "16px",
          padding: "14px",
          borderRadius: "10px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "28px" }}>{product.emoji}</div>
            <div>
              <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>{product.name}</h3>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: "3px" }}>
                {product.category}
              </span>
            </div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "4px 0", lineHeight: "1.4" }}>
            {product.description}
          </p>
          
          {/* Suggested Issues */}
          <div style={{ marginTop: "6px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>Suggested Issues</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {product.commonIssues?.slice(0, 3).map(issue => (
                <button 
                  key={issue} 
                  type="button" 
                  onClick={() => onSubmit(issue)}
                  style={{
                    textAlign: "left",
                    padding: "4px 6px",
                    fontSize: "10.5px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: "5px",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  className="suggested-issue-btn"
                >
                  🔍 {issue}
                </button>
              ))}
            </div>
          </div>
          
          {/* Indexed Manuals */}
          <div style={{ marginTop: "6px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>Indexed Manuals</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {product.documentation?.slice(0, 2).map((doc, i) => (
                <div key={`static-${i}`} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                  <span>{doc.icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.name}>{doc.name}</span>
                </div>
              ))}
              {dynamicDocs.map((doc, i) => (
                <div key={`dynamic-${i}`} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                  <span>{doc.type === "pdf" ? "📄" : doc.type === "url" ? "🌐" : "📝"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.title}>{doc.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mock-diag-left-header">
        <div className="mock-diag-left-title">Diagnostic Process</div>
        <div className="mock-diag-status" style={isGlobal ? { background: "var(--violet-glow)", color: "var(--violet-light)", borderColor: "rgba(124,58,237,0.3)" } : undefined}>
          {isGlobal ? "Routing Console" : `Technician Phase ${activeStep}`}
        </div>
      </div>
      <div className="mock-thread">
        {steps.map(([label, text], index) => {
          const step = index + 1;
          const state = step < activeStep ? "done" : step === activeStep ? "active" : "pending";
          return (
            <div className="mock-thread-item" key={label}>
              <div className="mock-thread-line-wrap">
                <div className={`mock-thread-dot ${state}`} />
                {index < steps.length - 1 && (
                  <div className={`mock-thread-connector ${step < activeStep ? "done" : ""}`} />
                )}
              </div>
              <div className="mock-thread-body">
                <div className={`mock-thread-step ${state === "pending" ? "" : state}`}>{label}</div>
                <div className="mock-thread-text">{state === "pending" && step > 3 ? "—" : text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`mock-msg ${isUser ? "user" : ""}`}>
      <div className={`mock-avatar ${isUser ? "user" : "ai"}`}>{isUser ? "U" : "⚙️"}</div>
      <div style={{ width: "100%", maxWidth: isUser ? "80%" : "90%" }}>
        <div className={`mock-bubble ${isUser ? "user" : "ai"}`} style={{ width: "100%" }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
          
          {/* Multiple Citations Evidence block (Critical Issue 8) */}
          {message.citations && message.citations.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <details style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                overflow: "hidden"
              }}>
                <summary style={{
                  padding: "8px 12px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--violet-light)",
                  userSelect: "none"
                }}>
                  📖 View Documentation Evidence ({message.citations.length})
                </summary>
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border)" }}>
                  {message.citations.map((ref, i) => (
                    <div key={i} style={{
                      paddingBottom: i < (message.citations?.length ?? 0) - 1 ? "8px" : "0",
                      borderBottom: i < (message.citations?.length ?? 0) - 1 ? "1px dashed var(--border)" : "none"
                    }}>
                      <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                        <span style={{ color: "var(--text-primary)" }}>📘 {ref.title}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                          {ref.section ? `${ref.section}` : ""}
                          {ref.page ? ` · Page ${ref.page}` : ""}
                        </span>
                      </div>
                      {ref.snippet && (
                        <div style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "11px", marginTop: "2px" }}>
                          "{ref.snippet}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {message.detectedProductId && message.detectedProductName && (
            <div style={{
              marginTop: "16px",
              padding: "14px",
              borderRadius: "10px",
              background: "var(--bg-elevated)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>⚙️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-primary)" }}>
                    {message.detectedProductName}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Identified device matches symptom profile
                  </div>
                </div>
              </div>
              <Link
                href={`/diagnostic?productId=${message.detectedProductId}&issue=${encodeURIComponent(message.detectedProductName)}`}
                className="mock-fix-btn"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "8px 12px",
                  background: "linear-gradient(135deg, var(--violet), var(--violet-light))",
                  color: "white",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "12.5px",
                  boxShadow: "0 2px 8px rgba(124,58,237,0.3)"
                }}
              >
                ⚡ Open {message.detectedProductName} Diagnostics →
              </Link>
            </div>
          )}
        </div>
        {message.followUp && (
          <div className="mock-followup">
            <div className="mock-followup-label">⚡ Follow-up needed</div>
            {message.followUp}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisPanel({
  causes,
  diagnostic,
  isGlobal,
}: {
  causes: Array<{ name: string; confidence: number; color: string; eliminated: boolean }>;
  diagnostic: DiagnosticResponse | null;
  isGlobal: boolean;
}) {
  const inspections = diagnostic
    ? [diagnostic.next_step, diagnostic.recommended_action].filter(Boolean)
    : isGlobal 
      ? ["Input your symptoms to filter catalog", "Identify which device model matches query"]
      : ["Perform check of cable interface", "Inspect LED indicators for status color"];
      
  const references = diagnostic?.documentation_references.length
    ? diagnostic.documentation_references.slice(0, 3)
    : [];

  return (
    <aside className="mock-diag-right">
      <div className="mock-panel-section">
        <div className="mock-panel-title">Suspected Causes</div>
        {isGlobal && !diagnostic ? (
          <div style={{ color: "var(--text-muted)", fontSize: "12px", padding: "8px 0" }}>
            Awaiting symptom description to cross-reference guides.
          </div>
        ) : (
          causes.map((cause) => (
            <div className="mock-cause-item" key={cause.name} style={{ opacity: cause.eliminated ? 0.5 : 1 }}>
              <div
                className="mock-cause-name"
                style={{
                  color: cause.eliminated ? "var(--text-muted)" : undefined,
                  textDecoration: cause.eliminated ? "line-through" : undefined,
                }}
              >
                {cause.name}
              </div>
              <div className="mock-cause-bar-wrap">
                <div
                  className="mock-cause-bar"
                  style={{ width: `${cause.confidence}%`, background: cause.color }}
                />
              </div>
              <div className="mock-cause-conf">
                {cause.eliminated ? (
                  <span style={{ color: "var(--red)" }}>✕ Eliminated</span>
                ) : (
                  <>
                    Confidence: <span>{cause.confidence}%</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mock-panel-section">
        <div className="mock-panel-title">Recommended Inspections</div>
        {inspections.map((inspection, index) => (
          <div className="mock-inspect-item" key={inspection}>
            <div className="mock-inspect-num">{index + 1}</div>
            <div className="mock-inspect-text">{inspection}</div>
          </div>
        ))}
      </div>

      <div className="mock-panel-section">
        <div className="mock-panel-title">Source Citations</div>
        {isGlobal && !diagnostic ? (
          <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Citations will appear when matching references are found in manuals.
          </div>
        ) : references.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            No matching documents cited yet.
          </div>
        ) : (
          references.map((reference, index) => (
            <div className="mock-doc-ref" key={`${reference.title}-${index}`}>
              <div className="mock-doc-icon">📘</div>
              <div className="mock-doc-info" style={{ minWidth: 0, flex: 1 }}>
                <div className="mock-doc-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={reference.title || "Manual"}>
                  {reference.title ?? "Product manual"}
                </div>
                <div className="mock-doc-page" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  {reference.section ? `${reference.section}` : ""}
                  {reference.page ? ` · Page ${reference.page}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
