import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "BURAYA_API_KEY_GELECEK",
    authDomain: "ate837.firebaseapp.com",
    projectId: "ate837",
    storageBucket: "ate837.appspot.com",
    messagingSenderId: "BURAYA_ID_GELECEK",
    appId: "BURAYA_APP_ID_GELECEK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const loginBtn = document.getElementById('google-login-btn');
const authContainer = document.getElementById('auth-container');
const mainLayout = document.getElementById('main-layout');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('message-input');
const msgContainer = document.getElementById('messages-container');

// BUTONA BASINCA AÇILMASI İÇİN
if (loginBtn) {
    loginBtn.onclick = () => {
        signInWithPopup(auth, provider).catch(err => alert("Hata: " + err.message));
    };
}

// OTURUM AÇILINCA EKRANI DEĞİŞTİR
onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainer.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        loadMessages();
    }
});

// MESAJ GÖNDERME
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!msgInput.value.trim()) return;
    
    await addDoc(collection(db, "messages"), {
        text: msgInput.value,
        name: auth.currentUser.displayName,
        photo: auth.currentUser.photoURL,
        createdAt: serverTimestamp()
    });
    msgInput.value = "";
};

// MESAJLARI GÖSTERME
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = "message-item";
            div.innerHTML = `<b>${data.name}:</b> ${data.text}`;
            msgContainer.appendChild(div);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
