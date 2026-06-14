import { AppShell } from "@/components/AppShell";
import { DiagnosticAssistant } from "@/components/DiagnosticAssistant";
import { getProduct, getProducts } from "@/lib/api";
import Link from "next/link";

export default async function DiagnosticPage({
  searchParams,
}: {
  searchParams?: Promise<{ productId?: string; issue?: string }>;
}) {
  const params = await searchParams;
  const productId = params?.productId;
  const product = productId ? await getProduct(productId) : null;

  if (!product) {
    const products = await getProducts();
    return (
      <AppShell>
        <div className="page-kicker">Diagnostic Assistant</div>
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Select a product to diagnose.</h1>
            <p className="page-desc">
              Select one of the registered products below to launch a guided, AI-driven troubleshooting thread.
            </p>
          </div>
        </div>
        <div style={{ marginTop: "32px" }}>
          <div className="mock-product-grid">
            {products.map((p) => (
              <div
                key={p.id}
                className="mock-product-card"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <Link
                  href={`/products/${p.id}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block", flexGrow: 1 }}
                >
                  <div className="mock-product-img">{p.emoji}</div>
                  <div className="mock-product-body">
                    <div className="mock-product-cat">{p.category}</div>
                    <div className="mock-product-name">{p.name}</div>
                    <div className="mock-product-company">{p.company}</div>
                  </div>
                </Link>
                <div className="mock-product-footer" style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="mock-product-docs">📄 {p.docs} docs</div>
                  <Link
                    className="mock-fix-btn"
                    href={`/diagnostic?productId=${p.id}${params?.issue ? `&issue=${encodeURIComponent(params.issue)}` : ""}`}
                    style={{ textDecoration: "none" }}
                  >
                    Select →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <DiagnosticAssistant product={product} initialIssue={params?.issue} />
    </AppShell>
  );
}
