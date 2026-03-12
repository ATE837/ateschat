import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, updatePassword, deleteUser, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, query, orderBy, onSnapshot, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let currentChannelId = null;
let msgUnsub = null;
let memberUnsub = null;
let channelUnsub = null;
let currentCallId = null;
let pc = null;
let localStream = null;

const iceServers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// Sayfa yüklenince kaydedilmiş temayı uygula
applyTheme(localStorage.getItem('theme') || 'dark');

// ===================== AUTH =====================
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
    err.style.color = '#949ba4'; err.textContent = 'Giriş yapılıyor...';
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
    if (!name || !email || !password) { err.style.color = '#ed4245'; err.textContent = 'Tüm alanları doldurun.'; return; }
    if (password.length < 6) { err.style.color = '#ed4245'; err.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
    err.style.color = '#949ba4'; err.textContent = 'Kayıt yapılıyor...';
    try {
        const r = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(r.user, { displayName: name });
        await setDoc(doc(db, 'users', r.user.uid), { displayName: name, email, photoURL: null, createdAt: serverTimestamp() }, { merge: true });
        err.style.color = '#23a55a'; err.textContent = 'Kayıt başarılı!';
    } catch (e) {
        err.style.color = '#ed4245';
        err.textContent = e.code === 'auth/email-already-in-use' ? 'Bu e-posta zaten kayıtlı.' : 'Hata: ' + e.message;
    }
};

window.doLogout = () => signOut(auth);
window.showModal = (id) => {
    document.getElementById(id).style.display = 'flex';
    if (id === 'modal-settings') loadSettingsModal();
};
window.hideModal = (id) => document.getElementById(id).style.display = 'none';
window.showServerScreen = () => {
    document.getElementById('server-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
};

// ===================== PROFİL FOTOĞRAFI =====================
window.openAvatarPicker = () => document.getElementById('avatar-file-input').click();

window.onAvatarSelected = async (input) => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Fotoğraf 500KB\'dan küçük olmalı.'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        window._userPhotoURL = base64;
        await setDoc(doc(db, 'users', currentUser.uid), { photoURL: base64 }, { merge: true });
        setAvatarEl(document.getElementById('my-avatar'), base64, currentUser.displayName);
        setAvatarEl(document.getElementById('settings-avatar'), base64, currentUser.displayName);
        alert('Profil fotoğrafı güncellendi! ✅');
    };
    reader.readAsDataURL(file);
};

function setAvatarEl(el, photoURL, name) {
    if (!el) return;
    if (photoURL) {
        el.style.backgroundImage = `url(${photoURL})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.textContent = (name || 'A')[0].toUpperCase();
    }
}

function makeAvatar(photoURL, name, className) {
    const div = document.createElement('div');
    div.className = className;
    setAvatarEl(div, photoURL, name);
    return div;
}

// ===================== OTURUM =====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        const uDoc = await getDoc(doc(db, 'users', user.uid));
        const photoURL = uDoc.exists() ? uDoc.data().photoURL : null;
        window._userPhotoURL = photoURL;
        setAvatarEl(document.getElementById('my-avatar'), photoURL, user.displayName);
        document.getElementById('my-name').textContent = user.displayName || user.email;
        loadUserServers();
        listenForCalls();
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
        document.getElementById('server-screen').style.display = 'none';
    }
});

// ===================== SUNUCULAR =====================
async function loadUserServers() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const serverList = userDoc.exists() ? (userDoc.data().servers || []) : [];
    if (serverList.length === 0) {
        document.getElementById('server-screen').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
    } else {
        document.getElementById('server-screen').style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
        renderServers(serverList);
        openServer(serverList[0]);
    }
}

function renderServers(serverList) {
    const list = document.getElementById('server-icons');
    list.innerHTML = '';
    serverList.forEach(s => {
        const el = document.createElement('div');
        el.className = 'server-icon' + (s.id === currentServerId ? ' active' : '');
        el.textContent = s.name[0].toUpperCase();
        el.title = s.name;
        el.onclick = () => openServer(s);
        list.appendChild(el);
    });
}

async function openServer(server) {
    currentServerId = server.id;
    document.getElementById('channel-server-name').textContent = server.name;
    document.querySelectorAll('.server-icon').forEach(el => el.classList.toggle('active', el.title === server.name));

    if (memberUnsub) memberUnsub();
    memberUnsub = onSnapshot(doc(db, 'servers', server.id), async snap => {
        const members = snap.data()?.members || [];
        const list = document.getElementById('members-list');
        list.innerHTML = '';
        for (const m of members) {
            let photoURL = null;
            try { const u = await getDoc(doc(db, 'users', m.uid)); if (u.exists()) photoURL = u.data().photoURL; } catch(e) {}
            const div = document.createElement('div');
            div.className = 'member';
            div.appendChild(makeAvatar(photoURL, m.name, 'member-av'));
            const n = document.createElement('span');
            n.className = 'member-name'; n.textContent = m.name;
            div.appendChild(n);
            list.appendChild(div);
        }
    });
    loadChannels(server.id);
}

// ===================== KANALLAR =====================
async function loadChannels(serverId) {
    if (channelUnsub) channelUnsub();
    channelUnsub = onSnapshot(collection(db, 'servers', serverId, 'channels'), async snap => {
        const channelList = document.getElementById('channels');
        channelList.innerHTML = '';
        let channels = [];
        snap.forEach(d => channels.push({ id: d.id, ...d.data() }));
        channels.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

        if (channels.length === 0) {
            await addDoc(collection(db, 'servers', serverId, 'channels'), { name: 'genel', createdAt: serverTimestamp() });
            return;
        }

        const label = document.createElement('div');
        label.className = 'channels-label';
        label.textContent = 'Kanallar';
        channelList.appendChild(label);

        channels.forEach(ch => {
            const el = document.createElement('div');
            el.className = 'channel-item' + (ch.id === currentChannelId ? ' active' : '');
            el.innerHTML = `<span class="ch-hash">#</span>${ch.name}`;
            el.onclick = () => openChannel(serverId, ch.id, ch.name);
            channelList.appendChild(el);
        });

        if (!currentChannelId || !channels.find(c => c.id === currentChannelId)) {
            openChannel(serverId, channels[0].id, channels[0].name);
        }
    });
}

function openChannel(serverId, channelId, channelName) {
    currentChannelId = channelId;
    document.getElementById('channel-title').textContent = '# ' + channelName;
    document.querySelectorAll('.channel-item').forEach(el => {
        el.classList.toggle('active', el.textContent.trim() === channelName);
    });

    if (msgUnsub) msgUnsub();
    const q = query(collection(db, 'servers', serverId, 'channels', channelId, 'messages'), orderBy('createdAt', 'asc'));
    msgUnsub = onSnapshot(q, snap => {
        const container = document.getElementById('messages');
        container.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) || '';
            const div = document.createElement('div');
            div.className = 'msg';
            div.appendChild(makeAvatar(data.photoURL || null, data.name, 'msg-av'));
            const body = document.createElement('div');
            body.className = 'msg-body';
            body.innerHTML = `<div><span class="msg-name">${data.name || 'Kullanıcı'}</span><span class="msg-time">${time}</span></div><span class="msg-text">${data.text}</span>`;
            div.appendChild(body);
            if (data.uid === currentUser?.uid) {
                const del = document.createElement('button');
                del.className = 'msg-delete'; del.textContent = '🗑';
                del.onclick = () => deleteMessage(serverId, channelId, d.id);
                div.appendChild(del);
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
        // Bildirim sesi
        if (localStorage.getItem('notifSound') !== 'false' && snap.docChanges().some(c => c.type === 'added')) {
            playNotif();
        }
    });
}

function playNotif() {
    try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.1, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.start(); o.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

window.addChannel = async () => {
    const name = document.getElementById('new-channel-name').value.trim().toLowerCase().replace(/\s+/g, '-');
    const err = document.getElementById('channel-error');
    if (!name) { err.textContent = 'Kanal adı girin.'; return; }
    await addDoc(collection(db, 'servers', currentServerId, 'channels'), { name, createdAt: serverTimestamp() });
    hideModal('modal-add-channel');
    document.getElementById('new-channel-name').value = '';
};

async function deleteMessage(serverId, channelId, msgId) {
    if (!confirm('Mesajı silmek istiyor musun?')) return;
    await deleteDoc(doc(db, 'servers', serverId, 'channels', channelId, 'messages', msgId));
}

window.sendMessage = async () => {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentServerId || !currentChannelId || !currentUser) return;
    input.value = '';
    let photoURL = window._userPhotoURL || null;
    await addDoc(collection(db, 'servers', currentServerId, 'channels', currentChannelId, 'messages'), {
        text, name: currentUser.displayName || currentUser.email,
        photoURL, uid: currentUser.uid, createdAt: serverTimestamp()
    });
};

window.createServer = async () => {
    const name = document.getElementById('new-server-name').value.trim();
    const err = document.getElementById('create-error');
    if (!name) { err.textContent = 'Sunucu adı girin.'; return; }
    const serverId = Math.random().toString(36).substring(2, 14).toUpperCase();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setDoc(doc(db, 'servers', serverId), {
        name, inviteCode, ownerId: currentUser.uid,
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
    navigator.clipboard.writeText(document.getElementById('invite-code').textContent);
    const btn = event.target; btn.textContent = '✅ Kopyalandı!';
    setTimeout(() => btn.textContent = 'Kopyala', 2000);
};

// ===================== AYARLAR =====================
function loadSettingsModal() {
    if (!currentUser) return;
    document.getElementById('settings-displayname').value = currentUser.displayName || '';
    document.getElementById('settings-name-display').textContent = currentUser.displayName || '';
    setAvatarEl(document.getElementById('settings-avatar'), window._userPhotoURL, currentUser.displayName);
    const theme = localStorage.getItem('theme') || 'dark';
    document.getElementById('theme-dark').classList.toggle('active', theme === 'dark');
    document.getElementById('theme-light').classList.toggle('active', theme === 'light');
    const lang = localStorage.getItem('lang') || 'tr';
    document.getElementById('lang-tr').classList.toggle('active', lang === 'tr');
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    document.getElementById('notif-sound').checked = localStorage.getItem('notifSound') !== 'false';
}

window.saveDisplayName = async () => {
    const name = document.getElementById('settings-displayname').value.trim();
    const msg = document.getElementById('name-msg');
    if (!name) { msg.style.color = '#ed4245'; msg.textContent = 'Ad boş olamaz.'; return; }
    try {
        await updateProfile(currentUser, { displayName: name });
        await setDoc(doc(db, 'users', currentUser.uid), { displayName: name }, { merge: true });
        document.getElementById('my-name').textContent = name;
        document.getElementById('settings-name-display').textContent = name;
        msg.style.color = '#23a55a'; msg.textContent = '✅ Ad güncellendi!';
        setTimeout(() => msg.textContent = '', 2500);
    } catch(e) { msg.style.color = '#ed4245'; msg.textContent = 'Hata: ' + e.message; }
};

window.changePassword = async () => {
    const newPass = document.getElementById('settings-newpass').value;
    const msg = document.getElementById('pass-msg');
    if (newPass.length < 6) { msg.style.color = '#ed4245'; msg.textContent = 'En az 6 karakter olmalı.'; return; }
    try {
        await updatePassword(currentUser, newPass);
        msg.style.color = '#23a55a'; msg.textContent = '✅ Şifre güncellendi!';
        document.getElementById('settings-newpass').value = '';
        setTimeout(() => msg.textContent = '', 2500);
    } catch(e) {
        msg.style.color = '#ed4245';
        msg.textContent = e.code === 'auth/requires-recent-login' ? 'Çıkış yapıp tekrar giriş yap.' : 'Hata: ' + e.message;
    }
};

window.saveSetting = (checked) => localStorage.setItem('notifSound', checked);

window.setTheme = (theme) => {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    document.getElementById('theme-dark').classList.toggle('active', theme === 'dark');
    document.getElementById('theme-light').classList.toggle('active', theme === 'light');
};

function applyTheme(theme) {
    const r = document.documentElement.style;
    if (theme === 'light') {
        r.setProperty('--dark', '#f2f3f5');
        r.setProperty('--sidebar', '#e3e5e8');
        r.setProperty('--black', '#ffffff');
        r.setProperty('--input', '#d9dadc');
        r.setProperty('--text', '#2e3338');
        r.setProperty('--muted', '#5c6370');
    } else {
        r.setProperty('--dark', '#313338');
        r.setProperty('--sidebar', '#2b2d31');
        r.setProperty('--black', '#1e1f22');
        r.setProperty('--input', '#383a40');
        r.setProperty('--text', '#dbdee1');
        r.setProperty('--muted', '#949ba4');
    }
}

window.setLang = (lang) => {
    localStorage.setItem('lang', lang);
    document.getElementById('lang-tr').classList.toggle('active', lang === 'tr');
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    const msg = document.getElementById('settings-msg');
    msg.textContent = lang === 'tr' ? '✅ Dil: Türkçe' : '✅ Language: English';
    setTimeout(() => msg.textContent = '', 2500);
};

window.leaveServer = async () => {
    if (!currentServerId) { alert('Önce bir sunucu seç.'); return; }
    if (!confirm('Bu sunucudan ayrılmak istediğine emin misin?')) return;
    try {
        const serverRef = doc(db, 'servers', currentServerId);
        const serverSnap = await getDoc(serverRef);
        const members = (serverSnap.data()?.members || []).filter(m => m.uid !== currentUser.uid);
        await updateDoc(serverRef, { members });
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const servers = (userSnap.data()?.servers || []).filter(s => s.id !== currentServerId);
        await setDoc(userRef, { servers }, { merge: true });
        hideModal('modal-settings');
        currentServerId = null; currentChannelId = null;
        loadUserServers();
    } catch(e) { alert('Hata: ' + e.message); }
};

window.deleteAccount = async () => {
    if (!confirm('Hesabını silmek istediğine emin misin? Bu işlem geri alınamaz!')) return;
    if (!confirm('Son kez onaylıyor musun?')) return;
    try {
        await deleteDoc(doc(db, 'users', currentUser.uid));
        await deleteUser(currentUser);
    } catch(e) {
        alert(e.code === 'auth/requires-recent-login' ? 'Çıkış yapıp tekrar giriş yap, sonra tekrar dene.' : 'Hata: ' + e.message);
    }
};

// ===================== ARAMA =====================
window.startCall = async (type) => {
    if (!currentServerId) { alert('Önce bir sunucu seç!'); return; }
    try { localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true }); }
    catch (e) { alert('Kamera/mikrofon erişimi reddedildi.'); return; }
    pc = new RTCPeerConnection(iceServers);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    document.getElementById('local-video').srcObject = localStream;
    if (type !== 'video') document.getElementById('local-video').style.display = 'none';
    pc.ontrack = e => { document.getElementById('remote-video').srcObject = e.streams[0]; };
    const callDoc = doc(collection(db, 'calls'));
    currentCallId = callDoc.id;
    pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, 'calls', currentCallId, 'offerCandidates'), e.candidate.toJSON()); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(callDoc, { offer: { type: offer.type, sdp: offer.sdp }, callType: type, callerName: currentUser.displayName || currentUser.email, callerUid: currentUser.uid, serverId: currentServerId, status: 'ringing', createdAt: serverTimestamp() });
    document.getElementById('call-screen').style.display = 'flex';
    document.getElementById('call-status').textContent = 'Bağlanıyor...';
    document.getElementById('remote-video').style.display = type === 'video' ? 'block' : 'none';
    onSnapshot(callDoc, async snap => {
        const data = snap.data(); if (!data) return;
        if (data.answer && !pc.currentRemoteDescription) { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); document.getElementById('call-status').textContent = 'Bağlandı ✅'; }
        if (data.status === 'rejected' || data.status === 'ended') endCall();
    });
    onSnapshot(collection(db, 'calls', currentCallId, 'answerCandidates'), snap => { snap.docChanges().forEach(c => { if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data())); }); });
};

function listenForCalls() {
    onSnapshot(collection(db, 'calls'), snap => {
        snap.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                if (data.status === 'ringing' && data.callerUid !== currentUser?.uid && data.serverId === currentServerId) {
                    currentCallId = change.doc.id;
                    document.getElementById('caller-avatar').textContent = (data.callerName || 'A')[0].toUpperCase();
                    document.getElementById('caller-name').textContent = data.callerName || 'Biri';
                    document.getElementById('caller-type').textContent = data.callType === 'video' ? '📹 Görüntülü Arama' : '📞 Sesli Arama';
                    document.getElementById('incoming-call').style.display = 'flex';
                }
            }
        });
    });
}

window.acceptCall = async () => {
    document.getElementById('incoming-call').style.display = 'none';
    const callDoc = doc(db, 'calls', currentCallId);
    const callData = (await getDoc(callDoc)).data();
    try { localStream = await navigator.mediaDevices.getUserMedia({ video: callData.callType === 'video', audio: true }); }
    catch (e) { alert('Kamera/mikrofon erişimi reddedildi.'); return; }
    pc = new RTCPeerConnection(iceServers);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    document.getElementById('local-video').srcObject = localStream;
    pc.ontrack = e => { document.getElementById('remote-video').srcObject = e.streams[0]; };
    pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, 'calls', currentCallId, 'answerCandidates'), e.candidate.toJSON()); };
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp }, status: 'accepted' });
    onSnapshot(collection(db, 'calls', currentCallId, 'offerCandidates'), snap => { snap.docChanges().forEach(c => { if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data())); }); });
    document.getElementById('call-screen').style.display = 'flex';
    document.getElementById('call-status').textContent = 'Bağlandı ✅';
    document.getElementById('remote-video').style.display = callData.callType === 'video' ? 'block' : 'none';
};

window.rejectCall = async () => {
    document.getElementById('incoming-call').style.display = 'none';
    if (currentCallId) { await updateDoc(doc(db, 'calls', currentCallId), { status: 'rejected' }); currentCallId = null; }
};

window.endCall = async () => {
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (currentCallId) { try { await updateDoc(doc(db, 'calls', currentCallId), { status: 'ended' }); } catch(e) {} currentCallId = null; }
    document.getElementById('call-screen').style.display = 'none';
    document.getElementById('remote-video').srcObject = null;
    document.getElementById('local-video').srcObject = null;
    document.getElementById('local-video').style.display = 'block';
};

window.toggleMute = () => { if (!localStream) return; const a = localStream.getAudioTracks()[0]; if (a) { a.enabled = !a.enabled; document.getElementById('mute-btn').textContent = a.enabled ? '🎤' : '🔇'; } };
window.toggleCam = () => { if (!localStream) return; const v = localStream.getVideoTracks()[0]; if (v) { v.enabled = !v.enabled; document.getElementById('cam-btn').textContent = v.enabled ? '📹' : '🚫'; } };
