import WebSocket from "ws";

const debugBase = "http://127.0.0.1:9222";
const sampleUrl =
  "http://127.0.0.1:8000/tests/splishsplash-scene-dfsph/?ci=1";
const expectedStatus = "CI SPlisHSPlasH generic DFSPH scene ok";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${debugBase}/json/version`);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome debugging endpoint unavailable");
}

await waitForDebugger();
const response = await fetch(
  `${debugBase}/json/new?${encodeURIComponent(sampleUrl)}`,
  { method: "PUT" },
);
if (!response.ok) throw new Error(`Could not create target: HTTP ${response.status}`);
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const events = [];
let nextId = 1;

await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

socket.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  } else if (message.method === "Runtime.consoleAPICalled") {
    events.push(message.params.args.map((x) => x.value ?? x.description ?? "").join(" "));
  } else if (message.method === "Runtime.exceptionThrown") {
    events.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
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

let status = "";
for (let attempt = 0; attempt < 720; attempt += 1) {
  const result = await cdp("Runtime.evaluate", {
    expression: 'document.querySelector("#status")?.textContent ?? "not-ready"',
    returnByValue: true,
  });
  status = String(result.result?.value ?? "");
  if (status === expectedStatus) {
    console.log(`SPlisHSPlasH generic DFSPH scene CI status: ${status}`);
    socket.close();
    process.exit(0);
  }
  if (status.startsWith("Failed:")) {
    throw new Error(`${status}\n${events.join("\n")}`);
  }
  await sleep(250);
}

throw new Error(`Timed out. Last status: ${status}\n${events.join("\n")}`);
