import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Product } from "@/lib/types";
import { fallbackProducts } from "@/lib/design-data";

const PRODUCTS_PATH = path.join(process.cwd(), "backend", "storage", "products.json");

type ProductPayload = {
  id?: string;
  name: string;
  category: string;
  description: string;
  image_url: string;
};

export async function readStoredProducts(options?: {
  query?: string;
  category?: string;
}): Promise<Product[]> {
  const products = await readAllProducts();
  const query = options?.query?.trim().toLowerCase();
  const category = options?.category?.trim().toLowerCase();

  return products
    .filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
      const matchesQuery = query ? haystack.includes(query) : true;
      const matchesCategory = category ? product.category.toLowerCase().includes(category) : true;
      return matchesQuery && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readStoredProduct(productId: string): Promise<Product | null> {
  const products = await readAllProducts();
  return products.find((product) => product.id === productId) ?? null;
}

export async function createStoredProduct(payload: ProductPayload): Promise<Product> {
  const products = await readAllProducts();
  const id = normalizeId(payload.id || payload.name);

  if (products.some((product) => product.id === id)) {
    throw new Error(`Product id already exists: ${id}`);
  }

  const product = cleanProduct({ ...payload, id });
  products.push(product);
  await writeProducts(products);
  return product;
}

export async function updateStoredProduct(productId: string, payload: ProductPayload): Promise<Product> {
  const products = await readAllProducts();
  const index = products.findIndex((product) => product.id === productId);

  if (index === -1) {
    throw new Error(`Product not found: ${productId}`);
  }

  const product = cleanProduct({ ...payload, id: productId });
  products[index] = product;
  await writeProducts(products);
  return product;
}

export async function deleteStoredProduct(productId: string): Promise<void> {
  const products = await readAllProducts();
  const next = products.filter((product) => product.id !== productId);

  if (next.length === products.length) {
    throw new Error(`Product not found: ${productId}`);
  }

  await writeProducts(next);
}

export function makeLocalImportResponse(productId: string, message: string) {
  return {
    imported_count: 1,
    indexed_count: 1,
    index_name: "local-next-fallback",
    job_id: `local-${randomUUID()}`,
    import_id: `local-${randomUUID()}`,
    product_id: productId,
    message,
  };
}

async function readAllProducts(): Promise<Product[]> {
  try {
    const raw = await readFile(PRODUCTS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallbackProducts;

    const products = parsed
      .filter((item): item is Product => isProduct(item))
      .map(cleanProduct);

    return products.length ? products : fallbackProducts;
  } catch {
    return fallbackProducts;
  }
}

async function writeProducts(products: Product[]): Promise<void> {
  await writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf-8");
}

function cleanProduct(product: Product): Product {
  return {
    id: String(product.id).trim(),
    name: String(product.name).trim(),
    category: String(product.category).trim(),
    description: String(product.description).trim(),
    image_url: String(product.image_url || "").trim(),
  };
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return ["id", "name", "category", "description", "image_url"].every(
    (key) => typeof product[key] === "string"
  );
}

function normalizeId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Product name must contain at least one letter or number.");
  return id;
}
