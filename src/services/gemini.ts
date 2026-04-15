import { GoogleGenAI, Type } from "@google/genai";
import { Mood } from "../types";

let ai: GoogleGenAI | null = null;

function getAiClient() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");
      throw new Error("Falta la clave de API de Gemini (GEMINI_API_KEY). Por favor, configúrala en las variables de entorno de Vercel.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export async function getMoodVerse(mood: Mood) {
  const client = getAiClient();
  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `El usuario se siente "${mood}". Proporciona un versículo de la Biblia (Versión Recobro de Witness Lee) que lo anime. 
    Responde en formato JSON con los campos: "verse" (el texto del versículo), "reference" (la cita bíblica) y "encouragement" (una breve palabra de ánimo de 1-2 frases).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verse: { type: Type.STRING },
          reference: { type: Type.STRING },
          encouragement: { type: Type.STRING },
        },
        required: ["verse", "reference", "encouragement"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function getPrayerEncouragement(verses: string) {
  const client = getAiClient();
  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Basado en estos versículos: "${verses}", anima al lector a orar con uno o dos de ellos. Proporciona una breve sugerencia de oración (1-2 frases).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestion: { type: Type.STRING },
        },
        required: ["suggestion"],
      },
    },
  });

  return JSON.parse(response.text);
}
