import type { Product, ProductView } from "@/lib/types";

type ProductMeta = {
  emoji: string;
  company: string;
  model?: string;
  docs: number;
  sessions: number;
  resolutionRate: number;
  manufacturer: string;
  year: string;
  productType: string;
  featured?: boolean;
  commonIssues?: string[];
  documentation?: Array<{ icon: string; name: string; meta: string; featured?: boolean }>;
};

const metaById: Record<string, ProductMeta> = {
  "moss-router-x1": {
    emoji: "📡",
    company: "Moss Labs",
    model: "Model 2024",
    docs: 33,
    sessions: 642,
    resolutionRate: 88,
    manufacturer: "Moss Labs",
    year: "2024 - Present",
    productType: "Mesh Router",
    featured: true,
    commonIssues: ["Mesh node won't connect", "Router keeps disconnecting", "Amber light blinking", "Slow Wi-Fi speeds", "Cannot access wireless settings"],
    documentation: [
      { icon: "📘", name: "Quick Start Guide", meta: "PDF · 12 pages · Indexed" },
      { icon: "📘", name: "Mesh Pairing Guide", meta: "PDF · 18 pages · Indexed", featured: true },
      { icon: "🔧", name: "Troubleshooting Guide", meta: "PDF · 25 pages · Indexed" },
      { icon: "🔧", name: "LED Status Reference", meta: "PDF · 8 pages · Indexed" },
      { icon: "📘", name: "Firmware Update Guide", meta: "PDF · 14 pages · Indexed" },
      { icon: "🌐", name: "Support FAQ", meta: "URL · 50 articles · Indexed" },
    ],
  },
  "hp-laserjet-pro-m404n": {
    emoji: "🖨",
    company: "HP Inc.",
    model: "Model 2021",
    docs: 12,
    sessions: 4281,
    resolutionRate: 87,
    manufacturer: "HP Inc.",
    year: "2021 - Present",
    productType: "Monochrome Laser Printer",
    commonIssues: ["Faded print", "Paper jam", "Toner warning", "Print spooler stuck", "Connection timeout"],
    documentation: [
      { icon: "📘", name: "User Guide & Quick Reference", meta: "PDF · 148 pages · Indexed" },
      { icon: "🔧", name: "HP Service & Repair Manual", meta: "PDF · 312 pages · Indexed", featured: true },
      { icon: "🌐", name: "HP Support Knowledge Base", meta: "URL · 2,400 articles · Indexed" },
    ],
  },
  "smart-air-conditioner": {
    emoji: "❄️",
    company: "ClimateTech",
    docs: 8,
    sessions: 1673,
    resolutionRate: 89,
    manufacturer: "ClimateTech Industries",
    year: "2023 - Present",
    productType: "Split Air Conditioner",
    commonIssues: ["Not cooling", "Water leakage", "Strange noise", "Blinking timer light", "Remote control unresponsive"],
    documentation: [
      { icon: "📘", name: "Owner Operation Manual", meta: "PDF · 82 pages · Indexed" },
      { icon: "🔧", name: "Field Installation & Service Guide", meta: "PDF · 140 pages · Indexed", featured: true },
      { icon: "🌐", name: "AC Online Support Portal", meta: "URL · 350 articles · Indexed" },
    ],
  },
  "smart-washing-machine": {
    emoji: "🧼",
    company: "WashPro",
    docs: 6,
    sessions: 2104,
    resolutionRate: 91,
    manufacturer: "WashPro Appliances",
    year: "2023 - Present",
    productType: "Front Load Washer",
    commonIssues: ["Won't spin", "Water not draining", "Error code", "Door lock stuck", "Excessive vibration"],
    documentation: [
      { icon: "📘", name: "User Manual & Cycle Guide", meta: "PDF · 64 pages · Indexed" },
      { icon: "🔧", name: "Component Diagnostic Service Manual", meta: "PDF · 96 pages · Indexed", featured: true },
    ],
  },
  "water-purifier": {
    emoji: "💧",
    company: "AquaPure",
    docs: 4,
    sessions: 377,
    resolutionRate: 85,
    manufacturer: "AquaPure Sensors",
    year: "2024 - Present",
    productType: "RO Water Purifier",
    commonIssues: ["Low flow", "Filter replacement", "Taste issues", "Water leakage from base", "TDS alarm blinking"],
    documentation: [
      { icon: "📘", name: "Instruction Manual & Settings", meta: "PDF · 16 pages · Indexed" },
      { icon: "🔧", name: "RO Membrane Calibration Guide", meta: "PDF · 8 pages · Indexed", featured: true },
    ],
  },
};

export const fallbackProducts: Product[] = [
  {
    id: "moss-router-x1",
    name: "Moss Router X1",
    category: "Networking",
    description: "Compact mesh router for high-speed home and office networks.",
    image_url: "",
  },
  {
    id: "hp-laserjet-pro-m404n",
    name: "HP LaserJet Pro M404n",
    category: "Electronics",
    description: "Monochrome laser printer designed for small-to-medium workgroups with fast print speeds and security.",
    image_url: "",
  },
  {
    id: "smart-air-conditioner",
    name: "Smart Air Conditioner",
    category: "HVAC",
    description: "Advanced split AC system with smart climate scheduling and real-time power analytics.",
    image_url: "",
  },
  {
    id: "smart-washing-machine",
    name: "Smart Washing Machine",
    category: "Appliances",
    description: "High-efficiency front-load washing machine with custom cycle programming and automatic detergent dispensing.",
    image_url: "",
  },
  {
    id: "water-purifier",
    name: "Water Purifier",
    category: "Appliances",
    description: "Multi-stage RO filtration system with live TDS monitoring and filter replacement alerts.",
    image_url: "",
  },
];

export const categories = [
  "All",
  "Appliances",
  "Electronics",
  "HVAC",
  "Networking",
];

export function toProductView(product: Product): ProductView {
  const meta = metaById[product.id];
  if (meta) {
    return {
      ...product,
      ...meta,
      commonIssues: meta.commonIssues ?? getFallbackCommonIssues(product.category),
      documentation: meta.documentation ?? getFallbackDocumentation(product.category),
    };
  }

  // Dynamic generation for user-added products
  const category = product.category;
  const fallbackDocumentation = getFallbackDocumentation(category);
  const emoji = category.toLowerCase().includes("network")
    ? "📡"
    : category.toLowerCase().includes("sensor")
      ? "🌡️"
      : category.toLowerCase().includes("air") || category.toLowerCase().includes("hvac")
        ? "❄️"
        : category.toLowerCase().includes("wash") || category.toLowerCase().includes("purifier") || category.toLowerCase().includes("appliance")
          ? "🧼"
          : "⚙️";

  return {
    ...product,
    emoji,
    company: product.category,
    model: "Indexed product",
    docs: fallbackDocumentation.length,
    sessions: 0,
    resolutionRate: 100,
    manufacturer: product.category,
    year: `${new Date().getFullYear()} - Present`,
    productType: product.category,
    commonIssues: getFallbackCommonIssues(category),
    documentation: fallbackDocumentation,
  };
}

function getFallbackCommonIssues(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes("hvac") || cat.includes("air")) {
    return ["Not cooling", "Water leakage", "Strange noise", "Remote control unresponsive"];
  }
  if (cat.includes("network") || cat.includes("wifi") || cat.includes("router")) {
    return ["Mesh node won't connect", "Router keeps disconnecting", "Amber light blinking", "Slow Wi-Fi speeds"];
  }
  if (cat.includes("wash") || cat.includes("laundry") || cat.includes("machine")) {
    return ["Won't spin", "Water not draining", "Error code", "Excessive vibration"];
  }
  if (cat.includes("purifier") || cat.includes("water") || cat.includes("filter")) {
    return ["Low flow", "Filter replacement", "Taste issues", "TDS alarm blinking"];
  }
  if (cat.includes("printer") || cat.includes("laserjet") || cat.includes("print")) {
    return ["Faded print", "Paper jam", "Toner warning", "Print spooler stuck"];
  }
  return ["Device won't power on", "Status light blinking", "Intermittent disconnections", "Settings reset failed"];
}

function getFallbackDocumentation(category: string): Array<{ icon: string; name: string; meta: string; featured?: boolean }> {
  const cat = category.toLowerCase();
  let prefix = "Equipment";
  if (cat.includes("hvac") || cat.includes("air")) prefix = "AC Unit";
  else if (cat.includes("network") || cat.includes("wifi") || cat.includes("router")) prefix = "Router";
  else if (cat.includes("wash") || cat.includes("machine")) prefix = "Washer";
  else if (cat.includes("purifier") || cat.includes("water")) prefix = "Purifier";
  else if (cat.includes("printer") || cat.includes("print")) prefix = "Printer";
  
  return [
    { icon: "📘", name: `${prefix} User Instruction Manual`, meta: "PDF · 24 pages · Indexed" },
    { icon: "🔧", name: `${prefix} Diagnostics & Troubleshooting Reference`, meta: "PDF · 36 pages · Indexed", featured: true }
  ];
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
