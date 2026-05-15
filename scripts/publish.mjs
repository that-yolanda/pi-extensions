#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGES = [
	"pi-context",
	"pi-memory-honcho",
	"pi-questionnaire",
	"pi-statusline",
];

const dir = process.argv[2];
const bump = process.argv[3];

if (!dir || !bump) {
	console.log("Usage: pnpm publish <package> <patch|minor|major|version>");
	console.log("  pnpm publish pi-context patch");
	console.log("  pnpm publish pi-statusline 0.2.0");
	console.log();
	console.log("Packages:");
	for (const p of PACKAGES) console.log(`  ${p}`);
	process.exit(1);
}

if (!PACKAGES.includes(dir)) {
	console.error(`Unknown package: ${dir}`);
	console.error(`Available: ${PACKAGES.join(", ")}`);
	process.exit(1);
}

if (
	!["patch", "minor", "major"].includes(bump) &&
	!/^\d+\.\d+\.\d+/.test(bump)
) {
	console.error(
		`Invalid bump: ${bump}. Use patch, minor, major, or explicit version (e.g. 0.2.0)`,
	);
	process.exit(1);
}

const pkgPath = resolve(dir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;

// Bump version
execSync(`npm version ${bump} --no-git-tag-version`, {
	cwd: dir,
	stdio: "inherit",
});
const bumpedPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const nextVersion = bumpedPkg.version;

console.log(`\n${pkg.name} ${oldVersion} → ${nextVersion}`);

// Check branch
const branch = execSync("git branch --show-current").toString().trim();
if (branch !== "main") {
	console.error("Not on main branch. Switch to main first.");
	process.exit(1);
}

// Commit
execSync(`git add ${pkgPath}`);
execSync(`git commit -m "chore(${dir}): publish ${nextVersion}"`);
console.log("Committed.");

// Create tag
const tag = `${dir}/v${nextVersion}`;
execSync(`git tag '${tag}'`);
console.log(`Tagged: ${tag}`);

// Push commit + tag
execSync("git push origin main");
execSync(`git push origin '${tag}'`);
console.log("Pushed to origin.");

// Trigger workflow
execSync(`gh workflow run publish.yml -f package='${pkg.name}'`, {
	stdio: "inherit",
});
console.log(`\nWorkflow triggered for ${pkg.name}@${nextVersion}`);
console.log("https://github.com/that-yolanda/pi-extensions/actions");
