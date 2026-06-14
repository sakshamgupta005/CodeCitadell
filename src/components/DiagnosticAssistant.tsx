"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagnosticResponse, ProductView } from "@/lib/types";

type Message = {
  role: "ai" | "user";
  text: string;
  citation?: string;
  followUp?: string;
};

const defaultQuickReplies = ["Horizontal bands", "Random light patches", "Faded edges only"];

export function DiagnosticAssistant({
  product,
  initialIssue,
}: {
  product: ProductView;
  initialIssue?: string;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState(initialIssue ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
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
          text:
            "Intermittent symptoms narrow this significantly. I am tracking likely causes against indexed product documentation and will ask targeted follow-up questions.",
          citation: "📄 Service Manual · Troubleshooting",
          followUp: "Describe the symptom in as much detail as you can.",
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
    if (diagnostic?.probable_causes.length) {
      return diagnostic.probable_causes.map((cause, index) => ({
        name: cause,
        confidence: [72, 58, 31, 18][index] ?? Math.max(12, 72 - index * 14),
        color: index === 0 ? "var(--amber)" : index === 1 ? "var(--indigo)" : "var(--text-muted)",
        eliminated: false,
      }));
    }

    return [
      { name: "Drum contamination", confidence: 72, color: "var(--amber)", eliminated: false },
      { name: "Fuser temperature", confidence: 58, color: "var(--indigo)", eliminated: false },
      { name: "Toner defect", confidence: 31, color: "var(--text-muted)", eliminated: false },
      { name: "Paper moisture", confidence: 5, color: "var(--text-muted)", eliminated: true },
    ];
  }, [diagnostic]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setInput("");
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
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

      const payload = (await response.json()) as DiagnosticResponse;
      setDiagnostic(payload);
      setSessionId(payload.session_id);
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: payload.next_step || payload.recommended_action,
          citation: payload.documentation_references[0]?.title
            ? `📄 ${payload.documentation_references[0].title}`
            : "📄 Indexed product docs",
          followUp: payload.follow_up_question,
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

  return (
    <>
      <div className="page-kicker">Diagnostic Assistant</div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Investigation thread, live evidence.</h1>
          <p className="page-desc">
            The assistant shows its reasoning path, asks clarifying questions, and keeps citations
            visible while it narrows the root cause.
          </p>
        </div>
      </div>

      <div className="mock-diagnostic">
        <InvestigationThread activeStep={diagnostic ? 4 : initialIssue ? 3 : 2} />
        <section className="mock-diag-chat">
          <div className="mock-diag-chat-header">
            <div className="mock-diag-product-badge">
              <div className="mock-diag-product-icon">{product.emoji}</div>
              <div>
                <div className="mock-diag-product-name">{product.name}</div>
                <div className="mock-diag-product-mfg">
                  {product.company} · Session #{sessionId?.slice(0, 7).toUpperCase() ?? "DX-2047"}
                </div>
              </div>
            </div>
            <div className="mock-diag-sessions">
              <span style={{ color: "var(--teal)" }}>●</span> Live · {product.sessions.toLocaleString()} sessions
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
                  text: "Analyzing indexed documentation...",
                  citation: "Moss retrieval active",
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
              {defaultQuickReplies.map((reply) => (
                <button className="quick-reply" key={reply} onClick={() => void submit(reply)} type="button">
                  {reply}
                </button>
              ))}
            </div>
            <div className="mock-chat-input-row">
              <textarea
                className="mock-chat-input"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe what you observe..."
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
        <AnalysisPanel causes={causes} diagnostic={diagnostic} />
      </div>
    </>
  );
}

function InvestigationThread({ activeStep }: { activeStep: number }) {
  const steps = [
    ["Symptom Intake", "Faded print + no warning light. Intermittent."],
    ["Cause Generation", "4 possible causes identified from manuals."],
    ["Question Phase", "Clarifying pattern and frequency to narrow causes."],
    ["Inspection", "Recommended checks are being assembled."],
    ["Cause Elimination", "Awaiting more evidence."],
    ["Root Cause", "—"],
    ["Resolution", "—"],
  ];

  return (
    <aside className="mock-diag-left">
      <div className="mock-diag-left-header">
        <div className="mock-diag-left-title">Investigation Thread</div>
        <div className="mock-diag-status">Analyzing · Phase {activeStep}</div>
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
                <div className="mock-thread-text">{state === "pending" && step > 4 ? "—" : text}</div>
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
      <div className={`mock-avatar ${isUser ? "user" : "ai"}`}>{isUser ? "U" : "🧠"}</div>
      <div>
        <div className={`mock-bubble ${isUser ? "user" : "ai"}`}>
          {message.text}
          {message.citation && <div className="mock-bubble-citation">{message.citation}</div>}
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
}: {
  causes: Array<{ name: string; confidence: number; color: string; eliminated: boolean }>;
  diagnostic: DiagnosticResponse | null;
}) {
  const inspections = diagnostic
    ? [diagnostic.next_step, diagnostic.recommended_action].filter(Boolean)
    : ["Print a drum test page via Settings > Reports", "Remove drum unit and check for streaks"];
  const references = diagnostic?.documentation_references.length
    ? diagnostic.documentation_references.slice(0, 2)
    : [
        { title: "Service Manual", snippet: "pp. 47-49 · Drum Unit" },
        { title: "User Guide", snippet: "p. 112 · Fuser Assembly" },
      ];

  return (
    <aside className="mock-diag-right">
      <div className="mock-panel-section">
        <div className="mock-panel-title">Suspected Causes</div>
        {causes.map((cause) => (
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
        ))}
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
        {references.map((reference, index) => (
          <div className="mock-doc-ref" key={`${reference.title}-${index}`}>
            <div className="mock-doc-icon">📘</div>
            <div className="mock-doc-info">
              <div className="mock-doc-title">{reference.title ?? "Indexed source"}</div>
              <div className="mock-doc-page">{reference.snippet ?? "Product documentation"}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
