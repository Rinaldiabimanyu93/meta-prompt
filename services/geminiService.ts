
import { GoogleGenAI } from "@google/genai";
import { type FormData, type ParsedOutput } from "../types";
import { SYSTEM_PROMPT } from '../constants';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully.
  // For this environment, we assume it's always available.
  console.warn("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

function parseGeminiResponse(responseText: string): ParsedOutput {
    const sections = {
        summary: "Summary & Rationale",
        mainPrompt: "Prompt Utama (Siap Tempel)",
        variations: "2 Variasi Prompt",
        uiSpec: "UI Spec (JSON)",
        checklist: "Checklist Kualitas & Keamanan",
        example: "Contoh Isian → Hasil"
    };

    const extractSection = (startMarker: string, endMarker?: string) => {
        const startIndex = responseText.indexOf(startMarker);
        if (startIndex === -1) return "";
        
        let endIndex: number | undefined;
        if (endMarker) {
            endIndex = responseText.indexOf(endMarker, startIndex + startMarker.length);
        }

        return responseText.substring(startIndex + startMarker.length, endIndex).trim();
    };
    
    const allMarkers = Object.values(sections);
    const getNextMarker = (currentMarker: string): string | undefined => {
        const currentIndex = allMarkers.indexOf(currentMarker);
        if (currentIndex !== -1 && currentIndex + 1 < allMarkers.length) {
            return allMarkers[currentIndex + 1];
        }
        return undefined;
    };
    
    const summarySection = extractSection(sections.summary, getNextMarker(sections.summary));
    const mainPrompt = extractSection(sections.mainPrompt, getNextMarker(sections.mainPrompt));
    const variationsBlock = extractSection(sections.variations, getNextMarker(sections.variations));
    const checklist = extractSection(sections.checklist, getNextMarker(sections.checklist));
    const example = extractSection(sections.example);

    const variantAPattern = /Variasi A \(Konservatif\):([\s\S]*?)Variasi B \(Kreatif\):/;
    const variantBPattern = /Variasi B \(Kreatif\):([\s\S]*)/;

    const variantAMatch = variationsBlock.match(variantAPattern);
    const variantBMatch = variationsBlock.match(variantBPattern);
    
    const variantA = variantAMatch ? variantAMatch[1].trim() : "";
    const variantB = variantBMatch ? variantBMatch[1].trim() : "";

    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const jsonMatch = responseText.match(jsonRegex);
    let uiSpec = "";
    if (jsonMatch && jsonMatch[1]) {
        try {
            const parsedJson = JSON.parse(jsonMatch[1]);
            uiSpec = JSON.stringify(parsedJson, null, 2);
        } catch (e) {
            console.error("Failed to parse UI Spec JSON:", e);
            uiSpec = "Error: Invalid JSON in response.";
        }
    }
    
    const techniquesRegex = /Teknik Terpilih:\s*(.*)/;
    const techniquesMatch = summarySection.match(techniquesRegex);
    const techniques = techniquesMatch ? techniquesMatch[1].trim() : "Tidak terdeteksi";

    return {
        summary: summarySection,
        mainPrompt,
        variantA,
        variantB,
        uiSpec,
        checklist,
        example,
        techniques
    };
}


export const generateMetaPrompt = async (formData: FormData): Promise<ParsedOutput> => {
  const model = 'gemini-2.5-flash';
  
  const userPrompt = `
    ## INPUT YANG AKAN DITERIMA (isi oleh pengguna/aplikasi)

    * **goal**: ${formData.goal || 'Tidak ditentukan'}
    * **audience**: ${formData.audience || 'Tidak ditentukan'}
    * **context**: ${formData.context || 'Tidak ditentukan'}
    * **constraints**: ${formData.constraints || 'Tidak ditentukan'}
    * **risk_tolerance**: ${formData.risk_tolerance || 'sedang'}
    * **need_citations**: ${formData.need_citations || false}
    * **creativity_level**: ${formData.creativity_level || 'sedang'}
    * **tools_available**: [${Array.isArray(formData.tools_available) ? formData.tools_available.join(', ') : 'Tidak ada'}]
    * **language**: ${formData.language || 'id'}

    Silakan lanjutkan.
  `;
  
  try {
    const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
            systemInstruction: SYSTEM_PROMPT
        }
    });

    const responseText = response.text;
    if (!responseText) {
        throw new Error("Received an empty response from the API.");
    }
    
    return parseGeminiResponse(responseText);

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate prompt. Please check the console for details.");
  }
};
