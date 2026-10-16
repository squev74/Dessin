import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DrawingPrompt {
  title: string;
  category: "imagination" | "observation" | "technique" | "poetique";
  difficulty: "facile" | "moyen";
}

export interface ModerationResult {
  status: "APPROVED" | "REJECTED";
  reason: string | null;
  is_hand_drawn: boolean;
  alt_text: string;
}

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

const MODERATION_SYSTEM_INSTRUCTION = `Tu es l'agent de modération automatique d'une application de dessin collectif. Réponds strictement au format JSON demandé.`;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "La clé GEMINI_API_KEY n'est pas configurée dans l'environnement."
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Endpoint 1: Art Director Prompt Generator using Gemini Flash with thinkingBudget: 0
  app.post("/api/prompts/generate", async (req, res) => {
    try {
      const {
        count = 6,
        theme = "libre",
        requestedCategory,
        requestedDifficulty,
      } = req.body;

      const ai = getAiClient();

      let userPrompt = `Génère exactement ${count} consignes de dessin bienveillantes et variées.`;
      if (theme && theme !== "libre") {
        userPrompt += ` Thème d'inspiration : "${theme}".`;
      }
      if (requestedCategory && requestedCategory !== "all") {
        userPrompt += ` Catégorie privilégiée : "${requestedCategory}".`;
      }
      if (requestedDifficulty && requestedDifficulty !== "all") {
        userPrompt += ` Difficulté souhaitée : "${requestedDifficulty}".`;
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
      // Compress & lighten JSON before sending
      const parsedPrompts: DrawingPrompt[] = JSON.parse(rawText);
      const compressed = parsedPrompts.map((p) => ({
        title: typeof p.title === "string" ? p.title.trim() : "Dessine librement.",
        category: p.category || "imagination",
        difficulty: p.difficulty || "facile",
      }));

      res.json(compressed);
    } catch (error: unknown) {
      console.error("Erreur génération consignes:", error);
      const message = error instanceof Error ? error.message : "Erreur de génération.";
      res.status(500).json({ error: message });
    }
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur ArtGuard AI actif sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
