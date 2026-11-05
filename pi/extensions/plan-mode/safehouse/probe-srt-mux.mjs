#!/usr/bin/env node
/**
 * Binds an srt-mux-named Unix socket in $TMPDIR and round-trips a byte
 * through it — exercising the exact three Seatbelt operations the pi
 * plan-mode kernel sandbox needs and Safehouse denies by default:
 *
 *   bind()      -> network-bind     (local  unix-socket)
 *   accept()    -> network-inbound  (local  unix-socket)   [bind+inbound rule]
 *   connect()    -> network-outbound (remote unix-socket)
 *
 * Exit 0 + "OK:"  = allowed (allowance active or no sandbox).
 * Exit 1 + "FAIL:" = denied (EPERM under Safehouse without the allowance).
 */
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const path = join(tmpdir(), `srt-mux-${process.pid}-probe.sock`);

const server = createServer((conn) => {
	conn.pipe(conn); // echo
});
server.on("error", (e) => {
	console.log(`FAIL: bind ${e.code ?? e.message} on ${path}`);
	process.exitCode = 1;
});

server.listen(path, async () => {
	try {
		const client = connect(path);
		await new Promise((resolve, reject) => {
			client.once("connect", resolve);
			client.once("error", reject);
		});
		const echoed = await new Promise((resolve, reject) => {
			client.once("data", resolve);
			client.once("error", reject);
			client.write("ping");
		});
		console.log(`OK: bind+listen+connect+echo on ${path} (echoed "${String(echoed).trim()}")`);
		client.end();
		server.close(() => process.exit(process.exitCode ?? 0));
	} catch (e) {
		console.log(`FAIL: connect/echo ${e.code ?? e.message} on ${path}`);
		server.close(() => process.exit(1));
	}
});
