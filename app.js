const $ = (selector) => document.querySelector(selector);
const messages = $("#messages");
const input = $("#messageInput");
const chatList = $("#chatList");
const emptyHint = $("#emptyHint");
const dialog = $("#simpleDialog");
const dialogContent = $("#dialogContent");

let activeChat = "Избранное";
const chatNames = ["Избранное"];

function timeNow() {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function showDialog(title, body, actionLabel, onAction) {
  dialogContent.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = body;
  dialogContent.append(heading, paragraph);
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.className = "dialog-primary";
    action.type = "button";
    action.textContent = actionLabel;
    action.addEventListener("click", () => {
      onAction();
      dialog.close();
    });
    dialogContent.append(action);
  }
  dialog.showModal();
}

function clearWelcome() {
  const welcome = messages.querySelector(".welcome");
  if (welcome) welcome.remove();
}

function addMessage(text) {
  clearWelcome();
  const bubble = document.createElement("div");
  bubble.className = "message";
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = timeNow();
  bubble.append(time);
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function selectChat(name) {
  activeChat = name;
  $("#currentTitle").textContent = name;
  $("#currentSubtitle").textContent = name === "Избранное" ? "Личное пространство" : "Локальная беседа · без синхронизации";
  $("#currentAvatar").textContent = name === "Избранное" ? "★" : name.slice(0, 1).toUpperCase();
  document.querySelectorAll(".chat-item").forEach((item) => item.classList.toggle("active", item.dataset.chat === name));
  if (window.innerWidth <= 720) $("#sidebar").classList.remove("open");
}

function createChat() {
  const name = window.prompt("Название беседы:");
  if (!name || !name.trim()) return;
  const cleanName = name.trim().slice(0, 48);
  if (chatNames.includes(cleanName)) {
    selectChat(cleanName);
    return;
  }
  chatNames.push(cleanName);
  emptyHint.hidden = true;
  const button = document.createElement("button");
  button.className = "chat-item";
  button.type = "button";
  button.dataset.chat = cleanName;
  const avatar = document.createElement("span");
  avatar.className = "avatar saved";
  avatar.textContent = cleanName.slice(0, 1).toUpperCase();
  const meta = document.createElement("span");
  meta.className = "chat-meta";
  const strong = document.createElement("strong");
  strong.textContent = cleanName;
  const small = document.createElement("small");
  small.textContent = "Новая беседа";
  meta.append(strong, small);
  button.append(avatar, meta);
  button.addEventListener("click", () => selectChat(cleanName));
  chatList.append(button);
  selectChat(cleanName);
  messages.replaceChildren();
  const welcome = document.createElement("div");
  welcome.className = "welcome";
  const heading = document.createElement("h2");
  heading.textContent = cleanName;
  const p = document.createElement("p");
  p.textContent = "Беседа создана только в текущей вкладке. Подключение базы будет следующим этапом.";
  welcome.append(heading, p);
  messages.append(welcome);
}

$("#messageForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage(text);
  input.value = "";
  input.style.height = "34px";
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#messageForm").requestSubmit();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 130) + "px";
});

$("#newChatBtn").addEventListener("click", createChat);
$("#mobileMenuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#profileBtn").addEventListener("click", () => showDialog("Профиль", "Регистрация и восстановление аккаунта ещё не подключены. Не отправляйте сюда настоящие секреты или личные данные.", "Понятно", () => {}));
$("#infoBtn").addEventListener("click", () => showDialog("О FunText", "Это начальный UI-прототип. Сейчас переписка не отправляется на сервер, не шифруется сквозным шифрованием и не проходит через Tor.", "Понятно", () => {}));
$("#attachBtn").addEventListener("click", () => showDialog("Вложения", "Загрузка файлов и безопасный предпросмотр HTML ещё не реализованы. Добавим их после подключения базы и правил доступа.", "Понятно", () => {}));
