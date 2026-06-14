import Link from "next/link";
import { commonIssues, documentation, formatNumber } from "@/lib/design-data";
import type { ProductView } from "@/lib/types";

export function ProductDetailView({ product }: { product: ProductView }) {
  return (
    <>
      <div className="breadcrumb">
        <Link href="/marketplace">← Back to Marketplace</Link> › {product.category} › {product.name}
      </div>
      <div className="mock-product-detail">
        <div className="mock-detail-main">
          <div className="mock-detail-img-area">
            {product.emoji}
            <div className="mock-detail-img-badge">✓ Verified Docs</div>
          </div>
          <div className="mock-detail-cat">{product.category} · {product.productType}</div>
          <h1 className="mock-detail-name">{product.name}</h1>
          <p className="mock-detail-desc">{product.description}</p>

          <section className="mock-detail-docs-section">
            <div className="mock-detail-section-title">Documentation · {product.docs} Resources</div>
            <div className="mock-doc-list">
              {(product.documentation || []).map((document) => (
                <div
                  className={`mock-doc-entry ${document.featured ? "featured" : ""}`}
                  key={document.name}
                >
                  <div className="mock-doc-entry-icon">{document.icon}</div>
                  <div className="mock-doc-entry-name">{document.name}</div>
                  <div className="mock-doc-entry-meta">{document.meta}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
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
            <div className="mock-trouble-title">Start Diagnosis</div>
            <div className="mock-trouble-sub">AI technician ready · Avg. 3 min to root cause</div>
          </Link>

          <div className="resource-panel">
            <div className="mock-info-key">Indexed Resources</div>
            <div className="resource-row">
              <span>Documents</span>
              <span>{Math.max(product.docs - 4, 1)}</span>
            </div>
            <div className="resource-row">
              <span>Videos</span>
              <span>3</span>
            </div>
            <div className="resource-row">
              <span>URLs</span>
              <span>1</span>
            </div>
          </div>

          <Info label="Manufacturer" value={product.manufacturer} />
          <Info label="Model Year" value={product.year} />
          <Info label="Category" value={product.productType} />
          <Info label="Diagnostic Sessions" value={formatNumber(product.sessions)} accent="indigo" />
          <Info label="Avg. Resolution Rate" value={`${product.resolutionRate}%`} accent="green" />
        </aside>
      </div>
    </>
  );
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
