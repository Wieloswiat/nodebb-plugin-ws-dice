'use strict';

const fs = require('node:fs/promises');
const semver = require('semver');

const { settings } = require.main.require('./src/meta');

async function runMigrations(settings_key) {
	const plugin_settings = await settings.get(settings_key);
	let { version } = plugin_settings ?? {};
	if (!semver.valid(version)) {
		version = '0.0.0';
	}
	const files = await fs.readdir(__dirname);
	const migrations = files
		.map(filename => semver.clean(filename.replace('.js', '')))
		.filter(filename => semver.valid(filename) && semver.gt(filename, version));
	for (const migration of migrations) {
		// eslint-disable-next-line no-await-in-loop
		await require(`./${migration}`)();
		version = semver.gt(migration, version) ? migration : version;
	}
	await settings.set(settings_key, { version });
}
module.exports = runMigrations;
