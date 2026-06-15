"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createProduct } from "@/lib/api";

export function ProductUploader() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  function reset() {
    setName("");
    setCategory("Electronics");
    setDescription("");
    setImageUrl("");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !description.trim()) {
      setError("Product name and description are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const product = await createProduct({
        name: name.trim(),
        category,
        description: description.trim(),
        image_url: imageUrl.trim() || "",
      });

      reset();
      setIsOpen(false);
      router.refresh();
      router.push(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add product.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button className="mock-dash-add-btn" onClick={() => setIsOpen(true)} type="button">
        + Add product
      </button>

      {isOpen && typeof window !== "undefined" && createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">⚡ Register New Product</h2>
              <button
                className="modal-close"
                onClick={() => {
                  reset();
                  setIsOpen(false);
                }}
                type="button"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid rgba(239,68,68,0.2)", padding: 8, borderRadius: 6, background: "rgba(239,68,68,0.05)" }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Product name</label>
                <input 
                  className="form-input" 
                  onChange={(event) => setName(event.target.value)} 
                  placeholder="e.g. Moss Router X1"
                  value={name} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" onChange={(event) => setCategory(event.target.value)} value={category}>
                  <option value="Appliances">Appliances</option>
                  <option value="Electronics">Electronics</option>
                  <option value="HVAC">HVAC</option>
                  <option value="Networking">Networking</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Automotive">Automotive</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea 
                  className="form-textarea" 
                  onChange={(event) => setDescription(event.target.value)} 
                  placeholder="Enter a brief product overview..."
                  value={description} 
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
                    {imageUrl ? (
                      <img 
                        src={imageUrl} 
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
                          handleImageUpload(file, setImageUrl);
                        }
                      }}
                    />
                  </label>
                  <div style={{ flexGrow: 1 }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      onChange={(event) => setImageUrl(event.target.value)} 
                      placeholder="Or paste an image URL..."
                      value={imageUrl.startsWith("data:") ? "" : imageUrl} 
                    />
                    <p style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "4px", margin: 0 }}>
                      Upload any image (PNG, WebP, JPG, GIF) or paste a link.
                    </p>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setIsOpen(false)} type="button">
                  Cancel
                </button>
                <button className="btn-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Registering..." : "Add product"}
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
