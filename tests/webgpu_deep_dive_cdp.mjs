import WebSocket from "ws";

const debugBase = "http://127.0.0.1:9222";
const cases = [
  ["basic-quality", "CI deep basic-quality ok"],
  ["faucet-velocity", "CI deep faucet-velocity ok"],
  ["force-slice", "CI deep force-slice ok"],
  ["heightfield-section", "CI deep heightfield-section ok"],
];
const paths = {
  "basic-quality": "salva-3d-deep-basic-quality",
  "faucet-velocity": "salva-3d-deep-faucet-velocity",
  "force-slice": "salva-3d-deep-force-slice",
  "heightfield-section": "salva-3d-deep-heightfield-section",
};
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

async function runCase(mode, expectedStatus) {
  const sampleUrl =
    `http://127.0.0.1:8000/samples/${paths[mode]}/?ci=1`;
  const response = await fetch(
    `${debugBase}/json/new?${encodeURIComponent(sampleUrl)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not create target for ${mode}`);
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
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      events.push(
        `console.${message.params.type}: ${message.params.args.map((item) => item.value ?? item.description ?? "").join(" ")}`,
      );
    } else if (message.method === "Runtime.exceptionThrown") {
      events.push(
        `exception: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ""}`,
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

  let status = "";
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const evaluation = await cdp("Runtime.evaluate", {
      expression:
        'document.querySelector("#gpu-status")?.textContent ?? "document-not-ready"',
      returnByValue: true,
    });
    status = String(evaluation.result?.value ?? "");

    if (status === expectedStatus) {
      console.log(`WebGPU deep dive ${mode}: ${status}`);
      socket.close();
      return;
    }
    if (status.startsWith("Failed:") || status.startsWith("device-lost:")) {
      throw new Error(
        `${mode} failed: ${status}\n${events.join("\n")}`,
      );
    }
    await sleep(500);
  }

  throw new Error(
    `${mode} timed out. Last status: ${status}\n${events.join("\n")}`,
  );
}

await waitForDebugger();
for (const [mode, expectedStatus] of cases) {
  await runCase(mode, expectedStatus);
}
