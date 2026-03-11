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

loginBtn.onclick = () => signInWithPopup(auth, provider);
logoutBtn.onclick = () => signOut(auth);

chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!msgInput.value.trim()) return;
    try {
        await addDoc(collection(db, "messages"), {
            text: msgInput.value,
            name: auth.currentUser.displayName,
            photo: auth.currentUser.photoURL,
            createdAt: serverTimestamp()
        });
        msgInput.value = "";
    } catch (s) { console.error(s); }
};

function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = "message-item";
            div.innerHTML = `<img src="${data.photo}"><div><strong>${data.name}</strong><div>${data.text}</div></div>`;
            msgContainer.appendChild(div);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
