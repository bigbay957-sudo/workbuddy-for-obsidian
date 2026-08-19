import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const executable = process.env.CODEBUDDY_CODE_PATH || join(homedir(), ".local", "bin", "codebuddy");
const child = spawn(executable, ["--acp", "--permission-mode", "default"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"]
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });

const app = acp
  .client({ name: "workbuddy-obsidian-probe" })
  .onRequest(acp.methods.client.session.requestPermission, () => ({ outcome: { outcome: "cancelled" } }))
  .onNotification(acp.methods.client.session.update, () => {});

const stream = acp.ndJsonStream(
  Writable.toWeb(child.stdin),
  Readable.toWeb(child.stdout)
);
const connection = app.connect(stream);

const timeout = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("ACP probe timed out")), 20_000);
});

try {
  const result = await Promise.race([
    (async () => {
      const initialized = await connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { terminal: false },
        clientInfo: { name: "WorkBuddy Obsidian Probe", version: "0.1.0" }
      });
      const session = await connection.agent.request(acp.methods.agent.session.new, {
        cwd: process.cwd(),
        mcpServers: []
      });
      return {
        protocolVersion: initialized.protocolVersion,
        agentName: initialized.agentInfo?.name,
        sessionCreated: Boolean(session.sessionId)
      };
    })(),
    timeout
  ]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  if (stderr.trim()) process.stderr.write("WorkBuddy process returned diagnostic output.\n");
  process.exitCode = 1;
} finally {
  connection.close();
  child.kill("SIGTERM");
}
