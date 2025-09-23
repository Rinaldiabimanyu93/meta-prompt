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
        let jsonString = jsonMatch[1];
        
        // Isolate the core JSON object/array to remove potential surrounding text from the LLM.
        const firstBracketIndex = jsonString.indexOf('{');
        const firstSquareBracketIndex = jsonString.indexOf('[');
        
        let startIndex = -1;
        if (firstBracketIndex === -1) {
            startIndex = firstSquareBracketIndex;
        } else if (firstSquareBracketIndex === -1) {
            startIndex = firstBracketIndex;
        } else {
            startIndex = Math.min(firstBracketIndex, firstSquareBracketIndex);
        }

        if (startIndex !== -1) {
             const lastBracketIndex = jsonString.lastIndexOf('}');
             const lastSquareBracketIndex = jsonString.lastIndexOf(']');
             const endIndex = Math.max(lastBracketIndex, lastSquareBracketIndex);

             if (endIndex > startIndex) {
                 jsonString = jsonString.substring(startIndex, endIndex + 1);
             }
        }
        
        try {
            // Use a lenient parsing method to handle common LLM formatting quirks like
            // trailing commas, comments, and unquoted keys. This is safer than eval.
            const parsedJson = new Function(`return ${jsonString}`)();
            uiSpec = JSON.stringify(parsedJson, null, 2);
        } catch (e) {
            console.error("Failed to parse UI Spec JSON:", e);
            uiSpec = `Error: Invalid JSON in response. Automatic parsing failed.\n\nContent that failed parsing:\n${jsonString}`;
        }
    } else {
        uiSpec = "UI Spec JSON not found in the response.";
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
        const candidate = response.candidates?.[0];
        if (candidate) {
            const { finishReason, safetyRatings } = candidate;
            if (finishReason === 'SAFETY') {
                const blockedCategories = safetyRatings?.filter(r => r.blocked).map(r => r.category.replace('HARM_CATEGORY_', '')).join(', ');
                throw new Error(`Request blocked for safety reasons. Blocked categories: ${blockedCategories || 'Unknown'}. Please adjust your input.`);
            }
            if (finishReason === 'RECITATION') {
                throw new Error("Request blocked due to potential recitation. The model's response would have been too similar to a source on the web. Please try a different prompt.");
            }
             if (finishReason === 'MAX_TOKENS') {
                throw new Error("The response was stopped because it reached the maximum token limit. Try asking for a shorter response.");
            }
            if (finishReason) {
                 throw new Error(`The request was stopped for the following reason: ${finishReason}. Please adjust your input and try again.`);
            }
        }
        throw new Error("Received an empty response from the API. This could be due to content filters or a lack of a specific answer from the model.");
    }
    
    return parseGeminiResponse(responseText);

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        // Re-throw the more specific errors from the try block
        if (error.message.startsWith('Request blocked') || error.message.startsWith('The response was stopped') || error.message.startsWith('Received an empty response')) {
            throw error;
        }

        const message = error.message.toLowerCase();
        if (message.includes('api key not valid')) {
            throw new Error('The API key is invalid. Please ensure it is correctly configured in your environment.');
        }
        if (message.includes('429') || message.includes('resource exhausted')) {
            throw new Error('You have exceeded your request quota. Please wait a moment and try again.');
        }
        if (message.includes('500') || message.includes('internal error')) {
            throw new Error('The AI service encountered an internal error. Please try again later.');
        }
         if (message.includes('400') || message.includes('invalid argument')) {
            throw new Error('The request sent to the AI service was malformed. Please check the input.');
        }
        if(message.includes('fetch failed') || message.includes('network error')) {
            throw new Error('A network error occurred. Please check your internet connection and try again.');
        }
        
        throw new Error(`An API error occurred: ${error.message}`);
    }

    throw new Error("An unexpected error occurred while communicating with the API.");
  }
};