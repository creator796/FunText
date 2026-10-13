const $ = (s) => document.querySelector(s);
const messages = $("#messages"), input = $("#messageInput"), chatList = $("#chatList"), dialog = $("#simpleDialog"), dialogContent = $("#dialogContent");
const SAVED = "saved";
let activeId = SAVED, activeName = "Избранное", user = null, authError = null, chats = [], subscription = null;
const rendered = new Set(), renderedAttachments = new Set();
const sb = window.supabase && window.FUNTEXT_SUPABASE_CONFIG
  ? window.supabase.createClient(window.FUNTEXT_SUPABASE_CONFIG.url, window.FUNTEXT_SUPABASE_CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;


const SETTINGS_KEY = "funtext:settings:v1";
const DEFAULT_SETTINGS = { theme: "tor", fontSize: "normal", compact: false, enterToSend: true };
function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      theme: saved.theme === "funpay" ? "funpay" : "tor",
      fontSize: ["small", "normal", "large"].includes(saved.fontSize) ? saved.fontSize : "normal",
      compact: saved.compact === true,
      enterToSend: saved.enterToSend !== false
    };
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function applySettings(settings = getSettings()) {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.fontSize = settings.fontSize;
  document.body.classList.toggle("compact-mode", settings.compact);
  document.body.dataset.enterToSend = settings.enterToSend ? "true" : "false";
}
function saveSettings(settings) {
  const normalized = {
    theme: settings.theme === "funpay" ? "funpay" : "tor",
    fontSize: ["small", "normal", "large"].includes(settings.fontSize) ? settings.fontSize : "normal",
    compact: settings.compact === true,
    enterToSend: settings.enterToSend === true
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized)); }
  catch (e) { console.warn("Не удалось сохранить настройки в браузере", e); }
  applySettings(normalized);
  return normalized;
}
function settingsField(labelText, control) {
  const label = document.createElement("label");
  label.className = "settings-field";
  const title = document.createElement("span");
  title.className = "settings-field-title";
  title.textContent = labelText;
  label.append(title, control);
  return label;
}
function openSettings() {
  const current = getSettings();
  dialogContent.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Настройки";
  const intro = document.createElement("p");
  intro.textContent = "Параметры сохраняются в этом браузере и не меняют данные бесед.";
  const form = document.createElement("form");
  form.className = "settings-form";
  form.addEventListener("submit", ev => ev.preventDefault());

  const theme = document.createElement("select");
  theme.className = "dialog-input";
  for (const [value, label] of [["tor", "Tor — текущая тёмная тема"], ["funpay", "FunPay — жёлто-чёрная тема"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = label; theme.append(option);
  }
  theme.value = current.theme;
  form.append(settingsField("Оформление", theme));

  const font = document.createElement("select");
  font.className = "dialog-input";
  for (const [value, label] of [["small", "Мелкий"], ["normal", "Обычный"], ["large", "Крупный"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = label; font.append(option);
  }
  font.value = current.fontSize;
  form.append(settingsField("Размер текста", font));

  const compact = document.createElement("input");
  compact.type = "checkbox"; compact.checked = current.compact;
  const compactLabel = document.createElement("label"); compactLabel.className = "settings-check";
  const compactText = document.createElement("span"); compactText.textContent = "Компактный интерфейс";
  compactLabel.append(compact, compactText); form.append(compactLabel);

  const enter = document.createElement("input");
  enter.type = "checkbox"; enter.checked = current.enterToSend;
  const enterLabel = document.createElement("label"); enterLabel.className = "settings-check";
  const enterText = document.createElement("span"); enterText.textContent = "Enter отправляет сообщение (Shift+Enter — новая строка)";
  enterLabel.append(enter, enterText); form.append(enterLabel);

  const note = document.createElement("p");
  note.className = "settings-warning";
  note.textContent = "Важно: тема «Tor» — только оформление. FunText не подключается к сети Tor и не обеспечивает анонимность уровня Tor или сквозное шифрование.";
  const actions = document.createElement("div"); actions.className = "settings-actions";
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "dialog-secondary"; reset.textContent = "Сбросить";
  const save = document.createElement("button"); save.type = "button"; save.className = "dialog-primary"; save.textContent = "Сохранить";
  reset.addEventListener("click", () => {
    theme.value = DEFAULT_SETTINGS.theme; font.value = DEFAULT_SETTINGS.fontSize;
    compact.checked = DEFAULT_SETTINGS.compact; enter.checked = DEFAULT_SETTINGS.enterToSend;
    saveSettings(DEFAULT_SETTINGS);
  });
  save.addEventListener("click", () => {
    saveSettings({ theme: theme.value, fontSize: font.value, compact: compact.checked, enterToSend: enter.checked });
    dialog.close();
  });
  actions.append(reset, save);
  form.append(note, actions);
  dialogContent.append(heading, intro, form);
  if (!dialog.open) dialog.showModal();
}
applySettings();

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
  const {data,error}=await sb.from("ft_conversations").select("id,title,invite_code,created_at,created_by").order("created_at",{ascending:false});
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
  // Use a unique topic per subscription. This prevents a second selection/race
  // from trying to register postgres_changes handlers on an already-subscribed channel.
  try {
    const channel = sb.channel("ft-chat-" + id + "-" + crypto.randomUUID());
    channel
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"ft_messages",filter:"conversation_id=eq."+id},payload=>{if(activeId===id)renderMessage(payload.new);})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"ft_attachments",filter:"conversation_id=eq."+id},payload=>{if(activeId===id)renderAttachment(payload.new);});
    subscription = channel.subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Realtime:",status);});
  } catch (e) {
    console.error("Realtime subscription setup failed", e);
    // The conversation remains usable even if live updates cannot be enabled.
    subscription = null;
  }
}
async function createChat(){
  if(!user){fail("Нет подключения",new Error(authError||"Авторизация не готова"));return;}
  const title=prompt("Название беседы (до 48 символов):");if(!title||!title.trim())return;
  const {data:id,error}=await sb.rpc("ft_create_conversation",{p_title:title.trim().slice(0,48)});if(error){fail("Не удалось создать беседу",error);return;}
  try{await loadChats();await selectChat(id);}catch(e){fail("Не удалось обновить список",e);return;}
  const c=chats.find(x=>x.id===id);if(c)dialogBox("Беседа создана","Код приглашения:\n\n"+c.invite_code+"\n\nПередай код участникам. Любой человек с этим кодом сможет присоединиться.","Скопировать код",()=>navigator.clipboard.writeText(c.invite_code));
}
async function joinChat(){
  if(!sb){fail("Нет подключения",new Error("Клиент Supabase не загружен. Обнови страницу."));return;}
  if(!user){fail("Нет подключения",new Error(authError||"Анонимная авторизация не готова. Нажми «Повторить» в профиле."));return;}
  const raw=prompt("Введи код приглашения (20 символов). Можно вставить код с пробелами или дефисами:");
  if(!raw||!raw.trim())return;
  // Invite codes are case-insensitive; ignore whitespace and common separators copied with the code.
  const code=raw.toUpperCase().replace(/[\\s-]+/g,"");
  if(!/^[A-Z0-9]{10,32}$/.test(code)){
    dialogBox("Код не распознан","Код приглашения должен содержать от 10 до 32 латинских букв или цифр. Нужен именно код из окна «Беседа создана», а не название беседы или ID аккаунта.","Понятно",()=>{});
    return;
  }
  const {data:id,error}=await sb.rpc("ft_join_conversation",{p_invite_code:code});
  if(error){
    const message=error.message||String(error);
    if(/неверный код|не найдена|not found|invalid invite/i.test(message)){
      dialogBox("Беседа не найдена","Такого кода нет в текущей базе Supabase. Попроси владельца открыть беседу и заново скопировать именно «Код приглашения». Проверь, что обе стороны используют один и тот же проект Supabase.","Понятно",()=>{});
    }else fail("Не удалось присоединиться",error);
    return;
  }
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
input.addEventListener("keydown",ev=>{if(ev.key==="Enter"&&!ev.shiftKey&&getSettings().enterToSend){ev.preventDefault();$("#messageForm").requestSubmit();}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,130)+"px";});
$("#newChatBtn").addEventListener("click",createChat);
$("#joinChatBtn").addEventListener("click",joinChat);
$("#mobileMenuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#settingsBtn").addEventListener("click", openSettings);
$("#profileBtn").addEventListener("click",()=>{
  if(!user){dialogBox("Профиль",authError||"Подключаем авторизацию…","Повторить",initializeAuth);return;}
  dialogBox("Анонимный аккаунт","ID сессии: "+user.id+"\n\nСохраняй данные сайта, чтобы не потерять сессию. Восстановление аккаунта не реализовано. Сквозного шифрования нет — не отправляй секретные данные.","Скопировать ID",()=>navigator.clipboard.writeText(user.id));
});
async function showConversationInfo(){
  if(activeId===SAVED){
    dialogBox("О FunText","Облачные беседы работают через Supabase. «Избранное» хранится локально. Сквозного шифрования (E2EE) и Tor нет.","Понятно",()=>{});
    return;
  }
  const chat=chats.find(c=>c.id===activeId);
  if(!chat){fail("Беседа не найдена",new Error("Обнови список бесед и попробуй снова."));return;}
  dialogContent.replaceChildren();
  const heading=document.createElement("h2");heading.textContent="Информация о беседе";
  const title=document.createElement("p");title.className="group-info-title";title.textContent=chat.title;
  const codeLabel=document.createElement("label");codeLabel.className="group-info-label";codeLabel.textContent="Код приглашения";
  const code=document.createElement("code");code.className="invite-code";code.textContent=chat.invite_code||"Код недоступен";
  const codeActions=document.createElement("div");codeActions.className="group-info-actions";
  const copy=document.createElement("button");copy.type="button";copy.className="dialog-primary";copy.textContent="Скопировать код";
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(chat.invite_code);copy.textContent="Скопировано";}catch(e){const range=document.createRange();range.selectNodeContents(code);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);copy.textContent="Выдели код и скопируй";}};
  codeActions.append(copy);
  const isOwner=chat.created_by===user?.id;
  if(isOwner){
    const rotate=document.createElement("button");rotate.type="button";rotate.className="dialog-secondary";rotate.textContent="Создать новый код";
    rotate.onclick=async()=>{if(!confirm("Старый код перестанет работать. Продолжить?"))return;rotate.disabled=true;try{const {data,error}=await sb.rpc("ft_rotate_invite_code",{p_conversation_id:chat.id});if(error)throw error;await loadChats();await showConversationInfo();}catch(e){fail("Не удалось обновить код",e);}finally{rotate.disabled=false;}};
    codeActions.append(rotate);
  }
  const memberHeading=document.createElement("h3");memberHeading.className="group-info-heading";memberHeading.textContent="Участники";
  const memberList=document.createElement("div");memberList.className="group-member-list";
  dialogContent.append(heading,title,codeLabel,code,codeActions,memberHeading,memberList);
  if(!dialog.open)dialog.showModal();
  try{
    const {data:members,error}=await sb.from("ft_conversation_members").select("user_id,role,joined_at").eq("conversation_id",chat.id).order("joined_at",{ascending:true});
    if(error)throw error;
    if(!members?.length){memberList.textContent="Участники не найдены.";return;}
    for(const member of members){
      const row=document.createElement("div");row.className="group-member";
      const details=document.createElement("div");details.className="group-member-details";
      const name=document.createElement("strong");name.textContent=member.user_id===user.id?"Вы":("Участник "+member.user_id.slice(0,8));
      const role=document.createElement("small");role.textContent=member.role==="owner"?"Владелец":"Участник";
      details.append(name,role);row.append(details);
      if(isOwner&&member.user_id!==user.id&&member.role!=="owner"){
        const kick=document.createElement("button");kick.type="button";kick.className="member-kick";kick.textContent="Исключить";
        kick.onclick=async()=>{if(!confirm("Исключить этого участника из беседы?"))return;kick.disabled=true;try{const {error}=await sb.rpc("ft_kick_member",{p_conversation_id:chat.id,p_user_id:member.user_id});if(error)throw error;await showConversationInfo();}catch(e){fail("Не удалось исключить участника",e);}finally{kick.disabled=false;}};
        row.append(kick);
      }
      memberList.append(row);
    }
    if(isOwner){
      const rename=document.createElement("button");rename.type="button";rename.className="dialog-secondary";rename.textContent="Изменить название";
      rename.onclick=async()=>{const value=prompt("Новое название беседы:",chat.title);if(!value||!value.trim())return;try{const {error}=await sb.rpc("ft_rename_conversation",{p_conversation_id:chat.id,p_title:value.trim().slice(0,48)});if(error)throw error;await loadChats();$("#currentTitle").textContent=value.trim().slice(0,48);await showConversationInfo();}catch(e){fail("Не удалось изменить название",e);}};
      const remove=document.createElement("button");remove.type="button";remove.className="dialog-danger";remove.textContent="Удалить беседу";
      remove.onclick=async()=>{if(!confirm("Удалить беседу и всю её историю для всех участников? Это действие нельзя отменить."))return;try{const {error}=await sb.rpc("ft_delete_conversation",{p_conversation_id:chat.id});if(error)throw error;await stopLive();activeId=SAVED;await loadChats();await selectChat(SAVED);dialog.close();}catch(e){fail("Не удалось удалить беседу",e);}};
      dialogContent.append(rename,remove);
    }else{
      const leave=document.createElement("button");leave.type="button";leave.className="dialog-danger";leave.textContent="Выйти из беседы";
      leave.onclick=async()=>{if(!confirm("Выйти из этой беседы? Чтобы вернуться, понадобится код приглашения."))return;try{const {error}=await sb.rpc("ft_leave_conversation",{p_conversation_id:chat.id});if(error)throw error;await stopLive();activeId=SAVED;await loadChats();await selectChat(SAVED);dialog.close();}catch(e){fail("Не удалось выйти из беседы",e);}};
      dialogContent.append(leave);
    }
  }catch(e){const err=document.createElement("p");err.textContent="Не удалось загрузить участников: "+(e.message||e);dialogContent.append(err);}
}
$("#infoBtn").addEventListener("click",showConversationInfo);
$("#attachBtn").addEventListener("click",()=>{
  if(activeId===SAVED){fail("Сначала открой беседу",new Error("Вложения можно отправлять в облачную беседу, а не в «Избранное»."));return;}
  const picker=document.createElement("input");picker.type="file";
  picker.onchange=async()=>{
    const file=picker.files?.[0];if(!file)return;
    if(file.size<1||file.size>10485760){fail("Размер файла не подходит",new Error("Разрешены файлы размером до 10 МБ."));return;}
    const button=$("#attachBtn");button.disabled=true;
    try{
      const safeName=file.name.split("/").pop().split(String.fromCharCode(92)).pop().slice(0,255)||"attachment";
      const path=activeId+"/"+crypto.randomUUID()+"/"+safeName;
      const {error:uploadError}=await sb.storage.from("ft-attachments").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
      if(uploadError)throw uploadError;
      const {data,error}=await sb.from("ft_attachments").insert({conversation_id:activeId,uploader_id:user.id,file_name:safeName,storage_path:path,content_type:file.type||"application/octet-stream",size_bytes:file.size}).select("id,conversation_id,uploader_id,file_name,storage_path,content_type,size_bytes,created_at").single();
      if(error)throw error;renderAttachment(data);
    }catch(e){fail("Не удалось загрузить файл",e);}finally{button.disabled=false;}
  };
  picker.click();
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
