import { fallbackProducts, toProductView } from "@/lib/design-data";
import type { ImportStatusResponse, Product, ProductView } from "@/lib/types";

export const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function getProducts(options?: {
  query?: string;
  category?: string;
}): Promise<ProductView[]> {
  const params = new URLSearchParams();
  if (options?.query) params.set("query", options.query);
  if (options?.category && options.category !== "All") params.set("category", options.category);
  const suffix = params.size ? `?${params.toString()}` : "";

  try {
    const products = await fetchJson<Product[]>(`/products${suffix}`);
    return products.length ? products.map(toProductView) : fallbackProducts.map(toProductView);
  } catch {
    return fallbackProducts
      .filter((product) => {
        const query = options?.query?.toLowerCase().trim();
        const matchesQuery = query
          ? `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query)
          : true;
        const matchesCategory =
          !options?.category || options.category === "All" || product.category === options.category;
        return matchesQuery && matchesCategory;
      })
      .map(toProductView);
  }
}

export async function getProduct(productId: string): Promise<ProductView | null> {
  try {
    return toProductView(await fetchJson<Product>(`/products/${productId}`));
  } catch {
    const fallback = fallbackProducts.find((product) => product.id === productId) ?? fallbackProducts[0];
    return fallback ? toProductView(fallback) : null;
  }
}

export async function getImportStatus(): Promise<ImportStatusResponse | null> {
  try {
    const url = typeof window === "undefined" ? `${API_BASE_URL}/import/status` : "/api/import/status";
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as Promise<ImportStatusResponse>;
  } catch {
    return null;
  }
}

export async function createProduct(payload: {
  id?: string;
  name: string;
  category: string;
  description: string;
  image_url: string;
}): Promise<Product> {
  const response = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.detail || `Failed to create product: ${response.status}`);
  }

  return response.json() as Promise<Product>;
}
