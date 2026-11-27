"use strict";

const $ = id => document.getElementById(id);
const controls = $("detector"), picker = $("photo"), preview = $("result");
let models = [], photo = null, busy = false, imageTicket = 0;

function lock() {
  controls.disabled = busy || !models.length;
  picker.disabled = $("confidence").disabled = busy;
  $("detect").disabled = busy || !models.length || !photo;
  $("samples").querySelectorAll("button").forEach(button => button.disabled = busy);
}

const palette = ["#ffb323","#35dca1","#6cc5ff","#e98cff","#ff8e79"];
function color(label) {
  const example = {person:0, door:1, stairs:2};
  const n = example[label] ?? Array.from(label).reduce((sum,c) => sum + c.codePointAt(0), 0) % palette.length;
  return palette[n];
}
function display(boxes) {
  $("list").replaceChildren();
  $("count").textContent = boxes.length + (boxes.length === 1 ? " object" : " objects");
  if (!photo) return;
  const ratio = Math.min(1, 1600 / Math.max(photo.naturalWidth, photo.naturalHeight));
  preview.width = Math.max(1, Math.round(photo.naturalWidth * ratio));
  preview.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
  const ctx = preview.getContext("2d");
  ctx.drawImage(photo, 0, 0, preview.width, preview.height);
  const sx = preview.width / photo.naturalWidth, sy = preview.height / photo.naturalHeight;
  const font = Math.max(15, Math.round(Math.max(preview.width, preview.height) / 35));
  ctx.font = "bold " + font + "px sans-serif"; ctx.lineWidth = Math.max(3, font / 5);
  for (const box of boxes) {
    const ink = color(box.label);
    const percent = Math.round(box.score * 100) + "%";
    const text = box.label + " " + percent;
    const x = box.left * sx, y = box.top * sy;
    ctx.strokeStyle = ink;
    ctx.strokeRect(x, y, (box.right - box.left) * sx, (box.bottom - box.top) * sy);
    const textWidth = ctx.measureText(text).width + 10;
    const tx = Math.max(0, Math.min(x, preview.width - textWidth));
    const ty = Math.max(0, y - font - 7);
    ctx.fillStyle = ink; ctx.fillRect(tx, ty, textWidth, font + 6);
    ctx.fillStyle = "#132c25"; ctx.fillText(text, tx + 5, ty + font);
    const li = document.createElement("li"), dot = document.createElement("span");
    dot.className = "dot"; dot.style.backgroundColor = ink;
    li.append(dot, document.createTextNode(box.label));
    if (models.length > 1) {
      const from = document.createElement("span"); from.className = "model-name"; from.textContent = box.model; li.append(from);
    }
    const score = document.createElement("strong"); score.textContent = percent; li.append(score);
    $("list").append(li);
  }
}
async function loadPhoto(url, description, isObjectURL = false) {
  const ticket = ++imageTicket;
  photo = null; preview.hidden = true; $("empty").hidden = false; display([]); lock();
  try {
    const next = new Image(); next.src = url; await next.decode();
    if (ticket !== imageTicket) return;
    photo = next; preview.hidden = false; $("empty").hidden = true;
    $("file-name").textContent = description; display([]);
    $("status").textContent = "Photo ready. Select Detect objects.";
  } catch {
    if (ticket === imageTicket) $("status").textContent = "This image could not be opened. Choose a JPG, PNG or WebP.";
  } finally {
    if (isObjectURL) URL.revokeObjectURL(url);
    lock();
  }
}
function resetResults() {
  if (photo) {display([]); $("status").textContent = "Select Detect objects to apply this setting.";}
}
picker.addEventListener("change", () => {
  const file = picker.files[0];
  if (file) loadPhoto(URL.createObjectURL(file), file.name, true);
});
controls.addEventListener("change", resetResults);
$("confidence").addEventListener("input", () => {
  $("threshold").textContent = $("confidence").value + "%"; resetResults();
});
$("detect").addEventListener("click", async () => {
  if (busy || !photo) return;
  busy = true; lock(); display([]);
  const selection = controls.value === "*" ? models : models.filter(m => m.id === controls.value);
  try {
    const boxes = [];
    for (const model of selection) {
      $("status").textContent = "Running " + model.title + "…";
      boxes.push(...await Detector.run(photo, model, Number($("confidence").value) / 100));
    }
    boxes.sort((a, b) => b.score - a.score); display(boxes);
    $("status").textContent = boxes.length ? "Detection complete." : "No objects met this threshold.";
  } catch (e) {
    $("status").textContent = "Detection failed. Check the model file and runtime in Network. " + e.message;
  } finally { busy = false; lock(); }
});
async function start() {
  try {
    if (!globalThis.ort) throw new Error("Browser runtime missing from /vendor/.");
    ort.env.wasm.wasmPaths = "/vendor/"; ort.env.wasm.numThreads = 1;
    const response = await fetch("/api/models");
    if (!response.ok) throw new Error("The model list could not be loaded.");
    models = await response.json();
    if (!Array.isArray(models) || !models.length) throw new Error("The model list is empty.");
    if (models.length > 1) controls.add(new Option("All listed detectors", "*"));
    for (const m of models) controls.add(new Option(m.title, m.id));
    $("status").textContent = "Choose a photo or try a sample.";
    const res = await fetch("/samples.json");
    if (res.ok) for (const sample of await res.json()) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = sample.title;
      button.onclick = () => {picker.value = "";loadPhoto(sample.file, sample.description);};
      $("samples").append(button);
    }
  } catch (e) {$("status").textContent = e.message;}
  lock();
}
start();
