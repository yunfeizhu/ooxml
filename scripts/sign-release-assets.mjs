#!/usr/bin/env node
/**
 * Attaches every published package's tarball and a keyless sigstore bundle to its GitHub release,
 * so the release assets are signed (OpenSSF Scorecard "Signed-Releases").
 *
 * Usage:
 *   node scripts/sign-release-assets.mjs --plan release-plan.json
 *   node scripts/sign-release-assets.mjs --tag <npm-name>@<semver>
 *   --dry-run   print what would be packed, signed and uploaded
 *
 * The tarball is fetched back from the npm registry (`npm pack <name>@<version>`), so the signed
 * bytes are the bytes consumers install. Signing is keyless: `cosign sign-blob` uses the job's
 * GitHub OIDC identity (`id-token: write`), and the bundle records the workflow that signed.
 * A release that does not exist (pruned, or never created) is skipped with a warning.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveTargets } from './publish-released.mjs';

/** The release tag of a target: `<npm-name>@<version>`. */
export const tagOf = (target) => `${target.npm}@${target.version}`;

/** The file `npm pack <name>@<version>` writes: `@scope/name` becomes `scope-name`. */
export const tarballName = (target) =>
	`${target.npm.replace(/^@/u, '').replace('/', '-')}-${target.version}.tgz`;

/** The sigstore bundle written next to a tarball. */
export const bundleName = (target) => `${tarballName(target)}.sigstore.json`;

const run = (command, args) =>
	spawnSync(command, args, {
		encoding: 'utf8',
		shell: process.platform === 'win32',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

function parseArgs(argv) {
	const options = { dryRun: false };
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--plan') options.plan = argv[++index];
		else if (argument === '--tag') options.tag = argv[++index];
		else throw new Error(`Unknown argument '${argument}'.`);
	}
	if (!options.plan && !options.tag) throw new Error('Pass --plan <file> or --tag <tag>.');
	return options;
}

function signTarget(target, directory, dryRun) {
	const tag = tagOf(target);
	const tarball = join(directory, tarballName(target));
	const bundle = join(directory, bundleName(target));
	if (run('gh', ['release', 'view', tag]).status !== 0) {
		console.warn(`::warning::No GitHub release ${tag}; nothing to attach to.`);
		return true;
	}
	if (dryRun) {
		console.log(`[dry-run] pack ${tag}, sign ${tarball}, upload ${tarball} and ${bundle}`);
		return true;
	}
	const steps = [
		['npm', ['pack', tag, '--pack-destination', directory, '--silent']],
		['cosign', ['sign-blob', '--yes', '--bundle', bundle, tarball]],
		['gh', ['release', 'upload', tag, tarball, bundle, '--clobber']],
	];
	for (const [command, args] of steps) {
		const result = run(command, args);
		if (result.status !== 0) {
			console.error(`::error::${tag}: '${command} ${args[0]}' failed:\n${result.stderr}`);
			return false;
		}
	}
	console.log(`Signed ${tag}: ${tarballName(target)} and ${bundleName(target)}`);
	return true;
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const plan = options.plan ? JSON.parse(readFileSync(options.plan, 'utf8')) : undefined;
	const targets = resolveTargets({ plan, tag: options.tag });
	const directory = join(process.env.RUNNER_TEMP ?? '.', 'signed-release-assets');
	mkdirSync(directory, { recursive: true });
	const failed = targets.filter((target) => !signTarget(target, directory, options.dryRun));
	if (failed.length > 0) {
		console.error(`Failed to sign: ${failed.map(tagOf).join(', ')}`);
		process.exit(1);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
