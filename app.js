import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- BURAYI KENDİ BİLGİLERİNLE DOLDUR ---
const firebaseConfig = {
    apiKey: "BURAYA_KENDI_API_KEYINI_YAPISTIR",
    authDomain: "ateschat-cd9f4.firebaseapp.com",
    projectId: "ateschat-cd9f4",
    storageBucket: "ateschat-cd9f4.appspot.com",
    messagingSenderId: "BURAYA_SENDER_ID_YAPISTIR",
    appId: "BURAYA_APP_ID_YAPISTIR"
};
// ---------------------------------------

// Firebase Başlatma
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// HTML Elemanlarını Yakalama
const loginBtn = document.getElementById('google-login-btn');
const authContainer = document.getElementById('auth-container');
const mainLayout = document.getElementById('main-layout');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('message-input');
const msgContainer = document.getElementById('messages-container');

// 1. GİRİŞ YAPMA FONKSİYONU
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("Giriş Başarılı:", result.user.displayName);
            })
            .catch((error) => {
                console.error("Giriş Hatası:", error.message);
                alert("Giriş yapılamadı! Lütfen tekrar deneyin. Hata: " + error.message);
            });
    });
}

// 2. OTURUM DURUMUNU İZLEME (Ekranda ne görünecek?)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Kullanıcı giriş yapmışsa
        authContainer.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        loadMessages(); // Mesajları yükle
    } else {
        // Kullanıcı çıkış yapmışsa
        authContainer.classList.remove('hidden');
        mainLayout.classList.add('hidden');
    }
});

// 3. MESAJ GÖNDERME FONKSİYONU
chatForm.onsubmit = async (e) => {
    e.preventDefault();
    
    const messageText = msgInput.value.trim();
    if (!messageText) return; // Boş mesajı engelle

    try {
        await addDoc(collection(db, "messages"), {
            text: messageText,
            name: auth.currentUser.displayName || "Anonim Kullanıcı",
            photo: auth.currentUser.photoURL || "https://via.placeholder.com/40",
            uid: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
        msgInput.value = ""; // Gönderince kutuyu temizle
    } catch (error) {
        console.error("Mesaj Gönderilemedi:", error);
        alert("Mesaj gitmedi, Firebase kurallarını kontrol et!");
    }
};

// 4. MESAJLARI GERÇEK ZAMANLI YÜKLEME
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    
    onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = ""; // Listeyi sıfırla
        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = "message-item";
            
            // Discord stili mesaj yapısı
            div.innerHTML = `
                <img src="${data.photo}" style="width:40px; height:40px; border-radius:50%; margin-right:10px;">
                <div>
                    <strong style="color: #fff; display: block;">${data.name}</strong>
                    <span style="color: #dbdee1;">${data.text}</span>
                </div>
            `;
            msgContainer.appendChild(div);
        });
        // En son mesaja otomatik kaydır
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}
