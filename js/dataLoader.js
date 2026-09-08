// js/dataLoader.js

const DataLoader = (function() {
    let playerIndex = null;
    const playerCache = new Map(); // id -> full data
    let allPlayersArray = null;

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
        
        // If we haven't loaded all data, wait for it
        if (!allPlayersArray) {
            await loadAllPlayers();
        }
        return playerCache.get(id) || null;
    }

    // Fetches the single bundled JSON file
    async function loadAllPlayers(onProgress) {
        if (allPlayersArray && allPlayersArray.length > 0) {
            if (onProgress) onProgress(allPlayersArray.length, allPlayersArray.length);
            return allPlayersArray;
        }

        try {
            console.log("Fetching data/all_players.json...");
            const res = await fetch('data/all_players.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            
            if (!Array.isArray(data)) {
                throw new Error("Downloaded data is not an array!");
            }
            
            allPlayersArray = data;
            
            // Cache them all instantly
            for (const p of data) {
                playerCache.set(p.id || p.player_id, p);
            }
            
            if (onProgress) onProgress(data.length, data.length);
            return allPlayersArray;
        } catch (err) {
            console.error('Failed to load bundled players data:', err);
            alert("Failed to load players data: " + err.message + "\n\nPlease try refreshing the page.");
            return [];
        }
    }

    return {
        loadIndex,
        loadPlayer,
        loadAllPlayers,
        isFullyLoaded: () => allPlayersArray !== null,
        getPlayerFromCache: (id) => playerCache.get(id)
    };
})();
