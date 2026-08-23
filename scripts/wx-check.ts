import { resolveClimate, geocodeCity } from "@/lib/climate";

async function main() {
  const place = await geocodeCity("Kanpur");
  console.log("geocode:", place);
  if (place) {
    const c = await resolveClimate({ city: place.name, lat: place.lat, lon: place.lon });
    console.log("live:", c.live, "| source:", c.source);
    console.log(`  ${c.city} ${c.tempC}C  humidity ${c.humidityPct}%  rain30d ${c.rainfallMm}mm  heat=${c.heat} damp=${c.damp} season=${c.season}`);
    console.log("  disclosure:", c.disclosure);
  }
  const fb = await resolveClimate({ city: "Kanpur" });
  console.log("no-coords fallback -> live:", fb.live, "| source:", fb.source);
}
main();
