document.addEventListener('DOMContentLoaded', () => {
    // DOM Elementit
    const userIn = document.getElementById('admin-user');
    const passIn = document.getElementById('admin-pass');
    const inviteIn = document.getElementById('admin-invite-code');
    const loginBtn = document.getElementById('login-btn');
    const showRegBtn = document.getElementById('show-register-btn');
    const registerBtn = document.getElementById('register-btn');
    const setupBtn = document.getElementById('setup-btn');
    const authSection = document.getElementById('auth-section');
    const adminSisalto = document.getElementById('admin-sisalto');
    const makenLohko = document.getElementById('maken-hallinta-lohko');
    const logoutBtn = document.getElementById('logout-btn');

    // KORJATTU: Käytetään suhteellisia polkuja Cloudflare Pages -funktioihin!
    const SRLA_API = '/api/admin';
    const HOLVI_API = '/api/holvi/admin';

    let currentUser = "";
    let currentHash = "";

    // --- AUTOMAATTINEN LUKITUS JA ISTUNTO ---
    const LUKITUS_AIKA = 5 * 60 * 1000;
    let lukitusAjastin;

    function kirjauduUlos(naytaIlmoitus = false) {
        currentUser = "";
        currentHash = "";
        sessionStorage.clear();
        authSection.style.display = 'block';
        adminSisalto.style.display = 'none';
        passIn.value = '';
        if (naytaIlmoitus) alert("Istunto lukittiin automaattisesti turvallisuuden vuoksi.");
    }

    function nollaaAjastin() {
        clearTimeout(lukitusAjastin);
        if (currentUser && currentHash) {
            lukitusAjastin = setTimeout(() => kirjauduUlos(true), LUKITUS_AIKA);
        }
    }

    document.addEventListener('mousemove', nollaaAjastin);
    document.addEventListener('keydown', nollaaAjastin);
    document.addEventListener('click', nollaaAjastin);

    if (logoutBtn) logoutBtn.addEventListener('click', () => kirjauduUlos(false));

    // --- PBKDF2 HASH ---
    async function luoAdminHash(kayttaja, salasana) {
        const enc = new TextEncoder();
        const salasanaBuffer = enc.encode(salasana);
        const suolaBuffer = enc.encode(kayttaja.toLowerCase() + "admin_master_salt");

        const pohjaAvain = await crypto.subtle.importKey("raw", salasanaBuffer, { name: "PBKDF2" }, false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: suolaBuffer, iterations: 100000, hash: "SHA-256" }, pohjaAvain, 256);
        return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- ALUSTUS & NÄKYMÄT ---
    fetch(`${SRLA_API}/check-setup`).then(r=>r.json()).then(data => {
        if(data.needsSetup) {
            setupBtn.style.display = 'block';
            loginBtn.style.display = 'none';
            showRegBtn.style.display = 'none';
            userIn.value = 'Make';
        }
    }).catch(e => console.log("Check-setup virhe:", e));

    showRegBtn.addEventListener('click', () => {
        inviteIn.style.display = 'block';
        registerBtn.style.display = 'block';
        loginBtn.style.display = 'none';
        showRegBtn.style.display = 'none';
    });

    async function kasitteleAuth(tyyppi) {
        const user = userIn.value.trim();
        const pass = passIn.value.trim();
        const invite = inviteIn.value.trim();

        if (!user || !pass) return alert("Syötä tunnus ja salasana!");
        if (tyyppi === 'register' && !invite) return alert("Kutsukoodi vaaditaan!");

        const hash = await luoAdminHash(user, pass);

        try {
            let res;
            if (tyyppi === 'setup') {
                res = await fetch(`${SRLA_API}/setup`, { method: 'POST', body: JSON.stringify({username: user, hash}) });
            } else if (tyyppi === 'register') {
                res = await fetch(`${SRLA_API}/register`, { method: 'POST', body: JSON.stringify({username: user, hash, inviteCode: invite}) });
            } else {
                res = await fetch(`${SRLA_API}/login`, { method: 'POST', body: JSON.stringify({username: user, hash}) });
            }
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Tunnistautuminen epäonnistui!");
            }

            currentUser = user;
            currentHash = hash;
            sessionStorage.setItem("admin_user", currentUser);
            sessionStorage.setItem("admin_hash", currentHash);

            authSection.style.display = 'none';
            lataaKaikkiTiedot();
            nollaaAjastin();

        } catch (err) { alert(err.message); }
    }

    loginBtn.addEventListener('click', () => kasitteleAuth('login'));
    registerBtn.addEventListener('click', () => kasitteleAuth('register'));
    setupBtn.addEventListener('click', () => kasitteleAuth('setup'));

    // --- TIETOJEN LATAUS ---
    async function lataaKaikkiTiedot() {
        try {
            const authParams = `?admin_user=${encodeURIComponent(currentUser)}&admin_hash=${encodeURIComponent(currentHash)}`;
            
            const resSrla = await fetch(`${SRLA_API}/list${authParams}`);
            if (!resSrla.ok) {
                kirjauduUlos(false);
                return alert("Tunnistautuminen vanhentunut tai väärä!");
            }
            const dataSrla = await resSrla.json();

            if (currentUser.toLowerCase() === 'make') makenLohko.style.display = 'block';
            else makenLohko.style.display = 'none';

            let holviInvites = [];
            try {
                // KORJATTU: Lähetetään myös admin_user Holville!
                const resHolvi = await fetch(`${HOLVI_API}/invites${authParams}`);
                if (resHolvi.ok) {
                    const dataHolvi = await resHolvi.json();
                    holviInvites = dataHolvi.invites || [];
                }
            } catch(e) { console.error("Yhteysvirhe Holvi APIIN:", e); }

            adminSisalto.style.display = 'block';
            paivitaTaulukot(dataSrla.links || [], dataSrla.secrets || [], dataSrla.adminInvites || [], holviInvites, dataSrla.admins || []);
        } catch (err) { alert(err.message); }
    }

    // --- TAULUKOIDEN RENDEROINTI ---
    function paivitaTaulukot(links, secrets, adminInvites, holviInvites, adminsList) {
        const adminsBody = document.getElementById('admins-table-body');
        adminsBody.innerHTML = '';
        adminsList.forEach(a => {
            const tr = document.createElement('tr');
            const nimi = a.username || a;
            const onkoMake = nimi.toLowerCase() === 'make';
            tr.innerHTML = `<td><strong>${nimi}</strong> ${onkoMake ? '<span style="color:#ffaa00;">(Pääkäyttäjä)</span>' : ''}</td>
                <td><button class="nappula nappi-pieni nappi-puna" ${onkoMake ? 'disabled style="opacity:0.3;"' : ''}>Poista</button></td>`;
            if (!onkoMake) tr.querySelector('button').onclick = () => poistaTieto(`${SRLA_API}/delete-admin`, nimi, `ylläpitäjä ${nimi}`);
            adminsBody.appendChild(tr);
        });

        const linksBody = document.getElementById('links-table-body');
        linksBody.innerHTML = '';
        links.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>/${l.short_code}</strong></td><td style="word-break:break-all;">${l.original_url}</td><td>${l.clicks || 0}</td>
                <td><button class="nappula nappi-pieni nappi-oranssi">Muokkaa</button> <button class="nappula nappi-pieni nappi-puna">Poista</button></td>`;
            tr.querySelector('.nappi-oranssi').onclick = () => {
                document.getElementById('edit-old-code').value = l.short_code;
                document.getElementById('link-code').value = l.short_code;
                document.getElementById('link-url').value = l.original_url;
                document.getElementById('peru-linkki-edit-btn').style.display = 'inline-block';
            };
            tr.querySelector('.nappi-puna').onclick = () => poistaTieto(`${SRLA_API}/links/delete`, l.short_code, `linkki /${l.short_code}`);
            linksBody.appendChild(tr);
        });

        const secretsBody = document.getElementById('secrets-table-body');
        secretsBody.innerHTML = '';
        secrets.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><code>${s.secret_code}</code></td><td>${s.remaining_uses}</td><td>
                <button class="nappula nappi-pieni" style="background:#0069d9;color:white;" onclick="document.getElementById('secret-code-input').value='${s.secret_code}';document.getElementById('secret-uses-input').value='${s.remaining_uses}';">Muokkaa</button>
                <button class="nappula nappi-pieni nappi-puna">Poista</button></td>`;
            tr.querySelector('.nappi-puna').onclick = () => poistaTieto(`${SRLA_API}/secrets/delete`, s.secret_code, `salasana ${s.secret_code}`);
            secretsBody.appendChild(tr);
        });

        const adminBody = document.getElementById('admin-invites-table-body');
        adminBody.innerHTML = '';
        adminInvites.forEach(a => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><code>${a.code}</code></td><td>${a.created_by}</td><td><button class="nappula nappi-pieni nappi-puna">Poista</button></td>`;
            tr.querySelector('button').onclick = () => poistaTieto(`${SRLA_API}/admin_invites/delete`, a.code, `admin-koodi ${a.code}`);
            adminBody.appendChild(tr);
        });

        const holviBody = document.getElementById('holvi-table-body');
        holviBody.innerHTML = '';
        holviInvites.forEach(item => {
            const code = typeof item === 'object' ? (item.koodi || item.code) : item;
            const onkoKaytetty = typeof item === 'object' && parseInt(item.kaytetty) === 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><code>${code}</code></td>
                <td>${onkoKaytetty ? '<span style="color: #ff4d4d; font-weight: bold;">Käytetty</span>' : '<span style="color: #2ed573; font-weight: bold;">Vapaa</span>'}</td>
                <td><button class="nappula nappi-pieni nappi-puna">Poista</button></td>`;
            tr.querySelector('button').onclick = async () => {
                if (!confirm(`Poistetaanko Holvin kutsukoodi ${code}?`)) return;
                await fetch(`${HOLVI_API}/invites/delete?admin_user=${encodeURIComponent(currentUser)}&admin_hash=${encodeURIComponent(currentHash)}&code=${code}`, { method: 'POST' });
                lataaKaikkiTiedot();
            };
            holviBody.appendChild(tr);
        });
    }

    document.getElementById('lisaa-linkki-btn').onclick = async () => {
        const oldCode = document.getElementById('edit-old-code').value;
        const newCode = document.getElementById('link-code').value.trim();
        const url = document.getElementById('link-url').value.trim();
        if(!newCode || !url) return alert("Täytä molemmat kentät!");

        const res = await fetch(`${SRLA_API}/links/save?admin_user=${encodeURIComponent(currentUser)}&admin_hash=${encodeURIComponent(currentHash)}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ oldCode, code: newCode, url })
        });
        if (res.ok) {
            document.getElementById('edit-old-code').value = '';
            document.getElementById('link-code').value = '';
            document.getElementById('link-url').value = '';
            document.getElementById('peru-linkki-edit-btn').style.display = 'none';
            lataaKaikkiTiedot();
        } else {
            const errData = await res.json();
            alert("Virhe: " + (errData.error || "Koodi on varattu"));
        }
    };

    document.getElementById('peru-linkki-edit-btn').onclick = () => {
        document.getElementById('edit-old-code').value = '';
        document.getElementById('link-code').value = '';
        document.getElementById('link-url').value = '';
        document.getElementById('peru-linkki-edit-btn').style.display = 'none';
    };

    async function tallennaTieto(url, body) {
        await fetch(`${url}?admin_user=${encodeURIComponent(currentUser)}&admin_hash=${encodeURIComponent(currentHash)}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
        });
        lataaKaikkiTiedot();
    }

    async function poistaTieto(url, code, msg) {
        if (!confirm(`Poistetaanko varmasti ${msg}?`)) return;
        await fetch(`${url}?admin_user=${encodeURIComponent(currentUser)}&admin_hash=${encodeURIComponent(currentHash)}&code=${code}`, { method: 'POST' });
        lataaKaikkiTiedot();
    }

    document.getElementById('tallenna-secret-btn').onclick = () => tallennaTieto(`${SRLA_API}/secrets/save`, { secret: document.getElementById('secret-code-input').value, uses: parseInt(document.getElementById('secret-uses-input').value) });
    document.getElementById('lisaa-admin-koodi-btn').onclick = () => tallennaTieto(`${SRLA_API}/admin_invites/add`, { code: document.getElementById('admin-koodi-input').value });
    
    document.getElementById('lisaa-holvi-koodi-btn').onclick = async () => {
        const code = document.getElementById('holvi-koodi-input').value.trim();
        if(!code) return alert("Syötä koodi!");
        await tallennaTieto(`${HOLVI_API}/invites/add`, { code });
        document.getElementById('holvi-koodi-input').value = '';
    };

    if (sessionStorage.getItem("admin_user") && sessionStorage.getItem("admin_hash")) {
        currentUser = sessionStorage.getItem("admin_user");
        currentHash = sessionStorage.getItem("admin_hash");
        authSection.style.display = 'none';
        lataaKaikkiTiedot();
        nollaaAjastin();
    }
});
