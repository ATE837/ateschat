import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const provider = new GoogleAuthProvider();

// HTML Elemanları
const loginBtn = document.getElementById('google-login-btn');
const authContainer = document.getElementById('auth-container');
const mainLayout = document.getElementById('main-layout');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('message-input');
const msgContainer = document.getElementById('messages-container');
const logoutBtn = document.getElementById('logout-btn');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// 1. Google ile Giriş
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .catch((error) => {
                console.error("Giriş Hatası:", error.message);
                alert("Giriş yapılamadı! Hata: " + error.message);
            });
    });
}

// 2. Çıkış
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth);
    });
}

// 3. Oturum Durumu
onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainer.classList.add('hidden');
        mainLayout.classList.remove('hidden');

        if (userAvatar) userAvatar.src = user.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName || "A") + "&background=5865f2&color=fff";
        if (userName) userName.textContent = user.displayName || "Kullanıcı";

        loadMessages();
    } else {
        authContainer.classList.remove('hidden');
        mainLayout.classList.add('hidden');
    }
});

// 4. Mesaj Gönderme
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const messageText = msgInput.value.trim();
    if (!messageText) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        await addDoc(collection(db, "messages"), {
            text: messageText,
            name: user.displayName || "Kullanıcı",
            photo: user.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName || "A") + "&background=5865f2&color=fff",
            uid: user.uid,
            createdAt: serverTimestamp()
        });
        msgInput.value = "";
    } catch (error) {
        console.error("Mesaj Gönderilemedi:", error);
        alert("Mesaj gitmedi! Firebase kurallarını kontrol et.");
    }
};

// 5. Mesajları Gerçek Zamanlı Yükle
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();

            // null olan eski mesajları gösterme
            if (!data.name || data.name === "null") return;

            const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) || "";
            const photo = data.photo && data.photo !== "null" ? data.photo : "https://ui-avatars.com/api/?name=" + encodeURIComponent(data.name) + "&background=5865f2&color=fff";

            const div = document.createElement('div');
            div.className = "message-item";
            div.innerHTML = `
                <img src="${photo}" alt="avatar" onerror="this.src='https://ui-avatars.com/api/?name=A&background=5865f2&color=fff'">
                <div class="msg-content">
                    <div style="display:flex; align-items:baseline; gap:6px;">
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
