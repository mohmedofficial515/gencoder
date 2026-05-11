const fs = require("fs")
const path = require("path")

// Patterns to fix
const patterns = [
	{
		from: /'shared\/proto\/host\/window'/g,
		to: '"@shared/proto/host/window"',
	},
	{
		from: /'shared\/proto\/index\.host'/g,
		to: '"@shared/proto/index.host"',
	},
	{
		from: /'shared\/proto\/index\.cline'/g,
		to: '"@shared/proto/index.cline"',
	},
	{
		from: /'shared\/proto\/host\/workspace'/g,
		to: '"@shared/proto/host/workspace"',
	},
	{
		from: /'shared\/proto'/g,
		to: '"@shared/proto/index"',
	},
]

// Find all .ts files recursively, excluding node_modules and .gencoder
function findFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir)
	for (const file of files) {
		const filePath = path.join(dir, file)
		const stat = fs.statSync(filePath)
		if (stat.isDirectory()) {
			if (file !== "node_modules" && file !== ".gencoder" && file !== "dist" && file !== "out") {
				findFiles(filePath, fileList)
			}
		} else if (file.endsWith(".ts")) {
			fileList.push(filePath)
		}
	}
	return fileList
}

const files = findFiles(".")
let modifiedCount = 0

for (const file of files) {
	let content = fs.readFileSync(file, "utf8")
	const original = content
	for (const pattern of patterns) {
		content = content.replace(pattern.from, pattern.to)
	}
	if (content !== original) {
		fs.writeFileSync(file, content, "utf8")
		console.log(`Modified: ${file}`)
		modifiedCount++
	}
}

console.log(`Done. Modified ${modifiedCount} files.`)
