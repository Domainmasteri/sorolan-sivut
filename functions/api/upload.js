// Tiedoston nimi on muotoa [id].js, jotta Cloudflare osaa napata URL:n loppuosan muuttujaksi
export async function onRequestGet(context) {
    // Haetaan URL:ssa annettu ID (esim. a7b8c9d0.jpg)
    const fileId = context.params.id;
    
    // Yritetään hakea tiedosto R2-bucketista
    const object = await context.env.SHARE_BUCKET.get(fileId);

    if (object === null) {
        return new Response('Tiedostoa ei löytynyt tai se on vanhentunut.', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    // Pakotetaan selain lataamaan tiedosto alkuperäisellä nimellä,
    // sen sijaan että selain yrittäisi avata sen (esim. kuvat)
    const originalName = object.customMetadata?.originalName || fileId;
    headers.set('Content-Disposition', `attachment; filename="${originalName}"`);

    // Palautetaan tiedosto käyttäjälle
    return new Response(object.body, {
        headers,
    });
}