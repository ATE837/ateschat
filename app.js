// ── FİREBASE COMPAT KURULUM ──────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyCwwqd4FfhvLRQu8DUUfbdorIu3iJpkHMM",
    authDomain: "ateschat-cd9f4.firebaseapp.com",
    projectId: "ateschat-cd9f4",
    storageBucket: "ateschat-cd9f4.firebasestorage.app",
    messagingSenderId: "174732212740",
    appId: "1:174732212740:web:dcd4b60ed7cc380ca95351"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const { arrayUnion, serverTimestamp, FieldValue } = firebase.firestore;

// ── STATE ────────────────────────────────────────────────
let currentUser=null, currentServerId=null, currentChannelId=null, currentServerData=null;
let msgUnsub=null, memberUnsub=null, channelUnsub=null, typingUnsub=null;
let currentCallId=null, pc=null, localStream=null, screenStream=null;
let wakeLock=null, keepAliveCtx=null;
let isAdmin=false, allAdminUsers=[];
let replyTo=null, contextMsgData=null, roleTargetUid=null;
let typingTimeout=null, allMessages=[], _lastTypingWrite=0;
let mediaRecorder=null, audioChunks=[], voiceTimerInterval=null, voiceSeconds=0, isCancelled=false;
let dmMediaRecorder=null, dmAudioChunks=[], dmVoiceTimer=null, dmVoiceSeconds=0, dmVoiceCancelled=false;
let currentDMPartner=null, dmMsgUnsub=null, dmTypingUnsub=null, dmTypingTimeout=null;
let allDiscoverServers=[], selectedFrame=localStorage.getItem('profileFrame')||'none';
let sidebarVisible=false;

// ── OTOMATİK MESAJ SİLME (5 SAAT) ─────────────────────────
const MESSAGE_LIFETIME = 5 * 60 * 60 * 1000;
const activeDeleteTimers = new Map();

function scheduleMessageDelete(serverId, channelId, msgId, createdAt) {
    if (!createdAt || !createdAt.toMillis) return;
    const deleteTime = createdAt.toMillis() + MESSAGE_LIFETIME;
    const delay = deleteTime - Date.now();
    if (activeDeleteTimers.has(msgId)) clearTimeout(activeDeleteTimers.get(msgId));
    if (delay <= 0) deleteMessage(serverId, channelId, msgId);
    else activeDeleteTimers.set(msgId, setTimeout(() => deleteMessage(serverId, channelId, msgId), delay));
}

async function deleteMessage(serverId, channelId, msgId) {
    try {
        await db.collection('servers').doc(serverId)
            .collection('channels').doc(channelId)
            .collection('messages').doc(msgId).delete();
    } catch (e) {}
}

function scheduleDMDelete(dmId, msgId, createdAt) {
    if (!createdAt || !createdAt.toMillis) return;
    const deleteTime = createdAt.toMillis() + MESSAGE_LIFETIME;
    const delay = deleteTime - Date.now();
    if (activeDeleteTimers.has('dm_'+msgId)) clearTimeout(activeDeleteTimers.get('dm_'+msgId));
    if (delay <= 0) deleteDMMessage(dmId, msgId);
    else activeDeleteTimers.set('dm_'+msgId, setTimeout(() => deleteDMMessage(dmId, msgId), delay));
}

async function deleteDMMessage(dmId, msgId) {
    try {
        await db.collection('dms').doc(dmId).collection('messages').doc(msgId).delete();
    } catch (e) {}
}

function getRemainingTime(createdAt) {
    if (!createdAt || !createdAt.toMillis) return null;
    const remaining = (createdAt.toMillis() + MESSAGE_LIFETIME) - Date.now();
    if (remaining <= 0) return '0s';
    const h = Math.floor(remaining / (1000 * 60 * 60));
    const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return h > 0 ? `${h}s ${m}d` : `${m}d`;
}

const ADMIN_KEY_HASH='548cd183a18c7924882b8b3af52b5f87fd9706e31a66922acab1b22ac40ee508';
const iceServers={iceServers:[{urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}]};
const FRAMES=[
    {id:'none',label:'Yok',style:''},
    {id:'blue',label:'💙',style:'0 0 0 3px #5865f2'},
    {id:'gold',label:'💛',style:'0 0 0 3px #faa61a'},
    {id:'red',label:'❤️',style:'0 0 0 3px #ed4245'},
    {id:'green',label:'💚',style:'0 0 0 3px #23a55a'},
    {id:'purple',label:'💜',style:'0 0 0 3px #9b59b6'},
    {id:'rainbow',label:'🌈',style:'',extra:'border:3px solid transparent;background:linear-gradient(var(--dark),var(--dark)) padding-box,linear-gradient(135deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f) border-box'},
    {id:'nova',label:'✨',style:'0 0 0 3px #fff, 0 0 12px 2px rgba(88,101,242,0.8)'},
];
const BADGES=[
    {id:'beginner',min:1,max:49,label:'🌱 Acemi',cls:'badge-beginner'},
    {id:'active',min:50,max:249,label:'💬 Aktif',cls:'badge-active'},
    {id:'veteran',min:250,max:999,label:'⭐ Veteran',cls:'badge-veteran'},
    {id:'legend',min:1000,max:4999,label:'🔥 Efsane',cls:'badge-legend'},
    {id:'nova',min:5000,max:Infinity,label:'✨ Nova',cls:'badge-nova'},
];

applyTheme(localStorage.getItem('theme')||'dark');

// ── YARDIMCILAR ──────────────────────────────────────────
async function sha256(msg){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(msg));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function getDMId(a,b){return[a,b].sort().join('_');}
function getBadge(n){return BADGES.find(b=>n>=b.min&&n<=b.max)||null;}
function getStatusColor(s){return{online:'#23a55a',idle:'#faa61a',dnd:'#ed4245',offline:'#747f8d'}[s]||'#747f8d';}
function getMyRole(){if(!currentServerData||!currentUser)return'member';return(currentServerData.roles||{})[currentUser.uid]||'member';}
function canDeleteMsg(uid){const r=getMyRole();return r==='owner'||r==='mod'||uid===currentUser?.uid;}
function playNotif(){try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.setValueAtTime(0.08,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.25);o.start();o.stop(c.currentTime+0.25);}catch(e){}}
function formatDuration(s){return`${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;}
function setAvatarEl(el,photoURL,name){if(!el)return;if(photoURL){el.style.backgroundImage=`url(${photoURL})`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent='';}else{el.style.backgroundImage='';el.textContent=(name||'A')[0].toUpperCase();}}
function makeAvatar(photoURL,name,cls){const d=document.createElement('div');d.className=cls;setAvatarEl(d,photoURL,name);return d;}
function applyFrameToEl(el,frameId){const f=FRAMES.find(x=>x.id===frameId)||FRAMES[0];el.style.boxShadow='';el.style.border='';if(f.extra){f.extra.split(';').forEach(s=>{const[k,...v]=s.split(':');if(k)el.style[k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v.join(':').trim();});}else if(f.style){el.style.boxShadow=f.style;}}
function applyTheme(theme){const r=document.documentElement.style;if(theme==='light'){r.setProperty('--dark','#f2f3f5');r.setProperty('--sidebar','#e3e5e8');r.setProperty('--black','#ffffff');r.setProperty('--input','#d9dadc');r.setProperty('--text','#2e3338');r.setProperty('--muted','#5c6370');}else{r.setProperty('--dark','#1a1b1e');r.setProperty('--sidebar','#212226');r.setProperty('--black','#111214');r.setProperty('--input','#2e3035');r.setProperty('--text','#dcddde');r.setProperty('--muted','#8e9297');}}
function showBrowserNotif(name,text){if(localStorage.getItem('browserNotif')!=='true'||Notification.permission!=='granted')return;if(document.hasFocus())return;try{new Notification('NovaChat — '+name,{body:text,icon:'icon-192.png'});}catch(e){}}
function updateStatusDot(status){const d=document.getElementById('status-dot');if(d)d.style.background=getStatusColor(status);}
function $(id){return document.getElementById(id);}

// ── AUTH ─────────────────────────────────────────────────
function showTab(tab){['login','register','admin'].forEach(t=>{$('form-'+t).style.display=t===tab?'block':'none';$('tab-'+t).classList.toggle('active',t===tab);});}

async function doLogin(){
    const email=$('login-email').value.trim(),pw=$('login-password').value;
    const err=$('login-error');
    if(!email||!pw){err.style.color='#ed4245';err.textContent='E-posta ve şifre girin.';return;}
    err.style.color='#949ba4';err.textContent='Giriş yapılıyor...';
    try{await auth.signInWithEmailAndPassword(email,pw);}
    catch(e){err.style.color='#ed4245';err.textContent=e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found'?'E-posta veya şifre hatalı.':e.code==='auth/too-many-requests'?'Çok fazla deneme. Bekle.':'Hata: '+e.message;}
}

async function doRegister(){
    const name=$('reg-name').value.trim(),email=$('reg-email').value.trim(),pw=$('reg-password').value;
    const err=$('reg-error');
    if(!name||!email||!pw){err.style.color='#ed4245';err.textContent='Tüm alanları doldurun.';return;}
    if(pw.length<6){err.style.color='#ed4245';err.textContent='Şifre en az 6 karakter.';return;}
    err.style.color='#949ba4';err.textContent='Kayıt yapılıyor...';
    try{
        const r=await auth.createUserWithEmailAndPassword(email,pw);
        await r.user.updateProfile({displayName:name});
        await db.collection('users').doc(r.user.uid).set({displayName:name,email,photoURL:null,status:'online',banned:false,msgCount:0,servers:[],friends:[],createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        err.style.color='#23a55a';err.textContent='✅ Kayıt başarılı!';
    }catch(e){err.style.color='#ed4245';err.textContent=e.code==='auth/email-already-in-use'?'Bu e-posta zaten kayıtlı.':e.code==='auth/invalid-email'?'Geçersiz e-posta.':'Hata: '+e.message;}
}

function doLogout(){if(currentUser)db.collection('users').doc(currentUser.uid).update({status:'offline'}).catch(()=>{});isAdmin=false;auth.signOut();}

// ── ADMİN ────────────────────────────────────────────────
async function doAdminLogin(){
    const key=$('admin-key-input').value.trim(),err=$('admin-error');
    if(!key){err.style.color='#ed4245';err.textContent='Anahtar girin.';return;}
    err.style.color='#949ba4';err.textContent='Doğrulanıyor...';
    if(await sha256(key)!==ADMIN_KEY_HASH){err.style.color='#ed4245';err.textContent='❌ Geçersiz anahtar.';return;}
    isAdmin=true;
    try{await auth.signInAnonymously();}catch(e){}
    $('auth-container').style.display='none';
    $('admin-panel').style.display='flex';
    loadAdminPanel();
}
function adminLogout(){isAdmin=false;auth.signOut();$('admin-panel').style.display='none';$('auth-container').style.display='flex';$('admin-key-input').value='';showTab('login');}

async function loadAdminPanel(){
    ['stat-users','stat-servers','stat-banned'].forEach(id=>$(id).textContent='...');
    $('admin-users-list').innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Yükleniyor...</div>';
    try{
        const[usersSnap,serversSnap]=await Promise.all([db.collection('users').get(),db.collection('servers').get()]);
        allAdminUsers=[];let bannedCount=0;
        usersSnap.forEach(d=>{const data=d.data();allAdminUsers.push({uid:d.id,...data});if(data.banned)bannedCount++;});
        $('stat-users').textContent=usersSnap.size;
        $('stat-servers').textContent=serversSnap.size;
        $('stat-banned').textContent=bannedCount;
        renderAdminUsers(allAdminUsers);
    }catch(e){$('admin-users-list').innerHTML='<div style="color:#ed4245;text-align:center;padding:20px">⚠️ Erişim hatası. Firebase\'de Anonymous Auth\'u etkinleştir.</div>';}
}
function renderAdminUsers(users){
    const list=$('admin-users-list');list.innerHTML='';
    if(!users.length){list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Kullanıcı bulunamadı</div>';return;}
    users.forEach(u=>{const div=document.createElement('div');div.className='admin-user-item'+(u.banned?' banned':'');div.innerHTML=`<div class="admin-user-av">${(u.displayName||'A')[0].toUpperCase()}</div><div class="admin-user-info"><div class="admin-user-name">${u.displayName||'İsimsiz'}${u.banned?'<span class="admin-user-badge badge-banned">🚫 BANLI</span>':''}</div><div class="admin-user-email">${u.email||u.uid}</div></div><div class="admin-user-btns">${u.banned?`<button class="ban-btn do-unban" onclick="adminUnban('${u.uid}','${u.displayName||''}')">✅ Ban Kaldır</button>`:`<button class="ban-btn do-ban" onclick="adminBan('${u.uid}','${u.displayName||''}')">🚫 Banla</button>`}</div>`;list.appendChild(div);});
}
function filterAdminUsers(){const q=$('admin-user-search').value.toLowerCase();renderAdminUsers(allAdminUsers.filter(u=>(u.displayName||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)));}
async function adminBan(uid,name){if(!confirm(`"${name}" banlanacak?`))return;await db.collection('users').doc(uid).update({banned:true});const u=allAdminUsers.find(x=>x.uid===uid);if(u)u.banned=true;$('stat-banned').textContent=allAdminUsers.filter(x=>x.banned).length;renderAdminUsers(allAdminUsers);}
async function adminUnban(uid,name){if(!confirm(`"${name}" banı kaldırılsın?`))return;await db.collection('users').doc(uid).update({banned:false});const u=allAdminUsers.find(x=>x.uid===uid);if(u)u.banned=false;$('stat-banned').textContent=allAdminUsers.filter(x=>x.banned).length;renderAdminUsers(allAdminUsers);}

// ── MODAL ────────────────────────────────────────────────
function showModal(id){$(id).style.display='flex';if(id==='modal-settings')loadSettingsModal();if(id==='modal-friends'){loadFriends('all');updateFriendBadge();}if(id==='modal-frame')loadFrameModal();if(id==='modal-discover')loadDiscover();}
function hideModal(id){$(id).style.display='none';}
function showServerScreen(){$('server-screen').style.display='flex';$('main-layout').style.display='none';}

// ── OTURUM ───────────────────────────────────────────────
auth.onAuthStateChanged(async user=>{
    if(user){
        if(isAdmin||user.isAnonymous)return;
        currentUser=user;
        $('auth-container').style.display='none';
        const uDoc=await db.collection('users').doc(user.uid).get();
        if(uDoc.exists&&uDoc.data().banned){await auth.signOut();$('auth-container').style.display='flex';$('login-error').style.color='#ed4245';$('login-error').textContent='🚫 Hesabın banlandı.';return;}
        if(!uDoc.exists){await db.collection('users').doc(user.uid).set({displayName:user.displayName||user.email,email:user.email,photoURL:null,status:'online',banned:false,msgCount:0,servers:[],friends:[],createdAt:firebase.firestore.FieldValue.serverTimestamp()});}
        const photoURL=uDoc.exists?uDoc.data().photoURL:null;
        window._userPhotoURL=photoURL;
        selectedFrame=uDoc.data()?.profileFrame||localStorage.getItem('profileFrame')||'none';
        setAvatarEl($('my-avatar'),photoURL,user.displayName);
        applyFrameToEl($('my-avatar'),selectedFrame);
        $('my-name').textContent=user.displayName||user.email;
        await db.collection('users').doc(user.uid).update({status:localStorage.getItem('userStatus')||'online'});
        updateStatusDot(localStorage.getItem('userStatus')||'online');
        loadUserServers();listenForCalls();updateFriendBadge();
    }else{
        if(isAdmin)return;
        currentUser=null;
        $('auth-container').style.display='flex';
        $('main-layout').style.display='none';
        $('server-screen').style.display='none';
    }
});

// ── DURUM ────────────────────────────────────────────────
async function setStatus(s){if(!currentUser)return;localStorage.setItem('userStatus',s);await db.collection('users').doc(currentUser.uid).update({status:s});updateStatusDot(s);document.querySelectorAll('.status-option').forEach(el=>el.classList.toggle('active',el.dataset.status===s));}
async function toggleBrowserNotif(checked){if(checked){const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem('browserNotif','true');}else{localStorage.setItem('browserNotif','false');$('notif-browser').checked=false;alert('İzin verilmedi.');}}else localStorage.setItem('browserNotif','false');}

// ── SUNUCULAR ────────────────────────────────────────────
async function loadUserServers(){
    try{
        const uDoc=await db.collection('users').doc(currentUser.uid).get();
        const list=uDoc.exists?(uDoc.data().servers||[]):[];
        if(!list.length){$('server-screen').style.display='flex';$('main-layout').style.display='none';}
        else{$('server-screen').style.display='none';$('main-layout').style.display='flex';$('channel-list').style.display='none';renderServers(list);openServer(list[0]);}
    }catch(e){$('server-screen').style.display='flex';$('main-layout').style.display='none';}
}
function renderServers(list){
    const el=$('server-icons');el.innerHTML='';
    list.forEach(s=>{const d=document.createElement('div');d.className='server-icon'+(s.id===currentServerId?' active':'');d.textContent=s.name[0].toUpperCase();d.title=s.name;d.onclick=()=>openServer(s);el.appendChild(d);});
}
function openServer(server){
    if(memberUnsub){memberUnsub();memberUnsub=null;}
    if(channelUnsub){channelUnsub();channelUnsub=null;}
    if(msgUnsub){msgUnsub();msgUnsub=null;}

    currentServerId=server.id;
    $('channel-server-name').textContent=server.name;
    document.querySelectorAll('.server-icon').forEach(el=>el.classList.toggle('active',el.title===server.name));

    $('server-list').style.display='flex';
    $('channel-list').style.display='flex';
    $('chat-area').style.display='none';
    $('channels').innerHTML='<div style="color:var(--muted);padding:8px 12px;font-size:13px">Yükleniyor...</div>';
    $('members-list').innerHTML='';

    if(!window._userCache)window._userCache={};

    memberUnsub=db.collection('servers').doc(server.id).onSnapshot(async snap=>{
        if(!snap.exists)return;
        currentServerData=snap.data();
        const members=snap.data()?.members||[],roles=snap.data()?.roles||{};
        const list=$('members-list');

        list.innerHTML='';
        members.forEach(m=>{
            const cached=window._userCache[m.uid]||{};
            renderMemberItem(list,m,cached.photoURL||null,cached.status||'offline',roles);
        });

        const now=Date.now();
        const toFetch=members.filter(m=>!window._userCache[m.uid]||(now-window._userCache[m.uid].ts)>120000);
        if(toFetch.length){
            Promise.all(toFetch.map(m=>db.collection('users').doc(m.uid).get())).then(docs=>{
                docs.forEach((u,i)=>{
                    if(u.exists){
                        const m=toFetch[i];
                        window._userCache[m.uid]={photoURL:u.data().photoURL||null,status:u.data().status||'offline',ts:Date.now()};
                    }
                });
                list.innerHTML='';
                members.forEach(m=>{
                    const cached=window._userCache[m.uid]||{};
                    renderMemberItem(list,m,cached.photoURL||null,cached.status||'offline',roles);
                });
                updateChannelOnlineMembers(members);
            }).catch(()=>{});
        }
        updateChannelOnlineMembers(members);
    });

    loadChannels(server.id);
}

function renderMemberItem(list,m,photoURL,status,roles){
    const div=document.createElement('div');div.className='member';
    const avWrap=document.createElement('div');avWrap.style.cssText='position:relative;flex-shrink:0';
    const av=makeAvatar(photoURL,m.name,'member-av');
    const dot=document.createElement('div');dot.className='member-status-dot';dot.style.background=getStatusColor(status);
    avWrap.appendChild(av);avWrap.appendChild(dot);
    const nameEl=document.createElement('span');nameEl.className='member-name';nameEl.textContent=m.name;
    const role=(roles||{})[m.uid]||'member';
    if(role!=='member'){const b=document.createElement('span');b.className='member-role-badge '+(role==='owner'?'role-owner':'role-mod');b.textContent=role==='owner'?'👑':'🛡️';nameEl.appendChild(b);}
    div.appendChild(avWrap);div.appendChild(nameEl);
    div.onclick=()=>showProfile(m.uid,m.name,photoURL,status);
    list.appendChild(div);
}
async function updateChannelOnlineMembers(members){
    const container=$('channel-online-members');if(!container)return;
    const now=Date.now();if(window._lastOnlineUpdate&&(now-window._lastOnlineUpdate)<30000)return;
    window._lastOnlineUpdate=now;
    container.innerHTML='';let count=0;
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center';
    for(const m of members.slice(0,8)){
        try{const cached=window._userCache?.[m.uid];const ud=cached||(await db.collection('users').doc(m.uid).get()).data()||{};if(ud.status&&ud.status!=='offline'){count++;if(count<=5){const av=document.createElement('div');av.style.cssText=`width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#5865f2,#9b59b6);color:white;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-left:${count>1?'-6px':'0'};border:2px solid var(--dark);z-index:${6-count};cursor:pointer;flex-shrink:0`;setAvatarEl(av,ud.photoURL||null,m.name);av.title=m.name;av.onclick=()=>loadAndShowProfile(m.uid,m.name,ud.photoURL);wrap.appendChild(av);}}}catch(e){}
    }
    if(count>0){container.appendChild(wrap);const c=document.createElement('span');c.style.cssText='color:var(--muted);font-size:12px;font-weight:600;margin-left:8px';c.textContent=count+' çevrimiçi';container.appendChild(c);}
}

// ── ROL ──────────────────────────────────────────────────
function openRoleModal(uid,name){roleTargetUid=uid;$('role-target-name').textContent=name+' kullanıcısının rolü';showModal('modal-roles');}
async function setMemberRole(role){if(!roleTargetUid||!currentServerId)return;const roles=currentServerData?.roles||{};roles[roleTargetUid]=role;await db.collection('servers').doc(currentServerId).update({roles});hideModal('modal-roles');hideModal('modal-profile');}

// ── KANALLAR ─────────────────────────────────────────────
function renderChannelList(el,chs,serverId){
    el.innerHTML='';
    const lbl=document.createElement('div');lbl.className='channels-label';lbl.textContent='Kanallar';el.appendChild(lbl);
    chs.forEach(ch=>{const d=document.createElement('div');d.className='channel-item'+(ch.id===currentChannelId?' active':'');d.innerHTML='<span class="ch-hash">#</span>'+ch.name;d.onclick=()=>openChannel(serverId,ch.id,ch.name);el.appendChild(d);});
}

function loadChannels(serverId){
    if(channelUnsub)channelUnsub();
    const ref=db.collection('servers').doc(serverId).collection('channels');
    let firstSnap=true;
    ref.orderBy('createdAt','asc').get().then(snap=>{
        const el=$('channels');
        let chs=[];snap.forEach(d=>chs.push({id:d.id,...d.data()}));
        if(!chs.length){ref.add({name:'genel',createdAt:firebase.firestore.FieldValue.serverTimestamp()});return;}
        renderChannelList(el,chs,serverId);
        if(!currentChannelId||!chs.find(c=>c.id===currentChannelId))openChannel(serverId,chs[0].id,chs[0].name);
        firstSnap=false;
    }).catch(()=>{firstSnap=false;});
    channelUnsub=ref.onSnapshot(snap=>{
        if(firstSnap)return;
        const el=$('channels');
        let chs=[];snap.forEach(d=>chs.push({id:d.id,...d.data()}));
        chs.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        if(!chs.length)return;
        renderChannelList(el,chs,serverId);
    });
}
function openChannel(serverId,channelId,channelName){
    currentChannelId=channelId;
    $('channel-title').textContent='# '+channelName;
    document.querySelectorAll('.channel-item').forEach(el=>el.classList.toggle('active',el.textContent.trim()===channelName));
    cancelReply();
    $('server-list').style.display='none';
    $('channel-list').style.display='none';
    $('members-panel').style.display='none';
    $('chat-area').style.display='flex';
    $('chat-area').style.flex='1';
    sidebarVisible=false;
    const btn=$('sidebar-toggle-btn');if(btn)btn.classList.remove('active');
    if(msgUnsub)msgUnsub();
    if(typingUnsub)typingUnsub();
    try{typingUnsub=db.collection('servers').doc(serverId).collection('channels').doc(channelId).collection('meta').doc('typing').onSnapshot(snap=>{
        const data=snap.data()||{},now=Date.now();
        const typers=Object.entries(data).filter(([uid,i])=>uid!==currentUser?.uid&&i.ts&&(now-i.ts)<4000).map(([,i])=>i.name);
        const ti=$('typing-indicator'),tt=$('typing-text');
        if(typers.length){tt.textContent=typers.join(', ')+' yazıyor';ti.style.display='flex';}else ti.style.display='none';
    },e=>{});}catch(e){}
    let firstLoad=true;
    const q=db.collection('servers').doc(serverId).collection('channels').doc(channelId).collection('messages').orderBy('createdAt','asc').limit(100);
    msgUnsub=q.onSnapshot(snap=>{
        const container=$('messages');
        if(firstLoad){
            firstLoad=false;
            const docs=[];
            snap.forEach(d=>{
                const data = {id:d.id,...d.data()};
                docs.push(data);
                scheduleMessageDelete(currentServerId, currentChannelId, d.id, data.createdAt);
            });
            allMessages=docs;
            renderMessages(allMessages);
            container.scrollTop=container.scrollHeight;
            allMessages.filter(d=>d.uid!==currentUser?.uid&&!(d.readBy||[]).includes(currentUser.uid)).slice(-20)
                .forEach(d=>db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').doc(d.id).update({readBy:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)}).catch(()=>{}));
            return;
        }
        const wasBottom=container.scrollHeight-container.scrollTop<=container.clientHeight+60;
        snap.docChanges().forEach(change=>{
            const data=change.doc.data(),msgId=change.doc.id;
            if(change.type==='added'){
                if(allMessages.find(m=>m.id===msgId))return;
                const msgData = {id:msgId,...data};
                allMessages.push(msgData);
                scheduleMessageDelete(currentServerId, currentChannelId, msgId, data.createdAt);
                container.appendChild(buildMessageEl(msgData));
                if(data.uid!==currentUser?.uid){
                    if(localStorage.getItem('notifSound')!=='false')playNotif();
                    showBrowserNotif(data.name||'Birisi',data.text||'Yeni mesaj');
                    if(!(data.readBy||[]).includes(currentUser.uid))
                        db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').doc(msgId).update({readBy:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)}).catch(()=>{});
                }
            }else if(change.type==='modified'){
                const i=allMessages.findIndex(m=>m.id===msgId);
                if(i!==-1)allMessages[i]={id:msgId,...data};
                const el=container.querySelector('[data-msg-id="'+msgId+'"]');
                if(el){
                    if(data.uid===currentUser?.uid){
                        const ri=el.querySelector('[data-read-info]');
                        if(ri){const r=(data.readBy||[]).filter(x=>x!==currentUser.uid);ri.className='msg-read-info'+(r.length?' seen':'');ri.textContent=r.length?'👁️ '+r.length+' kişi gördü':'✓ Gönderildi';}
                    }
                    if(data.edited){
                        const t=el.querySelector('.msg-text');if(t)t.textContent=data.text;
                        if(!el.querySelector('.msg-edited-tag')){const tm=el.querySelector('.msg-time');if(tm){const tg=document.createElement('span');tg.className='msg-edited-tag';tg.textContent='(düzenlendi)';tm.insertAdjacentElement('afterend',tg);}}
                    }
                }
            }else if(change.type==='removed'){
                allMessages=allMessages.filter(m=>m.id!==msgId);
                const el=container.querySelector('[data-msg-id="'+msgId+'"]');if(el)el.remove();
            }
        });
        if(wasBottom)container.scrollTop=container.scrollHeight;
    },err=>{alert('Chat yüklenemedi: '+err.message);});
}

function buildMessageEl(data, prevData){
    const time=data.createdAt?.toDate().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})||'';
    const sameUser=prevData&&prevData.uid===data.uid;
    const sameWindow=prevData&&data.createdAt&&prevData.createdAt&&(data.createdAt.seconds-prevData.createdAt.seconds)<300;
    const grouped=sameUser&&sameWindow;
    const div=document.createElement('div');div.className='msg'+(grouped?' grouped':'');div.dataset.msgId=data.id;
    
    const msgAvatar = makeAvatar(data.photoURL||null,data.name,'msg-av');
    msgAvatar.style.cursor='pointer';
    msgAvatar.onclick = (e) => { e.stopPropagation(); loadAndShowProfile(data.uid, data.name, data.photoURL||null); };
    div.appendChild(msgAvatar);
    
    const body=document.createElement('div');body.className='msg-body';
    if(data.replyTo){const ref=document.createElement('div');ref.className='msg-reply-ref';ref.innerHTML=`<div class="msg-reply-ref-name">↩ ${data.replyTo.name}</div><div class="msg-reply-ref-text">${data.replyTo.text||'[medya]'}</div>`;ref.onclick=()=>{const c=$('messages');const el=c.querySelector(`[data-msg-id="${data.replyTo.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.background='rgba(88,101,242,0.15)';setTimeout(()=>el.style.background='',1500);}};body.appendChild(ref);}
    const hdr=document.createElement('div');
    const ns=document.createElement('span');ns.className='msg-name';ns.style.cursor='pointer';ns.textContent=data.name||'Kullanıcı';
    ns.onclick=e=>{e.stopPropagation();loadAndShowProfile(data.uid,data.name,data.photoURL||null).catch(err=>alert('Profil açılamadı: '+err.message));};
    const ts=document.createElement('span');ts.className='msg-time';ts.textContent=time;
    
    const remaining = getRemainingTime(data.createdAt);
    if (remaining) {
        const ttl = document.createElement('span');
        ttl.className = 'msg-ttl';
        ttl.style.cssText = 'color:#ed4245;font-size:10px;margin-left:6px;opacity:0.7;';
        ttl.textContent = '⏱️' + remaining;
        ts.appendChild(ttl);
    }
    
    hdr.appendChild(ns);hdr.appendChild(ts);
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
    const c=$('messages');c.innerHTML='';
    db.collection('users').doc(currentUser.uid).get().then(uDoc=>{
        const blocked=uDoc.data()?.blocked||[];
        msgs.forEach(data=>{if(!blocked.includes(data.uid))c.appendChild(buildMessageEl(data));});
    }).catch(()=>msgs.forEach(data=>c.appendChild(buildMessageEl(data))));
}

// ── CONTEXT MENU ─────────────────────────────────────────
function showContextMenu(e,data){
    contextMsgData=data;const menu=$('msg-context-menu');
    $('ctx-edit-btn').style.display=data.uid===currentUser?.uid&&data.type==='text'?'block':'none';
    $('ctx-delete-btn').style.display=canDeleteMsg(data.uid)?'block':'none';
    menu.style.display='block';
    menu.style.left=Math.min(e.clientX,window.innerWidth-160)+'px';
    menu.style.top=Math.min(e.clientY,window.innerHeight-130)+'px';
}
function contextReply(){if(!contextMsgData)return;replyTo={id:contextMsgData.id,name:contextMsgData.name,text:contextMsgData.text||'[medya]'};$('reply-preview').style.display='block';$('reply-preview-name').textContent=contextMsgData.name;$('reply-preview-text').textContent=contextMsgData.text||'[medya]';$('msg-input').focus();$('msg-context-menu').style.display='none';}
function contextEdit(){
    if(!contextMsgData)return;$('msg-context-menu').style.display='none';
    const el=$('messages').querySelector(`[data-msg-id="${contextMsgData.id}"]`);if(!el)return;
    const t=el.querySelector('.msg-text');if(!t)return;t.style.display='none';
    const wrap=document.createElement('div');wrap.className='msg-edit-wrap';
    const input=document.createElement('input');input.className='msg-edit-input';input.value=t.textContent;
    const save=document.createElement('button');save.className='msg-edit-save';save.textContent='Kaydet';
    const cancel=document.createElement('button');cancel.className='msg-edit-cancel';cancel.textContent='İptal';
    save.onclick=async()=>{const nt=input.value.trim();if(!nt)return;await db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').doc(contextMsgData.id).update({text:nt,edited:true});wrap.remove();t.style.display='';};
    cancel.onclick=()=>{wrap.remove();t.style.display='';};
    wrap.appendChild(input);wrap.appendChild(save);wrap.appendChild(cancel);t.parentNode.insertBefore(wrap,t.nextSibling);input.focus();
}
function contextDelete(){if(!contextMsgData)return;$('msg-context-menu').style.display='none';if(!confirm('Mesajı sil?'))return;db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').doc(contextMsgData.id).delete();}
function cancelReply(){replyTo=null;$('reply-preview').style.display='none';}

// ── YAZIYOR ──────────────────────────────────────────────
async function handleTyping(){
    if(!currentUser||!currentServerId||!currentChannelId)return;
    const now=Date.now();if(now-_lastTypingWrite<2000)return;
    _lastTypingWrite=now;
    const ref=db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('meta').doc('typing');
    await ref.set({[currentUser.uid]:{name:currentUser.displayName||currentUser.email,ts:now}},{merge:true});
    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(()=>ref.set({[currentUser.uid]:{name:'',ts:0}},{merge:true}),5000);
}

// ── MESAJ GÖNDER ─────────────────────────────────────────
async function sendMessage(){
    const input=$('msg-input');const text=input.value.trim();
    if(!text){return;}
    if(!currentServerId){alert('Sunucu seçilmedi, sayfayı yenile.');return;}
    if(!currentChannelId){alert('Kanal seçilmedi, sayfayı yenile.');return;}
    if(!currentUser){alert('Giriş yapılmadı.');return;}
    input.value='';clearTimeout(typingTimeout);
    const msgData={text,name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'text',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(replyTo){msgData.replyTo=replyTo;cancelReply();}
    try{
        await db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').add(msgData);
        db.collection('users').doc(currentUser.uid).update({msgCount:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
    }catch(e){
        input.value=text;
        alert('Mesaj gönderilemedi: '+e.message+'\n\nServerId: '+currentServerId+'\nChannelId: '+currentChannelId);
    }
}
async function addChannel(){const name=$('new-channel-name').value.trim().toLowerCase().replace(/\s+/g,'-');const err=$('channel-error');if(!name){err.textContent='Kanal adı girin.';return;}await db.collection('servers').doc(currentServerId).collection('channels').add({name,createdAt:firebase.firestore.FieldValue.serverTimestamp()});hideModal('modal-add-channel');$('new-channel-name').value='';}
async function createServer(){
    const name=$('new-server-name').value.trim();const err=$('create-error');if(!name){err.textContent='Sunucu adı girin.';return;}
    const inviteCode=Math.random().toString(36).substring(2,8).toUpperCase();
    const ref=await db.collection('servers').add({name,inviteCode,ownerId:currentUser.uid,public:true,members:[{uid:currentUser.uid,name:currentUser.displayName||currentUser.email}],roles:{[currentUser.uid]:'owner'},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    await db.collection('users').doc(currentUser.uid).update({servers:firebase.firestore.FieldValue.arrayUnion({id:ref.id,name})});
    hideModal('modal-create');$('new-server-name').value='';loadUserServers();
}
async function joinServer(){
    const input=$('join-code').value.trim();const err=$('join-error');
    if(!input){err.style.color='#ed4245';err.textContent='Kod veya sunucu adı girin.';return;}
    err.style.color='#949ba4';err.textContent='Aranıyor...';
    let snap=await db.collection('servers').where('inviteCode','==',input.toUpperCase()).get();
    if(snap.empty)snap=await db.collection('servers').where('name','==',input).get();
    if(snap.empty){
        const all=await db.collection('servers').get();
        const found=all.docs.find(d=>d.data().name?.toLowerCase()===input.toLowerCase());
        if(found)snap={empty:false,docs:[found]};else{err.style.color='#ed4245';err.textContent='Sunucu bulunamadı.';return;}
    }
    const sd=snap.docs[0];
    if((sd.data().members||[]).some(m=>m.uid===currentUser.uid)){err.style.color='#faa61a';err.textContent='Zaten bu sunucudasın.';return;}
    await sd.ref.update({members:firebase.firestore.FieldValue.arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})});
    await db.collection('users').doc(currentUser.uid).update({servers:firebase.firestore.FieldValue.arrayUnion({id:sd.id,name:sd.data().name})});
    err.style.color='#23a55a';err.textContent='✅ Katıldın!';
    setTimeout(()=>{hideModal('modal-join');$('join-code').value='';loadUserServers();},800);
}
async function showInvite(){if(!currentServerId)return;const snap=await db.collection('servers').doc(currentServerId).get();$('invite-code').textContent=snap.data()?.inviteCode||'???';showModal('modal-invite');}
function copyInvite(){navigator.clipboard.writeText($('invite-code').textContent);const btn=event.target;btn.textContent='✅ Kopyalandı!';setTimeout(()=>btn.textContent='Kopyala',2000);}

// ── DOSYA ────────────────────────────────────────────────
function openFilePicker(){$('file-input').click();}
async function onFileSelected(input){
    const file=input.files[0];if(!file)return;if(file.size>5*1024*1024){alert('5MB\'dan küçük olmalı.');return;}
    const reader=new FileReader();
    reader.onload=async e=>{const b64=e.target.result,isImg=file.type.startsWith('image/');const md={name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:isImg?'image':'file',fileData:b64,fileName:file.name,fileSize:(file.size/1024).toFixed(1)+' KB',text:'',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()};if(replyTo){md.replyTo=replyTo;cancelReply();}await db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').add(md);};
    reader.readAsDataURL(file);input.value='';
}
function openImage(src){const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';const img=document.createElement('img');img.src=src;img.style.cssText='max-width:95vw;max-height:95vh;border-radius:8px';o.appendChild(img);o.onclick=()=>document.body.removeChild(o);document.body.appendChild(o);}

// ── AVATAR ───────────────────────────────────────────────
function openAvatarPicker(){$('avatar-file-input').click();}
async function onAvatarSelected(input){
    const file=input.files[0];if(!file)return;if(file.size>700*1024){alert('700KB\'dan küçük olmalı.');return;}
    const reader=new FileReader();
    reader.onload=async e=>{const b64=e.target.result;window._userPhotoURL=b64;await db.collection('users').doc(currentUser.uid).update({photoURL:b64});setAvatarEl($('my-avatar'),b64,currentUser.displayName);setAvatarEl($('settings-avatar'),b64,currentUser.displayName);alert('✅ Fotoğraf güncellendi!');};
    reader.readAsDataURL(file);
}

// ── SES KAYDI ────────────────────────────────────────────
async function startVoiceRecord(e){
    if(e)e.preventDefault();if(mediaRecorder&&mediaRecorder.state==='recording')return;
    try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        audioChunks=[];isCancelled=false;
        mediaRecorder=new MediaRecorder(stream);
        mediaRecorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.push(e.data);};
        mediaRecorder.onstop=async()=>{
            stream.getTracks().forEach(t=>t.stop());clearInterval(voiceTimerInterval);
            $('voice-recording-indicator').style.display='none';$('voice-btn').classList.remove('recording');
            if(isCancelled||!audioChunks.length)return;
            const blob=new Blob(audioChunks,{type:'audio/webm'});if(blob.size>5*1024*1024){alert('Çok uzun.');return;}
            const reader=new FileReader();reader.onload=async ev=>{await db.collection('servers').doc(currentServerId).collection('channels').doc(currentChannelId).collection('messages').add({name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'audio',fileData:ev.target.result,duration:formatDuration(voiceSeconds),text:'',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()});};reader.readAsDataURL(blob);
        };
        mediaRecorder.start();voiceSeconds=0;$('voice-timer').textContent='0:00';
        $('voice-recording-indicator').style.display='flex';$('voice-btn').classList.add('recording');
        voiceTimerInterval=setInterval(()=>{voiceSeconds++;$('voice-timer').textContent=formatDuration(voiceSeconds);if(voiceSeconds>=120)stopVoiceRecord();},1000);
    }catch(e){alert('Mikrofon erişimi reddedildi.');}
}
function stopVoiceRecord(e){if(e)e.preventDefault();if(mediaRecorder&&mediaRecorder.state==='recording'){if(voiceSeconds<1)isCancelled=true;mediaRecorder.stop();}}
function cancelVoiceRecord(){isCancelled=true;if(mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop();clearInterval(voiceTimerInterval);$('voice-recording-indicator').style.display='none';$('voice-btn').classList.remove('recording');}
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

// ── DM SES KAYDI ─────────────────────────────────────────
async function startDMVoiceRecord(e){
    if(e)e.preventDefault();if(dmMediaRecorder&&dmMediaRecorder.state==='recording')return;
    try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        dmAudioChunks=[];dmVoiceCancelled=false;
        dmMediaRecorder=new MediaRecorder(stream);
        dmMediaRecorder.ondataavailable=e=>{if(e.data.size>0)dmAudioChunks.push(e.data);};
        dmMediaRecorder.onstop=async()=>{
            stream.getTracks().forEach(t=>t.stop());clearInterval(dmVoiceTimer);
            $('dm-voice-recording-indicator').style.display='none';$('dm-voice-btn').classList.remove('recording');
            if(dmVoiceCancelled||!dmAudioChunks.length||!currentDMPartner)return;
            const blob=new Blob(dmAudioChunks,{type:'audio/webm'});
            const reader=new FileReader();reader.onload=async ev=>{const dmId=getDMId(currentUser.uid,currentDMPartner.uid);await db.collection('dms').doc(dmId).collection('messages').add({name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'audio',fileData:ev.target.result,duration:formatDuration(dmVoiceSeconds),text:'',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()});};reader.readAsDataURL(blob);
        };
        dmMediaRecorder.start();dmVoiceSeconds=0;$('dm-voice-timer').textContent='0:00';
        $('dm-voice-recording-indicator').style.display='flex';$('dm-voice-btn').classList.add('recording');
        dmVoiceTimer=setInterval(()=>{dmVoiceSeconds++;$('dm-voice-timer').textContent=formatDuration(dmVoiceSeconds);if(dmVoiceSeconds>=120)stopDMVoiceRecord();},1000);
    }catch(e){alert('Mikrofon erişimi reddedildi.');}
}
function stopDMVoiceRecord(e){if(e)e.preventDefault();if(dmMediaRecorder&&dmMediaRecorder.state==='recording'){if(dmVoiceSeconds<1)dmVoiceCancelled=true;dmMediaRecorder.stop();}}
function cancelDMVoiceRecord(){dmVoiceCancelled=true;if(dmMediaRecorder&&dmMediaRecorder.state==='recording')dmMediaRecorder.stop();clearInterval(dmVoiceTimer);$('dm-voice-recording-indicator').style.display='none';$('dm-voice-btn').classList.remove('recording');}

// ── AYARLAR ──────────────────────────────────────────────
function loadSettingsModal(){
    if(!currentUser)return;
    $('settings-displayname').value=currentUser.displayName||'';
    $('settings-name-display').textContent=currentUser.displayName||'';
    setAvatarEl($('settings-avatar'),window._userPhotoURL,currentUser.displayName);
    applyFrameToEl($('settings-avatar'),selectedFrame);
    const theme=localStorage.getItem('theme')||'dark';
    $('theme-dark').classList.toggle('active',theme==='dark');
    $('theme-light').classList.toggle('active',theme==='light');
    $('lang-tr').classList.toggle('active',(localStorage.getItem('lang')||'tr')==='tr');
    $('lang-en').classList.toggle('active',localStorage.getItem('lang')==='en');
    $('notif-sound').checked=localStorage.getItem('notifSound')!=='false';
    const nb=$('notif-browser');if(nb)nb.checked=localStorage.getItem('browserNotif')==='true'&&Notification.permission==='granted';
    const st=localStorage.getItem('userStatus')||'online';
    document.querySelectorAll('.status-option').forEach(el=>el.classList.toggle('active',el.dataset.status===st));
    db.collection('users').doc(currentUser.uid).get().then(uDoc=>{const count=uDoc.data()?.msgCount||0;const badge=getBadge(count);const el=$('settings-badge-display');if(el&&badge)el.innerHTML=`<span class="msg-badge ${badge.cls}">${badge.label} — ${count} mesaj</span>`;});
}
async function saveDisplayName(){const name=$('settings-displayname').value.trim();const msg=$('name-msg');if(!name){msg.style.color='#ed4245';msg.textContent='Ad boş olamaz.';return;}try{await currentUser.updateProfile({displayName:name});await db.collection('users').doc(currentUser.uid).update({displayName:name});$('my-name').textContent=name;$('settings-name-display').textContent=name;msg.style.color='#23a55a';msg.textContent='✅ Güncellendi!';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}}
async function changePassword(){const pw=$('settings-newpass').value;const msg=$('pass-msg');if(pw.length<6){msg.style.color='#ed4245';msg.textContent='En az 6 karakter.';return;}try{await currentUser.updatePassword(pw);msg.style.color='#23a55a';msg.textContent='✅ Şifre güncellendi!';$('settings-newpass').value='';setTimeout(()=>msg.textContent='',2500);}catch(e){msg.style.color='#ed4245';msg.textContent=e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message;}}
function saveSetting(k,v){localStorage.setItem(k,v);}
function setTheme(theme){localStorage.setItem('theme',theme);applyTheme(theme);$('theme-dark').classList.toggle('active',theme==='dark');$('theme-light').classList.toggle('active',theme==='light');}
function setLang(lang){localStorage.setItem('lang',lang);$('lang-tr').classList.toggle('active',lang==='tr');$('lang-en').classList.toggle('active',lang==='en');}
async function leaveServer(){if(!currentServerId){alert('Önce bir sunucu seç.');return;}if(!confirm('Sunucudan ayrıl?'))return;try{const sRef=db.collection('servers').doc(currentServerId);const sSnap=await sRef.get();await sRef.update({members:(sSnap.data()?.members||[]).filter(m=>m.uid!==currentUser.uid)});const uSnap=await db.collection('users').doc(currentUser.uid).get();await db.collection('users').doc(currentUser.uid).update({servers:(uSnap.data()?.servers||[]).filter(s=>s.id!==currentServerId)});hideModal('modal-settings');currentServerId=null;currentChannelId=null;loadUserServers();}catch(e){alert('Hata: '+e.message);}}
async function deleteAccount(){if(!confirm('Hesabını sil?'))return;if(!confirm('Son onay?'))return;try{await db.collection('users').doc(currentUser.uid).delete();await currentUser.delete();}catch(e){alert(e.code==='auth/requires-recent-login'?'Çıkış yapıp tekrar giriş yap.':'Hata: '+e.message);}}

// ── PROFİL ───────────────────────────────────────────────
async function showProfile(uid,name,photoURL,status){
    try{
    const now=Date.now();
    if(window._userCache?.[uid]&&(now-window._userCache[uid].ts)<60000){
        const c=window._userCache[uid];
        if(c.photoURL)photoURL=c.photoURL;
        if(c.status)status=c.status;
    }
    setAvatarEl($('profile-av'),photoURL,name);
    try{const uDoc=await db.collection('users').doc(uid).get();applyFrameToEl($('profile-av'),uDoc.data()?.profileFrame||'none');}catch(e){}
    $('profile-username').textContent=name;
    $('profile-tag').textContent='@ '+uid.substring(0,6).toLowerCase();
    const sl={online:'🟢 Çevrimiçi',idle:'🌙 Boşta',dnd:'⛔ Rahatsız Etme',offline:'⚫ Çevrimdışı'};
    $('profile-status-text').textContent=sl[status]||'⚫ Çevrimdışı';
    const roleBadge=$('profile-role-badge');roleBadge.innerHTML='';
    const badgesDiv=document.createElement('div');badgesDiv.className='profile-badges';
    if(currentServerData){const role=(currentServerData.roles||{})[uid]||'member';if(role!=='member'){const rb=document.createElement('span');rb.className='role-badge '+(role==='owner'?'role-owner':'role-mod');rb.textContent=role==='owner'?'👑 Sunucu Sahibi':'🛡️ Moderatör';badgesDiv.appendChild(rb);}}
    try{const uDoc=await db.collection('users').doc(uid).get();const count=uDoc.data()?.msgCount||0;const badge=getBadge(count);if(badge){const mb=document.createElement('span');mb.className='msg-badge '+badge.cls;mb.textContent=badge.label+' ('+count+' mesaj)';badgesDiv.appendChild(mb);}}catch(e){}
    if(badgesDiv.children.length)roleBadge.appendChild(badgesDiv);
    const likeWrap=document.createElement('div');likeWrap.style.cssText='text-align:center;margin:10px 0 4px';
    if(uid!==currentUser?.uid){
        try{const likeDoc=await db.collection('users').doc(uid).get();const likes=likeDoc.data()?.likes||[];const liked=likes.includes(currentUser.uid);
        const likeBtn=document.createElement('button');likeBtn.className='like-btn'+(liked?' liked':'');likeBtn.innerHTML=`${liked?'❤️':'🤍'} <span class="like-count">${likes.length}</span>`;
        likeBtn.onclick=async()=>{const snap=await db.collection('users').doc(uid).get();const curLikes=snap.data()?.likes||[];if(curLikes.includes(currentUser.uid)){await db.collection('users').doc(uid).update({likes:curLikes.filter(l=>l!==currentUser.uid)});likeBtn.className='like-btn';likeBtn.innerHTML=`🤍 <span class="like-count">${curLikes.length-1}</span>`;}else{await db.collection('users').doc(uid).update({likes:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});likeBtn.className='like-btn liked';likeBtn.innerHTML=`❤️ <span class="like-count">${curLikes.length+1}</span>`;}};
        likeWrap.appendChild(likeBtn);}catch(e){}
    }
    const existLW=$('profile-like-wrap');
    likeWrap.id='profile-like-wrap';
    if(existLW)existLW.replaceWith(likeWrap);else{$('profile-status-text').insertAdjacentElement('afterend',likeWrap);}
    const actions=$('profile-actions');actions.innerHTML='';
    if(uid===currentUser.uid){actions.innerHTML='<button class="p-btn gray" style="width:100%">Senin Profilin</button>';}
    else{
        const myDoc=await db.collection('users').doc(currentUser.uid).get();const myData=myDoc.data()||{};
        const friends=myData.friends||[],sent=myData.sentRequests||[],blocked=myData.blocked||[];
        if(blocked.includes(uid)){const ub=document.createElement('button');ub.className='p-btn gray';ub.textContent='🔓 Engeli Kaldır';ub.style.width='100%';ub.onclick=async()=>{const s=await db.collection('users').doc(currentUser.uid).get();await db.collection('users').doc(currentUser.uid).update({blocked:(s.data()?.blocked||[]).filter(b=>b!==uid)});hideModal('modal-profile');};actions.appendChild(ub);}
        else{
            const dm=document.createElement('button');dm.className='p-btn blue';dm.textContent='💬 Mesaj Gönder';dm.style.cssText='width:100%;margin-bottom:6px';dm.onclick=()=>openDMFromProfile(uid,name,photoURL,status);actions.appendChild(dm);
            if(friends.includes(uid)){const r=document.createElement('button');r.className='p-btn red';r.textContent='✕ Arkadaşlıktan Çıkar';r.style.cssText='width:100%;margin-bottom:6px';r.onclick=()=>removeFriend(uid,name);actions.appendChild(r);}
            else if(sent.includes(uid)){const p=document.createElement('button');p.className='p-btn gray';p.textContent='⏳ İstek Gönderildi';p.style.cssText='width:100%;margin-bottom:6px';p.disabled=true;actions.appendChild(p);}
            else{const a=document.createElement('button');a.className='p-btn blue';a.textContent='➕ Arkadaş Ekle';a.style.cssText='width:100%;margin-bottom:6px';a.onclick=()=>{sendFriendRequestToUid(uid,name);a.textContent='⏳ İstek Gönderildi';a.disabled=true;};actions.appendChild(a);}
            const blk=document.createElement('button');blk.className='p-btn red';blk.textContent='🚫 Engelle';blk.style.cssText='width:100%;margin-bottom:6px';blk.onclick=async()=>{if(!confirm(name+' engellensin mi?'))return;await db.collection('users').doc(currentUser.uid).update({blocked:firebase.firestore.FieldValue.arrayUnion(uid)});hideModal('modal-profile');};actions.appendChild(blk);
            if(getMyRole()==='owner'&&uid!==currentUser.uid){const rb=document.createElement('button');rb.className='p-btn gray';rb.textContent='👑 Rol Değiştir';rb.style.cssText='width:100%;margin-top:2px';rb.onclick=()=>openRoleModal(uid,name);actions.appendChild(rb);}
        }
    }
    showModal('modal-profile');
    }catch(err){alert('Profil yüklenemedi: '+err.message);}
}
async function loadAndShowProfile(uid,name,photoURL){
    let ph=photoURL||null,st='offline';
    try{const u=await db.collection('users').doc(uid).get();if(u.exists){ph=u.data().photoURL||ph;st=u.data().status||'offline';}}catch(e){}
    showProfile(uid,name,ph,st);
}

// ── ARKADAŞ ──────────────────────────────────────────────
async function sendFriendRequest(){
    const searchName=$('friend-search-input').value.trim();const msg=$('friend-msg');
    if(!searchName){msg.style.color='#ed4245';msg.textContent='Kullanıcı adı girin.';return;}
    msg.style.color='#949ba4';msg.textContent='Aranıyor...';
    const allSnap=await db.collection('users').get();
    let found=null;allSnap.forEach(d=>{if((d.data().displayName||'').toLowerCase()===searchName.toLowerCase()&&d.id!==currentUser.uid)found=d;});
    if(!found){msg.style.color='#ed4245';msg.textContent='Kullanıcı bulunamadı.';return;}
    await sendFriendRequestToUid(found.id,found.data().displayName);$('friend-search-input').value='';
}
async function sendFriendRequestToUid(targetUid,targetName){
    const msg=$('friend-msg');
    try{await db.collection('users').doc(targetUid).update({friendRequests:firebase.firestore.FieldValue.arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})});await db.collection('users').doc(currentUser.uid).update({sentRequests:firebase.firestore.FieldValue.arrayUnion(targetUid)});if(msg){msg.style.color='#23a55a';msg.textContent='✅ İstek gönderildi!';setTimeout(()=>{if(msg)msg.textContent='';},2500);}hideModal('modal-profile');}catch(e){if(msg){msg.style.color='#ed4245';msg.textContent='Hata: '+e.message;}}
}
async function removeFriend(targetUid,targetName){
    if(!confirm(`${targetName} arkadaşlıktan çıkarılsın mı?`))return;
    const mySnap=await db.collection('users').doc(currentUser.uid).get();const theirSnap=await db.collection('users').doc(targetUid).get();
    await db.collection('users').doc(currentUser.uid).update({friends:(mySnap.data()?.friends||[]).filter(f=>f!==targetUid)});
    await db.collection('users').doc(targetUid).update({friends:(theirSnap.data()?.friends||[]).filter(f=>f!==currentUser.uid)});
    hideModal('modal-profile');loadFriends();
}
function showFriendTab(tab){$('ftab-all').classList.toggle('active',tab==='all');$('ftab-pending').classList.toggle('active',tab==='pending');loadFriends(tab);}
async function loadFriends(tab='all'){
    const list=$('friends-list');list.innerHTML='<div class="empty-state"><div class="e-icon">⏳</div>Yükleniyor...</div>';
    const uDoc=await db.collection('users').doc(currentUser.uid).get();const data=uDoc.data()||{};
    if(tab==='all'){
        const friends=data.friends||[];if(!friends.length){list.innerHTML='<div class="empty-state"><div class="e-icon">👥</div>Henüz arkadaşın yok.</div>';return;}
        list.innerHTML='';
        try{
            const results=await Promise.all(friends.map(fUid=>db.collection('users').doc(fUid).get()));
            results.forEach((fd,i)=>{if(fd.exists){const d=fd.data();list.appendChild(createFriendItem(friends[i],d.displayName||'Kullanıcı',d.photoURL,d.status,'friend'));}});
        }catch(e){}
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
    const mySnap=await db.collection('users').doc(currentUser.uid).get();
    await db.collection('users').doc(currentUser.uid).update({friends:firebase.firestore.FieldValue.arrayUnion(fromUid),friendRequests:(mySnap.data()?.friendRequests||[]).filter(r=>r.uid!==fromUid)});
    await db.collection('users').doc(fromUid).update({friends:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});
    loadFriends('pending');updateFriendBadge();
}
async function rejectFriendRequest(fromUid){
    const mySnap=await db.collection('users').doc(currentUser.uid).get();
    await db.collection('users').doc(currentUser.uid).update({friendRequests:(mySnap.data()?.friendRequests||[]).filter(r=>r.uid!==fromUid)});
    loadFriends('pending');updateFriendBadge();
}
async function updateFriendBadge(){
    if(!currentUser)return;
    try{const uDoc=await db.collection('users').doc(currentUser.uid).get();const count=(uDoc.data()?.friendRequests||[]).length;['req-badge','friends-badge'].forEach(id=>{const el=$(id);if(el){el.textContent=count;el.style.display=count>0?'inline':'none';}});}catch(e){}
}
setInterval(updateFriendBadge,600000);

// ── DM ───────────────────────────────────────────────────
async function openDMList(){$('dm-screen').style.display='flex';$('main-layout').style.display='none';loadDMList();}
function closeDM(){$('dm-screen').style.display='none';$('main-layout').style.display='flex';if(dmMsgUnsub){dmMsgUnsub();dmMsgUnsub=null;}if(dmTypingUnsub){dmTypingUnsub();dmTypingUnsub=null;}currentDMPartner=null;}
async function loadDMList(){
    const list=$('dm-list');list.innerHTML='<div style="color:var(--muted);padding:12px;font-size:13px">Yükleniyor...</div>';
    const uDoc=await db.collection('users').doc(currentUser.uid).get();const friends=uDoc.data()?.friends||[];
    if(!friends.length){list.innerHTML='<div style="color:var(--muted);padding:12px;font-size:13px;text-align:center">Arkadaş ekleyerek DM başlat!</div>';return;}
    list.innerHTML='';
    const friendDocs=await Promise.all(friends.map(fUid=>db.collection('users').doc(fUid).get().catch(()=>null)));
    for(let fi=0;fi<friends.length;fi++){
        const fUid=friends[fi];
        try{
            const fDoc=friendDocs[fi];if(!fDoc||!fDoc.exists)continue;const fData=fDoc.data()||{};
            const dmId=getDMId(currentUser.uid,fUid);
            let preview='Henüz mesaj yok',hasUnread=false;
            try{const lm=await db.collection('dms').doc(dmId).collection('messages').orderBy('createdAt','desc').limit(1).get();if(!lm.empty){const ld=lm.docs[0].data();preview=ld.type==='text'?(ld.text||'').substring(0,30):ld.type==='image'?'📷 Fotoğraf':'📎 Dosya';if(ld.uid!==currentUser.uid&&!ld.readBy?.includes(currentUser.uid))hasUnread=true;}}catch(e){}
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
function filterDMList(){
    const q=document.getElementById('dm-search')?.value.toLowerCase()||'';
    document.querySelectorAll('#dm-list .dm-item').forEach(item=>{
        const name=item.querySelector('.dm-item-name')?.textContent.toLowerCase()||'';
        item.style.display=name.includes(q)?'':'none';
    });
}

async function openDMChat(uid,name,photoURL,status){
    currentDMPartner={uid,name,photoURL};
    setAvatarEl($('dm-partner-av'),photoURL,name);
    $('dm-partner-name').textContent=name;
    $('dm-partner-status').style.background=getStatusColor(status);
    if(dmMsgUnsub)dmMsgUnsub();if(dmTypingUnsub)dmTypingUnsub();
    const dmId=getDMId(currentUser.uid,uid);
    dmTypingUnsub=db.collection('dms').doc(dmId).collection('meta').doc('typing').onSnapshot(snap=>{
        const data=snap.data()||{},now=Date.now();
        const typers=Object.entries(data).filter(([tUid,i])=>tUid!==currentUser.uid&&i.ts&&(now-i.ts)<4000).map(([,i])=>i.name);
        const ti=$('dm-typing-indicator'),tt=$('dm-typing-text');
        if(typers.length){tt.textContent=typers[0]+' yazıyor';ti.style.display='flex';}else ti.style.display='none';
    });
    dmMsgUnsub=db.collection('dms').doc(dmId).collection('messages').orderBy('createdAt','asc').onSnapshot(async snap=>{
        const container=$('dm-messages');const wasBottom=container.scrollHeight-container.scrollTop<=container.clientHeight+60;
        container.innerHTML='';
        snap.forEach(d=>{
            scheduleDMDelete(dmId, d.id, d.data().createdAt);
            const data=d.data();const time=data.createdAt?.toDate().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})||'';
            const isMe=data.uid===currentUser?.uid;
            const div=document.createElement('div');div.className='msg'+(isMe?' msg-mine':'');
            if(!isMe)div.appendChild(makeAvatar(data.photoURL||null,data.name,'msg-av'));
            const body=document.createElement('div');body.className='msg-body';
            body.innerHTML=`<div><span class="msg-name" style="${isMe?'display:none':''}">${data.name||'Kullanıcı'}</span><span class="msg-time">${time}</span></div>`;
            if(data.type==='image'){const img=document.createElement('img');img.src=data.fileData;img.className='msg-image';img.onclick=()=>openImage(data.fileData);body.appendChild(img);}
            else if(data.type==='file'){const a=document.createElement('a');a.href=data.fileData;a.download=data.fileName;a.className='msg-file';a.innerHTML=`📎 ${data.fileName}`;body.appendChild(a);}
            else if(data.type==='audio'){body.appendChild(renderAudioMessage(data.fileData,data.duration));}
            else{const t=document.createElement('span');t.className='msg-text';t.textContent=data.text;body.appendChild(t);}
            if(data.uid===currentUser.uid){const ri=document.createElement('div');const r=(data.readBy||[]).filter(x=>x!==currentUser.uid);ri.className='msg-read-info'+(r.length?' seen':'');ri.textContent=r.length?'👁️ Görüldü':'✓ Gönderildi';body.appendChild(ri);}
            div.appendChild(body);container.appendChild(div);
            if(data.uid!==currentUser.uid&&!data.readBy?.includes(currentUser.uid))db.collection('dms').doc(dmId).collection('messages').doc(d.id).update({readBy:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)}).catch(()=>{});
        });
        if(wasBottom)container.scrollTop=container.scrollHeight;
    });
    loadDMList();
}
async function sendDMMessage(){
    const input=$('dm-input');const text=input.value.trim();if(!text||!currentDMPartner)return;
    input.value='';clearTimeout(dmTypingTimeout);
    const dmId=getDMId(currentUser.uid,currentDMPartner.uid);
    try{await db.collection('dms').doc(dmId).collection('meta').doc('typing').set({[currentUser.uid]:{name:'',ts:0}},{merge:true});}catch(e){}
    await db.collection('dms').doc(dmId).collection('messages').add({text,name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:'text',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()});
}
async function handleDMTyping(){
    if(!currentDMPartner)return;const dmId=getDMId(currentUser.uid,currentDMPartner.uid);
    await db.collection('dms').doc(dmId).collection('meta').doc('typing').set({[currentUser.uid]:{name:currentUser.displayName||currentUser.email,ts:Date.now()}},{merge:true});
    clearTimeout(dmTypingTimeout);dmTypingTimeout=setTimeout(async()=>await db.collection('dms').doc(dmId).collection('meta').doc('typing').set({[currentUser.uid]:{name:'',ts:0}},{merge:true}),5000);
}
function openDMFilePicker(){$('dm-file-input').click();}
async function onDMFileSelected(input){
    const file=input.files[0];if(!file||!currentDMPartner)return;if(file.size>5*1024*1024){alert('5MB\'dan küçük olmalı.');return;}
    const reader=new FileReader();reader.onload=async e=>{const b64=e.target.result,isImg=file.type.startsWith('image/');const dmId=getDMId(currentUser.uid,currentDMPartner.uid);await db.collection('dms').doc(dmId).collection('messages').add({name:currentUser.displayName||currentUser.email,photoURL:window._userPhotoURL||null,uid:currentUser.uid,type:isImg?'image':'file',fileData:b64,fileName:file.name,fileSize:(file.size/1024).toFixed(1)+' KB',text:'',readBy:[currentUser.uid],createdAt:firebase.firestore.FieldValue.serverTimestamp()});};
    reader.readAsDataURL(file);input.value='';
}
async function openDMFromProfile(uid,name,photoURL,status){hideModal('modal-profile');$('dm-screen').style.display='flex';$('main-layout').style.display='none';await loadDMList();openDMChat(uid,name,photoURL,status);}

// ── KEŞFET ───────────────────────────────────────────────
function showDiscover(){showModal('modal-discover');loadDiscover();}

async function startDMCall(type){
    if(!currentDMPartner){alert('Önce bir DM aç.');return;}
    try{localStream=await navigator.mediaDevices.getUserMedia({video:type==='video',audio:true});}catch(e){alert('Mikrofon/kamera erişimi reddedildi.');return;}
    await requestWakeLock();pc=new RTCPeerConnection(iceServers);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    $('local-video').srcObject=localStream;if(type!=='video')$('local-video').style.display='none';
    pc.ontrack=e=>{$('remote-video').srcObject=e.streams[0];};
    const callRef=db.collection('calls').doc();currentCallId=callRef.id;
    pc.onicecandidate=async e=>{if(e.candidate)await callRef.collection('offerCandidates').add(e.candidate.toJSON());};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await callRef.set({offer:{type:offer.type,sdp:offer.sdp},callType:type,callerName:currentUser.displayName||currentUser.email,callerUid:currentUser.uid,targetUid:currentDMPartner.uid,dmCall:true,status:'ringing',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    const callPartnerName = currentServerData?.members?.find(m=>m.uid!==currentUser.uid)?.name || 'Arama';
    setCallPartnerInfo(currentDMPartner?.name||'Arama', currentDMPartner?.photoURL||null);
    $('call-screen').style.display='flex';$('call-status').textContent='Bağlanıyor...';$('remote-video').style.display=type==='video'?'block':'none';
    callRef.onSnapshot(async snap=>{const data=snap.data();if(!data)return;if(data.answer&&!pc.currentRemoteDescription){await pc.setRemoteDescription(new RTCSessionDescription(data.answer));$('call-status').textContent='Bağlandı ✅';}if(data.status==='rejected'||data.status==='ended')endCall();});
    callRef.collection('answerCandidates').onSnapshot(snap=>{snap.docChanges().forEach(c=>{if(c.type==='added')pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));});});
}

async function loadDiscover(){
    const list=$('discover-list');list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Yükleniyor...</div>';
    try{const snap=await db.collection('servers').get();allDiscoverServers=[];snap.forEach(d=>{const data=d.data();if(data.public!==false)allDiscoverServers.push({id:d.id,...data});});allDiscoverServers.sort((a,b)=>(b.members?.length||0)-(a.members?.length||0));renderDiscoverServers(allDiscoverServers);}catch(e){list.innerHTML='<div style="color:#ed4245;text-align:center;padding:20px">Yüklenemedi.</div>';}
}
function renderDiscoverServers(servers){
    const list=$('discover-list');list.innerHTML='';
    if(!servers.length){list.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Sunucu bulunamadı.</div>';return;}
    servers.forEach(s=>{
        const card=document.createElement('div');card.className='discover-server-card';
        const icon=document.createElement('div');icon.className='discover-server-icon';icon.textContent=(s.name||'?')[0].toUpperCase();
        const info=document.createElement('div');info.className='discover-server-info';info.innerHTML=`<div class="discover-server-name">${s.name}</div><div class="discover-server-members">👥 ${s.members?.length||0} üye</div>`;
        const btn=document.createElement('button');btn.className='discover-join-btn';
        const isMember=s.members?.some(m=>m.uid===currentUser?.uid);
        if(isMember){btn.textContent='✓ Üyesin';btn.disabled=true;}
        else{btn.textContent='Katıl';btn.onclick=async()=>{btn.textContent='...';btn.disabled=true;try{await db.collection('servers').doc(s.id).update({members:firebase.firestore.FieldValue.arrayUnion({uid:currentUser.uid,name:currentUser.displayName||currentUser.email})});await db.collection('users').doc(currentUser.uid).update({servers:firebase.firestore.FieldValue.arrayUnion({id:s.id,name:s.name})});btn.textContent='✓ Katıldın!';loadUserServers();}catch(e){btn.textContent='Hata';btn.disabled=false;}};}
        card.appendChild(icon);card.appendChild(info);card.appendChild(btn);list.appendChild(card);
    });
}
function filterDiscoverServers(){const q=$('discover-search').value.toLowerCase();renderDiscoverServers(allDiscoverServers.filter(s=>(s.name||'').toLowerCase().includes(q)));}

// ── PROFİL ÇERÇEVESİ ────────────────────────────────────
function loadFrameModal(){
    const pav=$('frame-preview-av');setAvatarEl(pav,window._userPhotoURL,currentUser?.displayName);applyFrameToEl(pav,selectedFrame);
    const opts=$('frame-options');opts.innerHTML='';
    FRAMES.forEach(f=>{const div=document.createElement('div');div.className='frame-option'+(f.id===selectedFrame?' selected':'');div.textContent=f.id==='none'?'Yok':f.label;if(f.id==='none')div.classList.add('none-frame');div.onclick=()=>{selectedFrame=f.id;document.querySelectorAll('.frame-option').forEach(el=>el.classList.remove('selected'));div.classList.add('selected');applyFrameToEl(pav,f.id);};opts.appendChild(div);});
}
async function saveProfileFrame(){
    localStorage.setItem('profileFrame',selectedFrame);
    if(currentUser)await db.collection('users').doc(currentUser.uid).update({profileFrame:selectedFrame});
    applyFrameToEl($('my-avatar'),selectedFrame);hideModal('modal-frame');
}

// ── SİDEBAR TOGGLE ───────────────────────────────────────
function toggleSidebar(){
    sidebarVisible=!sidebarVisible;
    $('server-list').style.display=sidebarVisible?'flex':'none';
    $('channel-list').style.display=sidebarVisible?'flex':'none';
    $('chat-area').style.display='flex';
    const btn=$('sidebar-toggle-btn');if(btn)btn.classList.toggle('active',sidebarVisible);
}

// ── ARAMA ────────────────────────────────────────────────
async function requestWakeLock(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch(e){}try{keepAliveCtx=new AudioContext();const o=keepAliveCtx.createOscillator(),g=keepAliveCtx.createGain();g.gain.value=0.00001;o.connect(g);g.connect(keepAliveCtx.destination);o.start();}catch(e){}document.addEventListener('visibilitychange',handleVisibilityChange);}
async function handleVisibilityChange(){if(document.visibilityState==='visible'&&pc&&localStream){localStream.getTracks().forEach(t=>{if(t.readyState==='ended')navigator.mediaDevices.getUserMedia({audio:true,video:t.kind==='video'}).then(ns=>{const nt=ns.getTracks().find(x=>x.kind===t.kind);if(nt&&pc){const s=pc.getSenders().find(s=>s.track?.kind===t.kind);if(s)s.replaceTrack(nt);}}).catch(()=>{});});}}
function releaseWakeLock(){try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(e){}try{if(keepAliveCtx){keepAliveCtx.close();keepAliveCtx=null;}}catch(e){}document.removeEventListener('visibilitychange',handleVisibilityChange);}
async function startCall(type){
    if(!currentServerId){alert('Önce bir sunucu seç!');return;}
    try{localStream=await navigator.mediaDevices.getUserMedia({video:type==='video',audio:true});}catch(e){alert('Erişim reddedildi.');return;}
    await requestWakeLock();pc=new RTCPeerConnection(iceServers);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    $('local-video').srcObject=localStream;if(type!=='video')$('local-video').style.display='none';
    pc.ontrack=e=>{$('remote-video').srcObject=e.streams[0];};
    const callRef=db.collection('calls').doc();currentCallId=callRef.id;
    pc.onicecandidate=async e=>{if(e.candidate)await callRef.collection('offerCandidates').add(e.candidate.toJSON());};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await callRef.set({offer:{type:offer.type,sdp:offer.sdp},callType:type,callerName:currentUser.displayName||currentUser.email,callerUid:currentUser.uid,serverId:currentServerId,status:'ringing',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    const callPartnerName = currentServerData?.members?.find(m=>m.uid!==currentUser.uid)?.name || 'Arama';
    setCallPartnerInfo(callPartnerName, null);
    $('call-screen').style.display='flex';$('call-status').textContent='Bağlanıyor...';$('remote-video').style.display=type==='video'?'block':'none';
    callRef.onSnapshot(async snap=>{const data=snap.data();if(!data)return;if(data.answer&&!pc.currentRemoteDescription){await pc.setRemoteDescription(new RTCSessionDescription(data.answer));$('call-status').textContent='Bağlandı ✅';}if(data.status==='rejected'||data.status==='ended')endCall();});
    callRef.collection('answerCandidates').onSnapshot(snap=>{snap.docChanges().forEach(c=>{if(c.type==='added')pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));});});
}
function listenForCalls(){
    db.collection('calls').onSnapshot(snap=>{snap.docChanges().forEach(change=>{if(change.type==='added'){const data=change.doc.data();
        const isForMe=data.callerUid!==currentUser?.uid&&data.status==='ringing'&&(
            (data.dmCall&&data.targetUid===currentUser?.uid) ||
            (!data.dmCall&&data.serverId===currentServerId)
        );
        if(isForMe){currentCallId=change.doc.id;$('caller-avatar').textContent=(data.callerName||'A')[0].toUpperCase();$('caller-name').textContent=data.callerName||'Biri';$('caller-type').textContent=data.callType==='video'?'📹 Görüntülü':'📞 Sesli Arama';$('incoming-call').style.display='flex';}
    }}); });
}
async function acceptCall(){
    $('incoming-call').style.display='none';
    const callRef=db.collection('calls').doc(currentCallId);const callData=(await callRef.get()).data();
    try{localStream=await navigator.mediaDevices.getUserMedia({video:callData.callType==='video',audio:true});}catch(e){alert('Erişim reddedildi.');return;}
    await requestWakeLock();pc=new RTCPeerConnection(iceServers);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    $('local-video').srcObject=localStream;pc.ontrack=e=>{$('remote-video').srcObject=e.streams[0];};
    pc.onicecandidate=async e=>{if(e.candidate)await callRef.collection('answerCandidates').add(e.candidate.toJSON());};
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await callRef.update({answer:{type:answer.type,sdp:answer.sdp},status:'accepted'});
    callRef.collection('offerCandidates').onSnapshot(snap=>{snap.docChanges().forEach(c=>{if(c.type==='added')pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));});});
    setCallPartnerInfo(callData.callerName||'Arayan', null);
    $('call-screen').style.display='flex';$('call-status').textContent='Bağlandı ✅';$('remote-video').style.display=callData.callType==='video'?'block':'none';
}
async function rejectCall(){$('incoming-call').style.display='none';if(currentCallId){await db.collection('calls').doc(currentCallId).update({status:'rejected'});currentCallId=null;}}

// ── ARAMA KÜÇÜLTME ───────────────────────────────────────
function setCallPartnerInfo(name, photoURL){
    const av=$('call-partner-av');
    const bav=$('bubble-av');
    $('call-partner-name').textContent=name||'Arama';
    $('bubble-name').textContent=name||'Arama';
    if(photoURL){
        av.style.backgroundImage='url('+photoURL+')';av.textContent='';
        bav.style.backgroundImage='url('+photoURL+')';bav.textContent='';
    }else{
        av.style.backgroundImage='';av.textContent=(name||'A')[0].toUpperCase();
        bav.style.backgroundImage='';bav.textContent=(name||'A')[0].toUpperCase();
    }
}
function minimizeCall(){
    $('call-screen').style.display='none';
    $('call-bubble').style.display='flex';
}
function expandCall(){
    $('call-bubble').style.display='none';
    $('call-screen').style.display='flex';
}
async function endCall(){
    releaseWakeLock();if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
    if(pc){pc.close();pc=null;}if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
    if(currentCallId){try{await db.collection('calls').doc(currentCallId).update({status:'ended'});}catch(e){}currentCallId=null;}
    $('call-screen').style.display='none';$('call-bubble').style.display='none';$('remote-video').srcObject=null;$('local-video').srcObject=null;$('local-video').style.display='block';
    const btn=$('screen-btn');if(btn){btn.textContent='🖥️';btn.classList.remove('active');}
}
function toggleMute(){if(!localStream)return;const a=localStream.getAudioTracks()[0];if(a){a.enabled=!a.enabled;$('mute-btn').textContent=a.enabled?'🎤':'🔇';}}
function toggleCam(){if(!localStream)return;const v=localStream.getVideoTracks()[0];if(v){v.enabled=!v.enabled;$('cam-btn').textContent=v.enabled?'📹':'🚫';}}
async function toggleScreen(){
    const btn=$('screen-btn');
    if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;btn.textContent='🖥️';btn.classList.remove('active');if(pc&&localStream){const ct=localStream.getVideoTracks()[0];if(ct){const s=pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(ct);}}$('local-video').srcObject=localStream;}
    else{try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:true});btn.textContent='⏹️';btn.classList.add('active');const st=screenStream.getVideoTracks()[0];if(pc){const s=pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(st);}$('local-video').srcObject=screenStream;st.onended=()=>toggleScreen();}catch(e){alert('Ekran paylaşımı başlatılamadı.');}}
}

// ── EVENT LISTENER BAĞLAMA ───────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
    $('msg-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}if(e.key==='Escape')cancelReply();handleTyping();});
    $('dm-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendDMMessage();}handleDMTyping();});
    const vBtn=$('voice-btn');if(vBtn){['mousedown','touchstart'].forEach(ev=>vBtn.addEventListener(ev,startVoiceRecord));['mouseup','mouseleave','touchend'].forEach(ev=>vBtn.addEventListener(ev,stopVoiceRecord));}
    const dmVBtn=$('dm-voice-btn');if(dmVBtn){['mousedown','touchstart'].forEach(ev=>dmVBtn.addEventListener(ev,startDMVoiceRecord));['mouseup','mouseleave','touchend'].forEach(ev=>dmVBtn.addEventListener(ev,stopDMVoiceRecord));}
    $('notif-sound')?.addEventListener('change',e=>saveSetting('notifSound',e.target.checked));
    $('notif-browser')?.addEventListener('change',e=>toggleBrowserNotif(e.target.checked));
    document.addEventListener('click',e=>{const m=$('msg-context-menu');if(m&&!m.contains(e.target))m.style.display='none';});
    document.querySelectorAll('.modal').forEach(modal=>{modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});});
});

if('serviceWorker'in navigator)navigator.serviceWorker.register('/ateschat/sw.js').catch(()=>{});

// ── SUNUCU AYARLARI ──────────────────────────────────────
async function showServerSettings(){
    if(!currentServerId||!currentUser)return;
    const snap=await db.collection('servers').doc(currentServerId).get();
    const data=snap.data()||{};
    const members=data.members||[];
    const roles=data.roles||{};
    const isOwner=roles[currentUser.uid]==='owner';

    $('ss-server-name').textContent='⚙️ '+data.name;
    $('ss-invite-code').textContent=data.inviteCode||'---';

    $('ss-owner-section').style.display=isOwner?'block':'none';
    $('ss-delete-section').style.display=isOwner?'block':'none';

    const list=$('ss-members-list');
    list.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px">Yükleniyor...</div>';

    const userDocs=await Promise.all(members.map(m=>
        db.collection('users').doc(m.uid).get().catch(()=>null)
    ));

    list.innerHTML='';
    members.forEach((m,i)=>{
        const uData=userDocs[i]?.data()||{};
        const role=roles[m.uid]||'member';
        const roleLabel=role==='owner'?'👑 Sunucu Sahibi':role==='mod'?'🛡️ Moderatör':'👤 Üye';
        const isMe=m.uid===currentUser.uid;

        const row=document.createElement('div');
        row.className='ss-member-row';

        const av=document.createElement('div');
        av.className='ss-member-av';
        setAvatarEl(av, uData.photoURL||null, m.name);

        const info=document.createElement('div');
        info.className='ss-member-info';
        const statusDot=getStatusColor(uData.status||'offline');
        info.innerHTML=`
            <div class="ss-member-name">${m.name}${isMe?' <span style="color:var(--muted);font-size:11px">(Sen)</span>':''}</div>
            <div class="ss-member-role"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusDot};margin-right:4px"></span>${roleLabel}</div>
        `;

        const btns=document.createElement('div');
        btns.className='ss-member-btns';

        if(isOwner&&!isMe){
            const roleBtn=document.createElement('button');
            roleBtn.className='ss-btn gray';
            roleBtn.textContent=role==='mod'?'👤 Üye Yap':'🛡️ Mod Yap';
            roleBtn.onclick=async()=>{
                const newRole=role==='mod'?'member':'mod';
                await db.collection('servers').doc(currentServerId).update({
                    ['roles.'+m.uid]:newRole
                });
                showServerSettings();
            };

            const ownerBtn=document.createElement('button');
            ownerBtn.className='ss-btn gold';
            ownerBtn.textContent='👑 Sahip Yap';
            ownerBtn.onclick=async()=>{
                if(!confirm(m.name+' sunucu sahibi yapılsın? Sen moderatör olacaksın.'))return;
                await db.collection('servers').doc(currentServerId).update({
                    ['roles.'+m.uid]:'owner',
                    ['roles.'+currentUser.uid]:'mod'
                });
                showServerSettings();
            };

            const kickBtn=document.createElement('button');
            kickBtn.className='ss-btn red';
            kickBtn.textContent='🚪 At';
            kickBtn.onclick=async()=>{
                if(!confirm(m.name+' sunucudan atılsın?'))return;
                const sSnap=await db.collection('servers').doc(currentServerId).get();
                const newMembers=(sSnap.data()?.members||[]).filter(x=>x.uid!==m.uid);
                const newRoles={...sSnap.data()?.roles};
                delete newRoles[m.uid];
                await db.collection('servers').doc(currentServerId).update({members:newMembers,roles:newRoles});
                const uSnap=await db.collection('users').doc(m.uid).get();
                const newServers=(uSnap.data()?.servers||[]).filter(s=>s.id!==currentServerId);
                await db.collection('users').doc(m.uid).update({servers:newServers});
                showServerSettings();
            };

            btns.appendChild(roleBtn);
            btns.appendChild(ownerBtn);
            btns.appendChild(kickBtn);
        }

        row.appendChild(av);
        row.appendChild(info);
        row.appendChild(btns);
        list.appendChild(row);
    });

    showModal('modal-server-settings');
}

function copySSInvite(){
    navigator.clipboard.writeText($('ss-invite-code').textContent);
    const btn=event.target;btn.textContent='✅ Kopyalandı!';
    setTimeout(()=>btn.textContent='Kopyala',2000);
}

async function deleteServer(){
    if(!currentServerId)return;
    const roles=currentServerData?.roles||{};
    if(roles[currentUser.uid]!=='owner'){alert('Sadece sunucu sahibi silebilir.');return;}
    if(!confirm('Sunucu silinecek. Emin misin?'))return;
    if(!confirm('Bu işlem geri alınamaz!'))return;
    try{
        const chSnap=await db.collection('servers').doc(currentServerId).collection('channels').get();
        await Promise.all(chSnap.docs.map(d=>d.ref.delete()));
        const sData=(await db.collection('servers').doc(currentServerId).get()).data()||{};
        await Promise.all((sData.members||[]).map(async m=>{
            const uSnap=await db.collection('users').doc(m.uid).get();
            const newServers=(uSnap.data()?.servers||[]).filter(s=>s.id!==currentServerId);
            return db.collection('users').doc(m.uid).update({servers:newServers});
        }));
        await db.collection('servers').doc(currentServerId).delete();
        hideModal('modal-server-settings');
        currentServerId=null;currentChannelId=null;
        loadUserServers();
    }catch(e){alert('Hata: '+e.message);}
}
#dm-sidebar{width:320px!important}
.msg-ttl{color:#ed4245;font-size:10px;margin-left:6px;opacity:.7}
.msg-av{cursor:pointer;transition:transform .2s,box-shadow .2s}
.msg-av:hover{transform:scale(1.1);box-shadow:0 0 0 2px var(--blue)}
#dm-messages{padding:12px 20px!important}
#dm-input-wrap{padding:14px 20px!important}
