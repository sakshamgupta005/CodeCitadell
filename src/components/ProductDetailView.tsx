"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/design-data";
import type { ProductView } from "@/lib/types";
import { updateProduct, deleteProduct } from "@/lib/api";

export function ProductDetailView({ product }: { product: ProductView }) {
  const router = useRouter();
  const [dynamicDocs, setDynamicDocs] = useState<any[]>([]);
  const [activeModal, setActiveModal] = useState<"upload" | "edit-product" | null>(null);
  const [viewDoc, setViewDoc] = useState<any | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<"pdf" | "text" | "url">("pdf");
  
  // Form States
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  // Edit Product Form States
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState("");
  const [prodDescription, setProdDescription] = useState("");
  const [prodImageUrl, setProdImageUrl] = useState("");
  const [isSubmittingProd, setIsSubmittingProd] = useState(false);
  const [prodError, setProdError] = useState("");

  const fetchDocs = async () => {
    try {
      const res = await fetch(`/api/products/${product.id}/knowledge`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDynamicDocs(data);
        }
      }
    } catch (err) {
      console.error("Failed to load product page manuals", err);
    }
  };

  useEffect(() => {
    void fetchDocs();
  }, [product.id]);

  const allDocs = [
    ...(product.documentation || []).map(d => ({
      icon: d.icon,
      name: d.name,
      meta: d.meta,
      featured: d.featured,
      isCustom: false,
      type: "text",
      sourceId: "",
      created_at: null
    })),
    ...dynamicDocs.map(d => ({
      icon: d.type === "pdf" ? "📄" : d.type === "url" ? "🌐" : "📝",
      name: d.title,
      meta: `${d.chunk_count} chunks`,
      featured: false,
      isCustom: true,
      type: d.type,
      sourceId: d.source_id,
      created_at: d.created_at,
      chunks: d.chunks || []
    }))
  ];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setUploading(true);

    try {
      if (uploadType === "pdf") {
        if (!file) throw new Error("Please select a PDF file.");
        const formData = new FormData();
        formData.append("file", file);
        if (title.trim()) {
          formData.append("title", title.trim());
        }
        const res = await fetch(`/api/products/${product.id}/knowledge/pdf`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.detail || "Failed to upload PDF.");
        }
      } else if (uploadType === "text") {
        if (!title.trim()) throw new Error("Title is required for text documents.");
        if (!text.trim()) throw new Error("Text content is required.");
        const formData = new FormData();
        formData.append("title", title.trim());
        formData.append("text", text.trim());
        const res = await fetch(`/api/products/${product.id}/knowledge/text`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.detail || "Failed to upload text document.");
        }
      } else if (uploadType === "url") {
        if (!url.trim()) throw new Error("URL is required.");
        const res = await fetch(`/api/products/${product.id}/knowledge/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            title: title.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.detail || "Failed to upload URL.");
        }
      }

      // Reset form and close modal
      setTitle("");
      setText("");
      setUrl("");
      setFile(null);
      setActiveModal(null);
      await fetchDocs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm("Are you sure you want to delete this document from the product knowledge base?")) return;
    try {
      const res = await fetch(`/api/products/${product.id}/knowledge/${sourceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete document.");
      await fetchDocs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  };

  const handleReindex = async (sourceId: string) => {
    setReindexingId(sourceId);
    try {
      const res = await fetch(`/api/products/${product.id}/knowledge/${sourceId}/reindex`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to re-index document.");
      alert("Document successfully re-indexed.");
      await fetchDocs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to re-index.");
    } finally {
      setReindexingId(null);
    }
  };

  const handleOpenEditModal = () => {
    setProdName(product.name);
    setProdCategory(product.category);
    setProdDescription(product.description || "");
    setProdImageUrl(product.image_url || "");
    setProdError("");
    setActiveModal("edit-product");
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodDescription.trim()) {
      setProdError("Name and description are required.");
      return;
    }

    setProdError("");
    setIsSubmittingProd(true);
    try {
      const finalImg = prodImageUrl.trim();
      await updateProduct(product.id, {
        name: prodName.trim(),
        category: prodCategory,
        description: prodDescription.trim(),
        image_url: finalImg,
      });

      setActiveModal(null);
      window.location.reload();
    } catch (err) {
      setProdError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSubmittingProd(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!confirm("Are you sure you want to delete this product? All its custom knowledge documents will also be dereferenced.")) return;
    try {
      await deleteProduct(product.id);
      router.push("/marketplace");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product.");
    }
  };

  const totalDocsCount = allDocs.filter(d => d.type === "pdf" || d.type === "text").length;
  const totalUrlsCount = allDocs.filter(d => d.type === "url").length;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/marketplace">← Back to Marketplace</Link> › {product.category} › {product.name}
      </div>
      <div className="mock-product-detail">
        <div className="mock-detail-main">
          <div className="mock-detail-img-area">
            {product.image_url ? (
              <img 
                src={product.image_url} 
                alt={product.name} 
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} 
              />
            ) : (
              product.emoji
            )}
            <div className="mock-detail-img-badge">✓ Verified Docs</div>
          </div>
          <div className="mock-detail-cat">{product.category} · {product.productType}</div>
          <h1 className="mock-detail-name">{product.name}</h1>
          <p className="mock-detail-desc">{product.description}</p>

          <section className="mock-detail-docs-section" style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="mock-detail-section-title" style={{ margin: 0 }}>Knowledge Base · {allDocs.length} Resources</div>
              <button 
                className="btn-primary" 
                style={{ padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => {
                  setFormError("");
                  setActiveModal("upload");
                }}
              >
                <span>+</span> Add Resource
              </button>
            </div>

            <div className="mock-doc-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {allDocs.map((doc, index) => {
                const isCustom = doc.isCustom;
                const isReindexing = reindexingId === doc.sourceId;
                
                return (
                  <div
                    className={`mock-doc-entry ${doc.featured ? "featured" : ""}`}
                    key={`${doc.name}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      gap: "16px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                      <div className="mock-doc-entry-icon" style={{ fontSize: "20px" }}>{doc.icon}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="mock-doc-entry-name" style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}>
                          {doc.name}
                        </div>
                        <div className="mock-doc-entry-meta" style={{
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                          marginTop: "2px"
                        }}>
                          <span style={{
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: doc.type === "pdf" 
                              ? "rgba(59, 130, 246, 0.15)" 
                              : doc.type === "url" 
                                ? "rgba(139, 92, 246, 0.15)" 
                                : "rgba(16, 185, 129, 0.15)",
                            color: doc.type === "pdf"
                              ? "#60a5fa"
                              : doc.type === "url"
                                ? "#a78bfa"
                                : "#34d399",
                            fontSize: "9px",
                            fontWeight: 700,
                            textTransform: "uppercase"
                          }}>
                            {doc.type}
                          </span>
                          <span>•</span>
                          <span>{doc.meta}</span>
                          {doc.created_at && (
                            <>
                              <span>•</span>
                              <span>Added {new Date(doc.created_at).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginRight: "8px",
                        fontSize: "11px",
                        color: isReindexing ? "var(--amber)" : "var(--green)"
                      }}>
                        <span style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: isReindexing ? "var(--amber)" : "var(--green)",
                          boxShadow: isReindexing 
                            ? "0 0 8px var(--amber)" 
                            : "0 0 8px var(--green)",
                          animation: isReindexing ? "glow-pulse 1s infinite" : undefined
                        }} />
                        <span>{isReindexing ? "Reindexing" : "Indexed"}</span>
                      </div>
                      
                      {isCustom ? (
                        <>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => setViewDoc(doc)}
                            title="View Document Content"
                          >
                            👁️ View
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleReindex(doc.sourceId)}
                            disabled={isReindexing}
                            title="Re-index Document"
                          >
                            🔄 {isReindexing ? "..." : "Re-sync"}
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: "4px 8px", fontSize: "11px", borderColor: "rgba(244,63,94,0.3)", color: "var(--red)" }}
                            onClick={() => handleDelete(doc.sourceId)}
                            title="Delete Document"
                          >
                            🗑️ Delete
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic", padding: "4px 8px" }}>
                          System Default
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginTop: "24px" }}>
            <div className="mock-detail-section-title">Common Issues</div>
            <div className="issue-row">
              {(product.commonIssues || []).map((issue) => (
                <Link
                  className="issue-pill"
                  href={`/diagnostic?productId=${product.id}&issue=${encodeURIComponent(issue)}`}
                  key={issue}
                >
                  {issue}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="mock-detail-sidebar">
          <Link className="mock-troubleshoot-cta" href={`/diagnostic?productId=${product.id}`}>
            <div className="mock-trouble-icon">🧠</div>
            <div className="mock-trouble-title">Start Diagnostic</div>
            <div className="mock-trouble-sub">AI technician ready · Avg. 3 min to root cause</div>
          </Link>

          <div className="resource-panel" style={{ marginTop: "16px" }}>
            <div className="mock-info-key">Product Actions</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button 
                className="btn-secondary" 
                onClick={handleOpenEditModal} 
                style={{ flex: 1, padding: "8px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                ✏️ Edit
              </button>
              <button 
                className="btn-secondary" 
                onClick={handleDeleteProduct} 
                style={{ flex: 1, padding: "8px", fontSize: "12px", borderColor: "rgba(244,63,94,0.3)", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>

          <div className="resource-panel">
            <div className="mock-info-key">Indexed Resources</div>
            <div className="resource-row">
              <span>Documents</span>
              <span>{totalDocsCount}</span>
            </div>
            <div className="resource-row">
              <span>Videos</span>
              <span>3</span>
            </div>
            <div className="resource-row">
              <span>URLs</span>
              <span>{totalUrlsCount}</span>
            </div>
          </div>

          <Info label="Manufacturer" value={product.manufacturer} />
          <Info label="Model Year" value={product.year} />
          <Info label="Category" value={product.productType} />
          <Info label="Diagnostic Sessions" value={formatNumber(product.sessions)} accent="indigo" />
          <Info label="Avg. Resolution Rate" value={`${product.resolutionRate}%`} accent="green" />
        </aside>
      </div>

      {/* Upload Modal Overlay via Portal */}
      {activeModal === "upload" && typeof window !== "undefined" && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "550px" }}>
            <div className="modal-header">
              <h2 className="modal-title">📥 Add Knowledge Resource</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setTitle("");
                  setText("");
                  setUrl("");
                  setFile(null);
                  setActiveModal(null);
                }}
                type="button"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpload}>
              {formError && (
                <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid rgba(239,68,68,0.2)", padding: 8, borderRadius: 6, background: "rgba(239,68,68,0.05)" }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Resource Type</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  {(["pdf", "text", "url"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`btn-secondary`}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        background: uploadType === t ? "var(--violet-glow)" : "transparent",
                        borderColor: uploadType === t ? "var(--violet)" : "var(--border)",
                        color: uploadType === t ? "var(--violet-light)" : "var(--text-secondary)",
                      }}
                      onClick={() => {
                        setUploadType(t);
                        setFormError("");
                      }}
                    >
                      {t === "pdf" ? "📄 PDF File" : t === "text" ? "📝 Text Doc" : "🌐 Website URL"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Resource Title {uploadType !== "text" && "(Optional)"}</label>
                <input
                  className="form-input"
                  placeholder={
                    uploadType === "pdf" 
                      ? "e.g. Troubleshooting Manual v2" 
                      : uploadType === "text" 
                        ? "e.g. LED Fault Codes Quickguide" 
                        : "e.g. Help Center Article"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required={uploadType === "text"}
                />
              </div>

              {uploadType === "pdf" && (
                <div className="form-group">
                  <label className="form-label">Upload PDF File</label>
                  <input
                    type="file"
                    accept=".pdf"
                    className="form-input"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                    style={{ background: "transparent", borderStyle: "dashed", padding: "16px", cursor: "pointer" }}
                  />
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "6px" }}>
                    Select a PDF file under 10MB to extract and index content.
                  </div>
                </div>
              )}

              {uploadType === "text" && (
                <div className="form-group">
                  <label className="form-label">Document Content</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Paste your raw support documentation, manuals, or checklist steps here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                    style={{ minHeight: "150px" }}
                  />
                </div>
              )}

              {uploadType === "url" && (
                <div className="form-group">
                  <label className="form-label">Website URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://support.acme.com/router-setup"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "6px" }}>
                    The system will fetch public text content and extract useful guide chunks.
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setTitle("");
                    setText("");
                    setUrl("");
                    setFile(null);
                    setActiveModal(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="btn-primary" disabled={uploading} type="submit">
                  {uploading ? "Ingesting & Indexing..." : "Index Resource"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* View Document Modal Overlay via Portal */}
      {viewDoc && typeof window !== "undefined" && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "700px", width: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "24px 24px 12px 24px" }}>
            <div className="modal-header" style={{ marginBottom: "16px", flexShrink: 0 }}>
              <div>
                <span style={{
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: viewDoc.type === "pdf" 
                    ? "rgba(59, 130, 246, 0.15)" 
                    : viewDoc.type === "url" 
                      ? "rgba(139, 92, 246, 0.15)" 
                      : "rgba(16, 185, 129, 0.15)",
                  color: viewDoc.type === "pdf"
                    ? "#60a5fa"
                    : viewDoc.type === "url"
                      ? "#a78bfa"
                      : "#34d399",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  marginRight: "8px"
                }}>
                  {viewDoc.type}
                </span>
                <h2 className="modal-title" style={{ display: "inline-block" }}>{viewDoc.name}</h2>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Indexed into {viewDoc.chunks?.length || 0} retrieval chunks
                </div>
              </div>
              <button
                className="modal-close"
                onClick={() => setViewDoc(null)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, paddingRight: "8px", marginBottom: "16px" }}>
              {viewDoc.chunks && viewDoc.chunks.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {viewDoc.chunks.map((chunk: any, i: number) => (
                    <div 
                      key={chunk.id || i}
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "14px"
                      }}
                    >
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        borderBottom: "1px dashed var(--border)", 
                        paddingBottom: "6px", 
                        marginBottom: "10px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--violet-light)"
                      }}>
                        <span>CHUNK #{chunk.chunk_index || (i + 1)}</span>
                        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{chunk.id?.split(":").pop() ?? ""}</span>
                      </div>
                      <p style={{ 
                        margin: 0, 
                        fontSize: "12.5px", 
                        lineHeight: "1.6", 
                        color: "var(--text-primary)", 
                        whiteSpace: "pre-wrap"
                      }}>
                        {chunk.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>📂</div>
                  <div>No text chunks loaded for this document. Try re-indexing.</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: "12px", flexShrink: 0 }}>
              <button className="btn-primary" onClick={() => setViewDoc(null)} type="button">
                Close Viewer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Product Modal */}
      {activeModal === "edit-product" && typeof window !== "undefined" && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "550px" }}>
            <div className="modal-header">
              <h2 className="modal-title">⚡ Edit Product</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={handleEditProduct}>
              {prodError && (
                <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid rgba(239,68,68,0.2)", padding: 8, borderRadius: 6, background: "rgba(239,68,68,0.05)" }}>
                  {prodError}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Moss Router X1"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                >
                  <option value="Industrial">Industrial</option>
                  <option value="Appliances">Appliances</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Automotive">Automotive</option>
                  <option value="HVAC">HVAC</option>
                  <option value="Networking">Networking</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  placeholder="Enter a brief product overview..."
                  value={prodDescription}
                  onChange={(e) => setProdDescription(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Product Image</label>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <label 
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "80px",
                      height: "80px",
                      border: "2px dashed var(--border)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: "var(--bg-elevated)",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                      position: "relative",
                      overflow: "hidden"
                    }}
                  >
                    {prodImageUrl ? (
                      <img 
                        src={prodImageUrl} 
                        alt="Preview" 
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                      />
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <span style={{ fontSize: "20px", display: "block" }}>📷</span>
                        <span>Browse</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: "none" }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImageUpload(file, setProdImageUrl);
                        }
                      }}
                    />
                  </label>
                  <div style={{ flexGrow: 1 }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      onChange={(event) => setProdImageUrl(event.target.value)} 
                      placeholder="Or paste an image URL..."
                      value={prodImageUrl.startsWith("data:") ? "" : prodImageUrl} 
                    />
                    <p style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "4px", margin: 0 }}>
                      Upload any image (PNG, WebP, JPG, GIF) or paste a link.
                    </p>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmittingProd}>
                  {isSubmittingProd ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function handleImageUpload(file: File, callback: (base64: string) => void) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 500;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        callback(compressedBase64);
      } else {
        callback(event.target?.result as string);
      }
    };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
}

function Info({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "indigo" | "green";
}) {
  const color = accent === "indigo" ? "var(--indigo-light)" : accent === "green" ? "var(--green)" : undefined;

  return (
    <div className="mock-info-item">
      <div className="mock-info-key">{label}</div>
      <div className="mock-info-val" style={{ color, fontFamily: accent ? "var(--font-mono)" : undefined }}>
        {value}
      </div>
    </div>
  );
}
