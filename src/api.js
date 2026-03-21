import { API_KEY } from '../utils/nexusConfig';

export const fetchWithBackoff = async (url, options, retries = 3, delay = 1000) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res;
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithBackoff(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const fetchGeminiJSON = async (prompt, useSearch = false) => {
  if (!API_KEY) throw new Error("API-avain puuttuu");
  
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };
  
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
};

export const fetchGeminiSearch = async (prompt) => {
  if (!API_KEY) throw new Error("API-avain puuttuu");
  const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
  });
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
};

export const fetchWikipediaSummary = async (query) => {
  const response = await fetch(`https://fi.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("Ei osumia Wikipediasta.");
  return await response.json();
};