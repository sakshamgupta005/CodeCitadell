"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatNumber, toProductView } from "@/lib/design-data";
import type { ImportStatusResponse, ProductView } from "@/lib/types";
import { createProduct, getImportStatus, updateProduct, deleteProduct } from "@/lib/api";

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
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<"Overview" | "Products" | "Documents" | "Analytics" | "Settings">("Overview");

  // Modals state
  const [activeModal, setActiveModal] = useState<"add-product" | "edit-product" | "upload-doc" | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);

  // Form states - Add/Edit Product
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

  // Documents tab states
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docFilterProduct, setDocFilterProduct] = useState<string>("all");
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);
  const [reindexingDocId, setReindexingDocId] = useState<string | null>(null);

  // Settings tab states
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [alphaVal, setAlphaVal] = useState(0.45);
  const [detailedReasoning, setDetailedReasoning] = useState(true);
  const [showCollapsible, setShowCollapsible] = useState(true);
  
  // Compute dashboard statistics dynamically
  const docsIndexed = productList.reduce((total, p) => total + p.docs, 0);
  const sessions = productList.reduce((total, p) => total + p.sessions, 0);

  // Load knowledge documents
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch("/api/products/global/knowledge");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  // Update product list docs count when documents database updates
  useEffect(() => {
    // Group documents count by product_id
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      const pId = doc.product_id;
      if (pId) {
        counts[pId] = (counts[pId] || 0) + 1;
      }
    }
    
    setProductList((currList) => 
      currList.map((p) => {
        const uploadedCount = counts[p.id] || 0;
        const isFallback = products.some((orig) => orig.id === p.id);
        const baseDocs = isFallback ? p.docs : 0;
        return {
          ...p,
          docs: baseDocs + uploadedCount
        };
      })
    );
  }, [documents, products]);

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
              
              // Trigger reload of documents to refresh lists and counters
              void fetchDocuments();

              // Auto-clear success state after 4 seconds
              setTimeout(() => {
                setActiveImports((curr) => {
                  const cleaned = { ...curr };
                  delete cleaned[prodId];
                  return cleaned;
                });
              }, 4000);
            } else if (matchingImport.status === "failed") {
              next[prodId] = { status: "failed", error: matchingImport.message || "Failed indexing" };
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

  const handleOpenEditModal = (product: ProductView) => {
    setSelectedProduct(product);
    setProdName(product.name);
    setProdCategory(product.category);
    setProdDescription(product.description || "");
    setProdImageUrl(product.image_url || "");
    setAddError("");
    setActiveModal("edit-product");
  };

  const handleDeleteClick = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(productId);
      setProductList((curr) => curr.filter((p) => p.id !== productId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product.");
    }
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

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!prodName.trim() || !prodDescription.trim()) {
      setAddError("Name and description are required.");
      return;
    }

    setAddError("");
    setIsSubmittingProd(true);
    try {
      const finalImg = prodImageUrl.trim() || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64";
      const updated = await updateProduct(selectedProduct.id, {
        name: prodName.trim(),
        category: prodCategory,
        description: prodDescription.trim(),
        image_url: finalImg,
      });

      const mapped = toProductView(updated);
      mapped.docs = selectedProduct.docs;
      mapped.sessions = selectedProduct.sessions;
      mapped.resolutionRate = selectedProduct.resolutionRate;

      setProductList((curr) =>
        curr.map((p) => (p.id === selectedProduct.id ? mapped : p))
      );
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

  const handleDeleteDocument = async (productId: string, sourceId: string) => {
    if (!confirm("Are you sure you want to delete this document from the product knowledge base?")) return;
    try {
      const res = await fetch(`/api/products/${productId}/knowledge/${sourceId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchDocuments();
      } else {
        throw new Error("Failed to delete document");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete document.");
    }
  };

  const handleReindexDocument = async (productId: string, sourceId: string) => {
    setReindexingDocId(sourceId);
    try {
      const res = await fetch(`/api/products/${productId}/knowledge/${sourceId}/reindex`, {
        method: "POST"
      });
      if (res.ok) {
        alert("Document re-indexing completed successfully!");
        await fetchDocuments();
      } else {
        throw new Error("Failed to re-index document");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to re-index document.");
    } finally {
      setReindexingDocId(null);
    }
  };

  const handleReseedDb = async () => {
    if (!confirm("This will re-run the default documentation seeder. Proceed?")) return;
    try {
      const res = await fetch("/api/import/status");
      alert("Database re-seeding triggered. Refresh in a few seconds.");
      await fetchDocuments();
    } catch (err) {
      alert("Error seeding database.");
    }
  };

  // Filter documents in Documents view
  const filteredDocuments = docFilterProduct === "all"
    ? documents
    : documents.filter(doc => doc.product_id === docFilterProduct);

  return (
    <>
      <div className="page-kicker">Company Dashboard</div>
      <div className="mock-dashboard">
        <aside className="mock-dash-sidebar">
          <div className="mock-dash-brand">
            <img 
              src="/logo.png" 
              alt="FixPilot Logo" 
              style={{ 
                width: "24px", 
                height: "24px", 
                objectFit: "contain",
                animation: "float 4s ease-in-out infinite"
              }} 
            />
            FixPilot
          </div>
          
          {["📊 Overview", "📦 Products", "📄 Documents", "📈 Analytics", "⚙️ Settings"].map(
            (item) => {
              const label = item.slice(3) as "Overview" | "Products" | "Documents" | "Analytics" | "Settings";
              return (
                <div 
                  className={`mock-dash-nav-item ${activeTab === label ? "active" : ""}`} 
                  key={item}
                  onClick={() => {
                    setActiveTab(label);
                    if (label === "Documents") void fetchDocuments();
                  }}
                >
                  <span className="mock-dash-icon">{item.slice(0, 2)}</span>
                  {label}
                </div>
              );
            }
          )}

          <div className="dashboard-account">
            <Link href="/diagnostic" style={{ textDecoration: "none" }}>
              <div className="mock-dash-nav-item" style={{ color: "var(--violet-light)", border: "1px solid rgba(124,58,237,0.2)", background: "rgba(124,58,237,0.05)", marginBottom: "12px" }}>
                <span className="mock-dash-icon">🧠</span>
                Diagnostics Desk
              </div>
            </Link>
            <div className="account-card">
              <div>Bosch Home</div>
              <div>Pro Plan</div>
            </div>
          </div>
        </aside>

        <section className="mock-dash-main">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "Overview" && (
            <>
              <div className="mock-dash-topbar">
                <div>
                  <div className="mock-dash-heading">Overview</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Bosch Home Appliances · bosch-home
                  </div>
                </div>
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
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.name} 
                            style={{ width: "24px", height: "24px", objectFit: "cover", borderRadius: "4px" }} 
                          />
                        ) : (
                          <span style={{ fontSize: 16 }}>{product.emoji}</span>
                        )}
                        <Link href={`/products/${product.id}`} style={{ color: "inherit", textDecoration: "none" }} className="hover-underline">
                          {product.name}
                        </Link>
                      </div>
                      <div className="mock-table-cell" style={{ cursor: "pointer", color: "var(--violet-light)" }} onClick={() => { setDocFilterProduct(product.id); setActiveTab("Documents"); }}>
                        {product.docs}
                      </div>
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
                      <div className="mock-table-actions" style={{ display: "flex", gap: "6px" }}>
                        <button className="mock-action-btn" onClick={() => handleOpenUploadModal(product)} title="Add Knowledge">+Doc</button>
                        <Link href={`/diagnostic?productId=${product.id}`} className="mock-action-btn" style={{ textDecoration: "none", color: "var(--violet-light)", display: "inline-flex", alignItems: "center" }}>
                          Diagnose
                        </Link>
                        <button className="mock-action-btn" onClick={() => handleOpenEditModal(product)} title="Edit Product" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)" }}>Edit</button>
                        <button className="mock-action-btn" onClick={() => handleDeleteClick(product.id)} title="Delete Product" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--red)" }}>Del</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* TAB 2: PRODUCTS CATALOG */}
          {activeTab === "Products" && (
            <>
              <div className="mock-dash-topbar">
                <div>
                  <div className="mock-dash-heading">Product Catalog</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Manage diagnostic-ready hardware models and support routing
                  </div>
                </div>
                <button className="mock-dash-add-btn" onClick={handleOpenAddModal}>+ Register New Product</button>
              </div>

              <div className="mock-product-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                {productList.map((product) => (
                  <div key={product.id} className="mock-product-card selected" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name} 
                          style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px" }} 
                        />
                      ) : (
                        <span style={{ fontSize: "36px" }}>{product.emoji}</span>
                      )}
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                        {product.category}
                      </span>
                    </div>
                    <div>
                      <h3 style={{ margin: "4px 0", fontSize: "15px", fontWeight: 700 }}>{product.name}</h3>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0 12px 0", height: "36px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {product.description}
                      </p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: "12px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                      <span>📄 {product.docs} documents</span>
                      <span>💬 {product.sessions} sessions</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <Link href={`/products/${product.id}`} className="mock-fix-btn" style={{ textDecoration: "none", flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                        View Info
                      </Link>
                      <Link href={`/diagnostic?productId=${product.id}`} className="mock-fix-btn" style={{ textDecoration: "none", flex: 1, textAlign: "center" }}>
                        Diagnose
                      </Link>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                      <button className="mock-action-btn" onClick={() => handleOpenUploadModal(product)} style={{ flex: 1 }}>+Add Doc</button>
                      <button className="mock-action-btn" onClick={() => handleOpenEditModal(product)} style={{ flex: 1 }}>Edit</button>
                      <button className="mock-action-btn" onClick={() => handleDeleteClick(product.id)} style={{ color: "var(--red)", background: "rgba(239,68,68,0.05)", flex: 0.5 }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* TAB 3: DOCUMENTS & KNOWLEDGE BASE */}
          {activeTab === "Documents" && (
            <>
              <div className="mock-dash-topbar">
                <div>
                  <div className="mock-dash-heading">Knowledge Resources</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Manage manuals, schematics, and URL reference materials mapped into the Moss index
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", background: "var(--bg-surface)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Filter by Product:</span>
                  <select 
                    className="form-select" 
                    value={docFilterProduct} 
                    onChange={(e) => setDocFilterProduct(e.target.value)}
                    style={{ minWidth: "180px", padding: "6px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)" }}
                  >
                    <option value="all">All Registered Products</option>
                    {productList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Total: {filteredDocuments.length} document sources
                </div>
              </div>

              {isLoadingDocs ? (
                <div className="empty-state" style={{ textAlign: "center", padding: "40px" }}>
                  <div className="spinner" style={{ border: "2px solid rgba(255,255,255,0.1)", borderTop: "2px solid var(--violet)", borderRadius: "50%", width: "24px", height: "24px", animation: "spin 1s linear infinite", margin: "0 auto 12px auto" }}></div>
                  Querying local repository store and active Moss indexes...
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="empty-state" style={{ textAlign: "center", padding: "40px" }}>
                  📖 No custom documents uploaded yet for this product selection.
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    Go to Overview and click "+Doc" next to any product to upload and index documents!
                  </p>
                </div>
              ) : (
                <div className="mock-product-table">
                  <div className="mock-table-header" style={{ gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1.2fr" }}>
                    <div>Document Title</div>
                    <div>Mapped Product</div>
                    <div>Source Type</div>
                    <div>Chunks</div>
                    <div>Actions</div>
                  </div>
                  {filteredDocuments.map((doc: any) => (
                    <div className="mock-table-row" key={doc.source_id} style={{ gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1.2fr", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.title}>
                          {doc.type === "pdf" ? "📄" : doc.type === "url" ? "🌐" : "📝"} {doc.title}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {doc.filename ? `File: ${doc.filename}` : doc.url ? `URL: ${doc.url}` : "Text Manual Input"}
                        </span>
                      </div>
                      <div className="mock-table-cell" style={{ fontSize: "12px" }}>{doc.product_name || doc.product_id}</div>
                      <div className="mock-table-cell">
                        <span style={{ textTransform: "uppercase", fontSize: "10.5px", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-secondary)" }}>
                          {doc.type}
                        </span>
                      </div>
                      <div className="mock-table-cell">{doc.chunk_count}</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button 
                          className="mock-action-btn" 
                          onClick={() => setViewingDoc(doc)}
                          title="View text content"
                        >
                          View
                        </button>
                        <button 
                          className="mock-action-btn" 
                          disabled={reindexingDocId === doc.source_id}
                          onClick={() => handleReindexDocument(doc.product_id, doc.source_id)}
                          title="Re-run Moss synchronization"
                          style={{ color: "var(--teal)" }}
                        >
                          {reindexingDocId === doc.source_id ? "Syncing..." : "Re-sync"}
                        </button>
                        <button 
                          className="mock-action-btn" 
                          onClick={() => handleDeleteDocument(doc.product_id, doc.source_id)}
                          title="Remove from knowledge base"
                          style={{ color: "var(--red)", background: "rgba(239,68,68,0.05)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 4: METRICS & ANALYTICS */}
          {activeTab === "Analytics" && (
            <>
              <div className="mock-dash-topbar">
                <div>
                  <div className="mock-dash-heading">Analytics Dashboard</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Real-time support engineering metrics and diagnostics performance
                  </div>
                </div>
              </div>

              <div className="mock-stat-row">
                <Stat label="Total Diagnostics Session" value="8,409" tone="indigo" />
                <Stat label="Avg. Resolution Time" value="3.2 min" tone="teal" />
                <Stat label="First-Contact Resolution" value="94.6%" tone="amber" />
                <Stat label="AI Match Accuracy" value="98.1%" tone="green" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", marginTop: "10px" }}>
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px", color: "var(--text-primary)" }}>Recent Diagnostic Sessions</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {[
                      { product: "Moss Router X1", issue: "Solid Amber light blinking", time: "2 mins ago", status: "Resolved", duration: "1.5m" },
                      { product: "HP LaserJet Pro M404n", issue: "Paper jam Tray 2 area", time: "15 mins ago", status: "Resolved", duration: "4.2m" },
                      { product: "Smart Air Conditioner", issue: "AC not cooling blowing warm air", time: "1 hour ago", status: "Resolved", duration: "3.1m" },
                      { product: "Smart Washing Machine", issue: "UE error code drum spin fail", time: "2 hours ago", status: "Investigating", duration: "In Progress" },
                    ].map((session, idx) => (
                      <div key={idx} style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "10px" }}>
                        <div>
                          <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{session.product}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{session.issue} · {session.time}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ 
                            fontSize: "10.5px", 
                            fontWeight: 700, 
                            padding: "2px 6px", 
                            borderRadius: "4px",
                            background: session.status === "Resolved" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                            color: session.status === "Resolved" ? "var(--green)" : "var(--amber)"
                          }}>
                            {session.status}
                          </span>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>{session.duration}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px", color: "var(--text-primary)" }}>Diagnostics Load by Category</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {[
                      { name: "Networking (Routers)", percentage: 48, count: 4036 },
                      { name: "Electronics (Printers)", percentage: 25, count: 2102 },
                      { name: "HVAC (Air Conditioners)", percentage: 15, count: 1261 },
                      { name: "Appliances (Washing/Purifier)", percentage: 12, count: 1010 },
                    ].map((cat, idx) => (
                      <div key={idx}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600 }}>{cat.name}</span>
                          <span style={{ color: "var(--text-muted)" }}>{cat.count} calls ({cat.percentage}%)</span>
                        </div>
                        <div style={{ height: "6px", background: "var(--bg-elevated)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ 
                            height: "100%", 
                            width: `${cat.percentage}%`, 
                            background: idx === 0 ? "var(--violet)" : idx === 1 ? "var(--teal)" : idx === 2 ? "var(--amber)" : "var(--text-muted)"
                          }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === "Settings" && (
            <>
              <div className="mock-dash-topbar">
                <div>
                  <div className="mock-dash-heading">Platform Settings</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Configure vector index hyperparameters and diagnostic engine outputs
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", maxWidth: "600px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label className="form-label" style={{ fontSize: "13px" }}>Default LLM Reasoning Model</label>
                  <select 
                    className="form-select" 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{ marginTop: "6px" }}
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended - Fastest)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Reasoning - Precision)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy Support)</option>
                  </select>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Selects the model used to analyze symptoms against context and formulate structured JSON responses.
                  </p>
                </div>

                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="form-label" style={{ fontSize: "13px", margin: 0 }}>Moss Retrieval Alpha Threshold</label>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--violet-light)", fontWeight: 700 }}>
                      {alphaVal.toFixed(2)}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0.0" 
                    max="1.0" 
                    step="0.05"
                    value={alphaVal}
                    onChange={(e) => setAlphaVal(parseFloat(e.target.value))}
                    style={{ width: "100%", marginTop: "8px", accentColor: "var(--violet)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                    <span>0.00 (Pure Keyword BM25)</span>
                    <span>1.00 (Pure Vector Embeddings)</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <label className="form-label" style={{ fontSize: "13px", margin: 0 }}>Diagnostics Engine Options</label>
                  
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>Detailed Investigative Reasoning</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Outputs LLM's full diagnostic process block before proposing checks.</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={detailedReasoning}
                      onChange={(e) => setDetailedReasoning(e.target.checked)}
                      style={{ width: "18px", height: "18px", accentColor: "var(--violet)" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>Show Collapsible Excerpts</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Allows users to expand citations to read actual supporting evidence.</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showCollapsible}
                      onChange={(e) => setShowCollapsible(e.target.checked)}
                      style={{ width: "18px", height: "18px", accentColor: "var(--violet)" }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>Re-seed / Initialize Database</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Re-seeds default documentation context for fallback products.</div>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleReseedDb}
                    style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                  >
                    Reset & Re-Seed
                  </button>
                </div>
              </div>
            </>
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
                  {isSubmittingProd ? "Creating..." : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRODUCT */}
      {activeModal === "edit-product" && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">⚡ Edit Product: {selectedProduct.name}</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={handleEditProduct}>
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

      {/* MODAL 3: VIEW DOCUMENT CONTENT */}
      {viewingDoc && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📖 {viewingDoc.title}
              </h2>
              <button className="modal-close" onClick={() => setViewingDoc(null)}>✕</button>
            </div>
            <div style={{ maxHeight: "350px", overflowY: "auto", background: "var(--bg-elevated)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
              {viewingDoc.chunks?.map((chunk: any, i: number) => (
                <div key={chunk.id} style={{ borderBottom: i < viewingDoc.chunks.length - 1 ? "1px dashed var(--border)" : "none", paddingBottom: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--violet-light)", marginBottom: "4px" }}>
                    Chunk #{chunk.chunk_index} (ID: {chunk.id.split(":").slice(-2).join(":")})
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button type="button" className="btn-primary" onClick={() => setViewingDoc(null)}>Close</button>
            </div>
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
