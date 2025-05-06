// 除錯功能
const debug = document.getElementById('debug');
function log(message) {
    debug.innerHTML += `<div>${message}</div>`;
    console.log(message);
}

// 初始化 GUN
log('正在初始化 GUN...');
const gun = Gun({
    peers: [
        'https://gun-manhattan.herokuapp.com/gun'
    ],
    localStorage: false,
    radisk: false
});

// 確認 GUN 連線狀態
gun.on('hi', peer => {
    log(`已連接到節點: ${peer}`);
});

gun.on('bye', peer => {
    log(`節點斷開: ${peer}`);
});

// 遊戲狀態
const gameState = gun.get('hearts-game-' + Math.random()); // 使用隨機遊戲房間
const players = gun.get('hearts-players-' + Math.random());
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

// 加入遊戲
joinGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
        updateGameStatus('請輸入名字！');
        return;
    }
    
    log(`玩家 ${name} 嘗試加入遊戲...`);
    
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
    const deck = createDeck();
    gameState.put({
        status: 'playing',
        centerPile: [],
        currentPlayerIndex: 0,
        deck: deck
    });
    
    // 發牌
    players.map().once((player, id) => {
        if (!player) return;
        const playerCards = deck.splice(0, Math.floor(52 / 4));
        players.get(id).put({ ...player, cards: playerCards });
    });
});

// 監聽遊戲狀態
gameState.on((state) => {
    if (!state) return;
    
    if (state.status === 'playing') {
        startGameBtn.classList.add('hidden');
        slapBtn.classList.remove('hidden');
        updateCenterPile(state.centerPile || []);
        updatePlayerHand();
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