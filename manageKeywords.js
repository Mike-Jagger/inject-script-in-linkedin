const fs = require('fs');

const path = require('path');
const { sleep } = require('./sleep');
const TXT_KEYWORDS = './keywords.txt';
const JSON_KEYWORDS = './testKeywords.json';
const LOCK_FILE = './lockfile';


// Function to acquire a lock
async function acquireLock() {
    while (fs.existsSync(LOCK_FILE)) {
        await sleep(100);
    }
    fs.writeFileSync(LOCK_FILE, 'lock');
}

// Function to release a lock
function releaseLock() {
    if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
    }
}

// Function to update the JSON_KEYWORDS file based on the TXT_KEYWORDS file
async function updateKeywordsFromFile() {
    const txtKeywordsPath = path.resolve(__dirname, TXT_KEYWORDS);
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);

    let txtKeywords = [];
    let jsonKeywords = { currentKeyWord: {}, keyWords: [] };

    if (fs.existsSync(txtKeywordsPath)) {
        const txtData = fs.readFileSync(txtKeywordsPath, 'utf-8');
        txtKeywords = txtData.split('\n').map(keyword => keyword.trim()).filter(keyword => keyword.length > 0);
    }

    if (fs.existsSync(jsonKeywordsPath)) {
        jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
    }

    const existingKeywords = jsonKeywords.keyWords.map(item => item.keyword);
    let updated = false;

    txtKeywords.forEach((keyword, index) => {
        if (!existingKeywords.includes(keyword)) {
            jsonKeywords.keyWords.push({ index: jsonKeywords.keyWords.length, keyword: keyword });
            updated = true;
        }
    });

    if (updated) {
        fs.writeFileSync(jsonKeywordsPath, JSON.stringify(jsonKeywords, null, 2));
        console.log('Keywords updated in JSON file.');
    } else {
        console.log('No new keywords to update.');
    }
}

// Function to move to the next keyword and update the currentKeyWord
async function moveToNextKeyword() {
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);

    if (fs.existsSync(jsonKeywordsPath)) {
        const jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
        const currentIndex = jsonKeywords.currentKeyWord.index ?? -1;
        if (jsonKeywords.keyWords.length > 0) {
            const nextIndex = (currentIndex + 1) % jsonKeywords.keyWords.length;
            jsonKeywords.currentKeyWord = jsonKeywords.keyWords[nextIndex];
            fs.writeFileSync(jsonKeywordsPath, JSON.stringify(jsonKeywords, null, 2));
            console.log('Current keyword updated to:', jsonKeywords.currentKeyWord.keyword);
        } else {
            console.log('No keywords available to update.');
        }
    } else {
        console.log('Keywords JSON file not found.');
    }
}

module.exports = {
    acquireLock,
    releaseLock,
    updateKeywordsFromFile,
    moveToNextKeyword
}