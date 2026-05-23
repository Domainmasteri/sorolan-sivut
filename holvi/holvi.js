const API_URL = "https://sorolasalikset.bannivasara.workers.dev"; 
window.nykyinenAvain = null;
let nykyinenKayttaja = "";
let ladatutTallenteetRaw = [];

// --- ETÄHALLINTA ---
async function lataaDynaamisetAsetukset(laajennusNimi) {
    try {
        const res = await fetch('https://sorola.fi/api/asetukset.json'); 
        const asetukset = await res.json();
        const lajennuksenAsetukset = asetukset[laajennusNimi];

        if (lajennuksenAsetukset) {
            if (lajennuksenAsetukset.otsikko) {
                const otsikkoElementti = document.querySelector('h1');
                if (otsikkoElementti) otsikkoElementti.innerText = lajennuksenAsetukset.otsikko;
            }
            if (lajennuksenAsetukset.tiedote) {
                alert("Tiedote: " + lajennuksenAsetukset.tiedote); 
            }
        }
    } catch (e) {
        console.log("Ei yhteyttä asetuspalvelimeen, käytetään lokaaleja vakioita.");
    }
}

// --- TURVA- JA APUFUNKTIOT ---
async function luoVenyvaAvain(kayttaja, paasalasana) {
    const enc = new TextEncoder();
    const salasanaBuffer = enc.encode(paasalasana);
    const suolaBuffer = enc.encode(kayttaja.toLowerCase() + "sorolasalt2026");

    const pohjaAvain = await crypto.subtle.importKey(
        "raw", salasanaBuffer, { name: "PBKDF2" }, false, ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: suolaBuffer, iterations: 100000, hash: "SHA-256" },
        pohjaAvain, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

async function luoYksinkertainenHash(teksti) {
    const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(teksti));
    return Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function salaaTeksti(teksti, avain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salattu = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, avain, new TextEncoder().encode(teksti));
    const yhdistetty = new Uint8Array(iv.length + salattu.byteLength);
    yhdistetty.set(iv, 0); yhdistetty.set(new Uint8Array(salattu), iv.length);
    return btoa(String.fromCharCode(...yhdistetty));
}

async function puraTeksti(base64Koodi, avain) {
    try {
        const yhdistetty = new Uint8Array(atob(base64Koodi).split('').map(c => c.charCodeAt(0)));
        const iv = yhdistetty.slice(0, 12);
        const salattu = yhdistetty.slice(12);
        const purettu = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, avain, salattu);
        return new TextDecoder().decode(purettu);
    } catch (e) { return "❌ Virhe purussa"; }
}

// --- TOTP LASKENTA ---
function base32ToBuffer(base32) {
    const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    base32 = base32.replace(/=+$/, "").toUpperCase();
    let bits = "";
    for (let i = 0; i < base32.length; i++) {
        let val = base32chars.indexOf(base32.charAt(i));
        if(val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    let bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }
    return bytes;
}

async function luoTOTP(secret) {
    if(!secret) return "";
    try {
        const keyBytes = base32ToBuffer(secret);
        const timeStr = Math.floor(Math.floor(Date.now() / 1000) / 30).toString(16).padStart(16, '0');
        const timeBytes = new Uint8Array(8);
        for (let i = 0; i < 8; i++) timeBytes[i] = parseInt(timeStr.substr(i * 2, 2), 16);
        const key = await crypto.subtle.importKey("raw", keyBytes, {name: "HMAC", hash: "SHA-1"}, false, ["sign"]);
        const signature = await crypto.subtle.sign("HMAC", key, timeBytes);
        const hash = new Uint8Array(signature);
        const offset = hash[hash.length - 1] & 0xf;
        const binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
        return (binary % 1000000).toString().padStart(6, '0');
    } catch(e) { return "VIRHE"; }
}

// --- API TOIMINNOT ---
window.vaihdaTietueTyyppia = function() {
    const tyyppi = document.getElementById('tietue-tyyppi').value;
    if(tyyppi === 'kortti') {
        document.getElementById('lomake-login').classList.add('piilotettu');
        document.getElementById('lomake-kortti').classList.remove('piilotettu');
    } else {
        document.getElementById('lomake-login').classList.remove('piilotettu');
        document.getElementById('lomake-kortti').classList.add('piilotettu');
    }
}

// HAKU- JA PIIRTOLOGIIKKA
async function lataaTiedot() {
    const listaDiv = document.getElementById('salasana-lista');
    if (!listaDiv) return;
    listaDiv.innerHTML = "Haetaan ja puretaan tietoja...";
    try {
        const res = await fetch(`${API_URL}/hae`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ omistaja: nykyinenKayttaja })
        });
        const data = await res.json();
        ladatutTallenteetRaw = []; 

        for (const rivi of data) {
            const purettu = await puraTeksti(rivi.salattu_salasana, window.nykyinenAvain);
            if (purettu === "❌ Virhe purussa") continue;

            let dataObj;
            try {
                dataObj = JSON.parse(purettu);
            } catch(e) {
                dataObj = { tyyppi: 'login', salasana: purettu, totp: '' };
            }

            ladatutTallenteetRaw.push({ id: rivi.id, palvelu: rivi.palvelu, kayttaja: rivi.kayttaja, data: dataObj });
        }
        
        piirraLista();
    } catch (e) { listaDiv.innerHTML = "Virhe ladattaessa tietoja."; }
}

window.piirraLista = function() {
    const listaDiv = document.getElementById('salasana-lista');
    const hakusana = document.getElementById('haku-kentta')?.value.toLowerCase() || "";
    listaDiv.innerHTML = "";
    
    let loytyi = false;

    for (const kohde of ladatutTallenteetRaw) {
        if (hakusana && 
            !kohde.palvelu.toLowerCase().includes(hakusana) && 
            !kohde.kayttaja.toLowerCase().includes(hakusana)) {
            continue; 
        }

        loytyi = true;
        const div = document.createElement('div');
        div.className = 'salasana-rivi';
        
        let sisaltoHtml = "";
        let kopioitavaData = "";

        if (kohde.data.tyyppi === 'kortti') {
            sisaltoHtml = `
                <strong>${kohde.palvelu} 💳</strong>
                <span>${kohde.data.nimi}</span>
                <code style="color:#ffaa00; display:block;">${kohde.data.numero} (${kohde.data.vanhenee}) CVV: ${kohde.data.cvv}</code>
            `;
            kopioitavaData = kohde.data.numero;
        } else {
            sisaltoHtml = `
                <strong>${kohde.palvelu}</strong>
                <span>${kohde.kayttaja}</span>
                <code style="color:#ffaa00; display:block;">${kohde.data.salasana}</code>
                ${kohde.data.totp ? `<span class="totp-badge" data-secret="${kohde.data.totp}" style="color:#00ffcc; font-weight:bold;">2FA: ⏳</span>` : ''}
            `;
            kopioitavaData = kohde.data.salasana;
        }

        div.innerHTML = `
            <div class="rivi-info">${sisaltoHtml}</div>
            <div class="rivi-napit">
                <button class="nappula nappi-pieni tayta-btn" data-salasana="${kopioitavaData}">Kopioi</button>
                <button class="nappula nappi-pieni nappi-sininen" onclick="muokkaaTietoa(${kohde.id})">Muokkaa</button>
                <button class="nappula nappi-pieni nappi-poista" onclick="poistaTieto(${kohde.id})">Poista</button>
            </div>`;
        listaDiv.appendChild(div);
    }
    
    if(!loytyi) {
        listaDiv.innerHTML = hakusana ? "<p>Hakutuloksia ei löytynyt.</p>" : "<p>Holvissa ei ole vielä tallenteita.</p>";
    }
}

window.muokkaaTietoa = function(id) {
    const kohde = ladatutTallenteetRaw.find(t => t.id === id);
    if (!kohde) return;

    document.getElementById('muokkaus-id').value = kohde.id;
    document.getElementById('palvelu-nimi').value = kohde.palvelu;

    if (kohde.data && kohde.data.tyyppi === 'kortti') {
        document.getElementById('tietue-tyyppi').value = 'kortti';
        vaihdaTietueTyyppia();
        document.getElementById('kortinhaltija').value = kohde.data.nimi || '';
        document.getElementById('korttinumero').value = kohde.data.numero || '';
        document.getElementById('kortti-vanhenee').value = kohde.data.vanhenee || '';
        document.getElementById('kortti-cvv').value = kohde.data.cvv || '';
    } else {
        document.getElementById('tietue-tyyppi').value = 'login';
        vaihdaTietueTyyppia();
        document.getElementById('kayttajatunnus').value = kohde.kayttaja || '';
        document.getElementById('uusi-salasana').value = kohde.data ? kohde.data.salasana : kohde.salasana;
        document.getElementById('totp-secret').value = kohde.data ? (kohde.data.totp || '') : '';
    }

    document.getElementById('peruuta-muokkaus-btn').classList.remove('piilotettu');
    document.getElementById('tallenna-btn').innerText = "Päivitä tiedot";
    document.getElementById('lomake-otsikko').innerText = "Muokkaa kohdetta";
    document.querySelector('.lomake-laatikko').scrollIntoView({ behavior: 'smooth' });
}

async function tallennaTieto() {
    const muokkausIdVal = document.getElementById('muokkaus-id').value;
    const id = muokkausIdVal ? parseInt(muokkausIdVal) : null;
    const palvelu = document.getElementById('palvelu-nimi').value;
    const tyyppi = document.getElementById('tietue-tyyppi').value;
    let payload = {};
    let naytettavaKayttaja = "";

    if (!palvelu) return alert("Palvelun nimi vaaditaan!");

    if (tyyppi === 'login') {
        const kayttajatunnus = document.getElementById('kayttajatunnus').value;
        const salasana = document.getElementById('uusi-salasana').value;
        const totp = document.getElementById('totp-secret').value;
        if (!salasana) return alert("Salasana vaaditaan!");
        payload = { tyyppi: 'login', salasana, totp };
        naytettavaKayttaja = kayttajatunnus;
    } else {
        const nimi = document.getElementById('kortinhaltija').value;
        const numero = document.getElementById('korttinumero').value;
        const vanhenee = document.getElementById('kortti-vanhenee').value;
        const cvv = document.getElementById('kortti-cvv').value;
        if (!numero) return alert("Kortin numero vaaditaan!");
        payload = { tyyppi: 'kortti', nimi, numero, vanhenee, cvv };
        naytettavaKayttaja = "Maksukortti";
    }

    const salattu_salasana = await salaaTeksti(JSON.stringify(payload), window.nykyinenAvain);

    try {
        const res = await fetch(`${API_URL}/tallenna`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id, palvelu, kayttaja: naytettavaKayttaja, salattu_salasana, omistaja: nykyinenKayttaja })
        });
        if (res.ok) {
            nollaaLomake();
            lataaTiedot();
        }
    } catch (e) { alert("Tallennusvirhe."); }
}

function nollaaLomake() {
    document.querySelectorAll('.lomake-laatikko input').forEach(i => i.value = "");
    document.getElementById('muokkaus-id').value = "";
    document.getElementById('peruuta-muokkaus-btn').classList.add('piilotettu');
    document.getElementById('tallenna-btn').innerText = "Tallenna tiedot";
    document.getElementById('lomake-otsikko').innerText = "Lisää uusi kohde";
}

async function poistaTieto(id) {
    if (!confirm("Haluatko varmasti poistaa tämän?")) return;
    await fetch(`${API_URL}/poista`, {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, omistaja: nykyinenKayttaja })
    });
    lataaTiedot();
}

function lukitseHolviKoodista() {
    window.nykyinenAvain = null;
    sessionStorage.clear(); 
    document.getElementById('kirjautumis-nakyma')?.classList.remove('piilotettu');
    document.getElementById('holvi-nakyma')?.classList.add('piilotettu');
    document.getElementById('paasalasana').value = '';
}

async function vaihdaPaasalasana() {
    const uusiSalasana = document.getElementById('uusi-paasalasana')?.value;
    if (!uusiSalasana || uusiSalasana.length < 8) return alert("Uuden salasanan pitää olla vähintään 8 merkkiä!");
    if (!confirm("Tämä kryptaa kaikki salasanasi uudelleen. Jatketaanko?")) return;

    try {
        const uusiAvain = await luoVenyvaAvain(nykyinenKayttaja, uusiSalasana);
        const uusiHash = await luoYksinkertainenHash(nykyinenKayttaja.toLowerCase() + uusiSalasana);

        for (const kohde of ladatutTallenteetRaw) {
            const salattavaTeksti = kohde.data ? JSON.stringify(kohde.data) : kohde.salasana;
            const uusiSalattu = await salaaTeksti(salattavaTeksti, uusiAvain);
            await fetch(`${API_URL}/tallenna`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: kohde.id, palvelu: kohde.palvelu, kayttaja: kohde.kayttaja, salattu_salasana: uusiSalattu, omistaja: nykyinenKayttaja })
            });
        }

        await fetch(`${API_URL}/rekisteroi`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tunnus: nykyinenKayttaja, salasana_hash: uusiHash, kutsukoodi: "PAIVITYS_SALASANALLE" })
        });

        poistaBiometriaPaikallisesti();
        sessionStorage.clear();
        alert("Pääsalasana vaihdettu! Holvi lukitaan.");
        location.reload();
    } catch (e) { alert("Virhe salasanan vaihdossa."); }
}

async function tuhoaKokoTili() {
    if (!confirm("🚨 HUOMIO: Tämä poistaa tilisi ja KAIKKI salasanasi pysyvästi. Jatketaanko?")) return;
    if (prompt("Kirjoita käyttäjätunnuksesi vahvistaaksesi poiston:") !== nykyinenKayttaja) return alert("Vahvistus epäonnistui.");

    await fetch(`${API_URL}/poista-tili`, {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ tunnus: nykyinenKayttaja })
    });
    poistaBiometriaPaikallisesti();
    sessionStorage.clear();
    alert("Tili tuhottu onnistuneesti.");
    location.reload();
}

// --- VIENTI JA TUONTI ---
function vieJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ladatutTallenteetRaw, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sorola_holvi_${nykyinenKayttaja}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function vieCSV() {
    let csvContent = "data:text/csv;charset=utf-8,Palvelu,Tyyppi,Kayttaja_tai_Nimi,Salasana_tai_Numero,TOTP_Secret,Vanhenee,CVV\n";
    
    ladatutTallenteetRaw.forEach(t => {
        let tyyppi = "";
        let kayttajaTaiNimi = "";
        let salasanaTaiNumero = "";
        let totp = "";
        let vanhenee = "";
        let cvv = "";

        if (t.data && t.data.tyyppi === 'kortti') {
            tyyppi = "Maksukortti";
            kayttajaTaiNimi = t.data.nimi || "";
            salasanaTaiNumero = t.data.numero || "";
            vanhenee = t.data.vanhenee || "";
            cvv = t.data.cvv || "";
        } else if (t.data && t.data.tyyppi === 'login') {
            tyyppi = "Kirjautuminen";
            kayttajaTaiNimi = t.kayttaja || "";
            salasanaTaiNumero = t.data.salasana || "";
            totp = t.data.totp || "";
        } else {
            tyyppi = "Kirjautuminen";
            kayttajaTaiNimi = t.kayttaja || "";
            salasanaTaiNumero = t.salasana || "";
        }

        const clean = (str) => String(str).replace(/"/g, '""');
        csvContent += `"${clean(t.palvelu)}","${tyyppi}","${clean(kayttajaTaiNimi)}","${clean(salasanaTaiNumero)}","${clean(totp)}","${clean(vanhenee)}","${clean(cvv)}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", `sorola_holvi_${nykyinenKayttaja}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function kasitteleTuontiTiedosto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const sisalto = e.target.result;
            let tuotavatRivit = [];

            if (file.name.endsWith('.json')) {
                tuotavatRivit = JSON.parse(sisalto);
            } else if (file.name.endsWith('.csv')) {
                const rivit = sisalto.split('\n');
                for (let i = 1; i < rivit.length; i++) {
                    if (!rivit[i].trim()) continue;
                    const solut = rivit[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
                    if (solut.length >= 2) {
                        const tyyppi = solut[1] || "login";
                        if (tyyppi === "Maksukortti") {
                            tuotavatRivit.push({ palvelu: solut[0], kayttaja: "Maksukortti", data: { tyyppi: 'kortti', nimi: solut[2], numero: solut[3], vanhenee: solut[5], cvv: solut[6] } });
                        } else {
                            tuotavatRivit.push({ palvelu: solut[0], kayttaja: solut[2], data: { tyyppi: 'login', salasana: solut[3], totp: solut[4] } });
                        }
                    }
                }
            }

            if (tuotavatRivit.length === 0) return alert("Ei tuotavia tietoja.");

            for (const t of tuotavatRivit) {
                const salattuMössö = await salaaTeksti(JSON.stringify(t.data), window.nykyinenAvain);
                await fetch(`${API_URL}/tallenna`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: null, palvelu: t.palvelu, kayttaja: t.kayttaja, salattu_salasana: salattuMössö, omistaja: nykyinenKayttaja })
                });
            }
            alert("Tiedot tuotu onnistuneesti!");
            lataaTiedot();
        } catch(err) { alert("Virhe tiedoston käsittelyssä."); }
    };
    reader.readAsText(file);
}

// --- BIOMETRISET TOIMINNOT ---
function poistaBiometriaPaikallisesti() {
    localStorage.removeItem("biometria_tunnus");
    localStorage.removeItem("biometria_salake");
    localStorage.removeItem("biometria_raaka");
}

async function otaSormenjalkiKayttoon() {
    const salasana = prompt("Vahvista nykyinen pääsalasanasi kytkeäksesi sormenjäljen:");
    if (!salasana) return;
    try {
        if (!window.PublicKeyCredential) return alert("Selaimesi ei tue sormenjälkitunnistusta.");
        const avainMateriaali = crypto.getRandomValues(new Uint8Array(16));
        const sormenjalkiSuola = await crypto.subtle.importKey("raw", avainMateriaali, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
        const salattuSalasana = await salaaTeksti(salasana, sormenjalkiSuola);

        localStorage.setItem("biometria_tunnus", nykyinenKayttaja);
        localStorage.setItem("biometria_salake", salattuSalasana);
        localStorage.setItem("biometria_raaka", btoa(String.fromCharCode(...avainMateriaali)));

        alert("Sormenjälki aktivoitu onnistuneesti!");
        paivitaBiometriaNapit();
    } catch (e) { alert("Aktivointi epäonnistui."); }
}

async function kirjauduSormenjalylla() {
    const tallennettuTunnus = localStorage.getItem("biometria_tunnus");
    const salattuSalake = localStorage.getItem("biometria_salake");
    const raakaAvainStr = localStorage.getItem("biometria_raaka");
    if (!tallennettuTunnus || !salattuSalake || !raakaAvainStr) return;

    try {
        if (window.PublicKeyCredential) {
            const haaste = crypto.getRandomValues(new Uint8Array(32));
            await navigator.credentials.create({
                publicKey: {
                    challenge: haaste, rp: { name: "Sorolan Holvi" },
                    user: { id: haaste, name: tallennettuTunnus, displayName: tallennettuTunnus },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                    authenticatorSelection: { userVerification: "required" },
                    timeout: 60000
                }
            });
        }
        const raakaAvain = new Uint8Array(atob(raakaAvainStr).split('').map(c => c.charCodeAt(0)));
        const sormenjalkiAvain = await crypto.subtle.importKey("raw", raakaAvain, { name: "AES-GCM" }, false, ["decrypt"]);
        const purettuPaasalasana = await puraTeksti(salattuSalake, sormenjalkiAvain);

        if (purettuPaasalasana === "❌ Virhe purussa") return alert("Tunnistus epäonnistui.");
        document.getElementById('kayttaja-tunnus').value = tallennettuTunnus;
        document.getElementById('paasalasana').value = purettuPaasalasana;
        document.getElementById('avaa-btn')?.click();
    } catch (e) { console.log("Biometrinen tunnistus peruttu."); }
}

function paivitaBiometriaNapit() {
    const sormiLoginBtn = document.getElementById('sormi-login-btn');
    if (localStorage.getItem("biometria_tunnus")) {
        sormiLoginBtn?.classList.remove('piilotettu');
    } else {
        sormiLoginBtn?.classList.add('piilotettu');
    }
}

// --- TAPAHTUMAKUUNTELIJAT ---
setInterval(async () => {
    const badges = document.querySelectorAll('.totp-badge');
    for(let badge of badges) {
        const sec = badge.getAttribute('data-secret');
        const koodi = await luoTOTP(sec);
        const aikaRaja = 30 - (Math.floor(Date.now() / 1000) % 30);
        badge.innerText = `2FA: ${koodi} (${aikaRaja}s)`;
    }
}, 1000);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Kutsutaan dynaamisia asetuksia heti laajennuksen auetessa
    lataaDynaamisetAsetukset('holvi');

    paivitaBiometriaNapit();

    // 2. Hakukentän reaaliaikainen kuuntelu
    document.getElementById('haku-kentta')?.addEventListener('input', piirraLista);

    document.getElementById('rekisteroi-btn')?.addEventListener('click', async () => {
        const tunnus = document.getElementById('kayttaja-tunnus').value;
        const salasana = document.getElementById('paasalasana').value;
        const kutsukoodi = document.getElementById('kutsukoodi-kentta').value;
        if (!kutsukoodi) return alert("Tilin luominen vaatii kutsukoodin!");
        const hash = await luoYksinkertainenHash(tunnus.toLowerCase() + salasana);
        const res = await fetch(`${API_URL}/rekisteroi`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tunnus, salasana_hash: hash, kutsukoodi })
        });
        const d = await res.json();
        alert(d.success ? "Tili luotu onnistuneesti!" : "Virhe: " + d.error);
    });

    document.getElementById('avaa-btn')?.addEventListener('click', async () => {
        const tunnus = document.getElementById('kayttaja-tunnus').value;
        const salasana = document.getElementById('paasalasana').value;
        if (!tunnus || !salasana) return alert("Syötä molemmat kentät!");
        const hash = await luoYksinkertainenHash(tunnus.toLowerCase() + salasana);
        const res = await fetch(`${API_URL}/kirjaudu`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tunnus, salasana_hash: hash })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            nykyinenKayttaja = tunnus;
            window.nykyinenAvain = await luoVenyvaAvain(tunnus, salasana);
            
            sessionStorage.setItem("holvi_tunnus", tunnus);
            sessionStorage.setItem("holvi_pass", salasana);

            document.getElementById('kirjautumis-nakyma').classList.add('piilotettu');
            document.getElementById('holvi-nakyma').classList.remove('piilotettu');
            lataaTiedot();
        } else { alert("Kirjautuminen epäonnistui."); }
    });

    document.getElementById('sormi-login-btn')?.addEventListener('click', kirjauduSormenjalylla);
    document.getElementById('aktivoi-sormi-btn')?.addEventListener('click', otaSormenjalkiKayttoon);
    document.getElementById('tallenna-btn')?.addEventListener('click', tallennaTieto);
    document.getElementById('peruuta-muokkaus-btn')?.addEventListener('click', nollaaLomake);
    document.getElementById('vaihda-paasalasana-btn')?.addEventListener('click', vaihdaPaasalasana);
    document.getElementById('tuhoa-tili-btn')?.addEventListener('click', tuhoaKokoTili);
    document.getElementById('vienti-json-btn')?.addEventListener('click', vieJSON);
    document.getElementById('vienti-csv-btn')?.addEventListener('click', vieCSV);
    document.getElementById('tuonti-tiedosto')?.addEventListener('change', kasitteleTuontiTiedosto);
    document.getElementById('lukitse-btn')?.addEventListener('click', lukitseHolviKoodista);

    // AUTOMAATTIKIRJAUTUMINEN SIVUN PÄIVITYKSEN JÄLKEEN
    const istuntoTunnus = sessionStorage.getItem("holvi_tunnus");
    const istuntoPass = sessionStorage.getItem("holvi_pass");
    if (istuntoTunnus && istuntoPass) {
        document.getElementById('kayttaja-tunnus').value = istuntoTunnus;
        document.getElementById('paasalasana').value = istuntoPass;
        document.getElementById('avaa-btn').click();
    }
});