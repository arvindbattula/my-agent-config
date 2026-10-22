// Shared test-only helper: locate a package inside the *active* pi
// installation, so tests can import pi's internals (model catalogs,
// usage-totals, pi-tui) without hardcoding an install path.
//
// Two layouts are supported:
//
//  1. Managed install (pi >= 1.4 installer): `pi` is a launcher script at
//     ~/.pi/agent/bin/pi that execs
//     ~/.pi/agent/install/releases/<version>/node_modules/.bin/pi, where
//     <version> is named by ~/.pi/agent/install/current-version. All
//     @earendil-works packages sit flat in that release's node_modules.
//
//  2. Legacy npm global install: `pi` is a symlink into
//     .../node_modules/@earendil-works/pi-coding-agent/dist/...; packages may
//     be nested under pi-coding-agent/node_modules or flat beside it.
//
// The old per-test resolution walked up from the `pi` binary to the nearest
// package.json. Under the managed layout that walk reaches `/` and loops
// forever (dirname("/") === "/"), which hung the test suites. This helper
// tries the managed layout first and guards the walk-up against the root.
//
// Parsing the .ts extensions is Node's native type stripping (>= 23.6); this
// file is plain ESM JavaScript.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Resolve the directory of `pkgName` (e.g. "@earendil-works/pi-ai") inside the
 * active pi installation. Throws if it cannot be located.
 */
export function piPackageDir(pkgName) {
	const candidates = [];

	// 1) Managed install: current-version names the active release.
	const agentDir = join(homedir(), ".pi", "agent");
	const currentVersionFile = join(agentDir, "install", "current-version");
	if (existsSync(currentVersionFile)) {
		const version = readFileSync(currentVersionFile, "utf8").trim();
		if (version && !version.includes("/") && !version.includes("..")) {
			candidates.push(
				join(agentDir, "install", "releases", version, "node_modules", ...pkgName.split("/")),
			);
		}
	}

	// 2) Legacy npm global: walk up from the `pi` binary to its package root.
	let piBin = "";
	try {
		piBin = execSync("which pi", { encoding: "utf8" }).trim();
	} catch {
		// `which` unavailable or pi not on PATH — managed path above is the hope.
	}
	if (piBin) {
		let pkgDir = dirname(realpathSync(piBin));
		while (!existsSync(join(pkgDir, "package.json"))) {
			const parent = dirname(pkgDir);
			if (parent === pkgDir) {
				// Root guard: `pi` is not inside a package (e.g. a wrapper shim).
				pkgDir = "";
				break;
			}
			pkgDir = parent;
		}
		if (pkgDir) {
			// Nested (pi-coding-agent/node_modules/...) then flat (sibling of it).
			candidates.push(join(pkgDir, "node_modules", ...pkgName.split("/")));
			candidates.push(join(dirname(pkgDir), ...pkgName.split("/")));
		}
	}

	for (const candidate of candidates) {
		if (existsSync(join(candidate, "package.json"))) {
			return candidate;
		}
	}
	throw new Error(
		`Cannot locate ${pkgName} for the active pi installation (tried: ${candidates.join(", ")}). ` +
			"Is pi installed (managed installer or npm global)?",
	);
}
