"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiagnosticResponse, ProductView, DiagnosticReference, DiagnosticVisualAnalysis } from "@/lib/types";

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
  visualAnalysis?: DiagnosticVisualAnalysis | null;
  imageName?: string | null;
};

type CauseView = {
  name: string;
  confidence: number;
  color: string;
  eliminated: boolean;
  evidence?: string | null;
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
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  // Voice integration states
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"continuous" | "ptt">("continuous");
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isVoiceActiveRef = useRef(false);
  const voiceModeRef = useRef<"continuous" | "ptt">("continuous");
  const isSpeakingRef = useRef(false);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    isVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Speech Recognition Initializer
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onend = () => {
      setIsListening(false);
      // Continuous mode restart logic
      if (
        isVoiceActiveRef.current &&
        voiceModeRef.current === "continuous" &&
        !isSpeakingRef.current &&
        !isLoadingRef.current
      ) {
        try {
          rec.start();
        } catch (e) {}
      }
    };

    rec.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      if (result.isFinal) {
        const transcript = result[0].transcript;
        if (transcript && transcript.trim()) {
          void submit(transcript);
        }
      }
    };

    rec.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  
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

  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (initialIssue && !sessionId && messages.length === 0) {
      void submit(initialIssue);
    }
  }, [initialIssue]);

  const causes = useMemo(() => {
    if (!product && !diagnostic) {
      return [
        { name: "Awaiting symptom analysis...", confidence: 0, color: "var(--text-muted)", eliminated: false }
      ];
    }
    if (diagnostic) {
      const possibleCauses = diagnostic.possible_causes ?? [];
      const eliminatedCauses = diagnostic.eliminated_causes ?? [];
      if (possibleCauses.length > 0 || eliminatedCauses.length > 0) {
        return [...possibleCauses, ...eliminatedCauses].map((cause, index) => {
          const eliminated = cause.status === "eliminated";
          const confidence = Math.round((cause.probability || 0) * 100);
          return {
            name: cause.cause,
            confidence,
            color: eliminated ? "var(--red)" : index === 0 ? "var(--amber)" : index === 1 ? "var(--indigo)" : "var(--text-muted)",
            eliminated,
            evidence: eliminated ? cause.elimination_reason || cause.evidence : cause.evidence,
          };
        });
      }
      if (diagnostic.probable_causes && diagnostic.probable_causes.length > 0) {
        return diagnostic.probable_causes.map((cause, index) => ({
          name: cause,
          confidence: [72, 58, 31, 18][index] ?? Math.max(12, 72 - index * 14),
          color: index === 0 ? "var(--amber)" : index === 1 ? "var(--indigo)" : "var(--text-muted)",
          eliminated: false,
        }));
      } else {
        return [];
      }
    }

    return [
      { name: "Awaiting symptom analysis...", confidence: 0, color: "var(--text-muted)", eliminated: false }
    ];
  }, [diagnostic, product]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && !imageData) || isLoading) return;

    setIsLoading(true);
    setInput("");
    const submittedImageName = imageName;
    const submittedImageData = imageData;
    const submittedImageMimeType = imageMimeType;
    const submittedText = trimmed || "Uploaded diagnostic photo";
    setImageData(null);
    setImageMimeType(null);
    setImageName(null);
    setMessages((current) => [...current, { role: "user", text: submittedText, imageName: submittedImageName }]);

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
            issue: sessionId ? undefined : submittedText,
            answer: sessionId ? submittedText : undefined,
            imageData: submittedImageData,
            imageMimeType: submittedImageMimeType,
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
            issue_description: submittedText,
            imageData: submittedImageData,
            imageMimeType: submittedImageMimeType,
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
          visualAnalysis: payload.visual_analysis,
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

  function handleImageSelect(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: "Please attach an image file for visual inspection.",
        },
      ]);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageData(reader.result);
        setImageMimeType(file.type);
        setImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
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
          <div style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: product ? "rgba(12, 184, 172, 0.08)" : "rgba(124, 58, 237, 0.08)",
            color: product ? "var(--teal)" : "var(--violet-light)",
          }}>
            {product ? (
              <>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)" }} />
                ISO PRODUCT MODE: strictly grounded in {product.name} manuals
              </>
            ) : (
              <>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--violet-light)", boxShadow: "0 0 8px var(--violet-light)" }} />
                GLOBAL ROUTER MODE: searching all corporate knowledge
              </>
            )}
          </div>
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
            {messages.length === 0 ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                minHeight: "280px",
                textAlign: "center",
                color: "var(--text-secondary)",
                padding: "20px"
              }}>
                <div style={{ fontSize: "40px", marginBottom: "16px", animation: "float 4s ease-in-out infinite" }}>👋</div>
                <h3 style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "16px", marginBottom: "8px" }}>
                  {product ? `Need help with your ${product.name}?` : "How can I help today?"}
                </h3>
                <p style={{ fontSize: "13px", maxWidth: "420px", lineHeight: "1.55", margin: 0, color: "var(--text-secondary)" }}>
                  {product 
                    ? "Describe your issue or ask an educational question about this product. I will search the indexed manuals to assist you."
                    : "Describe your hardware symptoms or ask a conceptual question, and I will search across all registered product guides."}
                </p>
                <div style={{ marginTop: "24px", fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Type a question below to start a diagnostic or learning session
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage message={message} key={`${message.role}-${index}`} />
              ))
            )}
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
  causes: CauseView[];
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
        ) : causes.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: "11.5px", padding: "8px 0", fontStyle: "italic" }}>
            Educational Session · No active hardware fault detected.
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
              {cause.evidence && (
                <div style={{ color: "var(--text-muted)", fontSize: "10.5px", lineHeight: 1.35, marginTop: "4px" }}>
                  {cause.evidence}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mock-panel-section">
        <div className="mock-panel-title">Recommended Inspections</div>
        {diagnostic && diagnostic.probable_causes.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: "11.5px", padding: "8px 0", fontStyle: "italic" }}>
            No diagnostic inspections required.
          </div>
        ) : (
          inspections.map((inspection, index) => (
            <div className="mock-inspect-item" key={inspection}>
              <div className="mock-inspect-num">{index + 1}</div>
              <div className="mock-inspect-text">{inspection}</div>
            </div>
          ))
        )}
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

      {diagnostic?.spare_parts && diagnostic.spare_parts.length > 0 && (
        <div className="mock-panel-section" style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "12px" }}>
          <div className="mock-panel-title">🔧 Recommended Spare Parts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {diagnostic.spare_parts.map((part, index) => (
              <div
                key={`${part.part_name}-${index}`}
                style={{
                  padding: "10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-elevated)",
                  fontSize: "11px",
                  lineHeight: "1.4",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                  <span>🛠️ {part.part_name}</span>
                  <span style={{ color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>{part.part_number}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>
                  <strong>Compatibility:</strong> {part.compatibility}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>
                  <strong>Reason:</strong> {part.reason_replacement_may_be_needed}
                </div>
                {part.documentation_source && (
                  <div style={{ marginTop: "6px", fontSize: "9.5px", color: "var(--violet-light)", fontStyle: "italic", borderTop: "1px dashed var(--border)", paddingTop: "4px" }}>
                    📖 Source: {part.documentation_source}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
