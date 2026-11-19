/**
 * bundle_chunks.js
 * 
 * Bundles player data from "west extended data collector" into multiple
 * chunk files (<= 90 MB each) and generates data/manifest.json.
 * 
 * This ensures all player data is uploaded to GitHub Pages without
 * exceeding the 100 MB file size limit.
 */

const fs = require('fs');
const path = require('path');

// Candidate source directories for raw player files
const candidateDirs = [
    path.resolve(__dirname, '../../nodejs/west extended data collector/players/en13'),
    path.resolve(__dirname, '../west extended data collector/players/en13'),
    'C:/Users/Manuel/Documents/nodejs/west extended data collector/players/en13'
];

let inputDir = null;
for (const cand of candidateDirs) {
    if (fs.existsSync(cand)) {
        inputDir = cand;
        break;
    }
}

if (!inputDir) {
    console.error('ERROR: Could not locate "west extended data collector/players/en13" directory.');
    console.error('Checked paths:');
    candidateDirs.forEach(d => console.error('  - ' + d));
    process.exit(1);
}

const outputDir = path.join(__dirname, 'data');
const indexFile = path.join(__dirname, 'index.json');
const manifestFile = path.join(outputDir, 'manifest.json');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('============================================================');
console.log('       Multi-Chunk Data Bundler for GitHub Pages           ');
console.log('============================================================');
console.log(`Source directory: ${inputDir}`);
console.log(`Target directory: ${outputDir}`);
console.log(`Max chunk size:   90.00 MB (safe for 95MB / 100MB limits)\n`);

console.log('Scanning player files...');
const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json') && f !== 'index.json');
console.log(`Found ${files.length.toLocaleString()} player files. Loading data...`);

const allPlayers = [];
const searchIndex = [];
let parseErrors = 0;

for (const file of files) {
    const filePath = path.join(inputDir, file);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const p = JSON.parse(content);
        if (p && p.id) {
            allPlayers.push(p);
            if (p.name) {
                searchIndex.push({ id: p.id, name: p.name });
            }
        }
    } catch (e) {
        parseErrors++;
    }
}

if (parseErrors > 0) {
    console.warn(`Warning: Failed to parse ${parseErrors} file(s).`);
}

console.log(`Loaded ${allPlayers.length.toLocaleString()} valid players.\n`);

// Update index.json (for search autocomplete)
searchIndex.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(indexFile, JSON.stringify(searchIndex, null, 2), 'utf8');
console.log(`✓ Updated ${indexFile} with ${searchIndex.length.toLocaleString()} players.`);

// Chunk players into files <= 90 MB (Buffer bytes)
const MAX_CHUNK_BYTES = 90 * 1024 * 1024; // 90 MB target limit
const chunks = [];
let currentChunk = [];
let currentChunkBytes = 2; // for '[]'

for (const p of allPlayers) {
    const jsonStr = JSON.stringify(p);
    const itemBytes = Buffer.byteLength(jsonStr, 'utf8') + 1; // +1 for comma separator
    
    if (currentChunk.length > 0 && (currentChunkBytes + itemBytes > MAX_CHUNK_BYTES)) {
        chunks.push(currentChunk);
        currentChunk = [p];
        currentChunkBytes = 2 + Buffer.byteLength(jsonStr, 'utf8');
    } else {
        currentChunk.push(p);
        currentChunkBytes += itemBytes;
    }
}
if (currentChunk.length > 0) {
    chunks.push(currentChunk);
}

console.log(`\nSplitting data into ${chunks.length} chunk(s):`);

const manifestFiles = [];

// Remove any obsolete part files from previous runs
const existingDataFiles = fs.readdirSync(outputDir).filter(f => /^all_players_part\d+\.json$/.test(f));
for (const oldFile of existingDataFiles) {
    fs.unlinkSync(path.join(outputDir, oldFile));
}

// Write each chunk file
chunks.forEach((chunk, index) => {
    const partNum = index + 1;
    const fileName = `all_players_part${partNum}.json`;
    const relativePath = `data/${fileName}`;
    const absolutePath = path.join(outputDir, fileName);

    process.stdout.write(`Writing ${relativePath} (${chunk.length.toLocaleString()} players)... `);
    const json = JSON.stringify(chunk);
    fs.writeFileSync(absolutePath, json, 'utf8');
    
    const sizeBytes = fs.statSync(absolutePath).size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
    console.log(`${sizeMB} MB`);
    
    manifestFiles.push(relativePath);
});

// Write data/manifest.json
const manifest = {
    files: manifestFiles,
    totalPlayers: allPlayers.length,
    chunkCount: chunks.length,
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\n✓ Created ${manifestFile}`);

// Clean up old single all_players.json if it exists and exceeds 95MB to prevent git rejection
const singleAllPlayers = path.join(outputDir, 'all_players.json');
if (fs.existsSync(singleAllPlayers)) {
    const singleSize = fs.statSync(singleAllPlayers).size;
    if (singleSize > 95 * 1024 * 1024) {
        fs.unlinkSync(singleAllPlayers);
        console.log(`✓ Removed oversized ${singleAllPlayers} (${(singleSize / 1024 / 1024).toFixed(2)} MB) to avoid git 100MB limit.`);
    }
}

console.log('\n============================================================');
console.log('                      SUMMARY                               ');
console.log('============================================================');
console.log(`Total Players:   ${allPlayers.length.toLocaleString()}`);
console.log(`Total Chunks:    ${chunks.length}`);
manifestFiles.forEach((f, idx) => {
    const p = path.join(__dirname, f);
    const sz = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
    console.log(`  - Part ${idx + 1}: ${f} (${sz} MB) [✓ Under 95 MB]`);
});
console.log('\nReady to commit and push to GitHub!');
console.log('============================================================');
