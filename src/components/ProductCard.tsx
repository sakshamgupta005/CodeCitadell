import Link from "next/link";
import type { ProductView } from "@/lib/types";

export function ProductCard({ product }: { product: ProductView }) {
  return (
    <div
      className={`mock-product-card ${product.featured ? "selected" : ""}`}
      style={{ display: "flex", flexDirection: "column" }}
    >
      <Link
        href={`/products/${product.id}`}
        style={{ textDecoration: "none", color: "inherit", display: "block", flexGrow: 1 }}
      >
        <div className="mock-product-img">{product.emoji}</div>
        <div className="mock-product-body">
          <div className="mock-product-cat">{product.category}</div>
          <div className="mock-product-name">{product.name}</div>
          <div className="mock-product-company">
            {product.company}
            {product.model ? ` · ${product.model}` : ""}
          </div>
        </div>
      </Link>
      <div className="mock-product-footer" style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="mock-product-docs">📄 {product.docs} docs</div>
        <Link
          className="mock-fix-btn"
          href={`/diagnostic?productId=${product.id}`}
          style={{ textDecoration: "none" }}
        >
          Diagnose →
        </Link>
      </div>
    </div>
  );
}
