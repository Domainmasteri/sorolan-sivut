const getCorsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true"
});

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  // 1. Käsittele OPTIONS-pyynnöt (CORS pre-flight)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  
  // Luodaan apufunktio vastauksille
  const respondJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const respond = (body, status = 200) => new Response(body, { status, headers: corsHeaders });

  // TESTI: Jos tämä toimii, API on pystyssä
  if (url.pathname.endsWith("/api/test")) {
    return respondJson({ status: "Pienoismalli API toimii" });
  }

  // Tähän tulee myöhemmin pienoismallien varsinainen logiikka...

  return respond("Not Found", 404);
}
