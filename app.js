// 除錯功能
const debug = document.getElementById('debug');
function log(message) {
    debug.innerHTML += `<div>${message}</div>`;
    console.log(message);
}

// 初始化 GUN
log('正在初始化 GUN...');
const gun = Gun({
    localStorage: true,
    peers: [] // 不使用外部節點，純本地模式
});

// 確認 GUN 連線狀態
gun.on('hi', peer => {
    log(`已連接到節點: ${peer}`);
});

gun.on('bye', peer => {
    log(`節點斷開: ${peer}`);
});

// 遊戲狀態 - 使用固定的遊戲房間名稱
const GAME_ID = 'hearts-game-local';
const PLAYERS_ID = 'hearts-players-local';
const gameState = gun.get(GAME_ID);
const players = gun.get(PLAYERS_ID);
let currentPlayer = null;
let myCards = [];

// DOM 元素
const loginSection = document.getElementById('login');
const gameRoom = document.getElementById('gameRoom');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGame');
const startGameBtn = document.getElementById('startGame');
const slapBtn = document.getElementById('slap');
const playersDiv = document.getElementById('players');
const centerPileDiv = document.getElementById('centerPile');
const playerHandDiv = document.getElementById('playerHand');
const gameStatusDiv = document.getElementById('gameStatus');

// 顯示遊戲狀態
function updateGameStatus(message) {
    log(message);
    gameStatusDiv.textContent = message;
}

// 創建一副撲克牌
function createDeck() {
    const suits = ['♠', '♥', '♣', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    return shuffle(deck);
}

// 洗牌
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 初始化時重置遊戲狀態
function resetGame() {
    log('重置遊戲狀態...');
    gameState.put({
        status: 'waiting',
        centerPile: [],
        currentPlayerIndex: 0,
        deck: null,
        timestamp: Date.now()
    });
    players.put(null); // 清除所有玩家
    currentPlayer = null;
    myCards = [];
    updateGameStatus('遊戲已重置，請輸入名字加入遊戲');
}

// 在程式開始時重置遊戲
window.addEventListener('load', () => {
    resetGame();
    log('遊戲已初始化');
});

// 加入遊戲
joinGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
        updateGameStatus('請輸入名字！');
        return;
    }
    
    log(`玩家 ${name} 嘗試加入遊戲...`);
    
    gameState.once((state) => {
        if (state.status === 'playing') {
            updateGameStatus('遊戲已經開始，請等待下一局');
            return;
        }
        
        currentPlayer = {
            id: Math.random().toString(36).substr(2, 9),
            name: name,
            cards: [],
            connected: true,
            lastActive: Date.now()
        };
        
        try {
            players.set(currentPlayer);
            loginSection.classList.add('hidden');
            gameRoom.classList.remove('hidden');
            startGameBtn.classList.remove('hidden');
            updateGameStatus(`歡迎 ${name} 加入遊戲！`);
        } catch (error) {
            updateGameStatus('加入遊戲失敗，請重試！');
            log('錯誤：' + error.message);
        }
    });
});

// 監聽玩家加入
players.map().on((player, id) => {
    if (!player) return;
    log(`偵測到玩家更新：${player.name}`);
    updatePlayersList();
    if (id === currentPlayer?.id) {
        startGameBtn.classList.remove('hidden');
    }
});

// 更新玩家列表
function updatePlayersList() {
    playersDiv.innerHTML = '';
    players.map().once((player) => {
        if (!player) return;
        const div = document.createElement('div');
        div.className = 'player-info';
        div.textContent = `${player.name} (${player.cards?.length || 0}張牌)`;
        playersDiv.appendChild(div);
    });
}

// 開始遊戲
startGameBtn.addEventListener('click', () => {
    log('嘗試開始遊戲...');
    const deck = createDeck();
    log('牌組已創建');

    gameState.put({
        status: 'playing',
        centerPile: [],
        currentPlayerIndex: 0,
        deck: deck,
        timestamp: Date.now()
    });
    log('遊戲狀態已更新');

    try {
        // 發牌
        let playerCount = 0;
        players.map().once((player, id) => {
            if (!player) return;
            playerCount++;
            log(`正在發牌給玩家 ${player.name}`);
            const playerCards = deck.splice(0, Math.floor(52 / 4));
            players.get(id).put({ 
                ...player, 
                cards: playerCards,
                lastUpdated: Date.now()
            });
        });

        log(`共有 ${playerCount} 位玩家加入遊戲`);
        updateGameStatus('遊戲開始！');
    } catch (error) {
        log('開始遊戲時發生錯誤：' + error.message);
        updateGameStatus('開始遊戲失敗，請重試！');
    }
});

// 監聽遊戲狀態
gameState.on((state) => {
    if (!state) {
        log('無法獲取遊戲狀態');
        return;
    }
    
    log('收到遊戲狀態更新：' + JSON.stringify(state));
    
    if (state.status === 'playing') {
        log('遊戲狀態已變更為進行中');
        startGameBtn.classList.add('hidden');
        slapBtn.classList.remove('hidden');
        updateCenterPile(state.centerPile || []);
        updatePlayerHand();
        updateGameStatus('遊戲進行中！');
    }
});

// 更新中央牌堆顯示
function updateCenterPile(pile) {
    centerPileDiv.innerHTML = '';
    if (pile.length === 0) return;
    
    const card = pile[pile.length - 1];
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
    cardDiv.textContent = `${card.suit}${card.value}`;
    centerPileDiv.appendChild(cardDiv);
}

// 更新玩家手牌
function updatePlayerHand() {
    players.get(currentPlayer.id).once((player) => {
        if (!player || !player.cards) return;
        
        playerHandDiv.innerHTML = '';
        player.cards.forEach((card, index) => {
            const cardBtn = document.createElement('button');
            cardBtn.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
            cardBtn.textContent = `${card.suit}${card.value}`;
            cardBtn.onclick = () => playCard(index);
            playerHandDiv.appendChild(cardBtn);
        });
    });
}

// 出牌
function playCard(index) {
    players.get(currentPlayer.id).once((player) => {
        if (!player || !player.cards) return;
        
        const card = player.cards[index];
        const newCards = [...player.cards];
        newCards.splice(index, 1);
        
        players.get(currentPlayer.id).put({ ...player, cards: newCards });
        
        gameState.once((state) => {
            const newPile = [...(state.centerPile || []), card];
            gameState.put({ ...state, centerPile: newPile });
        });
    });
}

// 拍牌
slapBtn.addEventListener('click', () => {
    gameState.once((state) => {
        if (!state || !state.centerPile || state.centerPile.length < 2) return;
        
        const pile = state.centerPile;
        const lastCard = pile[pile.length - 1];
        const secondLastCard = pile[pile.length - 2];
        
        if (lastCard.value === secondLastCard.value) {
            // 成功拍牌
            players.get(currentPlayer.id).once((player) => {
                const newCards = [...player.cards, ...pile];
                players.get(currentPlayer.id).put({ ...player, cards: newCards });
                gameState.put({ ...state, centerPile: [] });
                gameStatusDiv.textContent = `${player.name} 成功拍牌！`;
            });
        } else {
            // 拍錯要罰牌
            players.get(currentPlayer.id).once((player) => {
                if (player.cards.length > 0) {
                    const penaltyCard = player.cards[0];
                    const newCards = player.cards.slice(1);
                    const newPile = [...pile, penaltyCard];
                    players.get(currentPlayer.id).put({ ...player, cards: newCards });
                    gameState.put({ ...state, centerPile: newPile });
                    gameStatusDiv.textContent = `${player.name} 拍錯了，罰一張牌！`;
                }
            });
        }
    });
});