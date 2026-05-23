export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Asetetaan CORS-otsakkeet, jotta selainlaajennus saa yhteyden
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 2. Testireitti
  if (url.pathname.endsWith("/api/test")) {
    return new Response(JSON.stringify({ status: "Lyhennin API toimii" }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  // 3. Linkin luonti -reitti (tämä, jota popup.js kutsuu)
  if (url.pathname.endsWith("/create")) {
    const kohdeUrl = url.searchParams.get("url");
    const koodi = url.searchParams.get("code") || Math.random().toString(36).substr(2, 6);
    const salasana = url.searchParams.get("secret");

    if (!kohdeUrl) {
      return new Response(JSON.stringify({ error: "URL puuttuu" }), { 
        status: 400, headers: corsHeaders 
      });
    }

    try {
      // Tallennetaan linkki "links"-tauluun
      await env.LYHENNIN_DB.prepare(
        "INSERT INTO links (short_code, original_url) VALUES (?, ?)"
      ).bind(koodi, kohdeUrl).run();

      return new Response(JSON.stringify({ 
        success: true, 
        shortUrl: `https://srla.fi/${koodi}` 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Tallennus epäonnistui: " + e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}
