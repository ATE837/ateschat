import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// HTML Elemanları
const authContainer = document.getElementById('auth-container');
const mainLayout = document.getElementById('main-layout');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('message-input');
const msgContainer = document.getElementById('messages-container');
const logoutBtn = document.getElementById('logout-btn');
const userAvatarText = document.getElementById('user-avatar-text');
const userNameEl = document.getElementById('user-name');

// SEKMELER
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

// GİRİŞ
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!email || !password) {
        errorEl.textContent = 'E-posta ve şifre giriniz.';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorEl.textContent = 'E-posta veya şifre hatalı.';
        } else {
            errorEl.textContent = 'Giriş yapılamadı: ' + error.message;
        }
    }
});

// KAYIT
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

    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            errorEl.textContent = 'Bu e-posta zaten kayıtlı.';
        } else {
            errorEl.textContent = 'Kayıt olunamadı: ' + error.message;
        }
    }
});

// ÇIKIŞ
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut(auth));
}

// OTURUM DURUMU
onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainer.classList.add('hidden');
        mainLayout.classList.remove('hidden');

        const firstLetter = (user.displayName || user.email || 'A')[0].toUpperCase();
        if (userAvatarText) userAvatarText.textContent = firstLetter;
        if (userNameEl) userNameEl.textContent = user.displayName || user.email;

        loadMessages();
    } else {
        authContainer.classList.remove('hidden');
        mainLayout.classList.add('hidden');
    }
});

// MESAJ GÖNDERME
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const messageText = msgInput.value.trim();
    if (!messageText) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        await addDoc(collection(db, "messages"), {
            text: messageText,
            name: user.displayName || user.email,
            uid: user.uid,
            createdAt: serverTimestamp()
        });
        msgInput.value = "";
    } catch (error) {
        alert("Mesaj gönderilemedi: " + error.message);
    }
};

// MESAJLARI YÜKLE
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.name || data.name === "null") return;

            const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) || "";
            const letter = (data.name || 'A')[0].toUpperCase();

            const div = document.createElement('div');
            div.className = "message-item";
            div.innerHTML = `
                <div class="msg-avatar">${letter}</div>
                <div class="msg-content">
                    <div>
                        <span class="msg-name">${data.name}</span>
                        <span class="msg-time">${time}</span>
                    </div>
                    <span class="msg-text">${data.text}</span>
                </div>
            `;
            msgContainer.appendChild(div);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
