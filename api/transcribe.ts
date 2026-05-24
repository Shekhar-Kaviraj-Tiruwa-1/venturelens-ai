export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Deepgram API key not configured. Set DEEPGRAM_API_KEY in environment variables.",
        code: "NO_API_KEY",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return new Response(
        JSON.stringify({ success: false, error: "No audio file provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await audioFile.arrayBuffer();

    const dgResponse = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audioFile.type || "audio/webm",
        },
        body: audioBuffer,
      }
    );

    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      console.error("Deepgram error:", dgResponse.status, errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Transcription failed (${dgResponse.status})`,
        }),
        { status: dgResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const dgData = await dgResponse.json();
    const transcript =
      dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return new Response(
      JSON.stringify({ success: true, text: transcript }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to transcribe audio",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
