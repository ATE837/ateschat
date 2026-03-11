import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "SENIN_API_KEY",
    authDomain: "ate837.firebaseapp.com",
    projectId: "ate837",
    storageBucket: "ate837.appspot.com",
    messagingSenderId: "SENIN_ID",
    appId: "SENIN_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Giriş Butonu Fonksiyonu
const loginBtn = document.getElementById('google-login-btn');
if (loginBtn) {
    loginBtn.onclick = () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("Giriş başarılı!");
            }).catch((error) => {
                console.error("Hata:", error.message);
                alert("Giriş yapılamadı: " + error.message);
            });
    };
}

// Ekran Değiştirme (Giriş yapınca ana sayfayı aç)
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('main-layout').classList.remove('hidden');
        loadMessages();
    }
});
