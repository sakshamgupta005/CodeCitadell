"use client";

import { useEffect, useState } from "react";
import { formatNumber, toProductView } from "@/lib/design-data";
import type { ImportStatusResponse, ProductView } from "@/lib/types";
import { createProduct, getImportStatus } from "@/lib/api";

type ImportState = {
  status: "uploading" | "processing" | "indexed" | "failed";
  importId?: string;
  error?: string;
};

export function DashboardView({
  products,
  importStatus: initialImportStatus,
}: {
  products: ProductView[];
  importStatus: ImportStatusResponse | null;
}) {
  const [productList, setProductList] = useState<ProductView[]>(products);
  const [importStatus, setImportStatus] = useState<ImportStatusResponse | null>(initialImportStatus);
  const [activeImports, setActiveImports] = useState<Record<string, ImportState>>({});
  
  // Modals state
  const [activeModal, setActiveModal] = useState<"add-product" | "upload-doc" | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);

  // Form states - Add Product
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState("Electronics");
  const [prodDescription, setProdDescription] = useState("");
  const [prodImageUrl, setProdImageUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [isSubmittingProd, setIsSubmittingProd] = useState(false);

  // Form states - Upload Doc
  const [uploadType, setUploadType] = useState<"pdf" | "text" | "url">("pdf");
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  
  // Compute dashboard statistics dynamically
  const docsIndexed = productList.reduce((total, p) => total + p.docs, 0);
  const sessions = productList.reduce((total, p) => total + p.sessions, 0);

  // Poll active imports if any are in "processing" state
  useEffect(() => {
    const processingProducts = Object.entries(activeImports).filter(
      ([_, state]) => state.status === "processing" && state.importId
    );

    if (processingProducts.length === 0) return;

    const interval = setInterval(async () => {
      const status = await getImportStatus();
      if (!status) return;
      setImportStatus(status);

      setActiveImports((prev) => {
        const next = { ...prev };
        let updated = false;

        for (const [prodId, state] of processingProducts) {
          const matchingImport = status.imports.find((imp) => imp.import_id === state.importId);
          if (matchingImport) {
            if (matchingImport.status === "completed") {
              next[prodId] = { status: "indexed" };
              updated = true;
              
              // Increment local docs count for product
              const docCount = matchingImport.indexed_count || 1;
              setProductList((currList) =>
                currList.map((p) => (p.id === prodId ? { ...p, docs: p.docs + docCount } : p))
              );

              // Auto-clear success state after 4 seconds
              setTimeout(() => {
                setActiveImports((curr) => {
                  const cleaned = { ...curr };
                  delete cleaned[prodId];
                  return cleaned;
                });
              }, 4000);
            } else if (matchingImport.status === "failed") {
              next[prodId] = { status: "failed", error: matchingImport.error || "Failed indexing" };
              updated = true;
            }
          }
        }

        return updated ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [activeImports]);

  const handleOpenAddModal = () => {
    setProdName("");
    setProdCategory("Electronics");
    setProdDescription("");
    setProdImageUrl("");
    setAddError("");
    setActiveModal("add-product");
  };

  const handleOpenUploadModal = (product: ProductView) => {
    setSelectedProduct(product);
    setUploadType("pdf");
    setDocTitle("");
    setDocText("");
    setDocUrl("");
    setDocFile(null);
    setUploadError("");
    setActiveModal("upload-doc");
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodDescription.trim()) {
      setAddError("Name and description are required.");
      return;
    }

    setAddError("");
    setIsSubmittingProd(true);
    try {
      const finalImg = prodImageUrl.trim() || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64";
      const newProd = await createProduct({
        name: prodName.trim(),
        category: prodCategory,
        description: prodDescription.trim(),
        image_url: finalImg,
      });

      const mapped = toProductView(newProd);
      // Newly created products start with 0 docs
      mapped.docs = 0;
      mapped.sessions = 0;
      mapped.resolutionRate = 100;

      setProductList((curr) => [...curr, mapped]);
      setActiveModal(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSubmittingProd(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setUploadError("");
    const prodId = selectedProduct.id;

    // Local validation
    if (uploadType === "pdf" && !docFile) {
      setUploadError("Please select a PDF file.");
      return;
    }
    if (uploadType === "text" && !docText.trim()) {
      setUploadError("Please enter some text content.");
      return;
    }
    if (uploadType === "url" && !docUrl.trim()) {
      setUploadError("Please provide a valid URL.");
      return;
    }

    setActiveModal(null);
    setActiveImports((prev) => ({ ...prev, [prodId]: { status: "uploading" } }));

    try {
      let response: Response;

      if (uploadType === "pdf" && docFile) {
        const formData = new FormData();
        formData.append("file", docFile);
        response = await fetch(`/api/products/${prodId}/knowledge/pdf`, {
          method: "POST",
          body: formData,
        });
      } else if (uploadType === "text") {
        const formData = new FormData();
        formData.append("text", docText);
        formData.append("title", docTitle.trim() || "Text Document");
        response = await fetch(`/api/products/${prodId}/knowledge/text`, {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch(`/api/products/${prodId}/knowledge/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: docUrl.trim(),
            title: docTitle.trim() || docUrl.trim(),
          }),
        });
      }

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson?.detail || `Upload failed: ${response.status}`);
      }

      const resData = await response.json();
      setActiveImports((prev) => ({
        ...prev,
        [prodId]: { status: "processing", importId: resData.import_id },
      }));
    } catch (err) {
      setActiveImports((prev) => ({
        ...prev,
        [prodId]: { status: "failed", error: err instanceof Error ? err.message : "Failed to index" },
      }));
    }
  };

  return (
    <>
      <div className="page-kicker">Company Dashboard</div>
      <div className="mock-dashboard">
        <aside className="mock-dash-sidebar">
          <div className="mock-dash-brand">
            <div className="mock-logo-mark" style={{ fontSize: 10, height: 20, width: 20 }}>
              ⚡
            </div>
            FixPilot
          </div>
          {["📊 Overview", "📦 Products", "📄 Documents", "📈 Analytics", "⚙️ Settings"].map(
            (item, index) => (
              <div className={`mock-dash-nav-item ${index === 0 ? "active" : ""}`} key={item}>
                <span className="mock-dash-icon">{item.slice(0, 2)}</span>
                {item.slice(3)}
              </div>
            )
          )}
          <div className="dashboard-account">
            <div className="mock-dash-nav-item">
              <span className="mock-dash-icon">🆘</span>
              Support
            </div>
            <div className="account-card">
              <div>Bosch Home</div>
              <div>Pro Plan</div>
            </div>
          </div>
        </aside>

        <section className="mock-dash-main">
          <div className="mock-dash-topbar">
            <div>
              <div className="mock-dash-heading">Overview</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                Bosch Home Appliances · bosch-home
              </div>
            </div>
            <button className="mock-dash-add-btn" onClick={handleOpenAddModal}>+ Add Product</button>
          </div>

          <div className="mock-stat-row">
            <Stat label="Products Listed" value={productList.length.toString()} tone="indigo" />
            <Stat label="Docs Indexed" value={formatNumber(docsIndexed)} tone="teal" />
            <Stat label="Diagnostic Sessions" value={formatNumber(sessions)} tone="amber" />
            <Stat label="Resolution Rate" value="91%" tone="green" />
          </div>

          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>Your Products</div>
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Showing {productList.length} of {productList.length}
            </div>
          </div>

          <div className="mock-product-table">
            <div className="mock-table-header">
              <div>Product</div>
              <div>Docs</div>
              <div>Sessions</div>
              <div>Status</div>
              <div />
            </div>
            {productList.map((product) => {
              const activeImport = activeImports[product.id];
              return (
                <div className="mock-table-row" key={product.id}>
                  <div className="mock-table-name">
                    <span style={{ fontSize: 16 }}>{product.emoji}</span>
                    {product.name}
                  </div>
                  <div className="mock-table-cell">{product.docs}</div>
                  <div className="mock-table-cell">{formatNumber(product.sessions)}</div>
                  <div className="mock-table-cell">
                    {activeImport ? (
                      <span
                        className={`mock-status-badge ${activeImport.status}`}
                        title={activeImport.error}
                        style={{ cursor: activeImport.error ? "help" : "default" }}
                      >
                        {activeImport.status === "uploading" && "Uploading"}
                        {activeImport.status === "processing" && "Processing"}
                        {activeImport.status === "indexed" && "Indexed"}
                        {activeImport.status === "failed" && "Failed"}
                      </span>
                    ) : (
                      <span className="mock-status-badge live">Live</span>
                    )}
                  </div>
                  <div className="mock-table-actions">
                    <button className="mock-action-btn" onClick={() => handleOpenUploadModal(product)}>+Doc</button>
                  </div>
                </div>
              );
            })}
          </div>

          {importStatus?.last_import && (
            <div className="empty-state" style={{ marginTop: 16 }}>
              Last import: {importStatus.last_import.message}
            </div>
          )}
        </section>
      </div>

      {/* MODAL 1: ADD PRODUCT */}
      {activeModal === "add-product" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">⚡ Register New Product</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={handleCreateProduct}>
              {addError && (
                <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid rgba(239,68,68,0.2)", padding: 8, borderRadius: 6, background: "rgba(239,68,68,0.05)" }}>
                  {addError}
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
                <label className="form-label">Image URL (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={prodImageUrl}
                  onChange={(e) => setProdImageUrl(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmittingProd}>
                  {isSubmittingProd ? "Creating..." : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPLOAD DOCUMENTATION */}
      {activeModal === "upload-doc" && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">📄 Add Knowledge for {selectedProduct.name}</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={handleUploadDoc}>
              {uploadError && (
                <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid rgba(239,68,68,0.2)", padding: 8, borderRadius: 6, background: "rgba(239,68,68,0.05)" }}>
                  {uploadError}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Knowledge Type</label>
                <select
                  className="form-select"
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value as any)}
                >
                  <option value="pdf">PDF File Manual</option>
                  <option value="text">Raw Text Document</option>
                  <option value="url">Web URL Reference</option>
                </select>
              </div>

              {uploadType !== "pdf" && (
                <div className="form-group">
                  <label className="form-label">Resource Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Troubleshooting Reference Guide"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                </div>
              )}

              {uploadType === "pdf" && (
                <div className="form-group">
                  <label className="form-label">PDF File</label>
                  <input
                    type="file"
                    accept=".pdf"
                    className="form-input"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
              )}

              {uploadType === "text" && (
                <div className="form-group">
                  <label className="form-label">Text Content</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Paste documentation text content here..."
                    style={{ minHeight: "150px" }}
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    required
                  />
                </div>
              )}

              {uploadType === "url" && (
                <div className="form-group">
                  <label className="form-label">Document URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://support.example.com/guide"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Index Knowledge</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "indigo" | "teal" | "amber" | "green";
}) {
  const className = tone === "green" ? "mock-stat-value" : `mock-stat-value ${tone}`;
  return (
    <div className="mock-stat">
      <div className={className} style={tone === "green" ? { color: "var(--green)" } : undefined}>
        {value}
      </div>
      <div className="mock-stat-label">{label}</div>
    </div>
  );
}
