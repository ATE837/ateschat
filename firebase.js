// Firebase yapılandırması
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

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);

// Servisler
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const timestamp = firebase.firestore.FieldValue.serverTimestamp;

console.log("✅ Firebase başlatıldı");
