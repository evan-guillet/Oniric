import type { ViewId } from "./projectContext";

const LATER: Partial<Record<ViewId, { title: string; text: string; version: string }>> = {
  moodboard: { title: "Moodboard", text: "Les images de référence du film : couleurs, lumières, costumes, décors.", version: "2.0" },
  shotlist: { title: "Découpage", text: "Les plans de chaque scène : valeur, mouvement, optique, durée.", version: "2.0" },
  storyboard: { title: "Storyboard", text: "Une case dessinée ou importée par plan, reliée au découpage.", version: "2.0" },
  team: { title: "Équipe", text: "L'équipe et la distribution, avec leurs coordonnées et leurs disponibilités.", version: "2.0" },
  breakdown: { title: "Dépouillement", text: "Tout ce dont chaque scène a besoin : rôles, figurants, accessoires, costumes, véhicules.", version: "2.0" },
  schedule: { title: "Plan de travail", text: "L'ordre de tournage des scènes, jour par jour.", version: "2.0" },
  callsheets: { title: "Feuilles de service", text: "La feuille de chaque journée de tournage, prête à envoyer.", version: "2.0" },
  budget: { title: "Budget", text: "Le devis du film, poste par poste.", version: "3.0" },
  scouting: { title: "Repérages", text: "Les lieux de tournage visités, avec photos et contacts.", version: "3.0" },
  permits: { title: "Autorisations", text: "Les autorisations de tournage et leurs échéances.", version: "3.0" },
};

/** The views of the next versions, shown so that the whole film is visible from the start [PRJ-02]. */
export function LaterView({ view }: { view: ViewId }) {
  const v = LATER[view];
  if (!v) return null;
  return (
    <div className="view view-pad">
      <div className="empty-state">
        <h2>{v.title}</h2>
        <p>{v.text}</p>
        <p className="muted">Arrive dans la version {v.version} d'Oniric.</p>
      </div>
    </div>
  );
}
