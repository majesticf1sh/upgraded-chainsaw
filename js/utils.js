// js/utils.js

const STAT_METADATA = {
    // General Progress
    exp: { label: 'Experience', category: 'General Progress' },
    achievementsTotal: { label: 'Achievements Total', category: 'General Progress' },
    achievementPoints: { label: 'Achievement Points', category: 'General Progress' },
    tasksFinished: { label: 'Tasks Finished', category: 'General Progress' },
    jobsFinished: { label: 'Jobs Finished', category: 'General Progress' },
    completedQuests: { label: 'Completed Quests', category: 'General Progress' },
    buffsUsed: { label: 'Buffs Used', category: 'General Progress' },
    knockedOut: { label: 'Got Knocked Out (Duels)', category: 'General Progress' },
    
    // Crafting & Economy
    craftedItems: { label: 'Crafted Items', category: 'Crafting & Economy' },
    recipesLearned: { label: 'Recipes Learned', category: 'Crafting & Economy' },
    bankDepositsCompleted: { label: 'Bank Deposit Counts', category: 'Crafting & Economy' },
    amountDeposited: { label: 'Amount Deposited', category: 'Crafting & Economy' },
    highestAmountDeposited: { label: 'Highest Deposit', category: 'Crafting & Economy' },
    usedConstructionPoints: { label: 'Made Construction Points', category: 'Crafting & Economy' },
    buildingLevelsCompleted: { label: 'Building Levels Completed', category: 'Crafting & Economy' },
    
    // Duels
    duelExp: { label: 'Duel Experience', category: 'Duels' },
    duelsWon: { label: 'Duels Won', category: 'Duels' },
    duelsLost: { label: 'Duels Lost', category: 'Duels' },
    duelsFailed: { label: 'Duels Failed', category: 'Duels' },
    duelsAsChallenger: { label: 'Duels as Challenger', category: 'Duels' },
    duelKnockedOut: { label: 'Got Knocked Out (Duels)', category: 'Duels' }, // Kept for history compatibility if there are two versions
    duelKnockedOpponent: { label: 'Knocked Out Opponents (Duel)', category: 'Duels' },
    
    // Bandits
    banditDuelsWon: { label: 'Bandit Duels Won', category: 'Bandits' },
    banditDuelsLost: { label: 'Bandit Duels Lost', category: 'Bandits' },
    banditDuelsExp: { label: 'Bandit Duels Exp Gained', category: 'Bandits' },
    banditMaxDifficulty: { label: 'Bandit Max Difficulty', category: 'Bandits' },
    
    // Combat & Bounty
    bountyReceived: { label: 'Bounty Received', category: 'Combat & Bounty' },
    bountyOffered: { label: 'Bounty Offered', category: 'Combat & Bounty' },
    wantedDeadOrAlivePosters: { label: 'Wanted Dead/Alive Created', category: 'Combat & Bounty' },
    wantedDeadPosters: { label: 'Wanted Dead Created', category: 'Combat & Bounty' },
    
    // Adventure
    adventureGames: { label: 'Adventure Games', category: 'Adventure' },
    adventureKOs: { label: 'Adventure KOs', category: 'Adventure' },
    
    // Travel
    distanceTravelled: { label: 'Distance Travelled', category: 'Travel' }
};

const CATEGORIES = [
    'General Progress',
    'Crafting & Economy',
    'Duels',
    'Bandits',
    'Combat & Bounty',
    'Adventure',
    'Travel'
];

/**
 * Format number with thousand separators
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString('en-US');
}

/**
 * Filter history object to a date range
 * @param {Object} history - The player history object (keys are YYYY-MM-DD)
 * @param {String} from - YYYY-MM-DD (or null)
 * @param {String} to - YYYY-MM-DD (or null)
 * @returns {Array} Array of { date, stats } sorted chronologically
 */
function filterHistory(history, from, to) {
    let entries = Object.keys(history).map(date => ({
        date: date,
        stats: history[date]
    }));
    
    entries.sort((a, b) => a.date.localeCompare(b.date));
    
    if (from) {
        entries = entries.filter(e => e.date >= from);
    }
    if (to) {
        entries = entries.filter(e => e.date <= to);
    }
    
    return entries;
}

/**
 * Given a chronological array of history entries, calculate daily deltas
 */
function calculateDeltas(entries, statKey) {
    const deltas = [];
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i-1].stats[statKey] || 0;
        const curr = entries[i].stats[statKey] || 0;
        deltas.push({
            date: entries[i].date,
            time: entries[i].stats.time,
            delta: curr - prev
        });
    }
    // For the first entry, we can't show a delta (unless we know the day before).
    // We'll return an array that aligns with entries[1...]
    return deltas;
}

/**
 * Get full datetime string for chart.js
 */
function getDatetime(dateStr, timeStr) {
    return `${dateStr}T${timeStr || '00:00'}:00`;
}

/**
 * Get date string offset by days (e.g., -7 for 7 days ago)
 */
function getDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/**
 * Convert HTML special chars to prevent XSS
 */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
const LEVEL_EXP = [
    0, 0, 42, 99, 177, 282, 420, 597, 819, 1092, 1422, 1815, 2277, 2814, 3432, 4137, 4935, 5832, 6834, 7947, 9177, 10530, 12012, 13629, 15387, 17292, 19350, 21567, 23949, 26502, 29232, 32145, 35247, 38544, 42042, 45747, 49665, 53802, 58164, 62757, 67587, 72660, 77982, 83559, 89397, 95502, 101880, 108537, 115479, 122712, 130242, 138075, 146217, 154674, 163452, 172557, 181995, 191772, 201894, 212367, 223197, 234390, 245952, 257889, 270207, 282912, 296010, 309507, 323409, 337722, 352452, 367605, 383187, 399204, 415662, 432567, 449925, 467742, 486024, 504777, 524007, 543720, 563922, 584619, 605817, 627522, 649740, 672477, 695739, 719532, 743862, 768735, 794157, 820134, 846672, 873777, 901455, 929712, 958554, 987987, 1018017, 1048650, 1079892, 1111749, 1144227, 1177332, 1211070, 1245447, 1280469, 1316142, 1352472, 1389465, 1427127, 1465464, 1504482, 1544187, 1584585, 1625682, 1667484, 1709997, 1753227, 1798180, 1849326, 1911469, 1989152, 2086759, 2208567, 2358764, 2541472, 2760750, 3020610, 3325017, 3677897, 4083142, 4544610, 5066129, 5651502, 6304505, 7028890, 7828389, 8706712, 9667549, 10714573, 11851439, 13081785, 14409234, 15837393, 17369855, 19010199, 20761993, 22628789, 24614129, 26721542, 28954545, 31316647, 33811344, 36442123, 39212458, 42125818, 45185660, 48395432, 51758573, 55278514, 58958679, 62802481, 66813328, 70994617, 75349740, 79882082, 84595018, 89491919, 94576147, 99851059, 105320004, 110986326, 116853361, 122924440, 129202888, 135692024, 142395160, 149315603, 156456656, 163821615, 171413770, 179236407, 187292807, 195586243, 204119988, 212897305, 221921455, 231195693, 240723272, 250507436, 260551428, 270858484, 281431838, 292274717, 303390347, 314781946, 326452731, 338405913, 350644699, 363172294, 375991896, 389106702, 402519903, 416234688, 430254240, 444581741, 459220367, 474173291, 489443684, 505034712, 520949538, 537191321, 553763217, 570668378, 587909955, 605491093, 623414935, 641684621, 660303287, 679274067, 698600090, 718284485, 738330375, 758740881, 779519122, 800668213, 822191266, 844091391, 866371694, 889035280, 912085249, 935524700, 959356727, 983584425, 1008210883, 1033239188, 1058672427, 1084513679, 1110766027, 1137432546, 1164516310, 1192020394, 1219947865, 1248301790, 1277085236, 1306301263, 1335952932, 1366043299
];

function getLevelFromExp(exp) {
    if (!exp || exp < 0) return 1;
    for (let i = LEVEL_EXP.length - 1; i >= 1; i--) {
        if (exp >= LEVEL_EXP[i]) {
            return i;
        }
    }
    return 1;
}
