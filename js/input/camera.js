import { Q } from "../core/env.js";

let camDevices = [];
let camIndex = 0;

export function videoEl() { return document.getElementById("cam"); }

export async function openCamera() {
  const video = videoEl();
  const constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  const camQuery = Q.get("cam");
  if (camQuery) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(
        (d) => d.kind === "videoinput" && d.label.toLowerCase().includes(camQuery.toLowerCase()));
      if (match) constraints.video.deviceId = { exact: match.deviceId };
    } catch (e) { /* enumerateDevices puede fallar sin permiso previo; se ignora */ }
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  try {
    camDevices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch (e) { /* no critico */ }
}

export async function cycleCamera() {
  if (!camDevices.length) return;
  camIndex = (camIndex + 1) % camDevices.length;
  const video = videoEl();
  if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia(
    { video: { deviceId: { exact: camDevices[camIndex].deviceId } }, audio: false });
  video.srcObject = stream;
  await video.play();
}
