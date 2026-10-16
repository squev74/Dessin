import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { INITIAL_CURATED_PROMPTS, DrawingPrompt } from "./utils/curatedPrompts";

const ART_DIRECTOR_SYSTEM_INSTRUCTION = `Tu es le directeur artistique d'une application de dessin collectif ludique, sans pression et ouverte à tous les niveaux.
Ta mission est de générer des consignes de dessin originales, bienveillantes et faciles à comprendre.

Principes des consignes :
- Courtes (1 phrase simple).
- Pas de pression technique.
- Alternance équilibrée entre observation, imagination absurde, défi technique et poésie.

Format de réponse requis : STRICTEMENT un tableau JSON conforme au schéma.
Chaque élément doit posséder :
- "title": la consigne en une seule phrase simple et chaleureuse.
- "category": l'une des 4 catégories exactes ("imagination", "observation", "technique", "poetique").
- "difficulty": "facile" ou "moyen".`;

export async function generatePromptsClientSide(
  apiKey: string,
  count = 6,
  theme = "libre"
): Promise<DrawingPrompt[]> {
  if (!apiKey) {
    throw new Error("Clé API Gemini requise pour la génération.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let userPrompt = `Génère exactement ${count} consignes de dessin bienveillantes et variées.`;
  if (theme && theme !== "libre") {
    userPrompt += ` Thème d'inspiration : "${theme}".`;
  }

  // Cost optimization: using Flash model with thinkingBudget: 0
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: ART_DIRECTOR_SYSTEM_INSTRUCTION,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["imagination", "observation", "technique", "poetique"] },
            difficulty: { type: Type.STRING, enum: ["facile", "moyen"] },
          },
          required: ["title", "category", "difficulty"],
        },
      },
    },
  });

  const rawText = response.text?.trim() || "[]";
  const parsedPrompts: DrawingPrompt[] = JSON.parse(rawText);
  
  // Compress & lighten JSON before returning
  const compressed = parsedPrompts.map((p, idx) => ({
    id: `prompt-${Date.now()}-${idx}`,
    orderIndex: idx + 1,
    title: typeof p.title === "string" ? p.title.trim() : "Dessine librement.",
    category: p.category || "imagination",
    difficulty: p.difficulty || "facile",
  }));

  return compressed;
}
