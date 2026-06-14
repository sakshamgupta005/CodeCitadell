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
        image_url: imageUrl.trim() || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64",
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
                <label className="form-label">Image URL (Optional)</label>
                <input 
                  className="form-input" 
                  onChange={(event) => setImageUrl(event.target.value)} 
                  placeholder="https://images.unsplash.com/photo-..."
                  value={imageUrl} 
                />
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
