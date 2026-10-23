import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const source = readFileSync(process.argv[2] || "/tmp/gstudy-world.geojson");
const expected = "6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f";
if (createHash("sha256").update(source).digest("hex") !== expected)
  throw new Error("A fonte mudou. Revise a nova versão antes de atualizar o mapa.");
const data = JSON.parse(source.toString());
const countries = data.features
  .filter((feature) => feature.properties.ADM0_A3 !== "ATA")
  .map((feature) => {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    const path = polygons
      .flatMap((polygon) =>
        polygon.map(
          (ring) =>
            "M" +
            ring
              .map(
                ([x, y]) =>
                  `${Number(((x + 180) * 2.5).toFixed(1))},${Number(((85 - y) * 2.5).toFixed(1))}`,
              )
              .join("L") +
            "Z",
        ),
      )
      .join("");
    return {
      id: feature.properties.ADM0_A3,
      name: feature.properties.NAME_PT || feature.properties.ADMIN,
      path,
    };
  });
writeFileSync(
  fileURLToPath(new URL("../src/lib/games/world-map.json", import.meta.url)),
  JSON.stringify(countries, null, 2) + "\n",
);
console.log(`${countries.length} países gerados. Execute Prettier no JSON.`);
