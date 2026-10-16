export interface DrawingPrompt {
  id: string;
  orderIndex: number;
  title: string;
  category: "imagination" | "observation" | "technique" | "poetique";
  difficulty: "facile" | "moyen";
}

export const CATEGORY_METADATA: Record<
  DrawingPrompt["category"],
  { label: string; description: string; color: string; icon: string }
> = {
  imagination: {
    label: "Imagination absurde",
    description: "Combinaisons cocasses, idées décalées et liberté totale.",
    color: "bg-amber-100 text-amber-900 border-amber-200",
    icon: "Sparkles",
  },
  observation: {
    label: "Dessin d'observation",
    description: "Le quotidien sous un autre angle, objets et détails familiers.",
    color: "bg-sky-100 text-sky-900 border-sky-200",
    icon: "Eye",
  },
  technique: {
    label: "Défi technique ludique",
    description: "Petites contraintes amusantes sans pression de résultat.",
    color: "bg-emerald-100 text-emerald-900 border-emerald-200",
    icon: "Target",
  },
  poetique: {
    label: "Interprétation poétique",
    description: "Émotions douces, métaphores visuelles et sensations.",
    color: "bg-purple-100 text-purple-900 border-purple-200",
    icon: "Heart",
  },
};

export const INITIAL_CURATED_PROMPTS: DrawingPrompt[] = [
  {
    id: "prompt-1",
    orderIndex: 1,
    title: "Dessine une tasse de thé qui rêve de devenir un phare au milieu de l'océan.",
    category: "imagination",
    difficulty: "facile",
  },
  {
    id: "prompt-2",
    orderIndex: 2,
    title: "Prends l'objet le plus proche de ta main droite et croque-le sans jamais regarder ta feuille.",
    category: "technique",
    difficulty: "moyen",
  },
  {
    id: "prompt-3",
    orderIndex: 3,
    title: "Dessine la silhouette d'une plante ou d'un arbre de ta fenêtre vu à travers une vitre embuée.",
    category: "poetique",
    difficulty: "facile",
  },
  {
    id: "prompt-4",
    orderIndex: 4,
    title: "Croque tes clés ou la poignée de porte la plus familière avec ses petites traces du temps.",
    category: "observation",
    difficulty: "facile",
  },
  {
    id: "prompt-5",
    orderIndex: 5,
    title: "Imagine le véhicule de fonction secret et un peu ridicule d'un écureuil détective.",
    category: "imagination",
    difficulty: "facile",
  },
  {
    id: "prompt-6",
    orderIndex: 6,
    title: "Dessine un animal imaginaire en un seul trait continu sans jamais décoller la pointe.",
    category: "technique",
    difficulty: "moyen",
  },
];

export const THEME_PRESETS = [
  { id: "libre", label: "Inspiration libre et variée" },
  { id: "quotidien", label: "Le quotidien réenchanté" },
  { id: "nature", label: "Nature, vent et saisons" },
  { id: "absurde", label: "Humour absurde et animaux décalés" },
  { id: "douceur", label: "Cocooning, thé et douceur du soir" },
];
