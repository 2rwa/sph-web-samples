import WebSocket from "ws";

const debugBase = "http://127.0.0.1:9222";
const sampleUrl =
  "http://127.0.0.1:8000/samples/salva-3d-webgpu-custom-forces/?ci=1";
const expectedStatus = "CI WebGPU custom forces ok";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${debugBase}/json/version`);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Chrome debugging endpoint unavailable: ${lastError ?? "timeout"}`);
}

async function createTarget() {
  const response = await fetch(
    `${debugBase}/json/new?${encodeURIComponent(sampleUrl)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not create CDP target: HTTP ${response.status}`);
  return response.json();
}

await waitForDebugger();
const target = await createTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const browserEvents = [];

await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

socket.on("message", (rawMessage) => {
  const message = JSON.parse(String(rawMessage));

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
    else resolve(message.result);
    return;
  }

  if (message.method === "Runtime.consoleAPICalled") {
    browserEvents.push(
      `console.${message.params.type}: ${message.params.args.map((item) => item.value ?? item.description ?? "").join(" ")}`
    );
  } else if (message.method === "Runtime.exceptionThrown") {
    browserEvents.push(
      `exception: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ""}`
    );
  }
});

function cdp(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await cdp("Runtime.enable");
await cdp("Page.enable");

let finalStatus = "";
for (let attempt = 0; attempt < 240; attempt += 1) {
  const evaluation = await cdp("Runtime.evaluate", {
    expression:
      'document.querySelector("#gpu-status")?.textContent ?? "document-not-ready"',
    returnByValue: true,
  });
  finalStatus = String(evaluation.result?.value ?? "");

  if (finalStatus === expectedStatus) {
    console.log(`WebGPU Custom Forces CI status: ${finalStatus}`);
    if (browserEvents.length) console.log(browserEvents.join("\n"));
    socket.close();
    process.exit(0);
  }

  if (
    finalStatus.startsWith("Failed:") ||
    finalStatus.startsWith("device-lost:")
  ) {
    throw new Error(
      `WebGPU custom-forces page failed with status: ${finalStatus}\n${browserEvents.join("\n")}`
    );
  }

  await sleep(500);
}

throw new Error(
  `Timed out waiting for WebGPU custom-forces completion. Last status: ${finalStatus}\n${browserEvents.join("\n")}`
);
