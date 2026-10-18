"use strict";

const state = { token: sessionStorage.getItem("ocb-token") || "", bots: [], tasks: [], schedules: [], events: [], view: "tasks" };
const el = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const short = (value, limit = 200) => String(value ?? "").length > limit ? String(value).slice(0, limit) + "…" : String(value ?? "");
const clock = () => new Date().toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "medium" });
el("clock").textContent = clock();
setInterval(() => { el("clock").textContent = clock(); }, 1000);

function notify(message, error = false) {
  const box = el("alert");
  box.hidden = !message;
  box.textContent = message;
  box.style.background = error ? "#462a30" : "#183a31";
  if (message) setTimeout(() => { if (box.textContent === message) box.hidden = true; }, 6000);
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(state.token ? { Authorization: "Bearer " + state.token } : {}) };
  const response = await fetch("/api" + path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "HTTP " + response.status);
  return data;
}

function optionsForBots(includeEmpty = false) {
  return (includeEmpty ? '<option value="">Nessun passaggio</option>' : "") + state.bots.map((b) => '<option value="' + escapeHTML(b.id) + '">' + escapeHTML(b.name) + "</option>").join("");
}

function refreshSelectors() {
  for (const id of ["task-bot", "schedule-bot", "task-handoff"]) {
    const select = el(id);
    const prior = select.value;
    select.innerHTML = optionsForBots(id === "task-handoff");
    if (Array.from(select.options).some((option) => option.value === prior)) select.value = prior;
  }
}

function renderTasks() {
  el("task-count").textContent = state.tasks.length;
  const byId = Object.fromEntries(state.bots.map((bot) => [bot.id, bot.name]));
  el("task-list").innerHTML = state.tasks.map((t) => {
    const buttons = [];
    if (t.status === "awaiting_approval") buttons.push('<button data-action="approve" data-id="' + t.id + '">Approva</button>');
    if (["awaiting_approval", "queued", "running"].includes(t.status)) buttons.push('<button data-action="cancel" data-id="' + t.id + '">Annulla</button>');
    if (["failed", "cancelled"].includes(t.status) && t.attempts < 3) buttons.push('<button data-action="retry" data-id="' + t.id + '">Riprova</button>');
    return '<article class="task"><div class="task-top"><div><strong>' + escapeHTML(byId[t.bot_id] || "Agente") + '</strong><br><small>' + escapeHTML(new Date(t.created_at).toLocaleString("it-IT")) + ' · ' + escapeHTML(t.id.slice(0, 8)) + '</small></div><span class="status ' + t.status + '">' + escapeHTML(t.status.replaceAll("_", " ")) + '</span></div><p>' + escapeHTML(short(t.prompt, 400)) + '</p><div class="task-actions">' + buttons.join("") + '</div>' + (t.result || t.error ? '<pre class="result">' + escapeHTML(short(t.result || t.error, 2000)) + '</pre>' : "") + "</article>";
  }).join("") || '<div class="empty">Nessun task. Crea un agente, poi assegna il primo lavoro.</div>';
}

function renderBots() {
  el("bot-count").textContent = state.bots.length;
  el("bot-list").innerHTML = state.bots.map((b) => '<article class="bot-card"><h3>◈ ' + escapeHTML(b.name) + '</h3><small>' + escapeHTML(b.model) + ' · ' + escapeHTML(b.agent) + '</small><p>' + escapeHTML(short(b.instructions, 220)) + "</p></article>").join("") || '<div class="empty">Crea il primo agente.</div>';
}

function renderSchedules() {
  el("schedule-count").textContent = state.schedules.length;
  const byId = Object.fromEntries(state.bots.map((bot) => [bot.id, bot.name]));
  el("schedule-list").innerHTML = state.schedules.map((s) => '<article class="task"><div class="task-top"><div><strong>' + escapeHTML(s.name) + '</strong><br><small>' + escapeHTML(byId[s.bot_id] || "?") + " · " + escapeHTML(s.expression) + " · " + escapeHTML(s.timezone || "system") + '</small></div><span class="status ' + (s.enabled ? "completed" : "cancelled") + '">' + (s.enabled ? "Attiva" : "Sospesa") + '</span></div><p>' + escapeHTML(short(s.prompt, 400)) + '</p><p class="hint">Esecuzione: ' + (s.auto_approve ? "automatica autorizzata" : "con approvazione") + '</p><div class="task-actions"><button data-action="run-now" data-schedule="' + s.id + '">Esegui ora</button><button data-action="' + (s.enabled ? "disable" : "enable") + '" data-schedule="' + s.id + '">' + (s.enabled ? "Disattiva" : "Riattiva") + '</button></div></article>').join("") || '<div class="empty">Nessuna routine programmata.</div>';
}

function renderEvents() {
  el("event-list").innerHTML = state.events.map((e) => '<div class="event"><time>' + escapeHTML(new Date(e.created_at).toLocaleString("it-IT")) + '</time><div><strong>' + escapeHTML(e.type) + '</strong> · ' + escapeHTML(short(e.detail, 500)) + "</div></div>").join("") || '<div class="empty">Nessun evento.</div>';
}

async function refresh() {
  try {
    const [stats, bots, tasks, schedules, events] = await Promise.all([
      api("/status"), api("/bots"), api("/tasks"), api("/schedules"), api("/events")
    ]);
    state.bots = bots; state.tasks = tasks; state.schedules = schedules; state.events = events;
    for (const name of ["total", "running", "awaiting_approval", "completed"]) el("stat-" + name).textContent = stats[name];
    refreshSelectors(); renderTasks(); renderBots(); renderSchedules(); renderEvents();
    el("connection").textContent = "Online";
    el("connection").classList.add("online");
    el("auth-panel").hidden = true;
  } catch (error) {
    el("connection").textContent = "Non connesso";
    el("connection").classList.remove("online");
    el("auth-panel").hidden = false;
    notify(error.message, true);
  }
}

el("refresh").addEventListener("click", refresh);
el("auth-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.token = el("token").value.trim();
  sessionStorage.setItem("ocb-token", state.token);
  refresh();
});
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
  document.querySelectorAll(".view").forEach((view) => view.hidden = view.id !== "view-" + state.view);
}));

function fields(form) {
  const entries = Object.fromEntries(new FormData(form).entries());
  entries.autoApprove = entries.autoApprove === "on";
  return entries;
}
for (const [formId, path, confirmation] of [
  ["bot-form", "/bots", "Agente creato"],
  ["task-form", "/tasks", "Task registrato"],
  ["schedule-form", "/schedules", "Automazione registrata"]
]) {
  el(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const values = fields(form);
      if (formId === "task-form") {
        values.requiresApproval = !values.autoApprove;
        delete values.autoApprove;
        if (!values.handoffBotId) delete values.handoffBotId;
      }
      if (formId === "schedule-form" && !values.timezone) delete values.timezone;
      await api(path, { method: "POST", body: JSON.stringify(values) });
      form.reset();
      notify(confirmation);
      await refresh();
    } catch (error) { notify(error.message, true); }
  });
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  button.disabled = true;
  try {
    const path = button.dataset.schedule ? "/schedules/" + button.dataset.schedule : "/tasks/" + button.dataset.id;
    await api(path + "/" + button.dataset.action, { method: "POST" });
    notify("Operazione registrata");
    await refresh();
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
});
refresh();
setInterval(refresh, 6_000);
