export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Jos kutsu menee API-polkuun, ohitetaan middleware ja annetaan API:n hoitaa
  if (url.pathname.startsWith("/api/")) return context.next();

  // Jos domain on srla.fi, tehdään uudelleenohjaus
  if (url.hostname === "srla.fi" || url.hostname === "www.srla.fi") {
    if (url.pathname === "/") return Response.redirect("https://sorola.fi/lyhennin", 301);

    const koodi = url.pathname.substring(1);
    
    try {
      const dbResult = await context.env.LYHENNIN_DB.prepare(
        "SELECT original_url FROM links WHERE short_code = ?" 
      ).bind(koodi).first();

      if (dbResult && dbResult.original_url) {
        return Response.redirect(dbResult.original_url, 301);
      }
    } catch (e) {
      // Jos tietokantavirhe, jatketaan eteenpäin
    }
  }

  return context.next();
}
