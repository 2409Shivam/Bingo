import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

/*
  Paste your Firebase web config below.
  For a casual internal game, Firebase Anonymous Authentication is enabled.
  Database rules are intentionally simple for easy setup; see README for limitations.
*/
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_DATABASE_NAME-default-rtdb.firebaseio.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

const $ = (id) => document.getElementById(id);
const state = { app:null, db:null, auth:null, uid:null, roomCode:null, room:null, unsub:null, card:[], ready:false, calledSet:new Set(), interval:null, toastTimer:null, lastCallCount:0 };
const AVATARS = ["🦊","🐼","🐸","🐯","🐙","🦄","🐧","🐝","🐨","🦋","🐳","🐱"];
const LINES = [];
for (let r=0;r<5;r++) LINES.push(Array.from({length:5},(_,c)=>r*5+c));
for (let c=0;c<5;c++) LINES.push(Array.from({length:5},(_,r)=>r*5+c));
LINES.push([0,6,12,18,24],[4,8,12,16,20]);

function shuffle(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function normalizeCode(s){return s.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);}
function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function isOwner(){return !!state.room && state.room.ownerUid===state.uid;}
function me(){return state.room?.players?.[state.uid]||null;}
function showToast(message){$("toast").textContent=message;$("toast").classList.add("show");clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600);}
function setError(message){$("setupError").textContent=message||"";}
function setConnection(text,online=false){$("connection").innerHTML=`<span class="dot"></span>${escapeText(text)}`;$("connection").classList.toggle("online",online);}
function showPanel(id){$(id).classList.remove("hidden");}
function hidePanel(id){$(id).classList.add("hidden");}
function roomRef(){return ref(state.db,`rooms/${state.roomCode}`);}
function roomUrl(){const u=new URL(location.href);u.searchParams.set("room",state.roomCode);return u.toString();}

async function connectFirebase(){
  if(state.db) return;
  if(firebaseConfig.apiKey.startsWith("PASTE_") || firebaseConfig.projectId==="PASTE_PROJECT_ID") throw new Error("Add your Firebase web config to app.js first. See README.md.");
  state.app=initializeApp(firebaseConfig);state.db=getDatabase(state.app);state.auth=getAuth(state.app);
  const cred=await signInAnonymously(state.auth);state.uid=cred.user.uid;setConnection("Connected",true);
}
function getCard(){return state.card.length===25?[...state.card]:shuffle(Array.from({length:25},(_,i)=>i+1));}
function validateCard(card){
  if(!Array.isArray(card)||card.length!==25)return false;
  const nums=card.map(Number);
  return nums.every(n=>Number.isInteger(n)&&n>=1&&n<=25)&&new Set(nums).size===25;
}
function linesCompleted(card,marked){
  if(!card||!marked)return 0;
  const set=new Set(marked);
  return LINES.filter(line=>line.every(i=>set.has(Number(card[i])))).length;
}
function canClaim(player,room){
  return linesCompleted(player.card,room.called||[])>=5;
}
function playerStatus(p){return p.ready?"Ready":"Not ready";}

async function createRoom(){
  setError("");
  try{
    const name=$("nameInput").value.trim();
    if(!name)throw new Error("Enter your display name first.");
    await connectFirebase();
    let code=normalizeCode($("roomInput").value)||Math.random().toString(36).slice(2,8).toUpperCase();
    // Retry a few times if the chosen/generated room already exists.
    for(let i=0;i<5;i++){
      const snap=await get(ref(state.db,`rooms/${code}`));
      if(!snap.exists())break;
      if($("roomInput").value.trim())throw new Error("That room code is already taken. Choose another one.");
      code=Math.random().toString(36).slice(2,8).toUpperCase();
      if(i===4)throw new Error("Couldn't find an available room code. Try again.");
    }
    state.roomCode=code;state.card=shuffle(Array.from({length:25},(_,i)=>i+1));
    const now=Date.now();
    const room={code,ownerUid:state.uid,phase:"lobby",createdAt:now,players:{[state.uid]:{uid:state.uid,name:name.slice(0,24),avatar:AVATARS[Math.floor(Math.random()*AVATARS.length)],card:state.card,ready:false,joinedAt:now,marked:[],claimAt:null}},called:[],callIndex:0,startedAt:null,endedAt:null,winnerUid:null,claims:{}};
    await set(roomRef(),room);enterRoom(code);
  }catch(e){setError(e.message||"Couldn't create room.");}
}
async function joinRoom(){
  setError("");
  try{
    const name=$("nameInput").value.trim(),code=normalizeCode($("roomInput").value);
    if(!name)throw new Error("Enter your display name first.");
    if(!code)throw new Error("Enter the room code shared by the host.");
    await connectFirebase();
    const rref=ref(state.db,`rooms/${code}`),snap=await get(rref);
    if(!snap.exists())throw new Error("Room not found. Check the code and try again.");
    const room=snap.val();
    if(room.phase!=="lobby")throw new Error("This game has already started. Ask the host to create a new room.");
    if(Object.keys(room.players||{}).length>=50)throw new Error("This room is full (50 players max).");
    if(room.players?.[state.uid]){state.roomCode=code;enterRoom(code);return;}
    const player={uid:state.uid,name:name.slice(0,24),avatar:AVATARS[Math.floor(Math.random()*AVATARS.length)],card:shuffle(Array.from({length:25},(_,i)=>i+1)),ready:false,joinedAt:Date.now(),marked:[],claimAt:null};
    await update(rref,{[`players/${state.uid}`]:player});
    state.roomCode=code;state.card=player.card;enterRoom(code);
  }catch(e){setError(e.message||"Couldn't join room.");}
}
function enterRoom(code){
  state.roomCode=code;
  hidePanel("setupPanel");showPanel("gamePanel");
  $("roomCodeLabel").textContent=code;
  history.replaceState(null,"",roomUrl());
  if(state.unsub)state.unsub();
  state.unsub=onValue(roomRef(),snap=>{
    if(!snap.exists()){showToast("This room no longer exists.");leaveRoom(false);return;}
    state.room=snap.val();
    const p=me();if(p){state.card=[...p.card];state.ready=!!p.ready;}
    render();
    if(state.room.phase==="playing"&&isOwner())startAutoCaller();
    else stopAutoCaller();
  },err=>showToast("Realtime sync error: "+err.message));
}
function render(){
  const room=state.room;if(!room)return;
  const players=Object.values(room.players||{}).sort((a,b)=>a.joinedAt-b.joinedAt);
  const owner=isOwner(),phase=room.phase;
  $("hostLabel").textContent=`Host: ${room.players?.[room.ownerUid]?.name||"—"}`;
  $("phasePill").textContent=phase==="lobby"?"LOBBY":phase==="playing"?"LIVE GAME":"GAME OVER";
  $("readyCount").textContent=`${players.filter(p=>p.ready).length}/${players.length} READY`;
  $("playerCount").textContent=players.length;
  $("hostControls").classList.toggle("hidden",!owner||phase!=="lobby");
  $("readyBtn").textContent=state.ready?"✓ Ready — click to edit":"I'm ready ✓";
  $("readyBtn").classList.toggle("btn-secondary",state.ready);
  $("readyBtn").classList.toggle("btn-primary",!state.ready);
  $("shuffleBtn").disabled=phase!=="lobby"||state.ready;
  $("readyBtn").disabled=phase!=="lobby";
  $("editorGrid").querySelectorAll("input").forEach(input=>input.disabled=phase!=="lobby"||state.ready);
  $("readinessText").textContent=players.filter(p=>!p.ready).length?`Waiting for: ${players.filter(p=>!p.ready).map(p=>p.name).join(", ")}`:"Everyone is ready! Start the party.";
  $("startBtn").disabled=players.length<1||!players.every(p=>p.ready)||phase!=="lobby";
  $("startBtn").title=players.every(p=>p.ready)?"All players ready":"Waiting for everyone to click Ready";
  $("playerList").innerHTML=players.map(p=>`<div class="player-item"><div class="player-avatar">${escapeText(p.avatar||"🎈")}</div><div><div class="player-name">${escapeText(p.name)}${p.uid===room.ownerUid?' 👑':''}</div><span class="player-state ${p.ready?"ready":""} ${p.uid===room.ownerUid?"owner":""}">${p.uid===room.ownerUid?"HOST":playerStatus(p).toUpperCase()}</span></div></div>`).join("");
  $("sidePlayers").innerHTML=players.map(p=>`<div class="side-player"><span>${escapeText(p.avatar||"🎈")} ${escapeText(p.name)}${p.uid===room.ownerUid?" 👑":""}</span><span class="status-tag ${p.ready?"ready":""}">${phase==="lobby"?playerStatus(p):p.uid===room.winnerUid?"WINNER":`${linesCompleted(p.card,p.marked||[])}/5 lines`}</span></div>`).join("");
  if(phase==="lobby"){showPanel("lobbyPanel");hidePanel("playPanel");hidePanel("resultsPanel");renderEditor();}
  if(phase==="playing"){hidePanel("lobbyPanel");showPanel("playPanel");hidePanel("resultsPanel");renderPlay();}
  if(phase==="finished"){hidePanel("lobbyPanel");hidePanel("playPanel");showPanel("resultsPanel");renderResults();}
}
function renderEditor(){
  const grid=$("editorGrid");const card=me()?.card||state.card;
  if(grid.children.length===25 && [...grid.children].every((el,i)=>Number(el.value)===Number(card[i])))return;
  grid.innerHTML="";
  card.forEach((num,i)=>{
    const input=document.createElement("input");input.className="bingo-cell";input.type="number";input.min="1";input.max="25";input.step="1";input.inputMode="numeric";input.value=num;input.setAttribute("aria-label",`Cell ${i+1}`);
    input.addEventListener("change",()=>{state.card[i]=Number(input.value);validateEditor();});
    input.addEventListener("input",()=>{state.card[i]=Number(input.value);validateEditor();});
    grid.append(input);
  });validateEditor();
}
function validateEditor(){
  const inputs=[...$("editorGrid").querySelectorAll("input")],values=inputs.map(i=>Number(i.value));
  const valid=validateCard(values);
  inputs.forEach((input,i)=>{input.classList.toggle("invalid",!Number.isInteger(values[i])||values[i]<1||values[i]>25||values.filter(v=>v===values[i]).length>1);});
  $("cardMessage").textContent=valid?"Looks good! Each number from 1 to 25 appears exactly once.":"Use every number from 1 to 25 exactly once. Duplicate or invalid cells are highlighted.";
  $("readyBtn").disabled=!valid||state.room?.phase!=="lobby";
}
async function saveCardAndReady(){
  try{
    if(state.ready){await update(ref(state.db,`rooms/${state.roomCode}/players/${state.uid}`),{ready:false});return;}
    const inputs=[...$("editorGrid").querySelectorAll("input")],card=inputs.map(i=>Number(i.value));
    if(!validateCard(card)){showToast("Please fix the highlighted numbers first.");return;}
    state.card=card;
    await update(ref(state.db,`rooms/${state.roomCode}/players/${state.uid}`),{card,ready:true});
    showToast("You're in! Good luck 🍀");
  }catch(e){showToast("Couldn't update ready status: "+e.message);}
}
async function startGame(){
  if(!isOwner())return;
  const room=state.room,players=Object.values(room.players||{});
  if(!players.length||!players.every(p=>p.ready)){showToast("Everyone must be ready first.");return;}
  try{
    await runTransaction(roomRef(),current=>{
      if(!current||current.ownerUid!==state.uid||current.phase!=="lobby")return;
      const ps=Object.values(current.players||{});
      if(!ps.length||!ps.every(p=>p.ready&&validateCard(p.card)))return;
      return {...current,phase:"playing",called:[],callIndex:0,startedAt:Date.now(),winnerUid:null,claims:{}};
    });
  }catch(e){showToast("Couldn't start the game: "+e.message);}
}
function startAutoCaller(){
  if(state.interval||state.room?.phase!=="playing"||!isOwner())return;
  // The host's browser is the timer. If it closes, the calls pause until the host returns.
  state.interval=setInterval(async()=>{
    const room=state.room;if(!room||room.phase!=="playing"||!isOwner()){stopAutoCaller();return;}
    if((room.called||[]).length>=25){stopAutoCaller();return;}
    const remaining=Array.from({length:25},(_,i)=>i+1).filter(n=>!(room.called||[]).includes(n));
    const next=remaining[Math.floor(Math.random()*remaining.length)];
    try{
      await runTransaction(roomRef(),current=>{
        if(!current||current.ownerUid!==state.uid||current.phase!=="playing"||(current.called||[]).length>=25)return;
        const remain=Array.from({length:25},(_,i)=>i+1).filter(n=>!(current.called||[]).includes(n));
        if(!remain.length)return;
        const chosen=remain[Math.floor(Math.random()*remain.length)];
        return {...current,called:[...(current.called||[]),chosen],callIndex:(current.callIndex||0)+1,lastCallAt:Date.now()};
      });
    }catch(e){console.error(e);showToast("Number call failed. Check your connection.");}
  },3000);
}
function stopAutoCaller(){if(state.interval){clearInterval(state.interval);state.interval=null;}}
function renderPlay(){
  const room=state.room,p=me();if(!p)return;
  const called=room.called||[],marked=new Set(p.marked||[]);
  $("callsCount").textContent=`${called.length} / 25 CALLED`;
  const current=called.at(-1);$("currentNumber").textContent=current??"—";
  const grid=$("playGrid");grid.innerHTML="";
  p.card.forEach((num,i)=>{
    const btn=document.createElement("button");btn.className="bingo-cell";btn.textContent=num;btn.type="button";
    if(called.includes(Number(num)))btn.classList.add("called");
    if(marked.has(Number(num)))btn.classList.add("marked");
    btn.disabled=!called.includes(Number(num))||marked.has(Number(num));
    btn.setAttribute("aria-label",`Number ${num}${marked.has(Number(num))?", marked":""}`);
    btn.addEventListener("click",()=>markNumber(Number(num)));
    grid.append(btn);
  });
  const lines=linesCompleted(p.card,p.marked||[]);
  $("lineCount").textContent=`${lines} / 5`;$("lineProgress").style.width=`${Math.min(lines,5)*20}%`;
  $("bingoBtn").disabled=lines<5||!!p.claimAt||phaseEnded(room);
  $("calledNumbers").innerHTML=called.map((n,i)=>`<span class="number-chip ${i===called.length-1?"latest":""}">${n}</span>`).join("");
}
function phaseEnded(room){return room.phase!=="playing"||!!room.winnerUid;}
async function markNumber(num){
  const p=me(),room=state.room;if(!p||room.phase!=="playing")return;
  if(!(room.called||[]).includes(num)){showToast("That number hasn't been called yet.");return;}
  if((p.marked||[]).includes(num))return;
  try{await update(ref(state.db,`rooms/${state.roomCode}/players/${state.uid}`),{marked:[...(p.marked||[]),num]});}
  catch(e){showToast("Couldn't mark number: "+e.message);}
}
async function claimBingo(){
  const room=state.room,p=me();if(!room||!p||room.phase!=="playing")return;
  if(linesCompleted(p.card,p.marked||[])<5){showToast("You need five completed lines to claim Bingo.");return;}
  const now=Date.now();
  try{
    const result=await runTransaction(roomRef(),current=>{
      if(!current||current.phase!=="playing")return;
      const player=current.players?.[state.uid];if(!player||linesCompleted(player.card,player.marked||[])<5)return;
      const claims={...(current.claims||{})};
      if(!claims[state.uid])claims[state.uid]={uid:state.uid,name:player.name,at:now,lines:linesCompleted(player.card,player.marked||[])};
      const firstWinner=current.winnerUid||state.uid;
      return {...current,claims,winnerUid:firstWinner,phase:"finished",endedAt:now};
    });
    if(result.committed){showToast("BINGO! 🎉");celebrate();}
    else showToast("Claim wasn't accepted. Check that you have five lines.");
  }catch(e){showToast("Couldn't claim Bingo: "+e.message);}
}
function renderResults(){
  const room=state.room,players=Object.values(room.players||{}),claims=room.claims||{};
  const rankings=players.map(p=>({...p,lines:linesCompleted(p.card,p.marked||[]),claim:claims[p.uid]||null}))
    .sort((a,b)=>{
      if(a.claim&&b.claim)return a.claim.at-b.claim.at;
      if(a.claim)return -1;if(b.claim)return 1;
      return b.lines-a.lines||(b.marked?.length||0)-(a.marked?.length||0)||a.joinedAt-b.joinedAt;
    });
  const winner=rankings.find(p=>p.uid===room.winnerUid)||rankings.find(p=>p.claim);
  $("winnerTitle").textContent=winner?`${winner.name} wins!`:"Game complete!";
  $("winnerSubtitle").textContent=winner?"First verified BINGO claim — congratulations!":"All numbers have been called. Great game, everyone!";
  const podium=$("podium"),order=[rankings[1],rankings[0],rankings[2]],classes=["second","first","third"],medals=["🥈","🥇","🥉"],ranks=[2,1,3];
  podium.innerHTML=order.map((p,i)=>p?`<div class="podium-card ${classes[i]}"><div class="podium-medal">${medals[i]}</div><div class="podium-rank">${ranks[i]}</div><div class="podium-name">${escapeText(p.name)}</div><div class="podium-score">${p.claim?"BINGO claim":`${p.lines}/5 lines`}</div></div>`:`<div class="podium-card ${classes[i]}"><div class="podium-medal">🎈</div><div class="podium-rank">${ranks[i]}</div><div class="podium-name">—</div><div class="podium-score">No player</div></div>`).join("");
  $("leaderboard").innerHTML=rankings.map((p,i)=>`<div class="leader-row"><div class="leader-rank">${i+1}</div><div class="leader-name">${escapeText(p.name)}${p.uid===room.ownerUid?" 👑":""}</div><div class="leader-score">${p.claim?"🏆 Bingo":`${p.lines}/5 lines`}</div></div>`).join("");
  $("restartControls").classList.toggle("hidden",!isOwner());
}
async function restartGame(){
  if(!isOwner())return;
  try{
    const room=state.room,players={};
    Object.values(room.players||{}).forEach(p=>players[p.uid]={...p,card:shuffle(Array.from({length:25},(_,i)=>i+1)),ready:false,marked:[],claimAt:null});
    await update(roomRef(),{phase:"lobby",players,called:[],callIndex:0,startedAt:null,endedAt:null,winnerUid:null,claims:{}});
    state.card=[...players[state.uid].card];showToast("New round ready. Arrange your card!");
  }catch(e){showToast("Couldn't restart: "+e.message);}
}
async function leaveRoom(confirm=true){
  if(confirm&&!window.confirm("Leave this Bingo room?"))return;
  stopAutoCaller();if(state.unsub){state.unsub();state.unsub=null;}
  try{
    if(state.db&&state.roomCode&&state.uid){
      const room=state.room;
      if(room?.ownerUid===state.uid){
        // Keep the room alive for others; hand host control to the earliest remaining player.
        const others=Object.values(room.players||{}).filter(p=>p.uid!==state.uid).sort((a,b)=>a.joinedAt-b.joinedAt);
        if(others.length)await update(roomRef(),{[`players/${state.uid}`]:null,ownerUid:others[0].uid});
        else await set(roomRef(),null);
      }else await update(roomRef(),{[`players/${state.uid}`]:null});
    }
  }catch(e){console.warn(e);}
  state.roomCode=null;state.room=null;state.card=[];state.ready=false;
  hidePanel("gamePanel");showPanel("setupPanel");setError("");history.replaceState(null,"",location.pathname);
}
function celebrate(){
  const layer=$("confettiLayer"),colors=["#6c4cf1","#ff5ba6","#ffd35b","#52dfb5","#ff8a5b"];
  for(let i=0;i<100;i++){const piece=document.createElement("span");piece.className="confetti-piece";piece.style.left=Math.random()*100+"%";piece.style.background=colors[i%colors.length];piece.style.animationDelay=Math.random()*1.3+"s";piece.style.transform=`rotate(${Math.random()*360}deg)`;layer.append(piece);setTimeout(()=>piece.remove(),4500);}
}
$("createBtn").addEventListener("click",createRoom);
$("joinBtn").addEventListener("click",joinRoom);
$("shuffleBtn").addEventListener("click",()=>{if(state.ready)return;state.card=shuffle(Array.from({length:25},(_,i)=>i+1));renderEditor();});
$("readyBtn").addEventListener("click",saveCardAndReady);
$("startBtn").addEventListener("click",startGame);
$("bingoBtn").addEventListener("click",claimBingo);
$("restartBtn").addEventListener("click",restartGame);
$("leaveBtn").addEventListener("click",()=>leaveRoom(true));
$("copyRoomBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomUrl());showToast("Room link copied! Share it with your team.");}catch{await navigator.clipboard.writeText(state.roomCode);showToast("Room code copied.");}});
$("roomInput").addEventListener("input",()=>{$("roomInput").value=normalizeCode($("roomInput").value);});
const urlRoom=normalizeCode(new URLSearchParams(location.search).get("room")||"");
if(urlRoom)$("roomInput").value=urlRoom;
window.addEventListener("beforeunload",stopAutoCaller);
