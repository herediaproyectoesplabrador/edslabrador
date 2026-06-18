const fs = require("node:fs");
const path = require("node:path");

const baseDir = __dirname;
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function naturalSort(a, b) {
	return a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"});
}

function buildGroup(folder, titlePrefix) {
	const folderPath = path.join(baseDir, folder);
	if (!fs.existsSync(folderPath)) return [];

	return fs.readdirSync(folderPath, {withFileTypes: true})
		.filter(entry => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
		.map(entry => entry.name)
		.sort(naturalSort)
		.map(fileName => {
			const number = path.basename(fileName, path.extname(fileName));
			return {
				number,
				title: `${titlePrefix} ${number}`,
				file: `${folder}/${fileName}`
			};
		});
}

const manifest = {
	groups: {
		panoramicas: buildGroup("panoramicas", "Panoramica"),
		drone: buildGroup("drone", "Vuelo drone")
	}
};

fs.writeFileSync(path.join(baseDir, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);

console.log(`panoramicas=${manifest.groups.panoramicas.length}`);
console.log(`drone=${manifest.groups.drone.length}`);
