// HUOM! Vaihda tähän uuden Workerisi osoite (sama kuin yllä)
const API_BASE = 'https://pienoismallit.bannivasara.workers.dev';

// 1. KIRJAUTUMINEN
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
        })
    });

    if (response.ok) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'inline-block';
        loadSettings();
    } else {
        alert('Väärä tunnus tai salasana.');
    }
});

// 2. ULOSKIRJAUTUMINEN
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch(`${API_BASE}/api/logout`, {
        method: 'GET',
        credentials: 'include'
    });
    location.reload();
});

// 3. REKISTERÖITYMINEN
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        username: document.getElementById('regUsername').value,
        password: document.getElementById('regPassword').value,
        inviteCode: document.getElementById('regInviteCode').value
    };

    const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });

    if (res.ok) {
        const responseData = await res.json();
        alert(`Rekisteröinti onnistui!\n\nTÄRKEÄÄ! Tilisi palautuskoodi on:\n${responseData.recovery_code}\n\nOta tämä talteen. Voit nyt kirjautua sisään.`);
        toggleSection('loginSection', 'registerSection');
        e.target.reset();
    } else {
        const errorMsg = await res.text();
        alert(`Virhe: ${errorMsg}`);
    }
});

// 4. SALASANAN PALAUTUS
document.getElementById('recoveryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        username: document.getElementById('recUsername').value,
        recoveryCode: document.getElementById('recCode').value,
        newPassword: document.getElementById('recNewPassword').value
    };

    const res = await fetch(`${API_BASE}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });

    if (res.ok) {
        const responseData = await res.json();
        alert(`Salasana vaihdettu!\n\nUUSI palautuskoodisi on:\n${responseData.new_recovery_code}\n\nVanha koodi ei enää toimi.`);
        toggleSection('loginSection', 'recoverySection');
        e.target.reset();
    } else {
        alert('Virheellinen tunnus tai palautuskoodi.');
    }
});

// 5. JULKAISUN LISÄYS
document.getElementById('postForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        title: document.getElementById('title').value,
        content: document.getElementById('content').value,
        image_url: document.getElementById('image_url').value,
        is_private: document.getElementById('is_private').checked
    };
    
    const response = await fetch(`${API_BASE}/api/posts`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data) 
    });
    
    if (response.ok) {
        alert('Julkaisu lisätty!');
        e.target.reset();
    } else {
        alert('Virhe julkaisun lisäämisessä.');
    }
});

// 6. YHTEYSTIETOJEN LATAUS JA PÄIVITYS
async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/api/settings`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        document.getElementById('contactInput').value = data.contact_info || '';
    } catch (err) {
        console.error('Virhe asetusten latauksessa', err);
    }
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contact_info = document.getElementById('contactInput').value;
    
    const response = await fetch(`${API_BASE}/api/settings`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contact_info }) 
    });
    
    if (response.ok) {
        alert('Yhteystiedot päivitetty onnistuneesti!');
    } else {
        alert('Virhe! Vain ylläpitäjä voi päivittää yhteystietoja.');
    }
});

// 7. KUTSUKOODIN LUONTI
document.getElementById('generateInviteBtn')?.addEventListener('click', async () => {
    const res = await fetch(`${API_BASE}/api/invites`, { 
        method: 'POST',
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        document.getElementById('newInviteCodeDisplay').innerText = `Uusi koodi: ${data.invite_code}`;
    } else {
        alert('Virhe! Vain ylläpitäjä tai omistaja voi luoda kutsukoodeja.');
    }
});
