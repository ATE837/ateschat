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
    } catch (error) { console.error("Mesaj gönderilemedi:", error); }
};

function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const msgDiv = document.createElement('div');
            msgDiv.className = "message";
            msgDiv.innerHTML = `
                <div style="display:flex; gap:12px; margin-bottom:15px; padding: 5px; border-radius: 5px;">
                    <img src="${data.photo}" style="width:42px; height:42px; border-radius:50%">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:600; color:#fff; cursor:pointer;">${data.name}</span>
                            <span style="font-size:11px; color:#949BA4;">${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Şimdi'}</span>
                        </div>
                        <div style="color:#dbdee1; font-size:15px; margin-top:2px;">${data.text}</div>
                    </div>
                </div>
            `;
            msgContainer.appendChild(msgDiv);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
