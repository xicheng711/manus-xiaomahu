import { describe, it, expect } from "vitest";

describe("Gemini API Key validation", () => {
  it("should call Gemini API with a working model", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    expect(apiKey, "GEMINI_API_KEY must be set").toBeTruthy();
    console.log("Key length:", apiKey!.length, "| Starts with:", apiKey!.slice(0, 4));

    const models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];
    let worked = false;
    let workingModel = "";

    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Say hello in Chinese." }] }] }),
        }
      );
      const data = await response.json() as any;
      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log(`✅ Model ${model} works:`, data.candidates[0].content.parts[0].text);
        worked = true;
        workingModel = model;
        break;
      }
      console.log(`❌ Model ${model}: ${response.status} - ${data.error?.message?.slice(0,80)}`);
    }

    expect(worked, `No working Gemini model found`).toBe(true);
    console.log("Working model:", workingModel);
  }, 30000);
});
