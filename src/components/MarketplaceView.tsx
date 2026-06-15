import Link from "next/link";
import { categories } from "@/lib/design-data";
import type { ProductView } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";
import { ProductUploader } from "@/components/ProductUploader";

export function MarketplaceView({
  products,
  query,
  category,
}: {
  products: ProductView[];
  query?: string;
  category?: string;
}) {
  const activeCategory = category || "All";
  const trending = products.slice(0, 3);
  const recent = products.slice(3, 6);

  return (
    <>
      <div className="page-kicker">Product Marketplace</div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Search products. Start diagnosis.</h1>
          <p className="page-desc">
            Browse diagnostic-ready products, inspect indexed documentation, and jump straight into
            a guided troubleshooting session.
          </p>
        </div>
        <ProductUploader />
      </div>

      <form className="toolbar" action="/marketplace">
        <label className="search-field">
          <span>🔍</span>
          <input
            name="q"
            defaultValue={query}
            placeholder="Search"
            aria-label="Search products"
          />
        </label>
        <div className="filter-row" aria-label="Product categories">
          {categories.map((item) => {
            const href = item === "All" ? "/marketplace" : `/marketplace?category=${item}`;
            return (
              <Link
                className={`filter-pill ${activeCategory === item ? "active" : ""}`}
                href={href}
                key={item}
              >
                {item === "Industrial" && "🏭 "}
                {item === "Appliances" && "🏠 "}
                {item === "Electronics" && "💻 "}
                {item === "Automotive" && "🚗 "}
                {item === "HVAC" && "❄️ "}
                {item}
              </Link>
            );
          })}
        </div>
      </form>

      <ProductSection label="🔥 Trending This Week" products={trending} />
      <ProductSection label="🆕 Recently Added" products={recent.length ? recent : trending} />
    </>
  );
}

function ProductSection({ label, products }: { label: string; products: ProductView[] }) {
  return (
    <section>
      <div className="section-line">
        <div className="section-label">{label}</div>
        <div className="section-link">View all →</div>
      </div>
      {products.length ? (
        <div className="mock-product-grid">
          {products.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">No products match this filter yet.</div>
      )}
    </section>
  );
}
