import { loadSelectors } from "./actions";
import { DeveloperClient } from "./developer-client";

export default async function DeveloperPage() {
  const selectors = await loadSelectors();
  return <DeveloperClient selectors={selectors} />;
}
