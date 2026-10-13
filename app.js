const $ = (s) => document.querySelector(s);
const messages = $("#messages"), input = $("#messageInput"), chatList = $("#chatList"), dialog = $("#simpleDialog"), dialogContent = $("#dialogContent");
const SAVED = "saved";
let activeId = SAVED, activeName = "Избранное", user = null, authError = null, chats = [], subscription = null;
const rendered = new Set(), renderedAttachments = new Set();
const sb = window.supabase && window.FUNTEXT_SUPABASE_CONFIG
  ? window.supabase.createClient(window.FUNTEXT_SUPABASE_CONFIG.url, window.FUNTEXT_SUPABASE_CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

function time(value) { return new Intl.DateTimeFormat("ru-RU", {hour:"2-digit",minute:"2-digit"}).format(new Date(value || Date.now())); }
function dialogBox(title, body, actionText, action) {
  dialogContent.replaceChildren();
  const h = document.createElement("h2"); h.textContent = title;
  const p = document.createElement("p"); p.textContent = body;
  dialogContent.append(h,p);
  if (actionText && action) {
    const b = document.createElement("button"); b.className = "dialog-primary"; b.textContent = actionText; b.type = "button";
    b.onclick = async () => { try { await action(); dialog.close(); } catch(e) { p.textContent = "Ошибка: " + (e.message || e); } };
    dialogContent.append(b);
  }
  if (!dialog.open) dialog.showModal();
}
function fail(title,e) {
  console.error(title,e);
  dialogBox(title,(e?.message || String(e)) + "\n\nЕсли отсутствуют таблицы/функции, выполни SQL-файл supabase/migrations/202610130001_funtext_chat.sql в Supabase → SQL Editor.","Понятно",()=>{});
}
function welcome(title,desc) {
  messages.replaceChildren(); rendered.clear();
  const box=document.createElement("div"); box.className="welcome";
  const mark=document.createElement("div"); mark.className="welcome-icon"; mark.textContent=title==="Избранное"?"★":title.slice(0,1).toUpperCase();
  const h=document.createElement("h2"); h.textContent=title;
  const p=document.createElement("p"); p.textContent=desc; box.append(mark,h,p); messages.append(box);
}
function renderMessage(m) {
  const id=String(m.id ?? "");
  if(id && rendered.has(id)) return;
  if(id) rendered.add(id);
  const old=messages.querySelector(".welcome"); if(old) old.remove();
  const own=m.sender_id===user?.id, b=document.createElement("div");
  b.className=own?"message":"message incoming"; b.textContent=m.content;
  if(!own && m.sender_id){const a=document.createElement("span");a.className="message-author";a.textContent="Участник "+m.sender_id.slice(0,6);b.prepend(a);}
  const t=document.createElement("span");t.className="message-time";t.textContent=time(m.created_at);b.append(t);messages.append(b);messages.scrollTop=messages.scrollHeight;
}
function renderAttachment(file){
  if(renderedAttachments.has(file.id))return;renderedAttachments.add(file.id);
  const card=document.createElement("div");card.className="attachment-card";
  const name=document.createElement("strong");name.textContent="📎 "+file.file_name;
  const meta=document.createElement("small");meta.textContent=(file.size_bytes/1024).toFixed(file.size_bytes<1048576?0:1)+" KB · "+time(file.created_at);
  const actions=document.createElement("div");actions.className="attachment-actions";
  const open=document.createElement("button");open.type="button";open.className="attachment-action";open.textContent=/\.html?$/i.test(file.file_name)||file.content_type==="text/html"?"Предпросмотр":"Открыть";open.onclick=()=>openAttachment(file,false);
  const download=document.createElement("button");download.type="button";download.className="attachment-action";download.textContent="Скачать";download.onclick=()=>openAttachment(file,true);
  actions.append(open,download);card.append(name,meta,actions);messages.append(card);messages.scrollTop=messages.scrollHeight;
}
async function openAttachment(file,download){
  try{
    const {data,error}=await sb.storage.from("ft-attachments").createSignedUrl(file.storage_path,90);if(error)throw error;
    if(!download && (/\.html?$/i.test(file.file_name)||file.content_type==="text/html")){
      const response=await fetch(data.signedUrl,{cache:"no-store"});if(!response.ok)throw new Error("Не удалось загрузить HTML");
      let doc=await response.text();
      const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; font-src data:; media-src data: blob:">';
      if(/<head[^>]*>/i.test(doc))doc=doc.replace(/<head[^>]*>/i,tag=>tag+csp);else doc=csp+doc;
      dialogContent.replaceChildren();const h=document.createElement("h2");h.textContent="HTML-предпросмотр: "+file.file_name;
      const warning=document.createElement("p");warning.textContent="Изолированный режим: JavaScript и внешние ресурсы заблокированы.";
      const frame=document.createElement("iframe");frame.className="html-preview";frame.setAttribute("sandbox","");frame.setAttribute("referrerpolicy","no-referrer");frame.srcdoc=doc;
      dialogContent.append(h,warning,frame);if(!dialog.open)dialog.showModal();return;
    }
    const link=document.createElement("a");link.href=data.signedUrl;link.target="_blank";link.rel="noopener noreferrer";if(download)link.download=file.file_name;document.body.append(link);link.click();link.remove();
  }catch(e){fail("Не удалось открыть вложение",e);}
}
function noteKey(){return "funtext:saved:"+ (user?.id || "local");}
function showNotes(){
  welcome("Избранное","Личные заметки сохраняются только в этом браузере.");
  try { JSON.parse(localStorage.getItem(noteKey())||"[]").forEach(m=>renderMessage({...m,sender_id:user?.id})); } catch(e){console.warn(e);}
}
function drawChats(){
  chatList.replaceChildren();
  const add=(id,title,subtitle,avatar)=>{const b=document.createElement("button");b.type="button";b.className="chat-item"+(activeId===id?" active":"");
    const a=document.createElement("span");a.className="avatar saved";a.textContent=avatar;
    const meta=document.createElement("span");meta.className="chat-meta";const h=document.createElement("strong");h.textContent=title;const s=document.createElement("small");s.textContent=subtitle;meta.append(h,s);b.append(a,meta);
    b.onclick=()=>selectChat(id);chatList.append(b);};
  add(SAVED,"Избранное","Личные заметки · только здесь","★");
  chats.forEach(c=>add(c.id,c.title,"Облачная беседа",(c.title||"Б").slice(0,1).toUpperCase()));
}
async function loadChats(){
  if(!sb||!user)return;
  const {data,error}=await sb.from("ft_conversations").select("id,title,invite_code,created_at").order("created_at",{ascending:false});
  if(error)throw error;chats=data||[];drawChats();
}
async function stopLive(){if(subscription&&sb){await sb.removeChannel(subscription);subscription=null;}}
async function selectChat(id){
  activeId=id;await stopLive();
  if(id===SAVED){activeName="Избранное";$("#currentTitle").textContent=activeName;$("#currentSubtitle").textContent="Личные заметки · только в этом браузере";$("#currentAvatar").textContent="★";showNotes();drawChats();return;}
  const c=chats.find(x=>x.id===id);if(!c||!sb)return;activeName=c.title;
  $("#currentTitle").textContent=c.title;$("#currentSubtitle").textContent="Облачная беседа · синхронизация";$("#currentAvatar").textContent=(c.title||"Б").slice(0,1).toUpperCase();
  welcome(c.title,"Загружаем сообщения…");drawChats();
  if(innerWidth<=720)$("#sidebar").classList.remove("open");
  const {data,error}=await sb.from("ft_messages").select("id,conversation_id,sender_id,content,created_at").eq("conversation_id",id).order("created_at",{ascending:true}).limit(500);
  if(activeId!==id)return;if(error){fail("Не удалось загрузить сообщения",error);return;}
  messages.replaceChildren();rendered.clear();if(!data.length)welcome(c.title,"Беседа создана. Отправь первое сообщение или поделись кодом приглашения.");data.forEach(renderMessage);
  const {data:files,error:fileError}=await sb.from("ft_attachments").select("id,conversation_id,uploader_id,file_name,storage_path,content_type,size_bytes,created_at").eq("conversation_id",id).order("created_at",{ascending:true}).limit(200);
  if(activeId!==id)return;
  if(fileError)fail("Не удалось загрузить вложения",fileError);else files.forEach(renderAttachment);
  subscription=sb.channel("ft-chat-"+id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"ft_messages",filter:"conversation_id=eq."+id},payload=>{if(activeId===id)renderMessage(payload.new);})
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"ft_attachments",filter:"conversation_id=eq."+id},payload=>{if(activeId===id)renderAttachment(payload.new);})
    .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Realtime:",status);});
  subscription=sb.channel("ft-chat-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"ft_messages",filter:"conversation_id=eq."+id},payload=>{if(activeId===id)renderMessage(payload.new);}).subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Realtime:",status);});
}
async function createChat(){
  if(!user){fail("Нет подключения",new Error(authError||"Авторизация не готова"));return;}
  const title=prompt("Название беседы (до 48 символов):");if(!title||!title.trim())return;
  const {data:id,error}=await sb.rpc("ft_create_conversation",{p_title:title.trim().slice(0,48)});if(error){fail("Не удалось создать беседу",error);return;}
  try{await loadChats();await selectChat(id);}catch(e){fail("Не удалось обновить список",e);return;}
  const c=chats.find(x=>x.id===id);if(c)dialogBox("Беседа создана","Код приглашения:\n\n"+c.invite_code+"\n\nПередай код участникам. Любой человек с этим кодом сможет присоединиться.","Скопировать код",()=>navigator.clipboard.writeText(c.invite_code));
}
async function joinChat(){
  if(!user){fail("Нет подключения",new Error(authError||"Авторизация не готова"));return;}
  const code=prompt("Введи код приглашения:");if(!code||!code.trim())return;
  const {data:id,error}=await sb.rpc("ft_join_conversation",{p_invite_code:code.trim().toUpperCase()});if(error){fail("Не удалось присоединиться",error);return;}
  try{await loadChats();await selectChat(id);}catch(e){fail("Не удалось открыть беседу",e);}
}
$("#messageForm").addEventListener("submit",async ev=>{
  ev.preventDefault();const content=input.value.trim();if(!content)return;
  if(activeId===SAVED){
    try{const arr=JSON.parse(localStorage.getItem(noteKey())||"[]");const m={id:"local-"+crypto.randomUUID(),content,created_at:new Date().toISOString()};arr.push(m);localStorage.setItem(noteKey(),JSON.stringify(arr.slice(-1000)));renderMessage({...m,sender_id:user?.id});input.value="";input.style.height="34px";}catch(e){fail("Не удалось сохранить заметку",e);}return;
  }
  const button=$(".send-button");button.disabled=true;
  try{const {data,error}=await sb.from("ft_messages").insert({conversation_id:activeId,sender_id:user.id,content}).select("id,conversation_id,sender_id,content,created_at").single();if(error)throw error;renderMessage(data);input.value="";input.style.height="34px";}
  catch(e){fail("Сообщение не отправлено",e);}finally{button.disabled=false;input.focus();}
});
input.addEventListener("keydown",ev=>{if(ev.key==="Enter"&&!ev.shiftKey){ev.preventDefault();$("#messageForm").requestSubmit();}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,130)+"px";});
$("#newChatBtn").addEventListener("click",createChat);
$("#joinChatBtn").addEventListener("click",joinChat);
$("#mobileMenuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#profileBtn").addEventListener("click",()=>{
  if(!user){dialogBox("Профиль",authError||"Подключаем авторизацию…","Повторить",initializeAuth);return;}
  dialogBox("Анонимный аккаунт","ID сессии: "+user.id+"\n\nСохраняй данные сайта, чтобы не потерять сессию. Восстановление аккаунта не реализовано. Сквозного шифрования нет — не отправляй секретные данные.","Скопировать ID",()=>navigator.clipboard.writeText(user.id));
});
$("#infoBtn").addEventListener("click",()=>dialogBox("О FunText","Облачные беседы работают через Supabase. «Избранное» хранится локально. Сейчас нет E2EE, Tor-маршрутизации или гарантии анонимности от инфраструктуры и сетевых операторов.","Понятно",()=>{}));
$("#attachBtn").addEventListener("click",()=>{
  if(activeId===SAVED){fail("Сначала открой беседу",new Error("Вложения можно отправлять в облачную беседу, а не в «Избранное»."));return;}
  $("#fileInput").click();
});
$("#fileInput").addEventListener("change",async()=>{
  const file=$("#fileInput").files?.[0];$("#fileInput").value="";if(!file)return;
  if(file.size<1||file.size>10485760){fail("Размер файла не подходит",new Error("Разрешены файлы размером до 10 МБ."));return;}
  const button=$("#attachBtn");button.disabled=true;
  try{
    const safeName=file.name.replace(/[\\/\\\\\\x00-\\x1f]/g,"_").slice(0,255)||"attachment";
    const path=activeId+"/"+crypto.randomUUID()+"/"+safeName;
    const {error:uploadError}=await sb.storage.from("ft-attachments").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(uploadError)throw uploadError;
    const {data,error}=await sb.from("ft_attachments").insert({conversation_id:activeId,uploader_id:user.id,file_name:safeName,storage_path:path,content_type:file.type||"application/octet-stream",size_bytes:file.size}).select("id,conversation_id,uploader_id,file_name,storage_path,content_type,size_bytes,created_at").single();
    if(error)throw error;renderAttachment(data);
  }catch(e){fail("Не удалось загрузить файл",e);}finally{button.disabled=false;}
});
async function initializeAuth(){
  const status=document.querySelector(".connection span:last-child"),name=$("#profileBtn .profile-meta strong"),pid=$("#profileBtn .profile-meta small"),avatar=$("#profileBtn .user-avatar");
  if(!sb){authError="Клиент Supabase не загрузился";if(status)status.textContent="Supabase недоступен";return;}
  if(status)status.textContent="Подключаемся к Supabase…";
  try{
    const {data:s,error:se}=await sb.auth.getSession();if(se)throw se;let u=s.session?.user||null;
    if(!u){const {data,error}=await sb.auth.signInAnonymously();if(error)throw error;u=data.user;}
    if(!u)throw new Error("Supabase не вернул пользователя");
    user=u;authError=null;if(status)status.textContent="Supabase подключён";if(name)name.textContent="Анонимный аккаунт";if(pid)pid.textContent="ID: "+u.id.slice(0,8)+"…";if(avatar)avatar.textContent="A";
    try{await loadChats();}catch(e){fail("Не удалось загрузить беседы",e);}
    if(activeId===SAVED)showNotes();
  }catch(e){authError=e.message||"Ошибка авторизации";if(status)status.textContent="Ошибка авторизации";if(name)name.textContent="Не подключено";if(pid)pid.textContent="Нажмите для подробностей";console.error(e);}
}
drawChats();initializeAuth();
