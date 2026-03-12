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
let currentServerData = null;
let msgUnsub = null;
let memberUnsub = null;
let channelUnsub = null;
let typingUnsub = null;
let currentCallId = null;
let pc = null;
let localStream = null;
let screenStream = null;
let isAdmin = false;
let allAdminUsers = [];
let replyTo = null;
let contextMsgData = null;
let roleTargetUid = null;
let typingTimeout = null;
let allMessages = [];
let mediaRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceSeconds = 0;
let isCancelled = false;

const ADMIN_KEY_HASH = '548cd183a18c7924882b8b3af52b5f87fd9706e31a66922acab1b22ac40ee508';
const iceServers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302'] }] };

applyTheme(localStorage.getItem('theme') || 'dark');

// ===================== HASH =====================
async function sha256(msg) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ===================== AUTH =====================
window.showTab = (tab) => {
    ['login','register','admin'].forEach(t => {
        document.getElementById('form-'+t).style.display = t===tab ? 'block' : 'none';
        document.getElementById('tab-'+t).classList.toggle('active', t===tab);
    });
};

window.doLogin = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pw = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.color = '#949ba4'; err.textContent = 'Giriş yapılıyor...';
    try {
        const cred = await signInWithEmailAndPassword(auth, email, pw);
        const uDoc = await getDoc(doc(db, 'users', cred.user.uid));
        if (uDoc.exists() && uDoc.data().banned) {
            await signOut(auth);
            err.style.color = '#ed4245';
            err.textContent = '🚫 Hesabın banlandı. NovaChat\'a erişimin engellendi.';
        }
    } catch(e) {
        err.style.color = '#ed4245';
        err.textContent = e.code === 'auth/invalid-credential' ? 'E-posta veya şifre hatalı.' : 'Hata: ' + e.message;
    }
};

window.doRegister = async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pw = document.getElementById('reg-password').value;
    const err = document.getElementById('reg-error');
    if (!name||!email||!pw) { err.style.color='#ed4245'; err.textContent='Tüm alanları doldurun.'; return; }
    if (pw.length < 6) { err.style.color='#ed4245'; err.textContent='Şifre en az 6 karakter.'; return; }
    err.style.color = '#949ba4'; err.textContent = 'Kayıt yapılıyor...';
    try {
        const r = await createUserWithEmailAndPassword(auth, email, pw);
        await updateProfile(r.user, { displayName: name });
        await setDoc(doc(db, 'users', r.user.uid), {
            displayName: name, email, photoURL: null,
            status: 'online', banned: false, createdAt: serverTimestamp()
        }, { merge: true });
        err.style.color = '#23a55a'; err.textContent = '✅ Kayıt başarılı! Giriş yapılıyor...';
    } catch(e) {
        err.style.color = '#ed4245';
        err.textContent = e.code === 'auth/email-already-in-use' ? 'Bu e-posta zaten kayıtlı.' : 'Hata: ' + e.message;
    }
};

window.doLogout = async () => {
    if (currentUser) try { await setDoc(doc(db,'users',currentUser.uid),{status:'offline'},{merge:true}); } catch(e) {}
    isAdmin = false;
    signOut(auth);
};

// ===================== ADMİN =====================
window.doAdminLogin = async () => {
    const key = document.getElementById('admin-key-input').value.trim();
    const err = document.getElementById('admin-error');
    if (!key) { err.style.color='#ed4245'; err.textContent='Anahtar girin.'; return; }
    err.style.color = '#949ba4'; err.textContent = 'Doğrulanıyor...';
    const hash = await sha256(key);
    if (hash !== ADMIN_KEY_HASH) { err.style.color='#ed4245'; err.textContent='❌ Geçersiz anahtar.'; return; }
    isAdmin = true;
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    loadAdminPanel();
};

window.adminLogout = () => {
    isAdmin = false;
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('admin-key-input').value = '';
    showTab('login');
};

async function loadAdminPanel() {
    const usersSnap = await getDocs(collection(db,'users'));
    const serversSnap = await getDocs(collection(db,'servers'));
    allAdminUsers = [];
    let bannedCount = 0;
    usersSnap.forEach(d => { const data = d.data(); allAdminUsers.push({uid:d.id,...data}); if(data.banned) bannedCount++; });
    document.getElementById('stat-users').textContent = usersSnap.size;
    document.getElementById('stat-servers').textContent = serversSnap.size;
    document.getElementById('stat-banned').textContent = bannedCount;
    renderAdminUsers(allAdminUsers);
}

function renderAdminUsers(users) {
    const list = document.getElementById('admin-users-list'); list.innerHTML = '';
    if (!users.length) { list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">Kullanıcı bulunamadı</div>'; return; }
    users.forEach(u => {
        const div = document.createElement('div'); div.className = 'admin-user-item' + (u.banned ? ' banned' : '');
        div.innerHTML = `<div class="admin-user-av">${(u.displayName||'A')[0].toUpperCase()}</div>
            <div class="admin-user-info">
                <div class="admin-user-name">${u.displayName||'İsimsiz'}${u.banned?'<span class="admin-user-badge badge-banned">🚫 BANLI</span>':''}</div>
                <div class="admin-user-email">${u.email||u.uid}</div>
            </div>
            <div class="admin-user-btns">${u.banned
                ? `<button class="ban-btn do-unban" onclick="adminUnban('${u.uid}','${u.displayName||''}')">✅ Ban Kaldır</button>`
                : `<button class="ban-btn do-ban" onclick="adminBan('${u.uid}','${u.displayName||''}')">🚫 Banla</button>`
            }</div>`;
        list.appendChild(div);
    });
}

window.filterAdminUsers = () => {
    const q = document.getElementById('admin-user-search').value.toLowerCase();
    renderAdminUsers(allAdminUsers.filter(u => (u.displayName||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)));
};

window.adminBan = async (uid, name) => {
    if (!confirm(`"${name}" banlanacak. Emin misin?`)) return;
    await setDoc(doc(db,'users',uid), {banned:true, bannedAt:serverTimestamp()}, {merge:true});
    const u = allAdminUsers.find(u=>u.uid===uid); if(u) u.banned = true;
    document.getElementById('stat-banned').textContent = allAdminUsers.filter(u=>u.banned).length;
    renderAdminUsers(allAdminUsers);
};

window.adminUnban = async (uid, name) => {
    if (!confirm(`"${name}" banı kaldırılacak. Emin misin?`)) return;
    await setDoc(doc(db,'users',uid), {banned:false, bannedAt:null}, {merge:true});
    const u = allAdminUsers.find(u=>u.uid===uid); if(u) u.banned = false;
    document.getElementById('stat-banned').textContent = allAdminUsers.filter(u=>u.banned).length;
    renderAdminUsers(allAdminUsers);
};

// ===================== MODAL =====================
window.showModal = (id) => {
    document.getElementById(id).style.display = 'flex';
    if (id === 'modal-settings') loadSettingsModal();
    if (id === 'modal-friends') { loadFriends('all'); updateFriendBadge(); }
};
window.hideModal = (id) => document.getElementById(id).style.display = 'none';
window.showServerScreen = () => {
    document.getElementById('server-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
};

// ===================== AVATAR =====================
window.openAvatarPicker = () => document.getElementById('avatar-file-input').click();
window.onAvatarSelected = async (input) => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 700*1024) { alert('Fotoğraf 700KB\'dan küçük olmalı.'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        window._userPhotoURL = base64;
        await setDoc(doc(db,'users',currentUser.uid), {photoURL:base64}, {merge:true});
        setAvatarEl(document.getElementById('my-avatar'), base64, currentUser.displayName);
        setAvatarEl(document.getElementById('settings-avatar'), base64, currentUser.displayName);
        alert('Profil fotoğrafı güncellendi! ✅');
    };
    reader.readAsDataURL(file);
};

function setAvatarEl(el, photoURL, name) {
    if (!el) return;
    if (photoURL) { el.style.backgroundImage=`url(${photoURL})`; el.style.backgroundSize='cover'; el.style.backgroundPosition='center'; el.textContent=''; }
    else { el.style.backgroundImage=''; el.textContent=(name||'A')[0].toUpperCase(); }
}
function makeAvatar(photoURL, name, className) {
    const div = document.createElement('div'); div.className = className;
    setAvatarEl(div, photoURL, name); return div;
}

// ===================== OTURUM =====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        const uDoc = await getDoc(doc(db,'users',user.uid));
        if (uDoc.exists() && uDoc.data().banned) {
            await signOut(auth);
            document.getElementById('auth-container').style.display = 'flex';
            document.getElementById('login-error').style.color = '#ed4245';
            document.getElementById('login-error').textContent = '🚫 Hesabın banlandı.';
            return;
        }
        const photoURL = uDoc.exists() ? uDoc.data().photoURL : null;
        window._userPhotoURL = photoURL;
        setAvatarEl(document.getElementById('my-avatar'), photoURL, user.displayName);
        document.getElementById('my-name').textContent = user.displayName || user.email;
        await setDoc(doc(db,'users',user.uid), {status: localStorage.getItem('userStatus')||'online'}, {merge:true});
        updateStatusDot(localStorage.getItem('userStatus')||'online');
        const notifEl = document.getElementById('notif-browser');
        if (notifEl) notifEl.checked = localStorage.getItem('browserNotif')==='true' && Notification.permission==='granted';
        loadUserServers(); listenForCalls(); updateFriendBadge();
    } else {
        if (isAdmin) return;
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
        document.getElementById('server-screen').style.display = 'none';
    }
});

// ===================== DURUM =====================
window.setStatus = async (status) => {
    if (!currentUser) return;
    localStorage.setItem('userStatus', status);
    await setDoc(doc(db,'users',currentUser.uid), {status}, {merge:true});
    updateStatusDot(status);
    document.querySelectorAll('.status-option').forEach(el => el.classList.toggle('active', el.dataset.status===status));
};
function updateStatusDot(status) {
    const dot = document.getElementById('status-dot'); if (!dot) return;
    dot.style.background = {online:'#23a55a',idle:'#faa61a',dnd:'#ed4245',offline:'#747f8d'}[status]||'#23a55a';
}
function getStatusColor(status) {
    return {online:'#23a55a',idle:'#faa61a',dnd:'#ed4245',offline:'#747f8d'}[status]||'#747f8d';
}

// ===================== TARAYICI BİLDİRİMİ =====================
window.toggleBrowserNotif = async (checked) => {
    if (checked) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') { localStorage.setItem('browserNotif','true'); document.getElementById('notif-browser').checked = true; }
        else { localStorage.setItem('browserNotif','false'); document.getElementById('notif-browser').checked = false; alert('Bildirim izni verilmedi.'); }
    } else { localStorage.setItem('browserNotif','false'); }
};
function showBrowserNotif(name, text) {
    if (localStorage.getItem('browserNotif')!=='true' || Notification.permission!=='granted') return;
    if (document.hasFocus()) return;
    try { new Notification('NovaChat — '+name, {body:text, icon:'icon-192.png'}); } catch(e) {}
}

// ===================== SUNUCULAR =====================
async function loadUserServers() {
    const userDoc = await getDoc(doc(db,'users',currentUser.uid));
    const serverList = userDoc.exists() ? (userDoc.data().servers||[]) : [];
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
    const list = document.getElementById('server-icons'); list.innerHTML = '';
    serverList.forEach(s => {
        const el = document.createElement('div');
        el.className = 'server-icon' + (s.id===currentServerId ? ' active' : '');
        el.textContent = s.name[0].toUpperCase(); el.title = s.name;
        el.onclick = () => openServer(s);
        list.appendChild(el);
    });
}

async function openServer(server) {
    currentServerId = server.id;
    document.getElementById('channel-server-name').textContent = server.name;
    document.querySelectorAll('.server-icon').forEach(el => el.classList.toggle('active', el.title===server.name));
    const snap = await getDoc(doc(db,'servers',server.id));
    currentServerData = snap.data();
    if (memberUnsub) memberUnsub();
    memberUnsub = onSnapshot(doc(db,'servers',server.id), async snap => {
        currentServerData = snap.data();
        const members = snap.data()?.members || [];
        const roles = snap.data()?.roles || {};
        const list = document.getElementById('members-list'); list.innerHTML = '';
        for (const m of members) {
            let photoURL=null, status='offline';
            try { const u=await getDoc(doc(db,'users',m.uid)); if(u.exists()){photoURL=u.data().photoURL; status=u.data().status||'offline';} } catch(e) {}
            const div = document.createElement('div'); div.className = 'member';
            const avWrap = document.createElement('div'); avWrap.style.cssText='position:relative;flex-shrink:0';
            const av = makeAvatar(photoURL, m.name, 'member-av');
            const dot = document.createElement('div'); dot.className='member-status-dot'; dot.style.background=getStatusColor(status);
            avWrap.appendChild(av); avWrap.appendChild(dot);
            const nameEl = document.createElement('span'); nameEl.className='member-name'; nameEl.textContent=m.name;
            const role = roles[m.uid]||'member';
            if (role!=='member') { const badge=document.createElement('span'); badge.className='member-role-badge '+(role==='owner'?'role-owner':'role-mod'); badge.textContent=role==='owner'?'👑':'🛡️'; nameEl.appendChild(badge); }
            div.appendChild(avWrap); div.appendChild(nameEl);
            div.onclick = () => showProfile(m.uid, m.name, photoURL, status);
            list.appendChild(div);
        }
    });
    loadChannels(server.id);
}

// ===================== ROL SİSTEMİ =====================
function getMyRole() { if(!currentServerData||!currentUser) return 'member'; return (currentServerData.roles||{})[currentUser.uid]||'member'; }
function canDeleteMsg(msgUid) { const r=getMyRole(); return r==='owner'||r==='mod'||msgUid===currentUser?.uid; }

window.openRoleModal = (uid, name) => { roleTargetUid=uid; document.getElementById('role-target-name').textContent=name+' kullanıcısının rolü'; showModal('modal-roles'); };
window.setMemberRole = async (role) => {
    if (!roleTargetUid||!currentServerId) return;
    const roles = currentServerData?.roles||{};
    roles[roleTargetUid] = role;
    await updateDoc(doc(db,'servers',currentServerId), {roles});
    hideModal('modal-roles'); hideModal('modal-profile');
};

// ===================== KANALLAR =====================
async function loadChannels(serverId) {
    if (channelUnsub) channelUnsub();
    channelUnsub = onSnapshot(collection(db,'servers',serverId,'channels'), async snap => {
        const channelList = document.getElementById('channels'); channelList.innerHTML='';
        let channels = []; snap.forEach(d => channels.push({id:d.id,...d.data()}));
        channels.sort((a,b) => (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        if (channels.length===0) { await addDoc(collection(db,'servers',serverId,'channels'),{name:'genel',createdAt:serverTimestamp()}); return; }
        const label = document.createElement('div'); label.className='channels-label'; label.textContent='Kanallar'; channelList.appendChild(label);
        channels.forEach(ch => {
            const el = document.createElement('div');
            el.className = 'channel-item'+(ch.id===currentChannelId?' active':'');
            el.innerHTML = `<span class="ch-hash">#</span>${ch.name}`;
            el.onclick = () => openChannel(serverId, ch.id, ch.name);
            channelList.appendChild(el);
        });
        if (!currentChannelId||!channels.find(c=>c.id===currentChannelId)) openChannel(serverId, channels[0].id, channels[0].name);
    });
}

function openChannel(serverId, channelId, channelName) {
    currentChannelId = channelId;
    document.getElementById('channel-title').textContent = '# '+channelName;
    document.querySelectorAll('.channel-item').forEach(el => el.classList.toggle('active', el.textContent.trim()===channelName));
    cancelReply();
    if (msgUnsub) msgUnsub();
    if (typingUnsub) typingUnsub();
    // Yazıyor dinleyici
    typingUnsub = onSnapshot(doc(db,'servers',serverId,'channels',channelId,'meta','typing'), snap => {
        const data=snap.data()||{}; const now=Date.now();
        const typers=Object.entries(data).filter(([uid,info])=>uid!==currentUser?.uid&&info.ts&&(now-info.ts)<4000).map(([,info])=>info.name);
        const ti=document.getElementById('typing-indicator'), tt=document.getElementById('typing-text');
        if (typers.length>0) { tt.textContent=typers.join(', ')+' yazıyor'; ti.style.display='flex'; }
        else { ti.style.display='none'; }
    });
    const q = query(collection(db,'servers',serverId,'channels',channelId,'messages'), orderBy('createdAt','asc'));
    msgUnsub = onSnapshot(q, snap => {
        const container = document.getElementById('messages');
        const wasBottom = container.scrollHeight-container.scrollTop <= container.clientHeight+60;
        allMessages = [];
        snap.forEach(d => allMessages.push({id:d.id,...d.data()}));
        renderMessages(allMessages);
        if (wasBottom) container.scrollTop = container.scrollHeight;
        snap.docChanges().forEach(change => {
            if (change.type==='added') {
                const data=change.doc.data();
                if (data.uid!==currentUser?.uid) {
                    if (localStorage.getItem('notifSound')!=='false') playNotif();
                    showBrowserNotif(data.name||'Birisi', data.text||'Yeni mesaj');
                }
            }
        });
    });
}

// ===================== MESAJ RENDER =====================
function renderMessages(msgs) {
    const container = document.getElementById('messages'); container.innerHTML='';
    msgs.forEach(data => {
        const time = data.createdAt?.toDate().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})||'';
        const div = document.createElement('div'); div.className='msg'; div.dataset.msgId=data.id;
        div.appendChild(makeAvatar(data.photoURL||null, data.name, 'msg-av'));
        const body = document.createElement('div'); body.className='msg-body';
        // Reply referansı
        if (data.replyTo) {
            const ref = document.createElement('div'); ref.className='msg-reply-ref';
            ref.innerHTML=`<div class="msg-reply-ref-name">↩ ${data.replyTo.name}</div><div class="msg-reply-ref-text">${data.replyTo.text||'[medya]'}</div>`;
            ref.onclick = () => {
                const el = container.querySelector(`[data-msg-id="${data.replyTo.id}"]`);
                if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.background='rgba(88,101,242,0.15)'; setTimeout(()=>el.style.background='',1500); }
            };
            body.appendChild(ref);
        }
        // Header
        const header = document.createElement('div');
        header.innerHTML = `<span class="msg-name">${data.name||'Kullanıcı'}</span><span class="msg-time">${time}</span>${data.edited?'<span class="msg-edited-tag">(düzenlendi)</span>':''}`;
        body.appendChild(header);
        // İçerik
        if (data.type==='image') {
            const img = document.createElement('img'); img.src=data.fileData; img.className='msg-image'; img.onclick=()=>openImage(data.fileData); body.appendChild(img);
        } else if (data.type==='file') {
            const a=document.createElement('a'); a.href=data.fileData; a.download=data.fileName; a.className='msg-file'; a.innerHTML=`📎 ${data.fileName} <span>(${data.fileSize})</span>`; body.appendChild(a);
        } else if (data.type==='audio') {
            body.appendChild(renderAudioMessage(data.fileData, data.duration));
        } else {
            const t = document.createElement('span'); t.className='msg-text'; t.textContent=data.text; body.appendChild(t);
        }
        div.appendChild(body);
        // Context menu - sağ tık veya uzun basma
        div.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, data); });
        let touchTimer;
        div.addEventListener('touchstart', () => { touchTimer=setTimeout(()=>showContextMenu({clientX:window.innerWidth/2,clientY:window.innerHeight/2},data),600); });
        div.addEventListener('touchend', () => clearTimeout(touchTimer));
        container.appendChild(div);
    });
}

// ===================== CONTEXT MENU =====================
function showContextMenu(e, data) {
    contextMsgData = data;
    const menu = document.getElementById('msg-context-menu');
    document.getElementById('ctx-edit-btn').style.display = data.uid===currentUser?.uid && data.type==='text' ? 'block' : 'none';
    document.getElementById('ctx-delete-btn').style.display = canDeleteMsg(data.uid) ? 'block' : 'none';
    menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth-160)+'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight-130)+'px';
}

window.contextReply = () => {
    if (!contextMsgData) return;
    replyTo = {id:contextMsgData.id, name:contextMsgData.name, text:contextMsgData.text||'[medya]'};
    document.getElementById('reply-preview').style.display = 'block';
    document.getElementById('reply-preview-name').textContent = contextMsgData.name;
    document.getElementById('reply-preview-text').textContent = contextMsgData.text||'[medya]';
    document.getElementById('msg-input').focus();
    document.getElementById('msg-context-menu').style.display = 'none';
};

window.contextEdit = () => {
    if (!contextMsgData) return;
    document.getElementById('msg-context-menu').style.display = 'none';
    const container = document.getElementById('messages');
    const el = container.querySelector(`[data-msg-id="${contextMsgData.id}"]`);
    if (!el) return;
    const textEl = el.querySelector('.msg-text'); if (!textEl) return;
    textEl.style.display = 'none';
    const wrap = document.createElement('div'); wrap.className='msg-edit-wrap';
    const input = document.createElement('input'); input.className='msg-edit-input'; input.value=textEl.textContent;
    const save = document.createElement('button'); save.className='msg-edit-save'; save.textContent='Kaydet';
    const cancel = document.createElement('button'); cancel.className='msg-edit-cancel'; cancel.textContent='İptal';
    save.onclick = async () => {
        const newText = input.value.trim(); if (!newText) return;
        await updateDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',contextMsgData.id), {text:newText, edited:true});
        wrap.remove(); textEl.style.display='';
    };
    cancel.onclick = () => { wrap.remove(); textEl.style.display=''; };
    wrap.appendChild(input); wrap.appendChild(save); wrap.appendChild(cancel);
    textEl.parentNode.insertBefore(wrap, textEl.nextSibling);
    input.focus();
};

window.contextDelete = () => {
    if (!contextMsgData) return;
    document.getElementById('msg-context-menu').style.display = 'none';
    if (!confirm('Mesajı silmek istiyor musun?')) return;
    deleteDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',contextMsgData.id));
};

window.cancelReply = () => { replyTo=null; document.getElementById('reply-preview').style.display='none'; };

// ===================== YAZIYOR =====================
window.handleTyping = async () => {
    if (!currentUser||!currentServerId||!currentChannelId) return;
    const ref = doc(db,'servers',currentServerId,'channels',currentChannelId,'meta','typing');
    await setDoc(ref, {[currentUser.uid]:{name:currentUser.displayName||currentUser.email, ts:Date.now()}}, {merge:true});
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(async () => {
        await setDoc(ref, {[currentUser.uid]:{name:'',ts:0}}, {merge:true});
    }, 3000);
};

// ===================== MESAJ GÖNDER =====================
window.handleMsgKey = (e) => { if (e.key==='Enter') sendMessage(); if (e.key==='Escape') cancelReply(); };

window.sendMessage = async () => {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text||!currentServerId||!currentChannelId||!currentUser) return;
    input.value = '';
    clearTimeout(typingTimeout);
    try { await setDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'meta','typing'), {[currentUser.uid]:{name:'',ts:0}}, {merge:true}); } catch(e) {}
    const msgData = {
        text, name:currentUser.displayName||currentUser.email,
        photoURL:window._userPhotoURL||null, uid:currentUser.uid,
        type:'text', createdAt:serverTimestamp()
    };
    if (replyTo) { msgData.replyTo = replyTo; cancelReply(); }
    await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'), msgData);
};

window.addChannel = async () => {
    const name = document.getElementById('new-channel-name').value.trim().toLowerCase().replace(/\s+/g,'-');
    const err = document.getElementById('channel-error');
    if (!name) { err.textContent='Kanal adı girin.'; return; }
    await addDoc(collection(db,'servers',currentServerId,'channels'), {name, createdAt:serverTimestamp()});
    hideModal('modal-add-channel'); document.getElementById('new-channel-name').value='';
};

window.createServer = async () => {
    const name = document.getElementById('new-server-name').value.trim();
    const err = document.getElementById('create-error'); if (!name) { err.textContent='Sunucu adı girin.'; return; }
    const serverId = Math.random().toString(36).substring(2,14).toUpperCase();
    const inviteCode = Math.random().toString(36).substring(2,8).toUpperCase();
    await setDoc(doc(db,'servers',serverId), {
        name, inviteCode, ownerId:currentUser.uid,
        members:[{uid:currentUser.uid, name:currentUser.displayName||currentUser.email}],
        roles:{[currentUser.uid]:'owner'}
    });
    await setDoc(doc(db,'users',currentUser.uid), {servers:arrayUnion({id:serverId,name})}, {merge:true});
    hideModal('modal-create'); document.getElementById('new-server-name').value=''; loadUserServers();
};

window.joinServer = async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const err = document.getElementById('join-error'); if (!code) { err.textContent='Davet kodu girin.'; return; }
    err.textContent='Aranıyor...';
    const snap = await getDocs(query(collection(db,'servers'), where('inviteCode','==',code)));
    if (snap.empty) { err.style.color='#ed4245'; err.textContent='Geçersiz kod.'; return; }
    const serverDoc = snap.docs[0];
    await updateDoc(doc(db,'servers',serverDoc.id), {members:arrayUnion({uid:currentUser.uid, name:currentUser.displayName||currentUser.email})});
    await setDoc(doc(db,'users',currentUser.uid), {servers:arrayUnion({id:serverDoc.id, name:serverDoc.data().name})}, {merge:true});
    hideModal('modal-join'); document.getElementById('join-code').value=''; loadUserServers();
};

window.showInvite = async () => {
    if (!currentServerId) return;
    const snap = await getDoc(doc(db,'servers',currentServerId));
    document.getElementById('invite-code').textContent = snap.data()?.inviteCode||'???';
    showModal('modal-invite');
};

window.copyInvite = () => {
    navigator.clipboard.writeText(document.getElementById('invite-code').textContent);
    const btn = event.target; btn.textContent='✅ Kopyalandı!'; setTimeout(()=>btn.textContent='Kopyala',2000);
};

// ===================== DOSYA/RESİM =====================
window.openFilePicker = () => document.getElementById('file-input').click();
window.onFileSelected = async (input) => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 5*1024*1024) { alert('Dosya 5MB\'dan küçük olmalı.'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        const isImage = file.type.startsWith('image/');
        const msgData = {
            name:currentUser.displayName||currentUser.email, photoURL:window._userPhotoURL||null,
            uid:currentUser.uid, type:isImage?'image':'file',
            fileData:base64, fileName:file.name, fileSize:(file.size/1024).toFixed(1)+' KB',
            text:'', createdAt:serverTimestamp()
        };
        if (replyTo) { msgData.replyTo=replyTo; cancelReply(); }
        await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'), msgData);
    };
    reader.readAsDataURL(file); input.value='';
};

window.openImage = (src) => {
    const overlay = document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    const img = document.createElement('img'); img.src=src; img.style.cssText='max-width:95vw;max-height:95vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
    overlay.appendChild(img); overlay.onclick=()=>document.body.removeChild(overlay); document.body.appendChild(overlay);
};

function playNotif() {
    try { const ctx=new AudioContext(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=880; g.gain.setValueAtTime(0.08,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.25); o.start(); o.stop(ctx.currentTime+0.25); } catch(e) {}
}

// ===================== SES KAYDI =====================
window.startVoiceRecord = async (e) => {
    if (e) e.preventDefault();
    if (mediaRecorder && mediaRecorder.state==='recording') return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        audioChunks=[]; isCancelled=false;
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if(e.data.size>0) audioChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t=>t.stop());
            clearInterval(voiceTimerInterval);
            document.getElementById('voice-recording-indicator').style.display='none';
            document.getElementById('voice-btn').classList.remove('recording');
            if (isCancelled||audioChunks.length===0) return;
            const blob = new Blob(audioChunks, {type:'audio/webm'});
            if (blob.size>5*1024*1024) { alert('Ses kaydı çok uzun.'); return; }
            const reader = new FileReader();
            reader.onload = async (ev) => {
                await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'), {
                    name:currentUser.displayName||currentUser.email, photoURL:window._userPhotoURL||null,
                    uid:currentUser.uid, type:'audio', fileData:ev.target.result,
                    duration:formatDuration(voiceSeconds), text:'', createdAt:serverTimestamp()
                });
            };
            reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        voiceSeconds=0;
        document.getElementById('voice-timer').textContent='0:00';
        document.getElementById('voice-recording-indicator').style.display='flex';
        document.getElementById('voice-btn').classList.add('recording');
        voiceTimerInterval = setInterval(()=>{ voiceSeconds++; document.getElementById('voice-timer').textContent=formatDuration(voiceSeconds); if(voiceSeconds>=120) window.stopVoiceRecord(); },1000);
    } catch(e) { alert('Mikrofon erişimi reddedildi.'); }
};

window.stopVoiceRecord = (e) => {
    if (e) e.preventDefault();
    if (mediaRecorder && mediaRecorder.state==='recording') { if(voiceSeconds<1) isCancelled=true; mediaRecorder.stop(); }
};

window.cancelVoiceRecord = () => {
    isCancelled=true;
    if (mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop();
    clearInterval(voiceTimerInterval);
    document.getElementById('voice-recording-indicator').style.display='none';
    document.getElementById('voice-btn').classList.remove('recording');
};

function formatDuration(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }

function renderAudioMessage(fileData, duration) {
    const wrap = document.createElement('div'); wrap.className='msg-audio';
    const audio = new Audio(fileData);
    let isPlaying=false, progInterval=null;
    const playBtn = document.createElement('button'); playBtn.className='audio-play-btn'; playBtn.textContent='▶';
    const canvas = document.createElement('canvas'); canvas.className='audio-waveform'; canvas.width=120; canvas.height=28;
    const ctx2 = canvas.getContext('2d'); ctx2.fillStyle='rgba(88,101,242,0.7)';
    for (let i=0;i<24;i++){const h=4+Math.random()*20,x=i*5,y=(28-h)/2;ctx2.beginPath();try{ctx2.roundRect(x,y,3,h,2);}catch(e){ctx2.rect(x,y,3,h);}ctx2.fill();}
    const dur = document.createElement('span'); dur.className='audio-duration'; dur.textContent=duration||'0:00';
    playBtn.onclick = () => {
        if (isPlaying){audio.pause();playBtn.textContent='▶';isPlaying=false;clearInterval(progInterval);}
        else{audio.play();playBtn.textContent='⏸';isPlaying=true;progInterval=setInterval(()=>{if(!audio.ended){const r=Math.ceil(audio.duration-audio.currentTime);dur.textContent=formatDuration(isNaN(r)?0:r);}},500);}
    };
    audio.onended=()=>{playBtn.textContent='▶';isPlaying=false;clearInterval(progInterval);dur.textContent=duration||'0:00';};
    wrap.appendChild(playBtn); wrap.appendChild(canvas); wrap.appendChild(dur);
    return wrap;
}

// ===================== AYARLAR =====================
function loadSettingsModal() {
    if (!currentUser) return;
    document.getElementById('settings-displayname').value = currentUser.displayName||'';
    document.getElementById('settings-name-display').textContent = currentUser.displayName||'';
    setAvatarEl(document.getElementById('settings-avatar'), window._userPhotoURL, currentUser.displayName);
    const theme = localStorage.getItem('theme')||'dark';
    document.getElementById('theme-dark').classList.toggle('active', theme==='dark');
    document.getElementById('theme-light').classList.toggle('active', theme==='light');
    document.getElementById('lang-tr').classList.toggle('active', (localStorage.getItem('lang')||'tr')==='tr');
    document.getElementById('lang-en').classList.toggle('active', localStorage.getItem('lang')==='en');
    document.getElementById('notif-sound').checked = localStorage.getItem('notifSound')!=='false';
    const notifBrowser = document.getElementById('notif-browser');
    if (notifBrowser) notifBrowser.checked = localStorage.getItem('browserNotif')==='true' && Notification.permission==='granted';
    const st = localStorage.getItem('userStatus')||'online';
    document.querySelectorAll('.status-option').forEach(el=>el.classList.toggle('active',el.dataset.status===st));
}

window.saveDisplayName = async () => {
    const name=document.getElementById('settings-displayname').value.trim(); const msg=document.getElementById('name-msg');
    if (!name){msg.style.color='#ed4245';msg.textContent='Ad boş olamaz.';return;}
    try{await updateProfile(currentUser,{displayName:name});await setDoc(doc(db,'users',currentUser.uid),{displayName:name},{merge:true});document.getElementById('my-name').textContent=name;document.getElementById('settings-name-display').textContent=name;msg.style.color='#23a55a';msg.textContent='✅ Ad güncellendi!';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}
};
window.changePassword = async () => {
    const pw=document.getElementById('settings-newpass').value; const msg=document.getElementById('pass-msg');
    if (pw.length<6){msg.style.color='#ed4245';msg.textContent='En az 6 karakter.';return;}
    try{await updatePassword(currentUser,pw);msg.style.color='#23a55a';msg.textContent='✅ Şifre güncellendi!';document.getElementById('settings-newpass').value='';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent=e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message;}
};
window.saveSetting = (key,val) => localStorage.setItem(key,val);
window.setTheme = (theme) => { localStorage.setItem('theme',theme); applyTheme(theme); document.getElementById('theme-dark').classList.toggle('active',theme==='dark'); document.getElementById('theme-light').classList.toggle('active',theme==='light'); };
function applyTheme(theme) {
    const r=document.documentElement.style;
    if(theme==='light'){r.setProperty('--dark','#f2f3f5');r.setProperty('--sidebar','#e3e5e8');r.setProperty('--black','#ffffff');r.setProperty('--input','#d9dadc');r.setProperty('--text','#2e3338');r.setProperty('--muted','#5c6370');}
    else{r.setProperty('--dark','#1a1b1e');r.setProperty('--sidebar','#212226');r.setProperty('--black','#111214');r.setProperty('--input','#2e3035');r.setProperty('--text','#dcddde');r.setProperty('--muted','#8e9297');}
}
window.setLang = (lang) => { localStorage.setItem('lang',lang); document.getElementById('lang-tr').classList.toggle('active',lang==='tr'); document.getElementById('lang-en').classList.toggle('active',lang==='en'); const msg=document.getElementById('settings-msg'); msg.textContent=lang==='tr'?'✅ Dil: Türkçe':'✅ Language: English'; setTimeout(()=>msg.textContent='',2500); };
window.leaveServer = async () => {
    if(!currentServerId){alert('Önce bir sunucu seç.');return;} if(!confirm('Sunucudan ayrılmak istediğine emin misin?'))return;
    try{const sRef=doc(db,'servers',currentServerId);const sSnap=await getDoc(sRef);const members=(sSnap.data()?.members||[]).filter(m=>m.uid!==currentUser.uid);await updateDoc(sRef,{members});const uRef=doc(db,'users',currentUser.uid);const uSnap=await getDoc(uRef);const servers=(uSnap.data()?.servers||[]).filter(s=>s.id!==currentServerId);await setDoc(uRef,{servers},{merge:true});hideModal('modal-settings');currentServerId=null;currentChannelId=null;loadUserServers();}catch(e){alert('Hata: '+e.message);}
};
window.deleteAccount = async () => {
    if(!confirm('Hesabını silmek istediğine emin misin?'))return; if(!confirm('Son kez onaylıyor musun?'))return;
    try{await deleteDoc(doc(db,'users',currentUser.uid));await deleteUser(currentUser);}catch(e){alert(e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message);}
};

// ===================== ARKADAŞ SİSTEMİ =====================
async function showProfile(uid, name, photoURL, status) {
    setAvatarEl(document.getElementById('profile-av'), photoURL, name);
    document.getElementById('profile-username').textContent = name;
    document.getElementById('profile-tag').textContent = '@ '+uid.substring(0,6).toLowerCase();
    const statusLabels={online:'🟢 Çevrimiçi',idle:'🌙 Boşta',dnd:'⛔ Rahatsız Etme',offline:'⚫ Görünmez'};
    document.getElementById('profile-status-text').textContent = statusLabels[status]||'⚫ Çevrimdışı';
    // Rol rozeti
    const roleBadge = document.getElementById('profile-role-badge'); roleBadge.innerHTML='';
    if (currentServerData) {
        const role=(currentServerData.roles||{})[uid]||'member';
        if(role!=='member'){const rb=document.createElement('span');rb.className='role-badge '+(role==='owner'?'role-owner':'role-mod');rb.textContent=role==='owner'?'👑 Sunucu Sahibi':'🛡️ Moderatör';rb.style.display='inline-block';rb.style.marginBottom='10px';roleBadge.appendChild(rb);}
    }
    const actions = document.getElementById('profile-actions'); actions.innerHTML='';
    if (uid===currentUser.uid) {
        actions.innerHTML='<button class="p-btn gray" style="width:100%">Senin Profilin</button>';
    } else {
        const myDoc=await getDoc(doc(db,'users',currentUser.uid));
        const friends=myDoc.data()?.friends||[], sent=myDoc.data()?.sentRequests||[];
        if(friends.includes(uid)){const r=document.createElement('button');r.className='p-btn red';r.textContent='✕ Arkadaşlıktan Çıkar';r.style.width='100%';r.onclick=()=>removeFriend(uid,name);actions.appendChild(r);}
        else if(sent.includes(uid)){actions.innerHTML='<button class="p-btn gray" style="width:100%">⏳ İstek Gönderildi</button>';}
        else{const a=document.createElement('button');a.className='p-btn blue';a.textContent='➕ Arkadaş Ekle';a.style.width='100%';a.onclick=()=>sendFriendRequestToUid(uid,name);actions.appendChild(a);}
        // Rol yönetimi (sadece owner görebilir)
        if (getMyRole()==='owner' && uid!==currentUser.uid) {
            const roleBtn=document.createElement('button');roleBtn.className='p-btn gray';roleBtn.textContent='👑 Rol Değiştir';roleBtn.style.cssText='width:100%;margin-top:6px';
            roleBtn.onclick=()=>openRoleModal(uid,name); actions.appendChild(roleBtn);
        }
    }
    showModal('modal-profile');
}

window.sendFriendRequest = async () => {
    const searchName=document.getElementById('friend-search-input').value.trim(); const msg=document.getElementById('friend-msg');
    if(!searchName){msg.style.color='#ed4245';msg.textContent='Kullanıcı adı girin.';return;}
    msg.style.color='#949ba4';msg.textContent='Aranıyor...';
    const snap=await getDocs(query(collection(db,'users'),where('displayName','==',searchName)));
    if(snap.empty){msg.style.color='#ed4245';msg.textContent='Kullanıcı bulunamadı.';return;}
    const td=snap.docs[0]; if(td.id===currentUser.uid){msg.style.color='#ed4245';msg.textContent='Kendine istek gönderemezsin.';return;}
    await sendFriendRequestToUid(td.id,td.data().displayName); document.getElementById('friend-search-input').value='';
};

async function sendFriendRequestToUid(targetUid, targetName) {
    const msg=document.getElementById('friend-msg');
    try{await setDoc(doc(db,'users',targetUid),{friendRequests:arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})},{merge:true});await setDoc(doc(db,'users',currentUser.uid),{sentRequests:arrayUnion(targetUid)},{merge:true});if(msg){msg.style.color='#23a55a';msg.textContent='✅ İstek gönderildi!';setTimeout(()=>{if(msg)msg.textContent='';},2500);}hideModal('modal-profile');}catch(e){if(msg){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}}
}

async function removeFriend(targetUid, targetName) {
    if(!confirm(`${targetName} arkadaşlıktan çıkarılsın mı?`))return;
    const myRef=doc(db,'users',currentUser.uid),theirRef=doc(db,'users',targetUid);
    const mySnap=await getDoc(myRef),theirSnap=await getDoc(theirRef);
    await setDoc(myRef,{friends:(mySnap.data()?.friends||[]).filter(f=>f!==targetUid)},{merge:true});
    await setDoc(theirRef,{friends:(theirSnap.data()?.friends||[]).filter(f=>f!==currentUser.uid)},{merge:true});
    hideModal('modal-profile'); loadFriends();
}

window.showFriendTab=(tab)=>{document.getElementById('ftab-all').classList.toggle('active',tab==='all');document.getElementById('ftab-pending').classList.toggle('active',tab==='pending');loadFriends(tab);};

async function loadFriends(tab='all') {
    const list=document.getElementById('friends-list');list.innerHTML='<div class="empty-state"><div class="e-icon">⏳</div>Yükleniyor...</div>';
    const uDoc=await getDoc(doc(db,'users',currentUser.uid));const data=uDoc.data()||{};
    if(tab==='all'){
        const friends=data.friends||[];
        if(!friends.length){list.innerHTML='<div class="empty-state"><div class="e-icon">👥</div>Henüz arkadaşın yok.</div>';return;}
        list.innerHTML='';
        for(const fUid of friends){try{const fDoc=await getDoc(doc(db,'users',fUid));const fData=fDoc.data()||{};list.appendChild(createFriendItem(fUid,fData.displayName||'Kullanıcı',fData.photoURL,fData.status,'friend'));}catch(e){}}
    } else {
        const requests=data.friendRequests||[];
        if(!requests.length){list.innerHTML='<div class="empty-state"><div class="e-icon">📭</div>Bekleyen istek yok.</div>';return;}
        list.innerHTML='';
        for(const req of requests)list.appendChild(createFriendItem(req.uid,req.name,null,null,'pending'));
    }
}

function createFriendItem(uid,name,photoURL,status,type){
    const div=document.createElement('div');div.className='friend-item';
    const av=document.createElement('div');av.className='friend-av';setAvatarEl(av,photoURL,name);
    const info=document.createElement('div');info.className='friend-info';
    const sl={online:'🟢 Çevrimiçi',idle:'🌙 Boşta',dnd:'⛔ Rahatsız Etme',offline:'⚫ Çevrimdışı'};
    info.innerHTML=`<div class="friend-name">${name}</div><div class="friend-status">${type==='pending'?'📨 Arkadaşlık isteği':(sl[status]||'⚫ Çevrimdışı')}</div>`;
    div.appendChild(av);div.appendChild(info);
    const btns=document.createElement('div');btns.className='friend-btns';
    if(type==='pending'){const a=document.createElement('button');a.className='fi-btn accept';a.textContent='✓';a.onclick=()=>acceptFriendRequest(uid,name);const r=document.createElement('button');r.className='fi-btn reject';r.textContent='✕';r.onclick=()=>rejectFriendRequest(uid);btns.appendChild(a);btns.appendChild(r);}
    else{const r=document.createElement('button');r.className='fi-btn remove';r.textContent='✕';r.onclick=()=>removeFriend(uid,name);btns.appendChild(r);}
    div.appendChild(btns);div.onclick=e=>{if(!e.target.closest('.friend-btns'))showProfile(uid,name,photoURL,status);};return div;
}

async function acceptFriendRequest(fromUid,fromName){
    const myRef=doc(db,'users',currentUser.uid);const mySnap=await getDoc(myRef);
    const requests=(mySnap.data()?.friendRequests||[]).filter(r=>r.uid!==fromUid);
    await setDoc(myRef,{friends:arrayUnion(fromUid),friendRequests:requests},{merge:true});
    await setDoc(doc(db,'users',fromUid),{friends:arrayUnion(currentUser.uid)},{merge:true});
    loadFriends('pending');updateFriendBadge();
}

async function rejectFriendRequest(fromUid){
    const myRef=doc(db,'users',currentUser.uid);const mySnap=await getDoc(myRef);
    await setDoc(myRef,{friendRequests:(mySnap.data()?.friendRequests||[]).filter(r=>r.uid!==fromUid)},{merge:true});
    loadFriends('pending');updateFriendBadge();
}

async function updateFriendBadge(){
    if(!currentUser)return;
    try{const uDoc=await getDoc(doc(db,'users',currentUser.uid));const count=(uDoc.data()?.friendRequests||[]).length;['req-badge','friends-badge'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent=count;el.style.display=count>0?'inline':'none';}});}catch(e){}
}
setInterval(updateFriendBadge,30000);

// ===================== ARAMA =====================
window.startCall = async (type) => {
    if(!currentServerId){alert('Önce bir sunucu seç!');return;}
    try{localStream=await navigator.mediaDevices.getUserMedia({video:type==='video',audio:true});}catch(e){alert('Kamera/mikrofon erişimi reddedildi.');return;}
    pc=new RTCPeerConnection(iceServers);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    document.getElementById('local-video').srcObject=localStream;if(type!=='video')document.getElementById('local-video').style.display='none';
    pc.ontrack=e=>{document.getElementById('remote-video').srcObject=e.streams[0];};
    const callDoc=doc(collection(db,'calls'));currentCallId=callDoc.id;
    pc.onicecandidate=async e=>{if(e.candidate)await addDoc(collection(db,'calls',currentCallId,'offerCandidates'),e.candidate.toJSON());};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await setDoc(callDoc,{offer:{type:offer.type,sdp:offer.sdp},callType:type,callerName:currentUser.displayName||currentUser.email,callerUid:currentUser.uid,serverId:currentServerId,status:'ringing',createdAt:serverTimestamp()});
    document.getElementById('call-screen').style.display='flex';document.getElementById('call-status').textContent='Bağlanıyor...';
    document.getElementById('remote-video').style.display=type==='video'?'block':'none';
    onSnapshot(callDoc,async snap=>{const data=snap.data();if(!data)return;if(data.answer&&!pc.currentRemoteDescription){await pc.setRemoteDescription(new RTCSessionDescription(data.answer));document.getElementById('call-status').textContent='Bağlandı ✅';}if(data.status==='rejected'||data.status==='ended')endCall();});
    onSnapshot(collection(db,'calls',currentCallId,'answerCandidates'),snap=>{snap.docChanges().forEach(c=>{if(c.type==='added')pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));});});
};

function listenForCalls(){
    onSnapshot(collection(db,'calls'),snap=>{snap.docChanges().forEach(async change=>{if(change.type==='added'){const data=change.doc.data();if(data.status==='ringing'&&data.callerUid!==currentUser?.uid&&data.serverId===currentServerId){currentCallId=change.doc.id;document.getElementById('caller-avatar').textContent=(data.callerName||'A')[0].toUpperCase();document.getElementById('caller-name').textContent=data.callerName||'Biri';document.getElementById('caller-type').textContent=data.callType==='video'?'📹 Görüntülü Arama':'📞 Sesli Arama';document.getElementById('incoming-call').style.display='flex';}}});});
}

window.acceptCall = async () => {
    document.getElementById('incoming-call').style.display='none';
    const callDoc=doc(db,'calls',currentCallId);const callData=(await getDoc(callDoc)).data();
    try{localStream=await navigator.mediaDevices.getUserMedia({video:callData.callType==='video',audio:true});}catch(e){alert('Erişim reddedildi.');return;}
    pc=new RTCPeerConnection(iceServers);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    document.getElementById('local-video').srcObject=localStream;
    pc.ontrack=e=>{document.getElementById('remote-video').srcObject=e.streams[0];};
    pc.onicecandidate=async e=>{if(e.candidate)await addDoc(collection(db,'calls',currentCallId,'answerCandidates'),e.candidate.toJSON());};
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await updateDoc(callDoc,{answer:{type:answer.type,sdp:answer.sdp},status:'accepted'});
    onSnapshot(collection(db,'calls',currentCallId,'offerCandidates'),snap=>{snap.docChanges().forEach(c=>{if(c.type==='added')pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));});});
    document.getElementById('call-screen').style.display='flex';document.getElementById('call-status').textContent='Bağlandı ✅';
    document.getElementById('remote-video').style.display=callData.callType==='video'?'block':'none';
};

window.rejectCall=async()=>{document.getElementById('incoming-call').style.display='none';if(currentCallId){await updateDoc(doc(db,'calls',currentCallId),{status:'rejected'});currentCallId=null;}};

window.endCall=async()=>{
    if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
    if(pc){pc.close();pc=null;}if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
    if(currentCallId){try{await updateDoc(doc(db,'calls',currentCallId),{status:'ended'});}catch(e){}currentCallId=null;}
    document.getElementById('call-screen').style.display='none';
    document.getElementById('remote-video').srcObject=null;document.getElementById('local-video').srcObject=null;document.getElementById('local-video').style.display='block';
    const btn=document.getElementById('screen-btn');if(btn){btn.textContent='🖥️';btn.classList.remove('active');}
};

window.toggleMute=()=>{if(!localStream)return;const a=localStream.getAudioTracks()[0];if(a){a.enabled=!a.enabled;document.getElementById('mute-btn').textContent=a.enabled?'🎤':'🔇';}};
window.toggleCam=()=>{if(!localStream)return;const v=localStream.getVideoTracks()[0];if(v){v.enabled=!v.enabled;document.getElementById('cam-btn').textContent=v.enabled?'📹':'🚫';}};

window.toggleScreen=async()=>{
    const btn=document.getElementById('screen-btn');
    if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;btn.textContent='🖥️';btn.classList.remove('active');if(pc&&localStream){const ct=localStream.getVideoTracks()[0];if(ct){const s=pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(ct);}}document.getElementById('local-video').srcObject=localStream;}
    else{try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:true});btn.textContent='⏹️';btn.classList.add('active');const st=screenStream.getVideoTracks()[0];if(pc){const s=pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(st);}document.getElementById('local-video').srcObject=screenStream;st.onended=()=>window.toggleScreen();}catch(e){alert('Ekran paylaşımı başlatılamadı.');}}
};
