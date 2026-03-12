import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile, updatePassword, deleteUser, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, query, orderBy, limit as fsLimit, onSnapshot, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// State
let currentUser = null, currentServerId = null, currentChannelId = null, currentServerData = null;
let msgUnsub = null, memberUnsub = null, channelUnsub = null, typingUnsub = null;
let currentCallId = null, pc = null, localStream = null, screenStream = null;
let wakeLock = null, keepAliveCtx = null;
let isAdmin = false, allAdminUsers = [];
let replyTo = null, contextMsgData = null, roleTargetUid = null;
let typingTimeout = null, allMessages = [];
let mediaRecorder = null, audioChunks = [], voiceTimerInterval = null, voiceSeconds = 0, isCancelled = false;
let currentDMPartner = null, dmMsgUnsub = null, dmTypingUnsub = null, dmTypingTimeout = null;
let allDiscoverServers = [], selectedFrame = localStorage.getItem('profileFrame') || 'none';

const ADMIN_KEY_HASH = '548cd183a18c7924882b8b3af52b5f87fd9706e31a66922acab1b22ac40ee508';
const iceServers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302'] }] };
const FRAMES = [
    { id:'none',    label:'Yok',  style:'' },
    { id:'blue',    label:'💙',   style:'0 0 0 3px #5865f2' },
    { id:'gold',    label:'💛',   style:'0 0 0 3px #faa61a' },
    { id:'red',     label:'❤️',   style:'0 0 0 3px #ed4245' },
    { id:'green',   label:'💚',   style:'0 0 0 3px #23a55a' },
    { id:'purple',  label:'💜',   style:'0 0 0 3px #9b59b6' },
    { id:'rainbow', label:'🌈',   style:'', extra:'border:3px solid transparent;background:linear-gradient(var(--dark),var(--dark)) padding-box,linear-gradient(135deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f) border-box' },
    { id:'nova',    label:'✨',   style:'0 0 0 3px #fff, 0 0 12px 2px rgba(88,101,242,0.8)' },
];
const BADGES = [
    { id:'beginner', min:1,    max:49,   label:'🌱 Acemi',   cls:'badge-beginner' },
    { id:'active',   min:50,   max:249,  label:'💬 Aktif',   cls:'badge-active'   },
    { id:'veteran',  min:250,  max:999,  label:'⭐ Veteran', cls:'badge-veteran'  },
    { id:'legend',   min:1000, max:4999, label:'🔥 Efsane',  cls:'badge-legend'   },
    { id:'nova',     min:5000, max:Infinity, label:'✨ Nova', cls:'badge-nova'    },
];

applyTheme(localStorage.getItem('theme') || 'dark');

// ── YARDIMCILAR ──────────────────────────────────────────
async function sha256(msg) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function getDMId(a, b) { return [a,b].sort().join('_'); }
function getBadge(n) { return BADGES.find(b=>n>=b.min&&n<=b.max)||null; }
function getStatusColor(s) { return {online:'#23a55a',idle:'#faa61a',dnd:'#ed4245',offline:'#747f8d'}[s]||'#747f8d'; }
function getMyRole() { if(!currentServerData||!currentUser) return 'member'; return (currentServerData.roles||{})[currentUser.uid]||'member'; }
function canDeleteMsg(uid) { const r=getMyRole(); return r==='owner'||r==='mod'||uid===currentUser?.uid; }
function playNotif() { try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.setValueAtTime(0.08,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.25);o.start();o.stop(c.currentTime+0.25);}catch(e){} }
function formatDuration(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function setAvatarEl(el, photoURL, name) {
    if(!el) return;
    if(photoURL){el.style.backgroundImage=`url(${photoURL})`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent='';}
    else{el.style.backgroundImage='';el.textContent=(name||'A')[0].toUpperCase();}
}
function makeAvatar(photoURL, name, cls) { const d=document.createElement('div');d.className=cls;setAvatarEl(d,photoURL,name);return d; }
function applyFrameToEl(el, frameId) {
    const f=FRAMES.find(x=>x.id===frameId)||FRAMES[0];
    el.style.boxShadow=''; el.style.border='';
    if(f.extra){f.extra.split(';').forEach(s=>{const[k,...v]=s.split(':');if(k)el.style[k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v.join(':').trim();});}
    else if(f.style){el.style.boxShadow=f.style;}
}
function applyTheme(theme) {
    const r=document.documentElement.style;
    if(theme==='light'){r.setProperty('--dark','#f2f3f5');r.setProperty('--sidebar','#e3e5e8');r.setProperty('--black','#ffffff');r.setProperty('--input','#d9dadc');r.setProperty('--text','#2e3338');r.setProperty('--muted','#5c6370');}
    else{r.setProperty('--dark','#1a1b1e');r.setProperty('--sidebar','#212226');r.setProperty('--black','#111214');r.setProperty('--input','#2e3035');r.setProperty('--text','#dcddde');r.setProperty('--muted','#8e9297');}
}
function showBrowserNotif(name, text) {
    if(localStorage.getItem('browserNotif')!=='true'||Notification.permission!=='granted') return;
    if(document.hasFocus()) return;
    try{new Notification('NovaChat — '+name,{body:text,icon:'icon-192.png'});}catch(e){}
}
function updateStatusDot(status) { const d=document.getElementById('status-dot');if(d)d.style.background=getStatusColor(status); }

// ── AUTH ─────────────────────────────────────────────────
window.showTab = (tab) => {
    ['login','register','admin'].forEach(t=>{
        document.getElementById('form-'+t).style.display=t===tab?'block':'none';
        document.getElementById('tab-'+t).classList.toggle('active',t===tab);
    });
};
window.doLogin = async () => {
    const email=document.getElementById('login-email').value.trim(), pw=document.getElementById('login-password').value;
    const err=document.getElementById('login-error');
    if(!email||!pw){err.style.color='#ed4245';err.textContent='E-posta ve şifre girin.';return;}
    err.style.color='#949ba4'; err.textContent='Giriş yapılıyor...';
    try {
        await signInWithEmailAndPassword(auth,email,pw);
        // onAuthStateChanged devralır
    } catch(e){
        err.style.color='#ed4245';
        if(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found') err.textContent='E-posta veya şifre hatalı.';
        else if(e.code==='auth/invalid-email') err.textContent='Geçersiz e-posta.';
        else if(e.code==='auth/too-many-requests') err.textContent='Çok fazla deneme. Biraz bekle.';
        else err.textContent='Hata: '+e.message;
    }
};
window.doRegister = async () => {
    const name=document.getElementById('reg-name').value.trim(), email=document.getElementById('reg-email').value.trim(), pw=document.getElementById('reg-password').value;
    const err=document.getElementById('reg-error');
    if(!name||!email||!pw){err.style.color='#ed4245';err.textContent='Tüm alanları doldurun.';return;}
    if(pw.length<6){err.style.color='#ed4245';err.textContent='Şifre en az 6 karakter.';return;}
    err.style.color='#949ba4';err.textContent='Kayıt yapılıyor...';
    try {
        const r=await createUserWithEmailAndPassword(auth,email,pw);
        await updateProfile(r.user,{displayName:name});
        await setDoc(doc(db,'users',r.user.uid),{
            displayName:name, email, photoURL:null, status:'online',
            banned:false, msgCount:0, servers:[], friends:[], createdAt:serverTimestamp()
        });
        err.style.color='#23a55a';err.textContent='✅ Kayıt başarılı!';
        // onAuthStateChanged otomatik devralır
    } catch(e){err.style.color='#ed4245';err.textContent=e.code==='auth/email-already-in-use'?'Bu e-posta zaten kayıtlı.':e.code==='auth/invalid-email'?'Geçersiz e-posta.':'Hata: '+e.message;}
};
window.doLogout = async () => {
    if(currentUser)try{await setDoc(doc(db,'users',currentUser.uid),{status:'offline'},{merge:true});}catch(e){}
    isAdmin=false; signOut(auth);
};

// ── ADMİN ────────────────────────────────────────────────
window.doAdminLogin = async () => {
    const key=document.getElementById('admin-key-input').value.trim(), err=document.getElementById('admin-error');
    if(!key){err.style.color='#ed4245';err.textContent='Anahtar girin.';return;}
    err.style.color='#949ba4';err.textContent='Doğrulanıyor...';
    if(await sha256(key)!==ADMIN_KEY_HASH){err.style.color='#ed4245';err.textContent='❌ Geçersiz anahtar.';return;}
    isAdmin=true;
    try{await signInAnonymously(auth);}catch(e){}
    document.getElementById('auth-container').style.display='none';
    document.getElementById('admin-panel').style.display='flex';
    loadAdminPanel();
};
window.adminLogout = ()=>{isAdmin=false;signOut(auth);document.getElementById('admin-panel').style.display='none';document.getElementById('auth-container').style.display='flex';document.getElementById('admin-key-input').value='';showTab('login');};
async function loadAdminPanel() {
    ['stat-users','stat-servers','stat-banned'].forEach(id=>document.getElementById(id).textContent='...');
    document.getElementById('admin-users-list').innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Yükleniyor...</div>';
    try {
        const [usersSnap,serversSnap]=await Promise.all([getDocs(collection(db,'users')),getDocs(collection(db,'servers'))]);
        allAdminUsers=[]; let bannedCount=0;
        usersSnap.forEach(d=>{const data=d.data();allAdminUsers.push({uid:d.id,...data});if(data.banned)bannedCount++;});
        document.getElementById('stat-users').textContent=usersSnap.size;
        document.getElementById('stat-servers').textContent=serversSnap.size;
        document.getElementById('stat-banned').textContent=bannedCount;
        renderAdminUsers(allAdminUsers);
    } catch(e){document.getElementById('admin-users-list').innerHTML='<div style="color:#ed4245;text-align:center;padding:20px">⚠️ Erişim hatası. Firebase\'de Anonymous Auth\'u etkinleştir.</div>';}
}
function renderAdminUsers(users) {
    const list=document.getElementById('admin-users-list');list.innerHTML='';
    if(!users.length){list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Kullanıcı bulunamadı</div>';return;}
    users.forEach(u=>{
        const div=document.createElement('div');div.className='admin-user-item'+(u.banned?' banned':'');
        div.innerHTML=`<div class="admin-user-av">${(u.displayName||'A')[0].toUpperCase()}</div>
        <div class="admin-user-info"><div class="admin-user-name">${u.displayName||'İsimsiz'}${u.banned?'<span class="admin-user-badge badge-banned">🚫 BANLI</span>':''}</div><div class="admin-user-email">${u.email||u.uid}</div></div>
        <div class="admin-user-btns">${u.banned?`<button class="ban-btn do-unban" onclick="adminUnban('${u.uid}','${u.displayName||''}')">✅ Ban Kaldır</button>`:`<button class="ban-btn do-ban" onclick="adminBan('${u.uid}','${u.displayName||''}')">🚫 Banla</button>`}</div>`;
        list.appendChild(div);
    });
}
window.filterAdminUsers=()=>{const q=document.getElementById('admin-user-search').value.toLowerCase();renderAdminUsers(allAdminUsers.filter(u=>(u.displayName||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)));};
window.adminBan=async(uid,name)=>{if(!confirm(`"${name}" banlanacak. Emin misin?`))return;await setDoc(doc(db,'users',uid),{banned:true},{merge:true});const u=allAdminUsers.find(x=>x.uid===uid);if(u)u.banned=true;document.getElementById('stat-banned').textContent=allAdminUsers.filter(x=>x.banned).length;renderAdminUsers(allAdminUsers);};
window.adminUnban=async(uid,name)=>{if(!confirm(`"${name}" banı kaldırılacak. Emin misin?`))return;await setDoc(doc(db,'users',uid),{banned:false},{merge:true});const u=allAdminUsers.find(x=>x.uid===uid);if(u)u.banned=false;document.getElementById('stat-banned').textContent=allAdminUsers.filter(x=>x.banned).length;renderAdminUsers(allAdminUsers);};

// ── MODAL ────────────────────────────────────────────────
window.showModal = (id) => {
    document.getElementById(id).style.display='flex';
    if(id==='modal-settings')loadSettingsModal();
    if(id==='modal-friends'){loadFriends('all');updateFriendBadge();}
    if(id==='modal-frame')loadFrameModal();
    if(id==='modal-discover')loadDiscover();
};
window.hideModal=(id)=>document.getElementById(id).style.display='none';
window.showServerScreen=()=>{document.getElementById('server-screen').style.display='flex';document.getElementById('main-layout').style.display='none';};

// ── AVATAR ───────────────────────────────────────────────
window.openAvatarPicker=()=>document.getElementById('avatar-file-input').click();
window.onAvatarSelected=async(input)=>{
    const file=input.files[0];if(!file)return;
    if(file.size>700*1024){alert('700KB\'dan küçük olmalı.');return;}
    const reader=new FileReader();
    reader.onload=async(e)=>{const b64=e.target.result;window._userPhotoURL=b64;await setDoc(doc(db,'users',currentUser.uid),{photoURL:b64},{merge:true});setAvatarEl(document.getElementById('my-avatar'),b64,currentUser.displayName);setAvatarEl(document.getElementById('settings-avatar'),b64,currentUser.displayName);alert('Fotoğraf güncellendi! ✅');};
    reader.readAsDataURL(file);
};

// ── OTURUM ───────────────────────────────────────────────
onAuthStateChanged(auth, async(user)=>{
    if(user){
        if(isAdmin||user.isAnonymous) return; // Admin/anonim atla
        currentUser=user;
        document.getElementById('auth-container').style.display='none';
        const uDoc=await getDoc(doc(db,'users',user.uid));
        if(uDoc.exists()&&uDoc.data().banned){await signOut(auth);document.getElementById('auth-container').style.display='flex';document.getElementById('login-error').style.color='#ed4245';document.getElementById('login-error').textContent='🚫 Hesabın banlandı.';return;}
        const photoURL=uDoc.exists()?uDoc.data().photoURL:null;
        window._userPhotoURL=photoURL;
        selectedFrame=uDoc.data()?.profileFrame||localStorage.getItem('profileFrame')||'none';
        setAvatarEl(document.getElementById('my-avatar'),photoURL,user.displayName);
        applyFrameToEl(document.getElementById('my-avatar'),selectedFrame);
        document.getElementById('my-name').textContent=user.displayName||user.email;
        await setDoc(doc(db,'users',user.uid),{status:localStorage.getItem('userStatus')||'online'},{merge:true});
        updateStatusDot(localStorage.getItem('userStatus')||'online');
        const nb=document.getElementById('notif-browser');if(nb)nb.checked=localStorage.getItem('browserNotif')==='true'&&Notification.permission==='granted';
        try{loadUserServers();}catch(e){console.error('loadUserServers:',e);}
        listenForCalls();updateFriendBadge();updateDMBadge();
    } else {
        if(isAdmin)return;
        currentUser=null;
        document.getElementById('auth-container').style.display='flex';
        document.getElementById('main-layout').style.display='none';
        document.getElementById('server-screen').style.display='none';
    }
});

// ── DURUM ────────────────────────────────────────────────
window.setStatus=async(s)=>{if(!currentUser)return;localStorage.setItem('userStatus',s);await setDoc(doc(db,'users',currentUser.uid),{status:s},{merge:true});updateStatusDot(s);document.querySelectorAll('.status-option').forEach(el=>el.classList.toggle('active',el.dataset.status===s));};

// ── BİLDİRİM ─────────────────────────────────────────────
window.toggleBrowserNotif=async(checked)=>{
    if(checked){const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem('browserNotif','true');}else{localStorage.setItem('browserNotif','false');document.getElementById('notif-browser').checked=false;alert('Bildirim izni verilmedi.');}}
    else localStorage.setItem('browserNotif','false');
};

// ── SUNUCULAR ────────────────────────────────────────────
async function loadUserServers(){
    try {
        const uDoc=await getDoc(doc(db,'users',currentUser.uid));
        // Firestore'da users dokümanı yoksa oluştur
        if(!uDoc.exists()){
            await setDoc(doc(db,'users',currentUser.uid),{
                displayName:currentUser.displayName||currentUser.email,
                email:currentUser.email, photoURL:null, status:'online',
                banned:false, msgCount:0, servers:[], friends:[], createdAt:serverTimestamp()
            });
        }
        const list=uDoc.exists()?(uDoc.data().servers||[]):[];
        if(!list.length){
            document.getElementById('server-screen').style.display='flex';
            document.getElementById('main-layout').style.display='none';
        } else {
            document.getElementById('server-screen').style.display='none';
            document.getElementById('main-layout').style.display='flex';
            renderServers(list);
            openServer(list[0]);
        }
    } catch(e) {
        console.error('loadUserServers hata:', e);
        // Hata olsa bile sunucu ekranını göster
        document.getElementById('server-screen').style.display='flex';
        document.getElementById('main-layout').style.display='none';
    }
}
function renderServers(list){
    const el=document.getElementById('server-icons');el.innerHTML='';
    list.forEach(s=>{const d=document.createElement('div');d.className='server-icon'+(s.id===currentServerId?' active':'');d.textContent=s.name[0].toUpperCase();d.title=s.name;d.onclick=()=>openServer(s);el.appendChild(d);});
}
async function openServer(server){
    currentServerId=server.id;
    document.getElementById('channel-server-name').textContent=server.name;
    document.querySelectorAll('.server-icon').forEach(el=>el.classList.toggle('active',el.title===server.name));
    currentServerData=(await getDoc(doc(db,'servers',server.id))).data();
    if(memberUnsub)memberUnsub();
    // Kullanıcı önbelleği - aynı UID için tekrar sorgu yapma
    if(!window._userCache) window._userCache={};
    memberUnsub=onSnapshot(doc(db,'servers',server.id),async snap=>{
        currentServerData=snap.data();
        const members=snap.data()?.members||[], roles=snap.data()?.roles||{};
        const list=document.getElementById('members-list');list.innerHTML='';
        updateChannelOnlineMembers(members);
        for(const m of members){
            let photoURL=null,status='offline';
            try{
                const cached=window._userCache[m.uid];
                const now=Date.now();
                if(cached&&(now-cached.ts)<60000){ // 1 dakika önbellek
                    photoURL=cached.photoURL;status=cached.status;
                } else {
                    const u=await getDoc(doc(db,'users',m.uid));
                    if(u.exists()){photoURL=u.data().photoURL;status=u.data().status||'offline';window._userCache[m.uid]={photoURL,status,ts:now};}
                }
            }catch(e){}
            const div=document.createElement('div');div.className='member';
            const avWrap=document.createElement('div');avWrap.style.cssText='position:relative;flex-shrink:0';
            const av=makeAvatar(photoURL,m.name,'member-av');
            const dot=document.createElement('div');dot.className='member-status-dot';dot.style.background=getStatusColor(status);
            avWrap.appendChild(av);avWrap.appendChild(dot);
            const nameEl=document.createElement('span');nameEl.className='member-name';nameEl.textContent=m.name;
            const role=roles[m.uid]||'member';
            if(role!=='member'){const b=document.createElement('span');b.className='member-role-badge '+(role==='owner'?'role-owner':'role-mod');b.textContent=role==='owner'?'👑':'🛡️';nameEl.appendChild(b);}
            div.appendChild(avWrap);div.appendChild(nameEl);
            div.onclick=()=>showProfile(m.uid,m.name,photoURL,status);
            list.appendChild(div);
        }
    });
    loadChannels(server.id);
}
async function updateChannelOnlineMembers(members){
    const container=document.getElementById('channel-online-members');if(!container)return;
    // Önbellek: son 30 saniyede çalıştıysa atla
    const now=Date.now();
    if(window._lastOnlineUpdate&&(now-window._lastOnlineUpdate)<30000)return;
    window._lastOnlineUpdate=now;
    container.innerHTML='';let count=0;
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center';
    // Maksimum 8 üye sorgula - Firestore yükünü azalt
    for(const m of members.slice(0,8)){
        try{const u=await getDoc(doc(db,'users',m.uid));const ud=u.data()||{};if(ud.status&&ud.status!=='offline'){count++;if(count<=5){const av=document.createElement('div');av.style.cssText=`width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#5865f2,#9b59b6);color:white;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-left:${count>1?'-6px':'0'};border:2px solid var(--dark);z-index:${6-count};cursor:pointer;flex-shrink:0`;setAvatarEl(av,ud.photoURL||null,m.name);av.title=m.name;av.onclick=()=>loadAndShowProfile(m.uid,m.name,ud.photoURL);wrap.appendChild(av);}}}catch(e){}
    }
    if(count>0){container.appendChild(wrap);const c=document.createElement('span');c.style.cssText='color:var(--muted);font-size:12px;font-weight:600;margin-left:8px';c.textContent=count+' çevrimiçi';container.appendChild(c);}
}

// ── ROL ──────────────────────────────────────────────────
window.openRoleModal=(uid,name)=>{roleTargetUid=uid;document.getElementById('role-target-name').textContent=name+' kullanıcısının rolü';showModal('modal-roles');};
window.setMemberRole=async(role)=>{if(!roleTargetUid||!currentServerId)return;const roles=currentServerData?.roles||{};roles[roleTargetUid]=role;await updateDoc(doc(db,'servers',currentServerId),{roles});hideModal('modal-roles');hideModal('modal-profile');};

// ── KANALLAR ─────────────────────────────────────────────
async function loadChannels(serverId){
    if(channelUnsub)channelUnsub();
    channelUnsub=onSnapshot(collection(db,'servers',serverId,'channels'),async snap=>{
        const el=document.getElementById('channels');el.innerHTML='';
        let chs=[];snap.forEach(d=>chs.push({id:d.id,...d.data()}));
        chs.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        if(!chs.length){await addDoc(collection(db,'servers',serverId,'channels'),{name:'genel',createdAt:serverTimestamp()});return;}
        const lbl=document.createElement('div');lbl.className='channels-label';lbl.textContent='Kanallar';el.appendChild(lbl);
        chs.forEach(ch=>{const d=document.createElement('div');d.className='channel-item'+(ch.id===currentChannelId?' active':'');d.innerHTML=`<span class="ch-hash">#</span>${ch.name}`;d.onclick=()=>openChannel(serverId,ch.id,ch.name);el.appendChild(d);});
        if(!currentChannelId||!chs.find(c=>c.id===currentChannelId))openChannel(serverId,chs[0].id,chs[0].name);
    });
}
function openChannel(serverId,channelId,channelName){
    currentChannelId=channelId;
    document.getElementById('channel-title').textContent='# '+channelName;
    document.querySelectorAll('.channel-item').forEach(el=>el.classList.toggle('active',el.textContent.trim()===channelName));
    cancelReply();
    // Sol sidebar'ı gizle - tam ekran chat
    document.getElementById('server-list').style.display='none';
    document.getElementById('channel-sidebar').style.display='none';
    document.getElementById('chat-area').style.flex='1';
    if(msgUnsub)msgUnsub();
    if(typingUnsub)typingUnsub();
    typingUnsub=onSnapshot(doc(db,'servers',serverId,'channels',channelId,'meta','typing'),snap=>{
        const data=snap.data()||{},now=Date.now();
        const typers=Object.entries(data).filter(([uid,i])=>uid!==currentUser?.uid&&i.ts&&(now-i.ts)<4000).map(([,i])=>i.name);
        const ti=document.getElementById('typing-indicator'),tt=document.getElementById('typing-text');
        if(typers.length){tt.textContent=typers.join(', ')+' yazıyor';ti.style.display='flex';}else ti.style.display='none';
    });
    let firstLoad=true;
    const q=query(collection(db,'servers',serverId,'channels',channelId,'messages'),orderBy('createdAt','asc'),fsLimit(100));
    msgUnsub=onSnapshot(q,snap=>{
        const container=document.getElementById('messages');
        const wasBottom=container.scrollHeight-container.scrollTop<=container.clientHeight+60;
        snap.docChanges().forEach(change=>{
            const data=change.doc.data(),msgId=change.doc.id;
            if(change.type==='added'){
                allMessages.push({id:msgId,...data});
                if(!firstLoad){
                    container.appendChild(buildMessageEl({id:msgId,...data}));
                    if(data.uid!==currentUser?.uid){
                        if(localStorage.getItem('notifSound')!=='false')playNotif();
                        showBrowserNotif(data.name||'Birisi',data.text||'Yeni mesaj');
                        if(!data.readBy?.includes(currentUser.uid))updateDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',msgId),{readBy:arrayUnion(currentUser.uid)}).catch(()=>{});
                    }
                }
            } else if(change.type==='modified'){
                const idx=allMessages.findIndex(m=>m.id===msgId);
                if(idx!==-1)allMessages[idx]={id:msgId,...data};
                const el=container.querySelector(`[data-msg-id="${msgId}"]`);
                if(el){
                    const ri=el.querySelector('[data-read-info]');
                    if(ri&&data.uid===currentUser?.uid){const r=(data.readBy||[]).filter(x=>x!==currentUser.uid);ri.className='msg-read-info'+(r.length?' seen':'');ri.textContent=r.length?`👁️ ${r.length} kişi gördü`:'✓ Gönderildi';}
                    if(data.edited){const t=el.querySelector('.msg-text');if(t)t.textContent=data.text;if(!el.querySelector('.msg-edited-tag')){const tm=el.querySelector('.msg-time');if(tm){const tg=document.createElement('span');tg.className='msg-edited-tag';tg.textContent='(düzenlendi)';tm.insertAdjacentElement('afterend',tg);}}}
                }
                return;
            } else if(change.type==='removed'){
                allMessages=allMessages.filter(m=>m.id!==msgId);
                const el=container.querySelector(`[data-msg-id="${msgId}"]`);if(el)el.remove();
                return;
            }
        });
        if(firstLoad){
            allMessages=[];snap.forEach(d=>allMessages.push({id:d.id,...d.data()}));
            renderMessages(allMessages);firstLoad=false;
            // Sadece son 20 mesajın readBy'ını güncelle - Firestore yükünü azalt
            const unreadMsgs=allMessages.filter(d=>d.uid!==currentUser?.uid&&!d.readBy?.includes(currentUser.uid)).slice(-20);
            // Toplu güncelleme - aynı anda max 5 istek
            const chunks=(arr,n)=>Array.from({length:Math.ceil(arr.length/n)},(_,i)=>arr.slice(i*n,(i+1)*n));
            for(const chunk of chunks(unreadMsgs,5)){
                await Promise.all(chunk.map(data=>updateDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',data.id),{readBy:arrayUnion(currentUser.uid)}).catch(()=>{})));
                await new Promise(r=>setTimeout(r,300)); // 300ms ara ver
            }
        }
        if(wasBottom)container.scrollTop=container.scrollHeight;
    });
}
function buildMessageEl(data){
    const time=data.createdAt?.toDate().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})||'';
    const div=document.createElement('div');div.className='msg';div.dataset.msgId=data.id;
    div.appendChild(makeAvatar(data.photoURL||null,data.name,'msg-av'));
    const body=document.createElement('div');body.className='msg-body';
    if(data.replyTo){const ref=document.createElement('div');ref.className='msg-reply-ref';ref.innerHTML=`<div class="msg-reply-ref-name">↩ ${data.replyTo.name}</div><div class="msg-reply-ref-text">${data.replyTo.text||'[medya]'}</div>`;ref.onclick=()=>{const c=document.getElementById('messages');const el=c.querySelector(`[data-msg-id="${data.replyTo.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.background='rgba(88,101,242,0.15)';setTimeout(()=>el.style.background='',1500);}};body.appendChild(ref);}
    const hdr=document.createElement('div');
    const ns=document.createElement('span');ns.className='msg-name';ns.style.cursor='pointer';ns.textContent=data.name||'Kullanıcı';
    ns.onclick=(e)=>{e.stopPropagation();loadAndShowProfile(data.uid,data.name,data.photoURL);};
    const timeSpan=document.createElement('span');timeSpan.className='msg-time';timeSpan.textContent=time;
    hdr.appendChild(ns);hdr.appendChild(timeSpan);
    if(data.edited){const et=document.createElement('span');et.className='msg-edited-tag';et.textContent='(düzenlendi)';hdr.appendChild(et);}
    body.appendChild(hdr);
    if(data.type==='image'){const img=document.createElement('img');img.src=data.fileData;img.className='msg-image';img.onclick=()=>openImage(data.fileData);body.appendChild(img);}
    else if(data.type==='file'){const a=document.createElement('a');a.href=data.fileData;a.download=data.fileName;a.className='msg-file';a.innerHTML=`📎 ${data.fileName} <span>(${data.fileSize})</span>`;body.appendChild(a);}
    else if(data.type==='audio'){body.appendChild(renderAudioMessage(data.fileData,data.duration));}
    else{const t=document.createElement('span');t.className='msg-text';t.textContent=data.text;body.appendChild(t);}
    if(data.uid===currentUser?.uid){const ri=document.createElement('div');const r=(data.readBy||[]).filter(x=>x!==currentUser.uid);ri.className='msg-read-info'+(r.length?' seen':'');ri.setAttribute('data-read-info',data.id);ri.textContent=r.length?`👁️ ${r.length} kişi gördü`:'✓ Gönderildi';body.appendChild(ri);}
    div.appendChild(body);
    div.addEventListener('contextmenu',e=>{e.preventDefault();showContextMenu(e,data);});
    let tt;div.addEventListener('touchstart',()=>{tt=setTimeout(()=>showContextMenu({clientX:window.innerWidth/2,clientY:window.innerHeight/2},data),600);});div.addEventListener('touchend',()=>clearTimeout(tt));
    return div;
}
function renderMessages(msgs){
    const c=document.getElementById('messages');c.innerHTML='';
    getDoc(doc(db,'users',currentUser.uid)).then(uDoc=>{
        const blocked=uDoc.data()?.blocked||[];
        msgs.forEach(data=>{if(!blocked.includes(data.uid))c.appendChild(buildMessageEl(data));});
    }).catch(()=>msgs.forEach(data=>c.appendChild(buildMessageEl(data))));
}

// ── CONTEXT MENU ─────────────────────────────────────────
function showContextMenu(e,data){
    contextMsgData=data;
    const menu=document.getElementById('msg-context-menu');
    document.getElementById('ctx-edit-btn').style.display=data.uid===currentUser?.uid&&data.type==='text'?'block':'none';
    document.getElementById('ctx-delete-btn').style.display=canDeleteMsg(data.uid)?'block':'none';
    menu.style.display='block';
    menu.style.left=Math.min(e.clientX,window.innerWidth-160)+'px';
    menu.style.top=Math.min(e.clientY,window.innerHeight-130)+'px';
}
window.contextReply=()=>{if(!contextMsgData)return;replyTo={id:contextMsgData.id,name:contextMsgData.name,text:contextMsgData.text||'[medya]'};document.getElementById('reply-preview').style.display='block';document.getElementById('reply-preview-name').textContent=contextMsgData.name;document.getElementById('reply-preview-text').textContent=contextMsgData.text||'[medya]';document.getElementById('msg-input').focus();document.getElementById('msg-context-menu').style.display='none';};
window.contextEdit=()=>{
    if(!contextMsgData)return;document.getElementById('msg-context-menu').style.display='none';
    const el=document.getElementById('messages').querySelector(`[data-msg-id="${contextMsgData.id}"]`);if(!el)return;
    const t=el.querySelector('.msg-text');if(!t)return;t.style.display='none';
    const wrap=document.createElement('div');wrap.className='msg-edit-wrap';
    const input=document.createElement('input');input.className='msg-edit-input';input.value=t.textContent;
    const save=document.createElement('button');save.className='msg-edit-save';save.textContent='Kaydet';
    const cancel=document.createElement('button');cancel.className='msg-edit-cancel';cancel.textContent='İptal';
    save.onclick=async()=>{const nt=input.value.trim();if(!nt)return;await updateDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',contextMsgData.id),{text:nt,edited:true});wrap.remove();t.style.display='';};
    cancel.onclick=()=>{wrap.remove();t.style.display='';};
    wrap.appendChild(input);wrap.appendChild(save);wrap.appendChild(cancel);t.parentNode.insertBefore(wrap,t.nextSibling);input.focus();
};
window.contextDelete=()=>{if(!contextMsgData)return;document.getElementById('msg-context-menu').style.display='none';if(!confirm('Mesajı silmek istiyor musun?'))return;deleteDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'messages',contextMsgData.id));};
window.cancelReply=()=>{replyTo=null;document.getElementById('reply-preview').style.display='none';};

// ── YAZIYOR ──────────────────────────────────────────────
let _lastTypingWrite=0;
window.handleTyping=async()=>{
    if(!currentUser||!currentServerId||!currentChannelId)return;
    const now=Date.now();
    if(now-_lastTypingWrite<2000)return; // 2 saniyede bir yaz
    _lastTypingWrite=now;
    const ref=doc(db,'servers',currentServerId,'channels',currentChannelId,'meta','typing');
    await setDoc(ref,{[currentUser.uid]:{name:currentUser.displayName||currentUser.email,ts:now}},{merge:true});
    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(async()=>await setDoc(ref,{[currentUser.uid]:{name:'',ts:0}},{merge:true}),5000);
};

// ── MESAJ GÖNDER ─────────────────────────────────────────
window.handleMsgKey=(e)=>{if(e.key==='Enter')sendMessage();if(e.key==='Escape')cancelReply();};
window.sendMessage=async()=>{
    const input=document.getElementById('msg-input');
    const text=input.value.trim();
    if(!text||!currentServerId||!currentChannelId||!currentUser)return;
    input.value='';clearTimeout(typingTimeout);
    try{await setDoc(doc(db,'servers',currentServerId,'channels',currentChannelId,'meta','typing'),{[currentUser.uid]:{name:'',ts:0}},{merge:true});}catch(e){}
    const msgData={text,name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'text',readBy:[currentUser.uid],createdAt:serverTimestamp()};
    if(replyTo){msgData.replyTo=replyTo;cancelReply();}
    await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'),msgData);
    // Mesaj sayacı artır
    const ref=doc(db,'users',currentUser.uid);const uDoc=await getDoc(ref);const count=(uDoc.data()?.msgCount||0)+1;await setDoc(ref,{msgCount:count},{merge:true});
};
window.addChannel=async()=>{const name=document.getElementById('new-channel-name').value.trim().toLowerCase().replace(/\s+/g,'-');const err=document.getElementById('channel-error');if(!name){err.textContent='Kanal adı girin.';return;}await addDoc(collection(db,'servers',currentServerId,'channels'),{name,createdAt:serverTimestamp()});hideModal('modal-add-channel');document.getElementById('new-channel-name').value='';};
window.createServer=async()=>{
    const name=document.getElementById('new-server-name').value.trim();const err=document.getElementById('create-error');if(!name){err.textContent='Sunucu adı girin.';return;}
    const serverId=Math.random().toString(36).substring(2,14).toUpperCase(),inviteCode=Math.random().toString(36).substring(2,8).toUpperCase();
    await setDoc(doc(db,'servers',serverId),{name,inviteCode,ownerId:currentUser.uid,public:true,members:[{uid:currentUser.uid,name:currentUser.displayName||currentUser.email}],roles:{[currentUser.uid]:'owner'},createdAt:serverTimestamp()});
    await setDoc(doc(db,'users',currentUser.uid),{servers:arrayUnion({id:serverId,name})},{merge:true});
    hideModal('modal-create');document.getElementById('new-server-name').value='';loadUserServers();
};
window.joinServer=async()=>{
    const input=document.getElementById('join-code').value.trim();
    const err=document.getElementById('join-error');
    if(!input){err.style.color='#ed4245';err.textContent='Kod veya sunucu adı girin.';return;}
    err.style.color='#949ba4';err.textContent='Aranıyor...';
    let snap = await getDocs(query(collection(db,'servers'),where('inviteCode','==',input.toUpperCase())));
    if(snap.empty) snap = await getDocs(query(collection(db,'servers'),where('name','==',input)));
    if(snap.empty) snap = await getDocs(collection(db,'servers')).then(s=>({empty:!s.docs.some(d=>d.data().name?.toLowerCase()===input.toLowerCase()),docs:s.docs.filter(d=>d.data().name?.toLowerCase()===input.toLowerCase())}));
    if(snap.empty||!snap.docs.length){err.style.color='#ed4245';err.textContent='Sunucu bulunamadı.';return;}
    const sd=snap.docs[0];
    const already=(sd.data().members||[]).some(m=>m.uid===currentUser.uid);
    if(already){err.style.color='#faa61a';err.textContent='Zaten bu sunucudasın.';return;}
    await updateDoc(doc(db,'servers',sd.id),{members:arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})});
    await setDoc(doc(db,'users',currentUser.uid),{servers:arrayUnion({id:sd.id,name:sd.data().name})},{merge:true});
    err.style.color='#23a55a';err.textContent='✅ Katıldın!';
    setTimeout(()=>{hideModal('modal-join');document.getElementById('join-code').value='';loadUserServers();},800);
};
window.showInvite=async()=>{if(!currentServerId)return;const snap=await getDoc(doc(db,'servers',currentServerId));document.getElementById('invite-code').textContent=snap.data()?.inviteCode||'???';showModal('modal-invite');};
window.copyInvite=()=>{navigator.clipboard.writeText(document.getElementById('invite-code').textContent);const btn=event.target;btn.textContent='✅ Kopyalandı!';setTimeout(()=>btn.textContent='Kopyala',2000);};

// ── DOSYA ────────────────────────────────────────────────
window.openFilePicker=()=>document.getElementById('file-input').click();
window.onFileSelected=async(input)=>{
    const file=input.files[0];if(!file)return;if(file.size>5*1024*1024){alert('5MB\'dan küçük olmalı.');return;}
    const reader=new FileReader();
    reader.onload=async(e)=>{const b64=e.target.result,isImg=file.type.startsWith('image/');const md={name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:isImg?'image':'file',fileData:b64,fileName:file.name,fileSize:(file.size/1024).toFixed(1)+' KB',text:'',readBy:[currentUser.uid],createdAt:serverTimestamp()};if(replyTo){md.replyTo=replyTo;cancelReply();}await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'),md);};
    reader.readAsDataURL(file);input.value='';
};
window.openImage=(src)=>{const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';const img=document.createElement('img');img.src=src;img.style.cssText='max-width:95vw;max-height:95vh;border-radius:8px';o.appendChild(img);o.onclick=()=>document.body.removeChild(o);document.body.appendChild(o);};

// ── SES KAYDI ────────────────────────────────────────────
window.startVoiceRecord=async(e)=>{
    if(e)e.preventDefault();if(mediaRecorder&&mediaRecorder.state==='recording')return;
    try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        audioChunks=[];isCancelled=false;
        mediaRecorder=new MediaRecorder(stream);
        mediaRecorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.push(e.data);};
        mediaRecorder.onstop=async()=>{
            stream.getTracks().forEach(t=>t.stop());clearInterval(voiceTimerInterval);
            document.getElementById('voice-recording-indicator').style.display='none';
            document.getElementById('voice-btn').classList.remove('recording');
            if(isCancelled||!audioChunks.length)return;
            const blob=new Blob(audioChunks,{type:'audio/webm'});if(blob.size>5*1024*1024){alert('Ses kaydı çok uzun.');return;}
            const reader=new FileReader();reader.onload=async(ev)=>{await addDoc(collection(db,'servers',currentServerId,'channels',currentChannelId,'messages'),{name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'audio',fileData:ev.target.result,duration:formatDuration(voiceSeconds),text:'',readBy:[currentUser.uid],createdAt:serverTimestamp()});};reader.readAsDataURL(blob);
        };
        mediaRecorder.start();voiceSeconds=0;
        document.getElementById('voice-timer').textContent='0:00';
        document.getElementById('voice-recording-indicator').style.display='flex';
        document.getElementById('voice-btn').classList.add('recording');
        voiceTimerInterval=setInterval(()=>{voiceSeconds++;document.getElementById('voice-timer').textContent=formatDuration(voiceSeconds);if(voiceSeconds>=120)window.stopVoiceRecord();},1000);
    }catch(e){alert('Mikrofon erişimi reddedildi.');}
};
window.stopVoiceRecord=(e)=>{if(e)e.preventDefault();if(mediaRecorder&&mediaRecorder.state==='recording'){if(voiceSeconds<1)isCancelled=true;mediaRecorder.stop();}};
window.cancelVoiceRecord=()=>{isCancelled=true;if(mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop();clearInterval(voiceTimerInterval);document.getElementById('voice-recording-indicator').style.display='none';document.getElementById('voice-btn').classList.remove('recording');};
function renderAudioMessage(fileData,duration){
    const wrap=document.createElement('div');wrap.className='msg-audio';
    const audio=new Audio(fileData);let isPlaying=false,pi=null;
    const btn=document.createElement('button');btn.className='audio-play-btn';btn.textContent='▶';
    const canvas=document.createElement('canvas');canvas.className='audio-waveform';canvas.width=120;canvas.height=28;
    const ctx2=canvas.getContext('2d');ctx2.fillStyle='rgba(88,101,242,0.7)';
    for(let i=0;i<24;i++){const h=4+Math.random()*20,x=i*5,y=(28-h)/2;ctx2.beginPath();try{ctx2.roundRect(x,y,3,h,2);}catch(e){ctx2.rect(x,y,3,h);}ctx2.fill();}
    const dur=document.createElement('span');dur.className='audio-duration';dur.textContent=duration||'0:00';
    btn.onclick=()=>{if(isPlaying){audio.pause();btn.textContent='▶';isPlaying=false;clearInterval(pi);}else{audio.play();btn.textContent='⏸';isPlaying=true;pi=setInterval(()=>{if(!audio.ended){const r=Math.ceil(audio.duration-audio.currentTime);dur.textContent=formatDuration(isNaN(r)?0:r);}},500);}};
    audio.onended=()=>{btn.textContent='▶';isPlaying=false;clearInterval(pi);dur.textContent=duration||'0:00';};
    wrap.appendChild(btn);wrap.appendChild(canvas);wrap.appendChild(dur);return wrap;
}

// ── AYARLAR ──────────────────────────────────────────────
function loadSettingsModal(){
    if(!currentUser)return;
    document.getElementById('settings-displayname').value=currentUser.displayName||'';
    document.getElementById('settings-name-display').textContent=currentUser.displayName||'';
    setAvatarEl(document.getElementById('settings-avatar'),window._userPhotoURL,currentUser.displayName);
    applyFrameToEl(document.getElementById('settings-avatar'),selectedFrame);
    const theme=localStorage.getItem('theme')||'dark';
    document.getElementById('theme-dark').classList.toggle('active',theme==='dark');
    document.getElementById('theme-light').classList.toggle('active',theme==='light');
    document.getElementById('lang-tr').classList.toggle('active',(localStorage.getItem('lang')||'tr')==='tr');
    document.getElementById('lang-en').classList.toggle('active',localStorage.getItem('lang')==='en');
    document.getElementById('notif-sound').checked=localStorage.getItem('notifSound')!=='false';
    const nb=document.getElementById('notif-browser');if(nb)nb.checked=localStorage.getItem('browserNotif')==='true'&&Notification.permission==='granted';
    const st=localStorage.getItem('userStatus')||'online';
    document.querySelectorAll('.status-option').forEach(el=>el.classList.toggle('active',el.dataset.status===st));
    // Rozet göster
    getDoc(doc(db,'users',currentUser.uid)).then(uDoc=>{const count=uDoc.data()?.msgCount||0;const badge=getBadge(count);const el=document.getElementById('settings-badge-display');if(el&&badge)el.innerHTML=`<span class="msg-badge ${badge.cls}">${badge.label} — ${count} mesaj</span>`;});
}
window.saveDisplayName=async()=>{const name=document.getElementById('settings-displayname').value.trim();const msg=document.getElementById('name-msg');if(!name){msg.style.color='#ed4245';msg.textContent='Ad boş olamaz.';return;}try{await updateProfile(currentUser,{displayName:name});await setDoc(doc(db,'users',currentUser.uid),{displayName:name},{merge:true});document.getElementById('my-name').textContent=name;document.getElementById('settings-name-display').textContent=name;msg.style.color='#23a55a';msg.textContent='✅ Ad güncellendi!';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}};
window.changePassword=async()=>{const pw=document.getElementById('settings-newpass').value;const msg=document.getElementById('pass-msg');if(pw.length<6){msg.style.color='#ed4245';msg.textContent='En az 6 karakter.';return;}try{await updatePassword(currentUser,pw);msg.style.color='#23a55a';msg.textContent='✅ Şifre güncellendi!';document.getElementById('settings-newpass').value='';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent=e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message;}};
window.saveSetting=(k,v)=>localStorage.setItem(k,v);
window.setTheme=(theme)=>{localStorage.setItem('theme',theme);applyTheme(theme);document.getElementById('theme-dark').classList.toggle('active',theme==='dark');document.getElementById('theme-light').classList.toggle('active',theme==='light');};
window.setLang=(lang)=>{localStorage.setItem('lang',lang);document.getElementById('lang-tr').classList.toggle('active',lang==='tr');document.getElementById('lang-en').classList.toggle('active',lang==='en');};
window.leaveServer=async()=>{if(!currentServerId){alert('Önce bir sunucu seç.');return;}if(!confirm('Sunucudan ayrılmak istediğine emin misin?'))return;try{const sRef=doc(db,'servers',currentServerId);const sSnap=await getDoc(sRef);await updateDoc(sRef,{members:(sSnap.data()?.members||[]).filter(m=>m.uid!==currentUser.uid)});const uRef=doc(db,'users',currentUser.uid);const uSnap=await getDoc(uRef);await setDoc(uRef,{servers:(uSnap.data()?.servers||[]).filter(s=>s.id!==currentServerId)},{merge:true});hideModal('modal-settings');currentServerId=null;currentChannelId=null;loadUserServers();}catch(e){alert('Hata: '+e.message);}};
window.deleteAccount=async()=>{if(!confirm('Hesabını silmek istediğine emin misin?'))return;if(!confirm('Son kez onaylıyor musun?'))return;try{await deleteDoc(doc(db,'users',currentUser.uid));await deleteUser(currentUser);}catch(e){alert(e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message);}};

// ── PROFİL ───────────────────────────────────────────────
async function showProfile(uid,name,photoURL,status){
    setAvatarEl(document.getElementById('profile-av'),photoURL,name);
    try{const uDoc=await getDoc(doc(db,'users',uid));const frame=uDoc.data()?.profileFrame||'none';applyFrameToEl(document.getElementById('profile-av'),frame);}catch(e){}
    document.getElementById('profile-username').textContent=name;
    document.getElementById('profile-tag').textContent='@ '+uid.substring(0,6).toLowerCase();
    const sl={online:'🟢 Çevrimiçi',idle:'🌙 Boşta',dnd:'⛔ Rahatsız Etme',offline:'⚫ Görünmez'};
    document.getElementById('profile-status-text').textContent=sl[status]||'⚫ Çevrimdışı';
    const roleBadge=document.getElementById('profile-role-badge');roleBadge.innerHTML='';
    const badgesDiv=document.createElement('div');badgesDiv.className='profile-badges';
    if(currentServerData){const role=(currentServerData.roles||{})[uid]||'member';if(role!=='member'){const rb=document.createElement('span');rb.className='role-badge '+(role==='owner'?'role-owner':'role-mod');rb.textContent=role==='owner'?'👑 Sunucu Sahibi':'🛡️ Moderatör';badgesDiv.appendChild(rb);}}
    let targetMsgCount=0;
    try{const uDoc=await getDoc(doc(db,'users',uid));targetMsgCount=uDoc.data()?.msgCount||0;const badge=getBadge(targetMsgCount);if(badge){const mb=document.createElement('span');mb.className='msg-badge '+badge.cls;mb.textContent=badge.label+' ('+targetMsgCount+' mesaj)';badgesDiv.appendChild(mb);}}catch(e){}
    if(badgesDiv.children.length)roleBadge.appendChild(badgesDiv);
    // Like butonu
    const likeWrap=document.getElementById('profile-like-wrap')||document.createElement('div');
    likeWrap.id='profile-like-wrap';likeWrap.innerHTML='';likeWrap.style.cssText='text-align:center;margin:10px 0 4px';
    if(uid!==currentUser?.uid){
        try{
            const likeDoc=await getDoc(doc(db,'users',uid));
            const likes=likeDoc.data()?.likes||[];
            const liked=likes.includes(currentUser.uid);
            const likeBtn=document.createElement('button');
            likeBtn.className='like-btn'+(liked?' liked':'');
            likeBtn.innerHTML=`${liked?'❤️':'🤍'} <span class="like-count">${likes.length}</span>`;
            likeBtn.onclick=async()=>{
                const ref=doc(db,'users',uid);const snap=await getDoc(ref);
                const curLikes=snap.data()?.likes||[];
                if(curLikes.includes(currentUser.uid)){
                    await setDoc(ref,{likes:curLikes.filter(l=>l!==currentUser.uid)},{merge:true});
                    likeBtn.className='like-btn';likeBtn.innerHTML=`🤍 <span class="like-count">${curLikes.length-1}</span>`;
                }else{
                    await setDoc(ref,{likes:arrayUnion(currentUser.uid)},{merge:true});
                    likeBtn.className='like-btn liked';likeBtn.innerHTML=`❤️ <span class="like-count">${curLikes.length+1}</span>`;
                }
            };
            likeWrap.appendChild(likeBtn);
        }catch(e){}
    }
    const existingLikeWrap=document.getElementById('profile-like-wrap');
    if(!existingLikeWrap){const pStatus=document.getElementById('profile-status-text');pStatus.parentNode.insertBefore(likeWrap,pStatus.nextSibling);}
    else existingLikeWrap.replaceWith(likeWrap);
    const actions=document.getElementById('profile-actions');actions.innerHTML='';
    if(uid===currentUser.uid){actions.innerHTML='<button class="p-btn gray" style="width:100%">Senin Profilin</button>';}
    else{
        const myDoc=await getDoc(doc(db,'users',currentUser.uid));const myData=myDoc.data()||{};
        const friends=myData.friends||[],sent=myData.sentRequests||[],blocked=myData.blocked||[];
        if(blocked.includes(uid)){const ub=document.createElement('button');ub.className='p-btn gray';ub.textContent='🔓 Engeli Kaldır';ub.style.width='100%';ub.onclick=async()=>{const r=doc(db,'users',currentUser.uid);const s=await getDoc(r);await setDoc(r,{blocked:(s.data()?.blocked||[]).filter(b=>b!==uid)},{merge:true});hideModal('modal-profile');};actions.appendChild(ub);}
        else{
            const dm=document.createElement('button');dm.className='p-btn blue';dm.textContent='💬 Mesaj Gönder';dm.style.cssText='width:100%;margin-bottom:6px';dm.onclick=()=>openDMFromProfile(uid,name,photoURL,status);actions.appendChild(dm);
            if(friends.includes(uid)){const r=document.createElement('button');r.className='p-btn red';r.textContent='✕ Arkadaşlıktan Çıkar';r.style.cssText='width:100%;margin-bottom:6px';r.onclick=()=>removeFriend(uid,name);actions.appendChild(r);}
            else if(sent.includes(uid)){const p=document.createElement('button');p.className='p-btn gray';p.textContent='⏳ İstek Gönderildi';p.style.cssText='width:100%;margin-bottom:6px';p.disabled=true;actions.appendChild(p);}
            else{const a=document.createElement('button');a.className='p-btn blue';a.textContent='➕ Arkadaş Ekle';a.style.cssText='width:100%;margin-bottom:6px';a.onclick=()=>{sendFriendRequestToUid(uid,name);a.textContent='⏳ İstek Gönderildi';a.disabled=true;};actions.appendChild(a);}
            const blk=document.createElement('button');blk.className='p-btn red';blk.textContent='🚫 Engelle';blk.style.cssText='width:100%;margin-bottom:6px';blk.onclick=async()=>{if(!confirm(name+' engellensin mi?'))return;await setDoc(doc(db,'users',currentUser.uid),{blocked:arrayUnion(uid)},{merge:true});hideModal('modal-profile');};actions.appendChild(blk);
            if(getMyRole()==='owner'&&uid!==currentUser.uid){const rb=document.createElement('button');rb.className='p-btn gray';rb.textContent='👑 Rol Değiştir';rb.style.cssText='width:100%;margin-top:2px';rb.onclick=()=>openRoleModal(uid,name);actions.appendChild(rb);}
        }
    }
    showModal('modal-profile');
}
window.showProfile=showProfile;
async function loadAndShowProfile(uid,name,photoURL){
    let ph=photoURL||null,st='offline';
    try{const u=await getDoc(doc(db,'users',uid));if(u.exists()){ph=u.data().photoURL||ph;st=u.data().status||'offline';}}catch(e){}
    showProfile(uid,name,ph,st);
}
window.loadAndShowProfile=loadAndShowProfile;

// ── ARKADAŞ ──────────────────────────────────────────────
window.sendFriendRequest=async()=>{
    const searchName=document.getElementById('friend-search-input').value.trim();const msg=document.getElementById('friend-msg');
    if(!searchName){msg.style.color='#ed4245';msg.textContent='Kullanıcı adı girin.';return;}
    msg.style.color='#949ba4';msg.textContent='Aranıyor...';
    const allSnap=await getDocs(collection(db,'users'));
    let found=null;allSnap.forEach(d=>{if((d.data().displayName||'').toLowerCase()===searchName.toLowerCase()&&d.id!==currentUser.uid)found=d;});
    if(!found){msg.style.color='#ed4245';msg.textContent='Kullanıcı bulunamadı.';return;}
    await sendFriendRequestToUid(found.id,found.data().displayName);document.getElementById('friend-search-input').value='';
};
async function sendFriendRequestToUid(targetUid,targetName){
    const msg=document.getElementById('friend-msg');
    try{await setDoc(doc(db,'users',targetUid),{friendRequests:arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})},{merge:true});await setDoc(doc(db,'users',currentUser.uid),{sentRequests:arrayUnion(targetUid)},{merge:true});if(msg){msg.style.color='#23a55a';msg.textContent='✅ İstek gönderildi!';setTimeout(()=>{if(msg)msg.textContent='';},2500);}hideModal('modal-profile');}catch(e){if(msg){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}}
}
async function removeFriend(targetUid,targetName){
    if(!confirm(`${targetName} arkadaşlıktan çıkarılsın mı?`))return;
    const myRef=doc(db,'users',currentUser.uid),theirRef=doc(db,'users',targetUid);
    const mySnap=await getDoc(myRef),theirSnap=await getDoc(theirRef);
    await setDoc(myRef,{friends:(mySnap.data()?.friends||[]).filter(f=>f!==targetUid)},{merge:true});
    await setDoc(theirRef,{friends:(theirSnap.data()?.friends||[]).filter(f=>f!==currentUser.uid)},{merge:true});
    hideModal('modal-profile');loadFriends();
}
window.showFriendTab=(tab)=>{document.getElementById('ftab-all').classList.toggle('active',tab==='all');document.getElementById('ftab-pending').classList.toggle('active',tab==='pending');loadFriends(tab);};
async function loadFriends(tab='all'){
    const list=document.getElementById('friends-list');list.innerHTML='<div class="empty-state"><div class="e-icon">⏳</div>Yükleniyor...</div>';
    const uDoc=await getDoc(doc(db,'users',currentUser.uid));const data=uDoc.data()||{};
    if(tab==='all'){
        const friends=data.friends||[];if(!friends.length){list.innerHTML='<div class="empty-state"><div class="e-icon">👥</div>Henüz arkadaşın yok.</div>';return;}
        list.innerHTML='';for(const fUid of friends){try{const fd=await getDoc(doc(db,'users',fUid));const fData=fd.data()||{};list.appendChild(createFriendItem(fUid,fData.displayName||'Kullanıcı',fData.photoURL,fData.status,'friend'));}catch(e){}}
    }else{
        const reqs=data.friendRequests||[];if(!reqs.length){list.innerHTML='<div class="empty-state"><div class="e-icon">📭</div>Bekleyen istek yok.</div>';return;}
        list.innerHTML='';for(const req of reqs)list.appendChild(createFriendItem(req.uid,req.name,null,null,'pending'));
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
    await setDoc(myRef,{friends:arrayUnion(fromUid),friendRequests:(mySnap.data()?.friendRequests||[]).filter(r=>r.uid!==fromUid)},{merge:true});
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
setInterval(updateFriendBadge,300000); // 5 dakikada bir

// ── DM ───────────────────────────────────────────────────
window.openDMList=async()=>{document.getElementById('dm-screen').style.display='flex';document.getElementById('main-layout').style.display='none';loadDMList();};
window.closeDM=()=>{document.getElementById('dm-screen').style.display='none';document.getElementById('main-layout').style.display='flex';if(dmMsgUnsub){dmMsgUnsub();dmMsgUnsub=null;}if(dmTypingUnsub){dmTypingUnsub();dmTypingUnsub=null;}currentDMPartner=null;};
async function loadDMList(){
    const list=document.getElementById('dm-list');list.innerHTML='<div style="color:var(--muted);padding:12px;font-size:13px">Yükleniyor...</div>';
    const uDoc=await getDoc(doc(db,'users',currentUser.uid));const friends=uDoc.data()?.friends||[];
    if(!friends.length){list.innerHTML='<div style="color:var(--muted);padding:12px;font-size:13px;text-align:center">Arkadaş ekleyerek DM başlat!</div>';return;}
    list.innerHTML='';
    for(const fUid of friends){
        try{
            const fDoc=await getDoc(doc(db,'users',fUid));const fData=fDoc.data()||{};
            const dmId=getDMId(currentUser.uid,fUid);
            let preview='Henüz mesaj yok',hasUnread=false;
            try{const lm=await getDocs(query(collection(db,'dms',dmId,'messages'),orderBy('createdAt','desc')));if(!lm.empty){const ld=lm.docs[0].data();preview=ld.type==='text'?(ld.text||'').substring(0,30):ld.type==='image'?'📷 Fotoğraf':'📎 Dosya';if(ld.uid!==currentUser.uid&&!ld.readBy?.includes(currentUser.uid))hasUnread=true;}}catch(e){}
            const div=document.createElement('div');div.className='dm-item'+(currentDMPartner?.uid===fUid?' active':'');
            const av=document.createElement('div');av.className='dm-item-av';setAvatarEl(av,fData.photoURL,fData.displayName);
            const info=document.createElement('div');info.className='dm-item-info';info.innerHTML=`<div class="dm-item-name">${fData.displayName||'Kullanıcı'}</div><div class="dm-item-preview">${preview}</div>`;
            div.appendChild(av);div.appendChild(info);
            if(hasUnread){const dot=document.createElement('div');dot.className='dm-unread-dot';div.appendChild(dot);}
            div.onclick=()=>openDMChat(fUid,fData.displayName||'Kullanıcı',fData.photoURL,fData.status);
            list.appendChild(div);
        }catch(e){}
    }
}
async function openDMChat(uid,name,photoURL,status){
    currentDMPartner={uid,name,photoURL};
    setAvatarEl(document.getElementById('dm-partner-av'),photoURL,name);
    document.getElementById('dm-partner-name').textContent=name;
    document.getElementById('dm-partner-status').style.background=getStatusColor(status);
    if(dmMsgUnsub)dmMsgUnsub();if(dmTypingUnsub)dmTypingUnsub();
    const dmId=getDMId(currentUser.uid,uid);
    dmTypingUnsub=onSnapshot(doc(db,'dms',dmId,'meta','typing'),snap=>{
        const data=snap.data()||{},now=Date.now();
        const typers=Object.entries(data).filter(([tUid,i])=>tUid!==currentUser.uid&&i.ts&&(now-i.ts)<4000).map(([,i])=>i.name);
        const ti=document.getElementById('dm-typing-indicator'),tt=document.getElementById('dm-typing-text');
        if(typers.length){tt.textContent=typers[0]+' yazıyor';ti.style.display='flex';}else ti.style.display='none';
    });
    const q=query(collection(db,'dms',dmId,'messages'),orderBy('createdAt','asc'));
    dmMsgUnsub=onSnapshot(q,async snap=>{
        const container=document.getElementById('dm-messages');
        const wasBottom=container.scrollHeight-container.scrollTop<=container.clientHeight+60;
        container.innerHTML='';
        snap.forEach(d=>{
            const data=d.data();const time=data.createdAt?.toDate().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})||'';
            const div=document.createElement('div');div.className='msg';
            div.appendChild(makeAvatar(data.photoURL||null,data.name,'msg-av'));
            const body=document.createElement('div');body.className='msg-body';
            body.innerHTML=`<div><span class="msg-name">${data.name||'Kullanıcı'}</span><span class="msg-time">${time}</span></div>`;
            if(data.type==='image'){const img=document.createElement('img');img.src=data.fileData;img.className='msg-image';img.onclick=()=>openImage(data.fileData);body.appendChild(img);}
            else if(data.type==='file'){const a=document.createElement('a');a.href=data.fileData;a.download=data.fileName;a.className='msg-file';a.innerHTML=`📎 ${data.fileName}`;body.appendChild(a);}
            else if(data.type==='audio'){body.appendChild(renderAudioMessage(data.fileData,data.duration));}
            else{const t=document.createElement('span');t.className='msg-text';t.textContent=data.text;body.appendChild(t);}
            if(data.uid===currentUser.uid){const ri=document.createElement('div');const r=(data.readBy||[]).filter(x=>x!==currentUser.uid);ri.className='msg-read-info'+(r.length?' seen':'');ri.textContent=r.length?'👁️ Görüldü':'✓ Gönderildi';body.appendChild(ri);}
            div.appendChild(body);container.appendChild(div);
            if(data.uid!==currentUser.uid&&!data.readBy?.includes(currentUser.uid))updateDoc(doc(db,'dms',dmId,'messages',d.id),{readBy:arrayUnion(currentUser.uid)}).catch(()=>{});
        });
        if(wasBottom)container.scrollTop=container.scrollHeight;
    });
    loadDMList();
}
window.sendDMMessage=async()=>{
    const input=document.getElementById('dm-input');const text=input.value.trim();if(!text||!currentDMPartner)return;
    input.value='';clearTimeout(dmTypingTimeout);
    const dmId=getDMId(currentUser.uid,currentDMPartner.uid);
    try{await setDoc(doc(db,'dms',dmId,'meta','typing'),{[currentUser.uid]:{name:'',ts:0}},{merge:true});}catch(e){}
    await addDoc(collection(db,'dms',dmId,'messages'),{text,name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'text',readBy:[currentUser.uid],createdAt:serverTimestamp()});
    await setDoc(doc(db,'dms',dmId),{participants:[currentUser.uid,currentDMPartner.uid],lastMessage:text,lastMessageTime:serverTimestamp(),lastSender:currentUser.uid},{merge:true});
};
window.handleDMTyping=async()=>{
    if(!currentDMPartner)return;const dmId=getDMId(currentUser.uid,currentDMPartner.uid);
    await setDoc(doc(db,'dms',dmId,'meta','typing'),{[currentUser.uid]:{name:currentUser.displayName||currentUser.email,ts:Date.now()}},{merge:true});
    clearTimeout(dmTypingTimeout);dmTypingTimeout=setTimeout(async()=>await setDoc(doc(db,'dms',dmId,'meta','typing'),{[currentUser.uid]:{name:'',ts:0}},{merge:true}),3000);
};
window.openDMFilePicker=()=>document.getElementById('dm-file-input').click();
window.onDMFileSelected=async(input)=>{
    const file=input.files[0];if(!file||!currentDMPartner)return;if(file.size>5*1024*1024){alert('5MB\'dan küçük olmalı.');return;}
    const reader=new FileReader();reader.onload=async(e)=>{const b64=e.target.result,isImg=file.type.startsWith('image/');const dmId=getDMId(currentUser.uid,currentDMPartner.uid);await addDoc(collection(db,'dms',dmId,'messages'),{name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:isImg?'image':'file',fileData:b64,fileName:file.name,fileSize:(file.size/1024).toFixed(1)+' KB',text:'',readBy:[currentUser.uid],createdAt:serverTimestamp()});};
    reader.readAsDataURL(file);input.value='';
};
window.openDMFromProfile=async(uid,name,photoURL,status)=>{hideModal('modal-profile');document.getElementById('dm-screen').style.display='flex';document.getElementById('main-layout').style.display='none';await loadDMList();openDMChat(uid,name,photoURL,status);};
async function updateDMBadge(){
    if(!currentUser)return;
    try{
        // Sadece dms koleksiyonunda kendi UID'ine göre unread say - tek sorgu
        const uDoc=await getDoc(doc(db,'users',currentUser.uid));
        const unread=(uDoc.data()?.dmUnread)||0;
        const badge=document.getElementById('dm-badge');
        if(badge){badge.textContent=unread;badge.style.display=unread>0?'inline':'none';}
    }catch(e){}
}
// Interval YOK - sadece mesaj gelince çağrılır

// ── KEŞFET ───────────────────────────────────────────────
async function loadDiscover(){
    const list=document.getElementById('discover-list');list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Yükleniyor...</div>';
    try{
        const snap=await getDocs(collection(db,'servers'));allDiscoverServers=[];
        snap.forEach(d=>{const data=d.data();if(data.public!==false)allDiscoverServers.push({id:d.id,...data});});
        allDiscoverServers.sort((a,b)=>(b.members?.length||0)-(a.members?.length||0));
        renderDiscoverServers(allDiscoverServers);
    }catch(e){list.innerHTML='<div style="color:#ed4245;text-align:center;padding:20px">Yüklenemedi.</div>';}
}
function renderDiscoverServers(servers){
    const list=document.getElementById('discover-list');list.innerHTML='';
    if(!servers.length){list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Sunucu bulunamadı.</div>';return;}
    servers.forEach(s=>{
        const card=document.createElement('div');card.className='discover-server-card';
        const icon=document.createElement('div');icon.className='discover-server-icon';
        if(s.iconURL){icon.style.backgroundImage=`url(${s.iconURL})`;icon.style.backgroundSize='cover';}else icon.textContent=(s.name||'?')[0].toUpperCase();
        const info=document.createElement('div');info.className='discover-server-info';info.innerHTML=`<div class="discover-server-name">${s.name}</div><div class="discover-server-members">👥 ${s.members?.length||0} üye</div>`;
        const btn=document.createElement('button');btn.className='discover-join-btn';
        const isMember=s.members?.some(m=>m.uid===currentUser?.uid);
        if(isMember){btn.textContent='✓ Üyesin';btn.disabled=true;}
        else{btn.textContent='Katıl';btn.onclick=async()=>{btn.textContent='...';btn.disabled=true;try{await updateDoc(doc(db,'servers',s.id),{members:arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})});await setDoc(doc(db,'users',currentUser.uid),{servers:arrayUnion({id:s.id,name:s.name})},{merge:true});btn.textContent='✓ Katıldın!';loadUserServers();}catch(e){btn.textContent='Hata';btn.disabled=false;}};}
        card.appendChild(icon);card.appendChild(info);card.appendChild(btn);list.appendChild(card);
    });
}
window.filterDiscoverServers=()=>{const q=document.getElementById('discover-search').value.toLowerCase();renderDiscoverServers(allDiscoverServers.filter(s=>(s.name||'').toLowerCase().includes(q)));};
window.showDiscover=()=>showModal('modal-discover');

// ── PROFİL ÇERÇEVESİ ────────────────────────────────────
function loadFrameModal(){
    const pav=document.getElementById('frame-preview-av');setAvatarEl(pav,window._userPhotoURL,currentUser?.displayName);applyFrameToEl(pav,selectedFrame);
    const opts=document.getElementById('frame-options');opts.innerHTML='';
    FRAMES.forEach(f=>{const div=document.createElement('div');div.className='frame-option'+(f.id===selectedFrame?' selected':'');div.textContent=f.id==='none'?'Yok':f.label;if(f.id==='none')div.classList.add('none-frame');div.onclick=()=>{selectedFrame=f.id;document.querySelectorAll('.frame-option').forEach(el=>el.classList.remove('selected'));div.classList.add('selected');applyFrameToEl(pav,f.id);};opts.appendChild(div);});
}
window.saveProfileFrame=async()=>{
    localStorage.setItem('profileFrame',selectedFrame);
    if(currentUser)await setDoc(doc(db,'users',currentUser.uid),{profileFrame:selectedFrame},{merge:true});
    applyFrameToEl(document.getElementById('my-avatar'),selectedFrame);
    hideModal('modal-frame');
};

// ── ARAMA ────────────────────────────────────────────────
async function requestWakeLock(){
    try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try{keepAliveCtx=new AudioContext();const o=keepAliveCtx.createOscillator(),g=keepAliveCtx.createGain();g.gain.value=0.00001;o.connect(g);g.connect(keepAliveCtx.destination);o.start();}catch(e){}
    document.addEventListener('visibilitychange',handleVisibilityChange);
}
async function handleVisibilityChange(){
    if(document.visibilityState==='visible'&&pc&&localStream){localStream.getTracks().forEach(t=>{if(t.readyState==='ended')navigator.mediaDevices.getUserMedia({audio:true,video:t.kind==='video'}).then(ns=>{const nt=ns.getTracks().find(x=>x.kind===t.kind);if(nt&&pc){const s=pc.getSenders().find(s=>s.track?.kind===t.kind);if(s)s.replaceTrack(nt);}}).catch(()=>{});});}
}
function releaseWakeLock(){try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(e){}try{if(keepAliveCtx){keepAliveCtx.close();keepAliveCtx=null;}}catch(e){}document.removeEventListener('visibilitychange',handleVisibilityChange);}
window.startCall=async(type)=>{
    if(!currentServerId){alert('Önce bir sunucu seç!');return;}
    try{localStream=await navigator.mediaDevices.getUserMedia({video:type==='video',audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(e){alert('Kamera/mikrofon erişimi reddedildi.');return;}
    await requestWakeLock();
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
    onSnapshot(collection(db,'calls'),snap=>{snap.docChanges().forEach(change=>{if(change.type==='added'){const data=change.doc.data();if(data.status==='ringing'&&data.callerUid!==currentUser?.uid&&data.serverId===currentServerId){currentCallId=change.doc.id;document.getElementById('caller-avatar').textContent=(data.callerName||'A')[0].toUpperCase();document.getElementById('caller-name').textContent=data.callerName||'Biri';document.getElementById('caller-type').textContent=data.callType==='video'?'📹 Görüntülü Arama':'📞 Sesli Arama';document.getElementById('incoming-call').style.display='flex';}}});});
}
window.acceptCall=async()=>{
    document.getElementById('incoming-call').style.display='none';
    const callDoc=doc(db,'calls',currentCallId);const callData=(await getDoc(callDoc)).data();
    try{localStream=await navigator.mediaDevices.getUserMedia({video:callData.callType==='video',audio:true});}catch(e){alert('Erişim reddedildi.');return;}
    await requestWakeLock();
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
    releaseWakeLock();
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

// Service worker
if('serviceWorker'in navigator)navigator.serviceWorker.register('/ateschat/sw.js').catch(()=>{});


// ── SİDEBAR TOGGLE ───────────────────────────────────────
let sidebarVisible = false;
window.toggleSidebar = () => {
    sidebarVisible = !sidebarVisible;
    const serverList = document.getElementById('server-list');
    const channelSidebar = document.getElementById('channel-sidebar');
    const btn = document.getElementById('sidebar-toggle-btn');
    if(sidebarVisible) {
        serverList.style.display = 'flex';
        channelSidebar.style.display = 'flex';
        btn.classList.add('active');
    } else {
        serverList.style.display = 'none';
        channelSidebar.style.display = 'none';
        btn.classList.remove('active');
    }
};


// ── DM SES KAYDI ─────────────────────────────────────────
let dmMediaRecorder=null, dmAudioChunks=[], dmVoiceTimer=null, dmVoiceSeconds=0, dmVoiceCancelled=false;

window.startDMVoiceRecord=async(e)=>{
    if(e)e.preventDefault();
    if(dmMediaRecorder&&dmMediaRecorder.state==='recording')return;
    try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        dmAudioChunks=[];dmVoiceCancelled=false;
        dmMediaRecorder=new MediaRecorder(stream);
        dmMediaRecorder.ondataavailable=e=>{if(e.data.size>0)dmAudioChunks.push(e.data);};
        dmMediaRecorder.onstop=async()=>{
            stream.getTracks().forEach(t=>t.stop());
            clearInterval(dmVoiceTimer);
            document.getElementById('dm-voice-recording-indicator').style.display='none';
            document.getElementById('dm-voice-btn').classList.remove('recording');
            if(dmVoiceCancelled||!dmAudioChunks.length||!currentDMPartner)return;
            const blob=new Blob(dmAudioChunks,{type:'audio/webm'});
            if(blob.size>5*1024*1024){alert('Ses kaydı çok uzun.');return;}
            const reader=new FileReader();
            reader.onload=async(ev)=>{
                const dmId=getDMId(currentUser.uid,currentDMPartner.uid);
                await addDoc(collection(db,'dms',dmId,'messages'),{
                    name:currentUser.displayName||currentUser.email,
                    photoURL:window._userPhotoURL||null,
                    uid:currentUser.uid, type:'audio',
                    fileData:ev.target.result,
                    duration:formatDuration(dmVoiceSeconds),
                    text:'', readBy:[currentUser.uid],
                    createdAt:serverTimestamp()
                });
            };
            reader.readAsDataURL(blob);
        };
        dmMediaRecorder.start();
        dmVoiceSeconds=0;
        document.getElementById('dm-voice-timer').textContent='0:00';
        document.getElementById('dm-voice-recording-indicator').style.display='flex';
        document.getElementById('dm-voice-btn').classList.add('recording');
        dmVoiceTimer=setInterval(()=>{
            dmVoiceSeconds++;
            document.getElementById('dm-voice-timer').textContent=formatDuration(dmVoiceSeconds);
            if(dmVoiceSeconds>=120)window.stopDMVoiceRecord();
        },1000);
    }catch(e){alert('Mikrofon erişimi reddedildi.');}
};

window.stopDMVoiceRecord=(e)=>{
    if(e)e.preventDefault();
    if(dmMediaRecorder&&dmMediaRecorder.state==='recording'){
        if(dmVoiceSeconds<1)dmVoiceCancelled=true;
        dmMediaRecorder.stop();
    }
};

window.cancelDMVoiceRecord=()=>{
    dmVoiceCancelled=true;
    if(dmMediaRecorder&&dmMediaRecorder.state==='recording')dmMediaRecorder.stop();
    clearInterval(dmVoiceTimer);
    document.getElementById('dm-voice-recording-indicator').style.display='none';
    document.getElementById('dm-voice-btn').classList.remove('recording');
};

// ── BUTON BAĞLAMALARI ───────────────────────────────────
function initEventListeners() {
    const $ = id => document.getElementById(id);

    $('login-btn')?.addEventListener('click', doLogin);
    $('register-btn')?.addEventListener('click', doRegister);
    $('admin-login-btn')?.addEventListener('click', doAdminLogin);
    $('admin-key-input')?.addEventListener('keydown', e => { if(e.key==='Enter') doAdminLogin(); });

    $('msg-input')?.addEventListener('keydown', e => {
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
        if(e.key==='Escape')cancelReply();
        handleTyping();
    });
    $('dm-input')?.addEventListener('keydown', e => {
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendDMMessage();}
        handleDMTyping();
    });

    const vBtn=$('voice-btn');
    if(vBtn){['mousedown','touchstart'].forEach(ev=>vBtn.addEventListener(ev,startVoiceRecord));['mouseup','mouseleave','touchend'].forEach(ev=>vBtn.addEventListener(ev,stopVoiceRecord));}

    const dmVBtn=$('dm-voice-btn');
    if(dmVBtn){['mousedown','touchstart'].forEach(ev=>dmVBtn.addEventListener(ev,startDMVoiceRecord));['mouseup','mouseleave','touchend'].forEach(ev=>dmVBtn.addEventListener(ev,stopDMVoiceRecord));}

    $('notif-browser')?.addEventListener('change', e=>toggleBrowserNotif(e.target.checked));
    $('notif-sound')?.addEventListener('change', e=>saveSetting('notifSound',e.target.checked));
    $('admin-user-search')?.addEventListener('input', filterAdminUsers);
    $('discover-search')?.addEventListener('input', filterDiscoverServers);

    document.addEventListener('click', e=>{const m=$('msg-context-menu');if(m&&!m.contains(e.target))m.style.display='none';});
    document.querySelectorAll('.modal').forEach(modal=>{modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});});
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initEventListeners);}
else{initEventListeners();}
