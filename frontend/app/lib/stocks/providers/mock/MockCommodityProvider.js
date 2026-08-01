// Mock commodity data provider (Stock Intelligence, Section 13). Synthetic responses only — never
// contacts BigMint or any real commodity-data vendor. Every price this returns is clearly
// mock-sourced (`source: "mock-commodity"`) so it can never be mistaken for a real BigMint or
// exchange quote if it ever reaches a UI before a real provider is wired in.
import { CommodityDataProvider } from "../types.js";
import { mockRef } from "./ids.js";

// A small, realistic-shaped fixture set covering the categories Section 13 names. Prices are
// plausible order-of-magnitude placeholders, not real market data, and deliberately move a little
// on every call (see jitter below) so a UI built against this mock has to handle a changing
// number rather than a frozen constant.
const FIXTURES = [
  { name: "HRC Steel", category: "steel", grade: "IS 2062 E250", location: "Mumbai", unit: "INR/tonne", basePrice: 52000 },
  { name: "Iron Ore Fines", category: "steel_inputs", grade: "62% Fe", location: "Odisha", unit: "INR/tonne", basePrice: 6200 },
  { name: "Coking Coal", category: "steel_inputs", grade: "Premium Hard Coking", location: "Import (Australia)", unit: "USD/tonne", basePrice: 240 },
  { name: "Thermal Coal", category: "energy", grade: "5500 GAR", location: "Import (Indonesia)", unit: "USD/tonne", basePrice: 95 },
  { name: "Steel Scrap", category: "steel_inputs", grade: "HMS 1&2 80:20", location: "Mumbai", unit: "INR/tonne", basePrice: 35000 },
  { name: "Aluminium", category: "base_metals", grade: "LME Cash", location: "LME", unit: "USD/tonne", basePrice: 2350 },
  { name: "Copper", category: "base_metals", grade: "LME Grade A", location: "LME", unit: "USD/tonne", basePrice: 9200 },
  { name: "Zinc", category: "base_metals", grade: "LME Special High Grade", location: "LME", unit: "USD/tonne", basePrice: 2700 },
  { name: "Polypropylene", category: "polymers", grade: "Raffia Grade", location: "Domestic", unit: "INR/kg", basePrice: 105 },
  { name: "Pet Coke", category: "cement_inputs", grade: "6.5% Sulphur", location: "Gujarat", unit: "INR/tonne", basePrice: 12000 },
  { name: "Crude Oil (Brent)", category: "energy", grade: "Brent", location: "ICE", unit: "USD/barrel", basePrice: 78 },
  { name: "Natural Rubber", category: "agri_inputs", grade: "RSS4", location: "Kottayam", unit: "INR/kg", basePrice: 165 },
  { name: "Baltic Dry Index", category: "freight", grade: null, location: "Global", unit: "index points", basePrice: 1450 },
];

function jitteredPrice(basePrice) {
  const jitter = 1 + (Math.random() - 0.5) * 0.04; // +/-2%, plausible day-to-day movement
  return Math.round(basePrice * jitter * 100) / 100;
}

function findFixture(commodityName) {
  const needle = String(commodityName || "").trim().toLowerCase();
  return FIXTURES.find((f) => f.name.toLowerCase() === needle) ?? null;
}

export class MockCommodityProvider extends CommodityDataProvider {
  async getLatestPrice({ commodityName, grade = null, location = null }) {
    const fixture = findFixture(commodityName);
    if (!fixture) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      commodity: fixture.name,
      grade: grade ?? fixture.grade,
      location: location ?? fixture.location,
      unit: fixture.unit,
      currency: fixture.unit.startsWith("USD") ? "USD" : "INR",
      price: jitteredPrice(fixture.basePrice),
      assessmentDate: today,
      source: "mock-commodity",
      methodologyRef: mockRef("mockmethod"),
      fetchedAt: new Date().toISOString(),
    };
  }

  async getPriceHistory({ commodityName, grade = null, location = null, from, to }) {
    const fixture = findFixture(commodityName);
    if (!fixture) return [];
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = [];
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d).toISOString().slice(0, 10));
    }
    return days.map((assessmentDate) => ({
      commodity: fixture.name,
      grade: grade ?? fixture.grade,
      location: location ?? fixture.location,
      unit: fixture.unit,
      currency: fixture.unit.startsWith("USD") ? "USD" : "INR",
      price: jitteredPrice(fixture.basePrice),
      assessmentDate,
      source: "mock-commodity",
      methodologyRef: mockRef("mockmethod"),
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listAvailableCommodities() {
    return FIXTURES.map((f) => ({ name: f.name, category: f.category, defaultUnit: f.unit }));
  }
}
