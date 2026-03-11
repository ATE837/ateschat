import { auth, db, provider } from './firebase.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const authCont = document.getElementById('auth-container');
const mainLayout = document.getElementById('main-layout');
const loginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('message-input');
const msgContainer = document.getElementById('messages-container');

// Giriş Durumunu İzle
onAuthStateChanged(auth, (user) => {
    if (user) {
        authCont.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        document.getElementById('user-name').innerText = user.displayName;
        document.getElementById('user-avatar').src = user.photoURL;
        loadMessages();
    } else {
        authCont.classList.remove('hidden');
        mainLayout.classList.add('hidden');
    }
});

// Google ile Giriş
loginBtn.onclick = () => signInWithPopup(auth, provider);
// Çıkış Yap
logoutBtn.onclick = () => signOut(auth);

// Mesaj Gönder
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (msgInput.value.trim() === "") return;
    try {
        await addDoc(collection(db, "messages"), {
            text: msgInput.value,
            uid: auth.currentUser.uid,
            name: auth.currentUser.displayName,
            photo: auth.currentUser.photoURL,
            createdAt: serverTimestamp()
        });
        msgInput.value = "";
    } catch (error) { console.error("Hata:", error); }
};

// Mesajları Getir
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const msgDiv = document.createElement('div');
            msgDiv.className = "message-item";
            msgDiv.innerHTML = `
                <img src="${data.photo}" style="width:40px; height:40px; border-radius:50%">
                <div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <strong style="color:#fff;">${data.name}</strong>
                        <small style="color:#949BA4; font-size:10px;">${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString() : ''}</small>
                    </div>
                    <div style="color:#DBDEE1;">${data.text}</div>
                </div>
            `;
            msgContainer.appendChild(msgDiv);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
