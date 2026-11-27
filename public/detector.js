"use strict";

const Detector = (() => {
  function prepare(photo, size) {
    const w = photo.naturalWidth;
    const h = photo.naturalHeight;
    const scale = Math.min(size / w, size / h);
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const left = Math.floor((size - dw) / 2);
    const top = Math.floor((size - dh) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    ctx.fillStyle = "rgb(114,114,114)";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(photo, left, top, dw, dh);
    const rgba = ctx.getImageData(0, 0, size, size).data;
    const plane = size * size;
    const rgb = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      rgb[i] = rgba[4 * i] / 255;
      rgb[plane + i] = rgba[4 * i + 1] / 255;
      rgb[2 * plane + i] = rgba[4 * i + 2] / 255;
    }
    return {tensor: new ort.Tensor("float32", rgb, [1, 3, size, size]), left, top,
      sx: dw / w, sy: dh / h, w, h};
  }

  function overlap(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const intersection = width * height;
    const area = box => (box.right - box.left) * (box.bottom - box.top);
    return intersection / (area(a) + area(b) - intersection || 1);
  }

  function decode(output, model, frame, confidence) {
    const [batch, channels, count] = output.dims;
    if (output.dims.length !== 3 || batch !== 1 || channels !== 4 + model.labels.length) {
      throw new Error("Output shape and label count differ. Export with the lab script.");
    }
    const data = output.data;
    const candidates = [];
    const limit = (n, max) => Math.max(0, Math.min(n, max));
    for (let i = 0; i < count; i++) {
      let cls = 0;
      for (let j = 1; j < model.labels.length; j++) {
        if (data[(4+j)*count+i] > data[(4+cls)*count+i]) cls = j;
      }
      const score = data[(4+cls)*count+i];
      if (!(score >= confidence)) continue;
      const cx = data[i], cy = data[count+i], w = data[2*count+i], h = data[3*count+i];
      const left = limit((cx - w/2 - frame.left) / frame.sx, frame.w);
      const right = limit((cx + w/2 - frame.left) / frame.sx, frame.w);
      const top = limit((cy - h/2 - frame.top) / frame.sy, frame.h);
      const bottom = limit((cy + h/2 - frame.top) / frame.sy, frame.h);
      if (right > left && bottom > top) {
        candidates.push({left, top, right, bottom, cls, score, label: model.labels[cls], model: model.title});
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const box of candidates) {
      if (!kept.some(other => other.cls === box.cls && overlap(other, box) > 0.45)) kept.push(box);
      if (kept.length >= 300) break;
    }
    return kept;
  }

  async function run(photo, model, confidence) {
    const session = await ort.InferenceSession.create(model.file, {executionProviders:["wasm"]});
    let frame, result;
    try {
      frame = prepare(photo, model.size);
      result = await session.run({[session.inputNames[0]]: frame.tensor});
      return decode(result[session.outputNames[0]], model, frame, confidence);
    } finally {
      frame?.tensor.dispose();
      if (result) Object.values(result).forEach(tensor => tensor.dispose());
      await session.release();
    }
  }
  return {run};
})();
