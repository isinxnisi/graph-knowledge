import { resolveDiscovery, type DiscoveryContext } from "./discovery-prototype";
import { pathScope, type PathUi } from "./discovery-paths";
import { resolvePathPreset } from "./discovery-path-presets";

// Reuse an intent for another compatible subject. Incompatible edits become explicitly labelled free exploration.
export function rebasePathUi(ui: PathUi, before: DiscoveryContext, after: DiscoveryContext): PathUi {
  const oldPlan=resolveDiscovery(before), plan=resolveDiscovery(after);
  if (oldPlan.state!=="ready" || oldPlan.operation!=="neighbors" || ui.scope!==pathScope(oldPlan.anchorId,oldPlan.predicate,oldPlan.role)
    || plan.state!=="ready" || plan.operation!=="neighbors" || JSON.stringify(oldPlan)===JSON.stringify(plan)) return ui;
  const template=ui.preset ? resolvePathPreset(ui.preset) : null;
  const compatible=template && after.anchor?.kind===template.kinds[0] && plan.predicate===template.predicate;
  return {...ui,scope:pathScope(plan.anchorId,plan.predicate,plan.role),selected:null,preset:compatible?ui.preset:null,changed:!!template&&!compatible || ui.changed};
}
