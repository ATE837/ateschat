import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, query, orderBy, onSnapshot, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwwqd4FfhvLRQu8DUUfbdorIu3iJpkHMM",
  authDomain: "ateschat-cd9f4.firebaseapp.com",
  projectId: "ateschat-cd9f4",
  storageBucket: "ateschat-cd9f4.firebasestorage.app",
  messagingSenderId: "174732212740",
  appId: "1:174732212740:web:dcd4b60ed7cc380ca95351"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentServerId = null;
let msgUnsub = null;
let memberUnsub = null;

// Global fonksiyonlar - HTML onclick için
window.showTab = (tab) => {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
};

window.doLogin = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.color = '#949ba4';
    err.textContent = 'Giriş yapılıyor...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        err.style.color = '#ed4245';
        err.textContent = e.code === 'auth/invalid-credential' ? 'E-posta veya şifre hatalı.' : 'Hata: ' + e.message;
    }
};

window.doRegister = async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const err = document.getElementById('reg-error');
    err.style.color = '#949ba4';
    if (!name || !email || !password) { err.style.color = '#ed4245'; err.textContent = 'Tüm alanları doldurun.'; return; }
    if (password.length < 6) { err.style.color = '#ed4245'; err.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
    err.textContent = 'Kayıt yapılıyor...';
    try {
        const r = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(r.user, { displayName: name });
        err.style.color = '#23a55a';
        err.textContent = 'Kayıt başarılı!';
    } catch (e) {
        err.style.color = '#ed4245';
        err.textContent = e.code === 'auth/email-already-in-use' ? 'Bu e-posta zaten kayıtlı.' : 'Hata: ' + e.message;
    }
};

window.doLogout = () => signOut(auth);

window.showModal = (id) => document.getElementById(id).style.display = 'flex';
window.hideModal = (id) => document.getElementById(id).style.display = 'none';

window.showServerScreen = () => {
    document.getElementById('server-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
};

window.sendMessage = async () => {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentServerId || !currentUser) return;
    input.value = '';
    await addDoc(collection(db, 'servers', currentServerId, 'messages'), {
        text,
        name: currentUser.displayName || currentUser.email,
        uid: currentUser.uid,
        createdAt: serverTimestamp()
    });
};

window.createServer = async () => {
    const name = document.getElementById('new-server-name').value.trim();
    const err = document.getElementById('create-error');
    if (!name) { err.textContent = 'Sunucu adı girin.'; return; }

    const serverId = Math.random().toString(36).substring(2, 14).toUpperCase();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await setDoc(doc(db, 'servers', serverId), {
        name, inviteCode,
        ownerId: currentUser.uid,
        members: [{ uid: currentUser.uid, name: currentUser.displayName || currentUser.email }]
    });
    await setDoc(doc(db, 'users', currentUser.uid), { servers: arrayUnion({ id: serverId, name }) }, { merge: true });

    hideModal('modal-create');
    document.getElementById('new-server-name').value = '';
    loadUserServers();
};

window.joinServer = async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const err = document.getElementById('join-error');
    if (!code) { err.textContent = 'Davet kodu girin.'; return; }
    err.textContent = 'Aranıyor...';

    const snap = await getDocs(query(collection(db, 'servers'), where('inviteCode', '==', code)));
    if (snap.empty) { err.style.color = '#ed4245'; err.textContent = 'Geçersiz kod.'; return; }

    const serverDoc = snap.docs[0];
    await updateDoc(doc(db, 'servers', serverDoc.id), {
        members: arrayUnion({ uid: currentUser.uid, name: currentUser.displayName || currentUser.email })
    });
    await setDoc(doc(db, 'users', currentUser.uid), {
        servers: arrayUnion({ id: serverDoc.id, name: serverDoc.data().name })
    }, { merge: true });

    hideModal('modal-join');
    document.getElementById('join-code').value = '';
    loadUserServers();
};

window.showInvite = async () => {
    if (!currentServerId) return;
    const snap = await getDoc(doc(db, 'servers', currentServerId));
    document.getElementById('invite-code').textContent = snap.data()?.inviteCode || '???';
    showModal('modal-invite');
};

window.copyInvite = () => {
    const code = document.getElementById('invite-code').textContent;
    navigator.clipboard.writeText(code);
    const btn = event.target;
    btn.textContent = '✅ Kopyalandı!';
    setTimeout(() => btn.textContent = 'Kopyala', 2000);
};

// Oturum durumu
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('my-avatar').textContent = (user.displayName || user.email)[0].toUpperCase();
        document.getElementById('my-name').textContent = user.displayName || user.email;
        loadUserServers();
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
        document.getElementById('server-screen').style.display = 'none';
    }
});

async function loadUserServers() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const servers = userDoc.exists() ? (userDoc.data().servers || []) : [];

    if (servers.length === 0) {
        document.getElementById('server-screen').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
    } else {
        document.getElementById('server-screen').style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
        renderServers(servers);
        openServer(servers[0]);
    }
}

function renderServers(servers) {
    const list = document.getElementById('server-icons');
    list.innerHTML = '';
    servers.forEach(s => {
        const el = document.createElement('div');
        el.className = 'server-icon' + (s.id === currentServerId ? ' active' : '');
        el.textContent = s.name[0].toUpperCase();
        el.title = s.name;
        el.onclick = () => openServer(s);
        list.appendChild(el);
    });
}

function openServer(server) {
    currentServerId = server.id;
    document.getElementById('server-title').textContent = '🔥 ' + server.name;
    document.querySelectorAll('.server-icon').forEach(el => el.classList.toggle('active', el.title === server.name));

    if (msgUnsub) msgUnsub();
    const q = query(collection(db, 'servers', server.id, 'messages'), orderBy('createdAt', 'asc'));
    msgUnsub = onSnapshot(q, snap => {
        const container = document.getElementById('messages');
        container.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) || '';
            const div = document.createElement('div');
            div.className = 'msg';
            div.innerHTML = `
                <div class="msg-av">${(data.name||'A')[0].toUpperCase()}</div>
                <div class="msg-body">
                    <div><span class="msg-name">${data.name||''}</span><span class="msg-time">${time}</span></div>
                    <span class="msg-text">${data.text}</span>
                </div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });

    if (memberUnsub) memberUnsub();
    memberUnsub = onSnapshot(doc(db, 'servers', server.id), snap => {
        const members = snap.data()?.members || [];
        const list = document.getElementById('members-list');
        list.innerHTML = '';
        members.forEach(m => {
            const div = document.createElement('div');
            div.className = 'member';
            div.innerHTML = `<div class="member-av">${m.name[0].toUpperCase()}</div><span class="member-name">${m.name}</span>`;
            list.appendChild(div);
        });
    });
}
