// js/dataLoader.js

const DataLoader = (function() {
    let playerIndex = null;
    const playerCache = new Map(); // id -> full data
    let allPlayersArray = null;
    let loadingPromise = null; // Prevent duplicate concurrent fetch requests

    async function loadIndex() {
        if (playerIndex) return playerIndex;
        try {
            const res = await fetch('index.json');
            if (!res.ok) throw new Error('index.json not found');
            playerIndex = await res.json();
            return playerIndex;
        } catch (err) {
            console.error('Failed to load index.json:', err);
            return [];
        }
    }

    async function loadPlayer(id) {
        if (playerCache.has(id)) return playerCache.get(id);
        
        // If all data hasn't been loaded yet, load it now
        if (!allPlayersArray) {
            await loadAllPlayers();
        }
        return playerCache.get(id) || null;
    }

    // Fetches multi-part bundled JSON files via manifest or single file fallback
    async function loadAllPlayers(onProgress) {
        if (allPlayersArray && allPlayersArray.length > 0) {
            if (onProgress) onProgress(allPlayersArray.length, allPlayersArray.length);
            return allPlayersArray;
        }

        if (loadingPromise) {
            return loadingPromise;
        }

        loadingPromise = (async () => {
            try {
                // Step 1: Check for manifest.json with multiple data chunks
                let filesToLoad = [];
                try {
                    const manifestRes = await fetch('data/manifest.json');
                    if (manifestRes.ok) {
                        const manifest = await manifestRes.json();
                        if (manifest && Array.isArray(manifest.files) && manifest.files.length > 0) {
                            filesToLoad = manifest.files;
                            console.log(`Found manifest.json with ${filesToLoad.length} data chunk(s):`, filesToLoad);
                        }
                    }
                } catch (manifestErr) {
                    console.log('No manifest.json found or failed to parse, falling back to all_players.json:', manifestErr);
                }

                // Fallback to single all_players.json if no manifest or empty manifest
                if (filesToLoad.length === 0) {
                    filesToLoad = ['data/all_players.json'];
                }

                allPlayersArray = [];
                let totalLoadedCount = 0;

                // Load each chunk file
                for (let i = 0; i < filesToLoad.length; i++) {
                    const filePath = filesToLoad[i];
                    console.log(`Fetching chunk ${i + 1}/${filesToLoad.length}: ${filePath}...`);
                    
                    if (typeof UI !== 'undefined' && UI.showLoader) {
                        UI.showLoader(`Loading player data (part ${i + 1} of ${filesToLoad.length})...`);
                    }

                    const res = await fetch(filePath);
                    if (!res.ok) throw new Error(`Failed to load ${filePath} (HTTP ${res.status})`);
                    const chunkData = await res.json();

                    if (!Array.isArray(chunkData)) {
                        throw new Error(`Data in ${filePath} is not an array!`);
                    }

                    for (const p of chunkData) {
                        playerCache.set(p.id || p.player_id, p);
                        allPlayersArray.push(p);
                    }

                    totalLoadedCount += chunkData.length;
                    if (onProgress) onProgress(totalLoadedCount, totalLoadedCount);
                }

                console.log(`Successfully loaded all ${allPlayersArray.length} players across ${filesToLoad.length} part(s).`);
                return allPlayersArray;
            } catch (err) {
                console.error('Failed to load player data:', err);
                if (typeof UI !== 'undefined' && UI.hideLoader) UI.hideLoader();
                alert("Failed to load player data: " + err.message + "\n\nPlease try refreshing the page.");
                return [];
            } finally {
                loadingPromise = null;
            }
        })();

        return loadingPromise;
    }

    return {
        loadIndex,
        loadPlayer,
        loadAllPlayers,
        isFullyLoaded: () => allPlayersArray !== null,
        getPlayerFromCache: (id) => playerCache.get(id)
    };
})();
