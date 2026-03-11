import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwwqd4FfhvLRQu8DUUfbdorIu3iJpkHMM",
  authDomain: "ateschat-cd9f4.firebaseapp.com",
  databaseURL: "https://ateschat-cd9f4-default-rtdb.firebaseio.com",
  projectId: "ateschat-cd9f4",
  storageBucket: "ateschat-cd9f4.firebasestorage.app",
  messagingSenderId: "174732212740",
  appId: "1:174732212740:web:dcd4b60ed7cc380ca95351",
  measurementId: "G-1CBZNR0W3E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentServerId = null;
let currentUser = null;
let messagesUnsub = null;
let membersUnsub = null;

function randomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- AUTH SEKMELERİ ---
document.getElementById('tab-login').addEventListener('click', () => {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-register').classList.remove('active');
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('form-register').classList.add('hidden');
});

document.getElementById('tab-register').addEventListener('click', () => {
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('form-register').classList.remove('hidden');
    document.getElementById('form-login').classList.add('hidden');
});

// --- GİRİŞ ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!email || !password) { 
        errorEl.textContent = 'E-posta ve şifre giriniz.'; 
        return; 
    }

    errorEl.textContent = 'Giriş yapılıyor...';
    errorEl.style.color = '#23a55a';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        errorEl.style.color = '#ed4245';
        if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            errorEl.textContent = 'E-posta veya şifre hatalı.';
        } else {
            errorEl.textContent = 'Hata: ' + e.message;
        }
    }
});

// --- KAYIT ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('reg-error');
    errorEl.textContent = '';

    if (!name || !email || !password) { 
        errorEl.textContent = 'Tüm alanları doldurunuz.'; 
        return; 
    }
    if (password.length < 6) { 
        errorEl.textContent = 'Şifre en az 6 karakter olmalı.'; 
        return; 
    }

    errorEl.textContent = 'Kayıt yapılıyor...';
    errorEl.style.color = '#23a55a';

    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
    } catch (e) {
        errorEl.style.color = '#ed4245';
        if (e.code === 'auth/email-already-in-use') {
            errorEl.textContent = 'Bu e-posta zaten kayıtlı.';
        } else {
            errorEl.textContent = 'Hata: ' + e.message;
        }
    }
});

// --- ÇIKIŞ ---
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// --- OTURUM DURUMU ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').classList.add('hidden');

        const letter = (user.displayName || user.email || 'A')[0].toUpperCase();
        document.getElementById('user-avatar-text').textContent = letter;
        document.getElementById('user-name').textContent = user.displayName || user.email;

        await loadUserServers();
    } else {
        currentUser = null;
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('main-layout').classList.add('hidden');
        document.getElementById('server-screen').classList.add('hidden');
    }
});

// --- KULLANICI SUNUCULARINI YÜKLE ---
async function loadUserServers() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const servers = userDoc.exists() ? (userDoc.data().servers || []) : [];

    if (servers.length === 0) {
        document.getElementById('server-screen').classList.remove('hidden');
        document.getElementById('main-layout').classList.add('hidden');
    } else {
        document.getElementById('server-screen').classList.add('hidden');
        document.getElementById('main-layout').classList.remove('hidden');
        renderServerIcons(servers);
        openServer(servers[0]);
    }
}

function renderServerIcons(servers) {
    const list = document.getElementById('server-icons-list');
    list.innerHTML = '';
    servers.forEach(s => {
        const icon = document.createElement('div');
        icon.className = 'server-icon' + (s.id === currentServerId ? ' active' : '');
        icon.textContent = s.name[0].toUpperCase();
        icon.title = s.name;
        icon.addEventListener('click', () => openServer(s));
        list.appendChild(icon);
    });
}

async function openServer(server) {
    currentServerId = server.id;
    document.getElementById('channel-server-name').textContent = '🔥 ' + server.name;

    document.querySelectorAll('.server-icon').forEach(el => {
        el.classList.toggle('active', el.title === server.name);
    });

    if (messagesUnsub) messagesUnsub();
    const q = query(collection(db, 'servers', server.id, 'messages'), orderBy('createdAt', 'asc'));
    messagesUnsub = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('messages-container');
        container.innerHTML = '';
        snapshot.forEach((d) => {
            const data = d.data();
            if (!data.name || data.name === 'null') return;
            const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) || '';
            const letter = (data.name || 'A')[0].toUpperCase();
            const div = document.createElement('div');
            div.className = 'message-item';
            div.innerHTML = `
                <div class="msg-avatar">${letter}</div>
                <div class="msg-content">
                    <div><span class="msg-name">${data.name}</span><span class="msg-time">${time}</span></div>
                    <span class="msg-text">${data.text}</span>
                </div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });

    if (membersUnsub) membersUnsub();
    membersUnsub = onSnapshot(doc(db, 'servers', server.id), (snap) => {
        const members = snap.data()?.members || [];
        const list = document.getElementById('members-list');
        list.innerHTML = '';
        members.forEach(m => {
            const div = document.createElement('div');
            div.className = 'member-item';
            div.innerHTML = `
                <div class="member-avatar">${m.name[0].toUpperCase()}</div>
                <span class="member-name">${m.name}</span>`;
            list.appendChild(div);
        });
    });
}

// --- MESAJ GÖNDER ---
document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = document.getElementById('message-input').value.trim();
    if (!text || !currentServerId) return;
    try {
        await addDoc(collection(db, 'servers', currentServerId, 'messages'), {
            text,
            name: currentUser.displayName || currentUser.email,
            uid: currentUser.uid,
            createdAt: serverTimestamp()
        });
        document.getElementById('message-input').value = '';
    } catch (e) {
        alert('Mesaj gönderilemedi: ' + e.message);
    }
};

// --- SUNUCU OLUŞTUR ---
document.getElementById('create-server-btn').addEventListener('click', () => {
    document.getElementById('modal-create').classList.remove('hidden');
});
document.getElementById('cancel-create').addEventListener('click', () => {
    document.getElementById('modal-create').classList.add('hidden');
});
document.getElementById('confirm-create-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-server-name').value.trim();
    const errorEl = document.getElementById('create-error');
    if (!name) { errorEl.textContent = 'Sunucu adı giriniz.'; return; }

    const serverId = randomCode() + randomCode();
    const inviteCode = randomCode();

    await setDoc(doc(db, 'servers', serverId), {
        name,
        inviteCode,
        ownerId: currentUser.uid,
        members: [{ uid: currentUser.uid, name: currentUser.displayName || currentUser.email }]
    });

    await setDoc(doc(db, 'users', currentUser.uid), {
        servers: arrayUnion({ id: serverId, name })
    }, { merge: true });

    document.getElementById('modal-create').classList.add('hidden');
    document.getElementById('new-server-name').value = '';
    await loadUserServers();
});

// --- SUNUCUYA KATIL ---
document.getElementById('join-server-btn').addEventListener('click', () => {
    document.getElementById('modal-join').classList.remove('hidden');
});
document.getElementById('cancel-join').addEventListener('click', () => {
    document.getElementById('modal-join').classList.add('hidden');
});
document.getElementById('confirm-join-btn').addEventListener('click', async () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    const errorEl = document.getElementById('join-error');
    if (!code) { errorEl.textContent = 'Davet kodu giriniz.'; return; }

    const { getDocs, where } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const q = query(collection(db, 'servers'), where('inviteCode', '==', code));
    const snap = await getDocs(q);

    if (snap.empty) { errorEl.textContent = 'Geçersiz davet kodu.'; return; }

    const serverDoc = snap.docs[0];
    const serverId = serverDoc.id;
    const serverName = serverDoc.data().name;

    await updateDoc(doc(db, 'servers', serverId), {
        members: arrayUnion({ uid: currentUser.uid, name: currentUser.displayName || currentUser.email })
    });

    await setDoc(doc(db, 'users', currentUser.uid), {
        servers: arrayUnion({ id: serverId, name: serverName })
    }, { merge: true });

    document.getElementById('modal-join').classList.add('hidden');
    document.getElementById('join-code-input').value = '';
    await loadUserServers();
});

// --- DAVET KODU ---
document.getElementById('invite-btn').addEventListener('click', async () => {
    if (!currentServerId) return;
    const snap = await getDoc(doc(db, 'servers', currentServerId));
    const code = snap.data()?.inviteCode || '???';
    document.getElementById('invite-code-display').textContent = code;
    document.getElementById('modal-invite').classList.remove('hidden');
});
document.getElementById('cancel-invite').addEventListener('click', () => {
    document.getElementById('modal-invite').classList.add('hidden');
});
document.getElementById('copy-invite-btn').addEventListener('click', () => {
    const code = document.getElementById('invite-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
        document.getElementById('copy-invite-btn').textContent = '✅ Kopyalandı!';
        setTimeout(() => document.getElementById('copy-invite-btn').textContent = 'Kodu Kopyala', 2000);
    });
});

// --- + BUTONU ---
document.getElementById('add-server-icon').addEventListener('click', () => {
    document.getElementById('server-screen').classList.remove('hidden');
    document.getElementById('main-layout').classList.add('hidden');
});
