export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    // Haetaan tiedoston nimi ?file= muuttujasta
    const fileId = url.searchParams.get('file');
    
    if (!fileId) {
        return new Response('Tiedostoa ei määritetty URL-osoitteessa.', { status: 400 });
    }

    if (!context.env.SHARE_BUCKET) {
        return new Response('R2-bucket sidos puuttuu.', { status: 500 });
    }
    
    const object = await context.env.SHARE_BUCKET.get(fileId);

    if (object === null) {
        return new Response('Tiedostoa ei löytynyt tai se on jo poistettu.', { status: 404 });
    }

    const metadata = object.customMetadata || {};
    
    // 1. TARKISTETAAN AIKARAJA (Aikarajapoisto)
    const expiresAt = parseInt(metadata.expiresAt || '0');
    if (expiresAt && Date.now() > expiresAt) {
        await context.env.SHARE_BUCKET.delete(fileId); // Poistetaan R2:sta tilaa viemästä
        return new Response('Tiedosto on vanhentunut ja poistettu palvelimelta.', { status: 404 });
    }

    // 2. TARKISTETAAN LATAUSRAJOITUS
    const maxDownloads = parseInt(metadata.maxDownloads || '0');
    if (maxDownloads > 0) {
        const currentDownloads = parseInt(metadata.downloads || '0') + 1;

        if (currentDownloads >= maxDownloads) {
            // Tämä on viimeinen sallittu latauskerta -> tuhotaan tiedosto R2:sta samantien taustalla!
            await context.env.SHARE_BUCKET.delete(fileId);
        } else {
            // Päivitetään latausmäärä kopioimalla tiedoston metadata R2:ssa
            await context.env.SHARE_BUCKET.copy(fileId, fileId, {
                customMetadata: {
                    ...metadata,
                    downloads: currentDownloads.toString()
                }
            });
        }
    }

    // Valmistellaan tiedosto lataukseen
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    const originalName = metadata.originalName || fileId;
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);

    return new Response(object.body, { headers });
}
