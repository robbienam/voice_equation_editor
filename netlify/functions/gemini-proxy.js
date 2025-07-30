// netlify/functions/gemini-proxy.js

exports.handler = async function(event) {
  // We only allow POST requests to this function
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API key is not available.");
    }

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Gemini API Error:", errorBody);
      return { statusCode: response.status, body: `Gemini API error: ${errorBody}` };
    }

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("Proxy Function Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
