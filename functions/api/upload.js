export async function onRequestPost(context) {
    try {
        // ==========================================
        // SÄÄDÄ TIEDOSTORAJOTUS TÄSTÄ (Megatavuina)
        // ==========================================
        const MAX_SIZE_MB = 5120; 
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

        const request = context.request;
        const url = new URL(request.url);
        
        // 1. Varmistetaan, että R2-sidos on tehty Cloudfressa
        if (!context.env.SHARE_BUCKET) {
            return new Response(JSON.stringify({ 
                error: 'R2-bucket sidos puuttuu! Varmista että Pages-asetuksissa muuttujan nimi on SHARE_BUCKET.' 
            }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Luetaan lomakedata
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return new Response(JSON.stringify({ error: 'Ei tiedostoa vastaanotettu.' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. KOKOTARKISTUS PALVELIMELLA
        if (file.size > MAX_SIZE_BYTES) {
            return new Response(JSON.stringify({ 
                error: `Tiedosto on liian suuri. Sallittu maksimikoko on ${MAX_SIZE_MB} MB.` 
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Luodaan uniikki ID tiedostolle
        const id = crypto.randomUUID().split('-')[0];
        const extension = file.name.split('.').pop();
        const fileName = `${id}.${extension}`;

        // Tallennetaan R2:een
        await context.env.SHARE_BUCKET.put(fileName, file.stream(), {
            httpMetadata: { contentType: file.type },
            customMetadata: { originalName: file.name }
        });

        const downloadUrl = `${url.origin}/api/download/${fileName}`;

        return new Response(JSON.stringify({ url: downloadUrl, id: fileName }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: `Palvelinvirhe: ${error.message}` }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
