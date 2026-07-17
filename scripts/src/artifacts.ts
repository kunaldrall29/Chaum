import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/src -> contracts/target/dev
const DIR = resolve(HERE, "../../contracts/target/dev");

export interface Artifact {
  sierra: any;
  casm: any;
}

export function artifact(name: string): Artifact {
  const sierra = JSON.parse(
    readFileSync(resolve(DIR, `chaum_${name}.contract_class.json`), "utf8"),
  );
  const casm = JSON.parse(
    readFileSync(resolve(DIR, `chaum_${name}.compiled_contract_class.json`), "utf8"),
  );
  return { sierra, casm };
}
