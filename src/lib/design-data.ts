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
    commonIssues: ["Paper jam", "Faded print", "Toner low error", "Print spooler stuck", "Connection timeout"],
    documentation: [
      { icon: "📘", name: "User Guide & Quick Reference", meta: "PDF · 148 pages · Indexed" },
      { icon: "🔧", name: "HP Service & Repair Manual", meta: "PDF · 312 pages · Indexed", featured: true },
      { icon: "🎬", name: "Paper Jam Troubleshooting (Video)", meta: "MP4 · 8 min · Indexed" },
      { icon: "🌐", name: "HP Support Knowledge Base", meta: "URL · 2,400 articles · Indexed" },
    ],
  },
  "daikin-ftxm35tvma": {
    emoji: "❄️",
    company: "Daikin Industries",
    docs: 8,
    sessions: 1673,
    resolutionRate: 89,
    manufacturer: "Daikin Industries",
    year: "2020 - Present",
    productType: "Split Air Conditioner",
    featured: true,
    commonIssues: ["AC not cooling", "Water leaking from indoor unit", "Remote control unresponsive", "Blinking timer light", "Strange fan noise"],
    documentation: [
      { icon: "📘", name: "Owner Operation Manual", meta: "PDF · 82 pages · Indexed" },
      { icon: "🔧", name: "Field Installation & Service Guide", meta: "PDF · 140 pages · Indexed", featured: true },
      { icon: "🌐", name: "Daikin AC Online Support Portal", meta: "URL · 350 articles · Indexed" },
    ],
  },
  "caterpillar-320-gc": {
    emoji: "⚙️",
    company: "Caterpillar Inc.",
    docs: 24,
    sessions: 3150,
    resolutionRate: 84,
    manufacturer: "Caterpillar Inc.",
    year: "2019 - Present",
    productType: "Hydraulic Excavator",
    commonIssues: ["Engine low oil pressure", "Hydraulic cylinder leak", "Monitor displays fault code 103", "Electronic control module offline", "Track tension loose"],
    documentation: [
      { icon: "📘", name: "Operator & Maintenance Manual", meta: "PDF · 220 pages · Indexed" },
      { icon: "🔧", name: "Hydraulic Systems Service Manual", meta: "PDF · 410 pages · Indexed", featured: true },
      { icon: "🎬", name: "Track Adjustment & Tensioning Guide", meta: "Video · 15 min · Indexed" },
    ],
  },
  "bosch-series-8-induction": {
    emoji: "🍳",
    company: "Bosch Home",
    model: "Added 2h ago",
    docs: 6,
    sessions: 2104,
    resolutionRate: 91,
    manufacturer: "Bosch Home Appliances",
    year: "2023 - Present",
    productType: "Induction Cooktop",
    commonIssues: ["Touch control unresponsive", "Error code E4", "Stove keeps blinking", "Not heating up", "Safety lock stuck on"],
    documentation: [
      { icon: "📘", name: "User Manual & Installation Guide", meta: "PDF · 64 pages · Indexed" },
      { icon: "🔧", name: "Component Diagnostic Service Manual", meta: "PDF · 96 pages · Indexed", featured: true },
    ],
  },
  "siemens-s7-1200-plc": {
    emoji: "🔧",
    company: "Siemens AG",
    model: "Added 5h ago",
    docs: 18,
    sessions: 1311,
    resolutionRate: 86,
    manufacturer: "Siemens AG",
    year: "2022 - Present",
    productType: "Programmable Logic Controller",
    commonIssues: ["CPU SF error light red", "Cannot connect via Profinet", "Analog input value fluctuation", "Expansion module not recognized", "Memory card error code 16"],
    documentation: [
      { icon: "📘", name: "S7-1200 System Manual", meta: "PDF · 870 pages · Indexed" },
      { icon: "🔧", name: "Troubleshooting and Diagnostics Guide", meta: "PDF · 185 pages · Indexed", featured: true },
    ],
  },
  "ford-f-150-2023-raptor": {
    emoji: "🚗",
    company: "Ford Motor Co",
    model: "Added 1d ago",
    docs: 32,
    sessions: 5770,
    resolutionRate: 82,
    manufacturer: "Ford Motor Co",
    year: "2023",
    productType: "Performance Pickup Truck",
    commonIssues: ["Transmission shift delay", "Drive mode selector fault", "SYNC 4 screen blank", "Turbocharger pressure drop", "Suspension warning light"],
    documentation: [
      { icon: "📘", name: "Owner's Manual & Sync Guide", meta: "PDF · 480 pages · Indexed" },
      { icon: "🔧", name: "3.5L EcoBoost Service Manual", meta: "PDF · 1200 pages · Indexed", featured: true },
    ],
  },
  "moss-router-x1": {
    emoji: "📡",
    company: "Moss Labs",
    model: "Sample product",
    docs: 5,
    sessions: 642,
    resolutionRate: 88,
    manufacturer: "Moss Labs",
    year: "2024 - Present",
    productType: "Mesh Router",
    commonIssues: ["My mesh node won't connect to the main router", "Router keeps disconnecting every few minutes", "Amber light is blinking", "Slow speed on 5GHz channel", "Firmware update keeps failing"],
    documentation: [
      { icon: "📘", name: "Quick Start Guide", meta: "PDF · 12 pages · Indexed" },
      { icon: "📘", name: "Mesh Pairing & Sync Guide", meta: "PDF · 18 pages · Indexed", featured: true },
      { icon: "🔧", name: "LED Status & Diagnostics Reference", meta: "PDF · 8 pages · Indexed" },
      { icon: "🔧", name: "Troubleshooting & FAQ Reference", meta: "PDF · 25 pages · Indexed" },
    ],
  },
  "aero-clean-500": {
    emoji: "🌬️",
    company: "AeroClean",
    model: "Sample product",
    docs: 7,
    sessions: 812,
    resolutionRate: 90,
    manufacturer: "AeroClean",
    year: "2024 - Present",
    productType: "Smart Air Purifier",
    commonIssues: ["Filter reset light won't turn off", "Fan making high-pitched noise", "Air quality sensor stays red", "App connection failed", "Purifier powers off randomly"],
    documentation: [
      { icon: "📘", name: "User Manual & Filter Care", meta: "PDF · 36 pages · Indexed" },
      { icon: "🔧", name: "Smart Sensors Troubleshooting", meta: "PDF · 14 pages · Indexed", featured: true },
    ],
  },
  "thermopro-2": {
    emoji: "🌡️",
    company: "ThermoPro",
    model: "Sample product",
    docs: 4,
    sessions: 377,
    resolutionRate: 85,
    manufacturer: "ThermoPro",
    year: "2024 - Present",
    productType: "Wireless Temperature Sensor",
    commonIssues: ["Temperature readings inaccurate", "Batteries drain too quickly", "Out of range disconnection", "LED display faded", "Sync button unresponsive"],
    documentation: [
      { icon: "📘", name: "Instruction Manual & Settings", meta: "PDF · 16 pages · Indexed" },
      { icon: "🔧", name: "Wireless Transceiver Calibration Guide", meta: "PDF · 8 pages · Indexed", featured: true },
    ],
  },
};

export const fallbackProducts: Product[] = [
  {
    id: "hp-laserjet-pro-m404n",
    name: "HP LaserJet Pro M404n",
    category: "Electronics",
    description:
      "A high-speed monochrome laser printer designed for small to medium workgroups. Supports USB 2.0 and Gigabit Ethernet connectivity. Rated for 80,000 pages/month duty cycle.",
    image_url: "https://images.unsplash.com/photo-1563206767-5b18f218e8de",
  },
  {
    id: "daikin-ftxm35tvma",
    name: "Daikin FTXM35TVMA",
    category: "HVAC",
    description:
      "Wall mounted split air conditioner with inverter controls, humidity management, and service diagnostics.",
    image_url: "https://images.unsplash.com/photo-1621905252507-b354bc25edac",
  },
  {
    id: "caterpillar-320-gc",
    name: "Caterpillar 320 GC",
    category: "Industrial",
    description:
      "Hydraulic excavator with electronic monitoring, fault codes, and planned maintenance documentation.",
    image_url: "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b",
  },
  {
    id: "bosch-series-8-induction",
    name: "Bosch Series 8 Induction",
    category: "Appliances",
    description:
      "Premium induction cooktop with touch controls, power management, and safety lock diagnostics.",
    image_url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f",
  },
  {
    id: "siemens-s7-1200-plc",
    name: "Siemens S7-1200 PLC",
    category: "Industrial",
    description:
      "Compact industrial PLC for automation systems with hardware diagnostics and module status references.",
    image_url: "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6",
  },
  {
    id: "ford-f-150-2023-raptor",
    name: "Ford F-150 2023 Raptor",
    category: "Automotive",
    description:
      "Performance pickup with service manuals, drivetrain diagnostics, and maintenance procedures.",
    image_url: "https://images.unsplash.com/photo-1605558202076-1692af9a01b4",
  },
];

export const categories = [
  "All",
  "Industrial",
  "Appliances",
  "Electronics",
  "Automotive",
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
  const emoji = category.toLowerCase().includes("network")
    ? "📡"
    : category.toLowerCase().includes("sensor")
      ? "🌡️"
      : category.toLowerCase().includes("air") || category.toLowerCase().includes("hvac")
        ? "❄️"
        : category.toLowerCase().includes("cook") || category.toLowerCase().includes("appliance")
          ? "🍳"
          : "⚙️";

  return {
    ...product,
    emoji,
    company: product.category,
    model: "Indexed product",
    docs: 0,
    sessions: 0,
    resolutionRate: 100,
    manufacturer: product.category,
    year: `${new Date().getFullYear()} - Present`,
    productType: product.category,
    commonIssues: getFallbackCommonIssues(category),
    documentation: getFallbackDocumentation(category),
  };
}

function getFallbackCommonIssues(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes("hvac") || cat.includes("air")) {
    return ["AC not cooling", "Water leaking from indoor unit", "Remote control unresponsive", "Strange system noise"];
  }
  if (cat.includes("network") || cat.includes("wifi")) {
    return ["Wi-Fi connection drops", "Cannot connect to main unit", "Amber light is blinking", "Slow internet speeds"];
  }
  if (cat.includes("appliance") || cat.includes("cook")) {
    return ["Unresponsive touch controls", "Not heating up", "Error code blinking", "Safety lock stuck"];
  }
  if (cat.includes("industrial") || cat.includes("excavator") || cat.includes("plc")) {
    return ["Error status light on", "Hydraulic pressure low", "Loss of signal fault", "Maintenance warning reset"];
  }
  return ["Device won't power on", "Status light blinking", "Intermittent disconnections", "Settings reset failed"];
}

function getFallbackDocumentation(category: string): Array<{ icon: string; name: string; meta: string; featured?: boolean }> {
  const cat = category.toLowerCase();
  let prefix = "Equipment";
  if (cat.includes("hvac") || cat.includes("air")) prefix = "AC Unit";
  else if (cat.includes("network") || cat.includes("wifi")) prefix = "Router";
  else if (cat.includes("appliance") || cat.includes("cook")) prefix = "Appliance";
  else if (cat.includes("industrial") || cat.includes("plc")) prefix = "Controller";
  
  return [
    { icon: "📘", name: `${prefix} User Instruction & Settings`, meta: "PDF · 24 pages · Indexed" },
    { icon: "🔧", name: `${prefix} Diagnostic & Troubleshooting Guide`, meta: "PDF · 36 pages · Indexed", featured: true }
  ];
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
